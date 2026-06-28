import { supabase } from './supabaseClient';
import { throwRpcError } from './rpcError';

export async function getHistoryEntries(sessionToken, { limit = 1500 } = {}) {
  const { data, error } = await supabase.rpc('get_history_entries', {
    p_session_token: sessionToken,
    p_limit: limit,
  });
  if (error) throwRpcError(error, 'get_history_entries failed');
  if (data?.error) throw new Error(data.error);
  return data?.entries || [];
}
