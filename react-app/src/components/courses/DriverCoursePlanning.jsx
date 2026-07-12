import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LoaderCircle, MapPin, Package, PlayCircle, Plus, RotateCcw, Truck, UserCheck, X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAppData } from '../../hooks/useAppData';
import {
  callExistingTripRpc, declineCleanPickup, getTripJournal, removeTripExtraClient,
  skipPlannedStop, unskipPlannedStop,
} from '../../lib/courseRpc';
import {
  buildExtraCandidates, buildOtherRouteCleanCandidates, declinedCleanClientsFromEvents,
  summarizeStopTasks,
} from '../../lib/courseTaskHelpers';
import { parseExtraClients, routeNamesForTrip } from '../../lib/tripUiHelpers';
import { routeBadgeStyle } from '../../lib/visualSystem';
import { toastError, toastSuccess } from '../../lib/toast';
import { VEHICLE_LABELS } from '../../lib/vehicles';
import { RouteChip } from './CourseUiBits';
import ExtraCleanPickupSheet from './sheets/ExtraCleanPickupSheet';
import '../mockups/mockups.css';

const SKIP_REASONS = ['closed', 'no_laundry', 'later'];

function StopTaskTags({ summary, t }) {
  const tags = [];
  if (summary.hasDirty) tags.push(t('course.planning.tagDirty'));
  if (summary.hasCleanPickup) tags.push(t('course.planning.tagCleanPickup'));
  if (summary.hasDeliver) tags.push(t('course.planning.tagDeliver'));
  if (!tags.length) return null;
  return (
    <span className="live-planning-tags">
      {tags.map(tag => <span className="live-planning-tag" key={tag}>{tag}</span>)}
    </span>
  );
}

function ReasonPicker({ title, onPick, onCancel, t }) {
  return (
    <div className="live-planning-reasons">
      <span className="live-planning-reasons-label">{title}</span>
      <div className="live-planning-reason-grid">
        {SKIP_REASONS.map(key => (
          <button key={key} type="button" className="live-planning-reason-btn" onClick={() => onPick(key)}>
            {t(`course.planning.reasons.${key}`)}
          </button>
        ))}
        <button type="button" className="live-planning-reason-btn is-muted" onClick={onCancel}>
          {t('course.cancel')}
        </button>
      </div>
    </div>
  );
}

export default function DriverCoursePlanning({ trip, stops = [], onUpdated }) {
  const { t } = useTranslation();
  const { sessionToken } = useAuth();
  const { entries, allRoutes } = useAppData();
  const [busy, setBusy] = useState(false);
  const [otherCleanOpen, setOtherCleanOpen] = useState(false);
  const [declinedClients, setDeclinedClients] = useState(() => new Set());
  const [pendingAction, setPendingAction] = useState(null);

  const routeMap = useMemo(
    () => Object.fromEntries(allRoutes.map((route, index) => [route.id, { num: index + 1, name: route.name }])),
    [allRoutes],
  );

  const loadDeclined = useCallback(async () => {
    if (!sessionToken || !trip?.id) return;
    try {
      const journal = await getTripJournal(sessionToken, trip.id);
      setDeclinedClients(declinedCleanClientsFromEvents(journal?.events || []));
    } catch {
      setDeclinedClients(new Set());
    }
  }, [sessionToken, trip?.id]);

  useEffect(() => { loadDeclined(); }, [loadDeclined]);

  const orderedStops = useMemo(
    () => [...stops].sort((a, b) => (a.position || 0) - (b.position || 0)),
    [stops],
  );

  const extras = useMemo(() => new Set(parseExtraClients(trip?.extra_clients)), [trip?.extra_clients]);

  const scheduledStops = useMemo(
    () => orderedStops.filter(stop => stop.stop_kind !== 'extra'),
    [orderedStops],
  );
  const addedExtraStops = useMemo(
    () => orderedStops.filter(stop => stop.stop_kind === 'extra' && stop.status === 'pending'),
    [orderedStops],
  );
  const skippedStops = useMemo(
    () => orderedStops.filter(stop => stop.status === 'skipped'),
    [orderedStops],
  );

  const routeCleanCandidates = useMemo(() => {
    const base = buildExtraCandidates({ entries, stops, trip });
    return base.filter(candidate => !declinedClients.has(candidate.client_name));
  }, [entries, stops, trip, declinedClients]);

  const otherRouteCleanCandidates = useMemo(() => {
    const base = buildOtherRouteCleanCandidates({ entries, stops, trip });
    return base.filter(candidate => !declinedClients.has(candidate.client_name));
  }, [entries, stops, trip, declinedClients]);

  const activeStopCount = orderedStops.filter(stop => stop.status === 'pending').length;
  const routeDisplay = useMemo(() => {
    const firstRouteId = String(trip?.routes || '').split(',').map(value => Number(value.trim())).find(Boolean);
    return routeMap[firstRouteId]?.num || firstRouteId || null;
  }, [trip?.routes, routeMap]);

  const reload = async () => {
    await onUpdated?.();
    await loadDeclined();
  };

  const addExtraClient = async clientName => {
    if (!trip || !clientName) return;
    const next = JSON.stringify([...new Set([...extras, clientName])]);
    try {
      setBusy(true);
      await callExistingTripRpc('driver_set_trip_extra_clients', sessionToken, {
        p_trip_id: trip.id,
        p_extra_clients: next,
      });
      toastSuccess(t('course.planning.addedStop', { name: clientName }));
      await reload();
    } catch (error) {
      toastError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const removeExtraClient = async clientName => {
    if (!trip || !clientName) return;
    try {
      setBusy(true);
      await removeTripExtraClient(sessionToken, trip.id, clientName);
      toastSuccess(t('course.planning.removedStop', { name: clientName }));
      await reload();
    } catch (error) {
      toastError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const handleReasonPick = async reason => {
    if (!pendingAction) return;
    const action = pendingAction;
    setPendingAction(null);
    try {
      setBusy(true);
      if (action.type === 'skip') {
        await skipPlannedStop(sessionToken, action.stopId, reason);
        toastSuccess(t('course.planning.stopSkipped', { name: action.clientName }));
      } else {
        await declineCleanPickup(sessionToken, trip.id, action.clientName, reason);
        toastSuccess(t('course.planning.declinedClean', { name: action.clientName }));
      }
      await reload();
    } catch (error) {
      toastError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const undoSkip = async stopId => {
    try {
      setBusy(true);
      await unskipPlannedStop(sessionToken, stopId);
      toastSuccess(t('course.planning.stopRestored'));
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
        <h1 id="driver-planning-title" className="live-start-title">{t('course.planning.title')}</h1>
        <p className="live-start-subtitle">{t('course.planning.subtitle')}</p>
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
          {t('course.planning.stopCount', { count: activeStopCount })}
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
          <MapPin size={16} aria-hidden="true" />
          {t('course.planning.scheduledTitle')}
        </h2>
        <p className="live-planning-section-hint">{t('course.planning.scheduledHint')}</p>
        {scheduledStops.length === 0 ? (
          <div className="live-dirty-empty">{t('course.planning.noScheduled')}</div>
        ) : (
          <div className="live-planning-list">
            {scheduledStops.map(stop => {
              const summary = summarizeStopTasks(stop);
              const isSkipped = stop.status === 'skipped';
              const isPendingReason = pendingAction?.type === 'skip' && pendingAction.stopId === stop.id;
              return (
                <div className={`live-planning-row ${isSkipped ? 'is-skipped' : ''}`} key={stop.id}>
                  <div className="live-planning-row-main">
                    <strong>{stop.client_name}</strong>
                    <StopTaskTags summary={summary} t={t} />
                  </div>
                  {isSkipped ? (
                    <button type="button" className="live-planning-text-btn" onClick={() => undoSkip(stop.id)} disabled={busy}>
                      <RotateCcw size={14} aria-hidden="true" />
                      {t('course.planning.restore')}
                    </button>
                  ) : isPendingReason ? (
                    <ReasonPicker
                      title={t('course.planning.pickReason')}
                      onPick={handleReasonPick}
                      onCancel={() => setPendingAction(null)}
                      t={t}
                    />
                  ) : (
                    <button
                      type="button"
                      className="live-planning-text-btn is-warn"
                      onClick={() => setPendingAction({ type: 'skip', stopId: stop.id, clientName: stop.client_name })}
                      disabled={busy}
                    >
                      {t('course.planning.skipToday')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {addedExtraStops.length > 0 && (
        <div className="driver-focus-card live-planning-section">
          <h2 className="live-planning-section-title">
            <Plus size={16} aria-hidden="true" />
            {t('course.planning.addedTitle')}
          </h2>
          <div className="live-planning-list">
            {addedExtraStops.map(stop => (
              <div className="live-planning-row" key={stop.id}>
                <div className="live-planning-row-main">
                  <strong>{stop.client_name}</strong>
                  <RouteChip routeId={stop.route_id} routeMap={routeMap} />
                </div>
                <button
                  type="button"
                  className="live-planning-text-btn is-warn"
                  onClick={() => removeExtraClient(stop.client_name)}
                  disabled={busy}
                >
                  <X size={14} aria-hidden="true" />
                  {t('course.planning.remove')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="driver-focus-card live-planning-section">
        <h2 className="live-planning-section-title">
          <Package size={16} aria-hidden="true" />
          {t('course.planning.routeCleanTitle')}
        </h2>
        <p className="live-planning-section-hint">{t('course.planning.routeCleanHint')}</p>
        {routeCleanCandidates.length === 0 ? (
          <div className="live-dirty-empty">{t('course.planning.noRouteClean')}</div>
        ) : (
          <div className="live-extra-clean-list is-compact">
            {routeCleanCandidates.map(candidate => {
              const isPendingReason = pendingAction?.type === 'decline' && pendingAction.clientName === candidate.client_name;
              return (
                <div className="live-extra-clean-row" key={candidate.client_name}>
                  {isPendingReason ? (
                    <ReasonPicker
                      title={t('course.planning.pickReason')}
                      onPick={handleReasonPick}
                      onCancel={() => setPendingAction(null)}
                      t={t}
                    />
                  ) : (
                    <>
                      <div className="live-extra-clean-info">
                        <span>
                          <strong>{candidate.client_name}</strong>
                          {candidate.kg ? ` · ${candidate.kg} kg` : ''}
                          {candidate.isUrgent ? ` · ${t('course.driver.urgentShort')}` : ''}
                        </span>
                      </div>
                      <div className="live-planning-actions">
                        <button type="button" className="live-start-claim-btn" onClick={() => addExtraClient(candidate.client_name)} disabled={busy}>
                          {t('course.add')}
                        </button>
                        <button
                          type="button"
                          className="live-planning-skip-btn"
                          onClick={() => setPendingAction({ type: 'decline', clientName: candidate.client_name })}
                          disabled={busy}
                        >
                          {t('course.planning.skipToday')}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {otherRouteCleanCandidates.length > 0 && (
        <button type="button" className="live-extra-clean-bar" onClick={() => setOtherCleanOpen(true)} disabled={busy}>
          <div className="live-extra-clean-bar-main">
            <Truck size={18} aria-hidden="true" />
            <div className="live-extra-clean-bar-copy">
              <strong>{t('course.driver.otherRouteCleanSubtitle')}</strong>
              <small>{t('course.planning.otherRouteHint', { count: otherRouteCleanCandidates.length })}</small>
            </div>
            <span className="live-extra-clean-count">{otherRouteCleanCandidates.length}</span>
          </div>
        </button>
      )}

      {skippedStops.length > 0 && (
        <p className="live-planning-skipped-note">
          {t('course.planning.skippedNote', { count: skippedStops.length })}
        </p>
      )}

      <div className="live-planning-footer">
        <button type="button" className="driver-primary-btn live-planning-start-btn" onClick={startDrive} disabled={busy}>
          {busy ? <LoaderCircle className="is-spinning" size={20} aria-hidden="true" /> : <PlayCircle size={20} aria-hidden="true" />}
          {t('course.planning.startDrive')}
        </button>
        <button type="button" className="driver-secondary-btn" onClick={cancelPlanning} disabled={busy}>
          {t('course.planning.cancelPlanning')}
        </button>
      </div>

      {otherCleanOpen && (
        <ExtraCleanPickupSheet
          candidates={otherRouteCleanCandidates}
          routeMap={routeMap}
          busy={busy}
          onClose={() => setOtherCleanOpen(false)}
          onPick={async clientName => {
            await addExtraClient(clientName);
            setOtherCleanOpen(false);
          }}
        />
      )}
    </section>
  );
}
