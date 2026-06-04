import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { DAY_NAMES, formatWeekKey } from '../../lib/dateUtils';
import { toastError } from '../../lib/toast';
import { logAction } from '../../lib/logger';

// arr_day: 1=PN, 2=WT, 3=ŚR, 4=CZ, 5=PT
function getDefaultPickInfo(arrDay, schedule = 'other') {
  const d = parseInt(arrDay);

  if (schedule === 'daily') {
    if (d <= 4) return { pickDay: d + 1, pickWeek: 0 };
    return { pickDay: 1, pickWeek: 1 }; // PT → PN nast.
  }

  if (schedule === 'mwf') {
    if (d <= 1) return { pickDay: 3, pickWeek: 0 }; // PN → ŚR
    if (d <= 3) return { pickDay: 5, pickWeek: 0 }; // WT/ŚR → PT
    return { pickDay: 1, pickWeek: 1 }; // CZ/PT → PN nast.
  }

  if (schedule === 'tth') {
    if (d <= 2) return { pickDay: 4, pickWeek: 0 }; // PN/WT → CZW
    return { pickDay: 2, pickWeek: 1 }; // ŚR/CZW/PT → WT nast.
  }

  if (d <= 3) return { pickDay: d + 2, pickWeek: 0 };
  if (d === 4) return { pickDay: 2, pickWeek: 1 };
  return { pickDay: 1, pickWeek: 1 };
}

function parseRouteIds(routesStr) {
  return new Set(
    (routesStr || '').split(',').map(s => Number(s.trim())).filter(Boolean)
  );
}

function firstClientByRouteOrder(clients, routes) {
  const sortedRoutes = [...routes].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const firstRoute = sortedRoutes.find(r => clients.some(c => c.route_id === r.id));
  return firstRoute
    ? [...clients].filter(c => c.route_id === firstRoute.id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0]
    : clients[0];
}

function clientRouteSchedule(clients, routes, clientName) {
  const client = (clients || []).find(c => c.name === clientName);
  const route = (routes || []).find(r => r.id === client?.route_id);
  return route?.schedule || 'other';
}

function nextWeekKey(weekKey) {
  const parts = weekKey.split('-');
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  d.setDate(d.getDate() + 7);
  return formatWeekKey(d);
}

// Porównuje wpis przed i po edycji, zwraca listę zmienionych pól w formacie
// "etykieta: stara → nowa". Dzięki temu log edycji jest zawsze kompletny —
// łapie KAŻDE zmienione pole, nie tylko te wpisane ręcznie.
function buildEditDiff(entry, updates, routes) {
  const dayLabel = v => DAY_NAMES[v - 1] || '?';
  const fields = [
    { key: 'client_name',  label: 'klient',          fmt: v => (v ?? '') === '' ? '—' : String(v) },
    { key: 'type',         label: 'typ',             fmt: v => v === 'O' ? 'Obrusy' : 'Pościel' },
    { key: 'weight',       label: 'waga',            fmt: v => (v === null || v === undefined || v === '') ? '—' : `${v} kg` },
    { key: 'arr_day',      label: 'przyjazd',        fmt: dayLabel },
    { key: 'pick_day',     label: 'odbiór',          fmt: dayLabel },
    { key: 'pick_week_key', label: 'tydzień odbioru', fmt: v => (v ?? '') === '' ? '—' : String(v) },
    { key: 'urgent',       label: 'priorytet',       fmt: v => v ? 'tak' : 'nie' },
    { key: 'route_id',     label: 'trasa',           fmt: v => (routes || []).find(r => r.id === v)?.name || '—' },
  ];
  const norm = v => (v === null || v === undefined) ? '' : (typeof v === 'number' ? String(v) : String(v).trim());
  const changes = [];
  for (const f of fields) {
    if (norm(entry[f.key]) !== norm(updates[f.key])) {
      changes.push(`${f.label}: ${f.fmt(entry[f.key])} → ${f.fmt(updates[f.key])}`);
    }
  }
  return changes;
}

export function AddEntryModal({ isOpen, onClose, defaultArrDay, weekKey, clients, routes, onAdded, defaultClientName, defaultType }) {
  const { user, isDriver, isAdmin } = useAuth();
  const [clientName, setClientName] = useState('');
  const [showOtherRoutes, setShowOtherRoutes] = useState(false);
  const [type, setType] = useState('P');
  const [weight, setWeight] = useState('');
  const [arrDay, setArrDay] = useState(defaultArrDay || 1);
  const [pickDay, setPickDay] = useState(defaultArrDay || 1);
  const [pickWeek, setPickWeek] = useState(0); // 0 = same, 1 = next
  const [trolleys, setTrolleys] = useState(1);
  const [urgent, setUrgent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [explicitRouteId, setExplicitRouteId] = useState('');
  const isClientScoped = !!defaultClientName;

  const assignedRouteIds = parseRouteIds(user?.routes);
  const hasAssignedRouteFilter = isDriver && assignedRouteIds.size > 0;
  const ownClients = hasAssignedRouteFilter
    ? clients.filter(c => assignedRouteIds.has(c.route_id))
    : clients;
  const otherClients = hasAssignedRouteFilter
    ? clients.filter(c => c.route_id && !assignedRouteIds.has(c.route_id))
    : [];
  const selectableClients = hasAssignedRouteFilter && showOtherRoutes ? otherClients : ownClients;
  const canToggleOtherRoutes = hasAssignedRouteFilter && otherClients.length > 0;

  useEffect(() => {
    if (isOpen) {
      const day = defaultArrDay || 1;
      // Jeśli podano defaultClientName, pre-wybierz tego klienta; inaczej pierwszy z tras
      let initClient;
      if (defaultClientName) {
        initClient = clients.find(c => c.name === defaultClientName);
      }
      if (!initClient) initClient = firstClientByRouteOrder(ownClients, routes);
      const { pickDay: pd, pickWeek: pw } = getDefaultPickInfo(day, clientRouteSchedule(clients, routes, initClient?.name));
      setArrDay(day);
      setPickDay(pd);
      setPickWeek(pw);
      setShowOtherRoutes(false);
      setClientName(initClient?.name || '');
      setWeight('');
      setType(defaultType || 'P');
      setTrolleys(1);
      setUrgent(false);
      setExplicitRouteId('');
    }
  }, [isOpen, defaultArrDay, clients, routes, user?.routes, isDriver, defaultClientName]);

  useEffect(() => {
    if (!isOpen) return;
    if (defaultClientName) return; // Blokada dla pre-wybranego klienta
    const nextClient = firstClientByRouteOrder(selectableClients, routes);
    if (!selectableClients.some(c => c.name === clientName)) {
      setClientName(nextClient?.name || '');
      const { pickDay: pd, pickWeek: pw } = getDefaultPickInfo(arrDay, clientRouteSchedule(clients, routes, nextClient?.name));
      setPickDay(pd);
      setPickWeek(pw);
    }
  }, [isOpen, showOtherRoutes, selectableClients, routes, clients, clientName, arrDay, defaultClientName]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    try {
      setLoading(true);
      const client = clients.find(c => c.name === clientName);
      if (!client) throw new Error('Wybierz klienta');
      const routeId = explicitRouteId ? Number(explicitRouteId) : (client ? client.route_id : 1);

      // Calculate pick_week_key
      let pickWeekKey = weekKey;
      if (pickWeek === 1) {
        pickWeekKey = nextWeekKey(weekKey);
      }

      // Unikalne ID — sam timestamp w ms powodował kolizje przy szybkim dodawaniu
      // dwóch wpisów (ten sam id → akcje/grupowanie łączyły je w jedno zamówienie).
      const newEntryId = 'ID_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const { error } = await supabase.from('entries').insert([{
        id: newEntryId,
        week_key: weekKey,
        client_name: clientName,
        arr_day: parseInt(arrDay),
        pick_day: parseInt(pickDay),
        pick_week_key: pickWeekKey,
        weight: weight ? parseFloat(weight.replace(',', '.')) : null,
        route_id: routeId,
        type: type,
        trolleys: trolleys !== '' ? Number(trolleys) : 1,
        added_by: user.name,
        urgent: urgent
      }]);

      if (error) throw error;
      await logAction({ userName: user.name, action: 'added', clientName, entryId: newEntryId, details: `${type === 'O' ? 'Obrusy' : 'Pościel'}${weight ? ', ' + weight + ' kg' : ''}` });
      await onAdded?.({ id: newEntryId, clientName, routeId, type, weight, trolleys });
      onClose();
    } catch (err) {
      toastError("Błąd dodawania: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ap-overlay" style={{ display: 'flex' }}>
      <div className="ap-sheet">
        <div className="ap-handle"></div>
        <div className="ap-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(145deg,#34C759,#25A244)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0, boxShadow: '0 3px 10px rgba(52,199,89,0.3)' }}>📦</div>
            <div>
              <div className="ap-title" style={{ textAlign: 'left', fontSize: '19px', marginBottom: '1px' }}>
                {isClientScoped ? (clientName || defaultClientName) : 'Dodaj przyjazd'}
              </div>
              <div style={{ fontSize: '12px', color: 'rgba(60,60,67,0.5)', fontWeight: 400 }}>
                {isClientScoped ? 'Brudne pranie do pralni' : user?.name}
              </div>
            </div>
          </div>

          {!isClientScoped && (
            <>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Klient</div>
              <select
                className="ap-input"
                style={{ padding: '12px 14px', marginBottom: '12px' }}
                value={clientName}
                onChange={e => {
                  setClientName(e.target.value);
                  const { pickDay: pd, pickWeek: pw } = getDefaultPickInfo(arrDay, clientRouteSchedule(clients, routes, e.target.value));
                  setPickDay(pd);
                  setPickWeek(pw);
                }}
              >
                {routes
                  .filter(r => selectableClients.some(c => c.route_id === r.id))
                  .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                  .map(r => (
                    <optgroup key={r.id} label={`${r.name}${hasAssignedRouteFilter && assignedRouteIds.has(r.id) ? ' · twoja trasa' : ''}`}>
                      {selectableClients
                        .filter(c => c.route_id === r.id)
                        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                        .map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </optgroup>
                  ))}
              </select>
              {canToggleOtherRoutes && (
                <button
                  type="button"
                  onClick={() => setShowOtherRoutes(v => !v)}
                  style={{
                    width: '100%',
                    border: '1px solid rgba(0,122,255,0.22)',
                    background: showOtherRoutes ? 'rgba(0,122,255,0.12)' : 'rgba(0,122,255,0.06)',
                    color: 'var(--accent)',
                    borderRadius: '12px',
                    padding: '10px 12px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    marginTop: '-4px',
                    marginBottom: '12px',
                  }}
                >
                  {showOtherRoutes ? 'Wróć do moich tras' : 'Dodaj klienta z innej trasy'}
                </button>
              )}
            </>
          )}

          {isAdmin && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Przypisz do trasy (Opcjonalnie)</div>
              <select className="ap-input" value={explicitRouteId} onChange={e => setExplicitRouteId(e.target.value)}>
                <option value="">Domyślna trasa klienta</option>
                {routes.map(r => (
                  <option key={r.id} value={r.id}>T{r.sort_order ?? r.id} - {r.name}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Rodzaj prania</div>
          <div className="segmented-control" style={{ marginBottom: '12px' }}>
            <button type="button" className={`seg-btn type-P ${type === 'P' ? 'active' : ''}`} onClick={() => setType('P')}>Pościel</button>
            <button type="button" className={`seg-btn type-O ${type === 'O' ? 'active' : ''}`} onClick={() => setType('O')}>Obrusy</button>
          </div>

          <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Waga (kg) — opcjonalnie</div>
          <input type="text" className="ap-input" placeholder="np. 150.5" style={{ marginBottom: '12px' }} inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value)} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Dzień przyjazdu</div>
              <select className="ap-input" value={arrDay} onChange={e => { const { pickDay: pd, pickWeek: pw } = getDefaultPickInfo(e.target.value, clientRouteSchedule(clients, routes, clientName)); setArrDay(e.target.value); setPickDay(pd); setPickWeek(pw); }}>
                {DAY_NAMES.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Dzień odbioru</div>
              <select className="ap-input" value={pickDay} onChange={e => setPickDay(e.target.value)}>
                {DAY_NAMES.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Tydzień odbioru</div>
              <select className="ap-input" value={pickWeek} onChange={e => setPickWeek(Number(e.target.value))}>
                <option value={0}>Ten sam tydzień</option>
                <option value={1}>Następny tydzień</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Wózki</div>
              <input type="number" className="ap-input" value={trolleys} onChange={e => setTrolleys(e.target.value ? Number(e.target.value) : '')} min="0" />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, marginBottom: '4px', cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: '18px', height: '18px' }} checked={urgent} onChange={e => setUrgent(e.target.checked)} />
            <span style={{ color: 'var(--accent-red)' }}>🚩 Pilne (priorytet)</span>
          </label>

          <div className="ap-btn-group" style={{ marginTop: '18px' }}>
            <button className="ap-btn ap-btn-primary" onClick={handleSubmit} disabled={loading}>{loading ? 'Dodawanie...' : 'Dodaj'}</button>
            <button className="ap-btn ap-btn-secondary" onClick={onClose} disabled={loading}>Anuluj</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ViewEditEntryModal({ isOpen, onClose, entry, relatedEntries = [], onUpdated, onDeleted, routes, clients = [], contextMode = 'view', initiallyEditing = false }) {
  const { isAdmin, canEdit, user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [clientName, setClientName] = useState('');
  const [type, setType] = useState('P');
  const [weight, setWeight] = useState('');
  const [arrDay, setArrDay] = useState(1);
  const [pickDay, setPickDay] = useState(1);
  const [pickWeek, setPickWeek] = useState(0); // 0 = same, 1 = next week
  const [trolleys, setTrolleys] = useState(1);
  const [urgent, setUrgent] = useState(false);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [routeId, setRouteId] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (isOpen && entry) {
      setEditing(initiallyEditing);
      setClientName(entry.client_name || '');
      setType(entry.type || 'P');
      setWeight(entry.weight || '');
      setArrDay(entry.arr_day || 1);
      setPickDay(entry.pick_day || 1);
      setPickWeek(entry.week_key === entry.pick_week_key ? 0 : 1);
      setTrolleys(entry.trolleys ?? 1);
      setUrgent(entry.urgent || false);
      // Komentarz klienta (wspólna notatka) — preferuj clients.note, fallback na stary entry.comment
      const clientNote = (clients || []).find(c => c.name === entry.client_name)?.note;
      setComment(clientNote !== undefined ? (clientNote || '') : (entry.comment || ''));
      setRouteId(entry.route_id || 1);
    }
  }, [isOpen, entry]);

  if (!isOpen || !entry) return null;

  const sortedRoutes = [...(routes || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const knownClientNames = new Set((clients || []).map(c => c.name));
  const selectedClient = (clients || []).find(c => c.name === clientName);
  const isPickupContext = contextMode === 'pick';
  const pickupEntries = isPickupContext && relatedEntries.length > 0 ? relatedEntries : [entry];
  const isGroupedPickup = isPickupContext && pickupEntries.length > 1;
  const pickupTotalWeight = pickupEntries.reduce((sum, e) => sum + (parseFloat(e.weight) || 0), 0);
  const allPickupDone = pickupEntries.every(e => e.done);
  const pickedByNames = [...new Set(pickupEntries.map(e => e.picked_by).filter(Boolean))];
  const pickupArrivalDays = [...new Set(pickupEntries.map(e => DAY_NAMES[(e.arr_day || 1) - 1]).filter(Boolean))].join(', ');
  const hasPickupSheets = pickupEntries.some(e => (e.type || 'P') === 'P');
  const hasPickupTablecloths = pickupEntries.some(e => e.type === 'O');
  const pickupTypeLabel = hasPickupSheets && hasPickupTablecloths
    ? 'Pościel + Obrusy'
    : hasPickupTablecloths
      ? 'Obrusy'
      : 'Pościel';
  const directEditMode = contextMode === 'arr' && initiallyEditing;
  const showEditForm = canEdit && (editing || directEditMode);

  const handleClientChange = (name) => {
    setClientName(name);
    const selected = (clients || []).find(c => c.name === name);
    if (selected?.route_id) {
      setRouteId(selected.route_id);
      const { pickDay: pd, pickWeek: pw } = getDefaultPickInfo(arrDay, clientRouteSchedule(clients, routes, name));
      setPickDay(pd);
      setPickWeek(pw);
    }
  };

  const toggleDone = async () => {
    try {
      setLoading(true);
      const isDone = !allPickupDone;
      const pickedAt = isDone ? new Date().toISOString() : null;
      const pickedBy = isDone ? user.name : null;
      const updates = { done: isDone, picked_by: pickedBy, picked_at: pickedAt };

      const ids = pickupEntries.map(e => e.id);
      const { error } = await supabase.from('entries').update(updates).in('id', ids);
      if (error) throw error;
      await logAction({
        userName: user.name,
        action: isDone ? 'done' : 'undone',
        clientName: entry.client_name,
        entryId: entry.id,
        details: isGroupedPickup ? `${pickupEntries.length} wpisy, ${pickupTotalWeight ? Number(pickupTotalWeight.toFixed(1)) + ' kg' : 'bez wagi'}` : undefined,
      });
      onUpdated();
      onClose();
    } catch (err) {
      toastError("Błąd: " + err.message);
      setLoading(false);
    }
    };

    const handleSaveEdit = async () => {
    try {
      setLoading(true);

      let pickWeekKey = entry.week_key;
      if (pickWeek === 1) pickWeekKey = nextWeekKey(entry.week_key);

      const nextRouteId = routeId || selectedClient?.route_id || entry.route_id || null;

      let updates = {
        client_name: clientName,
        type: type,
        weight: weight ? parseFloat(String(weight).replace(',', '.')) : null,
        arr_day: parseInt(arrDay),
        pick_day: parseInt(pickDay),
        pick_week_key: pickWeekKey,
        trolleys: trolleys !== '' ? Number(trolleys) : 1,
        urgent,
        route_id: nextRouteId
        // comment usunięty z entries — teraz w clients.note (wspólna notatka)
      };

      const { error } = await supabase.from('entries').update(updates).eq('id', entry.id);
      if (error) throw error;

      // Zapisz komentarz do clients.note (wspólny dla całego klienta)
      const currentClientNote = (clients || []).find(c => c.name === entry.client_name)?.note || '';
      if (comment !== (currentClientNote || '')) {
        await supabase.from('clients').update({ note: comment || null }).eq('name', clientName.trim() || entry.client_name);
      }
      // Loguj tylko realne zmiany — automatycznie wykrywamy każde zmienione pole.
      const changes = buildEditDiff(entry, updates, routes);
      // Śledź też zmianę komentarza klienta
      const currentClientNote2 = (clients || []).find(c => c.name === entry.client_name)?.note || '';
      if (comment !== (currentClientNote2 || '')) {
        changes.push(`komentarz: "${currentClientNote2 || '—'}" → "${comment || '—'}"`);
      }
      if (changes.length > 0) {
        await logAction({
          userName: user.name,
          action: 'edited',
          clientName: updates.client_name,
          entryId: entry.id,
          details: changes.join(', '),
        });
      }
      onUpdated();
      onClose();
    } catch (err) {
      toastError("Błąd edycji: " + err.message);
      setLoading(false);
    }
    };

    const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    try {
      setLoading(true);
      // Miękkie usuwanie: oznaczamy wpis jako usunięty zamiast kasować go z bazy,
      // dzięki czemu zostaje w historii i nic nie przepada.
      const { error } = await supabase
        .from('entries')
        .update({ deleted_at: new Date().toISOString(), deleted_by: user.name })
        .eq('id', entry.id);
      if (error) throw error;
      await logAction({
        userName: user.name,
        action: 'deleted',
        clientName: entry.client_name,
        entryId: entry.id,
        details: `${entry.type === 'O' ? 'Obrusy' : 'Pościel'}, przyjazd: ${DAY_NAMES[entry.arr_day - 1] || '?'}, odbiór: ${DAY_NAMES[entry.pick_day - 1] || '?'}, waga: ${entry.weight ?? '—'}`,      });
      onDeleted();
      onClose();
    } catch (err) {
      toastError("Błąd: " + err.message);
      setLoading(false);
    }
    };

    // Widok Edycji (tylko dla Admin/Driver po kliknięciu 'Edytuj')
    if (showEditForm) {
    return (
      <div className="ap-overlay" style={{ display: 'flex' }}>
        <div className="ap-sheet">
          <div className="ap-handle"></div>
          <div className="ap-content">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(145deg,#007AFF,#0055CC)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0, boxShadow: '0 3px 10px rgba(0,122,255,0.3)' }}>✏️</div>
              <div>
                <div className="ap-title" style={{ textAlign: 'left', fontSize: '19px', marginBottom: '1px' }}>
                  {contextMode === 'arr' ? (clientName || entry.client_name) : 'Edytuj wpis'}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: 600 }}>
                  {contextMode === 'arr' ? 'Edytuj wpis' : entry.client_name}
                </div>
              </div>
            </div>

            {contextMode !== 'arr' && (
              <>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Klient</div>
                <select className="ap-input" style={{ padding: '12px 14px', marginBottom: '14px' }} value={clientName} onChange={e => handleClientChange(e.target.value)}>
                  {!knownClientNames.has(entry.client_name) && <option value={entry.client_name}>{entry.client_name}</option>}
                  {sortedRoutes
                    .filter(r => clients.some(c => c.route_id === r.id))
                    .map((r, index) => (
                      <optgroup key={r.id} label={`T${index + 1} - ${r.name}`}>
                        {clients
                          .filter(c => c.route_id === r.id)
                          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                          .map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </optgroup>
                    ))}
                </select>
              </>
            )}

            <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Rodzaj prania</div>
            <div className="segmented-control" style={{ marginBottom: '14px' }}>
              <button type="button" className={`seg-btn type-P ${type === 'P' ? 'active' : ''}`} onClick={() => setType('P')}>Pościel</button>
              <button type="button" className={`seg-btn type-O ${type === 'O' ? 'active' : ''}`} onClick={() => setType('O')}>Obrusy</button>
            </div>

            <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Waga (kg)</div>
            <input type="text" className="ap-input" value={weight} onChange={e => setWeight(e.target.value)} style={{ marginBottom: '14px' }} inputMode="decimal" />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Przyjazd</div>
                <select
                  className="ap-input"
                  value={arrDay}
                  onChange={e => {
                    const { pickDay: pd, pickWeek: pw } = getDefaultPickInfo(e.target.value, clientRouteSchedule(clients, routes, clientName));
                    setArrDay(e.target.value);
                    setPickDay(pd);
                    setPickWeek(pw);
                  }}
                >
                  {DAY_NAMES.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Odbiór</div>
                <select className="ap-input" value={pickDay} onChange={e => setPickDay(e.target.value)}>
                  {DAY_NAMES.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Tydzień odbioru</div>
                <select className="ap-input" value={pickWeek} onChange={e => setPickWeek(Number(e.target.value))}>
                  <option value={0}>Ten sam tydzień</option>
                  <option value={1}>Następny tydzień</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Wózki</div>
                <input type="number" className="ap-input" value={trolleys} onChange={e => setTrolleys(e.target.value ? Number(e.target.value) : '')} min="0" />
              </div>
            </div>

            {isAdmin && (
              <div className="ap-field" style={{ marginBottom: '14px' }}>
                <label className="ap-label" style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: '6px' }}>Trasa logistyczna</label>
                <select className="ap-select ap-input" value={routeId} onChange={e => setRouteId(Number(e.target.value))} style={{ width: '100%', padding: '12px 14px' }}>
                  {sortedRoutes.map((r, index) => (
                    <option key={r.id} value={r.id}>T{index + 1} - {r.name}</option>
                  ))}
                </select>
              </div>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px', fontWeight: 500, marginBottom: '14px', cursor: 'pointer', padding: '12px 14px', background: 'rgba(255,59,48,0.06)', borderRadius: '12px', border: '1px solid rgba(255,59,48,0.15)' }}>
              <input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} style={{ width: '20px', height: '20px', accentColor: '#FF3B30' }} />
              <span style={{ color: '#FF3B30', fontWeight: 600 }}>🚩 Pilne (priorytet)</span>
            </label>

            <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Komentarz</div>
            <input type="text" className="ap-input" value={comment} onChange={e => setComment(e.target.value)} style={{ marginBottom: '18px' }} />

            <div className="ap-btn-group">
              <button className="ap-btn ap-btn-primary" onClick={handleSaveEdit} disabled={loading}>Zapisz</button>
              <button className="ap-btn ap-btn-secondary" onClick={() => directEditMode ? onClose() : setEditing(false)} disabled={loading}>Anuluj</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Widok Szczegółów (Domyślny)
  const routeName = routes?.find(r => r.id === entry.route_id)?.name || '—';

  return (
    <div className="ap-overlay" style={{ display: 'flex' }}>
      <div className="ap-sheet">
        <div className="ap-handle"></div>
        <div className="ap-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(145deg,#007AFF,#0055CC)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0, boxShadow: '0 3px 10px rgba(0,122,255,0.3)' }}>📋</div>
            <div>
              <div className="ap-title" style={{ textAlign: 'left', fontSize: '19px', marginBottom: '2px' }}>{entry.client_name}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{routeName}{entry.urgent ? ' · 🚩 Pilne' : ''}</div>
            </div>
          </div>

          <ROW label="Status" value={allPickupDone ? 'Odebrane ✓' : 'W toku'} valueColor={allPickupDone ? 'var(--accent-green)' : undefined} />
          <ROW label="Widok" value={isPickupContext ? 'Odbiór' : contextMode === 'arr' ? 'Przyjazd' : 'Szczegóły'} valueColor={isPickupContext ? 'var(--accent-green)' : undefined} />
          <ROW label="Rodzaj" value={isPickupContext ? pickupTypeLabel : entry.type === 'O' ? 'Obrusy' : 'Pościel'} />
          <ROW label="Waga" value={isPickupContext ? (pickupTotalWeight ? `${Number(pickupTotalWeight.toFixed(1))} kg` : '—') : (entry.weight ? `${entry.weight} kg` : '—')} />
          {!isGroupedPickup && <ROW label="Wózki" value={entry.trolleys ?? 1} />}
          {isGroupedPickup && <ROW label="Wpisy" value={`${pickupEntries.length} przyjazdy`} />}
          <ROW label={isGroupedPickup ? 'Przyjazdy' : 'Przyjazd'} value={isGroupedPickup ? pickupArrivalDays : DAY_NAMES[entry.arr_day - 1]} />
          <ROW label="Odbiór" value={DAY_NAMES[entry.pick_day - 1]} />
          {entry.added_by && <ROW label="Dodał" value={`${entry.added_by} · ${fmtDateTime(entry.added_at)}`} />}
          {allPickupDone && pickedByNames.length > 0 && <ROW label="Odebrał" value={pickedByNames.join(', ')} valueColor="var(--accent-green)" />}
          {(() => { const cn = (clients || []).find(c => c.name === entry.client_name)?.note || entry.comment; return cn ? <ROW label="Komentarz" value={cn} /> : null; })()}

          {isGroupedPickup && (
            <div style={{ marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px' }}>
                Szczegóły przyjazdów
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {pickupEntries.map((item, index) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '28px 1fr auto auto',
                      gap: '8px',
                      alignItems: 'center',
                      padding: '8px 10px',
                      borderRadius: '10px',
                      background: item.done ? 'rgba(142,142,147,0.08)' : 'var(--accent-light)',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                      fontWeight: 650,
                    }}
                  >
                    <span style={{ color: 'var(--text-tertiary)' }}>#{index + 1}</span>
                    <span>
                      {DAY_NAMES[item.arr_day - 1]}
                      <span style={{ color: 'var(--text-tertiary)', fontWeight: 550 }}> · {item.added_by || '—'}</span>
                    </span>
                    <span>{item.type === 'O' ? 'Obrusy' : 'Pościel'}</span>
                    <span>{item.weight ? `${item.weight} kg` : '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(() => {
            const canUndone = isPickupContext && (!allPickupDone || isAdmin || pickupEntries.some(e => e.picked_by === user?.name));
            return (
              <div className="ap-btn-group" style={{ marginTop: '16px' }}>
                {canUndone && (
                  <button className="ap-btn" style={{ background: 'var(--accent-green-light)', color: 'var(--accent-green)' }} onClick={toggleDone} disabled={loading}>
                    {allPickupDone ? 'Cofnij odbiór' : 'Oznacz jako odebrane'}
                  </button>
                )}
                <button className="ap-btn ap-btn-secondary" onClick={onClose} disabled={loading}>Zamknij</button>
              </div>
            );
          })()}
          
          {canEdit && !isGroupedPickup && (
            <div style={{ display: 'grid', gridTemplateColumns: isAdmin ? '1fr 1fr' : '1fr', gap: '8px', marginTop: '8px' }}>
              <button className="ap-btn" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} onClick={() => setEditing(true)} disabled={loading}>Edytuj</button>
              {isAdmin && (
                <button className="ap-btn ap-btn-danger" onClick={handleDelete} disabled={loading}>
                  {confirmDelete ? 'Na pewno?' : 'Usuń'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const fmtDateTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const hh = String(d.getHours()).padStart(2,'0');
  const min = String(d.getMinutes()).padStart(2,'0');
  return `${dd}.${mm} ${hh}:${min}`;
};

const ROW = ({ label, value, valueColor }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', padding: '10px 0' }}>
    <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>{label}</span>
    <span style={{ fontWeight: 600, fontSize: '13px', color: valueColor || 'var(--text-primary)', textAlign: 'right', maxWidth: '60%' }}>{value}</span>
  </div>
);
