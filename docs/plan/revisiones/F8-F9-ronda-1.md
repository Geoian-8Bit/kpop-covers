# F8 · Clips dentro de las tomas y F9 · Zoom sobre el vídeo · Ronda 1

Revisión de solo lectura de cambios sin commit. No se ha editado nada del repo salvo este informe; no se ha tocado Supabase real ni Vercel.
Alcance: `player/zoom.ts` (+ test), `player/ZoomLayer.tsx`, `features/studio/ZoomControls.tsx`, `player/store.ts`, `StudioPage.tsx`
(gestos sobre `FileStage` y fila de zoom), `SaveClipDialog.tsx`, `ClipList.tsx`, `features/review/*` (`CompareStage`, `ReviewControls`,
`ReviewScreen`), `lib/backend.ts` (demo), migración `20261016060000_clip_zoom.sql` y tipos.

Pruebas propias en el scratchpad `f89r1/` (Playwright con Chromium y `--mute-audio`, demo silenciado en `localhost:5174`, sin tocar
`oneshoot.dev.sound`; CDP para táctil; PGlite para la migración). `pnpm typecheck` y `pnpm test` pasan (230 + 111 tests; 18 de `zoom.test.ts`).

La «nota» de cada hallazgo es su **gravedad** (10 = muy grave). 🔴 = bloquea. **Ningún hallazgo bloquea.**

## Resumen

Muy buen trabajo de base. La matemática del zoom es correcta donde importa: la he comprobado con el navegador, no solo con los tests.

- **Coordenadas con espejo y `object-fit`**: con la rueda sobre un punto, el punto del fotograma que había bajo el cursor sigue bajo el cursor
  (error < 0,002 del fotograma) en el panel de la toma (vertical 144×256 en un panel 464×601), en el original (apaisado en panel vertical),
  con la toma en espejo, con el original en espejo, y en «Superpuesto» con los dos ampliados y la toma en espejo. En el estudio con espejo
  puesto, `translateX(82,12px)` coincide con el cálculo a mano.
- **Gestos táctiles (CDP, 420×860)**: pellizco horizontal, diagonal y vertical amplían (el `touch-pan-y` no los cancela); con la imagen entera
  el arrastre vertical con un dedo desplaza la página; con zoom (`touch-none`) arrastra la imagen y la página no se mueve; doble toque con zoom
  vuelve al vídeo completo sin pausar ni reproducir; con ratón, doble clic con zoom vuelve al completo y no entra en pantalla completa
  (tampoco dentro de ella); sin zoom, doble clic sigue entrando y saliendo.
- **Guardado con el clip**: abrir `?clip=` con zoom abre ampliado (con espejo, en el sitio correcto); pulsar un clip sin zoom vuelve al completo;
  «Guardar con «Pies»» y «Quitar el zoom del clip» escriben las columnas (3,37 / 0,1793 / 0,7791 y vuelta a 1 / 0,5 / 0,5); «Nuevo clip»
  ofrece «Guardar con el zoom (135 %)» y la tecla `s` lo abre.
- **F8, «Guardar como clip» desde el repaso**: con `songStart` 5, velocidad 0,75, ajuste fino +0,20 s y A–B en 2,0–6,0 s de la toma, el
  diálogo propone 0:06.7 → 0:09.7 (5 + 1,5 + 0,2 y 5 + 4,5 + 0,2), 0,75× y Espejo (la toma estaba en espejo). Se guarda en la BD demo con
  esos valores y el zoom del original (1,65 / 0,4847 / 0,4103). Escape y «atrás» cierran solo el diálogo; escribir `a b + - 0` en el nombre
  no marca ni reproduce; tras guardar desaparece el botón (el repaso marca el clip como activo); marcar A o B otra vez lo recupera.
- **Migración** (PGlite, rol `anon`): defaults 1 / 0,5 / 0,5; `update` de las tres columnas permitido; 4,01, 0,99, `x` 1,0001 e `y` −0,1 dan
  `clips_zoom_range`; 3,999 redondea a 4,00; el `insert` con las columnas funciona; el resto de columnas se siguen pudiendo actualizar.
  Aditiva y compatible con el cliente antiguo (solo escribe zoom cuando hay zoom). Hay que aplicarla antes de desplegar: guardar un clip
  ampliado sin las columnas daría error.
- **Regresiones del estudio**: espacio, flechas, `f`, clic para reproducir (45 ms sin zoom), pantalla completa, A–B y «Nuevo clip» siguen
  funcionando. Con YouTube no se renderiza `ZoomLayer`, no hay oyentes de rueda ni de gestos y el reproductor no se toca. «Superpuesto» no
  existe con original de YouTube (queda deshabilitado), así que el zoom «de los dos» nunca escala el iframe de YouTube.

Lo que conviene arreglar: el coste de render por gesto (H1), la lupa invisible en la lista de clips (H2), el salto de los botones
Ampliar/Reducir (H3) y la espera de 300 ms (H4).

---

## H1 · Cada paso de un gesto vuelve a pintar toda la página del estudio (y del repaso) · 6/10

- Dónde: `StudioPage.tsx:117` (`const zoom = usePlayer((s) => s.zoom)` en el componente raíz, solo para pasárselo a `SaveClipDialog`) y
  `MediaStage` (`:518`); `ReviewScreen.tsx` (`useReview((s) => s.zoomTake)` y `zoomOriginal` en el raíz).
- Flujo: arrastrar o pellizcar con zoom → `setZoom` por cada `pointermove` (60 Hz) → la suscripción del raíz re-renderiza `StudioPage` entero.
- Evidencia: con un gancho de React DevTools inyectado, 30 movimientos de arrastre = 28 commits; en 27 el componente más alto que cambia es
  `StudioPage` (y debajo `MediaStage`, `PlayButton`, `TimeReadout`, `NoteDots`, `NoteBubble`, `HoverGuide`, `SpeedButton`, `MirrorButton`,
  `ClipList`, `RangeBar`, `VoiceSplitControl`...). Medido con CDP en modo desarrollo: 80 movimientos con zoom = 1027 ms de script (unos 13 ms
  por movimiento) y 189 layouts; los mismos 80 movimientos sin zoom = 28 ms. En producción será menos, pero es un orden de magnitud por
  encima de cualquier otro gesto de la pantalla y justo en móvil.
- Arreglo: que el raíz no lea `zoom`. `SaveClipDialog` ya usa `usePlayer`: que lea `zoom` él mismo (solo cuando `open`) y reciba un booleano
  `canZoom`. `ZoomLayer` puede suscribirse a `zoom` por su cuenta (recibiendo `canZoom`) para que `MediaStage` no se repinte. Lo mismo en el
  repaso (una capa que lea el store). Opcional: agrupar los `setZoom` de un gesto con `requestAnimationFrame`.
- Test: contador de renders del raíz durante un arrastre o, como mínimo, comprobación con el Profiler de React: un arrastre no debe tocar
  `ClipList`, `PlayerBar` ni `NoteDots`.

## H2 · La lupa del clip ampliado no se ve en la lista de clips · 5/10

- Dónde: `ClipList.tsx:127` (`<ZoomIn className="size-3 ..." aria-label=...>`), dentro de un `span` `min-w-0` con `flex` y `whitespace-nowrap`.
- Flujo: guardar un clip con zoom → mirar la lista de clips para saber cuáles se abren ampliados.
- Evidencia: con un clip «Pies» (0:02–0:06 · 0,75× · espejo · 250 %), a 1280 px y a 390 px los `svg` `espejo` y `ampliado 250 %` miden
  0 px de ancho y quedan fuera del botón (el flex los encoge a 0). El icono de espejo ya tenía ese defecto; con el de la lupa, el único
  indicador de F9 en la lista no se ve nunca.
- Arreglo: `shrink-0` en los iconos y dejar que la línea de metadatos ocupe lo que necesite (o `flex-wrap`), o sacar los iconos del `span`
  que se encoge.
- Test: captura a 390 px y a 1280 px con un clip espejado y ampliado; ambos iconos deben medir 12 × 12.

## H3 · «Ampliar» y «Reducir» mueven la vista cuando la imagen no es 16:9 · 4/10

- Dónde: `ZoomControls.tsx:45,60-61` (`STAGE` 1600×900 y `media = null`) y `ReviewControls.tsx:272,278` (`STEP_BOX`, igual). `stepZoom`
  hace `zoomInBox` y `zoomFromBox` con esa caja y sin el tamaño del vídeo, así que interpreta `x` e `y` (fracciones del fotograma) como
  fracciones de la caja y los recorta con el límite de la caja, no con el de la imagen.
- Flujo: vídeo vertical (lo normal en un baile grabado con el móvil) → ampliar y arrastrar hacia un borde → pulsar «Ampliar el centro».
- Evidencia: `zoom.ts` ejecutado con Node: vídeo 1080×1920 en un panel 640×360, zoom 2 con `x = 0,1`; «Ampliar» ×1,5 deja `x = 0,25`
  (lo correcto, con la caja y el vídeo reales, es `0,1`). En el navegador (estudio con el vídeo vertical, dos pulsaciones de «Ampliar»,
  arrastre de 150 px y otra pulsación): el centro de la vista salta unos 15 px de la caja (unos 50 px de pantalla). Con 16:9 sobre 16:9 y
  con la vista cerca del centro no se nota, por eso los tests no lo ven.
- Arreglo: lo más simple y sin caja: `stepZoom` conserva `x` e `y` y solo cambia `scale` (`zoomInBox` ya recorta al pintar). O pasar la caja y
  el `media` reales (`useMediaBox`) a los botones.
- Test: en `zoom.test.ts`, `stepZoom` con `media` vertical y `x = 0,1`: tras ×1,5 debe seguir en `0,1`; y ida y vuelta
  (`stepZoom(stepZoom(z, 1.5), 1/1.5)` ≈ `z`).

## H4 · Con zoom, reproducir o pausar con un toque tarda 300 ms · 4/10

- Dónde: `StudioPage.tsx` `onStageClick` (rama «Zoomed in», `setTimeout(..., 300)`) y `CompareStage.tsx` `tap` (`tapTimer`, 300 ms).
- Flujo: ampliar un paso rápido para ver los pies y pulsar para pausar justo en el fotograma.
- Evidencia: estudio con ratón, clic con zoom: 358 y 434 ms hasta que cambia `paused` (45 ms sin zoom). Táctil (CDP): 425 ms con zoom frente
  a 114 ms sin zoom. Solo afecta con zoom; el doble toque se detecta bien (300 ms, 30 px) y no reproduce ni pausa.
  Efectos colaterales: en pantalla completa táctil con zoom desaparece el doble toque lateral de ±5 s (el doble toque es «ver entero»); y
  un toque en un panel ampliado seguido en menos de 300 ms de otro toque en el otro panel pierde la primera pausa (`clearTimeout` global).
- Arreglo: aceptable si es una decisión de diseño, pero que sea consciente. Alternativas: alternar al instante y, si llega el segundo toque,
  deshacerlo y mostrar entero (un parpadeo de sonido, pero sin latencia); o dejar el doble toque solo para «ver entero» cuando se pida (el
  botón del distintivo ya existe). Si se mantiene, bajar a unos 250 ms.
- Test: la medición de latencia con zoom, como umbral (menos de 350 ms) para que no empeore.

## H5 · Sin teclado no se puede mover el zoom en el estudio ni en el repaso apilado · 4/10

- Dónde: `ZoomControls.tsx` (solo ampliar, reducir y ver completo al centro); `CompareStage.tsx` `onKeyDown` solo en «Superpuesto»; `keyZoom`
  (flechas, `+`, `-`, `0`) no se usa en el estudio, donde las flechas son atajos de salto y velocidad (`useShortcuts.ts`).
- Flujo: persona que no usa ratón ni pantalla táctil, o con lector de pantalla: amplía con el botón pero no puede llevar la vista a los pies.
- Evidencia: lectura del código; el zoom pide pellizco, arrastre o rueda sin alternativa de un solo puntero o teclado para mover (criterio
  2.5.1 de WCAG 2.1).
- Arreglo: un grupo «Mover» (cuatro botones de 44 px como mínimo) o flechas cuando el foco esté dentro de un contenedor de zoom (con
  `role="group"` y excluido de `useShortcuts`, como ya se hace con los `slider`). En el repaso, extender el `onKeyDown` a los paneles
  apilados (`keyZoom` sobre el panel con foco).
- Test: con el foco en el grupo, `ArrowRight` cambia `x`; con el foco en el escenario sigue saltando 5 s.

## H6 · La rueda sin modificador roba el scroll de la página · 3/10

- Dónde: `StudioPage.tsx`, oyente `wheel` no pasivo: con la imagen entera, `deltaY < 0` hace zoom; con zoom, toda la rueda.
- Flujo: página con scroll y el cursor sobre el vídeo: subir con la rueda amplía en vez de subir; con zoom no se puede bajar la página con el
  cursor encima. En el repaso la página está bloqueada y no importa (allí `preventDefault` es incondicional).
- Evidencia: tres pasos de rueda hacia arriba sobre el vídeo = 337 %; la página no se movió.
- Arreglo: pedir `Ctrl` o `Alt` para el zoom en el estudio, o capturar solo con el zoom ya activo y dejar pasar el resto. El pellizco del
  trackpad (`ctrlKey`) llega como rueda y no se vería afectado.
- Test: manual con ratón y con trackpad.

## H7 · La capa de zoom «patina» al cambiar el tamaño de la caja (por lectura de código) · 3/10

- Dónde: `ZoomLayer.tsx` (la transición es instantánea solo si `live`, si no usa el muelle `soft`), con la caja medida por `ResizeObserver`
  en `useMediaBox`.
- Flujo: entrar o salir de pantalla completa, girar el móvil, arrastrar el «Reparto» del repaso apilado, o cambiar el espejo en
  «Superpuesto» con el zoom ya puesto.
- Evidencia: al cambiar `box`, `x` e `y` se recalculan con `live = false`, así que la capa persigue la nueva caja con el muelle `soft`
  mientras el vídeo ya está en su sitio: unos cientos de ms con la zona equivocada. En «Superpuesto», el espejo de la toma (`jelly`) y el
  cambio de `x` del zoom (`soft`) no van sincronizados. No lo he filmado; los valores finales son correctos (en pantalla completa
  `82,16 / 47,52` para el mismo zoom) y sale de leer las transiciones.
- Arreglo: tratar como `live` también el cambio de `box` o `media` (comparar con el valor anterior en un `ref`) y dejar el muelle solo para
  «ver entero» y «abrir clip».
- Test: manual al pulsar `f` con zoom.

## H8 · Repaso: el zoom de un clip no se aplica (ni se avisa) en «Superpuesto» ni con original de YouTube · 3/10

- Dónde: `ReviewControls.tsx` hacia la línea 558 (el `onClick` del clip solo llama a `setZoom` del original si `canZoomOriginal` y el modo es apilado).
- Flujo: clip guardado ampliado → abrirlo desde «Tramos de la canción en esta toma» en «Superpuesto», o en un repaso con original de YouTube.
- Evidencia: lectura del código. En «Superpuesto» no pasa nada y al volver a «Apilado» el original conserva un zoom antiguo (`zoomOriginal`
  no se ha tocado). Con YouTube no hay el aviso que el estudio sí da («se guardó ampliado: se ve así con el archivo»).
- Arreglo: aplicar siempre el zoom del clip a `zoomOriginal` si hay archivo (se verá al pasar a «Apilado») y, con YouTube, el mismo aviso del
  estudio. En «Guardar como clip» (`ReviewScreen.tsx`, prop `zoom` del diálogo, solo en modo apilado) conviene ofrecer también el zoom del
  original en «Superpuesto», o explicar por qué no se ofrece.
- Test: abrir un clip ampliado en cada modo y comprobar `zoomOriginal`.

## H9 · «Guardar como clip» no deja crear el mismo tramo con otro zoom · 3/10

- Dónde: `SaveClipDialog.tsx` `duplicate` (compara rango, velocidad y espejo, no el zoom) y `data/clips.ts` `NewClip` (sin `zoom_*`).
- Flujo: ya existe «Pies» 6,7–9,7 sin zoom; en el repaso se marca el mismo tramo, se amplía y se intenta guardar con zoom: «Ya tienes este
  tramo guardado» y el botón no deja. Hay que ir al estudio y usar «Guardar con «Pies»».
- Evidencia: lectura del código. Además `NewClip` no declara las columnas de zoom: compila porque van en un `...spread` (no pasa el control de
  propiedades sobrantes); conviene tiparlas para que un cambio de nombre no pase en silencio.
- Arreglo: considerar duplicado solo si el zoom también coincide (`sameZoom`) y, si el duplicado no tiene zoom y el nuevo sí, ofrecer
  «Añadir el zoom a «Pies»». Añadir `zoom_scale?`, `zoom_x?` y `zoom_y?` a `NewClip`.
- Test: `duplicate` con zoom distinto no bloquea.

## H10 · «Superpuesto»: el botón «Ampliar / Encajar» mezcla `aria-pressed` con un nombre que cambia · 3/10

- Dónde: `CompareStage.tsx` (`aria-pressed`, `aria-label` que cambia y texto visible que nombra el modo, no la acción).
- Flujo: lector de pantalla: «Los gestos amplían los dos. Pulsa para que encajen el original, botón de alternar, pulsado». Dos señales
  que se contradicen. A la vista, «Ampliar» sobre fondo claro se lee como acción («púlsame para ampliar»), no como estado.
- Arreglo: un nombre fijo («Gestos con los dedos») con `aria-pressed`, o dos botones de un grupo de radio («Encajar» y «Ampliar los dos»).

## H11 · Detalles menores · 2/10 cada uno

- `ZoomControls.tsx`: con el archivo ausente (`file.status` en estado de ausente) `ready` es falso y la fila dice «Cargando el vídeo...» para
  siempre. Con YouTube la fila (con tres botones deshabilitados) sale en todas las canciones aunque no se pueda usar: se podría plegar a una
  línea. El `aria-live="polite"` del porcentaje anuncia cada paso de un pellizco; mejor anunciar al soltar.
- «Quitar el zoom del clip» escribe en la BD y además vuelve a «ver entero» sin confirmación ni deshacer.
- `openSaveRange` no recorta el final a `duration_seconds` de la canción (con ajuste fino de +0,3 s puede pasarse unas décimas); `applyClip` lo
  normaliza al abrir, así que no rompe, pero el clip queda con un final «imposible».
- Tras un arrastre o pellizco se tragan los clics 400 ms (`swallowClickUntil`): con ratón es correcto; en táctil no hay `click` tras un
  arrastre, así que un toque legítimo justo después se pierde.

## H12 · Pruebas que faltan · 3/10

- `zoom.test.ts` (18 tests, en verde) casi no usa `media` con barras laterales en los gestos y `stepZoom` solo se prueba con `media = null`:
  por eso H3 pasa. Añadir: `stepZoom` y `keyZoom` con `media` vertical; `gestureZoom` con `media` y espejo (el punto bajo el dedo no se
  mueve); `clampZoom` con `scale` 1,005 exacto.
- No hay prueba SQL de `clips_zoom_range` en `supabase/tests/` (la comprobé a mano con PGlite y sale bien). Añadir cuatro casos (4,01, 0,99,
  `zoom_x` 1,0001, `zoom_y` −0,1) y el `insert` con zoom como `anon`.
- Falta probar en un móvil real el pellizco vertical con `touch-pan-y` (Chromium emulado lo acepta; en Android el primer movimiento vertical
  de dos dedos podría arrancar el scroll y cancelar el puntero). Tampoco he podido probar el repaso con original de YouTube real: la
  apertura se quedó esperando en el demo, y el aviso de «El original es de YouTube...» al intentar ampliar está comprobado solo por lectura.

## Lo que está bien y conviene no tocar

- `touch-pan-y` con la imagen entera y `touch-none` solo con zoom: deja scrollear la página y no «roba» el gesto.
- El zoom vive dentro del espejo y los dedos se des-espejan (`unmirror`); en «Superpuesto» se aplica fuera con `mirrorZoom`: coherente.
- Guardar en fracciones del fotograma (no en píxeles) hace que el clip se abra igual en el estudio 16:9 y en un panel del repaso.
- `clampZoom` redondea a la precisión de la BD (2 y 4 decimales) y la migración la acepta (`numeric(4,2)` y `numeric(5,4)`).
- Solo se escribe zoom cuando hay zoom: un cliente antiguo y una BD sin migrar siguen guardando clips normales.
- Objetivos de 44 px o más (botones del estudio y del repaso medidos a 44 × 44; «Ver completo» 155 × 44), colores por tokens, presets
  `jelly` y `soft`, textos en español.
