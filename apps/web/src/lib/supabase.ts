import { createClient } from '@supabase/supabase-js';
import type { Database } from '@coverscape/shared';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(url && key);

export const supabase = createClient<Database>(url ?? 'http://localhost', key ?? 'missing-key', {
  // No login flow in the app any more, so never parse session tokens out of the URL.
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

export const VIDEO_BUCKET = 'videos';
/** F3: shared takes (reduced 720p copies), private like the videos. */
export const TAKE_BUCKET = 'takes';

/** An error whose message is already Spanish copy for the group: `friendlyError` shows it as is. */
export class FriendlyError extends Error {}

/** Maps Postgres / auth errors to short Spanish copy for toasts. */
export function friendlyError(error: unknown): string {
  if (error instanceof FriendlyError) return error.message;
  const message =
    typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : '';
  if (/invalid login credentials/i.test(message)) return 'Email o contraseña incorrectos.';
  if (/email not confirmed/i.test(message)) return 'Confirma tu email antes de entrar.';
  if (/user already registered/i.test(message)) return 'Ese email ya tiene cuenta. Inicia sesión.';
  if (/password should be at least/i.test(message)) return 'La contraseña necesita al menos 6 caracteres.';
  if (/invalid invite code/i.test(message)) return 'Código de invitación no válido.';
  if (/rate limit/i.test(message)) return 'Demasiados intentos. Espera un momento.';
  if (/payload too large|exceeded the maximum/i.test(message)) return 'Archivo demasiado grande para la nube.';
  if (/failed to fetch|network/i.test(message)) return 'Sin conexión. Revisa tu red.';
  if (/videos_crew_youtube_key/.test(message)) return 'Ese vídeo ya está en la biblioteca.';
  if (/clips_video_range_key/.test(message)) return 'Ya hay un clip guardado con este mismo tramo.';
  if (/notes_video_at_body_key/.test(message)) return 'Esa nota ya está guardada.';
  if (/members_crew_name_key/.test(message)) return 'Ya hay alguien con ese nombre en el grupo.';
  if (/members_cap_reached/.test(message)) return 'El grupo ya tiene el máximo de miembros.';
  if (/storage_path_locked/.test(message)) return 'Ese archivo no se puede cambiar.';
  if (/file_locked/.test(message)) return 'Otro móvil ya ha vinculado un archivo a este vídeo. Cierra y vuelve a abrirlo para verlo.';
  if (/videos_cap_reached|clips_cap_reached|notes_cap_reached/.test(message)) return 'La biblioteca está llena. Borra algo antes de añadir más.';
  if (/bulk_delete_blocked/.test(message)) return 'Solo se puede borrar de uno en uno.';
  // Never show raw database text (constraint names, policies…) to the group.
  if (message) console.error('[friendlyError]', error);
  return 'Algo salió mal. Inténtalo otra vez.';
}
