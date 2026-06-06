import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
