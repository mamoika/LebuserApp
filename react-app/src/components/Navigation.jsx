import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navigation() {
  const { isAdmin } = useAuth();

  const navItems = [
    { to: "/", icon: "📋", label: "Harmonogram" },
    { to: "/history", icon: "📊", label: "Historia" },
    { to: "/clients", icon: "👥", label: "Klienci i Trasy" },
    { to: "/map", icon: "🗺️", label: "Mapa" },
  ];

  if (isAdmin) {
    navItems.push({ to: "/admin", icon: "⚙️", label: "Panel Admina" });
  }

  return (
    <nav className="tab-bar">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}
        >
          <span className="tab-icon">{item.icon}</span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
