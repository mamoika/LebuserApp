import { useState, useEffect } from 'react';
import { useAppData } from '../hooks/useAppData';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

const SCHEDULE_OPTIONS = [
  { value: 'daily', label: 'Codziennie (Pn–Pt)' },
  { value: 'mwf',   label: 'Pn – Śr – Pt' },
  { value: 'tth',   label: 'Wt – Czw' },
  { value: 'other', label: 'Pozostałe' },
];

const SCHEDULE_GROUPS = [
  { value: 'daily', title: 'Trasy codzienne (Pn–Pt)' },
  { value: 'mwf',   title: 'Trasy Pn – Śr – Pt' },
  { value: 'tth',   title: 'Trasy Wt – Czw' },
  { value: 'other', title: 'Pozostałe trasy' },
];

const ROUTE_COLORS = [
  '#007AFF', '#FF9500', '#AF52DE', '#FF3B30', '#32ADE6',
  '#34C759', '#5856D6', '#c49500', '#FF453A', '#636366'
];

function getRouteColor(displayNum) {
  return ROUTE_COLORS[(displayNum - 1) % ROUTE_COLORS.length];
}

// ---- Modals ----

const LABEL_STYLE = { fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' };

function AddRouteModal({ onClose, onSave }) {
  const [name, setName] = useState('');
  const [schedule, setSchedule] = useState('daily');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave(name.trim(), schedule);
    setSaving(false);
  };

  return (
    <div className="ap-overlay" style={{ display: 'flex' }} onClick={onClose}>
      <div className="ap-sheet" onClick={e => e.stopPropagation()}>
        <div className="ap-handle" />
        <div className="ap-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(145deg,#007AFF,#0055CC)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0, boxShadow: '0 3px 10px rgba(0,122,255,0.3)' }}>🗺</div>
            <div className="ap-title" style={{ textAlign: 'left', fontSize: '19px' }}>Nowa trasa</div>
          </div>

          <div style={LABEL_STYLE}>Nazwa trasy</div>
          <input
            className="ap-input"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }}
            placeholder="np. Trasa Północna"
            style={{ marginBottom: '12px' }}
            autoFocus
          />

          <div style={LABEL_STYLE}>Harmonogram</div>
          <select className="ap-input" value={schedule} onChange={e => setSchedule(e.target.value)} style={{ marginBottom: '12px' }}>
            {SCHEDULE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <div className="ap-btn-group">
            <button className="ap-btn ap-btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? 'Zapisywanie…' : 'Dodaj trasę'}
            </button>
            <button className="ap-btn ap-btn-secondary" onClick={onClose} disabled={saving}>Anuluj</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditRouteModal({ route, onClose, onSave, onDelete }) {
  const [name, setName] = useState(route.name);
  const [schedule, setSchedule] = useState(route.schedule || 'other');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave(route.id, name.trim(), schedule);
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setSaving(true);
    await onDelete(route);
    setSaving(false);
  };

  return (
    <div className="ap-overlay" style={{ display: 'flex' }} onClick={onClose}>
      <div className="ap-sheet" onClick={e => e.stopPropagation()}>
        <div className="ap-handle" />
        <div className="ap-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(145deg,#FF9500,#CC6600)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0, boxShadow: '0 3px 10px rgba(255,149,0,0.3)' }}>✏️</div>
            <div className="ap-title" style={{ textAlign: 'left', fontSize: '19px' }}>Edytuj trasę</div>
          </div>

          <div style={LABEL_STYLE}>Nazwa trasy</div>
          <input
            className="ap-input"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }}
            style={{ marginBottom: '12px' }}
            autoFocus
          />

          <div style={LABEL_STYLE}>Harmonogram</div>
          <select className="ap-input" value={schedule} onChange={e => setSchedule(e.target.value)} style={{ marginBottom: '12px' }}>
            {SCHEDULE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <div className="ap-btn-group">
            <button className="ap-btn ap-btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? 'Zapisywanie…' : 'Zapisz zmiany'}
            </button>
            <button className="ap-btn ap-btn-danger" onClick={handleDelete} disabled={saving}>
              {confirmDelete ? 'Na pewno usunąć trasę?' : 'Usuń trasę'}
            </button>
            <button className="ap-btn ap-btn-secondary" onClick={onClose} disabled={saving}>Anuluj</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddClientModal({ routes, defaultRouteId, onClose, onSave }) {
  const [name, setName] = useState('');
  const [routeId, setRouteId] = useState(defaultRouteId);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave(name.trim(), routeId);
    setSaving(false);
  };

  return (
    <div className="ap-overlay" style={{ display: 'flex' }} onClick={onClose}>
      <div className="ap-sheet" onClick={e => e.stopPropagation()}>
        <div className="ap-handle" />
        <div className="ap-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(145deg,#34C759,#25A244)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0, boxShadow: '0 3px 10px rgba(52,199,89,0.3)' }}>👤</div>
            <div className="ap-title" style={{ textAlign: 'left', fontSize: '19px' }}>Nowy klient</div>
          </div>

          <div style={LABEL_STYLE}>Nazwa klienta</div>
          <input
            className="ap-input"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }}
            placeholder="Nazwa klienta"
            style={{ marginBottom: '12px' }}
            autoFocus
          />

          <div style={LABEL_STYLE}>Trasa</div>
          <select className="ap-input" value={routeId} onChange={e => setRouteId(Number(e.target.value))} style={{ marginBottom: '12px' }}>
            {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>

          <div className="ap-btn-group">
            <button className="ap-btn ap-btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? 'Zapisywanie…' : 'Dodaj klienta'}
            </button>
            <button className="ap-btn ap-btn-secondary" onClick={onClose} disabled={saving}>Anuluj</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditClientModal({ client, routes, onClose, onSave, onDelete }) {
  const [name, setName] = useState(client.name);
  const [routeId, setRouteId] = useState(client.route_id);
  const [lat, setLat] = useState(client.lat != null ? String(client.lat) : '');
  const [lng, setLng] = useState(client.lng != null ? String(client.lng) : '');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave({ id: client.id, name: name.trim(), routeId: Number(routeId), lat, lng, oldName: client.name, oldRouteId: client.route_id });
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setSaving(true);
    await onDelete(client);
    setSaving(false);
  };

  return (
    <div className="ap-overlay" style={{ display: 'flex' }} onClick={onClose}>
      <div className="ap-sheet" onClick={e => e.stopPropagation()}>
        <div className="ap-handle" />
        <div className="ap-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(145deg,#FF9500,#CC6600)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0, boxShadow: '0 3px 10px rgba(255,149,0,0.3)' }}>✏️</div>
            <div>
              <div className="ap-title" style={{ textAlign: 'left', fontSize: '19px', marginBottom: '1px' }}>Edytuj klienta</div>
              <div style={{ fontSize: '12px', color: 'rgba(60,60,67,0.5)' }}>{client.name}</div>
            </div>
          </div>

          <div style={LABEL_STYLE}>Nazwa klienta</div>
          <input className="ap-input" value={name} onChange={e => setName(e.target.value)} style={{ marginBottom: '12px' }} autoFocus />

          <div style={LABEL_STYLE}>Trasa</div>
          <select className="ap-input" value={routeId} onChange={e => setRouteId(Number(e.target.value))} style={{ marginBottom: '12px' }}>
            {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div>
              <div style={LABEL_STYLE}>Szerokość (lat)</div>
              <input className="ap-input" value={lat} onChange={e => setLat(e.target.value)} placeholder="52.2297" inputMode="decimal" />
            </div>
            <div>
              <div style={LABEL_STYLE}>Długość (lng)</div>
              <input className="ap-input" value={lng} onChange={e => setLng(e.target.value)} placeholder="21.0122" inputMode="decimal" />
            </div>
          </div>

          <div className="ap-btn-group">
            <button className="ap-btn ap-btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? 'Zapisywanie…' : 'Zapisz zmiany'}
            </button>
            <button className="ap-btn ap-btn-danger" onClick={handleDelete} disabled={saving}>
              {confirmDelete ? 'Na pewno usunąć?' : 'Usuń klienta'}
            </button>
            <button className="ap-btn ap-btn-secondary" onClick={onClose} disabled={saving}>Anuluj</button>
          </div>
        </div>
      </div>
    </div>
  );
}



// ---- Main component ----

export default function ClientsRoutesView() {
  const { clients, routes, loading, error, refetch } = useAppData();
  const { isAdmin } = useAuth();

  const [localClients, setLocalClients] = useState([]);
  const [editingRouteId, setEditingRouteId] = useState(null);
  const [editRouteName, setEditRouteName] = useState('');

  const [addRouteOpen, setAddRouteOpen] = useState(false);
  const [editRouteModal, setEditRouteModal] = useState(null);
  const [addClientForRoute, setAddClientForRoute] = useState(null); // routeId
  const [editClient, setEditClient] = useState(null);

  useEffect(() => {
    setLocalClients(clients);
  }, [clients]);

  if (loading) return <div className="loader">Ładowanie danych…</div>;
  if (error) return <div style={{ padding: '20px', color: 'var(--accent-red)' }}>Błąd: {error}</div>;

  // ---- Route actions ----

  const handleAddRoute = async (name, schedule) => {
    try {
      const maxSort = routes.length > 0 ? Math.max(...routes.map(r => r.sort_order ?? 0)) : 0;
      const { error } = await supabase.from('routes').insert({ name, schedule, sort_order: maxSort + 1 });
      if (error) throw error;
      setAddRouteOpen(false);
      refetch();
    } catch (err) {
      alert('Błąd dodawania trasy: ' + err.message);
    }
  };

  const handleSaveRoute = async (routeId, name, schedule) => {
    try {
      const { error } = await supabase.from('routes').update({ name, schedule }).eq('id', routeId);
      if (error) throw error;
      setEditRouteModal(null);
      refetch();
    } catch (err) {
      alert('Błąd zapisu trasy: ' + err.message);
    }
  };

  // inline edit name only (double-click) — kept for quick rename
  const startEditRoute = (route) => {
    setEditingRouteId(route.id);
    setEditRouteName(route.name);
  };

  const saveRouteName = async (routeId) => {
    if (!editRouteName.trim()) { setEditingRouteId(null); return; }
    try {
      const { error } = await supabase.from('routes').update({ name: editRouteName.trim() }).eq('id', routeId);
      if (error) throw error;
      setEditingRouteId(null);
      refetch();
    } catch (err) {
      alert('Błąd zapisu nazwy trasy: ' + err.message);
    }
  };

  const handleDeleteRoute = async (route) => {
    const hasClients = localClients.some(c => c.route_id === route.id);
    if (hasClients) {
      alert('Nie można usunąć trasy, do której są przypisani klienci!');
      return;
    }
    try {
      const { error } = await supabase.from('routes').delete().eq('id', route.id);
      if (error) throw error;
      setEditRouteModal(null);
      refetch();
    } catch (err) {
      alert('Błąd usuwania trasy: ' + err.message);
    }
  };

  // ---- Client actions ----

  const handleAddClient = async (name, routeId) => {
    const duplicate = clients.some(c => c.name.trim().toLowerCase() === name.toLowerCase());
    if (duplicate) { alert('Klient o tej nazwie już istnieje!'); return; }
    try {
      const { error } = await supabase.from('clients').insert({ name, route_id: routeId, sort_order: 9999 });
      if (error) throw error;
      setAddClientForRoute(null);
      refetch();
    } catch (err) {
      alert('Błąd dodawania klienta: ' + err.message);
    }
  };

  const handleSaveClient = async ({ id, name, routeId, lat, lng, oldName, oldRouteId }) => {
    const duplicate = clients.some(c => c.name.trim().toLowerCase() === name.toLowerCase() && c.id !== id);
    if (duplicate) { alert('Klient o tej nazwie już istnieje!'); return; }

    const parsedLat = lat !== '' ? parseFloat(String(lat).replace(',', '.')) : null;
    const parsedLng = lng !== '' ? parseFloat(String(lng).replace(',', '.')) : null;

    const updates = {
      name,
      route_id: routeId,
      lat: !isNaN(parsedLat) ? parsedLat : null,
      lng: !isNaN(parsedLng) ? parsedLng : null,
    };
    // Gdy zmiana trasy — przesuń na koniec nowej trasy
    if (routeId !== oldRouteId) updates.sort_order = 9999;

    try {
      const { error: clientErr } = await supabase.from('clients').update(updates).eq('id', id);
      if (clientErr) throw clientErr;

      // Cascade: aktualizuj client_name w entries gdy nazwa się zmieniła
      if (name !== oldName) {
        const { error: entryErr } = await supabase.from('entries').update({ client_name: name }).eq('client_name', oldName);
        if (entryErr) console.error('Cascade entries update failed:', entryErr.message);
      }

      setEditClient(null);
      refetch();
    } catch (err) {
      alert('Błąd zapisu klienta: ' + err.message);
    }
  };

  const handleDeleteClient = async (client) => {
    try {
      const { error } = await supabase.from('clients').delete().eq('id', client.id);
      if (error) throw error;
      setEditClient(null);
      refetch();
    } catch (err) {
      alert('Błąd usuwania klienta: ' + err.message);
    }
  };

  // ---- Drag & Drop ----

  const onDragEnd = async (result) => {
    if (!isAdmin) return;
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const sourceRouteId = parseInt(source.droppableId.replace('route-', ''));
    const destRouteId = parseInt(destination.droppableId.replace('route-', ''));
    const clientToMove = localClients.find(c => c.id === draggableId);
    if (!clientToMove) return;

    const rest = localClients.filter(c => c.id !== draggableId);

    let toUpsert;
    let newLocalClients;

    if (sourceRouteId === destRouteId) {
      // Reorder w tej samej trasie
      const routeClients = rest
        .filter(c => c.route_id === sourceRouteId)
        .sort((a, b) => a.sort_order - b.sort_order);
      routeClients.splice(destination.index, 0, { ...clientToMove });
      const reordered = routeClients.map((c, i) => ({ ...c, sort_order: i + 1 }));

      newLocalClients = [...rest.filter(c => c.route_id !== sourceRouteId), ...reordered];
      toUpsert = reordered.map(c => ({ id: c.id, route_id: c.route_id, sort_order: c.sort_order, name: c.name }));
    } else {
      // Przeniesienie między trasami
      const sourceClients = rest
        .filter(c => c.route_id === sourceRouteId)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((c, i) => ({ ...c, sort_order: i + 1 }));

      const destClients = rest
        .filter(c => c.route_id === destRouteId)
        .sort((a, b) => a.sort_order - b.sort_order);
      destClients.splice(destination.index, 0, { ...clientToMove, route_id: destRouteId });
      const destClientsOrdered = destClients.map((c, i) => ({ ...c, sort_order: i + 1 }));

      newLocalClients = [
        ...rest.filter(c => c.route_id !== sourceRouteId && c.route_id !== destRouteId),
        ...sourceClients,
        ...destClientsOrdered,
      ];
      toUpsert = [
        ...sourceClients.map(c => ({ id: c.id, route_id: c.route_id, sort_order: c.sort_order, name: c.name })),
        ...destClientsOrdered.map(c => ({ id: c.id, route_id: c.route_id, sort_order: c.sort_order, name: c.name })),
      ];
    }

    setLocalClients(newLocalClients);

    try {
      const { error } = await supabase.from('clients').upsert(toUpsert);
      if (error) throw error;
      refetch();
    } catch (err) {
      alert('Błąd zapisu kolejności: ' + err.message);
      refetch();
    }
  };

  // ---- Render ----

  const sortedRoutes = [...routes].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const groups = SCHEDULE_GROUPS.map(g => ({
    ...g,
    routes: sortedRoutes.filter(r => (r.schedule || 'other') === g.value),
  }));

  const renderRouteCol = (route) => {
    const routeClients = localClients
      .filter(c => c.route_id === route.id)
      .sort((a, b) => a.sort_order - b.sort_order);
    const displayNum = sortedRoutes.findIndex(r => r.id === route.id) + 1;
    const routeColor = getRouteColor(displayNum);

    return (
      <div key={route.id} className="col route-card" style={{ borderTopColor: routeColor }}>
        <div className="col-header" style={{ paddingBottom: '10px', marginBottom: '4px' }}>
          <span className="route-id-badge" style={{ background: routeColor }}>T{displayNum}</span>

          {editingRouteId === route.id ? (
            <input
              type="text"
              value={editRouteName}
              onChange={e => setEditRouteName(e.target.value)}
              onBlur={() => saveRouteName(route.id)}
              onKeyDown={e => {
                if (e.key === 'Enter') saveRouteName(route.id);
                if (e.key === 'Escape') setEditingRouteId(null);
              }}
              autoFocus
              style={{ marginLeft: '8px', fontSize: '13px', fontWeight: 600, color: routeColor, border: `1px solid ${routeColor}`, borderRadius: '4px', padding: '2px 4px', outline: 'none', background: 'transparent', flex: 1 }}
            />
          ) : (
            <span
              className="route-title"
              style={{ color: routeColor, cursor: isAdmin ? 'pointer' : 'default', marginLeft: '6px', flex: 1 }}
              onDoubleClick={() => isAdmin && startEditRoute(route)}
            >
              {route.name}
            </span>
          )}

          {isAdmin && (
            <div style={{ marginLeft: 'auto' }}>
              <span className="edit-icon" onClick={() => setEditRouteModal(route)} title="Edytuj trasę">✏️</span>
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
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        className={`tag-client ${isAdmin ? 'draggable' : ''}`}
                        style={{
                          ...provided.draggableProps.style,
                          boxShadow: snapshot.isDragging ? '0 5px 15px rgba(0,0,0,0.1)' : 'none',
                          opacity: snapshot.isDragging ? 0.9 : 1,
                        }}
                      >
                        {isAdmin && <span className="drag-handle">⠿</span>}
                        <span className="client-order">{index + 1}</span>
                        <span className="client-name">{client.name}</span>
                        <span
                          className={(client.lat && client.lng) ? 'gps-dot ok' : 'gps-dot missing'}
                          title={(client.lat && client.lng) ? 'ma GPS' : 'brak GPS'}
                        />
                        {isAdmin && (
                          <span className="edit-icon" style={{ marginLeft: '8px' }} onClick={() => setEditClient(client)}>Edytuj</span>
                        )}
                      </div>
                    )}
                  </Draggable>
                ))
              )}
              {provided.placeholder}
            </div>
          )}
        </Droppable>

        <div style={{ flex: 1 }} />
        <div className="divider" style={{ margin: '8px 0' }} />
        {isAdmin && (
          <button className="add-btn" onClick={() => setAddClientForRoute(route.id)}>+ dodaj klienta</button>
        )}
      </div>
    );
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div>
        {isAdmin && (
          <div className="clients-header" style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button className="add-route-btn" onClick={() => setAddRouteOpen(true)}>＋ Nowa trasa</button>
          </div>
        )}

        <div className="clients-hint" style={{ marginBottom: '16px' }}>
          {isAdmin && <span>☰ Przeciągaj klientów między trasami &nbsp;·&nbsp;</span>}
          <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent-green)', verticalAlign: 'middle', margin: '0 2px' }} /> <span>ma GPS</span> &nbsp;·&nbsp;
          <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent-orange)', verticalAlign: 'middle', margin: '0 2px', opacity: 0.6 }} /> <span>brak GPS</span>
        </div>

        {groups.map((g, i) => {
          if (g.routes.length === 0) return null;
          return (
            <div key={i} style={{ width: '100%' }}>
              <div className="route-group-header">{g.title}</div>
              <div className="grid" style={{ marginBottom: '8px' }}>
                {g.routes.map(route => renderRouteCol(route))}
              </div>
            </div>
          );
        })}
      </div>

      {addRouteOpen && (
        <AddRouteModal onClose={() => setAddRouteOpen(false)} onSave={handleAddRoute} />
      )}

      {editRouteModal && (
        <EditRouteModal
          route={editRouteModal}
          onClose={() => setEditRouteModal(null)}
          onSave={handleSaveRoute}
          onDelete={handleDeleteRoute}
        />
      )}

      {addClientForRoute !== null && (
        <AddClientModal
          routes={routes}
          defaultRouteId={addClientForRoute}
          onClose={() => setAddClientForRoute(null)}
          onSave={handleAddClient}
        />
      )}

      {editClient && (
        <EditClientModal
          client={editClient}
          routes={routes}
          onClose={() => setEditClient(null)}
          onSave={handleSaveClient}
          onDelete={handleDeleteClient}
        />
      )}


    </DragDropContext>
  );
}
