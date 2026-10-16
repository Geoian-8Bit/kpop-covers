# Revisión · Grabación paso 2 (R1 + R2) · Ronda 1

**Alcance:** `git diff aef8bb5..84efe01`, que toca `apps/web/src/features/record/takeStore.ts` (nuevo), `recorder.ts` y `RecordStudio.tsx`.
**Objetivo:** Samsung S24/S25, Chrome Android, PWA instalada; tomas de hasta 10 min a 16–40 Mbps (de 120 MB a 3 GB por toma).
**Tipo de revisión:** solo lectura. He ejecutado `pnpm typecheck` y `pnpm test`: los dos pasan, pero `apps/web` no tiene tests.

---

## Resumen

La idea de base es buena y casi todo está bien hecho. Cada trozo de 1 s va a su propio archivo en el almacenamiento privado (OPFS). Cada archivo se escribe de una vez, así que un cierre a mitad de escritura no deja trozos rotos. La toma final es un Blob que apunta a los archivos del disco, sin copia en memoria. Y si no hay OPFS, se graba en memoria como antes. También he comprobado que el orden de los trozos se mantiene cuando falla una escritura (abajo, en «Comprobaciones»).

Los problemas importantes no están en la escritura, sino en **cuándo se da una toma por guardada y cuándo se borra del disco**:

- **Pulsar «Guardar en el móvil» ya marca la toma como guardada**, aunque la descarga falle o se cancele. Al abrir otra vez el grabador, esa toma se borra sin ofrecerla. Esto pesa sobre todo justo cuando el móvil se queda sin espacio.
- **Las tomas guardadas no se borran en su momento.** Pueden borrarse demasiado pronto, mientras la descarga aún las está leyendo. O demasiado tarde: se acumulan en el disco toda la sesión de «Repetir».
- **Hay tomas que se quedan en el disco para siempre sin que nadie las vea:** las de otras canciones, o las de vídeos archivados.
- **«Descartar» en el aviso de toma sin guardar borra sin pedir confirmación**, con botones pequeños y muy juntos.
- **La cifra de minutos libres (R2) es poco fiable:** se calcula con el formato equivocado, se lee una sola vez y no se refresca.

No he encontrado copias de la toma entera en memoria. El coste de crear 600 archivos en 10 min es razonable.

| Gravedad | Nº | Notas |
| --- | --- | --- |
| 🔴 Serio | 1 | 7 |
| 🟡 Importante | 8 | 6, 6, 6, 6, 5, 5, 5, 5 |
| 🟢 Menor | 6 | 4, 4, 4, 4, 3, 3 |
| ⚪ Cosmético / limpieza | 3 | 2, 2, 2 |

---

## Hallazgos

### 🔴 1 · «Guardar en el móvil» da la toma por guardada sin saber si la descarga terminó · nota 7

- **Dónde:** `RecordStudio.tsx` ≈ 639–658 (`save`), 612–620 (`takeKept`); `takeStore.ts` ≈ 220–230 (`markTakeSaved`) y ≈ 207 (`listLeftovers` borra lo guardado).
- **Flujo:**
  1. Se pulsa «Guardar en el móvil».
  2. Se lanza la descarga y, sin esperar, se llama a `takeKept`, que marca la toma como guardada en su `meta.json`.
  3. Al cerrar, como ya consta como guardada, no se pide confirmación y la copia del disco se queda marcada.
  4. La próxima vez que se abre el grabador, `listLeftovers` la borra y no la ofrece.
- **Cuándo pasa:** con cualquier descarga que no llegue al final:
  - Chrome con «Preguntar dónde guardar» activado y el diálogo cancelado.
  - Error de descarga.
  - **Sobre todo, falta de espacio.** Si la toma se cortó porque el disco se llenó (aviso «El móvil se ha quedado sin espacio»), la descarga necesita otra vez el mismo espacio y casi seguro falla. Esa toma es precisamente la que más importa recuperar.
- **Protecciones actuales:** ninguna. Una página no puede saber si una descarga terminó.
- **Impacto:** se pierde la toma y la recuperación de R1 queda anulada justo en el caso para el que existe.
- **Evidencia:** `downloadFile` no devuelve nada que indique éxito (`recorder.ts` ≈ 199–209), y `takeKept()` se llama justo después, en las dos ramas.
- **¿Nuevo?** Marcar como guardado tras descargar ya existía. Que eso **borre la copia del disco** es nuevo en este paso.
- **Arreglo:**
  - Tras una descarga, no marcar la toma como «guardada» para siempre. Dejar una marca de «descargada a tal hora» y no borrarla hasta pasado un margen. Y nunca borrarla si la toma terminó por falta de espacio.
  - En la revisión, decirlo claro: «Comprueba que está en Descargas; la copia se borra al grabar la siguiente».
  - Con el aviso de falta de espacio, explicar que hay que liberar espacio **antes** de guardar.
  - Con compartir, el resultado sí es fiable («shared»): ahí se puede mantener la marca.
- **Test de regresión:** con una función pura de decisión de limpieza (ver «Tests que faltan»): una toma descargada hace menos de N minutos o terminada por falta de espacio no se borra; una compartida sí.

### 🟡 2 · Una toma guardada puede borrarse mientras la descarga aún la está leyendo · nota 6

- **Dónde:** `RecordStudio.tsx` ≈ 155–165 (comentario «cleaned on the next open, after any download has read it») y ≈ 229–232; `takeStore.ts` ≈ 207.
- **Flujo:**
  1. Se guarda una toma larga (3 GB a 40 Mbps).
  2. Se cierra el grabador, sin confirmación porque ya consta como guardada.
  3. Se vuelve a abrir enseguida, en la misma canción o en otra.
  4. `listLeftovers` borra la carpeta de esa toma.
- **Cuándo pasa:** si el navegador todavía está copiando la toma a Descargas. Copiar 1–3 GB lleva varios segundos. El comentario del código da por hecho que, al volver a abrir, la descarga habrá terminado; nada lo garantiza.
- **Protecciones:** ninguna. `listLeftovers` admite una lista de excepciones (`except`), pero nadie se la pasa.
- **Impacto:** la descarga se corta a medias y la copia del disco ya no existe, así que la toma se pierde. Chrome lee un Blob hecho de cientos de archivos parte por parte, y el borrado puede caer en medio. No lo he podido comprobar en el móvil; es deducción del código.
- **¿Nuevo?** Sí.
- **Arreglo:** el mismo margen de tiempo del hallazgo 1. Guardar en `meta.json` la hora a la que se descargó o compartió, y no borrar hasta pasados varios minutos. Así el comportamiento no depende de cuándo se vuelva a abrir el grabador.
- **Test:** función de limpieza que recibe la hora actual: una toma «guardada hace 30 s» se conserva y una «guardada hace 1 h» se borra.

### 🟡 3 · Las tomas guardadas se acumulan en el disco durante toda la sesión · nota 6

- **Dónde:** `RecordStudio.tsx` ≈ 160–161 (una toma guardada no se borra al dejarla) y ≈ 604–609 (`again`).
- **Flujo:** grabar → guardar → «Repetir» → grabar → guardar → «Repetir»… Es el uso normal en un ensayo. Cada toma guardada se queda en OPFS hasta que se vuelve a abrir el grabador.
- **Cuándo pasa:** siempre que se graban varias tomas seguidas sin cerrar. Por ejemplo, 10 tomas de 3 min a 16 Mbps son unos 3,6 GB guardados dos veces: en OPFS y en Descargas.
- **Impacto:** el espacio libre baja sin motivo visible. Puede acabar en el corte «sin espacio» a mitad de una toma, que es justo lo que R2 quiere evitar.
- **¿Nuevo?** Sí.
- **Arreglo:** borrar la copia de la toma guardada anterior cuando haya pasado el margen del hallazgo 2. Por ejemplo, al terminar la siguiente toma, o con un temporizador de unos minutos. Mantener como mucho una toma guardada pendiente de borrar.
- **Test:** la misma función de limpieza.

### 🟡 4 · Tomas que se quedan en el disco para siempre · nota 6

- **Dónde:** `RecordStudio.tsx` ≈ 229–232 (solo se busca la toma de **esta** canción); `takeStore.ts` ≈ 196–217.
- **Flujo:** la app se cierra a mitad de una toma de la canción A. La bailarina no vuelve a abrir el grabador de A: el vídeo se archivó, era de prueba, o simplemente no se acuerda.
- **Cuándo pasa:**
  - La toma de A no se ofrece en ningún otro sitio y no se borra nunca.
  - Lo mismo ocurre con las tomas de vídeos archivados, cuyo grabador ya no se puede abrir.
  - Si hay varias tomas sin guardar de la misma canción, solo se ve la más reciente.
- **Impacto:**
  - Gigas ocupados sin que nadie los vea.
  - Esos gigas cuentan en el cálculo de espacio, así que el aviso «Queda poco espacio» puede salir por culpa de la propia app, y aun así pide «Libera espacio».
  - Además, cada apertura vuelve a leer todas esas tomas (hallazgo 13).
- **¿Nuevo?** Sí.
- **Arreglo:**
  - Que el aviso cuente también las tomas de otras canciones, usando el título guardado en `meta.json`: «Hay 2 tomas sin guardar de otras canciones (1,4 GB)». Con una opción para recuperarlas o descartarlas.
  - O mostrar el aviso al abrir la app, no solo en el grabador.
  - Además, un límite de antigüedad, por ejemplo 7 días, avisando antes de borrar.
- **Test:** función pura que, a partir de una lista de metadatos (vídeo, fecha, guardada, tamaño), decide qué se ofrece aquí, qué se resume como «otras canciones» y qué se borra.

### 🟡 5 · «Descartar» en el aviso de toma sin guardar borra sin confirmar · nota 6

- **Dónde:** `RecordStudio.tsx` ≈ 711–715 (`dropLeftover`) y ≈ 983–990.
- **Flujo:** aparece el aviso con «Recuperar» y «Descartar» uno al lado del otro. Los dos miden 36 px de alto (tamaño `sm` = `h-9`) y están separados por 8 px. Un toque en «Descartar» borra la carpeta al momento.
- **Impacto:** pérdida irreversible de lo que puede ser la única copia de una toma de 10 min, con un solo toque y sin forma de deshacer. El resto del grabador sí pide confirmación para descartar («¿Descartar la toma?»).
- **¿Nuevo?** Sí.
- **Arreglo:** reutilizar el diálogo de confirmación que ya existe, con un texto propio («Se borra la toma del 16/10, 14:05. No se puede recuperar»). Botones de al menos 44 px (tamaño `md`) y más separados.
- **Test:** sin vitest en web, comprobarlo a mano. Tocar «Descartar» debe abrir la confirmación y la carpeta debe seguir en OPFS hasta confirmar (DevTools remoto → Application → Storage).

### 🟡 6 · Los minutos libres y el panel «i» usan el formato de un lienzo de 2×2 · nota 5

- **Dónde:** `RecordStudio.tsx` ≈ 691–698 (`nextFormat` memorizado con `camReady`, `view.aspect` y `view.deviceId`) y ≈ 483–492 (`plannedFormat`).
- **Flujo:**
  1. La cámara pasa a «lista» justo después de llamar a `video.play()` (`useCamera.ts` ≈ 104–132).
  2. En ese momento el lienzo todavía mide 2×2. Solo cambia de tamaño en el primer fotograma dibujado (`compositor.ts` ≈ 58–65).
  3. `view.aspect` cambia con `loadedmetadata` y `resize`, que llegan **antes** de ese primer dibujo.
  4. En vertical, la proporción 9:16 coincide con la inicial y ni siquiera cambia.
  5. Resultado: `nextFormat` se calcula con 2×2 y se queda congelado.
- **Impacto:**
  - `resolutionClass(2, 2)` da «720p», que son 8 Mbps en la tabla, en lugar de 12 Mbps para 1080p. Los «~N min libres» salen aproximadamente un 50 % más optimistas y el aviso de poco espacio llega tarde.
  - El panel «i» muestra un formato pedido y un nivel H.264 que no son los de la toma real. La toma en sí usa `plannedFormat()` al empezar, así que esa sí es correcta.
- **Evidencia:** antes de este cambio, el panel «i» calculaba `plannedFormat()` en cada render, y el grabador se vuelve a renderizar a menudo. El `useMemo` es nuevo. Es una deducción del código; no lo he visto en pantalla.
- **¿Nuevo?** Sí (es una regresión del panel «i»).
- **Arreglo:** calcular el formato a partir de un tamaño fiable que cambie cuando cambie el lienzo. Por ejemplo, que el compositor avise cuando cambia de tamaño y guarde el ancho y alto en `view`. O no mostrar los minutos hasta `frameReady()`.
- **Test:** función pura que, a partir del ancho, alto, cuota y uso, devuelve los minutos y el aviso. Comprobar que con un tamaño 2×2 o desconocido devuelve «desconocido» y no un número.

### 🟡 7 · El espacio libre se lee una sola vez, y antes de la limpieza · nota 5

- **Dónde:** `RecordStudio.tsx` ≈ 229–235: `listLeftovers()` y `freeSpace()` se lanzan a la vez al abrir, y no hay ninguna otra llamada a `freeSpace`.
- **Flujo:**
  - Al abrir, la estimación se toma antes de que `listLeftovers` borre las tomas guardadas. Si se acaba de guardar una toma de 3 GB, la cifra sale 3 GB más baja y puede saltar «Queda poco espacio» sin motivo.
  - Durante la sesión, la cifra no se actualiza tras cada toma, ni tras descartar el aviso de toma sin guardar, ni tras guardar.
- **Impacto:** el aviso de R2 se equivoca en los dos sentidos: falsos avisos y avisos que no llegan.
- **¿Nuevo?** Sí.
- **Arreglo:** esperar a la limpieza antes de calcular el espacio. Volver a calcularlo al volver a «idle» (tras «Repetir», al terminar o descartar una toma, al descartar el aviso).
- **Test:** a mano en el móvil: guardar una toma grande, cerrar, abrir, y comparar los minutos con los de antes de grabar.

### 🟡 8 · Sin cerrojo entre pestañas: otra ventana puede ofrecer o borrar la toma que se está grabando · nota 5

- **Dónde:** `takeStore.ts` ≈ 196–211 (el parámetro `except` existe, pero ninguna llamada lo usa); `RecordStudio.tsx` ≈ 229.
- **Flujo:** con la PWA y una pestaña de Chrome abiertas a la vez (comparten OPFS), la pestaña B abre el grabador de la misma canción mientras A está grabando.
  - B ve la toma de A como «sin guardar» y ofrece «Recuperar» o «Descartar». Con «Descartar», o con «Recuperar» y luego «Repetir», B borra la carpeta de A.
  - Si A lleva menos de 1 s (todavía sin trozos), B la borra sola por «vacía».
  - Si A está entre crear la carpeta y escribir `meta.json`, B la borra por «ilegible».
- **Impacto en A:**
  1. La siguiente escritura falla.
  2. Sale «El móvil se ha quedado sin espacio», un texto falso.
  3. La toma termina.
  4. `finish` no puede leer los trozos y devuelve solo lo que quedaba en memoria, casi nada y sin avisar (`takeStore.ts` ≈ 169–171).
- **Cuándo pasa:** solo con dos ventanas de la app a la vez. Es poco habitual entre bailarinas, más habitual al probar.
- **¿Nuevo?** Sí.
- **Arreglo:**
  - Tomar un cerrojo de Web Locks por toma (nombre con su id) mientras se graba o se revisa. `listLeftovers` salta las tomas con cerrojo activo, consultándolo con `navigator.locks.query()`.
  - No borrar nunca por «vacía» o «ilegible» una toma de hace menos de unos minutos.
  - Distinguir el error de cuota de otros errores antes de decir «sin espacio».
- **Test:** función de clasificación con «tiene cerrojo» y «edad» como entradas.

### 🟡 9 · `listLeftovers` borra la toma entera ante cualquier error de lectura · nota 5

- **Dónde:** `takeStore.ts` ≈ 209–211.
- **Flujo:** cualquier excepción al leer `meta.json` o cualquiera de los cientos de trozos acaba en el borrado recursivo de la carpeta. Por ejemplo: un error puntual de E/S, un archivo bloqueado o un nombre inesperado.
- **Impacto:** una toma de varios GB, recuperable en su mayor parte, se borra por un fallo pasajero o por un solo archivo.
- **¿Nuevo?** Sí.
- **Arreglo:**
  - Borrar solo si no hay `meta.json` **y** no hay trozos, o si la carpeta tiene más de X días.
  - Si falla la lectura, dejarla para la próxima vez.
  - Si falla un solo trozo, ofrecer lo que se pueda leer hasta ese punto.
- **Test:** clasificación con un directorio falso que falla en un trozo: el resultado debe ser «conservar», no «borrar».

### 🟢 10 · Al irse al fondo, el último segundo se queda dentro del grabador · nota 4

- **Dónde:** `recorder.ts` ≈ 112–116 (`pause`); `RecordStudio.tsx` ≈ 559–570 (pausa al ocultarse la app).
- **Flujo:** la app se oculta y la toma se pausa. Lo grabado desde el último trozo (hasta 1 s) sigue dentro de MediaRecorder sin escribir. Si Android mata la app en segundo plano, cosa frecuente con la cámara y 3 GB en uso, esa parte se pierde.
- **Arreglo:** pedir los datos pendientes (`requestData()`) justo antes de pausar, para que el trozo llegue al disco antes de pasar a segundo plano.
- **¿Nuevo?** Sí, en cuanto a la recuperación.
- **Test:** en el móvil: grabar 5 s, cambiar de app, matar Chrome desde Recientes, volver y recuperar. La duración debe ser de unos 5 s.

### 🟢 11 · La toma recuperada usa el formato pedido, no el que se grabó de verdad · nota 4

- **Dónde:** `RecordStudio.tsx` ≈ 172 (`mimeType: plannedFormat().mimeType` al preparar); `recorder.ts` ≈ 82–85 (si el codificador rechaza el tipo pedido, el navegador elige otro); `RecordStudio.tsx` ≈ 704–705.
- **Flujo:**
  - Si el MediaRecorder no acepta el tipo pedido y elige otro (por ejemplo WebM), el `meta.json` sigue diciendo MP4. Al recuperar, el archivo se llama `.mp4` pero contiene WebM, y la Galería puede no abrirlo.
  - Si se pidió '' (que elija el navegador), se usa `video/webm` a ciegas.
- **Arreglo:** al empezar, o con el primer trozo, reescribir `meta.json` con `rec.mimeType` real.
- **Test:** una función de nombre y tipo de archivo con «pedido» y «real» como entradas.

### 🟢 12 · Accesibilidad del aviso de toma sin guardar y del aviso de poco espacio · nota 4

- **Dónde:** `RecordStudio.tsx` ≈ 968–1002.
- **Problemas:**
  - El aviso de toma sin guardar es un `role="region"`. Aparece de forma asíncrona y un lector de pantalla no lo anuncia. Mejor `role="status"` en el título, o mover el foco al aviso.
  - «Recuperar» y «Descartar» miden 36 px de alto, por debajo de los 44 px que pide `DESIGN.md`.
  - El aviso de poco espacio tiene texto washi (#f3ecdf) en negrita de 13 px sobre `shu-500` (#d0452d) al 90 %. El contraste es de unos 3,9:1, por debajo de 4,5:1. El mismo par ya se usa en la pastilla del tiempo grabado, así que en parte viene de antes.
  - Movimiento reducido: bien. El aviso usa el preset `soft` y `MotionConfig reducedMotion="user"` quita el desplazamiento.
- **¿Nuevo?** Sí (salvo el color, que ya existía).
- **Arreglo:** usar `role="status"`, botones `md` (44 px) y, para el aviso, fondo `sumi-900` con borde o icono bermellón, o texto en `sumi-900` sobre `shu-400`.

### 🟢 13 · `listLeftovers` lee todas las tomas de todas las canciones en cada apertura · nota 4

- **Dónde:** `takeStore.ts` ≈ 201–208.
- **Qué hace:** por cada carpeta, abre los cientos de trozos (unas 600 llamadas a `getFileHandle` y `getFile` para una toma de 10 min) **antes** de mirar si está guardada, y aunque sea de otra canción que no se va a mostrar.
- **Impacto:** con 3 o 4 tomas olvidadas son miles de llamadas al abrir, compitiendo con el arranque de la cámara. No bloquea la interfaz, pero el aviso tarda en salir.
- **Arreglo:** leer primero `meta.json`. Borrar las guardadas sin leer sus trozos. Leer los trozos (o solo sumar sus tamaños) únicamente de la toma que se va a ofrecer, y construir el Blob al pulsar «Recuperar».
- **Test:** la función de clasificación no debe pedir los trozos de las tomas guardadas ni de las de otras canciones.

### 🟢 14 · Textos del aviso de espacio y del error de escritura · nota 3

- «Libera espacio o **baja la calidad**»: hoy no hay forma de bajar la calidad, porque `quality: 'auto'` es fijo y los ajustes llegan en el paso 6. Hasta entonces, mejor «Libera espacio antes de grabar».
- Con 0 minutos sale «unos 0 min». Mejor «No queda espacio para grabar en esta calidad».
- «~42 min libres» se lee raro. El plan propone «Te quedan unos 42 min de grabación»; en el pie corto valdría «~42 min de grabación».
- «El móvil se ha quedado sin espacio» sale ante **cualquier** fallo de escritura, no solo de cuota (`takeStore.ts` ≈ 157–160). Mirar si el error es `QuotaExceededError` y, si no, usar un texto neutro.
- El aviso de toma sin guardar dice «La app se cerró antes de guardarla». Es correcto en casi todos los casos.

### 🟢 15 · En horizontal, el aviso de toma sin guardar y los avisos temporales se pisan · nota 3

- **Dónde:** `RecordStudio.tsx` ≈ 961 y ≈ 975: los dos llevan `landscape:absolute` abajo a la derecha. El aviso de poco espacio (≈ 994) queda dentro del flujo de una fila horizontal y empuja los controles.
- **Cuándo pasa:** por ejemplo, si sale «La canción no arranca…» con el aviso de toma sin guardar visible.
- **Además:** en horizontal, el pie con los minutos libres está oculto (`landscape:hidden`), así que no se ven.
- No lo he comprobado en pantalla; es deducción de las clases.
- **Arreglo:** apilar los avisos en un único contenedor posicionado y mostrar los minutos también en horizontal.

### ⚪ 16 · Si `createTakeSink` falla, la grabación se queda en «Arrancando la canción…» para siempre · nota 2

- **Dónde:** `RecordStudio.tsx` ≈ 429–434: el caso de error no hace nada. En ≈ 180 queda un rechazo sin capturar.
- Hoy es casi imposible, porque `createTakeSink` captura todo. Aun así conviene volver a «idle» con un aviso.

### ⚪ 17 · Código sin usar · nota 2

- `TakeSink.markSaved()` y `bytes()` no se usan. `RecordStudio` usa `markTakeSaved(id)`.
- El parámetro `except` de `listLeftovers` no se usa (ver el hallazgo 8).
- `recoverLeftover` es `async` sin ningún `await`.
- Si se arreglan los hallazgos 1–3, lo natural es usar `sink.markSaved` o un `markKept(when)` y quitar lo que sobre.

### ⚪ 18 · Detalles de la toma recuperada · nota 2

- El nombre del archivo lleva la fecha de hoy, no la de la toma (`takeFileName` usa la hora actual).
- «Detalles» (panel «i») muestra las estadísticas de la toma anterior de esta sesión, no las de la recuperada.
- Caso muy raro: si una toma terminó por el límite de 8 s y un trozo tardío falla al escribirse, el `onError` de esa toma vieja podría terminar la toma nueva, porque solo comprueba `recorder.current`.

---

## Tests que faltan

`apps/web` no tiene vitest. Propongo sacar a funciones puras, en `packages/shared` o en un vitest nuevo de web, lo siguiente:

1. **Clasificación de tomas en disco.** A partir de una lista con id, vídeo, fecha, guardada/descargada y cuándo, tamaño, error de lectura, cerrojo activo y la hora actual, decidir para cada una: ofrecer aquí / resumir como otras canciones / conservar / borrar. Cubre los hallazgos 1, 2, 3, 4, 8, 9 y 13.
2. **Política de limpieza al dejar la revisión.** Equivale a `replaceTake`: con la toma anterior, si estaba guardada y cuándo, y la nueva, decidir si se borra ahora, más tarde o nunca.
3. **Sumidero de trozos con un directorio falso en memoria** (inyectar las funciones de escribir, listar y borrar):
   - el orden se mantiene;
   - si falla el trozo n, lo demás va a memoria en orden y `onError` se llama una vez;
   - `discard` durante escrituras pendientes no deja archivos;
   - `finish` espera a la cola;
   - un error que no es de cuota no dice «sin espacio».
4. **Orden y nombres de los trozos:** el relleno con ceros y la ordenación por nombre, incluidos 999 → 1000 y la existencia de un `.crswap` junto a los `.part`.
5. **Minutos y aviso de espacio:** tamaño desconocido o 2×2 → desconocido; 0 minutos → texto de «sin espacio»; umbral `LOW_SPACE_MINUTES`.
6. **Ciclo de vida del sumidero en el grabador** (`prepareSink`, `dropUnusedSink`, `finish`, `discardTake`, cierre). Se puede extraer a un pequeño gestor con `createSink` inyectado y comprobar que cada camino (cancelar la cuenta atrás, la canción que no arranca, cerrar en cada fase, terminar, descartar) deja exactamente 0 o 1 carpeta y nunca ninguna «perdida».

## Comprobaciones hechas

- `pnpm typecheck` y `pnpm test`: pasan (66 tests en shared; ninguno en web).
- **Orden de los trozos con fallo de cuota:** al fallar el trozo n, los trozos que ya esperaban en la cola pasan a memoria en microtareas seguidas. Un trozo nuevo llega como evento (`dataavailable`), y eso no puede colarse entre esas microtareas. `MediaRecorder.stop()` tampoco entrega datos de forma síncrona. Por tanto, el orden en memoria se mantiene. No es un fallo.
- **Cierre a mitad de escritura:** `createWritable` escribe en un archivo aparte (`.crswap`) y solo lo pone en su sitio al cerrar. La lectura filtra por `.part`, así que nunca se lee un trozo a medias. El `.crswap` sobrante se borra con la carpeta.
- **Memoria:** `new Blob([archivos])`, `new File([blob])`, `URL.createObjectURL` y la descarga referencian los archivos del disco sin copiarlos. No he visto ninguna copia completa en memoria. Lo que queda en memoria es la cola de trozos pendientes, que normalmente es de 1 a 2 trozos, y el resto tras un fallo de cuota, que es corto porque la toma termina enseguida.
- **Ciclo del sumidero:**
  - cancelar la cuenta atrás, la canción que no arranca y cerrar durante la preparación descartan bien. Cuando `cancel` y `dropUnusedSink` coinciden, la doble llamada a `discard` es inofensiva;
  - si se cierra durante «finishing», la toma queda en disco sin guardar y se ofrece la próxima vez, que es lo deseable;
  - un fallo en `roll()` deja el sumidero para reutilizarlo en el siguiente intento, con una fecha antigua en `meta.json`, cosa menor.
- **Navegadores sin OPFS o sin `createWritable`:** el fallo al escribir `meta.json` en `createTakeSink` hace caer a memoria. Correcto.
- **Movimiento reducido:** el aviso nuevo usa el preset `soft`, y `MotionConfig reducedMotion="user"` está en `App.tsx`.

## Limitaciones (no verificado; probar en el S24/S25)

- **Archivo parcial MP4.** No he podido comprobar cómo trocea Chrome el MP4 fragmentado de MediaRecorder: si la cabecera va en el primer trozo y si cada trozo cierra un fragmento. Tampoco cómo se ve un archivo cortado en la Galería, en WhatsApp y en el ordenador: duración, saltar a un punto, último fragmento incompleto. **Prueba:** grabar 2 min, matar Chrome, recuperar, guardar y abrirlo en la Galería y en VLC. Si la duración sale como 0 o no se puede saltar, habrá que reconstruir el índice al recuperar.
- **WebM parcial.** El WebM de Chrome ya sale sin duración aunque termine bien. Recuperado se reproduce de seguido, pero no permite saltar.
- **`navigator.storage.estimate()` en Chrome Android.** `quota - usage` es la cuota del navegador para la app, no necesariamente el espacio libre que muestra Ajustes. **Prueba:** comparar los minutos que da la app con el espacio libre real en Ajustes → Almacenamiento, con el móvil casi lleno.
- **`persist()`.** No se comprueba ni se muestra el resultado. En una PWA instalada Chrome suele concederlo sin preguntar; conviene mostrarlo en el panel «i», junto a si la toma va a «disco» o a «memoria» (`sink.where`).
- **Compartir archivos grandes.** No sé si Chrome Android copia el archivo entero a una carpeta temporal antes de compartirlo, lo que exigiría el doble de espacio, ni si tiene un límite de tamaño. Probarlo con una toma de 1 GB o más.
- **Coste de 600 archivos.** Me parece razonable (1 archivo por segundo, operaciones asíncronas fuera del hilo de dibujo), pero no está medido. Alternativa a valorar más adelante: un Worker que escriba en un único archivo con escritura directa y volcado a disco periódico. Serían menos archivos, un solo trozo al leer, y también sobrevive a un cierre.
- La maquetación en horizontal (hallazgo 15) y el valor congelado del hallazgo 6 están deducidos del código, no vistos en pantalla.
