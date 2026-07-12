import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2, Clock3, LoaderCircle, MapPin, Package, PlayCircle, Plus, Truck, UserCheck, X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAppData } from '../../hooks/useAppData';
import {
  addDirtyPlannedStop, callExistingTripRpc, finalizeDriverTripPlan,
  pickupPlannedClean, removeDirtyPlannedStop,
} from '../../lib/courseRpc';
import {
  buildDirtyOnlyCandidates, buildReadyCleanGroups, summarizeStopTasks,
} from '../../lib/courseTaskHelpers';
import { routeNamesForTrip } from '../../lib/tripUiHelpers';
import { routeBadgeStyle } from '../../lib/visualSystem';
import { toastError, toastSuccess } from '../../lib/toast';
import { VEHICLE_LABELS } from '../../lib/vehicles';
import { RouteChip } from './CourseUiBits';
import '../mockups/mockups.css';

function formatPackedAt(value, language) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(language === 'de' ? 'de-DE' : 'pl-PL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ReadyCleanCard({ group, busy, language, onPickup, t }) {
  const packedBy = group.packedBy.length ? group.packedBy.join(', ') : t('course.planning.packerUnknown');
  const trolleyLabel = group.trolleyNos.length
    ? t('course.planning.trolleyNumbers', { list: group.trolleyNos.join(', ') })
    : t('course.planning.noTrolley');

  return (
    <article className={`live-load-card${group.isLoaded ? ' is-loaded' : ''}`}>
      <div className="live-load-card-main">
        <div className="live-load-card-title">
          <strong>{group.client_name}</strong>
          {group.isUrgent && <span className="live-load-urgent">{t('course.driver.urgentShort')}</span>}
        </div>
        <div className="live-load-card-meta">
          <span><Package size={14} aria-hidden="true" /> {group.kg ? `${group.kg} kg` : t('entry.noWeight')}</span>
          <span>{trolleyLabel}</span>
        </div>
        <div className="live-load-packed-meta">
          <span>{t('course.planning.packedBy', { name: packedBy })}</span>
          <span><Clock3 size={13} aria-hidden="true" /> {formatPackedAt(group.packedAt, language)}</span>
        </div>
      </div>

      {group.isLoaded ? (
        <div className="live-load-status">
          <CheckCircle2 size={17} aria-hidden="true" />
          {t('course.planning.onVehicle')}
        </div>
      ) : group.hasPhysicalTrolley ? (
        <div className="live-load-actions">
          <button type="button" className="live-start-claim-btn" onClick={() => onPickup(group, false)} disabled={busy}>
            {t('course.planning.pickupWithTrolley')}
          </button>
          <button type="button" className="live-planning-skip-btn" onClick={() => onPickup(group, true)} disabled={busy}>
            {t('course.planning.pickupLeaveTrolley')}
          </button>
        </div>
      ) : (
        <button type="button" className="live-start-claim-btn" onClick={() => onPickup(group, true)} disabled={busy}>
          {t('course.planning.pickup')}
        </button>
      )}
    </article>
  );
}

export default function DriverCoursePlanning({ trip, stops = [], onUpdated }) {
  const { t, i18n } = useTranslation();
  const { sessionToken } = useAuth();
  const { entries, clients, allRoutes, refetch } = useAppData();
  const [busy, setBusy] = useState(false);
  const [dirtyClient, setDirtyClient] = useState('');

  const routeMap = useMemo(
    () => Object.fromEntries(allRoutes.map((route, index) => [route.id, { num: index + 1, name: route.name }])),
    [allRoutes],
  );

  const orderedStops = useMemo(
    () => [...stops].sort((a, b) => (a.position || 0) - (b.position || 0)),
    [stops],
  );

  const ownReady = useMemo(
    () => buildReadyCleanGroups({ entries, trip, scope: 'own' }),
    [entries, trip],
  );
  const otherReady = useMemo(
    () => buildReadyCleanGroups({ entries, trip, scope: 'other' }),
    [entries, trip],
  );

  const cleanClientNames = useMemo(
    () => new Set([...ownReady, ...otherReady].map(group => group.client_name)),
    [ownReady, otherReady],
  );

  const dirtyStops = useMemo(
    () => orderedStops.filter(stop =>
      stop.status === 'pending'
      && (
        stop.stop_kind === 'dirty_only'
        || summarizeStopTasks(stop).hasDirty
      )
    ),
    [orderedStops],
  );

  const dirtyCandidates = useMemo(
    () => buildDirtyOnlyCandidates({ clients, stops, trip, cleanClientNames }),
    [clients, stops, trip, cleanClientNames],
  );

  const loadedGroups = useMemo(
    () => [...ownReady, ...otherReady].filter(group => group.isLoaded),
    [ownReady, otherReady],
  );
  const plannedClientNames = useMemo(
    () => new Set([
      ...loadedGroups.map(group => group.client_name),
      ...dirtyStops.map(stop => stop.client_name),
    ]),
    [loadedGroups, dirtyStops],
  );

  const routeDisplay = useMemo(() => {
    const firstRouteId = String(trip?.routes || '').split(',').map(value => Number(value.trim())).find(Boolean);
    return routeMap[firstRouteId]?.num || firstRouteId || null;
  }, [trip?.routes, routeMap]);

  const reload = async () => {
    await Promise.all([onUpdated?.(), refetch?.()]);
  };

  const pickupClean = async (group, leaveTrolley, addOtherRoute = false) => {
    if (!group.pendingIds.length) return;
    try {
      setBusy(true);
      await pickupPlannedClean(
        sessionToken,
        trip.id,
        group.pendingIds,
        leaveTrolley,
        addOtherRoute ? group.client_name : null,
      );
      toastSuccess(t('course.planning.pickupSuccess', { name: group.client_name }));
      await reload();
    } catch (error) {
      toastError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const addDirtyStop = async () => {
    if (!dirtyClient) return;
    try {
      setBusy(true);
      await addDirtyPlannedStop(sessionToken, trip.id, dirtyClient);
      toastSuccess(t('course.planning.dirtyAdded', { name: dirtyClient }));
      setDirtyClient('');
      await reload();
    } catch (error) {
      toastError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const removeDirtyStop = async stop => {
    if (stop.stop_kind !== 'dirty_only') return;
    try {
      setBusy(true);
      await removeDirtyPlannedStop(sessionToken, trip.id, stop.client_name);
      toastSuccess(t('course.planning.dirtyRemoved', { name: stop.client_name }));
      await reload();
    } catch (error) {
      toastError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const startDrive = async () => {
    if (!trip) return;
    try {
      setBusy(true);
      await finalizeDriverTripPlan(sessionToken, trip.id);
      await callExistingTripRpc('driver_start_trip', sessionToken, {
        p_planned_trip_id: trip.id,
        p_car: trip.car,
        p_routes: trip.routes,
      });
      toastSuccess(t('course.planning.driveStarted'));
      await onUpdated?.();
    } catch (error) {
      toastError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const cancelPlanning = async () => {
    if (!window.confirm(t('course.planning.cancelConfirm'))) return;
    try {
      setBusy(true);
      await callExistingTripRpc('driver_cancel_trip', sessionToken, { p_trip_id: trip.id });
      toastSuccess(t('course.planning.cancelled'));
      await onUpdated?.();
    } catch (error) {
      toastError(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="driver-phone live-driver-planning" aria-labelledby="driver-planning-title">
      <header className="live-start-header">
        <p className="live-start-kicker">{t('course.planning.kicker')}</p>
        <h1 id="driver-planning-title" className="live-start-title">{t('course.planning.prepareTitle')}</h1>
        <p className="live-start-subtitle">{t('course.planning.prepareSubtitle')}</p>
      </header>

      <div className="live-course-context-card live-planning-summary">
        <div className="driver-top-bar live-course-context-bar">
          <div className="live-course-context-col">
            <span className="live-course-context-label">{t('course.driver.courseLabel')}</span>
            <span className="driver-route-pill">
              {routeDisplay != null && (
                <span className="kurs-route-badge" style={{ ...routeBadgeStyle(routeDisplay), marginRight: '6px' }}>T{routeDisplay}</span>
              )}
              {routeNamesForTrip(trip, routeMap)} · {VEHICLE_LABELS[trip.car] || trip.car}
            </span>
          </div>
          <div className="live-course-context-col is-right">
            <span className="live-course-context-label">{t('course.driver.statusLabel')}</span>
            <span className="driver-status-pill is-planning">{t('course.planning.status')}</span>
          </div>
        </div>
        <p className="live-planning-count">
          {t('course.planning.stopCount', { count: plannedClientNames.size })}
        </p>
      </div>

      {trip?.driver_name && trip?.planned_start && (
        <div className="live-start-banner is-planned">
          <UserCheck size={20} aria-hidden="true" />
          <div>
            <strong>{t('course.start.adminPlanned')}</strong>
            <span>{t('course.start.adminPlannedHint')}</span>
          </div>
        </div>
      )}

      <div className="driver-focus-card live-planning-section">
        <h2 className="live-planning-section-title">
          <Package size={16} aria-hidden="true" />
          {t('course.planning.ownReadyTitle')}
        </h2>
        <p className="live-planning-section-hint">{t('course.planning.ownReadyHint')}</p>
        {ownReady.length === 0 ? (
          <div className="live-dirty-empty">{t('course.planning.noOwnReady')}</div>
        ) : (
          <div className="live-load-list">
            {ownReady.map(group => (
              <ReadyCleanCard
                key={group.client_name}
                group={group}
                busy={busy}
                language={i18n.language}
                onPickup={(item, leave) => pickupClean(item, leave, false)}
                t={t}
              />
            ))}
          </div>
        )}
      </div>

      <div className="driver-focus-card live-planning-section">
        <h2 className="live-planning-section-title">
          <MapPin size={16} aria-hidden="true" />
          {t('course.planning.dirtyOnlyTitle')}
        </h2>
        <p className="live-planning-section-hint">{t('course.planning.dirtyOnlyHint')}</p>

        {dirtyCandidates.length > 0 && (
          <div className="live-dirty-plan-add">
            <select className="ap-input" value={dirtyClient} onChange={event => setDirtyClient(event.target.value)} disabled={busy}>
              <option value="">{t('course.planning.selectDirtyClient')}</option>
              {dirtyCandidates.map(candidate => (
                <option key={candidate.client_name} value={candidate.client_name}>
                  {routeMap[candidate.route_id]?.name ? `${routeMap[candidate.route_id].name} · ` : ''}{candidate.client_name}
                </option>
              ))}
            </select>
            <button type="button" className="live-start-claim-btn" onClick={addDirtyStop} disabled={busy || !dirtyClient}>
              <Plus size={15} aria-hidden="true" /> {t('course.add')}
            </button>
          </div>
        )}

        {dirtyStops.length === 0 ? (
          <div className="live-dirty-empty">{t('course.planning.noDirtyStops')}</div>
        ) : (
          <div className="live-planning-list">
            {dirtyStops.map(stop => (
              <div className="live-planning-row" key={stop.id}>
                <div className="live-planning-row-main">
                  <strong>{stop.client_name}</strong>
                  <RouteChip routeId={stop.route_id} routeMap={routeMap} />
                  {stop.stop_kind !== 'dirty_only' && (
                    <span className="live-planning-tag">{t('course.planning.dirtyReported')}</span>
                  )}
                </div>
                {stop.stop_kind === 'dirty_only' && (
                  <button type="button" className="live-planning-text-btn is-warn" onClick={() => removeDirtyStop(stop)} disabled={busy}>
                    <X size={14} aria-hidden="true" /> {t('course.planning.remove')}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="driver-focus-card live-planning-section">
        <h2 className="live-planning-section-title">
          <Truck size={16} aria-hidden="true" />
          {t('course.planning.otherReadyTitle')}
        </h2>
        <p className="live-planning-section-hint">{t('course.planning.otherReadyHint')}</p>
        {otherReady.length === 0 ? (
          <div className="live-dirty-empty">{t('course.planning.noOtherReady')}</div>
        ) : (
          <div className="live-load-list">
            {otherReady.map(group => (
              <ReadyCleanCard
                key={group.client_name}
                group={group}
                busy={busy}
                language={i18n.language}
                onPickup={(item, leave) => pickupClean(item, leave, !item.isLoaded)}
                t={t}
              />
            ))}
          </div>
        )}
      </div>

      <div className="live-planning-footer">
        <button type="button" className="driver-primary-btn live-planning-start-btn" onClick={startDrive} disabled={busy || plannedClientNames.size === 0}>
          {busy ? <LoaderCircle className="is-spinning" size={20} aria-hidden="true" /> : <PlayCircle size={20} aria-hidden="true" />}
          {t('course.planning.startDrive')}
        </button>
        <button type="button" className="driver-secondary-btn" onClick={cancelPlanning} disabled={busy}>
          {t('course.planning.cancelPlanning')}
        </button>
      </div>
    </section>
  );
}
