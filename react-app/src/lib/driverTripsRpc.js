import { supabase } from './supabaseClient';

export async function getScheduleDriverTrips(sessionToken, { limit = 120 } = {}) {
  const { data, error } = await supabase.rpc('get_schedule_driver_trips', {
    p_session_token: sessionToken,
    p_limit: limit,
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data?.trips || [];
}
