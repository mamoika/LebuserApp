import { supabase } from './supabaseClient';
import { throwRpcError } from './rpcError';

export async function getWorkforcePlan(sessionToken, workDate) {
  const { data, error } = await supabase.rpc('get_workforce_plan', {
    p_session_token: sessionToken,
    p_work_date: workDate,
  });
  if (error) throwRpcError(error, 'get_workforce_plan failed');
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function saveWorkforcePlan(sessionToken, workDate, plan, expectedUpdatedAt = null) {
  const { data, error } = await supabase.rpc('admin_save_workforce_plan', {
    p_session_token: sessionToken,
    p_work_date: workDate,
    p_plan: plan,
    p_expected_updated_at: expectedUpdatedAt,
  });
  if (error) throwRpcError(error, 'admin_save_workforce_plan failed');
  if (data?.error) throw new Error(data.error);
  return data;
}
