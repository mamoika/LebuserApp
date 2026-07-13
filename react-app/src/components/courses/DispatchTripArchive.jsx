import { useMemo, useState } from 'react';
import {
  AlertTriangle, CalendarDays, CheckCircle2, Clock3, Gauge, RotateCcw,
  Search, SlidersHorizontal, Truck, UserRound,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { bulkApprovePendingKm, pendingKmTrips, tripKmApproval } from '../../lib/courseKmHelpers';
import { formatCourseTime } from '../../lib/courseLocale';
import {
  ARCHIVE_STATUS,
  archiveStatusCounts,
  archiveTripMatches,
  archiveTripStatus,
  groupArchiveTripsByDate,
} from '../../lib/dispatchArchiveHelpers';
import { logAction } from '../../lib/logger';
import { parseRouteIds } from '../../lib/tripUiHelpers';
import { toastError, toastSuccess } from '../../lib/toast';
import { VEHICLE_LABELS } from '../../lib/vehicles';
import { routeBadgeStyle } from '../../lib/visualSystem';
import { TripProgressBar } from './CourseUiBits';
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

function driverInitials(name, fallback) {
  if (!name) return fallback;
  return name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
}

function ArchiveTripCard({ trip, routeMap, dailyCosts, onOpen, onApproveKm, t, locale }) {
  const stats = trip._stats || { stops: 0, delivered: 0, picked: 0, kg: 0, dirtyTrolleys: 0, dirtyStops: 0, totalStops: 0 };
  const kmApproval = tripKmApproval(trip, dailyCosts);
  const routeIds = [...parseRouteIds(trip.routes)];
  const status = archiveTripStatus(trip);
  const canOpen = !trip.isVirtual && Boolean(onOpen);
  const statusLabels = {
    [ARCHIVE_STATUS.LIVE]: t('course.archive.statusLive'),
    [ARCHIVE_STATUS.PLANNED]: t('course.archive.statusPlanned'),
    [ARCHIVE_STATUS.FINISHED]: t('course.archive.statusFinished'),
  };
  const openTrip = () => { if (canOpen) onOpen(trip); };
  const CourseMain = canOpen ? 'button' : 'div';

  return (
    <article className={`archive-course-card is-${status} ${canOpen ? 'is-clickable' : ''}`}>
      <CourseMain
        className="archive-course-main"
        {...(canOpen ? { type: 'button', onClick: openTrip, title: t('course.archive.openTrip') } : {})}
      >
        <div className="archive-course-card-top">
          <div className="archive-course-routes">
            {routeIds.length > 0
              ? routeIds.map(id => <RouteBadge key={id} routeId={id} routeMap={routeMap} />)
              : <span className="archive-course-route-name">{trip.route_name || t('course.dailyCourse')}</span>}
            {trip.route_name && routeIds.length > 0 && <span className="archive-course-route-name">{trip.route_name}</span>}
          </div>
          <span className={`archive-status-pill is-${status}`}>
            <span aria-hidden="true" />{statusLabels[status]}
          </span>
        </div>

        <div className="archive-course-person">
          <div className="archive-course-avatar" aria-hidden="true">
            {driverInitials(trip.driver_name, trip.isVirtual ? '—' : '?')}
          </div>
          <div className="archive-course-person-copy">
            <strong>{trip.driver_name || t('course.noDriver')}</strong>
            <span>
              <Truck size={13} aria-hidden="true" />
              {trip.car ? (VEHICLE_LABELS[trip.car] || trip.car) : t('course.unassigned')}
            </span>
          </div>
          <div className="archive-course-time">
            <Clock3 size={13} aria-hidden="true" />
            {trip.started_at ? formatCourseTime(trip.started_at, locale) : '—'}
            {trip.ended_at ? `–${formatCourseTime(trip.ended_at, locale)}` : ''}
          </div>
        </div>

        {!trip.isVirtual && stats.stops > 0 && (
          <div className="archive-course-progress">
            <div className="archive-course-progress-label">
              <span>{t('course.archive.courseProgress')}</span>
              <strong>{stats.delivered}/{stats.stops}</strong>
            </div>
            <TripProgressBar stats={stats} />
          </div>
        )}
      </CourseMain>

      <div className="archive-course-footer">
        <div className="archive-course-facts">
          <span><strong>{stats.totalStops || 0}</strong> {t('course.archive.points')}</span>
          {stats.kg > 0 && <span><strong>{stats.kg}</strong> kg</span>}
          {stats.dirtyTrolleys > 0 && <span><strong>{stats.dirtyTrolleys}</strong> {t('course.archive.trolleys')}</span>}
        </div>
        {trip.end_km && (
          <span className={`archive-km-state ${kmApproval.approved ? 'is-approved' : 'is-pending'}`}>
            <Gauge size={13} aria-hidden="true" /> {trip.end_km} km {kmApproval.approved ? '✓' : '…'}
          </span>
        )}
        {trip.status === 'finished' && !kmApproval.approved && trip.end_km && onApproveKm && (
          <button
            type="button"
            className="archive-km-action"
            onClick={() => onApproveKm(trip)}
          >
            {t('course.archive.approveKmShort')}
          </button>
        )}
      </div>
    </article>
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
  onReload,
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('de') ? 'de-DE' : 'pl-PL';
  const unassignedLabel = t('course.unassignedDriver');
  const [query, setQuery] = useState('');
  const [filterDriver, setFilterDriver] = useState('');
  const [filterCar, setFilterCar] = useState('');
  const [filterRoute, setFilterRoute] = useState('');
  const [filterStatus, setFilterStatus] = useState(ARCHIVE_STATUS.ALL);

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
    _archiveDriverName: trip.driver_name || t('course.unknownDriver'),
    _stats: statsFromCourseStops(trip.stops || [], entries, trip.trip_date),
  })), [allTrips, entries, t]);

  const combinedTrips = useMemo(() => [
    ...virtualTrips.map(trip => ({ ...trip, _archiveDriverName: trip.driver_name || unassignedLabel })),
    ...enrichedTrips,
  ], [enrichedTrips, unassignedLabel, virtualTrips]);
  const counts = useMemo(() => archiveStatusCounts(combinedTrips), [combinedTrips]);
  const filteredTrips = useMemo(() => combinedTrips.filter(trip => archiveTripMatches(trip, {
    query,
    driver: filterDriver,
    car: filterCar,
    route: filterRoute,
    status: filterStatus,
  })), [combinedTrips, filterCar, filterDriver, filterRoute, filterStatus, query]);
  const groupedTrips = useMemo(() => groupArchiveTripsByDate(filteredTrips), [filteredTrips]);
  const pendingKm = useMemo(() => pendingKmTrips(allTrips, dailyCosts), [allTrips, dailyCosts]);
  const filtersActive = Boolean(query || filterDriver || filterCar || filterRoute || filterStatus !== ARCHIVE_STATUS.ALL);

  const statusTabs = [
    [ARCHIVE_STATUS.ALL, t('course.archive.statusAll'), counts.all],
    [ARCHIVE_STATUS.LIVE, t('course.archive.liveTrips'), counts.live],
    [ARCHIVE_STATUS.PLANNED, t('course.archive.plannedTrips'), counts.planned],
    [ARCHIVE_STATUS.FINISHED, t('course.archive.finishedTrips'), counts.finished],
  ];

  const clearFilters = () => {
    setQuery('');
    setFilterDriver('');
    setFilterCar('');
    setFilterRoute('');
    setFilterStatus(ARCHIVE_STATUS.ALL);
  };

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

  const formatGroupDate = date => {
    if (!date || date === 'unknown') return t('course.archive.unknownDate');
    return new Intl.DateTimeFormat(locale, {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }).format(new Date(`${date}T12:00:00`));
  };

  return (
    <div className="live-dispatch-archive">
      <div className="archive-overview" aria-label={t('course.archive.summary')}>
        <div className="archive-overview-card is-total">
          <span className="archive-overview-icon"><CalendarDays size={18} /></span>
          <div><strong>{counts.all}</strong><span>{t('course.archive.allCourses')}</span></div>
        </div>
        <div className="archive-overview-card is-live">
          <span className="archive-overview-icon"><Truck size={18} /></span>
          <div><strong>{counts.live}</strong><span>{t('course.archive.liveTrips')}</span></div>
        </div>
        <div className="archive-overview-card is-planned">
          <span className="archive-overview-icon"><Clock3 size={18} /></span>
          <div><strong>{counts.planned}</strong><span>{t('course.archive.plannedTrips')}</span></div>
        </div>
        <div className="archive-overview-card is-finished">
          <span className="archive-overview-icon"><CheckCircle2 size={18} /></span>
          <div><strong>{counts.finished}</strong><span>{t('course.archive.finishedTrips')}</span></div>
        </div>
      </div>

      {pendingKm.length > 0 && (
        <div className="archive-attention-bar">
          <div className="archive-attention-copy">
            <span className="archive-attention-icon"><Gauge size={18} /></span>
            <div><strong>{t('course.archive.pendingKmTitle')}</strong><span>{t('course.archive.pendingKmAlert', { count: pendingKm.length })}</span></div>
          </div>
          <button type="button" onClick={approveAllKm} disabled={busy}>
            <CheckCircle2 size={15} /> {t('course.archive.approveAllKm', { count: pendingKm.length })}
          </button>
        </div>
      )}

      <section className="archive-workspace" aria-labelledby="archive-results-title">
        <div className="archive-status-tabs" role="group" aria-label={t('course.archive.filterStatus')}>
          {statusTabs.map(([status, label, count]) => (
            <button
              key={status}
              type="button"
              aria-pressed={filterStatus === status}
              className={filterStatus === status ? 'is-active' : ''}
              onClick={() => setFilterStatus(status)}
            >
              {label}<span>{count}</span>
            </button>
          ))}
        </div>

        <div className="archive-filter-panel">
          <label className="archive-search-field">
            <span className="sr-only">{t('course.archive.search')}</span>
            <Search size={17} aria-hidden="true" />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('course.archive.searchPlaceholder')} />
          </label>
          <div className="archive-select-filters">
            <span className="archive-filter-icon"><SlidersHorizontal size={16} aria-hidden="true" /></span>
            <label><span className="sr-only">{t('course.archive.filterDriver')}</span>
              <select value={filterDriver} onChange={event => setFilterDriver(event.target.value)}>
                <option value="">{t('course.archive.allDrivers')}</option>
                {uniqueDrivers.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <label><span className="sr-only">{t('course.archive.filterCar')}</span>
              <select value={filterCar} onChange={event => setFilterCar(event.target.value)}>
                <option value="">{t('course.archive.allCars')}</option>
                {uniqueCars.map(car => <option key={car} value={car}>{VEHICLE_LABELS[car] || car}</option>)}
              </select>
            </label>
            <label><span className="sr-only">{t('course.archive.filterRoute')}</span>
              <select value={filterRoute} onChange={event => setFilterRoute(event.target.value)}>
                <option value="">{t('course.archive.allRoutes')}</option>
                {allRoutes.map(route => (
                  <option key={route.id} value={route.id}>T{routeMap[route.id]?.num || route.id} · {route.name}</option>
                ))}
              </select>
            </label>
          </div>
          {filtersActive && (
            <button type="button" className="archive-clear-filters" onClick={clearFilters}>
              <RotateCcw size={14} /> {t('course.archive.clearFilters')}
            </button>
          )}
        </div>

        <div className="archive-results-heading">
          <div>
            <span className="archive-results-icon"><UserRound size={16} /></span>
            <h2 id="archive-results-title">{t('course.archive.results')}</h2>
          </div>
          <span>{t('course.archive.resultsCount', { count: filteredTrips.length })}</span>
        </div>

        {groupedTrips.length > 0 ? (
          <div className="archive-date-groups">
            {groupedTrips.map(([date, trips]) => (
              <section className="archive-date-group" key={date}>
                <div className="archive-date-heading">
                  <time dateTime={date === 'unknown' ? undefined : date}>{formatGroupDate(date)}</time>
                  <span>{t('course.archive.coursesOnDate', { count: trips.length })}</span>
                </div>
                <div className="archive-course-grid">
                  {trips.map(trip => (
                    <ArchiveTripCard
                      key={trip.id}
                      trip={trip}
                      routeMap={routeMap}
                      dailyCosts={dailyCosts}
                      onOpen={onOpenTrip}
                      onApproveKm={onApproveKm}
                      t={t}
                      locale={locale}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="archive-empty-state">
            <span><AlertTriangle size={22} /></span>
            <strong>{t('course.archive.noMatches')}</strong>
            <p>{t('course.archive.noMatchesHint')}</p>
            {filtersActive && <button type="button" onClick={clearFilters}>{t('course.archive.clearFilters')}</button>}
          </div>
        )}
      </section>
    </div>
  );
}
