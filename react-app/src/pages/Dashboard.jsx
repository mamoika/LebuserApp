import { useAuth } from '../context/AuthContext';
import Navigation from "../components/Navigation";
import { LogOut } from 'lucide-react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ScheduleView from '../components/ScheduleView';
import ClientsRoutesView from '../components/ClientsRoutesView';
import AdminDashboard from '../components/AdminDashboard';
import MapView from '../components/MapView';
import HistoryView from '../components/HistoryView';

export default function Dashboard() {
  const { user, signOut } = useAuth();

  return (
    <div className="app-shell">
      {/* Header */}
      <header className="app-header">
        <div className="app-header-top">
          <img src="https://lh3.googleusercontent.com/d/1P_80-RIY3LUwxRQJhcw9DO3RqCNTAhI_" alt="Logo LEBUSER" className="app-logo" style={{ width: '40px', height: '40px', borderRadius: '10px' }} />
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
          <Route path="/history" element={<HistoryView />} />
          <Route path="/map" element={<MapView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
