import { NavLink } from 'react-router-dom';
import { Calendar, History, Map as MapIcon, Users, Settings } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Navigation() {
  const { isAdmin } = useAuth();

  const navItems = [
    { to: "/", icon: Calendar, label: "Harmonogram" },
    { to: "/history", icon: History, label: "Historia" },
    { to: "/clients", icon: Users, label: "Klienci i Trasy" },
    { to: "/map", icon: MapIcon, label: "Mapa" },
  ];

  if (isAdmin) {
    navItems.push({ to: "/admin", icon: Settings, label: "Panel Admina" });
  }

  return (
    <nav style={{ background: 'var(--bg-card)', padding: '10px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '10px', overflowX: 'auto' }}>
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `nav-btn ${isActive ? 'active' : ''}`}
          style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '8px', color: 'var(--text-secondary)', fontWeight: 'bold' }}
        >
          <item.icon size={18} />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
