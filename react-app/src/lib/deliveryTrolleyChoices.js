function realTrolley(value) {
  const normalized = String(value || '').trim();
  return Boolean(normalized && normalized.toLowerCase() !== 'brak');
}

function activeCycle(cycle) {
  return realTrolley(cycle?.trolley_no)
    && !cycle?.returned_at
    && !['returned', 'canceled'].includes(cycle?.status);
}

export function deliveryTrolleyChoices(tasks = [], workflowTrolleys = [], previousChoices = []) {
  const entryIds = new Set(tasks.map(task => task?.entry_id).filter(Boolean));
  const previousByCycle = new Map(previousChoices.map(choice => [choice.cycleId, choice]));
  const choices = new Map();

  workflowTrolleys
    .filter(cycle => activeCycle(cycle) && (cycle.entry_ids || []).some(id => entryIds.has(id)))
    .forEach(cycle => {
      const previous = previousByCycle.get(cycle.id);
      choices.set(cycle.id, {
        cycleId: cycle.id,
        trolleyNo: String(cycle.trolley_no).trim(),
        choice: previous?.choice || 'return',
      });
    });

  tasks.forEach(task => {
    if (!task?.laundry_trolley_cycle_id || !realTrolley(task?.laundry_trolley_no)) return;
    if (choices.has(task.laundry_trolley_cycle_id)) return;
    const previous = previousByCycle.get(task.laundry_trolley_cycle_id);
    choices.set(task.laundry_trolley_cycle_id, {
      cycleId: task.laundry_trolley_cycle_id,
      trolleyNo: String(task.laundry_trolley_no).trim(),
      choice: previous?.choice || 'return',
    });
  });

  return [...choices.values()].sort((a, b) => (
    Number(a.trolleyNo) - Number(b.trolleyNo)
    || a.trolleyNo.localeCompare(b.trolleyNo, 'pl')
  ));
}
