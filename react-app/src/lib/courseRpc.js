import { supabase } from './supabaseClient';
import { throwRpcError } from './rpcError';

async function callCourseRpc(fn, sessionToken, args = {}) {
  const { data, error } = await supabase.rpc(fn, {
    p_session_token: sessionToken,
    ...args,
  });
  if (error) throwRpcError(error, `${fn} failed`);
  if (data?.error) throw new Error(data.error);
  return data;
}

export const getDispatchBoard = (sessionToken, tripDate) => callCourseRpc(
  'get_dispatch_board', sessionToken, { p_trip_date: tripDate }
);

export const getTripJournal = (sessionToken, tripId) => callCourseRpc(
  'get_trip_journal', sessionToken, { p_trip_id: tripId }
);

export const getDriverCourse = sessionToken => callCourseRpc('get_driver_course', sessionToken);

export const getTripCourse = (sessionToken, tripId) => callCourseRpc(
  'get_trip_course', sessionToken, { p_trip_id: tripId }
);

export const setCourseStage = (sessionToken, tripId, stage) => callCourseRpc(
  'admin_set_course_stage', sessionToken, { p_trip_id: tripId, p_stage: stage }
);

export const approveCourseKm = (sessionToken, tripId, endKm, writeCosts = true) => callCourseRpc(
  'admin_approve_course_km', sessionToken,
  { p_trip_id: tripId, p_end_km: endKm, p_write_costs: writeCosts }
);

export const completeCourseStop = (sessionToken, stopId) => callCourseRpc(
  'driver_complete_trip_stop', sessionToken, { p_stop_id: stopId }
);

export const reportCourseProblem = (sessionToken, tripId, stopId, problemType, details) => callCourseRpc(
  'driver_report_trip_problem', sessionToken,
  { p_trip_id: tripId, p_stop_id: stopId, p_problem_type: problemType, p_details: details }
);

export const changeCourseVehicle = (sessionToken, tripId, car, endKm = null) => callCourseRpc(
  'driver_change_course_vehicle', sessionToken,
  { p_trip_id: tripId, p_car: car, p_end_km: endKm }
);

export const callExistingTripRpc = (fn, sessionToken, args = {}) => callCourseRpc(fn, sessionToken, args);
