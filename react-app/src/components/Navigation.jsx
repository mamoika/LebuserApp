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
  PanelLeftClose,
  PanelLeftOpen,
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
import { SUPPORTED_LANGUAGES } from '../i18n/index.js';
import logoImg from '../assets/logo-icon.png';

const NAV_GROUPS = ['transport', 'laundry', 'management'];
const COLLAPSE_KEY = 'lebuser.nav.collapsed';

function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

export default function Navigation() {
  const { t, i18n } = useTranslation();
  const { canViewModule, user, signOut, switchKioskUser, adminBackup, setLanguage } = useAuth();
  const navigate = useNavigate();
  const menuPanelId = useId();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(readCollapsed);

  const toggleCollapsed = () => {
    setIsCollapsed(value => {
      const next = !value;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        // zapis preferencji jest opcjonalny
      }
      return next;
    });
  };

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

  if (canViewModule('live_routes')) navItems.push({ to: '/routes', icon: RadioTower, label: t('nav.liveRoutes'), group: 'transport' });
  if (canViewModule('work_schedule')) navItems.push({ to: '/grafik', icon: WalletCards, label: t('nav.workSchedule'), group: 'management' });
  if (canViewModule('costs')) navItems.push({ to: '/costs', icon: ChartNoAxesCombined, label: t('nav.costs'), group: 'management' });
  if (canViewModule('history')) navItems.push({ to: '/history', icon: ClipboardList, label: t('nav.history'), group: 'management' });

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

  const currentLanguage = SUPPORTED_LANGUAGES.includes(i18n.resolvedLanguage)
    ? i18n.resolvedLanguage
    : i18n.language?.split('-')[0] || SUPPORTED_LANGUAGES[0];
  const nextLanguage = SUPPORTED_LANGUAGES[(SUPPORTED_LANGUAGES.indexOf(currentLanguage) + 1) % SUPPORTED_LANGUAGES.length];

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
    <aside className={`app-navigation${isMenuOpen ? ' is-menu-open' : ''}${isCollapsed ? ' is-collapsed' : ''}`} aria-label={t('nav.primary')}>
      <div className="app-navigation-inner">
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
                      title={isCollapsed ? label : undefined}
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
            <button
              type="button"
              className="app-navigation-collapse"
              onClick={toggleCollapsed}
              aria-pressed={isCollapsed}
              title={t(isCollapsed ? 'nav.expand' : 'nav.collapse')}
              aria-label={t(isCollapsed ? 'nav.expand' : 'nav.collapse')}
            >
              {isCollapsed
                ? <PanelLeftOpen size={16} aria-hidden="true" />
                : <PanelLeftClose size={16} aria-hidden="true" />}
              <span>{t('nav.collapse')}</span>
            </button>
            <div className="app-navigation-actions">
              <LanguageSwitcher size="sm" />
              <button
                type="button"
                className="app-navigation-icon-button app-navigation-lang-compact"
                onClick={() => setLanguage(nextLanguage)}
                title={`${t('language.select')}: ${nextLanguage.toUpperCase()}`}
                aria-label={`${t('language.select')}: ${nextLanguage.toUpperCase()}`}
              >
                {currentLanguage.toUpperCase()}
              </button>
              <Link
                to="/rodo"
                className="app-navigation-icon-button app-navigation-rodo"
                title={t('pages.rodo.title')}
                aria-label={t('pages.rodo.title')}
                onClick={() => setIsMenuOpen(false)}
              >
                <ShieldCheck size={16} aria-hidden="true" />
                <span>{t('nav.rodo')}</span>
              </Link>
            </div>
            <div className={`app-navigation-profile${adminBackup ? ' is-impersonating' : ''}`}>
              <span className="app-navigation-avatar" aria-hidden="true">{initials}</span>
              <span className="app-navigation-account-copy">
                <strong>{user?.name}</strong>
                <small>@{user?.username}</small>
              </span>
              <button
                type="button"
                className="app-navigation-icon-button app-navigation-signout"
                onClick={handleSignOut}
                title={signOutLabel}
                aria-label={signOutLabel}
              >
                <LogOut size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
