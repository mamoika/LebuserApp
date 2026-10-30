import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, LockKeyhole, RefreshCw, Scale, Search, UserRound } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import logoImg from '../assets/logo-icon.png';

const initials = (name = '') => name
  .trim()
  .split(/\s+/)
  .slice(0, 2)
  .map(part => part[0]?.toLocaleUpperCase())
  .join('');

export default function KioskLogin() {
  const { t } = useTranslation();
  const {
    user,
    isAdmin,
    kioskDevice,
    activateKioskDevice,
    getKioskDrivers,
    kioskLogin,
    signOut,
  } = useAuth();
  const [drivers, setDrivers] = useState([]);
  const [deviceName, setDeviceName] = useState(kioskDevice?.name || '');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingUserId, setLoadingUserId] = useState(null);
  const [error, setError] = useState('');

  const loadDrivers = useCallback(async () => {
    if (!kioskDevice?.token || user) return;
    setLoading(true);
    setError('');
    const result = await getKioskDrivers();
    setLoading(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setDeviceName(result.device_name || kioskDevice.name || '');
    setDrivers(Array.isArray(result.drivers) ? result.drivers : []);
  }, [getKioskDrivers, kioskDevice?.name, kioskDevice?.token, user]);

  useEffect(() => { loadDrivers(); }, [loadDrivers]);

  const visibleDrivers = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return drivers;
    return drivers.filter(driver => driver.name?.toLocaleLowerCase().includes(normalized));
  }, [drivers, query]);

  if (user?.kiosk_mode) return <Navigate to="/" replace />;

  const handleActivate = async () => {
    setLoading(true);
    setError('');
    const result = await activateKioskDevice(t('kiosk.defaultDeviceName'));
    setLoading(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    signOut();
  };

  const handleLogin = async (driver) => {
    setLoadingUserId(driver.id);
    setError('');
    const result = await kioskLogin(driver.id);
    setLoadingUserId(null);
    if (result?.error) setError(result.error);
  };

  if (user) {
    return (
      <main className="kiosk-screen kiosk-setup-screen">
        <section className="kiosk-setup-card" aria-labelledby="kiosk-start-title">
          <div className="kiosk-mark"><Scale size={28} aria-hidden="true" /></div>
          <p className="kiosk-eyebrow">{t('kiosk.station')}</p>
          <h1 id="kiosk-start-title">{kioskDevice ? t('kiosk.readyTitle') : t('kiosk.activateTitle')}</h1>
          <p>{kioskDevice ? t('kiosk.readyDescription') : t('kiosk.activateDescription')}</p>
          {error && <div className="kiosk-error" role="alert">{error}</div>}
          {kioskDevice ? (
            <button type="button" className="kiosk-primary-btn" onClick={signOut}>
              {t('kiosk.start')} <ArrowRight size={19} />
            </button>
          ) : isAdmin ? (
            <button type="button" className="kiosk-primary-btn" onClick={handleActivate} disabled={loading}>
              {loading ? t('kiosk.activating') : t('kiosk.activate')} <CheckCircle2 size={19} />
            </button>
          ) : (
            <>
              <div className="kiosk-security-note"><LockKeyhole size={18} /> {t('kiosk.adminRequired')}</div>
              <Link className="kiosk-secondary-link" to="/">{t('kiosk.backToApp')}</Link>
            </>
          )}
        </section>
      </main>
    );
  }

  if (!kioskDevice) {
    return (
      <main className="kiosk-screen kiosk-setup-screen">
        <section className="kiosk-setup-card" aria-labelledby="kiosk-inactive-title">
          <img className="kiosk-logo" src={logoImg} alt="LEBUSER" />
          <div className="kiosk-mark"><Scale size={28} aria-hidden="true" /></div>
          <p className="kiosk-eyebrow">{t('kiosk.station')}</p>
          <h1 id="kiosk-inactive-title">{t('kiosk.inactiveTitle')}</h1>
          <p>{t('kiosk.inactiveDescription')}</p>
          <Link className="kiosk-primary-btn" to="/login" state={{ from: '/kiosk' }}>
            {t('kiosk.adminLogin')} <ArrowRight size={19} />
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="kiosk-screen">
      <header className="kiosk-header">
        <div className="kiosk-brand">
          <img src={logoImg} alt="LEBUSER" />
          <div>
            <span>{t('kiosk.station')}</span>
            <strong>{deviceName || kioskDevice.name}</strong>
          </div>
        </div>
        <div className="kiosk-status"><span /> {t('kiosk.deviceActive')}</div>
      </header>

      <section className="kiosk-content" aria-labelledby="kiosk-title">
        <div className="kiosk-heading">
          <div className="kiosk-heading-icon"><UserRound size={28} /></div>
          <div>
            <h1 id="kiosk-title">{t('kiosk.chooseDriver')}</h1>
            <p>{t('kiosk.chooseDriverHint')}</p>
          </div>
        </div>

        {drivers.length > 8 && (
          <label className="kiosk-search">
            <Search size={20} aria-hidden="true" />
            <span className="sr-only">{t('kiosk.searchDriver')}</span>
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('kiosk.searchDriver')} />
          </label>
        )}

        {error && (
          <div className="kiosk-error kiosk-error-row" role="alert">
            <span>{error}</span>
            <button type="button" onClick={loadDrivers}><RefreshCw size={17} /> {t('common.refresh')}</button>
          </div>
        )}

        {loading ? (
          <div className="kiosk-loading" role="status"><RefreshCw className="spin" /> {t('common.loading')}</div>
        ) : visibleDrivers.length > 0 ? (
          <div className="kiosk-driver-grid">
            {visibleDrivers.map(driver => (
              <button
                type="button"
                key={driver.id}
                className="kiosk-driver-card"
                onClick={() => handleLogin(driver)}
                disabled={loadingUserId !== null}
                aria-label={t('kiosk.loginAs', { name: driver.name })}
              >
                <span className="kiosk-avatar" aria-hidden="true">{initials(driver.name)}</span>
                <span className="kiosk-driver-name">{driver.name}</span>
                <span className="kiosk-card-action">
                  {loadingUserId === driver.id ? t('auth.signingIn') : t('kiosk.select')}
                  {loadingUserId === driver.id ? <RefreshCw size={18} className="spin" /> : <ArrowRight size={18} />}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="kiosk-empty">{query ? t('kiosk.noSearchResults') : t('kiosk.noDrivers')}</div>
        )}
      </section>

      <footer className="kiosk-footer">
        <LockKeyhole size={16} /> {t('kiosk.passwordlessNotice')}
        <Link to="/login">{t('kiosk.standardLogin')}</Link>
      </footer>
    </main>
  );
}
