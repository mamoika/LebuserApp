import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarRange, Clock3, History, Settings } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const GrafikView = lazy(() => import('./GrafikView'));
const TimelineView = lazy(() => import('./TimelineView'));
const WorkScheduleSettings = lazy(() => (
  import('./AdminDashboard').then(module => ({ default: module.WorkScheduleSettings }))
));

function sectionFromHash(hash) {
  if (hash === '#obsada') return 'timeline';
  if (hash === '#ustawienia') return 'settings';
  return 'schedule';
}

function SectionLoader({ label }) {
  return <div className="loader work-schedule-loader">{label}</div>;
}

export default function WorkScheduleView() {
  const { t } = useTranslation();
  const { isAdmin, canViewAdminData } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState(() => {
    const requestedSection = sectionFromHash(location.hash);
    return requestedSection === 'settings' && !isAdmin ? 'schedule' : requestedSection;
  });
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    const requestedSection = sectionFromHash(location.hash);
    setActiveSection(requestedSection === 'settings' && !isAdmin ? 'schedule' : requestedSection);
  }, [isAdmin, location.hash]);

  const selectSection = (section) => {
    setHistoryOpen(false);
    setActiveSection(section);
    navigate(
      {
        pathname: location.pathname,
        hash: section === 'timeline' ? '#obsada' : section === 'settings' ? '#ustawienia' : '#harmonogram',
      },
      { replace: true }
    );
  };

  return (
    <div className="work-schedule-view">
      <header className="work-schedule-toolbar">
        <div className="work-schedule-current-heading">
          <span className={`work-schedule-section-icon ${activeSection}`} aria-hidden="true">
            {activeSection === 'schedule' && <CalendarRange size={19} />}
            {activeSection === 'timeline' && <Clock3 size={19} />}
            {activeSection === 'settings' && <Settings size={19} />}
          </span>
          <span>
            <h2 id="work-schedule-current-title">
              {activeSection === 'schedule' && t('workSchedule.monthTitle')}
              {activeSection === 'timeline' && t('workSchedule.timelineTitle')}
              {activeSection === 'settings' && t('workSchedule.settingsTitle')}
            </h2>
            <p>
              {activeSection === 'schedule' && t('workSchedule.monthDescription')}
              {activeSection === 'timeline' && t('workSchedule.timelineDescription')}
              {activeSection === 'settings' && t('workSchedule.settingsDescription')}
            </p>
          </span>
        </div>

        <div className="work-schedule-tabs-wrapper">
          <div className="work-schedule-tabs" role="tablist" aria-label={t('workSchedule.viewSelector')}>
            <button
              type="button"
              role="tab"
              id="work-schedule-tab-month"
              aria-controls="harmonogram"
              aria-selected={activeSection === 'schedule'}
              tabIndex={activeSection === 'schedule' ? 0 : -1}
              className={activeSection === 'schedule' ? 'active' : ''}
              onClick={() => selectSection('schedule')}
            >
              <CalendarRange size={16} aria-hidden="true" />
              {t('workSchedule.monthTab')}
            </button>
            <button
              type="button"
              role="tab"
              id="work-schedule-tab-timeline"
              aria-controls="obsada"
              aria-selected={activeSection === 'timeline'}
              tabIndex={activeSection === 'timeline' ? 0 : -1}
              className={activeSection === 'timeline' ? 'active' : ''}
              onClick={() => selectSection('timeline')}
            >
              <Clock3 size={16} aria-hidden="true" />
              {t('workSchedule.timelineTab')}
            </button>
          </div>
        </div>
        <div className="work-schedule-settings-wrapper">
          {canViewAdminData && activeSection === 'schedule' && (
            <button
              type="button"
              className={`work-schedule-settings-button ${historyOpen ? 'active' : ''}`}
              aria-haspopup="dialog"
              aria-expanded={historyOpen}
              onClick={() => setHistoryOpen(true)}
            >
              <History size={16} aria-hidden="true" />
              {t('workSchedule.historyButton')}
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              className={`work-schedule-settings-button ${activeSection === 'settings' ? 'active' : ''}`}
              aria-controls="ustawienia"
              aria-pressed={activeSection === 'settings'}
              onClick={() => selectSection('settings')}
            >
              <Settings size={16} aria-hidden="true" />
              {t('workSchedule.settingsButton')}
            </button>
          )}
        </div>
      </header>

      {activeSection === 'schedule' && (
        <section id="harmonogram" className="work-schedule-section" aria-labelledby="work-schedule-current-title">
          <Suspense fallback={<SectionLoader label={t('grafik.loading')} />}>
            <GrafikView historyOpen={historyOpen} onHistoryClose={() => setHistoryOpen(false)} />
          </Suspense>
        </section>
      )}

      {activeSection === 'timeline' && (
        <section
          id="obsada"
          className="work-schedule-section work-schedule-timeline-section"
          aria-labelledby="work-schedule-current-title"
        >
          <Suspense fallback={<SectionLoader label={t('timeline.loading')} />}>
            <TimelineView />
          </Suspense>
        </section>
      )}

      {activeSection === 'settings' && isAdmin && (
        <section id="ustawienia" className="work-schedule-section" aria-labelledby="work-schedule-current-title">
          <Suspense fallback={<SectionLoader label={t('common.loading')} />}>
            <WorkScheduleSettings />
          </Suspense>
        </section>
      )}
    </div>
  );
}
