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
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
      {/* Header na wzór starej aplikacji */}
      <header className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 30px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)' }}>
        <div className="header-left" style={{ display: 'flex', alignItems: 'center' }}>
          <div className="logo-placeholder" style={{ width: 40, height: 40, background: 'var(--accent-blue)', borderRadius: 8, marginRight: 15 }}></div>
          <div>
            <div className="app-title" style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text-primary)' }}>LEBUSER <span style={{fontWeight: 'normal'}}>Harmonogram</span></div>
            <div className="app-subtitle" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>LEBUSER Textilservice Sp. z o.o. — Zarządzanie logistyką</div>
          </div>
        </div>
        <div className="header-right">
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}><b>{user?.name}</b> <span style={{ fontSize: '12px', opacity: 0.7 }}>({user?.username})</span></span>
            <button 
              onClick={signOut}
              className="btn btn-outline"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 15px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}
            >
              <LogOut size={16} /> Wyloguj
            </button>
          </div>
        </div>
      </header>

      {/* Nawigacja */}
      <Navigation />

      {/* Kontent główny */}
      <main className="main-content" style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
        <Routes>
          <Route path="/" element={<ScheduleView />} />
          <Route path="/clients" element={<ClientsRoutesView />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/history" element={<div style={{padding:'20px'}}>Historia (W budowie)</div>} />
          <Route path="/map" element={<div style={{padding:'20px'}}>Mapa (W budowie)</div>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
