# B3 · Ronda 1 · F16 Cuenta atrás al próximo evento y F15 Reacciones en las tomas compartidas

Revisión de solo lectura (BD, capa de datos e interfaz). Alcance: `supabase/migrations/20261016050000_events_and_reactions.sql`,
`supabase/tests/plan_b3_checks.sql`, `apps/web/src/features/events/*`, `apps/web/src/features/reactions/*`, `data/events.ts`,
`data/reactions.ts`, bloque `eventsBackend` de `lib/backend.ts` (Supabase y demo), tipos de `packages/shared`, `App.tsx`,
`AppShell.tsx`, `LibraryPage.tsx`, `TakesPanel.tsx` y los dos momentos del laboratorio (`event-countdown`, `reactions`).
Nada aplicado en ningún entorno; no se ha tocado Supabase real ni Vercel. Todo el sonido apagado (demo silenciada + Chromium con
`--mute-audio`). Sondas propias solo en el scratchpad (`b3r1/`).

## Resumen

La base de datos está bien hecha y no he encontrado ningún fallo de seguridad ni de integridad. La interfaz funciona de punta a punta en la demo
(portada, listado, detalle, repertorio, bolsa y pista desde el evento, reacciones con «¿Quién eres?», «Ahora no», reversión por error),
con las tres variantes de cada momento revisadas y sin desbordes a 360 px. **No hay nada que bloquee** (ningún 🔴). Lo más relevante:

1. La hoja del calendario koyomi dice «AYER» para un evento de hace dos días, y los farolillos del chōchin se encienden todos en un evento pasado (H1).
2. Un evento que ya ha empezado hoy tapa en la portada al siguiente evento hasta la medianoche (H2).
3. «Crear pista con los estribillos» mete también los clips «Pre-estribillo» (H3).
4. El «sello» de hanko (la variante recomendada) no se anima en el primer toque de cada botón (H4).
5. El titular de la cuenta atrás es `aria-live` y cambia cada minuto el último día: un lector de pantalla lo anunciaría cada minuto (H5).

Comprobado y correcto:

- `pnpm db:test`: 18/18 migraciones, 7/7 ficheros, 73 PASS (5 de `plan_b3_checks.sql`). `pnpm typecheck` en verde. Vitest de
  `features/events`, `features/reactions` y `features/lab`: 51 tests en verde.
- `archive_row`: la última versión (`20261016070000_follow_paths.sql`) es superconjunto de todas: videos (+ follow_paths), bags, tracks, polls,
  **events** (con sus `event_songs`) y la lista plana con `event_songs`, `take_reactions`, `wishes`, `wish_interest`, `poll_options`,
  `follow_paths`. `040000` y `050000` no incluyen `follow_paths`, pero solo importa si se aplican después de `070000` (ver nota al final).
- Sondas SQL como `anon` (PGlite, ver «Evidencia SQL»): vídeo de otro grupo o archivado en el repertorio → `event_song_invalid`; evento archivado →
  `event_not_found`; reacción sobre toma de otro grupo o no compartida → `reaction_take_invalid`; segunda reacción igual de la misma persona o
  de «sin nombre» → `take_reactions_once_key`; un `member_id` de otro grupo se guarda como `null`; `crew_id`, `created_at` y `archived_at` enviados por el
  cliente se ignoran o se rechazan (`permission denied`); emoji desconocido → `check_violation`; `update` de columnas no concedidas → `permission denied`.
- Zona horaria: `calendarDaysBetween` cuenta días de calendario con `Date.UTC` de los componentes locales (el cambio de hora no duplica días); «Hoy»/«Ayer»
  y el ocultado a las 24 h funcionan; el test fija la zona con `TZ` (Tokyo, Los Ángeles, Madrid en el cambio de octubre y de marzo).
- Rendimiento: un solo `setInterval` de 30 s por pantalla (más `visibilitychange`), re-render barato; la lista de reacciones es una consulta por canción.
- Textos en español de España y presets (`jelly`, `snappy`, `soft`) correctos; solo hay `rgb(...)` literales en sombras decorativas.

---

## H1 · Koyomi pone «AYER» en eventos pasados y el chōchin los enciende todos · 5/10

- Dónde: `apps/web/src/features/events/EventCountdown.tsx:80-91` (`pageFace`, rama `default`) y `:137-141` (`litLanterns`).
- Flujo: abrir `/eventos/:id` de un evento que empezó hace más de un día (se llega desde «Pasados»).
- Evidencia (demo, evento de hace dos días): titular «Ya pasó», pero la hoja del calendario dice «AYER» con 祭 (captura `b3r1/past.png`).
  `pageFace` trata igual `recent` y `past` (`default`). `litLanterns` devuelve 7 para todo lo que no sea `days`/`hours`, así que un evento pasado se ve
  con los siete farolillos encendidos, igual que el día del evento (el balanceo solo se aplica a `today`, pero el estado encendido es idéntico).
  El sunadokei lo resuelve bien (arena toda abajo).
- Arreglo: `case 'recent'` → 祭 / «Ayer»; `case 'past'` → 終 (o 祭) / «Pasó». En `litLanterns`: `today` y `recent` → 7, `past` → 0.
- Test: exportar `pageFace` (como ya se hace con `litLanterns`/`sandRun`) y comprobar que `past` da la unidad «Pasó» y que `litLanterns` de `past` vale 0.

## H2 · Un evento de hoy que ya ha empezado tapa al siguiente en la portada · 5/10

- Dónde: `apps/web/src/features/events/eventRules.ts:65-79` (`nearestEvent`); el test que lo fija es `eventRules.test.ts:141`
  («keeps today’s one even once it has started, ahead of later ones»).
- Flujo: hay dos eventos, un «Taller» hoy a las 12:10 y el «Showcase» dentro de 13 días. A las 22:20 la portada muestra
  «Taller · Hoy · Ya ha empezado» y no hay cuenta atrás hacia el Showcase hasta pasada la medianoche (entonces el taller pasa a `recent` y pierde).
  Lo mismo con dos eventos el mismo día: el de la mañana (empezado) tapa al de la tarde (por venir), que es el «más cercano» de verdad.
- Evidencia (demo, captura `b3r1/home.png`): banner «Ayer fue el taller · Hoy · Ya ha empezado · 12:10» con el Showcase («Faltan 13 días») oculto;
  en `/eventos` el evento empezado aparece en «Próximos».
- Impacto: el spec dice «en la portada sale el más cercano» y «al pasar la fecha, se archiva solo». Un evento que empezó hace 10 horas no es el más
  cercano por venir, y la portada pierde su función (contar hacia el siguiente) justo el día de un evento.
- Arreglo: ordenar por categoría: primero los no empezados (el de menor `starts_at`); solo si no hay ninguno, el empezado de hoy (el más reciente) y
  luego el de ayer. Si se quiere conservar «Ya ha empezado» durante el propio evento, limitarlo a unas horas (p. ej. 3 h) en vez de hasta la medianoche.
- Test: cambiar el caso de `eventRules.test.ts:141` a «el próximo gana sobre el de hoy ya empezado» y añadir «dos eventos hoy: a las 12:00 gana el de las
  20:00; a las 21:00 (sin ninguno por venir) gana el de las 20:00».

## H3 · «Pista con los estribillos» incluye «Pre-estribillo» y similares · 4/10

- Dónde: `apps/web/src/features/events/eventRules.ts:201` (la expresión `CHORUS`: estribillo, chorus, coro, hook), usada en `chorusClips`.
- Flujo: la canción tiene clips «Intro», «Pre-estribillo» y «Estribillo». «Crear pista con los estribillos».
- Evidencia (demo): la pista creada contiene «Pre-estribillo» y «Estribillo» de la canción (además de «Puente» de la otra, que no tiene ninguno con
  nombre de estribillo y aporta todos los suyos, como dice el texto del botón). La expresión no tiene límite por la izquierda: casa con «Pre-estribillo»,
  «Post-chorus», «Pre chorus»; y `hook` casa con «Hooked» o «Shook».
- Arreglo: límites de palabra con Unicode (que antes y después de la palabra no haya otra letra) y descartar antes los que empiecen por pre o post.
- Test: en `connections` añadir «Pre-estribillo», «Post-chorus» y «Hooked» como no estribillos, y «Estribillo final», «Coro 2», «Chorus» como sí.

## H4 · El sello hanko no se estampa en el primer toque de cada botón · 4/10

- Dónde: `apps/web/src/features/reactions/ReactionBar.tsx:107-116` (`useJustAdded`) y `:163-173` (el `initial` del sello depende de `burst`).
- Flujo: abrir la pestaña «Tomas» (variante hanko, la recomendada) y tocar 🔥 por primera vez.
- Evidencia (demo, observador de mutaciones + muestras por fotograma): en cuanto aparece el sello, su transformada ya es la final
  (escala 1, giro de −4°, opacidad 1) en todos los fotogramas (0, 7, 16, 41, 54, 66 ms…). Solo a partir del segundo «poner/quitar» sobre ese
  mismo botón se ve la animación (muestras con escala 1,25 y opacidad 0,6). Causa: `burst` se incrementa en un efecto, un render después de que
  `mine` pase a `true`; el sello se monta en ese primer render con `burst === 0` y sin animación inicial.
- Arreglo: marcar el toque en el propio `onClick` (estado `armed` que se activa al pulsar y se apaga cuando `mine` cambia) y usarlo como condición del
  `initial`; o calcular «acaba de añadirse» durante el render comparando con el valor previo guardado en un `useState`.
- Test: no hay forma barata en vitest; comprobar a mano en la demo (primer toque tras recargar) o extraer la regla («mine pasó de false a true») y probarla.

## H5 · `aria-live="polite"` en un titular que cambia cada minuto · 4/10

- Dónde: `apps/web/src/features/events/EventCountdown.tsx:53`.
- Flujo: el último día el titular es «Faltan 12 h 20 min» y `useNow` lo refresca cada 30 s, así que cambia cada minuto. Está en la portada, siempre
  montado, y en el detalle del evento.
- Evidencia: lectura del código (el texto depende de `durationWords(hours, minutes)`; no hay `aria-atomic` ni `off`). Un lector de pantalla
  anuncia cada cambio de una región `polite` aunque la persona esté leyendo otra cosa.
- Arreglo: quitar `aria-live` (el titular se lee al llegar a él) o usar `role="timer"` (lleva `aria-live="off"` implícito).
- Test: de interfaz; comprobar que el párrafo del titular no tiene `aria-live`.

## H6 · La pista creada desde el evento puede quedar con nombre duplicado · 3/10

- Dónde: `apps/web/src/data/events.ts:198-201` (nombre «Estribillos · {evento}» cortado a 80). La bolsa sí usa `uniqueName` (`:167`).
- Flujo: pulsar «Crear pista con los estribillos» dos veces (o en dos eventos con el mismo nombre).
- Evidencia (demo): las dos pistas se llaman «Estribillos · Showcase de diciembre»; las bolsas salieron «Candidatas · …» y «Candidatas · … (2)».
  `tracks` no tiene índice único, así que no falla: solo hay dos pistas indistinguibles en «Pistas guardadas».
- Arreglo: pasar el nombre por `uniqueName` con los nombres de `bagsBackend.listTracks()` y tope 80.
- Test: `uniqueName` ya está probado; añadir el caso de la pista o un test del hook con el backend demo.

## H7 · Un fotograma de «Aún no hay canciones» al abrir un evento con repertorio en caché · 3/10

- Dónde: `apps/web/src/features/events/EventPage.tsx:77` (estado `order` inicial vacío) y `:84-86` (el efecto copia `songs.data`).
- Flujo: abrir `/eventos` y entrar en un evento que ya tiene canciones y cuya consulta está en caché (`songs.isPending` es falso desde el primer render).
- Evidencia (demo): un observador de mutaciones detecta el texto «Aún no hay canciones» en el DOM una vez antes de que el efecto pueble `order`
  (el contador también marca 0 un instante). Si llega a pintarse, es un parpadeo de un fotograma. No lo he podido ver a ojo.
- Arreglo: inicializar el estado con `songs.data` si existe, o derivar `order` de `songs.data` mientras no haya arrastre.
- Test: de interfaz; no debe aparecer el estado vacío si hay canciones en caché.

## H8 · Lagunas en `plan_b3_checks.sql` · 3/10

- Dónde: `supabase/tests/plan_b3_checks.sql`.
- Qué no comprueba (todo lo he verificado a mano y funciona, así que son solo regresiones sin red): vídeo de otro grupo o archivado en el
  repertorio (`event_song_invalid`); alta sobre un evento archivado (`event_not_found`); `position` fuera de 0–999; reacción sobre toma archivada o
  de otro grupo; `member_id` ajeno guardado como `null`; `archived_at`, `crew_id` y `starts_at` forzados desde el cliente; que quitar y volver a poner una
  reacción crea una fila nueva sin chocar con `take_reactions_once_key`.
- Arreglo: añadir un bloque con esos casos (mismo patrón de bloque `do` con excepción que ya usa el fichero). Para quien lo escriba: `members` tiene un
  trigger que fuerza `crew_id` al grupo por defecto, así que para probar «miembro de otro grupo» hay que insertarlo con
  `set local session_replication_role = replica`; y archivar de golpe todas las filas de una tabla activa `bulk_delete_blocked`.

## H9 · «Sin nombre» comparte hueco: el «tuyo» puede ser el de otra persona · 3/10

- Dónde: `reactionRules.ts:27-38` (`mine`) y `:49-57` (`toggleReaction`); índice `take_reactions_once_key` (coalesce a uuid cero) en la migración.
- Flujo: dos móviles sin nombre. A toca 🔥. B (con la lista refrescada) ve 🔥 «incluida la tuya» pulsado y, al tocar, **quita la reacción de A**.
- Evidencia: lectura del código y de la regla; el comentario del módulo lo documenta como decisión (un hueco «sin nombre» por emoji) y el test
  «without a name, toggles the shared sin nombre slot» lo fija.
- Impacto: se pierde una reacción ajena sin aviso. No es grave en un grupo de confianza, pero la etiqueta miente («incluida la tuya»).
- Arreglo (barato): sin nombre, que la etiqueta diga «incluida la de alguien sin nombre»; a más largo plazo, guardar un `device_id` en la reacción como
  ya hacen las tomas.
- Test: añadir un caso a `reactionRules.test.ts` con el comportamiento elegido.

## H10 · Listados sin paginar con el tope de 1000 filas de PostgREST · 3/10 (no reproducido contra un proyecto real)

- Dónde: `apps/web/src/lib/backend.ts:732` (`listAllClips`, que usa «Crear pista con los estribillos») y `:1624` (`listReactions`).
- Flujo: biblioteca con más de 1000 clips: `chorusClips` trabaja con los 1000 más antiguos y los estribillos más recientes se pierden sin avisar
  (o sale «las canciones aún no tienen clips»). Con reacciones es muy improbable (más de 1000 en una canción).
- Evidencia: lectura del código; el tope de 1000 es el valor por defecto de Supabase (`max_rows`), no lo he podido comprobar en el proyecto.
- Arreglo: pedir solo los clips de las canciones del repertorio (filtro `in` por `video_id`), que además baja la carga.
- Test: de integración con 1001 clips en la demo o una prueba de la consulta.

## H11 · Detalles menores · 2/10

- `reactionRules.whoWords` y `domain.isReactionEmoji` no se usan fuera de sus tests (código muerto).
- `EventPage` no pasa `withYear` a `eventDateLabel`: un evento pasado muestra «Miércoles, 14 de octubre · 22:19» sin año, mientras que «Pasados» en
  el listado sí lo lleva. Además el rótulo «Ya pasó · no sale en la portada» y el titular «Ya pasó» se repiten.
- El formulario admite una fecha pasada sin aviso (el evento nace «Ya pasó» y no sale en la portada). Un aviso suave bastaría.
- `fromLocalInput` no avisa de las horas que no existen por el cambio de hora (02:30 el 29 de marzo): el navegador las corre a 03:30.
- `TakeReactions` oculta todo si la consulta falla (no pinta nada, sin reintento).
- Cada «poner/quitar» deja una fila archivada en `take_reactions`; el tope duro (4× el vivo, 200 000) no se alcanzará en la práctica.

## Evidencia SQL (scratchpad, PGlite, rol `anon`, todo con `rollback`)

`b3r1/t1.sql` con `b3r1/run-sql.mjs`: aplica las 18 migraciones y comprueba, entre otros:

- Alta en `event_songs` con vídeo de otro grupo → `event_song_invalid`; con vídeo archivado → `event_song_invalid`.
- Alta en `events` con nombre de espacios → `events_name_check`; actualizar `archived_at` o `crew_id` → `permission denied for table events`.
- Alta en `events` con `archived_at` y `created_at` falsos → ignorados (se estampa `now()` y `null`).
- Reacción sobre toma de otro grupo → `reaction_take_invalid`; segunda 🔥 sin nombre → `take_reactions_once_key`;
  `member_id` de otro grupo → guardado como `NULL`; `crew_id` forzado → sustituido por el del grupo; actualizar `take_reactions` → `permission denied`.
- Una reacción sobre una toma que luego se deja de compartir sigue siendo visible por RLS (la interfaz solo las pinta en tomas con `shared_path`), y la de un
  miembro archivado sigue contando («Antiguo miembro»).

## Nota sobre el encadenado de `archive_row`

Cada migración (030000, 040000, 050000, 070000) vuelve a declarar la función completa. Hoy el orden por nombre deja la versión correcta, pero
si alguna se aplicara fuera de orden (por ejemplo `050000` después de `070000` con `--include-all`) se perdería la rama de `follow_paths` y
borrar un trazado daría «unexpected table follow_paths». Conviene desplegar las migraciones en orden y pasar `archive_checks.sql`
después, como ya indica la regla del proyecto.
