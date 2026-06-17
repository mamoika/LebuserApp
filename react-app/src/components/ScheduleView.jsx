import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppData } from '../hooks/useAppData';
import DataError from './DataError';
import { getCurrentMonday, formatWeekKey, dayNamesFull } from '../lib/dateUtils';
import { useAuth } from '../context/AuthContext';
import { OWN_ROUTE_STYLE, routeBadgeStyle } from '../lib/visualSystem';
import { AddEntryModal, ViewEditEntryModal } from './modals/EntryModals';

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isWorkday(date) {
  const day = date.getDay();
  return day >= 1 && day <= 5;
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

function parseRouteIds(routesStr) {
  return new Set(
    (routesStr || '').split(',').map(s => Number(s.trim())).filter(Boolean)
  );
}

function addDaysToWeekKey(weekKey, days) {
  const [y, m, d] = (weekKey || '').split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + days);
  return formatWeekKey(dt);
}

// Czas absolutny dnia roboczego (1=Pn..5=Pt) w danym tygodniu — do porównań.
function dayWeekToTime(day, weekKey) {
  const [y, m, d] = (weekKey || '').split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + (Number(day) - 1));
  return dt.getTime();
}

// Dzień prania danego wpisu — liczony od WYJAZDU (odbioru), nie przyjazdu:
// - pierzemy w dzień roboczy tuż PRZED wyjazdem (pn → pt poprzedniego tygodnia),
// - dla tras nie-codziennych nie pierzemy w dniu przyjazdu: jeśli „dzień przed
//   wyjazdem" wypada w dniu przyjazdu lub wcześniej (np. przyjazd Pt → wyjazd Pn,
//   gdzie pomiędzy jest tylko weekend), pierzemy w dniu wyjazdu.
// - dla tras codziennych „dzień przed wyjazdem" zawsze == dzień przyjazdu, więc
//   reguła automatycznie daje pranie tego samego dnia (np. miasto).
function washSlotOf(entry, scheduleByRoute) {
  const arrDay = Number(entry.arr_day);
  const arrWeek = entry.week_key;
  const depDay = Number(entry.pick_day);
  const depWeek = entry.pick_week_key;
  const isDaily = (scheduleByRoute.get(entry.route_id) || 'other') === 'daily';

  // Brak danych o wyjeździe → awaryjnie licz wg przyjazdu (następny dzień roboczy).
  if (!depDay || !depWeek) {
    if (!arrDay || !arrWeek) return null;
    if (isDaily) return `${arrWeek}|${arrDay}`;
    if (arrDay < 5) return `${arrWeek}|${arrDay + 1}`;
    return `${addDaysToWeekKey(arrWeek, 7)}|1`;
  }

  // Dzień roboczy tuż przed wyjazdem.
  let washDay, washWeek;
  if (depDay > 1) { washDay = depDay - 1; washWeek = depWeek; }
  else { washDay = 5; washWeek = addDaysToWeekKey(depWeek, -7); } // pn → pt poprz. tygodnia

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
      urgent: false,
    };
    current.entries.push(entry);
    current.done = current.entries.every(e => e.done);
    current.urgent = current.entries.some(e => e.urgent);
    current.weight = current.entries.reduce((sum, e) => sum + (parseFloat(e.weight) || 0), 0);
    current.type = current.entries.some(e => e.type === 'O') && current.entries.some(e => (e.type || 'P') === 'P')
      ? 'M'
      : current.entries[0]?.type || 'P';
    groups.set(key, current);
  });
  return [...groups.values()].sort(compareEntries);
}

export default function ScheduleView() {
  const { t } = useTranslation();
  const rawData = useAppData();
  const { isAdmin, isDriver, user } = useAuth();
  const { entries, clients, routes, receipts, loading, error, refetch } = rawData;
  const assignedRouteIds = parseRouteIds(user?.routes);
  
  // Zamiast activeWeekTab używamy weekOffset podobnie jak w starym index.html
  const [weekOffset, setWeekOffset] = useState(0);
  const [isPhone, setIsPhone] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 600px), (max-device-width: 600px)').matches;
  });
  const [mobileMode, setMobileMode] = useState('two');
  const [mobileDayOffset, setMobileDayOffset] = useState(0);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState(1);
  const [selectedWeekKey, setSelectedWeekKey] = useState(null);
  
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [selectedRelatedEntries, setSelectedRelatedEntries] = useState([]);
  const [selectedEntryMode, setSelectedEntryMode] = useState('view');

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
  
  const w1End = addDays(currentMonday, 4);
  const w2End = addDays(nextMonday, 4);
  const mobileAnchor = addWorkdays(new Date(), mobileDayOffset);

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
    if (e.washed) return; // już wyprane → nie liczymy do prania
    const slot = washSlotOf(e, scheduleByRoute);
    if (!slot) return;
    washKgBySlot.set(slot, (washKgBySlot.get(slot) || 0) + (parseFloat(e.weight) || 0));
  });

  const renderEntryTag = (entry, mode) => {
    const tagClass = entry.done ? 'tag-done' : mode === 'pick' ? 'tag-pick' : 'tag-arr';
    const routeId = routeIdForEntry(entry) || 1;
    const rIndex = routes.findIndex(r => r.id === routeId);
    const displayNum = rIndex >= 0 ? rIndex + 1 : routeId;
    const pointNum = clientPointByName.get(entry.client_name);
    const typeBadgeClass = entry.type === 'R' ? 'type-R' : entry.type === 'O' ? 'type-O' : 'type-P';
    const isOwnPickup = mode === 'pick' && isDriver && assignedRouteIds.has(routeId);
    const relatedEntries = entry.isPickupGroup ? entry.entries : [entry];
    const totalWeight = entry.isPickupGroup
      ? relatedEntries.reduce((sum, e) => sum + (parseFloat(e.weight) || 0), 0)
      : parseFloat(entry.weight) || 0;
    const hasMixedTypes = entry.isPickupGroup && relatedEntries.some(e => e.type === 'O') && relatedEntries.some(e => (e.type || 'P') === 'P');

    return (
      <div
        key={entry.id}
        className={`tag ${tagClass} ${isAdmin ? 'draggable' : ''}`}
        onClick={() => {
          setSelectedEntry(entry);
          setSelectedRelatedEntries(relatedEntries);
          setSelectedEntryMode(mode);
          setViewModalOpen(true);
        }}
        style={isOwnPickup ? OWN_ROUTE_STYLE : undefined}
      >
        {entry.urgent && <span style={{ color: 'var(--accent-red)', fontSize: '11px', marginRight: '2px' }}>🚩</span>}
        {pointNum != null && <span className="schedule-point-badge">{pointNum}</span>}
        <span className="tag-name">{entry.client_name}</span>
        {!entry.isPickupGroup && entry.washed && (
          <span className="kg-badge" title={t('schedule.washed')} style={{ background: 'var(--accent-green-light)', color: 'var(--accent-green)' }}>{t('schedule.washedBadge')}</span>
        )}
        <span className={`laundry-type-badge ${hasMixedTypes ? 'type-O' : typeBadgeClass}`}>{hasMixedTypes ? 'P/O' : entry.type || 'P'}</span>
        {totalWeight ? <span className="kg-badge">{Number(totalWeight.toFixed(1))}kg</span> : null}
        <span className="rt-badge" style={routeBadgeStyle(displayNum)}>T{displayNum}</span>
        <span style={{ opacity: 0.3, fontSize: '16px', marginLeft: 'auto', paddingLeft: '2px' }}>›</span>
      </div>
    );
  };

  const renderDayColumn = (dayName, dayIndex, dayDate, weekKey) => {
    const isToday = new Date().toDateString() === dayDate.toDateString();

    const arrived = entries
      .filter(e => e.arr_day === (dayIndex + 1) && e.week_key === weekKey)
      .sort(compareEntriesByRouteOrder);

    const picked = entries.filter(e => e.pick_day === (dayIndex + 1) && e.pick_week_key === weekKey);
    const pickupGroups = groupPickupEntries(picked, compareEntriesByRouteOrder);

    const sumArr = arrived.reduce((sum, e) => sum + (parseFloat(e.weight) || 0), 0);
    const sumPicked = picked.reduce((sum, e) => sum + (parseFloat(e.weight) || 0), 0);
    const sumWash = washKgBySlot.get(`${weekKey}|${dayIndex + 1}`) || 0;

    return (
      <div key={`${weekKey}-${dayIndex}`} className={`col schedule-col ${isToday ? 'col-today' : ''}`}>
        <div className="col-header">
          <span className="col-date">{formatDate(dayDate)}</span>
          <span className="col-day-name" style={{ flex: 1, textAlign: 'center' }}>{dayName}</span>
          {isToday && <span className="today-pill">{t('schedule.today')}</span>}
        </div>

        <div className="metrics-row" style={{ marginBottom: '8px' }}>
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

        {picked.length > 0 && (
          <>
            <div className="divider schedule-divider"></div>
            <div className="sec-label schedule-pick-label">{t('schedule.secPickup')}</div>
            <div className="sortable-pick schedule-list">
              {pickupGroups.map(entry => renderEntryTag(entry, 'pick'))}
            </div>
          </>
        )}

        {isAdmin && <button className="add-btn" onClick={() => { setSelectedDay(dayIndex + 1); setSelectedWeekKey(weekKey); setAddModalOpen(true); }}>{t('schedule.addArrival')}</button>}
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

  return (
    <div id="mainView">
      <div className="week-nav">
        <div className="week-nav-row">
          <button className="week-nav-btn" onClick={() => isMobileCompact ? setMobileDayOffset(v => v - 1) : setWeekOffset(weekOffset - 1)}>‹</button>
          <div className="week-label" id="weekLabel">
            {isPhone ? (
              <div className="schedule-mobile-nav-center">
                <span className="schedule-mobile-date">{isMobileCompact ? mobileWindowLabel : t('schedule.twoWeekView')}</span>
              </div>
            ) : t('schedule.twoWeekView')}
          </div>
          <button className="week-nav-btn" onClick={() => isMobileCompact ? setMobileDayOffset(v => v + 1) : setWeekOffset(weekOffset + 1)}>›</button>
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
            📅 {mobileWindowLabel}
          </div>
          {renderMobileGrid()}
        </>
      ) : (
        <>
          <div className="section-heading" id="titleWk1">
            📅 {formatDate(currentMonday)} – {formatDate(w1End)}
          </div>
          {renderGrid(currentMonday, week1Key)}

          <div className="section-heading" id="titleWk2" style={{ marginTop: '28px' }}>
            📅 {t('schedule.nextWeek')} {formatDate(nextMonday)} – {formatDate(w2End)}
          </div>
          {renderGrid(nextMonday, week2Key)}
        </>
      )}

      {addModalOpen && (
        <AddEntryModal 
          isOpen={addModalOpen} 
          onClose={() => setAddModalOpen(false)} 
          defaultArrDay={selectedDay}
          weekKey={selectedWeekKey || week1Key}
          clients={clients.filter(c => c.route_id)}
          routes={routes}
          onAdded={() => {
            setAddModalOpen(false);
            refetch();
          }}
        />
      )}

      {viewModalOpen && selectedEntry && (
        <ViewEditEntryModal 
          isOpen={viewModalOpen} 
          onClose={() => { setViewModalOpen(false); setSelectedEntry(null); setSelectedRelatedEntries([]); }} 
          entry={selectedEntry}
          relatedEntries={selectedRelatedEntries}
          contextMode={selectedEntryMode}
          onUpdated={() => {
            setViewModalOpen(false);
            refetch();
          }}
          onDeleted={() => {
            setViewModalOpen(false);
            refetch();
          }}
          clients={clients}
          routes={routes}
          receipts={receipts}
          source="schedule"
        />
      )}
    </div>
  );
}
