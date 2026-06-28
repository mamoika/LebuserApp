// Odporność na nieświeże deploye.
//
// Po każdym deployu stare, leniwie ładowane chunki znikają z CDN. Gdy ktoś ma
// otwartą starszą wersję aplikacji i wejdzie w taki widok, dynamiczny import
// pada: "TypeError: Importing a module script failed". Vite zgłasza to
// zdarzeniem `vite:preloadError` — łapiemy je i robimy JEDNORAZOWY reload, żeby
// pobrać świeży index.html + aktualne chunki. Crash zamienia się w cichy refresh.
const RELOAD_KEY = 'lebuser_chunk_reload';

export function setupChunkReload() {
  if (typeof window === 'undefined') return;

  window.addEventListener('vite:preloadError', (event) => {
    if (sessionStorage.getItem(RELOAD_KEY)) {
      // Już raz przeładowaliśmy, a chunk nadal nie wchodzi — to nie jest zwykły
      // nieświeży deploy. Nie zapętlamy; niech błąd pójdzie do Sentry.
      return;
    }
    event.preventDefault();              // pierwszy raz: ucisz błąd...
    sessionStorage.setItem(RELOAD_KEY, '1');
    window.location.reload();            // ...i pobierz świeżą wersję
  });

  // Dotarliśmy tu = bundle wstał. Po chwili zdrowego działania kasujemy guard,
  // żeby auto-reload był gotowy także przy następnym deployu.
  setTimeout(() => {
    try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* brak dostępu do storage — pomiń */ }
  }, 10000);
}
