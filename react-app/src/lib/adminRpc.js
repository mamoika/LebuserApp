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

export function linkUserEmployee(sessionToken, userId, employeeId) {
  return callAdminRpc(sessionToken, 'admin_link_user_employee', {
    p_user_id: userId,
    p_employee_id: employeeId || null,
  });
}

export function updateAdminUserProfile(sessionToken, userId, name, role, routes, employeeId, car) {
  return callAdminRpc(sessionToken, 'admin_update_user_profile', {
    p_user_id: userId,
    p_name: name,
    p_role: role,
    p_routes: routes,
    p_employee_id: employeeId || null,
    p_car: car || null,
  });
}

export function approveWorkTime(sessionToken, reportId, workStart, workEnd) {
  return callAdminRpc(sessionToken, 'admin_approve_work_time', {
    p_report_id: reportId,
    p_work_start: workStart,
    p_work_end: workEnd,
  });
}

export function rejectWorkTime(sessionToken, reportId, note) {
  return callAdminRpc(sessionToken, 'admin_reject_work_time', {
    p_report_id: reportId,
    p_note: note || null,
  });
}
