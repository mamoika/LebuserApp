import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await login(username, password);
    if (result.error) {
      setError(result.error);
    }
    setLoading(false);
  };

  return (
    <div className="login-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)' }}>
      <div className="login-box" style={{ background: 'var(--bg-card)', padding: '30px', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', width: '100%', maxWidth: '400px' }}>
        <h2 style={{ textAlign: 'center', color: 'var(--text-primary)', marginBottom: '20px' }}>Zaloguj się</h2>
        
        {error && <div style={{ color: '#721c24', background: '#f8d7da', padding: '10px', borderRadius: '8px', marginBottom: '15px', fontSize: '14px' }}>{error}</div>}
        
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)', fontSize: '14px' }}>Nazwa użytkownika</label>
            <input 
              type="text" 
              value={username} 
              onChange={e => setUsername(e.target.value)} 
              required 
              autoComplete="username"
              placeholder="np. jan.kowalski"
              style={{ width: '100%', padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)', fontSize: '14px' }}>Hasło</label>
            <input 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              required 
              autoComplete="current-password"
              style={{ width: '100%', padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
            />
          </div>
          <button type="submit" disabled={loading} style={{ background: 'var(--accent-blue)', color: 'white', padding: '14px', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' }}>
            {loading ? 'Logowanie...' : 'Zaloguj się'}
          </button>
        </form>
        
        <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '14px', color: 'var(--text-secondary)' }}>
          Nie masz konta? <Link to="/register" style={{ color: 'var(--accent-blue)', textDecoration: 'none', fontWeight: 'bold' }}>Zarejestruj się</Link>
        </div>
      </div>
    </div>
  );
}
