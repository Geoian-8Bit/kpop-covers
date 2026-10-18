# Ronda 2 · Estudio · revisión 1 (puntos 44, 45, 46 en pantalla completa y 47)

Revisión de solo lectura sobre la copia de trabajo sin commit (rama `feat/plan-completo`). No se ha tocado código,
Supabase real, Vercel ni el navegador.

## Alcance

- 44 · Zoom solo con los dedos: `features/studio/ZoomControls.tsx`, `StudioPage.tsx` (fila y flechas de pantalla completa).
- 45 · Quitar «Seguir a un bailarín» y la prueba de postura: `features/follow/**`, `features/pose/**`, `data/follow.ts`
  (borrados), `player/store.ts`, `SaveClipDialog.tsx`, `ZoomControls.tsx`, bloque F10 de `lib/backend.ts`,
  `packages/shared/src/domain.ts`, `SettingsPage.tsx`, `PrivacyPage.tsx`, `vite.config.ts`, `apps/web/package.json`,
  `pnpm-lock.yaml`, `apps/web/vercel.json` (CSP), `lib/retiredData.ts` y su llamada en `main.tsx`.
- 46 · «Todo / Sin voz / Voz» en pantalla completa: `FsVoiceButton.tsx`, `fsVoiceRules.ts`, `useVoiceSplit.ts`,
  `VoiceRow` y `FsTopBar` en `StudioPage.tsx`, con `fullscreenChrome.ts`, `useBackToClose.ts`, `useShortcuts.ts` y
  `VoiceSplitControl`/`VoiceOnda`/`controlParts` para medir el panel.
- 47 · Salir de pantalla completa tras girar el móvil: `lib/viewport.ts`, `lib/viewportRules.ts`, `index.css`
  (`#root { overflow-x: clip }`), `useFullscreen` en `StudioPage.tsx`.
- Dato añadido por el responsable: la pantalla completa se usa **con el móvil en horizontal**. El panel de voz y el
  punto 47 se han revisado sobre todo a 844×390 y 667×375 (iPhone SE) en horizontal.

## Qué he ejecutado y resultado

- `pnpm typecheck`: correcto (shared y web).
- `pnpm test`: correcto. shared 7 ficheros / 139 tests; web 53 ficheros / 695 tests.
- `tsc --noEmit --noUnusedLocals` en `apps/web`: ningún import ni variable sin uso en los archivos de esta zona.
- `pnpm db:test` (PGlite local): 23/23 migraciones, 12/12 ficheros, 129 PASS (incluido `plan_f10_checks.sql`: la tabla
  `follow_paths` y `clips.follow_path_id` siguen y se comportan igual).
- Búsqueda de restos de follow/pose: `grep -ri "follow|pose|seguir|tfjs|mediapipe|tensorflow|movenet|bailarín"` en
  `apps/web/src`, `apps/web/*.ts|json|html`, `apps/web/e2e` (no hay carpeta `e2e` en la raíz) y `apps/web/public`.
  No queda código, imports, rutas, chunks, alias, reglas de caché ni dependencias (`node_modules/@tensorflow` ya no
  existe; el lockfile pierde 279 líneas; `long@5.3.2` sigue porque lo usa otra dependencia). Solo quedan tres
  comentarios viejos (H5). `database.types.ts` mantiene `follow_paths` y `clips.follow_path_id`, que es correcto: siguen
  en la BD.

## Comprobaciones que salen bien

- **Clips guardados con `follow_path_id`.** `setActiveClip` ya no lee la columna y `ClipSettings` no la incluye: el clip
  se abre con su tramo, velocidad, espejo y zoom. Un clip guardado «siguiendo a X» no tenía zoom fijo (antes eran
  excluyentes), así que ahora se abre sin ampliar, que es lo esperable. Guardar un clip (`SaveClipDialog`) y guardar o
  quitar el zoom (`ZoomRow`) ya no escriben `follow_path_id`. Un insert que no la nombra la deja en `null` (valor por
  defecto). El trigger `clips_zz_follow` sigue disparando en cada insert, pero con `null` no hace nada, y en update solo
  salta con `update of follow_path_id`, que el cliente ya no envía. La demo copia `...row` y no necesita la columna (el
  tipo pasa). Nadie más lee la columna (`grep follow_path` en `src`: 0).
- **Datos que quedaban en el dispositivo.** `forgetRetiredData` borra la caché `pose-models` y las dos claves que usaba
  el código borrado (`oneshoot.pose.bench` y `oneshoot.poseLab.results`; comprobado con `git show HEAD:`). El código
  borrado no usaba IndexedDB. Se llama 4 s después de `load`, no lanza errores y aguanta que no exista Cache API.
- **CSP.** Solo salen jsDelivr/MediaPipe, tfhub, Kaggle y `storage.googleapis.com/mediapipe-models`. Siguen permitidos
  YouTube (`script-src` www.youtube.com y s.ytimg.com; `frame-src` youtube y youtube-nocookie; `img-src` i.ytimg.com),
  Supabase (https y wss; los vídeos firmados en `media-src`), los modelos HTDemucs (`huggingface.co/...` y `*.hf.co`
  para la redirección a los servidores de descarga) y `'wasm-unsafe-eval'`, que sigue haciendo falta para
  onnxruntime. Su `.wasm` sale del mismo origen (`wasmPaths`, `proxy = false`), así que entra en `'self'`.
- **`#root { overflow-x: clip }`.** `clip` no crea contenedor de scroll, así que la barra `sticky top-16` del estudio y el
  resto de barras pegajosas siguen igual. Las capas `fixed` (pantalla completa CSS `[data-fs]`, `Dialog`, que va por
  portal a `body` o a `[data-fs]` según `overlayHost`, toasts, grabador y repaso, también en portal a `body`) no tienen
  como bloque contenedor `#root`, así que no se recortan. `overflow-y` sigue `visible`. `clip` no crea contexto de
  formato de bloque, así que no cambia el colapso de márgenes. El razonamiento del arreglo es correcto: el `clip` de
  `body` se propaga al viewport como `hidden`, que se puede desplazar por script o al restaurar la posición. Con el
  recorte en `#root` y los portales en `fixed` (no cuentan para el desbordamiento), el documento ya no es más ancho que
  la pantalla.
- **Reajuste del viewport frente al scroll y el teclado.** `straighten` solo actúa si `scrollX ≥ 0,5`, y lo hace con
  `top: scrollY` y `behavior: 'instant'`; el `resize` va limitado a un `requestAnimationFrame`. `pinnedViewport`
  conserva `interactive-widget=resizes-content`, así que el teclado de Android sigue redimensionando igual.
  `html { touch-action: pan-x pan-y }` ya impedía el pellizco de página, también en iOS, así que el `scrollTo(0)` no
  puede pelear con un usuario ampliando la página. La escala forzada dura 400 ms y vuelve a la meta base, que ya traía
  `maximum-scale=1.0`: no empeora la accesibilidad respecto a antes.
- **Pellizco y fila Zoom.** Los manejadores de gesto (`gestureZoom`, doble toque, rueda, teclas) no cambian.
  `pointer-coarse:` existe en el Tailwind instalado (4.1.13, `@media (pointer: coarse)`), así que la fila y las flechas
  de pantalla completa se ocultan solo cuando el puntero principal es un dedo. Un portátil táctil (puntero fino) las
  sigue viendo.
- **Panel de voz y YouTube.** `fsVoiceButton` devuelve `shown = available`, que es `Boolean(engine.setVoiceMode)`, y el
  motor de YouTube no tiene ese método. Con YouTube en el escenario el botón no existe, así que ni pausa ni tapa el
  reproductor. Con un archivo vinculado a una entrada de YouTube, el botón aparece solo cuando el escenario es el
  archivo.
- **Foco, Esc y atajos del panel.** Al abrir, el foco va al modo elegido (`preventScroll`). Esc en captura de `window`
  cierra solo el panel, antes del Esc de la pantalla completa CSS y del `clearLoop` de los atajos. `aria-modal="true"`
  apaga los atajos del estudio (`useShortcuts` mira `[aria-modal="true"]`). Un toque fuera cierra el panel y se traga
  su `click`, de modo que no se pausa el vídeo, porque el escenario usa `onClick`. Mientras está abierto, `setMenu`
  mantiene visibles los controles. El nombre «Voz y música: Sin voz» contiene el texto visible (2.5.3). Los colores
  van por tokens y la animación por `jelly`/`snappy`.
- **Panel en horizontal (844×390 y 667×375).** En horizontal el iPhone no tiene zona segura arriba. El panel empieza a
  60 px (12 + 48) contando desde la barra superior, justo bajo el botón (12–56 px). Su alto natural es unos 186 px
  (relleno 24, cabecera 36, 8, pozo 12, ola 56, 6 y sellos 44) y unos 234 px cuando sale la nota de mono (dos líneas
  en 316 px). Su `max-h` es 390 − 60 − 21 = 309 px en el 844×390 y 375 − 60 − 12 = 303 px en el SE: cabe sin scroll en
  los dos. El ancho es min(340, 100 % − 24), anclado a `max(12px, safe-right)`: con la muesca a la derecha (unos
  47 px) queda dentro y no se sale por ningún lado. Ver H3 sobre cuánto vídeo tapa.
- **Caso del bug 47 en horizontal.** Android (pantalla completa nativa con `lock('landscape')`): al girar a vertical
  dentro, la pantalla sigue en horizontal; al salir, `unlock` y el giro llega después. Lo cubren el `fullscreenchange`
  (que llama a `refit`), el `straighten` a los 400 y 900 ms, el evento `change` de orientación cuando por fin gira y
  el `straightenSoon` de cada `resize`. iPhone (pantalla completa CSS, sin bloqueo): el giro dentro dispara `refit`, y
  la salida no la anuncia el navegador, pero la limpieza del efecto `css` llama a `refitViewport()`. Las dos vías están
  cubiertas por código; **no se ha podido comprobar en un móvil** (los tests solo prueban `pinnedViewport` y
  `strayScrollX`).

## Hallazgos

### H1 · En el móvil ya no se puede guardar ni quitar el zoom de un clip existente · 6/10

- Dónde: `apps/web/src/features/studio/ZoomControls.tsx:111` (`ZOOM_UI_TOUCH_HIDDEN` en toda la fila), con
  `ZoomControls.tsx:142-159` y `:197-201`.
- Qué pasa: al ocultar la fila entera en táctil desaparecen también «Guardar con «clip»», «Quitar el zoom del clip» y
  el aviso ««X» se guardó ampliado: se ve así con el archivo». No hay otra vía: `EditClipDialog`
  (`SaveClipDialog.tsx:428`) no tiene nada de zoom, y el zoom solo se ofrece al **crear** un clip.
- Escenario: en el móvil (90–95 % del uso), un clip guardado ampliado se abre siempre ampliado. Pellizcar y doble toque
  solo cambian la vista del momento; no hay forma de que el clip deje de abrirse ampliado ni de guardar el encuadre
  nuevo. Hay que borrarlo y crearlo otra vez, o ir a un ordenador. Antes funcionaba, y el responsable no lo ha
  comentado, así que entra en «lo que está bien».
- Arreglo: ocultar en `pointer-coarse` solo lo que pidió el responsable (título «Zoom», «Ampliar», cifra, «Ver
  completo», flechas y textos de ayuda) y dejar en táctil una línea compacta, solo cuando hay algo que hacer con el clip
  (`clip && ((zoomed && !saved) || clipHasZoom(clip))`), con «Guardar el zoom en «X»» y «Quitar el zoom del clip».
  Otra opción, más limpia para «sin fila»: pasar esas dos acciones a `EditClipDialog` («Zoom del clip: guardar el
  actual · quitar»).

### H2 · La trampa de foco del panel cuenta los modos con `tabindex=-1` y deja escapar Tab · 3/10

- Dónde: `apps/web/src/features/studio/FsVoiceButton.tsx:13` (`FOCUSABLE = 'button:not([disabled]), …'`) y `:80-94`.
- Qué pasa: los sellos son `button` con tabulación itinerante (`tabIndex -1` en los no elegidos,
  `controlParts.tsx:61`), pero el selector los incluye. Con «Todo» elegido, `last` es «Voz» (`-1`). Tab desde «Todo» no
  es `last`, así que el navegador saca el foco del panel «modal» a la barra inferior (reproducir, velocidad…), y solo el
  siguiente Tab lo devuelve. Shift+Tab desde «Cerrar» lleva el foco a «Voz», un modo no elegido, contra el patrón de
  radio.
- Arreglo: filtrar `nodes` con `el.tabIndex >= 0`, o usar el selector
  `button:not([disabled]):not([tabindex="-1"]), [href], [tabindex]:not([tabindex="-1"])`.

### H3 · En horizontal el panel tapa media altura del vídeo por la derecha · 3/10

- Dónde: `FsVoiceButton.tsx:139-158` (panel con `VoiceSplitControl compact`, que incluye la ola de 56 px).
- Qué pasa: cabe (ver «Comprobaciones»), pero en 844×390 ocupa 340×186 px (234 con la nota de mono) arriba a la
  derecha, es decir, del 48 % al 60 % del alto del vídeo. En el SE (667×375), con la nota de mono, su borde inferior
  (unos 294 px) llega a la línea de progreso de la barra inferior (unos 293–325 px). Como el vídeo sigue sonando y
  bailando mientras se elige, el bailarín de la derecha queda tapado.
- Arreglo: en pantalla completa, una variante sin la ola (solo cabecera y los tres sellos, unos 100 px), o la nota de
  mono como una línea corta, o, en `landscape` con poca altura, un panel horizontal más bajo.

### H4 · El panel se vuelve a abrir solo si el archivo deja de estar disponible y vuelve · 2/10

- Dónde: `FsVoiceButton.tsx:23-29` y `:105`.
- Qué pasa: si `available` pasa a `false` con el panel abierto (error del archivo, recarga del motor), el componente
  devuelve `null` pero `open` sigue en `true`. Cuando el motor vuelve, el panel reaparece sin que nadie lo pida y con
  una entrada nueva en el historial.
- Arreglo: `useEffect(() => { if (!view.shown) setOpen(false); }, [view.shown]);`.

### H5 · Restos de follow en comentarios y documentos · 2/10

- `apps/web/src/features/record/RecordStudio.tsx:1819` («…speed, mirror, zoom and follow»),
  `features/record/startRules.ts:72` (igual) y `features/voice/separate/runSeparation.ts:310` («F10 · 15 · … the follow
  analysis waits for it»).
- `docs/plan/ESTADO-IMPLEMENTACION.md:15` sigue dando F10 por «Hechas y desplegadas», y las pruebas manuales 30, 31 y 42
  (líneas 145–154 y 228–230) describen la fila, la pantalla completa y la prueba de postura que ya no existen.
- `PrivacyPage.tsx`: con razón ya no habla de los modelos, pero los «recorridos» ya guardados (nombre y posiciones)
  siguen en `follow_paths` sin uso. Conviene una frase: «los recorridos que se guardaron con la antigua función siguen
  en el grupo, sin uso».
- Arreglo: actualizar los tres comentarios, marcar F10 como retirada en ESTADO (punto 45) y quitar o tachar esas
  pruebas.

### H6 · La salida de pantalla completa al desmontar puede no soltar el giro · 2/10

- Dónde: `StudioPage.tsx:1197-1208`.
- Qué pasa: al quitar del DOM el elemento a pantalla completa, el navegador lo saca de la capa superior. Para cuando
  corre la limpieza, `document.fullscreenElement` puede ya no ser `el`, y entonces no se llama a
  `screen.orientation.unlock()`. El `onChange` que lo hacía ya se quitó en la limpieza del otro efecto. Chrome suele
  soltar el bloqueo al salir de pantalla completa, así que el riesgo es bajo.
- Arreglo: llamar a `unlock()` siempre en la limpieza, y `exitFullscreen()` solo si `document.fullscreenElement`
  existe.

### H7 · «Atrás» en la pantalla completa nativa de Android probablemente cierra la pantalla completa, no el panel · 2/10

- Dónde: comentario y `useBackToClose` en `FsVoiceButton.tsx:44-45`.
- Qué pasa: en pantalla completa nativa, Chrome Android usa el gesto Atrás para salir de ella antes de dar un
  `popstate`. El panel se desmonta (la entrada del historial se limpia bien en `useBackToClose`), pero el usuario sale
  de la pantalla completa en vez de cerrar solo el panel. Pasa lo mismo con el menú de velocidad. A comprobar en el
  móvil; si se confirma, corregir el comentario (no se puede evitar).

### H8 · En táctil, ampliar exige pellizco (sin alternativa de un dedo) · 2/10

- Dónde: `ZoomControls.tsx:42`, `:111` y `:258`.
- Qué pasa: es lo que pidió el responsable (punto 44), pero deja de cumplirse WCAG 2.5.1 en táctil («Ampliar» era la
  alternativa de un solo dedo) y 2.5.7 (las flechas). Quedan el doble toque para volver y las teclas.
- Arreglo: ninguno en código; apuntarlo como decisión en ESTADO (apartado de accesibilidad) para que no lo «arregle» un
  revisor futuro.

## Resumen de notas ≥ 3

| Nota | Dónde | Qué |
| --- | --- | --- |
| 6 | `features/studio/ZoomControls.tsx:111` | En táctil desaparecen «Guardar con el clip» y «Quitar el zoom del clip»: no hay otra forma de cambiar el zoom de un clip en el móvil |
| 3 | `features/studio/FsVoiceButton.tsx:13`, `:80-94` | La trampa de foco cuenta los modos con `tabindex=-1`: Tab se escapa del panel |
| 3 | `features/studio/FsVoiceButton.tsx:139-158` | En horizontal el panel (186–234 px de alto) tapa media altura del vídeo por la derecha; en el SE con la nota de mono roza la línea de progreso |
