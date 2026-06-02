import { useState } from 'react';
import { useAppData, filterForDriver } from '../hooks/useAppData';
import { getCurrentMonday, formatWeekKey, DAY_NAMES } from '../lib/dateUtils';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { AddEntryModal, ViewEditEntryModal } from './modals/EntryModals';

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDate(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}.${m}`;
}

export default function ScheduleView() {
  const rawData = useAppData();
  const { isAdmin, isDriver, canEdit, user } = useAuth();
  const { entries, clients, routes, loading, error, refetch } = isDriver
    ? filterForDriver(rawData, user?.routes)
    : rawData;
  
  // Zamiast activeWeekTab używamy weekOffset podobnie jak w starym index.html
  const [weekOffset, setWeekOffset] = useState(0);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState(1);
  
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  
  if (loading) return <div className="loader">Ładowanie danych...</div>;
  if (error) return <div style={{ padding: '20px', color: 'red' }}>Błąd: {error}</div>;

  const currentMonday = addDays(getCurrentMonday(), weekOffset * 7);
  const nextMonday = addDays(currentMonday, 7);

  const week1Key = formatWeekKey(currentMonday);
  const week2Key = formatWeekKey(nextMonday);
  
  const w1End = addDays(currentMonday, 4);
  const w2End = addDays(nextMonday, 4);

  const renderGrid = (monday, weekKey, isWeek2) => {
    return (
      <div className="grid">
        {DAY_NAMES.map((dayName, dayIndex) => {
          const dayDate = addDays(monday, dayIndex);
          const isToday = new Date().toDateString() === dayDate.toDateString();
          
          const arrived = entries.filter(e => e.arr_day === (dayIndex + 1) && e.week_key === weekKey);
          
          // Odbiory logic:
          const picked = entries.filter(e => e.pick_day === (dayIndex + 1) && e.pick_week_key === weekKey && !(e.week_key === weekKey && e.arr_day === (dayIndex + 1)));

          const sumArr = arrived.reduce((sum, e) => sum + (parseFloat(e.weight) || 0), 0);
          
          // Wash dzisiaj - przyjazdy wczoraj (lub pt w nast tyg)
          const prevWeekKey = formatWeekKey(addDays(monday, -7));
          let washToday = dayIndex === 0 
            ? entries.filter(e => e.week_key === prevWeekKey && e.arr_day === 5) // piątek
            : entries.filter(e => e.week_key === weekKey && e.arr_day === dayIndex); // wczoraj
          
          const sumWash = washToday.reduce((sum, e) => sum + (parseFloat(e.weight) || 0), 0);
          
          return (
            <div key={dayName} className={`col ${isToday ? 'col-today' : ''}`}>
              <div className="col-header">
                <span className="col-date">{formatDate(dayDate)}</span>
                <span className="col-day-name" style={{ flex: 1, textAlign: 'center' }}>{dayName}</span>
                {isToday && <span className="today-pill">Dziś</span>}
              </div>
              
              <div className="metrics-row" style={{ marginBottom: '8px' }}>
                <div className="metric-chip arr">
                  <div className="metric-chip-label">Dostawa</div>
                  <div className="metric-chip-val">{sumArr > 0 ? sumArr.toFixed(1) : 0} kg</div>
                </div>
                <div className="metric-chip wash">
                  <div className="metric-chip-label">Odbiór</div>
                  <div className="metric-chip-val">{sumWash > 0 ? sumWash.toFixed(1) : 0} kg</div>
                </div>
              </div>
              
              <div className="sec-label">PRZYJAZD</div>
              <div className="sortable-arr" style={{ minHeight: '10px' }}>
                {arrived.map(entry => {
                  const tagClass = entry.done ? 'tag-done' : 'tag-arr';
                  const routeId = entry.route_id || 1;
                  const rIndex = routes.findIndex(r => r.id === routeId);
                  const displayNum = rIndex >= 0 ? rIndex + 1 : routeId;
                  const cssRtNum = (displayNum % 10) === 0 ? 10 : (displayNum % 10);
                  const typeBadgeClass = entry.type === 'O' ? 'type-O' : 'type-P';
                  
                  return (
                    <div 
                      key={entry.id} 
                      className={`tag ${tagClass} ${isAdmin ? 'draggable' : ''}`}
                      onClick={() => { setSelectedEntry(entry); setViewModalOpen(true); }}
                    >
                      {entry.urgent && <span style={{ color: 'var(--accent-red)', fontSize: '11px', marginRight: '2px' }}>🚩</span>}
                      <span className="tag-name">{entry.client_name}</span>
                      <span className={`laundry-type-badge ${typeBadgeClass}`}>{entry.type || 'P'}</span>
                      {entry.weight ? <span className="kg-badge">{entry.weight}kg</span> : null}
                      <span className={`rt-badge rt-${cssRtNum}`}>T{displayNum}</span>
                      <span style={{ opacity: 0.3, fontSize: '16px', marginLeft: 'auto', paddingLeft: '2px' }}>›</span>
                    </div>
                  )
                })}
              </div>

              {picked.length > 0 && (
                <>
                  <div className="divider"></div>
                  <div className="sec-label">ODBIÓR</div>
                  <div className="sortable-pick" style={{ minHeight: '10px' }}>
                    {picked.map(entry => {
                      const tagClass = entry.done ? 'tag-done' : 'tag-pick';
                      const routeId = entry.route_id || 1;
                      const rIndex = routes.findIndex(r => r.id === routeId);
                      const displayNum = rIndex >= 0 ? rIndex + 1 : routeId;
                      const cssRtNum = (displayNum % 10) === 0 ? 10 : (displayNum % 10);
                      const typeBadgeClass = entry.type === 'O' ? 'type-O' : 'type-P';

                      return (
                        <div 
                          key={entry.id} 
                          className={`tag ${tagClass} ${isAdmin ? 'draggable' : ''}`}
                          onClick={() => { setSelectedEntry(entry); setViewModalOpen(true); }}
                        >
                          {entry.urgent && <span style={{ color: 'var(--accent-red)', fontSize: '11px', marginRight: '2px' }}>🚩</span>}
                          <span className="tag-name">{entry.client_name}</span>
                          <span className={`laundry-type-badge ${typeBadgeClass}`}>{entry.type || 'P'}</span>
                          {entry.weight ? <span className="kg-badge">{entry.weight}kg</span> : null}
                          <span className={`rt-badge rt-${cssRtNum}`}>T{displayNum}</span>
                          <span style={{ opacity: 0.3, fontSize: '16px', marginLeft: 'auto', paddingLeft: '2px' }}>›</span>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
              
              {canEdit && <button className="add-btn" onClick={() => { setSelectedDay(dayIndex + 1); setAddModalOpen(true); }}>+ dodaj przyjazd</button>}
            </div>
          )
        })}
      </div>
    );
  };

  return (
    <div id="mainView">
      <div className="week-nav">
        <button className="week-nav-btn" onClick={() => setWeekOffset(weekOffset - 1)}>‹</button>
        <div className="week-label" id="weekLabel">Widok 2 tygodni</div>
        <button className="week-nav-btn" onClick={() => setWeekOffset(weekOffset + 1)}>›</button>
      </div>

      <div className="section-heading" id="titleWk1">
        📅 {formatDate(currentMonday)} – {formatDate(w1End)}
      </div>
      {renderGrid(currentMonday, week1Key, false)}

      <div className="section-heading" id="titleWk2" style={{ marginTop: '28px' }}>
        📅 Następny tydzień: {formatDate(nextMonday)} – {formatDate(w2End)}
      </div>
      {renderGrid(nextMonday, week2Key, true)}

      {addModalOpen && (
        <AddEntryModal 
          isOpen={addModalOpen} 
          onClose={() => setAddModalOpen(false)} 
          defaultArrDay={selectedDay}
          weekKey={week1Key} // Możemy chcieć dać poprawny week key w zależności na co kliknięto, na razie uproszczone
          clients={clients.filter(c => c.route_id)} // Tylko przypisani do tras
          onAdded={() => {
            setAddModalOpen(false);
            refetch();
          }}
        />
      )}

      {viewModalOpen && selectedEntry && (
        <ViewEditEntryModal 
          isOpen={viewModalOpen} 
          onClose={() => { setViewModalOpen(false); setSelectedEntry(null); }} 
          entry={selectedEntry}
          onUpdated={() => {
            setViewModalOpen(false);
            refetch();
          }}
          onDeleted={() => {
            setViewModalOpen(false);
            refetch();
          }}
          clients={clients}
        />
      )}
    </div>
  );
}
