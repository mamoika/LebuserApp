import { supabase } from './supabaseClient';

export async function logAction({ sessionToken, action, clientName, entryId, details }) {
  try {
    if (!sessionToken) return;
    const { error } = await supabase.rpc('insert_log', {
      p_session_token: sessionToken,
      p_action: action,
      p_client_name: clientName || null,
      p_entry_id: entryId || null,
      p_details: details || null,
    });
    if (error) throw error;
  } catch (e) {
    // logi nie mogą blokować głównej akcji
    console.warn('log failed', e);
  }
}
