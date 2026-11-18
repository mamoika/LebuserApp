import { useState, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { PRIVACY_NOTICE_VERSION, useAuth } from '../context/AuthContext';
import Navigation from "../components/Navigation";
import { AlertTriangle, Eye, Scale, ShieldCheck, Undo2, UserRound } from 'lucide-react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import RodoNotice from './RodoNotice';

import ToastContainer from '../components/ToastContainer';
import { importWithChunkReload } from '../lib/chunkReload';

// Widoki ładowane leniwie (code-splitting) — ciężkie biblioteki, np. mapa i
// eksport Excela, pobierają się dopiero przy wejściu na dany widok.
const lazyView = importer => lazy(() => importWithChunkReload(importer));
const ScheduleView = lazyView(() => import('../components/ScheduleView'));
const DriverCourse = lazyView(() => import('../components/courses/DriverCourse'));
const DispatchBoard = lazyView(() => import('../components/courses/DispatchBoard'));
const ClientsRoutesView = lazyView(() => import('../components/ClientsRoutesView'));
const WeeklyRoutePlanView = lazyView(() => import('../components/WeeklyRoutePlanView'));
const AdminDashboard = lazyView(() => import('../components/AdminDashboard'));
const ControlPanelView = lazyView(() => import('../components/ControlPanelView'));
const MapView = lazyView(() => import('../components/MapView'));
const HistoryView = lazyView(() => import('../components/HistoryView'));
const WorkScheduleView = lazyView(() => import('../components/WorkScheduleView'));
const CostsView = lazyView(() => import('../components/CostsView'));
const WashView = lazyView(() => import('../components/WashView'));
const WarehouseView = lazyView(() => import('../components/WarehouseView'));
const MockupsHome = lazyView(() => import('../components/mockups/MockupsHome'));
const DispatchBoardMock = lazyView(() => import('../components/mockups/DispatchBoardMock'));
const DriverRouteCardMock = lazyView(() => import('../components/mockups/DriverRouteCardMock'));

// Mapowanie ścieżki na klucz tłumaczeń strony (pages.<slug>).
const PAGE_KEYS = {
  '/': 'home',
  '/schedule': 'home',
  '/tunnel': 'tunnel',
  '/route': 'route',
  '/routes': 'routes',
  '/clients': 'clients',
  '/route-plan': 'routePlan',
  '/map': 'map',
  '/history': 'history',
  '/grafik': 'grafik',
  '/timeline': 'grafik',
  '/costs': 'costs',
  '/wash': 'wash',
  '/warehouse': 'warehouse',
  '/admin': 'admin',
  '/panel': 'panel',
  '/rodo': 'rodo',
  '/mock': 'routes',
  '/mock/dyspozytornia': 'routes',
  '/mock/kierowca': 'route',
};

function ViewLoading({ label }) {
  return (
    <div className="app-view-loading" role="status" aria-live="polite">
      <span className="app-view-loading-bars" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>{label}</span>
    </div>
  );
}

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

          <a href="/rodo" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '12px', fontSize: '13px', fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>
            <ShieldCheck size={14} /> {t('privacy.full')}
          </a>

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
  const { user, adminBackup, switchKioskUser, stopImpersonating, isDriver, canViewModule, canViewControlPanel } = useAuth();
  const isImpersonating = !!adminBackup;
  const needsPrivacyNotice = !isImpersonating && user?.privacy_notice_ack_version !== PRIVACY_NOTICE_VERSION;
  const location = useLocation();
  const pageKey = PAGE_KEYS[location.pathname] || 'home';
  // Admin zaczyna od Panelu sterującego; reszta od pierwszego dostępnego widoku.
  const firstAllowedPath = [
    ...(canViewControlPanel ? [['panel', '/panel']] : []),
    ...(isDriver ? [['route', '/route']] : []),
    ['schedule', '/schedule'], ['clients', '/clients'], ['route', '/route'],
    ['map', '/map'],
    ['wash', '/wash'], ['warehouse', '/warehouse'], ['history', '/history'],
  ].find(([module]) => module === 'panel' || canViewModule(module) || (module === 'map' && isDriver))?.[1] || '/rodo';

  const handleStopImpersonating = async () => {
    const result = await stopImpersonating();
    window.location.href = result?.needsLogin ? '/login' : '/admin';
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">{t('common.skipToContent')}</a>

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

      {user?.kiosk_mode && (
        <div className="kiosk-session-bar" role="status">
          <span className="kiosk-session-station"><Scale size={17} /> {user.kiosk_device_name || t('kiosk.station')}</span>
          <span className="kiosk-session-user">
            <UserRound size={17} />
            <span>{t('kiosk.loggedInAs')}</span>
            <strong>{user.name}</strong>
          </span>
          <button type="button" onClick={switchKioskUser}>
            {t('kiosk.changeDriver')}
          </button>
        </div>
      )}

      <div className="app-frame">
        <Navigation />

        <section className="app-workspace">
          <h1 className="sr-only">{t(`pages.${pageKey}.title`)}</h1>

          {/* Kontent główny */}
          <main id="main-content" className="app-main-content" tabIndex={-1}>
            <Suspense fallback={<ViewLoading label={t('common.loading')} />}>
            <Routes>
          <Route path="/" element={<Navigate to={firstAllowedPath} replace />} />
          <Route path="/schedule" element={canViewModule('schedule') ? <ScheduleView /> : <Navigate to={firstAllowedPath} replace />} />
          <Route path="/route" element={canViewModule('route') ? <DriverCourse /> : <Navigate to={firstAllowedPath} replace />} />
          <Route path="/route/operations" element={<Navigate to="/route" replace />} />
          <Route path="/routes" element={canViewModule('live_routes') ? <DispatchBoard /> : <Navigate to={firstAllowedPath} replace />} />
          <Route path="/routes/plan" element={<Navigate to="/routes" replace />} />
          <Route path="/clients" element={canViewModule('clients') ? <ClientsRoutesView /> : <Navigate to={firstAllowedPath} replace />} />
          <Route path="/route-plan" element={canViewModule('route_plan') ? <WeeklyRoutePlanView /> : <Navigate to={firstAllowedPath} replace />} />
          <Route path="/admin" element={canViewModule('admin') ? <AdminDashboard /> : <Navigate to={firstAllowedPath} replace />} />
          <Route path="/panel" element={canViewControlPanel ? <ControlPanelView /> : <Navigate to={firstAllowedPath} replace />} />
          <Route path="/history" element={canViewModule('history') ? <HistoryView /> : <Navigate to={firstAllowedPath} replace />} />
          <Route path="/grafik" element={canViewModule('work_schedule') ? <WorkScheduleView /> : <Navigate to={firstAllowedPath} replace />} />
          <Route path="/timeline" element={<Navigate to="/grafik#obsada" replace />} />
          <Route path="/map" element={(canViewModule('map') || isDriver) ? <MapView /> : <Navigate to={firstAllowedPath} replace />} />
          <Route path="/costs" element={canViewModule('costs') ? <CostsView /> : <Navigate to={firstAllowedPath} replace />} />
          <Route path="/wash" element={canViewModule('wash') ? <WashView /> : <Navigate to={firstAllowedPath} replace />} />
          <Route path="/warehouse" element={canViewModule('warehouse') ? <WarehouseView /> : <Navigate to={firstAllowedPath} replace />} />
          <Route path="/rodo" element={<RodoNotice />} />
          <Route path="/mock" element={<MockupsHome />} />
          <Route path="/mock/dyspozytornia" element={canViewModule('live_routes') ? <DispatchBoardMock /> : <Navigate to="/mock/kierowca" replace />} />
          <Route path="/mock/kierowca" element={<DriverRouteCardMock />} />
          <Route path="*" element={<Navigate to={firstAllowedPath} replace />} />
            </Routes>
            </Suspense>
          </main>
        </section>
      </div>
      {needsPrivacyNotice && <PrivacyNoticeModal />}
      <ToastContainer />
    </div>
  );
}
