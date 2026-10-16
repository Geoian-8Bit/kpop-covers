# F5 · Repaso (apilado / superpuesto) — revisión ronda 1

Revisión de solo lectura de los cambios sin commit de F5 (`features/review/*`, `features/studio/fileSource.ts`, `player/store.ts` (`useReview`), `player/engine.ts` (`setMuted`), `lib/youtubeIframe.ts`, `data/takes.ts` (`useUpdateTakeReview`), `StudioPage.tsx`, `TakesPanel.tsx`, `Segmented.tsx`, laboratorio `review-compare`, `packages/shared/src/review.ts`). F6 (notas sobre la toma) solo se ha tocado en lo que roza con F5 (teclas, foco, dibujo sobre el fotograma).

Escala de notas: gravedad de 1 a 10 (10 = la peor). 🔴 = bloquea el cierre de la fase. **No hay ningún 🔴.**

## Resumen

- `pnpm typecheck`: limpio. `vitest` de `features/review`, `features/lab`, `features/takes`: 76 pruebas verdes.
- Probado en navegador (Chromium de Playwright, demo en `localhost:5174`, silenciado) con una canción vinculada a un archivo (desfase F1 = +2 s) y una toma sintética grabada «a 0,75×» desde el segundo 5 (vídeos con contador de fotogramas, hechos en mi carpeta de pruebas):
  - Sincronía correcta: al abrir, el original está en 7,00 s (5 + 2) a 0,75×; durante 7 s de reproducción la deriva medida fue 0,00 s en todas las muestras (sin saltos ni cambios de velocidad); el bucle A–B salta en ambos (deriva 0,00 s tras cada vuelta); al llegar al final de la toma se para y el original queda en 14,5 s = 5 + 10·0,75 + 2.
  - Ajuste fino ±0,3 s: se guarda con debounce; cerrar con Escape antes de que venza el plazo lo vuelca (`sync_adjust_seconds` 0,05 en la base tras cerrar); al reabrir muestra «+0,05 s».
  - Superpuesto: arrastrar con ratón guarda `fit_x/fit_y` al soltar, la rueda cambia `fit_scale` (1,822) y se guarda tras 250 ms + 500 ms, las flechas sobre el marco mueven y guardan; un toque reproduce/pausa.
  - Foco: 70 Tab y 70 Mays+Tab no salen del diálogo. Escape y atrás (`history`) cierran, el scroll del `body` se restaura y ambos `<video>` desaparecen del DOM.
  - Sin archivo (solo YouTube): «Superpuesto» queda `aria-disabled` con la razón en la etiqueta y toast al pulsar; el modo guardado `overlay` cae a apilado.
- Reglas del proyecto: el estado del reproductor está solo en `player/store.ts`; los motores solo ganan `setMuted` (sin estado de UI); no he encontrado colores sueltos (todo tokens); los copys están en español. Pequeñas excepciones en los hallazgos 10 y 6.
- Lo más serio, aun sin bloquear: no se pausa por buffering (1), los fallos de guardado al cerrar son silenciosos y no reintentan (2), el encaje se guarda relativo al marco de pantalla, no a la toma (3) y el store/reloj de sincronía no tienen pruebas propias (6).

## Hallazgos

### 1. No se pausa cuando uno de los dos vídeos se queda cargando — nota 6
- **Dónde:** `features/review/ReviewMedia.tsx` (`TakeVideo`, `OriginalFile`, `useReviewClock`), `player/store.ts` (`play`). No hay ningún `waiting`, `stalled` ni `canplay` ni el estado `BUFFERING` de YouTube en la fase.
- **Flujo:** toma u original servidos desde la nube (URL firmada, conexión mala): uno se detiene al cargar mientras el otro sigue. Si se atasca el original, el reloj (la toma) avanza, la deriva pasa de 0,35 s y se llama a `alignOriginal()` cada 400 ms o más: un `seek` nuevo en un vídeo que aún carga lo reinicia, así que puede no recuperarse mientras la toma sigue. Si se atasca la toma, el original sigue y solo se frena por el ajuste de velocidad (±8 %) hasta que salta.
- **Evidencia:** lectura de código; no reproducido (el demo es local). La spec de F5 pide sincronía exacta; sin pausa conjunta el repaso pierde sentido justo cuando más se nota.
- **Arreglo:** escuchar `waiting` y `playing` en los dos `<video>` (y `BUFFERING` en YouTube) y llevarlo al store (`buffering`: toma, original o nada); mientras haya uno, pausar el otro sin cambiar `playing`, y reanudar ambos con `alignOriginal()` cuando los dos estén listos. Mostrar el spinner existente. Subir la ventana `msSinceReviewAlign` mientras el original esté cargando.
- **Test:** store con motores falsos: simular `waiting` del original y comprobar que la toma se pausa y que al volver se realinea una sola vez.

### 2. Guardado del ajuste y del encaje: errores mudos al cerrar y sin reintento — nota 5
- **Dónde:** `ReviewScreen.tsx` (`useTakeSaver`, `onFit`, `savedFit`), `data/takes.ts` (`useUpdateTakeReview`).
- **Flujo A:** la persona mueve el encaje o el ajuste y cierra dentro del debounce → el cleanup llama a `flush()` → `mutate` con su `onError`. Los callbacks de `mutate` no se ejecutan si el componente ya se desmontó (TanStack Query v5), así que si falla no hay aviso, solo el rollback del caché por el `onError` del hook: parece que quedó guardado.
- **Flujo B:** `onFit` anota `savedFit.current = next` antes de saber si el guardado funcionó; si falla, soltar el gesto en el mismo valor ya no vuelve a intentarlo (`sameFit`). El estado local (`fit` y `adjust`) queda con el valor no guardado y solo se ve «No se pudo guardar» en los ajustes, sin botón de reintento.
- **Flujo C:** `onError` restaura el `before` de **toda** la lista; con dos guardados a la vez (ajuste y encaje) uno puede deshacer el cambio ya confirmado del otro.
- **Evidencia:** lectura de código; el guardado correcto sí se probó (ver resumen).
- **Arreglo:** pasar el aviso de error al `onError` del hook (o emitirlo desde la propia mutación), no al de `mutate`; marcar `savedFit` en `onSuccess`; hacer el rollback solo de los campos del `patch`; añadir «Reintentar» junto a «No se pudo guardar».
- **Test:** `useUpdateTakeReview` con `backend.updateTake` que falla: el caché vuelve solo en esos campos y el aviso se emite también tras desmontar.

### 3. El encaje superpuesto se guarda relativo al marco de la pantalla — nota 5
- **Dónde:** `CompareStage.tsx` (`fitTransform`: traslación `x·ancho`, `y·alto` y escala), `reviewRules.ts` (`scaledAround`, `fitOf`).
- **Flujo:** se encaja el original sobre la toma en un móvil vertical (marco de unos 360×500) y se abre el repaso en el portátil (unos 940×600). La toma y el original (`object-contain` los dos) ocupan fracciones distintas del marco según su proporción, así que las mismas fracciones `x`, `y` y `scale` dejan los cuerpos desalineados. El encaje «se guarda con la toma» y se comparte con el grupo (columnas en la base), por lo que el desajuste aparece entre dispositivos y entre vertical y horizontal.
- **Evidencia:** lectura de código y capturas del modo superpuesto con marcos distintos (420×860 y 1280×800): las cajas contenidas cambian de proporción respecto al marco.
- **Arreglo:** normalizar el encaje respecto a la caja contenida de la toma (su rectángulo `object-contain` dentro del marco, con `videoWidth` y `videoHeight`), de modo que `x` e `y` sean fracciones de esa caja y `scale` sea relativo a «original ajustado a la caja de la toma». Mantener los límites de `takes_fit_range`.
- **Test:** `gestureFit` y `fitTransform` con dos tamaños de marco y la misma toma: la posición relativa a la toma es idéntica.

### 4. Zonas táctiles de 36 px en el selector de modo, la velocidad, el sonido y la barra de tiempo — nota 4
- **Dónde:** `Segmented.tsx` (tamaño `md`: `h-9`), usado en `ReviewScreen.tsx` («Cómo comparar») y `ReviewControls.tsx` («Velocidad común», «Qué va encima», «Qué se oye»); `ReviewTimeline` (`h-9`).
- **Evidencia:** medido a 360×700 con tacto: Apilado 79×36, Superpuesto 110×36, 0.5× 61×36, «La toma» 83×36, «Tiempo de la toma» 328×36. El resto de botones (transporte, notas) sí llegan a 44.
- **Arreglo:** en el repaso, ampliar el área de pulsación (`min-h-11` o pseudo-elemento) sin cambiar el aspecto; la barra de tiempo a `h-11`.
- **Test:** comprobación de `getBoundingClientRect` con 44 o más en el e2e del repaso.

### 5. Apilado sobre YouTube: adornos encima del reproductor — nota 4 (no verificado visualmente)
- **Dónde:** `CompareStage.tsx`: `panelFrame` (marco con `inset` de 4 px), `PanelLabel` («Original»), `LanternRibs` (rayas y bandas oscuras de 10 px arriba y abajo con `z-[2]`) y `Curtain` (recorte con `clip-path`) sobre el panel que contiene el iframe de YouTube.
- **Flujo:** original = YouTube (sin archivo) en las variantes «linterna» y «cortina» (y el marco de «biombo»).
- **Por qué:** la regla del proyecto es no tapar ni alterar YouTube. El recorte del iframe (`top:-12%`, alto 124 %) ya existía en el estudio; lo nuevo son las capas encima de la imagen en «linterna» (bandas y rayas) y el recorte de la cortina.
- **Arreglo:** con origen YouTube, no pintar `LanternRibs`; el marco del biombo por fuera del vídeo (borde exterior, no `inset`); aceptar que la cortina recorta el panel y dejarlo anotado en el laboratorio, o desactivar «cortina» con YouTube.
- **Test:** captura en el laboratorio con origen YouTube por variante.

### 6. El store y el reloj de sincronía no tienen pruebas; las reglas probadas son un duplicado muerto — nota 4
- **Dónde:** `reviewRules.ts` (`originalRate`, `clampReviewRate`, `FRAME_STEP`, `REVIEW_RATE_MIN` y `MAX`) frente a `player/store.ts` (`reviewOriginalRate`, `REVIEW_RATE_*`, `REVIEW_FRAME`).
- **Evidencia:** `grep`: `originalRate`, `clampReviewRate` y `FRAME_STEP` no se usan fuera del test; el test «plays the original at the take speed times the common speed» prueba la copia, no la que usa el store. `useReview` (`begin`, `end`, `seek`, `play`, bucle, `originalTarget`, `alignOriginal`) y `useReviewClock` no tienen ninguna prueba.
- **Arreglo:** que el store importe de `reviewRules` o de shared (una sola definición) y escribir pruebas del store con motores falsos.
- **Test:** arranque (offset y onFile), bucle A–B en ambos, velocidad `take.speed × rate`, fin de la toma, `end()` limpia motores, `detachTake` de un motor viejo no borra el nuevo.

### 7. La carga perezosa del repaso no tiene salida: fallo del chunk o espera sin cerrar — nota 3
- **Dónde:** `StudioPage.tsx` (`lazy` más `Suspense` con fallback `fixed inset-0 z-[45]`).
- **Flujo:** primera apertura sin conexión o tras un despliegue nuevo: el fallback tapa el estudio sin botón de cerrar, sin foco atrapado ni Escape; si el chunk falla, el `ErrorBoundary` de `AppShell` sustituye todo el estudio por «Algo se ha torcido», y el object URL de la toma (`takeUrl`) no se libera.
- **Arreglo:** fallback con botón «Cerrar» (y `releaseTakeUrl`); error boundary local alrededor del repaso que cierre y avise con un toast; precarga del chunk al mostrar la pestaña «Tomas».
- **Test:** simular `import()` rechazado: el estudio sigue en pie y se libera la URL.

### 8. Rendimiento: re-render completo por movimiento del puntero y tres vídeos a la vez — nota 3
- **Dónde:** `ReviewScreen.tsx` (`onFit` llama a `setFit` en cada `pointermove` y rueda), `ReviewControls.tsx` (`ReviewTimeline` se suscribe a `time`, 60 Hz), `useFileSource` en el repaso mientras el estudio mantiene el suyo.
- **Evidencia:** sin trabas medibles en el equipo de pruebas (Chromium de escritorio); en móvil el repaso monta toma y original y el estudio conserva su propio `<video>` en la pestaña «Archivo» (tres decodificadores; iOS limita los simultáneos).
- **Arreglo:** mantener el encaje en un `ref` con `style` directo durante el gesto y pasar a estado solo al soltar; que el estudio pause y libere su `<video>` mientras haya repaso (o reutilizar el original); la barra de tiempo con `time` redondeado a décimas para el texto.
- **Test:** perfil de React DevTools con un gesto de 2 s.

### 9. Accesibilidad menor — nota 3
- El estudio de debajo no está `inert`: queda en el árbol de accesibilidad (se vieron los botones «Reproducir» del estudio con el repaso abierto). `aria-modal` lo cubre en lectores modernos; añadir `inert` al fondo mientras haya repaso.
- Dentro de `radiogroup`, `group` y `slider` las flechas quedan sin función global (`onControl`), pero `Segmented` no implementa flechas entre opciones: con el foco en «Apilado» las flechas no hacen nada. Añadir navegación con flechas al `Segmented` (patrón radio).
- El marco del superpuesto es `role="group"` con `tabIndex=0` y manejo de teclado; mejor `role="application"` o un control con `aria-roledescription`.

### 10. Copys y detalles — nota 2
- `formatSpeed` da «0.5×», «0.75×» (punto decimal); en español de España, «0,75×». Es del paquete compartido y también aparece en el estudio; decidir si se arregla ahí.
- Aviso en la cabecera con YouTube: «Superpuesto: necesita el archivo del vídeo: vincúlalo en el estudio.» (dos veces dos puntos). Mejor: «Superpuesto necesita el archivo del vídeo; vincúlalo en el estudio.»
- Al cerrar, la consola muestra `net::ERR_FILE_NOT_FOUND`: `onClose` hace `releaseTakeUrl(url)` mientras el `<video src>` sigue montado un instante. Revocar tras desmontar.
- Transiciones de salida con `duration` suelta (`ReviewScreen.tsx` hacia la línea 578, `TakeNoteCard.tsx` 58 y 138) en lugar de presets de `lib/motion.ts` (`snappy`).

### 11. Pequeños fallos de borde — nota 2
- `clampFit` permite `fit_x` y `fit_y` de ±1: con 80 flechas el original salió del marco (se midió `fit_x = 1`). Sigue pudiéndose recolocar, pero acotar a ±0,6 evita dejarlo fuera.
- `play()` ignora el rechazo de `el.play()` (el motor lo traga) y deja `playing = true` con el vídeo parado; comprobar `isPlaying` tras un fotograma.
- Si el archivo vinculado no se puede decodificar (`originalError`) no se vuelve a YouTube aunque exista; solo se muestra el error.

### 12. Duda funcional sobre el espejo inicial — nota 3
- **Dónde:** `store.ts` (`begin`: `mirrorTake: mirrored` y `mirrorOriginal: mirrored`).
- La spec dice «la toma se guarda sin espejo; un botón invierte la toma o el original». Aquí, si se ensayó con el original en espejo, **ambos** empiezan invertidos. Puede ser lo correcto (la persona se ve como en un espejo) pero hay que confirmarlo con una toma real y un baile asimétrico; si no, basta con espejar solo el original.

## Qué no he podido probar
- Buffering real, URL firmadas de la nube y WebM grabados con `MediaRecorder` (duración que se aprende tarde): solo lectura de código.
- YouTube real como original (el entorno de pruebas no tiene red hacia el reproductor): comprobado solo que el modo superpuesto se bloquea.
- Gestos de dos dedos en táctil real: probados ratón, rueda y teclado; la matemática de `gestureFit` tiene pruebas unitarias.
- Notas F6 (composer, dibujo): fuera de esta ronda salvo atajos y foco.
