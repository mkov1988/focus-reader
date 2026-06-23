import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Service worker: precache the app shell, and runtime-cache book covers
    // (CacheFirst, since they're immutable, id-keyed files) so the front page and
    // vibe pages load instantly on repeat visits and work offline — including in
    // the eventual Android WebView build. Covers are NOT precached (that would
    // download all ~1k on install); they cache on first view, capped + expiring.
    // SW only ships in `vite build` (devOptions off) so it never interferes with
    // the dev/HMR phone-testing flow.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2}'],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'book-covers',
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'Focus Reader',
        short_name: 'Focus Reader',
        description: 'A calm, focused reader for public-domain books.',
        theme_color: '#3a2a1e',
        background_color: '#f3ead9',
        display: 'standalone',
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    // Bind to 0.0.0.0 so other devices on the same Wi-Fi (e.g. your phone) can
    // reach the dev server at http://<this-machine-LAN-IP>:5173. HMR still works.
    host: true,
    // Honor a PORT env var when set (lets external tooling bind a chosen port);
    // otherwise the usual 5173. No effect on `npm run dev` without PORT.
    port: Number(process.env.PORT) || 5173,
    proxy: {
      // Project Gutenberg book content isn't CORS-friendly from the browser.
      // In dev we proxy /gutenberg/* -> https://www.gutenberg.org/* so the
      // LibraryService can stream plain-text editions. (See book_access_strategy.md)
      '/gutenberg': {
        target: 'https://www.gutenberg.org',
        changeOrigin: true,
        followRedirects: true,
        rewrite: (path) => path.replace(/^\/gutenberg/, ''),
      },
    },
  },
})
