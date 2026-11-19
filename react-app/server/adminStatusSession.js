import { env } from 'node:process';

const privateHeaders = { 'Cache-Control': 'private, no-store' };

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

export function adminStatusResponse(value, status = 200) {
  return Response.json(value, { status, headers: privateHeaders });
}

export async function adminStatusError(request) {
  const sessionToken = request.headers.get('Authorization')?.match(/^Bearer (\S{1,512})$/i)?.[1];
  if (!sessionToken) return adminStatusResponse(null, 401);

  try {
    const status = await requireAdmin(sessionToken);
    if (status !== 200) return adminStatusResponse(null, status);
  } catch {
    return adminStatusResponse(null, 503);
  }
  return null;
}
