import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BarChart3,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Folder,
  Map,
  MapPin,
  Package,
  Settings,
  Truck,
  WashingMachine,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Navigation() {
  const { t } = useTranslation();
  const { canViewModule, user } = useAuth();
  const scrollerRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const navItems = [];

  if (canViewModule('route')) navItems.push({ to: '/route', icon: Truck, label: t('nav.myRoute') });

  if (canViewModule('clients')) navItems.push({ to: '/clients', icon: Folder, label: t('nav.clientsRoutes') });

  if (canViewModule('route_plan')) {
    navItems.push({ to: '/route-plan', icon: CalendarRange, label: t('nav.weeklyRoutePlan') });
  }

  if (canViewModule('map') || user?.role === 'driver') navItems.push({ to: '/map', icon: Map, label: t('nav.map') });
  if (canViewModule('schedule')) navItems.push({ to: '/schedule', icon: CalendarDays, label: t('nav.schedule') });

  if (canViewModule('wash')) navItems.push({ to: '/wash', icon: WashingMachine, label: t('nav.wash') });
  if (canViewModule('warehouse')) navItems.push({ to: '/warehouse', icon: Package, label: t('nav.warehouse') });

  if (canViewModule('history')) navItems.push({ to: '/history', icon: ClipboardList, label: t('nav.history') });

  if (canViewModule('live_routes')) navItems.push({ to: '/routes', icon: MapPin, label: t('nav.liveRoutes') });
  if (canViewModule('work_schedule')) navItems.push({ to: '/grafik', icon: BarChart3, label: t('nav.workSchedule') });
  if (canViewModule('costs')) navItems.push({ to: '/costs', icon: CircleDollarSign, label: t('nav.costs') });

  if (canViewModule('admin')) {
    navItems.push({ to: '/admin', icon: Settings, label: t('nav.adminPanel') });
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
    <div className="app-navigation">
      <nav ref={scrollerRef} className="app-navigation__scroller">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/' || item.to === '/schedule'}
            className={({ isActive }) => `app-navigation__item${isActive ? ' is-active' : ''}`}
          >
            <span className="app-navigation__icon" aria-hidden="true">
              <Icon size={18} strokeWidth={1.6} />
            </span>
            <span>{item.label}</span>
          </NavLink>
          );
        })}
      </nav>
      {canScrollLeft && (
        <div className="app-navigation__fade app-navigation__fade--left" aria-hidden="true">
          <ChevronLeft size={14} strokeWidth={1.6} />
        </div>
      )}
      {canScrollRight && (
        <div className="app-navigation__fade app-navigation__fade--right" aria-hidden="true">
          <ChevronRight size={14} strokeWidth={1.6} />
        </div>
      )}
    </div>
  );
}
