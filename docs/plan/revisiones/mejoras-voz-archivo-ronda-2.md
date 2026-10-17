# Mejoras · voz con IA (18) y copia para la nube (13) · ronda 2

**Alcance.** Revisión de solo lectura de la rama `feat/plan-completo` (sin commit). Se comprueba que los hallazgos de
`mejoras-voz-archivo-ronda-1.md` están corregidos sin regresiones.

- **Base de datos (prioridad):**
  - `20261017130000_video_stems.sql` (editada, sin publicar) y la nueva `20261017140000_videos_storage_cap.sql`, leídas
    enteras.
  - Comparadas con lo que redefinen: `video_object_allowed` y `videos_bucket_open_insert` de `20261013000000` y
    `20261016000100`. La `000000` y la `000200` no la tocan después. También con el tope de `take_object_allowed` y
    `storage_bytes_used` de `20261016010000`, y con `archive_row` de `20261016070000`.
- **Cliente:**
  - Voz: `voiceRules.ts`, `stems.ts`, `separate/**` (`model`, `runSeparation`, `encode`, `mp4`, worker),
    `SeparateVoiceButton.tsx` y `data/stems.ts`.
  - Copia para la nube: `cloudCopyRules.ts`, `cloudCopyJob.ts`, `cloudCopy.ts` (alineado y `elst`), `mp4Mux.ts`,
    `CloudCopyStatus.tsx`, `LinkFilePanel.tsx`, `lib/backend.ts` (subida XHR y gemelos de la demo) y `data/videos.ts`.
  - Textos y configuración: `shareTake.ts`, `TakesPanel.tsx`, `PrivacyPage.tsx` y `vercel.json`.

**Pruebas ejecutadas:**
- `node supabase/tests/local/run.mjs`: 23/23 migraciones, 12/12 archivos de comprobación y 126 PASS. Las 5 nuevas de
  `videos_storage_cap_checks.sql` y las 19 de `plan_stems_checks.sql` están en verde.
- `vitest` de `features/voice`, `features/studio`, `features/takes`, `data` y `lib`: 19 archivos y 247 tests en verde.
- Sonda propia en PGlite (en el scratchpad, sin tocar el repo), sobre las mismas migraciones:
  - Repetir una pista de `stems/` con el mismo nombre da **42501**, el rechazo de RLS.
  - Repetir el archivo de un vídeo `upload` da **23505**, que es el 409 de Storage. Pero con el grupo cerca del tope
    también da **42501**.
- No se ha usado navegador, servidor ni Supabase real. Los advisors no se han podido ejecutar.

## Hallazgos de la ronda 1 → estado

| Ronda 1 | Estado |
|---|---|
| [5] Pistas retrasadas tras cada salto del bucle | **Corregido en código, falta medir.** `park()` deja las pistas por delante del vídeo con un adelanto aprendido (`learnLead`, por tipo de salto: `start`/`seek`). Mientras la deriva pasa de 60 ms, el empujón llega al 8 %. La lógica es correcta: tras un arranque que llega L tarde, aprende `ideal = landed − drift = L`. Sigue pendiente medirlo en un Samsung con clic de metrónomo. |
| [5] H1, sin tope de bytes en el bucket `videos` | **Corregido.** `20261017140000` añade `videos_bucket_has_room`: un archivo entra solo si `usado + tamaño < 1 GiB − 50 MB`, y si el tamaño se desconoce cuenta 50 MB. El cliente lo refleja en `CLOUD_SPACE`, `videosBucketHasRoom`, `cloudDecision`, `groupHasRoomForUpload` y el gemelo de la demo. Detalles en «Base de datos». |
| [4] Archivos huérfanos al reintentar la separación | **Regresión (ver [7]).** La fila pendiente se reutiliza (`reusablePendingStems` + `localStorage`). Pero el servidor responde 403, no 409, a la pista ya subida, así que el reintento falla siempre. |
| [4] Media separación con el espacio justo | **Corregido.** El servidor exige sitio para las pistas que faltan (16 MiB cada una) más la reserva de 50 MB. `spaceVerdict` cuenta `max(2 × 16 MiB, necesario)` con la misma regla. |
| [4] Sin `edts/elst` | **Corregido.** En las pistas (`encode.ts:194-204`, `mp4.ts:28,234`) y en la copia (`cloudCopy.ts:404-421`, `mp4Mux.ts:442`), solo si este navegador respeta la lista de edición al decodificar. Si no, se usa el retraso medido o se desplaza el sonido. `segment` va en ticks de la película, `media_time` en los de la pista y `mdhd` con la duración total. Unidades de la copia: `sampleRate` del track = `original.sampleRate`. |
| [4] Modelo mal descargado guardado para siempre | **Corregido.** Hay tamaño exacto por archivo en el commit fijado, `Content-Length` y cabecera `X-Model-Bytes` en caché. La suma de piezas se comprueba contra `bytes`, la caché se borra ante `model-load` y hay botón «Borrar el modelo de IA». Efecto secundario en el [3] nuevo. |
| [4] El vídeo subido no podía enlazar su archivo (409) | **Corregido con un caso pendiente (ver [3]).** Un 409 se toma por `exists` en `uploadToGroup` y en `uploadGroupFile`, y la política deja pasar el mismo nombre (`o.name <> p_name`). Con el grupo cerca del tope llega antes el 403 de sitio. |
| [4] Subida de ~48 MB en una sola petición | **Corregido** (sin reanudar, aceptado). Subida XHR con progreso, tiempo restante y «Cancelar». La UI avisa: «Con datos móviles puede tardar unos minutos». |
| [4] Memoria con archivos grandes | **Corregido.** `maxOriginalBytes` (250/400 MB en móvil, 1–2 GB en ordenador) en la copia y en la separación. `original` solo vive en su bloque. Límite de 10 min, o 7 min con < 8 GB. |
| [4] No se podía quitar una separación | **Corregido.** «Quitar las pistas separadas», con confirmación, archiva cada fila completa del archivo actual, una petición por fila (no salta la guardia de borrado masivo). Las pistas dejan de poder leerse (`stem_object_allowed` exige `archived_at is null`). |
| [3] «unos 1 minutos» | **Corregido.** `formatMaxLength` en la copia, en `shareTake` y en `TakesPanel`. Ya no hay «Reintentar» para `too-long`, `too-heavy` ni `unsupported`. |
| [3] Faltaban pruebas negativas de pistas | **Corregido en local.** Hay pruebas de archivar, no sobrescribir ni borrar, vídeo archivado, otro grupo, tamaños de otras rutas y sitio para la separación entera. Sigue pendiente una subida real en una rama de Supabase. |
| [3] Se perdía el foco | **Corregido.** `focusOnMount` lleva el foco al título de la confirmación, a «Cancelar» y al resultado. «Cancelar» lleva `aria-disabled` con la nota «Ya se están subiendo las pistas…». |
| [3] Todo en el hilo principal mientras se sincroniza | **Abierto (medir).** Sin cambios: la copia regula su propia velocidad y `LinkFilePanel` sigue diciendo «Puedes sincronizar mientras». |
| [3] Decisión «sin pistas con YouTube» sin apuntar | **Abierto (documentación).** No figura en `ESTADO-IMPLEMENTACION.md`. |
| [2] «(copia más ligera)» solo si `file_size` > 50 MB | Sin cambios (aceptable). |
| [2] Unidades 120 MB / 130–180 MB | **Corregido.** La política dice «120 a 172 MB», igual que `formatBytes`. |
| [2] Faltaba la ruta de timcsy en la CSP | **Corregido.** También `*.hf.co`, que cubre los redirects a `cas-bridge.xethub.hf.co` y `cdn-lfs*.hf.co`. |
| [2] La privacidad no mencionaba la copia ligera | **Corregido.** |
| [2] Licencias de los modelos | **Abierto (documentación).** El código dice MIT, pero no consta en ESTADO. |

**Base de datos, detalle:**
- **Aditiva y compatible con la app en producción.**
  - `video_object_allowed(text, text, bigint)` es copia exacta de la de `20261016000100`, más la comprobación de
    sitio en `insert`.
  - La versión de dos argumentos pasa a ser un envoltorio SQL con `security definer`. La política de lectura sigue
    igual.
  - La app actual sube con supabase-js, sin tamaño. Storage comprueba la política de insert antes de recibir el
    archivo (`metadata` nulo), así que siempre cuentan 50 MB.
  - Hoy no cambia nada mientras el grupo use menos de ~924 MiB (`1 GiB − 100 MB`). Por encima, la subida se rechaza
    como cualquier otro rechazo y la app vieja dice «no se subió… la nube lo rechazó».
  - Antes de aplicarla, mirar `select public.storage_usage()` en producción.
- **No se puede saltar el tope:**
  - Upsert: sin política UPDATE, y el `insert … on conflict` pasa por el mismo `with check`.
  - Metadatos falsos: `x-metadata` va a `user_metadata`, no a `metadata.size`, y el cliente no escribe en `storage`.
  - `move`: necesita UPDATE.
  - `copy`: pasa por la política, con el tamaño real.
  - Pistas: no coinciden con el patrón de vídeos y tienen su propia regla.
  - Única grieta: subidas en paralelo (ver [2]).
- **`video_object_size` no filtra nada útil.** Solo responde para rutas `stems/` del grupo por defecto, y el esquema
  `private` no está expuesto en PostgREST.
- **Funciones, permisos y archivado.**
  - `search_path = ''` en todas.
  - `security definer` donde hace falta.
  - `videos_bucket_has_room` sin `grant`: solo la llama la función definer.
  - `object_size` es `immutable`, no definer, con `grant` a anon (la evalúa la política). La regex `{1,15}` evita el
    desbordamiento.
  - `archive_row` es idéntica a la de `070000` salvo las dos líneas de `video_stems`.
- **El reinicio de `app.archive_burst` es solo de la prueba.** Está en `plan_stems_checks.sql:357`, local a la
  transacción de la prueba, que acaba en ROLLBACK. Hace falta porque todo el archivo comparte `statement_timestamp()`,
  también en el SQL editor. No toca ninguna migración.

**Cliente, detalle de la subida XHR (`backend.ts:76-123`):**
- Es la misma petición que supabase-js: `POST /storage/v1/object/videos/<ruta>`, con `apikey`, `Authorization: Bearer
  <sesión o clave pública>`, `x-upsert: false`, `cache-control` y `content-type` del blob.
- Funciona con anon sin sesión: igual que supabase-js, la pasarela acepta la clave publicable en los dos sitios.
- Solo va al propio proyecto, que ya está en `connect-src`, y no expone nada más que la clave pública.
- El 409 llega como HTTP 400 con `statusCode: "409"` en el cuerpo, y se lee bien.
- Cancelar aborta el XHR y no deja nada en el bucket.

**CSP.** El JSON es válido y tiene 14 directivas, en Report-Only.

## Hallazgos nuevos

- **[7]** `apps/web/src/features/voice/separate/runSeparation.ts:294-327` y `supabase/migrations/20261017130000_video_stems.sql:237-243`.
  **El reintento de una separación se queda atascado para siempre.**
  - Qué pasa:
    - Si un intento sube una pista y luego falla (se corta la red antes de la segunda, o falla `completeStems`), el
      siguiente reutiliza la misma fila, apuntada en `localStorage`.
    - Al volver a subir la pista que ya está, `stem_object_allowed` devuelve `false` (`exists … like
      '<kind>.%'` no excluye el propio nombre). Storage responde **403 (RLS)**, no 409.
    - Comprobado en PGlite: 42501. `uploadStemFile` lo traduce a `denied` y lanza «La nube no ha aceptado las
      pistas».
    - La fila sigue pendiente, así que cada nuevo intento repite minutos de separación y vuelve a fallar en el mismo
      sitio. En la práctica es en todos: el retraso medido es el mismo y `reusablePendingStems` la vuelve a elegir.
    - La única salida es borrar los datos del sitio.
  - La demo lo oculta: `backend.ts:2462` devuelve `exists` antes de mirar las reglas.
  - Es una regresión del arreglo de la ronda 1: antes el reintento creaba fila nueva y funcionaba.
  - Arreglo (la migración aún no está publicada, se puede editar):
    - Añadir `and o.name <> p_name` al `exists` de la línea 238-241, como hace `video_object_allowed`. Así el mismo
      nombre pasa la política, choca con el índice único y da 409 → `exists`. La regla «una pista por tipo, sin
      segunda extensión» se mantiene.
    - Añadir en `plan_stems_checks.sql` una prueba que espere `unique_violation` (23505) al repetir el mismo nombre.
    - Como red de seguridad en el cliente, hacer lo de `shareTake.ts:370-388`: ante `denied` con una fila
      reutilizada, intentar `completeStems`. La base comprueba que las dos pistas existen. Si responde
      `stems_file_missing`, archivar la fila, olvidar el pendiente y crear otra.
- **[3]** `apps/web/src/data/videos.ts:104-108` y `:414-415`. **El 409 = `exists` de un vídeo `upload` no llega cuando
  el grupo está casi lleno.**
  - La comprobación de sitio (`usado + 50 MB < 1 GiB − 50 MB`) va antes del índice único. El archivo que ya está
    cuenta en `usado`, así que, justo cuando el grupo está más lleno, el reintento recibe 403 y vuelve el «No se pudo
    subir…» para siempre de la ronda 1.
  - Arreglo: ante `denied` en un vídeo `upload`, probar `signedUrl('<grupo>/<id>.<ext>')`. La política de lectura lo
    permite mientras `storage_path` es null. Si responde, apuntar `storage_path` a ese nombre.
- **[3]** `apps/web/src/data/videos.ts:331-335` y `features/studio/LinkFilePanel.tsx:117-121`. **El aviso no
  corresponde cuando falta sitio.**
  - Un archivo de ≤ 50 MB sin sitio en el grupo vuelve como `too-big`. El aviso dice «Pesa demasiado para la nube: se
    está preparando una copia más ligera», y la copia acaba al momento en «No cabe en la nube del grupo».
  - Arreglo: un motivo propio (`no-space`) y su aviso: «No queda sitio en la nube del grupo: se queda en este
    dispositivo». Y no arrancar la copia.
- **[3]** `apps/web/src/features/voice/separate/runSeparation.ts:210`. **Se vuelve a bajar el modelo entero sin
  necesidad.**
  - Cualquier `model-load` borra toda la caché, también cuando falla `InferenceSession.create` por la GPU (memoria,
    operador). Cada intento vuelve a bajar 120–172 MB.
  - Con el tamaño exacto por archivo ya comprobado, la caché rara vez es la culpable.
  - Arreglo: borrar solo si el error es de lectura del modelo (`manifest`, protobuf, «invalid model»), o solo la
    pieza que falló.
- **[2]** `supabase/migrations/20261017140000_videos_storage_cap.sql:35`. **El tamaño supuesto está fijo.**
  - Si se desconoce el tamaño, se suponen 52 428 800 bytes fijos. Si algún día se sube el `file_size_limit` del
    bucket (plan Pro), la reserva para tomas deja de estar garantizada.
  - Arreglo: `coalesce(p_size, (select file_size_limit from storage.buckets where id = 'videos'), 52428800)`.
- **[2]** `20261017140000:85` y, igual, `take_object_allowed`. **Subidas en paralelo.**
  - Varias subidas a la vez pasan la comprobación con el mismo `usado` y pueden comerse la reserva (hasta (K−1) ×
    50 MB).
  - En un grupo pequeño y legítimo es raro. Basta con apuntarlo en ESTADO como límite conocido.
- **[2]** `apps/web/src/lib/backend.ts:110` y `:158-168`. **Un error del servidor parece falta de sitio.**
  - Un 5xx de la pasarela (p. ej. 504 en una subida lenta de 48 MB) acaba como `denied`, con el texto «puede que no
    quede sitio en la nube del grupo».
  - Arreglo: `status >= 500` → `unavailable`.
- **[2]** `apps/web/src/features/voice/SeparateVoiceButton.tsx:306` y `separate/model.ts:235`. **No siempre se puede
  borrar el modelo.**
  - «Borrar el modelo de IA» solo sale con el modelo completo en caché (`modelBytes === 0`). Con una descarga a
    medias, las piezas guardadas no se pueden borrar desde la app, aunque la privacidad dice que sí.
  - `hasModelCache` existe pero no se usa. Usarlo para mostrar el botón.

## Veredicto

**Hay un hallazgo ≥ 6: [7], el reintento de la separación atascado.** Hay que corregirlo antes de publicar
`20261017130000`. Lo más limpio es el `o.name <> p_name` en la propia migración, que aún no está publicada, con su
prueba.

El resto de la ronda 1 está corregido sin regresiones:
- H1 queda cerrado en el servidor.
- `20261017140000` es aditiva y compatible con la app en producción mientras el grupo use menos de ~924 MiB.
- La subida XHR es correcta con anon.
- La CSP es válida.

Pendiente antes de dar 18 y 13 por cerrados:
- Medir la sincronía de las pistas en un Samsung.
- Hacer una subida real de pistas en una rama de Supabase y revisar los advisors.
- Apuntar en ESTADO la decisión sobre YouTube y las licencias.
