import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      // Pobieramy listę użytkowników przez RPC (bo tabela users jest zablokowana przez RLS)
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
    <div className="schedule-container" style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
      <h2 style={{ color: 'var(--text-primary)', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>Zarządzanie Użytkownikami</h2>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        {users.length === 0 ? (
          <div style={{ color: 'var(--text-muted)' }}>Brak zarejestrowanych użytkowników.</div>
        ) : (
          users.map(u => (
            <div key={u.id} style={{ background: 'var(--bg-primary)', padding: '15px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{u.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>@{u.username}</div>
                <div style={{ fontSize: '11px', marginTop: '4px' }}>
                  <span 
                    onClick={() => handleChangeRole(u.id, u.role === 'admin' ? 'driver' : 'admin')}
                    style={{ 
                      background: u.role === 'admin' ? 'var(--accent-blue)' : 'var(--accent-orange)', 
                      color: 'white', 
                      padding: '2px 8px', 
                      borderRadius: '4px', 
                      fontSize: '10px', 
                      cursor: 'pointer',
                      textTransform: 'uppercase'
                    }}
                  >
                    {u.role}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '5px' }}>Przypisane Trasy:</div>
                  <input 
                    id={`routes-${u.id}`}
                    type="text" 
                    defaultValue={u.routes || ''}
                    placeholder="np. 1, 2, 3"
                    style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', width: '150px' }}
                  />
                </div>
                <button 
                  onClick={() => {
                    const input = document.getElementById(`routes-${u.id}`);
                    handleSaveRoutes(u.id, input.value);
                  }}
                  style={{ marginTop: '20px', background: 'var(--accent-green)', color: 'white', padding: '8px 15px', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                >
                  Zapisz
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
