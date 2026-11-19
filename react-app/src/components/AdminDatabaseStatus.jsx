import { useTranslation } from 'react-i18next';
import { Database } from 'lucide-react';
import { getAdminDatabaseStatus } from '../lib/adminRpc';
import { useAdminStatus } from '../hooks/useAdminStatus';
import { useDatabaseMetrics } from '../hooks/useDatabaseMetrics';
import AdminStatusCard from './AdminStatusCard';

export default function AdminDatabaseStatus({ sessionToken }) {
  const { t, i18n } = useTranslation();
  const { snapshot, status, refresh } = useAdminStatus(getAdminDatabaseStatus, sessionToken);
  const metrics = useDatabaseMetrics(sessionToken);
  const resources = metrics.snapshot;
  const memory = resources?.memory;

  const locale = i18n.resolvedLanguage;
  const size = snapshot && new Intl.NumberFormat(locale, {
    style: 'unit', unit: 'megabyte', maximumFractionDigits: 1,
  }).format(snapshot.database_bytes / 1_000_000);
  const dateTime = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Warsaw',
  });
  const time = value => <time dateTime={value}>{dateTime.format(new Date(value))}</time>;
  const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 });
  const gigabytes = new Intl.NumberFormat(locale, { style: 'unit', unit: 'gigabyte', maximumFractionDigits: 2 });
  const metricsStatus = metrics.status === 'unavailable' ? 'unavailable' : resources?.status;
  const checking = status === 'checking' || metrics.status === 'checking';

  const refreshAll = () => {
    refresh();
    metrics.refresh();
  };

  return (
    <AdminStatusCard icon={Database} title={t('admin.databaseStatus.title')} status={checking ? 'checking' : status} onRefresh={refreshAll}>
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
          <dd>{snapshot ? time(snapshot.checked_at) : '—'}</dd>
        </div>
      </dl>
      <dl className="admin-status-metrics">
        <div>
          <dt>{t('admin.databaseStatus.ram')}</dt>
          <dd>{memory ? percent.format(memory.used_bytes / memory.total_bytes) : '—'}</dd>
          {memory && <dd className="admin-status-detail">{t('admin.databaseStatus.ramOf', {
            used: gigabytes.format(memory.used_bytes / 1_000_000_000), total: gigabytes.format(memory.total_bytes / 1_000_000_000),
          })}</dd>}
        </div>
        <div>
          <dt>{t('admin.databaseStatus.cpu')}</dt>
          <dd>{metrics.cpuUsage != null ? percent.format(metrics.cpuUsage) : '—'}</dd>
          {resources?.cpu && metrics.cpuUsage == null && <dd className="admin-status-detail">{t('admin.databaseStatus.sampling')}</dd>}
        </div>
      </dl>
      {resources?.checked_at && resources.status === 'available' && (
        <p className="admin-status-detail">{t('admin.databaseStatus.resourcesChecked')} · {time(resources.checked_at)}</p>
      )}
      {(metricsStatus === 'unconfigured' || metricsStatus === 'unavailable') && (
        <p className="admin-status-detail" role="status">{t(`admin.databaseStatus.metrics.${metricsStatus}`)}</p>
      )}
    </AdminStatusCard>
  );
}
