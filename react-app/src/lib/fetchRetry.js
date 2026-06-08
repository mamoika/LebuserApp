// Wspólne zabezpieczenie zapytań do Supabase przed zawieszeniem i chwilowymi
// awariami sieci (darmowy hosting potrafi gubić/spowalniać połączenia).
// Używane zarówno w useAppData, jak i w Panelu Admina.

export const FETCH_TIMEOUT_MS = 15000;
export const MAX_RETRIES = 2;

// Owija obietnicę limitem czasu — jeśli baza nie odpowie, odrzucamy zamiast wisieć.
export function withTimeout(promise, ms = FETCH_TIMEOUT_MS, label = 'zapytanie') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Przekroczono czas oczekiwania (${label})`)), ms)
    ),
  ]);
}

// Uruchamia `fn` (zwracające obietnicę) z limitem czasu i ponawianiem.
// Rzuca ostatnim błędem dopiero po wyczerpaniu prób.
export async function withRetry(fn, { retries = MAX_RETRIES, timeoutMs = FETCH_TIMEOUT_MS, label = 'zapytanie' } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await withTimeout(Promise.resolve().then(fn), timeoutMs, label);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}
