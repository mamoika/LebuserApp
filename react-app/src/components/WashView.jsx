import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Archive,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Maximize2,
  MoreHorizontal,
  Package,
  PackageCheck,
  Pencil,
  RefreshCw,
  RotateCcw,
  Scale,
  Truck,
  WashingMachine,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../hooks/useAppData';
import TrolleysDashboardModal from './TrolleysDashboardModal';
import {
  cancelLaundryTrolley,
  finishLaundryPacking,
  getLaundryWorkflow,
  markLaundryWashed,
  packLaundryTrolley,
  undoReturnLaundryTrolley,
  unmarkLaundryWashed,
} from '../lib/laundryRpc';
import { toastError, toastSuccess } from '../lib/toast';
import DataError from './DataError';
import PackingModal from './modals/PackingModal';
import { ViewEditEntryModal } from './modals/EntryModals';
import { currentLocale, operationalYmd } from '../lib/dateUtils';
import { effectiveServiceRules, isEveryWorkdayService } from '../lib/serviceSchedule';
import { activePhysicalTrolleyCycles, buildTrolleyOccupancy } from '../lib/trolleyOccupancy';
import { calculateLaundryDayMetrics, laundryBatchKey } from '../lib/laundryDayPlan';
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
  const str = new Date(`${dateStr}T00:00:00`).toLocaleDateString(currentLocale(), {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  });
  return str.charAt(0).toUpperCase() + str.slice(1);
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

function arrivalDateOf(entry) {
  if (!entry?.arr_day || !entry?.week_key) return null;
  return slotToDate(`${entry.week_key}|${entry.arr_day}`);
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
    && group.washedIds.length > 0;
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

function FlowMetric({ icon: Icon, label, value, subtitle, tone, progress }) {
  return (
    <div className={`laundry-flow-metric tone-${tone}`}>
      <div className="laundry-flow-metric-head">
        <span className="laundry-flow-metric-icon">
          <Icon size={17} aria-hidden="true" />
        </span>
        <span>{label}</span>
      </div>
      <div className="laundry-flow-metric-value">
        <strong className="tabular-nums">{value}</strong>
        <span>kg</span>
      </div>
      <div className="laundry-flow-metric-meta">
        <span>{subtitle}</span>
        {progress !== null && progress !== undefined && (
          <strong className="tabular-nums">{progress}%</strong>
        )}
      </div>
      {progress !== null && progress !== undefined && (
        <div className="laundry-flow-metric-progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
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

function LaundryEntryPicker({ group, onSelect, onClose }) {
  const { t } = useTranslation();

  return (
    <div className="ap-overlay" style={{ display: 'flex' }} onPointerDown={onClose}>
      <section
        className="ap-sheet laundry-entry-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="laundry-entry-picker-title"
        onPointerDown={event => event.stopPropagation()}
      >
        <div className="ap-handle" />
        <div className="ap-content">
          <div className="laundry-entry-picker-head">
            <span className="laundry-entry-picker-icon"><Pencil size={18} aria-hidden="true" /></span>
            <div>
              <span>{t('wash.editEntriesKicker')}</span>
              <h2 id="laundry-entry-picker-title">{group.clientName}</h2>
              <p>{t('wash.editEntriesDescription')}</p>
            </div>
          </div>

          <div className="laundry-entry-picker-list">
            {group.entries.map(entry => (
              <button key={entry.id} type="button" onClick={() => onSelect(entry)}>
                <span className="laundry-entry-type">{entry.type || '—'}</span>
                <span className="laundry-entry-picker-copy">
                  <strong>{entry.weight ? `${entry.weight} kg` : t('wash.unknownWeight')}</strong>
                  <small>
                    {t('entry.arrival')}: {formatDate(arrivalDateOf(entry))}
                    {' · '}
                    {t('entry.pickup')}: {formatDate(departureDateOf(entry))}
                  </small>
                </span>
                <span className="laundry-entry-picker-action">{t('common.edit')}</span>
              </button>
            ))}
          </div>

          <button type="button" className="ap-btn ap-btn-secondary laundry-entry-picker-close" onClick={onClose}>
            {t('common.cancel')}
          </button>
        </div>
      </section>
    </div>
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
  const [historyTrolley, setHistoryTrolley] = useState(null);
  const [trolleyCount, setTrolleyCount] = useState(DEFAULT_TROLLEY_COUNT);
  const [workFilter, setWorkFilter] = useState('all');
  const [entryPickerGroup, setEntryPickerGroup] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);

  const canEditWash = canEditModule('wash');
  const hasWashRole = canEditWash && (isAdmin || user?.role === 'admin_viewer_driver' || isTunnel || isPacker);
  const hasPackRole = canEditWash && (isAdmin || user?.role === 'admin_viewer_driver' || isPacker);
  const isReadOnly = !canEditWash || (isDriver && !isAdmin && user?.role !== 'admin_viewer_driver');
  const canEditEntryDetails = canEditWash && (isAdmin || user?.role === 'admin_viewer_driver');

  const openEntryEditor = (group) => {
    if (group.entries.length === 1) {
      setEditingEntry(group.entries[0]);
      return;
    }
    setEntryPickerGroup(group);
  };

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
      const key = laundryBatchKey({
        clientName: entry.client_name,
        routeId,
        washDate,
        departureDate,
      });
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          clientName: entry.client_name || '—',
          routeId,
          entries: [],
          washDate,
          departureDate,
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
      // O gotowości decydują flagi gotowości/spakowania na wpisach (laundry_ready_at / laundry_packed_at)
      // ustawiane po zakończeniu pakowania („Zakończ pakowanie”).
      const groupReady = ready.length === group.entries.length;
      const stage = groupReady
        ? 'ready'
        : pending.length > 0 && washed.length > 0
          ? 'partial'
          : pending.length > 0
            ? 'pending'
            : packedKg > 0
              ? 'partial'
              : 'washed';
      const packedTrolleyNos = activeCycles
        .filter(isRealTrolley)
        .map(cycle => String(cycle.trolley_no).trim());
      const arrivalTrolleyNos = arrivalReservations
        .filter(reservation => entryIdSet.has(reservation.entry_id) && isRealTrolley(reservation))
        .map(reservation => String(reservation.trolley_no).trim());
      const arrivalEntryIds = new Set(
        arrivalReservations
          .filter(reservation => entryIdSet.has(reservation.entry_id) && isRealTrolley(reservation))
          .map(reservation => reservation.entry_id),
      );
      const hasInTransitLaundry = group.entries.some(entry => (
        arrivalEntryIds.has(entry.id) && !entry.dirty_received_at
      ));
      const trolleyNos = [...new Set([...arrivalTrolleyNos, ...packedTrolleyNos])]
        .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b, 'pl'));

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
        trolleyCount: trolleyNos.length,
        trolleyNo: trolleyNos.join(', '),
        hasArrivalTrolleys: arrivalTrolleyNos.length > 0,
        hasInTransitLaundry,
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
  }, [arrivalReservations, clientByName, dailyServiceByClient, entries, routeMap, scheduleByRoute, selectedDate, trolleys]);

  // Tylko realne fizyczne wózki 1–40 (wykluczamy 'brak' pakowany bez wózka)
  const activeTrolleys = useMemo(
    () => activePhysicalTrolleyCycles(trolleys),
    [trolleys]
  );

  const trolleyNumbers = useMemo(
    () => Array.from({ length: trolleyCount }, (_, index) => String(index + 1)),
    [trolleyCount]
  );

  const activeTrolleyByNo = useMemo(() => {
    const enrichedArrivals = arrivalReservations.map(reservation => {
      const entry = entryById.get(reservation.entry_id);
      return {
        ...reservation,
        dirty_received_at: entry?.dirty_received_at || null,
        picked_up_at: entry?.added_at || null,
        laundry_origin_date: arrivalDateOf(entry) || dateOnly(entry?.dirty_received_at) || dateOnly(entry?.added_at),
        wash_date: entry ? slotToDate(washSlotOf(entry, scheduleByRoute, dailyServiceByClient)) : null,
        departure_date: entry ? departureDateOf(entry) : null,
      };
    });
    return buildTrolleyOccupancy(activeTrolleys, enrichedArrivals);
  }, [activeTrolleys, arrivalReservations, dailyServiceByClient, entryById, scheduleByRoute]);

  const freeTrolleyCount = Math.max(0, trolleyCount - activeTrolleyByNo.size);

  const metrics = useMemo(() => ({
    ...calculateLaundryDayMetrics(
      entries,
      selectedDate,
      entry => slotToDate(washSlotOf(entry, scheduleByRoute, dailyServiceByClient)),
      departureDateOf,
    ),
    activeTrolleys: activeTrolleyByNo.size,
  }), [activeTrolleyByNo.size, dailyServiceByClient, entries, scheduleByRoute, selectedDate]);

  const packedKg = useMemo(
    () => Number(laundryGroups.reduce((sum, group) => sum + group.packedKg, 0).toFixed(1)),
    [laundryGroups],
  );
  const washedProgress = metrics.plannedKg > 0
    ? Math.min(100, Math.round((metrics.washedKg / metrics.plannedKg) * 100))
    : 0;
  const packedProgress = metrics.plannedKg > 0
    ? Math.min(100, Math.round((packedKg / metrics.plannedKg) * 100))
    : 0;

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
      toastError(err.code === 'laundry_not_at_laundry'
        ? t('wash.messages.laundryStillInVehicle')
        : err.message || t('wash.operationFailed'));
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

  const handlePackMulti = async (group, trolleyNos, kgByTrolley, finish = true) => {
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

    // Waga znana z przyjazdu:
    // - Jeśli finish = true (Zakończ pakowanie), brakującą wagę dzielimy na wybrane wózki
    // - Jeśli finish = false (Kontynuuj pakowanie), użytkownik może podać kg lub używamy proporcji
    let kgFor;
    if (group.hasKnownWeight) {
      const perTrolleyDefault = finish
        ? Math.floor((group.remainingKg / trolleyNos.length) * 10) / 10
        : Math.min(Math.floor((group.remainingKg / trolleyNos.length) * 10) / 10, 80);
      const totalBase = perTrolleyDefault * (trolleyNos.length - 1);
      const lastKgDefault = finish
        ? Math.round((group.remainingKg - totalBase) * 10) / 10
        : perTrolleyDefault;

      kgFor = (i) => {
        const custom = parseFloat(String(kgByTrolley?.[trolleyNos[i]] ?? '').replace(',', '.'));
        if (Number.isFinite(custom) && custom > 0) return custom;
        return (i === trolleyNos.length - 1) ? lastKgDefault : perTrolleyDefault;
      };
    } else {
      kgFor = (i) => {
        const kg = parseFloat(String(kgByTrolley?.[trolleyNos[i]] ?? '').replace(',', '.'));
        return Number.isFinite(kg) && kg > 0 ? kg : 0;
      };
    }

    try {
      setBusyKey(`pack:${group.key}`);
      for (let i = 0; i < trolleyNos.length; i++) {
        const kgValue = kgFor(i);
        const isLast = i === trolleyNos.length - 1;
        await packLaundryTrolley(
          sessionToken,
          group.washedIds,
          trolleyNos[i],
          kgValue,
          user?.name,
          isLast ? finish : false,
        );
      }
      if (finish) {
        toastSuccess(t('wash.messages.packingFinished', { client: group.clientName }));
      } else {
        toastSuccess(t('wash.messages.packingSavedInProgress', { client: group.clientName, count: trolleyNos.length }));
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

  const handleFinishPacking = async (group) => {
    setBusyKey(`pack:${group.key}`);
    try {
      const entryIds = group.entries?.map(e => e.id) || group.washedIds || [];
      await finishLaundryPacking(sessionToken, entryIds, user?.name);
      toastSuccess(t('wash.messages.packingFinished', { client: group.clientName }));
      await Promise.all([refetch(), fetchWorkflow()]);
      setPackingGroup(null);
    } catch (err) {
      toastError(err.message || t('wash.messages.packError'));
    } finally {
      setBusyKey('');
    }
  };

  const handleCancelTrolley = (cycle) => {
    runAction(`cancel:${cycle.id}`, async () => {
      await cancelLaundryTrolley(sessionToken, cycle.id, user?.name);
      toastSuccess(t('wash.messages.packingUndone', { trolley: cycle.trolley_no }));
    });
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

  const refreshAll = () => Promise.all([refetch(), fetchWorkflow()]);

  if (loading) return <div className="loader">{t('wash.loading')}</div>;
  if (error) return <DataError onRetry={refetch} />;

  return (
    <div className="laundry-shell">
      <div className="laundry-toolbar">
        <div className="laundry-title-group">
          <div className="laundry-kicker">{t('wash.kicker')}</div>
          <h1>{t('wash.title')}</h1>
          <p>{t('wash.subtitle', { date: formatDate(selectedDate) })}</p>
        </div>
        <div className="laundry-toolbar-actions">
          <div className="laundry-date-nav apple-date-nav">
            <button
              type="button"
              className="laundry-date-nav-btn"
              onClick={() => setSelectedDate(addDays(selectedDate, -1))}
              title={t('wash.date.previous')}
              aria-label={t('wash.date.previous')}
            >
              <ChevronLeft size={16} />
            </button>
            <label className="laundry-date-picker-label" title={t('wash.date.choose')}>
              <Calendar size={14} className="laundry-date-icon" />
              <span className="laundry-date-text">{formatDate(selectedDate)}</span>
              <input
                type="date"
                className="laundry-date-input"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value || operationalYmd())}
              />
            </label>
            <button
              type="button"
              className="laundry-date-nav-btn"
              onClick={() => setSelectedDate(addDays(selectedDate, 1))}
              title={t('wash.date.next')}
              aria-label={t('wash.date.next')}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          {selectedDate !== operationalYmd() && (
            <button
              type="button"
              className="laundry-today-btn"
              onClick={() => setSelectedDate(operationalYmd())}
            >
              {t('common.today')}
            </button>
          )}
          <button className="laundry-refresh-btn" type="button" onClick={refreshAll} disabled={workflowLoading}>
            <RefreshCw size={15} className={workflowLoading ? 'spin' : ''} />
            <span>{t('common.refresh')}</span>
          </button>
        </div>
      </div>

      {workflowError && (
        <div className="laundry-warning">
          {t('wash.workflowWarning', { message: workflowError })}
        </div>
      )}

      <section className="laundry-section">
        <div className="laundry-section-head">
          <div>
            <h2>{t('wash.dayPlan', { date: formatDate(selectedDate) })}</h2>
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
            const canMarkWashed = hasWashRole && group.pendingIds.length > 0 && !group.hasInTransitLaundry;
            const canUnmarkWashed = hasWashRole && !groupIssuedToDriver && group.entries.some(entry => entry.washed);
            const canPack = hasPackRole && !group.hasInTransitLaundry && isPackCandidate(group);
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
            const waitingNote = group.hasInTransitLaundry
              ? t('wash.actions.waitingForUnload')
              : !primaryAction && group.stage === 'ready'
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
                    <span className="laundry-meta-chip is-weight">
                      <Scale size={12} />
                      <strong className="tabular-nums">{group.hasKnownWeight ? `${group.kg} kg` : t('wash.unknownWeight')}</strong>
                    </span>
                    {group.trolleyCount > 0 && (
                      <span className="laundry-meta-chip is-trolleys">
                        <Archive size={12} />
                        <strong className="tabular-nums">
                          {t('wash.trolleysAssigned', { count: group.trolleyCount, list: group.trolleyNo })}
                        </strong>
                      </span>
                    )}
                    {group.hasArrivalTrolleys && (
                      <span className={`laundry-meta-chip ${group.hasInTransitLaundry ? 'is-in-vehicle' : 'is-at-laundry'}`}>
                        {group.hasInTransitLaundry ? <Truck size={12} /> : <WashingMachine size={12} />}
                        <strong>
                          {t(group.hasInTransitLaundry ? 'wash.locationStatus.inVehicle' : 'wash.locationStatus.atLaundry')}
                        </strong>
                      </span>
                    )}
                    {group.washDate && (
                      <span className="laundry-meta-chip is-wash-date">
                        <Calendar size={12} />
                        <span>{t('wash.plannedWashDate', { date: formatDate(group.washDate) })}</span>
                      </span>
                    )}
                    {group.departureDate && (
                      <span className="laundry-meta-chip is-departure-date">
                        <Truck size={12} />
                        <span>{t('wash.plannedDepartureDate', { date: formatDate(group.departureDate) })}</span>
                      </span>
                    )}
                    {group.packedKg > 0 && (
                      <span className="laundry-meta-chip is-packed">
                        <Package size={12} />
                        <span className="tabular-nums">{t('wash.packedAmount', { packed: group.packedKg, total: group.kg })}</span>
                      </span>
                    )}
                    {group.packedKg > 0 && group.remainingKg > 0 && (
                      <span className="laundry-meta-chip is-remaining">
                        <span className="tabular-nums">{t('wash.remainingAmount', { weight: group.remainingKg })}</span>
                      </span>
                    )}
                    {group.washedAt && <span className="laundry-meta-chip">{t('wash.washedAt', { time: fmtTimeForDay(group.washedAt, selectedDate) })}</span>}
                    {group.packedAt && <span className="laundry-meta-chip">{t('wash.packedAt', { time: fmtTimeForDay(group.packedAt, selectedDate) })}</span>}
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
                      {group.cycles.map(cycle => (
                        <span
                          key={cycle.id}
                          className="laundry-cycle-chip"
                          role={cycle.trolley_no !== 'brak' ? 'button' : undefined}
                          tabIndex={cycle.trolley_no !== 'brak' ? 0 : undefined}
                          onClick={() => {
                            if (cycle.trolley_no !== 'brak') {
                              setHistoryTrolley(String(cycle.trolley_no));
                              setTrolleysModalOpen(true);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (cycle.trolley_no !== 'brak' && (e.key === 'Enter' || e.key === ' ')) {
                              e.preventDefault();
                              setHistoryTrolley(String(cycle.trolley_no));
                              setTrolleysModalOpen(true);
                            }
                          }}
                          style={{ cursor: cycle.trolley_no !== 'brak' ? 'pointer' : 'default' }}
                          title={cycle.trolley_no !== 'brak' ? t('wash.fleet.openHistory') : undefined}
                        >
                          <strong>{t('wash.trolleyNumber', { number: cycle.trolley_no })}</strong>
                          <b className="tabular-nums">{Number(cycle.total_kg || 0).toFixed(1)} kg</b>
                        </span>
                      ))}
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
                      <span>{primaryAction.label}</span>
                    </button>
                  ) : (
                    <div className={`laundry-work-state ${group.hasInTransitLaundry ? 'is-blocked' : ''}`}>
                      {group.hasInTransitLaundry ? <Truck size={15} /> : group.stage === 'ready' && <CheckCircle2 size={15} />}
                      <span>{waitingNote}</span>
                    </div>
                  )}

                  {canEditEntryDetails && (
                    <button
                      type="button"
                      className="laundry-edit-details-btn"
                      onClick={() => openEntryEditor(group)}
                    >
                      <Pencil size={14} aria-hidden="true" />
                      <span>{t('wash.actions.editDetails')}</span>
                      {group.entries.length > 1 && (
                        <strong className="tabular-nums">{group.entries.length}</strong>
                      )}
                    </button>
                  )}

                  {hasCorrections && (
                    <details className="laundry-correction-menu">
                      <summary title={t('wash.actions.correction')} aria-label={t('wash.actions.correction')}>
                        <MoreHorizontal size={16} />
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
                            <span>{busyUnwashed ? t('wash.actions.undoing') : t('wash.actions.undoWashed')}</span>
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
                            <span>{action.label}</span>
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

      <section className="laundry-section" aria-label={t('wash.operationsPlan')}>
        <div className="laundry-section-head">
          <div>
            <h2>{t('wash.operationsPlan')}</h2>
            <span>{t('wash.operationsSubtitle')}</span>
          </div>
        </div>

        <div className="laundry-operations-overview" aria-label={t('wash.operationsPlan')}>
          <div className="laundry-flow-metrics">
            <FlowMetric
              icon={WashingMachine}
              label={t('wash.flowOverview.planned')}
              value={metrics.plannedKg}
              tone="planned"
              subtitle={t('wash.flowOverview.plannedHint')}
            />
            <FlowMetric
              icon={CheckCircle2}
              label={t('wash.flowOverview.washed')}
              value={metrics.washedKg}
              tone="washed"
              progress={washedProgress}
              subtitle={t('wash.flowOverview.washedHint')}
            />
            <FlowMetric
              icon={PackageCheck}
              label={t('wash.flowOverview.packed')}
              value={packedKg}
              tone="packed"
              progress={packedProgress}
              subtitle={t('wash.flowOverview.packedHint')}
            />
            <FlowMetric
              icon={Truck}
              label={t('wash.flowOverview.departure')}
              value={metrics.departureKg}
              tone="departure"
              subtitle={t('wash.flowOverview.departureHint')}
            />
          </div>

          <button
            type="button"
            className="laundry-fleet-summary"
            onClick={() => setTrolleysModalOpen(true)}
          >
            <span className="laundry-fleet-summary-icon"><Archive size={19} aria-hidden="true" /></span>
            <span className="laundry-fleet-summary-copy">
              <strong>{t('wash.flowOverview.fleetTitle')}</strong>
              <span>{t('wash.flowOverview.fleetOccupied', { count: metrics.activeTrolleys, total: trolleyCount })}</span>
            </span>
            <strong className="laundry-fleet-summary-free tabular-nums">
              {t('wash.flowOverview.fleetFree', { count: freeTrolleyCount })}
            </strong>
            <Maximize2 size={16} aria-hidden="true" />
          </button>
        </div>
      </section>

      {packingGroup && (
        <PackingModal
          group={laundryGroups.find(g => g.key === packingGroup.key) || packingGroup}
          onClose={() => setPackingGroup(null)}
          onPack={handlePack}
          onPackMulti={handlePackMulti}
          onFinishPacking={handleFinishPacking}
          sessionToken={sessionToken}
          trolleyNumbers={trolleyNumbers}
          activeTrolleyByNo={activeTrolleyByNo}
        />
      )}

      {entryPickerGroup && (
        <LaundryEntryPicker
          group={entryPickerGroup}
          onClose={() => setEntryPickerGroup(null)}
          onSelect={entry => {
            setEntryPickerGroup(null);
            setEditingEntry(entry);
          }}
        />
      )}

      {editingEntry && (
        <ViewEditEntryModal
          isOpen
          entry={editingEntry}
          clients={clients}
          routes={routes}
          contextMode="arr"
          initiallyEditing
          source="wash"
          permissionModule="wash"
          allowDeleteInEditor
          onClose={() => setEditingEntry(null)}
          onUpdated={refreshAll}
          onDeleted={refreshAll}
        />
      )}
      
      {trolleysModalOpen && (
        <TrolleysDashboardModal
          onClose={() => {
            setTrolleysModalOpen(false);
            setHistoryTrolley(null);
          }}
          sessionToken={sessionToken}
          trolleyCount={trolleyCount}
          activeTrolleyByNo={activeTrolleyByNo}
          clients={clients}
          initialTrolley={historyTrolley}
          canForceReset={isAdmin}
          actorName={user?.name}
          onRefresh={refreshAll}
        />
      )}
    </div>
  );
}
