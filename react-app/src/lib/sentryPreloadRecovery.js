const RECOVERED_PRELOAD_ERROR = /Unable to preload CSS|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk [^ ]+ failed|ChunkLoadError/i;

function errorMessages(event, hint) {
  const original = hint?.originalException;
  return [
    typeof original === 'string' ? original : original?.message,
    event?.message,
    event?.logentry?.message,
    ...(event?.exception?.values || []).map(value => value?.value),
  ].filter(Boolean).map(String);
}

export function shouldIgnoreRecoveredPreloadError(event, hint, reloadPending) {
  return Boolean(reloadPending && errorMessages(event, hint).some(message => RECOVERED_PRELOAD_ERROR.test(message)));
}
