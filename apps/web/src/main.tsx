// Local demo only: no sound at all while tests run (does nothing in production).
import './lib/devSilence';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { recoverFromStaleChunks, setWaitingUpdateApplier } from './components/ErrorBoundaryRecovery';
import { unlockAudio } from './lib/metronome';
import { keepViewportFitted } from './lib/viewport';
import './index.css';

// PWA ('prompt' mode): a new deploy installs in the background and waits. It is applied (fresh service worker
// + one reload) only at a safe moment: outside the studio (/v/…) and with no dialog open, so a rehearsal, a
// recording or an upload is never cut short. Installed apps also check for a new version every hour.
keepViewportFitted();

let updateWaiting = false;
let updatePoll: ReturnType<typeof setInterval> | undefined;

const isSafeMoment = () => !window.location.pathname.startsWith('/v/') && !document.querySelector('[role="dialog"]');

/** Applies the waiting update now (fresh service worker + one reload); false when none is waiting. */
const applyUpdate = () => {
  if (!updateWaiting) return false;
  updateWaiting = false;
  clearInterval(updatePoll);
  void updateSW(true);
  return true;
};

const applyUpdateIfSafe = () => {
  if (updateWaiting && isSafeMoment()) applyUpdate();
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

// A lazy chunk this page asked for is gone (a new deploy replaced it): move to the new version once, through
// the waiting update if there is one. Not with a dialog open (a take, an upload): the error boundary's
// «Recargar» does the same when the dancer is ready.
setWaitingUpdateApplier(applyUpdate);
window.addEventListener('vite:preloadError', () => {
  // Offline the chunk isn't stale, just out of reach: a reload wouldn't help.
  if (navigator.onLine && !document.querySelector('[role="dialog"]')) recoverFromStaleChunks();
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
