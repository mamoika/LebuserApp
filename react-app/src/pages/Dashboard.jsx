import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PRIVACY_NOTICE_VERSION, useAuth } from '../context/AuthContext';
import Navigation from "../components/Navigation";
import LanguageSwitcher from '../components/LanguageSwitcher';
import { LogOut } from 'lucide-react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import logoImg from '../assets/logo-icon.png';
import ScheduleView from '../components/ScheduleView';
import DriverRouteView from '../components/DriverRouteView';
import ClientsRoutesView from '../components/ClientsRoutesView';
import AdminDashboard from '../components/AdminDashboard';
import MapView from '../components/MapView';
import HistoryView from '../components/HistoryView';
import GrafikView from '../components/GrafikView';
import TimelineView from '../components/TimelineView';
import CostsView from '../components/CostsView';
import ToastContainer from '../components/ToastContainer';

// Mapowanie ścieżki na klucz tłumaczeń strony (pages.<slug>).
const PAGE_KEYS = {
  '/': 'home',
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
  const { user, adminBackup, signOut, stopImpersonating, isAdmin, canViewAdminData } = useAuth();
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
        <div style={{
          background: '#FF9500',
          color: '#fff',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '13px',
          fontWeight: 600,
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
          gap: '12px',
        }}>
          <span>
            👁 {t('header.impersonatingAs')} <strong>{user?.name}</strong> (@{user?.username})
            {user?.has_password === false && (
              <span style={{ marginLeft: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', fontWeight: 700 }}>
                {t('header.impersonateNoPassword')}
              </span>
            )}
          </span>
          <button
            onClick={handleStopImpersonating}
            style={{
              background: 'rgba(0,0,0,0.2)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '5px 12px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {t('header.backToAdmin', { name: adminBackup?.name })}
          </button>
        </div>
      )}

      {/* Header */}
      <header className="app-header">
        <div className="app-header-top" style={{ alignItems: 'center', gap: '16px' }}>
          <img src={logoImg} alt="Logo LEBUSER" style={{ height: '44px', width: 'auto', objectFit: 'contain' }} />
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div className="app-title" style={{ fontSize: '22px' }}>{t(`pages.${pageKey}.title`)}</div>
            <div className="app-subtitle">{t(`pages.${pageKey}.subtitle`)}</div>
          </div>
        </div>
        <div className="app-header-actions">
          <LanguageSwitcher size="sm" />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.2 }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: isImpersonating ? '#FF9500' : 'var(--text-secondary)' }}>
              {user?.name}
            </span>
            <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-tertiary)' }}>@{user?.username}</span>
          </div>
          <button onClick={signOut} className="driver-btn">
            <LogOut size={14} /> {t('header.signOut')}
          </button>
        </div>
      </header>

      {/* Nawigacja */}
      <Navigation />

      {/* Kontent główny */}
      <main>
        <Routes>
          <Route path="/" element={<ScheduleView />} />
          <Route path="/route" element={<DriverRouteView />} />
          <Route path="/routes" element={canViewAdminData ? <DriverRouteView manageMode /> : <Navigate to="/" replace />} />
          <Route path="/clients" element={<ClientsRoutesView />} />
          <Route path="/admin" element={isAdmin ? <AdminDashboard /> : <Navigate to="/" replace />} />
          <Route path="/history" element={<HistoryView />} />
          <Route path="/grafik" element={<GrafikView />} />
          <Route path="/timeline" element={<TimelineView />} />
          <Route path="/map" element={<MapView />} />
          <Route path="/costs" element={<CostsView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {needsPrivacyNotice && <PrivacyNoticeModal />}
      <ToastContainer />
    </div>
  );
}
