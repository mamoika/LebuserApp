import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

export default function Navigation() {
  const { t } = useTranslation();
  const { isAdmin, canEdit, canViewAdminData, canViewLaundry } = useAuth();
  const scrollerRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const navItems = [];

  // Dla kierowców: Moja trasa jest pierwsza
  if (canEdit) navItems.push({ to: '/route', icon: '🚐', label: t('nav.myRoute') });

  navItems.push(
    { to: '/clients', icon: '🗂', label: t('nav.clientsRoutes') },
    { to: '/map', icon: '🗺', label: t('nav.map') },
    { to: '/schedule', icon: '📅', label: t('nav.schedule') }
  );

  if (canViewLaundry) {
    navItems.push({ to: '/wash', icon: '🧺', label: t('nav.wash') });
  }

  navItems.push({ to: '/history', icon: '📋', label: t('nav.history') });

  if (canViewAdminData) {
    navItems.push({ to: '/routes', icon: '📍', label: t('nav.liveRoutes') });
    navItems.push({ to: '/grafik', icon: '📊', label: t('nav.workSchedule') });
    navItems.push({ to: '/costs', icon: '💰', label: t('nav.costs') });
  }

  if (isAdmin) {
    navItems.push({ to: '/admin', icon: '⚙️', label: t('nav.adminPanel') });
    navItems.push({ to: '/lebuser', icon: '🫧', label: 'Lebuser' });
  }

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return undefined;

    const updateFades = () => {
      setCanScrollLeft(el.scrollLeft > 2);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
    };

    updateFades();
    el.addEventListener('scroll', updateFades, { passive: true });
    const resizeObserver = new ResizeObserver(updateFades);
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener('scroll', updateFades);
      resizeObserver.disconnect();
    };
  }, [navItems.length]);

  return (
    <div className="app-navigation" style={{ position: 'relative', marginBottom: '20px' }}>
      <nav
        ref={scrollerRef}
        style={{
          display: 'flex',
          overflowX: 'auto',
          gap: '6px',
          padding: '6px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '18px',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
          boxShadow: 'var(--shadow-sm)',
          flexShrink: 0,
        }}
      >
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
      {canScrollLeft && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: '28px',
            borderRadius: '18px 0 0 18px',
            background: 'linear-gradient(to right, var(--bg-card), transparent)',
            pointerEvents: 'none',
          }}
        />
      )}
      {canScrollRight && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: '28px',
            borderRadius: '0 18px 18px 0',
            background: 'linear-gradient(to left, var(--bg-card), transparent)',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
          }}
        >
          <span style={{ fontSize: '13px', color: 'var(--text-tertiary, var(--text-secondary))', marginRight: '2px' }}>›</span>
        </div>
      )}
    </div>
  );
}
