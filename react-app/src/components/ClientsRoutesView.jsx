import { useAppData } from '../hooks/useAppData';

export default function ClientsRoutesView() {
  const { clients, routes, loading, error } = useAppData();

  if (loading) return <div style={{ padding: '20px', textAlign: 'center' }}>Ładowanie danych...</div>;
  if (error) return <div style={{ padding: '20px', color: 'red' }}>Błąd: {error}</div>;

  return (
    <div className="schedule-container" style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
      <h2 style={{ color: 'var(--text-primary)', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>Klienci i Trasy</h2>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '20px' }}>
        {routes.map(route => {
          const routeClients = clients.filter(c => c.route_id === route.id);
          
          return (
            <div key={route.id} style={{ background: 'var(--bg-primary)', borderRadius: '8px', padding: '15px' }}>
              <h3 style={{ fontSize: '14px', color: 'var(--accent-blue)', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ background: 'var(--accent-blue)', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>T{route.id}</span>
                {route.name}
              </h3>
              
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {routeClients.length === 0 ? (
                  <li style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Brak klientów na trasie</li>
                ) : (
                  routeClients.map(client => (
                    <li key={client.id} style={{ fontSize: '13px', color: 'var(--text-primary)', background: 'var(--bg-card)', padding: '8px', borderRadius: '4px', borderLeft: '3px solid var(--border-color)' }}>
                      {client.name}
                    </li>
                  ))
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
