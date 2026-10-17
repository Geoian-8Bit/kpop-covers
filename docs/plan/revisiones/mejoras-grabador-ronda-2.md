# Revisión · Mejoras del grabador (puntos 19 a 27), ronda 2

## Alcance

Revisión de solo lectura del trabajo sin confirmar en `feat/plan-completo`. Se ha comprobado que los hallazgos de la
ronda 1 (`mejoras-grabador-ronda-1.md`) están corregidos y que no hay regresiones.

Archivos leídos:
- `apps/web/src/features/record/`: RecordStudio, compositor, pace, InfoPanel, camera, whiteBalanceRules, useCamera,
  lensRules, startRules, StartPicker, ImageControls, clap/ClapArmView, clap/clapListener, settings/model,
  settings/controls y settings/RecorderSettingsFan;
- `packages/shared/src/recording.ts` y `clap.ts`;
- para `covered`: `player/store.ts`, `player/useLoopController.ts`, `studio/studioAsleep.tsx`, `StudioPage.tsx`
  (zonas `Dormant`) y `follow/FollowStageLayer.tsx`.

Tests: vitest en verde en `features/record` (44) y en `shared` (`recording` + `clap`, 80). No se ha probado nada en
un móvil.

Notas de 1 a 10; con 6 o más se corrige sí o sí.

## Hallazgos de la ronda 1 → estado

| Ronda 1 | Estado |
|---|---|
| [7] La toma por lienzo se congela al girar el móvil (vídeo oculto y vigilante) | **Corregido.** El `<video>` ya no se oculta nunca durante la toma (solo en la revisión, con el compositor congelado). Con `canvasOnScreen`, `cam.host` pasa a `bg-black` y el lienzo queda encima. El vigilante se rearma en cada `schedule()` y salta tras 250 ms sin fotograma (sin contar una cámara que aún abre, `readyState < 2`). `freeze(false)` vuelve a `requestVideoFrameCallback`. Queda el hallazgo nuevo [5] (vuelve a rVFC tarde). |
| [7] El punto 19 no se medía (retraso, tomas directas) | **Corregido en el código.** `frameLagMs` saca el retraso de `captureTime` y `expectedDisplayTime`. La prueba compara el reposo con la codificación (`lagging`: crece más de 80 ms, o pasa de 150 ms y crece más de 40). Toda toma de 10 s o más se juzga, también las directas. El panel «i» enseña la vista previa en vivo, la prueba y el retraso de la última toma. `paceLog` deja trazas para `chrome://inspect`. **Falta la traza real en el Samsung**, que es una prueba manual. Ver el hallazgo nuevo [6]. |
| [6] El tope de tamaño aprendido no se puede quitar | **Corregido.** Elegir calidad o resolución por encima del tope llama a `forgetPaceSize`. La nota en Calidad o Resolución lleva «Volver a probar», y 60 vuelve a probar con `forgetPaceFps`. En el panel «i» está «Volver a medir». |
| [6] Falsos positivos de la prueba de fluidez | **Corregido.** Se cancela al ocultar la página, con `pagehide`, al girar el móvil y con `resize` del vídeo. `stopBench` está en lentes, pellizco, flash, enfoque, exposición, color, bloqueo, obturador y aplauso. Para aprender hacen falta dos medidas seguidas (`confirmPace`, con `pending` guardado). Queda una vía de falso positivo en las tomas directas: ver el hallazgo nuevo [6]. |
| [6] El estudio se repinta bajo el grabador | **Corregido.** `setCovered(true)` al abrir y `setCovered(false)` en la limpieza (las dos líneas están). `useUnlessCovered` cubre TimeReadout, NoteDots y zoom; Timeline, StudioPage y Follow tienen `if (s.covered) return` y repintan al destapar; `useNoteAlert` también. `Dormant` (`content-visibility: hidden`) envuelve todo menos `MediaStage`. El reloj sigue escribiendo `time` (`useLoopController` no mira `covered`), así que el fin por `s.time >= end - 0.12` y la pausa por canción parada siguen bien con el estudio tapado. No se ha hecho lo de encoger el iframe; era opcional y había que medirlo antes. |
| [5] `pickStart` cambia el estudio | **Corregido.** Solo fija `loop: { ...section, enabled: false }` y `activeClipId`, y guarda el `start`, `end` y `activeClipId` anteriores. La limpieza los devuelve; el orden de las limpiezas no importa, porque cada una extiende `s.loop`. La fila dice «solo el tramo». |
| [5] Una toma corta baja la calidad | **Corregido.** `takeVerdict` pide 10 s (8 contados, desde el segundo 2) y al menos 30 fotogramas perdidos, salvo que haya retraso. |
| [5] Color de la luz | **Corregido.** Se oculta tras dos `ignored`; caduca a los 30 días y depende de la versión del navegador; `refused` no cuenta. Hay «Volver a probar» en «i». Si falla, la interfaz pasa a Auto (`kelvin: null`) y avisa. Se descarta el resultado si cambió la pista o hay una petición más nueva. La cola hace que gane la última petición. |
| [5] Botones de lente en horizontal | **Corregido.** `fitChips` deja 4 como mucho, las «Otra» comparten un botón (`otherLensStep`) y los botones son `h-11 min-w-11`. A 844×390 la columna mide unos 196 px. |
| [4] Lienzo con un tamaño viejo | **Corregido.** `drawnAtShutter` y el tamaño se comparan con `canvasSize(videoWidth, videoHeight)`. |
| [4] «Descartar» tras «Cerrar» | **Corregido.** Tres botones: «Descartar y salir» (peligro), «Descartar y seguir grabando» y «Cancelar». |
| [4] Aplauso sin forma de afinar | **En parte.** Ya avisa «Eso no parece una palmada…» ante `dull` o `attack`, y el comentario de `clap.ts` está corregido. No hay vista de depuración de los `judged`. Queda en [2]. |
| [3] Reabrir la cámara en plena toma | **Corregido.** `busy()`: fase distinta de idle, o hay `recorder`. |
| [3] Grabar durante la prueba | **Corregido.** Hay `stopBench()` al principio de `shutter()` y de `armClap()`, y el aviso «Comprobando que el móvil va fluido…». |
| [3] Lista «Empieza en» | **Corregido.** Flechas, Inicio y Fin; una sola parada de Tab; `data-autofocus` en la opción elegida; y un fondo a pantalla completa que cierra la lista y se queda con los toques. |
| [3] Enfoque con zoom digital | **Corregido.** `framePoint` deshace `view.crop`. |
| [2] Menores | **Corregidos:** `hitKey` solo con `first` o `second`, `useMemo` en `lensProbes`, `cancel()` que resuelve null, `aria-describedby` y el `aria-label` de la lente con «ahora 1,4×». **Sin hacer:** anotar en ESTADO el cambio de la decisión 6 (ver hallazgo nuevo [3]). |

## Hallazgos nuevos

**[6] RecordStudio.tsx:1036-1047 + pace.ts:191-207 — una toma directa en una sala oscura baja la calidad 30 días.**
Una toma directa se juzga contra los fotogramas por segundo que la cámara dio en reposo en la prueba (`paceRest`).
Ese dato se guarda una vez por modo y dura 30 días, porque la prueba no se repite (`benchDone`). Pero con poca luz, la
mayoría de cámaras Android bajan solas de 60 a 30, o a 20–24 en 1440p o 4K a 30, y una toma directa graba
exactamente lo que da la cámara. Ejemplo: prueba hecha de día (en reposo, 60). Dos tomas por la tarde en la misma sala
(la cámara da 30) dan `measured` 30 frente a un objetivo de 60. `takeVerdict` pierde más de 30 fotogramas y da
`fps30`; la segunda toma lo confirma y se aprende. En 1440p o 4K da `smaller` y la calidad baja a 1080p durante un
mes, aunque el móvil podía con ello. El comentario de `finish` lo prevé solo cuando no hay prueba previa («fewer
frames may just be a dark room»), no cuando la hay.
**Arreglo:** en una toma directa, no comparar con el reposo guardado. Hay dos opciones:
- (a) juzgar solo por el retraso (`cameraFps = measured`);
- (b) contar en `watchPresentedFrames` los fotogramas que la página no llegó a presentar
  (`Σ max(0, presentedFrames − anterior − 1)`), y sacar el ritmo real de la cámara durante la toma a partir de la
  mediana del intervalo entre `captureTime` consecutivos, y juzgar con eso.

Añadir un test en `recording.test.ts`: «una toma directa a 30 con un reposo de 60 y sin retraso → `ok`».

**[5] compositor.ts:227-246, 260-270 — tras un parón a mitad de una toma por lienzo, la toma sigue con
`requestAnimationFrame` hasta el final.** Un parón de 250 ms o más pasa la toma al bucle de pantalla, y solo se
vuelve a rVFC en el siguiente `freeze(false)`, es decir, en la próxima toma. Ese parón puede venir de encender el
flash grabando (el botón está en `recording`, y en muchos Android el `applyConstraints` de la linterna reconfigura la
cámara) o de girar la cámara o cambiar de lente en pausa: el compositor sigue dibujando en `paused` y `stopStream`
deja el vídeo sin fotogramas hasta que llega la nueva cámara. Desde ahí, `draw()` va al ritmo de `fps + 2` sin saber
si hay un fotograma nuevo:
- con poca luz (cámara a 20, modo a 30) duplica en torno a un tercio de los fotogramas, y el ritmo de cámara y
  pantalla se desacompasa, con tirones;
- `delivered` pasa a contar los ticks, así que los fotogramas perdidos (R4) y el veredicto de fluidez de esa toma
  quedan ciegos. No da falsos positivos, pero no ve nada.

No se congela; por eso es [5] y no [7].
**Arreglo:** en modo rAF, dejar también pedido un `requestVideoFrameCallback`. Cuando llame, cancelar el rAF y volver
a `perFrame = true` (rearmando `watch()`). Mientras tanto, saltarse `draw()` si el fotograma no ha cambiado
(`video.getVideoPlaybackQuality?.().totalVideoFrames`, o el `presentedFrames` de ese rVFC de prueba).

**[3] docs/plan/ESTADO-IMPLEMENTACION.md:75-76 y 224 — documentación desfasada.** La prueba manual 7 dice que en
Ajustes «se puede elegir frontal o "última usada"», pero ese ajuste (`startCamera`) ya no existe: se abre siempre la
última usada (`initialFacing`, P25). La decisión 6 sigue diciendo «Cámara al abrir: trasera». Quien pruebe buscará
una opción que no está. **Arreglo:** reescribir las dos entradas: abre la última cámara usada, la trasera la primera
vez, en su lente principal.

**[2] compositor.ts:98 + RecordStudio.tsx:1360-1362 — el retraso de una toma es la mediana de los últimos 10 s.**
`createLagLog()` guarda 600 muestras: unos 10 s a 60 fps y 20 s a 30. En una toma de 3 minutos, el veredicto y la
fila «Retraso de la vista previa» solo ven el final. **Arreglo:** un histograma fijo (por ejemplo de 0 a 2000 ms en
cubos de 5 ms) del que salga la mediana de toda la toma sin reservar memoria. Otra opción es tomar una muestra de
cada N fotogramas.

**[2] RecordStudio.tsx:2618-2650 — el diálogo de descartar no tiene desplazamiento.** A 844×390 mide unos 295 px y
cabe en los 342 px disponibles, pero con la letra del sistema más grande, los tres botones de «Cerrar» se salen de la
pantalla y no se puede desplazar. **Arreglo:** `max-h-full overflow-y-auto` en la tarjeta (o
`max-h-[calc(100dvh-48px)]`).

**[2] InfoPanel.tsx:300-311 + RecordStudio.tsx:888-892 — «Volver a medir» en un modo ligero no hace nada visible.**
Con 1080p a 30 no hay prueba (no se pasa de `heavy`), así que el botón solo olvida datos y el panel sigue igual.
**Arreglo:** enseñarlo solo con `view.paceCapped`, con un `pending` o con `benchStats`. O, después de olvidar, decir
«Se medirá al grabar en 60 fps o por encima de 1080p».

**[2] Aplauso, depuración.** Sigue sin haber forma de ver en el móvil por qué no salta. Se puede volcar en `paceLog`,
o en un `clapLog` con el mismo interruptor, el último `judged` o `rejected` con su nivel, brillo, ataque y caída, para
afinar los umbrales con palmadas reales (punto 21).

**[1] useCamera.ts:234.** Si al llegar la lista de lentes hay una toma en marcha, ya no se reabre la principal (bien).
Pero no se vuelve a intentar al acabar, y esa sesión sigue en la lente que eligió el navegador hasta que se toque 1×.
Es aceptable; como mucho, reintentarlo al volver a `idle`.

## Comprobaciones específicas

- **(a) Toma correcta:**
  - **Directa:** sin cambios en `roll()`. La pista de la cámara y el audio van juntos, la rotación queda bloqueada y
    un `resize` pone la toma en pausa.
  - **Por lienzo:** `captureStream(0)` + `requestFrame` por cada dibujo, el tamaño queda fijado y las franjas solo
    aparecen al girar.
  - **Zoom digital:** el recorte por CSS en la vista previa coincide con el del lienzo (`view.crop` =
    `compositor.setZoom`).
  - **Duplicados:** solo en el caso del hallazgo [5].
  - **Audio:** su sincronía no ha cambiado.
- **(b) Prueba de fluidez:**
  - **Nada se graba:** solo pista de vídeo y `ondataavailable` vacío.
  - **Nada suena:** sin canción, sin `unlockAudio`.
  - **Nada se queda colgado:** el `MediaRecorder` se para en todas las salidas (`cleanup`). El lienzo de la prueba
    para sus pistas en el `.then`, y la limpieza del efecto la cancela al cerrar, al cambiar de fase o al cambiar de
    modo.
  - **Bajar la calidad sin motivo:** la prueba ya no lo hace sola, porque hacen falta dos medidas. La vía que queda
    son las tomas directas con poca luz, el hallazgo [6].
- **(c) Temporizadores:** se limpian el `watchdog` del compositor (al congelar, al desmontar y al pasar a rAF), los
  tres `setTimeout` de la prueba, la espera de 1,5 s, el aviso de palmada sorda (2,5 s), el intervalo de
  `useLivePace` y el de `TakeClock`. La lista de color tiene como mucho 20 entradas. No se ha visto ninguna fuga.
- **(d) Interfaz:**
  - **A 390×844:** caben la fila de 4 lentes y el diálogo de tres botones; el aviso de la prueba solo sale sin otro
    aviso.
  - **A 844×390:** la columna de lentes (unos 196 px) y la del obturador (unos 240 px) caben. El aviso de la prueba
    se oculta, y el panel «i» y la lista «Empieza en» se abren a la derecha. Lo que no se adapta, «Zoom digital» y
    poco espacio, en fila junto a las lentes, ya era así antes.

## Veredicto

**Sí, queda un hallazgo de 6:** **[6]** una toma directa con poca luz se compara con el reposo guardado de la prueba
y puede bajar la calidad (60 → 30, o 1440p/4K → 1080p) durante 30 días. Hay que corregirlo antes de cerrar el
bloque.

Todo lo de la ronda 1 con nota de 4 o más está corregido, sin regresiones vistas; la traza en el Samsung sigue
pendiente como prueba manual. Conviene hacer el [5] (volver a rVFC tras un parón) y el [3] (documentación) en la
misma pasada. El resto, si sale barato.
