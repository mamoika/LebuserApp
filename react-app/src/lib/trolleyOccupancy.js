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
      status: 'dirty_in_laundry',
      occupancy_source: 'arrival',
    });
  });

  return occupancy;
}
