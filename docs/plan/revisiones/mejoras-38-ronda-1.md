# Revisión · Mejora 38 (la biblioteca se sale del marco) · ronda 1

## Alcance

Revisión de solo lectura del arreglo del punto 38 de `docs/plan/MEJORAS-PRUEBA-MANUAL.md`:

- `apps/web/src/index.css`: regla global `:where(.grid:not(.grid-flow-col)) { grid-template-columns: minmax(0, 1fr); }` dentro de `@layer base`.
- `apps/web/src/features/library/LibraryPage.tsx`: `grid-cols-1` en las dos rejillas, `overflow-x-clip` en la hoja, esqueleto del acceso rápido con `overflow-hidden` y `shrink-0`, estado `filtering`.
- `apps/web/src/features/library/VideoCard.tsx`: `min-w-0` en la tarjeta, pie con `flex-wrap`, `layout` solo cuando `animateLayout`.
- `apps/web/src/features/library/libraryLayout.test.ts` (nuevo).

AddVideoDialog.tsx no entra (es de otro bloque). No he arrancado servidor ni navegador: las medidas en píxeles son cálculos
a partir de las clases y de la fuente (Zen Kaku Gothic New), y hay que comprobarlas en un móvil.

## Diagnóstico: confirmado

La causa que se dio es correcta. Antes, el `<p>` del pie llevaba `truncate` (`white-space: nowrap`), así que su
min-content era la línea entera: icono + «ARrC» + chip «con archivo». La fila de la tarjeta suma unos 144 (miniatura) + 12 +
esa línea + 12 + el contador de clips, unos 360 px, y la hoja a 390 px solo deja unos 328. Una rejilla sin plantilla tiene
una columna implícita `auto`, que no puede quedar por debajo del min-content de sus elementos (`min-width: auto`). Por eso
crecía y arrastraba a todas las tarjetas, también a la destacada. Con `minmax(0, 1fr)` y `min-w-0`, la columna mide lo que
la hoja y el contenido se adapta dentro.

Otras causas posibles que he revisado:
- **Transform a medias:** la entrada (`fadeUp`) solo mueve en `y`, y el hover solo escala la miniatura dentro de un
  `overflow-hidden`. La única animación que podía dejar las tarjetas desplazadas en horizontal era `layout="position"`, y
  ahora solo funciona después de escribir en el buscador.
- **Imágenes:** van `absolute inset-0` dentro de un `aspect-video`, así que no aportan tamaño propio. Sin riesgo.
- **Textos largos:** el artista ya se recorta bien (`min-w-0` + `truncate`). El título puede tener una palabra larga
  sin cortes (ver hallazgo 4).

## Rejillas del proyecto frente a la regla global (barrido completo)

He buscado `grid` como clase en todo `apps/web/src` (unas 160 apariciones), y además `inline-grid`, `grid-rows`,
`grid-area`, `col-start`, `row-start`, `col-span`, `row-span`, `auto-cols`, `auto-rows`, `grid-template`, `gridAutoFlow`
y `subgrid`, tanto en clases como en estilos en línea.

- **No hay ninguna** rejilla apilada con `[grid-area:1/1]` ni con `col-start-1 row-start-1`. Tampoco hay `grid-rows-*`,
  `auto-cols-*`, `grid-template-areas` ni `subgrid`. Así que no puede aparecer de repente una columna `auto` implícita
  al lado de la nueva `1fr`.
- **`grid-cols-*` / `grid-cols-[...]`** (Transport, SaveClipDialog, PoseLab, MembersUI, ClapArmView, VoiceOnda,
  DesignLabSection…) siguen igual: la utilidad gana, por capa y por especificidad (el `:where` vale 0).
- **`col-span`/`row-span`** (biblioteca, RpdPlayPage:513/519, RoundOptionsFields:91) solo se usan con `sm:`/`xl:`, donde
  ya hay `sm:grid-cols-2`/`xl:grid-cols-4`. `col-span-full` en una sola columna no cambia nada.
- **`inline-grid`** (Avatar.tsx:24, `kbd` en ClipList.tsx:198) no lleva la clase `grid`: no le afecta. Lo mismo pasa con
  `sm:grid`/`lg:grid` (AppShell:178, StudioPage:332/368, EventPage:400, ReviewScreen:569): el selector `.grid` no
  coincide con `lg:grid`, y de todos modos todas tienen tamaño fijo o plantilla propia.
- **`grid place-items-center` con `size-*`** (la gran mayoría) o capas `absolute/fixed inset-0`: la pista ya ocupaba
  todo el ancho del contenedor. No cambian.
- **Listas `grid gap-* sm:grid-cols-2`** en el móvil (BagsPage:42/80, WishesPage:200/609/655, EventPage:226, TieDraw:65,
  RpdPage:163, LinkFilePanel:402, formularios de diálogo): es justo el cambio que se busca. Ya no pueden ensancharse
  más que su contenedor.
- **Fuera de Tailwind:** no hay HTML ni bibliotecas que pongan la clase `grid` (lucide usa `lucide-*`, y el iframe de
  YouTube es de otro origen). Sí afecta a cualquier elemento con `class="grid"`, sea o no de Tailwind, pero hoy no hay
  ninguno.
- **Casos límite reales:** ver los hallazgos 5 y 6.

## Hallazgos

- **[6] apps/web/src/features/library/VideoCard.tsx:133-137 (columna en :112)** — En las filas del móvil, el chip
  «con archivo» lleva `shrink-0` y no se recorta. Mide unos 98 px (11 px negrita, más icono y relleno). El hueco que le
  queda al bloque de texto es aproximadamente ancho − 20 (margen) − 2 (borde) − 40 (padding) − 156 (miniatura + hueco) −
  8 (`px-1`) − 12 − contador. Con el contador a 43 px, eso da **79 px a 360 px** (Galaxy S2x de base), **94 px a 375 px**
  (iPhone) y **103 px a 384 px**. Con 10 clips o más, el contador ocupa unos 50 px y a 384 px quedan unos 96. Es decir: en
  esos anchos el chip, aunque baje a su propia línea, no cabe. Se sale de su columna y pisa el contador de clips. Con la
  letra del sistema más grande (habitual en Samsung) puede llegar al borde, y entonces el `overflow-x-clip` de la hoja lo
  corta, que es justo el síntoma que se describió («con archivo» cortado). La comprobación a 390 px no lo detecta. **Arreglo
  propuesto:** que el chip pueda encogerse (`min-w-0 max-w-full` y el texto dentro de `<span className="truncate">`), o
  mejor, en las filas no destacadas por debajo de `sm` dejar solo el icono: `<span className="max-sm:sr-only">con
  archivo</span>` cuando `!featured`, con `title`. Probar a 360, 375 y 384 px, con dos cifras de clips y con la letra al 115 %.
- **[3] apps/web/src/features/library/LibraryPage.tsx:52/111/165** — Ahora, al borrar un vídeo sin haber buscado antes, el
  resto de tarjetas ya no se desliza. Con `AnimatePresence mode="popLayout"`, la tarjeta que sale pasa a `absolute` al
  momento: las demás saltan a su nuevo sitio y la que se va se desvanece encima de la que ocupa su hueco. Si se borra la
  primera, la nueva destacada cambia de tamaño de golpe. **Arreglo:** poner `setFiltering(true)` también en
  `confirmDelete`, o usar `mode="sync"` cuando no se anima la posición.
- **[3] apps/web/src/features/library/LibraryPage.tsx:52** — `filtering` nunca vuelve a `false` mientras dura la visita.
  Si alguien ha buscado y luego borra la búsqueda, cualquier recarga en segundo plano que cambie el orden vuelve a animar
  posiciones, que es el camino del «transform a medias» que se quería cerrar. El riesgo es bajo, porque al salir de la
  página se desmonta. **Arreglo opcional:** volver a `false` cuando termine la animación de vuelta (`onLayoutAnimationComplete`)
  con la búsqueda vacía.
- **[3] apps/web/src/features/library/VideoCard.tsx:114-118** — Con 79–100 px de columna en el móvil, un título con una
  palabra larga sin cortes (un nombre en mayúsculas, un enlace) queda recortado sin puntos suspensivos por el
  `line-clamp`. Esto ya pasaba antes, pero el arreglo estrecha la columna. **Arreglo:** añadir `[overflow-wrap:anywhere]`
  (o `break-words`) al `h3`.
- **[3] apps/web/src/features/library/LibraryPage.tsx:97** — `overflow-x-clip` en la hoja sirve de última defensa, pero
  esconde los fallos futuros: lo que se salga se cortará sin avisar, en lugar de verse. **Arreglo:** mantenerlo, pero añadir
  una comprobación en una prueba de navegador a 360 y 390 px de que `scrollWidth <= clientWidth` en `.paper` y en cada
  `article`.
- **[2] apps/web/src/index.css:295 + apps/web/src/features/record/settings/controls.tsx:76-77** — El selector de
  segmentos usa `grid` y pone `gridAutoFlow: 'column'` en el estilo en línea, no con la clase `grid-flow-col`, así que la
  exclusión no le alcanza. Hoy se ve igual, por casualidad: su `gridAutoColumns` también es `minmax(0, 1fr)`. Si alguien
  lo cambia a `auto`, la primera opción se quedaría con todo el espacio libre. **Arreglo:** usar las clases
  `grid-flow-col auto-cols-fr` (o dejar `gridTemplateColumns` explícito en el estilo).
- **[2] apps/web/src/index.css:295** — Con `minmax(0, 1fr)`, el min-content de una rejilla pasa a ser 0. Una rejilla sin
  tamaño fijo que sea hijo flexible sin `shrink-0` ya no protege su contenido en una fila apretada. Hoy solo
  ReactionBar.tsx:47 cumple eso (el `motion.span` del chevron de «Quién»): en una fila muy estrecha podría encogerse y el
  chevron montarse sobre el texto. También, en las capas `place-items-center` con un hijo más ancho que la capa, el
  desborde ahora se reparte a los dos lados en vez de solo a la derecha. Ningún caso actual llega a eso. **Arreglo:**
  añadir `shrink-0` (o `size-3.5`) a ese `span`. Para la regla, documentar en CLAUDE.md que una rejilla sin `grid-cols-*`
  ya es una sola columna que puede encogerse.
- **[2] apps/web/src/index.css:295** — La exclusión solo reconoce la clase literal `grid-flow-col`. No cubre
  `sm:grid-flow-col` ni `grid-flow-col-dense`, y además `cn`/tailwind-merge quita `grid-flow-col` si después llega otro
  `grid-flow-*`. Hoy nada lo usa. **Arreglo:** dejarlo anotado en el comentario de la regla.
- **[2] apps/web/src/features/library/libraryLayout.test.ts** — La prueba solo comprueba texto: falla si cambia el orden
  de las clases y no comprueba ninguna medida. Sirve como recordatorio, pero no protege del caso del hallazgo de 6.
  **Arreglo:** acompañarla de la comprobación de `scrollWidth` en el navegador a 360, 375 y 390 px, con una tarjeta que
  tenga «con archivo» y 12 clips.
- **[1] apps/web/src/features/library/LibraryPage.tsx:163** — `min-w-0` en la rejilla no hace nada: es hija de bloque,
  no de una caja flex ni de otra rejilla. Es inofensivo.
- **[1] apps/web/src/features/library/LibraryPage.tsx:97** — `overflow: clip` necesita iOS 16 o posterior; en versiones
  anteriores se ignora y no hay alternativa. Da igual, porque la defensa principal es la rejilla.

### Interfaz (móvil 390×844, horizontal, escritorio)

- **390 px en vertical:** la fila de «ARrC» cabe sin saltos (unos 109 px de hueco para 98 de chip). Si el artista es
  largo, el artista se recorta y el chip baja a una segunda línea. La fila pasa a medir unos 90 px frente a los 81 de la
  miniatura, que queda centrada (`items-center`). Se ve bien. El botón de borrar sigue sobre la columna del contador,
  sin pisar el título.
- **Horizontal (844 px, `sm`) y escritorio:** dos columnas de más de 250 px y cuatro en `xl`. El chip cabe en la misma
  línea. Sin cambios visibles.
- **Esqueleto del acceso rápido:** con `shrink-0` + `overflow-hidden` ya no se encoge ni se sale. Correcto.
- **Lo que empeora:** solo lo que se cuenta en los hallazgos 6 y 3 (el borrado sin deslizamiento).

### Rendimiento

Quitar `layout` por defecto **mejora**: las tarjetas ya no se miden al pintar la copia guardada ni al cambiar a la lista
nueva. La primera tecla vuelve a pintar las N tarjetas una vez (cambia la prop `animateLayout`, que pasa por `memo`), un
coste que no se nota. `setFiltering(true)` en cada tecla no vuelve a pintar porque el valor no cambia. Con
`useDeferredValue`, la primera pasada solo monta la medición y la segunda ya anima, así que la primera búsqueda sí se
desliza. `overflow-x-clip` no crea zona de desplazamiento ni capa nueva, y la regla global no cuesta nada.

### Accesibilidad

- El orden de lectura no cambia, y `MotionConfig reducedMotion="user"` (App.tsx:110) ya apaga la animación de posición.
- **[3] apps/web/src/features/library/VideoCard.tsx:75 (ya existía, fuera de alcance):** el `aria-label="Abrir {título}"`
  del enlace sustituye todo su contenido, así que el lector de pantalla no lee el artista, el origen, «con archivo» ni el
  número de clips. Propuesta: quitar el `aria-label` y dejar que se lea el contenido, o incluir esos datos en la etiqueta.
- Si el chip se queda solo con el icono (arreglo del hallazgo de 6), el texto tiene que seguir en `sr-only`, no en
  `aria-hidden`.

## Veredicto

El arreglo ataca la causa de fondo y la regla global no rompe ninguna rejilla actual (lo he comprobado en todo el
proyecto). Hay un hallazgo de nota 6: en móviles de 360–384 px (o con la letra del sistema más grande), el chip
«con archivo» no cabe ni en su propia línea y pisa el contador, y puede quedar cortado por la hoja, que es el mismo
síntoma que se describió. Hay que corregirlo (chip que se recorte o solo icono en las filas del móvil) y probarlo a 360,
375 y 384 px antes de dar el 38 por cerrado. El resto es ≤3.
