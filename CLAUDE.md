# One Shoot — notas para agentes

- Monorepo pnpm: `apps/web` (React 19 + Vite 7 + Tailwind v4 + motion), `packages/shared` (TS puro + vitest), `supabase/`.
- Comandos: `pnpm dev` · `pnpm typecheck` · `pnpm test` · `pnpm build`.
- Supabase project ref: `pevbjaowyctqqldvzovz`. Cambios de esquema = nueva migración en `supabase/migrations/` + regenerar
  `packages/shared/src/database.types.ts`. Comprobar advisors tras DDL.
- Sin login: el cliente es `anon` y RLS lo limita al grupo `private.default_group()` (el crew más antiguo). No usar
  service role en el cliente.
- Borrar = archivar: un trigger convierte el `delete` del cliente en `archived_at`; las políticas ocultan lo archivado
  y el cliente nunca borra archivos del bucket. Comprobaciones en `supabase/tests/archive_checks.sql`.
- Búsqueda de YouTube en `apps/web/api/youtube-search.ts` (URL canónica + límite por IP); la clave solo en el servidor.
- Estado del reproductor solo en `apps/web/src/player/store.ts`; los motores (`engine.ts`) no guardan estado de UI.
- Animaciones: usar presets de `src/lib/motion.ts` (`jelly`, `snappy`, `soft`). Colores solo vía tokens de `index.css`.
- Copys de la UI en español.
