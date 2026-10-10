import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { unlockAudio } from './lib/metronome';
import './index.css';

// PWA: in autoUpdate mode a new deploy activates the fresh service worker and reloads the page once.
// Installed apps also check for a new version every hour.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000);
  },
});

// Audio (metronome ticks) may only start after a user gesture: unlock on the first tap or key.
for (const type of ['pointerdown', 'keydown'] as const) {
  window.addEventListener(type, unlockAudio, { once: true, passive: true });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
