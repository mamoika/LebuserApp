function reservationForNo(reservedTrolleyByNo, no) {
  if (reservedTrolleyByNo instanceof Set) {
    return reservedTrolleyByNo.has(String(no).toLowerCase()) ? { client_name: null } : null;
  }
  return reservedTrolleyByNo?.get?.(String(no).toLowerCase()) || null;
}

export function trolleyCellState(
  no,
  selected = [],
  activeTrolleyByNo = new Map(),
  clientName = '',
  reservedTrolleyByNo = new Map(),
) {
  if (selected.includes(no)) return 'selected';
  const reservation = reservationForNo(reservedTrolleyByNo, no);
  if (reservation && reservation.client_name !== clientName) return 'busy';
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
  reservedTrolleyByNo = new Map(),
) {
  return trolleyNumbers.filter(no => (
    trolleyCellState(no, selected, activeTrolleyByNo, clientName, reservedTrolleyByNo) !== 'busy'
  ));
}
