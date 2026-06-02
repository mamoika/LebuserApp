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

  if (loading) return <div className="loader">Ładowanie danych...</div>;
  if (error) return <div style={{ padding: '20px', color: 'var(--accent-red)' }}>Błąd: {error}</div>;

  const routeColors = [
    '#007AFF', '#FF9500', '#AF52DE', '#FF3B30', '#32ADE6', 
    '#34C759', '#5856D6', '#c49500', '#FF453A', '#636366'
  ];

  const getRouteColor = (index) => {
    return routeColors[index % 10] || routeColors[0];
  };

  const onDragEnd = async (result) => {
    if (!isAdmin) return;
    const { source, destination, draggableId } = result;

    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const sourceRouteId = parseInt(source.droppableId.replace('route-', ''));
    const destRouteId = parseInt(destination.droppableId.replace('route-', ''));

    const clientToMove = localClients.find(c => c.id === draggableId);
    if (!clientToMove) return;

    const newClients = Array.from(localClients);
    const sourceIndex = newClients.findIndex(c => c.id === draggableId);
    newClients.splice(sourceIndex, 1);

    const destRouteClients = newClients.filter(c => c.route_id === destRouteId).sort((a, b) => a.sort_order - b.sort_order);
    
    const updatedClient = { ...clientToMove, route_id: destRouteId };
    destRouteClients.splice(destination.index, 0, updatedClient);
    
    const finalClients = newClients.filter(c => c.route_id !== destRouteId);
    
    const updatesToDb = destRouteClients.map((c, index) => {
      const newSortOrder = index + 1;
      finalClients.push({ ...c, sort_order: newSortOrder });
      return { id: c.id, route_id: c.route_id, sort_order: newSortOrder, name: c.name };
    });

    setLocalClients(finalClients);

    try {
      const { error } = await supabase.from('clients').upsert(updatesToDb);
      if (error) throw error;
      refetch();
    } catch (err) {
      alert("Błąd zapisu kolejności: " + err.message);
      refetch();
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

  const renderRouteCol = (route, routeIndex) => {
    const routeClients = localClients.filter(c => c.route_id === route.id).sort((a, b) => a.sort_order - b.sort_order);
    const displayNum = routes.findIndex(r => r.id === route.id) + 1;
    const routeColor = getRouteColor(displayNum);

    return (
      <div key={route.id} className="col route-card" style={{ borderTopColor: routeColor }}>
        <div className="col-header" style={{ paddingBottom: '10px', marginBottom: '4px' }}>
          <span className="route-id-badge" style={{ background: routeColor }}>T{displayNum}</span>
          
          {editingRouteId === route.id ? (
            <input 
              type="text" 
              value={editRouteName}
              onChange={(e) => setEditRouteName(e.target.value)}
              onBlur={() => saveRouteName(route.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveRouteName(route.id);
                if (e.key === 'Escape') setEditingRouteId(null);
              }}
              autoFocus
              style={{ marginLeft: '8px', fontSize: '13px', fontWeight: 600, color: routeColor, border: `1px solid ${routeColor}`, borderRadius: '4px', padding: '2px 4px', outline: 'none', background: 'transparent' }}
            />
          ) : (
            <span className="route-title" style={{ color: routeColor, cursor: isAdmin ? 'pointer' : 'default', marginLeft: '6px' }} onDoubleClick={() => startEditRoute(route)}>
              {route.name}
            </span>
          )}

          {isAdmin && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
              <span className="edit-icon" onClick={() => startEditRoute(route)} title="Edytuj nazwę">✏️</span>
              <span className="edit-icon" onClick={() => handleDeleteRoute(route)} title="Usuń trasę" style={{ color: 'var(--accent-red)' }}>🗑️</span>
            </div>
          )}
        </div>
        
        <Droppable droppableId={`route-${route.id}`}>
          {(provided, snapshot) => (
            <div 
              ref={provided.innerRef} 
              {...provided.droppableProps}
              className="sortable-list"
              style={{ minHeight: '40px', background: snapshot.isDraggingOver ? 'rgba(0,0,0,0.02)' : 'transparent', borderRadius: '8px' }}
            >
              {routeClients.length === 0 ? (
                <div style={{ color: 'var(--text-quaternary)', fontSize: '12px', textAlign: 'center', margin: '10px 0' }}>Brak klientów</div>
              ) : (
                routeClients.map((client, index) => (
                  <Draggable key={client.id} draggableId={client.id} index={index} isDragDisabled={!isAdmin}>
                    {(provided, snapshot) => {
                      const dotClass = (client.lat && client.lng) ? 'gps-dot ok' : 'gps-dot missing';
                      return (
                        <div 
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className={`tag-client ${isAdmin ? 'draggable' : ''}`}
                          style={{
                            ...provided.draggableProps.style,
                            boxShadow: snapshot.isDragging ? '0 5px 15px rgba(0,0,0,0.1)' : 'none',
                            opacity: snapshot.isDragging ? 0.9 : 1
                          }}
                        >
                          {isAdmin && <span className="drag-handle">⠿</span>}
                          <span className="client-order">{index + 1}</span>
                          <span className="client-name">{client.name}</span>
                          <span className={dotClass} title={(client.lat && client.lng) ? 'ma GPS' : 'brak GPS'}></span>
                          {isAdmin && (
                            <span className="edit-icon" style={{ marginLeft: '8px' }} onClick={() => openClientEdit(client)}>Edytuj</span>
                          )}
                        </div>
                      )
                    }}
                  </Draggable>
                ))
              )}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
        
        <div style={{ flex: 1 }}></div>
        <div className="divider" style={{ margin: '8px 0' }}></div>
        {isAdmin && (
          <button className="add-btn" onClick={() => handleAddClient(route.id)}>+ dodaj klienta</button>
        )}
      </div>
    );
  };

  // Grouping logic equivalent to index.html
  const groups = [
    { title: '🗓 Trasy codzienne (Pn–Pt)', keywords: ['codzien', 'pn-pt'], routes: [] },
    { title: '🗓 Trasy Pn – Śr – Pt', keywords: ['pn', 'śr', 'sr', 'pt'], routes: [] },
    { title: '🗓 Trasy Wt – Czw', keywords: ['wt', 'cz'], routes: [] },
    { title: '📦 Pozostałe trasy', keywords: [], routes: [] }
  ];

  const sortedRoutes = [...routes].sort((a, b) => a.sort_order - b.sort_order);

  sortedRoutes.forEach(route => {
    let name = route.name.toLowerCase();
    let matched = false;
    for (let j = 0; j < 3; j++) {
      if (groups[j].keywords.some(kw => name.includes(kw))) {
        groups[j].routes.push(route);
        matched = true;
        break;
      }
    }
    if (!matched) groups[3].routes.push(route);
  });

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div>
        {isAdmin && (
          <div className="clients-header" style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button className="add-route-btn" onClick={handleAddRoute}>＋ Nowa trasa</button>
          </div>
        )}

        <div className="clients-hint" style={{ marginBottom: '16px' }}>
          {isAdmin && <span><span data-t="clients_drag_hint">☰ Przeciągaj klientów między trasami</span> &nbsp;·&nbsp;</span>}
          <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent-green)', verticalAlign: 'middle', margin: '0 2px' }}></span> <span>ma GPS</span> &nbsp;·&nbsp;
          <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent-orange)', verticalAlign: 'middle', margin: '0 2px', opacity: 0.6 }}></span> <span>brak GPS</span>
        </div>
        
        {groups.map((g, i) => {
          if (g.routes.length === 0) return null;
          return (
            <div key={i} style={{ width: '100%' }}>
              <div className="route-group-header">{g.title}</div>
              <div className="grid" style={{ marginBottom: '8px' }}>
                {g.routes.map((route, routeIndex) => renderRouteCol(route, routeIndex))}
              </div>
            </div>
          );
        })}

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
                <button className="ap-btn" style={{ background: 'var(--bg-secondary)', color: 'var(--accent-red)', border: '1px solid var(--border)' }} onClick={deleteClient}>
                  Usuń
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
