import { VEHICLE_LABELS } from './vehicles';
import { parseExtraClients, parseRouteIds, pickupDateStr, arrivalDateStr } from './tripUiHelpers';

export function tripContainsEntryClient(sourceTrip, entry) {
  if (!sourceTrip || !entry) return false;
  const routeIds = parseRouteIds(sourceTrip.routes);
  const extras = new Set(parseExtraClients(sourceTrip.extra_clients));
  return routeIds.size === 0 || routeIds.has(entry.route_id) || extras.has(entry.client_name);
}

export function assignedTripForEntry(entry, { allTrips = [], trip = null, focusTrip = null } = {}) {
  if (!entry) return null;
  const date = arrivalDateStr(entry);
  const candidates = [
    focusTrip,
    trip,
    ...allTrips
      .filter(item => item.trip_date === date && item.status !== 'finished')
      .sort((a, b) => (a.status === 'active' ? -1 : 0) - (b.status === 'active' ? -1 : 0)),
    ...allTrips.filter(item => item.trip_date === date && item.status === 'finished'),
  ].filter(Boolean);
  const assignedTrip = candidates.find(item => tripContainsEntryClient(item, entry));
  if (!assignedTrip) return null;
  const driver = assignedTrip.driver_name || 'nieprzypisane';
  const car = assignedTrip.car ? ` · ${VEHICLE_LABELS[assignedTrip.car] || assignedTrip.car}` : '';
  const statusKey = assignedTrip.status === 'planned' ? 'planned' : assignedTrip.status === 'active' ? 'active' : 'finished';
  return { trip: assignedTrip, label: `${driver}${car}`, statusKey };
}

export function entryAssignmentCaption(assigned) {
  if (!assigned) return null;
  const status = assigned.trip?.status;
  if (status === 'finished') return 'brought';
  if (status === 'active') return 'carrying';
  return 'willBring';
}

export function entryIdsForTasks(tasks = []) {
  return [...new Set(tasks.map(task => task.entry_id).filter(Boolean))];
}

export function completedEntryIdsForTasks(tasks = []) {
  return [...new Set(
    tasks
      .filter(task => task.done || task.status === 'completed')
      .map(task => task.entry_id)
      .filter(Boolean),
  )];
}

export function pendingEntryIdsForTasks(tasks = []) {
  return [...new Set(
    tasks
      .filter(task => !task.delivered && task.status !== 'completed')
      .map(task => task.entry_id)
      .filter(Boolean),
  )];
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
  const trolleyNos = [...new Set(tasks.map(task => task.laundry_trolley_no).filter(value => value && value !== 'brak'))];
  if (!packedAt && !tasks.some(task => cleanLaundryReadyForTask(task))) {
    return { kind: 'not_packed', isReady: false, packedAt: null, trolleyNos };
  }
  if (!packedAt && tasks.some(task => cleanLaundryReadyForTask(task))) {
    return { kind: 'ready', isReady: true, packedAt: null, trolleyNos };
  }
  return { kind: 'packed', isReady: true, packedAt, trolleyNos };
}

export function isTripDriver(user, trip) {
  return Boolean(user?.id && trip?.driver_id && String(user.id) === String(trip.driver_id));
}

export function driverActingNames(user, trip) {
  return new Set([user?.name, trip?.driver_name].filter(Boolean));
}

export function pickupOwnedByDriver(task, user, trip) {
  if (!task?.done) return false;
  if (isTripDriver(user, trip)) return true;
  return driverActingNames(user, trip).has(task.picked_by);
}

export function canManagePickupTasks(tasks = [], user, trip) {
  if (!tasks.length) return false;
  if (isTripDriver(user, trip)) return true;
  return tasksPickedByUser(tasks, user?.name);
}

export function stopHasPickedNotDelivered(stop, user, trip) {
  const tasks = stop?.tasks || [];
  const picked = tasks.some(task => task.task_type === 'pickup_clean' && task.done && pickupOwnedByDriver(task, user, trip));
  const undelivered = tasks.some(task => task.task_type === 'deliver_clean' && !task.delivered);
  return picked && undelivered;
}

export function pickedNotDeliveredStops(stops = [], user, trip) {
  return stops.filter(stop => stopHasPickedNotDelivered(stop, user, trip));
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

export function summarizeStopTasks(stop) {
  const tasks = stop?.tasks || [];
  return {
    hasDirty: tasks.some(task => task.task_type === 'pickup_dirty' && task.status === 'pending'),
    hasCleanPickup: tasks.some(task => task.task_type === 'pickup_clean' && task.status === 'pending'),
    hasDeliver: tasks.some(task => task.task_type === 'deliver_clean' && task.status === 'pending'),
  };
}

export function declinedCleanClientsFromEvents(events = []) {
  return new Set(
    (events || [])
      .filter(event => event.event_type === 'declined_pickup')
      .map(event => event.data?.client_name || event.details?.replace(/^.*:\s*/, ''))
      .filter(Boolean),
  );
}

export function buildOtherRouteCleanCandidates({ entries = [], stops = [], trip }) {
  if (!trip) return [];
  const routeIds = parseRouteIds(trip.routes);
  const extras = new Set(parseExtraClients(trip.extra_clients));
  const shownClients = new Set(stops.map(stop => stop.client_name));
  const candMap = new Map();

  entries.forEach(entry => {
    const pDate = pickupDateStr(entry);
    const isToday = pDate === trip.trip_date;
    const isPastBacklog = pDate < trip.trip_date && !entry.delivered;
    if (entry.done || entry.delivered) return;
    if (!isToday && !isPastBacklog) return;
    if (!cleanLaundryReadyForEntry(entry)) return;
    if (shownClients.has(entry.client_name) || extras.has(entry.client_name)) return;
    if (routeIds.size > 0 && routeIds.has(entry.route_id)) return;

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
  return clean.pendingPickup.length === 0 && clean.pendingDelivery.length === 0;
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
