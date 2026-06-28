import { supabase } from './supabaseClient';
import { throwRpcError } from './rpcError';

export async function getScheduleDriverTrips(sessionToken, { limit = 120 } = {}) {
  const { data, error } = await supabase.rpc('get_schedule_driver_trips', {
    p_session_token: sessionToken,
    p_limit: limit,
  });
  if (error) throwRpcError(error, 'get_schedule_driver_trips failed');
  if (data?.error) throw new Error(data.error);
  return data?.trips || [];
}
