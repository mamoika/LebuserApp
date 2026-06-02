import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();
  const { register } = useAuth();

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const trimmedUsername = username.trim().toLowerCase();
    if (!/^[a-z0-9._]+$/.test(trimmedUsername)) {
      setError('Nazwa użytkownika może zawierać tylko małe litery, cyfry, kropki i podkreślenia');
      setLoading(false);
      return;
    }
    if (trimmedUsername.length < 3) {
      setError('Nazwa użytkownika musi mieć co najmniej 3 znaki');
      setLoading(false);
      return;
    }

    const result = await register(trimmedUsername, password, name);
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  };

  if (success) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-logo-section">
            <div className="auth-success-icon">✓</div>
            <h1 className="auth-title" style={{ color: 'var(--accent-green)' }}>Sukces!</h1>
            <p className="auth-subtitle">
              Twoje konto zostało utworzone. Poczekaj, aż Administrator przypisze Ci trasy, a następnie się zaloguj.
            </p>
          </div>
          <button onClick={() => navigate('/login')} className="auth-submit">
            Przejdź do logowania
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo-section">
          <div className="auth-logo-icon">🚛</div>
          <h1 className="auth-title">LEBUSER</h1>
          <p className="auth-subtitle">Utwórz Konto</p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleRegister} className="auth-form">
          <div className="auth-field">
            <label>Imię i Nazwisko</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              placeholder="np. Jan Kowalski"
            />
          </div>
          <div className="auth-field">
            <label>Nazwa użytkownika</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoComplete="username"
              placeholder="np. jan.kowalski"
            />
            <span className="auth-hint">Małe litery, cyfry, kropki i podkreślenia. Min. 3 znaki.</span>
          </div>
          <div className="auth-field">
            <label>Hasło (min. 6 znaków)</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="••••••"
            />
          </div>
          <button type="submit" disabled={loading} className="auth-submit">
            {loading ? 'Tworzenie konta...' : 'Zarejestruj się'}
          </button>
        </form>

        <div className="auth-footer">
          Masz już konto? <Link to="/login" className="auth-link">Zaloguj się</Link>
        </div>
      </div>
    </div>
  );
}
