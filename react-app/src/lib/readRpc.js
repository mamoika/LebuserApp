import { supabase } from './supabaseClient';
import { throwRpcError } from './rpcError';

async function callReadRpc(fn, args = {}) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throwRpcError(error, `${fn} failed`);
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function getMonthRoster(sessionToken, year, month, { includeInactive = false } = {}) {
  const data = await callReadRpc('get_month_roster_secure', {
    p_session_token: sessionToken,
    p_year: year,
    p_month: month,
    p_include_inactive: includeInactive,
  });
  return data?.roster || [];
}

export function getWorkScheduleMonth(sessionToken, year, month) {
  return callReadRpc('get_work_schedule_month', {
    p_session_token: sessionToken,
    p_year: year,
    p_month: month,
  });
}

export function getTimelineWeek(sessionToken, dateFrom, dateTo, year, month) {
  return callReadRpc('get_timeline_week', {
    p_session_token: sessionToken,
    p_date_from: dateFrom,
    p_date_to: dateTo,
    p_year: year,
    p_month: month,
  });
}

export function getAdminUsersData(sessionToken) {
  return callReadRpc('get_admin_users_data', {
    p_session_token: sessionToken,
  });
}

export function getAdminSessionOverview(sessionToken) {
  return callReadRpc('admin_get_session_overview', {
    p_session_token: sessionToken,
  });
}

export function getAdminSessionDetails(sessionToken) {
  return callReadRpc('admin_get_session_details', {
    p_session_token: sessionToken,
  });
}

export function getAdminRouteOptions(sessionToken) {
  return callReadRpc('get_admin_route_options', {
    p_session_token: sessionToken,
  });
}

export function getAdminGroups(sessionToken) {
  return callReadRpc('get_admin_groups', {
    p_session_token: sessionToken,
  });
}

export function getAdminGroupEmployeeCount(sessionToken, groupName) {
  return callReadRpc('get_admin_group_employee_count', {
    p_session_token: sessionToken,
    p_group_name: groupName,
  });
}

export function getAdminRoles(sessionToken) {
  return callReadRpc('get_admin_roles', {
    p_session_token: sessionToken,
  });
}

export function getAdminEmployeesData(sessionToken, year, month) {
  return callReadRpc('get_admin_employees_data', {
    p_session_token: sessionToken,
    p_year: year,
    p_month: month,
  });
}

export function getClientUsageStatus(sessionToken, clientName) {
  return callReadRpc('get_client_usage_status', {
    p_session_token: sessionToken,
    p_client_name: clientName,
  });
}

export function getCostsMonth(sessionToken, monthKey) {
  return callReadRpc('get_costs_month', {
    p_session_token: sessionToken,
    p_month_key: monthKey,
  });
}

export function getCostsHistory(sessionToken, year, currentMonthKey) {
  return callReadRpc('get_costs_history', {
    p_session_token: sessionToken,
    p_year: year,
    p_current_month_key: currentMonthKey,
  });
}

export function getPerformanceProgi(sessionToken, monthKey) {
  return callReadRpc('get_performance_progi', {
    p_session_token: sessionToken,
    p_month_key: monthKey,
  });
}

export function getDriverTripsData(sessionToken) {
  return callReadRpc('get_driver_trips_data', {
    p_session_token: sessionToken,
  });
}

export function getDriverAppSettings(sessionToken) {
  return callReadRpc('get_driver_app_settings', {
    p_session_token: sessionToken,
  });
}

export function getBlockingPickedLaundry(sessionToken) {
  return callReadRpc('get_blocking_picked_laundry', {
    p_session_token: sessionToken,
  });
}

export function getTunnelBags(sessionToken) {
  return callReadRpc('get_tunnel_bags', {
    p_session_token: sessionToken,
  });
}
