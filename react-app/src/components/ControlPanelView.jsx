import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CreditCard,
  Gauge,
  Package,
  RefreshCw,
  Timer,
  Truck,
  UserX,
  Users,
  WashingMachine,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../hooks/useAppData';
import { getLaundryWorkflow } from '../lib/laundryRpc';
import { getDispatchBoard } from '../lib/courseRpc';
import { getDriverCardReminders, getMyWorkTime, getWorkScheduleMonth } from '../lib/readRpc';
import { getDriverCardReminder } from '../lib/driverCardReminder';
import { calculateLaundryDayMetrics } from '../lib/laundryDayPlan';
import { departureDateOf, plannedWashDateOf } from '../lib/laundryWashDates';
import { activePhysicalTrolleyCycles, buildTrolleyOccupancy } from '../lib/trolleyOccupancy';
import { effectiveServiceRules, isEveryWorkdayService } from '../lib/serviceSchedule';
import { currentLocale, monthNames, operationalYmd } from '../lib/dateUtils';
import { formatWorkDuration } from '../lib/workTime';
import { VEHICLE_LABELS } from '../lib/vehicles';
import { getRouteColorByDisplay } from '../lib/visualSystem';
import {
  buildMyMonthHours,
  buildTeamDay,
  buildUpcomingAbsences,
  collectApprovals,
} from '../lib/controlPanelMetrics';

const REFRESH_MS = 60000;
const DEFAULT_TROLLEY_COUNT = 25;
const APPROVALS_VISIBLE = 8;

const EMPTY_REMOTE = {
  trolleys: [],
  arrivalReservations: [],
  trolleyCount: DEFAULT_TROLLEY_COUNT,
  boardTrips: [],
  schedule: null,
  driverCards: [],
  myWork: null,
};

function formatNumber(value, digits = 1) {
  return Number(value || 0).toLocaleString(currentLocale(), {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function percent(part, total) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((part / total) * 100)));
}

function signed(value) {
  if (!value) return '0';
  return `${value > 0 ? '+' : '−'}${formatNumber(Math.abs(value))}`;
}

function greetingKey(date) {
  const hour = date.getHours();
  if (hour < 11) return 'controlPanel.greetingMorning';
  if (hour < 18) return 'controlPanel.greetingDay';
  return 'controlPanel.greetingEvening';
}

function KpiCard({ icon: Icon, tone = 'blue', label, value, unit, detail, progress, to }) {
  return (
    <Link to={to} className={`cp-kpi tone-${tone}`}>
      <span className="cp-kpi-head">
        <span className="cp-kpi-icon" aria-hidden="true"><Icon size={18} strokeWidth={2} /></span>
        <span className="cp-kpi-label">{label}</span>
        <ChevronRight className="cp-kpi-chevron" size={16} aria-hidden="true" />
      </span>
      <span className="cp-kpi-value">
        {value}
        {unit && <small>{unit}</small>}
      </span>
      {typeof progress === 'number' && (
        <span className="cp-progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </span>
      )}
      {detail && <span className="cp-kpi-detail">{detail}</span>}
    </Link>
  );
}

function CardHeader({ icon: Icon, title, count, tone = 'neutral', to, linkLabel }) {
  return (
    <header className="cp-card-head">
      <span className="cp-card-title">
        <Icon size={17} aria-hidden="true" />
        <h3>{title}</h3>
        {typeof count === 'number' && <span className={`cp-count tone-${tone}`}>{count}</span>}
      </span>
      {to && (
        <Link to={to} className="cp-card-link">
          {linkLabel}
          <ChevronRight size={14} aria-hidden="true" />
        </Link>
      )}
    </header>
  );
}

function EmptyState({ icon: Icon, title, detail }) {
  return (
    <div className="cp-empty">
      <span className="cp-empty-icon" aria-hidden="true"><Icon size={20} /></span>
      <strong>{title}</strong>
      {detail && <span>{detail}</span>}
    </div>
  );
}

function RouteBadge({ trip }) {
  const color = getRouteColorByDisplay(trip.route_display || 1);
  return (
    <span className="cp-route-badge" style={{ color, background: `${color}1F` }}>
      T{trip.route_display || '—'}
    </span>
  );
}

function ApprovalRow({ item, t, locale }) {
  if (item.kind === 'settlement') {
    const parts = [
      item.kmPending && t('controlPanel.approvals.km', { km: item.trip.end_km }),
      item.hoursPending && t('controlPanel.approvals.hours', { hours: item.trip.reported_hours || '—' }),
    ].filter(Boolean);
    return (
      <Link to="/routes" className="cp-row">
        <span className="cp-row-icon tone-amber" aria-hidden="true"><Gauge size={16} /></span>
        <span className="cp-row-body">
          <strong>{t('controlPanel.approvals.settlementTitle', { driver: item.trip.driver_name || t('controlPanel.noDriverName') })}</strong>
          <small>{[item.trip.route_name, ...parts].filter(Boolean).join(' · ')}</small>
        </span>
        <ChevronRight size={15} className="cp-row-chevron" aria-hidden="true" />
      </Link>
    );
  }

  if (item.kind === 'workTime') {
    const { report } = item;
    const date = report.work_date
      ? new Date(`${report.work_date}T00:00:00`).toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: '2-digit' })
      : '—';
    const time = report.reported_start && report.reported_end
      ? `${String(report.reported_start).slice(0, 5)}–${String(report.reported_end).slice(0, 5)}`
      : null;
    return (
      <Link to="/grafik" className="cp-row">
        <span className="cp-row-icon tone-amber" aria-hidden="true"><Clock3 size={16} /></span>
        <span className="cp-row-body">
          <strong>{t('controlPanel.approvals.workTimeTitle', { name: report.employee_name || '—' })}</strong>
          <small>{[date, time, report.reported_minutes ? formatWorkDuration(report.reported_minutes) : null].filter(Boolean).join(' · ')}</small>
        </span>
        <ChevronRight size={15} className="cp-row-chevron" aria-hidden="true" />
      </Link>
    );
  }

  if (item.kind === 'noDriver') {
    return (
      <Link to="/routes" className="cp-row">
        <span className="cp-row-icon tone-red" aria-hidden="true"><UserX size={16} /></span>
        <span className="cp-row-body">
          <strong>{t('controlPanel.approvals.noDriverTitle', { route: item.trip.route_name || `T${item.trip.route_display || ''}` })}</strong>
          <small>{t('controlPanel.approvals.noDriverDetail')}</small>
        </span>
        <ChevronRight size={15} className="cp-row-chevron" aria-hidden="true" />
      </Link>
    );
  }

  const { reminder } = item;
  const detail = reminder.state === 'missing'
    ? t('controlPanel.approvals.cardMissing')
    : reminder.daysRemaining < 0
      ? t('controlPanel.approvals.cardOverdue', { count: Math.abs(reminder.daysRemaining) })
      : t('controlPanel.approvals.cardDueSoon', { count: reminder.daysRemaining });
  return (
    <Link to="/grafik" className="cp-row">
      <span className={`cp-row-icon ${reminder.state === 'dueSoon' ? 'tone-blue' : 'tone-red'}`} aria-hidden="true"><CreditCard size={16} /></span>
      <span className="cp-row-body">
        <strong>{t('controlPanel.approvals.cardTitle', { name: reminder.name || '—' })}</strong>
        <small>{detail}</small>
      </span>
      <ChevronRight size={15} className="cp-row-chevron" aria-hidden="true" />
    </Link>
  );
}

export default function ControlPanelView() {
  const { t } = useTranslation();
  const { sessionToken, user } = useAuth();
  const { entries, routes, clients } = useAppData();
  const [remote, setRemote] = useState(EMPTY_REMOTE);
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);

  const todayKey = operationalYmd();
  const [year, month, day] = todayKey.split('-').map(Number);
  const locale = currentLocale();

  const load = useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    const [laundryRes, boardRes, scheduleRes, cardsRes, myWorkRes] = await Promise.allSettled([
      getLaundryWorkflow(sessionToken),
      getDispatchBoard(sessionToken, todayKey),
      getWorkScheduleMonth(sessionToken, year, month),
      getDriverCardReminders(sessionToken),
      getMyWorkTime(sessionToken, year, month),
    ]);

    const nextIssues = [];
    if (laundryRes.status === 'rejected') nextIssues.push(t('controlPanel.issues.laundry'));
    if (boardRes.status === 'rejected') nextIssues.push(t('controlPanel.issues.routes'));
    if (scheduleRes.status === 'rejected') nextIssues.push(t('controlPanel.issues.schedule'));
    if (cardsRes.status === 'rejected') nextIssues.push(t('controlPanel.issues.driverCards'));
    if (myWorkRes.status === 'rejected') nextIssues.push(t('controlPanel.issues.myHours'));

    const laundry = laundryRes.status === 'fulfilled' ? laundryRes.value : null;
    setRemote({
      trolleys: laundry?.trolleys || [],
      arrivalReservations: laundry?.arrival_reservations || [],
      trolleyCount: Math.max(1, Math.min(99, Number(laundry?.trolley_count) || DEFAULT_TROLLEY_COUNT)),
      boardTrips: boardRes.status === 'fulfilled' ? (boardRes.value?.trips || []) : [],
      schedule: scheduleRes.status === 'fulfilled' ? scheduleRes.value : null,
      driverCards: cardsRes.status === 'fulfilled' ? (cardsRes.value?.cards || []) : [],
      myWork: myWorkRes.status === 'fulfilled' ? myWorkRes.value : null,
    });
    setIssues(nextIssues);
    setUpdatedAt(new Date());
    setLoading(false);
  }, [month, sessionToken, t, todayKey, year]);

  useEffect(() => {
    load();
    const interval = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [load]);

  const laundry = useMemo(() => {
    const scheduleByRoute = new Map(routes.map(route => [route.id, route.schedule || 'other']));
    const dailyServiceByClient = new Map(clients.map(client => [
      client.name,
      isEveryWorkdayService(effectiveServiceRules(client, routes)),
    ]));
    const metrics = calculateLaundryDayMetrics(
      entries,
      todayKey,
      entry => plannedWashDateOf(entry, scheduleByRoute, dailyServiceByClient),
      departureDateOf,
    );
    const activeCycles = activePhysicalTrolleyCycles(remote.trolleys);
    const occupied = buildTrolleyOccupancy(activeCycles, remote.arrivalReservations).size;
    const atClient = activeCycles.filter(cycle => cycle.status === 'at_client').length;
    return {
      ...metrics,
      remainingKg: Math.max(0, Number((metrics.plannedKg - metrics.washedKg).toFixed(1))),
      occupied,
      atClient,
      free: Math.max(0, remote.trolleyCount - occupied),
    };
  }, [clients, entries, remote.arrivalReservations, remote.trolleyCount, remote.trolleys, routes, todayKey]);

  const team = useMemo(() => {
    const schedule = remote.schedule;
    const input = {
      roster: schedule?.roster || [],
      scheduleEntries: schedule?.schedule_entries || [],
      employmentPeriods: schedule?.employment_periods || [],
      year,
      month,
    };
    return {
      today: buildTeamDay({ ...input, day }),
      upcoming: buildUpcomingAbsences({ ...input, fromDay: day + 1, days: 7 }),
    };
  }, [day, month, remote.schedule, year]);

  const myHours = useMemo(() => buildMyMonthHours({
    employee: remote.myWork?.employee || null,
    scheduleEntries: remote.myWork?.schedule_entries || [],
    year,
    month,
  }), [month, remote.myWork, year]);

  const approvals = useMemo(() => collectApprovals({
    workTimeReports: remote.schedule?.work_time_reports || [],
    boardTrips: remote.boardTrips,
    driverCardReminders: remote.driverCards.map(card => getDriverCardReminder(card, new Date())),
  }), [remote.boardTrips, remote.driverCards, remote.schedule]);

  const trips = useMemo(() => {
    const byStatus = status => remote.boardTrips.filter(trip => !trip.isVirtual && trip.board_status === status);
    return {
      active: byStatus('active'),
      ready: byStatus('ready'),
      planning: byStatus('planning'),
      settlement: byStatus('settlement'),
      closed: byStatus('closed'),
    };
  }, [remote.boardTrips]);

  const now = new Date();
  const firstName = String(user?.name || '').split(/\s+/)[0] || user?.username || '';
  // Liczby dotyczą dnia operacyjnego (w niedzielę: sobota), tak jak w Pralni i Dyspozytorni.
  const rawDateLabel = new Date(year, month - 1, day).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const dateLabel = rawDateLabel.charAt(0).toUpperCase() + rawDateLabel.slice(1);
  const monthLabel = monthNames()[month - 1] || '';
  const visibleApprovals = approvals.slice(0, APPROVALS_VISIBLE);
  const hiddenApprovals = approvals.length - visibleApprovals.length;
  const formatDayRange = (item) => {
    const toLabel = dayNumber => new Date(year, month - 1, dayNumber).toLocaleDateString(locale, { weekday: 'short', day: 'numeric' });
    return item.firstDay === item.lastDay ? toLabel(item.firstDay) : `${toLabel(item.firstDay)} – ${toLabel(item.lastDay)}`;
  };

  return (
    <div className="cp">
      <header className="cp-head">
        <div>
          <p className="cp-eyebrow">{dateLabel}</p>
          <h2>{t(greetingKey(now), { name: firstName })}</h2>
          <p className="cp-subtitle">{t('controlPanel.subtitle')}</p>
        </div>
        <button type="button" className="cp-refresh" onClick={load} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'spin' : ''} aria-hidden="true" />
          <span>
            {updatedAt
              ? t('controlPanel.updatedAt', { time: updatedAt.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) })
              : t('common.loading')}
          </span>
        </button>
      </header>

      {issues.length > 0 && (
        <div className="cp-issues" role="status">
          <AlertTriangle size={16} aria-hidden="true" />
          <span><strong>{t('controlPanel.issues.title')}</strong> {issues.join(' · ')}</span>
        </div>
      )}

      <section className="cp-kpis" aria-label={t('controlPanel.kpisLabel')}>
        <KpiCard
          icon={WashingMachine}
          tone="blue"
          label={t('controlPanel.kpi.laundry')}
          value={formatNumber(laundry.plannedKg)}
          unit="kg"
          progress={percent(laundry.washedKg, laundry.plannedKg)}
          detail={t('controlPanel.kpi.laundryDetail', {
            washed: formatNumber(laundry.washedKg),
            remaining: formatNumber(laundry.remainingKg),
            departure: formatNumber(laundry.departureKg),
          })}
          to="/wash"
        />
        <KpiCard
          icon={Package}
          tone={laundry.free === 0 ? 'red' : laundry.free <= 3 ? 'amber' : 'teal'}
          label={t('controlPanel.kpi.trolleys')}
          value={`${laundry.occupied}/${remote.trolleyCount}`}
          progress={percent(laundry.occupied, remote.trolleyCount)}
          detail={t('controlPanel.kpi.trolleysDetail', { free: laundry.free, atClient: laundry.atClient })}
          to="/wash"
        />
        <KpiCard
          icon={Users}
          tone="green"
          label={t('controlPanel.kpi.team')}
          value={`${team.today.working}/${team.today.total}`}
          progress={percent(team.today.working, team.today.total)}
          detail={t('controlPanel.kpi.teamDetail', { absent: team.today.absentCount, off: team.today.off })}
          to="/grafik"
        />
        <KpiCard
          icon={Timer}
          tone={myHours && myHours.diff < 0 ? 'amber' : 'violet'}
          label={t('controlPanel.kpi.myHours', { month: monthLabel })}
          value={myHours ? formatNumber(myHours.hours) : '—'}
          unit={myHours ? 'h' : undefined}
          progress={myHours ? percent(myHours.hours, myHours.norm) : undefined}
          detail={myHours
            ? t('controlPanel.kpi.myHoursDetail', { norm: formatNumber(myHours.norm), diff: signed(myHours.diff) })
            : t('controlPanel.kpi.myHoursMissing')}
          to="/grafik"
        />
      </section>

      <div className="cp-grid">
        <section className="cp-card cp-approvals">
          <CardHeader
            icon={CheckCircle2}
            title={t('controlPanel.approvals.title')}
            count={approvals.length}
            tone={approvals.length ? 'amber' : 'green'}
          />
          {approvals.length ? (
            <div className="cp-rows">
              {visibleApprovals.map(item => <ApprovalRow key={item.id} item={item} t={t} locale={locale} />)}
              {hiddenApprovals > 0 && (
                <p className="cp-more">{t('controlPanel.approvals.more', { count: hiddenApprovals })}</p>
              )}
            </div>
          ) : (
            <EmptyState
              icon={CheckCircle2}
              title={t('controlPanel.approvals.emptyTitle')}
              detail={t('controlPanel.approvals.emptyDetail')}
            />
          )}
        </section>

        <section className="cp-card cp-live">
          <CardHeader
            icon={Truck}
            title={t('controlPanel.live.title')}
            count={trips.active.length}
            tone="blue"
            to="/routes"
            linkLabel={t('controlPanel.live.open')}
          />
          {trips.active.length ? (
            <div className="cp-rows">
              {trips.active.map(trip => {
                const done = Number(trip.stops_completed) || 0;
                const total = Number(trip.stops_total) || 0;
                return (
                  <Link to="/routes" className="cp-trip" key={trip.id}>
                    <span className="cp-trip-top">
                      <RouteBadge trip={trip} />
                      <strong>{trip.driver_name || t('controlPanel.noDriverName')}</strong>
                      {trip.car && <span className="cp-chip">{VEHICLE_LABELS[trip.car] || trip.car}</span>}
                      <span className="cp-trip-count">{done}/{total}</span>
                    </span>
                    <span className="cp-progress" aria-hidden="true"><span style={{ width: `${percent(done, total)}%` }} /></span>
                    <small>
                      {trip.current_stop_name
                        ? t('controlPanel.live.nextStop', { name: trip.current_stop_name })
                        : (trip.route_name || t('controlPanel.live.noNextStop'))}
                    </small>
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={Truck} title={t('controlPanel.live.emptyTitle')} detail={t('controlPanel.live.emptyDetail')} />
          )}
          <dl className="cp-stats">
            <div><dt>{t('controlPanel.live.ready')}</dt><dd>{trips.ready.length}</dd></div>
            <div><dt>{t('controlPanel.live.planning')}</dt><dd>{trips.planning.length}</dd></div>
            <div><dt>{t('controlPanel.live.settlement')}</dt><dd>{trips.settlement.length}</dd></div>
            <div><dt>{t('controlPanel.live.closed')}</dt><dd>{trips.closed.length}</dd></div>
          </dl>
        </section>

        <section className="cp-card cp-team">
          <CardHeader
            icon={Users}
            title={t('controlPanel.team.title')}
            to="/grafik"
            linkLabel={t('controlPanel.team.open')}
          />
          {team.today.groups.length > 0 ? (
            <div className="cp-groups">
              {team.today.groups.map(group => (
                <div className="cp-group" key={group.name}>
                  <span className="cp-group-name">{group.name}</span>
                  <span className="cp-group-value">{group.working}/{group.total}</span>
                  <span className="cp-progress" aria-hidden="true"><span style={{ width: `${percent(group.working, group.total)}%` }} /></span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Users} title={t('controlPanel.team.emptyTitle')} />
          )}

          <h4 className="cp-subhead">{t('controlPanel.team.absentToday')}</h4>
          {team.today.absent.length ? (
            <ul className="cp-people">
              {team.today.absent.map(person => (
                <li key={person.id}>
                  <span>{person.name}</span>
                  <span className={`cp-status status-${person.value.toLowerCase()}`}>{person.value}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="cp-muted">{t('controlPanel.team.nobodyAbsent')}</p>
          )}

          <h4 className="cp-subhead">{t('controlPanel.team.upcoming')}</h4>
          {team.upcoming.length ? (
            <ul className="cp-people">
              {team.upcoming.map(item => (
                <li key={item.id}>
                  <span>{item.name}<small>{formatDayRange(item)}</small></span>
                  <span className={`cp-status status-${item.value.toLowerCase()}`}>{item.value}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="cp-muted">{t('controlPanel.team.noUpcoming')}</p>
          )}
        </section>
      </div>
    </div>
  );
}
