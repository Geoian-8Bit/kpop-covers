import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { unlockAudio } from './lib/metronome';
import { keepViewportFitted } from './lib/viewport';
import './index.css';

// PWA ('prompt' mode): a new deploy installs in the background and waits. It is applied (fresh service worker
// + one reload) only at a safe moment: outside the studio (/v/…) and with no dialog open, so a rehearsal, a
// recording or an upload is never cut short. Installed apps also check for a new version every hour.
keepViewportFitted();

let updateWaiting = false;
let updatePoll: ReturnType<typeof setInterval> | undefined;

const applyUpdateIfSafe = () => {
  if (!updateWaiting) return;
  if (window.location.pathname.startsWith('/v/') || document.querySelector('[role="dialog"]')) return;
  updateWaiting = false;
  clearInterval(updatePoll);
  void updateSW(true);
};

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateWaiting = true;
    applyUpdateIfSafe();
    // In-app navigation (pushState) fires no event: check now and then until the user leaves the studio.
    if (updateWaiting && !updatePoll) updatePoll = setInterval(applyUpdateIfSafe, 2000);
  },
  onRegisteredSW(_url, registration) {
    if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000);
  },
});
window.addEventListener('popstate', applyUpdateIfSafe);

// Audio (metronome ticks) may only start after a user gesture: unlock on the first tap or key.
for (const type of ['pointerdown', 'keydown'] as const) {
  window.addEventListener(type, unlockAudio, { once: true, passive: true });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
