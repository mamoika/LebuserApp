import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { DAY_NAMES, formatWeekKey } from '../../lib/dateUtils';
import { toastError } from '../../lib/toast';

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// arr_day: 1=PN, 2=WT, 3=ŚR, 4=CZ, 5=PT
// PN→ŚR(0), WT→CZ(0), ŚR→PT(0), CZ→WT(1), PT→PN(1)
function getDefaultPickInfo(arrDay) {
  const d = parseInt(arrDay);
  if (d <= 3) return { pickDay: d + 2, pickWeek: 0 };
  if (d === 4) return { pickDay: 2, pickWeek: 1 }; // CZ → WT nast.
  return { pickDay: 1, pickWeek: 1 }; // PT → PN nast.
}

export function AddEntryModal({ isOpen, onClose, defaultArrDay, weekKey, clients, routes, onAdded }) {
  const { user } = useAuth();
  const [clientName, setClientName] = useState('');
  const [type, setType] = useState('P');
  const [weight, setWeight] = useState('');
  const [arrDay, setArrDay] = useState(defaultArrDay || 1);
  const [pickDay, setPickDay] = useState(defaultArrDay || 1);
  const [pickWeek, setPickWeek] = useState(0); // 0 = same, 1 = next
  const [urgent, setUrgent] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const day = defaultArrDay || 1;
      const { pickDay: pd, pickWeek: pw } = getDefaultPickInfo(day);
      setArrDay(day);
      setPickDay(pd);
      setPickWeek(pw);
      // Pierwszy klient wg kolejności grup (sort_order trasy, potem klienta)
      const sortedRoutes = [...routes].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      const firstRoute = sortedRoutes.find(r => clients.some(c => c.route_id === r.id));
      const firstClient = firstRoute
        ? [...clients].filter(c => c.route_id === firstRoute.id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0]
        : clients[0];
      setClientName(firstClient?.name || '');
      setWeight('');
      setType('P');
      setUrgent(false);
    }
  }, [isOpen, defaultArrDay, clients, routes]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    try {
      setLoading(true);
      const client = clients.find(c => c.name === clientName);
      const routeId = client ? client.route_id : 1;

      // Calculate pick_week_key
      let pickWeekKey = weekKey;
      if (pickWeek === 1) {
        const parts = weekKey.split('-');
        const d = new Date(parts[0], parts[1] - 1, parts[2]);
        d.setDate(d.getDate() + 7);
        pickWeekKey = formatWeekKey(d);
      }

      const { data, error } = await supabase.from('entries').insert([{
        id: 'ID_' + new Date().getTime(),
        week_key: weekKey,
        client_name: clientName,
        arr_day: parseInt(arrDay),
        pick_day: parseInt(pickDay),
        pick_week_key: pickWeekKey,
        weight: weight ? parseFloat(weight.replace(',', '.')) : null,
        route_id: routeId,
        type: type,
        added_by: user.name,
        urgent: urgent
      }]);

      if (error) throw error;
      onAdded();
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
              <div className="ap-title" style={{ textAlign: 'left', fontSize: '19px', marginBottom: '1px' }}>Dodaj przyjazd</div>
              <div style={{ fontSize: '12px', color: 'rgba(60,60,67,0.5)', fontWeight: 400 }}>{user?.name}</div>
            </div>
          </div>

          <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Klient</div>
          <select className="ap-input" style={{ padding: '12px 14px', marginBottom: '12px' }} value={clientName} onChange={e => setClientName(e.target.value)}>
            {routes
              .filter(r => clients.some(c => c.route_id === r.id))
              .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
              .map(r => (
                <optgroup key={r.id} label={r.name}>
                  {clients
                    .filter(c => c.route_id === r.id)
                    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                    .map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </optgroup>
              ))}
          </select>

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
              <select className="ap-input" value={arrDay} onChange={e => { const { pickDay: pd, pickWeek: pw } = getDefaultPickInfo(e.target.value); setArrDay(e.target.value); setPickDay(pd); setPickWeek(pw); }}>
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

          <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Tydzień odbioru</div>
          <select className="ap-input" style={{ marginBottom: '12px' }} value={pickWeek} onChange={e => setPickWeek(Number(e.target.value))}>
            <option value={0}>Ten sam tydzień</option>
            <option value={1}>Następny tydzień</option>
          </select>

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

export function ViewEditEntryModal({ isOpen, onClose, entry, onUpdated, onDeleted, routes }) {
  const { isAdmin, canEdit, isDriver, user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [type, setType] = useState('P');
  const [weight, setWeight] = useState('');
  const [arrDay, setArrDay] = useState(1);
  const [pickDay, setPickDay] = useState(1);
  const [pickWeek, setPickWeek] = useState(0); // 0 = same, 1 = next week
  const [urgent, setUrgent] = useState(false);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [routeId, setRouteId] = useState(1);
  const [pickupComment, setPickupComment] = useState('');
  const [showPickupComment, setShowPickupComment] = useState(false);

  useEffect(() => {
    if (isOpen && entry) {
      setEditing(false);
      setType(entry.type || 'P');
      setWeight(entry.weight || '');
      setArrDay(entry.arr_day || 1);
      setPickDay(entry.pick_day || 1);
      setPickWeek(entry.week_key === entry.pick_week_key ? 0 : 1);
      setUrgent(entry.urgent || false);
      setComment(entry.comment || '');
      setRouteId(entry.route_id || 1);
      setPickupComment('');
      setShowPickupComment(false);
    }
  }, [isOpen, entry]);

  if (!isOpen || !entry) return null;

  const toggleDone = async () => {
    const isDone = !entry.done;
    // Przy oznaczaniu jako odebrane — najpierw pokaż pole komentarza
    if (isDone && !showPickupComment) {
      setShowPickupComment(true);
      return;
    }
    try {
      setLoading(true);
      const pickedAt = isDone ? new Date().toISOString() : null;
      const pickedBy = isDone ? user.name : null;
      const updates = { done: isDone, picked_by: pickedBy, picked_at: pickedAt };
      if (isDone && pickupComment.trim()) updates.comment = pickupComment.trim();
      if (!isDone) { updates.comment = null; }

      const { error } = await supabase.from('entries').update(updates).eq('id', entry.id);
      if (error) throw error;
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
      if (pickWeek === 1) {
        const parts = entry.week_key.split('-');
        const d = new Date(parts[0], parts[1] - 1, parts[2]);
        d.setDate(d.getDate() + 7);
        pickWeekKey = formatWeekKey(d);
      }

      const updates = {
        type,
        weight: weight ? parseFloat(String(weight).replace(',', '.')) : null,
        arr_day: parseInt(arrDay),
        pick_day: parseInt(pickDay),
        pick_week_key: pickWeekKey,
        urgent,
        comment,
        route_id: routeId
      };

      const { error } = await supabase.from('entries').update(updates).eq('id', entry.id);
      if (error) throw error;
      
      onUpdated();
      onClose();
    } catch (err) {
      toastError("Błąd edycji: " + err.message);
      setLoading(false);
    }
  };

  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    try {
      setLoading(true);
      const { error } = await supabase.from('entries').delete().eq('id', entry.id);
      if (error) throw error;
      onDeleted();
      onClose();
    } catch (err) {
      toastError("Błąd: " + err.message);
      setLoading(false);
    }
  };

  // Widok Edycji (tylko dla Admin/Driver po kliknięciu 'Edytuj')
  if (editing && canEdit) {
    return (
      <div className="ap-overlay" style={{ display: 'flex' }}>
        <div className="ap-sheet">
          <div className="ap-handle"></div>
          <div className="ap-content">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(145deg,#007AFF,#0055CC)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0, boxShadow: '0 3px 10px rgba(0,122,255,0.3)' }}>✏️</div>
              <div>
                <div className="ap-title" style={{ textAlign: 'left', fontSize: '19px', marginBottom: '1px' }}>Edytuj wpis</div>
                <div style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: 600 }}>{entry.client_name}</div>
              </div>
            </div>

            {/* Pola dostępne tylko dla admina */}
            {isAdmin && (<>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Rodzaj prania</div>
              <div className="segmented-control" style={{ marginBottom: '14px' }}>
                <button type="button" className={`seg-btn type-P ${type === 'P' ? 'active' : ''}`} onClick={() => setType('P')}>Pościel</button>
                <button type="button" className={`seg-btn type-O ${type === 'O' ? 'active' : ''}`} onClick={() => setType('O')}>Obrusy</button>
              </div>

              <div className="ap-field" style={{ marginBottom: '14px' }}>
                <label className="ap-label" style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: '6px' }}>Trasa logistyczna</label>
                <select className="ap-select ap-input" value={routeId} onChange={e => setRouteId(Number(e.target.value))} style={{ width: '100%', padding: '12px 14px' }}>
                  {routes.map((r, index) => (
                    <option key={r.id} value={r.id}>T{index + 1} - {r.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Przyjazd</div>
                  <select className="ap-input" value={arrDay} onChange={e => setArrDay(e.target.value)}>
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

              <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Tydzień odbioru</div>
              <select className="ap-input" style={{ marginBottom: '14px' }} value={pickWeek} onChange={e => setPickWeek(Number(e.target.value))}>
                <option value={0}>Ten sam tydzień</option>
                <option value={1}>Następny tydzień</option>
              </select>

              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px', fontWeight: 500, marginBottom: '14px', cursor: 'pointer', padding: '12px 14px', background: 'rgba(255,59,48,0.06)', borderRadius: '12px', border: '1px solid rgba(255,59,48,0.15)' }}>
                <input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} style={{ width: '20px', height: '20px', accentColor: '#FF3B30' }} />
                <span style={{ color: '#FF3B30', fontWeight: 600 }}>🚩 Pilne (priorytet)</span>
              </label>
            </>)}

            {/* Pola dostępne dla wszystkich (admin + kierowca) */}
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Waga (kg)</div>
            <input type="text" className="ap-input" value={weight} onChange={e => setWeight(e.target.value)} style={{ marginBottom: '14px' }} inputMode="decimal" />

            <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Komentarz</div>
            <input type="text" className="ap-input" value={comment} onChange={e => setComment(e.target.value)} style={{ marginBottom: '18px' }} />

            <div className="ap-btn-group">
              <button className="ap-btn ap-btn-primary" onClick={handleSaveEdit} disabled={loading}>Zapisz</button>
              <button className="ap-btn ap-btn-secondary" onClick={() => setEditing(false)} disabled={loading}>Anuluj</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Widok Szczegółów (Domyślny)
  const routeName = routes?.find(r => r.id === entry.route_id)?.name || '—';
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

          <ROW label="Status" value={entry.done ? 'Odebrane ✓' : 'W toku'} valueColor={entry.done ? 'var(--accent-green)' : undefined} />
          <ROW label="Rodzaj" value={entry.type === 'O' ? 'Obrusy' : 'Pościel'} />
          <ROW label="Waga" value={entry.weight ? `${entry.weight} kg` : '—'} />
          <ROW label="Przyjazd" value={DAY_NAMES[entry.arr_day - 1]} />
          <ROW label="Odbiór" value={DAY_NAMES[entry.pick_day - 1]} />
          {entry.added_by && <ROW label="Dodał" value={`${entry.added_by} · ${fmtDateTime(entry.added_at)}`} />}
          {entry.done && entry.picked_by && <ROW label="Odebrał" value={`${entry.picked_by} · ${fmtDateTime(entry.picked_at)}`} valueColor="var(--accent-green)" />}
          {entry.comment && <ROW label="Komentarz" value={entry.comment} />}

          {showPickupComment && !entry.done && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Komentarz przy odbiorze (opcjonalnie)</div>
              <input
                type="text"
                className="ap-input"
                value={pickupComment}
                onChange={e => setPickupComment(e.target.value)}
                placeholder="np. brakuje 2 worków"
                style={{ marginBottom: '10px' }}
                autoFocus
              />
            </div>
          )}

          <div className="ap-btn-group" style={{ marginTop: '16px' }}>
            <button className="ap-btn" style={{ background: 'var(--accent-green-light)', color: 'var(--accent-green)' }} onClick={toggleDone} disabled={loading}>
              {entry.done ? 'Cofnij odbiór' : showPickupComment ? 'Potwierdź odbiór' : 'Oznacz jako odebrane'}
            </button>
            {showPickupComment && !entry.done && (
              <button className="ap-btn ap-btn-secondary" onClick={() => setShowPickupComment(false)} disabled={loading}>Wróć</button>
            )}
            {!showPickupComment && (
              <button className="ap-btn ap-btn-secondary" onClick={onClose} disabled={loading}>Zamknij</button>
            )}
          </div>
          
          {canEdit && (
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
