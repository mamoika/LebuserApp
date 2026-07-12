import { useCallback, useEffect, useMemo, useState } from 'react';
import { Gauge, Printer } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAppData } from '../../hooks/useAppData';
import { callExistingTripRpc } from '../../lib/courseRpc';
import { printDayWorkCard, printTripWorkCard } from '../../lib/coursePrint';
import { getDriverTripsData, getMyWorkTime } from '../../lib/readRpc';
import { routeNamesForTrip } from '../../lib/tripUiHelpers';
import { toastError, toastSuccess } from '../../lib/toast';
import { formatWorkDuration, minutesBetweenClocks, timeForInput } from '../../lib/workTime';
import { VEHICLE_LABELS } from '../../lib/vehicles';

function fmtDate(value) {
  if (!value) return '';
  return new Date(`${value}T00:00:00`).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}

export default function DriverCourseHistory({ routeMap, onBack }) {
  const { sessionToken, user } = useAuth();
  const { entries } = useAppData();
  const [allTrips, setAllTrips] = useState([]);
  const [dailyCosts, setDailyCosts] = useState([]);
  const [historyTrips, setHistoryTrips] = useState([]);
  const [workTimeData, setWorkTimeData] = useState({ employee: null, reports: [] });
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
      const trips = tripsData?.trips || [];
      setAllTrips(trips);
      setDailyCosts(tripsData?.daily_costs || []);
      setHistoryTrips(trips
        .filter(trip => trip.driver_id === user?.id && trip.status === 'finished')
        .sort((a, b) => `${b.trip_date}`.localeCompare(`${a.trip_date}`) || `${b.ended_at || ''}`.localeCompare(`${a.ended_at || ''}`)));
      setWorkTimeData({
        employee: workData?.employee || null,
        reports: workData?.reports || [],
      });
    } finally {
      setLoading(false);
    }
  }, [sessionToken, user?.id, workPeriod.month, workPeriod.year]);

  useEffect(() => { load(); }, [load]);

  const myWorkReports = useMemo(
    () => [...(workTimeData.reports || [])].sort((a, b) => `${b.work_date}`.localeCompare(`${a.work_date}`)),
    [workTimeData.reports],
  );
  const approvedWorkMinutes = myWorkReports
    .filter(report => report.status === 'approved')
    .reduce((sum, report) => sum + (Number(report.approved_minutes) || 0), 0);
  const pendingWorkMinutes = myWorkReports
    .filter(report => report.status === 'pending')
    .reduce((sum, report) => sum + (Number(report.reported_minutes) || 0), 0);

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
      toastError('Podaj poprawny zakres godzin');
      return;
    }
    try {
      await callExistingTripRpc('driver_resubmit_work_time', sessionToken, {
        p_report_id: report.id,
        p_work_start: normalizedStart,
        p_work_end: normalizedEnd,
      });
      toastSuccess('Godziny wysłane ponownie');
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
    .toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });

  return (
    <section className="driver-phone live-driver-course">
      <div className="live-course-topline">
        <span>Historia kursów</span>
        <button className="driver-tool-btn" onClick={onBack}>Wróć</button>
      </div>

      <section className="driver-history-panel">
        <div className="driver-section-toolbar live-history-toolbar">
          <div className="driver-section-title">Godziny pracy · {monthLabel}</div>
          <div className="live-history-nav">
            <button type="button" className="driver-tool-btn" onClick={() => changeMonth(-1)} aria-label="Poprzedni miesiąc">←</button>
            <button
              type="button"
              className="driver-tool-btn"
              onClick={() => changeMonth(1)}
              disabled={workPeriod.year === new Date().getFullYear() && workPeriod.month === new Date().getMonth() + 1}
              aria-label="Następny miesiąc"
            >
              →
            </button>
          </div>
        </div>

        {!workTimeData.employee ? (
          <div className="driver-empty-row live-worktime-missing">Brak powiązania z profilem pracownika — godziny widzi administrator w Grafiku.</div>
        ) : (
          <>
            <div className="live-worktime-summary">
              <div className="trip-metric"><span className="trip-metric-val">{formatWorkDuration(approvedWorkMinutes)}</span><span className="trip-metric-label">zatwierdzone</span></div>
              <div className="trip-metric tone-dirty"><span className="trip-metric-val">{formatWorkDuration(pendingWorkMinutes)}</span><span className="trip-metric-label">oczekuje</span></div>
              <div className="trip-metric"><span className="trip-metric-val">{myWorkReports.length}</span><span className="trip-metric-label">dni</span></div>
            </div>
            <div className="driver-trip-list">
              {myWorkReports.length === 0 && <div className="driver-empty-row">Brak zgłoszeń w tym miesiącu</div>}
              {myWorkReports.map(report => {
                const approved = report.status === 'approved';
                const rejected = report.status === 'rejected';
                const start = timeForInput(approved ? report.approved_start : report.reported_start);
                const end = timeForInput(approved ? report.approved_end : report.reported_end);
                const minutes = approved ? report.approved_minutes : report.reported_minutes;
                return (
                  <div key={report.id} className="driver-trip-row live-worktime-row">
                    <div>
                      <div className="live-worktime-row-title">{fmtDate(report.work_date)} · {start}–{end}</div>
                      <div className="live-worktime-row-meta">
                        {formatWorkDuration(minutes)}
                        {approved && report.approved_by_name ? ` · ${report.approved_by_name}` : ''}
                        {rejected && report.rejection_note ? ` · ${report.rejection_note}` : ''}
                      </div>
                    </div>
                    <div className="live-history-actions">
                      <span className={`live-worktime-status ${approved ? 'is-approved' : rejected ? 'is-rejected' : 'is-pending'}`}>
                        {approved ? 'zatwierdzone' : rejected ? 'odrzucone' : 'oczekuje'}
                      </span>
                      {rejected && (
                        <button type="button" className="driver-tool-btn" onClick={() => resubmitWorkTime(report)}>Popraw</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      <section className="driver-history-panel">
        <div className="driver-section-title">Zakończone kursy</div>
        {loading && <div className="driver-empty-row">Ładowanie…</div>}
        {!loading && historyTrips.length === 0 && <div className="driver-empty-row">Brak zakończonych kursów</div>}
        <div className="driver-trip-list">
          {historyTrips.map(trip => (
            <div className="driver-trip-row live-history-trip-row" key={trip.id}>
              <div>
                <div className="live-worktime-row-title">{routeNamesForTrip(trip, routeMap)}</div>
                <div className="live-worktime-row-meta">
                  {fmtDate(trip.trip_date)}
                  {trip.car ? ` · ${VEHICLE_LABELS[trip.car] || trip.car}` : ''}
                  {trip.started_at ? ` · ${fmtTime(trip.started_at)}` : ''}
                  {trip.end_km ? ` · ${trip.end_km} km` : ''}
                </div>
              </div>
              <div className="live-history-actions">
                {trip.end_km != null && (
                  <span className="live-history-km"><Gauge size={13} /> {trip.km_approval_status === 'approved' ? '✓' : '⏳'}</span>
                )}
                <button type="button" className="driver-tool-btn" disabled={printing} onClick={() => printTrip(trip, 'trip')}>
                  <Printer size={13} /> Karta
                </button>
                <button type="button" className="driver-tool-btn" disabled={printing} onClick={() => printTrip(trip, 'day')}>
                  Dzień
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
