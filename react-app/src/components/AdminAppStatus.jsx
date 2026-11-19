import { useTranslation } from 'react-i18next';
import { Monitor } from 'lucide-react';
import { useAdminStatus } from '../hooks/useAdminStatus';
import AdminStatusCard from './AdminStatusCard';

const DEPLOYMENT_STATES = {
  READY: 'ready', ERROR: 'error', CANCELED: 'canceled', BLOCKED: 'blocked',
  BUILDING: 'building', INITIALIZING: 'queued', QUEUED: 'queued',
};

async function readAppStatus(sessionToken) {
  const response = await fetch('/api/admin-app-status', {
    headers: { Authorization: `Bearer ${sessionToken}` }, cache: 'no-store',
  });
  if (!response.ok) throw new Error('Unable to read application status');
  return response.json();
}

export default function AdminAppStatus({ sessionToken }) {
  const { t, i18n } = useTranslation();
  const { snapshot, status, refresh } = useAdminStatus(readAppStatus, sessionToken);
  const connection = status === 'available' ? (snapshot.online ? 'online' : 'offline') : status;
  const latest = snapshot?.latest_deployment;
  const production = snapshot?.production;
  const formatTime = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Warsaw',
  });
  const time = value => <time dateTime={value}>{formatTime.format(new Date(value))}</time>;
  const tr = key => t(`admin.appStatus.${key}`);

  return (
    <AdminStatusCard icon={Monitor} title={tr('title')} status={status} onRefresh={refresh}>
      <dl className="admin-status-metrics">
        <div>
          <dt>{tr('site')}</dt>
          <dd className="admin-status-connection" data-status={connection === 'online' ? 'available' : connection === 'offline' ? 'unavailable' : connection} role="status">{tr(connection)}</dd>
        </div>
        <div>
          <dt>{tr('production')}</dt>
          <dd>{production?.version || '—'}</dd>
          {production?.ready_at && <dd className="admin-status-detail">{time(production.ready_at)}</dd>}
        </div>
        <div>
          <dt>{tr('latestDeployment')}</dt>
          <dd>{latest ? tr(DEPLOYMENT_STATES[latest.state] || 'unknown') : '—'}</dd>
          {latest?.created_at && <dd className="admin-status-detail">{time(latest.created_at)}</dd>}
        </div>
      </dl>
      {(snapshot?.metadata_status === 'unconfigured' || snapshot?.metadata_status === 'unavailable') && (
        <p className="admin-status-detail">{tr(snapshot.metadata_status === 'unconfigured' ? 'notConfigured' : 'deploymentUnavailable')}</p>
      )}
      {snapshot?.checked_at && <p className="admin-status-detail">{t('admin.databaseStatus.lastChecked')} · {time(snapshot.checked_at)}</p>}
    </AdminStatusCard>
  );
}
