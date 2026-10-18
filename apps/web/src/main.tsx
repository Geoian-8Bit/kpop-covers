// Local demo only: no sound at all while tests run (does nothing in production).
import './lib/devSilence';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { recoverFromStaleChunks, setWaitingUpdateApplier } from './components/ErrorBoundaryRecovery';
import {
  isManualCheckRunning,
  noteRegistration,
  noteUpdateWaiting,
  savingCount,
  setUpdateApplier,
} from './features/nav/version/appUpdate';
import { reloadNeedsConfirm } from './features/nav/version/versionRules';
import { reloadBusy } from './lib/heavyWork';
import { unlockAudio } from './lib/metronome';
import { keepViewportFitted } from './lib/viewport';
import { forgetRetiredData } from './lib/retiredData';
import './index.css';

// PWA ('prompt' mode): a new deploy installs in the background and waits. It is applied (fresh service worker
// + one reload) only at a safe moment: outside the studio (/v/…), with no dialog open and nothing being saved, so a
// rehearsal, a recording or an upload is never cut short. Installed apps also check for a new version every hour.
// P2 · «Buscar actualización» (menu «⋯», Ajustes) does the same on demand; while it runs it owns the update.
keepViewportFitted();

let updateWaiting = false;
let updatePoll: ReturnType<typeof setInterval> | undefined;

// The same rule «Buscar actualización» uses to ask first (versionRules.ts, tested), plus: not while a check runs.
const isSafeMoment = () =>
  !reloadNeedsConfirm({
    pathname: window.location.pathname,
    dialogOpen: Boolean(document.querySelector('[role="dialog"]')),
    saving: savingCount(),
    // Not halfway through the copy for the group or the voice separation (they outlive the song's screen).
    busy: reloadBusy(),
  }) && !isManualCheckRunning();

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
    noteUpdateWaiting();
    applyUpdateIfSafe();
    // In-app navigation (pushState) fires no event: check now and then until the user leaves the studio.
    if (updateWaiting && !updatePoll) updatePoll = setInterval(applyUpdateIfSafe, 2000);
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    noteRegistration(registration);
    setInterval(() => void registration.update(), 60 * 60 * 1000);
  },
});
window.addEventListener('popstate', applyUpdateIfSafe);
setUpdateApplier(applyUpdate);

// A lazy chunk this page asked for is gone (a new deploy replaced it): move to the new version once, through
// the waiting update if there is one. Not with a dialog open (a take, an upload): the error boundary's
// «Recargar» does the same when the dancer is ready.
setWaitingUpdateApplier(applyUpdate);
window.addEventListener('vite:preloadError', () => {
  // Offline the chunk isn't stale, just out of reach: a reload wouldn't help.
  // Global review 2 [2] · Nor with the copy or the separation running: a reload would cut it short.
  if (navigator.onLine && !document.querySelector('[role="dialog"]') && !reloadBusy()) recoverFromStaleChunks();
});

// Audio (metronome ticks) may only start after a user gesture: unlock on the first tap or key.
for (const type of ['pointerdown', 'keydown'] as const) {
  window.addEventListener(type, unlockAudio, { once: true, passive: true });
}

// 45 · What «Seguir a un bailarín» and the pose test left on this device (models, results): gone, once idle.
window.addEventListener(
  'load',
  () =>
    setTimeout(() => {
      let storage: Storage | null = null;
      try {
        storage = window.localStorage;
      } catch {
        /* blocked */
      }
      void forgetRetiredData({ caches: 'caches' in window ? window.caches : null, storage });
    }, 4000),
  { once: true },
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
