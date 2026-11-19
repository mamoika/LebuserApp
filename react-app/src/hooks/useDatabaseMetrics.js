import { useEffect, useState } from 'react';
import { updateCpuUsage } from '../lib/databaseMetrics';
import { useAdminStatus } from './useAdminStatus';

async function readDatabaseMetrics(sessionToken) {
  const response = await fetch('/api/admin-database-metrics', {
    headers: { Authorization: `Bearer ${sessionToken}` }, cache: 'no-store',
  });
  if (!response.ok) throw new Error('Unable to read database metrics');
  return response.json();
}

export function useDatabaseMetrics(sessionToken) {
  const metrics = useAdminStatus(readDatabaseMetrics, sessionToken);
  const { snapshot, refresh } = metrics;
  const configured = snapshot?.status !== 'unconfigured';
  const [cpu, setCpu] = useState(null);

  useEffect(() => {
    setCpu(previous => updateCpuUsage(previous, snapshot));
  }, [snapshot]);

  useEffect(() => {
    if (!configured) return undefined;
    const id = window.setInterval(() => {
      if (!document.hidden) refresh();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [configured, refresh]);

  return { ...metrics, cpuUsage: snapshot?.cpu ? cpu?.usage : null };
}
