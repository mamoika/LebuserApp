import { useState } from 'react';
import { useAppData } from '../hooks/useAppData';
import { getCurrentMonday, formatWeekKey, DAY_NAMES } from '../lib/dateUtils';
import { supabase } from '../lib/supabaseClient';

export default function ScheduleView() {
  const { entries, clients, routes, loading, error, refetch } = useAppData();
  const [activeWeekTab, setActiveWeekTab] = useState(0); // 0 = current, 1 = next
  
  if (loading) return <div style={{ padding: '20px', textAlign: 'center' }}>Ładowanie danych...</div>;
  if (error) return <div style={{ padding: '20px', color: 'red' }}>Błąd: {error}</div>;

  const currentMonday = getCurrentMonday();
  const currentWeekKey = formatWeekKey(currentMonday);
  
  const nextMonday = new Date(currentMonday);
  nextMonday.setDate(nextMonday.getDate() + 7);
  const nextWeekKey = formatWeekKey(nextMonday);

  const displayWeekKey = activeWeekTab === 0 ? currentWeekKey : nextWeekKey;
  
  const weekEntries = entries.filter(e => e.week_key === displayWeekKey);

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
          onClick={() => setActiveWeekTab(0)}
          style={{ background: activeWeekTab === 0 ? 'var(--accent)' : '', color: activeWeekTab === 0 ? '#fff' : '' }}
        >
          1
        </button>
        <div className="week-label">
          {activeWeekTab === 0 ? `Tydzień bieżący (${currentWeekKey})` : `Następny tydzień (${nextWeekKey})`}
        </div>
        <button 
          className="week-nav-btn" 
          onClick={() => setActiveWeekTab(1)}
          style={{ background: activeWeekTab === 1 ? 'var(--accent)' : '', color: activeWeekTab === 1 ? '#fff' : '' }}
        >
          2
        </button>
      </div>

      <div className="grid">
        {DAY_NAMES.map((dayName, dayIndex) => {
          const dayEntries = weekEntries.filter(e => e.arr_day === (dayIndex + 1));
          // Proste sprawdzanie dzisiejszego dnia dla przykładu
          const isToday = activeWeekTab === 0 && new Date().getDay() === (dayIndex + 1);
          
          return (
            <div key={dayName} className={`col ${isToday ? 'col-today' : ''}`}>
              <div className="col-header">
                <span className="col-day-name">{dayName}</span>
                {isToday && <span className="today-pill">Dziś</span>}
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {dayEntries.length === 0 ? (
                  <div style={{ color: 'var(--text-quaternary)', fontSize: '12px', textAlign: 'center', marginTop: '20px' }}>Brak zadań</div>
                ) : (
                  dayEntries.map(entry => {
                    const client = clients.find(c => c.name === entry.client_name);
                    const route = routes.find(r => r.id === entry.route_id);
                    const isArr = true; // Z uproszczenia załóżmy dostawę, możesz dostosować logikę
                    const tagClass = entry.done ? 'tag-done' : (isArr ? 'tag-arr' : 'tag-pick');
                    
                    return (
                      <div 
                        key={entry.id} 
                        className={`tag ${tagClass}`}
                        onClick={() => toggleDone(entry)}
                      >
                        <div className="tag-name">{entry.client_name}</div>
                        {entry.weight && <div className="kg-badge">{entry.weight} kg</div>}
                        <div className={`rt-badge rt-${(route?.id % 10) || 1}`}>T{route?.id || entry.route_id}</div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  );
}
