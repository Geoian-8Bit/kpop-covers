# Coverscape — notas para agentes

- Monorepo pnpm: `apps/web` (React 19 + Vite 7 + Tailwind v4 + motion), `packages/shared` (TS puro + vitest), `supabase/`.
- Comandos: `pnpm dev` · `pnpm typecheck` · `pnpm test` · `pnpm build`.
- Supabase project ref: `pevbjaowyctqqldvzovz`. Cambios de esquema = nueva migración en `supabase/migrations/` + regenerar
  `packages/shared/src/database.types.ts`. Comprobar advisors tras DDL.
- Todo acceso a datos pasa por RLS (`private.is_crew_member`). No usar service role en el cliente.
- Estado del reproductor solo en `apps/web/src/player/store.ts`; los motores (`engine.ts`) no guardan estado de UI.
- Animaciones: usar presets de `src/lib/motion.ts` (`jelly`, `snappy`, `soft`). Colores solo vía tokens de `index.css`.
- Copys de la UI en español.
