import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Coins,
  CreditCard,
  Gauge,
  Package,
  RefreshCw,
  Scale,
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
import { getCostsMonth, getDriverCardReminders, getDriverTripsData, getMyWorkTime, getWorkScheduleMonth } from '../lib/readRpc';
import { getWeeklyRoutePlan } from '../lib/weeklyRoutePlanRpc';
import { buildVirtualPlannedTrips } from '../lib/tripUiHelpers';
import { summarizeCostsMonth } from '../lib/costsMonthSummary';
import { getDriverCardReminder } from '../lib/driverCardReminder';
import { calculateLaundryDayMetrics } from '../lib/laundryDayPlan';
import { departureDateOf, plannedWashDateOf } from '../lib/laundryWashDates';
import { activePhysicalTrolleyCycles, buildTrolleyOccupancy } from '../lib/trolleyOccupancy';
import { effectiveServiceRules, isEveryWorkdayService } from '../lib/serviceSchedule';
import { currentLocale, monthNames, operationalYmd } from '../lib/dateUtils';
import { calendarTodayYmd, formatWorkDuration } from '../lib/workTime';
import { VEHICLE_LABELS } from '../lib/vehicles';
import { getRouteColorByDisplay } from '../lib/visualSystem';
import {
  buildMyMonthHours,
  buildTeamDay,
  buildUpcomingAbsences,
  collectApprovals,
  nextShiftYmd,
  percentChange,
  prettyGroupName,
  previousMonthSameDay,
} from '../lib/controlPanelMetrics';

const REFRESH_MS = 60000;
const DEFAULT_TROLLEY_COUNT = 25;
const APPROVALS_VISIBLE = 8;
const LOW_TROLLEYS = 3;
const NEXT_SHIFT_FROM_HOUR = 15;
const COURSE_STAGES = ['planning', 'ready', 'active', 'settlement', 'closed'];

const EMPTY_REMOTE = {
  trolleys: [],
  arrivalReservations: [],
  trolleyCount: DEFAULT_TROLLEY_COUNT,
  boardTrips: [],
  schedule: null,
  driverCards: [],
  myWork: null,
  costsMonth: null,
  prevCostsMonth: null,
  next: null,
};

function ymdParts(value) {
  const [year, month, day] = String(value).split('-').map(Number);
  return { year, month, day };
}

function capitalizeFirst(text) {
  const value = String(text || '');
  return value ? value.charAt(0).toLocaleUpperCase() + value.slice(1) : value;
}

function formatNumber(value, digits = 1) {
  return Number(value || 0).toLocaleString(currentLocale(), {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function formatMoney(value) {
  return new Intl.NumberFormat(currentLocale(), { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 }).format(value || 0);
}

function formatMoneyPrecise(value) {
  return new Intl.NumberFormat(currentLocale(), { style: 'currency', currency: 'PLN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);
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

function TrendChip({ value, goodWhenUp, label }) {
  if (value == null) return null;
  const up = value > 0;
  const flat = value === 0;
  const good = flat ? null : (up === goodWhenUp);
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`cp-trend ${good === null ? 'is-flat' : good ? 'is-good' : 'is-bad'}`}>
      {!flat && <Icon size={13} aria-hidden="true" />}
      {`${up ? '+' : flat ? '±' : '−'}${Math.abs(value)}%`}
      <small>{label}</small>
    </span>
  );
}

function KpiCard({ icon: Icon, tone = 'blue', alert = false, label, value, unit, detail, progress, trend, to }) {
  return (
    <Link to={to} className={`cp-kpi tone-${tone} ${alert ? 'is-alert' : ''}`}>
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
      {trend}
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
  const locale = currentLocale();

  // Pralnia i trasy liczą się dla dnia operacyjnego (w niedzielę: sobota), tak jak
  // w Pralni i Dyspozytorni. Nagłówek, zespół i moje godziny — dla prawdziwej daty.
  const todayKey = operationalYmd();
  const calendarKey = calendarTodayYmd();
  const { year, month, day } = ymdParts(calendarKey);
  const isOffDay = todayKey !== calendarKey;
  const nextKey = nextShiftYmd(calendarKey);
  const showNextShift = isOffDay || new Date().getHours() >= NEXT_SHIFT_FROM_HOUR;
  const prev = previousMonthSameDay(year, month, day);

  const load = useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const prevMonthKey = `${prev.year}-${String(prev.month).padStart(2, '0')}`;
    const nextParts = ymdParts(nextKey);
    const nextOtherMonth = nextParts.month !== month || nextParts.year !== year;
    const [laundryRes, boardRes, scheduleRes, cardsRes, myWorkRes, costsRes, prevCostsRes, nextRes] = await Promise.allSettled([
      getLaundryWorkflow(sessionToken),
      getDispatchBoard(sessionToken, todayKey),
      getWorkScheduleMonth(sessionToken, year, month),
      getDriverCardReminders(sessionToken),
      getMyWorkTime(sessionToken, year, month),
      getCostsMonth(sessionToken, monthKey),
      getCostsMonth(sessionToken, prevMonthKey),
      showNextShift
        ? Promise.all([
          getDispatchBoard(sessionToken, nextKey),
          getWeeklyRoutePlan(sessionToken, nextKey),
          getDriverTripsData(sessionToken),
          nextOtherMonth ? getWorkScheduleMonth(sessionToken, nextParts.year, nextParts.month) : Promise.resolve(null),
        ])
        : Promise.resolve(null),
    ]);

    const nextIssues = [];
    if (laundryRes.status === 'rejected') nextIssues.push(t('controlPanel.issues.laundry'));
    if (boardRes.status === 'rejected') nextIssues.push(t('controlPanel.issues.routes'));
    if (scheduleRes.status === 'rejected') nextIssues.push(t('controlPanel.issues.schedule'));
    if (cardsRes.status === 'rejected') nextIssues.push(t('controlPanel.issues.driverCards'));
    if (myWorkRes.status === 'rejected') nextIssues.push(t('controlPanel.issues.myHours'));
    if (costsRes.status === 'rejected') nextIssues.push(t('controlPanel.issues.costs'));
    if (nextRes.status === 'rejected') nextIssues.push(t('controlPanel.issues.nextShift'));

    const laundry = laundryRes.status === 'fulfilled' ? laundryRes.value : null;
    const nextValue = nextRes.status === 'fulfilled' ? nextRes.value : null;
    setRemote({
      trolleys: laundry?.trolleys || [],
      arrivalReservations: laundry?.arrival_reservations || [],
      trolleyCount: Math.max(1, Math.min(99, Number(laundry?.trolley_count) || DEFAULT_TROLLEY_COUNT)),
      boardTrips: boardRes.status === 'fulfilled' ? (boardRes.value?.trips || []) : [],
      schedule: scheduleRes.status === 'fulfilled' ? scheduleRes.value : null,
      driverCards: cardsRes.status === 'fulfilled' ? (cardsRes.value?.cards || []) : [],
      myWork: myWorkRes.status === 'fulfilled' ? myWorkRes.value : null,
      costsMonth: costsRes.status === 'fulfilled' ? costsRes.value : null,
      prevCostsMonth: prevCostsRes.status === 'fulfilled' ? prevCostsRes.value : null,
      next: nextValue
        ? {
          boardTrips: nextValue[0]?.trips || [],
          routePlanTrips: nextValue[1]?.trips || [],
          storedTrips: nextValue[2]?.trips || [],
          schedule: nextValue[3],
        }
        : null,
    });
    setIssues(nextIssues);
    setUpdatedAt(new Date());
    setLoading(false);
  }, [month, nextKey, prev.month, prev.year, sessionToken, showNextShift, t, todayKey, year]);

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
      inLaundry: Math.max(0, activeCycles.length - atClient),
      reserved: Math.max(0, occupied - activeCycles.length),
      free: Math.max(0, remote.trolleyCount - occupied),
    };
  }, [clients, entries, remote.arrivalReservations, remote.trolleyCount, remote.trolleys, routes, todayKey]);

  // Grafik dla dowolnego dnia z bieżącego lub (dla następnej zmiany) kolejnego miesiąca.
  const teamFor = useCallback((ymd, withUpcoming = false) => {
    const parts = ymdParts(ymd);
    const sameMonth = parts.year === year && parts.month === month;
    const schedule = sameMonth ? remote.schedule : remote.next?.schedule;
    if (!schedule) return null;
    const input = {
      roster: schedule.roster || [],
      scheduleEntries: schedule.schedule_entries || [],
      employmentPeriods: schedule.employment_periods || [],
      year: parts.year,
      month: parts.month,
    };
    return {
      day: buildTeamDay({ ...input, day: parts.day }),
      upcoming: withUpcoming ? buildUpcomingAbsences({ ...input, fromDay: parts.day + 1, days: 7 }) : [],
      parts,
    };
  }, [month, remote.next, remote.schedule, year]);

  const teamDayKey = isOffDay ? nextKey : calendarKey;
  const team = useMemo(() => teamFor(teamDayKey, true), [teamDayKey, teamFor]);
  const operationalTeam = useMemo(() => teamFor(todayKey), [teamFor, todayKey]);

  const myHours = useMemo(() => buildMyMonthHours({
    employee: remote.myWork?.employee || null,
    scheduleEntries: remote.myWork?.schedule_entries || [],
    year,
    month,
    uptoDay: day,
  }), [day, month, remote.myWork, year]);

  const costs = useMemo(() => (remote.costsMonth
    ? summarizeCostsMonth({ monthData: remote.costsMonth, year, month, todayKey: calendarKey })
    : null), [calendarKey, month, remote.costsMonth, year]);

  const prevCosts = useMemo(() => (remote.prevCostsMonth
    ? summarizeCostsMonth({ monthData: remote.prevCostsMonth, year: prev.year, month: prev.month, todayKey: prev.ymd })
    : null), [prev.month, prev.year, prev.ymd, remote.prevCostsMonth]);

  const approvals = useMemo(() => collectApprovals({
    workTimeReports: remote.schedule?.work_time_reports || [],
    boardTrips: remote.boardTrips,
    driverCardReminders: remote.driverCards.map(card => getDriverCardReminder(card, new Date())),
  }), [remote.boardTrips, remote.driverCards, remote.schedule]);

  const trips = useMemo(() => {
    const real = remote.boardTrips.filter(trip => !trip.isVirtual);
    const byStatus = Object.fromEntries(COURSE_STAGES.map(stage => [stage, real.filter(trip => trip.board_status === stage)]));
    return { ...byStatus, total: real.length };
  }, [remote.boardTrips]);

  const nextShift = useMemo(() => {
    if (!showNextShift || !remote.next) return null;
    const virtual = buildVirtualPlannedTrips({
      entries,
      allTrips: remote.next.storedTrips,
      routePlanTrips: remote.next.routePlanTrips,
      tripDate: nextKey,
    });
    const real = remote.next.boardTrips.filter(trip => !trip.isVirtual);
    const nextTeam = teamFor(nextKey);
    return {
      courses: real.length + virtual.length,
      noDriver: virtual.length + real.filter(trip => !trip.driver_id).length,
      team: nextTeam?.day || null,
    };
  }, [entries, nextKey, remote.next, showNextShift, teamFor]);

  const now = new Date();
  const firstName = String(user?.name || '').split(/\s+/)[0] || user?.username || '';
  const dateLabel = capitalizeFirst(new Date(year, month - 1, day).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }));
  const shortDate = ymd => capitalizeFirst(new Date(`${ymd}T00:00:00`).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' }));
  const longDate = ymd => capitalizeFirst(new Date(`${ymd}T00:00:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }));
  const monthLabel = monthNames()[month - 1] || '';
  const prevMonthLabel = monthNames()[prev.month - 1] || '';
  const visibleApprovals = approvals.slice(0, APPROVALS_VISIBLE);
  const hiddenApprovals = approvals.length - visibleApprovals.length;
  const formatDayRange = (item) => {
    const { year: y, month: m } = team?.parts || { year, month };
    const toLabel = dayNumber => new Date(y, m - 1, dayNumber).toLocaleDateString(locale, { weekday: 'short', day: 'numeric' });
    return item.firstDay === item.lastDay ? toLabel(item.firstDay) : `${toLabel(item.firstDay)} – ${toLabel(item.lastDay)}`;
  };

  const lowTrolleys = !loading && laundry.free <= LOW_TROLLEYS;
  const nextNoDriver = nextShift?.noDriver || 0;
  const attentionCount = approvals.length + (lowTrolleys ? 1 : 0) + (nextNoDriver ? 1 : 0);

  const costsTrend = costs && prevCosts ? percentChange(costs.plnPerKg, prevCosts.plnPerKg) : null;
  const tonnageTrend = costs && prevCosts ? percentChange(costs.kg, prevCosts.kg) : null;

  return (
    <div className="cp">
      <header className="cp-head">
        <div>
          <p className="cp-eyebrow">{dateLabel}</p>
          <h2>{t(greetingKey(now), { name: firstName })}</h2>
          <p className="cp-subtitle">
            {isOffDay
              ? t('controlPanel.offDaySubtitle', { date: longDate(nextKey) })
              : t('controlPanel.subtitle')}
          </p>
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

      {attentionCount > 0 ? (
        <section className="cp-card cp-attention" aria-labelledby="cp-attention-title">
          <header className="cp-card-head">
            <span className="cp-card-title">
              <AlertTriangle size={17} aria-hidden="true" />
              <h3 id="cp-attention-title">{t('controlPanel.attention.title')}</h3>
              <span className="cp-count tone-amber">{attentionCount}</span>
            </span>
          </header>
          <div className="cp-attention-rows">
            {nextNoDriver > 0 && (
              <Link to="/routes" className="cp-row">
                <span className="cp-row-icon tone-red" aria-hidden="true"><UserX size={16} /></span>
                <span className="cp-row-body">
                  <strong>{t('controlPanel.attention.nextNoDriverTitle', { count: nextNoDriver })}</strong>
                  <small>{t('controlPanel.attention.nextNoDriverDetail', { date: shortDate(nextKey) })}</small>
                </span>
                <ChevronRight size={15} className="cp-row-chevron" aria-hidden="true" />
              </Link>
            )}
            {lowTrolleys && (
              <Link to="/wash" className="cp-row">
                <span className={`cp-row-icon ${laundry.free === 0 ? 'tone-red' : 'tone-amber'}`} aria-hidden="true"><Package size={16} /></span>
                <span className="cp-row-body">
                  <strong>{t('controlPanel.attention.lowTrolleysTitle')}</strong>
                  <small>{t('controlPanel.attention.lowTrolleysDetail', { free: laundry.free, total: remote.trolleyCount })}</small>
                </span>
                <ChevronRight size={15} className="cp-row-chevron" aria-hidden="true" />
              </Link>
            )}
            {visibleApprovals.map(item => <ApprovalRow key={item.id} item={item} t={t} locale={locale} />)}
          </div>
          {hiddenApprovals > 0 && <p className="cp-more">{t('controlPanel.approvals.more', { count: hiddenApprovals })}</p>}
        </section>
      ) : (
        <div className="cp-all-clear" role="status">
          <CheckCircle2 size={16} aria-hidden="true" />
          <span>{t('controlPanel.attention.allClear')}</span>
        </div>
      )}

      {nextShift && (
        <Link to="/routes" className="cp-next">
          <span className="cp-next-icon" aria-hidden="true"><CalendarClock size={18} /></span>
          <span className="cp-next-body">
            <small>{t('controlPanel.next.title')}</small>
            <strong>{longDate(nextKey)}</strong>
          </span>
          <span className="cp-next-facts">
            <span className="cp-next-fact"><Truck size={14} aria-hidden="true" />{t('controlPanel.next.courses', { count: nextShift.courses })}</span>
            {nextShift.noDriver > 0 && (
              <span className="cp-next-fact is-warning"><UserX size={14} aria-hidden="true" />{t('controlPanel.next.noDriver', { count: nextShift.noDriver })}</span>
            )}
            {nextShift.team && (
              <span className="cp-next-fact"><Users size={14} aria-hidden="true" />{t('controlPanel.next.team', { working: nextShift.team.working, total: nextShift.team.total })}</span>
            )}
            {nextShift.team?.absentCount > 0 && (
              <span className="cp-next-fact is-warning">{t('controlPanel.next.absent', { count: nextShift.team.absentCount })}</span>
            )}
          </span>
          <ChevronRight size={16} className="cp-row-chevron" aria-hidden="true" />
        </Link>
      )}

      <section className={`cp-section ${isOffDay ? 'is-past' : ''}`} aria-labelledby="cp-today-title">
        <div className="cp-section-head">
          <h3 id="cp-today-title">{isOffDay ? t('controlPanel.today.lastWorkday') : t('controlPanel.today.title')}</h3>
          {isOffDay && <span className="cp-section-note">{longDate(todayKey)}</span>}
        </div>
        <div className="cp-kpis cp-today">
          <KpiCard
            icon={WashingMachine}
            tone="blue"
            label={t('controlPanel.today.laundry')}
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
            tone={laundry.free === 0 ? 'red' : laundry.free <= LOW_TROLLEYS ? 'amber' : 'teal'}
            alert={laundry.free <= LOW_TROLLEYS}
            label={t('controlPanel.today.trolleys')}
            value={`${laundry.occupied}/${remote.trolleyCount}`}
            progress={percent(laundry.occupied, remote.trolleyCount)}
            detail={[
              t('controlPanel.today.trolleysDetail', { free: laundry.free, atClient: laundry.atClient, inLaundry: laundry.inLaundry }),
              laundry.reserved > 0 ? t('controlPanel.today.trolleysReserved', { count: laundry.reserved }) : null,
            ].filter(Boolean).join(' · ')}
            to="/wash"
          />
          <KpiCard
            icon={Users}
            tone="green"
            label={t('controlPanel.today.team')}
            value={operationalTeam ? `${operationalTeam.day.working}/${operationalTeam.day.total}` : '—'}
            progress={operationalTeam ? percent(operationalTeam.day.working, operationalTeam.day.total) : undefined}
            detail={operationalTeam
              ? t('controlPanel.kpi.teamDetail', { absent: operationalTeam.day.absentCount, off: operationalTeam.day.off })
              : t('controlPanel.team.emptyTitle')}
            to="/grafik"
          />
          <KpiCard
            icon={Truck}
            tone="blue"
            label={t('controlPanel.today.courses')}
            value={String(trips.total)}
            progress={trips.total ? percent(trips.closed.length, trips.total) : undefined}
            detail={t('controlPanel.today.coursesDetail', { active: trips.active.length, closed: trips.closed.length })}
            to="/routes"
          />
        </div>
      </section>

      <div className="cp-grid">
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
            <p className="cp-inline-empty"><Truck size={15} aria-hidden="true" />{t('controlPanel.live.emptyTitle')}</p>
          )}
          <dl className="cp-stats">
            {COURSE_STAGES.map(stage => (
              <div key={stage} className={`is-${stage}`}>
                <dt>{t(`course.board.columns.${stage}`)}</dt>
                <dd>{trips[stage].length}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="cp-card cp-team">
          <CardHeader
            icon={Users}
            title={isOffDay ? t('controlPanel.team.titleOn', { date: shortDate(teamDayKey) }) : t('controlPanel.team.title')}
            to="/grafik"
            linkLabel={t('controlPanel.team.open')}
          />
          {team?.day.groups.length ? (
            <div className="cp-groups">
              {team.day.groups.map(group => (
                <div className="cp-group" key={group.name}>
                  <span className="cp-group-name">{prettyGroupName(group.name)}</span>
                  <span className="cp-group-value">{group.working}/{group.total}</span>
                  <span className="cp-progress" aria-hidden="true"><span style={{ width: `${percent(group.working, group.total)}%` }} /></span>
                </div>
              ))}
            </div>
          ) : (
            <p className="cp-inline-empty"><Users size={15} aria-hidden="true" />{t('controlPanel.team.emptyTitle')}</p>
          )}

          <h4 className="cp-subhead">{isOffDay ? t('controlPanel.team.absentOn', { date: shortDate(teamDayKey) }) : t('controlPanel.team.absentToday')}</h4>
          {team?.day.absent.length ? (
            <ul className="cp-people">
              {team.day.absent.map(person => (
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
          {team?.upcoming.length ? (
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

      <section className="cp-section" aria-labelledby="cp-month-title">
        <div className="cp-section-head">
          <h3 id="cp-month-title">{t('controlPanel.month.title', { month: capitalizeFirst(monthLabel) })}</h3>
          <span className="cp-section-note">{t('controlPanel.month.note', { month: prevMonthLabel })}</span>
        </div>
        <div className="cp-kpis cp-month">
          <KpiCard
            icon={Coins}
            tone={costs?.targetCostPerKg && costs.plnPerKg > costs.targetCostPerKg ? 'amber' : 'blue'}
            alert={Boolean(costs?.targetCostPerKg && costs.plnPerKg > costs.targetCostPerKg)}
            label={t('controlPanel.month.costs')}
            value={costs ? formatMoney(costs.total) : '—'}
            detail={costs
              ? t('controlPanel.kpi.costsDetail', { perKg: formatMoneyPrecise(costs.plnPerKg), perDay: formatMoney(costs.avgPerDay) })
              : t('controlPanel.kpi.costsMissing')}
            trend={<TrendChip value={costsTrend} goodWhenUp={false} label={t('controlPanel.month.perKgVs', { month: prevMonthLabel })} />}
            to="/costs"
          />
          <KpiCard
            icon={Scale}
            tone="teal"
            label={t('controlPanel.month.tonnage')}
            value={costs ? formatNumber(costs.kg / 1000, 1) : '—'}
            unit={costs ? 't' : undefined}
            detail={costs
              ? t('controlPanel.month.tonnageDetail', { perDay: formatNumber(costs.accruedDays ? costs.kg / costs.accruedDays : 0, 0) })
              : t('controlPanel.kpi.costsMissing')}
            trend={<TrendChip value={tonnageTrend} goodWhenUp label={t('controlPanel.month.vs', { month: prevMonthLabel })} />}
            to="/costs"
          />
          <KpiCard
            icon={Timer}
            tone={myHours && myHours.diffToDate < 0 ? 'amber' : 'violet'}
            label={t('controlPanel.month.myHours')}
            value={myHours ? formatNumber(myHours.hours) : '—'}
            unit={myHours ? 'h' : undefined}
            progress={myHours ? percent(myHours.hours, myHours.norm) : undefined}
            detail={myHours
              ? t('controlPanel.month.myHoursDetail', {
                hours: formatNumber(myHours.hoursToDate),
                norm: formatNumber(myHours.normToDate),
                diff: signed(myHours.diffToDate),
                monthNorm: formatNumber(myHours.norm),
              })
              : t('controlPanel.kpi.myHoursMissing')}
            to="/grafik"
          />
        </div>
      </section>
    </div>
  );
}
