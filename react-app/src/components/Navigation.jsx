import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

export default function Navigation() {
  const { t } = useTranslation();
  const { isAdmin, canEdit, canViewAdminData } = useAuth();

  const navItems = [];

  // Dla kierowców: Moja trasa jest pierwsza
  if (canEdit) navItems.push({ to: '/route', icon: '🚐', label: t('nav.myRoute') });

  navItems.push(
    { to: '/clients', icon: '🗂', label: t('nav.clientsRoutes') },
    { to: '/map', icon: '🗺', label: t('nav.map') },
    { to: '/schedule', icon: '📅', label: t('nav.schedule') },
    { to: '/tunnel', icon: '🏭', label: t('nav.tunnel') },
    { to: '/history', icon: '📋', label: t('nav.history') }
  );

  if (canViewAdminData) {
    navItems.push({ to: '/routes', icon: '📍', label: t('nav.liveRoutes') });
    navItems.push({ to: '/grafik', icon: '📊', label: t('nav.workSchedule') });
    navItems.push({ to: '/timeline', icon: '⏱', label: t('nav.timeline') });
    navItems.push({ to: '/costs', icon: '💰', label: t('nav.costs') });
    navItems.push({ to: '/tunnel', icon: 'T', label: t('nav.tunnel') });
    navItems.push({ to: '/wash', icon: '🧺', label: t('nav.wash') });
  }

  if (isAdmin) {
    navItems.push({ to: '/admin', icon: '⚙️', label: t('nav.adminPanel') });
    navItems.push({ to: '/lebuser', icon: '🫧', label: 'Lebuser' });
  }

  return (
    <nav style={{
      display: 'flex',
      overflowX: 'auto',
      gap: '6px',
      padding: '6px',
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: '18px',
      marginBottom: '20px',
      scrollbarWidth: 'none',
      WebkitOverflowScrolling: 'touch',
      boxShadow: 'var(--shadow-sm)',
      flexShrink: 0,
    }}>
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/' || item.to === '/schedule'}
          style={({ isActive }) => ({
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '9px 16px',
            borderRadius: '12px',
            border: 'none',
            background: isActive ? 'var(--accent)' : 'transparent',
            color: isActive ? '#fff' : 'var(--text-secondary)',
            fontFamily: 'var(--font)',
            fontSize: '13px',
            fontWeight: isActive ? 700 : 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            textDecoration: 'none',
            flexShrink: 0,
            transition: 'all 0.15s ease',
            boxShadow: isActive ? '0 3px 10px var(--accent-light)' : 'none',
            letterSpacing: '-0.1px',
          })}
        >
          <span style={{ fontSize: '15px', lineHeight: 1 }}>{item.icon}</span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
