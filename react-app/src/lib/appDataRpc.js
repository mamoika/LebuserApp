import { supabase } from './supabaseClient';
import { throwRpcError } from './rpcError';

export async function getAppData(sessionToken, lastWeekKey) {
  const { data, error } = await supabase.rpc('get_app_data', {
    p_session_token: sessionToken,
    p_last_week_key: lastWeekKey,
  });
  if (error) throwRpcError(error, 'get_app_data failed');
  if (data?.error) throw new Error(data.error);
  return data;
}
