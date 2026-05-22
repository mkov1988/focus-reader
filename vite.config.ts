import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
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
