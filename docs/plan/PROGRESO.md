# One Shoot · Progreso de la implementación

> **Avisos / bloqueos:** ninguno. F18 no está definida en el plan de ideas (ver PREGUNTAS en ESTADO-IMPLEMENTACION.md).
> La revisión global no encontró ningún hallazgo de nota 6 o más en base de datos.

- **Rama:** `feat/plan-completo`
- **Commit de partida:** `6b9e4d3a7115682201f5ae0330e382d0dfa782ef` (main, 2026-10-16 16:05)
- **Planes:** [ideas-one-shoot.md](ideas-one-shoot.md) · [grabacion-calidad-maxima-one-shoot.md](grabacion-calidad-maxima-one-shoot.md)
- **Estado para el usuario:** [ESTADO-IMPLEMENTACION.md](ESTADO-IMPLEMENTACION.md)

## Ahora (2026-10-17 02:50): todo hecho

- **Plan completo desplegado.** Última versión: main `d75b994`, 17-10 02:47.
- **Revisión global hecha** (funcional, base de datos, rendimiento y accesibilidad), con lo ≥6 corregido.
- **Verificación manual en producción hecha**, con datos «PRUEBA» ya archivados (ESTADO, apartado 9).
- **Migración `20261017010000_close_poll_live_rank`** aplicada con copia previa en
  `~/one-shoot-backups/20261017-0215-close-poll/`.
- **Queda para el usuario:** pruebas en los móviles (cámara y micro), PREGUNTAS 1 y 2 y lo <6 (ESTADO, apartado 5).
  El texto del correo está al final de ESTADO.
- Regla del usuario: cada despliegue = versión funcional de todo lo implementado.
- Regla del usuario: **todas las pruebas en silencio** (también producción): el demo está silenciado con
  `apps/web/src/lib/devSilence.ts`; en producción, página en blanco y navegar con un script que silencia todo.

## Hecho

- Grabación pasos 1–6 (desplegados 17:33). Revisiones: 3 rondas.
- Ideas fase 1: F1 archivo vinculado (vincular, sincronizar, selector YouTube|Archivo, duplicados, «con archivo»),
  F2 miembros y «¿Quién eres?». 3 rondas de revisión; ronda 3 sin hallazgos ≥6.
- Ideas fase 2: F3 tomas guardadas (OPFS + fila), pestaña «Tomas», compartir 720p; F4 mejor toma; F17 voz y música
  (mid/side, 3 variantes). 2 rondas de revisión; ronda 2 sin hallazgos ≥6.
- Fase 3 y bolsas (desplegadas 21:58): F5 repaso (apilado y superpuesto), F6 notas sobre la toma, F7 aplauso,
  F13 bolsas, F14 Random Play Dance. Una ronda de revisión por feature; correcciones en `cfc6296` y `7bd80cd`/`f666c1b`.
- Fase final (desplegada 17-10 00:01): F8 clips en tomas, F9 zoom, F10 seguir a un bailarín y prueba de postura,
  F11 votaciones, F12 lista de deseos, F15 reacciones, F16 cuenta atrás. Una ronda de revisión por feature (B2 y B3
  en informes separados); correcciones en `675a775` y `85d6bf6`. Lo que queda, en ESTADO apartado 5.

## Desplegado

| Fecha y hora | Fase | Commit en main | Despliegue | Migraciones |
| --- | --- | --- | --- | --- |
| 2026-10-16 17:33 | Grabación con calidad máxima, pasos 1–6 | `650b974` | https://kpop-covers-hiyrnba2h-geoian-s-projects.vercel.app (`dpl_Dpa2Mf3tD5FFgR22vwsQ2DdiTMxn`) | ninguna |
| 2026-10-16 18:13 | Ideas fase 1: F1 + F2 | `52f81ba` | https://kpop-covers-rghqkj915-geoian-s-projects.vercel.app (`dpl_BcJX7f2PhTi7q2DsRc3kcYtZYxVP`) | 000000, 000100, 000200 |
| 2026-10-16 19:14 | Ideas fase 2: F3 + F4 + F17 | `1cc0a11` | https://kpop-covers-1i1owoysn-geoian-s-projects.vercel.app (`dpl_4uG9sufPgtrPpJVnUAQ6vXDeTuss`) | 010000 (takes) |
| 2026-10-16 21:49 | **Arreglo urgente**: abrir un clip colgaba el estudio | `0a005cc` | https://kpop-covers-9xqdd74qd-geoian-s-projects.vercel.app (`dpl_Cwp2GZC2hzfztUY91Lfs2k9TiJxr`) | ninguna |
| 2026-10-16 21:58 | Fase 3 (F5, F6) + F7 + B1 (F13, F14) | `dfcb9e3` | https://kpop-covers-6lpf2hi7o-geoian-s-projects.vercel.app (`dpl_VYFfFjLRDHJyKtEvvmM4CNJW9yz3`) | 020000, 030000, 035000 |
| 2026-10-17 00:01 | **Fase final**: F8, F9, F10, F11, F12, F15, F16 (revisión ronda 1 incluida) | `db091db` | https://kpop-covers-5j6ac0lnw-geoian-s-projects.vercel.app (id de despliegue no anotado) | 040000, 050000, 060000, 070000, 080000 |

Fase 1: por error se lanzó `vercel --prod` dos veces seguidas desde el mismo commit (dos despliegues idénticos,
el segundo es el activo). Comprobado en un contexto limpio: Ajustes muestra «Miembros del grupo» (0), el estudio
carga vídeo, clips y notas con el botón «Añadir archivo»; todas las peticiones a Supabase 200, sin errores.
Fase 2: en un contexto limpio, la pestaña «Tomas» carga (`takes` 200), el medidor llama a `storage_usage` (200, 0 B
de 1 GB) y la fila «Voz y música» explica que con YouTube no se puede. Sin crear datos.

**Arreglo urgente (21:49):** comprobando producción vi que abrir un clip (`/v/…?clip=…`) mostraba «Algo se ha
torcido» (React #185, bucle de renderizado). Venía del grabador: un selector de zustand creaba un objeto nuevo en
cada lectura y, con el bucle A–B puesto, el estudio entraba en bucle. Estaba desde el commit de partida. Se desplegó
solo esa corrección (2 líneas) y se comprobó que el clip se aplica sin errores.

**Fase 3 + F7 + B1 (21:58):** comprobado en un contexto limpio y silenciado: /bolsas carga, el estudio con clip no
falla, la pestaña Tomas responde. Las comprobaciones de BD pasaron en producción (5 de fase 3 y 10 de B1, todo
revertido; después 0 bolsas, 0 sorteos, 0 pistas).

**Fase final (00:01):** las migraciones 040000 a 070000 se aplicaron a las 23:50 con copia previa, y la 080000 a las
00:00. Verificación en producción, todo revertido: F11/F12 13 PASS, F15/F16 5 PASS, F10 6 PASS, archivado 13 PASS.
Después, los datos no cambian: 3 vídeos, 3 clips, 2 notas, 0 en las tablas nuevas, 0 archivos.

## Siguiente

1. **Cerrar la revisión global.** Aplicar `20261017010000_close_poll_live_rank` (copia previa, `pnpm db:test`,
   comprobación en producción revertida, advisors y tipos). Después, convertir en pendientes los hallazgos de
   accesibilidad y de rendimiento que sigan abiertos (ver ESTADO apartado 8).
2. **Pasada de rendimiento** (los hallazgos P1 a P15 de `revisiones/global-rendimiento.md`; P1, el repaso que se
   repinta 60 veces por segundo, es el de mayor nota).
3. **Verificación completa en producción.** Crear datos «PRUEBA …», probar cada fase en el móvil y archivar los
   datos de prueba al acabar. Los pasos de cada fase están en ESTADO apartado 2.

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
- Supabase tras la fase final: 19 migraciones en el repositorio (de `000000` a `080000`), más
  `20261017010000_close_poll_live_rank` escrita y sin aplicar. Datos tras la verificación: 3 vídeos, 3 clips,
  2 notas, 0 en las tablas nuevas, 0 archivos; buckets `videos` y `takes`.

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
| 2026-10-16 21:12 | Fase 3 y bolsas: F5, F6, F7, F13, F14 (cfc6296). Revisión ronda 1 de F5, F6 y F7 incluida. |
| 2026-10-16 21:26 | Revisión ronda 1 de base de datos de bolsas (7bd80cd). Historial solo lo escribe el sorteo. |
| 2026-10-16 21:38 | Demo local sin sonido (7ef71f6). |
| 2026-10-16 21:48 | Revisión ronda 1 de interfaz de Random Play Dance (f666c1b). |
| 2026-10-16 21:48 | Arreglo del bucle del grabador (dd0e607; en main como 0a005cc). |
| 2026-10-16 21:49 | Arreglo urgente desplegado (main 0a005cc, React #185 en la página del clip). |
| 2026-10-16 21:56 | Merge en main de la fase 3 (dfcb9e3). |
| 2026-10-16 21:58 | Fase 3 + F7 + B1 desplegada (main dfcb9e3). |
| 2026-10-16 21:59 | Demo: el envoltorio de silencio captura el listo de YouTube (998131b). |
| 2026-10-16 22:00 | Plan actualizado: fase 3 y bolsas desplegadas (be70973). |
| 2026-10-16 23:07 | Fase final: F8–F16 (675a775): clips en tomas, zoom, seguir a un bailarín y prueba de postura, votaciones, lista de deseos, eventos y reacciones. Revisión ronda 1 de los seis. |
| 2026-10-16 23:46 | Copia de seguridad de producción en `~/one-shoot-backups/20261016-2346-final/`. |
| 2026-10-16 23:50 | Migraciones 040000, 050000, 060000 y 070000 aplicadas y verificadas (todo revertido). |
| 2026-10-16 23:57 | Revisión ronda 1 de F10 y de F11, y arreglo de `close_poll` con cero votos (85d6bf6). |
| 2026-10-17 00:00 | Migración 080000 (`close_poll_zero_votes`) aplicada; idempotente. |
| 2026-10-17 00:01 | Fase final desplegada (main db091db): https://kpop-covers-5j6ac0lnw-geoian-s-projects.vercel.app |
| 2026-10-17 00:12 | Revisión global: informe de accesibilidad (`global-accesibilidad.md`). |
| 2026-10-17 00:13 | Revisión global: informes de base de datos y seguridad (`global-bd-seguridad.md`) y de rendimiento (`global-rendimiento.md`). |
| 2026-10-17 01:50 | Revisión global: informe funcional (`global-funcional.md`); arreglos de accesibilidad (A11Y-01 a 05, 19, 20) y de rendimiento (P1–P4, P8, P10–P12, P15) por subagentes. |
| 2026-10-17 02:10 | Arreglos funcionales (cachés entre funciones, zoom contra seguimiento, aviso de clip inexistente, recuento sin miembros archivados) y migración `close_poll_live_rank` con su prueba (87f7f71). |
| 2026-10-17 02:15 | Copia de seguridad en `~/one-shoot-backups/20261017-0215-close-poll/`. |
| 2026-10-17 02:16 | Migración `close_poll_live_rank` aplicada y verificada en producción (todo revertido). Advisors sin cambios. |
| 2026-10-17 02:20 | Desplegado main 8a472aa: https://kpop-covers-6fgpic6pk-geoian-s-projects.vercel.app |
| 2026-10-17 02:20–02:45 | Verificación manual de todas las funciones en producción con datos «PRUEBA», en silencio; todo archivado al final. |
| 2026-10-17 02:47 | Dos arreglos de la verificación (velocidad «0,75×», foco de «Empezar») desplegados: main d75b994, https://kpop-covers-eqbbx1ujl-geoian-s-projects.vercel.app |
| 2026-10-17 02:50 | Medidas finales: LCP 296 ms, CLS 0,00, Lighthouse 100/100/100. Documentación final y texto del correo en ESTADO. |
| 2026-10-17 ~09:40 | Revisión total de producción: el bucle rAF del reproductor se multiplicaba cada fotograma (24→228 por fotograma en 12 s); clips tocados sin motor, saltos de RPD, recarga tras despliegue, fuentes offline, 404 de chunks, miembros, wake lock (ef0b770). Desplegado main 90dfefe: https://kpop-covers-oh7gdx0hb-geoian-s-projects.vercel.app. Comprobado en silencio: 1 rAF por fotograma, bucle A–B correcto, 0 errores en todas las rutas. |
