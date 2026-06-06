import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import LanguageSwitcher from '../components/LanguageSwitcher';

export default function RegisterPage() {
  const { t } = useTranslation();
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
      setError(t('auth.registerUsernameChars'));
      setLoading(false);
      return;
    }
    if (trimmedUsername.length < 3) {
      setError(t('auth.registerUsernameTooShort'));
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
            <h1 className="auth-title" style={{ color: 'var(--accent-green)' }}>{t('auth.registerSuccessTitle')}</h1>
            <p className="auth-subtitle">
              {t('auth.registerSuccessText')}
            </p>
          </div>
          <button onClick={() => navigate('/login')} className="auth-submit">
            {t('auth.goToLogin')}
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
          <p className="auth-subtitle">{t('auth.createAccount')}</p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          <LanguageSwitcher size="sm" />
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleRegister} className="auth-form">
          <div className="auth-field">
            <label>{t('auth.fullName')}</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              placeholder={t('auth.fullNamePlaceholder')}
            />
          </div>
          <div className="auth-field">
            <label>{t('auth.username')}</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoComplete="username"
              placeholder={t('auth.loginPlaceholder')}
            />
            <span className="auth-hint">{t('auth.usernameHint')}</span>
          </div>
          <div className="auth-field">
            <label>{t('auth.passwordMin6')}</label>
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
            {loading ? t('auth.creatingAccount') : t('auth.register')}
          </button>
        </form>

        <div className="auth-footer">
          {t('auth.alreadyHaveAccount')} <Link to="/login" className="auth-link">{t('auth.signIn')}</Link>
        </div>
      </div>
    </div>
  );
}
