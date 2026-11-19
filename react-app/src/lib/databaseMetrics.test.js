import assert from 'node:assert/strict';
import { env } from 'node:process';
import test from 'node:test';
import { GET } from '../../api/admin-database-metrics.js';
import { summarizeDatabaseMetrics } from '../../server/supabaseDatabaseMetrics.js';
import { updateCpuUsage } from './databaseMetrics.js';

const labels = 'service_type="db",supabase_project_ref="projecttest"';
function exposition(idle, user) {
  return [
    '# TYPE node_memory_MemTotal_bytes gauge',
    `node_memory_MemTotal_bytes{${labels}} 4000000000`,
    `node_memory_MemAvailable_bytes{${labels}} 3000000000`,
    `node_cpu_seconds_total{${labels},cpu="0",mode="idle"} ${idle}`,
    `node_cpu_seconds_total{${labels},cpu="0",mode="user"} ${user}`,
    'node_memory_MemAvailable_bytes{service_type="gotrue"} 1',
    'node_memory_MemAvailable_bytes{service_type="db",supabase_project_ref="other"} 1',
  ].join('\n');
}

test('RAM uses available memory and CPU uses differences between usable samples', () => {
  const sample = (idle, user, time) => ({
    ...summarizeDatabaseMetrics(exposition(idle, user), 'projecttest'), checked_at: time,
  });
  const first = sample(500, 100, '2026-11-19T10:00:00Z');
  assert.deepEqual(first.memory, { total_bytes: 4000000000, used_bytes: 1000000000 });
  const baseline = updateCpuUsage(null, first);
  assert.equal(baseline.usage, null);

  const second = sample(545, 115, '2026-11-19T10:01:00Z');
  const next = updateCpuUsage(baseline, second);
  assert.equal(next.usage, 0.25);
  assert.equal(updateCpuUsage(next, { ...second, checked_at: '2026-11-19T10:01:05Z' }), next);
  assert.equal(updateCpuUsage(next, sample(6, 3, '2026-11-19T10:02:00Z')).usage, null);
  assert.equal(updateCpuUsage(next, sample(700, 130, '2026-11-19T10:10:00Z')).usage, null);
});

test('metrics endpoint checks admin privileges before using its server credential', async (t) => {
  Object.assign(env, {
    SUPABASE_URL: 'https://projecttest.supabase.co',
    SUPABASE_ANON_KEY: 'key-test',
    SUPABASE_METRICS_TOKEN: 'metrics-test',
    SUPABASE_METRICS_PROJECT_REF: 'projecttest',
  });
  let role = 'driver';
  const fetchMock = t.mock.method(globalThis, 'fetch', async (input, options) => {
    const url = new URL(input);
    if (url.hostname === 'projecttest.supabase.co') return Response.json([{ id: 'user-test', role }]);
    assert.equal(url.href, 'https://api.supabase.com/v1/projects/projecttest/analytics/endpoints/metrics');
    assert.equal(options.headers.Authorization, 'Bearer metrics-test');
    return new Response(exposition(500, 100));
  });
  const url = 'http://localhost/api/admin-database-metrics';
  const signedIn = () => GET(new Request(url, { headers: { Authorization: 'Bearer session-test' } }));

  assert.equal((await GET(new Request(url))).status, 401);
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.equal((await signedIn()).status, 403);
  assert.equal(fetchMock.mock.callCount(), 1);

  role = 'admin';
  const response = await signedIn();
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  const metrics = await response.json();
  assert.equal(metrics.status, 'available');
  assert.equal(metrics.memory.used_bytes, 1000000000);
  assert.equal(metrics.cpu.idle_seconds, 500);
  assert.equal(fetchMock.mock.callCount(), 3);
  assert.deepEqual(await (await signedIn()).json(), metrics);
  assert.equal(fetchMock.mock.callCount(), 4);

  delete env.SUPABASE_METRICS_TOKEN;
  assert.deepEqual(await (await signedIn()).json(), { status: 'unconfigured' });
});
