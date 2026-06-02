import { useAuth } from '../context/AuthContext';
import Navigation from "../components/Navigation";
import { LogOut } from 'lucide-react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ScheduleView from '../components/ScheduleView';
import ClientsRoutesView from '../components/ClientsRoutesView';
import AdminDashboard from '../components/AdminDashboard';

export default function Dashboard() {
  const { user, signOut } = useAuth();

  return (
    <div className="app-shell">
      {/* Header */}
      <header className="app-header">
        <div className="app-header-top">
          <div className="auth-logo-icon" style={{ fontSize: '28px', lineHeight: 1 }}>🚛</div>
          <div>
            <div className="app-title">LEBUSER <span style={{ fontWeight: 400 }}>Harmonogram</span></div>
            <div className="app-subtitle">LEBUSER Textilservice Sp. z o.o. — Zarządzanie logistyką</div>
          </div>
        </div>
        <div className="app-header-actions">
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)' }}>
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
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/history" element={<div style={{ padding: '20px', color: 'var(--text-tertiary)' }}>Historia (W budowie)</div>} />
          <Route path="/map" element={<div style={{ padding: '20px', color: 'var(--text-tertiary)' }}>Mapa (W budowie)</div>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
