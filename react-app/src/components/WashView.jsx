import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
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
  Plus,
  RefreshCw,
  RotateCcw,
  Scale,
  Truck,
  WashingMachine,
} from 'lucide-react';
import { useLaundryWorkflow } from '../hooks/useLaundryWorkflow';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../hooks/useAppData';
import TrolleysDashboardModal from './TrolleysDashboardModal';
import {
  cancelLaundryTrolley,
  finishLaundryPacking,
  markLaundryWashed,
  saveLaundryTrolleys,
  undoReturnLaundryTrolley,
  unmarkLaundryWashed,
} from '../lib/laundryRpc';
import { toastError, toastSuccess } from '../lib/toast';
import DataError from './DataError';
import LaundryHistoryView from './LaundryHistoryView';
import PackingModal from './modals/PackingModal';
import { AddEntryModal, ViewEditEntryModal } from './modals/EntryModals';
import { currentLocale, operationalYmd } from '../lib/dateUtils';
import { effectiveServiceRules, isEveryWorkdayService } from '../lib/serviceSchedule';
import { activePhysicalTrolleyCycles, buildTrolleyOccupancy, canUseFreeTrolley } from '../lib/trolleyOccupancy';
import { formatTrolleyCode } from '../lib/trolleyCodes';
import { calculateLaundryDayMetrics, isLaundryWashed, isReadyForDriver, laundryBatchKey } from '../lib/laundryDayPlan';
import { arrivalDateOf, departureDateOf, plannedWashDateOf } from '../lib/laundryWashDates';
const EMPTY_WORKFLOW_ROWS = [];
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

function dateToWeekSlot(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  const day = ((date.getDay() + 6) % 7) + 1;
  const monday = new Date(date);
  monday.setDate(date.getDate() - (day - 1));
  return { day, weekKey: ymd(monday) };
}

function stageConfig(stage, t) {
  const map = {
    pending: { label: t('wash.stages.pending'), tone: 'pending', Icon: Clock3 },
    partial: { label: t('wash.stages.partial'), tone: 'partial', Icon: WashingMachine },
    packing: { label: t('wash.stages.packing'), tone: 'partial', Icon: Package },
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

function isEntryCollectedByDriver(entry) {
  return Boolean(
    entry?.picked_at
    || entry?.delivered_at
    || entry?.delivered
    || entry?.done
    || ['released', 'at_client', 'returned'].includes(entry?.laundry_status)
  );
}

const isRealTrolley = (cycle) => Boolean(cycle?.trolley_no && String(cycle.trolley_no).trim().toLowerCase() !== 'brak');

const getTrolleyStatus = (cycle, entryById, t) => {
  if (cycle.status === 'canceled') return { key: 'canceled', label: t('wash.statuses.canceled'), tone: 'neutral' };

  const linked = (cycle.entry_ids || []).map(id => entryById.get(id)).filter(Boolean);
  const delivered = cycle.is_delivered ?? Boolean(
    linked.length > 0 && linked.length === (cycle.entry_ids || []).length
    && linked.every(entry => entry.delivered ?? Boolean(entry.delivered_at)),
  );
  const picked = Boolean(cycle.is_issued_to_driver || linked.some(e => e.picked_at));

  // "Bez wózka" (paczka / worek)
  if (!isRealTrolley(cycle)) {
    if (delivered) {
      return { key: 'delivered', label: t('wash.statuses.deliveredLoose'), tone: 'delivered' };
    }
    if (picked) return { key: 'picked', label: t('wash.statuses.picked'), tone: 'picked' };
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
      <Icon size={14} aria-hidden="true" />
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
  const { sessionToken, user, isAdmin, isTunnel, isPacker, isDriver, canEditModule, canViewModule } = useAuth();
  const [searchParams] = useSearchParams();
  const canViewHistory = canViewModule('history');
  const showingHistory = canViewHistory && searchParams.get('view') === 'history';
  const { entries, routes, clients, loading, error, refetch } = useAppData();
  const [selectedDate, setSelectedDate] = useState(() => operationalYmd());
  const { data: workflow, error: workflowError, loading: workflowLoading, refresh: fetchWorkflow } = useLaundryWorkflow(sessionToken, !showingHistory);
  const trolleys = workflow?.trolleys || EMPTY_WORKFLOW_ROWS;
  const arrivalReservations = workflow?.arrival_reservations || EMPTY_WORKFLOW_ROWS;
  const trolleyCount = Math.max(1, Math.min(99, Number(workflow?.trolley_count) || DEFAULT_TROLLEY_COUNT));
  const trolleyInventory = workflow?.trolley_inventory;
  const [busyKey, setBusyKey] = useState('');
  const [packingGroup, setPackingGroup] = useState(null);
  const [addingEmptyTrolleys, setAddingEmptyTrolleys] = useState(false);
  const [trolleysModalOpen, setTrolleysModalOpen] = useState(false);
  const [historyTrolley, setHistoryTrolley] = useState(null);
  const [workFilter, setWorkFilter] = useState('all');
  const [entryPickerGroup, setEntryPickerGroup] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);
  const [manualPlanOpen, setManualPlanOpen] = useState(false);
  const manualPlanSlot = useMemo(() => dateToWeekSlot(selectedDate), [selectedDate]);
  const canAddOnSelectedDate = manualPlanSlot.day <= 6;

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
      const washDate = plannedWashDateOf(entry, scheduleByRoute, dailyServiceByClient);
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
      const pending = group.entries.filter(entry => !isLaundryWashed(entry));
      const washed = group.entries.filter(isLaundryWashed);
      const ready = group.entries.filter(isReadyForDriver);
      const entryIds = group.entries.map(entry => entry.id);
      const entryIdSet = new Set(entryIds);
      const groupCycles = trolleys.filter(cycle => (
        cycle.client_name === group.clientName
        && (cycle.entry_ids || []).some(id => entryIdSet.has(id))
      ));
      const activeCycles = groupCycles.filter(cycle => cycle.status !== 'canceled' && (!cycle.returned_at || cycle.trolley_no === 'brak'));
      const packedKg = ready.reduce((sum, entry) => sum + (parseFloat(entry.weight) || 0), 0);
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
            : activeCycles.length > 0 || ready.length > 0
              ? 'packing'
              : 'washed';
      const packedTrolleyNos = activeCycles
        .filter(isRealTrolley)
        .map(cycle => String(cycle.trolley_no).trim());
      const arrivalTrolleyNos = arrivalReservations
        .filter(reservation => entryIdSet.has(reservation.entry_id) && isRealTrolley(reservation))
        .map(reservation => String(reservation.trolley_no).trim());
      const arrivalEntryIds = new Set(
        arrivalReservations
          .filter(reservation => entryIdSet.has(reservation.entry_id) && isRealTrolley(reservation) && !reservation.dirty_received_at)
          .map(reservation => reservation.entry_id),
      );
      const hasInTransitLaundry = group.entries.some(entry => (
        arrivalEntryIds.has(entry.id) && !entry.dirty_received_at
      ));
      const packedTrolleySet = new Set(packedTrolleyNos);
      const arrivalOnlyTrolleyNos = [...new Set(arrivalTrolleyNos)].filter(no => !packedTrolleySet.has(no))
        .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b, 'pl'));

      return {
        ...group,
        kg: Number(totalKg.toFixed(1)),
        hasKnownWeight,
        packedKg: Number(Math.min(totalKg, packedKg).toFixed(1)),
        stage,
        pendingIds: pending.map(entry => entry.id),
        washedIds: washed.filter(entry => !isReadyForDriver(entry)).map(entry => entry.id),
        readyIds: groupReady ? entryIds : ready.map(entry => entry.id),
        cycles: activeCycles,
        allCycles: groupCycles,
        issuedToDriver: group.entries.some(isEntryCollectedByDriver),
        trolleyCount: packedTrolleySet.size + arrivalOnlyTrolleyNos.length,
        arrivalOnlyTrolleyNos,
        hasArrivalTrolleys: arrivalTrolleyNos.length > 0,
        hasInTransitLaundry,
        washedAt: group.entries.map(entry => entry.washed_at).filter(Boolean).sort().at(-1),
        packedAt: groupReady
          ? group.entries.map(entry => entry.laundry_packed_at || entry.laundry_ready_at).filter(Boolean).sort().at(-1)
          : null,
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
      const receivedAt = reservation.dirty_received_at || entry?.dirty_received_at || null;
      return {
        ...reservation,
        dirty_received_at: receivedAt,
        picked_up_at: entry?.added_at || null,
        laundry_origin_date: arrivalDateOf(entry) || dateOnly(receivedAt) || dateOnly(entry?.added_at),
        wash_date: entry ? plannedWashDateOf(entry, scheduleByRoute, dailyServiceByClient) : null,
        departure_date: entry ? departureDateOf(entry) : null,
      };
    });
    return buildTrolleyOccupancy(activeTrolleys, enrichedArrivals);
  }, [activeTrolleys, arrivalReservations, dailyServiceByClient, entryById, scheduleByRoute]);

  const freeTrolleyCount = trolleyNumbers.filter(no => canUseFreeTrolley(no, activeTrolleyByNo.get(no), trolleyInventory)).length;

  const metrics = useMemo(() => ({
    ...calculateLaundryDayMetrics(
      entries,
      selectedDate,
      entry => plannedWashDateOf(entry, scheduleByRoute, dailyServiceByClient),
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

  const handlePackMulti = async (group, trolleyNos, finish) => {
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
      if (!canUseFreeTrolley(trolleyNo, activeCycle, trolleyInventory)) {
        throw new Error(t('wash.fleet.inventory.unavailable', { trolley: formatTrolleyCode(trolleyNo) }));
      }
    }

    try {
      setBusyKey(`pack:${group.key}`);
      await saveLaundryTrolleys(sessionToken, addingEmptyTrolleys ? group.readyIds : group.washedIds, trolleyNos, finish, addingEmptyTrolleys);
      if (addingEmptyTrolleys) {
        toastSuccess(t('wash.messages.emptyTrolleysAdded', { client: group.clientName }));
      } else if (finish) {
        toastSuccess(t('wash.messages.packingFinished', { client: group.clientName }));
      } else {
        toastSuccess(t('wash.messages.packingSavedInProgress', { client: group.clientName, count: trolleyNos.length }));
      }
      await Promise.all([refetch(), fetchWorkflow()]);
      setPackingGroup(null);
    } catch (err) {
      await Promise.all([refetch(), fetchWorkflow()]);
      throw err;
    } finally {
      setBusyKey('');
    }
  };

  const handleFinishPacking = async (group) => {
    setBusyKey(`pack:${group.key}`);
    try {
      const entryIds = group.washedIds;
      await finishLaundryPacking(sessionToken, entryIds, user?.name);
      toastSuccess(t('wash.messages.packingFinished', { client: group.clientName }));
      await Promise.all([refetch(), fetchWorkflow()]);
      setPackingGroup(null);
    } catch (err) {
      await Promise.all([refetch(), fetchWorkflow()]);
      throw err;
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

  const toolbar = (
      <div className="laundry-toolbar">
        <div className="laundry-title-group">
          <h1>{t('wash.kicker')}</h1>
          {canViewHistory && (
            <nav className="laundry-view-nav" aria-label={t('wash.viewSelector')}>
              <Link to="." aria-current={!showingHistory ? 'page' : undefined}>{t('wash.title')}</Link>
              <Link to="?view=history" aria-current={showingHistory ? 'page' : undefined}>{t('wash.history.title')}</Link>
            </nav>
          )}
        </div>
        {!showingHistory && <div className="laundry-toolbar-actions">
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
                aria-label={t('wash.date.choose')}
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
          {isAdmin && (
            <button
              type="button"
              className="laundry-add-plan-btn"
              onClick={() => setManualPlanOpen(true)}
              disabled={!canAddOnSelectedDate}
              title={!canAddOnSelectedDate ? t('wash.manualPlan.sundayUnavailable') : undefined}
            >
              <Plus size={15} aria-hidden="true" />
              <span>{t('wash.manualPlan.open')}</span>
            </button>
          )}
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
        </div>}
      </div>
  );

  if (showingHistory) {
    return (
      <div className="laundry-shell">
        {toolbar}
        <LaundryHistoryView
          key={sessionToken}
          sessionToken={sessionToken}
          initialFrom={addDays(selectedDate, -13)}
          initialTo={selectedDate}
          scheduleByRoute={scheduleByRoute}
          dailyServiceByClient={dailyServiceByClient}
        />
      </div>
    );
  }

  return (
    <div className="laundry-shell">
      {toolbar}
      {workflowError && (
        <div className="laundry-warning">
          {t('wash.workflowWarning', { message: workflowError.message || t('wash.loadWorkflowError') })}
        </div>
      )}

      <section className="laundry-section" aria-labelledby="laundry-plan-title">
        <h2 className="sr-only" id="laundry-plan-title">{t('wash.title')}</h2>
        <div className="laundry-section-head">
          <span className="laundry-batch-count tabular-nums">{t('wash.batchCount', { count: filteredLaundryGroups.length })}</span>
          <div className="laundry-filter-tabs" aria-label={t('wash.filterAria')}>
            {WORK_FILTERS.map(filter => (
              <button
                key={filter.key}
                type="button"
                className={workFilter === filter.key ? 'is-active' : ''}
                aria-pressed={workFilter === filter.key}
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
              || group.allCycles.some(cycle => isRealTrolley(cycle) && (cycle.status === 'released' || getCycleTransportState(cycle, entryById, t).isIssuedToDriver));
            const canMarkWashed = hasWashRole && group.pendingIds.length > 0 && !group.hasInTransitLaundry;
            const canUnmarkWashed = hasWashRole && !groupIssuedToDriver && group.readyIds.length === 0 && group.entries.some(entry => entry.washed);
            const canPack = hasPackRole && !group.hasInTransitLaundry && isPackCandidate(group);
            const canAddEmptyTrolleys = hasPackRole && group.stage === 'ready' && !groupIssuedToDriver && !group.hasInTransitLaundry;
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
                  label: busyPack ? t('wash.actions.opening') : t(group.cycles.length > 0 ? 'wash.actions.packMore' : 'wash.actions.pack'),
                  onClick: () => { setAddingEmptyTrolleys(false); setPackingGroup(group); },
                  disabled: busyPack,
                }
                : null;
            return (
              <article key={group.key} className={`laundry-work-row stage-${group.stage}`}>
                <div className="laundry-work-main">
                  <div className="laundry-client-line">
                    {route && <span className="laundry-route-badge">{route}</span>}
                    <h3>{group.clientName}</h3>
                    <span className="laundry-batch-weight tabular-nums">
                      <Scale size={13} aria-hidden="true" />
                      {group.hasKnownWeight ? t('wash.weightKg', { weight: group.kg.toLocaleString(currentLocale()) }) : t('wash.unknownWeight')}
                    </span>
                    <StagePill stage={group.stage} />
                  </div>
                  <div className="laundry-work-meta">
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
                    {group.washedAt && <span className="laundry-meta-chip">{t('wash.washedAt', { time: fmtTimeForDay(group.washedAt, selectedDate) })}</span>}
                    {group.packedAt && <span className="laundry-meta-chip">{t('wash.packedAt', { time: fmtTimeForDay(group.packedAt, selectedDate) })}</span>}
                  </div>
                  
                  {group.packedKg > 0 && group.packedKg < group.kg && (
                    <div className="laundry-progress-track">
                      <div
                        className="laundry-progress-fill"
                        style={{ width: `${Math.min(100, Math.max(0, (group.packedKg / group.kg) * 100))}%` }}
                      />
                    </div>
                  )}
                  {(group.trolleyCount > 0 || group.cycles.length > 0) && (
                    <div className="laundry-cycle-chips">
                      {group.arrivalOnlyTrolleyNos.map(trolleyNo => (
                        <span className="laundry-cycle-chip is-static tabular-nums" key={trolleyNo}>
                          {t('wash.trolleyNumber', { number: trolleyNo })}
                        </span>
                      ))}
                      {group.cycles.map(cycle => (
                        isRealTrolley(cycle) ? <button
                          key={cycle.id}
                          type="button"
                          className="laundry-cycle-chip tabular-nums"
                          onClick={() => {
                            setHistoryTrolley(String(cycle.trolley_no));
                            setTrolleysModalOpen(true);
                          }}
                          title={t('wash.fleet.openHistory')}
                        >
                          {t('wash.trolleyNumber', { number: cycle.trolley_no })}
                        </button> : (
                          <span className="laundry-cycle-chip is-static" key={cycle.id}>{t('wash.packing.loose')}</span>
                        )
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
                  ) : group.hasInTransitLaundry && (
                    <div className="laundry-work-state is-blocked">
                      <Truck size={15} aria-hidden="true" />
                      <span>{t('wash.actions.waitingForUnload')}</span>
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

                  {(hasCorrections || canAddEmptyTrolleys) && (
                    <details className="laundry-correction-menu">
                      <summary title={t('wash.actions.more')} aria-label={t('wash.actions.more')}>
                        <MoreHorizontal size={16} />
                      </summary>
                      <div className="laundry-correction-panel">
                        {canAddEmptyTrolleys && (
                          <button
                            type="button"
                            className="laundry-correction-btn"
                            onClick={() => { setAddingEmptyTrolleys(true); setPackingGroup(group); }}
                            disabled={busyPack}
                          >
                            <Plus size={15} aria-hidden="true" />
                            <span>{t('wash.actions.addEmptyTrolleys')}</span>
                          </button>
                        )}
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
              <span>{trolleyInventory && !trolleyInventory.completed_at
                ? t('wash.fleet.inventory.progress', { checked: Object.keys(trolleyInventory.checks).length, total: trolleyInventory.trolley_nos.length })
                : t('wash.flowOverview.fleetOccupied', { count: metrics.activeTrolleys, total: trolleyCount })}</span>
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
          addingEmptyTrolleys={addingEmptyTrolleys}
          onPackMulti={handlePackMulti}
          onFinishPacking={handleFinishPacking}
          workflowAvailable={Boolean(workflow) && !workflowError}
          workflowError={workflowError}
          onRefreshAvailability={fetchWorkflow}
          sessionToken={sessionToken}
          trolleyNumbers={trolleyNumbers}
          trolleyInventory={trolleyInventory}
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

      {manualPlanOpen && (
        <AddEntryModal
          isOpen
          defaultArrDay={manualPlanSlot.day}
          weekKey={manualPlanSlot.weekKey}
          laundryPlannedDate={selectedDate}
          clients={clients.filter(client => client.route_id && !client.archived_at)}
          routes={routes}
          onAdded={refreshAll}
          onClose={() => setManualPlanOpen(false)}
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
          inventory={trolleyInventory}
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
