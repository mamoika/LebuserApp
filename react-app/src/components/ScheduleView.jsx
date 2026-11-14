import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppData } from '../hooks/useAppData';
import DataError from './DataError';
import { getCurrentMonday, formatWeekKey, dayNamesFull, operationalDate } from '../lib/dateUtils';
import { useAuth } from '../context/AuthContext';
import { routeBadgeStyle } from '../lib/visualSystem';
import { effectiveServiceRules, isEveryWorkdayService } from '../lib/serviceSchedule';

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isWorkday(date) {
  const day = date.getDay();
  return day >= 1 && day <= 6;
}

function normalizeWorkday(date, direction = 1) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  while (!isWorkday(d)) {
    d.setDate(d.getDate() + (direction < 0 ? -1 : 1));
  }
  return d;
}

function addWorkdays(date, days) {
  const dir = days < 0 ? -1 : 1;
  const d = normalizeWorkday(date, dir);
  let left = Math.abs(days);
  while (left > 0) {
    d.setDate(d.getDate() + dir);
    if (isWorkday(d)) left--;
  }
  return d;
}

function formatDate(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}.${m}`;
}

function addDaysToWeekKey(weekKey, days) {
  const [y, m, d] = (weekKey || '').split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + days);
  return formatWeekKey(dt);
}

function hasPositiveWeight(entry) {
  return (parseFloat(entry?.weight) || 0) > 0;
}

function hasLaundryWorkflowState(entry) {
  return Object.prototype.hasOwnProperty.call(entry, 'laundry_status')
    || Object.prototype.hasOwnProperty.call(entry, 'laundry_ready_at')
    || Object.prototype.hasOwnProperty.call(entry, 'laundry_packed_at')
    || Object.prototype.hasOwnProperty.call(entry, 'laundry_trolley_no');
}

function cleanLaundryReadyForDriver(entry) {
  if (entry?.done) return true;
  if (hasLaundryWorkflowState(entry)) {
    return Boolean(
      entry.laundry_ready_at
      || entry.laundry_packed_at
      || ['packed', 'released', 'at_client', 'returned'].includes(entry.laundry_status)
    );
  }
  return Boolean(entry?.washed);
}

// Czas absolutny dnia operacyjnego (1=Pn..6=So) w danym tygodniu — do porównań.
function dayWeekToTime(day, weekKey) {
  const [y, m, d] = (weekKey || '').split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + (Number(day) - 1));
  return dt.getTime();
}

function plannedDateToSlot(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime()) || date.getDay() === 0) return null;
  const day = date.getDay();
  const monday = addDays(date, -(day - 1));
  return `${formatWeekKey(monday)}|${day}`;
}

// Dzień prania danego wpisu — liczony od WYJAZDU (odbioru), nie przyjazdu:
// - pierzemy w dzień operacyjny tuż PRZED wyjazdem (pn → sobota poprzedniego tygodnia),
// - dla tras nie-codziennych nie pierzemy w dniu przyjazdu: jeśli „dzień przed
//   wyjazdem" wypada w dniu przyjazdu lub wcześniej (np. przyjazd Pt → wyjazd Pn,
//   gdzie pomiędzy jest tylko weekend), pierzemy w dniu wyjazdu.
// - dla tras codziennych „dzień przed wyjazdem" zawsze == dzień przyjazdu, więc
//   reguła automatycznie daje pranie tego samego dnia (np. miasto).
function washSlotOf(entry, scheduleByRoute, dailyServiceByClient) {
  const manualSlot = plannedDateToSlot(entry?.laundry_planned_date);
  if (manualSlot) return manualSlot;

  const arrDay = Number(entry.arr_day);
  const arrWeek = entry.week_key;
  const depDay = Number(entry.pick_day);
  const depWeek = entry.pick_week_key;
  const isDaily = dailyServiceByClient.has(entry.client_name)
    ? dailyServiceByClient.get(entry.client_name)
    : (scheduleByRoute.get(entry.route_id) || 'other') === 'daily';

  // Brak danych o wyjeździe → awaryjnie licz wg przyjazdu (następny dzień roboczy).
  if (!depDay || !depWeek) {
    if (!arrDay || !arrWeek) return null;
    if (isDaily) return `${arrWeek}|${arrDay}`;
    if (arrDay < 6) return `${arrWeek}|${arrDay + 1}`;
    return `${addDaysToWeekKey(arrWeek, 7)}|1`;
  }

  // Dzień roboczy tuż przed wyjazdem.
  let washDay, washWeek;
  if (depDay > 1) { washDay = depDay - 1; washWeek = depWeek; }
  else { washDay = 6; washWeek = addDaysToWeekKey(depWeek, -7); }

  // Trasy nie-codzienne: nie pierzemy w dniu przyjazdu (ani wcześniej) → wtedy w dniu wyjazdu.
  if (!isDaily && arrDay && arrWeek) {
    if (dayWeekToTime(washDay, washWeek) <= dayWeekToTime(arrDay, arrWeek)) {
      washDay = depDay; washWeek = depWeek;
    }
  }
  return `${washWeek}|${washDay}`;
}

function groupPickupEntries(entries, compareEntries) {
  const groups = new Map();
  entries.forEach(entry => {
    const key = [
      entry.pick_week_key,
      entry.pick_day,
      entry.route_id || '',
      entry.client_name || '',
    ].join('|');
    const current = groups.get(key) || {
      ...entry,
      id: `pickup-${key}`,
      entries: [],
      isPickupGroup: true,
      done: true,
      weight: 0,
      totalWeight: 0,
      pendingWeight: 0,
      urgent: false,
    };
    current.entries.push(entry);
    current.done = current.entries.every(e => e.done);
    current.urgent = current.entries.some(e => e.urgent);
    current.totalWeight = current.entries.reduce((sum, e) => sum + (parseFloat(e.weight) || 0), 0);
    current.pendingWeight = current.entries
      .filter(e => !e.done)
      .reduce((sum, e) => sum + (parseFloat(e.weight) || 0), 0);
    current.weight = current.done ? current.totalWeight : current.pendingWeight;
    const entryTypes = [...new Set(current.entries.map(item => item.type || 'P'))];
    current.type = entryTypes.length > 1 ? 'M' : entryTypes[0] || 'P';
    groups.set(key, current);
  });
  return [...groups.values()].sort(compareEntries);
}

export default function ScheduleView() {
  const { t } = useTranslation();
  const rawData = useAppData();
  const { isDriver } = useAuth();
  const { entries, clients, routes, loading, error, refetch } = rawData;
  
  // Zamiast activeWeekTab używamy weekOffset podobnie jak w starym index.html
  const [weekOffset, setWeekOffset] = useState(0);
  const [isPhone, setIsPhone] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 600px), (max-device-width: 600px)').matches;
  });
  const [mobileMode, setMobileMode] = useState('two');
  const [mobileDayOffset, setMobileDayOffset] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 600px), (max-device-width: 600px)');
    const onChange = () => setIsPhone(mq.matches);
    onChange();
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  if (loading) return <div className="loader">{t('schedule.loadingData')}</div>;
  if (error) return <DataError onRetry={refetch} />;

  const currentMonday = addDays(getCurrentMonday(), weekOffset * 7);
  const nextMonday = addDays(currentMonday, 7);

  const week1Key = formatWeekKey(currentMonday);
  const week2Key = formatWeekKey(nextMonday);
  
  const w1End = addDays(currentMonday, 5);
  const w2End = addDays(nextMonday, 5);
  const mobileAnchor = addWorkdays(operationalDate(), mobileDayOffset);

  const slotForDate = (date) => {
    const d = normalizeWorkday(date);
    const monday = addDays(d, -((d.getDay() || 7) - 1));
    return {
      date: d,
      weekKey: formatWeekKey(monday),
      dayIndex: d.getDay() - 1,
    };
  };

  const mobileSlots = (() => {
    if (mobileMode === 'full') return [];
    const dates = mobileMode === 'nearby'
      ? [addWorkdays(mobileAnchor, -1), mobileAnchor, addWorkdays(mobileAnchor, 1)]
      : [mobileAnchor, addWorkdays(mobileAnchor, 1)];
    return dates.map(slotForDate);
  })();
  const mobileWindowLabel = mobileSlots.length > 1
    ? `${formatDate(mobileSlots[0].date)} – ${formatDate(mobileSlots[mobileSlots.length - 1].date)}`
    : mobileSlots[0] ? formatDate(mobileSlots[0].date) : '';

  // kg do prania per (tydzień|dzień) — liczone od dnia WYJAZDU (patrz washSlotOf),
  // z pominięciem wpisów już oznaczonych jako wyprane. Budujemy mapę raz, ze wszystkich wpisów.
  const scheduleByRoute = new Map(routes.map(r => [r.id, r.schedule || 'other']));
  const dailyServiceByClient = new Map(clients.map(client => [
    client.name,
    isEveryWorkdayService(effectiveServiceRules(client, routes)),
  ]));
  const routeOrderRank = new Map(
    [...routes]
      .sort((a, b) => {
        const orderDiff = (a.sort_order ?? 9999) - (b.sort_order ?? 9999);
        if (orderDiff) return orderDiff;
        return String(a.name || '').localeCompare(String(b.name || ''), 'pl');
      })
      .map((route, index) => [route.id, index])
  );
  const clientByName = new Map(clients.map(client => [client.name, client]));
  const clientPointByName = new Map();
  const clientsByRoute = new Map();
  clients.forEach(client => {
    const routeId = client.route_id;
    if (!clientsByRoute.has(routeId)) clientsByRoute.set(routeId, []);
    clientsByRoute.get(routeId).push(client);
  });
  clientsByRoute.forEach(routeClients => {
    routeClients
      .sort((a, b) => {
        const orderDiff = (a.sort_order ?? 9999) - (b.sort_order ?? 9999);
        if (orderDiff) return orderDiff;
        return String(a.name || '').localeCompare(String(b.name || ''), 'pl');
      })
      .forEach((client, index) => clientPointByName.set(client.name, index + 1));
  });
  const routeIdForEntry = entry => clientByName.get(entry.client_name)?.route_id || entry.route_id || 0;
  const compareEntriesByRouteOrder = (a, b) => {
    const routeA = routeIdForEntry(a);
    const routeB = routeIdForEntry(b);
    const routeDiff = (routeOrderRank.get(routeA) ?? 9999) - (routeOrderRank.get(routeB) ?? 9999);
    if (routeDiff) return routeDiff;
    const pointDiff = (clientPointByName.get(a.client_name) ?? 9999) - (clientPointByName.get(b.client_name) ?? 9999);
    if (pointDiff) return pointDiff;
    const nameDiff = String(a.client_name || '').localeCompare(String(b.client_name || ''), 'pl');
    if (nameDiff) return nameDiff;
    return String(a.id || '').localeCompare(String(b.id || ''));
  };
  const washKgBySlot = new Map();
  entries.forEach(e => {
    if (!hasPositiveWeight(e)) return;
    if (e.washed) return; // już wyprane → nie liczymy do prania
    const slot = washSlotOf(e, scheduleByRoute, dailyServiceByClient);
    if (!slot) return;
    washKgBySlot.set(slot, (washKgBySlot.get(slot) || 0) + (parseFloat(e.weight) || 0));
  });

  const laundryStatus = (entry, mode) => {
    if (mode === 'pick') {
      return entry.done
        ? { label: t('schedule.statusPickedUp'), tone: 'complete' }
        : { label: t('schedule.statusReady'), tone: 'ready' };
    }

    const isPacked = ['packed', 'released', 'at_client', 'returned'].includes(entry.laundry_status) 
      || entry.done 
      || (hasLaundryWorkflowState(entry) && (entry.laundry_ready_at || entry.laundry_packed_at))
      || (!hasLaundryWorkflowState(entry) && entry.done);

    const isWashed = entry.laundry_status === 'washed' 
      || (!hasLaundryWorkflowState(entry) && entry.washed && !entry.done);

    if (isPacked) {
      return { label: t('schedule.statusReady'), tone: 'ready' };
    }
    if (isWashed) return { label: t('schedule.statusToPack'), tone: 'packing' };
    return { label: t('schedule.statusToWash'), tone: 'waiting' };
  };

  const renderEntryTag = (entry, mode) => {
    const tagClass = entry.done ? 'tag-done' : mode === 'pick' ? 'tag-pick' : 'tag-arr';
    const routeId = routeIdForEntry(entry) || 1;
    const rIndex = routes.findIndex(r => r.id === routeId);
    const displayNum = rIndex >= 0 ? rIndex + 1 : routeId;
    const pointNum = clientPointByName.get(entry.client_name);
    const typeBadgeClass = ['P', 'O', 'F', 'R'].includes(entry.type) ? `type-${entry.type}` : 'type-P';
    const relatedEntries = entry.isPickupGroup ? entry.entries : [entry];
    const totalWeight = entry.isPickupGroup
      ? (entry.done ? entry.totalWeight : entry.pendingWeight)
      : parseFloat(entry.weight) || 0;
    const groupedTypes = [...new Set(relatedEntries.map(item => item.type || 'P'))];
    const hasMixedTypes = entry.isPickupGroup && groupedTypes.length > 1;
    const status = laundryStatus(entry, mode);

    return (
      <div
        key={entry.id}
        className={`tag ${tagClass} schedule-entry-readonly`}
        role="group"
        title={entry.client_name}
        aria-label={`${entry.client_name}, ${entry.urgent ? `${t('schedule.urgent')}, ` : ''}T${displayNum}, ${Number(totalWeight.toFixed(1)) || 0} kg`}
      >
        {pointNum != null && <span className="schedule-point-badge">{pointNum}</span>}
        <span className="schedule-tag-content">
          <span className="tag-name">{entry.client_name}</span>
          <span className="schedule-tag-meta" aria-hidden="true">
            {entry.urgent && <span className="schedule-urgent-emoji">🚩</span>}
            {totalWeight ? <span className="kg-badge">{Number(totalWeight.toFixed(1))} kg</span> : null}
            <span className={`laundry-type-badge ${hasMixedTypes ? 'type-P' : typeBadgeClass}`}>{hasMixedTypes ? groupedTypes.join('/') : entry.type || 'P'}</span>
          </span>
        </span>
        <span className="schedule-tag-state">
          <span className="rt-badge" style={routeBadgeStyle(displayNum)}>T{displayNum}</span>
          <span className={`schedule-status-pill is-${status.tone}`}>{status.label}</span>
        </span>
      </div>
    );
  };

  const renderDayColumn = (dayName, dayIndex, dayDate, weekKey) => {
    const isToday = operationalDate().toDateString() === dayDate.toDateString();

    const arrived = entries
      .filter(e => e.arr_day === (dayIndex + 1) && e.week_key === weekKey)
      .sort(compareEntriesByRouteOrder);

    const picked = entries
      .filter(e => e.pick_day === (dayIndex + 1) && e.pick_week_key === weekKey);
    const visiblePicked = isDriver
      ? picked.filter(cleanLaundryReadyForDriver)
      : picked;
    const pickupGroups = groupPickupEntries(visiblePicked, compareEntriesByRouteOrder);

    const sumArr = arrived.reduce((sum, e) => sum + (parseFloat(e.weight) || 0), 0);
    const sumPicked = visiblePicked
      .filter(e => !e.done)
      .reduce((sum, e) => sum + (parseFloat(e.weight) || 0), 0);
    const sumWash = washKgBySlot.get(`${weekKey}|${dayIndex + 1}`) || 0;

    return (
      <div key={`${weekKey}-${dayIndex}`} className={`col schedule-col ${isToday ? 'col-today' : ''}`}>
        <div className="col-header">
          <span className="col-day-heading">
            <span className="col-day-name">{dayName}</span>
            <span className="col-date">{formatDate(dayDate)}</span>
          </span>
          {isToday && <span className="today-pill">{t('schedule.today')}</span>}
        </div>

        <div className="metrics-row">
          <div className="metric-chip arr">
            <div className="metric-chip-label">{t('schedule.metricDelivery')}</div>
            <div className="metric-chip-val">{sumArr > 0 ? sumArr.toFixed(1) : 0}<span className="metric-unit">kg</span></div>
          </div>
          <div className="metric-chip towash">
            <div className="metric-chip-label">{t('schedule.metricToWash')}</div>
            <div className="metric-chip-val">{sumWash > 0 ? sumWash.toFixed(1) : 0}<span className="metric-unit">kg</span></div>
          </div>
          <div className="metric-chip wash">
            <div className="metric-chip-label">{t('schedule.metricPickup')}</div>
            <div className="metric-chip-val">{sumPicked > 0 ? sumPicked.toFixed(1) : 0}<span className="metric-unit">kg</span></div>
          </div>
        </div>

        <div className="sec-label">{t('schedule.secArrival')}</div>
        <div className="sortable-arr schedule-list">
          {arrived.map(entry => renderEntryTag(entry, 'arr'))}
        </div>

        {visiblePicked.length > 0 && (
          <>
            <div className="divider schedule-divider"></div>
            <div className="sec-label schedule-pick-label">{t('schedule.secPickup')}</div>
            <div className="sortable-pick schedule-list">
              {pickupGroups.map(entry => renderEntryTag(entry, 'pick'))}
            </div>
          </>
        )}

      </div>
    );
  };

  const renderGrid = (monday, weekKey) => {
    return (
      <div className="grid schedule-grid">
        {dayNamesFull().map((dayName, dayIndex) => {
          const dayDate = addDays(monday, dayIndex);
          return renderDayColumn(dayName, dayIndex, dayDate, weekKey);
        })}
      </div>
    );
  };

  const renderMobileGrid = () => (
    <div className="grid schedule-grid schedule-mobile-grid">
      {mobileSlots.map(({ date, weekKey, dayIndex }) => (
        renderDayColumn(dayNamesFull()[dayIndex], dayIndex, date, weekKey)
      ))}
    </div>
  );

  const isMobileCompact = isPhone && mobileMode !== 'full';
  const resetToToday = () => {
    setWeekOffset(0);
    setMobileDayOffset(0);
  };
  const periodLabel = isMobileCompact
    ? mobileWindowLabel
    : `${formatDate(currentMonday)} – ${formatDate(w2End)}`;

  return (
    <div id="mainView">
      <header className="schedule-overview-header">
        <div>
          <span className="schedule-overview-kicker">{t('schedule.overviewKicker')}</span>
          <h1>{t('schedule.overviewTitle')}</h1>
          <p>{t('schedule.overviewDescription')}</p>
        </div>
        <span className="schedule-readonly-badge">{t('schedule.readOnly')}</span>
      </header>

      <div className="week-nav">
        <div className="week-nav-row">
          <button
            type="button"
            className="week-nav-btn"
            aria-label={t('schedule.previousPeriod')}
            onClick={() => isMobileCompact ? setMobileDayOffset(v => v - 1) : setWeekOffset(weekOffset - 1)}
          >
            <ChevronLeft size={19} aria-hidden="true" />
          </button>
          <div className="week-label" id="weekLabel">
            <span className="week-label-title">{t('schedule.twoWeekView')}</span>
            <span className="week-label-range">{periodLabel}</span>
          </div>
          <button type="button" className="week-today-btn" onClick={resetToToday}>
            <CalendarDays size={15} aria-hidden="true" />
            {t('schedule.today')}
          </button>
          <button
            type="button"
            className="week-nav-btn"
            aria-label={t('schedule.nextPeriod')}
            onClick={() => isMobileCompact ? setMobileDayOffset(v => v + 1) : setWeekOffset(weekOffset + 1)}
          >
            <ChevronRight size={19} aria-hidden="true" />
          </button>
        </div>
        {isPhone && (
          <div className="schedule-mobile-range" aria-label={t('schedule.mobileRange')}>
            {[
              ['nearby', t('schedule.rangeNearby')],
              ['two', t('schedule.rangeTwoDays')],
              ['full', t('schedule.rangeFull')],
            ].map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className={mobileMode === mode ? 'active' : ''}
                onClick={() => setMobileMode(mode)}
                aria-pressed={mobileMode === mode}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {isMobileCompact ? (
        <>
          <div className="section-heading" id="titleMobile">
            <CalendarDays size={14} aria-hidden="true" />
            {mobileWindowLabel}
          </div>
          {renderMobileGrid()}
        </>
      ) : (
        <>
          <div className="section-heading" id="titleWk1">
            <CalendarDays size={14} aria-hidden="true" />
            {formatDate(currentMonday)} – {formatDate(w1End)}
          </div>
          {renderGrid(currentMonday, week1Key)}

          <div className="section-heading" id="titleWk2" style={{ marginTop: '28px' }}>
            <CalendarDays size={14} aria-hidden="true" />
            {t('schedule.nextWeek')} {formatDate(nextMonday)} – {formatDate(w2End)}
          </div>
          {renderGrid(nextMonday, week2Key)}
        </>
      )}

    </div>
  );
}
