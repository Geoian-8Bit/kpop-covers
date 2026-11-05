# One Shoot — notas para agentes

- Monorepo pnpm: `apps/web` (React 19 + Vite 7 + Tailwind v4 + motion), `packages/shared` (TS puro + vitest), `supabase/`.
- Comandos: `pnpm dev` · `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build` · `pnpm check:unused` (knip) ·
  `pnpm check:size` (≤ 600 líneas por fichero). Mapa del código en `docs/ARCHITECTURE.md`.
- Supabase project ref: `pevbjaowyctqqldvzovz`. Cambios de esquema = nueva migración en `supabase/migrations/` + regenerar
  `packages/shared/src/database.types.ts`. Comprobar advisors tras DDL.
- Sin login: el cliente es `anon` y RLS lo limita al grupo `private.default_group()` (el crew más antiguo). No usar
  service role en el cliente.
- Borrar = archivar: un trigger convierte el `delete` del cliente en `archived_at`; las políticas ocultan lo archivado
  y el cliente nunca borra archivos del bucket. Comprobaciones en `supabase/tests/archive_checks.sql`.
- Búsqueda de YouTube en `apps/web/api/youtube-search.ts` (URL canónica + límite por IP); la clave solo en el servidor.
- Estado del reproductor solo en `apps/web/src/player/store.ts` (barril de `playerStore.ts` y `reviewStore.ts`); los
  motores (`engine.ts`) no guardan estado de UI.
- Datos: `features` → `data/*` (React Query) → `lib/backend/<dominio>` (fachada `IS_DEMO ? demo : supabase`). Importar
  el dominio, no el barril `@/lib/backend` (solo tipos).
- Antes de copiar un ayudante, mira `src/lib/` (`async`, `audioCtor`, `deviceShape`, `useNow`, `useSize`, `lru`,
  `autoHideChrome`, `orientation`) y `@coverscape/shared` (`clamp`, `formatBytes`…).
- Animaciones: usar presets de `src/lib/motion.ts` (`jelly`, `snappy`, `soft`). Colores solo vía tokens de `index.css`.
- Copys de la UI en español.
