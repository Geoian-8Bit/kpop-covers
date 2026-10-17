import { create } from 'zustand';
import { decideUpdate, parseVersionFile, type UpdateStatus } from './versionRules';

/**
 * P2 · «Buscar actualización». main.tsx registers the service worker and tells this module about it (registration,
 * «an update is waiting», how to apply it); the button calls `checkForUpdate`. The decisions are pure, in
 * versionRules.ts; this file only talks to the browser.
 */

/** This build's number (vite.config.ts `define`); null on the dev server. Guarded: tests don't define it. */
export const APP_VERSION: number | null = typeof __APP_VERSION__ === 'undefined' ? null : __APP_VERSION__;
export const APP_BUILD_DATE: string | null = typeof __APP_BUILD_DATE__ === 'undefined' ? null : __APP_BUILD_DATE__;

let registration: ServiceWorkerRegistration | null = null;
let waitingNoticed = false;
let applyWaiting: () => boolean = () => false;
/** A manual check owns the update until it is answered: main.tsx doesn't apply it on its own meanwhile. */
let manualCheck = false;
/** Saves in flight (React Query mutations), reported by the shell. */
let saving = 0;

export function noteRegistration(reg: ServiceWorkerRegistration): void {
  registration = reg;
}

export function noteUpdateWaiting(): void {
  waitingNoticed = true;
}

export function setUpdateApplier(apply: () => boolean): void {
  applyWaiting = apply;
}

export function isManualCheckRunning(): boolean {
  return manualCheck;
}

export function noteSaving(count: number): void {
  saving = count;
}

export function savingCount(): number {
  return saving;
}

export const useUpdateStatus = create<{ status: UpdateStatus }>(() => ({ status: { kind: 'idle' } }));
const setStatus = (status: UpdateStatus) => useUpdateStatus.setState({ status });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A connection that says it is online but doesn't answer must not leave «Buscando…» up for minutes. */
const FETCH_TIMEOUT_MS = 10_000;
const UPDATE_TIMEOUT_MS = 15_000;
/** Whatever path `apply()` takes, the page reloads by then (another tab may already have used the waiting worker). */
const APPLY_FALLBACK_MS = 6_000;

function timeoutSignal(ms: number): AbortSignal | undefined {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  if (typeof AbortController === 'undefined') return undefined;
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

/** Rejects when `promise` takes longer than `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** The build the server serves now; `undefined` when it couldn't be reached. */
async function fetchRemoteVersion(): Promise<number | null | undefined> {
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store', signal: timeoutSignal(FETCH_TIMEOUT_MS) });
    if (!response.ok) return undefined;
    return parseVersionFile(await response.json())?.version ?? null;
  } catch {
    return undefined;
  }
}

/** Waits (up to `ms`) for a new service worker to finish installing; true when one is waiting. */
async function waitForWaiting(reg: ServiceWorkerRegistration, ms: number): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (reg.waiting) return true;
    if (!reg.installing) {
      // update() can resolve a moment before `installing` shows up: give it a breath before giving up.
      await sleep(150);
      if (!reg.installing && !reg.waiting) return false;
    }
    await sleep(150);
  }
  return Boolean(reg.waiting);
}

let pendingApply: (() => void) | null = null;

/** Message first (so it can be read), then the fresh service worker takes over and the page reloads once. */
async function apply(version: number | null, reg: ServiceWorkerRegistration | null): Promise<void> {
  setStatus({ kind: 'applying', version });
  await sleep(900);
  // Safety net for every path below: if no controller change comes (no worker left waiting), reload anyway.
  setTimeout(() => window.location.reload(), APPLY_FALLBACK_MS);
  // workbox-window marks the update as waiting ~200 ms after it installs: give it the chance to apply its way.
  if (waitingNoticed && applyWaiting()) return;
  const worker = reg?.waiting;
  if (worker && 'serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
    worker.postMessage({ type: 'SKIP_WAITING' });
    return;
  }
  window.location.reload();
}

/**
 * Looks for a new build now. `needsConfirm` is asked only when there is one: inside the studio or with a save in
 * flight the person decides (`confirmUpdate` / `postponeUpdate`); elsewhere it applies at once.
 */
export async function checkForUpdate(needsConfirm: () => boolean): Promise<void> {
  const current = useUpdateStatus.getState().status.kind;
  if (current === 'checking' || current === 'downloading' || current === 'applying') return;
  setStatus({ kind: 'checking' });
  manualCheck = true;
  let keepOwnership = false;
  try {
    if (import.meta.env.DEV) {
      await sleep(400);
      setStatus({ kind: 'dev' });
      return;
    }
    if (!navigator.onLine) {
      setStatus({ kind: 'offline' });
      return;
    }
    const reg =
      registration ??
      ('serviceWorker' in navigator ? ((await navigator.serviceWorker.getRegistration().catch(() => undefined)) ?? null) : null);
    const remote = await fetchRemoteVersion();

    if (!reg) {
      // No service worker (old browser, private mode): a plain reload gets the newest build.
      if (remote === undefined) {
        setStatus(navigator.onLine ? { kind: 'error' } : { kind: 'offline' });
        return;
      }
      const decision = decideUpdate({ current: APP_VERSION, remote, waiting: false });
      if (decision.kind === 'latest') {
        setStatus(APP_VERSION == null && remote == null ? { kind: 'unsupported' } : { kind: 'latest', version: decision.version });
        return;
      }
      keepOwnership = offer(decision.version, null, needsConfirm);
      return;
    }

    try {
      await withTimeout(reg.update(), UPDATE_TIMEOUT_MS);
    } catch {
      // A worker already downloading still counts (the timeout only means the answer was slow).
      if (!reg.installing && !reg.waiting) {
        setStatus(navigator.onLine ? { kind: 'error' } : { kind: 'offline' });
        return;
      }
    }
    let waiting = await waitForWaiting(reg, 20_000);
    // Still installing after that (slow connection): a new build is on its way, even with no numbers to compare.
    const decision = decideUpdate({
      current: APP_VERSION,
      remote: remote ?? null,
      waiting: waiting || waitingNoticed,
      installing: Boolean(reg.installing),
    });
    if (decision.kind === 'latest') {
      setStatus({ kind: 'latest', version: decision.version });
      return;
    }
    if (!waiting && !waitingNoticed) {
      // The server has a newer build but it hasn't downloaded yet (slow connection): give it longer.
      setStatus({ kind: 'downloading', version: decision.version });
      waiting = await waitForWaiting(reg, 60_000);
      if (!waiting) {
        setStatus(navigator.onLine ? { kind: 'error' } : { kind: 'offline' });
        return;
      }
    }
    keepOwnership = offer(decision.version, reg, needsConfirm);
  } finally {
    if (!keepOwnership) manualCheck = false;
  }
}

/** Applies now or asks first; true while the question is open (the check keeps the update until answered). */
function offer(version: number | null, reg: ServiceWorkerRegistration | null, needsConfirm: () => boolean): boolean {
  if (needsConfirm()) {
    pendingApply = () => void apply(version, reg);
    setStatus({ kind: 'confirm', version });
    return true;
  }
  void apply(version, reg);
  return true;
}

/** «Actualizar ahora» after the warning. */
export function confirmUpdate(): void {
  const run = pendingApply;
  pendingApply = null;
  run?.();
}

/** «Más tarde»: main.tsx applies it by itself at the next safe moment. */
export function postponeUpdate(): void {
  pendingApply = null;
  manualCheck = false;
  setStatus({ kind: 'later' });
}

/** Back to idle when the menu closes, unless something is in progress or waiting for an answer. */
export function resetUpdateStatus(): void {
  const { kind } = useUpdateStatus.getState().status;
  if (kind === 'confirm') {
    // Closed without answering: same as «Más tarde» (it applies by itself at the next safe moment).
    pendingApply = null;
    manualCheck = false;
    setStatus({ kind: 'idle' });
    return;
  }
  if (kind === 'latest' || kind === 'offline' || kind === 'error' || kind === 'dev' || kind === 'unsupported' || kind === 'later') {
    setStatus({ kind: 'idle' });
  }
}
