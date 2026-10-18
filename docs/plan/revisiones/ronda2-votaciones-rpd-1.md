# Revisión · Ronda 2 de la prueba manual, puntos 52–54 (votaciones y Random Play Dance), ronda 1

**Revisor:** solo lectura (18-10). Rama `feat/plan-completo`, cambios sin commit.

## Alcance

- **52 · Votaciones:** `features/wishes/PollFormDialog.tsx`, `PollPage.tsx`, `Ballot.tsx`, `WishesPage.tsx` (lista de
  votaciones y «votos pasados»), `pollRules.ts` y su test, `data/wishes.ts` (`useCreatePoll`, `useUpdatePoll`),
  `lib/backend.ts` (bloque F11/F12: `PollPatch`, `NEW_POLL_RULES`, `insertPoll` de Supabase y de la demo, gemelo de
  `guard_poll_update`). Contrastado con `supabase/migrations/20261016040000_wishes_and_polls.sql` (tablas, `cast_vote`,
  `guard_poll_update`, `guard_option_insert`, permisos por columna, políticas RLS de `poll_votes`),
  `20261016080000_close_poll_zero_votes.sql`, `20261017010000_close_poll_live_rank.sql` y
  `packages/shared/src/database.types.ts`.
- **53 · RPD crear:** `features/rpd/RpdPage.tsx` (cabecera y `RoundBuilder`).
- **54 · RPD ronda:** `RpdPlayPage.tsx` (`useFullscreen`, teclado, «Atrás», capa), `RandomPlayScreen.tsx`,
  `RoundControls.tsx`, `fullscreenRules.ts` y su test (nuevos). Comparado con la pantalla completa del estudio
  (`StudioPage.tsx`, `useFullscreen` y capa CSS) y con `lib/viewport.ts` / `viewportRules.ts` (punto 47).

**Ejecutado:**
- `pnpm typecheck`: limpio (shared y web).
- `pnpm test`: shared 139/139; web 53 ficheros, 695/695. En mi zona: `pollRules` 22, `wishRules` 11, `roundRules` 33,
  `fullscreenRules` 3, `viewportRules` 5.
- No se ha abierto el navegador ni la base real (reglas del encargo). Las medidas de móvil son cálculos sobre las
  clases, no capturas.

**Lo que se cumple:**
- **52.** El formulario ya no ofrece cierre, resultados ni anonimato. `insertPoll` (Supabase y demo) escribe
  `NEW_POLL_RULES` (`results_live = true`, `anonymous = false`, `closes_at = null`). `cast_vote` y `close_poll` aceptan
  `closes_at` nulo sin cambios. Editar solo manda el título, y el permiso por columna lo admite. No queda
  `resultsVisible`, `hasVotes`, `KEEP_PROMISE` ni `nextSundayEvening`, y no hay imports sin usar. Los nombres de las
  votaciones antiguas anónimas solo se pintaban en `Results`, y ahora pasan por `showsVoterNames`. Ni `Ballot` (solo tu
  voto), ni `WishesPage` (recuentos y puntuaciones), ni `WinnerBlock` / `TieBlock` muestran quién votó. La segunda
  vuelta sigue igual: cierra la madre con `'none'`, crea la hija con `parent_poll_id` y ahora siempre con nombre, en
  directo y a mano. Las votaciones antiguas con plazo se siguen cerrando solas: `needsClosing`, el temporizador y
  `pollSummary` aún muestran «Cierra en …».
- **53.** A 390 px la cabecera cabe en una línea. Hay unos 330 px útiles y se ocupan unos 330: «Random Play Dance» en
  22 px (unos 205 px), más el botón, más el `-mr-2`. Si no cupiera, el `h1` se cortaría con puntos suspensivos. El
  botón mide 44 px de alto.
- **54.**
  - El árbol es el mismo: dentro y fuera de pantalla completa solo cambian clases, y `p.stage` no se vuelve a montar.
  - Vertical: el vídeo va arriba y debajo una fila de 5 botones de unos 68×56 px. Horizontal: una columna de 5,75 rem a
    la derecha. La barra nunca tapa el vídeo.
  - La tarjeta Kamishibai solo sale en la pausa y la cuenta atrás (`covered = lead != null`). Mientras suena no hay nada
    visible encima, solo el cubre-toques transparente, igual que en el estudio.
  - Zona segura: `LAYER` aplica `env(safe-area-inset-*)`.
  - En iPhone, sin la API de pantalla completa, entra en el modo CSS. Si el navegador rechaza la petición, también.
  - Esc: con la pantalla completa del navegador la gestiona el navegador. En el modo CSS sale de pantalla completa y
    no de la ronda.
  - La ronda no cambia: los mismos manejadores (pausa, repetir, saltar, terminar, `data-round-pause`, atajos) y el
    reductor intacto.

## Hallazgos (de mayor a menor)

- **[3] apps/web/src/features/wishes/PollPage.tsx:322-328 (y `pollRules.ts:8-10`): las votaciones antiguas «al
  cerrar» enseñan ya los resultados, y con nombres.** Se quitó `resultsVisible`, así que una votación abierta con
  `results_live = false` muestra el recuento en directo. Si no era anónima, también enseña quién votó qué. El
  comentario de `pollRules.ts` lo justifica diciendo que «el recuento nunca reveló quién votó», y eso solo vale para
  las anónimas. *Escenario:* una votación creada en la versión 139 con «Resultados al cerrar» y «Con nombre», aún
  abierta. Al desplegar, todos ven quién va ganando y qué votó cada uno, cuando al votar se les dijo otra cosa.
  *Arreglo:* elegir una de dos.
  (a) Mantener la regla solo para filas antiguas: `resultsVisible = results_live || isPollClosed`, con el aviso
  «Los resultados se verán al cerrar» y el test que se borró.
  (b) Aceptarlo, y comprobar antes en producción que no hay ninguna:
  `select id, title from polls where archived_at is null and closed_at is null and results_live = false`. En ese caso,
  corregir el comentario.

- **[3] apps/web/src/features/rpd/RpdPlayPage.tsx:200-215: al salir del modo CSS (iPhone) no se llama a
  `refitViewport()`.** El estudio sí lo hace al cerrar su capa CSS (`StudioPage.tsx:1189-1192`, punto 47): «el
  navegador no anuncia ninguna salida». La ronda solo se reajusta con los eventos de rotación y `fullscreenchange`, y
  el modo CSS no dispara este último. *Escenario:* en iPhone, pantalla completa en vertical, giras a horizontal,
  vuelves a vertical y tocas «Pantalla completa». La capa vuelve a su diseño normal sin el reajuste que el estudio
  consideró necesario. Si Safari dejó escala o desplazamiento de la otra orientación, la página queda descolocada, que
  es justo lo que se pidió comprobar.
  *Arreglo:* en `useFullscreen`, un efecto sobre `mode` que llame a `refitViewport()` al pasar de `'css'` a
  `'none'`, y también al desmontar en `'css'`. Es el mismo patrón que en el estudio.

- **[3] apps/web/src/features/rpd/RoundControls.tsx:40-48 (con `RpdPlayPage.tsx:676`): al entrar o salir de pantalla
  completa se pierde el foco.** `compact` cambia el elemento raíz de `RoundControls` (de `div[role=group]` de dos
  niveles a `CompactControls`). React desmonta los botones y el botón «Pantalla completa» que tenía el foco
  desaparece. El foco cae a `body`. *Escenario:* con teclado o lector de pantalla, Intro sobre «Pantalla completa».
  El lector no anuncia nada y el siguiente Tab empieza desde el principio de la ronda: en la columna de la derecha,
  el cubre-toques «Pausar» va antes que la barra. Los atajos siguen funcionando.
  *Arreglo:* marcar el botón con `data-fs-toggle` y, en un `useLayoutEffect` sobre `fullscreen.mode`, devolverle el
  foco si estaba en la barra o en `body` (`focus({ preventScroll: true })`).

- **[3] apps/web/src/features/rpd/RandomPlayScreen.tsx:170 y RoundControls.tsx:136/152: en horizontal la columna
  puede no caber en móviles bajos.** En horizontal la columna apila 5 botones: tres de unos 51 px (icono de 20 +
  texto de 12 + `py-1.5`), «Terminar» de unos 49 y «Pantalla completa» de unos 64, porque en 88 px útiles va en dos
  líneas. Con los huecos y la línea «n/N» suma unos 308 px. `FS_ROOT` corta lo que sobresale (`overflow-hidden`) y la
  columna va centrada (`justify-center`). En el modo CSS de iPhone la barra de Safari sigue visible. En un iPhone 13
  mini en horizontal quedan unos 296 px tras la zona segura: se cortarían unos 6 px arriba (Pausa) y otros 6 abajo.
  En un iPhone 14 queda un margen de unos 3 px. *Escenario:* iPhone mini o SE con Safari, ronda en pantalla completa
  y móvil girado: el botón de abajo queda recortado.
  *Arreglo:* en horizontal, quitar la línea «n/N» o pasarla junto a un botón, y dar a la columna
  `overflow-y-auto overscroll-contain` como red. O bajar a `landscape:min-h-11` con `gap-0.5` y una etiqueta corta
  (ver el hallazgo de la etiqueta). Probarlo a 812×375 y 667×375 con la barra de Safari.

- **[2] apps/web/src/features/wishes/PollFormDialog.tsx:192-195: al editar una votación antigua el texto es falso.**
  Siempre dice «Resultados en directo y votos con nombre. Se cierra a mano». *Escenario:* «Editar» en una votación
  antigua anónima o con plazo: los nombres siguen ocultos (`showsVoterNames`) y se cierra sola a su hora.
  *Arreglo:* al editar, mostrar el texto solo si `!poll.anonymous && !poll.closes_at`, o no mostrarlo (al editar
  solo cambia el título).

- **[2] apps/web/src/features/rpd/RpdPage.tsx:245-246: nombre accesible de «Pistas».** Antes el botón se llamaba
  «Pistas guardadas (3)». Ahora el nombre sale de «Pistas» + « guardadas» (oculto) + «3» sin separador: según el
  navegador queda «Pistas guardadas3». *Arreglo:* `<span className="sr-only"> guardadas: </span>`, o
  `aria-label={`Pistas guardadas (${saved})`}`, que sigue empezando por el texto visible «Pistas».

- **[2] apps/web/src/features/rpd/RoundControls.tsx:181: con la pantalla completa puesta, el botón para salir se
  llama «Pantalla completa».** Tiene `aria-pressed` pero el texto visible no cambia. En el estudio, el botón
  equivalente se llama «Salir de pantalla completa» (`StudioPage.tsx:1765`). En el modo CSS de iPhone es la única
  forma de salir. *Arreglo:* en `CompactControls`, un texto corto y claro, por ejemplo «Salir pant.», «Reducir» o
  «Ventana», con `aria-label="Salir de pantalla completa"`.

- **[2] apps/web/src/features/rpd/RpdPlayPage.tsx:513-515: «Atrás» en el modo CSS no hace lo mismo que en la
  pantalla completa del navegador.** En Android, «Atrás» con la pantalla completa del navegador solo sale de ella.
  En el modo CSS, el gesto de volver de iOS abre «¿Salir de la ronda?» con la pantalla completa aún puesta. El
  estudio hace lo mismo, así que no es una regresión, pero el encargo pide coherencia. *Arreglo opcional:*
  `useBackToClose(fullscreen.mode === 'css' && !confirmExit && !saving, () => fullscreen.toggle())`, que tome la
  entrada antes que el guardia de la ronda (`guardWanted && fullscreen.mode !== 'css'`).

- **[2] apps/web/src/features/rpd/RpdPlayPage.tsx:566: Esc con la pantalla completa del navegador depende del
  momento del evento.** La rama que pregunta «¿Salir de la ronda?» comprueba `!document.fullscreenElement` en vez del
  modo. Si un navegador manda el `keydown` de Esc después de salir de pantalla completa, la misma tecla saca de
  pantalla completa y además pregunta si salir de la ronda. Ya pasaba antes. *Arreglo:* añadir
  `&& fullscreen.mode === 'none'`, porque en el cierre de ese momento el modo sigue siendo `'native'`.

- **[2] RPD sin crédito de YouTube (ya estaba).** El estudio muestra «Ver en YouTube» en su escenario y en su pantalla
  completa (`StudioPage.tsx:1013`, `:1330`), citando las políticas de la API. La ronda no lo muestra en ningún
  diseño, y ahora en pantalla completa enseña un vídeo de YouTube sin ninguna atribución (`controls: 0`). Fuera de lo
  que se pidió literalmente. *Arreglo:* si se quiere ser coherente con el estudio, un enlace pequeño «YouTube» en la
  línea «n/N» de la barra, fuera del vídeo.

- **[1] apps/web/src/features/rpd/RoundControls.tsx:113-117: código muerto.** El diseño de dos niveles ya no se pinta
  con la pantalla completa puesta, así que `fullscreen.on ? <Minimize2/> : …` siempre elige `Maximize2` y
  `aria-pressed` siempre vale `false`. El tipo `fullscreen?: … | null` tampoco llega nunca a `null`. *Arreglo:*
  dejar solo `Maximize2` y quitar `aria-pressed`, o dejarlo comentado como defensa.

- **[1] apps/web/src/features/rpd/RpdPage.tsx:170: se pierde el encabezado «Nueva ronda».** La sección pasa a
  `aria-label` y la navegación por encabezados salta de «Random Play Dance» a «Pistas guardadas». Es lo que se pidió
  (solo el título). *Arreglo opcional:* un `<h2 className="sr-only">Nueva ronda</h2>` con `aria-labelledby`.

- **[1] supabase/migrations/20261016040000_wishes_and_polls.sql:654 (y el permiso de `update`, :355): la base sigue
  aceptando las opciones quitadas.** `anon` aún puede insertar o editar `results_live`, `anonymous` y `closes_at`. La
  app ya no los manda, así que solo importa si se quiere que la regla del 52 también la imponga la base. *Arreglo
  opcional:* una migración que quite esas columnas de los permisos de `insert` y `update`, o un trigger que fije los
  valores en el insert. Después, regenerar `database.types.ts` y comprobar los advisors.

**Pendiente de verificar en un dispositivo** (no se ha podido aquí):
- Android: pantalla completa del navegador en vertical y en horizontal, girar dentro y salir.
- iPhone: modo CSS en los dos sentidos, salir después de girar.
- 390×844 y 844×390 con toques reales.
