# Revisión funcional · Grabación, paso 1 · Ronda 1

Revisión de solo lectura del diff `6b9e4d3..aef8bb5` (rama `feat/plan-completo`).

## Alcance

Paso 1 del plan `docs/plan/grabacion-calidad-maxima-one-shoot.md`:

- panel «i» (prueba 3);
- Q1, compresión por calidad;
- Q2, formato H.264 High o HEVC;
- Q7, aviso de zoom digital.

Ficheros revisados:

- `packages/shared/src/recording.ts` y su test;
- en `apps/web/src/features/record/`: `recorder.ts`, `camera.ts`, `useCamera.ts`, `InfoPanel.tsx` y `RecordStudio.tsx`;
- `compositor.ts`, como contexto;
- el arnés `supabase/tests/local` y `package.json`, solo por encima.

Áreas revisadas:

- A: flujo del grabador.
- C: interfaz y móvil.
- E: tests.
- F: calidad del código.
- H: integración con MediaRecorder.

Dispositivos objetivo: Samsung Galaxy S24/S25, Chrome Android, PWA.

**Resumen:** no hay bloqueantes demostrados. El riesgo principal es nuevo: ahora se pide primero HEVC y H.264 High con nivel, que no se han probado en los Samsung. Si el navegador dice que sí pero el codificador falla, no hay plan B: cada toma falla igual. Hay también un problema de diseño en horizontal (el botón «i» se sale de la pantalla) y varios detalles de accesibilidad y fidelidad del panel.

Escala de notas: 9–10 pérdida de datos o no funciona en uso normal · 7–8 fallo funcional plausible o regresión · 5–6 caso límite, inconsistencia o accesibilidad importante · 3–4 calidad y mantenimiento · 1–2 cosmético.

---

## 🔴 Bloqueantes

Ninguno demostrado. El hallazgo 1 pasaría a bloqueante si la prueba en un S24/S25 reproduce el fallo del codificador.

---

## 🟡 Recomendados

### 1. Sin plan B si el navegador acepta un formato que luego no sabe grabar · nota 7

**Dónde:** `recorder.ts`, líneas 35–43 y 73–82; `RecordStudio.tsx`, función `roll`, líneas 300–340.

**Flujo afectado:** pulsar grabar, empezar la toma.

**Por qué es un problema:**

- `chooseFormat` coge el primer tipo que `MediaRecorder.isTypeSupported` acepta. En modo «auto», el primero es HEVC y, si no hay, H.264 High con un nivel concreto.
- `isTypeSupported` solo mira el texto del tipo. No sabe el tamaño del dibujo ni si el codificador del móvil arrancará.
- En Chrome, el codificador se crea al llegar el primer fotograma. Si falla, el grabador lanza `error` y se para solo.
- Entonces el código llama a `onDead`, luego a `finish`, y el archivo sale vacío. El usuario ve «No se ha grabado nada. Prueba otra vez.».
- La siguiente toma vuelve a elegir exactamente el mismo formato y vuelve a fallar. No hay forma de salir de ahí.
- Si el fallo llega al llamar a `start()`, el mensaje es «Este navegador no puede grabar vídeo. Prueba en Chrome o Safari actualizados.». Es un mensaje engañoso en un Chrome actual.

**Condiciones:** que Chrome en el Samsung acepte HEVC o High con nivel en `isTypeSupported` pero el codificador por hardware no arranque. Puede pasar por versión de Chrome, por tamaño o por nivel (ver el hallazgo 7). En Android no hay codificador por software para HEVC ni, normalmente, para H.264.

**Protecciones existentes:**

- El `try/catch` del constructor no sirve aquí: según la especificación, el constructor solo falla si `isTypeSupported` dice que no (ver el hallazgo 8).
- `onDead` guarda lo grabado si el fallo llega a mitad de toma, pero al principio no hay nada que guardar.

**Impacto real:** el grabador puede quedar inutilizable en un móvil concreto. Antes de este cambio se pedía primero Baseline, que ya funcionaba en estos móviles. Es un riesgo de regresión.

**Evidencia:** la falta de plan B está demostrada por código. Que el fallo ocurra en S24/S25 está pendiente de probar en el dispositivo.

**Nuevo o preexistente:** nuevo, porque cambia el orden de candidatos.

**Fix concreto:**

- Si la toma muere sin datos en los primeros segundos, o `start()` lanza un error, marcar ese tipo como «falla en este móvil». Guardarlo en `localStorage` con la versión de Chrome.
- Volver a armar la toma sola con el siguiente candidato. `pickMime` recibiría una lista de tipos excluidos.
- Mostrar en el panel «i» qué tipo falló.
- Cambiar el texto del error para que no culpe al navegador.

**Test de regresión:**

- En shared: que `pickMime` con una lista de excluidos salta el HEVC y devuelve High.
- En web (hace falta jsdom): un `MediaRecorder` falso que lanza `error` al arrancar con `hvc1`. Comprobar que el segundo intento usa `avc1.64…`.

### 2. HEVC por defecto y sin forma de cambiarlo hasta el paso 6 · nota 6

**Dónde:** `RecordStudio.tsx`, función `plannedFormat`, hacia la línea 399, que fija `codec: 'auto'`.

**Flujo afectado:**

- Guardar o compartir la toma.
- Subirla a la biblioteca: `AddVideoDialog` acepta cualquier vídeo y `backend.uploadFile` lo sube al bucket.

**Por qué es un problema:**

- Si el S24 graba en HEVC, el MP4 no se reproduce en Firefox ni en Windows sin la extensión HEVC.
- Una toma subida a la biblioteca puede no verse en el ordenador de otro miembro del grupo.
- El plan deja pendiente justo esa prueba («que el MP4 se vea en la Galería, en WhatsApp y en el ordenador»).
- La opción «H.264 compatible» ya existe en el tipo `RecordCodec`, pero no hay interfaz para elegirla hasta la pantalla de ajustes (paso 6).

**Condiciones:** Chrome Android con grabación HEVC disponible, más compartir o subir la toma.

**Protecciones existentes:** ninguna.

**Impacto real:** archivos que no se abren fuera del móvil. Si además falla el hallazgo 1, no hay forma de volver a H.264.

**Evidencia:** demostrada por código. Que Chrome ofrezca HEVC en S24/S25 está pendiente.

**Nuevo o preexistente:** nuevo.

**Fix concreto:**

- Un selector temporal en el panel «i»: «Formato: Automático / Compatible (H.264)». Recordarlo por móvil y pasarlo a `plannedFormat`.
- Alternativa: empezar en «Compatible» hasta que la prueba de compatibilidad salga bien.

**Test de regresión:** que `mimeCandidates` con «h264» nunca da HEVC. Ya existe. Faltaría uno de integración: el ajuste guardado llega a `chooseFormat`.

### 3. En horizontal, el botón «i» se sale de la pantalla · nota 6

**Dónde:** `RecordStudio.tsx`, columna de herramientas, líneas 640–725.

**Flujo afectado:** abrir el panel con el móvil girado.

**Por qué es un problema:**

- Cada botón de la columna ocupa unos 59 px más 12 de separación. La columna empieza unos 78 px por debajo del borde superior.
- Un S24 en horizontal tiene unos 360 px de alto.
- Con la cámara trasera la columna tiene como mínimo Girar, Cuenta, Flash y Lente. Chrome nombra las lentes «camera2 N, facing back», no se reconoce la gran angular y aparece el botón Lente. Con Info son 5 botones y llegan a unos 421 px.
- Si además está la opción «Empezar desde», son 6.
- Info es el último de la lista, así que es el primero que queda fuera y no se puede pulsar.

**Condiciones:** móvil en horizontal con la cámara trasera.

**Protecciones existentes:** ninguna. La columna no tiene scroll.

**Impacto real:** el panel de la prueba 3 no se puede abrir en horizontal, que es como se graba a un grupo.

**Evidencia:** demostrada por código (cálculo de medidas). Pendiente de captura en el dispositivo.

**Nuevo o preexistente:** la columna ya se salía con 5 botones. El botón nuevo empeora el problema y es el más afectado.

**Fix concreto:**

- En horizontal, partir la columna en dos o dejarla con scroll vertical.
- O mover «Info» a la barra superior: hoy hay un hueco vacío de 44 px a la derecha del título.

**Test de regresión:** una prueba visual con un viewport de 780×360 y la cámara trasera simulada, que compruebe que el botón Info está dentro de la pantalla.

### 4. «Formato real» no es el real · nota 5

**Dónde:** `InfoPanel.tsx`, línea 147; `RecordStudio.tsx`, línea 285, donde se toma `blob.type || rec.mimeType()`.

**Flujo afectado:** la prueba 3, que sirve para comprobar que High o HEVC se usan de verdad.

**Por qué es un problema:**

- `rec.mimeType` y el tipo del archivo devuelven el texto que se pidió, no lo que hizo el codificador.
- Si Chrome acepta `avc1.640028` pero el codificador del móvil graba en Baseline o con otro nivel, el panel dice «H.264 High» igualmente.
- El objetivo del panel es saber si cada mejora funciona de verdad, y este dato no lo puede confirmar.

**Condiciones:** siempre.

**Protecciones existentes:** ninguna.

**Impacto real:** conclusiones equivocadas en la prueba en los Samsung.

**Evidencia:** demostrada por código. Así se comporta `MediaRecorder.mimeType` según la especificación.

**Nuevo o preexistente:** nuevo.

**Fix concreto:**

- Leer los primeros KB del archivo y buscar la caja `avcC` o `hvcC` del MP4. Sus primeros bytes dicen el perfil y el nivel reales.
- Mostrar ese dato como «Formato real» y el pedido aparte.
- Si no se hace, cambiar la etiqueta a «Formato declarado».

**Test de regresión:** en shared, una función pura que recibe los bytes de una cabecera MP4 de ejemplo y devuelve «High 4.0» o «HEVC Main 4.0».

### 5. El panel «i» no cumple la regla de diálogos de DESIGN.md · nota 5

**Dónde:** `InfoPanel.tsx`, líneas 71–80; botón Info en `RecordStudio.tsx`, hacia la línea 716.

**Flujo afectado:** abrir y cerrar el panel con lector de pantalla, teclado o el gesto atrás de Android.

**Por qué es un problema:**

- DESIGN.md pide «diálogos con trampa de foco y `Esc`». El panel tiene `role="dialog"`, pero:
  - no mueve el foco al abrirse;
  - no lo atrapa ni lo devuelve al cerrar;
  - no se cierra con Esc;
  - no tiene `aria-modal`.
- El botón usa `aria-pressed` cuando debería usar `aria-expanded` con `aria-controls`.
- En Android, el gesto atrás con el panel abierto no cierra el panel: cierra todo el estudio. En reposo, `useBackToClose` llama a `onClose`.

**Condiciones:** usuarios de TalkBack o teclado, y cualquiera que use el gesto atrás.

**Protecciones existentes:** el botón X de 44 px.

**Impacto real:** navegación confusa. Con el gesto atrás se sale del grabador sin querer. No se pierde ninguna toma en reposo.

**Evidencia:** demostrada por código.

**Nuevo o preexistente:** nuevo.

**Fix concreto:**

- Reutilizar el patrón de `components/ui/Dialog.tsx` (foco y Esc).
- Registrar el panel con `useBackToClose(infoOpen, cerrarPanel)` para que el gesto atrás cierre primero el panel.

**Test de regresión:** con Testing Library, al abrir el panel el foco va al botón cerrar, Esc lo cierra y el foco vuelve al botón Info.

### 6. Más memoria por toma antes de R1 y R2 (hipótesis con fundamento) · nota 5

**Dónde:** `recording.ts`, tabla `MBPS`; `recorder.ts`, donde los trozos se guardan en memoria en `chunks`.

**Flujo afectado:** tomas largas, es decir, canciones enteras.

**Por qué es un problema:**

- Antes se grababa a unos 6,2 Mbps en 1080p (tope de 8). Ahora H.264 High pide 12 Mbps, casi el doble.
- Una canción de 5 minutos son unos 450 MB guardados en trozos dentro del navegador.
- El propio plan dice que con Q1 «hace falta R1 (guardar mientras graba) y R2 (comprobar el espacio)», y ponía R1 y R2 antes de subir resolución.

**Condiciones:** H.264 (sin HEVC), tomas de varios minutos, poco espacio libre.

**Protecciones existentes:** con HEVC baja a 7,8 Mbps, parecido a lo de antes.

**Impacto real:** posible fallo al terminar o al guardar una toma larga. Se perdería esa toma.

**Evidencia:** pendiente. Corresponde a la prueba «Toma larga» del plan.

**Nuevo o preexistente:** nuevo, porque sube la cifra de bits por segundo.

**Fix concreto:**

- Hacer la prueba de 10 minutos en un S24 antes de repartir esta versión.
- Si falla, limitar «auto» a unos 8–10 Mbps hasta que entre R1.

**Test de regresión:** manual, la toma larga del plan.

### 7. Los niveles H.264 y HEVC no miran el tamaño del fotograma · nota 5

**Dónde:** `recording.ts`, líneas 60–77.

**Flujo afectado:** elección del nivel del códec.

**Por qué es un problema:**

- La función solo mira los píxeles por segundo y que el lado largo no pase de 2048. La norma también limita el tamaño de cada fotograma.
- Un fotograma 4:3 de 1920×1440 a 30 fps sale como H.264 nivel 4.2. Ese nivel admite como mucho 8704 macrobloques y este fotograma tiene 10 800.
- En HEVC sale como nivel 4.1. Ese nivel admite como mucho unos 2,23 millones de píxeles por fotograma y este tiene 2,76 millones.
- Lo mismo pasa con 2048×1152 o 2048×1536.
- Las tomas normales están bien: 1080×1920 y 1920×1080 a 30 o 60 fps, 1440p y 4K salen con el nivel correcto, en vertical y en horizontal.

**Condiciones:** en el commit revisado, solo si la cámara da un modo 4:3 a pesar del ideal 1920×1080. Durante esta revisión apareció en el árbol de trabajo, sin commit, el paso 3: el tope del lienzo sube a 3840 y se añade `cameraRequest`. `h264Level` y `hevcLevel` siguen igual, así que este hallazgo ya puede darse en la práctica y conviene arreglarlo antes de cerrar el paso 3.

**Protecciones existentes:** el tope de 1920 del lienzo y el ideal 16:9 de la cámara.

**Impacto real:** un nivel mal declarado puede hacer que el codificador falle. Junto con el hallazgo 1, eso es una toma vacía.

**Evidencia:** demostrada por código (cálculo).

**Nuevo o preexistente:** nuevo.

**Fix concreto:** calcular los macrobloques por fotograma y comparar con el máximo de cada nivel. En HEVC, comparar los píxeles por fotograma con el máximo del nivel. Quitar el atajo de los 2048.

**Test de regresión:** en `recording.test.ts`:

- H.264: 1920×1440 a 30 fps pide nivel 5.0; 2048×1152 a 30 fps, también 5.0.
- HEVC: 1920×1440 a 30 fps pide nivel 5.0.
- Casos de frontera en vertical: 1080×1920 a 60 fps.

---

## 🟢 Menores

### 8. El plan B del constructor casi nunca se usa y, si se usa, retrocede demasiado · nota 4

**Dónde:** `recorder.ts`, líneas 74–82.

**Qué pasa:**

- El comentario dice que cubre un tipo aceptado que el codificador rechaza, pero el constructor solo falla si `isTypeSupported` dice que no.
- Si llega a usarse, salta al formato por defecto del navegador (en Chrome, WebM o Matroska) y se salta los MP4 que quedaban en la lista.
- Conserva la cifra reducida para HEVC (×0,65), aunque ya no graba en HEVC.
- Quita la cifra del sonido.
- El panel sigue mostrando la «pedida» antigua.

**Evidencia:** demostrada por código. **Nuevo.**

**Fix:** que este caso pase por la misma lógica que el hallazgo 1: siguiente candidato y cifra recalculada.

**Test:** el mismo que el del hallazgo 1, con un constructor que lanza error.

### 9. El aviso «Zoom digital» se pisa con el aviso de sonido · nota 4

**Dónde:** `RecordStudio.tsx`, hacia la línea 735 (aviso a 104 px del borde superior) y hacia la línea 762 (aviso de sonido a 60 px).

**Qué pasa:**

- En vertical, en un S24 (360 px de ancho), el aviso de sonido puede ocupar unos 210 px de ancho.
- Con el texto del micro («YouTube no deja grabar su audio…»), que es el caso normal con YouTube, ocupa unas 3 líneas, aproximadamente de 74 a 136 px.
- El aviso de zoom digital empieza a 118 px, así que los dos se solapan y no se lee ninguno.

**Condiciones:** en reposo, con el micro como sonido y pellizcando una cámara sin zoom propio.

**Evidencia:** demostrada por código (cálculo). Pendiente de captura. **Nuevo.**

**Fix:** poner los dos avisos en un mismo contenedor en columna, uno debajo de otro.

**Test:** prueba visual a 360×780 con los dos avisos activos.

### 10. Ya existía: el aviso de descarte queda tapado por el panel · nota 4

**Dónde:** `RecordStudio.tsx`. La confirmación tiene capa z-30 y el panel z-40.

**Qué pasa:**

- En revisión con la toma sin guardar, o en pausa, si el panel está abierto y se usa el gesto atrás, aparece «¿Descartar la toma?» debajo del panel.
- En vertical, el panel la tapa entera.
- No se pierde nada (el foco va a «Cancelar»), pero el usuario no ve la pregunta.

**Evidencia:** demostrada por código. **Nuevo**, porque llega con el panel.

**Fix:** cerrar el panel al abrir la confirmación, o poner la confirmación por encima.

**Test:** con el panel abierto en revisión, lanzar el evento atrás. La confirmación debe quedar visible y el panel cerrado.

### 11. El panel y la «Última toma» siguen ahí al volver a abrir el grabador · nota 3

**Dónde:** `RecordStudio.tsx`. `infoOpen` y `lastStats` no se reinician al cerrar. El componente sigue montado: `StudioPage.tsx`, línea 283, devuelve `null` con `open=false`.

**Qué pasa:**

- Si se cierra el grabador con el panel abierto, al volver se abre ya con el panel encima.
- «Última toma» puede ser de otra canción.

**Evidencia:** demostrada por código. **Nuevo.**

**Fix:** poner `setInfoOpen(false)` en la limpieza del efecto de apertura, y `setLastStats(null)` si se quiere que el dato sea por sesión.

**Test:** abrir el panel, cerrar el grabador, volver a abrirlo. El panel debe estar cerrado.

### 12. Código adelantado o sin usar en `recording.ts` · nota 3

**Qué hay:**

- No se usan en ninguna parte:
  - `QUALITY_LABEL`, `AUDIO_BITS_PER_SECOND`, `LOW_SPACE_MINUTES`, `HEAT_WARN_MINUTES`, `mbPerMinute` y `HEVC_FACTOR` (este último solo dentro de su propio fichero);
  - `minutesLeft`, `droppedFrames`, `tooManyDrops` y `resolutionLabel`, que solo usan los tests.
- `AUDIO_BITS_PER_SECOND` vale 256 000 y su comentario lo da por hecho, pero el grabador usa 160 000 (`recorder.ts`, línea 41). Puede confundir a quien lea el código; S1 es del paso 5.
- En `TakeStats`, `dropped` y `expected` siempre valen `null` y 0. El panel siempre dice «sin medir».

**Fix:**

- Usar la constante en `chooseFormat` o quitarla hasta S1.
- Mover lo de pasos futuros a su paso, o marcarlo como pendiente.

### 13. Comprobación de HEVC duplicada en el panel · nota 3

**Dónde:** `InfoPanel.tsx`, líneas 23–28.

**Qué pasa:**

- `HEVC_PROBES` repite a mano parte de `mimeCandidates`, con otros niveles (L150).
- Puede decir «HEVC disponible: sí» por un texto que el grabador nunca pide para el tamaño actual.

**Fix:** que el panel muestre la lista real de `mimeCandidates` para el plan actual, con «sí/no» en cada tipo y marcando el elegido. Es más útil para la prueba 3 y no duplica lógica.

### 14. «Tocar para enfocar» dice «sí» en cualquier cámara · nota 3

**Dónde:** `camera.ts`, línea 113.

**Qué pasa:** se mira `getSupportedConstraints()`, que habla del navegador, no de la cámara. En Chrome saldrá «sí» también en una frontal sin enfoque.

**Fix:** combinarlo con los modos de enfoque de la cámara (`focusMode` con `single-shot`, `continuous` o `manual`), o cambiar la etiqueta a «El navegador admite tocar para enfocar».

### 15. La «Compresión real» incluye el sonido y el contenedor · nota 2

**Dónde:** `InfoPanel.tsx`, línea 148.

**Qué pasa:** se compara tamaño ÷ duración (vídeo + sonido + contenedor) con la cifra pedida solo para el vídeo. Sale entre un 1 y un 2 % más alta.

**Fix:** restar la cifra del sonido o etiquetarla como «total».

### 16. `describeMime` llama MP4 a cualquier cosa que no sea WebM · nota 2

**Dónde:** `recording.ts`, línea 129.

**Qué pasa:** `video/x-matroska;codecs=avc1`, que Chrome puede elegir por defecto, se mostraría como «MP4 · H.264».

**Fix:** reconocer `matroska` (MKV) y `quicktime` (MOV).

**Test:** un caso en `describeMime`.

### 17. El nombre de un test no coincide con el código · nota 1

**Dónde:** `recording.test.ts`, línea 37.

**Qué pasa:** el nombre dice «50+ fps» y el código usa 45 como umbral.

---

## ⚪ Hipótesis

### 18. En Chrome Android, el «zoom de lente» puede ser también un recorte · nota 3

**Qué pasa:**

- Chrome en Android aplica el `zoom` recortando la imagen del sensor. Se recorta antes de reducir a 1080p, así que se ve mejor que el recorte del lienzo, pero no es un zoom óptico.
- El panel dice «Zoom de lente», y la alternativa «no (el zoom sería digital)» da a entender que el otro no es digital.
- El aviso Q7 no salta en ese caso.

**Evidencia:** pendiente. Hay que comprobar en un S24 Ultra si 3× y 5× cambian de lente (la etiqueta de la lente en el panel) o solo recortan.

**Fix:** cambiar el texto a «Zoom de la cámara». Cuando se pueda distinguir (nombre de la lente activa en el panel), avisar al pasar del zoom óptico.

### 19. El nivel en el tipo podría no llegar al codificador · sin nota

**Qué pasa:** no está claro que Chrome Android tenga en cuenta el perfil y el nivel de `avc1.6400xx` o `hvc1…`, o si solo comprueba el prefijo.

**Evidencia:** pendiente. Lo resolvería el hallazgo 4 (leer `avcC` o `hvcC` del archivo).

---

## Tests que faltan

- **Niveles:** fotogramas 4:3 (1920×1440, 2048×1536) y fronteras en vertical (1080×1920 a 60 fps), ver el hallazgo 7.
- **`chooseFormat`:**
  - con solo `hvc1` sin nivel aceptado, la cifra baja ×0,65;
  - con solo Baseline, la cifra queda completa;
  - sin ningún tipo aceptado, `mimeType` vacío.
- **Plan B en ejecución:** un `MediaRecorder` falso que falla al arrancar o en el constructor. Se usa el siguiente candidato y no se repite el que falló (hallazgos 1 y 8).
- **`useCamera`:** `digital` se activa solo sin zoom de lente y con un zoom mayor que 1, y se apaga al volver a 1× o al cambiar a una lente con zoom.
- **Panel:** foco, Esc, gesto atrás y reinicio al cerrar (hallazgos 5, 10 y 11).
- **`describeMime`:** `hev1`, `avc1` sin perfil, Matroska.
- **Infraestructura:** `apps/web` no tiene tests (`"(web) no unit tests yet"`). Hace falta vitest con jsdom para cubrir el grabador y el panel, o sacar a `shared` la lógica pura de elegir el siguiente formato tras un fallo.

## Comprobaciones ejecutadas

- `pnpm typecheck`: correcto en shared y web.
- `pnpm test`: 62 tests correctos, 15 de ellos de `recording.test.ts`. La parte web no tiene tests.
- `pnpm db:test` (arnés PGlite en memoria): 7 de 7 migraciones aplicadas, 1 de 1 fichero de comprobación, 13 PASS.
- Cálculo a mano de los niveles H.264 y HEVC según la tabla de la norma (macrobloques por segundo, tamaño de fotograma, píxeles por segundo):
  - 1080p30/60, 1440p y 4K30/60 son correctos en vertical y en horizontal;
  - 4:3 y 2048 de ancho son incorrectos.
- Revisión de la cadena completa: resolución del lienzo, `plannedFormat`, `chooseFormat`, `createTakeRecorder`, `finish`, `TakeStats` y el panel.

## Limitaciones

- Sin dispositivo: no se ha probado en S24/S25. Quedan pendientes en el móvil:
  - qué tipos acepta Chrome;
  - si el codificador arranca con HEVC o High;
  - las medidas reales de la columna de botones y de los avisos.
- No se ha consultado el código fuente de Chromium. Lo que se dice sobre cuándo falla el codificador y cómo aplica el zoom en Android es conocimiento general y está marcado como pendiente o hipótesis.
- El arnés de Supabase se revisó solo por encima. No es parte del foco de esta revisión.
