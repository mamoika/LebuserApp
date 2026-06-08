import { useTranslation } from 'react-i18next';

// Komunikat pokazywany, gdy pobranie danych nie powiodło się (po wyczerpaniu
// automatycznych ponowień w useAppData). Zamiast wiecznego spinnera użytkownik
// widzi co się stało i może spróbować ponownie jednym kliknięciem.
export default function DataError({ onRetry }) {
  const { t } = useTranslation();
  return (
    <div className="loader" style={{ flexDirection: 'column', gap: '14px', textAlign: 'center' }}>
      <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-secondary)' }}>
        {t('common.loadFailed')}
      </div>
      <button className="driver-btn" onClick={onRetry}>
        {t('common.retry')}
      </button>
    </div>
  );
}
