import { MAX_CLOUD_UPLOAD_BYTES } from '@coverscape/shared';

/**
 * Data access behind one interface so the app can run against Supabase (normal) or against
 * browser storage (local demo: `VITE_DEMO=true` in dev only – no login, nothing leaves the device).
 */
export const IS_DEMO = import.meta.env.DEV && import.meta.env.VITE_DEMO === 'true';
export const DEMO_USER_ID = '00000000-0000-4000-8000-000000000001';

/**
 * 13 · Biggest file the group's cloud takes (50 MB, free plan). Only the local demo can lower it to try the reduced
 * copy with small files: `localStorage['oneshoot.dev.cloudLimitMB'] = '5'`.
 */
export function cloudLimitBytes(): number {
  if (IS_DEMO) {
    try {
      const mb = Number(localStorage.getItem('oneshoot.dev.cloudLimitMB'));
      if (mb >= 1 && mb < 50) return Math.round(mb * 1024 * 1024);
    } catch {
      /* the real limit */
    }
  }
  return MAX_CLOUD_UPLOAD_BYTES;
}
