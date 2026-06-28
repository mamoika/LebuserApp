import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// Upload source map do Sentry tylko gdy ustawiony jest token (CI/Vercel).
// Bez tokenu build działa normalnie i w ogóle nie dotyka Sentry.
const sentryEnabled = !!process.env.SENTRY_AUTH_TOKEN

// https://vite.dev/config/
export default defineConfig({
  // 'hidden' = generujemy source mapy do wgrania, ale NIE linkujemy ich w
  // bundlu (nie trafiają do przeglądarki). Plugin kasuje je po wysłaniu.
  build: {
    sourcemap: sentryEnabled ? 'hidden' : false,
  },
  plugins: [
    react(),
    ...(sentryEnabled
      ? [sentryVitePlugin({
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          authToken: process.env.SENTRY_AUTH_TOKEN,
          sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
        })]
      : []),
  ],
})
