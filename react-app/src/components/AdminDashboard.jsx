import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_all_users');
      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleSaveRoutes = async (userId, routesInput) => {
    const { error } = await supabase.rpc('update_user_routes', {
      p_user_id: userId,
      p_routes: routesInput,
    });
    if (error) {
      alert('Błąd: ' + error.message);
    } else {
      alert('Trasy zapisane!');
      fetchUsers();
    }
  };

  const handleChangeRole = async (userId, newRole) => {
    const { error } = await supabase.rpc('update_user_role', {
      p_user_id: userId,
      p_role: newRole,
    });
    if (error) {
      alert('Błąd: ' + error.message);
    } else {
      fetchUsers();
    }
  };

  if (loading) return <div style={{ padding: '20px', textAlign: 'center' }}>Ładowanie danych...</div>;
  if (error) return <div style={{ padding: '20px', color: 'red' }}>Błąd: {error}</div>;

  return (
    <div>
      <div className="route-group-header">Zarządzanie Użytkownikami</div>
      
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        {users.length === 0 ? (
          <div style={{ color: 'var(--text-quaternary)', fontSize: '12px', textAlign: 'center', marginTop: '20px' }}>Brak użytkowników</div>
        ) : (
          users.map(u => (
            <div key={u.id} className="col">
              <div className="col-header" style={{ justifyContent: 'space-between' }}>
                <div>
                  <span className="col-day-name">{u.name}</span>
                  <span className="col-date" style={{ marginLeft: '8px' }}>@{u.username}</span>
                </div>
                <span 
                  onClick={() => handleChangeRole(u.id, u.role === 'admin' ? 'driver' : 'admin')}
                  className={`rt-badge ${u.role === 'admin' ? 'rt-4' : 'rt-6'}`}
                  style={{ cursor: 'pointer' }}
                >
                  {u.role}
                </span>
              </div>
              
              <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Przypisane Trasy (np. 1, 2, 3)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input 
                    id={`routes-${u.id}`}
                    type="text" 
                    defaultValue={u.routes || ''}
                    placeholder="Wpisz ID tras"
                    style={{ 
                      flex: 1, 
                      padding: '8px 12px', 
                      borderRadius: 'var(--radius-md)', 
                      border: '1px solid var(--border-strong)', 
                      background: 'var(--bg-tertiary)', 
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font)',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  />
                  <button 
                    className="add-btn"
                    style={{ width: 'auto', minHeight: 'auto', padding: '8px 16px', background: 'var(--accent-light)', color: 'var(--accent)', border: '1px solid var(--accent)', borderStyle: 'solid' }}
                    onClick={() => {
                      const input = document.getElementById(`routes-${u.id}`);
                      handleSaveRoutes(u.id, input.value);
                    }}
                  >
                    Zapisz
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
