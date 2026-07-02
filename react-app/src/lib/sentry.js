// Frontendowy monitoring błędów (Sentry).
//
// Aktywuje się TYLKO gdy ustawiony jest VITE_SENTRY_DSN. Bez DSN (np. lokalnie,
// w testach lub gdy produkcja nie jest skonfigurowana) wszystkie funkcje poniżej
// są no-op — SDK się nie inicjalizuje i nic nie wychodzi na zewnątrz.
//
// Świadome decyzje prywatności (RODO):
//   - sendDefaultPii: false  -> Sentry nie dołącza IP, cookies ani nagłówków,
//   - brak Session Replay     -> nie nagrywamy ekranu/DOM użytkownika,
//   - kontekst użytkownika ograniczony do: id konta, login, rola (bez nazwiska/maila).
import * as Sentry from '@sentry/react';

const dsn = import.meta.env.VITE_SENTRY_DSN;

export function initSentry() {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
    sendDefaultPii: false,
    // Domyślne integracje łapią nieobsłużone błędy (window.onerror) oraz
    // odrzucone obietnice (unhandledrejection). Bez tracingu i Session Replay.
  });
}

// Kto miał błąd — bez danych osobowych: wewnętrzne id konta, login i rola.
export function setSentryUser(user) {
  if (!dsn || !user?.id) return;
  Sentry.setUser({ id: String(user.id), username: user.username });
  Sentry.setTag('role', user.role || 'unknown');
}

export function clearSentryUser() {
  if (!dsn) return;
  Sentry.setUser(null);
}

// Ręczne zgłoszenie złapanego błędu (np. nieudane ładowanie danych po
// wyczerpaniu ponowień) — inaczej Sentry by go nie zobaczył, bo jest obsłużony.
// `tags` pozwala odróżnić np. błędy sieciowe (offline/timeout) od realnych
// błędów kodu — łatwo je potem odfiltrować w Sentry, bo nie są "do naprawy".
export function captureError(error, extra, tags) {
  if (!dsn) return;
  Sentry.captureException(error, {
    ...(extra ? { extra } : null),
    ...(tags ? { tags } : null),
  });
}
