import { supabase } from './supabaseClient';
import { throwRpcError } from './rpcError';

export async function callAdminRpc(sessionToken, fn, args = {}) {
  const { data, error } = await supabase.rpc(fn, {
    p_session_token: sessionToken,
    ...args,
  });
  if (error) throwRpcError(error, `${fn} failed`);
  if (data?.error) throw new Error(data.error);
  return data;
}

export function upsertAppSetting(sessionToken, key, value) {
  return callAdminRpc(sessionToken, 'admin_upsert_app_setting', {
    p_key: key,
    p_value: value,
  });
}

export function upsertCostSettings(sessionToken, settings) {
  return callAdminRpc(sessionToken, 'admin_upsert_cost_settings', {
    p_settings: settings,
  });
}

export function upsertDailyCosts(sessionToken, rows) {
  return callAdminRpc(sessionToken, 'admin_upsert_daily_costs', {
    p_rows: rows,
  });
}

export function pruneUserSessions(sessionToken, keepActive = 10) {
  return callAdminRpc(sessionToken, 'admin_prune_user_sessions', {
    p_keep_active: keepActive,
  });
}

export function revokeUserSession(sessionToken, sessionId) {
  return callAdminRpc(sessionToken, 'admin_revoke_user_session', {
    p_user_session_id: sessionId,
  });
}
