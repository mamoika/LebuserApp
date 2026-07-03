import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// Upload source map do Sentry tylko gdy KOMPLET jest ustawiony (token + org +
// projekt). Brak któregokolwiek = build działa normalnie, po prostu bez source
// map — częściowa/błędna konfiguracja nie wywala deployu.
const sentryUpload =
  !!process.env.SENTRY_AUTH_TOKEN &&
  !!process.env.SENTRY_ORG &&
  !!process.env.SENTRY_PROJECT

// https://vite.dev/config/
export default defineConfig({
  // 'hidden' = generujemy source mapy do wgrania, ale NIE linkujemy ich w
  // bundlu (nie trafiają do przeglądarki). Plugin kasuje je po wysłaniu.
  build: {
    sourcemap: sentryUpload ? 'hidden' : false,
    // Vite ostrzega dopiero powyżej tego progu (kB, po minifikacji). Główny
    // chunk jest duży głównie przez biblioteki potrzebne od pierwszej klatki
    // (auth: Supabase, Sentry, i18next, router) — patrz manualChunks niżej,
    // które je wydziela do osobnych, lepiej cache'owalnych plików.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Biblioteki trzecie w osobnych, nazwanych chunkach: rzadko się
        // zmieniają między deployami, więc przeglądarka użytkownika nie
        // musi ich ściągać ponownie przy każdym wdrożeniu — tylko kod
        // appki faktycznie się zmienia.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@sentry')) return 'vendor-sentry';
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (id.includes('i18next')) return 'vendor-i18n';
          if (id.includes('react-router')) return 'vendor-router';
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) return 'vendor-react';
          return undefined;
        },
      },
    },
  },
  plugins: [
    react(),
    ...(sentryUpload
      ? [sentryVitePlugin({
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          authToken: process.env.SENTRY_AUTH_TOKEN,
          // Organizacja jest w regionie EU → endpoint uploadu to de.sentry.io.
          // (Token organizacyjny sntrys_ zwykle sam niesie region; to bezpiecznik.)
          url: process.env.SENTRY_URL || 'https://de.sentry.io',
          sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
        })]
      : []),
  ],
})
