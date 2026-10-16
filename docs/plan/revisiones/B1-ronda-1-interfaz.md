# B1 · Ronda 1 · Interfaz de F13 (Bolsas) y F14 (Random Play Dance y pistas)

Revisión de solo lectura. Estado revisado: árbol de trabajo tras el commit `cfc6296` (los ficheros de B1 están en ese commit; el árbol lleva además trabajo de B2 sin commitear). Prueba en navegador contra el demo `http://localhost:5174` (Playwright, Chromium con `--mute-audio`, silenciado además por `devSilence.ts`). Guiones y capturas en el scratchpad (`b1/`); nada en el repo salvo este informe.

**Escala de nota:** 1–10 según gravedad (10 = muy grave). 🔴 = bloquea el cierre de B1.

## Resumen

- `vitest` de `bags` y `rpd`: 35 pruebas en verde. `tsc --noEmit` falla por un único error ajeno a B1: `lib/backend.ts:938` (el demo de `insertBagItem` no rellena `wish_id`, columna añadida en `database.types.ts` por B2, sin commitear). Hay que arreglarlo antes del build.
- Lo que va bien (verificado): el doble toque en «Sacar» no duplica el sorteo; al salir de la ronda (Salir, también a mitad de clip) el store queda limpio (sin bucle, `rate` 1, espejo del dispositivo, sin clip activo, sin motor ni duración) y el estudio abre con estado de fábrica; fin de clip puntual (4,0 s para un clip de 4 s, también con 0,75×); pausa/seguir, repetir, saltar y las teclas Espacio/R/→ funcionan; un vídeo sin archivo se salta con aviso a los 2,2 s; el cambio de canción reinicia motor y duración; respeta espejo y velocidad por clip y, sin ellos, los del dispositivo; reordenar con arrastre y con flechas escribe el orden correcto, también en ráfaga; «Añadir a una bolsa» crea la bolsa en el sitio y no filtra teclas al estudio; las tres variantes de la pantalla caben sin scroll a 1366×768, 1920×1080 y 390×844.
- 1 hallazgo 🔴 y 19 más (ninguno compromete datos). Los más serios: «Volver a mezclar» que no hace nada (🔴), contador de clips que no responde, foco y teclado en la ronda, lector de pantalla mudo en la ronda, spoiler durante «Sorteando…».

## Hallazgos

### 1. 🔴 «Volver a mezclar» no hace nada cuando el orden sale igual · nota 7
- **Dónde:** `features/rpd/RpdPlayPage.tsx:92` (`key={draft.clipIds.join(',')}`) y `:304-315` (`restart(true)`).
- **Flujo:** terminar una ronda de 2 clips → «Volver a mezclar». Si el sorteo da el mismo orden, `setRoundDraft` no cambia la clave, el `RoundRunner` no se remonta y la pantalla «Ronda terminada» se queda igual.
- **Evidencia:** 12 intentos con 2 clips: 5 veces mismo orden y esas 5 veces la pantalla de fin siguió igual (con 3 clips ocurre 1 de cada 6; con 1 clip, siempre).
- **Arreglo:** que el remontaje no dependa del orden: añadir un `nonce` (contador) al borrador y a la `key`, o repetir la mezcla hasta que el orden sea distinto cuando hay más de un clip, y con un solo clip hacer `start` directamente.
- **Test:** `roundRules`: mezcla que garantiza orden distinto (o `nonce`) con 2 clips; e2e: Terminar → Volver a mezclar ×10 siempre vuelve a «¿Preparados?».

### 2. Contador «Número de clips» no responde a «Uno menos» · nota 6
- **Dónde:** `features/rpd/RoundOptionsFields.tsx:47-54` (se muestra `Math.min(value.count, max)` pero los botones restan de `value.count`).
- **Flujo:** `/rpd`, bolsa de 7 clips (cuenta por defecto 8): muestra 7 y «Uno menos» no cambia nada hasta que el valor oculto baja a 7. Con selección a mano de 3 clips hacen falta 3 toques sin cambio visible.
- **Evidencia:** `7, 7, 6`; en manual `3, 3, 3, 2, 1`.
- **Arreglo:** `const shown = Math.min(value.count, max)` y usar `shown` en `disabled` y en ambos `onClick`; o recortar `options.count` en el padre al cambiar `pool.length`.
- **Test:** componente con `value.count=8`, `max=3`: un toque en «Uno menos» deja 2.

### 3. Foco y teclado en la pantalla de la ronda · nota 6
- **Dónde:** `RpdPlayPage.tsx:357` (raíz `fixed z-[45]` sin `inert` ni trampa de foco), `:423-436` (overlay «¿Preparados?»), `:535-540` (botón cubierta).
- **Flujo:** entrar con teclado: el foco queda en `body`; Tab recorre Salir → Guardar → «Seguir» (botón cubierta, duplicado de Pausa) → Pantalla completa → Terminar → «Empezar» (el último) y después sale a la navegación lateral que está tapada (Biblioteca, Añadir vídeo…). «Empezar» no recibe foco al abrir.
- **Evidencia:** orden de Tab medido. Además la cubierta se llama «Seguir» durante la cuenta atrás (`playing` solo es true en `play`) y «Pausar» no hace nada en `idle`/`done`.
- **Arreglo:** `inert` al resto de la app mientras dura la ronda (o portal con `role="dialog"`/`aria-modal`), enfocar «Empezar»/«Otra vez» al aparecer cada overlay, `tabIndex={-1}` y `aria-hidden` en el botón cubierta (el toque sigue funcionando) e inertizar los controles bajo el overlay.
- **Test:** e2e: tras entrar, `document.activeElement` es «Empezar»; 12 Tab seguidos no salen de la raíz de la ronda.

### 4. Lector de pantalla sin información en la ronda · nota 5
- **Dónde:** `RandomPlayScreen.tsx:156,251,390` (cuenta atrás con `aria-label` en `div`/`span` sin rol, se ignora) y títulos en `h2`/`p` sin región viva; `RpdPlayPage.tsx:374` (`h1` sr-only).
- **Flujo:** con lector, al empezar, cambiar de clip o contar «3, 2, 1» no se anuncia nada; solo el `role=status` de «En pausa»/«Cargando».
- **Evidencia:** regiones vivas de la ronda durante la cuenta atrás: ninguna.
- **Arreglo:** una región `aria-live="polite"` sr-only con «Clip 2 de 8: Título, de Artista. Empieza en 3» solo en cambios de clip/fase (no cada 80 ms) y las cifras visuales `aria-hidden`; en modo adivinar anunciar «Canción oculta».
- **Test:** unidad del texto anunciado; e2e: la región cambia al saltar.

### 5. Al reanudar en la cuenta atrás parpadea «3» y suena un tic de más · nota 5
- **Dónde:** `RpdPlayPage.tsx:194-201`. `now` se queda congelado en pausa; al reanudar `leadStart` se adelanta y `Math.max(now, leadStart)` da 0 s hasta el siguiente tick (80 ms).
- **Flujo:** pausar en «1», seguir: salta a «3» ~90 ms y vuelve a «1». El efecto de `count` (`:232`) llama a `tick()` dos veces si el sonido de cuenta está activo.
- **Evidencia:** muestreo cada 15 ms: `Empieza en 1` → `3` (88 ms) → `1`.
- **Arreglo:** `setNow(performance.now())` al reanudar (o `useLayoutEffect` cuando `leading` pasa a true) y no sonar si el cambio viene de una reanudación.
- **Test:** `roundLeadStatus` tras `resume` con `now` antiguo; e2e con el muestreo.

### 6. Spoiler: la bolsa se actualiza mientras «Sorteando…» · nota 5
- **Dónde:** `BagPage.tsx:157-186` y `data/bags.ts:193-199` (`onSettled` invalida items e historial al instante); el sorteo espera `SHAKE_MS` (1,1 s).
- **Flujo:** «Sacar» en una bolsa de personas: a los 150 ms, con el sorteo agitándose, el encabezado ya dice «2 personas dentro», «En la bolsa» ya no lista a Iker, «Fuera de la bolsa» sí y el Historial pone «salió Iker (quitada)».
- **Evidencia:** capturas del DOM a 150/300/500/800 ms.
- **Arreglo:** congelar `items`/`draws` mostrados mientras `phase === 'shaking'` (instantánea en `onDraw`) o aplazar la invalidación al revelar.
- **Test:** componente con mutación diferida: en `shaking` las listas y el historial no cambian.

### 7. «Guardar como pista» con clips archivados falla sin salida · nota 5
- **Dónde:** `TrackPage.tsx:305` (`(mix ?? order).map(i => i.clip_id)`), `RpdPlayPage.tsx:484` (`draft.clipIds`), `lib/backend.ts:782` y trigger `track_item_invalid` (migración `20261016030000`, líneas 149-152).
- **Flujo:** pista con un clip archivado («No disponible») → «Volver a mezclar» → «Guardar como pista nueva» (o «Guardar como pista» en la ronda de esa mezcla): el servidor rechaza el INSERT y sale «Uno de los clips ya no existe.», sin forma de seguir salvo quitar a mano el clip.
- **Evidencia:** lectura de código y del trigger (el demo lanza el mismo error); no probado contra Supabase real.
- **Arreglo:** filtrar los ids sin clip vivo (`item.clip != null`, `byId.has(id)`) antes de guardar y avisar «Se han dejado fuera N clips no disponibles».
- **Test:** unidad de la función que prepara los ids para guardar.

### 8. Los contadores de las bolsas cuentan también lo que está fuera · nota 4
- **Dónde:** `lib/backend.ts:638-643` (`bag_items(count)`) y demo `:880`; usados en `BagsPage.tsx:119`, `AddToBagDialog.tsx:121`, `RpdPage.tsx:187`.
- **Flujo:** bolsa de canciones con 3 elementos y 2 fuera: la tarjeta dice «3 canciones · Se quita», la página «1 canción dentro». En `/rpd`, «7 clips» en la tarjeta y «4 clips para elegir» debajo.
- **Evidencia:** `3 canciones · Se quita` frente a `1 canción dentro`.
- **Arreglo:** contar solo `removed_at is null` (o «1 de 3 dentro»).
- **Test:** `listBags` demo con elementos fuera.

### 9. Carrera al «Quitar de la bolsa»/«Devolver» y «Sacar» seguidos · nota 4
- **Dónde:** `BagPage.tsx:189-197` (`setLast` con el `last` del momento del toque) y `:345-351` («Sacar» sigue activo); `lib/backend.ts:714-718` hace dos escrituras por sorteo y N sorteos en `Promise.all`.
- **Flujo:** sacar 3 → «Quitar de la bolsa» en red lenta → «Sacar» antes de que acaben las 6 escrituras → al terminar, `setLast` pisa el resultado nuevo con el viejo. Un fallo a medias deja parte escrita y `last` sin actualizar.
- **Evidencia:** por lectura (en el demo las escrituras son instantáneas y no se reproduce).
- **Arreglo:** actualizar `last` solo si sigue siendo el mismo sorteo (comparar ids), deshabilitar «Sacar» mientras `setDrawRemoved.isPending`, y un RPC que marque sorteo e ítem a la vez.
- **Test:** componente con mutación lenta + segundo sorteo.

### 10. Pausar mientras carga el clip se ignora · nota 4
- **Dónde:** `RpdPlayPage.tsx:224-229` (`goPending` no mira `paused`) y reductor `go` (`roundRules.ts:306-309`, pone `pausedAt: null`).
- **Flujo:** YouTube lento: la cuenta acabó, sale «Cargando el clip…», se pulsa Pausa → al cargar, el clip arranca igual y «En pausa» desaparece.
- **Evidencia:** por lectura.
- **Arreglo:** no lanzar `go` si está en pausa y que `go` no limpie `pausedAt`.
- **Test:** `roundReducer`: `go` con `pausedAt` no cambia de fase.

### 11. El aviso «clip fuera de su vídeo» se borra en la misma pasada · nota 4
- **Dónde:** `RpdPlayPage.tsx:207-221` (`setNotice` con el mensaje) frente a `:270` (el efecto que lo pone a null al cambiar `state.index`), mismo commit cuando el clip siguiente es de la misma canción.
- **Flujo:** dos clips seguidos de la misma canción, el segundo más allá de la duración del archivo: `applyClip` devuelve false, el aviso se pisa, `applied` ya vale `leadKey` y `go` arranca con velocidad, espejo y posición del clip anterior.
- **Evidencia:** por lectura (no pude montar el caso con el archivo de prueba).
- **Arreglo:** guardar el aviso con su índice y descartar solo los de otro índice.
- **Test:** clip fuera de rango consecutivo con la misma canción.

### 12. El fin de clip depende de `requestAnimationFrame` · nota 4
- **Dónde:** `RpdPlayPage.tsx:238-248` sobre `useLoopController` (rAF).
- **Flujo:** portátil en la tele con otra ventana encima, pestaña en segundo plano o salvapantallas: sin rAF el tiempo del store no avanza, el clip no se corta y el audio sigue hasta el final de la canción.
- **Evidencia:** por lectura; no probado.
- **Arreglo:** respaldo con un temporizador calculado `(fin − tiempo)/velocidad`, rearmado al reanudar, que lea `engine.getCurrentTime()`.
- **Test:** unidad del temporizador o e2e con `visibilityState` forzado.

### 13. Modo adivinar: pausar oculta el título ya revelado · nota 4
- **Dónde:** `RpdPlayPage.tsx:344-351` (`titleShown` recibe `state.phase === 'play' && s.playing`).
- **Flujo:** adivinar → a los 4 s sale el título → Pausa → vuelve «¿Qué canción es?» (también al repetir).
- **Evidencia:** por lectura (el intento en navegador no llegó a arrancar la ronda por un fallo de mi guion).
- **Arreglo:** recordar «revelado» por `leadKey` y no volver a ocultar hasta el siguiente clip.
- **Test:** `titleShown` + estado «revelado».

### 14. Reordenar una pista con teclado y lector · nota 4
- **Dónde:** `TrackPage.tsx:424-434` (asa), `:437-454` (Subir/Bajar con `disabled`), `:119-123`.
- **Flujo:** el asa «Arrastrar …» es tabulable y no hace nada con Intro/flechas; al subir un clip al primer puesto «Subir» se deshabilita y el foco cae a `body`; no se anuncia la nueva posición.
- **Evidencia:** foco `BODY` tras Subir al primer puesto; asa con `tabIndex=0`. El arrastre con ratón funciona y el servidor queda en el mismo orden que la pantalla.
- **Arreglo:** asa con `tabIndex={-1}` y `aria-hidden`; `aria-disabled` en lugar de `disabled` (o mover el foco al otro botón); región `aria-live` «Movido a la posición 2 de 5».
- **Test:** e2e: dos pulsaciones de Subir mantienen el foco dentro de la fila.

### 15. «Nueva bolsa» y «Ajustes de la bolsa» abren sin foco en el campo · nota 3
- **Dónde:** `BagSettingsDialog.tsx:155-158` (`formKey` se incrementa al abrir y remonta el formulario justo después del autofoco del `Dialog`).
- **Evidencia:** `activeElement` = `BODY` a 100/400/1000 ms; en «Guardar como pista» y «Añadir a una bolsa» el foco sí cae en el input.
- **Arreglo:** quitar `formKey` (el `Dialog` ya desmonta al cerrar).
- **Test:** e2e: tras abrir, el foco está en «Nombre».

### 16. Textos ambiguos: dos «Quitar de la bolsa» distintos · nota 3
- **Dónde:** `BagPage.tsx:325` (saca el elemento a «Fuera de la bolsa») frente a `:593-594` (la papelera, que lo elimina); también «Sacar a mano» (`:587`) frente a «Sacar».
- **Arreglo:** papelera → «Eliminar de la bolsa» (y su confirmación con ese verbo); «Sacar a mano» → «Apartar»; «Quitar de la bolsa»/«Devolver» solo para el resultado del sorteo, como pide la especificación.
- **Test:** `getByRole` por nombre en e2e.

### 17. Atajos y salida de la ronda · nota 3
- **Dónde:** `RpdPlayPage.tsx:318-330` (`r`/`R` sin mirar `ctrlKey`/`metaKey`: Ctrl+R recarga y además repite), `:360` («Salir» siempre a `/rpd`, sin confirmar), `:56-91` (carga/error sin botón de salida).
- **Arreglo:** ignorar si hay modificadores; «Salir» → `navigate(-1)` con respaldo a `/rpd`; «Salir» también en carga/error.
- **Test:** unidad del manejador de teclas.

### 18. Tamaño de objetivos y regresión de espacio en el estudio · nota 3
- **Dónde:** `RoundOptionsFields.tsx:64-75` (`Segmented size="sm"`, 32 px de alto para 0–5 s); `ClipList.tsx:141` y `VideoCard.tsx:140` (36 px visibles, 44 con el `::before`, igual que sus vecinos).
- **Evidencia:** en el estudio a 390 px el detalle del clip «Final A» queda cortado («0,75× ·…») por el botón nuevo; en la biblioteca móvil la medalla tapa ~40 % de las miniaturas pequeñas.
- **Arreglo:** pausa con `min-h-11`; en `ClipList` permitir que el detalle pase a dos líneas.
- **Test:** captura visual a 390 px.

### 19. «Sacar» se desplaza al revelar · nota 3
- **Dónde:** `BagPage.tsx:271-342` (el bloque de acciones entra con retraso de 0,7 s y empuja el botón).
- **Flujo:** tras el primer resultado «Sacar» baja ~190 px (a 390×800 queda fuera de pantalla, y=880); un toque rápido para repetir puede caer en «Quitar de la bolsa».
- **Arreglo:** reservar la altura del bloque o poner «Sacar» antes de las acciones.
- **Test:** captura antes/después con posición estable.

### 20. Detalles menores · nota 2
- `RoundStage` usa un spring propio (`RpdPlayPage.tsx:522`) en vez de un preset de `lib/motion.ts` y no respeta `prefers-reduced-motion`; sombras con `rgb(243 236 223/…)` y `rgb(228 200 143/…)` literales (`RandomPlayScreen.tsx:102,133,151`, `BagsPage.tsx:110`) en vez de los tokens `--color-line` y `--color-rule`.
- Marquesina usa `h2` para el título y Kamishibai/Taiko `p`; `TrackPage` no tiene `h1`.
- Opciones de pista sin actualización optimista y con `setQueryData(respuesta)`: dos cambios rápidos pueden mostrar el valor viejo si las respuestas llegan cruzadas (`data/tracks.ts:69-78`). La pausa de 0,5 s (admitida por `clampPause`) se muestra redondeada.
- Desde el estudio no hay «Añadir a una bolsa» para la canción entera (solo clips): la especificación lo cita en biblioteca, estudio y clip.
- `AddToBagDialog` carga los elementos de todas las bolsas del tipo, con joins completos, solo para saber si ya está dentro.
- En tele la pantalla usa solo 40–57 % del ancho (el contenedor se limita para que todo quepa en alto): legible, pero se podría aprovechar más a 1920×1080.

## No verificado
- YouTube real: sin GPU el iframe sale en negro; no he podido comprobar si YouTube pinta su título o anuncios sobre el marco ni la precarga. Un clip de YouTube sí avanza, se corta a tiempo y encadena con uno de archivo.
- Autoplay en Safari/iOS al cambiar de canción, arrastre táctil real, modo adivinar con pausa en navegador (hallazgo 13 solo por código), Supabase real (no se ha tocado).
