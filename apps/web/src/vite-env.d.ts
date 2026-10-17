/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** P2 · Build number of this deploy (vite.config.ts `define`); null on the dev server or without one. */
declare const __APP_VERSION__: number | null;
/** P2 · When this build was made (ISO 8601). */
declare const __APP_BUILD_DATE__: string;
