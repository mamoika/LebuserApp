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

  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientEditName, setClientEditName] = useState('');

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
    // Domyślnie na koniec
    const maxSort = routes.length > 0 ? Math.max(...routes.map(r => r.sort_order || r.id)) : 0;
    const newSortOrder = maxSort + 1;
    
    try {
      const { error } = await supabase.from('routes').insert({ id: newId, name: newName.trim(), sort_order: newSortOrder });
      if (error) throw error;
      refetch();
    } catch (err) {
      alert("Błąd dodawania trasy: " + err.message);
    }
  };

  const handleMoveRoute = async (index, direction) => {
    if (!isAdmin) return;
    if (direction === -1 && index === 0) return;
    if (direction === 1 && index === routes.length - 1) return;

    const route1 = routes[index];
    const route2 = routes[index + direction];

    // Zamiana sort_order
    const sort1 = route1.sort_order || route1.id;
    const sort2 = route2.sort_order || route2.id;

    try {
      await supabase.from('routes').update({ sort_order: sort2 }).eq('id', route1.id);
      await supabase.from('routes').update({ sort_order: sort1 }).eq('id', route2.id);
      refetch();
    } catch (err) {
      alert("Błąd zmiany kolejności: " + err.message);
    }
  };

  const handleRouteKeyDown = (e, routeId) => {
    if (e.key === 'Enter') saveRouteName(routeId);
    if (e.key === 'Escape') setEditingRouteId(null);
  };

  const handleAddClient = async (routeId) => {
    if (!isAdmin) return;
    const name = window.prompt("Podaj nazwę nowego klienta:");
    if (!name || !name.trim()) return;
    try {
      const { error } = await supabase.from('clients').insert({ name: name.trim(), route_id: routeId, sort_order: 9999 });
      if (error) throw error;
      refetch();
    } catch (err) {
      alert("Błąd dodawania klienta: " + err.message);
    }
  };

  const openClientEdit = (client) => {
    if (!isAdmin) return;
    setSelectedClient(client);
    setClientEditName(client.name);
    setClientModalOpen(true);
  };

  const saveClientName = async () => {
    if (!clientEditName.trim()) return;
    try {
      const { error } = await supabase.from('clients').update({ name: clientEditName }).eq('id', selectedClient.id);
      if (error) throw error;
      setClientModalOpen(false);
      refetch();
    } catch(err) { 
      alert("Błąd zapisu klienta: " + err.message); 
    }
  };

  const deleteClient = async () => {
    if (!window.confirm(`Czy na pewno usunąć klienta "${selectedClient.name}"?`)) return;
    try {
      const { error } = await supabase.from('clients').delete().eq('id', selectedClient.id);
      if (error) throw error;
      setClientModalOpen(false);
      refetch();
    } catch(err) { 
      alert("Błąd usuwania klienta: " + err.message); 
    }
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
          {routes.map((route, routeIndex) => {
            // Sort clients by sort_order
            const routeClients = localClients.filter(c => c.route_id === route.id).sort((a, b) => a.sort_order - b.sort_order);
            const displayNum = routeIndex + 1;
            const routeColor = routeColors[displayNum % 10] || routeColors[0];
            
            return (
              <div key={route.id} className="col" style={{ padding: '12px 14px 10px', background: 'var(--bg-card-solid)', border: '1px solid var(--border)', borderRadius: '16px' }}>
                <div className="col-header" style={{ paddingBottom: '10px', marginBottom: '8px', borderBottom: 'none', display: 'flex', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span className="route-id-badge" style={{ background: routeColor, color: '#fff', padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 800 }}>T{displayNum}</span>
                  </div>
                  
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
                      style={{ color: routeColor, fontWeight: 800, fontSize: '14px', marginLeft: '8px', cursor: isAdmin ? 'pointer' : 'default', flex: 1 }}
                      onDoubleClick={() => startEditRoute(route)}
                      title={isAdmin ? "Kliknij dwukrotnie, aby edytować" : ""}
                    >
                      {route.name}
                      {isAdmin && <span style={{ opacity: 0.3, marginLeft: '6px', fontSize: '12px', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); startEditRoute(route); }}>✏️</span>}
                      {isAdmin && <span style={{ opacity: 0.3, marginLeft: '6px', fontSize: '12px', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); handleDeleteRoute(route); }} title="Usuń trasę">🗑️</span>}
                    </span>
                  )}
                  
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
                      <button onClick={() => handleMoveRoute(routeIndex, -1)} disabled={routeIndex === 0} style={{ opacity: routeIndex === 0 ? 0.2 : 0.6, background: 'none', border: 'none', cursor: routeIndex === 0 ? 'default' : 'pointer', fontSize: '14px' }}>◀</button>
                      <button onClick={() => handleMoveRoute(routeIndex, 1)} disabled={routeIndex === routes.length - 1} style={{ opacity: routeIndex === routes.length - 1 ? 0.2 : 0.6, background: 'none', border: 'none', cursor: routeIndex === routes.length - 1 ? 'default' : 'pointer', fontSize: '14px' }}>▶</button>
                    </div>
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
                                <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center' }}>
                                  {isAdmin && (
                                    <span 
                                      style={{ cursor: 'pointer', fontSize: '12px', opacity: 0.4, marginRight: '4px' }}
                                      onClick={() => openClientEdit(client)}
                                      title="Edytuj klienta"
                                    >
                                      ✏️
                                    </span>
                                  )}
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
                
                {isAdmin && (
                  <button 
                    className="add-btn" 
                    style={{ marginTop: '8px' }}
                    onClick={() => handleAddClient(route.id)}
                  >
                    ＋ Dodaj klienta
                  </button>
                )}
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

        {clientModalOpen && (
          <div className="ap-sheet-overlay" onClick={() => setClientModalOpen(false)}>
            <div className="ap-sheet" onClick={e => e.stopPropagation()}>
              <div className="ap-sheet-header">
                <div className="ap-sheet-title">Edytuj Klienta</div>
                <button className="ap-sheet-close" onClick={() => setClientModalOpen(false)}>✕</button>
              </div>
              <div className="ap-sheet-content">
                <div className="ap-field">
                  <label className="ap-label">Nazwa klienta</label>
                  <input 
                    className="ap-input" 
                    value={clientEditName} 
                    onChange={e => setClientEditName(e.target.value)} 
                    autoFocus 
                  />
                </div>
              </div>
              <div className="ap-sheet-footer" style={{ display: 'flex', gap: '8px' }}>
                <button className="ap-btn" style={{ background: '#FF3B30', color: 'white' }} onClick={deleteClient}>
                  Usuń klienta
                </button>
                <button className="ap-btn ap-btn-primary" style={{ flex: 1 }} onClick={saveClientName}>
                  Zapisz
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DragDropContext>
  );
}
