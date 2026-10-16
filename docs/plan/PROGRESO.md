# One Shoot · Progreso de la implementación

> **Avisos / bloqueos:** ninguno. F18 no está definida en el plan de ideas (ver PREGUNTAS en ESTADO-IMPLEMENTACION.md).

- **Rama:** `feat/plan-completo`
- **Commit de partida:** `6b9e4d3a7115682201f5ae0330e382d0dfa782ef` (main, 2026-10-16 16:05)
- **Planes:** [ideas-one-shoot.md](ideas-one-shoot.md) · [grabacion-calidad-maxima-one-shoot.md](grabacion-calidad-maxima-one-shoot.md)
- **Estado para el usuario:** [ESTADO-IMPLEMENTACION.md](ESTADO-IMPLEMENTACION.md)

## Ahora (2026-10-16 ~18:40)

- Grabación paso 6 (A1 ajustes + R3 calor + laboratorio de diseño): un subagente crea las 3 variantes del panel
  (`features/record/settings/`); el laboratorio y `/ajustes` ya están hechos (sin commit aún). Falta integrar el
  panel en `RecordStudio.tsx`, R3 (aviso de calor), revisar y cerrar.
- Correcciones de la ronda 2 (pasos 1–2) y ronda 1 (pasos 3–4) aplicadas en el árbol de trabajo, sin commit.

## Hecho

- Grabación pasos 1–5 programados y probados en navegador con cámara simulada (`apps/web/e2e/fake-media.js`).
  Commits: aef8bb5 (paso 1), 84efe01 (paso 2), ca87fcd (pasos 3–4 + correcciones), 34776d1 (paso 5).
- Revisiones: pasos 1–2 (2 rondas), pasos 3–4 (1 ronda), en `docs/plan/revisiones/`.
- Ideas fase 1: migración `20261016000000_linked_file_and_members.sql` + `supabase/tests/plan_fase1_checks.sql`
  (28 PASS en local con `pnpm db:test`). Tipos a mano en `database.types.ts`. `packages/shared/src/linking.ts`
  (F1, sin tests todavía). Capa de datos de F2 pendiente.

## Desplegado

_(nada todavía)_

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
