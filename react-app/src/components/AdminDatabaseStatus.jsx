import { useTranslation } from 'react-i18next';
import { Database } from 'lucide-react';
import { getAdminDatabaseStatus } from '../lib/adminRpc';
import { useAdminStatus } from '../hooks/useAdminStatus';
import AdminStatusCard from './AdminStatusCard';

export default function AdminDatabaseStatus({ sessionToken }) {
  const { t, i18n } = useTranslation();
  const { snapshot, status, refresh } = useAdminStatus(getAdminDatabaseStatus, sessionToken);

  const locale = i18n.resolvedLanguage;
  const size = snapshot && new Intl.NumberFormat(locale, {
    style: 'unit', unit: 'megabyte', maximumFractionDigits: 1,
  }).format(snapshot.database_bytes / 1_000_000);
  const checkedAt = snapshot && new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Warsaw',
  }).format(new Date(snapshot.checked_at));

  return (
    <AdminStatusCard icon={Database} title={t('admin.databaseStatus.title')} status={status} onRefresh={refresh}>
      <dl className="admin-status-metrics">
        <div>
          <dt>{t('admin.databaseStatus.connection')}</dt>
          <dd className="admin-status-connection" data-status={status} role="status">{t(`admin.databaseStatus.${status}`)}</dd>
        </div>
        <div>
          <dt>{t('admin.databaseStatus.size')}</dt>
          <dd>{size || '—'}</dd>
        </div>
        <div>
          <dt>{t('admin.databaseStatus.lastChecked')}</dt>
          <dd>{snapshot ? <time dateTime={snapshot.checked_at}>{checkedAt}</time> : '—'}</dd>
        </div>
      </dl>
    </AdminStatusCard>
  );
}
