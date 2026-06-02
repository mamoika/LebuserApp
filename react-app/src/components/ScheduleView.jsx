import { useState } from 'react';
import { useAppData } from '../hooks/useAppData';
import { getCurrentMonday, formatWeekKey, DAY_NAMES } from '../lib/dateUtils';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

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
  const { entries, clients, routes, loading, error, refetch } = useAppData();
  const { isAdmin } = useAuth();
  const [activeWeekTab, setActiveWeekTab] = useState(0); // 0 = current, 1 = next
  
  if (loading) return <div style={{ padding: '20px', textAlign: 'center' }}>Ładowanie danych...</div>;
  if (error) return <div style={{ padding: '20px', color: 'red' }}>Błąd: {error}</div>;

  const currentMonday = getCurrentMonday();
  const nextMonday = addDays(currentMonday, 7);

  const displayMonday = activeWeekTab === 0 ? currentMonday : nextMonday;
  const displayWeekKey = formatWeekKey(displayMonday);

  const toggleDone = async (entry) => {
    try {
      const { error } = await supabase
        .from('entries')
        .update({ done: !entry.done })
        .eq('id', entry.id);
        
      if (error) throw error;
      refetch();
    } catch (err) {
      alert("Błąd aktualizacji: " + err.message);
    }
  };

  return (
    <div>
      <div className="week-nav">
        <button 
          className="week-nav-btn" 
          onClick={() => setActiveWeekTab(activeWeekTab === 0 ? 0 : activeWeekTab - 1)}
          style={{ opacity: activeWeekTab === 0 ? 0.5 : 1 }}
        >
          ‹
        </button>
        <div className="week-label">
          {activeWeekTab === 0 ? `Tydzień bieżący (${displayWeekKey})` : `Następny tydzień (${displayWeekKey})`}
        </div>
        <button 
          className="week-nav-btn" 
          onClick={() => setActiveWeekTab(activeWeekTab === 1 ? 1 : activeWeekTab + 1)}
          style={{ opacity: activeWeekTab === 1 ? 0.5 : 1 }}
        >
          ›
        </button>
      </div>

      {/* Legenda u góry na wzór starej aplikacji */}
      <div className="legend-box" style={{ margin: '12px 0 24px', padding: '10px 14px' }}>
        <div className="legend-item"><span className="legend-dot green"></span> Dostarczone</div>
        <div className="legend-item"><span className="legend-dot blue"></span> Do odbioru</div>
        <div className="legend-item"><span className="legend-dot gray"></span> Odebrane</div>
        <span style={{ borderLeft: '1px solid var(--border)', margin: '0 4px', height: '14px' }}></span>
        <div className="legend-item"><span className="laundry-type-badge type-P" style={{ margin: 0, fontSize: '9px' }}>P</span> Pościel</div>
        <div className="legend-item"><span className="laundry-type-badge type-O" style={{ margin: 0, fontSize: '9px' }}>O</span> Obrusy</div>
      </div>

      <div className="grid">
        {DAY_NAMES.map((dayName, dayIndex) => {
          const dayDate = addDays(displayMonday, dayIndex);
          const isToday = activeWeekTab === 0 && new Date().toDateString() === dayDate.toDateString();
          
          // Przyjazdy (arr) i Odbiory (pick)
          const arrived = entries.filter(e => e.arr_day === (dayIndex + 1) && e.week_key === displayWeekKey);
          const picked = entries.filter(e => e.pick_day === (dayIndex + 1) && e.pick_week_key === displayWeekKey);

          const sumArr = arrived.reduce((sum, e) => sum + (parseFloat(e.weight) || 0), 0);
          const sumPick = picked.reduce((sum, e) => sum + (parseFloat(e.weight) || 0), 0);
          
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
                  <div className="metric-chip-val">{sumPick > 0 ? sumPick.toFixed(1) : 0} kg</div>
                </div>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {arrived.length === 0 && picked.length === 0 ? (
                  <div style={{ color: 'var(--text-quaternary)', fontSize: '12px', textAlign: 'center', marginTop: '20px' }}>Brak zadań</div>
                ) : (
                  <>
                    {/* Render przyjazdy */}
                    {arrived.length > 0 && <div className="sec-label">PRZYJAZD</div>}
                    {arrived.map(entry => {
                      const tagClass = entry.done ? 'tag-done' : 'tag-arr';
                      const routeId = entry.route_id || 1;
                      const typeBadgeClass = entry.type === 'O' ? 'type-O' : 'type-P';
                      
                      return (
                        <div 
                          key={entry.id} 
                          className={`tag ${tagClass}`}
                          onClick={() => toggleDone(entry)}
                        >
                          {entry.urgent && <span style={{ marginRight: '4px' }}>🚩</span>}
                          <span className="tag-name">{entry.client_name}</span>
                          <span className={`laundry-type-badge ${typeBadgeClass}`}>{entry.type || 'P'}</span>
                          {entry.weight ? <span className="kg-badge">{entry.weight} kg</span> : null}
                          <span className={`rt-badge rt-${(routeId % 10) || 1}`}>T{routeId}</span>
                          <span style={{ opacity: 0.3, fontSize: '16px', marginLeft: 'auto', paddingLeft: '2px' }}>›</span>
                        </div>
                      )
                    })}

                    {/* Render odbiory */}
                    {picked.length > 0 && <div className="sec-label" style={{ marginTop: '8px' }}>ODBIÓR</div>}
                    {picked.map(entry => {
                      const tagClass = entry.done ? 'tag-done' : 'tag-pick';
                      const routeId = entry.route_id || 1;
                      const typeBadgeClass = entry.type === 'O' ? 'type-O' : 'type-P';
                      
                      return (
                        <div 
                          key={`pick-${entry.id}`} 
                          className={`tag ${tagClass}`}
                          onClick={() => toggleDone(entry)}
                        >
                          {entry.urgent && <span style={{ marginRight: '4px' }}>🚩</span>}
                          <span className="tag-name">{entry.client_name}</span>
                          <span className={`laundry-type-badge ${typeBadgeClass}`}>{entry.type || 'P'}</span>
                          {entry.weight ? <span className="kg-badge">{entry.weight} kg</span> : null}
                          <span className={`rt-badge rt-${(routeId % 10) || 1}`}>T{routeId}</span>
                          <span style={{ opacity: 0.3, fontSize: '16px', marginLeft: 'auto', paddingLeft: '2px' }}>›</span>
                        </div>
                      )
                    })}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  );
}
