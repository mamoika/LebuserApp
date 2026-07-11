import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarRange, Clock3 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

const GrafikView = lazy(() => import('./GrafikView'));
const TimelineView = lazy(() => import('./TimelineView'));

function SectionLoader({ label }) {
  return <div className="loader work-schedule-loader">{label}</div>;
}

export default function WorkScheduleView() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState(
    location.hash === '#obsada' ? 'timeline' : 'schedule'
  );

  useEffect(() => {
    const requestedSection = location.hash === '#obsada' ? 'timeline' : 'schedule';
    setActiveSection(requestedSection);
  }, [location.hash]);

  const selectSection = (section) => {
    setActiveSection(section);
    navigate(
      { pathname: location.pathname, hash: section === 'timeline' ? '#obsada' : '#harmonogram' },
      { replace: true }
    );
  };

  return (
    <div className="work-schedule-view">
      <header className="work-schedule-toolbar">
        <div className="work-schedule-current-heading">
          <span className={`work-schedule-section-icon ${activeSection === 'timeline' ? 'timeline' : ''}`} aria-hidden="true">
            {activeSection === 'schedule' ? <CalendarRange size={19} /> : <Clock3 size={19} />}
          </span>
          <span>
            <h2 id="work-schedule-current-title">
              {activeSection === 'schedule' ? t('workSchedule.monthTitle') : t('workSchedule.timelineTitle')}
            </h2>
            <p>
              {activeSection === 'schedule' ? t('workSchedule.monthDescription') : t('workSchedule.timelineDescription')}
            </p>
          </span>
        </div>

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
      </header>

      {activeSection === 'schedule' && (
        <section id="harmonogram" className="work-schedule-section" aria-labelledby="work-schedule-current-title">
          <Suspense fallback={<SectionLoader label={t('grafik.loading')} />}>
            <GrafikView />
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
    </div>
  );
}
