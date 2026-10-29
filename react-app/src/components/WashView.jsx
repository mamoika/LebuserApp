import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Archive,
  CheckCircle2,
  Clock3,
  Maximize2,
  MoreHorizontal,
  Package,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  Trash2,
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
import { currentLocale, operationalYmd } from '../lib/dateUtils';
import { effectiveServiceRules, isEveryWorkdayService } from '../lib/serviceSchedule';
import { activePhysicalTrolleyCycles, buildTrolleyOccupancy } from '../lib/trolleyOccupancy';
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
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(currentLocale(), {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  });
}

// Poprawna polska odmiana: 1 punkt, 2-4 punkty, 5+ punktów (z wyjątkiem 12-14).
function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' });
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(currentLocale(), {
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

function washSlotOf(entry, scheduleByRoute, dailyServiceByClient) {
  const arrDay = Number(entry.arr_day);
  const arrWeek = entry.week_key;
  const depDay = Number(entry.pick_day);
  const depWeek = entry.pick_week_key;
  const isDaily = dailyServiceByClient.has(entry.client_name)
    ? dailyServiceByClient.get(entry.client_name)
    : (scheduleByRoute.get(entry.route_id) || 'other') === 'daily';

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

function stageConfig(stage, t) {
  const map = {
    pending: { label: t('wash.stages.pending'), tone: 'pending', Icon: Clock3 },
    partial: { label: t('wash.stages.partial'), tone: 'partial', Icon: WashingMachine },
    washed: { label: t('wash.stages.washed'), tone: 'washed', Icon: CheckCircle2 },
    ready: { label: t('wash.stages.ready'), tone: 'ready', Icon: PackageCheck },
  };
  return map[stage] || map.pending;
}

const WORK_FILTERS = [
  { key: 'all', labelKey: 'wash.filters.all' },
  { key: 'pending', labelKey: 'wash.filters.pending' },
  { key: 'washed', labelKey: 'wash.filters.washed' },
  { key: 'ready', labelKey: 'wash.filters.ready' },
];

function filterGroup(group, filterKey) {
  if (filterKey === 'all') return true;
  if (filterKey === 'pending') return ['pending', 'partial'].includes(group.stage) && group.pendingIds.length > 0;
  if (filterKey === 'washed') return isPackCandidate(group);
  if (filterKey === 'ready') return group.stage === 'ready';
  return true;
}

function isPackCandidate(group) {
  return group.stage !== 'ready'
    && group.pendingIds.length === 0
    && group.washedIds.length > 0
    && (group.hasKnownWeight ? group.remainingKg > 0 : true);
}

function isEntryIssuedToDriver(entry) {
  return Boolean(
    entry?.picked_at
    || entry?.delivered_at
    || entry?.delivered
    || entry?.done
    || entry?.laundry_packed_at
    || entry?.laundry_ready_at
    || ['packed', 'released', 'at_client', 'returned'].includes(entry?.laundry_status)
  );
}

const isRealTrolley = (cycle) => Boolean(cycle?.trolley_no && String(cycle.trolley_no).trim().toLowerCase() !== 'brak');

const getTrolleyStatus = (cycle, entryById, t) => {
  if (cycle.status === 'canceled') return { key: 'canceled', label: t('wash.statuses.canceled'), tone: 'neutral' };

  const linked = (cycle.entry_ids || []).map(id => entryById.get(id)).filter(Boolean);
  const delivered = Boolean(cycle.is_delivered || linked.some(e => e.delivered_at || e.delivered));
  const picked = Boolean(cycle.is_issued_to_driver || linked.some(e => e.picked_at));

  // "Bez wózka" (paczka / worek)
  if (!isRealTrolley(cycle)) {
    if (cycle.status === 'returned' || cycle.returned_at || delivered) {
      return { key: 'delivered', label: t('wash.statuses.deliveredLoose'), tone: 'delivered' };
    }
    if (picked) return { key: 'picked', label: t('wash.statuses.picked'), tone: 'picked' };
    const isOldCycle = cycle.packed_at && (Date.now() - new Date(cycle.packed_at).getTime() > 7 * 86400000);
    if (isOldCycle) return { key: 'delivered', label: t('wash.statuses.completedArchive'), tone: 'delivered' };
    return { key: 'packed', label: t('wash.statuses.packedLoose'), tone: 'packed' };
  }

  if (cycle.returned_at) return { key: 'returned', label: t('wash.statuses.returned'), tone: 'returned' };
  if (cycle.status === 'at_client') return { key: 'at_client', label: t('wash.statuses.atClient'), tone: 'client' };
  if (delivered) return { key: 'delivered', label: t('wash.statuses.delivered'), tone: 'delivered' };
  if (picked) return { key: 'picked', label: t('wash.statuses.picked'), tone: 'picked' };
  return { key: 'packed', label: t('wash.statuses.packed'), tone: 'packed' };
};

function getCycleTransportState(cycle, entryById, t) {
  const status = getTrolleyStatus(cycle, entryById, t);
  const linked = (cycle.entry_ids || []).map(id => entryById.get(id)).filter(Boolean);
  const driver = cycle.driver_name || [...new Set(linked.map(entry => entry.picked_by).filter(Boolean))].join(', ');
  const deliveredAt = cycle.entry_delivered_at || linked.map(entry => entry.delivered_at).filter(Boolean).sort().at(-1);
  const pickedAt = cycle.entry_picked_at || linked.map(entry => entry.picked_at).filter(Boolean).sort().at(-1);
  const isOldCycle = cycle.packed_at && (Date.now() - new Date(cycle.packed_at).getTime() > 7 * 86400000);
  const isIssuedToDriver = Boolean(
    cycle.is_issued_to_driver
    || cycle.is_delivered
    || pickedAt
    || deliveredAt
    || (!isRealTrolley(cycle) && (cycle.status === 'returned' || cycle.returned_at || isOldCycle))
    || status.key === 'picked'
    || status.key === 'delivered'
    || status.key === 'at_client'
  );

  return { status, linked, driver, deliveredAt, pickedAt, isIssuedToDriver };
}

function routeBadge(routeId, routeMap) {
  const route = routeMap.get(routeId);
  if (!route) return null;
  return `T${route.num}`;
}

function Metric({ icon: Icon, label, value, tone, active = false, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      className={`laundry-metric ${tone ? `tone-${tone}` : ''} ${active ? 'is-active' : ''}`}
      type={onClick ? 'button' : undefined}
      onClick={onClick}
    >
      <div className="laundry-metric-icon"><Icon size={18} /></div>
      <div>
        <div className="laundry-metric-value">{value}</div>
        <div className="laundry-metric-label">{label}</div>
      </div>
    </Tag>
  );
}

function StagePill({ stage }) {
  const { t } = useTranslation();
  const conf = stageConfig(stage, t);
  const Icon = conf.Icon;
  return (
    <span className={`laundry-stage-pill tone-${conf.tone}`}>
      <Icon size={14} />
      {conf.label}
    </span>
  );
}

export default function WashView() {
  const { t } = useTranslation();
  const { sessionToken, user, isAdmin, isTunnel, isPacker, isDriver, canEditModule } = useAuth();
  const { entries, routes, clients, loading, error, refetch } = useAppData();
  const [selectedDate, setSelectedDate] = useState(() => operationalYmd());
  const [trolleys, setTrolleys] = useState([]);
  const [arrivalReservations, setArrivalReservations] = useState([]);
  const [workflowLoading, setWorkflowLoading] = useState(true);
  const [workflowError, setWorkflowError] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [packingGroup, setPackingGroup] = useState(null);
  const [trolleysModalOpen, setTrolleysModalOpen] = useState(false);
  const [trolleyCount, setTrolleyCount] = useState(DEFAULT_TROLLEY_COUNT);
  const [kgEdit, setKgEdit] = useState({}); // { [cycleId]: '12,5' } — dopisanie kg poznanego po fakcie
  const [workFilter, setWorkFilter] = useState('all');
  const [trolleyTab, setTrolleyTab] = useState('active'); // 'active' | 'fleet' | 'packages' | 'history'

  const canEditWash = canEditModule('wash');
  const hasWashRole = canEditWash && (isAdmin || user?.role === 'admin_viewer_driver' || isTunnel || isPacker);
  const hasPackRole = canEditWash && (isAdmin || user?.role === 'admin_viewer_driver' || isPacker);
  const isReadOnly = !canEditWash || (isDriver && !isAdmin && user?.role !== 'admin_viewer_driver');

  const fetchWorkflow = useCallback(async () => {
    if (!sessionToken) {
      setTrolleys([]);
      setArrivalReservations([]);
      setWorkflowLoading(false);
      return;
    }
    setWorkflowLoading(true);
    setWorkflowError('');
    try {
      const data = await getLaundryWorkflow(sessionToken);
      setTrolleys(data?.trolleys || []);
      setArrivalReservations(data?.arrival_reservations || []);
      const nextCount = Math.max(1, Math.min(99, Number(data?.trolley_count) || DEFAULT_TROLLEY_COUNT));
      setTrolleyCount(nextCount);
    } catch (err) {
      setWorkflowError(err.message || t('wash.loadWorkflowError'));
    } finally {
      setWorkflowLoading(false);
    }
  }, [sessionToken, t]);

  useEffect(() => {
    fetchWorkflow();
    const channel = supabase.channel('laundry-workflow')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'laundry_trolley_cycles' }, fetchWorkflow)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, fetchWorkflow)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchWorkflow]);

  const scheduleByRoute = useMemo(
    () => new Map(routes.map(route => [route.id, route.schedule || 'other'])),
    [routes]
  );
  const dailyServiceByClient = useMemo(
    () => new Map(clients.map(client => [
      client.name,
      isEveryWorkdayService(effectiveServiceRules(client, routes)),
    ])),
    [clients, routes]
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
      const washDate = slotToDate(washSlotOf(entry, scheduleByRoute, dailyServiceByClient));
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
        allCycles: groupCycles,
        issuedToDriver: group.entries.some(isEntryIssuedToDriver),
        trolleyNo: trolleyNos.join(', '),
        washedAt: group.entries.map(entry => entry.washed_at).filter(Boolean).sort().at(-1),
        packedAt: [
          ...group.entries.map(entry => entry.laundry_packed_at || entry.laundry_ready_at).filter(Boolean),
          ...activeCycles.map(cycle => cycle.packed_at).filter(Boolean),
        ].sort().at(-1),
      };
    }).sort((a, b) => {
      // Keep the list stable while operators mark items as washed/packed.
      // Status changes should update the row in place, not move the client away.
      const routeDiff = (routeMap.get(a.routeId)?.num || 9999) - (routeMap.get(b.routeId)?.num || 9999);
      if (routeDiff) return routeDiff;
      return a.clientName.localeCompare(b.clientName, currentLocale());
    });
  }, [clientByName, dailyServiceByClient, entries, routeMap, scheduleByRoute, selectedDate, trolleys]);

  // Tylko realne fizyczne wózki 1–40 (wykluczamy 'brak' pakowany bez wózka)
  const activeTrolleys = useMemo(
    () => activePhysicalTrolleyCycles(trolleys),
    [trolleys]
  );

  // Wydania bez wózka (worki / paczki)
  const packageCycles = useMemo(
    () => trolleys.filter(cycle => !isRealTrolley(cycle)),
    [trolleys]
  );

  // Historia zwróconych lub anulowanych wózków
  const historyTrolleys = useMemo(
    () => trolleys.filter(cycle =>
      isRealTrolley(cycle) &&
      (Boolean(cycle.returned_at) || ['returned', 'canceled'].includes(cycle.status))
    ),
    [trolleys]
  );

  const trolleyNumbers = useMemo(
    () => Array.from({ length: trolleyCount }, (_, index) => String(index + 1)),
    [trolleyCount]
  );

  const activeTrolleyByNo = useMemo(() => {
    return buildTrolleyOccupancy(activeTrolleys, arrivalReservations);
  }, [activeTrolleys, arrivalReservations]);

  const occupiedTrolleys = useMemo(
    () => [...activeTrolleyByNo.values()].sort((a, b) => (
      Number(a.trolley_no) - Number(b.trolley_no)
      || String(a.trolley_no).localeCompare(String(b.trolley_no), 'pl')
    )),
    [activeTrolleyByNo],
  );

  const freeTrolleyCount = Math.max(0, trolleyCount - activeTrolleyByNo.size);

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
      activeTrolleys: activeTrolleyByNo.size,
    };
  }, [activeTrolleyByNo.size, entryById, laundryGroups]);

  const filterCounts = useMemo(() => (
    WORK_FILTERS.reduce((acc, filter) => {
      acc[filter.key] = laundryGroups.filter(group => filterGroup(group, filter.key)).length;
      return acc;
    }, {})
  ), [laundryGroups]);

  const filteredLaundryGroups = useMemo(
    () => laundryGroups.filter(group => filterGroup(group, workFilter)),
    [laundryGroups, workFilter]
  );

  const getCycleCorrection = (cycle) => {
    const { status, isIssuedToDriver } = getCycleTransportState(cycle, entryById, t);
    const isNoTrolley = cycle.trolley_no === 'brak';

    if (hasPackRole && isNoTrolley && status.key === 'packed' && !isIssuedToDriver) {
      return {
        key: `cancel-no-trolley:${cycle.id}`,
        label: busyKey === `cancel:${cycle.id}` ? t('wash.actions.undoing') : t('wash.actions.undoPackNamed', { trolley: cycle.trolley_no }),
        disabled: busyKey === `cancel:${cycle.id}`,
        onClick: () => handleUndoPackNoTrolley(cycle),
      };
    }

    if (hasPackRole && !cycle.returned_at && status.key === 'packed' && !isIssuedToDriver) {
      return {
        key: `cancel:${cycle.id}`,
        label: busyKey === `cancel:${cycle.id}` ? t('wash.actions.undoing') : t('wash.actions.undoPackTrolley', { trolley: cycle.trolley_no }),
        disabled: busyKey === `cancel:${cycle.id}`,
        onClick: () => handleCancelTrolley(cycle),
      };
    }

    return null;
  };

  const runAction = async (key, action) => {
    try {
      setBusyKey(key);
      await action();
      await Promise.all([refetch(), fetchWorkflow()]);
    } catch (err) {
      toastError(err.message || t('wash.operationFailed'));
    } finally {
      setBusyKey('');
    }
  };

  const handleMarkWashed = (group) => {
    if (!group.pendingIds.length) return;
    runAction(`washed:${group.key}`, async () => {
      await markLaundryWashed(sessionToken, group.pendingIds, user?.name);
      toastSuccess(t('wash.messages.markedWashed', { client: group.clientName }));
    });
  };

  const handleUnmarkWashed = (group) => {
    const ids = group.entries.map(entry => entry.id).filter(Boolean);
    if (!ids.length) return;
    runAction(`unwashed:${group.key}`, async () => {
      await unmarkLaundryWashed(sessionToken, ids, user?.name);
      toastSuccess(t('wash.messages.unmarkedWashed', { client: group.clientName }));
    });
  };

  const handlePack = async (group, trolleyNo, kgValue) => {
    if (!trolleyNo) {
      throw new Error(t('wash.validation.chooseTrolley'));
    }
    // Waga nieznana z przyjazdu → kg jest opcjonalne teraz, można uzupełnić później
    // (np. gdy kierowca zgłosi wagę po dostawie) przez edycję wpisu wózka.
    const kg = Number.isFinite(kgValue) ? kgValue : 0;
    if (group.hasKnownWeight && kg <= 0) {
      throw new Error(t('wash.validation.enterKg'));
    }
    if (group.hasKnownWeight && kg > group.remainingKg + 0.05) {
      throw new Error(t('wash.validation.remainingKg', { weight: group.remainingKg }));
    }
    if (!trolleyNumbers.includes(trolleyNo)) {
      throw new Error(t('wash.validation.chooseRange', { count: trolleyCount }));
    }
    const activeCycle = activeTrolleyByNo.get(trolleyNo.toLowerCase());
    if (activeCycle) {
      throw new Error(t('wash.validation.occupied', { trolley: trolleyNo, client: activeCycle.client_name }));
    }
    if (group.pendingIds.length > 0) {
      throw new Error(t('wash.validation.markWashedFirst'));
    }
    if (!group.washedIds.length) return;

    setBusyKey(`pack:${group.key}`);
    try {
      await packLaundryTrolley(sessionToken, group.washedIds, trolleyNo, kg, user?.name);
      toastSuccess(t('wash.messages.packedToTrolley', { client: group.clientName, weight: kg > 0 ? `${kg} kg` : t('wash.packed'), trolley: trolleyNo }));
      await Promise.all([refetch(), fetchWorkflow()]);
    } finally {
      setBusyKey('');
    }
  };

  const handlePackMulti = async (group, trolleyNos, kgByTrolley) => {
    if (!trolleyNos || trolleyNos.length === 0) {
      throw new Error(t('wash.validation.noTrolleys'));
    }

    // Validate all trolleys first (skip for 'brak' which is a virtual non-trolley option)
    for (const trolleyNo of trolleyNos) {
      if (trolleyNo === 'brak') continue;
      if (!trolleyNumbers.includes(trolleyNo)) {
        throw new Error(t('wash.validation.missingTrolley', { trolley: trolleyNo }));
      }
      const activeCycle = activeTrolleyByNo.get(trolleyNo.toLowerCase());
      if (activeCycle) {
        throw new Error(t('wash.validation.occupiedBy', { trolley: trolleyNo, client: activeCycle.client_name }));
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
        toastSuccess(t('wash.messages.packedLoose', { client: group.clientName }));
      } else {
        toastSuccess(t('wash.messages.packedTrolleys', { client: group.clientName, count: trolleyNos.length }));
      }
      await Promise.all([refetch(), fetchWorkflow()]);
      setPackingGroup(null);
    } catch (err) {
      toastError(err.message || t('wash.messages.packError'));
      // Refetch anyway in case partial packing happened
      await Promise.all([refetch(), fetchWorkflow()]);
    } finally {
      setBusyKey('');
    }
  };

  const handleReturnTrolley = (cycle) => {
    runAction(`return:${cycle.id}`, async () => {
      await returnLaundryTrolley(sessionToken, cycle.id, user?.name);
      toastSuccess(t('wash.messages.trolleyReturned', { trolley: cycle.trolley_no }));
    });
  };

  const handleCancelTrolley = (cycle) => {
    runAction(`cancel:${cycle.id}`, async () => {
      await cancelLaundryTrolley(sessionToken, cycle.id, user?.name);
      toastSuccess(t('wash.messages.packingUndone', { trolley: cycle.trolley_no }));
    });
  };

  const handleUndoReturnTrolley = async (cycle) => {
    try {
      setBusyKey(`undo-return:${cycle.id}`);
      await undoReturnLaundryTrolley(sessionToken, cycle.id);
      await Promise.all([refetch(), fetchWorkflow()]);
    } catch (e) {
      alert(t('wash.messages.genericError', { message: e.message }));
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
      toastSuccess(t('wash.messages.packingUndoneClient', { client: cycle.client_name }));
    });
  };

  // Uzupełnienie kg poznanego po fakcie (np. kierowca zgłosił wagę po dostawie),
  // gdy pakowanie odbyło się bez znanej wagi.
  const handleSaveTrolleyKg = (cycle) => {
    const kg = parseFloat(String(kgEdit[cycle.id] ?? '').replace(',', '.'));
    if (!Number.isFinite(kg) || kg <= 0) {
      toastError(t('wash.validation.invalidWeight'));
      return;
    }
    runAction(`kg:${cycle.id}`, async () => {
      await updateLaundryTrolleyKg(sessionToken, cycle.id, kg, user?.name);
      setKgEdit(prev => { const next = { ...prev }; delete next[cycle.id]; return next; });
      toastSuccess(t('wash.messages.weightSaved', { client: cycle.client_name, weight: kg }));
    });
  };

  const handleDeleteTrolley = async (cycle, force = false) => {
    const isVirtual = !isRealTrolley(cycle);
    const label = isVirtual
      ? t('wash.delete.packageLabel', { client: cycle.client_name })
      : t('wash.delete.trolleyLabel', { trolley: cycle.trolley_no });
    const confirmMsg = force
      ? t('wash.delete.forceConfirm', { label })
      : t('wash.delete.confirm', { label });
    if (!window.confirm(confirmMsg)) return;
    try {
      setBusyKey(`delete:${cycle.id}`);
      const res = await deleteLaundryTrolley(sessionToken, cycle.id, force);
      if (res?.can_force && !force) {
        if (window.confirm(`${res.error}\n\n${t('wash.delete.forceQuestion')}`)) {
          await handleDeleteTrolley(cycle, true);
          return;
        }
      }
      toastSuccess(t('wash.delete.deleted', { label }));
      await Promise.all([refetch(), fetchWorkflow()]);
    } catch (e) {
      if (e.message?.includes('can_force') || e.message?.includes('wymuszonego usunięcia') || e.message?.includes('po wydaniu kierowcy')) {
        if (window.confirm(`${e.message}\n\n${t('wash.delete.forceQuestion')}`)) {
          await handleDeleteTrolley(cycle, true);
          return;
        }
      }
      toastError(t('wash.messages.genericError', { message: e.message }));
    } finally {
      setBusyKey(null);
    }
  };

  const handleClearOldPackages = async () => {
    if (!window.confirm(t('wash.delete.clearPackagesConfirm', { count: packageCycles.length }))) return;
    try {
      setBusyKey('clear-old-packages');
      let deletedCount = 0;
      for (const cycle of packageCycles) {
        try {
          await deleteLaundryTrolley(sessionToken, cycle.id, true);
          deletedCount++;
        } catch {
          // Kontynuuj usuwanie pozostałych wpisów.
        }
      }
      toastSuccess(t('wash.delete.packagesDeleted', { count: deletedCount }));
      await Promise.all([refetch(), fetchWorkflow()]);
    } catch (e) {
      toastError(t('wash.delete.clearError', { message: e.message }));
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
      alert(t('wash.messages.genericError', { message: e.message }));
    } finally {
      setBusyKey(null);
    }
  };

  const renderTrolleyCardItem = (cycle) => {
    const { status, driver, deliveredAt, isIssuedToDriver } = getCycleTransportState(cycle, entryById, t);
    const busyReturn = busyKey === `return:${cycle.id}`;
    const busyCancel = busyKey === `cancel:${cycle.id}`;
    const busyUndoReturn = busyKey === `undo-return:${cycle.id}`;
    const busyDelete = busyKey === `delete:${cycle.id}`;
    const busyAtClient = busyKey === `at-client:${cycle.id}`;
    const busyKg = busyKey === `kg:${cycle.id}`;
    const isNoTrolley = !isRealTrolley(cycle);
    const kgUnknown = !(Number(cycle.total_kg || 0) > 0);
    const isEditingKg = cycle.id in kgEdit;
    const canCancelCycle = hasPackRole && !cycle.returned_at && status.key === 'packed' && !isIssuedToDriver;
    const canUndoPackNoTrolley = hasPackRole && isNoTrolley && status.key === 'packed' && !isIssuedToDriver;
    const canUndoReturn = hasPackRole && status.key === 'returned';
    const canDelete = isAdmin;
    const canReturnTrolley = hasPackRole && !isNoTrolley && !cycle.returned_at && status.key !== 'canceled' && ['picked', 'delivered', 'at_client'].includes(status.key);
    const canSetAtClient = hasPackRole && !cycle.returned_at && status.key === 'delivered';

    return (
      <article key={cycle.id} className={`laundry-trolley-card tone-${status.tone}`}>
        <div className="laundry-trolley-top">
          <div>
              <span>{isNoTrolley ? t('wash.issue') : t('wash.trolley')}</span>
            {isNoTrolley ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                <Package size={18} color="var(--text-secondary)" />
                <strong style={{ fontSize: '18px' }}>{t('wash.withoutTrolley')}</strong>
              </div>
            ) : (
              <strong>{cycle.trolley_no}</strong>
            )}
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
                  {busyKg ? t('wash.actions.savingShort') : t('common.save')}
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setKgEdit(prev => ({ ...prev, [cycle.id]: '' }))}
                style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-tertiary)', fontStyle: 'italic', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
              >
                {t('wash.enterUnknownWeight')}
              </button>
            )
          ) : (
            <strong>{Number(cycle.total_kg || 0).toFixed(1)}</strong>
          )}
          <span>{t('wash.packed')}</span><strong>{fmtDateTime(cycle.packed_at)}</strong>
          {driver && <><span>{t('wash.driver')}</span><strong>{driver}</strong></>}
          {deliveredAt && <><span>{t('wash.delivered')}</span><strong>{fmtDateTime(deliveredAt)}</strong></>}
          {!isNoTrolley && cycle.returned_at && <><span>{t('wash.return')}</span><strong>{fmtDateTime(cycle.returned_at)}</strong></>}
        </div>
        {hasPackRole && (
          <div className="laundry-card-actions">
            {isNoTrolley ? (
              canUndoPackNoTrolley && (
                <button
                  type="button"
                  className="laundry-return-btn is-danger"
                  onClick={() => handleUndoPackNoTrolley(cycle)}
                  disabled={busyCancel}
                >
                  <RotateCcw size={15} />
                  {busyCancel ? t('wash.actions.undoing') : t('wash.actions.undoPack')}
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
                      {busyCancel ? t('wash.actions.undoing') : t('wash.actions.undoPack')}
                  </button>
                )}
                {canReturnTrolley && (
                  <button
                    type="button"
                    className="laundry-return-btn"
                    onClick={() => handleReturnTrolley(cycle)}
                    disabled={busyReturn}
                  >
                    <RotateCcw size={15} />
                      {busyReturn ? t('wash.actions.savingShort') : t('wash.actions.trolleyReturned')}
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
                      {busyAtClient ? t('wash.actions.savingShort') : t('wash.actions.leftAtClient')}
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
                      {busyUndoReturn ? t('wash.actions.undoing') : t('wash.actions.undoReturn')}
                  </button>
                )}
              </>
            )}
            {canDelete && (
              <button
                type="button"
                className="laundry-return-btn is-danger"
                style={{ background: 'rgba(255, 59, 48, 0.08)', color: 'var(--red-600, #dc2626)', border: '1px solid rgba(255, 59, 48, 0.25)' }}
                onClick={() => handleDeleteTrolley(cycle)}
                disabled={busyDelete}
              >
                <Trash2 size={15} />
                {busyDelete ? t('wash.actions.deleting') : t('wash.actions.deleteEntry')}
              </button>
            )}
            {isIssuedToDriver && !canDelete && status.key !== 'returned' && status.key !== 'canceled' && (
              <div style={{ fontSize: '12px', lineHeight: 1.35, color: 'var(--text-tertiary)', fontWeight: 600, padding: '4px 2px' }}>
                {t('wash.issuedHint')}
              </div>
            )}
          </div>
        )}
      </article>
    );
  };

  const renderArrivalReservationCard = (reservation) => (
    <article key={`arrival:${reservation.trolley_no}`} className="laundry-trolley-card tone-partial">
      <div className="laundry-trolley-top">
        <div>
          <span>{t('wash.trolley')}</span>
          <strong>{reservation.trolley_no}</strong>
        </div>
        <span className="laundry-trolley-status tone-partial">{t('wash.fleet.dirtyAtLaundry').toUpperCase()}</span>
      </div>
      <div className="laundry-trolley-client">{reservation.client_name}</div>
      <div className="laundry-trolley-grid">
        <span>{t('wash.location')}</span><strong>{t('wash.laundry')}</strong>
        <span>{t('wash.state')}</span><strong>{t('wash.waitingForWashed')}</strong>
      </div>
      {reservation.occupancy_conflict && (
        <div className="laundry-warning" style={{ marginTop: '10px' }}>
          {t('wash.occupancyConflict')}
        </div>
      )}
    </article>
  );

  const refreshAll = () => Promise.all([refetch(), fetchWorkflow()]);

  if (loading) return <div className="loader">{t('wash.loading')}</div>;
  if (error) return <DataError onRetry={refetch} />;

  return (
    <div className="laundry-shell">
      <div className="laundry-toolbar">
        <div>
          <div className="laundry-kicker">{t('wash.kicker')}</div>
          <h1>{t('wash.title')}</h1>
          <p>{t('wash.subtitle', { date: formatDate(selectedDate) })}</p>
        </div>
        <div className="laundry-toolbar-actions">
          <div className="laundry-date-nav">
            <button type="button" onClick={() => setSelectedDate(addDays(selectedDate, -1))}>‹</button>
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value || operationalYmd())} />
            <button type="button" onClick={() => setSelectedDate(addDays(selectedDate, 1))}>›</button>
          </div>
          <button className="laundry-icon-btn" type="button" onClick={refreshAll} disabled={workflowLoading}>
            <RefreshCw size={16} className={workflowLoading ? 'spin' : ''} />
            {t('common.refresh')}
          </button>
        </div>
      </div>

      {workflowError && (
        <div className="laundry-warning">
          {t('wash.workflowWarning', { message: workflowError })}
        </div>
      )}

      <div className="laundry-metrics">
        <Metric
          icon={WashingMachine}
          label={t('wash.metrics.toWash', { count: filterCounts.pending || 0 })}
          value={`${metrics.pendingKg} kg`}
          tone="pending"
          active={workFilter === 'pending'}
          onClick={() => setWorkFilter(workFilter === 'pending' ? 'all' : 'pending')}
        />
        <Metric
          icon={CheckCircle2}
          label={t('wash.metrics.toPack', { count: filterCounts.washed || 0 })}
          value={`${metrics.washedKg} kg`}
          tone="washed"
          active={workFilter === 'washed'}
          onClick={() => setWorkFilter(workFilter === 'washed' ? 'all' : 'washed')}
        />
        <Metric
          icon={PackageCheck}
          label={t('wash.metrics.ready', { count: filterCounts.ready || 0 })}
          value={`${metrics.readyKg} kg`}
          tone="ready"
          active={workFilter === 'ready'}
          onClick={() => setWorkFilter(workFilter === 'ready' ? 'all' : 'ready')}
        />
        <Metric
          icon={Archive}
          label={t('wash.metrics.occupied', { count: trolleyCount })}
          value={`${metrics.activeTrolleys}/${trolleyCount}`}
          tone="trolley"
          onClick={() => setTrolleysModalOpen(true)}
        />
      </div>

      <section className="laundry-section">
        <div className="laundry-section-head">
          <div>
            <h2>{t('wash.todayLaundry')}</h2>
            <span>{t('wash.watchPoints', { count: filteredLaundryGroups.length })}{workFilter !== 'all' ? ` ${t('wash.ofTotal', { count: laundryGroups.length })}` : ''}</span>
          </div>
          <div className="laundry-filter-tabs" aria-label={t('wash.filterAria')}>
            {WORK_FILTERS.map(filter => (
              <button
                key={filter.key}
                type="button"
                className={workFilter === filter.key ? 'is-active' : ''}
                onClick={() => setWorkFilter(filter.key)}
              >
                <span>{t(filter.labelKey)}</span>
                <strong>{filterCounts[filter.key] || 0}</strong>
              </button>
            ))}
          </div>
        </div>

        <div className="laundry-work-list">
          {filteredLaundryGroups.length === 0 && (
            <div className="laundry-empty">
              {t(laundryGroups.length === 0 ? 'wash.noLaundry' : 'wash.noFilterResults')}
            </div>
          )}

          {filteredLaundryGroups.map(group => {
            const route = routeBadge(group.routeId, routeMap);
            const groupIssuedToDriver = group.issuedToDriver
              || group.allCycles.some(cycle => getCycleTransportState(cycle, entryById, t).isIssuedToDriver);
            const canMarkWashed = hasWashRole && group.pendingIds.length > 0;
            const canUnmarkWashed = hasWashRole && !groupIssuedToDriver && group.entries.some(entry => entry.washed);
            const canPack = hasPackRole && isPackCandidate(group);
            const busyWashed = busyKey === `washed:${group.key}`;
            const busyUnwashed = busyKey === `unwashed:${group.key}`;
            const busyPack = busyKey === `pack:${group.key}`;
            const cycleCorrections = group.cycles.map(getCycleCorrection).filter(Boolean);
            const hasCorrections = canUnmarkWashed || cycleCorrections.length > 0;
            const primaryAction = canMarkWashed
              ? {
                className: 'is-primary',
                Icon: CheckCircle2,
                label: busyWashed ? t('wash.actions.savingShort') : t('wash.actions.washed'),
                onClick: () => handleMarkWashed(group),
                disabled: busyWashed,
              }
              : canPack
                ? {
                  className: 'is-pack',
                  Icon: Package,
                  label: busyPack ? t('wash.actions.opening') : t(group.packedKg > 0 ? 'wash.actions.packMore' : 'wash.actions.pack'),
                  onClick: () => setPackingGroup(group),
                  disabled: busyPack,
                }
                : null;
            const waitingNote = !primaryAction && group.stage === 'ready'
              ? t('wash.actions.ready')
              : !primaryAction && group.pendingIds.length === 0 && group.washedIds.length === 0
                ? t('wash.actions.nothing')
                : null;


            return (
              <article key={group.key} className={`laundry-work-row stage-${group.stage}`}>
                <div className="laundry-work-main">
                  <div className="laundry-client-line">
                    {route && <span className="laundry-route-badge">{route}</span>}
                    <strong>{group.clientName}</strong>
                    <StagePill stage={group.stage} />
                  </div>
                  <div className="laundry-work-meta">
                    <span>{group.hasKnownWeight ? `${group.kg} kg` : t('wash.unknownWeight')}</span>
                    {group.packedKg > 0 && <span>{t('wash.packedAmount', { packed: group.packedKg, total: group.kg })}</span>}
                    {group.packedKg > 0 && group.remainingKg > 0 && <span>{t('wash.remainingAmount', { weight: group.remainingKg })}</span>}
                    {group.washedAt && <span>{t('wash.washedAt', { time: fmtTimeForDay(group.washedAt, selectedDate) })}</span>}
                    {group.packedAt && <span>{t('wash.packedAt', { time: fmtTimeForDay(group.packedAt, selectedDate) })}</span>}
                    {group.trolleyNo && <span>{t('wash.trolleysList', { list: group.trolleyNo })}</span>}
                  </div>
                  
                  {group.hasKnownWeight && (
                    <div className="laundry-progress-track">
                      <div
                        className={`laundry-progress-fill ${group.packedKg + 0.05 >= group.kg ? 'is-complete' : ''}`}
                        style={{ width: `${Math.min(100, Math.max(0, (group.packedKg / group.kg) * 100))}%` }}
                      />
                    </div>
                  )}
                  {group.cycles.length > 0 && (
                    <div className="laundry-cycle-chips">
                      {group.cycles.map(cycle => {
                        return (
                          <span key={cycle.id} className="laundry-cycle-chip">
                            <strong>{t('wash.trolleyNumber', { number: cycle.trolley_no })}</strong>
                            <b>{Number(cycle.total_kg || 0).toFixed(1)} kg</b>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                {!isReadOnly && (
                <div className="laundry-work-actions">
                  {primaryAction ? (
                    <button
                      type="button"
                      className={`laundry-action-btn ${primaryAction.className}`}
                      onClick={primaryAction.onClick}
                      disabled={primaryAction.disabled}
                    >
                      <primaryAction.Icon size={16} />
                      {primaryAction.label}
                    </button>
                  ) : (
                    <div className="laundry-work-state">{waitingNote}</div>
                  )}

                  {hasCorrections && (
                    <details className="laundry-correction-menu">
                      <summary>
                        <MoreHorizontal size={16} />
                        {t('wash.actions.correction')}
                      </summary>
                      <div className="laundry-correction-panel">
                        {canUnmarkWashed && (
                          <button
                            type="button"
                            className="laundry-correction-btn is-danger"
                            onClick={() => handleUnmarkWashed(group)}
                            disabled={busyUnwashed}
                            title={t('wash.actions.undoWashedTitle')}
                          >
                            <RotateCcw size={15} />
                            {busyUnwashed ? t('wash.actions.undoing') : t('wash.actions.undoWashed')}
                          </button>
                        )}
                        {cycleCorrections.map(action => (
                          <button
                            key={action.key}
                            type="button"
                            className="laundry-correction-btn is-danger"
                            onClick={action.onClick}
                            disabled={action.disabled}
                          >
                            <RotateCcw size={15} />
                            {action.label}
                          </button>
                        ))}
                      </div>
                    </details>
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
            <h2>{t('wash.trolleyBoard.title')}</h2>
            <span>{t('wash.trolleyBoard.summary', { free: freeTrolleyCount, occupied: activeTrolleyByNo.size, total: trolleyCount })}</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {trolleyTab === 'packages' && packageCycles.length > 0 && isAdmin && (
              <button
                type="button"
                className="laundry-header-action is-danger"
                onClick={handleClearOldPackages}
                disabled={busyKey === 'clear-old-packages'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255, 59, 48, 0.25)',
                  background: 'rgba(255, 59, 48, 0.08)',
                  color: 'var(--red-600, #dc2626)',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <Trash2 size={13} />
                {busyKey === 'clear-old-packages' ? t('wash.trolleyBoard.clearing') : t('wash.trolleyBoard.clearPackages')}
              </button>
            )}
            <button
              type="button"
              className="laundry-header-action"
              onClick={() => setTrolleysModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <Maximize2 size={13} />
              {t('wash.trolleyBoard.manageFleet', { count: trolleyCount })}
            </button>
          </div>
        </div>

        <div className="segmented-control" style={{ maxWidth: '620px', marginTop: '6px', marginBottom: '14px' }}>
          <button
            type="button"
            className={`seg-btn ${trolleyTab === 'active' ? 'active' : ''}`}
            onClick={() => setTrolleyTab('active')}
          >
            {t('wash.trolleyBoard.tabs.active', { count: activeTrolleyByNo.size })}
          </button>
          <button
            type="button"
            className={`seg-btn ${trolleyTab === 'fleet' ? 'active' : ''}`}
            onClick={() => setTrolleyTab('fleet')}
          >
            {t('wash.trolleyBoard.tabs.fleet', { count: trolleyCount })}
          </button>
          <button
            type="button"
            className={`seg-btn ${trolleyTab === 'packages' ? 'active' : ''}`}
            onClick={() => setTrolleyTab('packages')}
          >
            {t('wash.trolleyBoard.tabs.packages', { count: packageCycles.length })}
          </button>
          <button
            type="button"
            className={`seg-btn ${trolleyTab === 'history' ? 'active' : ''}`}
            onClick={() => setTrolleyTab('history')}
          >
            {t('wash.trolleyBoard.tabs.history', { count: historyTrolleys.length })}
          </button>
        </div>

        {trolleyTab === 'active' && (
          occupiedTrolleys.length === 0 ? (
            <div className="laundry-empty-state apple-glass" style={{
              padding: '36px 20px',
              textAlign: 'center',
              background: 'var(--bg-card)',
              borderRadius: '16px',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px'
            }}>
              <CheckCircle2 size={36} color="var(--accent-green, #34C759)" />
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>
                {t('wash.trolleyBoard.allFreeTitle')}
              </h3>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '420px', lineHeight: 1.4 }}>
                {t('wash.trolleyBoard.allFreeDescription', { count: trolleyCount })}
              </p>
              <button
                type="button"
                className="laundry-return-btn"
                style={{
                  display: 'inline-flex',
                  width: 'auto',
                  marginTop: '8px',
                  padding: '7px 16px',
                  borderRadius: '10px',
                  gap: '6px',
                  alignItems: 'center',
                  fontWeight: 700,
                  fontSize: '13px'
                }}
                onClick={() => setTrolleyTab('fleet')}
              >
                {t('wash.trolleyBoard.showFleet')}
              </button>
            </div>
          ) : (
            <div className="laundry-trolley-board">
              {occupiedTrolleys.map(occupied => (
                occupied.occupancy_source === 'arrival'
                  ? renderArrivalReservationCard(occupied)
                  : renderTrolleyCardItem(occupied)
              ))}
            </div>
          )
        )}

        {trolleyTab === 'fleet' && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
            gap: '10px',
            marginTop: '4px'
          }}>
            {trolleyNumbers.map(tNo => {
              const active = activeTrolleyByNo.get(tNo);
              const isFree = !active;
              const atClient = active?.status === 'at_client';
              const dirtyInLaundry = active?.occupancy_source === 'arrival';
              return (
                <div
                  key={tNo}
                  style={{
                    padding: '12px',
                    borderRadius: '12px',
                    background: isFree ? 'var(--bg-card)' : atClient ? 'rgba(255, 149, 0, 0.08)' : dirtyInLaundry ? 'rgba(175, 82, 222, 0.08)' : 'rgba(0, 122, 255, 0.08)',
                    border: isFree ? '1px solid var(--border)' : atClient ? '1px solid rgba(255, 149, 0, 0.25)' : dirtyInLaundry ? '1px solid rgba(175, 82, 222, 0.25)' : '1px solid rgba(0, 122, 255, 0.25)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <strong style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>#{tNo}</strong>
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: isFree ? 'var(--accent-green, #34C759)' : atClient ? 'var(--accent-orange, #FF9500)' : dirtyInLaundry ? '#AF52DE' : 'var(--accent, #007AFF)'
                    }} />
                  </div>
                  <span style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: isFree ? 'var(--accent-green, #34C759)' : 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {isFree ? t('wash.trolleyBoard.free') : active.client_name}
                  </span>
                  {!isFree && (
                    <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase' }}>
                      {atClient ? t('wash.trolleyBoard.atClient') : dirtyInLaundry ? t('wash.fleet.dirtyAtLaundry') : `${Number(active.total_kg || 0).toFixed(0)} kg`}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {trolleyTab === 'packages' && (
          packageCycles.length === 0 ? (
            <div className="laundry-empty-state" style={{
              padding: '36px 20px',
              textAlign: 'center',
              background: 'var(--bg-card)',
              borderRadius: '16px',
              border: '1px solid var(--border)'
            }}>
              <Package size={32} color="var(--text-tertiary)" style={{ margin: '0 auto 8px' }} />
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>{t('wash.trolleyBoard.noPackages')}</p>
            </div>
          ) : (
            <div className="laundry-trolley-board">
              {packageCycles.map(renderTrolleyCardItem)}
            </div>
          )
        )}

        {trolleyTab === 'history' && (
          historyTrolleys.length === 0 ? (
            <div className="laundry-empty-state" style={{
              padding: '36px 20px',
              textAlign: 'center',
              background: 'var(--bg-card)',
              borderRadius: '16px',
              border: '1px solid var(--border)'
            }}>
              <Archive size={32} color="var(--text-tertiary)" style={{ margin: '0 auto 8px' }} />
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>{t('wash.trolleyBoard.noHistory')}</p>
            </div>
          ) : (
            <div className="laundry-trolley-board">
              {historyTrolleys.map(renderTrolleyCardItem)}
            </div>
          )
        )}
      </section>

      <section className="laundry-flow-note">
        <Truck size={18} />
        <span>{t('wash.flowNote')}</span>
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
        />
      )}
    </div>
  );
}
