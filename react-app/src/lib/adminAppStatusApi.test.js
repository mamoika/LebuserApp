import assert from 'node:assert/strict';
import { env } from 'node:process';
import test from 'node:test';
import { GET } from '../../api/admin-app-status.js';

test('application status checks admin access and keeps production separate from deployment failures', async (t) => {
  Object.assign(env, {
    SUPABASE_URL: 'https://supabase.example',
    SUPABASE_ANON_KEY: 'supabase-test-key',
    VERCEL_APP_STATUS_TOKEN: 'vercel-test-key',
    VERCEL_APP_STATUS_TEAM_ID: 'team_test',
    VERCEL_PROJECT_PRODUCTION_URL: 'lebuser.vercel.app',
  });

  let role = 'admin_viewer_driver';
  let historyStatus = 200;
  const upstream = t.mock.method(globalThis, 'fetch', async (request, options) => {
    const url = new URL(request);
    if (url.hostname === 'supabase.example') {
      assert.equal(options.headers.Authorization, 'Bearer supabase-test-key');
      assert.deepEqual(JSON.parse(options.body), { p_session_token: 'session-test' });
      return Response.json([{ id: 'user-test', role }]);
    }
    if (url.hostname === 'lebuser.vercel.app') {
      assert.equal(options.method, 'HEAD');
      assert.equal(options.headers, undefined);
      return new Response();
    }
    assert.equal(url.hostname, 'api.vercel.com');
    assert.equal(options.headers.Authorization, 'Bearer vercel-test-key');
    assert.equal(url.searchParams.get('teamId'), 'team_test');
    if (url.pathname === '/v13/deployments/lebuser.vercel.app') {
      return Response.json({
        id: 'dpl_active', project: { id: 'prj_test' },
        ready: Date.parse('2026-11-19T09:00:00Z'), meta: { githubCommitSha: 'abcdef123456789' },
      });
    }
    assert.equal(url.pathname, '/v7/deployments');
    assert.equal(url.searchParams.get('target'), 'production');
    assert.equal(url.searchParams.get('projectId'), 'prj_test');
    return Response.json({ deployments: [{ state: 'ERROR', created: Date.parse('2026-11-19T10:00:00Z') }] }, { status: historyStatus });
  });

  const url = 'http://localhost/api/admin-app-status';
  const signedIn = () => GET(new Request(url, { headers: { Authorization: 'Bearer session-test' } }));
  assert.equal((await GET(new Request(url))).status, 401);
  assert.equal(upstream.mock.callCount(), 0);
  assert.equal((await signedIn()).status, 403);
  assert.equal(upstream.mock.callCount(), 1);

  role = 'admin';
  const response = await signedIn();
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  const result = await response.json();
  assert.equal(result.online, true);
  assert.deepEqual(result.production, { version: 'abcdef1', ready_at: '2026-11-19T09:00:00.000Z' });
  assert.deepEqual(result.latest_deployment, { state: 'ERROR', created_at: '2026-11-19T10:00:00.000Z' });

  historyStatus = 503;
  const partial = await (await signedIn()).json();
  assert.deepEqual(partial.production, result.production);
  assert.equal(partial.metadata_status, 'unavailable');

  delete env.VERCEL_APP_STATUS_TOKEN;
  const unconfigured = await (await signedIn()).json();
  assert.equal(unconfigured.online, true);
  assert.equal(unconfigured.metadata_status, 'unconfigured');
  assert.equal(unconfigured.production, undefined);
});
