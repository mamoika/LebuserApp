import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { toastError, toastSuccess } from '../lib/toast';
import { useAuth } from '../context/AuthContext';
import { loadMonthRoster } from '../lib/roster';

const LABEL_STYLE = { fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' };
const MONTHS_PL = ["Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec","Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"];

// Picker tras — pokazuje wszystkie trasy jako chip-toggley
function RoutesPicker({ value, onChange }) {
  const [allRoutes, setAllRoutes] = useState([]);

  useEffect(() => {
    supabase.from('routes').select('id,name').order('sort_order').then(({ data }) => {
      if (data) setAllRoutes(data);
    });
  }, []);

  // value = string "1,3,5"
  const selected = new Set(
    (value || '').split(',').map(s => s.trim()).filter(Boolean).map(Number)
  );

  const toggle = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange([...next].sort((a, b) => a - b).join(','));
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
      {allRoutes.map(r => {
        const on = selected.has(r.id);
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => toggle(r.id)}
            style={{
              padding: '6px 12px', borderRadius: '20px', border: 'none',
              fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              background: on ? 'var(--accent)' : 'rgba(0,0,0,0.06)',
              color: on ? '#fff' : 'var(--text-secondary)',
              transition: 'all 0.12s',
            }}
          >
            {r.name}
          </button>
        );
      })}
      {allRoutes.length === 0 && (
        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Ładowanie tras…</span>
      )}
    </div>
  );
}

function AddUserModal({ onClose, onSave }) {
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('driver');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!username.trim() || !name.trim()) return;
    setSaving(true);
    setError('');
    const result = await onSave(username.trim(), name.trim(), role);
    setSaving(false);
    if (result?.error) setError(result.error);
  };

  return (
    <div className="ap-overlay" style={{ display: 'flex' }} onClick={onClose}>
      <div className="ap-sheet" onClick={e => e.stopPropagation()}>
        <div className="ap-handle" />
        <div className="ap-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(145deg,#34C759,#25A244)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0, boxShadow: '0 3px 10px rgba(52,199,89,0.3)' }}>👤</div>
            <div className="ap-title" style={{ textAlign: 'left', fontSize: '19px' }}>Nowy użytkownik</div>
          </div>

          {error && <div className="ap-error" style={{ marginBottom: '12px' }}>{error}</div>}

          <div style={LABEL_STYLE}>Login</div>
          <input
            className="ap-input"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="np. jan.kowalski"
            style={{ marginBottom: '12px' }}
            autoFocus
            autoComplete="off"
          />

          <div style={LABEL_STYLE}>Imię i nazwisko</div>
          <input
            className="ap-input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Jan Kowalski"
            style={{ marginBottom: '12px' }}
          />

          <div style={LABEL_STYLE}>Rola</div>
          <select className="ap-input" value={role} onChange={e => setRole(e.target.value)} style={{ marginBottom: '12px' }}>
            <option value="viewer">Tylko podgląd</option>
            <option value="driver">Kierowca</option>
            <option value="admin">Administrator</option>
          </select>

          <div className="ap-btn-group">
            <button className="ap-btn ap-btn-primary" onClick={handleSave} disabled={saving || !username.trim() || !name.trim()}>
              {saving ? 'Tworzenie…' : 'Utwórz użytkownika'}
            </button>
            <button className="ap-btn ap-btn-secondary" onClick={onClose}>Anuluj</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditUserModal({ user, onClose, onSave, onResetPassword, onDelete, onImpersonate }) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState(user.role);
  const [routes, setRoutes] = useState(user.routes || '');
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(user.id, name.trim(), role, routes.trim());
    setSaving(false);
  };

  const handleReset = async () => {
    if (!user.has_password) return;
    setResetting(true);
    await onResetPassword(user.id);
    setResetting(false);
    setResetDone(true);
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setSaving(true);
    await onDelete(user.id);
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
              <div className="ap-title" style={{ textAlign: 'left', fontSize: '19px', marginBottom: '1px' }}>Edytuj użytkownika</div>
              <div style={{ fontSize: '12px', color: 'rgba(60,60,67,0.5)' }}>@{user.username}</div>
            </div>
          </div>

          <div style={LABEL_STYLE}>Imię i nazwisko</div>
          <input className="ap-input" value={name} onChange={e => setName(e.target.value)} style={{ marginBottom: '12px' }} autoFocus />

          <div style={LABEL_STYLE}>Rola</div>
          <select className="ap-input" value={role} onChange={e => setRole(e.target.value)} style={{ marginBottom: '12px' }}>
            <option value="viewer">Tylko podgląd</option>
            <option value="driver">Kierowca</option>
            <option value="admin">Administrator</option>
          </select>

          {role === 'driver' && (
            <>
              <div style={LABEL_STYLE}>Przypisane trasy</div>
              <RoutesPicker value={routes} onChange={setRoutes} />
            </>
          )}

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px', background: '#fff', borderRadius: '13px',
            marginBottom: '16px', boxShadow: '0 0 0 0.5px rgba(0,0,0,0.08)',
          }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>Status hasła</div>
              <div style={{ fontSize: '12px', fontWeight: 500, marginTop: '2px', color: resetDone ? '#CC6600' : user.has_password ? '#25A244' : '#CC6600' }}>
                {resetDone
                  ? '⚠️ Zresetowane — user ustawi przy następnym logowaniu'
                  : user.has_password ? '✓ Ustawione' : '— Nie ustawione jeszcze'}
              </div>
            </div>
            {user.has_password && !resetDone && (
              <button
                onClick={handleReset}
                disabled={resetting}
                style={{
                  background: 'rgba(255,59,48,0.1)', color: '#FF3B30',
                  border: 'none', borderRadius: '8px', padding: '6px 12px',
                  fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                {resetting ? '…' : 'Resetuj hasło'}
              </button>
            )}
          </div>

          <div className="ap-btn-group">
            <button className="ap-btn ap-btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Zapisywanie…' : 'Zapisz zmiany'}
            </button>
            <button
              className="ap-btn"
              style={{ background: 'rgba(88,86,214,0.1)', color: '#5856D6', fontWeight: 600 }}
              onClick={onImpersonate}
              disabled={saving}
            >
              👁 Zaloguj jako ten użytkownik
            </button>
            <button className="ap-btn ap-btn-danger" onClick={handleDelete} disabled={saving}>
              {confirmDelete ? 'Na pewno usunąć użytkownika?' : 'Usuń użytkownika'}
            </button>
            <button className="ap-btn ap-btn-secondary" onClick={onClose}>Zamknij</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GroupModal({ group, onClose, onSave, onDelete }) {
  const isNew = !group;
  const [name, setName] = useState(group?.name || '');
  const [color, setColor] = useState(group?.color || '#455a64');
  const [sortOrder, setSortOrder] = useState(group?.sort_order || 9999);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave({ id: group?.id, name: name.trim(), color, sort_order: parseInt(sortOrder, 10) || 9999 });
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setSaving(true);
    const res = await onDelete(group.id, group.name);
    setSaving(false);
    if (res?.error) {
      import('../lib/toast').then(m => m.toastError(res.error));
    }
  };

  return (
    <div className="ap-overlay" style={{ display: 'flex' }} onClick={onClose}>
      <div className="ap-sheet" onClick={e => e.stopPropagation()}>
        <div className="ap-handle" />
        <div className="ap-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: `linear-gradient(145deg, ${color}, ${color}cc)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>🏷️</div>
            <div className="ap-title" style={{ textAlign: 'left', fontSize: '19px' }}>{isNew ? 'Nowa grupa' : 'Edytuj grupę'}</div>
          </div>

          <div style={LABEL_STYLE}>Nazwa grupy</div>
          <input className="ap-input" value={name} onChange={e => setName(e.target.value)} placeholder="np. KIEROWCY" style={{ marginBottom: '12px' }} autoFocus />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div>
              <div style={LABEL_STYLE}>Kolor HEX</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ width: '44px', height: '44px', padding: 0, border: 'none', borderRadius: '8px', cursor: 'pointer' }} />
                <input className="ap-input" value={color} onChange={e => setColor(e.target.value)} placeholder="#000000" />
              </div>
            </div>
            <div>
              <div style={LABEL_STYLE}>Kolejność (Sort)</div>
              <input type="number" className="ap-input" value={sortOrder} onChange={e => setSortOrder(e.target.value)} placeholder="10" />
            </div>
          </div>

          <div className="ap-btn-group" style={{ marginTop: '24px' }}>
            <button className="ap-btn ap-btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>{saving ? 'Zapisywanie…' : 'Zapisz'}</button>
            {!isNew && <button className="ap-btn ap-btn-danger" onClick={handleDelete} disabled={saving}>{confirmDelete ? 'Na pewno usunąć?' : 'Usuń'}</button>}
            <button className="ap-btn ap-btn-secondary" onClick={onClose} disabled={saving}>Anuluj</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GroupsSection() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);

  const fetch = async () => {
    const { data } = await supabase.from('groups').select('*').order('sort_order').order('name');
    setGroups(data || []);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const handleSave = async ({ id, name, color, sort_order }) => {
    if (id) {
      await supabase.from('groups').update({ name, color, sort_order }).eq('id', id);
    } else {
      await supabase.from('groups').insert({ name, color, sort_order });
    }
    setModal(null);
    fetch();
  };

  const handleDelete = async (id, groupName) => {
    const { count, error } = await supabase.from('employees').select('id', { count: 'exact', head: true }).eq('group_name', groupName);
    if (error) return { error: error.message };
    if (count > 0) return { error: `Nie można usunąć grupy, do której przypisanych jest ${count} pracowników.` };
    
    await supabase.from('groups').delete().eq('id', id);
    setModal(null);
    fetch();
    return { ok: true };
  };

  if (loading) return <div style={{ color: 'var(--text-tertiary)', fontSize: '13px', padding: '12px 0' }}>Ładowanie grup…</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ fontSize: '17px', fontWeight: 700 }}>Grupy pracowników</div>
        <button onClick={() => setModal('new')} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '10px', padding: '8px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>+ Dodaj grupę</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {groups.map(g => (
          <div key={g.id} onClick={() => setModal(g)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border)', cursor: 'pointer' }}>
            <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: g.color }} />
            <div style={{ flex: 1, fontWeight: 600, fontSize: '15px' }}>{g.name}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Sort: {g.sort_order}</div>
          </div>
        ))}
      </div>

      {(modal === 'new' || (modal && typeof modal === 'object')) && (
        <GroupModal
          group={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}

const CONTRACT_TYPES = ['UoP', 'UZ', 'UoD', 'B2B'];

function EmployeeModal({ employee, groups, monthLabel, onClose, onSave, onRemoveFromMonth }) {
  const isNew = !employee;
  const [name, setName] = useState(employee?.name || '');
  const [groupName, setGroupName] = useState(employee?.group_name || (groups[0]?.name || ''));
  const [contractType, setContractType] = useState(employee?.contract_type || 'UoP');
  const [defaultStart, setDefaultStart] = useState(employee?.default_start || '7');
  const [defaultEnd, setDefaultEnd] = useState(employee?.default_end || '15');
  const [active, setActive] = useState(employee?.active !== false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave({ id: employee?.id, name: name.trim(), group_name: groupName, contract_type: contractType, default_start: defaultStart, default_end: defaultEnd, active });
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setSaving(true);
    await onRemoveFromMonth(employee.id);
    setSaving(false);
  };

  const grpColor = groups.find(g => g.name === groupName)?.color || '#455a64';

  return (
    <div className="ap-overlay" style={{ display: 'flex' }} onClick={onClose}>
      <div className="ap-sheet" onClick={e => e.stopPropagation()}>
        <div className="ap-handle" />
        <div className="ap-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: `linear-gradient(145deg, ${grpColor}, ${grpColor}cc)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>👤</div>
            <div className="ap-title" style={{ textAlign: 'left', fontSize: '19px' }}>{isNew ? 'Nowy pracownik' : 'Edytuj pracownika'}</div>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '18px' }}>Miesiąc: <b>{monthLabel}</b> — grupa i aktywność dotyczą tego miesiąca</div>

          <div style={LABEL_STYLE}>Nazwisko i imię</div>
          <input className="ap-input" value={name} onChange={e => setName(e.target.value)} placeholder="np. Kowalski Jan" style={{ marginBottom: '12px' }} autoFocus />

          <div style={LABEL_STYLE}>Grupa (w tym miesiącu)</div>
          <select className="ap-input" value={groupName} onChange={e => setGroupName(e.target.value)} style={{ marginBottom: '12px' }}>
            {groups.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
          </select>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div>
              <div style={LABEL_STYLE}>Umowa</div>
              <select className="ap-input" value={contractType} onChange={e => setContractType(e.target.value)}>
                {CONTRACT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <div style={LABEL_STYLE}>Start</div>
              <input className="ap-input" value={defaultStart} onChange={e => setDefaultStart(e.target.value)} placeholder="7" />
            </div>
            <div>
              <div style={LABEL_STYLE}>Koniec</div>
              <input className="ap-input" value={defaultEnd} onChange={e => setDefaultEnd(e.target.value)} placeholder="15" />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', fontWeight: 600, marginBottom: '18px', cursor: 'pointer' }}>
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} style={{ width: '18px', height: '18px' }} />
            Aktywny w tym miesiącu
          </label>

          <div className="ap-btn-group">
            <button className="ap-btn ap-btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>{saving ? 'Zapisywanie…' : 'Zapisz'}</button>
            {!isNew && <button className="ap-btn ap-btn-danger" onClick={handleDelete} disabled={saving}>{confirmDelete ? 'Na pewno usunąć z miesiąca?' : 'Usuń z miesiąca'}</button>}
            <button className="ap-btn ap-btn-secondary" onClick={onClose} disabled={saving}>Anuluj</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmployeesSection() {
  const [allEmployees, setAllEmployees] = useState([]); // globalna lista (do dodawania istniejących)
  const [roster, setRoster] = useState([]);             // skład wybranego miesiąca (z nieaktywnymi)
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);             // null | 'new' | employee obj
  const [showAdd, setShowAdd] = useState(false);
  const now = new Date();
  const [cur, setCur] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });

  const monthLabel = `${MONTHS_PL[cur.month - 1]} ${cur.year}`;
  const atMinMonth = cur.year === 2026 && cur.month === 1; // start: styczeń 2026
  const shiftMonth = (delta) => setCur(c => {
    const m0 = c.month - 1 + delta;
    const ny = c.year + Math.floor(m0 / 12);
    const nm = ((m0 % 12) + 12) % 12 + 1;
    if (ny < 2026) return c; // nie cofamy przed styczeń 2026
    return { year: ny, month: nm };
  });

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: empData }, { data: grpData }, rosterData] = await Promise.all([
      supabase.from('employees').select('*').order('sort_order').order('name'),
      supabase.from('groups').select('*').order('sort_order'),
      loadMonthRoster(cur.year, cur.month, { includeInactive: true })
    ]);
    setAllEmployees(empData || []);
    setGroups(grpData || []);
    setRoster(rosterData || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [cur.year, cur.month]);

  const handleSave = async ({ id, name, group_name, contract_type, default_start, default_end, active }) => {
    if (id) {
      // dane stałe → employees (globalnie)
      await supabase.from('employees').update({ name, contract_type, default_start, default_end }).eq('id', id);
      // dane miesięczne → employee_months
      const sort = roster.find(r => r.id === id)?.sort_order ?? 0;
      await supabase.from('employee_months').upsert(
        { employee_id: id, year: cur.year, month: cur.month, active, group_name, sort_order: sort },
        { onConflict: 'employee_id,year,month' }
      );
    } else {
      const maxOrder = allEmployees.length > 0 ? Math.max(...allEmployees.map(e => e.sort_order || 0)) : 0;
      const { data: ins } = await supabase.from('employees')
        .insert({ name, group_name, contract_type, default_start, default_end, active: true, sort_order: maxOrder + 1 })
        .select('id').single();
      if (ins?.id) {
        await supabase.from('employee_months').upsert(
          { employee_id: ins.id, year: cur.year, month: cur.month, active, group_name, sort_order: maxOrder + 1 },
          { onConflict: 'employee_id,year,month' }
        );
      }
    }
    setModal(null);
    fetchAll();
  };

  // Usuń pracownika TYLKO z tego miesiąca (historia innych miesięcy zostaje)
  const handleRemoveFromMonth = async (id) => {
    await supabase.from('employee_months').delete().eq('employee_id', id).eq('year', cur.year).eq('month', cur.month);
    setModal(null);
    fetchAll();
  };

  // Dodaj istniejącego pracownika do tego miesiąca
  const handleAddExisting = async (emp) => {
    const maxOrder = roster.length > 0 ? Math.max(...roster.map(r => r.sort_order || 0)) : 0;
    await supabase.from('employee_months').upsert(
      { employee_id: emp.id, year: cur.year, month: cur.month, active: true, group_name: emp.group_name, sort_order: emp.sort_order ?? maxOrder + 1 },
      { onConflict: 'employee_id,year,month' }
    );
    setShowAdd(false);
    fetchAll();
  };

  if (loading) return <div style={{ color: 'var(--text-tertiary)', fontSize: '13px', padding: '12px 0' }}>Ładowanie…</div>;

  const rosterIds = new Set(roster.map(r => r.id));
  const notInMonth = allEmployees.filter(e => !rosterIds.has(e.id));

  const groupedEmps = groups.map(g => ({ g: g.name, color: g.color, members: roster.filter(e => e.group_name === g.name) }))
    .filter(({ members }) => members.length > 0);
  const extraGroups = [...new Set(roster.map(e => e.group_name))].filter(name => !groups.find(g => g.name === name));
  extraGroups.forEach(name => groupedEmps.push({ g: name, color: '#455a64', members: roster.filter(e => e.group_name === name) }));

  return (
    <div>
      {/* Wybór miesiąca */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '8px 10px' }}>
        <button onClick={() => shiftMonth(-1)} disabled={atMinMonth} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 12px', cursor: atMinMonth ? 'not-allowed' : 'pointer', opacity: atMinMonth ? 0.4 : 1, fontWeight: 700 }}>‹</button>
        <div style={{ flex: 1, textAlign: 'center', fontWeight: 700, fontSize: '15px' }}>{monthLabel}</div>
        <button onClick={() => shiftMonth(1)} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontWeight: 700 }}>›</button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ fontSize: '17px', fontWeight: 700 }}>Pracownicy — {roster.filter(e => e.active).length} w miesiącu</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {notInMonth.length > 0 && (
            <button onClick={() => setShowAdd(s => !s)} style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '10px', padding: '8px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>+ Istniejący</button>
          )}
          <button onClick={() => setModal('new')} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '10px', padding: '8px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>+ Nowy</button>
        </div>
      </div>

      {/* Dodaj istniejącego do miesiąca */}
      {showAdd && (
        <div style={{ marginBottom: '14px', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', fontSize: '12px', fontWeight: 700, color: 'var(--text-tertiary)', background: 'var(--bg-secondary)' }}>Dodaj do {monthLabel} (poza składem):</div>
          {notInMonth.map((e, i) => (
            <div key={e.id} onClick={() => handleAddExisting(e)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-secondary)', cursor: 'pointer' }}>
              <span style={{ flex: 1, fontSize: '14px', fontWeight: 600 }}>{e.name}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{e.group_name}</span>
              <span style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: 700 }}>+ dodaj</span>
            </div>
          ))}
        </div>
      )}

      {groupedEmps.map(({ g, color, members }) => {
        return (
          <div key={g} style={{ marginBottom: '12px' }}>
            <div style={{ background: color, color: '#fff', fontWeight: 700, fontSize: '12px', padding: '6px 12px', borderRadius: '8px 8px 0 0' }}>{g}</div>
            <div style={{ border: `1px solid ${color}40`, borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
              {members.map((emp, i) => (
                <div key={emp.id} onClick={() => setModal(emp)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-secondary)', cursor: 'pointer', opacity: emp.active ? 1 : 0.45 }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>{emp.name}</span>
                    {!emp.active && <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginLeft: '6px' }}>nieaktywny</span>}
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 600, padding: '2px 7px', borderRadius: '5px', background: emp.contract_type === 'UoP' ? 'rgba(0,122,255,0.1)' : 'rgba(255,149,0,0.12)', color: emp.contract_type === 'UoP' ? '#007AFF' : '#CC6600' }}>{emp.contract_type}</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>{emp.default_start}–{emp.default_end}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {(modal === 'new' || (modal && typeof modal === 'object')) && (
        <EmployeeModal
          employee={modal === 'new' ? null : modal}
          groups={groups}
          monthLabel={monthLabel}
          onClose={() => setModal(null)}
          onSave={handleSave}
          onRemoveFromMonth={handleRemoveFromMonth}
        />
      )}
    </div>
  );
}

const ACTION_LABELS = {
  added:   { label: 'Dodał',    color: '#34C759' },
  edited:  { label: 'Edytował', color: '#FF9500' },
  done:    { label: 'Odebrał',  color: '#007AFF' },
  undone:  { label: 'Cofnął',   color: '#FF3B30' },
  deleted: { label: 'Usunął',   color: '#FF3B30' },
};

const LOGS_PAGE_SIZE = 50;

function LogsSection() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    setLoading(true);
    const from = page * LOGS_PAGE_SIZE;
    const to = from + LOGS_PAGE_SIZE - 1;
    supabase
      .from('logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)
      .then(({ data, count }) => {
        setLogs(data || []);
        if (typeof count === 'number') setTotal(count);
        setLoading(false);
      });
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / LOGS_PAGE_SIZE));

  const fmt = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  if (loading) return <div style={{ color: 'var(--text-tertiary)', fontSize: '13px', padding: '12px 0' }}>Ładowanie logów…</div>;
  if (logs.length === 0) return <div style={{ color: 'var(--text-tertiary)', fontSize: '13px', padding: '12px 0' }}>Brak logów</div>;

  return (
    <div>
      <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>
        {total} akcji w dzienniku
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {logs.map(log => {
          const meta = ACTION_LABELS[log.action] || { label: log.action, color: '#636366' };
          return (
            <div key={log.id} style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '10px 14px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: meta.color, background: meta.color + '18', padding: '2px 7px', borderRadius: '6px', flexShrink: 0 }}>{meta.label}</span>
                <span style={{ fontWeight: 600, fontSize: '13px', flex: 1 }}>{log.client_name || '—'}</span>
                <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', flexShrink: 0 }}>{log.user_name}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-quaternary)', flexShrink: 0 }}>{fmt(log.created_at)}</span>
              </div>
              {log.details && (
                <div style={{ marginTop: '5px', fontSize: '11px', color: 'var(--text-secondary)' }}>{log.details}</div>
              )}
            </div>
          );
        })}
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '16px', alignItems: 'center' }}>
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            style={{ padding: '6px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: page === 0 ? 'default' : 'pointer', fontWeight: 600, opacity: page === 0 ? 0.4 : 1 }}
          >‹</button>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{page + 1} / {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            style={{ padding: '6px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: page >= totalPages - 1 ? 'default' : 'pointer', fontWeight: 600, opacity: page >= totalPages - 1 ? 0.4 : 1 }}
          >›</button>
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const { impersonate, isAdmin, sessionToken } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [tab, setTab] = useState('users'); // 'users' | 'employees' | 'logs'

  const fetchUsers = async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc('get_all_users', { p_session_token: sessionToken });
    if (error) setError(error.message);
    else setUsers(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, [isAdmin, sessionToken]);

  if (!isAdmin) return <div style={{ padding: '40px', textAlign: 'center' }}>Brak dostępu.</div>;

  const handleAddUser = async (username, name, role) => {
    const { data, error } = await supabase.rpc('admin_create_user', {
      p_session_token: sessionToken,
      p_username: username,
      p_name: name,
      p_role: role,
    });
    if (error) return { error: error.message };
    if (data?.error) return { error: data.error };
    setAddUserOpen(false);
    fetchUsers();
    return { ok: true };
  };

  const handleSaveUser = async (userId, name, role, routes) => {
    const { error: e1 } = await supabase.rpc('update_user_role', { p_session_token: sessionToken, p_user_id: userId, p_role: role });
    if (e1) { toastError('Błąd zapisu roli: ' + e1.message); return; }
    const { error: e2 } = await supabase.rpc('update_user_routes', { p_session_token: sessionToken, p_user_id: userId, p_routes: routes });
    if (e2) { toastError('Błąd zapisu tras: ' + e2.message); return; }
    setEditUser(null);
    toastSuccess('Zapisano');
    fetchUsers();
  };

  const handleResetPassword = async (userId) => {
    const { data, error } = await supabase.rpc('admin_reset_password', { p_session_token: sessionToken, p_user_id: userId });
    if (error || data?.error) {
      toastError('Błąd resetu: ' + (error?.message || data?.error));
      return;
    }
    toastSuccess('Hasło zresetowane');
    fetchUsers();
  };

  const handleDeleteUser = async (userId) => {
    const { data, error } = await supabase.rpc('admin_delete_user', { p_session_token: sessionToken, p_user_id: userId });
    if (error || data?.error) { toastError('Błąd usuwania: ' + (error?.message || data?.error)); return; }
    setEditUser(null);
    toastSuccess('Użytkownik usunięty');
    fetchUsers();
  };

  const handleImpersonate = async (userId) => {
    const result = await impersonate(userId);
    if (result?.error) { toastError('Błąd: ' + result.error); return; }
    setEditUser(null);
    // Przekieruj na stronę główną
    window.location.href = '/';
  };

  if (loading) return <div className="loader">Ładowanie użytkowników…</div>;
  if (error) return <div style={{ padding: '20px', color: 'var(--accent-red)' }}>Błąd: {error}</div>;

  return (
    <div style={{ maxWidth: '600px' }}>
      <div className="segmented-control" style={{ marginBottom: '16px' }}>
        <button type="button" className={`seg-btn ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>Użytkownicy</button>
        <button type="button" className={`seg-btn ${tab === 'groups' ? 'active' : ''}`} onClick={() => setTab('groups')}>Grupy</button>
        <button type="button" className={`seg-btn ${tab === 'employees' ? 'active' : ''}`} onClick={() => setTab('employees')}>Pracownicy</button>
        <button type="button" className={`seg-btn ${tab === 'logs' ? 'active' : ''}`} onClick={() => setTab('logs')}>Logi</button>
      </div>

      {tab === 'logs' && <LogsSection />}
      {tab === 'employees' && <EmployeesSection />}
      {tab === 'groups' && <GroupsSection />}

      {tab === 'users' && <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ fontSize: '17px', fontWeight: 700 }}>Użytkownicy ({users.length})</div>
        <button
          onClick={() => setAddUserOpen(true)}
          style={{
            background: 'var(--accent)', color: '#fff',
            border: 'none', borderRadius: '10px',
            padding: '8px 14px', fontSize: '13px', fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Nowy użytkownik
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {users.map(u => (
          <div
            key={u.id}
            onClick={() => setEditUser(u)}
            style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: '14px', padding: '14px 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              cursor: 'pointer',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: '15px' }}>{u.name}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                @{u.username} · {u.role === 'admin' ? '⚙️ Admin' : u.role === 'driver' ? '🚛 Kierowca' : '👁 Podgląd'}
                {u.routes ? ` · Trasy: ${u.routes}` : ''}
              </div>
            </div>
            <div style={{
              fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '6px',
              background: u.has_password ? 'rgba(52,199,89,0.12)' : 'rgba(255,149,0,0.12)',
              color: u.has_password ? '#25A244' : '#CC6600',
              flexShrink: 0,
            }}>
              {u.has_password ? 'Aktywny' : 'Brak hasła'}
            </div>
          </div>
        ))}
      </div>

      {addUserOpen && (
        <AddUserModal onClose={() => setAddUserOpen(false)} onSave={handleAddUser} />
      )}

      {editUser && (
        <EditUserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSave={handleSaveUser}
          onResetPassword={handleResetPassword}
          onDelete={handleDeleteUser}
          onImpersonate={() => handleImpersonate(editUser.id)}
        />
      )}
      </>}
    </div>
  );
}
