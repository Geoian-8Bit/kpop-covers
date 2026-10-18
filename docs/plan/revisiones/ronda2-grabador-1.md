# Revisión · Ronda 2 de la prueba manual, grabador (puntos 42, 43, 48 y 49), ronda 1

## Alcance

Revisión de solo lectura del trabajo sin confirmar en `feat/plan-completo`, solo en la zona del grabador:

- **42 · Aplauso**: `packages/shared/src/clap.ts` (+ test), comparado con `git show cfc6296` (la versión de F7 antes de
  la mejora 21, que llegó en `af63e2b`); `features/record/clap/**` (`clapListener`, `ClapArm`, `ClapArmView`,
  `clapLog`, `clapSettings.test`); `settings.ts`, `settings/model.ts`; la sección «Aplauso» de `InfoPanel.tsx`.
- **43 · Sincronía**: `syncRules.ts` (+ test), `syncAudio.ts`, `compositor.ts` (`drawLagMs`), `takeStore.ts` (`sync`,
  `setSync`), `RecordStudio.tsx` (`roll`, `countIn`, `armClap`, apertura y cierre, `releasePicture`, `finish`) y
  `player/engine.ts` (de dónde sale la pista de la canción: `captureStream` o el grafo de voz).
- **48 · Color de la luz**: `whiteBalanceRules.ts` (+ test), `camera.ts`, `useCamera.ts` (`reopen`),
  `ImageControls.tsx`, `RecordStudio.tsx` (`changeWhiteBalance`, el efecto de reabrir).
- **49 · Barra de luz**: `QuickExposure.tsx`, `quickExposureRules.ts` (+ test), `setExposureCompensation` en
  `camera.ts`, `focusHere` y los gestos del visor en `RecordStudio.tsx`.

Contexto: «Ronda 2 de la prueba manual» en `MEJORAS-PRUEBA-MANUAL.md` y `ESTADO-IMPLEMENTACION.md`.

## Qué se ha ejecutado

- `pnpm typecheck`: en verde (`shared` y `web`).
- `vitest` en `packages/shared` (`clap.test.ts`): 27 en verde.
- `vitest` en `apps/web/src/features/record`: 9 archivos y 82 tests en verde (`syncRules` 12, `whiteBalanceRules` 30,
  `quickExposureRules` 8, `clapSettings` 4…).
- No se ha probado nada en un móvil, en un iPhone ni con cámara o micrófono reales.

Notas de 1 a 10; con 6 o más se corrige antes de publicar.

## Comprobaciones por punto

**42 · Aplauso: el detector es el de antes.** `git diff cfc6296 -- clap.ts clapListener.ts`:
- `clapListener.ts` es idéntico al de `cfc6296`, byte a byte: `fftSize` 4096, `smoothingTimeConstant` 0, paso alto
  `biquad` a 1500 Hz, ganancia 0 hasta `destination`, pico de cada ventana por `requestAnimationFrame` con
  `performance.now()`.
- En `clap.ts` la lógica de `push` es la misma: umbrales `high` 2,5×/0,06, `medium` 3,5×/0,12, `low` 5×/0,22; techo
  0,92; `CLAP_MIN_GAP` 0,2, `CLAP_MAX_GAP` 0,8, `CLAP_MAX_LENGTH` 0,3, `CLAP_ATTACK_RATIO` 0,45, `CLAP_RISE_LIMIT`
  1,25, calentamiento 0,5 s; fondo con τ 1,5/0,3/0,1 y punto de partida 0,01; soltar al 60 % del umbral o al 30 % del
  pico. Solo se añade `rejected` y `peak`, que se asignan sin tocar ninguna rama de decisión. El test «reporting never
  changes a decision» lo cubre.
- El micro del aplauso se pide igual que entonces (`openMic('mono')`, sin cancelación de eco, sin supresión de ruido y
  sin control de ganancia), o se clona el de la toma. La única novedad en `armClap` es `primeSyncAudio()`, que abre
  otro AudioContext (el del punto 43) y no toca el análisis.
- Migración: `max` («Muy alta») pasa a `high`, `low`, `medium` y `high` se quedan, lo desconocido vuelve a `medium` y
  `clapScale` desaparece al guardar. Ojo: quien eligió «Alta» en la versión 139 (5,5×) pasa a la «Alta» de F7 (2,5×),
  mucho más sensible. Es lo que se pide («volver al detector anterior»), no es un hallazgo.
- La interfaz tiene tres botones (`grid-cols-3`), los textos de ayuda son los de F7 y el panel «i» muestra «nivel ×N
  sobre el umbral». No queda ninguna referencia a `CLAP_SCALE`, `samplesSince`, `clapRejection` ni `DECIDE_AFTER`
  (typecheck).

**43 · Sincronía: el diseño.**
- **Signo correcto.** En el archivo, la imagen va detrás de la música porque la canción se graba antes de que salga
  por el altavoz y el fotograma llega tarde. Por eso se retrasa el audio, en la propia pista que graba el
  MediaRecorder. La vista previa y lo que suena no cambian.
- **Arranque.** El grafo se monta en `roll()`, justo antes de `MediaRecorder.start()`, y solo cuando el contexto está
  `running`. Si no lo está, la pista pasa sin retraso y se apunta `applied: false`. El silencio inicial es el propio
  retraso (100–200 ms), y antes de `roll` tampoco se grababa nada. No hay silencio largo.
- **Pausas.** La línea sigue corriendo mientras la toma está en pausa, así que al reanudar salen primero los D ms que
  sonaron justo antes (silencio y el arranque de la canción). Es lo correcto.
- **Al terminar.** Se pierden los últimos D ms de canción: la imagen de esos ms va con el audio de D ms antes. Es
  correcto.
- **Limpieza.** `dispose` corre después de `rec.finish()`, en `discardTake`, en el `catch` de `roll` y al cerrar. No
  queda nada colgado.
- **Altavoz.** El contexto de sincronía no está conectado a `destination`, así que no suena nada.
- **Otros contextos.** No tiene relación con `heavyWork`. Usa la misma pista `playback` que el grafo del motor
  (`engine.ts:70`).
- **Deriva.** Los dos contextos y `captureStream` van con el reloj del mismo dispositivo de salida. No se espera deriva
  apreciable en 3–4 min. El único caso con dos relojes es micrófono con salida Bluetooth: pocos ms, y el FIFO de
  `MediaStreamAudioSourceNode` lo corrige con un salto, no se acumula. Sin medir.
- **Valores.**
  - Por defecto, con la canción: 50 ms de altavoz más 45 ms y un fotograma de cámara, unos 128 ms a 30 fps y 112 ms a
    60.
  - En el lienzo se suman 25 ms, o el retraso medido.
  - Tope de 600 ms: cubre Bluetooth.
  - Con el micrófono solo se compensa la cámara. Es correcto: el micro oye el altavoz a la vez que el bailarín.
- **Coste por fotograma** (1080p60): `drawLagMs` es un `performance.now()` y una escritura en un `Float32Array` de 64
  por fotograma. La mediana se calcula una vez por toma. `lock()` no vacía el anillo, `schedule()` sí, después de una
  pausa o de un parón. Sin coste apreciable.

**48 · Color de la luz.**
- **Sentido de la temperatura.** `colorTemperature` es la luz que la cámara corrige: 2850 hace la imagen azul («Fría»)
  y 7000 la hace naranja («Muy cálida»). Las etiquetas y la ayuda («si sale naranja, prueba "Fría"») están bien.
- **Valores.** 2850, 5000, 6000 y 7000 coinciden con los presets de Chrome en Android (incandescente, luz de día,
  nublado y sombra). El fluorescente (4250, el tono lila) ya no está.
- **«Aplicado».** Cuenta como aplicado cualquier modo manual, sea cual sea el número. Ya no se ocultan las opciones
  porque Chrome elija el preset más cercano.
- **«Auto».** Se comprueba. Chrome guarda `mColorTemperature` mientras la cámara sigue abierta y entonces informa
  `manual`: sale `stuck` y la cámara se reabre. Nunca durante una toma: `cameraBusy` cubre las fases distintas de
  `idle`, el grabador y el aplauso armado.
- **Memoria.** Pasa a la v3 y borra las v1 y v2.

**49 · Barra de luz.**
- **Posición.** Va al lado del anillo y esquiva los botones, el propio anillo y los bordes. La regla tiene test.
- **Arrastre.** Es relativo: arriba más luz, y agarrar la barra en cualquier punto no la hace saltar. Mientras se
  arrastra solo se mueve un `motionValue` y se escribe en el DOM, sin ningún `setState`. Los valores van a la cámara
  agrupados, siempre el último. Al soltar, `changeExposure` deja el valor en el mismo estado que usa el panel.
- **Gestos.** Un segundo dedo la oculta. Un toque sobre la barra no enfoca, porque es hermana del visor y no hija.
- **Accesibilidad.** `role="slider"` vertical, con nombre, `aria-valuetext` y flechas, Re Pág, Av Pág, Inicio, Fin y
  Esc.

## Hallazgos

**[5] syncAudio.ts:72-109 — en iPhone, el audio retrasado pasa por un segundo AudioContext que nadie ha probado. Puede
salir un archivo mudo, y si el contexto se corta a mitad de toma nadie avisa.**
En Safari, `captureStream()` del elemento no existe, así que la canción siempre sale del grafo de Web Audio del motor
(`engine.ts:66-84`, `MediaStreamDestination` del contexto del motor). Ahora esa pista entra en un
`MediaStreamAudioSourceNode` de *otro* contexto y sale por otro `MediaStreamDestination` hacia el MediaRecorder.
- WebKit ha tenido fallos con `createMediaStreamSource` sobre pistas que no son de micrófono (silencio o cortes). El
  código da la pista por buena (`applied: true`) sin comprobar que lleve señal.
- Si iOS interrumpe ese contexto durante la toma (estado `interrupted`: una llamada, Siri, otra app de audio), deja de
  entregar audio. El resto de la toma queda sin sonido o con huecos. El aviso «Se ha perdido el sonido» solo mira el
  `ended` de la pista original (`RecordStudio.tsx:1263-1270`), no la retrasada ni el contexto.

Escenario: un iPhone con un archivo y «Sin voz», toma de 3 min. Si WebKit no pasa la señal entre contextos, la toma
sale muda. Antes de este cambio se grababa bien.

Arreglo:
- Cuando la fuente es el grafo del motor (siempre en iPhone, y en Chrome con «Voz» o «Sin voz»), poner el `DelayNode`
  dentro de ese mismo contexto (`split.output → delay → out`, con un `setRecordDelay(ms)` en el motor) y no cruzar
  contextos. El contexto de sincronía queda solo para `captureStream` y el micrófono.
- Mientras se graba, escuchar `statechange` del contexto que retrasa: si no está `running`, `pausePart()` y el mismo
  aviso que con `ended`.
- Probar en un iPhone antes de publicar. Si no se puede, en Safari dejar pasar la pista sin retraso.

**[5] syncRules.ts:36-44, 118-139 — todo el retraso es una estimación sin medir en ningún móvil. Con el micrófono a 60
fps casi desaparece, y el responsable no tiene cómo comprobarlo ni corregirlo.**
- `CAMERA_FIXED_MS = 45` y «un fotograma» son supuestos. A `hop` se le resta `baseLatency` del contexto `playback`. En
  Chrome para Android ese búfer suele rondar los 40 ms; en este ordenador no se puede medir.
- Con el micrófono (YouTube, el caso más habitual) a 60 fps: 45 + 16,7 − ~40 ≈ 20 ms. Con un `baseLatency` de 62 ms
  o más, sale 0, y `delayMs <= 0` deja pasar la pista sin retraso (`syncAudio.ts:77`): la toma queda igual que antes.
- Que el camino por el segundo contexto añada de verdad unos `baseLatency` depende de cómo ponga Chrome las marcas de
  tiempo del audio en el MediaRecorder. Si el muxer pone a cero cada pista por su cuenta, ese trayecto no cuenta y
  restar `hop` deja corto el retraso.
- `trimMs`, `clampTrim` y `MAX_TRIM_MS` existen pero nada los usa: la UI no tiene ajuste fino, así que es código
  muerto.
- El plan aplicado solo se ve en la consola (`paceLog('sync')`) y en el `meta.json` local. El panel «i» no lo muestra
  (`InfoPanel.tsx` no tiene nada de sincronía).

Escenario: el responsable repite la prueba de «bailar a tempo» con YouTube a 1080p60 en su Android. La imagen sigue
detrás, y no puede saber si se aplicaron 0 ms o 20 ms ni ajustarlo.

Arreglo:
- En «i», sección «Última toma»: «Sonido retrasado N ms (altavoz X medido o estimado, cámara Y, lienzo Z) · aplicado
  sí/no».
- Un ajuste «Sincronía del sonido» por móvil (±300 ms, el `trimMs` que ya existe) en los ajustes del grabador, o quitar
  `trimMs`.
- Medir en el móvil del responsable con una palmada delante de la cámara (directo y lienzo, canción y micrófono, 30 y
  60) y fijar `CAMERA_FIXED_MS` y `hop` con esos datos.
- Con el micrófono, no restar `hop` mientras no se mida que de verdad añade ese retraso. Equivocarse por exceso es lo
  seguro (lo dice el propio comentario, ITU-R BT.1359).

**[4] RecordStudio.tsx:803-830 — una vuelta a automático pendiente de la toma deshace después un preset elegido más
tarde.**
`wbReopenLater` solo se borra al reabrir o cuando cambia `view.status`. Si después llega un resultado `applied`, se
sale en la línea 805 sin borrarlo.

Escenario:
1. En plena toma: «Cálida» y luego «Auto». Sale `stuck`, se marca para después y aparece el aviso «volverá al
   terminar».
2. Sin acabar la toma: «Fría». Se aplica y la imagen sale azul, como se quería.
3. Al volver a `idle`, la cámara se reabre: «Fría» se pierde y la imagen vuelve a automático sin que nadie lo haya
   pedido. Encima, `setImage(IMAGE_DEFAULT)` pone «Luz» a 0.

Arreglo: `wbReopenLater.current = false` en cuanto llega un resultado `applied` con `kelvin != null`, o en cada
`changeWhiteBalance` nuevo.

**[3] RecordStudio.tsx:668-672 + useCamera.ts:452-455 — volver a «Auto» reabre la cámara y se pierde también la «Luz»
sin avisar.**
`reopen()` abre la cámara de cero y el efecto de `view.status` hace `setImage(IMAGE_DEFAULT)`. Solo se avisa si estaba
«Fijo».

Escenario: «Luz +1» (con la barra nueva del punto 49) y «Color de la luz: Fría». Al volver a «Auto», la cámara
parpadea, el color vuelve a automático y la luz vuelve a 0 sin decir nada.

Arreglo: al reabrir por el color, guardar `image.exposure` y volver a aplicarlo cuando la cámara esté lista. Si no,
decirlo en el aviso («…se reinicia un momento: la luz vuelve a 0»).

**[3] RecordStudio.tsx:2150-2165 + QuickExposure.tsx:134 — la barra de luz se queda encima de otras pantallas o vuelve
con una posición vieja.**
- Va en `z-30`, y la pantalla del aplauso armado en `z-20` (`ClapArm.tsx:145`). `armClap` cierra los paneles pero no
  `quickLight`. En los 3 s siguientes a un toque, armar el aplauso deja la barra encima de la pantalla de armado,
  donde puede tapar la sensibilidad o «Cancelar», con la posición calculada para el visor.
- Si se abre «Imagen» o un diálogo, la barra se desmonta y su temporizador se cancela, pero `quickLight` no vuelve a
  null. Al cerrar, la barra reaparece en la posición antigua otros 3 s.
- Al girar el móvil con la barra visible, la caja sigue siendo la de la otra orientación, y puede quedar encima de un
  botón o fuera de su sitio.

Arreglo: `setQuickLight(null)` en `armClap`, al abrir «Imagen», «i», los ajustes o un diálogo, y al cambiar la
orientación o el tamaño. Añadir `clap == null` a la condición de la línea 2152.

**[2] quickExposureRules.ts:30, 48-50 + QuickExposure.tsx:187 — la barra no respeta la zona segura.**
Los límites son la caja del estudio con 8 px de margen, sin `env(safe-area-inset-*)`. La etiqueta del valor va 28 px
por encima de la barra (`-top-7`).
- Con un toque cerca del borde de arriba, la barra queda a 8 px del borde y su número fuera de la pantalla o bajo la
  barra de estado.
- En horizontal con muesca, la posición centrada sobre el anillo puede quedar bajo la muesca.

Arreglo: pasar las zonas seguras a `placeQuickBar`, por ejemplo leyendo un `--sat` o `--sal` del CSS. Margen de arriba
de al menos 36 px para la etiqueta.

**[2] QuickExposure.tsx:76-80 — se oculta sola a los 3 s aunque tenga el foco.** Con teclado o un lector de pantalla,
el foco se pierde en `body`, y 3 s es poco para leerla. Es un atajo (la «Luz» del panel sigue ahí), pero conviene no
ocultarla con el foco dentro y volver a dejar el foco en el visor. Detalle: el número usa «−» (U+2212) y el panel usa
«-».

**[2] whiteBalanceRules.ts:50-56 — dos botones pueden hacer lo mismo y hay un hueco grande entre «Fría» y «Día».**
`pickTemperature` ajusta al rango de la cámara.
- Una cámara sin el preset «sombra» (máximo 6000) hace iguales «Cálida» y «Muy cálida».
- Una sin «incandescente» (mínimo 2950, el fluorescente cálido) hace «Fría» igual de azul, pero con otro número.
- Entre 2850 y 5000 no hay nada: en una sala con LED neutro (~4000 K), «Fría» se pasa de azul y «Día» se queda
  naranja.

Arreglo: no enseñar los botones cuya temperatura una vez ajustada repite la de otro. Valorar el preset «twilight»
(4600) como opción intermedia, comprobando antes que no tiñe.

**[2] docs/plan/ESTADO-IMPLEMENTACION.md:87, 125-127, 237 — textos desfasados.**
- Siguen diciendo «Baja, Media, Alta o Muy alta», «prueba "Alta" o "Muy alta"».
- El color de la luz sigue como «Cálida, Fluorescente, Día, Nublado».

La guía de prueba manual no coincide con la app.

**[1] syncRules.ts — la latencia del altavoz se lee del contexto de sincronía, no del camino real de la canción.** En
Chrome con «Todo», la canción suena por la tubería de medios del elemento (`captureStream`), cuyo búfer puede no
coincidir con el `outputLatency` de un AudioContext `playback`. Es una aproximación razonable; se puede afinar al medir
(hallazgo [5] del retraso sin medir).
