import { useAppData } from '../hooks/useAppData';

export default function ClientsRoutesView() {
  const { clients, routes, loading, error } = useAppData();

  if (loading) return <div style={{ padding: '20px', textAlign: 'center' }}>Ładowanie danych...</div>;
  if (error) return <div style={{ padding: '20px', color: 'red' }}>Błąd: {error}</div>;

  return (
    <div>
      <div className="route-group-header">Klienci i Trasy</div>
      
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
        {routes.map(route => {
          const routeClients = clients.filter(c => c.route_id === route.id);
          
          return (
            <div key={route.id} className="col">
              <div className="col-header">
                <span className={`rt-badge rt-${(route.id % 10) || 1}`}>T{route.id}</span>
                <span className="col-day-name">{route.name}</span>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {routeClients.length === 0 ? (
                  <div style={{ color: 'var(--text-quaternary)', fontSize: '12px', textAlign: 'center', marginTop: '20px' }}>Brak klientów</div>
                ) : (
                  routeClients.map(client => (
                    <div key={client.id} className="tag" style={{ cursor: 'default' }}>
                      <div className="tag-name">{client.name}</div>
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
