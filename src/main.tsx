import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
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
