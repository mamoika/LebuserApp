import { supabase } from './supabaseClient';
import { throwRpcError } from './rpcError';

async function callLaundryRpc(fn, args = {}) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throwRpcError(error, `${fn} failed`);
  if (data?.error) throw new Error(data.error);
  return data;
}

export function getLaundryWorkflow(sessionToken) {
  return callLaundryRpc('get_laundry_workflow', {
    p_session_token: sessionToken,
  });
}

export function markLaundryWashed(sessionToken, ids, by) {
  return callLaundryRpc('admin_mark_laundry_washed', {
    p_session_token: sessionToken,
    p_ids: ids,
    p_by: by || null,
  });
}

export function packLaundryTrolley(sessionToken, ids, trolleyNo, kg, by) {
  return callLaundryRpc('admin_pack_laundry_trolley', {
    p_session_token: sessionToken,
    p_ids: ids,
    p_trolley_no: trolleyNo,
    p_kg: kg,
    p_by: by || null,
  });
}

export function returnLaundryTrolley(sessionToken, cycleId, by) {
  return callLaundryRpc('admin_return_laundry_trolley', {
    p_session_token: sessionToken,
    p_cycle_id: cycleId,
    p_by: by || null,
  });
}
