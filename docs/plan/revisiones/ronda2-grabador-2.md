# Revisión · Ronda 2 de la prueba manual, grabador (puntos 42, 43, 48 y 49), ronda 2

## Alcance

Revisión de solo lectura de los arreglos a `ronda2-grabador-1.md`, sin confirmar en `feat/plan-completo`:

- **43 · Sincronía**: `player/engine.ts` (`recordDelay` en `ElementGraph`, `recordingTap`, `graphFor`,
  `captureAudio`), `syncAudio.ts` (camino del grafo del motor, contexto propio, `watch`, `dispose`), `syncRules.ts`
  (+ test), `RecordStudio.tsx` (`roll`, `releasePicture`, `finish`, `discardTake`, cierre, `pausePart`, `go`),
  `settings.ts`, `settings/model.ts`, `settings/controls.tsx` (`Stepper`), `RecorderSettingsFan.tsx`, la fila de
  `InfoPanel.tsx` y `takeSongZero` (`takeRules.ts`, `data/takes.ts`).
- **48 · Color de la luz**: `changeWhiteBalance`, `reopenForColour`, `wbReopenLater`, `colourReopen` y sus efectos en
  `RecordStudio.tsx`; `useCamera.ts` (`reopen`); `visiblePresets` en `whiteBalanceRules.ts` (+ test);
  `ImageControls.tsx`.
- **49 · Barra de luz**: `QuickExposure.tsx`, `quickExposureRules.ts` (+ test), `quickCovered` y el montaje en
  `RecordStudio.tsx`.
- **42 · Aplauso**: `git diff cfc6296` de `clap.ts`, `clapListener.ts`, `ClapArm.tsx`, `ClapArmView.tsx` y `armClap`.

## Qué se ha ejecutado

- `pnpm typecheck`: en verde (`shared` y `web`).
- `pnpm test`: en verde. `shared` 7 archivos y 139 tests; `web` 53 archivos y 714 tests.
- No se ha probado nada en un móvil, en un iPhone ni con cámara o micrófono reales (prohibido arrancar servidores o
  navegador en esta revisión). Lo de 390×844 y en horizontal se ha comprobado leyendo el código.

Notas de 1 a 10; con 6 o más se corrige antes de publicar.

## Hallazgos de la ronda 1 → estado

| Ronda 1 | Estado |
| --- | --- |
| [5] iPhone: audio por un segundo contexto, posible archivo mudo, sin aviso si el contexto se corta | **Arreglado** en lo esencial. La canción del grafo del motor se retrasa dentro de ese grafo (`split.output → recordDelay → out`), sin cruzar contextos. En iPhone el contexto propio no se usa (`IS_IOS`): el micrófono va sin retraso, como antes. Se vigila `statechange` del contexto que retrasa. Quedan dos huecos de la vigilancia (hallazgo nuevo [3]). Sigue sin probarse en un iPhone real. |
| [5] Retraso estimado sin medir, sin forma de verlo ni corregirlo | **Arreglado** lo que se puede arreglar en código. Con el micrófono ya no se resta `hop`. Existe «Ajuste fino de sincronía» (±150 ms, pasos de 10) y «i» muestra «Sincronía del sonido». `CAMERA_FIXED_MS` y el resto siguen siendo estimaciones: hay que medirlo en el móvil del responsable. |
| [4] `wbReopenLater` pendiente deshace un preset elegido después | **Arreglado**. `changeWhiteBalance` lo pone a `false` antes de pedir nada (`RecordStudio.tsx:810`). |
| [3] Volver a «Auto» reabre la cámara y pierde la «Luz» sin avisar | **Arreglado** para la luz. `colourReopen` guarda la exposición y la vuelve a aplicar con los pasos de la cámara nueva, y avisa si no se puede o si se suelta un «Fijo». Pero el flash se apaga sin avisar (hallazgo nuevo [3]). |
| [3] La barra de luz se queda encima de otras pantallas o vuelve con una posición vieja | **Arreglado**. `quickCovered` la quita para siempre con «Imagen», «i», ajustes, lista de inicio, diálogos, aplauso armado y repaso. La condición de montaje incluye `clap == null`. Al cambiar el ancho de la ventana (giro) se va. |
| [2] La barra no respeta la zona segura | **Arreglado**. `safeInsets` lee `env(safe-area-inset-*)` con una sonda y `QUICK_LABEL_ROOM` (30 px) deja sitio a la etiqueta. |
| [2] Se oculta a los 3 s aunque tenga el foco | **Arreglado a medias**. Ya no se oculta con el foco dentro. Al cerrarla, el foco no vuelve al visor, y un toque deja la barra fija (hallazgo nuevo [2]). El «−» ya es el mismo en el panel y en la barra (`formatExposure`). |
| [2] Dos botones de color hacen lo mismo, hueco entre «Fría» y «Día» | **Arreglado a medias**. `visiblePresets` quita los repetidos, pero se queda con el primero aunque su nombre ya no encaje (hallazgo nuevo [2]). El hueco 2850–5000 sigue (no se añadió «twilight»). |
| [2] `ESTADO-IMPLEMENTACION.md` desfasado | **Sin arreglar**: las líneas 87, 125, 127 y 237 siguen diciendo «Muy alta» y «Fluorescente». |
| [1] Latencia del altavoz leída del contexto de sincronía | **Arreglado** cuando la canción pasa por el grafo: se lee del contexto del motor, que es el que suena. Con `captureStream` sigue siendo una aproximación, como estaba previsto. |

## Comprobaciones de los arreglos (sin hallazgo)

**43 · El altavoz no se retrasa.**
- `split.output` sigue conectado a `ctx.destination` directamente. `recordDelay` solo alimenta el
  `MediaStreamDestination` (`engine.ts:96-100`).
- El único consumidor de `tap` es `captureAudio` → `songTrack` del grabador. Ni el estudio, ni el repaso, ni el
  propio repaso del grabador (que reproduce el archivo de la toma) leen de ahí.
- Con «Voz» o «Sin voz» lo que se oye pasa por `split.output → destination` sin retraso.

**43 · El retraso vuelve a 0.**
- `dispose` (`setDelay(0)`) corre en `releasePicture`, y `releasePicture` se llama:
  - tras `rec.finish()`;
  - en el `catch` de `roll` (también cuando fallan los 6 intentos de formato);
  - en `discardTake`;
  - en la limpieza al cerrar el grabador.
- Si se cierra a mitad de `finish`, la limpieza lo hace primero y la segunda llamada encuentra `syncedSound` a null.
- Si el contexto no estaba `running` en `roll`, no se toca el retraso. Como siempre se vuelve a 0, no queda un valor
  viejo.
- El salto 0 → D se da en la misma tarea que `MediaRecorder.start()`: los primeros D ms de la toma son la canción de
  D ms antes, que es lo que se busca. Puede haber un clic de un cuanto (≈3 ms) justo al empezar. Despreciable.

**43 · iPhone con Canción o Sin voz.**
- Safari no tiene `captureStream`, así que `captureAudio` crea el grafo y devuelve `tap.getAudioTracks()[0]`.
- `graphOfTrack` se rellena con esa misma pista (no se clona en ningún sitio), así que `recordingTap` la encuentra.
- La pista que graba el MediaRecorder es la misma que antes. Solo cambia que entre `split.output` y `out` hay un
  `DelayNode` (en estéreo, `channelCountMode` `max`). No hay segundo contexto.

**43 · `watch(onLost)` no da falsos avisos al pausar ni al acabar.**
- `onEnded` sale si `phaseRef.current !== 'recording'`.
- En `pausePart` y en `finish` la fase cambia en la misma tarea, y `statechange` llega en otra posterior, ya
  renderizada.
- `releasePicture` desvigila antes de `dispose`, y `track.stop()` no lanza `ended`.
- `restSyncAudio` (suspender) solo corre al cerrar, después de desvigilar.

**43 · `syncRules`.**
- **Micrófono:** sin parte de altavoz y sin `hop`; test a 60 fps con `baseLatency` 70 ms.
- **`crossContext`:** solo resta `hop` con la canción capturada del elemento; con el grafo del motor no (test).
- **Signo del ajuste fino:** + retrasa más el sonido. La ayuda («si ves los pasos después de la música, súbelo») es
  correcta.
- **Límites:**
  - `clampTrim` a ±150 en pasos de 10, sin «−0».
  - `sanitizeSettings` solo acepta los 31 valores.
  - Tope de 600 ms, con línea de 0,65 s en los dos caminos.
  - `delaySeconds` redondea a muestras enteras.

**43 · El selector a 390×844 y en horizontal.**
- **Tamaño de los botones:** dos de 44 px (`min-h-11 min-w-11`) y el valor en `flex-1 min-w-0`. Caben de sobra en
  los 358 px de ancho útil.
- **Horizontal:** el grupo «Sonido» tiene ahora cuatro campos, pero el cuerpo del panel ya era `overflow-y-auto` con
  `max-h-full`. No se sale de la pantalla.
- **Accesibilidad:** `role="group"` con nombre y descripción; `output aria-live`; flechas en los dos botones; Inicio
  pone 0.
- **Resumen del abanico:** «Canción · +30 ms».
- **Fila de «i»:** el valor va en `break-words` y se reparte en varias líneas sin desbordar.

**48 · Color de la luz.**
- **Nunca durante una toma:**
  - `cameraBusy` cubre cualquier fase distinta de `idle`, un `recorder` vivo y el aplauso armado;
  - el efecto diferido además exige `phase === 'idle'`, `clap == null` y la cámara `ready`.
- **Si llega una respuesta vieja:** `wbAsk` la descarta.
- **El efecto de `colourReopen`:** espera a que pase `starting` y aplica la luz con `snapExposure` sobre el rango de
  la cámara nueva.

**49 · Barra de luz.**
- **Gestos:** un segundo dedo la oculta. Un toque sobre la barra no enfoca (es hermana del visor y para la
  propagación).
- **Giro:** solo cuenta un cambio de `innerWidth`, para que no se vaya al aparecer y desaparecer la barra del
  navegador.
- **Aplauso:** no lo tapa.
- **Durante el arrastre:** solo se mueven `motionValue` y el DOM, sin `setState`.

**42 · Aplauso: idéntico al de cfc6296.**
- **Detector:**
  - `git diff cfc6296 -- clapListener.ts` está vacío;
  - en `clap.ts` solo se añaden `rejected`, `peak`, `migrateClapSensitivity` y el registro, sin tocar ninguna rama ni
    ningún umbral.
- **`armClap`:** es el de entonces más `stopBench()` y `primeSyncAudio()`. El micrófono se sigue pidiendo con
  `openMic('mono')` o se clona el de la toma.
- **Cambios de interfaz:** el tambor ya no golpea con un eco, y se quita `variant` (laboratorio borrado).

## Hallazgos

**[3] syncAudio.ts:81-93 + RecordStudio.tsx:1314-1326, 1335 — la vigilancia del contexto tiene dos huecos: no mira
al reanudar, y un cambio de estado momentáneo pausa la toma sin margen.**

Primer hueco: con la toma en pausa, `onEnded` sale (`phase !== 'recording'`).
- Si el contexto se interrumpe en pausa (iOS: llamada, Siri, otra app de audio), el aviso no llega.
- Al reanudar, `go()` pide `ctx.resume()`, que no se espera y puede fallar mientras dure la interrupción.
- `roll` reanuda el MediaRecorder (`recorder.current.resume()`, línea 1335) sin mirar el estado del contexto.
- Como no hay un nuevo `statechange`, nadie avisa.

Escenario: iPhone, archivo con «Sin voz», toma en pausa. Entra una llamada y se rechaza. El grafo se queda
`interrupted`, se reanuda y el resto de la toma sale muda sin ningún aviso. Es justo lo que la vigilancia nueva quería
cubrir.

Segundo hueco: cualquier salida de `running` llama a `onLost` al momento y pausa la toma. No se sabe si en iOS un cambio de
ruta de audio (por ejemplo, el micrófono del aplauso que se cierra justo al disparar) produce un `interrupted` breve.
Si lo produce, la toma se pausa en el primer segundo con «Se ha perdido el sonido».

Arreglo:
- Que `SyncedAudio` exponga `alive()` (el contexto está `running` y la pista está `live`).
- En la rama de reanudar de `roll`, si `!alive()`: `pausePart()` y el mismo aviso.
- En `statechange` a algo que no sea `running`: intentar `resume()` y avisar solo si a los ~400 ms sigue sin estar
  `running`.
- Probarlo en un iPhone: pausa, llamada, reanudar, y aplauso con «Canción».

**[3] RecordStudio.tsx:833-842 + useCamera.ts:137, 207 — volver al color automático apaga el flash sin decirlo.**
`reopenForColour` abre la cámara de cero (`start`), y `start` pone `torch: false`. La luz («Luz») se recupera ahora,
pero el flash no, y el aviso solo dice «la cámara se reinicia un momento».

Escenario: sala oscura con el flash encendido. Se elige «Cálida» y luego «Auto». La cámara parpadea, el color vuelve
a automático y el flash se apaga: la imagen se oscurece de golpe sin explicación.

Arreglo: guardar `view.torch` en `colourReopen` y volver a aplicarlo (`toggleTorch` o `applyTrack(…, { torch:
true })`) cuando la cámara esté `ready`. Si no se puede, añadir al aviso «…y el flash se apaga».

**[2] QuickExposure.tsx:215-216, 229 + RecordStudio.tsx:953 — un toque sobre la barra la deja fija, y al cerrarla el
foco se pierde.**
- El deslizador tiene `tabIndex={0}`. En Chrome para Android un toque (sin arrastre) lo enfoca. Desde ahí `onFocus`
  cancela el temporizador y `armHide` no la oculta mientras tenga el foco, así que se queda hasta que se toque en otro
  sitio. Ocultarse sola a los 3 s solo funciona si nunca se ha tocado.
- Con Esc, con `quickCovered` o con un giro se desmonta con el foco dentro, y el foco cae en `body`.

Arreglo: mantenerla visible con el foco solo si llegó por teclado (`:focus-visible` o una marca en `onKeyDown`), y al
cerrarla con el foco dentro devolverlo al visor o al disparador.

**[2] whiteBalanceRules.ts:62-73 + whiteBalanceRules.test.ts:389 — al quitar un repetido se queda el primero, aunque
su nombre ya no encaje.**
En una cámara de 5000–6000 K, «Fría» se ajusta a 5000, que es «Día». Se enseña «Fría» y se oculta «Día», y el test lo
da por bueno. La ayuda dice «si la sala sale naranja, prueba "Fría"», y ese botón no enfría nada. Lo mismo pasa con un
mínimo alto en cualquier cámara.

Arreglo: ante dos que acaban en la misma temperatura, quedarse con el preset cuyo `kelvin` propio esté más cerca del
valor ajustado (aquí «Día»), y cambiar el test.

**[2] syncAudio.ts:38-46 + RecordStudio.tsx:531, 1405, 1599 — el contexto de sincronía se crea y se despierta aunque no
se vaya a usar.**
`primeSyncAudio` corre al abrir el grabador, en cada cuenta atrás y al armar el aplauso. En iPhone ese contexto no se
usa nunca (`syncTakeAudio` lo salta con `IS_IOS`), y en Android tampoco cuando la canción pasa por el grafo del motor.
Queda un AudioContext más en marcha mientras el grabador está abierto: hilo de audio y batería. En iPhone se suma al
del motor, al del aplauso y al de la cuenta atrás.

Arreglo: no crear el contexto en iOS, y en Android solo cuando el sonido de la toma sea el micrófono o una pista sin
grafo (`recordingTap(songTrack) == null`).

**[2] syncRules.ts:154 — con un ajuste fino negativo que deja el retraso en 0, «i» dice «Sin retraso aplicado; tocaba
0 ms».**
Con el grafo del motor, `applied` es `running && delayMs > 0`. Un ajuste de −150 que lo deja en 0 sale como si algo
hubiera fallado.

Arreglo: separar «no se pudo aplicar» de «tocaba 0». Por ejemplo, `applied: running` y, en el texto, «Sin retraso (el
ajuste fino lo deja en 0)».

**[2] docs/plan/ESTADO-IMPLEMENTACION.md:87, 125, 127, 237 — sigue desfasado (ronda 1).**
- Dice «Muy alta» y «Cálida, Fluorescente, Día, Nublado».
- No menciona «Ajuste fino de sincronía» en la guía de prueba del grabador.

**[1] controls.tsx:290-296 — «Volver a 0» desaparece al pulsarlo y el foco cae en `body`.** La nota y su botón solo
existen con el ajuste distinto de 0. Arreglo: llevar el foco al valor del selector después de `run()`.
