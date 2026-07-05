import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
// Self-hosted fonts (bundled into the build) so the app renders correctly
// offline and on first launch — no Google Fonts CDN round trip. Fraunces is the
// display serif (normal + italic); Inter is the body sans.
import '@fontsource-variable/inter/index.css'
import '@fontsource-variable/fraunces/index.css'
import '@fontsource-variable/fraunces/wght-italic.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// PWA auto-update. In autoUpdate mode this reloads the page the moment a newly
// deployed service worker takes control, so a normal refresh always shows the
// latest build (no more "have to open incognito"). We also poll for a new
// deploy every minute and whenever the tab regains focus, so an already-open app
// picks up updates on its own.
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    const check = () => registration.update()
    setInterval(check, 60_000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
  },
})
