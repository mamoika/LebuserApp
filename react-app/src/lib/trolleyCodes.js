const TROLLEY_SCAN_PATTERN = /^(?:LEB-#?|TRL-)?0*(\d+)$/i;

export function parseTrolleyCode(value) {
  const match = String(value || '').trim().match(TROLLEY_SCAN_PATTERN);
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isInteger(number) && number > 0 ? String(number) : null;
}

export function formatTrolleyCode(value) {
  const number = Number(parseTrolleyCode(value));
  if (!number) return String(value || '').trim();
  return `LEB-#${String(number).padStart(2, '0')}`;
}
