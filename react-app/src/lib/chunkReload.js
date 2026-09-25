// Odporność na nieświeże deploye.
//
// Po każdym deployu stare, leniwie ładowane chunki znikają z CDN. Gdy ktoś ma
// otwartą starszą wersję aplikacji i wejdzie w taki widok, dynamiczny import
// pada: "TypeError: Importing a module script failed". Vite zgłasza to
// zdarzeniem `vite:preloadError` — łapiemy je i robimy JEDNORAZOWY reload, żeby
// pobrać świeży index.html + aktualne chunki. Crash zamienia się w cichy refresh.
const RELOAD_KEY = 'lebuser_chunk_reload';
const CHUNK_IMPORT_ERROR = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk [^ ]+ failed|ChunkLoadError/i;
const waitForReload = () => new Promise(() => {});

function browserRuntime() {
  if (typeof window === 'undefined') return null;
  return {
    storage: window.sessionStorage,
    reload: () => window.location.reload(),
  };
}

function requestChunkReload(error, runtime = browserRuntime(), force = false) {
  if (!runtime || (!force && !CHUNK_IMPORT_ERROR.test(String(error?.message || error)))) return false;

  try {
    if (runtime.storage.getItem(RELOAD_KEY)) return false;
    runtime.storage.setItem(RELOAD_KEY, '1');
    runtime.reload();
    return true;
  } catch {
    return false;
  }
}

function reloadIsPending(runtime) {
  try {
    return runtime?.storage.getItem(RELOAD_KEY) === '1';
  } catch {
    return false;
  }
}

// React.lazy() może dostać zwykłe odrzucenie Promise bez zdarzenia
// `vite:preloadError`. Wtedy przeładowujemy aplikację bez przekazywania błędu do
// ErrorBoundary; oczekujący Promise zostanie porzucony wraz z bieżącą stroną.
export async function importWithChunkReload(importer, runtime) {
  const activeRuntime = runtime ?? browserRuntime();
  try {
    const loadedModule = await importer();
    if (loadedModule && typeof loadedModule === 'object') return loadedModule;

    // Safari może po obsłużonym `vite:preloadError` rozwiązać import wartością
    // undefined, zanim rozpoczęty reload przejmie stronę. Nie przekazujemy jej
    // do React.lazy(), bo kończy się to błędem `_result.default` w React.
    if (reloadIsPending(activeRuntime)
        || requestChunkReload(new TypeError('Chunk import returned no module'), activeRuntime, true)) {
      return waitForReload();
    }
    throw new TypeError('Chunk import returned no module');
  } catch (error) {
    if (requestChunkReload(error, activeRuntime)) {
      return waitForReload();
    }
    throw error;
  }
}

export function setupChunkReload() {
  if (typeof window === 'undefined') return;

  window.addEventListener('vite:preloadError', (event) => {
    if (requestChunkReload(event.payload, browserRuntime(), true)) {
      event.preventDefault();
    }
  });

  // Dotarliśmy tu = bundle wstał. Po chwili zdrowego działania kasujemy guard,
  // żeby auto-reload był gotowy także przy następnym deployu.
  setTimeout(() => {
    try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* brak dostępu do storage — pomiń */ }
  }, 10000);
}
