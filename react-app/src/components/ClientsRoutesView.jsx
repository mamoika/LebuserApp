import { useAppData } from '../hooks/useAppData';

export default function ClientsRoutesView() {
  const { clients, routes, loading, error } = useAppData();

  if (loading) return <div style={{ padding: '20px', textAlign: 'center' }}>Ładowanie danych...</div>;
  if (error) return <div style={{ padding: '20px', color: 'red' }}>Błąd: {error}</div>;

  const routeColors = [
    '#007AFF', // T1
    '#FF9500', // T2
    '#AF52DE', // T3
    '#FF3B30', // T4
    '#32ADE6', // T5
    '#34C759', // T6
    '#5856D6', // T7
    '#c49500', // T8
    '#FF453A', // T9
    '#636366', // T10
  ];

  return (
    <div>
      <div className="clients-hint" style={{ marginBottom: '16px', fontSize: '12px', color: 'var(--text-tertiary)' }}>
        <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent-green)', verticalAlign: 'middle', margin: '0 4px' }}></span>
        ma GPS
        <span style={{ margin: '0 8px' }}>·</span>
        <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent-orange)', verticalAlign: 'middle', margin: '0 4px', opacity: 0.6 }}></span>
        brak GPS
      </div>
      
      <div className="grid">
        {routes.map((route, idx) => {
          const routeClients = clients.filter(c => c.route_id === route.id);
          const routeColor = routeColors[route.id % 10] || routeColors[0];
          
          return (
            <div key={route.id} className="col" style={{ padding: '12px 14px 10px', background: 'var(--bg-card-solid)', border: '1px solid var(--border)', borderRadius: '16px' }}>
              <div className="col-header" style={{ paddingBottom: '10px', marginBottom: '4px', borderBottom: 'none' }}>
                <span className="route-id-badge" style={{ background: routeColor, color: '#fff', padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 800 }}>T{route.id}</span>
                <span className="route-title" style={{ color: routeColor, fontWeight: 800, fontSize: '14px', marginLeft: '8px' }}>{route.name}</span>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {routeClients.length === 0 ? (
                  <div style={{ color: 'var(--text-quaternary)', fontSize: '12px', textAlign: 'center', marginTop: '20px' }}>Brak klientów</div>
                ) : (
                  routeClients.map(client => (
                    <div key={client.id} className="tag-client" style={{ 
                      background: 'var(--bg-tertiary)', 
                      borderRadius: '8px', 
                      padding: '8px 10px', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '8px',
                      border: '1px solid var(--border)'
                    }}>
                      <div className="tag-name" style={{ fontWeight: 600, fontSize: '13px' }}>{client.name}</div>
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                        <span style={{ 
                          width: '8px', height: '8px', borderRadius: '50%', 
                          background: (client.lat && client.lng) ? 'var(--accent-green)' : 'var(--accent-orange)',
                          opacity: (client.lat && client.lng) ? 1 : 0.5
                        }}></span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
