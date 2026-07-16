import { supabase } from './supabaseClient';
import { throwRpcError } from './rpcError';

export async function getWorkforceFloorPlan(sessionToken) {
  const { data, error } = await supabase.rpc('get_workforce_floor_plan', {
    p_session_token: sessionToken,
  });
  if (error) throwRpcError(error, 'get_workforce_floor_plan failed');
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function saveWorkforceFloorPlan(sessionToken, plan, expectedUpdatedAt = null) {
  const { data, error } = await supabase.rpc('admin_save_workforce_floor_plan', {
    p_session_token: sessionToken,
    p_plan: plan,
    p_expected_updated_at: expectedUpdatedAt,
  });
  if (error) throwRpcError(error, 'admin_save_workforce_floor_plan failed');
  if (data?.error) throw new Error(data.error);
  return data;
}
