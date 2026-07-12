import { parseExtraClients, parseRouteIds, pickupDateStr, arrivalDateStr } from './tripUiHelpers';

export function entryIdsForTasks(tasks = []) {
  return [...new Set(tasks.map(task => task.entry_id).filter(Boolean))];
}

export function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}

export function fmtDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function sumTaskWeight(tasks = []) {
  return Number(tasks.reduce((sum, task) => sum + (Number(task.quantity) || 0), 0).toFixed(1));
}

export function cleanLaundryReadyForTask(task) {
  if (task?.done) return true;
  return Boolean(
    task?.laundry_ready_at
    || task?.laundry_packed_at
    || ['packed', 'released', 'at_client', 'returned'].includes(task?.metadata?.laundry_status)
  );
}

export function getPackInfo(tasks = []) {
  const packedAt = tasks.map(task => task.laundry_packed_at).find(Boolean);
  const packedBy = tasks.map(task => task.metadata?.packed_by).find(Boolean);
  const trolleyNos = [...new Set(tasks.map(task => task.laundry_trolley_no).filter(value => value && value !== 'brak'))];
  if (!packedAt && !tasks.some(task => cleanLaundryReadyForTask(task))) {
    return { text: 'Nie spakowano jeszcze', isReady: false };
  }
  if (!packedAt && tasks.some(task => cleanLaundryReadyForTask(task))) {
    return { text: 'Gotowe do odbioru', isReady: true };
  }
  return {
    text: `Spakowano: ${fmtDateTime(packedAt)}${trolleyNos.length ? ` (wózek: ${trolleyNos.join(', ')})` : ''}`,
    isReady: true,
  };
}

export function stopHasPickedNotDelivered(stop, userName) {
  const tasks = stop?.tasks || [];
  const picked = tasks.some(task => task.task_type === 'pickup_clean' && task.done && task.picked_by === userName);
  const undelivered = tasks.some(task => task.task_type === 'deliver_clean' && !task.delivered);
  return picked && undelivered;
}

export function pickedNotDeliveredStops(stops = [], userName) {
  return stops.filter(stop => stopHasPickedNotDelivered(stop, userName));
}

export function tasksPickedByUser(tasks = [], userName) {
  return tasks.length > 0 && tasks.every(task => !task.done || task.picked_by === userName);
}

export function tasksDeliveredByUser(tasks = [], userName) {
  return tasks.length > 0 && tasks.every(task => !task.delivered || task.delivered_by === userName);
}

export function splitCleanTasks(tasks = []) {
  const pickup = tasks.filter(task => task.task_type === 'pickup_clean');
  const delivery = tasks.filter(task => task.task_type === 'deliver_clean');
  return {
    pickup,
    delivery,
    pendingPickup: pickup.filter(task => task.status === 'pending' && !task.done),
    completedPickup: pickup.filter(task => task.done || task.status === 'completed'),
    pendingDelivery: delivery.filter(task => !task.delivered && task.status === 'pending'),
    completedDelivery: delivery.filter(task => task.delivered || task.status === 'completed'),
  };
}

export function buildExtraCandidates({ entries = [], stops = [], trip, userName }) {
  if (!trip) return [];
  const routeIds = parseRouteIds(trip.routes);
  const extras = new Set(parseExtraClients(trip.extra_clients));
  const shownClients = new Set(stops.map(stop => stop.client_name));
  const candMap = new Map();

  entries.forEach(entry => {
    const pDate = pickupDateStr(entry);
    const isToday = pDate === trip.trip_date;
    const isPastBacklog = pDate < trip.trip_date && !entry.delivered;
    const isFutureReady = pDate > trip.trip_date && !entry.delivered && extras.has(entry.client_name);
    const included = routeIds.size === 0 || routeIds.has(entry.route_id) || extras.has(entry.client_name);
    if (!included || entry.done || shownClients.has(entry.client_name)) return;
    if (!(isToday || isPastBacklog || isFutureReady)) return;
    if (!cleanLaundryReadyForEntry(entry)) return;
    if (!candMap.has(entry.client_name)) candMap.set(entry.client_name, { route_id: entry.route_id, entries: [] });
    candMap.get(entry.client_name).entries.push(entry);
  });

  return [...candMap.entries()].map(([client_name, value]) => ({
    client_name,
    route_id: value.route_id,
    kg: Number(value.entries.reduce((sum, entry) => sum + (Number(entry.weight) || 0), 0).toFixed(1)),
    isUrgent: value.entries.some(entry => entry.urgent),
  }));
}

export function cleanLaundryReadyForEntry(entry) {
  if (entry?.done) return true;
  return Boolean(
    entry?.laundry_ready_at
    || entry?.laundry_packed_at
    || ['packed', 'released', 'at_client', 'returned'].includes(entry?.laundry_status)
    || entry?.washed
  );
}

export function dirtyEntriesForStop(entries = [], clientName, tripDate) {
  return entries.filter(entry => entry.client_name === clientName && arrivalDateStr(entry) === tripDate && !entry.deleted_at);
}

export function findBlockingFromEntries(entries = [], trip) {
  if (!trip) return [];
  const routeIds = parseRouteIds(trip.routes);
  const extras = new Set(parseExtraClients(trip.extra_clients));
  return [...new Set(entries
    .filter(entry => entry.done && !entry.delivered && pickupDateStr(entry) === trip.trip_date)
    .filter(entry => routeIds.size === 0 || routeIds.has(entry.route_id) || extras.has(entry.client_name))
    .map(entry => entry.client_name)
    .filter(Boolean))];
}

export function tripHasProgress(stops = [], userName) {
  return stops.some(stop => (stop.tasks || []).some(task =>
    (task.task_type === 'pickup_clean' && task.done && task.picked_by === userName)
    || (task.task_type === 'deliver_clean' && task.delivered && task.delivered_by === userName)
  ));
}

export function canCompleteStop(stop) {
  const clean = splitCleanTasks(stop?.tasks || []);
  return clean.pendingDelivery.length === 0;
}

export function stopLaundryMeta(tasks = [], dirtyEntries = []) {
  const types = new Set([
    ...tasks.map(task => task.metadata?.entry_type).filter(Boolean),
    ...dirtyEntries.map(entry => entry.type || 'P'),
  ]);
  const kg = Number(tasks.reduce((sum, task) => sum + (Number(task.quantity) || 0), 0).toFixed(1));
  return {
    kg,
    hasP: [...types].some(type => type === 'P' || !type),
    hasO: types.has('O'),
    hasR: types.has('R'),
    isUrgent: tasks.some(task => task.metadata?.urgent) || dirtyEntries.some(entry => entry.urgent),
  };
}

export function statsFromCourseStops(stops = [], entries = [], tripDate) {
  const deliveryStops = stops.filter(stop => (stop.tasks || []).some(task =>
    task.task_type === 'pickup_clean' || task.task_type === 'deliver_clean'
  ));
  let picked = 0;
  let delivered = 0;
  let kg = 0;
  deliveryStops.forEach(stop => {
    const clean = splitCleanTasks(stop.tasks || []);
    if (!clean.pickup.length) return;
    if (clean.pendingPickup.length === 0 && clean.completedPickup.length > 0) picked += 1;
    if (clean.pendingDelivery.length === 0 && clean.completedDelivery.length > 0) delivered += 1;
    kg += sumTaskWeight(clean.pickup);
  });
  const dirtyStops = stops.filter(stop => dirtyEntriesForStop(entries, stop.client_name, tripDate).length > 0);
  const dirtyFlat = dirtyStops.flatMap(stop => dirtyEntriesForStop(entries, stop.client_name, tripDate));
  return {
    totalStops: stops.length,
    stops: deliveryStops.length,
    picked,
    delivered,
    kg: Number(kg.toFixed(1)),
    dirtyStops: dirtyStops.length,
    dirtyPickups: dirtyFlat.length,
    dirtyTrolleys: dirtyFlat.reduce((sum, entry) => sum + (Number(entry.trolleys) || 1), 0),
  };
}
