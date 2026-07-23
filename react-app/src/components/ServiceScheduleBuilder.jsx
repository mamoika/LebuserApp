import { useTranslation } from 'react-i18next';
import {
  mondayKey,
  normalizeServiceRules,
  SERVICE_SCHEDULE_MODES,
  SERVICE_WEEKDAYS,
} from '../lib/serviceSchedule';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri'];

export function serviceScheduleSummary(rules, t) {
  const normalized = normalizeServiceRules(rules);
  if (!normalized.length) return t('clients.servicePlan.none');
  return normalized.map(rule => {
    const day = t(`clients.servicePlan.days.${DAY_KEYS[rule.weekday - 1]}`);
    return rule.interval_weeks === 1
      ? day
      : `${day} · ${t('clients.servicePlan.everyNWeeks', { count: rule.interval_weeks })}`;
  }).join(' · ');
}

export default function ServiceScheduleBuilder({
  mode = 'custom',
  rules = [],
  inheritedRules = [],
  showMode = false,
  onModeChange,
  onRulesChange,
}) {
  const { t } = useTranslation();
  const normalized = normalizeServiceRules(rules);
  const customEnabled = !showMode || mode === 'custom';
  const setRules = next => onRulesChange(normalizeServiceRules(next));

  const toggleDay = weekday => {
    const existing = normalized.find(rule => rule.weekday === weekday);
    if (existing) {
      setRules(normalized.filter(rule => rule.weekday !== weekday));
    } else {
      setRules([
        ...normalized,
        { weekday, interval_weeks: 1, anchor_week: mondayKey() },
      ]);
    }
  };

  const updateRule = (weekday, patch) => {
    setRules(normalized.map(rule => (
      rule.weekday === weekday ? { ...rule, ...patch } : rule
    )));
  };

  return (
    <section className="service-schedule-builder">
      {showMode && (
        <div className="service-schedule-modes" role="group" aria-label={t('clients.servicePlan.modeLabel')}>
          {SERVICE_SCHEDULE_MODES.map(value => (
            <button
              key={value}
              type="button"
              className={mode === value ? 'active' : ''}
              onClick={() => onModeChange?.(value)}
            >
              {t(`clients.servicePlan.mode.${value}`)}
            </button>
          ))}
        </div>
      )}

      {showMode && mode === 'inherit' && (
        <div className="service-schedule-inherited">
          <strong>{t('clients.servicePlan.inheritedTitle')}</strong>
          <span>{serviceScheduleSummary(inheritedRules, t)}</span>
        </div>
      )}

      {showMode && mode === 'disabled' && (
        <div className="service-schedule-disabled">{t('clients.servicePlan.disabledHint')}</div>
      )}

      {customEnabled && (
        <>
          <div className="service-schedule-days" role="group" aria-label={t('clients.servicePlan.daysLabel')}>
            {SERVICE_WEEKDAYS.map((weekday, index) => {
              const selected = normalized.some(rule => rule.weekday === weekday);
              return (
                <button
                  type="button"
                  key={weekday}
                  className={selected ? 'active' : ''}
                  aria-pressed={selected}
                  onClick={() => toggleDay(weekday)}
                >
                  {t(`clients.servicePlan.days.${DAY_KEYS[index]}`)}
                </button>
              );
            })}
          </div>

          {normalized.length === 0 ? (
            <div className="service-schedule-empty">{t('clients.servicePlan.selectDay')}</div>
          ) : (
            <div className="service-schedule-rules">
              {normalized.map(rule => (
                <div className="service-schedule-rule" key={rule.weekday}>
                  <strong>{t(`clients.servicePlan.dayNames.${DAY_KEYS[rule.weekday - 1]}`)}</strong>
                  <label>
                    <span>{t('clients.servicePlan.frequency')}</span>
                    <select
                      className="ap-input"
                      value={rule.interval_weeks}
                      onChange={event => {
                        const intervalWeeks = Number(event.target.value);
                        updateRule(rule.weekday, {
                          interval_weeks: intervalWeeks,
                          anchor_week: intervalWeeks === 1
                            ? mondayKey()
                            : rule.anchor_week || mondayKey(),
                        });
                      }}
                    >
                      <option value={1}>{t('clients.servicePlan.everyWeek')}</option>
                      <option value={2}>{t('clients.servicePlan.everyTwoWeeks')}</option>
                    </select>
                  </label>
                  {rule.interval_weeks > 1 && (
                    <label>
                      <span>{t('clients.servicePlan.firstCycleWeek')}</span>
                      <input
                        className="ap-input"
                        type="date"
                        value={rule.anchor_week}
                        onChange={event => updateRule(rule.weekday, {
                          anchor_week: mondayKey(event.target.value) || mondayKey(),
                        })}
                      />
                    </label>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="service-schedule-preview">
            <span>{t('clients.servicePlan.summary')}</span>
            <strong>{serviceScheduleSummary(normalized, t)}</strong>
          </div>
        </>
      )}
    </section>
  );
}
