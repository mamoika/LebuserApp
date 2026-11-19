import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Database, RefreshCw } from 'lucide-react';
import { getAdminDatabaseStatus } from '../lib/adminRpc';

export default function AdminDatabaseStatus({ sessionToken }) {
  const { t, i18n } = useTranslation();
  const [snapshot, setSnapshot] = useState(null);
  const [status, setStatus] = useState('checking');
  const request = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++request.current;
    setStatus('checking');
    try {
      const data = await getAdminDatabaseStatus(sessionToken);
      if (request.current !== id) return;
      setSnapshot(data);
      setStatus('available');
    } catch {
      if (request.current === id) setStatus('unavailable');
    }
  }, [sessionToken]);

  useEffect(() => {
    refresh();
    return () => { request.current += 1; };
  }, [refresh]);

  const locale = i18n.resolvedLanguage;
  const size = snapshot && new Intl.NumberFormat(locale, {
    style: 'unit', unit: 'megabyte', maximumFractionDigits: 1,
  }).format(snapshot.database_bytes / 1_000_000);
  const checkedAt = snapshot && new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Warsaw',
  }).format(new Date(snapshot.checked_at));

  return (
    <section className="admin-database-status" aria-labelledby="admin-database-status-title">
      <header className="admin-database-heading">
        <span className="admin-database-icon"><Database size={20} aria-hidden="true" /></span>
        <h2 id="admin-database-status-title">{t('admin.databaseStatus.title')}</h2>
        <button className="admin-apple-refresh-btn admin-database-refresh" type="button" onClick={refresh} disabled={status === 'checking'}>
          <RefreshCw size={14} className={status === 'checking' ? 'spin' : ''} aria-hidden="true" />
          {t('common.refresh')}
        </button>
      </header>
      <dl className="admin-database-metrics">
        <div>
          <dt>{t('admin.databaseStatus.connection')}</dt>
          <dd className="admin-database-connection" data-status={status} role="status">{t(`admin.databaseStatus.${status}`)}</dd>
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
    </section>
  );
}
