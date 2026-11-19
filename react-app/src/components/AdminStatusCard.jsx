import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';

export default function AdminStatusCard({ icon: Icon, title, status, onRefresh, children }) {
  const id = useId();
  const { t } = useTranslation();
  const checking = status === 'checking';

  return (
    <section className="admin-status-card" aria-labelledby={id}>
      <header className="admin-status-heading">
        <span className="admin-status-icon"><Icon size={20} aria-hidden="true" /></span>
        <h2 id={id}>{title}</h2>
        <button className="admin-apple-refresh-btn admin-status-refresh" type="button" onClick={onRefresh} disabled={checking} aria-describedby={id}>
          <RefreshCw size={14} className={checking ? 'spin' : ''} aria-hidden="true" />
          {t('common.refresh')}
        </button>
      </header>
      {children}
    </section>
  );
}
