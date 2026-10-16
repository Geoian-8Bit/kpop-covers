# F3 · Tomas, F4 · Mejor toma, F17 · Voz y música — revisión ronda 2

Revisión de solo lectura del commit `683e39c` (rama `feat/plan-completo`). Objetivo: comprobar que los hallazgos de la ronda 1 (los tres informes `F3-F4-F17-ronda-1-*.md`) están corregidos de verdad, buscar regresiones de las correcciones y anotar hallazgos nuevos.

## Cómo se ha comprobado

- `pnpm db:test`: 12/12 migraciones, 3/3 ficheros, 45 PASS. Ojo: el árbol de trabajo ya tiene cambios sin commit de otra fase (migración `20261016020000_review_and_take_notes.sql`, `plan_fase3_checks.sql`, y cambios en `backend.ts`, `database.types.ts` y `takeRules.test.ts`). No los he revisado; la migración de tomas se ha probado con ellos aplicados.
- `pnpm typecheck` y `pnpm test`: en verde (shared 89, web 59: `takeRules` 24, `labState` 16, `voiceRules` 19). No hay `lint` en el repo.
- Sondas propias en PGlite (aplican el stub y todas las migraciones y actúan como `anon`): doble inserción con estrella, mover una toma con estrella a un trío que ya tiene otra, `on conflict do nothing`, ruta compartida de otro grupo, `storage_usage()`, y reaplicar `20261016010000_takes.sql` por segunda vez (idempotente).
- Navegador (Chrome headless propio, demo en `localhost:5174`, audio mudo, cámara falsa del repo cargada con `initScript`): guion de `takeStore` dentro de la página (carreras, borrados, lecturas), repaso del grabador con una toma recuperada (guardar con fallo y sin él), grabación de punta a punta con «Sin voz», contexto de audio suspendido, ciclos de montar y desmontar el estudio, y reparto mid/side medido con `OfflineAudioContext` y el `createVoiceSplit` real. Los guiones están en el scratchpad (`r2/`).
- No se ha tocado Supabase real ni Vercel. Lo que depende de Storage real (respuestas HTTP exactas, advisors) no se ha podido ejecutar y se dice en cada caso.

Veredicto: **sin bloqueantes**. Todos los hallazgos de nota ≥ 6 y los 🔴 de la ronda 1 están corregidos. Los hallazgos nuevos son de nota ≤ 5.

---

## 1. Estado de los hallazgos de la ronda 1

### Obligatorios (nota ≥ 6 o 🔴)

| Informe · nº | Hallazgo | Nota | Estado | Evidencia |
|---|---|---|---|---|
| BD · 1 | 🔴 Toma «compartida» sin archivo | 7 | **Corregido** | `guard_take_share` (migración l. 117-147) llama a `shared_object_size` y lanza `shared_file_missing`; el tamaño es el real. `pnpm db:test` («shared only with the file, real size»). Sonda propia: ruta de otro grupo → `shared_file_missing`; `on conflict do nothing` funciona. |
| BD · 2 | Tope de 1 GB solo en cliente, medidor engañoso, `shared_size` falsificable | 6 | **Corregido** (con matiz, ver N5) | Tope en `take_object_allowed` (l. 344-352, 1 GiB − 50 MiB, cuenta archivadas y `videos`), `public.storage_usage()` (l. 302-316, suma todo el bucket), `shared_size` fijado por el trigger. `db:test` («no uploads past the free storage», «usage meter»). Copys cambiados (`TakesPanel` l. 348 y 694). |
| Cliente · 1 | 🔴 «Guardar» no enseña éxito ni error | 9 | **Corregido** | Navegador: con la escritura de la base demo rota, el repaso enseña `role=alert` «Algo salió mal…», el botón vuelve a «Guardar en «Tomas»» y la carpeta queda con `kept:false`. Al reintentar: «Guardada en «Tomas» de esta canción.», botón «En «Tomas»», `kept:true`. |
| Cliente · 2 | 🔴 «Compartir» da por subido un archivo inexistente | 8 | **Corregido** | `shareTake.ts` l. 366-391 sigue con el `updateTake` ante `denied`/`exists`, pero ya no puede dejar una toma «compartida» sin archivo: la base lo rechaza (BD · 1) y el cliente responde `UPLOAD_COPY.denied`. Es el diseño correcto: con la política actual un archivo ya existente da `denied` (la política de inserción lo niega antes que la clave única). No se ha ejecutado contra Storage real. |
| Cliente · 3 | «Guardar» no se puede reintentar | 7 | **Corregido** (ver N4 para un caso límite) | `useSaveTake` marca `kept` antes de insertar, ante `23505` lee la fila (`getTake`) y sigue, y deshace `kept` si falla. Verificado en navegador el fallo + reintento. La rama `23505` no se ha ejecutado (el backend demo no produce duplicados): solo lectura. |
| Cliente · 4 | `meta.json` único: carrera y borrado | 6 | **Corregido** | Navegador: 30 iteraciones de `keepTake` + `markTakeSaved` + `keepTake` a la vez → 0 pérdidas (`patchMeta` en cola). Carpeta con meta ilegible y trozos: no se borra. `unkeepTake` conserva `savedAt`. Matiz en N6. |
| Cliente · 5 | Medidor cuenta solo filas vivas | 6 | **Corregido** | Igual que BD · 2. El medidor usa `total` y `takes` del RPC. |
| Voz · 1 | 🔴 Contexto suspendido congela el vídeo | 7 | **Corregido** | `engine.play` reanuda el contexto si no está `running`. Navegador: «Sin voz», `ctx.suspend()`, Reproducir → contexto `running`, `currentTime` 2,97 s a los 3 s (antes 0). |
| Voz · 2 | 🔴 «Sin voz» en oposición de fase | 7 | **Corregido** | `voiceSplit.ts` l. 159-161 manda el lado a ambos canales con el mismo signo. Medido con el grafo real (guitarra a la izquierda 300 Hz, teclado a la derecha 500 Hz, voz y bajo centrados): «Sin voz» L = R (300 Hz −18,0 dB; 500 Hz −18,1 dB), la suma mono es idéntica (antes la música lateral se iba a −83 dB), la voz central queda a −80 dB, el bajo a −14,7 dB. Coste asumido y documentado: «Sin voz» sale en mono. |
| Voz · 3 | Un `AudioContext` por elemento, nunca se cierra | 6 | **Corregido** | `FileStage` llama a `releaseMediaAudio` al desmontar (cierra el contexto y `dispose()`). Navegador: 3 ciclos «estudio → biblioteca → estudio» con «Sin voz»: cada contexto anterior queda `closed`. Ir directamente de un vídeo a otro monta un `<video>` nuevo y también cierra el anterior. (El otro contexto `running` que se ve en las pruebas es el micrófono falso de `fake-media.js`, no de la app.) |
| Voz · 4 | El grabador no avisa del modo | 6 | **Corregido** (con la opción de solo texto) | Navegador: con «Sin voz» elegido, el grabador dice «Sonido de la toma: la canción sin voz». Es la opción mínima que proponía el informe; no hay conmutador en el grabador. |

### Menores de la ronda 1 (no obligatorios), estado

| Informe · nº | Hallazgo | Nota R1 | Estado |
|---|---|---|---|
| BD · 3 | Reintento con id duplicado | 5 | Corregido (= Cliente · 3). |
| BD · 4 | Mejor toma: reasignar y carrera | 5 | Corregido: trigger `before` con bloqueo por trío + índice único (`takes_one_best_key`). Sondas propias: dos inserciones con estrella en el mismo trío → una; mover una toma con estrella a un trío con estrella → una (la que se mueve la pierde). |
| BD · 5 | `clip_id` / `member_id` sin validar | 4 | Corregido (`takes_e_links`; `db:test`). |
| BD · 7 | Mensajes sin traducir | 3 | Corregido salvo el matiz de N7. |
| BD · 10 | `recorded_at` libre | 2 | Corregido (tope de un día); `db:test`. |
| BD · 6, 8, 9, 11 | Subidas huérfanas, tope 4x, tests laxos, nits | 3-1 | Sin cambios relevantes (aceptable). Los tests nuevos de `plan_fase2_checks.sql` cubren 1, 2, 4 y 5. Siguen sin estar la receta de restauración ni la purga de tomas archivadas en `docs/DEPLOY.md` (N8). |
| Cliente · 7 | `listLeftovers` lee todos los trozos | 5 | Corregido: navegador, 200 trozos de una toma `kept` → 0 lecturas de trozos. |
| Cliente · 8 | Sin conexión, esqueleto infinito | 5 | Corregido por lectura (`offline` va antes que `isPending`, l. 112 y 204-219); no ejecutado en esta ronda. |
| Cliente · 9 | Metadatos falsos de tomas recuperadas | 5 | **Parcial**: `recorded_at` (la fecha del meta), ancho y alto (del archivo) y el `timing` salen bien (navegador). La **duración sigue en 0** en tomas WebM recuperadas (N3). |
| Cliente · 10 | Reproductor de tomas | 5 | Parcial: pausa la canción y el título lleva persona y fecha. La proporción y la fuga del URL al desmontar no se han revisado a fondo. |
| Cliente · 13 | Repetir/cerrar mientras se guarda | 4 | **Parcial**: el `.then` ya comprueba que sigue siendo la misma toma, pero «Repetir» y cerrar no se bloquean (N2). |
| Cliente · 19 | `askWho` tapado | 3 | Corregido (se quitó del repaso). |
| Cliente · 6, 11, 12, 14, 15, 16, 17, 18 | Copias huérfanas, subida sin cancelar, aviso de persistencia, «Guardar» sin explicar, textos, iPhone, accesibilidad, carreras de estrella | 3-5 | Sin cambios (no se pidieron). `grep` no encuentra ningún aviso de `persisted()`; la confirmación «Aún no la has guardado en el móvil» sigue. |
| Voz · 5, 7, 9, 10, 11 | Promesas de «Voz», aviso mono pegado, parpadeo, dos fuentes de verdad, lab | 3-5 | Sin cambios (el copy de «Sin voz» ya dice «en mono»). |
| Voz · 6 | Modo mostrado sin aplicar | 5 | Corregido: `setVoiceMode` devuelve booleano y el almacén solo guarda el modo si se aplicó (`store.ts` l. 204-216). |
| Voz · 8 | Sin pruebas; `fake-media.js` silencia con `volume = 0` | 4 | **Sin corregir**: `apps/web/e2e/fake-media.js` l. 20 sigue poniendo `this.volume = 0`; con ese archivo una toma con modo de voz sale sin audio. Y no hay tests nuevos (N1). |
| Voz · 12 | `latencyHint` | 3 | Aplicado `latencyHint: 'playback'`; sin medir en móvil. |
| Voz · 13 | Colores en bruto | 2 | Sin cambios. |

---

## 2. Regresiones buscadas en las correcciones

Revisado y **sin regresión**:

- `takeStore.ts`: `patchMeta` encadena por id, no se queda colgada tras un fallo (`.catch` previo) y borra su entrada. `listLeftovers` salta las `kept` antes de leer trozos; el `catch` ya no borra carpetas con `.part`. `keepTake`/`unkeepTake` devuelven `null`/meta coherentes (probado: carpeta inexistente → `null`).
- Migración: reaplicable sin errores; el orden de triggers `takes_a_…` a `takes_f_…` es el correcto (vínculos antes de la mejor toma, `crew_id` antes del tope de filas); `takes_share_once` es `invoker` a propósito y funciona con `anon`; `one_best_take` anidado no dispara `takes_share_once` ni los vínculos.
- `engine.ts` / `store.ts` / `FileStage.tsx`: al pasar a la pestaña YouTube el almacén vuelve a «Todo» (`attach` del motor de YouTube devuelve `false`); al volver a «Archivo» el elemento es nuevo y arranca en «Todo». No se reaplica el modo, pero es coherente con lo que suena. `releaseMediaAudio` no actúa sobre un grafo inexistente (StrictMode seguro).
- `voiceSplit.ts`: el lado en fase en ambos canales no produce recortes en la prueba (ganancia 1,25 con material a −14 dBFS).
- `data/takes.ts`: la rama de duplicado devuelve la fila existente con `where: 'here'` y deja `kept` puesto.

Regresiones o huecos nuevos detectados: N2, N4, N5, N6 (abajo).

---

## 3. Hallazgos nuevos

Ninguno bloquea. Ordenados por nota.

### N1 · Las correcciones del cliente y de la voz no tienen ningún test automático · nota 5

- **Dónde:** `apps/web/src/features/record/takeStore.ts` (`patchMeta`, `listLeftovers`, `keepTake`/`unkeepTake`), `apps/web/src/data/takes.ts` (`useSaveTake`), `apps/web/src/features/takes/shareTake.ts`, `apps/web/src/player/engine.ts` y `store.ts`.
- **Flujo:** la ronda 1 pidió tests para cada uno de estos puntos (OPFS falso, `backend` simulado, `AudioContext` falso). El commit solo añade tests de reglas puras (`takeRules`, `voiceRules`, `review`) y SQL. Hoy los tests de web son 59 y ninguno toca el código corregido.
- **Evidencia:** `pnpm test` (24 + 16 + 19 en web); no hay ningún `*.test.ts` que importe `keepTake`, `useSaveTake`, `shareTake` ni `releaseMediaAudio`. Todo lo corregido se ha podido comprobar a mano en esta ronda, pero nada impide que una refactorización lo rompa en silencio (la carrera del `meta.json` no se ve nunca a ojo).
- **Arreglo:** vitest con un OPFS falso en memoria (`getDirectoryHandle`, `getFileHandle`, `createWritable`, `keys`): carrera `keepTake`+`markTakeSaved` deja los dos campos; meta ilegible con trozos no se borra; `listLeftovers` con 10 tomas `kept` de 180 trozos hace 0 lecturas de trozos. `useSaveTake` con `backend` simulado: `insertTake` que rechaza con 23505 y `getTake` que devuelve la fila → éxito; `keepTake` que da `null` → no se llama a `insertTake`; `insertTake` que falla → `kept` queda a `false`. `shareTake` con `uploadTakeFile` → `denied` y `updateTake` que lanza `shared_file_missing` → `FriendlyError(denied)` sin reintentos. `createMediaEngine.play` con un `AudioContext` falso suspendido llama a `resume()`. Y quitar `this.volume = 0` de `fake-media.js` (silenciar solo por el contexto, como ya hace).

### N2 · «Repetir» y cerrar siguen activos mientras se guarda; el guardado deja una fila sin vídeo o una copia que se borra a los 10 min · nota 4

- **Dónde:** `RecordStudio.tsx` l. 1147-1180 (`keepInApp`), l. 1841 (botón «Repetir»: si `saved` o `kept` llama a `again()`, si no abre la confirmación), l. 1111 (cerrar), `replaceTake` l. 239-263.
- **Flujo:**
  1. El bailarín toca «Guardar en Tomas» con red lenta. `keepTake` ya marcó la carpeta como `kept` y el `insert` está en vuelo.
  2. Antes de que conteste, toca «Repetir». Si ya había descargado la toma (`saved`), `again()` corre sin confirmar; si no, sale la confirmación y «Descartar» llega a `forgetTake`.
  3. En el primer caso, `replaceTake` ve `old.kept === false` y `old.saved === true` y programa `forgetTake` a los 10 min (l. 252-254), que borra una carpeta que entretanto es `kept` y tiene fila. En el segundo, `forgetTake` borra la carpeta ya y el `insert` termina después.
  4. Resultado: fila en «Tomas» con «Ya no está en este móvil» y, en el primer caso, el único original del móvil perdido (queda la descarga, si funcionó).
- **Además:** `saveTake.isPending` no cubre el `await probeVideo(...)` previo (hasta 3 s, l. 1153), así que el botón no enseña carga durante ese tiempo y un segundo toque lanza otro guardado (inofensivo gracias al camino de duplicado, pero confuso).
- **Evidencia:** lectura del código. No reproducido con latencia real (el backend demo es instantáneo); el recorrido se sigue sin ambigüedad.
- **Arreglo:** un `ref` `saving` que se pone a `true` antes del `probeVideo` y se baja al terminar; mientras esté activo, «Repetir» y el cierre quedan deshabilitados y el botón enseña `loading`. En el temporizador de `replaceTake` (y en el `forgetTake` diferido), leer el meta y no borrar si `kept`.
- **Test:** con OPFS falso: `forgetTake` diferido sobre una carpeta `kept` no la borra; en el componente, con un guardado pendiente «Repetir» está deshabilitado.

### N3 · Las tomas WebM recuperadas se guardan con duración 0 · nota 4

- **Dónde:** `RecordStudio.tsx` l. 138-158 (`probeVideo`), l. 1165 (la duración sale del contador si `seconds > 0` y, si no, de `probe.duration`), `recoverLeftover` (`setSeconds(-1)`).
- **Flujo:** el grabador de Chrome/Android produce WebM sin duración (`duration` = `Infinity`). `probeVideo` lo convierte en 0 y la fila se guarda con `duration_seconds = 0`. «Tomas» enseña «0:00» y la calidad de la copia compartida se calcula sin dato.
- **Evidencia (navegador):** recuperé una toma WebM de 2 s, la guardé y la fila salió con `dur: 0`, y con `recorded_at`, ancho y alto, `songStart 42,5`, `speed 0,75` y `mirrored` correctos. (Las tomas recién grabadas sí llevan duración, 5,938 s en la prueba de punta a punta, porque usan el contador.)
- **Arreglo:** en `probeVideo`, si `duration` no es finita, hacer `currentTime = 1e7`, esperar `durationchange` (como `measureDuration` de `shareTake.ts`) y devolverla. Mejor aún, guardar `seconds` en el `meta.json` al terminar la toma y usarlo al recuperar.
- **Test:** `probeVideo` con un `<video>` falso cuyo `duration` es `Infinity` hasta el salto; la fila de una toma recuperada lleva duración mayor que 0.

### N4 · Tras un error ambiguo al guardar se deshace `kept` sin comprobar si la fila llegó · nota 3

- **Dónde:** `data/takes.ts` l. 205-214.
- **Flujo:** el `insert` llega a la base pero la respuesta se pierde (error de red). `useSaveTake` hace `unkeepTake` y propaga el error. La fila existe y la carpeta ya no está marcada: «Tomas» enseña «Ya no está en este móvil», y el móvil ofrece la toma como sobrante «sin guardar». Si el bailarín la descarta en vez de reintentar, queda una fila fantasma. Reintentar sí lo arregla (camino de duplicado).
- **Relacionado:** `isDuplicate` (l. 171-174) casa con cualquier `23505` o «duplicate key», también con `takes_one_best_key` (carrera de estrellas): ahí `getTake` da `null` y el mensaje «Esta toma ya se guardó y luego se borró…» es falso.
- **Arreglo:** antes del `unkeepTake` de la rama genérica, `getTake(id)`; si la fila existe, tratarla como éxito. Limitar `isDuplicate` a `takes_pkey`.
- **Test:** `insertTake` que rechaza con la red caída y `getTake` que devuelve la fila → éxito y `kept` sigue puesto.

### N5 · El aviso de «no queda sitio» de la interfaz usa 1 GiB; la base deja de aceptar subidas 50 MiB antes · nota 3

- **Dónde:** `takeRules.ts` l. 311-313 (`wouldOverflow` con `SHARE.quotaBytes`), `TakesPanel.tsx` l. 848; migración l. 352 (`< 1073741824 - 52428800`).
- **Flujo:** con la nube en, por ejemplo, 990 MiB usados, `wouldOverflow(990 MiB, 16 MB)` es falso y el botón «Compartir» está activo. Se reduce la toma (tanto como dure) y la subida se niega por la regla de 50 MiB de margen; el bailarín lee «La nube no aceptó la toma: puede que esté llena».
- **Arreglo:** que `wouldOverflow` compare con `quotaBytes − maxBytes` (el mismo umbral que la base), y que el medidor marque «llena» a partir de ahí.
- **Test:** `wouldOverflow(1024**3 − 30*1024**2, 16e6)` es verdadero.

### N6 · Una carpeta con `meta.json` ilegible y trozos ya no se borra, pero tampoco se ofrece nunca · nota 3

- **Dónde:** `takeStore.ts` l. 326-337.
- **Flujo:** la corrección evita borrar a ciegas una toma guardada con el meta dañado, pero la carpeta queda para siempre: no sale como sobrante, no aparece en «Tomas» y ocupa el espacio de la toma (cientos de MB).
- **Evidencia (navegador):** carpeta con meta `{not json` y 5 trozos → sobrevive y no se ofrece.
- **Arreglo:** reconstruir un meta mínimo (`id` = nombre de la carpeta, `startedAt` = fecha del primer trozo, `kept` falso) y ofrecerla como sobrante.
- **Test:** con OPFS falso, `listLeftovers` devuelve esa carpeta como ofrecida.

### N7 · `friendlyError` casa el error de «0 filas» por texto que cambia entre versiones de PostgREST · nota 2

- **Dónde:** `lib/supabase.ts` l. 48 (regex con `PGRST116`, `0 rows` y `JSON object requested`).
- **Detalle:** `friendlyError` solo lee `error.message`; `PGRST116` es el `code` y «0 rows» va en `details`, y el `message` es «JSON object requested, multiple (or no) rows returned» o «Cannot coerce the result to a single JSON object» según la versión. Con la segunda redacción caería en «Algo salió mal». Además, `0 rows` casa también con «10 rows». No he podido comprobar qué versión sirve el proyecto real.
- **Arreglo:** leer también `error.code === 'PGRST116'` y añadir «Cannot coerce» o «single JSON object». **Test:** `friendlyError` con ambas redacciones y con un error cuyo `code` es `PGRST116`.

### N8 · Documentación desfasada · nota 2

- `docs/plan/ideas-one-shoot.md` l. 184 sigue diciendo «Borrarla la quita de la nube»; ya no es cierto (la UI avisa de que no libera espacio).
- `docs/DEPLOY.md` no incluye la purga de tomas archivadas y de sus archivos, ni la receta de restauración (con la advertencia del índice único `takes_one_best_key`). Hace falta para el tope duro de 12 000 filas y para recuperar espacio. Además, CLAUDE.md pide comprobar los advisors tras el DDL: pendiente al aplicar la migración (se esperan avisos 0028/0029 de `public.storage_usage()`, intencionados).

### N9 · Comentario obsoleto · nota 1

- `voiceRules.ts` l. 79 (`ModeGains.side`): el comentario dice que el lado va con signo positivo a la izquierda y negativo a la derecha; ahora va en fase en ambos canales.

---

## 4. Antes de aplicar la migración

Nada bloquea. Recomendado antes de desplegar: N2 y N3 (son pequeños y afectan a tomas reales), N5 (una línea) y N1 (tests). N4, N6, N7 y N8 pueden ir después.
