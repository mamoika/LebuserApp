import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
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
import AdminAppStatus from './AdminAppStatus';
import AdminDatabaseStatus from './AdminDatabaseStatus';
import { useAppData } from '../hooks/useAppData';
import { getLaundryWorkflow } from '../lib/laundryRpc';
import { getDispatchBoard } from '../lib/courseRpc';
import {
  getControlPanelApprovalBacklog,
  getCostsMonth,
  getDriverCardReminders,
  getMyWorkTime,
  getWorkScheduleMonth,
} from '../lib/readRpc';
import { summarizeCostsMonth } from '../lib/costsMonthSummary';
import { getDriverCardReminder } from '../lib/driverCardReminder';
import { calculateLaundryDayMetrics } from '../lib/laundryDayPlan';
import { departureDateOf, plannedWashDateOf } from '../lib/laundryWashDates';
import { activePhysicalTrolleyCycles, buildTrolleyOccupancy, canUseFreeTrolley } from '../lib/trolleyOccupancy';
import { effectiveServiceRules, isEveryWorkdayService } from '../lib/serviceSchedule';
import { currentLocale, monthNames } from '../lib/dateUtils';
import { calendarTodayYmd, formatWorkDuration } from '../lib/workTime';
import { VEHICLE_LABELS } from '../lib/vehicles';
import { getRouteColorByDisplay } from '../lib/visualSystem';
import {
  buildMyMonthHours,
  buildTeamDay,
  collectApprovals,
  percentChange,
  prettyGroupName,
  previousMonthSameDay,
} from '../lib/controlPanelMetrics';

const REFRESH_MS = 60000;
const DEFAULT_TROLLEY_COUNT = 25;
const APPROVALS_VISIBLE = 8;
const LOW_TROLLEYS = 3;
const COURSE_STAGES = ['planning', 'ready', 'active', 'settlement', 'closed'];

const EMPTY_REMOTE = {
  trolleys: [],
  arrivalReservations: [],
  trolleyCount: DEFAULT_TROLLEY_COUNT,
  trolleyInventory: null,
  boardTrips: [],
  approvalBacklog: null,
  schedule: null,
  driverCards: [],
  myWork: null,
  costsMonth: null,
  prevCostsMonth: null,
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

function ProgressBar({ value = 0, planned = 0 }) {
  const workingWidth = Math.max(0, Math.min(100, Number(value) || 0));
  const plannedWidth = Math.max(0, Math.min(100 - workingWidth, Number(planned) || 0));
  return (
    <span className="cp-progress" aria-hidden="true">
      <span style={{ width: `${workingWidth}%` }} />
      {plannedWidth > 0 && (
        <span className="cp-progress-planned" style={{ left: `${workingWidth}%`, width: `${plannedWidth}%` }} />
      )}
    </span>
  );
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

function KpiStages({ stages }) {
  return (
    <span className="cp-kpi-stages">
      {stages.map(stage => (
        <span key={stage.key} className={`cp-kpi-stage tone-${stage.tone || 'blue'}`}>
          <span className="cp-kpi-stage-head">
            <span>{stage.label}</span>
            <strong>{stage.value}</strong>
          </span>
          <ProgressBar value={stage.progress} />
        </span>
      ))}
    </span>
  );
}

function KpiCard({ icon: Icon, tone = 'blue', alert = false, label, value, unit, detail, progress, plannedProgress, stages, trend, to }) {
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
      {stages?.length ? <KpiStages stages={stages} /> : (typeof progress === 'number' || typeof plannedProgress === 'number') && (
        <ProgressBar value={progress} planned={plannedProgress} />
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
    const date = item.trip.trip_date
      ? new Date(`${item.trip.trip_date}T00:00:00`).toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: '2-digit' })
      : null;
    const parts = [
      date,
      item.kmPending && t('controlPanel.approvals.km', { km: item.trip.end_km }),
      item.hoursPending && t('controlPanel.approvals.hours', { hours: item.trip.reported_hours || '—' }),
    ].filter(Boolean);
    return (
      <Link to={`/routes?date=${item.trip.trip_date || ''}`} className="cp-row">
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
  const { isAdmin, sessionToken, user } = useAuth();
  const { entries, routes, clients } = useAppData();
  const [remote, setRemote] = useState(EMPTY_REMOTE);
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);
  const locale = currentLocale();

  // Cały panel pokazuje bieżący dzień kalendarzowy — bez podmiany na poprzedni dzień pracy.
  const todayKey = calendarTodayYmd();
  const { year, month, day } = ymdParts(todayKey);
  const prev = previousMonthSameDay(year, month, day);

  const load = useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const prevMonthKey = `${prev.year}-${String(prev.month).padStart(2, '0')}`;
    const [laundryRes, boardRes, approvalsRes, scheduleRes, cardsRes, myWorkRes, costsRes, prevCostsRes] = await Promise.allSettled([
      getLaundryWorkflow(sessionToken),
      getDispatchBoard(sessionToken, todayKey),
      getControlPanelApprovalBacklog(sessionToken),
      getWorkScheduleMonth(sessionToken, year, month),
      getDriverCardReminders(sessionToken),
      getMyWorkTime(sessionToken, year, month),
      getCostsMonth(sessionToken, monthKey),
      getCostsMonth(sessionToken, prevMonthKey),
    ]);

    const nextIssues = [];
    if (laundryRes.status === 'rejected') nextIssues.push(t('controlPanel.issues.laundry'));
    if (boardRes.status === 'rejected' || approvalsRes.status === 'rejected') {
      nextIssues.push(t('controlPanel.issues.routes'));
    }
    if (scheduleRes.status === 'rejected') nextIssues.push(t('controlPanel.issues.schedule'));
    if (cardsRes.status === 'rejected') nextIssues.push(t('controlPanel.issues.driverCards'));
    if (myWorkRes.status === 'rejected') nextIssues.push(t('controlPanel.issues.myHours'));
    if (costsRes.status === 'rejected') nextIssues.push(t('controlPanel.issues.costs'));

    const laundry = laundryRes.status === 'fulfilled' ? laundryRes.value : null;
    setRemote({
      trolleys: laundry?.trolleys || [],
      arrivalReservations: laundry?.arrival_reservations || [],
      trolleyCount: Math.max(1, Math.min(99, Number(laundry?.trolley_count) || DEFAULT_TROLLEY_COUNT)),
      trolleyInventory: laundry?.trolley_inventory ?? null,
      boardTrips: boardRes.status === 'fulfilled' ? (boardRes.value?.trips || []) : [],
      approvalBacklog: approvalsRes.status === 'fulfilled' ? approvalsRes.value : null,
      schedule: scheduleRes.status === 'fulfilled' ? scheduleRes.value : null,
      driverCards: cardsRes.status === 'fulfilled' ? (cardsRes.value?.cards || []) : [],
      myWork: myWorkRes.status === 'fulfilled' ? myWorkRes.value : null,
      costsMonth: costsRes.status === 'fulfilled' ? costsRes.value : null,
      prevCostsMonth: prevCostsRes.status === 'fulfilled' ? prevCostsRes.value : null,
    });
    setIssues(nextIssues);
    setUpdatedAt(new Date());
    setLoading(false);
  }, [month, prev.month, prev.year, sessionToken, t, todayKey, year]);

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
    const occupancy = buildTrolleyOccupancy(activeCycles, remote.arrivalReservations);
    const occupied = occupancy.size;
    const free = Array.from({ length: remote.trolleyCount }, (_, index) => String(index + 1))
      .filter(no => canUseFreeTrolley(no, occupancy.get(no), remote.trolleyInventory)).length;
    const atClient = activeCycles.filter(cycle => cycle.status === 'at_client').length;
    return {
      ...metrics,
      remainingKg: Math.max(0, Number((metrics.plannedKg - metrics.washedKg).toFixed(1))),
      toPackKg: Math.max(0, Number((metrics.plannedKg - metrics.packedKg).toFixed(1))),
      occupied,
      atClient,
      inLaundry: Math.max(0, activeCycles.length - atClient),
      reserved: Math.max(0, occupied - activeCycles.length),
      free,
    };
  }, [clients, entries, remote.arrivalReservations, remote.trolleyCount, remote.trolleyInventory, remote.trolleys, routes, todayKey]);

  const team = useMemo(() => {
    const schedule = remote.schedule;
    if (!schedule) return null;
    const input = {
      roster: schedule.roster || [],
      scheduleEntries: schedule.schedule_entries || [],
      employmentPeriods: schedule.employment_periods || [],
      groupOrder: schedule.groups || [],
      year,
      month,
    };
    return { day: buildTeamDay({ ...input, day }) };
  }, [day, month, remote.schedule, year]);

  const myHours = useMemo(() => buildMyMonthHours({
    employee: remote.myWork?.employee || null,
    scheduleEntries: remote.myWork?.schedule_entries || [],
    year,
    month,
    uptoDay: day,
  }), [day, month, remote.myWork, year]);

  const costs = useMemo(() => (remote.costsMonth
    ? summarizeCostsMonth({ monthData: remote.costsMonth, year, month, todayKey })
    : null), [month, remote.costsMonth, todayKey, year]);

  const prevCosts = useMemo(() => (remote.prevCostsMonth
    ? summarizeCostsMonth({ monthData: remote.prevCostsMonth, year: prev.year, month: prev.month, todayKey: prev.ymd })
    : null), [prev.month, prev.year, prev.ymd, remote.prevCostsMonth]);

  const approvals = useMemo(() => collectApprovals({
    workTimeReports: remote.approvalBacklog?.work_time_reports || [],
    boardTrips: remote.approvalBacklog?.trips || [],
    driverCardReminders: remote.driverCards.map(card => getDriverCardReminder(card, new Date())),
  }), [remote.approvalBacklog, remote.driverCards]);

  const trips = useMemo(() => {
    const real = remote.boardTrips.filter(trip => !trip.isVirtual);
    const byStatus = Object.fromEntries(COURSE_STAGES.map(stage => [stage, real.filter(trip => trip.board_status === stage)]));
    return { ...byStatus, total: real.length };
  }, [remote.boardTrips]);

  const now = new Date();
  const firstName = String(user?.name || '').split(/\s+/)[0] || user?.username || '';
  const dateLabel = capitalizeFirst(new Date(year, month - 1, day).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }));
  const monthLabel = monthNames()[month - 1] || '';
  const prevMonthLabel = monthNames()[prev.month - 1] || '';
  const visibleApprovals = approvals.slice(0, APPROVALS_VISIBLE);
  const hiddenApprovals = approvals.length - visibleApprovals.length;
  const lowTrolleys = !loading && laundry.free <= LOW_TROLLEYS;
  const attentionCount = approvals.length + (lowTrolleys ? 1 : 0);

  const costsTrend = costs && prevCosts ? percentChange(costs.plnPerKg, prevCosts.plnPerKg) : null;
  const tonnageTrend = costs && prevCosts ? percentChange(costs.kg, prevCosts.kg) : null;

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

      <section className="cp-section" aria-labelledby="cp-today-title">
        <div className="cp-section-head">
          <h3 id="cp-today-title">{t('controlPanel.today.title')}</h3>
        </div>
        <div className="cp-kpis cp-today">
          <KpiCard
            icon={WashingMachine}
            tone="blue"
            label={t('controlPanel.today.laundry')}
            value={formatNumber(laundry.plannedKg)}
            unit="kg"
            stages={[
              {
                key: 'washed',
                tone: 'blue',
                label: t('controlPanel.kpi.laundryWashed'),
                value: t('controlPanel.kpi.laundryStageValue', {
                  done: formatNumber(laundry.washedKg),
                  total: formatNumber(laundry.plannedKg),
                }),
                progress: percent(laundry.washedKg, laundry.plannedKg),
              },
              {
                key: 'packed',
                tone: 'teal',
                label: t('controlPanel.kpi.laundryPacked'),
                value: t('controlPanel.kpi.laundryStageValue', {
                  done: formatNumber(laundry.packedKg),
                  total: formatNumber(laundry.plannedKg),
                }),
                progress: percent(laundry.packedKg, laundry.plannedKg),
              },
            ]}
            detail={t('controlPanel.kpi.laundryDetail', {
              remaining: formatNumber(laundry.remainingKg),
              toPack: formatNumber(laundry.toPackKg),
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
              remote.trolleyInventory && !remote.trolleyInventory.completed_at
                ? t('wash.fleet.inventory.progress', {
                  checked: Object.keys(remote.trolleyInventory.checks).length,
                  total: remote.trolleyInventory.trolley_nos.length,
                }) : null,
            ].filter(Boolean).join(' · ')}
            to="/wash"
          />
          <KpiCard
            icon={Users}
            tone="green"
            label={t('controlPanel.today.team')}
            value={team ? `${team.day.working}/${team.day.total}` : '—'}
            progress={team ? percent(team.day.working, team.day.total) : undefined}
            plannedProgress={team ? percent(team.day.planned, team.day.total) : undefined}
            detail={team
              ? t('controlPanel.kpi.teamDetail', { planned: team.day.planned, absent: team.day.absentCount, off: team.day.off })
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
            title={t('controlPanel.team.title')}
            to="/grafik"
            linkLabel={t('controlPanel.team.open')}
          />
          {team?.day.groups.length ? (
            <div className="cp-groups">
              {team.day.groups.map(group => (
                <div className="cp-group" key={group.name}>
                  <span className="cp-group-name">{prettyGroupName(group.name)}</span>
                  <span className="cp-group-value">
                    {t('controlPanel.team.groupSummary', {
                      working: group.working,
                      planned: group.planned,
                      total: group.total,
                    })}
                  </span>
                  <ProgressBar
                    value={percent(group.working, group.total)}
                    planned={percent(group.planned, group.total)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="cp-inline-empty"><Users size={15} aria-hidden="true" />{t('controlPanel.team.emptyTitle')}</p>
          )}

          <h4 className="cp-subhead">
            {t('controlPanel.team.absentToday')}
            {team?.day.absent.length > 0 && <span className="cp-count tone-amber">{team.day.absent.length}</span>}
          </h4>
          {team?.day.absent.length ? (
            <ul className="cp-people">
              {team.day.absent.map(person => (
                <li key={person.id}>
                  <span>{person.name}<small>{prettyGroupName(person.group)}</small></span>
                  <span className={`cp-status status-${person.value.toLowerCase()}`}>{person.value}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="cp-inline-empty is-ok"><CheckCircle2 size={15} aria-hidden="true" />{t('controlPanel.team.nobodyAbsent')}</p>
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

      {isAdmin && sessionToken && (
        <div className="admin-status-grid" key={sessionToken}>
          <AdminDatabaseStatus sessionToken={sessionToken} />
          <AdminAppStatus sessionToken={sessionToken} />
        </div>
      )}
    </div>
  );
}
