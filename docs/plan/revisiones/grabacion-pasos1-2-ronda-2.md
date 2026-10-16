# Revisión · Grabación pasos 1 y 2 · Ronda 2

**Alcance:** las correcciones del commit `ca87fcd` (`git diff 84efe01..ca87fcd`) a los hallazgos de nota 5 o más de la ronda 1:

- `grabacion-paso1-ronda-1-funcional.md` (en la tabla, «F»);
- `grabacion-paso1-ronda-1-rendimiento-diseno.md` («J» y «G»);
- `grabacion-paso2-ronda-1.md` («P2»).

Los pasos 3 y 4, que llegan en el mismo commit, los revisa otro revisor. Aquí solo se tocan cuando afectan a una corrección.

**Base revisada:** el commit `ca87fcd`, leído de git. Durante la revisión otro agente estaba cambiando el árbol de trabajo (`ImageControls.tsx` y cambios en `RecordStudio.tsx`, `camera.ts`, `recorder.ts` y `useCamera.ts`, sin commit). Nada de eso se revisa aquí, y las líneas citadas son las del commit.

**Escala:** 9–10 pérdida de datos o no funciona · 7–8 fallo plausible · 5–6 caso límite, accesibilidad o pulido · 3–4 calidad · 1–2 cosmético.

---

## Resumen

- **La mayoría de las correcciones están bien hechas.** Funcionan el selector Automático/Compatible, la columna en dos filas en horizontal, el panel por encima del diálogo, el reinicio al cerrar, los niveles por tamaño de fotograma, la confirmación al descartar, los cerrojos entre ventanas, la regla única de borrado con 10 minutos de margen y el espacio re-medido.
- **El plan B de formatos solo está corregido a medias.** Un codificador que no arranca falla en milisegundos. Ese caso, que era justo el de la ronda 1, no se marca como malo por el umbral de 1,5 s. Y cuando se marca, se marca la cadena exacta y no la familia: hacen falta hasta 4 tomas vacías para llegar a H.264.
- **Aún se puede perder una toma «guardada».** Si la toma cupo pero el móvil no tiene espacio para la copia de la descarga, la descarga falla, la app la da por guardada y borra la copia 10 minutos después. La protección «sin espacio» solo cubre la toma que se cortó al grabar.
- **Regresión pequeña:** una toma cortada por falta de espacio que la bailarina descarta a propósito no se borra. Sigue ocupando el espacio en un móvil lleno.

| Gravedad | Nº | Notas |
| --- | --- | --- |
| 🔴 | 2 | 7, 7 |
| 🟡 | 3 | 6, 5, 5 |
| 🟢 | 6 | 4, 4, 4, 3, 3, 3 |
| ⚪ | 2 | 2, 2 |

---

## Estado de los hallazgos de la ronda 1 (nota ≥ 5)

| Hallazgo (nota) | Estado | Comprobación |
| --- | --- | --- |
| F1 / G1 · Sin plan B si el formato aceptado no graba (7) | **Parcial** | Si el grabador falla al crearse o al arrancar, ahora se marca el formato y se prueba el siguiente (`RecordStudio.tsx:519-538`). Pero el fallo del codificador, que llega a los pocos milisegundos, no se marca por el umbral de 1,5 s (`RecordStudio.tsx:457`, ver N1). Se marca la cadena exacta y no el códec (N3). El texto «Este navegador no puede grabar vídeo» sigue igual (N12). El panel no muestra qué formato se descartó (N4). |
| F2 · HEVC por defecto y sin forma de cambiarlo (6) | **Corregido** | Hay un selector «Automático / Compatible» en el panel (`InfoPanel.tsx:161-179`), que se guarda en el móvil (`settings.ts`). La clave de la caché de formatos incluye el códec (`recorder.ts:72`) y el formato que se muestra se recalcula al cambiarlo (`RecordStudio.tsx:874-877`). Sigue arrancando en «Automático»: es una decisión, no un fallo. |
| F3 / J3 · El botón «i» se sale de la pantalla en horizontal (6 / 5) | **Corregido** (por código) | En horizontal la columna tiene alto fijo, de arriba abajo, y pasa a una segunda columna (`RecordStudio.tsx:1005`). Con 6 botones caben 4 en la primera y 2 en la segunda. Falta verlo en el móvil. |
| F4 · «Formato real» no es el real (5) | **Corregido** | Ahora se llama «Formato declarado» (`InfoPanel.tsx:193`). Es la alternativa que proponía la ronda 1; leer la caja `avcC`/`hvcC` sigue pendiente. |
| F5 / J4 · El panel no cumple la regla de diálogos (5 / 4) | **Parcial** | Ya se hace: el foco va a «Cerrar», Esc cierra, `aria-modal`, `aria-expanded` y la vuelta del foco (`InfoPanel.tsx:67-81`). Falta: el gesto «atrás» en reposo con el panel abierto sigue cerrando el grabador entero (`RecordStudio.tsx:764`; no hay `useBackToClose` para el panel). No hay trampa de foco: el tabulador sale del panel. La vuelta del foco le quita el foco al diálogo de confirmar (N6). |
| F6 / G2 · Más memoria por toma antes de R1 (5) | **Corregido** (por diseño) | Con R1 la toma va al disco, trozo a trozo. Falta la prueba de 10 minutos en el S24. |
| F7 · Niveles sin mirar el tamaño del fotograma (5) | **Corregido** | Se comprueban macrobloques o muestras por fotograma, por segundo y por lado (`recording.ts:60-94`), con tests de 4:3 y vertical (`recording.test.ts:73-82`). He rehecho a mano 1080p, 1440p y 4K a 30 y 60 en vertical y en horizontal, y 1920×1440: todos dan el nivel correcto. Queda un detalle de tasa de bits (N9). |
| J1 · El panel tapa «¿Descartar la toma?» (5) | **Corregido** | El panel no se pinta mientras hay una confirmación (`RecordStudio.tsx:1069`) y vuelve al cancelarla. |
| J2 · El aviso de zoom digital pisa el aviso de sonido (5) | **Corregido** | El aviso está ahora en la pila de abajo (`RecordStudio.tsx:1210-1223`), con texto washi sobre `sumi-900` y el preset `soft`. |
| P2-1 · «Guardar» da la toma por guardada sin saber si terminó (7) | **Parcial** | Ya se hace: la hora de guardado (`savedAt`) con 10 minutos de margen, y la toma cortada por falta de espacio no se marca (`RecordStudio.tsx:790-797`). Falta: si la toma cupo pero no queda espacio para la copia de la descarga, se pierde a los 10 minutos (N2). Si una toma «sin espacio» se recupera, pierde esa protección, porque no se guarda en el disco. No hay ningún texto del tipo «comprueba que está en Descargas». |
| P2-2 · Se borra mientras la descarga aún lee (6) | **Corregido** | Hay un margen de 10 minutos en dos sitios: `leftoverAction` (`recording.ts:228-239`) y el temporizador de `replaceTake` (`RecordStudio.tsx:189-193`). |
| P2-3 · Las tomas guardadas se acumulan (6) | **Corregido** | Cada copia se borra 10 minutos después de salir de la revisión. Puede haber 2 o 3 a la vez en un ensayo rápido, que es razonable. |
| P2-4 · Tomas que se quedan en el disco para siempre (6) | **Corregido** | Ahora se ofrecen las tomas de cualquier canción, con el título y el total (`RecordStudio.tsx:280-287` y `1180-1188`). Matiz: solo se ve una cada vez (N11). Las tomas guardadas cuyo temporizador no llegó a saltar esperan a que se vuelva a abrir el grabador. |
| P2-5 · «Descartar» borra sin confirmar (6) | **Corregido** | Usa la confirmación del grabador con su propio texto, y los botones miden 44 px (`RecordStudio.tsx:1190-1195` y `1364-1368`). |
| P2-6 · Minutos y panel con el formato de un lienzo de 2×2 (5) | **Corregido** | El tamaño sale de `videoWidth` o del modo de la cámara (`RecordStudio.tsx:641-654`) y el cálculo depende de `view.mode`. Hay una regresión aparte: no se recalcula tras marcar un formato malo (N7). |
| P2-7 · El espacio se lee una vez y antes de la limpieza (5) | **Corregido** | Se mide después de `listLeftovers`, al volver a reposo y al descartar el aviso. Matiz: puede medir antes de que termine el borrado (N10). |
| P2-8 · Sin cerrojo entre pestañas (5) | **Corregido** | Web Locks por toma (`takeStore.ts:60-87`), comprobados en `listLeftovers`. Las tomas vacías de menos de 2 minutos no se tocan. Queda pendiente: `forgetTake` no mira el cerrojo (N11), y cualquier error de escritura se sigue mostrando como «sin espacio» (nota 3 de la ronda 1, sin cambios). |
| P2-9 · `listLeftovers` borra la toma ante cualquier error (5) | **Parcial** | Un trozo ilegible ya no borra la toma: se guarda 7 días. Pero si no se puede leer `meta.json`, la carpeta se borra al momento aunque tenga trozos. Y una toma con un trozo ilegible no se ofrece nunca y se borra sin avisar a los 7 días (N8). |

---

## Hallazgos nuevos

### 🔴 N1 · El codificador que no arranca sigue sin marcarse: cada toma sale vacía · nota 7

- **Dónde:** `apps/web/src/features/record/RecordStudio.tsx:453-461`, con la condición en la línea 457. El tiempo se cuenta en `recorder.ts:132-137`.
- **Flujo:**
  1. Chrome acepta HEVC (o High con nivel) en `isTypeSupported` y el grabador arranca.
  2. Al llegar el primer fotograma, el codificador por hardware no se abre. El grabador lanza `error` y se para.
  3. `died()` guarda el tiempo grabado hasta ese momento, que son unas decenas de milisegundos, y llama a `onDead`.
  4. `finish` recibe un archivo vacío. Solo marca el formato si la toma duró más de 1,5 s, así que no lo marca.
  5. Sale «No se ha grabado nada. Prueba otra vez.». La siguiente toma elige el mismo formato y vuelve a fallar.
- **Condiciones:** exactamente el caso que describía la ronda 1 (F1/G1). Es un fallo del codificador en la configuración, que en Chrome llega en el primer fotograma. Que ocurra en S24/S25 sigue pendiente de probar en el dispositivo.
- **Impacto:** el móvil se queda sin poder grabar en «Automático». La salida existe («Compatible» en el panel), pero nada lleva a la bailarina hasta ella.
- **Evidencia:** demostrada por código. El umbral protege del caso «paro enseguida con ✓», pero ese caso no da un archivo vacío: Chrome entrega los datos al parar. El caso que de verdad da vacío es el que el umbral excluye.
- **Fix:**
  - Marcar el formato cuando el grabador **murió solo** (por `onDead`) sin haber entregado ningún trozo, dure lo que dure.
  - O vigilar el primer trozo: si a los 3 s no ha llegado ninguno, parar, marcar y volver a armar la toma sola con el siguiente formato.
  - Mantener el umbral solo para las tomas que se terminan a mano.
- **Test:** sacar la decisión a una función pura en shared que reciba «murió solo», «trozos recibidos» y «segundos» y decida si se marca. Un grabador muerto a los 0,05 s sin trozos se marca; un ✓ a los 0,8 s con datos no. A mano: forzar un tipo inválido con un `MediaRecorder` falso que lance `error` a los 50 ms.

### 🔴 N2 · Una toma que cupo pero no deja espacio para su descarga se da por guardada y se borra · nota 7

- **Dónde:** `RecordStudio.tsx:790-797` (`takeKept`), `820-839` (`save`) y `181-199` (`replaceTake`, temporizador de 10 minutos). En el disco, `takeStore.ts:305-315` (`markTakeSaved`).
- **Flujo:**
  1. Un móvil con 4 GB libres graba una toma de 2,5 GB (10 minutos a unos 33 Mbps, en Máxima). Todas las escrituras van bien, así que `noSpace` queda en falso.
  2. «Guardar en el móvil» lanza la descarga. Chrome necesita otros 2,5 GB para la copia en Descargas, solo quedan 1,5 GB y la descarga falla con un aviso del sistema.
  3. `takeKept` marca la toma como guardada: aparece «· guardado», «Repetir» y «Cerrar» ya no piden confirmación y la toma no vuelve a ofrecerse.
  4. 10 minutos después de salir de la revisión, la copia se borra. Si se reabre el grabador pasados 10 minutos desde que se guardó, `listLeftovers` también la borra.
- **Condiciones:** que el espacio libre tras la toma sea menor que el tamaño de la toma. Es lo normal en tomas largas en Máxima con el móvil medio lleno, y es el caso que la ronda 1 señalaba como el más importante.
- **Variante:** una toma «sin espacio» recuperada en otra sesión pierde la marca `noSpace`, que solo vive en memoria. Si se vuelve a guardar con el móvil aún lleno, se pierde igual.
- **Impacto:** se pierde la única copia de la toma y la app dice «guardado».
- **Evidencia:** demostrada por código. La app ya conoce el espacio libre (`free`, `RecordStudio.tsx:151`) y el tamaño (`take.file.size`), pero no los compara al guardar.
- **Fix:**
  - Antes de marcar como guardada, volver a medir el espacio libre. Si es menor que el tamaño de la toma más un margen, tratarla como «sin espacio»: no marcarla y decir «Puede que no quepa en Descargas: libera unos N MB y vuelve a guardar».
  - Guardar la marca de «sin espacio» en `meta.json` para que sobreviva a una recuperación.
  - En la revisión, tras guardar, decir «Comprueba que está en Descargas antes de seguir».
- **Test:** una función pura de decisión «¿se puede dar por guardada?» con tamaño, espacio libre y corte por espacio como entradas: 2,5 GB con 1,5 GB libres da «no». A mano en el móvil, llenarlo hasta dejar menos espacio que la toma, guardar, comprobar que «Repetir» pide confirmación y que la toma se ofrece al reabrir.

### 🟡 N3 · Se marca la cadena exacta y no el códec: hasta 4 tomas vacías antes de llegar a H.264 · nota 6

- **Dónde:** `recorder.ts:46-56` (`markFormatBad`), `RecordStudio.tsx:457` y `535`. La lista de candidatos está en `recording.ts:100-125`.
- **Flujo:** aunque se arregle N1, cada toma vacía marca solo la cadena que se usó.
  - En «Automático» hay 4 variantes HEVC seguidas: `hvc1` con nivel, `hev1` con nivel, `hvc1` sin nivel y `hev1` sin nivel. Todas usan el mismo codificador.
  - Hacen falta 4 tomas vacías (4 canciones arrancadas y 4 cuentas atrás) antes de grabar en H.264 High.
  - Al cambiar de resolución o de fps, el nivel cambia (`L120`, `L123`, `L150`…) y vuelven a salir 2 tomas vacías más.
- **Condiciones:** que Chrome acepte las variantes de HEVC y que el codificador falle, que es el caso de N1.
- **Impacto:** en la primera sesión parece que la app no graba. Es probable que la bailarina abandone antes de la cuarta toma.
- **Evidencia:** demostrada por código.
- **Fix:**
  - Cuando el fallo es del codificador (toma vacía o muerta sola), marcar la familia: todo HEVC, o todo H.264 High.
  - Mejor aún: volver a armar la toma sola con la familia siguiente, sin pedir otra cuenta atrás.
  - El bucle de `roll()`, que reintenta cuando falla el constructor, puede seguir marcando la cadena exacta.
- **Test:** en shared, una función «tipos a evitar» que a partir de un tipo fallido HEVC devuelva todas las variantes HEVC, y de un High todas las High. Después de marcar una sola, `pickMime` debe devolver `avc1.64…`.

### 🟡 N4 · Las marcas de formato malo son para siempre, sin versión del navegador, y cualquier error las pone · nota 5

- **Dónde:** `recorder.ts:36-56`, `RecordStudio.tsx:519-538` (el bucle de 6 intentos captura cualquier excepción) y `RecordStudio.tsx:457`.
- **Flujo:**
  - Las marcas se guardan en `localStorage` sin la versión de Chrome, sin caducidad y sin forma de borrarlas desde la app. El panel tampoco las muestra.
  - En `roll()`, cualquier excepción al crear o arrancar el grabador marca el formato, sea por el formato o por otra cosa: un flujo inactivo, un estado raro de las pistas, un error interno. Un fallo que no depende del formato marca hasta 6 formatos buenos en un solo toque.
  - Un archivo vacío por otra causa también marca el formato. Por ejemplo: los trozos no se pueden leer (`takeStore.ts:221-223`), o una toma directa en la que la cámara deja de dar imagen sin micro.
- **Condiciones:** poco frecuentes cada una, pero las consecuencias se acumulan: un solo mal día degrada la calidad de ese móvil para siempre. Y si Chrome arregla HEVC en una versión nueva, nunca se vuelve a probar.
- **Impacto:** el móvil graba en Baseline o en WebM sin que nadie sepa por qué. Las pruebas en los Samsung (prueba 3) pueden dar conclusiones falsas.
- **Evidencia:** demostrada por código.
- **Fix:**
  - Marcar solo cuando el error es `NotSupportedError` o la toma murió sin datos (N1).
  - Guardar las marcas con la versión del navegador (y que caduquen, por ejemplo en 30 días).
  - En el panel: «Formatos descartados en este móvil: …» y un botón «Volver a probar».
- **Test:** con una versión distinta del agente de usuario, las marcas antiguas no cuentan. Un error que no es `NotSupportedError` no marca nada.

### 🟡 N5 · Una toma cortada por falta de espacio no se borra aunque la bailarina la descarte · nota 5

- **Dónde:** `RecordStudio.tsx:188`. Llegan ahí `again` (779-784), `discardTake` (799-807) y el cierre del grabador (335).
- **Flujo:**
  1. El móvil se llena a mitad de toma, que termina con «El móvil se ha quedado sin espacio…» y queda marcada `noSpace`.
  2. La bailarina no la quiere, toca «Repetir» o «Cerrar» y confirma «Descartar» («Si la descartas, se pierde»).
  3. `replaceTake` ve `noSpace`, solo suelta el cerrojo y deja la copia en el disco.
- **Impacto:**
  - El espacio no se libera justo cuando el móvil está lleno, así que la siguiente toma vuelve a cortarse.
  - El aviso «Queda poco espacio» sigue saliendo.
  - Al reabrir el grabador, la toma descartada vuelve a ofrecerse. Lo prometido («se pierde») no se cumple y confunde.
- **Evidencia:** demostrada por código. `noSpace` se pensó para no fiarse del «guardado», pero se aplica también al descarte confirmado.
- **¿Nuevo?** Sí, es una regresión de esta corrección.
- **Fix:** separar las dos cosas. Si el usuario confirma descartar, borrar siempre (`forgetTake`). `noSpace` solo debe impedir que una descarga marque la toma como guardada.
- **Test:** con la política de limpieza como función pura: «sin espacio + descartada» da «borrar ya»; «sin espacio + guardada» da «conservar y ofrecer».

### 🟢 N6 · Al salir el diálogo de confirmar, el panel devuelve el foco detrás del diálogo · nota 4

- **Dónde:** `InfoPanel.tsx:77-80` (vuelta del foco al desmontarse) y `RecordStudio.tsx:1068-1082`. `AnimatePresence` mantiene el panel montado mientras dura su animación de salida.
- **Flujo:**
  1. El panel está abierto. Se pulsa «atrás» en pausa o con una toma sin guardar, y aparece «¿Descartar la toma?» con el foco en «Cancelar».
  2. El panel termina de salir y devuelve el foco al botón «Info» o a «Detalles», que están debajo de la capa del diálogo.
  3. TalkBack o el teclado se quedan fuera del diálogo. Con Intro se pulsa Info, que no se ve.
- **Impacto:** accesibilidad. Se puede perder el hilo del diálogo. No se pierden datos.
- **Fix:** devolver el foco solo cuando el panel se cierra por su X o con Esc, y no cuando se oculta por un diálogo. O no devolverlo si el elemento ya no es visible o si hay un `alertdialog` abierto.
- **Test:** con Testing Library, con el panel abierto, mostrar la confirmación, esperar a que termine la salida y comprobar que el foco sigue en «Cancelar».

### 🟢 N7 · El formato que se muestra no se recalcula tras marcar uno como malo · nota 4

- **Dónde:** `RecordStudio.tsx:874-877`. Las dependencias del cálculo no cambian con `markFormatBad`, que solo vacía la caché de `recorder.ts:55`.
- **Flujo:**
  1. HEVC falla y se marca.
  2. La toma siguiente usa H.264 (`plannedFormat()` se calcula de nuevo en `roll`).
  3. Pero el panel sigue diciendo «MP4 · HEVC» y «7,8 Mbps», y los minutos libres se calculan con 7,8 en lugar de 12 Mbps. Salen un 50 % más optimistas y el aviso de poco espacio llega tarde.
- **Impacto:** datos falsos en el panel durante la prueba 3, y R2 con menos margen.
- **Fix:** un contador de versión de las marcas que forme parte de las dependencias. O una pequeña tienda con la lista de marcas.
- **Test:** tras `markFormatBad`, el formato que se muestra cambia sin tocar la cámara.

### 🟢 N8 · `meta.json` ilegible borra la toma entera; un trozo ilegible la esconde y la borra sin avisar · nota 4

- **Dónde:** `takeStore.ts:262-271` y `275-284`. La regla está en `recording.ts:232`.
- **Flujo:**
  - Si `meta.json` no se puede leer, se toma como fecha el año 1970 y se borra al momento, aunque la carpeta tenga cientos de trozos.
  - Si falla un solo trozo, la toma se marca ilegible y se conserva, pero no se ofrece nunca. A los 7 días se borra sin que nadie la haya visto.
- **Condiciones:** son raras, porque las escrituras se hacen de una vez (`.crswap`), pero eran el centro del hallazgo P2-9.
- **Fix:**
  - Sin `meta.json`, mirar si hay trozos. Si los hay, ofrecer la toma como «Toma sin título», con la fecha del primer trozo.
  - Con un trozo ilegible, ofrecer lo que se lea hasta ese trozo y avisar.
- **Test:** con un directorio falso sin `meta.json` y con trozos, el resultado debe ser «ofrecer» y no «borrar».

### 🟢 N9 · HEVC 4K30 en Máxima pide más bits de los que admite su nivel · nota 3

- **Dónde:** `recording.ts:38` (40 Mbps en 4K30 Máxima × 0,65 = 26 Mbps) y `79-94` (el nivel 5.0 Main admite 25 Mbps).
- **Flujo:** en Máxima, 4K a 30 fps con HEVC declara el nivel 5.0 y pide 26 Mbps. Las demás combinaciones caben. H.264 cabe siempre, porque High admite ×1,25.
- **Impacto:** lo normal es que el codificador recorte la tasa de bits. Uno estricto podría rechazar la configuración, y eso es una toma vacía (N1).
- **Fix:** que el cálculo del nivel tenga en cuenta la tasa de bits, o limitar HEVC 4K30 a 25 Mbps.
- **Test:** para cada calidad, resolución y fps, la tasa pedida no supera el máximo del nivel declarado.

### 🟢 N10 · El espacio se mide antes de que termine el borrado · nota 3

- **Dónde:** `RecordStudio.tsx:365-375` (medición al volver a reposo), `779-784` (`again`) y `188-193` (`forgetTake`, que no se espera).
- **Flujo:** «Repetir» o «Descartar» lanzan el borrado sin esperarlo y pasan a reposo en el mismo momento. La medición puede llegar antes del borrado y no se repite hasta la siguiente toma. Tras descartar una toma de 3 GB, el aviso de poco espacio sigue ahí.
- **Fix:** medir cuando termine `forgetTake`, como ya se hace en `dropLeftover` (906-911).

### 🟢 N11 · Solo se ofrece una toma cada vez, y descartarla no mira el cerrojo · nota 3

- **Dónde:** `RecordStudio.tsx:282` y `884-911`; `takeStore.ts:318-322`.
- **Flujo:**
  - El aviso dice «Hay 3 en total», pero tras recuperar o descartar la primera no aparece la siguiente hasta reabrir el grabador.
  - `forgetTake` borra sin mirar si otra ventana la ha recuperado mientras tanto, entre la lista y la confirmación.
- **Fix:** guardar la lista entera y mostrar la siguiente. Antes de borrar, comprobar el cerrojo con `navigator.locks.query()`.

### ⚪ N12 · El texto de «sin formato» sigue culpando al navegador · nota 2

- **Dónde:** `RecordStudio.tsx:555`.
- **Flujo:** si fallan todos los formatos, o si falta el sitio donde escribir la toma («no sink»), sale «Este navegador no puede grabar vídeo. Prueba en Chrome o Safari actualizados.», en un Chrome actual.
- **Fix:** «No se ha podido empezar a grabar. Prueba otra vez o elige "Compatible" en Información.»

### ⚪ N13 · Una toma terminada después de cerrar el grabador queda con cerrojo hasta recargar · nota 2

- **Dónde:** `RecordStudio.tsx:450-452`.
- **Flujo:** si la sesión cambia durante «finishing», `finish` sale sin pasar la toma a revisión y sin soltar su cerrojo. Pasa si se desmonta la página del estudio; el cierre normal está bloqueado en esa fase. La toma no se ofrece en esa ventana hasta recargar.
- **Fix:** soltar el cerrojo (`releaseTake`) en esa salida, para que se ofrezca la próxima vez.

---

## Tests que faltan

- **Decisión de marcar formato (N1, N3, N4):** función pura con murió solo / trozos recibidos / segundos / tipo de error, que devuelva «marcar la familia», «marcar la cadena» o «no marcar».
- **Política de limpieza al dejar la revisión (N2, N5):** función pura con guardada, sin espacio, descartada, tamaño y espacio libre, que devuelva «borrar ya», «borrar en 10 minutos» o «conservar y ofrecer».
- **Clasificación en el disco (N8):** caso «sin `meta.json` con trozos».
- **Niveles y tasa de bits (N9):** recorrido completo de la tabla.
- **Web:** sigue sin vitest con jsdom. Los casos de interfaz (N6, N7, N10, el gesto «atrás» con el panel abierto) solo se pueden comprobar a mano.

## Comprobaciones ejecutadas

- **Copia exacta de `ca87fcd`** (`git archive` en una carpeta temporal, `pnpm install --frozen-lockfile --offline`):
  - `pnpm typecheck` correcto en shared y web;
  - `pnpm test`, 72 tests correctos (25 de `recording.test.ts`). La web no tiene tests.
- **En el árbol de trabajo actual** `pnpm typecheck` falla: variables sin usar de `ImageControls`. Es trabajo sin commit de otro agente, no de este commit.
- **Cálculo a mano de niveles:**
  - H.264: macrobloques por fotograma, por segundo y por lado, y tasa máxima de High;
  - HEVC: muestras por imagen, por segundo y por lado, y tasa máxima Main tier;
  - en 720p, 1080p, 1440p, 4K y 1920×1440, a 30 y 60 fps, en vertical y en horizontal.
- **Recorrido de la toma en el disco de punta a punta:**
  - creación con cerrojo, escritura, `setMimeType` y `requestData` al pausar;
  - toma vacía, revisión, guardar y compartir;
  - «Repetir», descartar y cerrar;
  - recuperar, descartar el aviso, el temporizador de 10 minutos y `listLeftovers` en otra ventana.
- **Ciclo del cerrojo:** se suelta en todos los caminos normales. La única excepción es N13.

## Limitaciones

- Sin dispositivo:
  - cuándo y cómo falla el codificador HEVC o High en Chrome Android (N1 y N3);
  - si la descarga de un Blob falla por falta de espacio (N2), que es conocimiento general de Android;
  - la columna en dos filas en horizontal;
  - la prueba de 10 minutos.
- No he revisado los pasos 3 y 4 (resolución máxima, 60 fps, grabación directa y lienzo al ritmo de la cámara), salvo donde tocan a estas correcciones.
