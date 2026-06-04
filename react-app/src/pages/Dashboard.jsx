import { useAuth } from '../context/AuthContext';
import Navigation from "../components/Navigation";
import { LogOut } from 'lucide-react';
import { Routes, Route, Navigate } from 'react-router-dom';
import logoImg from '../assets/logo-icon.png';
import ScheduleView from '../components/ScheduleView';
import ClientsRoutesView from '../components/ClientsRoutesView';
import AdminDashboard from '../components/AdminDashboard';
import MapView from '../components/MapView';
import HistoryView from '../components/HistoryView';
import GrafikView from '../components/GrafikView';
import TimelineView from '../components/TimelineView';
import CostsView from '../components/CostsView';
import ToastContainer from '../components/ToastContainer';

export default function Dashboard() {
  const { user, adminBackup, signOut, stopImpersonating, isAdmin } = useAuth();
  const isImpersonating = !!adminBackup;

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
            👁 Przeglądasz jako: <strong>{user?.name}</strong> (@{user?.username})
            {user?.has_password === false && (
              <span style={{ marginLeft: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', fontWeight: 700 }}>
                ⚠️ Brak hasła — user nie zalogował się jeszcze
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
            ← Wróć do admina ({adminBackup?.name})
          </button>
        </div>
      )}

      {/* Header */}
      <header className="app-header">
        <div className="app-header-top" style={{ alignItems: 'center', gap: '16px' }}>
          <img src={logoImg} alt="Logo LEBUSER" style={{ height: '44px', width: 'auto', objectFit: 'contain' }} />
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div className="app-title" style={{ fontSize: '22px' }}>Harmonogram</div>
            <div className="app-subtitle">Zarządzanie logistyką</div>
          </div>
        </div>
        <div className="app-header-actions">
          <span style={{ fontSize: '13px', fontWeight: 700, color: isImpersonating ? '#FF9500' : 'var(--text-secondary)' }}>
            {user?.name} <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-tertiary)' }}>@{user?.username}</span>
          </span>
          <button onClick={signOut} className="driver-btn">
            <LogOut size={14} /> Wyloguj
          </button>
        </div>
      </header>

      {/* Nawigacja */}
      <Navigation />

      {/* Kontent główny */}
      <main>
        <Routes>
          <Route path="/" element={<ScheduleView />} />
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
      <ToastContainer />
    </div>
  );
}
