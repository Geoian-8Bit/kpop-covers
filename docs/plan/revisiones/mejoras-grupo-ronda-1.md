# Revisión · Mejoras 33 a 37 (crear ronda, pantalla de la ronda, proponer con búsqueda, fuera de la biblioteca, estructura de deseos y votación) · ronda 1

## Alcance

Revisión de solo lectura de los cambios sin confirmar en la rama `feat/plan-completo` para los puntos 33–37 de
`docs/plan/MEJORAS-PRUEBA-MANUAL.md`, con las decisiones 21–23 y los pendientes de F11, F12 y F14 de
`ESTADO-IMPLEMENTACION.md` como referencia:

- `apps/web/src/components/YouTubePicker.tsx` (nuevo), `youTubePickerRules.ts` y su test (nuevos).
- `apps/web/src/features/library/AddVideoDialog.tsx` (ahora usa el buscador compartido).
- `apps/web/src/features/wishes/`: `WishFormDialog`, `WishesPage`, `PollPage`, `Ballot`, `wishRules` y `pollRules`
  (más sus tests). `apps/web/src/data/wishes.ts` sin cambios (revisado para el punto 36).
- `apps/web/src/features/rpd/`: `RpdPage`, `RoundOptionsFields`, `RpdPlayPage`, `RandomPlayScreen`, `RoundControls`,
  `roundDraft`, `roundRules` (más su test).

Fuera del alcance: las barras fijas de `WishesPage.tsx` (selección) y `Ballot.tsx` (votar), que otro agente está tocando
para dejar sitio al botón flotante, y el cambio de `player/YouTubeStage.tsx` (punto 6). Sin servidor ni navegador: las
medidas en píxeles salen de las clases. He pasado los tests de las reglas (4 archivos, 69 tests en verde) y
`tsc --noEmit` (solo falla `src/player/engine.ts:4`, `YOUTUBE_MAX_SEEK_MS` sin usar, que es de otro bloque).

## Lo que funciona bien

- **Buscador compartido.** Solo busca con Intro, la lupa o «Buscar», nunca mientras escribes. Intro con una búsqueda
  no envía el formulario. La consulta va en minúsculas y con la URL canónica (comparte la caché del servidor). Repetir
  la misma búsqueda no hace otra petición, y una respuesta vieja que llega tarde no pisa a la nueva. 429
  `rate_limited`, 429 de cuota y 503 salen como aviso sin «Reintentar», y el resto de errores con «Reintentar».
  Enlace: la elección llega enseguida sin título y otra vez cuando llega el título; si el título no llega en 8 s,
  sigue sin él. 422 y 404 quitan la elección y lo dicen en el campo. «Quitar» vuelve a la búsqueda anterior sin
  pedirla otra vez, porque el estado `ok` de esa búsqueda se conserva. Flechas, Inicio y Fin recorren los resultados.
  Los resultados y la elección se anuncian en un `aria-live`. Todas las zonas de toque miden 44 px.
- **«Añadir vídeo».** El aviso de duplicado y «Abrir» siguen. La pestaña «Subir archivo», el vínculo con un vídeo
  que ya existe (F1), el relleno de título y artista y la duración de un resultado (`durationSeconds` → `duration`)
  también. El candado contra el doble toque sigue.
- **Proponer (35).** Los resultados llevan las marcas «Ya propuesta» y «Ya en la biblioteca» (`songStatus`).
  «Proponer» está desactivado salvo con `status === 'new'`, y el aviso ofrece «Ver la lista» o «Abrir».
- **Punto 36.** Solo crean vídeos `useAddWishToLibrary` (la tarjeta y la ganadora) y `useAddBagSongToLibrary`, y
  los dos enlazan el vídeo que ya existe antes de crear otro. Proponer, votar, cerrar (`close_poll`; ninguna migración
  inserta en `videos`), «Meter en «Próxima coreo»» (guarda `wish_id`) y «Meter en una bolsa» no crean nada.
- **Estructura (37).** Arriba sale «Proponer» con aspecto de buscador. Debajo, hasta 3 votaciones abiertas con
  «Votar», que se ocultan al elegir. Luego la lista por interés con «Me apunto» de 44 px. El modo elegir tiene
  título propio, casillas y su barra con `selectionHint`. En la votación, la papeleta va antes que el resumen (cierre,
  tipo, anonimato y resultados en una sola línea), y menos texto fijo. Hanabi (`VoteReveal`) no cambia.
- **Crear ronda (33).** Arriba, la fuente y el número. La mezcla se guarda en el estado con la clave
  `pool|count|seed`, así que se vuelve a mezclar al cambiar la fuente o el número, pero no al volver a pintar ni con
  una recarga de los datos (los listados ordenan por `created_at, id`). «Volver a mezclar» cambia la semilla. «Más
  opciones» va plegado, con el resumen en una línea (`optionsSummary`). La preparación se guarda saneada en
  `localStorage`, y los ids desconocidos se descartan contra las listas. El pie fijo «Empezar» respeta la zona segura
  y el hueco del botón flotante.
- **Ronda (34).** El fondo es seigaiha, el de la app, y Kamishibai sigue igual (tarjeta que tapa y se desliza). Hay
  tres botones grandes y una bandeja secundaria. En horizontal, el marco va a la izquierda y lo demás a la derecha:
  a 844×390 salen unos 515 px de marco y 219 px de columna, y todo cabe (unos 320 px de 361 de alto). En una tele de
  1920×1080: marco de unos 1285 px, título a unos 59 px y tarjeta a unos 100 px. Los atajos ya funcionan con el foco
  en un control de la ronda (solo se cortan en otra capa). «Salir» a media ronda pausa, pregunta y al quedarse
  reanuda solo si estaba en marcha. Cada clip se anuncia por `aria-live`. El modo adivinar no deja ver el título
  (tarjeta, `h2`, «Siguiente: Sorpresa», anuncio con «¿qué canción es?») y, una vez visto, ya no lo oculta al pausar.
  Detrás de «¿Preparados?» y «Ronda terminada» la pantalla queda inerte.
- **Seguridad.** El id de YouTube pasa siempre por `parseYouTubeId` (11 caracteres) antes de ir a una URL. Las
  miniaturas son de `i.ytimg.com` (lo permite la CSP). No se inyecta HTML. Lo que se pega del portapapeles se recorta
  a 300 caracteres, solo con un toque y solo como texto del campo.

## Hallazgos (de mayor a menor)

- **[6] `apps/web/src/features/wishes/WishesPage.tsx:518-543`.** En «Elegir para votar», tocar la tarjeta no siempre
  marca la canción. La casilla se estira a toda la tarjeta con `before:absolute before:inset-0`, pero hay dos
  problemas. (a) La miniatura (`<span className="relative …">`, línea 541) es un elemento posicionado que va después
  en el árbol, así que se pinta encima del `::before`: tocar la miniatura no hace nada. (b) `whileTap={{ scale: 0.85 }}`
  pone un `transform` en el botón mientras se pulsa. Un `transform` convierte el botón en el bloque contenedor de su
  `::before`, que se encoge a 44×44 a mitad del toque. Al soltar sobre el título, el `click` cae en el `article` y no
  en el botón: en Chrome de Android el toque se resuelve donde se suelta; en el ordenador, el `click` va al ancestro
  común del `pointerdown` y el `pointerup`. Solo funciona tocar justo la casilla. **Arreglo:** quitar `whileTap` del
  botón estirado (animar solo el cuadrado de dentro) y poner `pointer-events-none` a la miniatura en el modo elegir.
  Otra opción: que el `article` reciba el toque en ese modo (`onClick`) y la casilla solo indique el estado. Comprobar
  con toques reales a 390×844.
- **[6] `apps/web/src/features/rpd/RpdPlayPage.tsx:154-167, 374-382, 563-586`.** En pantalla completa, «Salir» deja la
  ronda bloqueada. `requestFullscreen` se pide sobre la capa de la ronda (`rootRef`), y `Dialog` se monta en
  `document.body` (`createPortal`), que en pantalla completa no se pinta. Al tocar «Salir» a media ronda, la ronda se
  pausa y abre «¿Salir de la ronda?» sin que se vea. Mientras tanto `confirmExit` apaga los atajos y el foco se va a un
  diálogo invisible. En la tele, que es justo el caso del punto 34, parece que «Salir» solo pausa. Solo se sale con
  Esc, que primero quita la pantalla completa. Lo mismo pasa, desde antes, con «Guardar como pista» (`SaveTrackDialog`)
  y con los avisos (`data-toast-host`). **Arreglo:** pedir la pantalla completa sobre `document.documentElement`. La
  ronda ya es `fixed inset-0` y tapa la app, así que se ve igual y los diálogos y avisos en `body` se ven. Otra opción:
  salir de la pantalla completa antes de abrir cualquier diálogo.
- **[5] `apps/web/src/features/rpd/RpdPlayPage.tsx:402`.** Espacio sobre un botón activa ese botón, no la pausa. Con
  el ratón junto a la tele: tocas «Saltar», el foco se queda en «Saltar», pulsas Espacio para pausar y salta otro clip.
  Lo mismo con «Repetir» o «Terminar». **Arreglo:** en `RoundControls`, quitar el foco tras un clic de ratón o un
  toque (`onPointerUp`: si `pointerType !== ''`, llamar a `currentTarget.blur()`). O bien, en el manejador, tratar
  Espacio como pausa cuando el botón está dentro de `rootRef` y no tiene `:focus-visible`.
- **[3] `apps/web/src/features/rpd/RandomPlayScreen.tsx:72` + `RpdPlayPage.tsx:453`.** El anuncio del primer clip
  puede perderse. La región `aria-live` está dentro del `div` con `inert={overlay}`, y en el mismo cambio se quita el
  `inert` y se escribe «Clip 1 de N…». Muchos lectores no anuncian una región que acaba de entrar en el árbol.
  **Arreglo:** sacar el `<p aria-live>` fuera del contenedor inerte (hijo directo de la capa de la ronda).
- **[3] `apps/web/src/features/rpd/RpdPlayPage.tsx:525`.** Tras «Empezar», el foco se pierde: el botón desaparece con
  el overlay y el foco cae en `body`. **Arreglo:** al pasar a `lead`, llevar el foco a «Pausa» (`ref` o
  `data-autofocus` en `RoundControls`).
- **[3] `apps/web/src/features/rpd/RoundControls.tsx:39`.** El `role="toolbar"` promete moverse con las flechas, pero
  aquí la flecha derecha salta de clip y no hay navegación entre botones. **Arreglo:** `role="group"` (con su
  `aria-label`), o flechas de verdad sin `ArrowRight` como atajo dentro de la barra.
- **[3] `apps/web/src/features/rpd/RpdPlayPage.tsx:371-389`.** La confirmación solo protege el botón «Salir». El
  gesto o el botón «Atrás» del móvil a media ronda salen sin preguntar. **Arreglo:** `useBlocker` de react-router
  mientras `exitNeedsConfirm(state.phase)`, con el mismo diálogo.
- **[3] `apps/web/src/features/library/AddVideoDialog.tsx:194-224`.** Ir a «Subir archivo» y volver a «YouTube»
  desmonta el buscador. Se pierden los resultados, y el resultado elegido vuelve como enlace: sin duración, con el
  título vaciado un momento (`onPick` con `title: ''`) y luego el de oEmbed. Si oEmbed falla, el título queda vacío y
  «Añadir y abrir» se desactiva. Antes no pasaba. **Arreglo:** no desmontar la pestaña (ocultarla con `hidden` o
  conservar el buscador), o guardar en el diálogo el último `YouTubePick` y no pisar el título con uno vacío del
  mismo `youtubeId`.
- **[3] `apps/web/src/components/YouTubePicker.tsx:263-272`.** Intro con un enlace envía el formulario. En «Proponer
  canción», pegar el enlace y pulsar «Hecho» en el teclado del móvil (`enterKeyHint="done"`) propone en cuanto llega
  el título, sin pasar por «Más detalles». **Arreglo:** con un enlace, Intro solo cierra el teclado (`blur`), y se
  propone con el botón. O dejarlo a elección del padre (`submitOnEnter`).
- **[3] `apps/web/src/features/wishes/WishesPage.tsx:272-311, 414-420`.** La selección guarda ids que pueden
  desaparecer: otro móvil borra o añade a la biblioteca una propuesta marcada. `picked.length` sigue en 2 y «Crear
  votación» queda activo, pero solo pasa una candidata. **Arreglo:** calcular lo elegido como `picked ∩ list` y usar
  ese número para el texto y el botón.
- **[3] `apps/web/src/features/wishes/WishesPage.tsx:654-683`.** Los avisos de la tarjeta («En votación», «Ganó»,
  votaciones anteriores) son enlaces de `min-h-8` (32 px), por debajo de los 44 px del proyecto. **Arreglo:**
  `min-h-11` con el mismo aspecto (más relleno vertical, o un área de toque invisible).
- **[2] `apps/web/src/components/YouTubePicker.tsx:283`.** Los resultados no siguen al campo. `showResults` no mira
  si la búsqueda en pantalla es la del texto. Al escribir otra cosa sin pulsar Intro siguen los resultados de antes, y
  al quitar un enlace pegado (el campo se vacía) reaparece una búsqueda vieja. **Arreglo:** mostrarlos solo si
  `search.query === query` (o atenuados con «Pulsa Buscar»).
- **[2] `apps/web/src/components/YouTubePicker.tsx:333`.** Con `type="search"`, Chrome y Safari pintan su propia ✕ de
  borrar junto a la nuestra («Quitar» o la lupa). **Arreglo:** en `index.css`, `input[type='search']::-webkit-search-cancel-button { appearance: none; }`.
- **[2] `apps/web/src/features/wishes/WishesPage.tsx:417-419`.** Cancelar el diálogo «Nueva votación» borra la
  selección (`stopSelecting()` se llama antes de crearla). **Arreglo:** salir del modo elegir solo cuando la votación
  se haya creado.
- **[2] `apps/web/src/features/library/AddVideoDialog.tsx:211`.** «Abrir» del aviso de duplicado es `size="sm"`
  (36 px). En `WishFormDialog` ya lleva `min-h-11`. **Arreglo:** el mismo `className="min-h-11"`.
- **[2] `apps/web/src/features/wishes/WishFormDialog.tsx:70-73`.** Mientras carga la biblioteca, `songStatus` da
  `'new'` y se puede proponer una canción que ya está en ella (la base solo frena los deseos repetidos). **Arreglo:**
  tratar `library.isPending` como «comprobando» y desactivar «Proponer» hasta tener la lista.
- **[2] `apps/web/src/features/rpd/roundRules.ts:56-57`.** `sanitizeOptions` no comprueba que `countdown` y
  `useClipSettings` sean booleanos. Un `localStorage` estropeado deja pasar `"no"`, que cuenta como verdadero.
  **Arreglo:** `typeof o.countdown === 'boolean' ? o.countdown : DEFAULT…`.
- **[2] `apps/web/src/features/rpd/RpdPage.tsx:186-190`.** Al cambiar de bolsa, mientras cargan sus elementos
  (`bagItems` no entra en `loading`), el pie dice «Elige de dónde salen los clips.». **Arreglo:** contar
  `bagItems.isPending` en `loading`.
- **[1] `apps/web/src/features/wishes/PollPage.tsx:300`.** `aria-label` en un `<p>` no vale (el rol párrafo no admite
  nombre). **Arreglo:** quitarlo, o un encabezado `sr-only` «Cómo es esta votación».
- **[1] `apps/web/src/features/rpd/RpdPage.tsx:143-146`.** Al volver de la ronda, la página se monta otra vez y
  enseña una mezcla nueva, no la que se acaba de bailar. Es razonable, porque es la «siguiente ronda». Solo lo apunto
  por la pregunta de si se re-mezcla al volver: sí.

**Pendientes ya apuntados, sin cambios en esta tanda (no cuentan como nuevos):** el ranking con teclado y lector (5); en
«Un voto», `li` dentro de `radiogroup`, sin flechas, y tocar la marcada la desmarca (4); `role="alert"` al teclear a
mano un enlace a medias (`https://…`), heredado del diálogo anterior (2).

## Veredicto

**Sí, hay dos hallazgos de nota 6**, que se corrigen sí o sí:

1. Tocar la tarjeta en «Elegir para votar» no marca la canción. La miniatura tapa la capa de toque, y `whileTap`
   encoge esa capa a mitad del toque.
2. En pantalla completa, «¿Salir de la ronda?» (y «Guardar como pista» y los avisos) no se ve. La ronda queda pausada
   con los atajos apagados.

El 5 (Espacio sobre un botón pulsado con el ratón) conviene arreglarlo en la misma tanda, porque es el uso con un
portátil junto a la tele. El resto (≤3) puede ir al apartado 5 de pendientes. El punto 36 queda comprobado: solo
«Añadir a la biblioteca» crea vídeos.
