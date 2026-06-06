import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { SUPPORTED_LANGUAGES } from '../i18n';

// Mały segmentowany przełącznik PL / DE. Działa przed i po zalogowaniu
// (setLanguage z AuthContext zapisuje lokalnie, a dla zalogowanego też w bazie).
export default function LanguageSwitcher({ size = 'md' }) {
  const { i18n, t } = useTranslation();
  const { setLanguage } = useAuth();
  const current = SUPPORTED_LANGUAGES.includes(i18n.resolvedLanguage)
    ? i18n.resolvedLanguage
    : i18n.language?.split('-')[0];

  return (
    <div
      role="group"
      aria-label={t('language.select')}
      className={`lang-selector lang-selector-${size}`}
    >
      {SUPPORTED_LANGUAGES.map((lng) => {
        const active = current === lng;
        return (
          <button
            key={lng}
            type="button"
            onClick={() => { if (!active) setLanguage(lng); }}
            aria-pressed={active}
            className={active ? 'is-active' : ''}
          >
            {lng.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
