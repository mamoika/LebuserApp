import { supabase } from './supabaseClient';
import { throwRpcError } from './rpcError';

const LAUNDRY_ACTION_ERRORS = {
  delivery_trolley_state_changed: 'course.currentStop.trolleyStateChanged',
  pickup_trolley_reused: 'course.currentStop.pickupTrolleyReused',
  packing_batch_changed: 'wash.messages.packingBatchChanged',
  trolley_inventory_unavailable: 'wash.fleet.inventory.packingBlocked',
};

export function laundryActionErrorMessage(error, t) {
  const key = Object.hasOwn(LAUNDRY_ACTION_ERRORS, error?.message) && LAUNDRY_ACTION_ERRORS[error.message];
  return key ? t(key) : error?.message;
}

async function callLaundryRpc(fn, args = {}) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throwRpcError(error, `${fn} failed`);
  if (data?.error) {
    const rpcError = new Error(data.error);
    rpcError.code = data.error_code || data.error;
    throw rpcError;
  }
  return data;
}

export async function getLaundryWorkflow(sessionToken) {
  try {
    return await callLaundryRpc('get_laundry_workflow_with_inventory', {
      p_session_token: sessionToken,
    });
  } catch (error) {
    if (error.code !== 'PGRST202') throw error;
  }
  return callLaundryRpc('get_laundry_workflow', {
    p_session_token: sessionToken,
  });
}

export function startTrolleyInventory(sessionToken, previousInventoryId) {
  return callLaundryRpc('admin_start_trolley_inventory', {
    p_session_token: sessionToken,
    p_previous_inventory_id: previousInventoryId ?? null,
  });
}

export function verifyTrolleyInventory(sessionToken, inventoryId, trolleyNo, status, clientId) {
  return callLaundryRpc('admin_verify_trolley_inventory', {
    p_session_token: sessionToken,
    p_inventory_id: inventoryId,
    p_trolley_no: trolleyNo,
    p_status: status,
    p_client_id: clientId || null,
  });
}

export function getLaundryHistory(sessionToken, { from, to, client, before }) {
  return callLaundryRpc('get_laundry_history', {
    p_session_token: sessionToken,
    p_from: from,
    p_to: to,
    p_client: client,
    p_before: before,
  });
}

export function getArrivalTrolleyReservations(sessionToken, arrivalDate) {
  return callLaundryRpc('get_arrival_trolley_reservations', {
    p_session_token: sessionToken,
    p_arrival_date: arrivalDate,
  });
}

export function getTrolleyHistory(sessionToken, trolleyNo, limit = 200) {
  return callLaundryRpc('get_trolley_history', {
    p_session_token: sessionToken,
    p_trolley_no: String(trolleyNo),
    p_limit: limit,
  });
}

export function forceReleaseTrolley(sessionToken, trolleyNo, action, by) {
  return callLaundryRpc('admin_force_release_trolley', {
    p_session_token: sessionToken,
    p_trolley_no: String(trolleyNo),
    p_action: action,
    p_by: by || null,
  });
}

export function assignTrolleyToClient(sessionToken, trolleyNo, clientId, by) {
  return callLaundryRpc('admin_assign_trolley_to_client', {
    p_session_token: sessionToken,
    p_trolley_no: String(trolleyNo),
    p_client_id: clientId,
    p_by: by || null,
  });
}

export function markLaundryWashed(sessionToken, ids, by) {
  return callLaundryRpc('admin_mark_laundry_washed', {
    p_session_token: sessionToken,
    p_ids: ids,
    p_by: by || null,
  });
}

export function unmarkLaundryWashed(sessionToken, ids, by) {
  return callLaundryRpc('admin_unmark_laundry_washed', {
    p_session_token: sessionToken,
    p_ids: ids,
    p_by: by || null,
  });
}

export function saveLaundryTrolleys(sessionToken, ids, trolleyNos, finish, appendToReady) {
  return callLaundryRpc('admin_save_laundry_trolleys', {
    p_session_token: sessionToken,
    p_ids: ids,
    p_trolley_nos: trolleyNos,
    p_finish: finish,
    p_append_to_ready: appendToReady,
  });
}

export function finishLaundryPacking(sessionToken, ids, by) {
  return callLaundryRpc('admin_finish_laundry_packing', {
    p_session_token: sessionToken,
    p_ids: ids,
    p_by: by || null,
  });
}

// Poprawia kg na już spakowanym wózku/cyklu — gdy waga nie była znana przy pakowaniu
// (np. kierowca zgłosił ją dopiero po dostawie).
export function updateLaundryTrolleyKg(sessionToken, cycleId, kg, by) {
  return callLaundryRpc('admin_update_laundry_trolley_kg', {
    p_session_token: sessionToken,
    p_cycle_id: cycleId,
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

export function cancelLaundryTrolley(sessionToken, cycleId, by) {
  return callLaundryRpc('admin_cancel_laundry_trolley', {
    p_session_token: sessionToken,
    p_cycle_id: cycleId,
    p_by: by || null,
  });
}

export function undoReturnLaundryTrolley(sessionToken, cycleId, by) {
  return callLaundryRpc('admin_undo_return_laundry_trolley', {
    p_session_token: sessionToken,
    p_cycle_id: cycleId,
    p_by: by || null,
  });
}

export function deleteLaundryTrolley(sessionToken, cycleId, force = false) {
  return callLaundryRpc('admin_delete_laundry_trolley', {
    p_session_token: sessionToken,
    p_cycle_id: cycleId,
    p_force: force,
  });
}

export function setTrolleyAtClient(sessionToken, cycleId) {
  return callLaundryRpc('admin_set_trolley_at_client', {
    p_session_token: sessionToken,
    p_cycle_id: cycleId,
  });
}
