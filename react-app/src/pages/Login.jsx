import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import LanguageSwitcher from '../components/LanguageSwitcher';
import logoImg from '../assets/logo-icon.png';

// Fazy: 'username' → 'set_password' (pierwsze logowanie) | 'password' (normalne)
export default function LoginPage() {
  const { t } = useTranslation();
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
    if (password.length < 4) { setError(t('auth.passwordTooShort')); return; }
    if (password !== password2) { setError(t('auth.passwordsDontMatch')); return; }
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
          <img src={logoImg} alt="Logo LEBUSER" style={{ maxWidth: '100%', width: 'auto', height: 'auto', maxHeight: '72px', objectFit: 'contain', marginBottom: '16px' }} />
          <h1 className="auth-title" style={{ display: 'none' }}>LEBUSER</h1>
          <p className="auth-subtitle">{t('common.appSubtitle')}</p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          <LanguageSwitcher size="sm" />
        </div>

        {error && <div className="auth-error">{error}</div>}

        {/* Faza 1: wpisz login */}
        {phase === 'username' && (
          <form onSubmit={handleCheckUsername} className="auth-form">
            <div className="auth-field">
              <label>{t('auth.login')}</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                autoFocus
                autoComplete="username"
                placeholder={t('auth.loginPlaceholder')}
              />
            </div>
            <button type="submit" disabled={loading || !username.trim()} className="auth-submit">
              {loading ? t('auth.checking') : t('auth.continue')}
            </button>
          </form>
        )}

        {/* Faza 2: pierwsze logowanie — ustaw hasło */}
        {phase === 'set_password' && (
          <form onSubmit={handleSetPassword} className="auth-form">
            <div style={{ textAlign: 'center', marginBottom: '16px', fontSize: '14px', color: 'var(--text-secondary)' }}>
              {t('auth.welcome')}, <strong>{userName}</strong>!<br />
              {t('auth.setPasswordHint')}
            </div>
            <div className="auth-field">
              <label>{t('auth.newPassword')}</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoFocus
                autoComplete="new-password"
                placeholder={t('auth.newPasswordPlaceholder')}
              />
            </div>
            <div className="auth-field">
              <label>{t('auth.repeatPassword')}</label>
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
              {loading ? t('common.saving') : t('auth.setPasswordAndLogin')}
            </button>
            <button
              type="button"
              onClick={() => { setPhase('username'); setPassword(''); setPassword2(''); setError(''); }}
              style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: '13px', cursor: 'pointer', marginTop: '8px', width: '100%' }}
            >
              ← {t('common.back')}
            </button>
          </form>
        )}

        {/* Faza 3: normalne logowanie */}
        {phase === 'password' && (
          <form onSubmit={handleLogin} className="auth-form">
            <div style={{ textAlign: 'center', marginBottom: '12px', fontSize: '14px', color: 'var(--text-secondary)' }}>
              {t('auth.welcome')}, <strong>{userName}</strong>
            </div>
            <div className="auth-field">
              <label>{t('auth.password')}</label>
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
              {loading ? t('auth.signingIn') : t('auth.signIn')}
            </button>
            <button
              type="button"
              onClick={() => { setPhase('username'); setPassword(''); setError(''); }}
              style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: '13px', cursor: 'pointer', marginTop: '8px', width: '100%' }}
            >
              {t('auth.changeUser')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
