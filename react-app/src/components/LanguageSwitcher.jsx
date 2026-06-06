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

  const pad = size === 'sm' ? '4px 8px' : '6px 12px';
  const fontSize = size === 'sm' ? '12px' : '13px';

  return (
    <div
      role="group"
      aria-label={t('language.select')}
      style={{
        display: 'inline-flex',
        gap: '2px',
        padding: '2px',
        background: 'var(--bg-muted, rgba(0,0,0,0.05))',
        border: '1px solid var(--border)',
        borderRadius: '10px',
      }}
    >
      {SUPPORTED_LANGUAGES.map((lng) => {
        const active = current === lng;
        return (
          <button
            key={lng}
            type="button"
            onClick={() => { if (!active) setLanguage(lng); }}
            aria-pressed={active}
            style={{
              padding: pad,
              border: 'none',
              borderRadius: '8px',
              cursor: active ? 'default' : 'pointer',
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? '#fff' : 'var(--text-secondary)',
              fontFamily: 'var(--font)',
              fontSize,
              fontWeight: active ? 700 : 600,
              letterSpacing: '0.3px',
              transition: 'all 0.15s ease',
            }}
          >
            {lng.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
