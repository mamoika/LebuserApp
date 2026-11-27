function trolleyKey(value) {
  return String(value || '').trim().toLowerCase();
}

function isPhysicalTrolley(value) {
  const key = trolleyKey(value);
  return Boolean(key && key !== 'brak');
}

export function activePhysicalTrolleyCycles(trolleys = []) {
  return trolleys.filter(cycle => (
    isPhysicalTrolley(cycle?.trolley_no)
    && !cycle?.returned_at
    && !['returned', 'canceled'].includes(cycle?.status)
  ));
}

export function buildTrolleyOccupancy(trolleys = [], arrivalReservations = []) {
  const occupancy = new Map();

  activePhysicalTrolleyCycles(trolleys).forEach(cycle => {
    occupancy.set(trolleyKey(cycle.trolley_no), {
      ...cycle,
      occupancy_source: 'cycle',
    });
  });

  arrivalReservations.forEach(reservation => {
    const key = trolleyKey(reservation?.trolley_no);
    if (!isPhysicalTrolley(key)) return;

    const current = occupancy.get(key);
    if (current?.occupancy_source === 'cycle') {
      occupancy.set(key, {
        ...current,
        occupancy_conflict: true,
        arrival_reservations: [
          ...(current.arrival_reservations || []),
          reservation,
        ],
      });
      return;
    }

    if (current?.occupancy_source === 'arrival') {
      const entryIds = new Set(current.entry_ids || []);
      if (reservation.entry_id) entryIds.add(reservation.entry_id);
      occupancy.set(key, {
        ...current,
        entry_ids: [...entryIds],
      });
      return;
    }

    occupancy.set(key, {
      trolley_no: String(reservation.trolley_no).trim(),
      client_name: reservation.client_name,
      entry_ids: reservation.entry_id ? [reservation.entry_id] : [],
      status: reservation.dirty_received_at ? 'dirty_in_laundry' : 'returning_to_laundry',
      dirty_received_at: reservation.dirty_received_at || null,
      occupancy_source: 'arrival',
    });
  });

  return occupancy;
}

export function canUseFreeTrolley(trolleyNo, occupied, inventory) {
  if (occupied) return false;
  if (inventory?.packing_holds) return !inventory.packing_holds.includes(trolleyNo);
  if (!inventory?.trolley_nos.includes(trolleyNo)) return true;
  const check = inventory.checks[trolleyNo];
  return Boolean(check && (check.movement_since_check || check.status === 'free_at_laundry'));
}

export const TROLLEY_INVENTORY_LABELS = {
  free_at_laundry: 'free',
  at_client: 'left',
  in_use: 'inUse',
  dirty_at_laundry: 'dirtyAtLaundry',
};

export function hasTrolleyPresenceConflict(occupied, observation) {
  return observation?.status === 'present' && !observation.movement_since_check && Boolean(
    occupied?.occupancy_conflict || occupied?.status === 'at_client'
    || occupied?.status === 'returning_to_laundry' || occupied?.status === 'released' || occupied?.released_at
  );
}

export function trolleyInventoryRoundStatus(trolleyNo, occupied, inventory) {
  const observation = inventory.observations[trolleyNo];
  if (hasTrolleyPresenceConflict(occupied, observation)) return 'conflict';
  if (observation) return observation.status;
  return inventory.expected_trolley_nos.includes(trolleyNo) ? 'review' : 'outside';
}

export function trolleyInventoryFoundCount(inventory) {
  return Object.values(inventory?.observations || {}).filter(observation => observation.status === 'present').length;
}

export function trolleyFleetStatus(trolleyNo, occupied, inventory) {
  const recorded = !occupied ? 'free'
    : occupied.occupancy_source === 'arrival' ? 'dirty'
    : occupied.status === 'at_client' ? 'atClient' : 'inUse';

  if (inventory?.packing_holds) {
    const observation = inventory.observations[trolleyNo];
    const status = hasTrolleyPresenceConflict(occupied, observation) ? 'conflict'
      : !occupied && inventory.packing_holds.includes(trolleyNo) ? 'missing'
      : recorded;
    return { status, recorded, observation };
  }

  if (!inventory?.trolley_nos.includes(trolleyNo)) return { status: recorded, recorded };

  const check = inventory.checks[trolleyNo];
  if (!check) return { status: 'review', recorded };
  if (check.movement_since_check) return { status: recorded, recorded, check };

  const observed = {
    free_at_laundry: 'free',
    at_client: 'atClient',
    in_use: 'inUse',
    dirty_at_laundry: 'dirty',
  }[check.status];
  const conflict = occupied && (
    occupied.occupancy_conflict || recorded !== observed
    || (observed === 'atClient' && occupied.client_name !== check.client_name)
    || (observed === 'dirty' && occupied.status === 'returning_to_laundry')
  );
  return { status: conflict ? 'conflict' : observed, recorded, check };
}
