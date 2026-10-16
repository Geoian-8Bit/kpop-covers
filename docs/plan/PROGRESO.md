# One Shoot · Progreso de la implementación

> **Avisos / bloqueos:** ninguno. F18 no está definida en el plan de ideas (ver PREGUNTAS en ESTADO-IMPLEMENTACION.md).

- **Rama:** `feat/plan-completo`
- **Commit de partida:** `6b9e4d3a7115682201f5ae0330e382d0dfa782ef` (main, 2026-10-16 16:05)
- **Planes:** [ideas-one-shoot.md](ideas-one-shoot.md) · [grabacion-calidad-maxima-one-shoot.md](grabacion-calidad-maxima-one-shoot.md)
- **Estado para el usuario:** [ESTADO-IMPLEMENTACION.md](ESTADO-IMPLEMENTACION.md)

## Ahora (2026-10-16 ~19:40)

- Grabación pasos 1–6 TERMINADOS en b59550e (verde en worktree limpio `C:\Users\iangi\oneshoot-check`).
  Revisiones en marcha: pasos 5–6 + laboratorio (ronda 1) y verificación de correcciones (ronda 3).
  Cuando acaben y se corrija lo ≥6: **cierre de fase grabación** = llevar a `main` SOLO hasta b59550e (+ commits
  de corrección de grabación, por cherry-pick si van después de 9ad9fd7), push, `vercel --prod` DESDE LA RAÍZ.
- **Grabación DESPLEGADA** (main 650b974, 17:33). main = b59550e + cherry-pick de 058e4bf. Worktree limpio de main
  en `C:\Users\iangi\oneshoot-check` (con `.vercel` copiado de la raíz): construir y desplegar desde ahí.
- Ideas fase 1 (F1+F2) en 9ad9fd7 (rama). Revisión BD hecha: 🔴7 corregido sin commit (migración nueva
  `20261016000100_linked_file_guard.sql`, cliente releer fila antes de vincular, «Cambiar archivo» elige primero);
  40 PASS locales. Revisión de cliente de F1/F2 EN MARCHA. Luego: corregir, commit, ronda 2, aplicar migraciones
  fase 1 (000000 + 000100) en Supabase con copia previa, regenerar tipos, merge a main, desplegar.
- Ideas fase 2: migración `20261016010000_takes.sql` + `plan_fase2_checks.sql` escritas (37 PASS locales).
  Falta UI de F3/F4 y F17.
- Regla del usuario: cada despliegue = versión funcional de todo lo implementado.

## Hecho

- Grabación pasos 1–5 programados y probados en navegador con cámara simulada (`apps/web/e2e/fake-media.js`).
  Commits: aef8bb5 (paso 1), 84efe01 (paso 2), ca87fcd (pasos 3–4 + correcciones), 34776d1 (paso 5).
- Revisiones: pasos 1–2 (2 rondas), pasos 3–4 (1 ronda), en `docs/plan/revisiones/`.
- Ideas fase 1: migración `20261016000000_linked_file_and_members.sql` + `supabase/tests/plan_fase1_checks.sql`
  (28 PASS en local con `pnpm db:test`). Tipos a mano en `database.types.ts`. `packages/shared/src/linking.ts`
  (F1, sin tests todavía). Capa de datos de F2 pendiente.

## Desplegado

| Fecha y hora | Fase | Commit en main | Despliegue | Migraciones |
| --- | --- | --- | --- | --- |
| 2026-10-16 17:33 | Grabación con calidad máxima, pasos 1–6 | `650b974` | https://kpop-covers-hiyrnba2h-geoian-s-projects.vercel.app (`dpl_Dpa2Mf3tD5FFgR22vwsQ2DdiTMxn`) | ninguna |

Comprobado: estado «Ready», https://kpop-covers.vercel.app responde 200 y en un navegador limpio carga la versión
nueva (Ajustes + laboratorio) con los datos reales. Un navegador con una versión muy antigua en caché ve la vieja
hasta que el service worker se actualiza (sale el aviso de actualización fuera del estudio).

## Siguiente

1. Integrar panel de ajustes (variante por `useDesignVariant('record-settings')`), rejilla, nivel, R3; probar;
   revisar pasos 5–6; commit.
2. **Cierre de fase grabación (pasos 1–6 juntos, ver DECISIONES):** sin migraciones → typecheck/test/build,
   merge a main, push, `vercel --prod` desde apps/web, comprobar, registrar.
3. Ideas fase 1: F1 (vincular archivo, sincronizar, selector YouTube|Archivo, duplicados, «con archivo»),
   F2 (miembros, «¿Quién eres?»), tests de linking.ts. Aplicar migración en Supabase con copia previa
   (copia = volcado JSON por tabla con execute_sql a `~/one-shoot-backups/`).
4. Fases 2–5, B1–B3, IA.

## Notas para retomar

- Pruebas en navegador: Chrome DevTools MCP (página 2) con
  `initScript`: `const x=new XMLHttpRequest();x.open('GET','/@fs/C:/Users/iangi/OneDrive/Documentos/GitHub/coverscape-pop/apps/web/e2e/fake-media.js',false);x.send();eval(x.responseText);`
  Servidor demo: preview `web-demo` en http://localhost:5174. Canción de prueba en demo: `/v/4905c4c3-252a-45a5-80ba-19ec3bb2d725`.
- El usuario pidió silenciar el audio en las pruebas (fake-media.js lo hace).
- Hook GateGuard: antes de crear/editar cada archivo por primera vez hay que dar hechos y reintentar.
- Supabase: 7 migraciones remotas = las 7 locales (nombres iguales, versiones distintas). 1 grupo, 3 vídeos,
  3 clips, 2 notas, 0 objetos en storage (16-10 16:10).

## Registro

| Fecha y hora | Qué |
| --- | --- |
| 2026-10-16 16:05 | Inicio. Rama `feat/plan-completo` desde `6b9e4d3`. |
| 2026-10-16 16:30 | Arnés local de migraciones (`pnpm db:test`, PGlite). |
| 2026-10-16 16:45 | Paso 1 de grabación (aef8bb5). |
| 2026-10-16 17:05 | Paso 2 de grabación (84efe01). |
| 2026-10-16 17:50 | Pasos 3–4 + correcciones de revisiones (ca87fcd). |
| 2026-10-16 18:10 | Paso 5 (34776d1). Migración fase 1 de ideas escrita. |
| 2026-10-16 18:40 | Laboratorio de diseño + /ajustes (subagente). Correcciones ronda 2. |
