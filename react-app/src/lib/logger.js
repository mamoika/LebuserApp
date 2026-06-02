import { supabase } from './supabaseClient';

export async function logAction({ userName, action, clientName, entryId, details }) {
  try {
    await supabase.from('logs').insert({
      user_name: userName,
      action,
      client_name: clientName || null,
      entry_id: entryId || null,
      details: details || null,
    });
  } catch (e) {
    // logi nie mogą blokować głównej akcji
    console.warn('log failed', e);
  }
}
