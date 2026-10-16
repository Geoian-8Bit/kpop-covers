# Revisión · F3 «Tomas» y F4 «Mejor toma», lado cliente · Ronda 1

**Alcance:** árbol de trabajo sin commit de la rama `feat/plan-completo` (fase 2). Cliente de F3 y F4:

- `apps/web/src/features/takes/` (`TakesPanel.tsx`, `shareTake.ts`, `takeRules.ts` y su test) y `apps/web/src/data/takes.ts`.
- Integración en el estudio: `StudioPage.tsx` (pestaña «Clips | Tomas», diálogo de reproducción).
- Integración en el grabador: `RecordStudio.tsx` (botón «Guardar», `keepInApp`, `canKeep`, `reviewTake`, `replaceTake`, `takeTiming`/`reviewTiming`, recuperación de sobrantes) y `takeStore.ts` (`kept`, `timing`, `keepTake`, `listKeptTakes`, `loadKeptTake`, `forgetTake`, `leftoverAction` en `packages/shared/src/recording.ts`).
- Solo he leído la migración `20261016010000_takes.sql` para entender qué impone la base de datos; su revisión es del informe `F3-F4-F17-ronda-1-bd.md`. **F17 (voz y música) no la he revisado**; solo he mirado cómo el cambio de `engine.ts` roza al grabador (sin hallazgos).

**Tipo de revisión:** solo lectura. Los números de línea son los del árbol de trabajo actual.
**Comprobaciones:** `pnpm typecheck` y `pnpm test` pasan (shared 89, web 59). Además he probado en Chrome (servidor demo, `localhost:5174`, audio silenciado) con scripts por CDP que siembran tomas en `localStorage` y en OPFS. Los scripts están en el scratchpad (`r1/`). Lo que pone «comprobado» lo he visto ejecutarse; lo demás sale de leer el código, y lo digo.

---

## Resumen

La base es sólida. `leftoverAction` trata bien `kept`, el vídeo vive en OPFS y la fila en la base, el orden «fila primero, luego marcar en el móvil» evita tomas fantasma, y `reduceTake` libera todo (URL, pistas, `AudioContext`, elemento) en el `finally`. La lista no monta ningún `<video>`, y los botones de cada toma son de 44 px. No hay fugas de object URL en el grabador.

Los problemas están en tres sitios:

1. **El grabador no enseña si «Guardar» ha funcionado o ha fallado.** El aviso se pinta solo con la cámara visible, no en el repaso. Con red mala, el botón se queda quieto y no dice nada. Comprobado.
2. **«Compartir con el grupo» da por subido un archivo que puede no existir.** Cualquier error de la nube que no sea tamaño, tipo o red cuenta como «ya estaba subido». La fila queda apuntando a un archivo inexistente, y la base impide corregirlo después.
3. **La copia del móvil depende de un `meta.json` frágil.** Es lo único que dice «esta toma está guardada». Hay una carrera que puede quitarle el `kept` y un camino que borra carpetas con vídeo cuando el meta no se lee. Además, nada libera las copias huérfanas y nada avisa de que el navegador puede borrarlas.

No he encontrado pérdida de toma en el camino normal. Los escenarios que preguntaba el encargo salen así:

- **Limpieza de sobrantes estando guardada:** no borra una toma con `kept`, salvo por las rutas del hallazgo 4.
- **Lock liberado antes de tiempo:** `replaceTake` solo suelta el lock tras confirmar `kept`, y mientras tanto la toma sigue como «sin guardar». Correcto.
- **Guardar dos veces:** el botón se bloquea al terminar y `saveTake.isPending` cubre el vuelo, pero un reintento tras un fallo parcial choca con la clave primaria (hallazgo 3).
- **Toma recuperada de otra canción:** `canKeep` la bloquea. Falta explicarlo (hallazgo 14).

| Gravedad | Nº | Notas |
| --- | --- | --- |
| 🔴 Serio (bloquea) | 2 | 9, 8 |
| 🟡 Importante | 10 | 7, 6, 6, 5, 5, 5, 5, 5, 5, 5 |
| 🟢 Menor | 7 | 4, 4, 4, 4, 4, 3, 3 |
| ⚪ Cosmético / limpieza | 1 | 2–3 |

---

## Hallazgos

### 🔴 1 · «Guardar» no enseña ni el éxito ni los errores en el repaso · nota 9

- **Dónde:** `RecordStudio.tsx` 1139–1144 (`setNotice` tras guardar y en el `catch`), 1622–1636 (único sitio donde se pinta `notice`, dentro de `{showCamera && …}`), 1235 (`showCamera = phase !== 'review'`).
- **Flujo:**
  1. El bailarín termina la toma y llega al repaso (`phase === 'review'`, `showCamera === false`).
  2. Toca «Guardar» con mala red, o el servidor rechaza la fila, o `keepTake` falla.
  3. `mutateAsync` rechaza y el `catch` hace `setNotice(friendlyError(err))`. Ese `<motion.p role="status">` no existe en el repaso. El botón vuelve a «Guardar» sin ningún mensaje.
  4. A los 6 s el aviso se borra solo (efecto 664–668). Si el bailarín toca «Repetir» antes, el aviso reaparece sobre la cámara sin que nadie lo espere.
- **Evidencia (comprobado en Chrome):** recuperé una toma, hice que la escritura de la base demo lanzara un error y toqué «Guardar». Los únicos `[role=status]` o `[role=alert]` visibles fueron un texto fijo del reproductor, sin ningún error. El botón siguió como «Guardar». Con la escritura restaurada, el segundo toque sí cambió el botón a «En «Tomas»». Es el único feedback que hay, y solo en el caso feliz. El aviso de éxito («Guardada en «Tomas» de esta canción») tampoco se ve nunca. Es el mismo defecto que ya tenía el aviso de `takeKept` («El móvil va justo de espacio…», línea 1159). Con F3 se ha vuelto el camino principal.
- **Por qué importa:** «Guardar» es la acción de F3, y necesita red porque primero escribe la fila. En un local de ensayo con wifi pobre fallará a menudo y el bailarín no sabrá si la toma se guardó. Al cerrar, la app sí pregunta (`unsaved` sigue activo hasta que `kept` es `true`), pero tras un toque fallido no hay señal de qué hacer.
- **Arreglo propuesto:**
  - Pintar el aviso también en el repaso. Lo más limpio es extraer un `<Notice>` que se renderice fuera del bloque `showCamera`, con `role="status"` para éxitos y `role="alert"` para errores.
  - Para el error de «Guardar», mantenerlo hasta el siguiente intento en lugar de los 6 s.
  - Anunciar «Guardada» al lector de pantalla: hoy el botón queda `disabled` y pierde el foco.
- **Test:** prueba de componente con RTL (jsdom): montar el repaso con `useSaveTake` rechazando y comprobar que aparece un `role="alert"` con el texto de `friendlyError`. Un segundo caso con éxito comprueba que sale «Guardada en «Tomas»».

### 🔴 2 · «Compartir» marca como compartida una toma que no llegó a subirse · nota 8

- **Dónde:** `shareTake.ts` 367–370 (`upload.reason !== 'denied'`), 372–385 (reintentos), `lib/backend.ts` 48–58 (`uploadFailure` devuelve `'denied'` para todo lo que no es 413, 415 o red), 250–255.
- **Flujo:**
  1. El bailarín comparte una toma. La subida recibe un 500, 502 o 503, un 429, un 401 o un 403 por una política. Todos caen en `'denied'`.
  2. `shareTake` interpreta `'denied'` como «un intento anterior ya subió el archivo» y sigue. `updateTake` escribe `shared_path` y `shared_size` de un archivo que no existe.
  3. La base permite escribir `shared_path` una sola vez: `guard_take_share` lanza `shared_path_locked` si se intenta cambiar. La toma queda «Compartida» para siempre, sin archivo detrás. No se puede volver a compartir.
  4. Para el resto del grupo, «Reproducir» y «Descargar» dicen «No se pudo abrir la copia de la nube. Revisa la conexión.», que es engañoso.
- **Evidencia:** no lo he ejecutado contra Supabase (no toco el real), pero se ve en el código. `uploadFailure` solo reconoce 413/415 y red, y todo lo demás es `'denied'`. En la migración, la política de lectura solo deja leer si `v_path = p_name`, así que tampoco se puede comprobar «¿existe ya el archivo?» con un `createSignedUrl` antes de escribir la fila.
- **Arreglo propuesto (en este orden de preferencia):**
  - Mover el paso a la base: una función `security definer` `share_take(id, path)` que compruebe `storage.objects` y que `shared_path` sea nulo antes de escribirlo, y que lea el tamaño real del objeto. Así «archivo y fila» son un solo hecho verificable.
  - Si no, aceptar como «ya estaba» solo un 409 o un «Duplicate» explícito. Para los demás, `UPLOAD_COPY.denied` y no tocar la fila.
  - En cualquier caso, no usar `blob.size` como `shared_size` cuando se salta la subida: si el archivo era de otro intento, el tamaño no coincide y el medidor de nube se descuadra.
- **Test:** test de `shareTake` con `backend` simulado (`vi.mock('@/lib/backend')`). Con `uploadTakeFile → { ok: false, reason: 'denied' }` por un 500, `updateTake` **no** se llama y se lanza `FriendlyError`. Con un duplicado verdadero, sí se llama.

### 🟡 3 · «Guardar» no se puede reintentar tras un fallo parcial · nota 7

- **Dónde:** `data/takes.ts` 187–192 (`insertTake`, `keepTake`, `deleteTake` de rescate), `lib/backend.ts` `insertTake`, migración línea 12 (`id uuid primary key`) y política de lectura (`archived_at is null`).
- **Flujo A (respuesta perdida):**
  1. El `insert` llega a la base pero la respuesta no vuelve (corte de red típico en el móvil).
  2. El cliente ve un error. Al reintentar, el `insert` con el mismo `id` da `23505` (duplicado).
  3. La toma queda en el móvil, sin poder entrar en «Tomas». Solo se puede descargar.
- **Flujo B (`keepTake` falla):** el `catch` de rescate hace `deleteTake`. La base lo convierte en `archived_at`, pero la fila sigue ocupando el `id` y la política de lectura la oculta. Un nuevo intento con ese `id` también da `23505`, y no hay forma de verla ni de reutilizarla.
- **Por qué importa:** no se pierde nada (la toma sigue en el móvil como sobrante), pero la acción principal deja de funcionar para esa toma sin explicación, y por el hallazgo 1 el bailarín ni se entera.
- **Arreglo propuesto:**
  - Marcar `kept` en el móvil **antes** de escribir la fila. Si el `insert` falla, deshacer solo `kept` (la fila no existe, no hace falta archivar nada). Así no hay filas archivadas por un error nuestro.
  - Tratar `23505` como éxito idempotente cuando la fila existe y es de este dispositivo: pedirla con `select` y seguir. Si está archivada, avisar de forma clara de que hay que descargarla.
  - Para el caso sin red, valorar guardar primero en el móvil y sincronizar la fila después (es la promesa «por defecto, en el dispositivo» de la especificación).
- **Test:** `useSaveTake` con `insertTake` que rechaza la primera vez tras haberse creado la fila: el segundo intento acaba en éxito. Con `keepTake` que devuelve `false`, no queda ninguna fila archivada.

### 🟡 4 · `meta.json` es el único registro de «esta toma es mía»: una carrera y un borrado · nota 6

- **Dónde:** `takeStore.ts` 345–355 (`markTakeSaved`) y 360–371 (`keepTake`), que leen–modifican–escriben el meta sin coordinarse; 299–309 (`listLeftovers`, rama del meta ilegible); 245–248 y 266 (escrituras con el objeto `full` antiguo).
- **Flujo A (carrera):**
  1. En el repaso, el bailarín toca «Guardar» y, casi a la vez, «Descargar».
  2. `keepTake` lee el meta y `markTakeSaved` lee el mismo meta. Cada uno escribe su copia con su propio campo. Gana el último y se pierde el campo del otro.
  3. Si gana `markTakeSaved`, el meta queda con `savedAt` y sin `kept`. La fila existe en la base, pero a los 10 minutos `leftoverAction` ve «descargada, pasada la gracia» y **borra la carpeta con el vídeo**. La pestaña dirá «Ya no está en este móvil».
- **Flujo B (meta ilegible):**
  1. Una escritura interrumpida o un error transitorio deja el `meta.json` ilegible. En Chrome `createWritable` es atómico, pero no tengo garantía en Safari ni con el disco casi lleno.
  2. `listLeftovers` cae en el `catch` de 299–309, se inventa un registro vacío con `startedAt` en 1970 y `leftoverAction` responde `delete`. Esto borra la carpeta **aunque tenga cientos de trozos `.part`**.
- **Por qué importa:** antes de F3 una toma sin guardar era un sobrante recuperable. Ahora la carpeta es la **copia definitiva** de las tomas guardadas, y un único fichero de unos 300 bytes decide su vida. No lo he reproducido (la ventana de la carrera es de milisegundos), pero el flujo B se ve directamente en el código.
- **Arreglo propuesto:**
  - Serializar las escrituras del meta con una cola por `id` (una promesa encadenada por carpeta) o con un Web Lock. Y que `markTakeSaved` y `keepTake` relean tras escribir y reintenten si falta su campo.
  - En el `catch` de 299–309: si la carpeta tiene algún `.part`, **no borrar**. Dejarla como `keep` o, mejor, ofrecerla con un meta mínimo reconstruido.
  - Escribir un `meta.bak` (o doble escritura) para poder recuperar.
- **Test:** con un OPFS falso en memoria (un `Map` que imite `getDirectoryHandle`, `getFileHandle` y `createWritable`): (1) `keepTake` y `markTakeSaved` lanzados juntos dejan `kept` y `savedAt` a la vez; (2) una carpeta con meta corrupto y un trozo no la borra `listLeftovers`.

### 🟡 5 · El medidor de la nube cuenta solo filas vivas; borrar no libera nada y el aviso lo promete · nota 6

- **Dónde:** `lib/backend.ts` `sharedTakesBytes` (suma `shared_size` de las filas visibles), `TakesPanel.tsx` 340–347 (aviso «Borrad las tomas compartidas que ya no hagan falta») y 689–692 (el borrado dice «La copia de la nube deja de estar disponible»).
- **Flujo:**
  1. El grupo comparte 15 tomas de 50 MB, cerca del límite de 1 GB.
  2. Alguien borra tomas compartidas. La fila se archiva y deja de contar en el medidor, pero el archivo sigue en el bucket (las reglas del repo dicen que el cliente nunca borra archivos).
  3. El medidor baja, el aviso desaparece y el grupo cree que tiene espacio. El plan gratuito sigue lleno. La siguiente subida falla con un error de cuota que el cliente traduce como `denied` (y entonces cae en el hallazgo 2).
- **Por qué importa:** la especificación promete que «borrarla la quita de la nube» y que el medidor avisa al acercarse al límite. Con «borrar = archivar», hoy ninguna de las dos cosas es cierta.
- **Arreglo propuesto:** una función de solo lectura en la base (`security definer`) que sume el tamaño real de `storage.objects` del bucket `takes` del grupo, incluidas las filas archivadas. Si no se quiere, cambiar el texto: «Borrar quita la toma del grupo, pero la copia sigue ocupando espacio hasta que el administrador la purgue».
- **Test:** test de la función SQL (en `supabase/tests/`) con una fila archivada que tiene objeto en el bucket: el total la incluye. En el cliente, `quotaState` con ese total sigue marcando `warn`.

### 🟡 6 · Las copias guardadas huérfanas no se liberan nunca · nota 5

- **Dónde:** `data/takes.ts` 205–219 (`useDeleteTake` solo olvida la copia si `where === 'here'` o el `device_id` coincide), `takeStore.ts` 408–412 (`forgetTake` traga los errores), `recording.ts` 248 (`kept` → siempre `keep`).
- **Flujo:**
  1. Ana graba en su móvil y guarda la toma. Desde el portátil, Ana (como miembro) la borra. La fila se archiva, pero el móvil de Ana conserva la carpeta con `kept: true`.
  2. Ninguna pantalla la lista (la fila ya no sale) y `leftoverAction` nunca la borra por `kept`. Unos 360 MB por toma de 3 minutos ocupan espacio para siempre.
  3. Lo mismo si `removeEntry` falla en el móvil que borra: el error se traga y la carpeta queda huérfana.
- **Arreglo propuesto:** al abrir «Tomas» o el grabador, conciliar. Para cada carpeta `kept`, comprobar si su `id` sigue en la base (una consulta por lote a `takes` por `id`). Las que ya no existan pasan a `kept: false` con `savedAt` ahora, para que la limpieza normal las borre tras la gracia. Que `forgetTake` devuelva si borró.
- **Test:** con OPFS falso y una lista de filas vivas: las carpetas `kept` sin fila pasan a sobrantes borrables; las que tienen fila no se tocan.

### 🟡 7 · `listLeftovers` lee todos los trozos de cada toma guardada, cada vez que se abre el grabador · nota 5

- **Dónde:** `takeStore.ts` 310–318 (el tamaño se calcula antes de preguntar a `leftoverAction`) y 319–322 (que devuelve `keep` para `kept` sin mirar el tamaño).
- **Flujo:** al abrir el grabador (`RecordStudio.tsx` 379) se recorre OPFS. Para cada toma `kept` y sin `savedAt`, `readPieces` hace un `getFileHandle` y un `getFile` por cada trozo de 1 segundo, solo para sumar un tamaño que luego se descarta.
- **Evidencia (medido en Chrome de escritorio con SSD):** 5 tomas de 180 trozos (3 min) tardan unos **1.020 ms** en recorrerse, es decir, unos 200 ms por toma guardada. Con 20 tomas guardadas son unos 4 s en un portátil, y en un móvil medio será bastante más. Mientras tanto no sale el aviso de sobrantes ni se calcula el espacio libre (`freeSpace` va detrás).
- **Arreglo propuesto:** en `listLeftovers`, salir antes si `meta.kept`, sin calcular el tamaño (`continue`). Para las que tienen `savedAt`, que ya solo leen el primer trozo, dejarlo como está. Y guardar `bytes` en el meta al terminar la toma.
- **Test:** con OPFS falso que cuente llamadas a `getFile`: `listLeftovers` con 10 tomas `kept` de 180 trozos hace 0 llamadas a `getFile` de trozos.

### 🟡 8 · Sin conexión, «Tomas» se queda en esqueleto infinito · nota 5

- **Dónde:** `TakesPanel.tsx` 112 (`offline`), 204–219 (el orden de las ramas: `isPending` va antes que `offline`), `App.tsx` 21–26 (`networkMode` por defecto: «online»).
- **Flujo:**
  1. El bailarín abre el estudio con red y luego la pierde (el local de ensayo).
  2. Toca «Tomas» por primera vez. La consulta se queda `pending` con `fetchStatus: paused` y sin datos.
  3. `takes.isPending` es `true`, así que se pinta el esqueleto y nada más. La rama «Sin conexión…» solo se alcanza con datos o con error.
- **Evidencia (comprobado en Chrome, red desactivada):** el panel muestra tres esqueletos con `aria-busy="true"`, el contador a «0» y ningún mensaje.
- **Segundo caso (por código, no lo he ejecutado):** con datos en caché, un refetch pausado o fallido sustituye la lista por el panel de error. Las tomas que están en el móvil se podrían ver y descargar sin red, pero se esconden.
- **Arreglo propuesto:** comprobar `fetchStatus === paused` antes que `isPending`. Con datos en caché, mostrar la lista con una franja «Sin conexión: puede estar desactualizada». Solo cuando no haya datos, mostrar el panel de error. Ocultar el contador mientras carga.
- **Test:** prueba de componente con `onlineManager.setOnline(false)` y la consulta sin datos: aparece el texto «Sin conexión». Con datos en caché, la lista sigue visible.

### 🟡 9 · Las tomas recuperadas se guardan con metadatos falsos · nota 5

- **Dónde:** `RecordStudio.tsx` 1123–1138 (`keepInApp`), 1265–1271 (`recoverLeftover`: `setSeconds(-1)`, `reviewTiming = meta.timing ?? null`); `takeRules.ts` 203 (`recordedAt`).
- **Evidencia (comprobado en Chrome, con una toma sobrante de hace 3 días y `timing` en el meta):**
  - `recorded_at` salió como **hoy** (la fecha del guardado), no la del meta (`startedAt`). Vale también para una toma normal: queda en el momento de guardar, no en el de empezar. El filtro «Hoy» y el orden por fecha mienten.
  - `duration_seconds` salió **0** (`seconds` es −1 al recuperar) y `width`/`height` quedaron en `null`. La lista enseña «0:00», y «Compartir» usa `duration_seconds` para elegir la calidad de la copia (con 0 asume 2 Mbps y descubre el tamaño al final).
  - Si el sobrante es de antes de F3 (sin `timing`), se guarda `songStart: 0`, `speed: 1`, `mirrored: false` sin avisar. F5 sincronizará contra un segundo 0 que no es el real.
  - En una toma nueva, `width`/`height` salen de `view.mode` (la cámara de ahora), que no tiene por qué coincidir con el archivo.
- **Arreglo propuesto:**
  - Guardar en `reviewTake` el `startedAt` del meta y pasarlo como `recordedAt`. Para una toma nueva, el `startedAt` del sink.
  - Leer la duración y las dimensiones del propio archivo (un elemento de vídeo con `preload` de metadatos) cuando falten, o guardar `seconds` y el tamaño real en el meta al terminar la toma.
  - Sin `timing`, no inventar: avisar «No sé desde qué segundo se grabó» o marcar la fila como sin sincronía.
- **Test:** una toma con `meta.startedAt` de hace 3 días produce una fila con ese `recorded_at`; sin `timing`, la fila lleva la marca de «sin sincronía».

### 🟡 10 · El reproductor de tomas no pausa la canción, y la caja es 16:9 para vídeo vertical · nota 5

- **Dónde:** `StudioPage.tsx` 378–390 (el `Dialog` con el `<video>`), 348–352 (`onPlay` solo guarda la toma y la URL).
- **Flujo:**
  1. La canción suena en el estudio. El bailarín abre una toma desde «Tomas».
  2. El diálogo arranca la toma (`autoPlay`), pero nadie llama a `usePlayer.getState().pause()`. Suenan las dos a la vez. Solo por código: en el entorno de pruebas YouTube no llegó a reproducirse, así que no he oído el solape.
  3. La mayoría de las tomas son verticales (se graban de pie). Con `aspect-video` y `object-contain`, un 9:16 se ve en una franja baja y estrecha, con grandes bandas negras.
  4. El título del diálogo es «Toma» a secas, sin decir de quién ni de cuándo.
- **Arreglo propuesto:**
  - Pausar el reproductor al abrir (y no reanudarlo al cerrar).
  - Usar `take.width`/`take.height` para la proporción, con una altura máxima de 70 % de la pantalla. Con `aspect-video` solo como último recurso.
  - Título: «Toma de Ana · hoy, 18:21».
  - Revocar la URL también en el desmontaje (hoy solo en `onClose`): si se sale del estudio con el diálogo abierto, se pierde una URL. Es una fuga menor.
- **Test:** al llamar a `onPlay`, `usePlayer.getState().playing` pasa a `false`.

### 🟡 11 · «Compartir»: la subida no se puede cancelar ni tiene límite de tiempo · nota 5

- **Dónde:** `TakesPanel.tsx` 849 (`busy={working}`), 916–925 (el «Ahora no» está `disabled` mientras `working`; el «Cancelar» solo existe en la fase `reducing`), `shareTake.ts` 365–370.
- **Flujo:** la reducción termina y empieza la subida. En una wifi que se atasca, la petición no tiene `signal` ni tiempo máximo. El diálogo está `busy`, así que ni Escape, ni el gesto «atrás», ni «Ahora no» lo cierran. La barra es un esqueleto sin porcentaje. Solo recargando la página se sale, y se pierde la reducción (hasta 3 minutos de espera).
- **Arreglo propuesto:** pasar una `AbortSignal` a la subida (storage-js la admite en versiones recientes; si no, envolver con `Promise.race` y un tiempo de 60–90 s) y dejar «Cancelar» en las dos fases. Si cancelar a mitad es imposible, dejar al menos que el diálogo se cierre y que la subida acabe en segundo plano con un aviso.
- **Test:** con una subida que nunca resuelve, tras el tiempo máximo `useShareTake` pasa a `error` y el botón vuelve a estar disponible.

### 🟡 12 · Nadie avisa de que el navegador puede borrar las tomas guardadas · nota 5

- **Dónde:** `takeStore.ts` 173–179 (`askPersistence` lanza `persist()` una vez y descarta el resultado), `TakesPanel.tsx` (no hay ningún aviso).
- **Flujo:** las tomas «guardadas» son archivos de OPFS. Sin almacenamiento persistente, el navegador las puede borrar si el móvil va justo de espacio. Además, según la política de WebKit, Safari en iPhone borra el almacenamiento de las webs que no se usan en 7 días si no están instaladas en la pantalla de inicio. Lo único que verá el bailarín es «Ya no está en este móvil», sin haber recibido jamás una advertencia. No lo he podido probar en un iPhone.
- **Por qué importa:** la especificación vende «por defecto, en el dispositivo». Quien guarda la mejor toma de la semana cree que está a salvo.
- **Arreglo propuesto:** leer `navigator.storage.persisted()` al abrir «Tomas». Si es `false`, una línea discreta: «El navegador puede borrar las tomas guardadas si falta espacio. Descarga las importantes.» Pedir `persist()` también al primer «Guardar» (gesto del usuario), no solo al abrir el grabador.
- **Test:** con `persisted()` en `false`, el panel enseña el aviso; en `true`, no.

### 🟢 13 · Se puede repetir o cerrar mientras se guarda, y el resultado tardío toca el estado equivocado · nota 4

- **Dónde:** `RecordStudio.tsx` 1139–1143 (`.then` hace `setKept(true)` sin comprobar que sigue siendo la misma toma), 1807 (el botón «Repetir» no se bloquea con `saveTake.isPending`), 1081 (cerrar).
- **Flujo:** el bailarín toca «Guardar» con red lenta y, sin esperar, «Repetir» y «Descartar» (o cierra). `replaceTake` borra la carpeta. El guardado, que seguía en vuelo, llega a `keepTake`: devuelve `false`, el rescate archiva la fila (ver hallazgo 3) y el error no se ve (hallazgo 1). Es consistente, pero confuso. Si el guardado tarda más que la siguiente toma, `setKept(true)` llegaría con otra toma en pantalla: saldría «En «Tomas»» y `unsaved` pasaría a falso, así que se cerraría sin avisar. Es muy improbable, pero la consecuencia es perder una toma.
- **Arreglo propuesto:** deshabilitar «Repetir» y el cierre mientras `saveTake.isPending`, y en el `.then` comprobar `reviewTake.current === disk` antes de tocar el estado.
- **Test:** con un guardado pendiente, tras `replaceTake(null)`, al resolverse no cambia `kept`.

### 🟢 14 · «Guardar» desaparece sin explicación en algunos casos · nota 4

- **Dónde:** `RecordStudio.tsx` 1116 (`canKeep`), 1792–1797.
- **Casos:** (a) la toma está en memoria (sin OPFS: navegadores antiguos, modo privado, y también un iPhone cuya versión de Safari no tenga `createWritable`; `createTakeSink` cae en silencio a memoria); (b) toma recuperada de **otra canción**.
- **Qué pasa:** el repaso solo trae «Descargar», «Compartir» y «Repetir», sin una palabra. En el caso (b), «Repetir» pide confirmar el borrado, y la toma de otra canción se pierde si el bailarín no sabe que podía abrir esa otra canción para guardarla.
- **Arreglo propuesto:** una línea bajo los botones: «Este navegador no puede guardar en Tomas: descárgala» y «Es de otra canción: ábrela desde su estudio para guardarla en Tomas». En el caso (b), además, ofrecer ir allí.
- **Test:** con `reviewTake.videoId` distinto de `video.id`, el texto explicativo está presente.

### 🟢 15 · Textos del repaso: dos «Guardar» en iPhone y confirmaciones desfasadas · nota 4

- **Dónde:** `RecordStudio.tsx` 1795 y 1800, 1844, 1781; `TakesPanel.tsx` 136 (aviso al descargar).
- **Detalle:**
  - En iPhone salen «Guardar» (a Tomas) y «Guardar en Fotos» (descarga) a la vez. La especificación habla de «Descargar»; en iPhone la descarga es el «Guardar vídeo» de la hoja de compartir.
  - La confirmación «Aún no la has guardado en el móvil. Si la descartas, se pierde.» ya no cuadra: puede estar descargada pero no en Tomas, o al revés.
  - El texto «· guardado» junto al tamaño significa «descargada» y no se pone si la toma está solo en Tomas.
  - `TakesPanel.tsx` 136 dice «Descargando la toma» aunque en iPhone se haya abierto la hoja de compartir.
- **Arreglo propuesto:** «Guardar en Tomas» y «Descargar» / «Guardar en Fotos»; confirmación: «No la has guardado en Tomas ni la has descargado. Si la descartas, se pierde.»; «guardada en Tomas» y «descargada» como marcas separadas.

### 🟢 16 · iPhone: `downloadTake` lee el disco antes de abrir la hoja de compartir · nota 4

- **Dónde:** `data/takes.ts` 95–108 (`await loadKeptTake` antes de `shareFile`), a diferencia de `ShareDialog`, que precarga el `Blob` justo por esto (`TakesPanel.tsx` 816–829).
- **Flujo:** en iPhone `navigator.share` exige un gesto reciente. Montar el `Blob` de una toma larga son cientos de `getFile` (ver hallazgo 7). Si tarda, el gesto caduca, `shareFile` devuelve `failed` y se cae a `downloadFile`: el vídeo acaba en Archivos, no en Fotos, sin que el bailarín sepa por qué. No lo he podido probar en un iPhone.
- **Arreglo propuesto:** cargar el `Blob` al montar la fila o al abrir un menú, y llamar a `share` en el mismo turno del toque; o mostrar «Preparando…» y pedir un segundo toque para compartir.

### 🟢 17 · Accesibilidad: objetivos de 36 px, contraste y semántica · nota 4

- **`TakesPanel.tsx` 454–460 (el `Segmented` de fecha):** medido en un viewport de 390 px (comprobado), **«Hoy», «Esta semana» y «Todas» miden 36 px de alto**, menos que los 44 px. `components/ui/Segmented.tsx` 53 usa `h-9`. El selector «Clips | Tomas» del estudio usa el mismo componente.
- **`TakesPanel.tsx` 533 y 660:** una toma que está en otro móvil lleva `opacity-60` en toda la fila y las acciones «rechazadas» usan `text-washi-subtle/50`. En la captura se leen apenas. Son botones activos que explican el motivo al tocarlos, así que no deberían parecer inertes. Mejor `aria-disabled` con contraste suficiente y un icono.
- **`TakesPanel.tsx` 354–372 (`Chip`):** `role="radio"` dentro de `role="radiogroup"` sin navegación con flechas, y todos los radios están en el orden de tabulación. «Clips | Tomas» no es un `tablist`, no tiene `tabpanel` ni `aria-controls`, pero la especificación y el código lo llaman «pestaña».
- **`TakesPanel.tsx` 583–585:** la estrella usa `aria-pressed` y además cambia la etiqueta («Quitar de mejor toma» / «Marcar como mejor toma»). El lector dice «Quitar de mejor toma, pulsado». Una etiqueta fija («Mejor toma») con `aria-pressed` basta.
- En pantallas estrechas (menos de 640 px) las cuatro acciones son solo iconos. «Compartir» (nube con flecha) no se entiende sin texto.
- `StudioPage.tsx` 387–388: el vídeo del diálogo no tiene etiqueta.
- **Arreglo propuesto:** altura mínima de 44 px en el `Segmented` de este panel, más contraste en las acciones rechazadas, y arreglar la semántica de pestañas.
- **Test:** `getBoundingClientRect().height >= 44` para cada botón del panel en un viewport de 390 px (es el script que usé para medirlo).

### 🟢 18 · Carreras al marcar la estrella · nota 3

- **Dónde:** `data/takes.ts` 223–247 y `TakesPanel.tsx` 144–148.
- **Detalle:** `toggleBest` calcula `!take.is_best` con la `take` de la última pintada. Dos toques seguidos (antes de que llegue la actualización optimista) mandan las dos veces «true». Y dos escrituras `PATCH` en paralelo pueden llegar a la base en orden contrario: el botón enseña lo último que tocó el usuario, pero la invalidación final trae lo que haya quedado en la base y puede revertir la estrella.
- **Arreglo propuesto:** una `scope` con un id fijo en la mutación (TanStack Query 5.104 serializa las mutaciones del mismo ámbito) y leer el valor actual de la caché dentro de `mutationFn`.
- **Test:** dos `mutate` seguidos dejan el último valor en la base simulada.

### 🟢 19 · `askWho` dentro del grabador queda tapado · nota 3

- **Dónde:** `RecordStudio.tsx` 1121–1145, `components/ui/Dialog.tsx` (`z-50`) frente al grabador (`z-[90]`), `data/members.ts` 138–146 (`askWho`).
- **Detalle:** hoy casi nunca se abre desde el repaso, porque «Grabar» (`StudioPage.tsx` 299) ya pregunta antes y marca `asked`. Pero si algún camino llega al grabador sin pasar por ahí, el diálogo «¿Quién eres?» sale **detrás** del grabador y «Guardar» parece no hacer nada. Además, el `then` captura `members.data` del toque: si en el diálogo se crea un miembro nuevo, `currentMemberId` no lo encuentra y la toma se guarda «Sin nombre».
- **Arreglo propuesto:** leer `members` dentro del callback con `queryClient.getQueryData`, y subir el z-index de `WhoPromptHost` o no preguntar en el repaso.

### ⚪ 20 · Detalles menores

- `TakesPanel.tsx` 727–734 y 759: al abrir el diálogo de limpieza, el primer fotograma enseña «¿Borrar 0 tomas sin estrella?» porque `snapshot` se rellena en un efecto.
- `TakesPanel.tsx` 529: la salida usa `transition: { duration: 0.16 }`, que no es un preset de `lib/motion.ts` (regla del proyecto).
- `takeRules.ts` 156–165 (`assignPatch`): asignar una toma con estrella a quien ya tiene otra le quita la estrella sin avisar. Un aviso con `toast` bastaría.
- `TakesPanel.tsx` 592: «La mejor» se parte en dos líneas en anchuras medias (visto a 1.262 px).
- `StudioPage.tsx` 348 (`TakesPanel` sin `key`): si el estudio se reutiliza al pasar de una canción a otra, el filtro de clip de la anterior sigue activo y la lista sale «Ninguna toma con estos filtros». Poner `key={current.id}` al panel. No lo he reproducido.
- `takeStore.ts` 360–371: `keepTake` no comprueba que existan trozos antes de marcar `kept`.
- Falta cobertura: `takeRules.test.ts` es completo para las reglas puras (24 casos), pero no hay ningún test de `shareTake`, `useSaveTake`, `useDeleteTake` ni de `takeStore` (`keepTake`, `listKeptTakes`, `listLeftovers` con `kept`). Los hallazgos 2, 3, 4, 6 y 7 se cubrirían con un OPFS falso en memoria y un `backend` simulado.

---

## Lo que está bien

- Orden «fila primero, luego marcar en el móvil»; si `keepTake` falla, se deshace (con la salvedad del hallazgo 3).
- `leftoverAction` pone `kept` por delante de todo y tiene tests (`recording.test.ts` 187–188).
- `replaceTake` suelta el lock de una toma `kept` solo cuando `disk.kept` es cierto, y el grabador revoca su object URL en cada cambio.
- `reduceTake` hace en el `finally` toda la limpieza y respeta el gesto en iPhone (todo lo que lo necesita va antes del primer `await`).
- `useShareTake` aborta al desmontar y no deja arrancar dos copias a la vez.
- Los colores son tokens de `index.css`, y el kanji de la pestaña está en el subconjunto de la fuente (`index.html`).
- La lista no monta vídeos (el diálogo carga uno solo), así que el rendimiento de la pestaña es bueno con muchas tomas.
- Los textos están en español de España y el borrado de tomas ajenas explica el motivo al tocar.
