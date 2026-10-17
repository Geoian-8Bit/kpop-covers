# Revisión · Mejoras 33 a 37 (crear ronda, pantalla de la ronda, proponer con búsqueda, fuera de la biblioteca, estructura de deseos y votación) · ronda 2

## Alcance

Revisión de solo lectura de los arreglos a los hallazgos de `mejoras-grupo-ronda-1.md`, sobre los cambios sin confirmar
de `feat/plan-completo`. He revisado `WishesPage.tsx`, `WishFormDialog.tsx`, `PollPage.tsx`, `YouTubePicker.tsx` y
`youTubePickerRules.ts`, `AddVideoDialog.tsx`, `RpdPlayPage.tsx`, `RandomPlayScreen.tsx`, `RoundControls.tsx`,
`RpdPage.tsx` y `roundRules.ts` con su test. Como contexto he leído `Dialog.tsx`, `ToastProvider.tsx`, `Field.tsx`,
`Button.tsx`, `useBackToClose.ts`, `AppShell.tsx` y `navRules.ts`, y también el `BrowserRouter` de react-router 7.18,
que actualiza la ruta dentro de `startTransition`.

He trabajado sin servidor ni navegador, así que las medidas en píxeles salen de las clases. He pasado vitest con
`roundRules`, `youTubePickerRules`, `wishRules` y `pollRules`: 4 archivos y 72 tests, todos en verde. Los tests nuevos
comprueban que `sanitizeOptions` solo acepta booleanos de verdad, `roundKeyAction` y `resultsShown`.

## Hallazgos de la ronda 1 → estado

| Nota | Hallazgo de la ronda 1 | Estado |
| --- | --- | --- |
| 6 | Tocar la tarjeta en «Elegir para votar» no marcaba la canción | **Corregido.** La casilla estirada ya no lleva `whileTap`: solo el cuadrado de dentro hace la animación al cambiar. La miniatura en modo elegir es un `span` con `pointer-events-none` (y la imagen hereda esa regla). Lo demás de la tarjeta no está posicionado, así que el `::before` (que se mide desde el `article relative`) recibe el toque en toda la tarjeta. El `layout` del `li` no cambia el bloque contenedor. Sin regresiones. |
| 6 | En pantalla completa no se veía «¿Salir de la ronda?» | **Corregido**, con un detalle nuevo (ver N3). Ahora se pide la pantalla completa sobre `document.documentElement`. El `Dialog` y los avisos se montan en `fullscreenElement ?? body`, así que ya se ven. Al salir de la ronda se sale también de la pantalla completa, pero solo si la había pedido la ronda (`ours`). `quickNavHidden` ya oculta el menú rápido en pantalla completa. Debajo de la ronda queda la app, pero inerte (`useInertOutside`) y tapada por un fondo opaco (`seigaiha` con `background-color`) en `z-[45]`. El menú rápido está en `z-[42]`. |
| 5 | Espacio sobre un botón pulsado con el ratón activaba ese botón | **Corregido.** `pointerdown` (en captura, sobre la capa) guarda el botón tocado y Tab borra ese recuerdo. `roundKeyAction` hace que Espacio sea «pausa» si el foco no está en un botón o si el botón se tocó con el ratón o el dedo. Antes de pausar, el foco pasa a la capa (`tabIndex=-1`), así que el `keyup` ya no activa el botón. Con un botón al que se llegó con el teclado, Espacio sigue siendo de ese botón. Los toques dentro de los diálogos no cuentan, porque esos diálogos se montan fuera de la capa. |
| 3 | El anuncio del primer clip podía perderse | **Corregido.** El `<p aria-live>` es hijo directo de la capa, fuera del `div inert`. |
| 3 | Tras «Empezar», el foco se perdía | **Corregido.** `focusPause` lleva el foco a `[data-round-pause]` al pasar a `lead`, tanto con «Empezar» como con «Otra vez». Al mezclar de nuevo se monta otra vez «¿Preparados?» con `autoFocus`. |
| 3 | `role="toolbar"` sin flechas | **Corregido.** Ahora es `role="group"` con `aria-label` y lleva `aria-keyshortcuts` en los tres botones. |
| 3 | «Atrás» del móvil salía de la ronda sin preguntar | **Corregido.** `useBackToClose` está activo mientras `exitNeedsConfirm(phase) && !confirmExit && !saving` y llama a `exit` (pausa y pregunta). Su entrada se apaga cuando abre otra capa, y la abre de nuevo al cerrarla. Lo he seguido paso a paso con Atrás, «Seguir en la ronda», «Salir», «Guardar como pista» y el final de la ronda: nunca se sale sin preguntar y Atrás nunca cae en una confirmación muerta. Queda algo de basura en el historial (N5). |
| 3 | Volver a «YouTube» desmontaba el buscador | **Corregido**, con un efecto secundario (N2). La pestaña se oculta con `hidden`, que el preflight de Tailwind v4 aplica con `!important`, sin desmontarla. Así se conservan los resultados, la duración y el título. **Nada gasta consultas en segundo plano.** La búsqueda solo se lanza con una acción explícita, y `onSubmit` solo busca con `tab === 'youtube'`. La consulta del título del enlace solo se lanza cuando cambia `linkId`, y eso no pasa con la pestaña oculta. Al cerrar, el `Dialog` desmonta el contenido. |
| 3 | Intro con un enlace enviaba el formulario | **Corregido.** Con un enlace, Intro (o «Hecho» en el móvil) hace `preventDefault` y lleva el foco a la tarjeta del vídeo elegido, o cierra el teclado si no hay tarjeta. |
| 3 | La selección guardaba ids que podían desaparecer | **Corregido.** `pickedLive` (lo marcado que sigue en `list`) alimenta el texto, el botón desactivado y `onCreatePoll`. |
| 3 | Los avisos de la tarjeta tenían una zona de toque de 32 px | **Corregido.** Se ven de 32 px, pero un `::before` añade 6 px arriba y abajo y la zona de toque llega a 44 px. Las filas van a `gap-y-3` (12 px), así que esas zonas se tocan pero no se pisan, y tampoco invaden «Me apunto», que está 10 px por encima. |
| 2 | Los resultados no seguían al campo | **Corregido.** `resultsShown(search, query)` comprueba que la búsqueda en pantalla sea la del texto actual, y tiene test. «Quitar» vuelve a la búsqueda anterior y la enseña sin pedirla otra vez. |
| 2 | La ✕ del navegador salía junto a la nuestra | **Corregido.** `[&_input::-webkit-search-cancel-button]:hidden` va en el contenedor de `Field` y afecta al `input` descendiente. |
| 2 | Cancelar «Nueva votación» borraba la selección | **Corregido.** «Crear votación» ya no llama a `stopSelecting()`. Al crear la votación se navega a su página y la lista se desmonta. |
| 2 | «Abrir» del aviso de duplicado medía 36 px | **Corregido** (`min-h-11`). |
| 2 | Se podía proponer mientras cargaba la biblioteca | **Corregido.** `checking` (biblioteca **o** lista de deseos pendientes) desactiva «Proponer» y muestra «Comprobando…». |
| 2 | `sanitizeOptions` aceptaba booleanos falsos | **Corregido**, con test (`"no"`, `0`). |
| 2 | El pie decía «Elige…» mientras cargaba la bolsa | **Corregido.** `poolLoading` cuenta `bagItems.isPending` y el pie dice «Cargando…». |
| 1 | `aria-label` en un `<p>` en `PollPage` | **Corregido.** Ahora es un `span sr-only` («Cómo es esta votación: »). |
| 1 | Se mezcla otra vez al volver de la ronda | Sin cambios, como se esperaba: es la «siguiente ronda». |

## Hallazgos nuevos

- **[6] `apps/web/src/features/wishes/WishesPage.tsx:408-425`: la barra «Elegir para votar» no cabe en un móvil.**
  - **Problema.** Sale de las clases y hay que comprobarlo a 390×844 y a 360×800. La barra lleva
    `max-lg:mr-[var(--fab-clearance)]`, que deja 72 px a la derecha.
  - **Cuentas a 390 px.** Quedan 390 − 20 (`Page px-2.5`) − 32 (`section px-4`) − 72 = 266 px. Sin el relleno
    `p-2.5`, quedan unos 246 px. Los dos `Button` son `shrink-0 whitespace-nowrap`, y su `min-width:auto` es todo su
    contenido. «Cancelar» con su ✕ ocupa unos 126 px (40 de relleno, 16 del icono, 8 de hueco y unos 62 de texto
    a 15 px en negrita). «Crear votación» ocupa unos 176 px. Con el hueco suman unos 310 px, así que se desbordan unos
    64 px (unos 94 px a 360). Ni `flex-1` ni `flex-[2]` los encogen.
  - **Efecto.** «Crear votación» se sale de la barra y queda bajo el botón flotante, que es justo la zona que se quería
    dejar libre. Es la acción principal de la pantalla, en móvil, y es el mismo tipo de fallo que el desborde de tarjetas
    que se trató como crítico.
  - **Arreglo.** `min-w-0` en los dos botones y menos relleno (`px-3`). Que «Cancelar» sea solo icono con
    `aria-label="Cancelar"` en móvil (`size="icon"`, 44 px), o que la barra use `flex-wrap`. Comprobarlo con toques
    reales a 360 y a 390.
- **[3] `apps/web/src/features/rpd/RpdPlayPage.tsx:97, 161-176`: «Volver a mezclar» sale de la pantalla completa.**
  - **Problema.** `RoundRunner` lleva `key` con `draft.mix`, así que mezclar de nuevo lo desmonta. La limpieza de
    `useFullscreen` ve `ours.current` y llama a `exitFullscreen()`. En la tele, cada ronda nueva mezclada vuelve a la
    ventana normal, y hay que tocar otra vez «Pantalla completa». Antes era inevitable, porque el elemento a pantalla
    completa se desmontaba. Con `documentElement` ya no lo es.
  - **Arreglo.** Subir `useFullscreen` a `RpdPlayPage` (fuera de la `key`) y pasarlo por props, para que solo se salga
    de la pantalla completa al dejar la página.
- **[3] `apps/web/src/features/library/AddVideoDialog.tsx:194-212, 113`: al volver a «YouTube» puede quedar el título
  del archivo.**
  - **Problema.** Elegir un vídeo de YouTube rellena el título. Al ir a «Subir archivo» y elegir un archivo, el título
    pasa a ser el nombre del archivo (`cleanFileTitle`, si no se ha tocado el título). Al volver a «YouTube», el
    buscador ya no vuelve a mandar su elección (antes se desmontaba y la mandaba otra vez), así que «Añadir y abrir»
    añade el vídeo de YouTube con el nombre del archivo, por ejemplo «IMG 1234».
  - **Arreglo.** Guardar el título de cada pestaña por separado (`youtubeTitle` y `fileTitle`, o recordar el último
    `YouTubePick`). Al cambiar de pestaña sin haber tocado el título, poner el de la pestaña activa.
- **[2] `apps/web/src/components/ui/Dialog.tsx:162` + `apps/web/src/providers/ToastProvider.tsx:32`: en pantalla
  completa, los diálogos y avisos quedan fuera de `body`.**
  - **Problema.** Ahora `fullscreenElement` es `<html>`, así que el diálogo y los avisos se montan como hermanos de
    `body`. Pierden lo que hereda `body` en `index.css:274-282`: el color `--color-washi` (el texto sin color propio
    sale en el blanco del sistema), 15 px y `line-height` 1,55. La fuente se salva por el preflight de `html`. Es un
    fallo solo visual, pero se ve en la tele.
  - **Arreglo.** En los dos sitios, usar
    `const fs = document.fullscreenElement; const host = fs && !fs.contains(document.body) ? fs : document.body;`.
    Así el estudio, que pone a pantalla completa un elemento propio, sigue igual.
- **[2] `apps/web/src/features/rpd/RpdPlayPage.tsx:425, 642-648`: entradas de más en el historial.**
  - **Problema 1: «Salir» desde la confirmación.** `setConfirmExit(false)` se pinta antes de que cambie la ruta, que va
    en `startTransition`. En ese momento `useBackToClose` vuelve a abrirse y añade una entrada en `/rpd`, y al desmontar
    la quita con `history.back()`. Al final queda `[/rpd, /rpd/jugar, /rpd]`, como antes de esta ronda. Atrás desde
    `/rpd` vuelve a «¿Preparados?».
  - **Problema 2: «Seguir en la ronda» y «Guardar como pista».** Se ejecutan `history.back()` y `pushState` en el mismo
    momento. Según en qué orden los resuelva el navegador, puede quedar una entrada vieja con la URL de la ronda. Hace
    falta un Atrás de más, y nunca se sale sin preguntar.
  - **Arreglo.** Para el problema 1, en vez del `replace`, `navigate(-1)` si la entrada anterior es `/rpd`, o abrir la
    ronda con `replace` desde `RpdPage`. Para el problema 2, quitar a la vez la entrada del diálogo y poner la de la
    ronda: un `replaceState` sobre la del diálogo en lugar de `back()` y `push`, o pasar una opción a `useBackToClose`.
- **[2] `apps/web/src/features/rpd/RpdPlayPage.tsx:440-467`: Espacio mantenido y Esc.**
  - **Problema.** Al mantener Espacio se alterna pausa y marcha muchas veces seguidas: no se comprueba `e.repeat`. Esto
    ya pasaba antes. Además, con el portátil junto a la tele y sin pantalla completa, Esc no hace nada en una capa que
    es `role="dialog"`.
  - **Arreglo.** `if (e.repeat) return;` para Espacio, R y →. Que Esc llame a `exit()`, que ya pausa y pregunta, cuando
    no hay otra capa abierta.
- **[1] `apps/web/src/features/rpd/RandomPlayScreen.tsx:46`: comentario huérfano.**
  - **Problema.** El comentario sobre el anuncio quedó dentro de la interfaz de props, después de quitar la prop
    `announcement`.
  - **Arreglo.** Borrarlo, porque `RpdPlayPage` ya lo explica.

Lo que no cambia y ya estaba apuntado (no cuenta como nuevo): el ranking con teclado, `li` dentro de `radiogroup`,
el `role="alert"` del enlace a medias y el `role="status"` del aviso del clip, que entra en el árbol con su texto.

## Veredicto

Los 19 hallazgos de la ronda 1 están corregidos, y los dos de nota 6 (la tarjeta en modo elegir y la pantalla completa)
quedan bien resueltos. No he visto regresiones funcionales en el historial («Atrás» siempre pregunta), en el teclado,
en el foco ni en las consultas a YouTube.

**Sí, hay un hallazgo de nota 6**, que se corrige sí o sí: la barra «Elegir para votar» desborda en móvil al dejar sitio
al botón flotante. «Crear votación» queda bajo ese botón. Sale de las clases, así que hay que confirmarlo a 360 y 390 px.

Conviene arreglar en la misma tanda los dos de nota 3: «Volver a mezclar» sale de la pantalla completa, y en «Añadir
vídeo» puede quedar el título del archivo al volver a YouTube. Los de nota 2 o menos pueden ir a pendientes.
