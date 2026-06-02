import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { toastError, toastSuccess } from '../lib/toast';
import { useAuth } from '../context/AuthContext';

const LABEL_STYLE = { fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' };

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

const ACTION_LABELS = {
  added:   { label: 'Dodał',    color: '#34C759' },
  edited:  { label: 'Edytował', color: '#FF9500' },
  done:    { label: 'Odebrał',  color: '#007AFF' },
  undone:  { label: 'Cofnął',   color: '#FF3B30' },
  deleted: { label: 'Usunął',   color: '#FF3B30' },
};

function LogsSection() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('logs').select('*').order('created_at', { ascending: false }).limit(100)
      .then(({ data }) => { setLogs(data || []); setLoading(false); });
  }, []);

  const fmt = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  if (loading) return <div style={{ color: 'var(--text-tertiary)', fontSize: '13px', padding: '12px 0' }}>Ładowanie logów…</div>;
  if (logs.length === 0) return <div style={{ color: 'var(--text-tertiary)', fontSize: '13px', padding: '12px 0' }}>Brak logów</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {logs.map(log => {
        const meta = ACTION_LABELS[log.action] || { label: log.action, color: '#636366' };
        return (
          <div key={log.id} style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '10px 14px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: meta.color, background: meta.color + '18', padding: '2px 7px', borderRadius: '6px', flexShrink: 0 }}>{meta.label}</span>
            <span style={{ fontWeight: 600, fontSize: '13px', flex: 1 }}>{log.client_name || '—'}</span>
            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', flexShrink: 0 }}>{log.user_name}</span>
            <span style={{ fontSize: '11px', color: 'var(--text-quaternary)', flexShrink: 0 }}>{fmt(log.created_at)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminDashboard() {
  const { impersonate } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [tab, setTab] = useState('users'); // 'users' | 'logs'

  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_all_users');
    if (error) setError(error.message);
    else setUsers(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleAddUser = async (username, name, role) => {
    const { data, error } = await supabase.rpc('admin_create_user', {
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
    const { error: e1 } = await supabase.rpc('update_user_role', { p_user_id: userId, p_role: role });
    if (e1) { toastError('Błąd zapisu roli: ' + e1.message); return; }
    const { error: e2 } = await supabase.rpc('update_user_routes', { p_user_id: userId, p_routes: routes });
    if (e2) { toastError('Błąd zapisu tras: ' + e2.message); return; }
    setEditUser(null);
    toastSuccess('Zapisano');
    fetchUsers();
  };

  const handleResetPassword = async (userId) => {
    const { data, error } = await supabase.rpc('admin_reset_password', { p_user_id: userId });
    if (error || data?.error) {
      toastError('Błąd resetu: ' + (error?.message || data?.error));
      return;
    }
    toastSuccess('Hasło zresetowane');
    fetchUsers();
  };

  const handleDeleteUser = async (userId) => {
    const { data, error } = await supabase.rpc('admin_delete_user', { p_user_id: userId });
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
        <button type="button" className={`seg-btn ${tab === 'logs' ? 'active' : ''}`} onClick={() => setTab('logs')}>Logi aktywności</button>
      </div>

      {tab === 'logs' && <LogsSection />}

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
