import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Clock3,
  Package,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  Truck,
  WashingMachine,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../hooks/useAppData';
import TrolleysDashboardModal from './TrolleysDashboardModal';
import {
  cancelLaundryTrolley,
  getLaundryWorkflow,
  markLaundryWashed,
  packLaundryTrolley,
  returnLaundryTrolley,
  undoReturnLaundryTrolley,
  unmarkLaundryWashed,
  deleteLaundryTrolley,
  setTrolleyAtClient,
  updateLaundryTrolleyKg,
} from '../lib/laundryRpc';
import { toastError, toastSuccess } from '../lib/toast';
import DataError from './DataError';
import PackingModal from './modals/PackingModal';
const DEFAULT_TROLLEY_COUNT = 25;

function ymd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateOnly(value) {
  if (!value) return null;
  return ymd(new Date(value));
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('pl-PL', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  });
}

// Poprawna polska odmiana: 1 punkt, 2-4 punkty, 5+ punktów (z wyjątkiem 12-14).
function punktLabel(n) {
  const num = Number(n) || 0;
  const mod10 = num % 10;
  const mod100 = num % 100;
  let word = 'punktów';
  if (num === 1) word = 'punkt';
  else if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) word = 'punkty';
  return `${num} ${word} do pilnowania`;
}

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Sama godzina, gdy zdarzenie miało miejsce w oglądanym dniu — data + godzina,
// gdy jest z innego dnia (np. wyprane wcześniej, a dziś tylko wisi jako gotowe).
function fmtTimeForDay(iso, selectedDate) {
  if (!iso) return '—';
  return dateOnly(iso) === selectedDate ? fmtTime(iso) : fmtDateTime(iso);
}

function addDays(dateStr, days) {
  const dt = new Date(`${dateStr}T00:00:00`);
  dt.setDate(dt.getDate() + days);
  return ymd(dt);
}

function parseMonday(weekKey) {
  const [y, m, d] = (weekKey || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function formatWeekKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addDaysToWeekKey(weekKey, days) {
  const dt = parseMonday(weekKey);
  if (!dt) return weekKey;
  dt.setDate(dt.getDate() + days);
  return formatWeekKey(dt);
}

function dayWeekToTime(day, weekKey) {
  const dt = parseMonday(weekKey);
  if (!dt) return 0;
  dt.setDate(dt.getDate() + (Number(day) - 1));
  return dt.getTime();
}

function slotToDate(slot) {
  if (!slot) return null;
  const [weekKey, day] = slot.split('|');
  const dt = parseMonday(weekKey);
  if (!dt) return null;
  dt.setDate(dt.getDate() + (Number(day) - 1));
  return ymd(dt);
}

// Dzień wyjazdu (odbiór czystego przez kierowcę) — różny od dnia prania, który
// wypada dzień wcześniej. Wyznacza górną granicę okna, w którym wpis ma sens
// pokazywać się w Pralni na dany dzień.
function departureDateOf(entry) {
  if (!entry.pick_day || !entry.pick_week_key) return null;
  return slotToDate(`${entry.pick_week_key}|${entry.pick_day}`);
}

function washSlotOf(entry, scheduleByRoute) {
  const arrDay = Number(entry.arr_day);
  const arrWeek = entry.week_key;
  const depDay = Number(entry.pick_day);
  const depWeek = entry.pick_week_key;
  const isDaily = (scheduleByRoute.get(entry.route_id) || 'other') === 'daily';

  if (!depDay || !depWeek) {
    if (!arrDay || !arrWeek) return null;
    if (isDaily) return `${arrWeek}|${arrDay}`;
    if (arrDay < 5) return `${arrWeek}|${arrDay + 1}`;
    return `${addDaysToWeekKey(arrWeek, 7)}|1`;
  }

  let washDay;
  let washWeek;
  if (depDay > 1) {
    washDay = depDay - 1;
    washWeek = depWeek;
  } else {
    washDay = 5;
    washWeek = addDaysToWeekKey(depWeek, -7);
  }

  if (!isDaily && arrDay && arrWeek) {
    if (dayWeekToTime(washDay, washWeek) <= dayWeekToTime(arrDay, arrWeek)) {
      washDay = depDay;
      washWeek = depWeek;
    }
  }

  return `${washWeek}|${washDay}`;
}

function hasWorkflowColumns(entry) {
  return Object.prototype.hasOwnProperty.call(entry, 'laundry_status')
    || Object.prototype.hasOwnProperty.call(entry, 'laundry_ready_at')
    || Object.prototype.hasOwnProperty.call(entry, 'laundry_packed_at')
    || Object.prototype.hasOwnProperty.call(entry, 'laundry_trolley_no');
}

function isReadyForDriver(entry) {
  if (entry?.done) return true;
  if (hasWorkflowColumns(entry)) {
    return Boolean(
      entry.laundry_ready_at
      || entry.laundry_packed_at
      || ['packed', 'released', 'at_client', 'returned'].includes(entry.laundry_status)
    );
  }
  return Boolean(entry?.washed);
}

function stageConfig(stage) {
  const map = {
    pending: { label: 'Do prania', tone: 'pending', Icon: Clock3 },
    partial: { label: 'W trakcie', tone: 'partial', Icon: WashingMachine },
    washed: { label: 'Wyprane', tone: 'washed', Icon: CheckCircle2 },
    ready: { label: 'Gotowe dla kierowcy', tone: 'ready', Icon: PackageCheck },
  };
  return map[stage] || map.pending;
}

const getTrolleyStatus = (cycle, entryById) => {
  if (cycle.status === 'canceled') return { key: 'canceled', label: 'COFNIĘTO PAKOWANIE', tone: 'neutral' };

  const linked = (cycle.entry_ids || []).map(id => entryById.get(id)).filter(Boolean);
  const delivered = linked.some(e => e.delivered_at);
  const picked = linked.some(e => e.picked_at);

  // "Bez wózka" nie ma fizycznego wózka do zwrócenia — returned_at ustawiamy tu
  // automatycznie w chwili pakowania (żeby nie liczyło się jako zajęty wózek),
  // więc to pole nie mówi nic o faktycznym postępie. Pomijamy je i pokazujemy
  // realny status dostawy zamiast mylącego "WRÓCIŁ".
  if (cycle.trolley_no === 'brak') {
    if (delivered) return { key: 'delivered', label: 'Dostarczony', tone: 'delivered' };
    if (picked) return { key: 'picked', label: 'W trasie', tone: 'picked' };
    return { key: 'packed', label: 'Spakowane (bez wózka)', tone: 'packed' };
  }

  if (cycle.returned_at) return { key: 'returned', label: 'WRÓCIŁ', tone: 'returned' };
  if (cycle.status === 'at_client') return { key: 'at_client', label: 'Zostawiony w hotelu', tone: 'client' };
  if (delivered) return { key: 'delivered', label: 'Dostarczony', tone: 'delivered' };
  if (picked) return { key: 'picked', label: 'W trasie', tone: 'picked' };
  return { key: 'packed', label: 'Spakowany na pralni', tone: 'packed' };
};

function routeBadge(routeId, routeMap) {
  const route = routeMap.get(routeId);
  if (!route) return null;
  return `T${route.num}`;
}

function Metric({ icon: Icon, label, value, tone }) {
  return (
    <div className={`laundry-metric ${tone ? `tone-${tone}` : ''}`}>
      <div className="laundry-metric-icon"><Icon size={18} /></div>
      <div>
        <div className="laundry-metric-value">{value}</div>
        <div className="laundry-metric-label">{label}</div>
      </div>
    </div>
  );
}

function StagePill({ stage }) {
  const conf = stageConfig(stage);
  const Icon = conf.Icon;
  return (
    <span className={`laundry-stage-pill tone-${conf.tone}`}>
      <Icon size={14} />
      {conf.label}
    </span>
  );
}

export default function WashView() {
  const { sessionToken, user, isAdmin, isTunnel, isPacker, isDriver } = useAuth();
  const { entries, routes, clients, loading, error, refetch } = useAppData();
  const [selectedDate, setSelectedDate] = useState(() => ymd(new Date()));
  const [trolleys, setTrolleys] = useState([]);
  const [workflowLoading, setWorkflowLoading] = useState(true);
  const [workflowError, setWorkflowError] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [packingGroup, setPackingGroup] = useState(null);
  const [trolleysModalOpen, setTrolleysModalOpen] = useState(false);
  const [trolleyCount, setTrolleyCount] = useState(DEFAULT_TROLLEY_COUNT);
  const [kgEdit, setKgEdit] = useState({}); // { [cycleId]: '12,5' } — dopisanie kg poznanego po fakcie

  const hasWashRole = isAdmin || user?.role === 'admin_viewer_driver' || isTunnel || isPacker;
  const hasPackRole = isAdmin || user?.role === 'admin_viewer_driver' || isPacker;
  const isReadOnly = isDriver && !isAdmin && user?.role !== 'admin_viewer_driver';

  const fetchWorkflow = useCallback(async () => {
    if (!sessionToken) {
      setTrolleys([]);
      setWorkflowLoading(false);
      return;
    }
    setWorkflowLoading(true);
    setWorkflowError('');
    try {
      const data = await getLaundryWorkflow(sessionToken);
      setTrolleys(data?.trolleys || []);
      const nextCount = Math.max(1, Math.min(99, Number(data?.trolley_count) || DEFAULT_TROLLEY_COUNT));
      setTrolleyCount(nextCount);
    } catch (err) {
      setWorkflowError(err.message || 'Nie udało się pobrać obiegu wózków');
    } finally {
      setWorkflowLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    fetchWorkflow();
    const channel = supabase.channel('laundry-workflow')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'laundry_trolley_cycles' }, fetchWorkflow)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchWorkflow]);

  const scheduleByRoute = useMemo(
    () => new Map(routes.map(route => [route.id, route.schedule || 'other'])),
    [routes]
  );

  const routeMap = useMemo(
    () => new Map(routes.map((route, index) => [route.id, { ...route, num: index + 1 }])),
    [routes]
  );

  const clientByName = useMemo(
    () => new Map(clients.map(client => [client.name, client])),
    [clients]
  );

  const entryById = useMemo(
    () => new Map(entries.map(entry => [entry.id, entry])),
    [entries]
  );

  const laundryGroups = useMemo(() => {
    const groups = new Map();

    entries.forEach(entry => {
      // Waga jest opcjonalna przy dodawaniu przyjazdu (patrz EntryModals) — brak kg
      // nie znaczy, że nie ma prania. Nie filtrujemy po wadze, inaczej hotel bez
      // wpisanego kg znika z Pralni i nikt się nim nie zajmie.
      if (!entry?.id || entry.deleted_at || entry.done) return;
      const washDate = slotToDate(washSlotOf(entry, scheduleByRoute));
      const departureDate = departureDateOf(entry);
      const touchedToday = [
        dateOnly(entry.washed_at),
        dateOnly(entry.laundry_packed_at),
        dateOnly(entry.laundry_ready_at),
      ].includes(selectedDate);

      // Wpis jest "na dziś" od dnia prania aż do dnia wyjazdu włącznie (to wtedy
      // kierowca po niego przyjeżdża) — nie wiecznie, żeby przełączanie dni w
      // kalendarzyku pokazywało pranie tego dnia, a nie ciągnęło stare, gotowe
      // wpisy z poprzednich dni.
      const inWindow = washDate === selectedDate
        || (washDate && departureDate && selectedDate > washDate && selectedDate <= departureDate);

      if (!inWindow && !touchedToday) return;

      const client = clientByName.get(entry.client_name);
      const routeId = client?.route_id || entry.route_id || 0;
      const key = `${entry.client_name || '—'}|${routeId}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          clientName: entry.client_name || '—',
          routeId,
          entries: [],
          washDate,
        });
      }
      groups.get(key).entries.push(entry);
    });

    return [...groups.values()].map(group => {
      const totalKg = group.entries.reduce((sum, entry) => sum + (parseFloat(entry.weight) || 0), 0);
      const pending = group.entries.filter(entry => !entry.washed && !isReadyForDriver(entry));
      const washed = group.entries.filter(entry => entry.washed || isReadyForDriver(entry));
      const ready = group.entries.filter(isReadyForDriver);
      const entryIds = group.entries.map(entry => entry.id);
      const entryIdSet = new Set(entryIds);
      const groupCycles = trolleys.filter(cycle => (
        cycle.client_name === group.clientName
        && (cycle.entry_ids || []).some(id => entryIdSet.has(id))
      ));
      const activeCycles = groupCycles.filter(cycle => !cycle.returned_at && !['returned', 'canceled'].includes(cycle.status));
      const packedKg = activeCycles.reduce((sum, cycle) => sum + (parseFloat(cycle.total_kg) || 0), 0);
      const remainingKg = Math.max(0, totalKg - packedKg);
      const hasKnownWeight = totalKg > 0;
      // Gdy waga nie jest jeszcze znana, "zostało 0 kg" nic nie mówi o realnym stanie —
      // o gotowości decydują wtedy wyłącznie flagi na wpisach (ready/washed), a nie matematyka kg.
      const groupReady = hasKnownWeight
        ? (remainingKg <= 0.05 || ready.length === group.entries.length)
        : ready.length === group.entries.length;
      const stage = groupReady
        ? 'ready'
        : pending.length > 0 && washed.length > 0
          ? 'partial'
          : pending.length > 0
            ? 'pending'
            : packedKg > 0
              ? 'partial'
              : 'washed';
      const trolleyNos = [...new Set(activeCycles.map(cycle => cycle.trolley_no).filter(Boolean))];

      return {
        ...group,
        kg: Number(totalKg.toFixed(1)),
        hasKnownWeight,
        packedKg: Number(Math.min(totalKg, packedKg).toFixed(1)),
        remainingKg: Number(remainingKg.toFixed(1)),
        stage,
        pendingIds: pending.map(entry => entry.id),
        washedIds: groupReady ? [] : washed.map(entry => entry.id),
        readyIds: groupReady ? entryIds : ready.map(entry => entry.id),
        cycles: activeCycles,
        trolleyNo: trolleyNos.join(', '),
        washedAt: group.entries.map(entry => entry.washed_at).filter(Boolean).sort().at(-1),
        packedAt: [
          ...group.entries.map(entry => entry.laundry_packed_at || entry.laundry_ready_at).filter(Boolean),
          ...activeCycles.map(cycle => cycle.packed_at).filter(Boolean),
        ].sort().at(-1),
      };
    }).sort((a, b) => {
      const order = { pending: 0, partial: 1, washed: 2, ready: 3 };
      const stageDiff = order[a.stage] - order[b.stage];
      if (stageDiff) return stageDiff;
      const routeDiff = (routeMap.get(a.routeId)?.num || 9999) - (routeMap.get(b.routeId)?.num || 9999);
      if (routeDiff) return routeDiff;
      return a.clientName.localeCompare(b.clientName, 'pl');
    });
  }, [clientByName, entries, routeMap, scheduleByRoute, selectedDate, trolleys]);

  const activeTrolleys = useMemo(
    () => trolleys.filter(cycle => !cycle.returned_at && !['returned', 'canceled'].includes(cycle.status)),
    [trolleys]
  );

  const trolleyNumbers = useMemo(
    () => Array.from({ length: trolleyCount }, (_, index) => String(index + 1)),
    [trolleyCount]
  );

  const activeTrolleyByNo = useMemo(() => {
    const map = new Map();
    activeTrolleys.forEach(cycle => {
      map.set(String(cycle.trolley_no || '').trim().toLowerCase(), cycle);
    });
    return map;
  }, [activeTrolleys]);

  const freeTrolleyCount = Math.max(0, trolleyCount - activeTrolleys.length);

  const metrics = useMemo(() => {
    const pendingKg = laundryGroups
      .filter(group => ['pending', 'partial'].includes(group.stage))
      .reduce((sum, group) => sum + group.pendingIds.reduce((s, id) => s + (parseFloat(entryById.get(id)?.weight) || 0), 0), 0);
    const washedKg = laundryGroups
      .filter(group => group.stage !== 'ready' && group.pendingIds.length === 0)
      .reduce((sum, group) => sum + group.remainingKg, 0);
    const readyKg = laundryGroups
      .filter(group => group.stage === 'ready')
      .reduce((sum, group) => sum + group.kg, 0);
    return {
      pendingKg: Number(pendingKg.toFixed(1)),
      washedKg: Number(washedKg.toFixed(1)),
      readyKg: Number(readyKg.toFixed(1)),
      activeTrolleys: activeTrolleys.length,
    };
  }, [activeTrolleys.length, entryById, laundryGroups]);

  const runAction = async (key, action) => {
    try {
      setBusyKey(key);
      await action();
      await Promise.all([refetch(), fetchWorkflow()]);
    } catch (err) {
      toastError(err.message || 'Operacja nie powiodła się');
    } finally {
      setBusyKey('');
    }
  };

  const handleMarkWashed = (group) => {
    if (!group.pendingIds.length) return;
    runAction(`washed:${group.key}`, async () => {
      await markLaundryWashed(sessionToken, group.pendingIds, user?.name);
      toastSuccess(`${group.clientName}: oznaczono wyprane`);
    });
  };

  const handleUnmarkWashed = (group) => {
    const ids = group.entries.map(entry => entry.id).filter(Boolean);
    if (!ids.length) return;
    runAction(`unwashed:${group.key}`, async () => {
      await unmarkLaundryWashed(sessionToken, ids, user?.name);
      toastSuccess(`${group.clientName}: cofnięto wypranie`);
    });
  };

  const handlePack = async (group, trolleyNo, kgValue) => {
    if (!trolleyNo) {
      throw new Error('Wybierz numer wózka');
    }
    // Waga nieznana z przyjazdu → kg jest opcjonalne teraz, można uzupełnić później
    // (np. gdy kierowca zgłosi wagę po dostawie) przez edycję wpisu wózka.
    const kg = Number.isFinite(kgValue) ? kgValue : 0;
    if (group.hasKnownWeight && kg <= 0) {
      throw new Error('Podaj ile kg wkładasz do tego wózka');
    }
    if (group.hasKnownWeight && kg > group.remainingKg + 0.05) {
      throw new Error(`Do spakowania zostało ${group.remainingKg} kg`);
    }
    if (!trolleyNumbers.includes(trolleyNo)) {
      throw new Error(`Wybierz wózek od 1 do ${trolleyCount}`);
    }
    const activeCycle = activeTrolleyByNo.get(trolleyNo.toLowerCase());
    if (activeCycle) {
      throw new Error(`Wózek ${trolleyNo} jest zajęty: ${activeCycle.client_name}`);
    }
    if (group.pendingIds.length > 0) {
      throw new Error('Najpierw oznacz całe pranie klienta jako wyprane');
    }
    if (!group.washedIds.length) return;

    setBusyKey(`pack:${group.key}`);
    try {
      await packLaundryTrolley(sessionToken, group.washedIds, trolleyNo, kg, user?.name);
      toastSuccess(`${group.clientName}: ${kg > 0 ? `${kg} kg` : 'spakowano'} do wózka ${trolleyNo}`);
      await Promise.all([refetch(), fetchWorkflow()]);
    } finally {
      setBusyKey('');
    }
  };

  const handlePackMulti = async (group, trolleyNos, kgByTrolley) => {
    if (!trolleyNos || trolleyNos.length === 0) {
      throw new Error('Nie wybrano wózków');
    }

    // Validate all trolleys first (skip for 'brak' which is a virtual non-trolley option)
    for (const trolleyNo of trolleyNos) {
      if (trolleyNo === 'brak') continue;
      if (!trolleyNumbers.includes(trolleyNo)) {
        throw new Error(`Wózek ${trolleyNo} nie istnieje`);
      }
      const activeCycle = activeTrolleyByNo.get(trolleyNo.toLowerCase());
      if (activeCycle) {
        throw new Error(`Wózek ${trolleyNo} jest zajęty przez: ${activeCycle.client_name}`);
      }
    }

    // Waga znana z przyjazdu → dzielimy ją automatycznie na wózki jak dotychczas.
    // Waga nieznana → kgByTrolley to realne kg zważone teraz przy pakowaniu (z modala).
    let kgFor;
    if (group.hasKnownWeight) {
      const baseKg = Math.floor((group.remainingKg / trolleyNos.length) * 10) / 10;
      const totalBase = baseKg * (trolleyNos.length - 1);
      const lastKg = Math.round((group.remainingKg - totalBase) * 10) / 10;
      kgFor = (i) => (i === trolleyNos.length - 1) ? lastKg : baseKg;
    } else {
      // Kg opcjonalne przy nieznanej wadze — puste pole = 0, do uzupełnienia później.
      kgFor = (i) => {
        const kg = parseFloat(String(kgByTrolley?.[trolleyNos[i]] ?? '').replace(',', '.'));
        return Number.isFinite(kg) && kg > 0 ? kg : 0;
      };
    }

    try {
      setBusyKey(`pack:${group.key}`);
      for (let i = 0; i < trolleyNos.length; i++) {
        const kgValue = kgFor(i);
        await packLaundryTrolley(sessionToken, group.washedIds, trolleyNos[i], kgValue, user?.name);
      }
      if (trolleyNos.includes('brak')) {
        toastSuccess(`${group.clientName}: spakowano (bez wózka)`);
      } else {
        toastSuccess(`${group.clientName}: spakowano do ${trolleyNos.length} wózków`);
      }
      await Promise.all([refetch(), fetchWorkflow()]);
      setPackingGroup(null);
    } catch (err) {
      toastError(err.message || 'Błąd podczas pakowania wózków');
      // Refetch anyway in case partial packing happened
      await Promise.all([refetch(), fetchWorkflow()]);
    } finally {
      setBusyKey('');
    }
  };

  const handleReturnTrolley = (cycle) => {
    runAction(`return:${cycle.id}`, async () => {
      await returnLaundryTrolley(sessionToken, cycle.id, user?.name);
      toastSuccess(`Wózek ${cycle.trolley_no} wrócił`);
    });
  };

  const handleCancelTrolley = (cycle) => {
    runAction(`cancel:${cycle.id}`, async () => {
      await cancelLaundryTrolley(sessionToken, cycle.id, user?.name);
      toastSuccess(`Cofnięto pakowanie wózka ${cycle.trolley_no}`);
    });
  };

  const handleUndoReturnTrolley = async (cycle) => {
    try {
      setBusyKey(`undo-return:${cycle.id}`);
      await undoReturnLaundryTrolley(sessionToken, cycle.id);
      await Promise.all([refetch(), fetchWorkflow()]);
    } catch (e) {
      alert(`Błąd: ${e.message}`);
    } finally {
      setBusyKey(null);
    }
  };

  // "Bez wózka" (brak) jest od razu oznaczane jako "wróciło" — bo nie zajmuje realnego
  // wózka w pralni — więc dla klienta nie ma tu sensownego "powrotu" do cofnięcia
  // osobno. Jeden przycisk robi oba kroki wymagane przez backend (cofnij powrót, potem
  // anuluj pakowanie), żeby cały cykl dało się cofnąć jednym kliknięciem.
  const handleUndoPackNoTrolley = (cycle) => {
    runAction(`cancel:${cycle.id}`, async () => {
      await undoReturnLaundryTrolley(sessionToken, cycle.id, user?.name);
      await cancelLaundryTrolley(sessionToken, cycle.id, user?.name);
      toastSuccess(`Cofnięto pakowanie: ${cycle.client_name}`);
    });
  };

  // Uzupełnienie kg poznanego po fakcie (np. kierowca zgłosił wagę po dostawie),
  // gdy pakowanie odbyło się bez znanej wagi.
  const handleSaveTrolleyKg = (cycle) => {
    const kg = parseFloat(String(kgEdit[cycle.id] ?? '').replace(',', '.'));
    if (!Number.isFinite(kg) || kg <= 0) {
      toastError('Podaj poprawną wagę');
      return;
    }
    runAction(`kg:${cycle.id}`, async () => {
      await updateLaundryTrolleyKg(sessionToken, cycle.id, kg, user?.name);
      setKgEdit(prev => { const next = { ...prev }; delete next[cycle.id]; return next; });
      toastSuccess(`${cycle.client_name}: zapisano ${kg} kg`);
    });
  };

  const handleDeleteTrolley = async (cycle) => {
    if (!window.confirm(`Czy na pewno chcesz bezpowrotnie USUNĄĆ cykl wózka ${cycle.trolley_no}? Tej operacji nie można cofnąć.`)) return;
    try {
      setBusyKey(`delete:${cycle.id}`);
      await deleteLaundryTrolley(sessionToken, cycle.id);
      await Promise.all([refetch(), fetchWorkflow()]);
    } catch (e) {
      alert(`Błąd: ${e.message}`);
    } finally {
      setBusyKey(null);
    }
  };

  const handleSetAtClient = async (cycle) => {
    try {
      setBusyKey(`at-client:${cycle.id}`);
      await setTrolleyAtClient(sessionToken, cycle.id);
      await Promise.all([refetch(), fetchWorkflow()]);
    } catch (e) {
      alert(`Błąd: ${e.message}`);
    } finally {
      setBusyKey(null);
    }
  };

  const refreshAll = () => Promise.all([refetch(), fetchWorkflow()]);

  if (loading) return <div className="loader">Ładowanie pralni…</div>;
  if (error) return <DataError onRetry={refetch} />;

  return (
    <div className="laundry-shell">
      <div className="laundry-toolbar">
        <div>
          <div className="laundry-kicker">Pralnia</div>
          <h1>Plan prania i wózki</h1>
          <p>{formatDate(selectedDate)} · pranie, pakowanie i gotowość dla kierowcy</p>
        </div>
        <div className="laundry-toolbar-actions">
          <div className="laundry-date-nav">
            <button type="button" onClick={() => setSelectedDate(addDays(selectedDate, -1))}>‹</button>
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value || ymd(new Date()))} />
            <button type="button" onClick={() => setSelectedDate(addDays(selectedDate, 1))}>›</button>
          </div>
          <button className="laundry-icon-btn" type="button" onClick={refreshAll} disabled={workflowLoading}>
            <RefreshCw size={16} className={workflowLoading ? 'spin' : ''} />
            Odśwież
          </button>
        </div>
      </div>

      {workflowError && (
        <div className="laundry-warning">
          Nie mogę pobrać obiegu wózków. Jeśli migracja nie była jeszcze uruchomiona w Supabase, ekran pokaże listę prania, ale pakowanie będzie niedostępne. Szczegóły: {workflowError}
        </div>
      )}

      <div className="laundry-metrics">
        <Metric icon={WashingMachine} label="Do wyprania" value={`${metrics.pendingKg} kg`} tone="pending" />
        <Metric icon={CheckCircle2} label="Wyprane, do pakowania" value={`${metrics.washedKg} kg`} tone="washed" />
        <Metric icon={PackageCheck} label="Gotowe dla kierowcy" value={`${metrics.readyKg} kg`} tone="ready" />
        <div onClick={() => setTrolleysModalOpen(true)} style={{ cursor: 'pointer' }}>
          <Metric icon={Archive} label={`Wózki zajęte / ${trolleyCount}`} value={`${metrics.activeTrolleys}/${trolleyCount}`} tone="trolley" />
        </div>
      </div>

      <section className="laundry-section">
        <div className="laundry-section-head">
          <div>
            <h2>Dzisiejsze pranie</h2>
            <span>{punktLabel(laundryGroups.length)}</span>
          </div>
        </div>

        <div className="laundry-work-list">
          {laundryGroups.length === 0 && (
            <div className="laundry-empty">
              Brak prania na wybrany dzień.
            </div>
          )}

          {laundryGroups.map(group => {
            const route = routeBadge(group.routeId, routeMap);
            const canMarkWashed = hasWashRole && group.pendingIds.length > 0;
            const canUnmarkWashed = hasWashRole && (group.cycles.length > 0 || group.entries.some(entry => entry.washed || isReadyForDriver(entry)));
            const canPack = hasPackRole && group.pendingIds.length === 0 && group.washedIds.length > 0
              && (group.hasKnownWeight ? group.remainingKg > 0 : true);
            const busyWashed = busyKey === `washed:${group.key}`;
            const busyUnwashed = busyKey === `unwashed:${group.key}`;
            const busyPack = busyKey === `pack:${group.key}`;


            return (
              <article key={group.key} className={`laundry-work-row stage-${group.stage}`}>
                <div className="laundry-work-main">
                  <div className="laundry-client-line">
                    {route && <span className="laundry-route-badge">{route}</span>}
                    <strong>{group.clientName}</strong>
                    <StagePill stage={group.stage} />
                  </div>
                  <div className="laundry-work-meta">
                    <span>{group.hasKnownWeight ? `${group.kg} kg` : 'waga nieznana'}</span>
                    {group.packedKg > 0 && <span>spakowane {group.packedKg}/{group.kg} kg</span>}
                    {group.packedKg > 0 && group.remainingKg > 0 && <span>zostało {group.remainingKg} kg</span>}
                    {group.washedAt && <span>wyprane {fmtTimeForDay(group.washedAt, selectedDate)}</span>}
                    {group.packedAt && <span>spakowane {fmtTimeForDay(group.packedAt, selectedDate)}</span>}
                    {group.trolleyNo && <span>wózki {group.trolleyNo}</span>}
                  </div>
                  
                  {/* Progress bar */}
                  <div className="laundry-progress-track">
                    <div 
                      className={`laundry-progress-fill ${group.packedKg + 0.05 >= group.kg ? 'is-complete' : ''}`} 
                      style={{ width: `${Math.min(100, Math.max(0, (group.packedKg / (group.kg || 1)) * 100))}%` }}
                    />
                  </div>
                  {group.cycles.length > 0 && (
                    <div className="laundry-cycle-chips">
                      {group.cycles.map(cycle => {
                        const busyCancel = busyKey === `cancel:${cycle.id}`;
                        return (
                          <span key={cycle.id} className="laundry-cycle-chip">
                            <strong>wózek {cycle.trolley_no}</strong>
                            <b>{Number(cycle.total_kg || 0).toFixed(1)} kg</b>
                            {hasPackRole && (
                              <button
                                type="button"
                                onClick={() => handleCancelTrolley(cycle)}
                                disabled={busyCancel}
                              >
                                {busyCancel ? 'cofam…' : 'cofnij'}
                              </button>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                {!isReadOnly && (
                <div className="laundry-work-actions">
                  <button
                    type="button"
                    className="laundry-action-btn"
                    onClick={() => handleMarkWashed(group)}
                    disabled={!canMarkWashed || busyWashed}
                    title={!hasWashRole ? 'Brak uprawnień do zapisu' : undefined}
                  >
                    <CheckCircle2 size={16} />
                    {busyWashed ? 'Zapis…' : 'Wyprane'}
                  </button>

                  <button
                    type="button"
                    className="laundry-action-btn is-danger"
                    onClick={() => handleUnmarkWashed(group)}
                    disabled={!canUnmarkWashed || busyUnwashed}
                    title={!hasWashRole ? 'Brak uprawnień do zapisu' : 'Cofa wypranie i aktywne pakowania tego punktu'}
                  >
                    <RotateCcw size={16} />
                    {busyUnwashed ? 'Cofam…' : 'Cofnij wyprane'}
                  </button>

                  {hasPackRole && (
                    <button
                      type="button"
                      className="laundry-action-btn is-pack"
                      onClick={() => setPackingGroup(group)}
                      disabled={!canPack || busyPack}
                      title={!hasPackRole ? 'Brak uprawnień do pakowania' : undefined}
                    >
                      <Package size={16} />
                      Pakuj (Skaner)
                    </button>
                  )}
                </div>
              )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="laundry-section">
        <div className="laundry-section-head">
          <div>
            <h2>Historia i harmonogram wózków</h2>
            <span>{freeTrolleyCount} wolne · {activeTrolleys.length} zajęte · razem {trolleyCount}</span>
          </div>
        </div>

        <div className="laundry-trolley-board">
          {trolleys.length === 0 && (
            <div className="laundry-empty">
              Brak historii wózków.
            </div>
          )}

          {trolleys.map(cycle => {
            const status = getTrolleyStatus(cycle, entryById);
            const linked = (cycle.entry_ids || []).map(id => entryById.get(id)).filter(Boolean);
            const driver = [...new Set(linked.map(entry => entry.picked_by).filter(Boolean))].join(', ');
            const deliveredAt = linked.map(entry => entry.delivered_at).filter(Boolean).sort().at(-1);
            const busyReturn = busyKey === `return:${cycle.id}`;
            const busyCancel = busyKey === `cancel:${cycle.id}`;
            const busyUndoReturn = busyKey === `undo-return:${cycle.id}`;
            const busyDelete = busyKey === `delete:${cycle.id}`;
            const busyAtClient = busyKey === `at-client:${cycle.id}`;
            const busyKg = busyKey === `kg:${cycle.id}`;
            const isNoTrolley = cycle.trolley_no === 'brak';
            const kgUnknown = !(Number(cycle.total_kg || 0) > 0);
            const isEditingKg = cycle.id in kgEdit;
            const canCancelCycle = hasPackRole && !cycle.returned_at && status.key !== 'canceled' && status.key !== 'at_client';
            const canUndoReturn = hasPackRole && status.key === 'returned';
            const canDelete = isAdmin;
            const canSetAtClient = hasPackRole && !cycle.returned_at && status.key !== 'canceled' && status.key !== 'at_client';

            return (
              <article key={cycle.id} className={`laundry-trolley-card tone-${status.tone}`}>
                <div className="laundry-trolley-top">
                  <div>
                    <span>Wózek</span>
                    <strong>{cycle.trolley_no}</strong>
                  </div>
                  <span className={`laundry-trolley-status tone-${status.tone}`}>{status.label}</span>
                </div>
                <div className="laundry-trolley-client">{cycle.client_name}</div>
                <div className="laundry-trolley-grid">
                  <span>kg</span>
                  {kgUnknown && hasPackRole ? (
                    isEditingKg ? (
                      <span style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <input
                          type="text"
                          inputMode="decimal"
                          autoFocus
                          placeholder="kg"
                          value={kgEdit[cycle.id]}
                          onChange={e => setKgEdit(prev => ({ ...prev, [cycle.id]: e.target.value }))}
                          style={{ width: '60px', border: '1px solid var(--border)', borderRadius: '8px', padding: '3px 6px', fontSize: '13px', fontWeight: 600 }}
                        />
                        <button type="button" onClick={() => handleSaveTrolleyKg(cycle)} disabled={busyKg} style={{ fontSize: '12px', fontWeight: 700 }}>
                          {busyKg ? 'Zapis…' : 'Zapisz'}
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setKgEdit(prev => ({ ...prev, [cycle.id]: '' }))}
                        style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-tertiary)', fontStyle: 'italic', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        waga nieznana — wpisz kg
                      </button>
                    )
                  ) : (
                    <strong>{Number(cycle.total_kg || 0).toFixed(1)}</strong>
                  )}
                  <span>spakowano</span><strong>{fmtDateTime(cycle.packed_at)}</strong>
                  {driver && <><span>kierowca</span><strong>{driver}</strong></>}
                  {deliveredAt && <><span>dostarczono</span><strong>{fmtDateTime(deliveredAt)}</strong></>}
                  {/* "brak" ma returned_at ustawione automatycznie przy pakowaniu — to nie jest
                      realny powrót wózka, więc dla tych kart tego wiersza nie pokazujemy. */}
                  {!isNoTrolley && cycle.returned_at && <><span>powrót</span><strong>{fmtDateTime(cycle.returned_at)}</strong></>}
                </div>
                {hasPackRole && (
                  <div className="laundry-card-actions">
                    {isNoTrolley ? (
                      // "Bez wózka" nie jest realnym wózkiem, więc nie ma tu nic do "zwrócenia" —
                      // jeden przycisk cofa cały pakiet (backend wymaga cofnięcia powrotu przed
                      // anulowaniem pakowania, robimy to za jednym kliknięciem).
                      status.key !== 'canceled' && (
                        <button
                          type="button"
                          className="laundry-return-btn is-danger"
                          onClick={() => handleUndoPackNoTrolley(cycle)}
                          disabled={busyCancel}
                        >
                          <RotateCcw size={15} />
                          {busyCancel ? 'Cofam…' : 'Cofnij pakowanie'}
                        </button>
                      )
                    ) : (
                      <>
                        {canCancelCycle && (
                          <button
                            type="button"
                            className="laundry-return-btn is-danger"
                            onClick={() => handleCancelTrolley(cycle)}
                            disabled={busyCancel}
                          >
                            <RotateCcw size={15} />
                            {busyCancel ? 'Cofam…' : 'Cofnij pakowanie'}
                          </button>
                        )}
                        {!cycle.returned_at && status.key !== 'canceled' && (
                          <button
                            type="button"
                            className="laundry-return-btn"
                            onClick={() => handleReturnTrolley(cycle)}
                            disabled={busyReturn}
                          >
                            <RotateCcw size={15} />
                            {busyReturn ? 'Zapis…' : 'Wózek wrócił'}
                          </button>
                        )}
                        {canSetAtClient && (
                          <button
                            type="button"
                            className="laundry-return-btn is-secondary"
                            onClick={() => handleSetAtClient(cycle)}
                            disabled={busyAtClient}
                          >
                            <Archive size={15} />
                            {busyAtClient ? 'Zapis…' : 'Został u klienta'}
                          </button>
                        )}
                        {canUndoReturn && (
                          <button
                            type="button"
                            className="laundry-return-btn is-secondary"
                            onClick={() => handleUndoReturnTrolley(cycle)}
                            disabled={busyUndoReturn}
                          >
                            <RotateCcw size={15} />
                            {busyUndoReturn ? 'Cofam…' : 'Cofnij powrót'}
                          </button>
                        )}
                      </>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        className="laundry-return-btn is-danger"
                        style={{ background: 'var(--red-900)' }}
                        onClick={() => handleDeleteTrolley(cycle)}
                        disabled={busyDelete}
                      >
                        {busyDelete ? 'Usuwam…' : 'Usuń wpis'}
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="laundry-flow-note">
        <Truck size={18} />
        <span>Hotel trafia do kierowcy dopiero po spakowaniu całej wagi. Każdy wózek ma osobny numer, kg i historię aż do oznaczenia powrotu.</span>
      </section>

      {packingGroup && (
        <PackingModal
          group={laundryGroups.find(g => g.key === packingGroup.key) || packingGroup}
          onClose={() => setPackingGroup(null)}
          onPack={handlePack}
          onPackMulti={handlePackMulti}
          trolleyNumbers={trolleyNumbers}
          activeTrolleyByNo={activeTrolleyByNo}
        />
      )}
      
      {trolleysModalOpen && (
        <TrolleysDashboardModal
          onClose={() => setTrolleysModalOpen(false)}
          trolleyCount={trolleyCount}
          activeTrolleyByNo={activeTrolleyByNo}
          trolleys={trolleys}
        />
      )}
    </div>
  );
}
