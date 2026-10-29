import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, LoaderCircle, Navigation2, Package, Printer, Trash2, Truck, UserCheck } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { formatPackInfoLabel } from '../../lib/courseLocale';
import { callExistingTripRpc, getTripCourse } from '../../lib/courseRpc';
import { printDayWorkCard, printTripWorkCard } from '../../lib/coursePrint';
import { logAction } from '../../lib/logger';
import {
  assignedTripForEntry, buildExtraCandidates, dirtyEntriesForStop, entryAssignmentCaption,
  entryIdsForTasks, fmtTime, getPackInfo,
  splitCleanTasks, statsFromCourseStops, stopLaundryMeta,
} from '../../lib/courseTaskHelpers';
import { parseExtraClients } from '../../lib/tripUiHelpers';
import { toastError, toastSuccess } from '../../lib/toast';
import { ViewEditEntryModal } from '../modals/EntryModals';
import {
  LaundryTypeChip, mapsUrlForStop, RouteChip, TripMetricsPanel, TripProgressBar, UrgentChip,
} from './CourseUiBits';
import CourseSheet from './CourseSheet';
import AddDirtyToTripSheet from './sheets/AddDirtyToTripSheet';

const STOP_STATUS_KEYS = {
  pending: 'statusPending',
  completed: 'statusCompleted',
  skipped: 'statusSkipped',
};

function StopStatusBadge({ status, t }) {
  const tone = status === 'completed' ? 'is-done' : status === 'skipped' ? 'is-skipped' : 'is-pending';
  const label = t(`course.stops.${STOP_STATUS_KEYS[status] || 'statusPending'}`);
  return <span className={`live-stop-status ${tone}`}>{label}</span>;
}

function AdminActionBtn({ label, onClick, disabled, tone = 'primary' }) {
  return (
    <button type="button" className={`live-admin-action ${tone === 'undo' ? 'is-undo' : ''}`} onClick={onClick} disabled={disabled}>
      {label}
    </button>
  );
}

export default function TripCourseStops({
  trip,
  sessionToken,
  isAdmin,
  entries,
  clients,
  routes,
  routeMap,
  drivers = [],
  allTrips = [],
  dailyCosts = [],
  onReload,
  onDeleted,
  busy,
  setBusy,
}) {
  const [stops, setStops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [dirtyOpen, setDirtyOpen] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [handoffTarget, setHandoffTarget] = useState('');
  const [plannedStart, setPlannedStart] = useState('');
  const [printing, setPrinting] = useState(false);
  const [viewEntry, setViewEntry] = useState(null);
  const { t, i18n } = useTranslation();

  const loadStops = useCallback(async () => {
    if (!sessionToken || !trip?.id || trip.isVirtual) return;
    setLoading(true);
    try {
      const data = await getTripCourse(sessionToken, trip.id);
      setStops(data.stops || []);
      const sourceTrip = data.trip || trip;
      if (sourceTrip.planned_start) {
        const date = new Date(sourceTrip.planned_start);
        const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        setPlannedStart(local.toISOString().slice(0, 16));
      } else {
        setPlannedStart('');
      }
    } catch (error) {
      toastError(t('course.stops.loadError', { message: error.message }));
      setStops([]);
    } finally {
      setLoading(false);
    }
  }, [sessionToken, t, trip]);

  useEffect(() => { loadStops(); }, [loadStops]);

  const stats = useMemo(
    () => statsFromCourseStops(stops, entries, trip.trip_date),
    [stops, entries, trip.trip_date],
  );
  const canAdminAct = isAdmin && !trip.isVirtual && (trip.status === 'active' || trip.board_status === 'active');
  const canAddStop = isAdmin && !trip.isVirtual && (trip.status === 'active' || trip.status === 'planned');
  const canDelete = isAdmin && !trip.isVirtual;
  const canHandoff = isAdmin && !trip.isVirtual && (trip.status === 'active' || trip.board_status === 'active');
  const canPrint = !trip.isVirtual && (trip.status === 'finished' || trip.board_status === 'closed' || trip.board_status === 'settlement');
  const extraCandidates = useMemo(
    () => buildExtraCandidates({ entries, stops, trip, userName: trip.driver_name }),
    [entries, stops, trip],
  );

  const adminRpc = async (fn, args, success, logDetails) => {
    try {
      setBusy(true);
      const { data, error } = await supabase.rpc(fn, { p_session_token: sessionToken, ...args });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (logDetails) {
        await logAction({
          sessionToken,
          action: logDetails.action,
          clientName: logDetails.clientName,
          entryId: logDetails.entryId,
          details: logDetails.details,
        });
      }
      toastSuccess(success);
      await loadStops();
      await onReload?.();
    } catch (error) {
      toastError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const adminPickup = stop => {
    const clean = splitCleanTasks(stop.tasks || []);
    const ids = entryIdsForTasks(clean.pendingPickup.length ? clean.pendingPickup : clean.pickup);
    if (!ids.length) return;
    adminRpc('admin_pickup_entries', {
      p_ids: ids,
      p_driver_name: trip.driver_name || null,
      p_baskets: 1,
    }, t('course.stops.pickupAdminSuccess'), {
      action: 'done',
      clientName: stop.client_name,
      entryId: ids[0],
      details: `odbiór z pralni (admin za ${trip.driver_name || '—'})`,
    });
  };

  const adminDeliver = stop => {
    const clean = splitCleanTasks(stop.tasks || []);
    const ids = entryIdsForTasks(clean.pendingDelivery.length ? clean.pendingDelivery : clean.delivery);
    if (!ids.length) return;
    adminRpc('admin_deliver_entries', {
      p_ids: ids,
      p_driver_name: trip.driver_name || null,
    }, t('course.stops.deliverAdminSuccess'), {
      action: 'delivered',
      clientName: stop.client_name,
      entryId: ids[0],
      details: `dostawa do klienta (admin za ${trip.driver_name || '—'})`,
    });
  };

  const adminUndoPickup = stop => {
    const clean = splitCleanTasks(stop.tasks || []);
    if (clean.delivery.some(task => task.delivered)) {
      toastError(t('course.currentStop.undoDeliverFirst'));
      return;
    }
    const ids = entryIdsForTasks(clean.pickup);
    adminRpc('admin_undo_pickup', { p_ids: ids }, t('course.stops.undoPickupAdminSuccess'), {
      action: 'undone',
      clientName: stop.client_name,
      entryId: ids[0],
      details: 'cofnięto odbiór z pralni (admin)',
    });
  };

  const adminUndoDeliver = stop => {
    const clean = splitCleanTasks(stop.tasks || []);
    const ids = entryIdsForTasks(clean.delivery);
    adminRpc('admin_undo_deliver', { p_ids: ids }, t('course.stops.undoDeliverAdminSuccess'), {
      action: 'undone',
      clientName: stop.client_name,
      entryId: ids[0],
      details: 'cofnięto dostawę (admin)',
    });
  };

  const addExtraClient = async clientName => {
    const extras = parseExtraClients(trip.extra_clients);
    const next = JSON.stringify([...new Set([...extras, clientName])]);
    try {
      setBusy(true);
      await callExistingTripRpc('driver_set_trip_extra_clients', sessionToken, {
        p_trip_id: trip.id,
        p_extra_clients: next,
      });
      toastSuccess(t('course.stops.extraAdded', { client: clientName }));
      await loadStops();
      await onReload?.();
    } catch (error) {
      toastError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const savePlannedStart = async () => {
    try {
      setBusy(true);
      const iso = plannedStart ? new Date(plannedStart).toISOString() : null;
      const { data, error } = await supabase.rpc('admin_set_trip_planned_start', {
        p_session_token: sessionToken,
        p_trip_id: trip.id,
        p_planned_start: iso,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toastSuccess(t(iso ? 'course.stops.plannedStartSaved' : 'course.stops.plannedStartRemoved'));
      await onReload?.();
    } catch (error) {
      toastError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const deleteTrip = async () => {
    if (!window.confirm(t('course.stops.deleteConfirm', { driver: trip.driver_name || '', date: trip.trip_date }))) return;
    try {
      setBusy(true);
      await callExistingTripRpc('admin_delete_driver_trip', sessionToken, { p_trip_id: trip.id });
      toastSuccess(t('course.stops.deleteSuccess'));
      onDeleted?.();
    } catch (error) {
      toastError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const handoff = async () => {
    try {
      setBusy(true);
      await callExistingTripRpc('transfer_loaded_trip', sessionToken, {
        p_trip_id: trip.id,
        p_target_driver_id: handoffTarget,
      });
      setHandoffOpen(false);
      toastSuccess(t('course.stops.handoffSuccess'));
      await onReload?.();
    } catch (error) {
      toastError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const parkTrip = async () => {
    try {
      setBusy(true);
      await callExistingTripRpc('park_loaded_trip', sessionToken, { p_trip_id: trip.id });
      setHandoffOpen(false);
      toastSuccess(t('course.driver.parkedDone'));
      await onReload?.();
    } catch (error) {
      toastError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const printCard = async mode => {
    try {
      setPrinting(true);
      const args = {
        sessionToken,
        trip,
        entries,
        routeMap,
        driverName: trip.driver_name,
        dailyCosts,
        allTrips,
      };
      if (mode === 'day') await printDayWorkCard(args);
      else await printTripWorkCard(args);
    } finally {
      setPrinting(false);
    }
  };

  if (trip.isVirtual) {
    return <div className="driver-empty-row">{t('course.stops.virtualHint')}</div>;
  }

  if (loading) {
    return <div className="live-loading-row"><LoaderCircle size={16} className="is-spinning" /> {t('course.stops.loadingStops')}</div>;
  }

  return (
    <div className="live-trip-stops">
      {isAdmin && (
        <div className="live-trip-admin-bar">
          {canHandoff && (
            <button className="driver-tool-btn" onClick={() => { setHandoffTarget(''); setHandoffOpen(true); }} disabled={busy}>
              <UserCheck size={14} /> {t('course.stops.handoffBtn')}
            </button>
          )}
          {canPrint && (
            <>
              <button className="driver-tool-btn" onClick={() => printCard('trip')} disabled={busy || printing}>
                <Printer size={14} /> {t('course.stops.printTrip')}
              </button>
              <button className="driver-tool-btn" onClick={() => printCard('day')} disabled={busy || printing}>
                {t('course.stops.printDay')}
              </button>
            </>
          )}
          {canDelete && (
            <button className="driver-tool-btn live-delete-btn" onClick={deleteTrip} disabled={busy}>
              <Trash2 size={14} /> {t('course.stops.deleteTrip')}
            </button>
          )}
        </div>
      )}

      <TripProgressBar stats={stats} />
      <TripMetricsPanel stats={stats} />

      {isAdmin && trip.status === 'planned' && (
        <div className="live-planned-start-row">
          <label className="live-field-label" htmlFor="planned-start">{t('course.stops.plannedStart')}</label>
          <input id="planned-start" className="ap-input" type="datetime-local" value={plannedStart} onChange={event => setPlannedStart(event.target.value)} disabled={busy} />
          <button className="driver-tool-btn" onClick={savePlannedStart} disabled={busy}>{t('course.stops.saveStart')}</button>
        </div>
      )}

      {canAddStop && (
        <div className="live-add-stop-block">
          <button className="live-task-action is-secondary" onClick={() => setAddOpen(open => !open)} disabled={busy}>
            {t(addOpen ? 'course.stops.hideCandidates' : 'course.stops.addCleanStop')}
          </button>
          {addOpen && (
            <div className="live-add-stop-list">
              {extraCandidates.length === 0 && <div className="driver-empty-row">{t('course.stops.noExtraClients')}</div>}
              {extraCandidates.map(candidate => (
                <div className="live-extra-row" key={candidate.client_name}>
                  <span>
                    {candidate.client_name}
                    {candidate.kg ? ` · ${candidate.kg} kg` : ''}
                    {candidate.isUrgent ? ` · ${t('course.driver.urgentShort')}` : ''}
                  </span>
                  <button className="driver-tool-btn" onClick={() => addExtraClient(candidate.client_name)} disabled={busy}>{t('common.add')}</button>
                </div>
              ))}
            </div>
          )}
          <button className="live-task-action is-secondary" onClick={() => setDirtyOpen(true)} disabled={busy}>
            {t('course.stops.addDirtyStop')}
          </button>
        </div>
      )}

      <div className="live-journal-section-title">{t('course.stops.stopsCount', { count: stops.length })}</div>
      {stops.length === 0 && <div className="driver-empty-row">{t('course.stops.noStops')}</div>}

      {stops.map((stop, index) => {
        const clean = splitCleanTasks(stop.tasks || []);
        const packInfo = getPackInfo(clean.pickup);
        const pickupDone = clean.pendingPickup.length === 0 && clean.completedPickup.length > 0;
        const deliveryDone = clean.pendingDelivery.length === 0 && clean.completedDelivery.length > 0;
        const dirtyToday = dirtyEntriesForStop(entries, stop.client_name, trip.trip_date);
        const meta = stopLaundryMeta(stop.tasks || [], dirtyToday);

        return (
          <article className={`live-stop-card ${stop.status === 'completed' ? 'is-done' : ''}`} key={stop.id}>
            <div className="live-stop-card-head">
              <span className="driver-upcoming-index">{index + 1}</span>
              <RouteChip routeId={stop.route_id} routeMap={routeMap} />
              <strong>{stop.client_name}</strong>
              {meta.isUrgent && <UrgentChip />}
              {meta.kg > 0 && <span className="kg-badge">{meta.kg} kg</span>}
              <LaundryTypeChip hasP={meta.hasP} hasO={meta.hasO} hasF={meta.hasF} hasR={meta.hasR} />
              <a className="driver-nav-btn live-stop-nav" href={mapsUrlForStop(stop)} target="_blank" rel="noopener noreferrer" aria-label={t('course.navigate')}>
                <Navigation2 size={14} />
              </a>
              <StopStatusBadge status={stop.status} t={t} />
            </div>

            {clean.pickup.length > 0 && (
              <div className="live-stop-action">
                <Package size={14} />
                <div className="live-stop-action-body">
                  <span>{t('course.stops.pickupLaundry')}</span>
                  <div className={`live-pack-badge ${packInfo.isReady ? 'is-ready' : 'is-waiting'}`}>{formatPackInfoLabel(packInfo, t, i18n.language?.startsWith('de') ? 'de-DE' : 'pl-PL')}</div>
                  {pickupDone ? (
                    <span className="live-task-action-meta">✓ {fmtTime(clean.pickup.find(task => task.completed_at)?.completed_at || clean.pickup[0]?.picked_at)}</span>
                  ) : (
                    <span className="live-stop-waiting">{t('course.stops.waiting')}</span>
                  )}
                </div>
                {canAdminAct && (
                  pickupDone && !deliveryDone
                    ? <AdminActionBtn label={t('course.undo')} tone="undo" onClick={() => adminUndoPickup(stop)} disabled={busy} />
                    : !pickupDone && <AdminActionBtn label={t('course.stops.pickupAdmin')} onClick={() => adminPickup(stop)} disabled={busy} />
                )}
              </div>
            )}

            {clean.delivery.length > 0 && (
              <div className="live-stop-action">
                <Truck size={14} />
                <div className="live-stop-action-body">
                  <span>{t('course.stops.delivered')}</span>
                  {deliveryDone ? (
                    <span className="live-task-action-meta">✓ {fmtTime(clean.delivery.find(task => task.completed_at)?.completed_at || clean.delivery[0]?.delivered_at)}</span>
                  ) : (
                    <span className="live-stop-waiting">{t(pickupDone ? 'course.stops.waitingDelivery' : 'course.stops.afterPickup')}</span>
                  )}
                </div>
                {canAdminAct && (
                  deliveryDone
                    ? <AdminActionBtn label={t('course.undo')} tone="undo" onClick={() => adminUndoDeliver(stop)} disabled={busy} />
                    : pickupDone && <AdminActionBtn label={t('course.stops.deliverAdmin')} onClick={() => adminDeliver(stop)} disabled={busy} />
                )}
              </div>
            )}

            {dirtyToday.length > 0 && (
              <div className="live-stop-dirty">
                {t('course.stops.dirty')}: {dirtyToday.map(entry => {
                  const assigned = assignedTripForEntry(entry, { allTrips, trip, focusTrip: trip });
                  const captionKey = entryAssignmentCaption(assigned);
                  return (
                    <button
                      type="button"
                      key={entry.id}
                      className="live-dirty-entry-btn"
                      onClick={() => isAdmin && setViewEntry(entry)}
                      disabled={!isAdmin}
                    >
                      {entry.type || 'P'}{entry.weight ? ` ${entry.weight} kg` : ''}
                      {captionKey ? ` · ${t(`course.assignment.${captionKey}`)}` : ''}
                      {isAdmin ? ` (${t('course.edit')})` : ''}
                    </button>
                  );
                })}
              </div>
            )}

            {stop.status === 'completed' && <CheckCircle2 size={16} color="var(--accent-green)" className="live-stop-done-icon" />}
          </article>
        );
      })}

      {handoffOpen && (
        <CourseSheet titleId="admin-handoff-title" title={t('course.stops.handoffTitle')} onClose={() => !busy && setHandoffOpen(false)} busy={busy}>
          <p className="live-sheet-copy">{t('course.stops.handoffHint')}</p>
          <label className="live-field-label" htmlFor="admin-handoff-driver">{t('course.sheets.assign.driver')}</label>
          <select id="admin-handoff-driver" className="ap-input" value={handoffTarget} onChange={event => setHandoffTarget(event.target.value)}>
            <option value="">{t('course.driver.selectDriver')}</option>
            {drivers.filter(driver => !driver.is_archived && String(driver.id) !== String(trip.driver_id)).map(driver => (
              <option key={driver.id} value={driver.id}>{driver.name}</option>
            ))}
          </select>
          <div className="ap-btn-group">
            <button className="ap-btn ap-btn-primary" onClick={handoff} disabled={busy || !handoffTarget}><UserCheck size={15} /> {t('course.stops.handoffBtn')}</button>
            <button className="ap-btn ap-btn-secondary" onClick={parkTrip} disabled={busy}>{t('course.driver.leaveForClaim')}</button>
          </div>
        </CourseSheet>
      )}

      {dirtyOpen && (
        <AddDirtyToTripSheet
          trip={trip}
          sessionToken={sessionToken}
          clients={clients}
          routes={routes}
          onClose={() => setDirtyOpen(false)}
          onAdded={async () => { await loadStops(); await onReload?.(); }}
        />
      )}

      {viewEntry && (
        <ViewEditEntryModal
          isOpen
          entry={viewEntry}
          routes={routes}
          clients={clients}
          onClose={() => setViewEntry(null)}
          onUpdated={async () => { setViewEntry(null); await loadStops(); await onReload?.(); }}
          onDeleted={async () => { setViewEntry(null); await loadStops(); await onReload?.(); }}
          initiallyEditing={isAdmin}
          entryAssignmentLabel={assignedTripForEntry(viewEntry, { allTrips, trip, focusTrip: trip })?.label}
          entryAssignmentCaption={(() => {
            const key = entryAssignmentCaption(assignedTripForEntry(viewEntry, { allTrips, trip, focusTrip: trip }));
            return key ? t(`course.assignment.${key}`) : t('course.assignment.willBring');
          })()}
        />
      )}
    </div>
  );
}
