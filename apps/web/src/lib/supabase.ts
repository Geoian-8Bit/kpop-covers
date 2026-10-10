import { createClient } from '@supabase/supabase-js';
import type { Database } from '@coverscape/shared';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(url && key);

export const supabase = createClient<Database>(url ?? 'http://localhost', key ?? 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const VIDEO_BUCKET = 'videos';

/** Maps Postgres / auth errors to short Spanish copy for toasts. */
export function friendlyError(error: unknown): string {
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
  return message || 'Algo salió mal. Inténtalo otra vez.';
}
