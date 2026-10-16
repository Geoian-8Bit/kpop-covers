# B2 · Ronda 1 · Interfaz de F12 (Lista de deseos) y F11 (Votaciones)

Revisión de solo lectura (no se ha tocado código, solo este informe). Estado revisado: árbol de trabajo sin commit sobre `be70973`, rama `feat/plan-completo`. Prueba en navegador contra el demo `http://localhost:5174` (Playwright, Chromium con `--mute-audio`, silenciado además por `devSilence.ts`; no se ha tocado `oneshoot.dev.sound` ni se ha añadido otro script de silencio). Dos pestañas sobre el mismo `localStorage` hicieron de «dos móviles». Guiones y capturas en el scratchpad (`b2/`). No se ha tocado Supabase real ni Vercel. Spec: `docs/plan/ideas-one-shoot.md` (F11, F12); nada de «Descartado».

**Escala de nota:** 1–10 según gravedad (10 = muy grave). 🔴 = bloquea el cierre de B2.

## Resumen

- `tsc --noEmit` limpio. `vitest` de `features/wishes`: 28 pruebas en verde (`pollRules`, `wishRules`). Las reglas puras están bien: recuento de un voto, varios votos y ranking (n − posición + 1, comprobado a mano con dos papeletas: 5/4/3 puntos), empates, `closes_at` y recuento de personas.
- Lo que va bien (verificado en el demo): «Me apunto» con y sin nombre (abre «¿Quién eres?» y sigue la acción), orden por interés (empate: la más nueva primero), proponer con enlace (enlace malo, duplicado, ya en biblioteca, miembros 1–30, dos enlaces seguidos), «Añadir a la biblioteca» (no duplica el vídeo si ya estaba: lo enlaza y la canción sale de la lista), meter en bolsa desde el menú, votar en los tres tipos, cambiar y retirar el voto, ranking con flechas y con arrastre, anónimas (no aparece ningún nombre de quien vota), resultados «al cerrar» ocultos, sorteo entre empatadas (escribe la ganadora y cierra), segunda vuelta (crea la votación con las empatadas y cierra la original sin ganadora), las que no ganan siguen en la lista con sus votos, ganadora → «Añadir a la biblioteca» / «Abrir en el estudio» / «Meter en Próxima coreo», las tres variantes del lab (`hanabi`, `noren`, `kakejiku`) a 390 px, objetivos táctiles de 44 px en ficha y papeleta, y la entrada «Próxima cover» del menú.
- **`AddVideoDialog`: sin regresiones** por pasar a `fetchYouTubeMeta` (probado: vídeo normal, dos enlaces seguidos con el primero lento —gana el último—, 422, 404 y 500; mismos mensajes y mismo relleno de título y artista que antes).
- **2 hallazgos 🔴** y 15 más. Los graves: la ganadora se escribe a partir de votos en caché que pueden tener hasta 5 minutos (🔴), y borrar una propuesta que está en una votación abierta deja la papeleta inservible (🔴; en ranking, nadie puede votar). Después: la segunda vuelta se reinicia sola cada 15 s mientras se rellena, «Meter en Próxima coreo» duplica la canción, el diálogo de cerrar desvela la ganadora cuando los resultados son «al cerrar», y se puede quitar el anonimato a una votación ya votada.

## Hallazgos

### 1. 🔴 La ganadora se escribe con los votos que hubiera en caché (hasta 5 min de antigüedad) · nota 8
- **Dónde:** `features/wishes/PollPage.tsx:131-137` (cierre automático al llegar la hora), `:143-151` y `:401-411` (cierre a mano), `data/wishes.ts:61-68` (`usePollVotes`, refresco cada 8 s solo mientras está abierta) y `App.tsx:36` (`staleTime: 5 * 60_000`).
- **Flujo:** la votación cierra a las 22:00. Alguien vota a las 21:59 desde otro móvil. Un móvil con la página abierta (o que entra pasadas las 22:00 con los votos en caché de hace menos de 5 min) escribe `closed_at` y `winner_wish_id` con el recuento que tenía; al cerrarse, `live` pasa a `false` y ya no se refresca. `cast_vote` rechaza votos desde `closes_at`, así que el recuento final es otro, pero la ganadora ya está grabada y no se puede cambiar (`poll_closed`).
- **Evidencia:** dos pestañas en el demo: votación con `closes_at` a +14 s y 1 voto para «Hype Boy». A los 9,5 s otros dos móviles votan «Supernova» (2 votos). A los 14 s la pestaña abierta cierra con `winner_wish_id` = Hype Boy (1 voto) y la pantalla enseña «Hype Boy · 1 voto» como ganadora aunque en la base «Supernova» tiene 2. Al recargar, `Results` ordena por puntos (Supernova arriba) pero resalta a Hype Boy como ganadora. Lo mismo con «Cerrar votación» a mano (el diálogo dice «Gana X» con datos de hasta 8 s, o de 5 min si se entró desde la lista). Con empate, además, se sortea sobre un empate que puede ya no serlo.
- **Arreglo:** antes de decidir la ganadora (cierre automático, a mano y antes del sorteo) pedir los votos de esa votación con `queryClient.fetchQuery({ queryKey: wishKeys.votes, staleTime: 0 })` (o `refetch()`) y calcular `outcome` con ese resultado, no con el del render; el diálogo de cierre a mano debería refrescar al abrirse. Mejor aún, y evita decidir en el cliente: una función en la base que cierre y calcule la ganadora con los votos reales.
- **Test:** con votos en caché distintos de los del servidor, `closeWith` usa los del servidor (test de `PollView` con un backend que devuelve votos nuevos en el segundo `listPollVotes`; en el demo, el guion de dos pestañas).

### 2. 🔴 Borrar una propuesta que es candidata de una votación abierta deja la papeleta rota (en ranking, nadie puede votar) · nota 7
- **Dónde:** `WishesPage.tsx:538-567` (diálogo «¿Borrar la propuesta?»: no avisa de votaciones), `data/wishes.ts:97-110` (`useDeleteWish`), `PollPage.tsx:115-121` y `Ballot.tsx:36-41,109-166` (las opciones cuya propuesta ya no existe siguen en la papeleta). En la migración actual, `cast_vote` (`20261016040000_wishes_and_polls.sql:595-600`) ya hace `join wishes … archived_at is null`.
- **Flujo:** hay una votación abierta con tres candidatas; alguien borra una desde la lista de deseos (la ficha solo dice «sale de la lista de deseos (y de sus bolsas)»). La votación sigue mostrando «Ya no está en la lista» como candidata votable y con votos. Con el endurecimiento de `cast_vote`, votar esa fila da `vote_options_invalid` («Ese voto no vale: revisa lo que has marcado.»). En **ranking** la papeleta envía siempre todas las opciones (`initial` rellena con todas), así que **nadie puede votar** y el mensaje no explica nada. En un voto o varios, solo falla si se marca la borrada.
- **Evidencia:** demo (`t14`): borrar «Hype Boy» con la votación abierta → la página sigue con «Ya no está en la lista / 1 voto» en candidatas y en resultados (el demo no replica todavía el `join` nuevo, pero el cliente sí envía la opción). Con el SQL actual, en ranking toda llamada falla.
- **Arreglo:** (a) al borrar, avisar si la propuesta está en una votación abierta («Está en «X». Si la borras, deja de ser candidata»); (b) en `Ballot`, filtrar las opciones sin propuesta (no mostrarlas ni enviarlas) y en `Results` dejarlas atenuadas; (c) mensaje más útil para `vote_options_invalid`; (d) decidir con la base qué pasa si una borrada gana (hoy: «La ganadora ya no está en la lista de deseos»). Alternativa más simple: no dejar borrar mientras esté en una votación abierta.
- **Test:** `Ballot` con una opción sin `wish`: no se ofrece y el ranking enviado no la incluye; e2e: borrar y votar en ranking funciona.

### 3. La segunda vuelta se reinicia sola cada 15 s mientras se rellena · nota 6
- **Dónde:** `PollPage.tsx:154-161` (`secondRound` es un objeto nuevo en cada render) y `PollFormDialog.tsx:79-99` (el `useEffect` depende de `preset` y vuelve a rellenar título, cierre, tipo, etc.).
- **Flujo:** empate → «Segunda vuelta» → se cambia el título o el cierre; a los pocos segundos `useNow(15_000)` re-renderiza `PollView`, el `preset` cambia de identidad y el formulario vuelve a los valores de fábrica.
- **Evidencia:** escrito «Mi título de la segunda vuelta», a los 16 s el campo vale «Segunda vuelta · Votación 1».
- **Arreglo:** `useMemo` del preset en `PollView` (dependiendo de `poll` y de `tied.join()`) y, en el diálogo, reiniciar solo al pasar `open` de `false` a `true`.
- **Test:** `PollFormDialog` abierto, escribir, re-renderizar el padre con un `preset` equivalente: el campo conserva el texto.

### 4. «Meter en Próxima coreo» duplica la canción si ya se añadió a la biblioteca · nota 6
- **Dónde:** `data/wishes.ts:269-295` (`ref = wish.added_video_id ?? wish.id` y `items.some(...)` comparando `video_id ?? wish_id` con `ref`); `PollPage.tsx:605-617` mantiene el botón tras añadir a la biblioteca.
- **Flujo:** ganadora → «Meter en Próxima coreo» (entra como `wish_id`) → «Añadir a la biblioteca» → «Meter en Próxima coreo» otra vez. La segunda vez `ref` es el id del vídeo, no coincide con el ítem de deseo y se inserta de nuevo.
- **Evidencia:** demo (`t8`): la bolsa «Próxima coreo» acaba con dos ítems de la misma canción (uno `wish_id`, otro `video_id`) y «2 canciones». En una bolsa que «se quita», la misma canción puede salir dos veces.
- **Arreglo:** comparar con las dos referencias (`wish.id` y `wish.added_video_id`) contra `wish_id` y `video_id`; al pasar una propuesta a la biblioteca, reapuntar sus ítems de bolsa (de `wish_id` a `video_id`) o tratarlos como la misma canción. De paso, si el ítem ya está pero «fuera de la bolsa» (sacado en un sorteo), «Ya estaba en «Próxima coreo»» engaña: ofrecer «Devolver».
- **Test:** `useAddToNextCoreo` con el ítem por deseo y luego por vídeo: una sola fila.

### 5. Al cerrar a mano con resultados «al cerrar» se desvela quién gana · nota 5
- **Dónde:** `PollPage.tsx:318-339` y `:401-411` (`CloseSummary`: «Gana «X»»), y `:342-362` con `TieBlock` (nombres de las empatadas), para votaciones con `results_live = false`.
- **Flujo:** en una votación «Resultados al cerrar», quien pulsa «Cerrar votación» ve en el diálogo la ganadora (o el empate) antes de cerrar, y el secreto que pidió quien la creó desaparece.
- **Evidencia:** captura del diálogo en el demo: «¿Cerrar la votación? Gana «Magnetic». Ya no se podrá votar.» con la página mostrando «Los resultados se verán al cerrar la votación.».
- **Arreglo:** si `!poll.results_live`, texto genérico («Al cerrar se verá la ganadora. Ya no se podrá votar.») y, con empate, «Hay empate: decidid cómo desempatar» sin nombres hasta cerrar.
- **Test:** con `results_live=false` el diálogo no contiene títulos de candidatas.

### 6. Se puede quitar el anonimato (o desvelar los resultados) de una votación ya votada · nota 5
- **Dónde:** `PollFormDialog.tsx:132-135` y `:274-305` (el formulario de «Editar» deja cambiar `anonymous` y `results_live` en una votación abierta con votos). La base solo congela esos campos al cerrar (`guard_poll_update`).
- **Flujo:** se crea «Anónima»; la gente vota creyendo que no se verá quién; alguien edita y pone «Con nombre»: `Results` pinta todos los nombres de los votos ya emitidos.
- **Evidencia:** lectura de código: `PollPage.tsx:471` muestra el nombre si `!poll.anonymous`, sin otra condición, y los votos ya incluyen `member_id`.
- **Arreglo:** con algún voto emitido, no dejar pasar de anónima a con nombre (ni de «al cerrar» a «en directo» si se prometió secreto), con los controles deshabilitados y una línea de motivo. Si se quiere asegurar, que lo imponga la base.
- **Test:** `PollFormDialog` en edición con votos: el segmento «Votos» queda deshabilitado en «Anónimos».

### 7. Todos los votos de todas las votaciones, sin paginar, cada 8 s · nota 5
- **Dónde:** `lib/backend.ts:1260-1264` (`listPollVotes`: `select` de todo, sin filtro de votación ni rango), `data/wishes.ts:61-68` (`refetchInterval` de 8 s en la página de una votación abierta), `WishesPage.tsx:155,577` (se vuelve a pedir en la lista).
- **Flujo:** PostgREST devuelve como mucho 1000 filas por defecto (no hay `max_rows` en `supabase/config.toml`) y el orden es `created_at` ascendente: pasado el tope se pierden los votos **más nuevos**, es decir, los de las votaciones actuales; el recuento y la ganadora salen mal sin error. Un ranking de 8 candidatas con 8 personas son 64 filas; 15 votaciones así llegan al tope. Además cada móvil con una votación abierta descarga toda la tabla cada 8 s.
- **Evidencia:** lectura de código; el valor de 1000 es el predeterminado del servicio (no probado contra Supabase real).
- **Arreglo:** `listPollVotes(pollId)` filtrando por `poll_id` en la página de la votación; para la lista, solo recuentos o los votos de las cerradas bajo demanda; `pastVotesOf` solo necesita puntuaciones por candidata.
- **Test:** `listPollVotes` pide con `poll_id`; recuento con más de 1000 filas simuladas.

### 8. Ranking: teclado y lectores · nota 5
- **Dónde:** `Ballot.tsx:264-271` (asa «Arrastrar «X»»), `:283-299` (flechas deshabilitadas en los extremos), `:272-280` (`aria-label` en un `span` sin rol).
- **Flujo:** con teclado se ordena con «Subir/Bajar» (bien, y a 44×44 px), pero: (1) el botón «Arrastrar «X»» recibe foco y se anuncia como botón, pero Enter y las flechas no hacen nada (solo `onPointerDown`); (2) al subir un elemento al puesto 1 o bajarlo al último, el botón pulsado pasa a `disabled` y **el foco se pierde en `body`** (hay que volver a tabular desde el principio de la página); (3) no se anuncia el cambio («Hype Boy, puesto 2 de 3»); (4) `aria-label` «Puesto 2» en un `span` sin rol se ignora.
- **Evidencia:** Playwright: Enter sobre «Bajar «Hype Boy»» deja `activeElement` en ese mismo botón; la segunda vez (llega al último puesto) `activeElement` es `BODY`. Enter y ArrowDown sobre el asa no cambian el orden.
- **Arreglo:** `tabIndex={-1}` y `aria-hidden` en el asa (o hacerla operable con flechas); no usar `disabled` en los extremos (usar `aria-disabled` y no mover) o devolver el foco al botón equivalente del nuevo puesto tras mover; una región `aria-live="polite"` sr-only con ««X» pasa al puesto 2 de 3»; quitar el `aria-label` del `span`.
- **Test:** e2e de teclado: Bajar dos veces sobre el primero deja el foco dentro de la lista; la región viva cambia.

### 9. «Un voto» no es un radiogroup usable con teclado · nota 4
- **Dónde:** `Ballot.tsx:112-143` (`ul` con `role="radiogroup"`, `li` y `button` con `role="radio"`).
- **Flujo:** un lector espera flechas dentro del grupo (un único tabulador, flechas para mover y marcar); aquí cada opción es un tabulador y las flechas no hacen nada. Además `ul[role=radiogroup] > li` rompe la estructura ARIA (los hijos de `radiogroup` deben ser `radio`).
- **Evidencia:** `tabIndex` de los tres radios = 0; ArrowDown con el foco en el primero no cambia nada; hijos del grupo: `LI`, `LI`, `LI`.
- **Arreglo:** `input type=radio` nativos en un `fieldset` con `legend` (flechas y un solo tabulador gratis), o `div role=radiogroup` con tabindex móvil y flechas. Para «Varios votos», `fieldset/legend` con casillas nativas.
- **Test:** ArrowDown mueve la selección; un solo tabulador entra al grupo.

### 10. Tras una acción del menú ⋯ que abre un diálogo, el foco se pierde · nota 4
- **Dónde:** `ActionMenu.tsx:88-91` (cierra el menú y desmonta el ítem) y `components/ui/Dialog.tsx` (restaura el foco en el elemento activo previo, que ya no existe).
- **Flujo:** teclado: ⋯ → «Editar» → Esc: el foco acaba en `body`, no en el ⋯ de esa ficha. Igual con «Borrar» y «Meter en una bolsa». Además, Tab dentro del menú salta entre ítems y, al salir, deja el menú abierto.
- **Evidencia:** Playwright: tras cerrar el diálogo «Editar propuesta», `document.activeElement` es `BODY`.
- **Arreglo:** en `ActionMenu`, tras `onSelect` enfocar el botón ⋯ (con `requestAnimationFrame`) antes de que se monte el diálogo, o dar al `Dialog` un elemento de retorno; cerrar el menú al perder el foco fuera.
- **Test:** e2e: abrir menú, «Editar», Esc: foco en el botón ⋯.

### 11. «Me apunto» pulsado dos veces seguidas intenta borrar una fila inventada · nota 5
- **Dónde:** `data/wishes.ts:120-137` (la fila optimista tiene un id que empieza por `optimistic-`), `WishesPage.tsx:339,344` (`row` se busca en la lista, que ya la incluye), `lib/backend.ts:1246-1249` (`removeInterest(row.id)`).
- **Flujo:** móvil con red lenta: «Me apunto» y, antes de que vuelva la respuesta, se toca otra vez para deshacer. El segundo toque usa la fila optimista y manda un borrado con ese id: la base responde con un error de sintaxis de uuid, sale un mensaje raro y `onError` restaura el estado previo; el apunte real queda puesto aunque la persona lo quitó.
- **Evidencia:** lectura de código (el demo responde al instante y no deja ver la ventana).
- **Arreglo:** ignorar los toques mientras haya una mutación de interés en curso para esa ficha (`toggleInterest.isPending`) o encadenarlas, y no usar filas optimistas como referencia de borrado.
- **Test:** `useToggleInterest` con `addInterest` diferida: dos toques seguidos acaban en un estado coherente y sin llamada con id optimista.

### 12. Identidad antigua: «Elegir mi nombre» y «Me apunto» no hacen nada · nota 4
- **Dónde:** `features/wishes/identity.ts:9-12` (`withMe` usa `useIdentity.getState().memberId` sin comprobar que el miembro siga existiendo), `Ballot.tsx:99-105`, `data/wishes.ts:29` y `:37` (`wish_interest_invalid` se enseña como «Esa canción ya no está en la lista.»).
- **Flujo:** el móvil recuerda un miembro que luego se borró (archivado). `useMe()` da `null`, la papeleta pide elegir nombre, pero `withMe` ya tiene un id y ejecuta la acción vacía: no se abre «¿Quién eres?» y el botón no hace nada. «Me apunto» envía el id antiguo y falla con un mensaje que habla de la canción, no de la persona.
- **Evidencia:** demo con `oneshoot.me.v1` apuntando a un miembro inexistente: ningún diálogo ni reacción en «Elegir mi nombre para votar» ni en «Me apunto».
- **Arreglo:** `withMe` debe comprobar con `currentMemberId(members)` (o `useMe`) y abrir el aviso si el id no existe; separar el error de persona del de canción (`wish_interest_invalid` sirve para los dos) o validar antes de enviar.
- **Test:** `withMe` con identidad inexistente abre el diálogo.

### 13. Cierre por hora: sin reintento, reloj del móvil y vista de lista · nota 4
- **Dónde:** `PollPage.tsx:131-137` (`autoClosing` impide reintentar y se traga el error), `:254-259` (queda «Cerrando la votación…» para siempre), `pollRules.ts:26-29` (`needsClosing` con la hora del móvil), `WishesPage.tsx:178-182` y `pollRules.ts:172` (la lista).
- **Flujo:** (a) el primer intento de cierre falla (sin red, otro error) → el spinner no se va y no se reintenta hasta recargar. (b) Un móvil con el reloj adelantado ve «ya es la hora» y escribe el cierre antes de tiempo: el servidor sella `closed_at` con `now()` sin comprobar `closes_at`, y desde ese momento `cast_vote` rechaza los votos que quedaban. (c) Mientras nadie abre la votación, la lista la da por cerrada pero sin `winner_wish_id`: ninguna ficha dice «Ganó…» y la ganadora real aparece como una más que «perdió», con «N votos en «X»» (`pastVotesOf` solo excluye a la ganadora grabada).
- **Evidencia:** lectura de código; (c) comprobable cerrando por hora una votación sin abrirla.
- **Arreglo:** botón «Reintentar el cierre» cuando falle; que decida la base (función `close_poll` que compruebe `closes_at <= now()` y calcule la ganadora, ver hallazgo 1); en la lista, tratar «cerrada por hora sin ganadora» como pendiente de cerrar (o cerrarla desde la lista al cargar).
- **Test:** con `updatePoll` fallando aparece el reintento; `pastVotesOf` no cuenta como perdida una votación cerrada por hora sin ganadora.

### 14. Textos: «(F2)» en la pantalla, y las candidatas no se ven sin nombre · nota 3
- **Dónde:** `Ballot.tsx:101` y `:99-106`.
- **Flujo:** quien no ha dicho quién es lee «Cada persona vota una vez con su nombre del grupo (F2).»: «F2» es el código interno del plan. Además, hasta elegir nombre no ve ni las candidatas.
- **Evidencia:** captura del demo sin identidad.
- **Arreglo:** quitar «(F2)» y mostrar las candidatas (deshabilitadas) con el botón «Elegir mi nombre para votar» encima.
- **Test:** el texto no contiene un código tipo `(F2)`.

### 15. La ganadora se «estrena» en cada visita y retrasa las acciones · nota 3
- **Dónde:** `PollPage.tsx:553-623` (`WinnerBlock`: `shown` pasa a `true` al terminar `REVEAL_MS`, hasta 2,6 s con `hanabi`).
- **Flujo:** quien vuelve semanas después a una votación cerrada para pulsar «Añadir a la biblioteca» espera la animación completa; los botones aparecen con retraso.
- **Evidencia:** lectura de código y captura a 0,7 s sin botones.
- **Arreglo:** animar solo la primera vez que esa persona abre el cierre (p. ej. una marca en `localStorage` por votación) o mostrar los botones desde el principio con el revelado encima; mantener «Ver otra vez».
- **Test:** al reabrir una votación ya vista, los botones están en el DOM desde el primer pintado.

### 16. Rendimiento de la lista de deseos (pasada cuadrática en cada render) · nota 3
- **Dónde:** `WishesPage.tsx:255` (`past={pastVotesOf(...)}` por ficha, sin memoizar) y `pollRules.ts:163-184`.
- **Flujo:** por cada ficha se recorren todas las votaciones y se vuelve a contar cada una; con 200 propuestas, 20 votaciones y sus votos, cada render (cada 30 s por `useNow`, y en cada «Me apunto») repite el recuento completo.
- **Evidencia:** lectura de código; no medido.
- **Arreglo:** calcular una vez `tally` por votación cerrada (`useMemo`) y construir el mapa de propuesta a sus votaciones pasadas.
- **Test:** la versión en bloque devuelve lo mismo que `pastVotesOf` por ficha.

### 17. Detalles menores · nota 2
- `PollFormDialog.tsx:113-117`: editar solo el título de una votación que cierra en menos de 1 min da «Elige una fecha y hora futuras.» y no deja guardar.
- `PollPage.tsx:154-161`: la segunda vuelta de una segunda vuelta acumula «Segunda vuelta · Segunda vuelta · …» (cortado a 80); la lista de votaciones enseña «Cerrada» sin decir «Hubo empate: segunda vuelta».
- `WishesPage.tsx:239`: «Elegir para votar» se deshabilita con menos de 2 propuestas sin explicarlo.
- `WishesPage.tsx:119-122`: `aria-controls` de la pestaña inactiva apunta a un panel que no existe.
- `lib/youtubeMeta.ts:19-23`: el aviso del 422 («Descárgalo y súbelo como archivo.») no tiene sentido al proponer una canción, donde no se sube nada.
- `VoteReveal.tsx:49-53`: `role="status"` con `aria-label` en un contenedor recién montado no se anuncia de forma fiable; el contenido sí está en el DOM.
- Desviación de la spec sin importancia: F11 dice «sorteo entre las empatadas (usando las bolsas de F13)»; el sorteo es propio (`drawAmongTied` y `TieDraw`) y no pasa por una bolsa. Cumple el efecto; el historial de bolsas no lo recoge.
- Demo (`lib/backend.ts:1491-1523`): `castVote` no replica el `join` con `wishes` nuevo de la base (ver hallazgo 2); conviene igualarlo para que las pruebas lo cojan.

## Revisado sin hallazgos

- **Recuento:** ranking con papeletas incompletas o con huecos de rango (`tally` ordena por `rank` y reparte n − posición + 1), votos repetidos, opciones ajenas; `leaders` y `outcomeOf`; desempate por orden de opciones.
- **Carreras de cierre entre dos móviles:** dos cierres a la vez (gana uno; el otro recibe `poll_closed`, se traga el error en el cierre automático y, en el sorteo, se refresca y pasa a la ganadora grabada). El sorteo en dos móviles a la vez deja un instante la animación de uno y la ganadora del otro, y se arregla solo.
- **Anónimas:** ningún nombre en el DOM de resultados, cabeceras ni listas. Las filas siguen leyéndose en la red por diseño, documentado en la migración.
- **Bolsas:** ítems por deseo con miniatura, «De la lista de deseos» y botón «Ver en la lista de deseos» o «Abrir en el estudio» según `added_video_id`.
- **Sin descargas de YouTube:** solo miniaturas `i.ytimg.com` por `img` y enlace `target="_blank"` con `rel="noreferrer"`.
- **Colores y movimiento:** sin hex ni rgb propios (salvo sombras negras), solo tokens (`sakura`, `fuji`, `kiji-*`… existen en `index.css`); presets `jelly`, `snappy` y `soft` de `lib/motion`.

## Orden de arreglo sugerido

1. Hallazgos 1 y 2 (bloquean): refrescar los votos antes de decidir y arreglar el borrado de candidatas (en ranking nadie puede votar).
2. 3, 4, 5 y 6 (rápidos y visibles).
3. 7 y 13 (recuento y cierre en manos de la base: una función `close_poll` resolvería 1, 13 y parte del 7).
4. 8 a 12 (accesibilidad y robustez), después 14 a 17.
