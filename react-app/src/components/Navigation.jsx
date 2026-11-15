import { useEffect, useId, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CalendarDays,
  CalendarRange,
  ChartNoAxesCombined,
  ClipboardList,
  ContactRound,
  LogOut,
  Map,
  Menu,
  PackageOpen,
  RadioTower,
  Settings2,
  ShieldCheck,
  Truck,
  WalletCards,
  WashingMachine,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import LanguageSwitcher from './LanguageSwitcher';
import logoImg from '../assets/logo-icon.png';

const NAV_GROUPS = ['transport', 'laundry', 'management'];

export default function Navigation() {
  const { t } = useTranslation();
  const { canViewModule, user, signOut, switchKioskUser, adminBackup } = useAuth();
  const navigate = useNavigate();
  const menuPanelId = useId();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navItems = [];

  if (canViewModule('route')) navItems.push({ to: '/route', icon: Truck, label: t('nav.myRoute'), group: 'transport' });

  if (canViewModule('clients')) navItems.push({ to: '/clients', icon: ContactRound, label: t('nav.clientsRoutes'), group: 'transport' });

  if (canViewModule('route_plan')) {
    navItems.push({ to: '/route-plan', icon: CalendarRange, label: t('nav.weeklyRoutePlan'), group: 'transport' });
  }

  if (canViewModule('map') || user?.role === 'driver') navItems.push({ to: '/map', icon: Map, label: t('nav.map'), group: 'transport' });
  if (canViewModule('schedule')) navItems.push({ to: '/schedule', icon: CalendarDays, label: t('nav.schedule'), group: 'transport' });

  if (canViewModule('wash')) navItems.push({ to: '/wash', icon: WashingMachine, label: t('nav.wash'), group: 'laundry' });
  if (canViewModule('warehouse')) navItems.push({ to: '/warehouse', icon: PackageOpen, label: t('nav.warehouse'), group: 'laundry' });

  if (canViewModule('history')) navItems.push({ to: '/history', icon: ClipboardList, label: t('nav.history'), group: 'management' });

  if (canViewModule('live_routes')) navItems.push({ to: '/routes', icon: RadioTower, label: t('nav.liveRoutes'), group: 'transport' });
  if (canViewModule('work_schedule')) navItems.push({ to: '/grafik', icon: ChartNoAxesCombined, label: t('nav.workSchedule'), group: 'management' });
  if (canViewModule('costs')) navItems.push({ to: '/costs', icon: WalletCards, label: t('nav.costs'), group: 'management' });

  if (canViewModule('admin')) {
    navItems.push({ to: '/admin', icon: Settings2, label: t('nav.adminPanel'), group: 'management' });
  }

  const visibleGroups = NAV_GROUPS
    .map(group => ({ group, items: navItems.filter(item => item.group === group) }))
    .filter(({ items }) => items.length > 0);

  const initials = (user?.name || user?.username || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || t('common.appName').slice(0, 1);

  const handleSignOut = () => {
    if (user?.kiosk_mode) {
      switchKioskUser();
      navigate('/kiosk', { replace: true });
      return;
    }
    signOut();
  };

  const signOutLabel = user?.kiosk_mode ? t('kiosk.changeDriver') : t('header.signOut');

  useEffect(() => {
    if (!isMenuOpen) return undefined;

    const closeOnEscape = event => {
      if (event.key === 'Escape') setIsMenuOpen(false);
    };

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isMenuOpen]);

  return (
    <aside className={`app-navigation${isMenuOpen ? ' is-menu-open' : ''}`} aria-label={t('nav.primary')}>
      <div className="app-navigation-brand">
        <span className="app-navigation-logo">
          <img src={logoImg} alt={t('common.appName')} />
        </span>
        <button
          type="button"
          className="app-navigation-toggle"
          aria-controls={menuPanelId}
          aria-expanded={isMenuOpen}
          aria-label={t(isMenuOpen ? 'nav.closeMenu' : 'nav.openMenu')}
          onClick={() => setIsMenuOpen(open => !open)}
        >
          {isMenuOpen
            ? <X size={20} strokeWidth={1.9} aria-hidden="true" />
            : <Menu size={20} strokeWidth={1.9} aria-hidden="true" />}
        </button>
      </div>

      <button
        type="button"
        className="app-navigation-backdrop"
        aria-label={t('nav.closeMenu')}
        tabIndex={-1}
        onClick={() => setIsMenuOpen(false)}
      />

      <div className="app-navigation-panel" id={menuPanelId}>
        <nav className="app-navigation-scroller">
          {visibleGroups.map(({ group, items }) => (
            <section className="app-navigation-group" key={group} aria-labelledby={`nav-group-${group}`}>
              <h2 id={`nav-group-${group}`}>{t(`nav.groups.${group}`)}</h2>
              <div className="app-navigation-items">
                {items.map(({ to, icon: Icon, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/schedule'}
                    className={({ isActive }) => `app-navigation-link${isActive ? ' is-active' : ''}`}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </div>
            </section>
          ))}
        </nav>

        <div className="app-navigation-account">
          <div className={`app-navigation-profile${adminBackup ? ' is-impersonating' : ''}`}>
            <span className="app-navigation-avatar" aria-hidden="true">{initials}</span>
            <span className="app-navigation-account-copy">
              <strong>{user?.name}</strong>
              <small>@{user?.username}</small>
            </span>
          </div>
          <div className="app-navigation-actions">
            <LanguageSwitcher size="sm" />
            <Link
              to="/rodo"
              className="app-navigation-icon-button"
              title={t('pages.rodo.title')}
              aria-label={t('pages.rodo.title')}
              onClick={() => setIsMenuOpen(false)}
            >
              <ShieldCheck size={16} aria-hidden="true" />
            </Link>
            <button type="button" className="app-navigation-signout" onClick={handleSignOut}>
              <LogOut size={15} aria-hidden="true" />
              <span>{signOutLabel}</span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
