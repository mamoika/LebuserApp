import { useMemo, useState } from 'react';
import { AlertTriangle, Gauge, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { bulkApprovePendingKm, pendingKmTrips, tripKmApproval } from '../../lib/courseKmHelpers';
import { formatCourseShortDate, formatCourseTime } from '../../lib/courseLocale';
import { logAction } from '../../lib/logger';
import { parseRouteIds } from '../../lib/tripUiHelpers';
import { toastError, toastSuccess } from '../../lib/toast';
import { VEHICLE_LABELS } from '../../lib/vehicles';
import { routeBadgeStyle } from '../../lib/visualSystem';
import { TripMetricsPanel, TripProgressBar } from './CourseUiBits';
import { statsFromCourseStops } from '../../lib/courseTaskHelpers';

function RouteBadge({ routeId, routeMap }) {
  const info = routeMap?.[Number(routeId)];
  const display = info?.num || routeId;
  return (
    <span className="kurs-route-badge" style={routeBadgeStyle(display)}>
      T{display}
    </span>
  );
}

function ArchiveTripRow({ trip, routeMap, dailyCosts, onOpen, onApproveKm, t, locale }) {
  const stats = trip._stats || { stops: 0, delivered: 0, picked: 0, kg: 0, dirtyTrolleys: 0, dirtyStops: 0, totalStops: 0 };
  const kmApproval = tripKmApproval(trip, dailyCosts);
  const routeIds = [...parseRouteIds(trip.routes)];
  const statusClass = trip.isVirtual ? 'is-planned' : trip.status === 'active' ? 'is-live' : trip.status === 'finished' ? 'is-finished' : 'is-planned';

  return (
    <div
      className={`trip-card ${statusClass}`}
      role="button"
      tabIndex={0}
      onClick={() => !trip.isVirtual && onOpen?.(trip)}
      onKeyDown={event => { if (event.key === 'Enter' && !trip.isVirtual) onOpen?.(trip); }}
      title={t('course.archive.openTrip')}
    >
      <div className="trip-card-head">
        <span className={`trip-dot ${trip.status === 'active' ? 'live' : ''}`} />
        <div className="trip-card-headtext">
          <div className="trip-card-driver">{trip.driver_name || t('course.noDriver')}</div>
          <div className="trip-card-meta">
            {trip.car ? (VEHICLE_LABELS[trip.car] || trip.car) : (trip.isVirtual ? t('course.unassigned') : '—')}
            {trip.status !== 'planned' && !trip.isVirtual && trip.started_at ? ` · ${formatCourseTime(trip.started_at, locale)}` : ''}
            {trip.ended_at ? `–${formatCourseTime(trip.ended_at, locale)}` : ''}
          </div>
        </div>
        <span className="trip-card-date">{formatCourseShortDate(trip.trip_date, locale)}</span>
      </div>

      <div className="trip-card-routes">
        {routeIds.length > 0
          ? routeIds.map(id => <RouteBadge key={id} routeId={id} routeMap={routeMap} />)
          : <span className="trip-card-allroutes">{trip.route_name || t('course.dailyCourse')}</span>}
      </div>

      {!trip.isVirtual && stats.stops > 0 && (
        <>
          <TripProgressBar stats={stats} />
          <TripMetricsPanel stats={stats} />
        </>
      )}

      {(trip.end_km || trip.status === 'finished' || trip.isVirtual) && (
        <div className="trip-card-foot">
          {trip.end_km && (
            <span className="trip-card-km">
              {trip.end_km} km
              {kmApproval.approved ? ' ✓' : ' ⏳'}
            </span>
          )}
          {trip.status === 'finished' && !kmApproval.approved && trip.end_km && onApproveKm && (
            <button
              type="button"
              className="driver-tool-btn"
              onClick={event => { event.stopPropagation(); onApproveKm(trip); }}
            >
              <Gauge size={13} /> km
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function DispatchTripArchive({
  allTrips = [],
  entries = [],
  allRoutes = [],
  routeMap = {},
  dailyCosts = [],
  virtualTrips = [],
  busy,
  setBusy,
  sessionToken,
  onOpenTrip,
  onApproveKm,
  onPlanPickup,
  onReload,
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('de') ? 'de-DE' : 'pl-PL';
  const unassignedLabel = t('course.unassignedDriver');
  const [filterDriver, setFilterDriver] = useState('');
  const [filterCar, setFilterCar] = useState('');
  const [filterRoute, setFilterRoute] = useState('');

  const uniqueDrivers = useMemo(() => {
    const names = [...new Set(allTrips.map(trip => trip.driver_name || t('course.unknownDriver')).filter(Boolean))].sort();
    if (virtualTrips.length > 0 && !names.includes(unassignedLabel)) names.push(unassignedLabel);
    return names;
  }, [allTrips, t, unassignedLabel, virtualTrips.length]);

  const uniqueCars = useMemo(
    () => [...new Set(allTrips.map(trip => trip.car).filter(Boolean))].sort(),
    [allTrips],
  );

  const enrichedTrips = useMemo(() => allTrips.map(trip => ({
    ...trip,
    _stats: statsFromCourseStops(trip.stops || [], entries, trip.trip_date),
  })), [allTrips, entries]);

  const filteredTrips = useMemo(() => enrichedTrips.filter(trip => {
    if (filterDriver && (trip.driver_name || t('course.unknownDriver')) !== filterDriver) return false;
    if (filterCar && trip.car !== filterCar) return false;
    if (filterRoute) {
      const routeIds = parseRouteIds(trip.routes);
      if (routeIds.size > 0 && !routeIds.has(Number(filterRoute))) return false;
    }
    return true;
  }), [enrichedTrips, filterCar, filterDriver, filterRoute, t]);

  const filteredVirtual = useMemo(() => virtualTrips.filter(trip => {
    if (filterDriver && filterDriver !== unassignedLabel) return false;
    if (filterCar) return false;
    if (filterRoute && !parseRouteIds(trip.routes).has(Number(filterRoute))) return false;
    return true;
  }), [filterCar, filterDriver, filterRoute, virtualTrips]);

  const liveTrips = filteredTrips.filter(trip => trip.status === 'active');
  const plannedTrips = [...filteredVirtual, ...filteredTrips.filter(trip => trip.status === 'planned')];
  const finishedTrips = filteredTrips.filter(trip => trip.status === 'finished').slice(0, 100);
  const pendingKm = useMemo(() => pendingKmTrips(allTrips, dailyCosts), [allTrips, dailyCosts]);

  const approveAllKm = async () => {
    if (pendingKm.length === 0 || !sessionToken) return;
    try {
      setBusy(true);
      await bulkApprovePendingKm(sessionToken, pendingKm);
      await logAction({
        sessionToken,
        action: 'edited',
        details: `Zatwierdzono zbiorczo liczniki tras: ${pendingKm.length}`,
      });
      toastSuccess(t('course.archive.bulkKmSuccess', { count: pendingKm.length }));
      await onReload?.();
    } catch (error) {
      toastError(`${t('course.archive.bulkKmError')}: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="live-dispatch-archive">
      <div className="driver-history-header" style={{ marginBottom: '16px' }}>
        <div>
          <div className="driver-trip-kicker">{t('course.archive.kicker')}</div>
          <div className="driver-trip-title">{t('course.archive.title')}</div>
          <div className="driver-trip-subtitle">{t('course.archive.subtitle', { count: allTrips.length })}</div>
        </div>
      </div>

      {pendingKm.length > 0 && (
        <div className="route-alerts" style={{ marginBottom: '12px' }}>
          <div className="route-alert info">{t('course.archive.pendingKmAlert', { count: pendingKm.length })}</div>
        </div>
      )}

      <div className="admin-filters-bar">
        <div className="filter-group">
          <span className="filter-label">{t('course.archive.filterDriver')}</span>
          <select value={filterDriver} onChange={event => setFilterDriver(event.target.value)}>
            <option value="">{t('course.archive.allDrivers')}</option>
            {uniqueDrivers.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <span className="filter-label">{t('course.archive.filterCar')}</span>
          <select value={filterCar} onChange={event => setFilterCar(event.target.value)}>
            <option value="">{t('course.archive.allCars')}</option>
            {uniqueCars.map(car => <option key={car} value={car}>{VEHICLE_LABELS[car] || car}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <span className="filter-label">{t('course.archive.filterRoute')}</span>
          <select value={filterRoute} onChange={event => setFilterRoute(event.target.value)}>
            <option value="">{t('course.archive.allRoutes')}</option>
            {allRoutes.map(route => (
              <option key={route.id} value={route.id}>
                T{routeMap[route.id]?.num || route.id} - {route.name}
              </option>
            ))}
          </select>
        </div>

        {onPlanPickup && (
          <button className="driver-add-primary" style={{ marginLeft: 'auto', padding: '10px 16px', borderRadius: '8px', minWidth: 'auto', width: 'auto', fontSize: '13px' }} onClick={onPlanPickup}>
            <Plus size={14} /> {t('course.planPickup')}
          </button>
        )}

        {pendingKm.length > 0 && (
          <button className="driver-tool-btn" onClick={approveAllKm} disabled={busy} style={{ background: 'var(--accent-green)', color: '#fff', border: 'none' }}>
            ✓ {t('course.archive.approveAllKm', { count: pendingKm.length })}
          </button>
        )}
      </div>

      <div className="admin-section-grid">
        <div className="admin-trip-group live">
          <div className="admin-trip-group-header">
            {t('course.archive.liveTrips')}
            <span className="count-badge">{liveTrips.length}</span>
          </div>
          <div className="admin-trip-list-inner">
            {liveTrips.length === 0 && <div className="driver-empty-row">{t('course.archive.noLive')}</div>}
            {liveTrips.map(trip => (
              <ArchiveTripRow key={trip.id} trip={trip} routeMap={routeMap} dailyCosts={dailyCosts} onOpen={onOpenTrip} onApproveKm={onApproveKm} t={t} locale={locale} />
            ))}
          </div>
        </div>

        <div className="admin-trip-group planned">
          <div className="admin-trip-group-header">
            {t('course.archive.plannedTrips')}
            <span className="count-badge">{plannedTrips.length}</span>
          </div>
          <div className="admin-trip-list-inner">
            {plannedTrips.length === 0 && <div className="driver-empty-row">{t('course.archive.noPlanned')}</div>}
            {plannedTrips.map(trip => (
              <ArchiveTripRow key={trip.id} trip={trip} routeMap={routeMap} dailyCosts={dailyCosts} onOpen={onOpenTrip} t={t} locale={locale} />
            ))}
          </div>
        </div>

        <div className="admin-trip-group finished">
          <div className="admin-trip-group-header">
            {t('course.archive.finishedTrips')}
            <span className="count-badge">{finishedTrips.length}</span>
          </div>
          <div className="admin-trip-list-inner">
            {finishedTrips.length === 0 && <div className="driver-empty-row">{t('course.archive.noFinished')}</div>}
            {finishedTrips.map(trip => (
              <ArchiveTripRow key={trip.id} trip={trip} routeMap={routeMap} dailyCosts={dailyCosts} onOpen={onOpenTrip} onApproveKm={onApproveKm} t={t} locale={locale} />
            ))}
          </div>
        </div>
      </div>

      {filteredTrips.length === 0 && filteredVirtual.length === 0 && (
        <div className="driver-empty-row" style={{ marginTop: '16px' }}>
          <AlertTriangle size={14} /> {t('course.archive.noMatches')}
        </div>
      )}
    </div>
  );
}
