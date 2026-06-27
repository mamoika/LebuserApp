import { supabase } from './supabaseClient';

export async function getHistoryEntries(sessionToken, { limit = 1500 } = {}) {
  const { data, error } = await supabase.rpc('get_history_entries', {
    p_session_token: sessionToken,
    p_limit: limit,
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data?.entries || [];
}
