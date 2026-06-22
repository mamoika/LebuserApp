import { useState, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { PRIVACY_NOTICE_VERSION, useAuth } from '../context/AuthContext';
import Navigation from "../components/Navigation";
import LanguageSwitcher from '../components/LanguageSwitcher';
import { AlertTriangle, Eye, LogOut, Undo2 } from 'lucide-react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import logoImg from '../assets/logo-icon.png';
import ToastContainer from '../components/ToastContainer';

// Widoki ładowane leniwie (code-splitting) — ciężkie biblioteki, np. mapa i
// eksport Excela, pobierają się dopiero przy wejściu na dany widok.
const ScheduleView = lazy(() => import('../components/ScheduleView'));
const DriverRouteView = lazy(() => import('../components/DriverRouteView'));
const ClientsRoutesView = lazy(() => import('../components/ClientsRoutesView'));
const AdminDashboard = lazy(() => import('../components/AdminDashboard'));
const MapView = lazy(() => import('../components/MapView'));
const HistoryView = lazy(() => import('../components/HistoryView'));
const GrafikView = lazy(() => import('../components/GrafikView'));
const TimelineView = lazy(() => import('../components/TimelineView'));
const CostsView = lazy(() => import('../components/CostsView'));

// Mapowanie ścieżki na klucz tłumaczeń strony (pages.<slug>).
const PAGE_KEYS = {
  '/': 'home',
  '/schedule': 'home',
  '/route': 'route',
  '/routes': 'routes',
  '/clients': 'clients',
  '/map': 'map',
  '/history': 'history',
  '/grafik': 'grafik',
  '/timeline': 'timeline',
  '/costs': 'costs',
  '/admin': 'admin',
};

function PrivacyNoticeModal() {
  const { t } = useTranslation();
  const { acknowledgePrivacyNotice, signOut } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    setSaving(true);
    setError('');
    const result = await acknowledgePrivacyNotice(PRIVACY_NOTICE_VERSION);
    setSaving(false);
    if (result?.error) setError(result.error);
  };

  return (
    <div className="ap-overlay" style={{ display: 'flex', zIndex: 5000 }}>
      <div className="ap-sheet" style={{ maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
        <div className="ap-handle" />
        <div className="ap-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(145deg,#0A84FF,#0055CC)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, flexShrink: 0 }}>i</div>
            <div>
              <div className="ap-title" style={{ textAlign: 'left', fontSize: '19px', marginBottom: '2px' }}>{t('privacy.title')}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{t('privacy.version', { version: PRIVACY_NOTICE_VERSION })}</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', lineHeight: 1.45, color: 'var(--text-secondary)' }}>
            <p style={{ margin: 0 }}>{t('privacy.p1')}</p>
            <p style={{ margin: 0 }}>{t('privacy.p2')}</p>
            <p style={{ margin: 0 }}>{t('privacy.p3')}</p>
            <p style={{ margin: 0 }}>{t('privacy.p4')}</p>
          </div>

          {error && <div className="ap-error" style={{ marginTop: '14px' }}>{error}</div>}

          <div className="ap-btn-group" style={{ marginTop: '18px' }}>
            <button className="ap-btn ap-btn-primary" onClick={handleConfirm} disabled={saving}>
              {saving ? t('common.saving') : t('privacy.confirm')}
            </button>
            <button className="ap-btn" onClick={signOut} disabled={saving} style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
              {t('privacy.signOut')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  const { user, adminBackup, signOut, stopImpersonating, isAdmin, isDriver, canViewAdminData } = useAuth();
  const isImpersonating = !!adminBackup;
  const needsPrivacyNotice = !isImpersonating && user?.privacy_notice_ack_version !== PRIVACY_NOTICE_VERSION;
  const location = useLocation();
  const pageKey = PAGE_KEYS[location.pathname] || 'home';

  const handleStopImpersonating = () => {
    const result = stopImpersonating();
    window.location.href = result?.needsLogin ? '/login' : '/admin';
  };

  return (
    <div className="app-shell">

      {/* Baner impersonacji */}
      {isImpersonating && (
        <div className="impersonation-bar">
          <div className="impersonation-info">
            <span className="impersonation-icon" aria-hidden="true">
              <Eye size={16} />
            </span>
            <span className="impersonation-copy">
              <span className="impersonation-label">{t('header.impersonatingAs')}</span>
              <strong>{user?.name}</strong>
              <span className="impersonation-username">@{user?.username}</span>
            </span>
            {user?.has_password === false && (
              <span className="impersonation-warning">
                <AlertTriangle size={13} />
                {t('header.impersonateNoPassword')}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleStopImpersonating}
            className="impersonation-return-btn"
          >
            <Undo2 size={15} />
            {t('header.backToAdmin', { name: adminBackup?.name })}
          </button>
        </div>
      )}

      {/* Header */}
      <header className="app-header">
        <div className="app-header-top" style={{ alignItems: 'center', gap: '16px' }}>
          <img src={logoImg} alt="Logo LEBUSER" className="app-brand-logo" />
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div className="app-title" style={{ fontSize: '22px' }}>{t(`pages.${pageKey}.title`)}</div>
            <div className="app-subtitle">{t(`pages.${pageKey}.subtitle`)}</div>
          </div>
        </div>
        <div className="app-header-actions">
          <div className={`app-header-user ${isImpersonating ? 'is-impersonating' : ''}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.2 }}>
            <span style={{ fontSize: '13px', fontWeight: 700 }}>
              {user?.name}
            </span>
            <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-tertiary)' }}>@{user?.username}</span>
          </div>
          <LanguageSwitcher size="sm" />
          <button onClick={signOut} className="driver-btn">
            <LogOut size={14} /> {t('header.signOut')}
          </button>
        </div>
      </header>

      {/* Nawigacja */}
      <Navigation />

      {/* Kontent główny */}
      <main>
        <Suspense fallback={<div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-tertiary)' }}>{t('common.loading', 'Ładowanie…')}</div>}>
        <Routes>
          <Route path="/" element={isDriver ? <Navigate to="/route" replace /> : <ScheduleView />} />
          <Route path="/schedule" element={<ScheduleView />} />
          <Route path="/route" element={<DriverRouteView />} />
          <Route path="/routes" element={canViewAdminData ? <DriverRouteView manageMode /> : <Navigate to="/" replace />} />
          <Route path="/clients" element={<ClientsRoutesView />} />
          <Route path="/admin" element={isAdmin ? <AdminDashboard /> : <Navigate to="/" replace />} />
          <Route path="/history" element={<HistoryView />} />
          <Route path="/grafik" element={<GrafikView />} />
          <Route path="/timeline" element={<TimelineView />} />
          <Route path="/map" element={<MapView />} />
          <Route path="/costs" element={<CostsView />} />
          <Route path="*" element={<Navigate to={isDriver ? '/route' : '/'} replace />} />
        </Routes>
        </Suspense>
      </main>
      {needsPrivacyNotice && <PrivacyNoticeModal />}
      <ToastContainer />
    </div>
  );
}
