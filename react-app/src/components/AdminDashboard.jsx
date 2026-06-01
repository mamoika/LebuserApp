import { useAppData } from '../hooks/useAppData';

export default function AdminDashboard() {
  const { drivers, loading, error } = useAppData();

  if (loading) return <div style={{ padding: '20px', textAlign: 'center' }}>Ładowanie danych...</div>;
  if (error) return <div style={{ padding: '20px', color: 'red' }}>Błąd: {error}</div>;

  return (
    <div className="schedule-container" style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
      <h2 style={{ color: 'var(--text-primary)', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>Zarządzanie Kierowcami</h2>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        {drivers.length === 0 ? (
          <div style={{ color: 'var(--text-muted)' }}>Brak zarejestrowanych kierowców.</div>
        ) : (
          drivers.map(driver => (
            <div key={driver.id} style={{ background: 'var(--bg-primary)', padding: '15px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{driver.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>ID: {driver.id}</div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '5px' }}>Przypisane Trasy:</div>
                <input 
                  type="text" 
                  defaultValue={driver.routes || ''}
                  placeholder="np. 1, 2, 3"
                  style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', width: '150px' }}
                />
                <button style={{ marginLeft: '10px', background: 'var(--accent-green)', color: 'white', padding: '8px 15px', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Zapisz</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
