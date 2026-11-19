import { env } from 'node:process';
import { adminStatusError, adminStatusResponse } from '../server/adminStatusSession.js';
import { summarizeDatabaseMetrics } from '../server/supabaseDatabaseMetrics.js';

let recentScrape;

async function scrape(projectRef, token) {
  const url = `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/analytics/endpoints/metrics`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'text/plain' },
    cache: 'no-store', signal: AbortSignal.timeout(6000), redirect: 'error',
  });
  if (!response.ok) throw new Error('Metrics unavailable');

  const { memory, cpu } = summarizeDatabaseMetrics(await response.text(), projectRef);
  return { status: memory || cpu ? 'available' : 'unavailable', memory, cpu, checked_at: new Date().toISOString() };
}

export async function GET(request) {
  const error = await adminStatusError(request);
  if (error) return error;

  const token = env.SUPABASE_METRICS_TOKEN;
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const projectRef = env.SUPABASE_METRICS_PROJECT_REF || url?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/i)?.[1];
  if (!token || !projectRef) return adminStatusResponse({ status: 'unconfigured' });

  if (recentScrape?.projectRef !== projectRef || Date.now() >= recentScrape.expires) {
    const result = scrape(projectRef, token).catch(() => ({ status: 'unavailable' }));
    recentScrape = { projectRef, expires: Date.now() + 55_000, result };
  }
  return adminStatusResponse(await recentScrape.result);
}
