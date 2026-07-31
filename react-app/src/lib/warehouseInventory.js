export function itemDisplayName(item) {
  return item?.variant ? `${item.name} ${item.variant}` : item?.name || '';
}

export function emptyWarehouseCounts(items, location = null) {
  return Object.fromEntries(items.map(item => [
    item.id,
    location ? String(stockCount(location, item.id)) : '',
  ]));
}

export function stockCount(location, itemId) {
  return Math.max(0, Number(location?.stock?.[itemId] || 0));
}

export function clientStockCount(location, itemId, clientId) {
  const clientStock = location?.client_stock?.find(entry => entry.client_id === clientId);
  return Math.max(0, Number(clientStock?.stock?.[itemId] || 0));
}

export function clientItemBreakdown(location, itemId) {
  return (location?.client_stock || [])
    .map(entry => ({
      clientId: entry.client_id,
      clientName: entry.client_name,
      quantity: Math.max(0, Number(entry.stock?.[itemId] || 0)),
    }))
    .filter(entry => entry.quantity > 0)
    .sort((a, b) => a.clientName.localeCompare(b.clientName));
}

export function totalLocationStock(location, items) {
  return items.reduce((sum, item) => sum + stockCount(location, item.id), 0);
}

export function zoneTotals(locations, items, zone) {
  const inZone = locations.filter(location => location.zone === zone);
  return Object.fromEntries(items.map(item => [
    item.id,
    inZone.reduce((sum, location) => sum + stockCount(location, item.id), 0),
  ]));
}

export function movementLinesFromCounts(counts, items) {
  return items
    .map(item => ({ item_id: item.id, quantity: Number(counts[item.id]) }))
    .filter(line => Number.isInteger(line.quantity) && line.quantity > 0);
}

export function validateMovementCounts(counts, items, sourceLocation) {
  const lines = movementLinesFromCounts(counts, items);
  if (lines.length === 0) return 'empty';
  if (sourceLocation && lines.some(line => line.quantity > stockCount(sourceLocation, line.item_id))) {
    return 'exceeds';
  }
  return null;
}
