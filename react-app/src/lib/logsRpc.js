import { supabase } from './supabaseClient';
import { throwRpcError } from './rpcError';

async function callLogsRpc(sessionToken, fn, args = {}) {
  const { data, error } = await supabase.rpc(fn, {
    p_session_token: sessionToken,
    ...args,
  });
  if (error) throwRpcError(error, `${fn} failed`);
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function getLogsPage(sessionToken, { limit, offset }) {
  return callLogsRpc(sessionToken, 'get_logs_page', {
    p_limit: limit,
    p_offset: offset,
  });
}

export async function getEntryLogs(sessionToken, entryId) {
  return callLogsRpc(sessionToken, 'get_entry_logs', {
    p_entry_id: entryId,
  });
}
