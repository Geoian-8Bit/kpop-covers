import { PostgrestClient } from '@supabase/postgrest-js';
import type { StorageClient, StorageError } from '@supabase/storage-js';
import type { Database } from '@coverscape/shared';
import { IS_DEMO } from './backend/mode';
import {
  createSessionRefresher,
  createSessionStore,
  legacyStorageKey,
  type LegacySession,
} from './backend/session';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(url && key);

const supabaseKey = key ?? 'missing-key';
/** Same base supabase-js built (`new URL(path, url + '/')`), so every endpoint keeps its exact URL. */
const baseUrl = new URL((url ?? 'http://localhost').trim().replace(/\/?$/, '/'));

/** REQ-11 · The login era's session (no sign-in; its token is refreshed as auth-js did, see session.ts). */
export const legacySession = createSessionStore(legacyStorageKey(url));

const refresher = createSessionRefresher(legacySession, {
  authUrl: new URL('auth/v1', baseUrl).href,
  apiKey: supabaseKey,
  lockName: legacySession.key && `lock:${legacySession.key}`,
});
// REQ-11 · At startup, like supabase-js's `_recoverAndRefresh`: a session about to expire is refreshed before the
// first request needs its token (those requests wait for it). Never in the local demo, whose env may still point at
// the real project.
const refreshing = isSupabaseConfigured && !IS_DEMO;
const startup = refreshing ? refresher.ensureFresh() : null;
/**
 * REQ-11 · The startup refresh while it runs, else null. The shell shows the stored user only after it, as it showed
 * nobody until `getSession()` (which waited for that refresh) answered: a refused refresh never shows the user.
 */
export const startupRefresh: Promise<void> | null = startup && refresher.pending() ? startup : null;

/**
 * REQ-11 · The token for `Authorization`: the old session's JWT while it is valid (refreshed first when it is about
 * to expire), else the publishable key (role `anon`, which RLS treats like `authenticated` inside the group, except
 * for reading profiles).
 */
/** REQ-11 · Revokes a signed-out session on the server, as supabase-js's signOut() did (best effort, see session.ts). */
export function revokeSession(session: LegacySession | null): Promise<void> {
  return refreshing ? refresher.revoke(session) : Promise.resolve();
}

export async function bearerToken(): Promise<string> {
  if (refreshing) await refresher.ensureFresh();
  return legacySession.accessToken() ?? supabaseKey;
}

/**
 * REQ-11 · What supabase-js's `fetchWithAuth` did on every request, minus `auth.getSession()` (a lock and a storage
 * read per request): `apikey` and `Authorization` unless the caller set them.
 */
export function createAuthFetch(
  apiKey: string,
  token: () => string | Promise<string>,
  baseFetch: typeof fetch = (...args) => fetch(...args),
): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    if (!headers.has('apikey')) headers.set('apikey', apiKey);
    if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${await token()}`);
    return baseFetch(input, { ...init, headers });
  };
}

const authFetch = createAuthFetch(supabaseKey, bearerToken);

/**
 * REQ-11 · Tables and RPCs straight through postgrest-js (`from`, `rpc`): the same requests supabase-js made, without
 * shipping auth, realtime and functions on the critical path.
 */
export const supabase = new PostgrestClient<Database>(new URL('rest/v1', baseUrl).href, { fetch: authFetch });

/**
 * REQ-11 · Keeps a failed lazy load from reaching the `vite:preloadError` listener (main.tsx), which reloads the page:
 * in a build, Vite's preload helper fires that event when a dynamic import fails, and before storage-js was split out
 * a failed Storage call never reloaded anything. While `quiet` loads are pending, every such event is held back
 * (on window, ahead of the app's listener) and, once they settle, the events whose error is not the one
 * a quiet load failed with are dispatched again, so any other failed chunk still reaches the listener.
 */
export function createPreloadErrorGuard(target: EventTarget = window) {
  type PreloadErrorEvent = Event & { payload?: unknown };
  let pending = 0;
  let held: PreloadErrorEvent[] = [];
  const own = new Set<unknown>();
  const replayed = new WeakSet<Event>();
  // Registered when the module loads, before main.tsx adds its listener, and in the capture phase, which runs first
  // at the target anyway.
  target.addEventListener(
    'vite:preloadError',
    (event) => {
      if (pending === 0 || replayed.has(event)) return;
      event.stopImmediatePropagation();
      held.push(event);
    },
    { capture: true },
  );

  const settle = () => {
    if (--pending > 0) return;
    const events = held;
    held = [];
    for (const event of events) {
      if (own.has(event.payload)) continue;
      const again: PreloadErrorEvent = new Event('vite:preloadError', { cancelable: true });
      again.payload = event.payload;
      replayed.add(again);
      target.dispatchEvent(again);
    }
    own.clear();
  };

  return {
    quiet<T>(load: () => Promise<T>): Promise<T> {
      pending++;
      return load().then(
        (value) => {
          settle();
          return value;
        },
        (error: unknown) => {
          own.add(error);
          settle();
          throw error;
        },
      );
    },
  };
}

const preloadGuard = typeof window === 'undefined' ? null : createPreloadErrorGuard();
let storageClient: Promise<StorageClient> | null = null;

/**
 * REQ-11 · storage-js on first use only (signing, uploads). A failed load is forgotten so the next try loads again,
 * and it never reloads the page (createPreloadErrorGuard).
 */
export function loadStorage(): Promise<StorageClient> {
  // `.then(({ … }))` right after import() lets the build keep only StorageClient from the chunk.
  const load = () => import('@supabase/storage-js').then(({ StorageClient }) => StorageClient);
  storageClient ??= (preloadGuard ? preloadGuard.quiet(load) : load())
    .then((Client) => new Client(new URL('storage/v1', baseUrl).href, {}, authFetch))
    .catch((error: unknown) => {
      storageClient = null;
      throw error;
    });
  return storageClient;
}

/**
 * REQ-11 · Runs a Storage call on the lazily loaded client. When storage-js itself can't be fetched (offline), the
 * call answers like storage-js does for a failed request: `{ data: null, error }` with a «Failed to fetch» unknown
 * error, so `friendlyError` and `uploadFailure` still read it as «Sin conexión».
 */
export async function withStorage<R>(
  run: (storage: StorageClient) => Promise<R>,
): Promise<R | { data: null; error: StorageError }> {
  let storage: StorageClient;
  try {
    storage = await loadStorage();
  } catch (cause) {
    const error = Object.assign(new Error('Failed to fetch'), {
      name: 'StorageUnknownError',
      status: undefined,
      originalError: cause,
    });
    return { data: null, error: error as unknown as StorageError };
  }
  return run(storage);
}

export const VIDEO_BUCKET = 'videos';
/** F3: shared takes (reduced 720p copies), private like the videos. */
export const TAKE_BUCKET = 'takes';

/** An error whose message is already Spanish copy for the group: `friendlyError` shows it as is. */
export class FriendlyError extends Error {}

/** Maps Postgres / auth errors to short Spanish copy for toasts. */
export function friendlyError(error: unknown): string {
  if (error instanceof FriendlyError) return error.message;
  const message =
    typeof error === 'object' && error && 'message' in error
      ? String((error as { message: unknown }).message)
      : '';
  if (/invalid login credentials/i.test(message)) return 'Email o contraseña incorrectos.';
  if (/email not confirmed/i.test(message)) return 'Confirma tu email antes de entrar.';
  if (/user already registered/i.test(message)) return 'Ese email ya tiene cuenta. Inicia sesión.';
  if (/password should be at least/i.test(message)) return 'La contraseña necesita al menos 6 caracteres.';
  if (/invalid invite code/i.test(message)) return 'Código de invitación no válido.';
  if (/rate limit/i.test(message)) return 'Demasiados intentos. Espera un momento.';
  if (/payload too large|exceeded the maximum/i.test(message))
    return 'Archivo demasiado grande para la nube.';
  if (/failed to fetch|network/i.test(message)) return 'Sin conexión. Revisa tu red.';
  if (/videos_crew_youtube_key/.test(message)) return 'Ese vídeo ya está en la biblioteca.';
  if (/clips_video_range_key/.test(message)) return 'Ya hay un clip guardado con este mismo tramo.';
  if (/notes_video_at_body_key/.test(message)) return 'Esa nota ya está guardada.';
  if (/members_crew_name_key/.test(message)) return 'Ya hay alguien con ese nombre en el grupo.';
  if (/members_cap_reached/.test(message)) return 'El grupo ya tiene el máximo de miembros.';
  if (/storage_path_locked/.test(message)) return 'Ese archivo no se puede cambiar.';
  if (/file_locked/.test(message))
    return 'Otro móvil ya ha vinculado un archivo a este vídeo. Cierra y vuelve a abrirlo para verlo.';
  if (/videos_cap_reached|clips_cap_reached|notes_cap_reached/.test(message))
    return 'La biblioteca está llena. Borra algo antes de añadir más.';
  if (/bulk_delete_blocked/.test(message)) return 'Solo se puede borrar de uno en uno.';
  if (/takes_cap_reached/.test(message)) return 'El grupo ya tiene el máximo de tomas guardadas.';
  if (/shared_file_missing/.test(message)) return 'La copia no llegó a la nube. Vuelve a pulsar «Compartir».';
  if (/shared_path_locked/.test(message)) return 'Esta toma ya está compartida.';
  if (/takes_one_best_key/.test(message))
    return 'Otro móvil acaba de cambiar la estrella. Vuelve a intentarlo.';
  if (/notes_category_check/.test(message)) return 'Esa categoría de nota no existe. Elige otra.';
  if (/notes_sketch_shape/.test(message)) return 'El dibujo no cabe en la nota. Prueba con menos trazos.';
  if (/notes_status_check/.test(message)) return 'Ese estado de nota no existe.';
  if (/notes_take_seconds_range/.test(message)) return 'Ese momento queda fuera de la toma.';
  if (/takes_sync_adjust_range/.test(message)) return 'El ajuste fino va de −0,3 a +0,3 s.';
  if (/takes_fit_range/.test(message)) return 'Ese encaje se sale de los límites. Pulsa «Recolocar».';
  if (/video .* not found/i.test(message)) return 'Este vídeo ya no está en la biblioteca.';
  if (/PGRST116|0 rows|JSON object requested/i.test(message))
    return 'Esto ya no existe: otro móvil lo ha borrado.';
  // Never show raw database text (constraint names, policies…) to the group.
  if (message) console.error('[friendlyError]', error);
  return 'Algo salió mal. Inténtalo otra vez.';
}
