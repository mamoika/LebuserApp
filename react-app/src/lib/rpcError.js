export function toRpcError(error, fallbackMessage = 'Supabase RPC failed') {
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
