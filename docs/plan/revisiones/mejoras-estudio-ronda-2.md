# Revisión · Mejoras del estudio (puntos 3 a 12) · ronda 2

## Alcance

Revisión de solo lectura de los cambios hechos tras la ronda 1 (`mejoras-estudio-ronda-1.md`) en la copia de trabajo de
`feat/plan-completo`, sin commit. Archivos: `Transport.tsx` (z-30 con menú abierto, recorte del `RangeBar` solo mientras
se anima, 44 px, `useStayOnScreen` con `data-popover-ceiling` y hoja inferior), `popoverRules.ts` y su prueba
(`popoverSide`), `StudioPage.tsx` (menú de velocidad de pantalla completa, `data-fs` + `has-[[data-fs]]:z-[75]`,
`Dormant`, `FsProgress`, `FsClock`), `loopRules.ts` y su prueba (`wrapLead`, `seekLanded`, `youtubeSeekSample`),
`engine.ts`, `useLoopController.ts`, `clipRules.ts` (`clipEditLimit`), `SaveClipDialog.tsx` (`playClipEdit`),
`ZoomControls.tsx` («Ampliar», anuncio `sr-only`, `PlayerZoomLayer`), `player/store.ts` y su prueba (`covered`),
`studioAsleep.tsx`, `Timeline.tsx`, `FollowStageLayer.tsx` y, del grabador, solo las dos llamadas a `setCovered`
(`RecordStudio.tsx:445` y `:505`).

No he arrancado servidor ni navegador. Las medidas salen de las clases. Pruebas: `vitest run src/player
src/features/studio`, 9 archivos y 136 pruebas en verde. `tsc --noEmit` no da errores en estas zonas. Otro agente estaba
editando `StudioPage.tsx` mientras revisaba, así que sus números de línea pueden moverse unas líneas.

## Hallazgos de la ronda 1 → estado

| Ronda 1 | Estado en ronda 2 |
|---|---|
| 1 [7] Panel de pausa del `RangeBar` recortado | **Corregido.** `initial`/`exit` llevan `overflow: hidden` y `animate` lo suelta con `transitionEnd: { overflow: 'visible' }` (`Transport.tsx:556-560`). Con `AnimatePresence initial={false}` Motion también aplica `transitionEnd` en el primer montaje, así que una barra que ya estaba visible al abrir no recorta. |
| 2 [7] Menús de la bandeja debajo del vídeo fijo | **Corregido.** La bandeja y el `RangeBar` suben a `z-30` con `has-[[role=menu]]`, por encima del `z-20` fijo y por debajo de la cabecera `z-40`. `useStayOnScreen` mide el techo (`header` y `data-popover-ceiling` fijos), abre hacia abajo si no cabe y en móvil pasa a hoja inferior. `popoverSide` tiene 6 casos de prueba. Ningún antecesor crea contexto de apilamiento ni bloque contenedor para `fixed`: `Page` solo anima la opacidad hasta 1, `.paper` no lleva `transform`/`filter`, y `Dormant` despierto no tiene estilo. Detalles en los hallazgos nuevos 3 y 4. |
| 3 [6] Pantalla completa CSS debajo de la cabecera | **Corregido**, con una regresión: el contenedor fijo sube a `z-[75]` con `data-fs`, por encima de la cabecera (40), el menú rápido (42) y la vista de repaso (45), y por debajo del grabador (90) y los avisos (100). Pero ahora también queda por encima de los diálogos (`z-50`): hallazgo nuevo 1. |
| 4 [5] Anticipación con pausa entre vueltas | **Corregido.** `wrapLead` da 0 con `gap > 0` (tramo con `gap`, canción con `gapAll`); el salto queda en `end − MIN_LEAD` y en la canción conserva el margen de 0,3 s de YouTube. Tiene prueba. |
| 5 [5] Latencia de YouTube demasiado alta | **Corregido en YouTube**, con matices. Solo mide los saltos marcados `loop` enviados con el vídeo en marcha. Ya no hay suelo de 200 ms. Resta medio intervalo entre datos del iframe y el tope baja a 200 ms. `seekLanded` evita confundir la posición vieja con el aterrizaje en clips cortos. **El motor de archivo no mira la marca `loop`** (hallazgo nuevo 2), y la estimación de YouTube sigue sin probarse con metrónomo (hallazgo nuevo 5). |
| 6 [4] «Editar» bloquea un clip intacto | **Corregido.** `clipEditLimit` = `max(duración, fin guardado)`, con prueba; se usa para el error y para el tramo. |
| 7 [4] Ampliar sin pellizcar (2.5.1) | **Corregido.** «Ampliar» (`min-h-11`) en la fila del zoom, solo con archivo y oculto en el máximo. Nada encima del vídeo. |
| 8 [3] Editar el clip activo aplicaba de más | **Corregido.** `playClipEdit` solo aplica velocidad, espejo o tramo si cambian, y devuelve un `undo` que se ejecuta si el guardado falla. |
| 9 [3] Escenario decidido con la fila provisional | **Corregido.** Sin archivo en la fila provisional, `decidedFor` se queda en `null` hasta que llega la fila real. Si esa fila trae archivo, se decide de nuevo. |
| 10 [3] «Guardar clip» de unos 480 px | **Sin verificar** (no hay navegador). |
| 11 [3] Pie del diálogo sin zona segura | **Pendiente.** `Dialog.tsx:156` sigue con `py-2.5`, y el contenedor con `p-3`, sin `env(safe-area-inset-bottom)`. |
| 12 [3] Icono de pausa de YouTube | Aviso para el responsable, nada que corregir. |
| 13 [2] `aria-live` en todo el zoom | **Corregido.** Hay un `span.sr-only` con `useSettled`, y la etiqueta solo se anuncia cuando se asienta. |
| 14 [2] Objetivos menores de 44 px | **Parcial.** `GapPicker`, «Repetir», «Quitar tramo» y la velocidad de pantalla completa ya miden 44 px. Siguen igual la bandeja (`h-[38px]`, `Transport.tsx:240`), las cifras y ± del menú de velocidad (`h-9`/`size-9`, `:383`, `:392`, `:396`) y A/B (`h-9`). |
| 15 [2] Ayuda de «Fijar» sin `aria-describedby` | **Pendiente** (`SaveClipDialog.tsx:138`). |
| 16 [2] Transiciones sueltas | **Pendiente**, y hay alguna más: `FollowStageLayer` `{ duration: 0.2 }`, `ZoomBadge` `{ duration: 0.1 }`, `RangeBar` `{ duration: 0.2 }`. |
| Punto 5 · traza a 390×844 con CPU ×4 | **Sigue pendiente.** |

## Las cuatro zonas que pedía mirar

**(a) Estudio dormido bajo el grabador.** Está bien.
- `setCovered(true)` se llama al abrir (efecto de `open`) y `setCovered(false)` en la limpieza. La limpieza también corre si
  se desmonta el estudio entero o falla el grabador, así que `covered` no puede quedarse en `true`. `reset()` no lo toca,
  y está bien.
- El reloj no se para: `useLoopController` sigue escribiendo `time` sin mirar `covered`, y el grabador lo lee con
  `usePlayer.subscribe` (`RecordStudio.tsx:1210`, `:1232`, `:2409`), así que la toma termina igual. La prueba del store lo
  comprueba.
- Por fotograma ya no pinta nada:
  - `TimeReadout`, `FsClock`, `NoteDots` y `PlayerZoomLayer` usan `useUnlessCovered`, que devuelve un símbolo fijo y no
    vuelve a pintar.
  - `Timeline` y `FsProgress` ignoran las notificaciones tapados y repintan una vez al destapar.
  - `useNoteAlert` sigue avanzando `last`, así que al volver no salta una nota de golpe.
  - El seguimiento del bailarín deja de mover el zoom y lo reaplica en `prev.covered`.
  - `PathOutline` (`s.time`) solo se monta en pausa.
- `Dormant` mide la altura en `useLayoutEffect` antes de pintar y después aplica `content-visibility: hidden` con esa
  altura. El contenedor fijo (`sticky`) conserva su bloque, así que el scroll no se mueve. Los hijos son los mismos
  elementos, así que React no los vuelve a pintar. Lo único que sigue latiendo es la cabeza de lectura de «Olas del audio
  real» (hallazgo 6), y no cuesta nada porque está dentro de `Dormant`.
- Al cerrar, el orden destapar → `pause()` → devolver el bucle es correcto. El seguimiento vuelve a calcular el zoom con
  `apply(s.time)`, y otra vez al cambiar `loop`, sin falsos «Has movido el zoom».

**(b) Bucle sin pausa.** Correcto en los casos límite que pedía:
- Clip corto: tope de ¼ del tramo, y `seekLanded` exige acercarse al destino.
- 0,5×/2×: la anticipación se escala con la velocidad, la latencia está en ms reales y al aterrizar a 2× el dato llega
  dentro de la ventana de 1 s.
- Primer salto sin medida: 150 ms en YouTube y 40 ms en archivo.
- Salto que no aterriza: 6 s de confianza; después se limpia `measuring` y no hay muestra.
- Salto manual a mitad de medida: `queued` sin `loop` → `send()` pone `measuring = false`, y `fresh` exige `!queued`.
- El temporizador entre fotogramas se vuelve a comprobar al dispararse.

Lo que no termina de cuadrar va en los hallazgos 2 y 5.

**(c) Apilamiento.** La bandeja y el `RangeBar` a `z-30` (solo con menú) quedan por encima del vídeo fijo y por debajo de
la cabecera (40), el menú rápido (42), los diálogos (50), el grabador (90) y los avisos (100). La hoja deja libre el botón
del menú rápido con `--fab-clearance`. En pantalla completa CSS, `z-[75]` queda por encima de cabecera, menú rápido y
repaso, y por debajo del grabador y los avisos, que es lo que se buscaba. Pero `Dialog` solo se mete en la pantalla
completa nativa (`document.fullscreenElement ?? document.body`), así que en la CSS los diálogos quedan debajo:
hallazgo 1.

**(d) Hoja inferior del popover en móvil.**
- Esc: `useDismiss` en captura con `stopImmediatePropagation`, así que no borra el tramo ni sale de pantalla completa.
- Atrás: `useBackToClose`.
- Zona segura inferior: `max(12px, env(safe-area-inset-bottom))`.
- El menú rápido se respeta.
- El foco no entra en el menú, pero el menú sigue al botón en el DOM, así que Tab y el lector de pantalla llegan; y al
  cerrar sigue en el botón. Es aceptable.
- Lo que falla es el móvil en horizontal (hallazgo 3).

## Hallazgos nuevos

1. **[5] `StudioPage.tsx:389` (`has-[[data-fs]]:z-[75]`) + `Dialog.tsx:162` + `useShortcuts.ts:108-115` — en la
   pantalla completa CSS los diálogos se abren debajo, sin verse.** El portal del diálogo va a `document.body` con `z-50`,
   y el escenario está ahora a 75. Con `N` (nota, y antes «¿Quién eres?»), `S` (guardar clip) o `?` se abre un modal
   invisible: atrapa el foco, bloquea los atajos (`[aria-modal]`) y solo se cierra con Esc. Pasa justo donde la API nativa
   falla: el panel del ordenador o un iPad con teclado. Antes de esta ronda se veían porque el escenario estaba atrapado en
   z-20. En la nativa no pasa, porque el portal va al elemento a pantalla completa.
   *Arreglo:* el mismo trato que la nativa, `document.fullscreenElement ?? document.querySelector('[data-fs]') ??
   document.body` (dentro del escenario `z-[70]`, el `z-50` del diálogo queda por encima de la capa de controles `z-30`).
   O, más simple, que `n`/`s`/`?` salgan antes de la pantalla completa (`oneshoot:fullscreen`) si hay `[data-fs]`.

2. **[4] `engine.ts:146` — el motor de archivo mide cualquier salto exacto con el vídeo en marcha, no solo los del
   bucle.** La marca `loop` solo se usa en YouTube. Con un archivo de la nube (URL del bucket, en streaming) cuentan
   también los ±5 s, los toques en la línea de tiempo y abrir un clip lejos, y tardan entre 300 y 1500 ms. Una sola muestra
   de 800 ms lleva la estimación de 40 a más de 300, que el tope de 250 recorta. El bucle salta unos 200 ms × velocidad
   antes de tiempo durante 3–5 vueltas, que es el fallo 5 de la ronda 1, ahora en archivo.
   *Arreglo:* `stats.startedAt = opts?.loop && !el.paused ? performance.now() : null`. Opcionalmente, bajar `maxLatencyMs`
   de 250 a unos 120, porque un salto dentro de lo ya decodificado rara vez pasa de 3–4 fotogramas.

3. **[3] `Transport.tsx:141` (`narrow: viewport < 640`) — en el móvil en horizontal el menú no tiene hoja inferior y se
   corta.** A 844×390 cuenta como pantalla grande. La cabecera fija ocupa 64 px. El `GapPicker` (unos 180 px), anclado a
   media altura, no cabe ni arriba ni abajo, y `popoverSide` elige el lado con más sitio: queda una parte debajo de la
   cabecera (40 > 30) o fuera de la pantalla. Si se arrastra para verlo, el `pointerdown` lo cierra. Bailar con el móvil en
   horizontal es un caso real.
   *Arreglo:* `narrow: viewport < 640 || window.innerHeight < 500` (o `matchMedia('(pointer: coarse)')`), más un caso en
   `popoverRules.test.ts`.

4. **[3] `StudioPage.tsx:367` + `studioAsleep.tsx` (`Dormant`) — al cerrar el grabador el foco se pierde.** Con
   `content-visibility: hidden`, «Grabar», que tenía el foco, deja de poder tenerlo y el navegador lo pasa a `body`. El
   grabador no devuelve el foco al cerrar, así que el teclado y el lector de pantalla vuelven al principio de la página. Lo
   bueno es que, abierto, Tab ya no recorre el estudio tapado, cosa que antes sí pasaba.
   *Arreglo, en el estudio (sin tocar el grabador):* una `ref` en «Grabar» y, en `onClose`, `requestAnimationFrame(() =>
   ref.current?.focus())` después de `setRecording(false)`.

5. **[3] `engine.ts:322` + `loopRules.ts` `youtubeSeekSample` — la muestra se corrige con «media del intervalo», no con
   lo que dice el dato.** Si el iframe manda un dato justo al saltar (cambio de estado o `infoDelivery` inmediato), restar
   `reportGap/2` (unos 125 ms) subestima la latencia. Entonces el salto llega tarde y se nota un pequeño tirón, justo lo que
   el punto 8 quiere quitar. Si los datos llegan a ritmo fijo, la media acierta, pero cada muestra varía ±125 ms.
   *Arreglo:* calcular el aterrizaje a partir de la posición que trae el dato:
   `sample = (now − sentAt) − max(0, raw − target) / rate × 1000`. Así no depende del ritmo de los datos, y a 2× tampoco.
   Comprobarlo con un clip de metrónomo, que sigue pendiente desde la ronda 1. Menor: las muestras de un salto que pasó
   por `BUFFERING` (hasta 2 s) entran en la media y suben la estimación varias vueltas. Se pueden descartar si se vio
   `BUFFERING` entre el envío y el aterrizaje.

6. **[2] `VoiceOlaAudio.tsx:123` (`Playhead` con `studioClock`) — sigue al reloj bajo el grabador.** Escribe un
   `transform` en cada fotograma. Dentro de `Dormant` el estilo de lo omitido no se recalcula, así que el coste es casi
   nulo, pero no sigue la regla del resto. *Arreglo:* `if (usePlayer.getState().covered) return;` en `paint`, o un
   `studioClock.subscribe` que filtre `covered`.

7. **[2] `StudioPage.tsx:1585` — menú de velocidad de pantalla completa:** el foco no entra al abrir, no tiene flechas
   (`role="menu"`) y no vuelve al botón con Esc. El de la bandeja hace lo mismo. *Arreglo:* enfocar el `aria-checked`
   al abrir y devolver el foco al cerrar.

8. **[2] `Timeline.tsx:620` — la burbuja de la nota (`z-20` en el contexto de la página) se pinta encima del vídeo
   fijo**, porque comparte nivel con él y va después en el DOM. Pasa al hacer scroll con el vídeo fijo y, sin scroll, en la
   franja de abajo del vídeo. Viene de antes. *Arreglo:* `z-10` (por debajo del vídeo fijo) o decidirlo como diseño.

9. **[1]** En la pantalla completa CSS, `useQuickNavShown` solo detecta la nativa, así que `--fab-clearance` sigue
   recortando 72 px a la derecha de la hoja dentro de la pantalla completa. **[1]** Al volver a «Ver completo» el anuncio
   `sr-only` se queda vacío y no se dice nada; se podría anunciar «Vídeo completo».

## Veredicto

**No hay nada de nota ≥6.** Los tres hallazgos ≥6 de la ronda 1 (1, 2 y 3) están bien corregidos, y también los de nota
4–5 (4, 5 en YouTube, 6 y 7). El grabador puede tapar el estudio sin romper la toma ni el regreso. Lo más urgente de lo
nuevo:
- el 1 [5]: diálogos invisibles en la pantalla completa CSS, una regresión del `z-[75]` que se arregla con una línea en
  `Dialog.tsx`;
- el 2 [4]: el motor de archivo mide saltos que no son del bucle, también una línea.

Siguen pendientes de la ronda 1, de nota baja: la zona segura del pie del diálogo, `aria-describedby` en «Fijar», los
objetivos de 38/36 px, los presets de animación y, sobre todo, las dos comprobaciones en el dispositivo: la traza del
punto 5 y el metrónomo del punto 8.
