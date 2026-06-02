import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { DAY_NAMES, formatWeekKey } from '../../lib/dateUtils';

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
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
      setArrDay(defaultArrDay || 1);
      setPickDay(defaultArrDay || 1);
      setClientName(clients[0]?.name || '');
      setWeight('');
      setType('P');
      setPickWeek(0);
      setUrgent(false);
    }
  }, [isOpen, defaultArrDay, clients]);

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
      alert("Błąd dodawania: " + err.message);
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
            {clients.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
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
              <select className="ap-input" value={arrDay} onChange={e => { setArrDay(e.target.value); setPickDay(e.target.value); }}>
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
  const { isAdmin, canEdit, user } = useAuth();
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
    }
  }, [isOpen, entry]);

  if (!isOpen || !entry) return null;

  const toggleDone = async () => {
    try {
      setLoading(true);
      const isDone = !entry.done;
      const pickedAt = isDone ? new Date().toISOString() : null;
      const pickedBy = isDone ? user.name : null;
      
      const { error } = await supabase.from('entries')
        .update({ done: isDone, picked_by: pickedBy, picked_at: pickedAt })
        .eq('id', entry.id);
        
      if (error) throw error;
      onUpdated();
      onClose();
    } catch (err) {
      alert("Błąd: " + err.message);
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
      alert("Błąd edycji: " + err.message);
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Czy na pewno chcesz usunąć ten wpis?")) return;
    try {
      setLoading(true);
      const { error } = await supabase.from('entries').delete().eq('id', entry.id);
      if (error) throw error;
      onDeleted();
      onClose();
    } catch (err) {
      alert("Błąd: " + err.message);
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

            <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Waga (kg)</div>
            <input type="text" className="ap-input" value={weight} onChange={e => setWeight(e.target.value)} style={{ marginBottom: '14px' }} inputMode="decimal" />

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

            <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Komentarz</div>
            <input type="text" className="ap-input" value={comment} onChange={e => setComment(e.target.value)} style={{ marginBottom: '14px' }} />

            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px', fontWeight: 500, marginBottom: '18px', cursor: 'pointer', padding: '12px 14px', background: 'rgba(255,59,48,0.06)', borderRadius: '12px', border: '1px solid rgba(255,59,48,0.15)' }}>
              <input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} style={{ width: '20px', height: '20px', accentColor: '#FF3B30' }} />
              <span style={{ color: '#FF3B30', fontWeight: 600 }}>🚩 Pilne (priorytet)</span>
            </label>

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
  return (
    <div className="ap-overlay" style={{ display: 'flex' }}>
      <div className="ap-sheet">
        <div className="ap-handle"></div>
        <div className="ap-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(145deg,#007AFF,#0055CC)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0, boxShadow: '0 3px 10px rgba(0,122,255,0.3)' }}>📋</div>
            <div>
              <div className="ap-title" style={{ textAlign: 'left', fontSize: '19px', marginBottom: '1px' }}>Szczegóły wpisu</div>
              <div style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: 600 }}>{entry.client_name}</div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', padding: '12px 0' }}>
            <span style={{ color: 'var(--text-tertiary)', fontSize: '14px' }}>Status</span>
            <span style={{ fontWeight: 600, color: entry.done ? 'var(--accent-green)' : 'var(--text-primary)' }}>{entry.done ? 'Odebrane' : 'W toku'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', padding: '12px 0' }}>
            <span style={{ color: 'var(--text-tertiary)', fontSize: '14px' }}>Dzień przyjazdu</span>
            <span style={{ fontWeight: 600 }}>{DAY_NAMES[entry.arr_day - 1]}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', padding: '12px 0' }}>
            <span style={{ color: 'var(--text-tertiary)', fontSize: '14px' }}>Dzień odbioru</span>
            <span style={{ fontWeight: 600 }}>{DAY_NAMES[entry.pick_day - 1]}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', padding: '12px 0' }}>
            <span style={{ color: 'var(--text-tertiary)', fontSize: '14px' }}>Waga</span>
            <span style={{ fontWeight: 600 }}>{entry.weight ? `${entry.weight} kg` : 'Brak'}</span>
          </div>

          <div className="ap-btn-group" style={{ marginTop: '24px' }}>
            <button className="ap-btn" style={{ background: 'var(--accent-green-light)', color: 'var(--accent-green)' }} onClick={toggleDone} disabled={loading}>
              {entry.done ? 'Cofnij odbiór' : 'Oznacz jako odebrane'}
            </button>
            <button className="ap-btn ap-btn-secondary" onClick={onClose} disabled={loading}>Zamknij</button>
          </div>
          
          {canEdit && (
            <div style={{ display: 'grid', gridTemplateColumns: isAdmin ? '1fr 1fr' : '1fr', gap: '8px', marginTop: '8px' }}>
              <button className="ap-btn" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} onClick={() => setEditing(true)} disabled={loading}>Edytuj</button>
              {isAdmin && <button className="ap-btn ap-btn-danger" onClick={handleDelete} disabled={loading}>Usuń</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
