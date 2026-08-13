function allocationKey(clientId, itemId) {
  return `${clientId}:${itemId}`;
}

export function warehouseStockAllocations(location, items) {
  return (location?.client_stock || []).flatMap(client => (
    items
      .map(item => ({
        key: allocationKey(client.client_id, item.id),
        clientId: client.client_id,
        clientName: client.client_name,
        itemId: item.id,
        itemName: item.name,
        itemVariant: item.variant || null,
        unit: item.unit || 'szt.',
        quantity: Math.max(0, Number(client.stock?.[item.id] || 0)),
      }))
      .filter(entry => entry.quantity > 0)
  ));
}

export function reconcileCartonLayout(placements, location, items) {
  const allocations = warehouseStockAllocations(location, items);
  const available = new Map(allocations.map(entry => [entry.key, entry]));
  const assigned = new Map();
  const allocatedByItem = new Map();

  allocations.forEach(allocation => {
    allocatedByItem.set(
      allocation.itemId,
      (allocatedByItem.get(allocation.itemId) || 0) + allocation.quantity
    );
  });

  (placements || []).forEach(placement => {
    const key = allocationKey(placement.client_id, placement.item_id);
    assigned.set(
      key,
      (assigned.get(key) || 0) + Math.max(0, Math.round(Number(placement.quantity || 0)))
    );
  });

  const keys = new Set([...available.keys(), ...assigned.keys()]);
  const differences = [...keys].map(key => {
    const allocation = available.get(key);
    const availableQuantity = allocation?.quantity || 0;
    const assignedQuantity = assigned.get(key) || 0;
    return {
      key,
      clientId: allocation?.clientId || key.split(':')[0],
      clientName: allocation?.clientName || '',
      itemId: allocation?.itemId || key.split(':')[1],
      itemName: allocation?.itemName || '',
      available: availableQuantity,
      assigned: assignedQuantity,
      missing: Math.max(0, availableQuantity - assignedQuantity),
      excess: Math.max(0, assignedQuantity - availableQuantity),
    };
  }).filter(entry => entry.missing > 0 || entry.excess > 0);

  items.forEach(item => {
    const totalQuantity = Math.max(0, Number(location?.stock?.[item.id] || 0));
    const assignedToClients = allocatedByItem.get(item.id) || 0;
    const unassigned = Math.max(0, totalQuantity - assignedToClients);
    if (unassigned > 0) {
      differences.push({
        key: `unassigned:${item.id}`,
        clientId: null,
        clientName: '',
        itemId: item.id,
        itemName: item.name,
        available: unassigned,
        assigned: 0,
        missing: unassigned,
        excess: 0,
      });
    }
  });

  const locationTotal = items.reduce(
    (sum, item) => sum + Math.max(0, Number(location?.stock?.[item.id] || 0)),
    0
  );

  return {
    status: differences.some(entry => entry.excess > 0)
      ? 'excess'
      : differences.some(entry => entry.missing > 0) ? 'missing' : 'exact',
    differences,
    availableTotal: Math.max(
      locationTotal,
      allocations.reduce((sum, entry) => sum + entry.quantity, 0)
    ),
    assignedTotal: [...assigned.values()].reduce((sum, quantity) => sum + quantity, 0),
  };
}

function gridRect(index, count) {
  if (count <= 1) return { x: 6, y: 6, width: 88, height: 88 };
  if (count === 2) {
    return { x: index === 0 ? 6 : 52, y: 6, width: 42, height: 88 };
  }
  if (count === 3) {
    return index === 0
      ? { x: 6, y: 6, width: 48, height: 88 }
      : { x: 58, y: index === 1 ? 6 : 52, width: 36, height: 42 };
  }

  const columns = count > 4 ? 3 : 2;
  const rows = Math.ceil(count / columns);
  const gap = 4;
  const outer = 6;
  const width = (100 - (outer * 2) - (gap * (columns - 1))) / columns;
  const height = (100 - (outer * 2) - (gap * (rows - 1))) / rows;
  return {
    x: outer + (index % columns) * (width + gap),
    y: outer + Math.floor(index / columns) * (height + gap),
    width,
    height,
  };
}

export function createAutomaticCartonLayout(location, items, createId = () => crypto.randomUUID()) {
  const allocations = warehouseStockAllocations(location, items);
  const layerCount = allocations.length > 1 ? 2 : 1;
  const layers = Array.from({ length: layerCount }, () => []);
  allocations.forEach((allocation, index) => layers[index % layerCount].push(allocation));

  return layers.flatMap((layerAllocations, layerIndex) => (
    layerAllocations.map((allocation, index) => ({
      id: createId(),
      client_id: allocation.clientId,
      item_id: allocation.itemId,
      quantity: allocation.quantity,
      layer_index: layerIndex,
      rotation: 0,
      ...gridRect(index, layerAllocations.length),
    }))
  ));
}

export function clampCartonRect(rect) {
  const width = Math.min(94, Math.max(16, Number(rect.width) || 16));
  const height = Math.min(94, Math.max(16, Number(rect.height) || 16));
  return {
    x: Math.min(100 - width, Math.max(0, Number(rect.x) || 0)),
    y: Math.min(100 - height, Math.max(0, Number(rect.y) || 0)),
    width,
    height,
  };
}
