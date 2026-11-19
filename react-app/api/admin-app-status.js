import { env } from 'node:process';

const headers = { 'Cache-Control': 'private, no-store' };

async function requireAdmin(sessionToken) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase configuration');

  const response = await fetch(new URL('/rest/v1/rpc/session_user', url), {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_session_token: sessionToken }),
    signal: AbortSignal.timeout(4000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error('Unable to verify session');
  const data = await response.json();
  const user = Array.isArray(data) ? data[0] : data;
  if (!user?.id) return 401;
  return user.role === 'admin' ? 200 : 403;
}

async function checkProduction(host, signal) {
  try {
    const response = await fetch(`https://${host}/`, { method: 'HEAD', cache: 'no-store', signal });
    return response.ok;
  } catch {
    return false;
  }
}

function deploymentTime(value) {
  const date = new Date(Number(value));
  return value > 0 && Number.isFinite(date.valueOf()) ? date.toISOString() : null;
}

async function readDeployments(host, signal) {
  const token = env.VERCEL_APP_STATUS_TOKEN;
  if (!token) return { metadata_status: 'unconfigured' };

  const read = async (path, params = {}) => {
    const url = new URL(path, 'https://api.vercel.com');
    url.search = new URLSearchParams(params);
    if (env.VERCEL_APP_STATUS_TEAM_ID) url.searchParams.set('teamId', env.VERCEL_APP_STATUS_TEAM_ID);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal, redirect: 'error',
    });
    if (!response.ok) throw new Error('Vercel status unavailable');
    return response.json();
  };

  const active = await read(`/v13/deployments/${encodeURIComponent(host)}`);
  const projectId = active.projectId || active.project?.id;
  if (!active.id || !projectId) throw new Error('Vercel deployment not found');
  const sha = active.gitSource?.sha || active.meta?.githubCommitSha;
  const version = /^[a-f0-9]{7,64}$/i.test(sha || '') ? sha.slice(0, 7) : active.id.slice(0, 12);
  const production = { version, ready_at: deploymentTime(active.ready || active.createdAt) };

  try {
    const { deployments } = await read('/v7/deployments', { projectId, target: 'production', limit: '1' });
    const latest = deployments?.[0];
    return {
      metadata_status: 'available', production,
      latest_deployment: latest ? { state: latest.readyState || latest.state, created_at: deploymentTime(latest.createdAt || latest.created) } : null,
    };
  } catch {
    return { metadata_status: 'unavailable', production };
  }
}

export async function GET(request) {
  const sessionToken = request.headers.get('Authorization')?.match(/^Bearer (\S{1,512})$/i)?.[1];
  if (!sessionToken) return Response.json(null, { status: 401, headers });

  try {
    const status = await requireAdmin(sessionToken);
    if (status !== 200) return Response.json(null, { status, headers });
  } catch {
    return Response.json(null, { status: 503, headers });
  }

  const host = env.VERCEL_PROJECT_PRODUCTION_URL || 'lebuser.vercel.app';
  const signal = AbortSignal.timeout(6000);
  const [online, deployments] = await Promise.all([
    checkProduction(host, signal),
    readDeployments(host, signal).catch(() => ({ metadata_status: 'unavailable' })),
  ]);
  return Response.json({ online, checked_at: new Date().toISOString(), ...deployments }, { headers });
}
