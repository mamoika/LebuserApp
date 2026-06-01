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
  
  // Filtrowanie wpisów dla wybranego tygodnia
  const weekEntries = entries.filter(e => e.week_key === displayWeekKey);

  // Funkcja zmiany statusu zadania
  const toggleDone = async (entry) => {
    try {
      const { error } = await supabase
        .from('entries')
        .update({ done: !entry.done })
        .eq('id', entry.id);
        
      if (error) throw error;
      // Hook useAppData ma subskrypcje realtime, wiec sam sie odswiezy, ale mozemy tez odswiezyc recznie
      refetch();
    } catch (err) {
      alert("Błąd aktualizacji: " + err.message);
    }
  };

  return (
    <div className="schedule-container" style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
      {/* Zakładki tygodni */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '15px' }}>
        <button 
          onClick={() => setActiveWeekTab(0)}
          style={{ padding: '10px 20px', background: activeWeekTab === 0 ? 'var(--accent-blue)' : 'transparent', color: activeWeekTab === 0 ? '#fff' : 'var(--text-secondary)', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
        >
          Tydzień 1 ({currentWeekKey})
        </button>
        <button 
          onClick={() => setActiveWeekTab(1)}
          style={{ padding: '10px 20px', background: activeWeekTab === 1 ? 'var(--accent-blue)' : 'transparent', color: activeWeekTab === 1 ? '#fff' : 'var(--text-secondary)', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
        >
          Następny Tydzień
        </button>
      </div>

      {/* Tabela Dni */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '15px' }}>
        {DAY_NAMES.map((dayName, dayIndex) => {
          // dayIndex: 0 = Pon, 1 = Wto, etc. (baza zapisuje arr_day jako 1-5)
          const dayEntries = weekEntries.filter(e => e.arr_day === (dayIndex + 1));
          
          return (
            <div key={dayName} style={{ background: 'var(--bg-primary)', borderRadius: '8px', padding: '15px', minHeight: '300px' }}>
              <h3 style={{ fontSize: '14px', color: 'var(--text-secondary)', borderBottom: '2px solid var(--accent-blue)', paddingBottom: '10px', marginBottom: '15px', textTransform: 'uppercase' }}>
                {dayName}
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {dayEntries.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center', marginTop: '20px' }}>Brak zadań</div>
                ) : (
                  dayEntries.map(entry => {
                    const client = clients.find(c => c.name === entry.client_name);
                    const route = routes.find(r => r.id === entry.route_id);
                    
                    return (
                      <div 
                        key={entry.id} 
                        onClick={() => toggleDone(entry)}
                        style={{ 
                          padding: '12px', 
                          background: entry.done ? '#d4edda' : 'var(--bg-card)', 
                          borderLeft: `4px solid ${entry.done ? '#28a745' : 'var(--accent-orange)'}`,
                          borderRadius: '6px',
                          boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          opacity: entry.done ? 0.7 : 1
                        }}
                      >
                        <div style={{ fontWeight: 'bold', fontSize: '14px', color: entry.done ? '#155724' : 'var(--text-primary)', textDecoration: entry.done ? 'line-through' : 'none' }}>
                          {entry.client_name}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
                          <span>Trasa: {route ? route.name : entry.route_id}</span>
                          {entry.weight && <span style={{ fontWeight: 'bold' }}>{entry.weight} kg</span>}
                        </div>
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
