import { useTranslation } from 'react-i18next';
import { Package } from 'lucide-react';
import { RouteChip } from '../CourseUiBits';
import CourseSheet from '../CourseSheet';

export default function ExtraCleanPickupSheet({
  candidates = [],
  routeMap,
  busy,
  onClose,
  onPick,
}) {
  const { t } = useTranslation();

  return (
    <CourseSheet titleId="extra-clean-title" title={t('course.driver.otherRouteCleanTitle')} onClose={onClose} busy={busy}>
      <p className="live-sheet-copy">{t('course.driver.otherRouteCleanHint')}</p>
      {candidates.length === 0 ? (
        <div className="live-dirty-empty">{t('course.driver.noOtherRouteClean')}</div>
      ) : (
        <div className="live-extra-clean-list">
          {candidates.map(candidate => (
            <div className="live-extra-clean-row" key={candidate.client_name}>
              <div className="live-extra-clean-info">
                <Package size={16} aria-hidden="true" />
                <span>
                  <strong>{candidate.client_name}</strong>
                  {candidate.kg ? ` · ${candidate.kg} kg` : ''}
                  {candidate.isUrgent ? ` · ${t('course.driver.urgentShort')}` : ''}
                </span>
                <RouteChip routeId={candidate.route_id} routeMap={routeMap} />
              </div>
              <button type="button" className="live-start-claim-btn" onClick={() => onPick(candidate.client_name)} disabled={busy}>
                {t('course.add')}
              </button>
            </div>
          ))}
        </div>
      )}
    </CourseSheet>
  );
}
