import { supabase } from './supabaseClient';

export async function logAction({
  sessionToken,
  action,
  clientName,
  entryId,
  details,
  category,
  entityType,
  entityId,
  metadata,
}) {
  try {
    if (!sessionToken) return;
    const { error } = await supabase.rpc('insert_log', {
      p_session_token: sessionToken,
      p_action: action,
      p_client_name: clientName || null,
      p_entry_id: entryId || null,
      p_details: details || null,
      p_category: category || null,
      p_entity_type: entityType || null,
      p_entity_id: entityId || null,
      p_metadata: metadata || null,
    });
    if (error) throw error;
  } catch (e) {
    // logi nie mogą blokować głównej akcji
    console.warn('log failed', e);
  }
}
