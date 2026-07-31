import { supabase } from './supabaseClient';
import { throwRpcError } from './rpcError';

async function callWarehouseRpc(fn, args = {}) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throwRpcError(error, `${fn} failed`);
  if (data?.error) throw new Error(data.error);
  return data;
}

export function getWarehouseInventory(sessionToken) {
  return callWarehouseRpc('get_warehouse_inventory', {
    p_session_token: sessionToken,
  });
}

export function addWarehouseCarton(sessionToken, zone, name) {
  return callWarehouseRpc('admin_add_warehouse_carton', {
    p_session_token: sessionToken,
    p_zone: zone,
    p_name: name || null,
  });
}

export function saveWarehouseItem(sessionToken, item) {
  return callWarehouseRpc('admin_save_warehouse_item', {
    p_session_token: sessionToken,
    p_item_id: item.id || null,
    p_name: item.name,
    p_variant: item.variant || null,
    p_category: item.category || null,
  });
}

export function archiveWarehouseItem(sessionToken, itemId) {
  return callWarehouseRpc('admin_archive_warehouse_item', {
    p_session_token: sessionToken,
    p_item_id: itemId,
  });
}

export function recordWarehouseMovement(sessionToken, movement, requestId = crypto.randomUUID()) {
  return callWarehouseRpc('admin_record_warehouse_client_movement', {
    p_session_token: sessionToken,
    p_request_id: requestId,
    p_movement_type: movement.type,
    p_client_id: movement.clientId,
    p_source_location_id: movement.sourceLocationId || null,
    p_destination_location_id: movement.destinationLocationId || null,
    p_lines: movement.lines,
    p_note: movement.note || null,
  });
}

export function setWarehouseStock(sessionToken, locationId, counts, note, requestId = crypto.randomUUID()) {
  return callWarehouseRpc('admin_set_warehouse_stock', {
    p_session_token: sessionToken,
    p_request_id: requestId,
    p_location_id: locationId,
    p_counts: counts,
    p_note: note || null,
  });
}
