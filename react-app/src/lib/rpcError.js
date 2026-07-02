// Przeglądarka rzuca surowy TypeError, gdy fetch() w ogóle nie doleciał (offline,
// zerwane połączenie, timeout) — treść zależy od silnika: "Load failed" (Safari),
// "Failed to fetch" (Chrome), "NetworkError..." (Firefox). To nie jest błąd
// naszego kodu ani backendu, więc nie pokazujemy tego surowego tekstu userowi.
const NETWORK_ERROR_PATTERN = /load failed|failed to fetch|networkerror|network request failed|internet connection appears to be offline/i;

export function isNetworkError(error) {
  return error instanceof TypeError && NETWORK_ERROR_PATTERN.test(error?.message || '');
}

export function toRpcError(error, fallbackMessage = 'Supabase RPC failed') {
  if (isNetworkError(error)) {
    const next = new Error('Brak połączenia z serwerem — sprawdź internet i spróbuj ponownie.', { cause: error });
    next.isNetworkError = true;
    return next;
  }
  if (error instanceof Error) return error;

  const next = new Error(error?.message || fallbackMessage);
  if (error?.code) next.code = error.code;
  if (error?.details) next.details = error.details;
  if (error?.hint) next.hint = error.hint;
  return next;
}

export function throwRpcError(error, fallbackMessage) {
  throw toRpcError(error, fallbackMessage);
}
