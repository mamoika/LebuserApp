import { supabase } from './supabaseClient';

export async function getAppData(sessionToken, lastWeekKey) {
  const { data, error } = await supabase.rpc('get_app_data', {
    p_session_token: sessionToken,
    p_last_week_key: lastWeekKey,
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}
