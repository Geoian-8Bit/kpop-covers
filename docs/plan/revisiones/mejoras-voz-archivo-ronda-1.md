# Mejoras · voz con IA (18) y copia para la nube (13) · ronda 1

**Alcance.** Revisión de solo lectura de la rama `feat/plan-completo` (sin commit), puntos 18 y 13 de
`MEJORAS-PRUEBA-MANUAL.md`.

- **A · 18:** migración `20261017130000_video_stems.sql`, comparada con `archive_row` de `20261016070000_follow_paths.sql`
  y con las políticas de storage de `20261013000000`, `20261016000000`–`000200` y `20261016010000_takes`.
  `plan_stems_checks.sql`, `database.types.ts`, `stemsBackend`, `data/stems.ts`, `features/voice/**` (botón, worker,
  dsp, modelo, codificador, muxer, reproductor de pistas, `voiceSplit`, `voiceRules`), `StudioPage` (VoiceRow,
  useStageStems), `vite.config.ts`, `vercel.json`, `PrivacyPage` y dependencias.
- **B · 13:** `cloudCopyRules`, `audioAlign`, `mp4Mux` (con tests), `cloudCopy`, `cloudCopyJob`, `CloudCopyStatus`,
  `LinkFilePanel`, `data/videos.ts`, `lib/localVideos.ts`, `backend.ts` (`cloudLimitBytes` y nube simulada) y
  `plan_cloud_copy_checks.sql`.

**Pruebas ejecutadas:**
- `node supabase/tests/local/run.mjs`: 22/22 migraciones, 11/11 archivos, 112 PASS.
- `vitest` de `features/voice` y `features/studio`: 13 archivos, 159 tests en verde.
- No se ha usado navegador, servidor ni Supabase real.

## Hallazgos (de mayor a menor)

- **[5]** `apps/web/src/features/voice/stems.ts:157-167` y `voiceRules.ts:249-254`. **Las pistas pueden ir retrasadas
  tras cada salto del bucle.**
  - Qué pasa: al buscar (bucle A–B, saltos, clips), `park()` pausa las pistas y las deja en el punto del vídeo. Al
    seguir, la pista arranca con la latencia de `play()` de un `<audio>`, unos 30–100 ms en Android. Esa deriva queda
    por debajo de `seekSeconds` (0,25 s), así que solo se corrige con el empujón de velocidad (máx. 4 %/s): tarda de 1
    a 2,5 s.
  - Por qué importa: con «Sin voz» el sonido del archivo está a 0 (`dry = 0`), así que durante ese tiempo la música
    va por detrás de la imagen. Con bucles de 8 tiempos (~4 s) eso es medio bucle.
  - Arreglo: tras `seeked`/`play`, si |deriva| > ~40 ms en el primer segundo, saltar con un adelanto que se aprende
    (como `loopRules` con YouTube), o subir `maxNudge` (~0,1) mientras |deriva| > 60 ms.
  - Medir en un Samsung con un clic de metrónomo. **Si el retraso medido pasa de ~40 ms, sube a 7.**
- **[5]** `supabase/migrations/20261016000100_linked_file_guard.sql:72-85` (`video_object_allowed`, rama `insert`).
  **H1 de la revisión global sigue abierto y el punto 13 lo agrava.**
  - El bucket `videos` no tiene tope de bytes en el servidor. Las tomas sí: `< 1 GiB − 50 MB`. Las pistas también:
    `< 1 GiB − 32 MiB`.
  - Con 13, la app sube copias de ~48 MB y el cliente solo deja 1 MiB libre (`cloudCopyRules.ts:18`,
    `videos.ts:355`). Así una copia legítima puede dejar al grupo sin sitio para compartir tomas ni subir pistas, sin
    avisar.
  - Arreglo: en una migración nueva, `and private.storage_bytes_used() < 1073741824 - 52428800` en las dos ramas de
    `insert` de `video_object_allowed`.
  - En el cliente, alinear `spareBytes`/`groupHasRoomFor` con ese margen. O, al menos, avisar de que sin ~50 MB libres
    no se podrán compartir tomas.
  - ¿Romper o sustituir? Una copia con un tamaño distinto de `file_size` no rompe nada:
    - `fileIdentity`, `isStaleCopy` y `pickStems` usan la descripción del original, y `storage_usage()` suma bytes
      reales.
    - Sustituir el archivo de otro no es posible: no hay política UPDATE/DELETE, el vídeo subido tiene un único nombre
      y el de YouTube solo acepta un archivo mientras `storage_path` es null.
    - Lo único que existía ya antes: cualquiera con la clave pública puede adjuntar cualquier archivo a un vídeo que
      solo está en un móvil. No hace falta comprobar el tamaño contra `file_size`; si se quiere trazar, guardar
      `storage_size` real como en `takes.shared_size`.
- **[4]** `apps/web/src/features/voice/separate/runSeparation.ts:215-243`. **Archivos huérfanos en cada reintento de
  la separación.**
  - Cada intento crea una fila nueva (`crypto.randomUUID()`). Si falla la segunda subida o `completeStems`, la primera
    pista se queda en el bucket para siempre (el cliente no borra) y cuenta en el 1 GiB. La rama `'exists'` nunca
    sirve, porque la ruta es nueva cada vez.
  - Arreglo: guardar el `id` de la fila pendiente (en memoria o en `localStorage` por vídeo y archivo) y reutilizarlo
    al reintentar. `exists` deja seguir; ante un error, archivar la fila incompleta.
- **[4]** `separateRules.ts:209-212` frente a la migración `:239`. **Media separación con espacio justo.**
  - El cliente acepta si `free ≥ 32 MiB`. El servidor exige `usado < 1 GiB − 32 MiB` en cada subida.
  - Con 33 MiB libres sube la primera pista y el servidor rechaza la segunda: deja ~5 MB huérfanos y da el error «La
    nube no ha aceptado las pistas».
  - Arreglo: exigir `free − needed ≥ 32 MiB` en `spaceVerdict`.
- **[4]** `separate/mp4.ts:153-230` y `encode.ts:173-181`. **Sin `edts/elst`: el retraso del codificador solo se mide
  en el navegador que separa.**
  - El retraso del codificador (AAC 2112 muestras ≈ 48 ms) se mide con `decodeAudioData` en el ordenador que separa.
    Se compensa luego con `delay_seconds` en `<audio>` de otros navegadores (Safari/iPhone, Chrome Android).
  - Si un reproductor recorta o no el cebado de AAC sin lista de edición de forma distinta a ese `decodeAudioData`,
    queda un desfase fijo de hasta ~48 ms.
  - Lo mismo en la copia de 13 (`mp4Mux.ts:7-8`, «sin listas de edición»), donde el desfase sería entre la imagen y el
    sonido de la copia.
  - Arreglo: escribir `edts/elst` con `media_time` = cebado (el estándar que respetan todos los reproductores) y
    dejar la medición como comprobación. O, como mínimo, probarlo con un clic en iPhone y en Samsung.
- **[4]** `separate/model.ts:113-137`. **Un modelo mal descargado se queda guardado.**
  - Lo que se baja se guarda en Cache Storage sin comprobar tamaño ni hash. Una descarga cortada que no dé error, o un
    archivo cambiado, deja el modelo roto guardado para siempre. Cada intento falla con «No se pudo preparar el
    modelo… prueba desde otro ordenador», y no hay forma de borrar esa caché desde la app.
  - Arreglo: comparar los bytes leídos con `Content-Length` (o con un `bytes` por pieza o sha256 del manifiesto)
    antes de `put`.
  - Si `create` falla con `model-load`, borrar `stem-models-v1` para que el siguiente intento descargue de nuevo.
  - Opcional: «Borrar el modelo de IA (120 MB)» en Ajustes.
- **[4]** `apps/web/src/data/videos.ts:186-188` y `:396-417`. **Un vídeo subido puede quedarse sin poder enlazar su
  archivo de la nube.**
  - Pasa con un vídeo `upload` cuyo archivo (o copia) llegó al bucket pero la fila no recibió `storage_path`, y la app
    se recargó. El mapa `uploaded` vive solo en memoria.
  - El reintento sube otra vez `<grupo>/<id>.mp4`. Storage responde 409 (no hay upsert) y `uploadFailure` lo trata
    como `denied`: «No se pudo subir…» para siempre. El comentario «"Subir a la nube" can retry» no se cumple.
  - Arreglo: en `uploadFile`, devolver `exists` ante 409, como `uploadTakeFile`. En `uploadGroupFile` y
    `useUploadToCloud`, ante `exists` de un vídeo `upload`, apuntar `storage_path` a ese nombre (el servidor solo
    permite su único archivo).
- **[4]** `features/studio/cloudCopyJob.ts:221-229`. **Subida de ~48 MB en una sola petición.**
  - Sin progreso, sin cancelar y sin reanudar. En datos móviles puede tardar minutos con la barra indeterminada, y si
    se corta empieza de cero.
  - Arreglo: subida reanudable (TUS de Supabase, recomendada por encima de 6 MB) con progreso, y «Cancelar» también en
    la fase de subida. Si no, decir «puede tardar unos minutos con datos móviles».
- **[4]** Memoria con archivos grandes: `cloudCopy.ts:276-299` y `runSeparation.ts:102-133`.
  - Las dos leen el archivo entero en memoria (`blob.arrayBuffer()`) y decodifican toda la canción a PCM. Un original
    de 1–2 GB (4K, típico cuando pasa de 50 MB) en un móvil puede cerrar la pestaña sin mensaje.
  - En `makeCloudCopy` (`cloudCopy.ts:667`), `original` (~90 MB de PCM para 4 min) sigue vivo durante toda la pasada
    de imagen.
  - En la separación, a 15 min (`separateRules.ts:22`) el pico pasa de 2 GB entre el worker y la página.
  - Arreglo:
    - Tope por tamaño: más de ~400 MB en móvil → «hazlo desde el ordenador».
    - Liberar `original` tras codificar el sonido (sacarlo a un bloque).
    - Bajar `MAX_SEPARATE_SECONDS` a ~10 min o ligarlo a `deviceMemory`.
- **[4]** `features/voice/SeparateVoiceButton.tsx:71-78`. **Una separación hecha no se puede quitar ni rehacer.**
  - Si sale mal (desfase o mala calidad), «Sin voz» queda atado a esas pistas para siempre en todos los móviles. La
    única salida es cambiar el archivo.
  - Arreglo: un «Quitar las pistas separadas» con confirmación, que borra (= archiva) la fila con
    `stemsBackend.deleteStems` y vuelve al mid/side. Así se puede volver a separar.
- **[3]** `cloudCopyJob.ts:172` (y fuera de esta zona `takes/shareTake.ts:80,174` y `TakesPanel.tsx:892`). **«el máximo
  son unos 1 minutos».**
  - El cálculo es correcto: con 5 MiB, `maxCopySeconds` = 5 MiB × 0,96 × 8 × 0,975 / 346 kbps ≈ 113 s (1:53) a los
    bitrates mínimos (250 + 96 kbps), así que 2:38 no cabe.
  - Pero `Math.floor(s / 60)` da «unos 1 minutos» y por debajo de 60 s, «unos 0 minutos». Con el límite real (50 MB)
    son unos 18 min y la frase sale bien, así que en producción casi no se ve.
  - Arreglo: un `formatMaxLength(s)` compartido («1 min y 53 s», «unos 18 minutos»). Añadir qué hacer: «Recórtalo o
    pásalo por HandBrake a 720p».
  - Además, en `CloudCopyStatus.tsx:182` no ofrecer «Reintentar» para `too-long`: repetirlo da el mismo error.
- **[3]** `plan_stems_checks.sql`. **Faltan pruebas negativas:**
  - Archivar una separación completa (sin archivar el vídeo) deja sus pistas sin poder leerse.
  - No se puede sobrescribir (`update`/upsert) ni borrar un objeto de `stems/`.
  - No se puede subir una pista para una fila de un vídeo archivado.
  - No se puede leer `stems/` con otra carpeta de grupo.
  - `video_object_size` no da tamaños de otras rutas útiles (o bien quitarle el `grant` a anon, que no lo necesita si
    `guard_stems_files` pasa a llamar a un definer propio).
  - Hacer además una subida real en una rama de Supabase antes de producción, como pedía F1: insertar fila, subir dos
    `.m4a`, completar y firmar el enlace.
- **[3]** `SeparateVoiceButton.tsx:135-238`. **Se pierde el foco.**
  - Al pasar de «Separar voz y música» a la confirmación, y de «Empezar» al progreso, el botón pulsado desaparece y
    el foco cae al `body`.
  - Arreglo: mover el foco al título de la confirmación o a «Empezar», y después a «Cancelar».
  - «Cancelar» desactivado al subir no dice por qué: añadir «Ya se están subiendo…».
- **[3]** `cloudCopy.ts:584-591` y `LinkFilePanel.tsx` («Puedes sincronizar mientras»). **Todo en el hilo principal.**
  - La copia dibuja en canvas y codifica a 30–60 fps en el hilo principal mientras el bailarín sincroniza con otro
    vídeo en marcha. En un móvil medio puede dar tirones en la sincronía.
  - La propia copia baja la velocidad sola, pero no la interfaz.
  - Arreglo: medirlo. Si molesta, limitar la copia a 1× durante la sincronía o empezarla al cerrar el panel.
- **[3]** `data/stems.ts:47-51` y `PrivacyPage.tsx:90-91`. **Se aparta del detalle del punto 18 sin decisión
  apuntada.**
  - El detalle pedía que las pistas sonaran también con el vídeo de YouTube en silencio. La app lo descarta por las
    condiciones de YouTube.
  - Es razonable, pero no está como decisión en ESTADO (apartado 3). Con 13, los móviles tendrán casi siempre el
    archivo, así que el efecto es pequeño. Apuntarlo.
- **[2]** `LinkFilePanel.tsx:208-211`. «(copia más ligera)» solo sale si `file_size` > 50 MB. Si la copia se hizo porque
  faltaba espacio del grupo, dice «En la nube del grupo» aunque sea una copia. Arreglo: guardar o leer el tamaño real
  del objeto, o aceptarlo así.
- **[2]** `separateRules.ts:215-219` frente a `PrivacyPage.tsx:86-87`. Las unidades no cuadran: la confirmación dice
  «120 MB» (MiB llamados MB) y la política, «130 a 180 MB». Usar la misma unidad en los dos sitios.
- **[2]** `vercel.json` (CSP, Report-Only). Falta `https://huggingface.co/api/resolve-cache/models/timcsy/demucs-web-onnx/`
  (solo está la ruta de monteslu). No bloquea hoy; probar las descargas el día que la CSP pase a obligatoria.
- **[2]** `PrivacyPage.tsx:59-62`. No dice que, si el archivo pasa de 50 MB, este dispositivo sube una copia más ligera
  a la nube del grupo. Añadir una frase.
- **[2]** Licencia: el código de Demucs y lo portado de `demucs-web` son MIT, y monteslu declara MIT. Confirmar la
  licencia de la ficha de `timcsy/demucs-web-onnx` y de los pesos `htdemucs`, y citarla en ESTADO.

## Lo que está bien

**Base de datos.** La migración es aditiva e idempotente: no toca nada que use la app de producción.
- `archive_row` es idéntica, línea a línea, a la de `20261016070000` con solo dos añadidos: `video_stems` en la rama
  `videos` y en la lista de tablas por id. Mismo `grant`, mismo guard de `pg_trigger_depth`.
- RLS limitada a `default_group()`. El grupo sale del vídeo, nunca del cliente.
- Las filas nacen sin archivos. Las rutas están ancladas por `check` a `<grupo>/stems/<id>/(vocals|instrumental).ext`.
  Las dos a la vez, una sola vez, con el tamaño real y ≤ 16 MiB.
- Storage: sin UPDATE/DELETE y un archivo por tipo. Solo se lee lo que la fila apunta. Tope de 1 GiB − 32 MiB.
- Funciones definer con `search_path = ''`. Índices en todas las FK. Borrar = archivar con su guardia de borrado
  masivo.
- Advisors esperables: los mismos que ya había (definer en `private`, varias políticas permisivas en
  `storage.objects`).

**Funcional.**
- Modelo fijado a un commit y guardado en caché. Cancelar termina el worker.
- Solape del 25 % con pesos triangulares normalizados.
- Muxers con cajas correctas: `tkhd`, `mdhd`, `stsd`, `esds`, `dOps`, `stts`/`ctts`, `stco`, y un `mdat` de 64 bits si hace falta.
- La copia usa los tiempos `mediaTime` del original y alinea el sonido midiendo y corrigiendo. Comprueba la duración
  final y prueba hasta 3 intentos con menos bitrate.
- Respaldo mid/side mientras las pistas no van a la par. Nunca con YouTube. El grabador recoge las pistas por el
  mismo grafo.

**Rendimiento.**
- onnxruntime-web y el worker solo se cargan al pulsar (import dinámico + worker). El `.wasm` (26,8 MB) y el worker
  quedan fuera del precache.
- El botón y el registro de pistas que van en el chunk del estudio son ligeros.

**Accesibilidad.**
- Botones de 44 px y barras con `aria-valuetext`.
- El lector de pantalla oye solo los hitos.
- Avisos con `role="alert"`, a 390 px en una columna.

## Veredicto

**Ningún hallazgo ≥ 6 confirmado.** Dos de nota 5 para decidir y medir antes de dar 18 y 13 por cerrados:
- La sincronía de las pistas tras los saltos del bucle: medir en un Samsung. Si pasa de ~40 ms, es un 7 y se corrige.
- H1, el tope de bytes del bucket `videos` en el servidor, que 13 hace más probable.

La migración `20261017130000` se puede aplicar en producción tal como está. Antes, hacer una subida real en una rama de
Supabase y comprobar los advisors.
