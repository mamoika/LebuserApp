import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Gauge, LoaderCircle, Printer, Route } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAppData } from '../../hooks/useAppData';
import { callExistingTripRpc } from '../../lib/courseRpc';
import { formatCourseShortDate, formatCourseTime } from '../../lib/courseLocale';
import { printDayWorkCard, printTripWorkCard } from '../../lib/coursePrint';
import { getDriverTripsData, getMyWorkTime } from '../../lib/readRpc';
import { parseRouteIds, routeNamesForTrip } from '../../lib/tripUiHelpers';
import { dateInMonth } from '../../lib/dateUtils';
import { toastError, toastSuccess } from '../../lib/toast';
import { formatWorkDuration, minutesBetweenClocks, timeForInput, buildDriverWorkHistory } from '../../lib/workTime';
import { VEHICLE_LABELS } from '../../lib/vehicles';
import { routeBadgeStyle } from '../../lib/visualSystem';
import '../mockups/mockups.css';

function routeDisplayForTrip(trip, routeMap) {
  const firstRouteId = [...parseRouteIds(trip?.routes)][0];
  return routeMap[firstRouteId]?.num || firstRouteId || null;
}

function formatWeekday(dateStr, locale) {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString(locale, { weekday: 'short' });
}

function WorkHoursBlock({ row, t, onResubmit }) {
  if (!row) return null;

  if (row.kind === 'report') {
    const report = row.report;
    const approved = report.status === 'approved';
    const rejected = report.status === 'rejected';
    const start = timeForInput(approved ? report.approved_start : report.reported_start);
    const end = timeForInput(approved ? report.approved_end : report.reported_end);
    const minutes = approved ? report.approved_minutes : report.reported_minutes;

    return (
      <div className="live-history-day-hours">
        <div className="live-history-hours-main">
          <span className="live-history-hours-value">{formatWorkDuration(minutes)}</span>
          <span className="live-history-hours-range">{start}–{end}</span>
        </div>
        <div className="live-history-hours-meta">
          <span className={`live-worktime-status ${approved ? 'is-approved' : rejected ? 'is-rejected' : 'is-pending'}`}>
            {approved
              ? t('course.history.statusApproved')
              : rejected
                ? t('course.history.statusRejected')
                : t('course.history.statusPending')}
          </span>
          {row.schedule && (
            <span className="live-history-schedule-ref">
              {t('course.history.scheduleRef', {
                hours: formatWorkDuration(row.schedule.minutes),
                value: row.schedule.value,
              })}
            </span>
          )}
          {approved && report.approved_by_name && <span>{report.approved_by_name}</span>}
          {rejected && report.rejection_note && <span>{report.rejection_note}</span>}
        </div>
        {rejected && (
          <button type="button" className="driver-tool-btn live-history-fix-btn" onClick={() => onResubmit(report)}>
            {t('course.history.fix')}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="live-history-day-hours is-schedule">
      <div className="live-history-hours-main">
        <span className="live-history-hours-value">{formatWorkDuration(row.minutes)}</span>
        <span className="live-history-hours-range">{row.start}–{row.end}</span>
      </div>
      <div className="live-history-hours-meta">
        <span className="live-worktime-status is-schedule">{t('course.history.statusSchedule')}</span>
        <span>{t('course.history.scheduleValue', { value: row.scheduleValue })}</span>
      </div>
    </div>
  );
}

export default function DriverCourseHistory({ routeMap, onBack }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('de') ? 'de-DE' : 'pl-PL';
  const { sessionToken, user } = useAuth();
  const { entries } = useAppData();
  const [allTrips, setAllTrips] = useState([]);
  const [dailyCosts, setDailyCosts] = useState([]);
  const [workTimeData, setWorkTimeData] = useState({ employee: null, reports: [], schedule_entries: [] });
  const [workPeriod, setWorkPeriod] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);

  const load = useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    try {
      const [tripsData, workData] = await Promise.all([
        getDriverTripsData(sessionToken),
        getMyWorkTime(sessionToken, workPeriod.year, workPeriod.month),
      ]);
      setAllTrips(tripsData?.trips || []);
      setDailyCosts(tripsData?.daily_costs || []);
      setWorkTimeData({
        employee: workData?.employee || null,
        reports: workData?.reports || [],
        schedule_entries: workData?.schedule_entries || [],
      });
    } finally {
      setLoading(false);
    }
  }, [sessionToken, workPeriod.month, workPeriod.year]);

  useEffect(() => { load(); }, [load]);

  const monthTrips = useMemo(() => allTrips
    .filter(trip => String(trip.driver_id) === String(user?.id)
      && trip.status === 'finished'
      && dateInMonth(trip.trip_date, workPeriod.year, workPeriod.month))
    .sort((a, b) => `${b.trip_date}`.localeCompare(`${a.trip_date}`)
      || `${b.ended_at || ''}`.localeCompare(`${a.ended_at || ''}`)),
  [allTrips, user?.id, workPeriod.month, workPeriod.year]);

  const workHistoryRows = useMemo(
    () => buildDriverWorkHistory({
      year: workPeriod.year,
      month: workPeriod.month,
      employee: workTimeData.employee,
      scheduleEntries: workTimeData.schedule_entries,
      reports: workTimeData.reports,
    }),
    [workPeriod.month, workPeriod.year, workTimeData.employee, workTimeData.schedule_entries, workTimeData.reports],
  );

  const workByDate = useMemo(
    () => new Map(workHistoryRows.map(row => [row.dateStr, row])),
    [workHistoryRows],
  );

  const historyDays = useMemo(() => {
    const dayMap = new Map();
    workHistoryRows.forEach(row => {
      dayMap.set(row.dateStr, { dateStr: row.dateStr, work: row, trips: [] });
    });
    monthTrips.forEach(trip => {
      const existing = dayMap.get(trip.trip_date) || { dateStr: trip.trip_date, work: workByDate.get(trip.trip_date) || null, trips: [] };
      existing.trips = [...existing.trips, trip];
      if (!existing.work) existing.work = workByDate.get(trip.trip_date) || null;
      dayMap.set(trip.trip_date, existing);
    });
    return [...dayMap.values()].sort((a, b) => b.dateStr.localeCompare(a.dateStr));
  }, [monthTrips, workByDate, workHistoryRows]);

  const myWorkReports = useMemo(
    () => workHistoryRows.filter(row => row.kind === 'report').map(row => row.report),
    [workHistoryRows],
  );

  const approvedWorkMinutes = myWorkReports
    .filter(report => report.status === 'approved')
    .reduce((sum, report) => sum + (Number(report.approved_minutes) || 0), 0);
  const pendingWorkMinutes = myWorkReports
    .filter(report => report.status === 'pending')
    .reduce((sum, report) => sum + (Number(report.reported_minutes) || 0), 0);
  const scheduleWorkMinutes = workHistoryRows
    .filter(row => row.kind === 'schedule')
    .reduce((sum, row) => sum + (Number(row.minutes) || 0), 0);

  const isCurrentMonth = workPeriod.year === new Date().getFullYear()
    && workPeriod.month === new Date().getMonth() + 1;

  const changeMonth = delta => {
    setWorkPeriod(current => {
      const date = new Date(current.year, current.month - 1 + delta, 1);
      return { year: date.getFullYear(), month: date.getMonth() + 1 };
    });
  };

  const resubmitWorkTime = async report => {
    const start = window.prompt('Godzina rozpoczęcia pracy (HH:MM)', timeForInput(report.reported_start));
    if (start === null) return;
    const end = window.prompt('Godzina zakończenia pracy (HH:MM)', timeForInput(report.reported_end));
    if (end === null) return;
    const normalizedStart = timeForInput(start);
    const normalizedEnd = timeForInput(end);
    if (!minutesBetweenClocks(normalizedStart, normalizedEnd)) {
      toastError(t('course.history.invalidRange'));
      return;
    }
    try {
      await callExistingTripRpc('driver_resubmit_work_time', sessionToken, {
        p_report_id: report.id,
        p_work_start: normalizedStart,
        p_work_end: normalizedEnd,
      });
      toastSuccess(t('course.history.resubmitted'));
      await load();
    } catch (error) {
      toastError(`Błąd: ${error.message}`);
    }
  };

  const printTrip = async (trip, mode) => {
    try {
      setPrinting(true);
      const args = {
        sessionToken,
        trip,
        entries,
        routeMap,
        driverName: user?.name,
        dailyCosts,
        allTrips,
      };
      if (mode === 'day') await printDayWorkCard(args);
      else await printTripWorkCard(args);
    } finally {
      setPrinting(false);
    }
  };

  const monthLabel = new Date(workPeriod.year, workPeriod.month - 1, 1)
    .toLocaleDateString(locale, { month: 'long', year: 'numeric' });

  return (
    <section className="driver-phone live-driver-history" aria-labelledby="driver-history-title">
      <header className="live-history-header">
        <div className="live-history-heading">
          <p className="live-start-kicker">{t('course.driver.courseHistory')}</p>
          <h1 id="driver-history-title" className="live-start-title">{monthLabel}</h1>
        </div>
        <button type="button" className="live-start-history-btn" onClick={onBack}>
          {t('course.history.back')}
        </button>
      </header>

      <div className="live-history-month-nav" role="group" aria-label={monthLabel}>
        <button
          type="button"
          className="live-history-month-btn"
          onClick={() => changeMonth(-1)}
          aria-label={t('course.history.prevMonth')}
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <span className="live-history-month-label">{monthLabel}</span>
        <button
          type="button"
          className="live-history-month-btn"
          onClick={() => changeMonth(1)}
          disabled={isCurrentMonth}
          aria-label={t('course.history.nextMonth')}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>

      {loading ? (
        <div className="live-board-loading">
          <LoaderCircle className="is-spinning" aria-hidden="true" />
          {t('course.history.loading')}
        </div>
      ) : (
        <>
          <div className="live-history-summary live-history-summary-4">
            <div className="live-history-stat">
              <Route size={16} aria-hidden="true" />
              <span className="live-history-stat-val">{monthTrips.length}</span>
              <span className="live-history-stat-label">{t('course.history.tripsCount')}</span>
            </div>
            <div className="live-history-stat">
              <Clock3 size={16} aria-hidden="true" />
              <span className="live-history-stat-val">{formatWorkDuration(approvedWorkMinutes)}</span>
              <span className="live-history-stat-label">{t('course.history.approved')}</span>
            </div>
            <div className="live-history-stat is-pending">
              <Clock3 size={16} aria-hidden="true" />
              <span className="live-history-stat-val">{formatWorkDuration(pendingWorkMinutes)}</span>
              <span className="live-history-stat-label">{t('course.history.pending')}</span>
            </div>
            <div className="live-history-stat is-schedule">
              <CalendarDays size={16} aria-hidden="true" />
              <span className="live-history-stat-val">{formatWorkDuration(scheduleWorkMinutes)}</span>
              <span className="live-history-stat-label">{t('course.history.scheduleTotal')}</span>
            </div>
          </div>

          <section className="driver-history-panel live-history-section">
            <div className="live-history-section-head">
              <h2 className="live-history-section-title">{t('course.history.monthOverview')}</h2>
              <span className="live-history-section-count">{historyDays.length}</span>
            </div>

            {!workTimeData.employee ? (
              <div className="driver-empty-row live-worktime-missing">{t('course.history.noEmployee')}</div>
            ) : historyDays.length === 0 ? (
              <div className="driver-empty-row">
                <p>{t('course.history.noDays')}</p>
                <p className="live-history-empty-hint">{t('course.history.noDaysHint')}</p>
              </div>
            ) : (
              <div className="live-history-day-list">
                {historyDays.map(day => (
                  <article key={day.dateStr} className={`live-history-day-card${day.work?.kind === 'schedule' ? ' has-schedule' : ''}`}>
                    <header className="live-history-day-head">
                      <div>
                        <span className="live-history-day-weekday">{formatWeekday(day.dateStr, locale)}</span>
                        <span className="live-history-day-date">{formatCourseShortDate(day.dateStr, locale)}</span>
                      </div>
                      {day.work && (
                        <span className={`live-history-day-badge ${day.work.kind === 'schedule' ? 'is-schedule' : 'is-report'}`}>
                          {day.work.kind === 'schedule'
                            ? t('course.history.statusSchedule')
                            : t('course.history.workHours')}
                        </span>
                      )}
                    </header>

                    {day.work ? (
                      <WorkHoursBlock row={day.work} t={t} onResubmit={resubmitWorkTime} />
                    ) : (
                      <div className="live-history-day-no-hours">{t('course.history.noHoursDay')}</div>
                    )}

                    {day.trips.length > 0 && (
                      <div className="live-history-day-trips">
                        <p className="live-history-day-trips-label">
                          {t('course.history.tripsOnDay', { count: day.trips.length })}
                        </p>
                        {day.trips.map(trip => {
                          const routeNum = routeDisplayForTrip(trip, routeMap);
                          return (
                            <div className="live-history-day-trip" key={trip.id}>
                              <div className="live-history-trip-main">
                                <div className="live-history-trip-title-row">
                                  {routeNum != null && (
                                    <span className="kurs-route-badge" style={routeBadgeStyle(routeNum)}>T{routeNum}</span>
                                  )}
                                  <span className="driver-trip-row-title">{routeNamesForTrip(trip, routeMap)}</span>
                                </div>
                                <div className="live-history-trip-meta">
                                  {trip.car && <span>{VEHICLE_LABELS[trip.car] || trip.car}</span>}
                                  {trip.started_at && <span>{formatCourseTime(trip.started_at, locale)}</span>}
                                  {trip.end_km != null && <span>{trip.end_km} km</span>}
                                </div>
                              </div>
                              <div className="live-history-actions">
                                {trip.end_km != null && (
                                  <span className={`live-history-km ${trip.km_approval_status === 'approved' ? 'is-approved' : ''}`}>
                                    <Gauge size={13} aria-hidden="true" />
                                    {trip.km_approval_status === 'approved' ? '✓' : '⏳'}
                                  </span>
                                )}
                                <button type="button" className="driver-tool-btn" disabled={printing} onClick={() => printTrip(trip, 'trip')}>
                                  <Printer size={13} aria-hidden="true" />
                                  {t('course.history.printTrip')}
                                </button>
                                <button type="button" className="driver-tool-btn" disabled={printing} onClick={() => printTrip(trip, 'day')}>
                                  {t('course.history.printDay')}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
