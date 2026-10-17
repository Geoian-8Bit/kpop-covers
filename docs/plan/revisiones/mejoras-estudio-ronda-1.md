# Revisión · Mejoras del estudio (puntos 3 a 12) · ronda 1

## Alcance

Revisión de solo lectura de los puntos 3–12 de `docs/plan/MEJORAS-PRUEBA-MANUAL.md` sobre la copia de trabajo de
`feat/plan-completo`, sin commit todavía: `features/studio/` (StudioPage, ZoomControls, SaveClipDialog, ClipList,
Transport, fullscreenChrome, stageRules, clipRules, popoverRules y sus pruebas), `player/` (engine, useLoopController,
YouTubeStage, loopRules y su prueba, store), `lib/stagePref.ts`, `lib/youtubeIframe.ts`, `data/clips.ts`,
`components/ui/Dialog.tsx` (hueco `footer`), `PinnedClips.tsx` (texto) y las 3 líneas de `LinkFilePanel.tsx`.
Decisiones del responsable que se dan por buenas: punto 4 «vídeo limpio» (sin botón rojo y sin controles de YouTube) y
punto 7 solo con archivo (ver la valoración más abajo).

No he arrancado servidor ni navegador. Las medidas en píxeles salen de las clases. He pasado las 4 pruebas nuevas
(44 en verde) y `tsc --noEmit`, que no da errores en estos archivos. Otro agente está tocando `StudioPage.tsx` mientras
reviso, así que los números de línea de ese archivo pueden moverse un poco.

## Lo que vio el coordinador (390×844)

**(a) El panel de pausa de «Bucle» queda tapado por el vídeo fijo: confirmado, y la causa es el apilamiento.**
`index.html` lleva siempre `data-skin="kamon"`, y con ese tema `.skin-tray` tiene `isolation: isolate`
(`index.css:440-445`). La bandeja de `PlayerBar` (`Transport.tsx:221`) crea así su propio contexto de apilamiento sin
z-index, al nivel 0. El `z-40` del `Popover` solo cuenta dentro de la bandeja. El escenario fijo
(`StudioPage.tsx:374`, `sticky top-16 z-20`) se pinta encima. Además el panel se abre hacia arriba
(`bottom-[calc(100%+8px)]`), justo hacia el vídeo. Al menú de velocidad (`Transport.tsx:318`) le pasa lo mismo. La
corrección en horizontal (`useStayOnScreen` + `popoverShift`) está bien, pero no corrige la posición vertical.

**(b) Pantalla completa en el panel emulado: la llamada es correcta.** `requestFullscreen({ navigationUI: 'hide' })`
se llama dentro del toque (la activación del usuario se mantiene, también con `F` por el evento síncrono). El bloqueo de
orientación tiene `catch`. Si la llamada falla o no existe se pasa a la capa CSS (`StudioPage.tsx:1029-1055`). Lo más
probable es que el panel de Electron conceda y retire enseguida la pantalla completa: `fullscreenchange` sin elemento
→ `mode` vuelve a `none` y parece que no ha pasado nada. Sí he encontrado un fallo real en la alternativa CSS (hallazgo 3).

## Hallazgos (de mayor a menor)

1. **[7] `Transport.tsx:503` (y `:543`) — el panel «Pausa entre vueltas del clip» de la barra del tramo sale cortado.**
   El `motion.div` del `RangeBar` lleva `overflow-hidden` fijo, no solo mientras se anima la altura. El `GapPicker` (unos
   190 px) se abre hacia arriba desde «Repetir» y queda recortado por la caja de la barra (unos 64–110 px). Así la pausa
   por clip no se puede elegir en la vista normal (en pantalla completa sí). Viene de antes, pero el punto 9 pide que
   el panel «se quede siempre dentro».
   *Arreglo:* recortar solo durante la animación (`animate={{ height: 'auto', opacity: 1, transitionEnd: { overflow:
   'visible' } }}` y `overflow: hidden` en `initial`/`exit`), y la misma colocación que en el hallazgo 2.

2. **[7] `Transport.tsx:221` + `index.css:440-445` + `StudioPage.tsx:374` — (a): los menús de la bandeja (pausa de
   «Bucle», velocidad) quedan debajo del vídeo fijo.** Causa explicada arriba.
   *Arreglo (mínimo y seguro):* (1) dar a la bandeja `z-30` mientras tenga un menú abierto (ya es `relative`; por
   ejemplo `has-[[role=menu]]:z-30`), así su contexto queda por encima del `z-20` fijo y por debajo de la cabecera
   `z-40`; lo mismo en el `div.relative` del `RangeBar`. (2) Volteo vertical en `useStayOnScreen`: medir el borde
   inferior del escenario fijo (un `data-studio-stage` en el contenedor fijo) y, si `box.top < ese borde + 12`, abrir hacia
   abajo (`top-[calc(100%+8px)]`) y hacer `scrollIntoView({ block: 'nearest' })`. Añadir el caso vertical a
   `popoverRules` con prueba. Alternativa: en `max-sm`, una hoja inferior en un portal `fixed` `z-[60]`.

3. **[6] `StudioPage.tsx:374` + `:849` — la pantalla completa CSS (la única que tiene el iPhone) queda dentro del
   contexto `sticky z-20` en móvil vertical.** Por debajo de 640 px el contenedor es `sticky` con `z-20`, que crea un
   contexto de apilamiento. La capa `fixed inset-0 z-[70]` del escenario cuenta como z-20 en la página: la cabecera
   (`AppShell.tsx:409`, `sticky z-40`) y lo que tenga z > 20 se pintan encima. Tapa la barra superior de pantalla completa
   (título y enlace «YouTube», que es la atribución). En horizontal no pasa (`sm:static`). Viene de antes; la Fullscreen API
   nativa no lo sufre porque usa la capa superior.
   *Arreglo:* subir el contenedor fijo mientras hay pantalla completa sin mover el escenario (un portal recargaría el
   iframe): `data-fs` en el escenario cuando `fullscreen` y `has-[[data-fs]]:z-[75]` en el contenedor fijo (o pasar el
   estado hacia arriba). Para (b), opcional: si `fullscreenchange` sale en los ~500 ms siguientes a entrar sin que la
   persona lo pida, pasar a `css`.

4. **[5] `useLoopController.ts:29` y `:34` — la anticipación también se aplica con pausa entre vueltas.** Con
   `gap > 0` la app pausa y cuenta igualmente, así que adelantar el salto no sirve. Corta hasta 0,3 s × velocidad del
   final del clip (en YouTube): el último tiempo del clip no se ve.
   *Arreglo:* `lead = target.gap > 0 ? 0 : loopLead(...)` (en el tramo con `state.gap`, en la canción con
   `state.gapAll`) y una prueba.

5. **[5] `engine.ts:301` y `:321` — la latencia medida de YouTube sale demasiado alta y el bucle salta antes de tiempo.**
   El aterrizaje necesita `now - sentAt > 200` y un dato nuevo del iframe (llegan unas 4 veces por segundo). Por eso
   ninguna muestra baja de unos 200 ms y casi todas añaden la espera del dato. Además entra en la media cualquier salto
   exacto con la canción en marcha (±5 s, toques lejos que descargan, hasta 2 s). La estimación tiende al tope de 300 ms.
   Si el salto real dentro de lo ya cargado dura unos 120–150 ms, el inicio sale unos 150 ms antes del tiempo en cada
   vuelta: el bucle dura menos que el clip y quien cuenta tiempos lo nota.
   *Arreglo:* medir solo los saltos del bucle (`seek(to, { loop: true })`). Para medir, detectar el aterrizaje sin el
   mínimo de 200 ms (dato del iframe junto al destino) o con `onStateChange`, y restar la mitad del intervalo de datos.
   Bajar el tope a unos 200 ms. Probarlo con un clip de metrónomo.

6. **[4] `SaveClipDialog.tsx:438` y `:475` — «Editar» bloquea un clip cuyo tramo no se ha tocado.** El tramo se valida
   siempre con la duración del escenario actual. Un clip que acaba al final de YouTube puede pasar de la duración del
   archivo (desfase o recorte) y entonces no se puede ni cambiar el nombre.
   *Arreglo:* validar contra la duración solo si cambian `start_seconds`/`end_seconds`, o tomar
   `max(duration, clip.end_seconds)`.

7. **[4] `ZoomControls.tsx` / `StudioPage.tsx` (gestos) — accesibilidad 2.5.1: en el móvil solo se amplía pellizcando.**
   El ordenador tiene rueda y teclas, pero en el teléfono no queda ninguna forma con un solo dedo.
   *Arreglo:* un control pequeño en la fila del zoom (no sobre el vídeo), por ejemplo «Ampliar» (1,5× al centro), visible
   solo con archivo. Respeta el «nada encima del vídeo» del responsable.

8. **[3] `SaveClipDialog.tsx:459-462` — al editar el clip activo, `applyClip` hace más de lo editado.** Si cambia la
   velocidad, el espejo o el tramo, también vuelve a poner el zoom y el seguimiento guardados (se pierde un zoom a mano sin
   guardar) y salta al inicio. Si el guardado falla, el reproductor se queda con los valores nuevos.
   *Arreglo:* aplicar solo lo que cambió (`setRate`, `mirrored`, `loop`) y, en el `catch`, volver a aplicar `before`.

9. **[3] `StudioPage.tsx:161` — la decisión de escenario se fija con la fila provisional.** Si la biblioteca guardada
   está desfasada (el archivo se vinculó en otro móvil), la fila provisional llega sin archivo y se decide YouTube. Al
   llegar la fila real, la guarda «vinculado en esta visita» mantiene YouTube aunque haya archivo.
   *Arreglo:* marcar `decidedFor` solo con `loaded`, o recordar si estaba vinculado al decidir.

10. **[3] Punto 10 — «Guardar clip» mide unos 480 px a 390×844 (la mitad son 422) y unos 570 con zoom o seguimiento.**
    *Arreglo:* título de 20 px en móvil, chips del tramo dentro de la descripción y `PIN_HINT` en una línea (o como
    `aria-describedby`).

11. **[3] `Dialog.tsx:112` — los botones fijos del pie no respetan la zona segura.** El contenedor usa `p-3` y en el
    iPhone la barra de inicio queda sobre «Guardar».
    *Arreglo:* `pb-[max(12px,env(safe-area-inset-bottom))]`.

12. **[3] Punto 4 — aviso para el responsable, no es un fallo.** Con `controls: 0`, YouTube sigue pintando su propio icono
    de pausa al pausar, y sale invertido con espejo. Antes lo tapaba el sello rojo; ahora se ve. Desde fuera del iframe
    no se puede quitar.

13. **[2] `ZoomControls.tsx:103` — `aria-live` en todo el contenedor**, con botones y una cifra que cambia en cada
    fotograma del pellizco: el lector de pantalla habla sin parar. *Arreglo:* una zona `sr-only` que se actualice al
    acabar el gesto.

14. **[2] Objetivos menores de 44 px:** botón de velocidad en pantalla completa `h-10` (`StudioPage.tsx:1542`), botones
    de la bandeja de 38 px (`Transport.tsx:189`) y «Repetir»/«Quitar tramo» `h-9`. Los dos últimos vienen de antes. En
    pantalla completa ya no hay botones de ±5 s (solo doble toque y teclas); vale para el «vídeo limpio».

15. **[2] `SaveClipDialog.tsx:125-127`** — la ayuda de «Fijar en la portada» no está unida al interruptor
    (`aria-describedby`).

16. **[2] CLAUDE.md, animaciones:** transiciones sueltas (`StudioPage.tsx:1142`, `:1187`; `ZoomControls.tsx:230`) en
    lugar de los presets de `motion.ts`. Si hace falta, añadir un preset `fade`.

17. **[1] `YouTubeStage.tsx:67`** — `vq` y `setPlaybackQuality` no tienen efecto, pero tampoco hacen daño y están
    documentados. **[1]** El reloj del diálogo de edición (`NowReadout`, 10 veces por segundo) solo vuelve a pintar un
    `span`: bien.

## Comprobaciones por punto

- **3 Editar clips:** bien. `clipEditPatch` solo envía lo que cambió de las 7 columnas permitidas; la actualización
  optimista reordena y se deshace solo para ese clip; no se puede crear un duplicado; un clip archivado mientras se edita
  cierra el diálogo. Detalles en los hallazgos 6 y 8.
- **4 Vídeo limpio:** quitados el sello del centro, el sello que tapaba el de YouTube y los botones centrales en pantalla
  completa. La velocidad y el zoom sobre el vídeo aparecen un momento y se van. Play/pausa queda en las barras.
- **5 Fluidez:** el diseño es correcto. La visibilidad está en `fullscreenChrome` (estado de interfaz, no del
  reproductor: compatible con CLAUDE.md), la capa recibe hijos ya creados (no se repinta el escenario), y el indicador de
  carga y la velocidad van en componentes aparte. Todos los temporizadores se limpian. **Falta la traza a 390×844 con
  CPU ×4** que pide el punto: no se puede dar por cerrado sin medir.
- **6 Calidad:** lo poco que se puede hacer está hecho; el archivo se reproduce sin cambios.
- **7 Zoom con los dedos:** pellizcar, arrastrar, doble toque y pantalla completa siguen funcionando, y «Guardar zoom
  con el clip» se mantiene. **Dejarlo solo con archivo es razonable.** Las políticas de los servicios de API de YouTube
  prohíben modificar, recortar u ocultar el reproductor o su contenido. Ampliar el iframe con CSS recorta la imagen y lo
  que YouTube pinta encima (marca, anuncios, avisos). Además YouTube elige la calidad por el tamaño real del iframe, así
  que un 2× se vería borroso. Conviene decirle al responsable que el espejo (`scaleX(-1)` sobre el iframe) ya está en una
  zona dudosa parecida. Que el camino para ampliar con YouTube sea vincular el archivo (y la copia para la nube del
  punto 13).
- **8 Bucle sin pausa:** el salto no espera al evento de fin ni a la confirmación, el temporizador entre fotogramas se
  vuelve a comprobar al dispararse y se limpia al desmontar, y la anticipación sigue la velocidad y no pasa de ¼ del clip.
  Revisados: clip muy corto, salto fallido (el destino se respeta 6 s, no hay doble salto), cambio de clip a mitad y
  final de la canción. Problemas en los hallazgos 4 y 5.
- **9 Panel de pausa:** el número es más grande, tiene más contraste y va al lado del icono; los botones del panel son
  de 44 px. Problemas en los hallazgos 1 y 2.
- **10 Guardar clip compacto:** buena estructura y pie fijo con `form=` (Intro también envía). Tamaño en el hallazgo 10.
- **11 Fijar en la portada:** el texto es el mismo en el diálogo, la lista y la portada, y `aria-pressed` es correcto.
- **12 El archivo manda:** `initialStage` y `needsLocalCheck` son correctos y no arranca ningún reproductor hasta
  decidir. La copia local caducada pasa a YouTube, el cambio de canción decide de nuevo, la v1 se lee como reserva y se
  limpia, y al quitar o cambiar el archivo se olvida la elección. El selector va debajo de los controles, con
  `radiogroup`, flechas y 44 px. Caso límite en el hallazgo 9.
- **Seguridad y datos:** bien. Las actualizaciones de clip solo llevan `name`, `color`, `is_pinned`, `speed`,
  `mirrored`, `start_seconds` y `end_seconds`.
- **Regresiones:** no he encontrado ninguna en atajos, seguir a un bailarín ni zoom guardado con el clip.

## Veredicto

**Sí, hay hallazgos de nota ≥6 (tres), que se corrigen sí o sí:** 1 (panel de pausa del clip recortado), 2 (menús de la
bandeja bajo el vídeo fijo, lo que vio el coordinador) y 3 (pantalla completa CSS bajo la cabecera en móvil vertical).
Los hallazgos 1 y 3 vienen de antes, pero caen dentro de lo que piden los puntos 9 y 5. Después irían los dos del bucle
(4 y 5, nota 5) y la traza del punto 5, que sigue pendiente.
