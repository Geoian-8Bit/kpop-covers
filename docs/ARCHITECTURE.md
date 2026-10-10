# Arquitectura

## Visión general

```
Browser (React SPA)
 ├─ Supabase Auth      email + contraseña
 ├─ Supabase Postgres  crews · crew_members · profiles · videos · clips   (RLS por crew)
 ├─ Supabase Storage   bucket privado `videos/{crew_id}/{video_id}.ext`  (≤ 50 MB)
 ├─ IndexedDB          copia local de cada archivo subido (sin límite de tamaño, offline)
 ├─ YouTube IFrame API reproducción de vídeos de YouTube (sin descarga)
 └─ /api/youtube-meta  función Vercel → oEmbed (título, canal, si permite embed)
```

No hay servidor propio: Supabase es el backend (datos, auth, ficheros) y la única función serverless es
`apps/web/api/youtube-meta.ts`. En desarrollo la sirve un middleware de Vite (`vite.config.ts`).

## Datos

| Tabla          | Qué guarda                                                                    |
| -------------- | ----------------------------------------------------------------------------- |
| `profiles`     | nombre visible y color de avatar (se crea por trigger al registrarse)        |
| `crews`        | grupo de baile + `invite_code` de 8 caracteres                               |
| `crew_members` | pertenencia (`owner` / `member`)                                             |
| `videos`       | `source = youtube` (`youtube_id`) o `upload` (`file_name`, `storage_path?`)  |
| `clips`        | tramo `start_seconds`–`end_seconds`, `speed`, `mirrored`, `color`, `is_pinned` |

- **RLS**: todo se filtra con `private.is_crew_member(crew_id)` (security definer, fuera del esquema expuesto).
- `clips.crew_id` lo rellena un trigger a partir del vídeo, así la política es una sola comprobación.
- Crear/unirse a una crew solo vía RPC (`create_crew`, `join_crew`); no hay `insert` directo sobre `crews`.
- Storage: la primera carpeta de la ruta es el `crew_id`, y las políticas reutilizan el mismo helper.

Migraciones en `supabase/migrations/`. Tipos generados en `packages/shared/src/database.types.ts`.

## Reproductor

```
StudioPage
 ├─ MediaStage ── motion.div scaleX(±1)  ← espejo como transform (funciona igual en YouTube y <video>)
 │    ├─ YouTubeStage → createYouTubeEngine(player)
 │    └─ FileStage    → createMediaEngine(<video>)
 ├─ Timeline   (scrub, Shift+arrastre para seleccionar, tiradores A/B, carril de clips)
 ├─ Transport  (play, ±5 s, espejo, velocidad, A/B, bucle, pausa entre repeticiones, guardar)
 └─ ClipList
```

- `player/engine.ts` define una interfaz mínima (`play/pause/seek/getCurrentTime/getDuration/setRate`).
- `player/store.ts` (zustand) es la única fuente de verdad de UI: tiempo, velocidad, espejo, tramo, clip activo.
- `player/useLoopController.ts` corre un `requestAnimationFrame`: lee el reloj del motor, salta de B a A y gestiona
  la cuenta atrás de la pausa entre repeticiones.
- La IFrame API solo actualiza `getCurrentTime()` unas pocas veces por segundo; el motor de YouTube interpola
  entre lecturas para que el playhead sea fluido y el bucle no se pase de B.
- YouTube puede redondear velocidades no soportadas; el motor comprueba la velocidad aplicada y avisa con un toast.

## Estado remoto

React Query (`src/data`) con claves `['videos', crewId]`, `['video', id]`, `['clips', videoId]`,
`['quick-clips', crewId]`. Fijar y borrar clips son optimistas.

## Atajos

`Espacio` play · `←/→` ±5 s (Shift ±1 s) · `,`/`.` ±0.1 s · `↑/↓` velocidad · `1–8` presets · `M` espejo ·
`A`/`B` marcar · `L` bucle · `Esc` quitar tramo · `S` guardar clip · `?` ayuda.
