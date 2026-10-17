# Revisión · Mejoras del grabador (puntos 19 a 27), ronda 1

## Alcance

Revisión de solo lectura del trabajo sin confirmar en `feat/plan-completo` para los puntos 19 a 27 de
`docs/plan/MEJORAS-PRUEBA-MANUAL.md`, comparado con las decisiones 3–10 y 18 de `ESTADO-IMPLEMENTACION.md`.

Archivos: `apps/web/src/features/record/**` (RecordStudio, useCamera, compositor, camera, settings + test,
settings/model, settings/RecorderSettingsFan, InfoPanel, ImageControls, pace, lensRules + test, lensMemory,
startRules + test, StartPicker, whiteBalanceRules + test, clap/clapListener, clap/ClapArmView,
clap/clapSettings.test) y `packages/shared/src/recording.ts` y `clap.ts` (con sus tests). Para valorar el pendiente
conocido también se leyeron `features/studio/{StudioPage,Transport,Timeline}.tsx`, `features/follow/FollowStageLayer.tsx`
y `player/useLoopController.ts`.

Comprobado: `pnpm test` en verde (shared 136, web 572). `tsc --noEmit` solo falla en `features/voice/separate/encode.ts`,
que es la zona de otro agente; la zona del grabador no tiene errores de tipos. Nada probado en un móvil.

Notas de 1 a 10; con 6 o más se corrige sí o sí.

## Hallazgos (de mayor a menor)

**[7] RecordStudio.tsx:1627 + compositor.ts:179-192 — una toma por lienzo se puede congelar al girar el móvil.**
Cuando `canvasOnScreen` es verdadero (toma por lienzo y el móvil girado a mitad), el contenedor del `<video>` en vivo
pasa a `invisible`. Pero el compositor solo dibuja cuando ese `<video>` presenta un fotograma
(`requestVideoFrameCallback`), y el propio compositor ya avisa de que una fuente oculta puede dejar de «presentarse»
(«A hidden source may never be "presented"»). Su vigilante solo cambia al bucle de pantalla si *nunca* llegó un
fotograma (`!heardFrame`), no si dejan de llegar después. Así, justo en el caso para el que existe la toma por lienzo
(decisión 9: navegador sin instalar, giro a mitad), la vista previa (el lienzo) y la toma se pueden quedar quietas.
Antes del cambio el vídeo nunca se ocultaba durante una toma. **Arreglo:** no ocultar nunca el `<video>`; cuando
`canvasOnScreen`, tapar el vídeo con un fondo negro opaco en `cam.host` (`bg-black`) para que el lienzo con franjas
quede encima. Además, en `compositor.ts`, hacer que el vigilante se rearme siempre: si con `perFrame` y sin congelar
pasan más de ~250 ms sin `onVideoFrame`, cambiar al bucle de `requestAnimationFrame`.

**[7] pace.ts:114-136, 219-226 + RecordStudio.tsx:926-937 — el punto 19, tal como se probó, sigue sin resolverse ni
medirse.** En la app instalada sin zoom digital (el caso que falló en el Samsung), la vista previa *ya era* el
`<video>` en vivo antes de este cambio (`!usesCanvas && '[&>canvas]:opacity-0'`, y el compositor congelado). Así que
el cambio de vista previa no toca ese caso, y la única palanca es la prueba de fluidez. Pero:
(a) la prueba cuenta fotogramas presentados, no el retraso. El usuario se quejó de «muchísimo retraso», y una vista
previa puede ir a 60 fps con medio segundo de retraso;
(b) la prueba se hace en silencio, sin la canción: sin el iframe de YouTube ni el `<video>` del archivo decodificando
debajo, que sí cargan el móvil durante una toma real. Puede salir «ok» y la toma ir mal;
(c) una toma directa nunca enseña nada al terminar (`m.delivered` es null, así que el veredicto es `'unknown'`).
**Arreglo:** en `countPresented` (pace.ts), leer también `meta.captureTime` y `meta.expectedDisplayTime`
(`VideoFrameCallbackMetadata`, disponibles para cámaras locales en Chrome), y comparar la mediana del retraso en reposo
con la mediana mientras se codifica. Si al codificar supera unos 150 ms, o crece más de 80 ms, contarlo como
`fps30`/`smaller` igual que los fotogramas perdidos. En `finish()`, para una toma directa, sacar un veredicto con los
fotogramas presentados (`meter.drawn`) y su retraso, frente al reposo guardado por la prueba. En el panel «i», mostrar
«Retraso de la vista previa: N ms». Y antes de dar el punto 19 por hecho, hacer una traza en Chrome remoto en el
Samsung, como pide el plan.

**[6] settings/model.ts:159-178 + pace.ts:243-245 + recording.ts:376 — el tope de tamaño aprendido no se puede quitar.**
Tras un veredicto `smaller` (`maxResolution: '1080p'`), el aviso dice «Puedes cambiarlo en Ajustes › Calidad». Pero
elegir 4K, 1440p o «Máxima» no llama a `forgetPace()`; solo lo llama el 60 de Fotogramas. `capRequest` sigue
bajando a 1080p durante 30 días, mientras Ajustes enseña 4K como elegido. **Arreglo:** en el `select` de
`resolution` y `quality`, si lo pedido queda por encima de `cap.maxResolution`, olvidar ese tope (una
`forgetPaceSize()` que quite solo `maxResolution` y la entrada de prueba de ese tamaño). Poner en esos campos una nota
como la de 60 («Este móvil no fue fluido en 4K: se graba en 1080p. Elígelo para volver a probar»). Y en el panel «i»,
añadir «Volver a medir» (como con los formatos que fallan, decisión 10).

**[6] RecordStudio.tsx:769-824 + pace.ts:155-240 — la prueba de fluidez da falsos positivos que bajan la calidad
30 días.** Nada la cancela si la página se oculta (cambiar de app o apagar la pantalla en esos ~5 s), si se gira el
móvil (el vídeo cambia de tamaño y hay un hueco de fotogramas), ni si se tocan zoom, flash, enfoque o luz (cada
`applyConstraints` puede parar la cámara un momento). En cualquiera de esos casos `measuredFps` cae, sale `fps30` y
`learnPace` lo guarda 30 días. En el camino del lienzo, mide además los dibujos en el hilo principal, así que lo que
cargue la página (ver el siguiente hallazgo) también cuenta como «el móvil no puede». **Arreglo:** en `runBench`,
cancelar (resolver null, sin recordar nada) ante `visibilitychange` oculto, `pagehide`,
`screen.orientation` `change` o `resize` del vídeo. RecordStudio debe cancelar `bench.current` en `pickChip`,
`setZoom`, `toggleTorch`, `focusHere` y en los cambios de imagen. Y no bajar por una sola medida mala: guardar
`pending` y bajar solo si una segunda prueba (en la siguiente apertura) da lo mismo. Si no, avisar con `warn`.

**[6] Pendiente conocido · el estudio se sigue repintando debajo del grabador.** Respuesta: sí, puede ser parte del
retraso, aunque seguramente no la causa principal en la toma directa. La vista previa directa la compone el navegador
fuera del hilo principal, pero todo lo que sigue comparte CPU y GPU con el codificador. En la toma por lienzo (navegador
sin instalar, o con zoom digital) y en la prueba del lienzo, el `drawImage` va en el hilo principal: cada milisegundo
que se lleva el estudio es un fotograma perdido en la toma y un posible falso `fps30`. Lo que corre ahora en cada
fotograma de pantalla (60–120 Hz) mientras suena la canción:
- `player/useLoopController.ts:112` escribe `time` en la tienda en cada `requestAnimationFrame`, y eso despierta a
  todos los suscriptores;
- `features/studio/Transport.tsx:267-275` (`TimeReadout`) vuelve a pintarse unas 10 veces por segundo;
- `features/studio/StudioPage.tsx:1324` (barra de progreso: `transform` en cada fotograma, y `aria-valuenow` cada
  segundo);
- `features/studio/Timeline.tsx:144-146 y 163` (`setAttribute('width')` de un SVG en cada fotograma, lo que obliga a
  recalcular y repintar el SVG de la línea de tiempo, más el `aria` cada segundo);
- `Timeline.tsx:506` (`NoteDots`, un selector que recorre las notas en cada fotograma) y `Timeline.tsx:571`
  (`useNoteAlert`);
- `features/follow/FollowStageLayer.tsx:162`, que mueve el zoom del vídeo del estudio unas 12 veces por segundo si se
  sigue a alguien. Ojo: elegir en «Empieza en» un clip con recorrido lo activa, ver el hallazgo [5] de `pickStart`.

**Arreglo concreto:**
1. En `player/store.ts`, añadir un estado solo de interfaz, `covered: boolean`, con `setCovered`. Ponerlo a `true` en
   el efecto de apertura de `RecordStudio.tsx:437-447` y a `false` en su limpieza (`:487-508`).
2. Que los consumidores no hagan nada mientras esté tapado:
   - `TimeReadout`: `usePlayer((s) => (s.covered ? -1 : Math.floor(s.time * 10)))`;
   - las suscripciones de pintado de `StudioPage.tsx:1324` y `Timeline.tsx:163`: `if (s.covered) return;`, y un
     `repaint()` al destapar;
   - el selector de `NoteDots` (`Timeline.tsx:506`) y `useNoteAlert` (`:571`) se saltan su trabajo con `covered`;
   - `FollowStageLayer.tsx:162` no aplica nada con `covered`;
   - `LinkFilePanel.tsx:377` y `SaveClipDialog.tsx:398`, igual si estuvieran abiertos.
3. En `StudioPage.tsx`, con `recording`, poner `content-visibility: hidden` a todo lo que no sea el escenario del
   reproductor (transporte, línea de tiempo, clips), para que el navegador no calcule estilos ni pinte ese árbol. El
   escenario no: el iframe de YouTube o el `<video>` deben seguir sonando, y ocultarlo puede frenar el iframe.
4. Aparte, y para medir antes de decidirlo: mientras se graba, el vídeo de la canción se sigue decodificando debajo.
   Con YouTube, encoger el iframe a unos 200×200 px mientras el grabador está abierto hace que YouTube baje la
   calidad que decodifica. Con un archivo, valorar reproducir solo el audio. Así se libera el decodificador para la
   cámara y el codificador.

**[5] RecordStudio.tsx:1543-1560 (`pickStart`) + player/store.ts:433-450 — elegir un clip en «Empieza en» cambia el
estudio para siempre.** `applyClip` fija la velocidad del clip, el espejo, el zoom, el recorrido seguido, el tramo A–B
y `activeClipId`. Al cerrar el grabador (`:504-508`) solo se devuelve `loop.enabled`. Consecuencias:
- la toma se graba a la velocidad del clip (p. ej. 0,75×), y con espejo si el clip lo tenía;
- al volver al estudio, el A–B que tenía el usuario se ha cambiado por el del clip, y se repite si antes estaba
  activado;
- un clip con recorrido empieza a mover el zoom del estudio mientras se graba.

**Arreglo:** en `pickStart`, no usar `applyClip`. Fijar solo `loop: { start, end, enabled: false }` y `activeClipId`,
y dejar velocidad, espejo, zoom y recorrido como estaban. Si se quiere la velocidad del clip, decirlo en la fila
(«Se graba a 0,75×»). Guardar en `restore.current` el `loop` entero y el `activeClipId` de antes, y devolverlos al
cerrar.

**[5] RecordStudio.tsx:926-941 — una toma corta con un tirón baja la calidad 30 días.** `paceVerdict` acepta
muestras de 1,5 s (`PACE_MIN_SECONDS`, recording.ts:339). Una toma por lienzo de 3 s con un parón al arrancar la
canción (el iframe de YouTube, la escritura en OPFS) da `fps30` y se aprende. **Arreglo:** para aprender de una toma,
pedir al menos unos 10 s grabados y que la pérdida se reparta por la toma, no solo al principio (por ejemplo,
contar solo desde el segundo 2).

**[5] camera.ts:276-283, 306-317 — «Color de la luz» se oculta para siempre tras un solo fallo, y la interfaz puede
quedar desfasada.** Un único `ignored` o `refused` (que puede ser pasajero: un `applyConstraints` de zoom o de enfoque
a la vez, la cámara reabriéndose) guarda la cámara por su nombre sin caducidad y sin forma de volver a probar.
Además, `RecordStudio.tsx:682-689` devuelve `kelvin` al valor anterior cuando falla. Si se pulsó primero «Día» y luego
«Nublado», y «Nublado» falla, la interfaz enseña «Día» pero la cámara se ha vuelto a automático (`setWhiteBalance`
la deja en `continuous`). Si la cámara se reabre entre medias, el `.then` pisa el `IMAGE_DEFAULT` del reinicio.
**Arreglo:** caducidad de 30 días y versión del navegador, como los formatos (decisión 10), y ocultar solo tras dos
fallos `ignored`. `refused` no debe ocultar la opción. Poner «Volver a probar el color de la luz» en el panel «i».
En `changeWhiteBalance`, cuando falle, poner `kelvin: null` (la cámara está en automático), y descartar el resultado
si el `deviceId` o la sesión de cámara han cambiado.

**[5] RecordStudio.tsx:2083-2112 + useCamera.ts:321-370 — riesgo de que los botones de lente no quepan en horizontal.**
En horizontal la tira es una columna (`landscape:flex-col`) que comparte columna con el obturador, y ahora puede
llevar 0,5× · 1× · 2× · 3×/5× · Otra 1 · Otra 2 (6 × 40 px + huecos ≈ 270 px), más unos 216 px de obturador, dentro de
390 px menos las zonas seguras. En vertical, a 390 px, cabe pero justo. **Arreglo:** como mucho 4 botones visibles (las
«Otra» van en un solo botón «Más lentes» que las recorre, o que abre una lista) y comprobarlo a 844×390. Botones a
`h-11 min-w-11` (44 px).

**[4] RecordStudio.tsx:1139-1142, 1084 — la toma por lienzo puede quedar fijada a un tamaño viejo.** Ahora el
compositor está congelado en la vista previa (también con zoom digital o con lienzo forzado, que antes dibujaban
siempre), y `frameReady()` solo mira `canvas.width > 2`. Si el lienzo guarda un fotograma de una toma o prueba
anterior (otra orientación), con cuenta atrás de 0 y una canción que arranca enseguida, `roll()` puede bloquear
(`lock(true)`) el tamaño viejo antes del primer dibujo nuevo. Resultado: toma con franjas, y `canvasOnScreen`
encendido sin motivo. **Arreglo:** guardar `drawnAtShutter = counts().drawn` en `shutter()` y pedir en `frameReady`
que `counts().drawn > drawnAtShutter` y que `canvas.width/height` coincidan con `videoWidth/videoHeight` (con el tope
de 3840).

**[4] RecordStudio.tsx:2297-2316 — «Descartar» tras «Cerrar» no cierra.** Al pulsar «Cerrar» (o «Atrás») con una toma
sin guardar, el botón principal, rojo, «Descartar», deja al usuario en el visor, y salir pasa a «Descartar y salir»
(secundario). Cumple el punto 20, pero va contra lo que se acaba de pedir, que era cerrar. **Arreglo:** en el caso
`close`, dejar los botones «Descartar y salir» (peligro, principal) y «Descartar y seguir grabando» (secundario), con
el texto de ayuda encima de los botones. En los demás casos, como está.

**[4] Aplauso: no hay forma de afinar en el móvil real.** Los umbrales de timbre (`clap.ts:78-83`: ataque ≤ 3 ms y
caída ≤ 45 ms en Media, brillo ≥ 1,2, cresta ≥ 3) se han probado solo con señales sintéticas (`clap.test.ts`). En una
sala real, una palmada ahuecada (con más graves) o un micro de móvil con su propio paso alto pueden fallar el brillo
o el ataque, y el usuario no sabe por qué no salta. **Arreglo:** en `ClapArmView`, cuando
`reading.rejected` sea `dull` o `attack`, un aviso breve («Eso no parece una palmada: más seca»). Y en el panel «i»
(o con un ajuste de depuración), ver los últimos `judged` para afinar con palmadas, silla y pasos de verdad, como pide
el punto 21. Además, el comentario de `clap.ts:24, 74-77` dice que «Muy alta» mantiene el nivel de la antigua «Alta»,
pero el `ratio` pasa de 2,5 a 4,5: corregir el comentario o el valor.

**[3] useCamera.ts:230 — puede reabrir la cámara en plena toma.** La primera vez (`backCams` vacío), si el navegador
abrió una lente que no es la principal, cuando llega `listBackLenses()` se llama a `start('environment', main.id)`
sin mirar la fase. Si el usuario ya ha pulsado grabar (cuenta de 0), se corta una toma directa. **Arreglo:** pasar a
`useCamera` un `busy()` (fase distinta de idle, o `recorder.current`) y no reabrir en ese caso.

**[3] RecordStudio.tsx:769-824 — si se pulsa grabar durante la prueba.** La prueba se cancela en la limpieza del
efecto, después de pintar, así que durante unos milisegundos conviven dos `MediaRecorder` sobre la misma pista. No se
graba nada de la prueba (bien), pero se puede adelantar: cancelar `bench.current` al principio de `shutter()` y de
`armClap()`. Al abrir, la prueba cuesta unos 2,6 s codificando a 1080p60, justo lo que va lento en un móvil lento; un
aviso discreto («Comprobando que el móvil va fluido…») evita que parezca un fallo.

**[3] StartPicker.tsx:224-256 — accesibilidad y toques de la lista «Empieza en».** Usa `role="radio"` sin moverse con
las flechas. El foco va siempre a «Inicio» y no a la opción elegida (`autoFocus={i === 0}`). No hay fondo: los toques
fuera llegan al visor (enfoque) y al obturador aunque el diálogo dice `aria-modal`. **Arreglo:** flechas
arriba/abajo entre filas con un `tabIndex` que se mueve con el foco; `data-autofocus` en la opción marcada; un fondo
transparente a pantalla completa que cierre la lista.

**[3] RecordStudio.tsx:583-596 — enfocar tocando no tiene en cuenta el zoom digital** (venía de antes, pero ahora
la vista previa recorta igual que la toma). Con un recorte de 2×, el toque cae en otro sitio. **Arreglo:** dentro de
`framePoint`, `x = 0.5 + (x - 0.5) / view.crop` (y lo mismo con `y`).

**[2] Menores.**
- ClapArmView.tsx:54: `hitKey` también salta con un `echo`, así que la animación de golpe parece contar el eco como
  segunda palmada. Animar solo con `first` o `second`.
- useCamera.ts:416: `lensProbes()` lee y parsea `localStorage` en cada render; poner un `useMemo` sobre
  `backCams.current` y `view.deviceId`.
- pace.ts:233-238: `cancel()` deja la promesa `done` sin resolver para siempre, y su `.then` retiene el vídeo y la
  pista. Resolver null al cancelar.
- RecordStudio.tsx:2276-2278: al `alertdialog` le falta `aria-describedby` en el párrafo.
- Lentes: cuando el zoom no coincide con el del botón, el botón enseña «1,4×» pero su `aria-label` sigue diciendo
  «Principal, 1×».
- ESTADO-IMPLEMENTACION, decisión 6 («Cámara al abrir: trasera»): ya no vale tras el punto 25. Anotar el cambio.

## Lo que está bien

- La vista previa con zoom digital por CSS recorta lo mismo que el lienzo (el centro, en una caja de la forma del
  fotograma, con `overflow-hidden`), y el espejo de la frontal se conserva.
- `drawImage` sin suavizado en copias 1:1, y el estado se vuelve a poner tras cada cambio de tamaño del lienzo.
- `TakeClock`: el grabador ya no se vuelve a pintar cada segundo.
- Ni el compositor ni el detector del aplauso reservan memoria en cada fotograma.
- La prueba no guarda nada (solo vídeo y `ondataavailable` vacío) y no corre con el aplauso armado.
- Las migraciones de ajustes son correctas y tienen tests:
  - `startCamera` pasa a `lastFacing` mientras la entrada guardada aún lo tiene, y desaparece al primer `set`;
  - el aplauso sin `clapScale`: la «Alta» antigua pasa a «Muy alta», y lo desconocido a «Media».
- Descartar: los tres caminos (`discard`, `close`, `rearm`, y también `again`) vuelven al visor con la cámara viva;
  `leftover` sigue igual.
- «Atrás» con un panel abierto cierra solo el panel.
- Balance de blancos: en dos pasos (modo manual, luego la temperatura en el escalón de la cámara), con verificación
  por `getSettings()` y una cola donde gana la última petición.
- Seguridad y privacidad: nada sale del dispositivo. Los identificadores y nombres de cámara, los topes de fluidez y
  la lista de cámaras que ignoran el color se quedan en `localStorage`. El audio del aplauso se analiza en local y no
  llega a los altavoces.

## Veredicto

**Sí, hay hallazgos de 6 o más que corregir antes de cerrar el bloque:**
1. [7] Congelado de la toma por lienzo al girar el móvil (vídeo oculto y vigilante del compositor).
2. [7] El punto 19 no está medido en el caso que se probó (instalada y directa): falta medir el retraso y aprender de
   las tomas directas, y falta una traza en el Samsung.
3. [6] El tope de tamaño aprendido no se puede quitar.
4. [6] Falsos positivos de la prueba de fluidez (página oculta, giro, cambios de cámara, una sola medida).
5. [6] Pausar el repintado del estudio mientras el grabador está abierto (arreglo concreto arriba).

El resto (5 o menos) se puede hacer en la misma pasada si cuesta poco; sobre todo `pickStart` [5] y el color de la
luz [5], que cambian cosas que el usuario ve.
