const ABSENCE_VALUES = new Set(['UW', 'L4', 'NU', 'NN']);

export function isAbsent(value) {
  return ABSENCE_VALUES.has(String(value || '').trim().toUpperCase());
}
