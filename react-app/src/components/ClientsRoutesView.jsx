import { useState, useEffect } from 'react';
import { useAppData } from '../hooks/useAppData';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

export default function ClientsRoutesView() {
  const { clients, routes, loading, error, refetch } = useAppData();
  const { isAdmin } = useAuth();
  
  const [localClients, setLocalClients] = useState([]);
  const [editingRouteId, setEditingRouteId] = useState(null);
  const [editRouteName, setEditRouteName] = useState('');

  useEffect(() => {
    setLocalClients(clients);
  }, [clients]);

  if (loading) return <div style={{ padding: '20px', textAlign: 'center' }}>Ładowanie danych...</div>;
  if (error) return <div style={{ padding: '20px', color: 'red' }}>Błąd: {error}</div>;

  const routeColors = [
    '#007AFF', '#FF9500', '#AF52DE', '#FF3B30', '#32ADE6', 
    '#34C759', '#5856D6', '#c49500', '#FF453A', '#636366'
  ];

  const onDragEnd = async (result) => {
    if (!isAdmin) return;
    const { source, destination, draggableId } = result;

    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const sourceRouteId = parseInt(source.droppableId.replace('route-', ''));
    const destRouteId = parseInt(destination.droppableId.replace('route-', ''));

    // Znajdź przesuwanego klienta
    const clientToMove = localClients.find(c => c.id === draggableId);
    if (!clientToMove) return;

    // Utwórz nową listę klientów dla lokalnego stanu
    const newClients = Array.from(localClients);
    
    // Usuń z poprzedniej pozycji
    const sourceIndex = newClients.findIndex(c => c.id === draggableId);
    newClients.splice(sourceIndex, 1);

    // Pobierz klientów z docelowej trasy, żeby wyliczyć nowy index w całej tablicy
    const destRouteClients = newClients.filter(c => c.route_id === destRouteId);
    
    // Zaktualizuj trasę przesuwanego klienta
    const updatedClient = { ...clientToMove, route_id: destRouteId };
    
    // Wstaw w nowe miejsce (symulacja)
    destRouteClients.splice(destination.index, 0, updatedClient);
    
    // Złóż nową listę: nowi klienci docelowi + reszta, i nadaj nowy sort_order docelowym
    const finalClients = newClients.filter(c => c.route_id !== destRouteId);
    
    const updatesToDb = destRouteClients.map((c, index) => {
      const newSortOrder = index + 1;
      finalClients.push({ ...c, sort_order: newSortOrder });
      return { id: c.id, route_id: c.route_id, sort_order: newSortOrder, name: c.name };
    });

    setLocalClients(finalClients);

    try {
      // Wyślij zmiany do Supabase w tle
      const { error } = await supabase.from('clients').upsert(updatesToDb);
      if (error) throw error;
      refetch();
    } catch (err) {
      alert("Błąd zapisu kolejności: " + err.message);
      refetch(); // przywróć stan
    }
  };

  const startEditRoute = (route) => {
    if (!isAdmin) return;
    setEditingRouteId(route.id);
    setEditRouteName(route.name);
  };

  const saveRouteName = async (routeId) => {
    if (!editRouteName.trim()) {
      setEditingRouteId(null);
      return;
    }
    
    try {
      const { error } = await supabase.from('routes').update({ name: editRouteName }).eq('id', routeId);
      if (error) throw error;
      setEditingRouteId(null);
      refetch();
    } catch (err) {
      alert("Błąd zapisu nazwy trasy: " + err.message);
    }
  };

  const handleDeleteRoute = async (route) => {
    if (!isAdmin) return;
    
    // Sprawdź czy są przypisani klienci
    const hasClients = localClients.some(c => c.route_id === route.id);
    if (hasClients) {
      alert("Nie można usunąć trasy, do której są przypisani klienci!");
      return;
    }
    
    if (!window.confirm(`Czy na pewno chcesz usunąć trasę "${route.name}"?`)) return;
    
    try {
      const { error } = await supabase.from('routes').delete().eq('id', route.id);
      if (error) throw error;
      refetch();
    } catch (err) {
      alert("Błąd usuwania trasy: " + err.message);
    }
  };

  const handleAddRoute = async () => {
    if (!isAdmin) return;
    const newName = window.prompt("Podaj nazwę nowej trasy (np. Trasa 11):");
    if (!newName || !newName.trim()) return;
    
    const maxId = routes.length > 0 ? Math.max(...routes.map(r => r.id)) : 0;
    const newId = maxId + 1;
    
    try {
      const { error } = await supabase.from('routes').insert({ id: newId, name: newName.trim() });
      if (error) throw error;
      refetch();
    } catch (err) {
      alert("Błąd dodawania trasy: " + err.message);
    }
  };

  const handleRouteKeyDown = (e, routeId) => {
    if (e.key === 'Enter') saveRouteName(routeId);
    if (e.key === 'Escape') setEditingRouteId(null);
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div>
        <div className="clients-hint" style={{ marginBottom: '16px', fontSize: '12px', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
          {isAdmin && <span style={{ marginRight: '8px', fontWeight: 500 }}>☰ Przeciągaj klientów między trasami <span style={{ margin: '0 8px', opacity: 0.5 }}>·</span> </span>}
          <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent-green)', verticalAlign: 'middle', margin: '0 4px' }}></span>
          ma GPS
          <span style={{ margin: '0 8px', opacity: 0.5 }}>·</span>
          <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent-orange)', verticalAlign: 'middle', margin: '0 4px', opacity: 0.6 }}></span>
          brak GPS
        </div>
        
        <div className="grid">
          {routes.map((route) => {
            // Sort clients by sort_order
            const routeClients = localClients.filter(c => c.route_id === route.id).sort((a, b) => a.sort_order - b.sort_order);
            const routeColor = routeColors[route.id % 10] || routeColors[0];
            
            return (
              <div key={route.id} className="col" style={{ padding: '12px 14px 10px', background: 'var(--bg-card-solid)', border: '1px solid var(--border)', borderRadius: '16px' }}>
                <div className="col-header" style={{ paddingBottom: '10px', marginBottom: '8px', borderBottom: 'none', display: 'flex', alignItems: 'center' }}>
                  <span className="route-id-badge" style={{ background: routeColor, color: '#fff', padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 800 }}>T{route.id}</span>
                  
                  {editingRouteId === route.id ? (
                    <input 
                      type="text" 
                      value={editRouteName}
                      onChange={(e) => setEditRouteName(e.target.value)}
                      onBlur={() => saveRouteName(route.id)}
                      onKeyDown={(e) => handleRouteKeyDown(e, route.id)}
                      autoFocus
                      style={{ marginLeft: '8px', fontSize: '14px', fontWeight: 800, color: routeColor, border: `1px solid ${routeColor}`, borderRadius: '6px', padding: '2px 6px', outline: 'none', background: 'transparent' }}
                    />
                  ) : (
                    <span 
                      className="route-title" 
                      style={{ color: routeColor, fontWeight: 800, fontSize: '14px', marginLeft: '8px', cursor: isAdmin ? 'pointer' : 'default' }}
                      onDoubleClick={() => startEditRoute(route)}
                      title={isAdmin ? "Kliknij dwukrotnie, aby edytować" : ""}
                    >
                      {route.name}
                      {isAdmin && <span style={{ opacity: 0.3, marginLeft: '6px', fontSize: '12px' }} onClick={(e) => { e.stopPropagation(); startEditRoute(route); }}>✏️</span>}
                      {isAdmin && <span style={{ opacity: 0.3, marginLeft: '6px', fontSize: '12px' }} onClick={(e) => { e.stopPropagation(); handleDeleteRoute(route); }} title="Usuń trasę">🗑️</span>}
                    </span>
                  )}
                </div>
                
                <Droppable droppableId={`route-${route.id}`}>
                  {(provided, snapshot) => (
                    <div 
                      ref={provided.innerRef} 
                      {...provided.droppableProps}
                      style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '8px', 
                        minHeight: '40px',
                        background: snapshot.isDraggingOver ? 'rgba(0,0,0,0.02)' : 'transparent',
                        borderRadius: '8px',
                        padding: snapshot.isDraggingOver ? '4px' : '0'
                      }}
                    >
                      {routeClients.length === 0 ? (
                        <div style={{ color: 'var(--text-quaternary)', fontSize: '12px', textAlign: 'center', marginTop: '10px', marginBottom: '10px' }}>Brak klientów</div>
                      ) : (
                        routeClients.map((client, index) => (
                          <Draggable key={client.id} draggableId={client.id} index={index} isDragDisabled={!isAdmin}>
                            {(provided, snapshot) => (
                              <div 
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={`tag-client ${isAdmin ? 'draggable' : ''}`} 
                                style={{ 
                                  background: snapshot.isDragging ? 'var(--bg-secondary)' : 'var(--bg-tertiary)', 
                                  borderRadius: '8px', 
                                  padding: '8px 10px', 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: '8px',
                                  border: '1px solid var(--border)',
                                  boxShadow: snapshot.isDragging ? '0 5px 15px rgba(0,0,0,0.1)' : 'none',
                                  opacity: snapshot.isDragging ? 0.9 : 1,
                                  ...provided.draggableProps.style
                                }}
                              >
                                {isAdmin && <span style={{ opacity: 0.3, cursor: 'grab' }}>⋮⋮</span>}
                                <div className="tag-name" style={{ fontWeight: 600, fontSize: '13px' }}>{client.name}</div>
                                <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                                  <span style={{ 
                                    width: '8px', height: '8px', borderRadius: '50%', 
                                    background: (client.lat && client.lng) ? 'var(--accent-green)' : 'var(--accent-orange)',
                                    opacity: (client.lat && client.lng) ? 1 : 0.5
                                  }}></span>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))
                      )}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
        
        {isAdmin && (
          <div style={{ marginTop: '24px', textAlign: 'center' }}>
            <button 
              onClick={handleAddRoute}
              style={{ background: 'var(--accent-blue)', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '14px' }}
            >
              ＋ Dodaj nową trasę
            </button>
          </div>
        )}
      </div>
    </DragDropContext>
  );
}
