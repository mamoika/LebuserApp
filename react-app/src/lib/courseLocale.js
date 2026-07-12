import { useTranslation } from 'react-i18next';

export function useCourseLocale() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('de') ? 'de-DE' : 'pl-PL';
  return {
    t,
    locale,
    tc: (key, options) => t(`course.${key}`, options),
  };
}

export function formatCourseDate(value, locale = 'pl-PL', options = {}) {
  if (!value) return '';
  return new Date(`${value}T00:00:00`).toLocaleDateString(locale, {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    ...options,
  });
}

export function formatCourseShortDate(value, locale = 'pl-PL') {
  if (!value) return '';
  return new Date(`${value}T00:00:00`).toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatCourseTime(value, locale = 'pl-PL') {
  if (!value) return '';
  return new Date(value).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}
