export function trolleyCellState(no, selected = [], activeTrolleyByNo = new Map(), clientName = '') {
  if (selected.includes(no)) return 'selected';
  const active = activeTrolleyByNo.get(String(no).toLowerCase());
  if (!active) return 'free';
  if (active.status === 'at_client' && active.client_name === clientName) return 'returning';
  return 'busy';
}

export function visibleArrivalTrolleyNumbers(
  trolleyNumbers = [],
  selected = [],
  activeTrolleyByNo = new Map(),
  clientName = '',
) {
  return trolleyNumbers.filter(no => (
    trolleyCellState(no, selected, activeTrolleyByNo, clientName) !== 'busy'
  ));
}
