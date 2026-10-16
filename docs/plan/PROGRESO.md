# One Shoot · Progreso de la implementación

> **Avisos / bloqueos:** ninguno. F18 no está definida en el plan de ideas (ver PREGUNTAS en ESTADO-IMPLEMENTACION.md).

- **Rama:** `feat/plan-completo`
- **Commit de partida:** `6b9e4d3a7115682201f5ae0330e382d0dfa782ef` (main, 2026-10-16 16:05)
- **Planes:** [ideas-one-shoot.md](ideas-one-shoot.md) · [grabacion-calidad-maxima-one-shoot.md](grabacion-calidad-maxima-one-shoot.md)
- **Estado para el usuario:** [ESTADO-IMPLEMENTACION.md](ESTADO-IMPLEMENTACION.md)

## Ahora (2026-10-16 ~19:20)

- **Fase 2 de ideas (F3 + F4 + F17) CERRADA y DESPLEGADA**: main `1cc0a11`, migración `takes` aplicada con copia
  previa, 13 PASS en producción (revertidos).
- Fase 3 empezada SIN commit: migración `20261016020000_review_and_take_notes.sql` (ajuste fino y encaje en
  `takes`; notas sobre la toma), `plan_fase3_checks.sql` (50 PASS locales en total), tipos y demo actualizados.
  Siguiente: pantalla de repaso F5 (apilado / superpuesto, 3 variantes de laboratorio) y notas F6.
- Regla del usuario: cada despliegue = versión funcional de todo lo implementado.

## Hecho

- Grabación pasos 1–6 (desplegados 17:33). Revisiones: 3 rondas.
- Ideas fase 1: F1 archivo vinculado (vincular, sincronizar, selector YouTube|Archivo, duplicados, «con archivo»),
  F2 miembros y «¿Quién eres?». 3 rondas de revisión; ronda 3 sin hallazgos ≥6.
- Ideas fase 2: F3 tomas guardadas (OPFS + fila), pestaña «Tomas», compartir 720p; F4 mejor toma; F17 voz y música
  (mid/side, 3 variantes). 2 rondas de revisión; ronda 2 sin hallazgos ≥6.

## Desplegado

| Fecha y hora | Fase | Commit en main | Despliegue | Migraciones |
| --- | --- | --- | --- | --- |
| 2026-10-16 17:33 | Grabación con calidad máxima, pasos 1–6 | `650b974` | https://kpop-covers-hiyrnba2h-geoian-s-projects.vercel.app (`dpl_Dpa2Mf3tD5FFgR22vwsQ2DdiTMxn`) | ninguna |
| 2026-10-16 18:13 | Ideas fase 1: F1 + F2 | `52f81ba` | https://kpop-covers-rghqkj915-geoian-s-projects.vercel.app (`dpl_BcJX7f2PhTi7q2DsRc3kcYtZYxVP`) | 000000, 000100, 000200 |
| 2026-10-16 19:14 | Ideas fase 2: F3 + F4 + F17 | `1cc0a11` | https://kpop-covers-1i1owoysn-geoian-s-projects.vercel.app (`dpl_4uG9sufPgtrPpJVnUAQ6vXDeTuss`) | 010000 (takes) |

Fase 1: por error se lanzó `vercel --prod` dos veces seguidas desde el mismo commit (dos despliegues idénticos,
el segundo es el activo). Comprobado en un contexto limpio: Ajustes muestra «Miembros del grupo» (0), el estudio
carga vídeo, clips y notas con el botón «Añadir archivo»; todas las peticiones a Supabase 200, sin errores.
Fase 2: en un contexto limpio, la pestaña «Tomas» carga (`takes` 200), el medidor llama a `storage_usage` (200, 0 B
de 1 GB) y la fila «Voz y música» explica que con YouTube no se puede. Sin crear datos.

## Siguiente

1. Fase 3 (F5 repaso con variantes, F6), fase 4 (F7 palmada con variantes, F8, F9), fase 5 (F10).
3. Grupo B1 (F13, F14), B2 (F11, F12), B3 (F16, F15), cada uno con variantes del laboratorio.
4. IA (postura), revisión global, documentos finales.

## Notas para retomar

- Pruebas en navegador: Chrome DevTools MCP con
  `initScript`: `const x=new XMLHttpRequest();x.open('GET','/@fs/C:/Users/iangi/OneDrive/Documentos/GitHub/coverscape-pop/apps/web/e2e/fake-media.js',false);x.send();eval(x.responseText);`
  Servidor demo: preview `web-demo` en http://localhost:5174. Canción de prueba en demo: `/v/4905c4c3-252a-45a5-80ba-19ec3bb2d725`.
- El usuario pidió silenciar el audio en las pruebas (fake-media.js lo hace).
- Hook GateGuard: antes de crear/editar cada archivo por primera vez hay que dar hechos y reintentar.
- Cierre de fase: copia con `execute_sql` (JSON de todas las tablas + storage) a `~/one-shoot-backups/<fecha>/`,
  SQL de vuelta atrás con las definiciones actuales, `apply_migration` en orden, comprobaciones del repo
  convertidas para devolver el registro de PASS en un error final (así nada se guarda), advisors, tipos.
- Despliegue: worktree limpio de main en `C:\Users\iangi\oneshoot-check` (con `.vercel` de la raíz):
  `git merge --no-ff feat/plan-completo`, typecheck/test/build, push, `vercel --prod --yes` UNA vez.
- Supabase tras fase 2: 11 migraciones; 1 grupo, 3 vídeos (1 archivado por el usuario a las 18:29), 3 clips,
  2 notas, 0 miembros, 0 tomas, 0 archivos; buckets `videos` y `takes`.

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
| 2026-10-16 17:33 | Grabación desplegada (main 650b974). |
| 2026-10-16 ~17:50 | F1 + F2 (9ad9fd7), revisiones rondas 1–2 (7644c8c, 0ad9363). |
| 2026-10-16 18:06 | Copia de seguridad de producción; migraciones fase 1 aplicadas y verificadas. |
| 2026-10-16 18:13 | Fase 1 de ideas desplegada (main 52f81ba). |
| 2026-10-16 ~18:50 | Fase 2: revisión ronda 1 (BD, cliente, voz), correcciones, commit 683e39c; ronda 2 y 3822163. |
| 2026-10-16 19:09 | Copia de producción; migración `takes` aplicada y verificada. |
| 2026-10-16 19:14 | Fase 2 de ideas desplegada (main 1cc0a11). |
