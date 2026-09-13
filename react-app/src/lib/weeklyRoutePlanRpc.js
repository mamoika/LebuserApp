import { supabase } from './supabaseClient';
import { throwRpcError } from './rpcError';

async function call(fn, sessionToken, args = {}) {
  const { data, error } = await supabase.rpc(fn, {
    p_session_token: sessionToken,
    ...args,
  });
  if (error) throwRpcError(error, `${fn} failed`);
  if (data?.error) throw new Error(data.error);
  return data;
}

export const getWeeklyRoutePlan = (sessionToken, weekStart) => call(
  'get_weekly_route_plan', sessionToken, { p_week_start: weekStart },
);

export const getWeeklyRoutePlanVisibility = sessionToken => call(
  'get_weekly_route_plan_visibility', sessionToken,
);

export const saveWeeklyRoutePlanVisibility = (
  sessionToken,
  hiddenRouteIds,
  expectedUpdatedAt,
) => call('admin_save_weekly_route_plan_visibility', sessionToken, {
  p_hidden_route_ids: hiddenRouteIds,
  p_expected_updated_at: expectedUpdatedAt || null,
});

export const saveWeeklyRouteAssignment = (sessionToken, assignment) => call(
  'admin_upsert_weekly_route_assignment', sessionToken, {
    p_route_id: assignment.routeId,
    p_trip_date: assignment.tripDate,
    p_driver_id: assignment.driverId,
    p_car: assignment.car || null,
    p_planned_start: assignment.plannedStart || null,
  },
);

export const removeWeeklyRouteAssignment = (sessionToken, routeId, tripDate) => call(
  'admin_remove_weekly_route_assignment', sessionToken,
  { p_route_id: routeId, p_trip_date: tripDate },
);

export const publishWeeklyRoutePlan = (sessionToken, weekStart) => call(
  'admin_publish_weekly_route_plan', sessionToken, { p_week_start: weekStart },
);

export const copyWeeklyRoutePlan = (sessionToken, sourceWeekStart, targetWeekStart) => call(
  'admin_copy_weekly_route_plan', sessionToken,
  { p_source_week_start: sourceWeekStart, p_target_week_start: targetWeekStart },
);
