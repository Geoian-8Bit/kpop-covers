# Arquitectura

## Visión general

```
Browser (React SPA, PWA)
 ├─ Supabase Postgres   crews · videos · clips · notes   (RLS: rol anon, solo el grupo por defecto)
 ├─ Supabase Storage    bucket privado `videos/{crew_id}/{video_id}.ext`  (≤ 50 MB, sin borrado desde el cliente)
 ├─ IndexedDB           copia local de cada archivo subido (sin límite de tamaño)
 ├─ YouTube IFrame API  reproducción de vídeos de YouTube (sin descarga)
 ├─ /api/youtube-meta   función Vercel → oEmbed (título, canal, si permite embed)
 └─ /api/youtube-search función Vercel → YouTube Data API v3 (búsqueda; clave solo en el servidor)
```

No hay servidor propio: Supabase es el backend (datos y ficheros) y las dos funciones serverless de
`apps/web/api/` hablan con YouTube. En desarrollo las sirve un middleware de Vite (`vite.config.ts`); sin
`YOUTUBE_API_KEY` la búsqueda devuelve resultados de prueba.

## Capas y carpetas

```
features/*  pantallas y su lógica  ──▶  data/*  React Query  ──▶  lib/backend/<dominio>  ──▶  Supabase | demo
     │                                                              (fachada: IS_DEMO ? demo : supabase)
     └──▶ player/store.ts (estado del reproductor y del repaso, zustand)  ◀──  player/engine.ts (YouTube / <video>)
```

| Carpeta                        | Qué vive ahí                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/features/<área>` | Pantallas por área (biblioteca, estudio, grabador, repaso, tomas, voz, ronda, bolsas, votaciones, eventos, calendario, formaciones…). Las reglas puras van en `*Rules.ts` con su test al lado.                                                                                                                                                                                                                     |
| `apps/web/src/data`            | Consultas y mutaciones de React Query por dominio (`data/videos/` dividido en consultas, mutaciones, subida, pósteres y copia local).                                                                                                                                                                                                                                                                              |
| `apps/web/src/lib/backend`     | Acceso a datos: por dominio una fachada `X.ts` + `X.supabase.ts` + `X.demo.ts`; `types.ts`, `mode.ts` (`IS_DEMO`), `session.ts` (sesiones antiguas), `signedUrls.ts` (memoria de firmas, 6 h), `upload.ts`.                                                                                                                                                                                                        |
| `apps/web/src/lib`             | Utilidades compartidas sin pantalla: `supabase.ts` (cliente PostgREST directo; storage-js se carga aparte, perezoso), `motion.ts` (presets), `async.ts`, `audioCtor.ts`, `deviceShape.ts`, `useNow.ts`, `useSize.ts`, `lru.ts`, `autoHideChrome.ts` y `orientation.ts` (pantalla completa del estudio y de la ronda), `mp4/` (codificación de audio en worker), `heavyWork.ts`, `devSilence.ts` (demo sin sonido). |
| `apps/web/src/player`          | `store.ts` (barril: `playerStore.ts` estudio, `reviewStore.ts` toma/original, `loopActions.ts` bucle compartido), `engine.ts` (motores sin estado de UI), `FileStage`/`YouTubeStage`.                                                                                                                                                                                                                              |
| `apps/web/src/components`      | Shell de la app (`shell/`), `ui/` (botones, diálogos, campos) y piezas comunes.                                                                                                                                                                                                                                                                                                                                    |
| `apps/web/src/providers`       | Auth (sesiones antiguas y demo), grupo, toasts.                                                                                                                                                                                                                                                                                                                                                                    |
| `apps/web/api`                 | Funciones Vercel de YouTube (búsqueda y oEmbed).                                                                                                                                                                                                                                                                                                                                                                   |
| `packages/shared/src`          | TS puro compartido: dominio, tiempos, reproducción, grabación, aplauso, tipos generados de la base de datos.                                                                                                                                                                                                                                                                                                       |
| `supabase/`                    | Migraciones, tests SQL y Edge Functions.                                                                                                                                                                                                                                                                                                                                                                           |

- **Workers:** separación de voces (`stemSeparator.worker.ts`), codificación de pistas (`stemEncoder.worker.ts`) y
  sonido de la copia para la nube (`cloudCopy/sound.worker.ts`); el audio se codifica fuera del hilo principal.
- **Pósteres:** los vídeos subidos guardan un póster JPEG en línea; las listas no lo traen y una consulta aparte lo
  pide y lo guarda en el dispositivo por revisión (`data/videos/posters.ts`).
- **Fuentes propias:** `fonts.css` y `fonts-ja.css` (la segunda solo cuando hace falta japonés), sin Google Fonts.
- **Tomas y archivos locales:** tomas en OPFS (`features/record/takeStore.ts`), archivos subidos en IndexedDB
  (`lib/localVideos.ts`).

## Acceso: un solo grupo, sin login

- No hay login. Quien tenga la URL usa la app como rol `anon` de Supabase.
- El grupo es `private.default_group()`: el crew más antiguo (`order by created_at, id`). Las políticas `*_open_*`
  dejan a `anon` (y a `authenticated`, sesiones antiguas) leer, crear, editar y «borrar» solo dentro de ese grupo.
- Nadie puede crear, renombrar ni borrar grupos ni miembros desde el cliente. En un proyecto nuevo la fila del grupo
  se crea a mano (ver `DEPLOY.md`).
- Columnas editables desde el cliente: vídeos (`title`, `artist`, `duration_seconds`, `storage_path` una sola vez),
  clips (`name`, `color`, `is_pinned`, `speed`, `mirrored`, `start_seconds`, `end_seconds`), notas (`body`,
  `at_seconds`). `created_by`, `created_at` y `updated_at` los pone la base de datos.
- Topes: 500 vídeos, 5.000 clips y 5.000 notas vivos por grupo (y 4× contando lo archivado).

## Archivar en lugar de borrar

- «Borrar» en la app no borra: un trigger `BEFORE DELETE` convierte el borrado de `anon`/`authenticated` en
  `archived_at = now()`. Archivar un vídeo archiva también sus clips y notas.
- Las políticas ocultan lo archivado (y los clips y notas de un vídeo archivado). Más de 3 filas en una misma
  sentencia → `bulk_delete_blocked`.
- Las restricciones de unicidad (`videos_crew_youtube_key`, `clips_video_range_key`, `notes_video_at_body_key`) son
  índices parciales sobre lo no archivado: un vídeo archivado se puede volver a añadir.
- Recuperar o borrar de verdad es cosa del administrador (SQL editor / `service_role`): `archived_at = null` para
  recuperar, `delete` para borrar.

## Datos

| Tabla          | Qué guarda                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------- |
| `crews`        | el grupo (la app usa uno solo, el más antiguo)                                                |
| `crew_members` | pertenencia de las cuentas antiguas (ya no se usa desde la app)                               |
| `profiles`     | nombre y color de las cuentas antiguas (ya no se usa desde la app)                            |
| `videos`       | `source = youtube` (`youtube_id`) o `upload` (`file_name`, `storage_path?`), `archived_at`    |
| `clips`        | tramo `start_seconds`–`end_seconds`, `speed`, `mirrored`, `color`, `is_pinned`, `archived_at` |
| `notes`        | nota con tiempo sobre un vídeo: `at_seconds`, `body` (≤ 500), `archived_at`                   |

- `clips.crew_id` y `notes.crew_id` los rellena un trigger a partir del vídeo; los topes también cuentan por el grupo
  del vídeo, nunca por el que manda el cliente.
- Helpers en el esquema `private` (no expuesto por la API); solo los que usan las políticas son ejecutables por
  `anon`/`authenticated`.
- Storage: la ruta es `{grupo}/{id del vídeo}.{ext}`. Subir exige que ya exista la fila del vídeo (`source = upload`,
  no archivado, sin otro archivo); leer o firmar un enlace exige lo mismo. No hay política de borrado ni de
  sobrescritura: los archivos solo los borra el administrador.

Migraciones en `supabase/migrations/`, comprobaciones en `supabase/tests/`. Tipos generados en
`packages/shared/src/database.types.ts`.

## Búsqueda de YouTube

`/api/youtube-search?q=…` normaliza la consulta (espacios, minúsculas) y redirige (308) cualquier otra forma de
escribirla a una única URL, para que todas compartan la caché del edge de Vercel (1 día + 1 día sirviendo la copia
antigua mientras se renueva). Cada IP tiene un pequeño cupo de búsquedas sin caché (20 cada 10 min, en memoria y
aproximado); al pasarse responde 429.

## Reproductor

```
StudioPage
 ├─ MediaStage ── motion.div scaleX(±1)  ← espejo como transform (funciona igual en YouTube y <video>)
 │    ├─ YouTubeStage → createYouTubeEngine(player)
 │    └─ FileStage    → createMediaEngine(<video>)
 ├─ Timeline   (scrub, arrastre en el carril de clips o Shift+arrastre para seleccionar, tiradores A/B, notas)
 ├─ Transport  (play, ±5 s, espejo, velocidad, A/B, bucle, pausa entre repeticiones, guardar)
 └─ ClipList
```

- `player/engine.ts` define una interfaz mínima (`play/pause/seek/getCurrentTime/getDuration/setRate`).
- `player/store.ts` (zustand, barril de `playerStore.ts` y `reviewStore.ts`) es la única fuente de verdad de UI:
  tiempo, velocidad, espejo, tramo, clip activo. La lógica del bucle es común al estudio y al repaso
  (`player/loopActions.ts`).
- `player/useLoopController.ts` corre un `requestAnimationFrame`: lee el reloj del motor, salta de B a A y gestiona
  la cuenta atrás de la pausa entre repeticiones.
- La IFrame API solo actualiza `getCurrentTime()` unas pocas veces por segundo; el motor de YouTube interpola
  entre lecturas para que el playhead sea fluido y el bucle no se pase de B.
- YouTube puede redondear velocidades no soportadas; el motor comprueba la velocidad aplicada y avisa con un toast.

## Estado remoto

React Query (`src/data`, una carpeta o fichero por dominio) con, entre otras, las claves `['group']`, `['profile', userId]`, `['videos', crewId]`, `['video', id]`,
`['clips', videoId]`, `['quick-clips', crewId]` y `['notes', videoId]`. Fijar y borrar clips son optimistas.

## PWA

- El service worker precachea solo la interfaz (JS, CSS, HTML, iconos) y guarda en caché las fuentes y algunas
  miniaturas de YouTube. Los datos del grupo no se guardan: sin red la app abre la interfaz, pero la biblioteca no
  carga. Los archivos subidos sí se pueden reproducir desde la copia local (IndexedDB).
- Las actualizaciones (`registerType: 'prompt'`) esperan a un momento seguro: fuera del estudio (`/v/…`) y sin
  diálogos abiertos (`main.tsx`).

## Atajos

`Espacio` play · `←/→` ±5 s (Shift ±1 s) · `,`/`.` ±0.1 s · `↑/↓` velocidad · `1–8` presets · `M` espejo ·
`A`/`B` marcar · `L` bucle · `Esc` quitar tramo · `S` guardar clip · `?` ayuda.

## Backend intercambiable y modo demo

`src/lib/backend/` define la interfaz de datos por dominio con dos implementaciones: Supabase (normal) y
almacenamiento del navegador (demo). El modo demo solo se activa con `import.meta.env.DEV && VITE_DEMO=true`
(`IS_DEMO`, constante de build): datos en `localStorage` (`coverscape.demo.v1`). Rollup elimina los `*.demo.ts` de la
build de producción y `pnpm perf:bundle` comprueba que no queda ninguna cadena del demo. `@/lib/backend` solo
reexporta los tipos; los valores se importan del módulo de cada dominio.
