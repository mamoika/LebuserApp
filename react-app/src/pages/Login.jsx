import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import logoImg from '../assets/logo.png';

// Fazy: 'username' → 'set_password' (pierwsze logowanie) | 'password' (normalne)
export default function LoginPage() {
  const { checkUsername, setFirstPassword, login } = useAuth();

  const [phase, setPhase] = useState('username');
  const [username, setUsername] = useState('');
  const [userName, setUserName] = useState(''); // imię z DB
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCheckUsername = async (e) => {
    e.preventDefault();
    if (!username.trim()) return;
    setLoading(true);
    setError('');
    const result = await checkUsername(username.trim());
    setLoading(false);

    if (result.error) { setError(result.error); return; }

    setUserName(result.name);
    setPhase(result.has_password ? 'password' : 'set_password');
  };

  const handleSetPassword = async (e) => {
    e.preventDefault();
    if (password.length < 4) { setError('Hasło musi mieć co najmniej 4 znaki'); return; }
    if (password !== password2) { setError('Hasła nie są zgodne'); return; }
    setLoading(true);
    setError('');
    const result = await setFirstPassword(username.trim(), password);
    if (result.error) { setError(result.error); setLoading(false); return; }

    // Auto-login po ustawieniu hasła
    const loginResult = await login(username.trim(), password);
    setLoading(false);
    if (loginResult.error) setError(loginResult.error);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const result = await login(username.trim(), password);
    setLoading(false);
    if (result.error) setError(result.error);
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo-section">
          <img src={logoImg} alt="Logo LEBUSER" style={{ height: '48px', objectFit: 'contain', marginBottom: '8px' }} />
          <h1 className="auth-title" style={{ display: 'none' }}>LEBUSER</h1>
          <p className="auth-subtitle">Harmonogram Logistyki</p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        {/* Faza 1: wpisz login */}
        {phase === 'username' && (
          <form onSubmit={handleCheckUsername} className="auth-form">
            <div className="auth-field">
              <label>Login</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                autoFocus
                autoComplete="username"
                placeholder="np. jan.kowalski"
              />
            </div>
            <button type="submit" disabled={loading || !username.trim()} className="auth-submit">
              {loading ? 'Sprawdzanie…' : 'Dalej'}
            </button>
          </form>
        )}

        {/* Faza 2: pierwsze logowanie — ustaw hasło */}
        {phase === 'set_password' && (
          <form onSubmit={handleSetPassword} className="auth-form">
            <div style={{ textAlign: 'center', marginBottom: '16px', fontSize: '14px', color: 'var(--text-secondary)' }}>
              Witaj, <strong>{userName}</strong>!<br />
              Ustaw swoje hasło przy pierwszym logowaniu.
            </div>
            <div className="auth-field">
              <label>Nowe hasło</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoFocus
                autoComplete="new-password"
                placeholder="minimum 4 znaki"
              />
            </div>
            <div className="auth-field">
              <label>Powtórz hasło</label>
              <input
                type="password"
                value={password2}
                onChange={e => setPassword2(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="••••••"
              />
            </div>
            <button type="submit" disabled={loading} className="auth-submit">
              {loading ? 'Zapisywanie…' : 'Ustaw hasło i zaloguj'}
            </button>
            <button
              type="button"
              onClick={() => { setPhase('username'); setPassword(''); setPassword2(''); setError(''); }}
              style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: '13px', cursor: 'pointer', marginTop: '8px', width: '100%' }}
            >
              ← Wróć
            </button>
          </form>
        )}

        {/* Faza 3: normalne logowanie */}
        {phase === 'password' && (
          <form onSubmit={handleLogin} className="auth-form">
            <div style={{ textAlign: 'center', marginBottom: '12px', fontSize: '14px', color: 'var(--text-secondary)' }}>
              Witaj, <strong>{userName}</strong>
            </div>
            <div className="auth-field">
              <label>Hasło</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoFocus
                autoComplete="current-password"
                placeholder="••••••"
              />
            </div>
            <button type="submit" disabled={loading} className="auth-submit">
              {loading ? 'Logowanie…' : 'Zaloguj się'}
            </button>
            <button
              type="button"
              onClick={() => { setPhase('username'); setPassword(''); setError(''); }}
              style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: '13px', cursor: 'pointer', marginTop: '8px', width: '100%' }}
            >
              ← Zmień użytkownika
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
