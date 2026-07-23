export function parseRouteIds(routes) {
  return new Set(
    String(routes || '')
      .split(',')
      .map(value => Number(value.trim()))
      .filter(Boolean),
  );
}
