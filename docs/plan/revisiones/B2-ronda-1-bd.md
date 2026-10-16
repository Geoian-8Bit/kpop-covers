# B2 · Ronda 1 · Base de datos y capa de datos (F12 lista de deseos, F11 votaciones)

Revisión de solo lectura. Alcance: `supabase/migrations/20261016040000_wishes_and_polls.sql`, `supabase/tests/plan_b2_checks.sql`,
`apps/web/src/data/wishes.ts`, bloque `WishesBackend` de `apps/web/src/lib/backend.ts` (Supabase y demo), cambios en `data/bags.ts`,
`packages/shared/src/database.types.ts` y `domain.ts`. Nada aplicado en ningún entorno; no se ha tocado Supabase real ni Vercel.
Sondas propias en PGlite (scratchpad `b2r1/`), con el rol `anon` y RLS reales.

## Resumen

La migración está bien armada: aditiva, idempotente (la he reaplicado sobre una base con datos sin error), RLS por grupo y filas vivas,
grants por columna, guards con `search_path = ''`, `archive_row` superconjunto de la versión anterior (y `050000`/`070000` lo
repiten con `polls`), RPC `cast_vote` atómico (bloquea la fila de la votación con `for update`, así dos móviles votando o cerrando a la
vez se serializan) y todos los índices de FK presentes. `pnpm db:test` pasa (18/18 migraciones, 7/7 ficheros, 73 PASS) y `pnpm typecheck` también.

Comprobado lo que pedía el encargo:

- `draw_from_bag` de `040000` **conserva** `perform set_config('app.bag_draw', '1', true)` (línea 485) y el cierre (516); es la copia de
  `035000` más la etiqueta de `wishes`. El sorteo de un deseo en una bolsa funciona con `guard_bag_draw` de `035000` (el PASS
  «bags of songs hold and draw wishes» lo cubre). Un insert directo en `bag_draws` sigue dando `bag_draw_direct`.
- `guard_bag_item` y `bag_items_open_select` de `040000` son las de `030000` más `wish_id`; no se pierde nada. Un deseo en una bolsa de
  clips da `bag_item_invalid`; un deseo repetido en la misma bolsa, `bag_items_once_key`; un deseo archivado desaparece de la bolsa y del sorteo.
- Votar por otro, ver votos, escribir votos directos: el insert/update/borrado directo en `poll_votes` da `permission denied`;
  duplicados, `null` dentro del array, opciones ajenas y `single` con 2 opciones se rechazan; el array `null` o vacío retira el voto.
- Cerrar dos veces: el segundo cierre (en otra transacción) da `poll_closed`; reabrir (`closed_at = null`) también; cambiar el ganador
  tras cerrar también; ganador fuera de las opciones o sin cerrar da `poll_winner_invalid`; `closed_at` se estampa con `now()` aunque el cliente mande otra fecha.
- `added_video_id`: solo acepta un vídeo vivo del grupo (`wish_video_invalid` si está archivado o no existe).

Hallazgos que importan (ninguno bloquea el despliegue de esta ronda por sí solo; el 1 conviene tenerlo resuelto antes de usarlo con el grupo real):

1. Los listados de votos, interés y opciones se cortan a 1000 filas en silencio y se ordenan por antigüedad: se pierden justo los votos nuevos, y el ganador se calcula en el cliente con eso.
2. Las opciones de una votación se pueden archivar (o añadir) con votos o con la votación cerrada; el ganador puede dejar de ser opción.
3. `polls` acepta `winner_wish_id` en el insert y eso salta la validación del ganador al cerrar.
4. Cada cambio de voto deja filas archivadas para siempre: un script con `cast_vote` en bucle llena el tope (400 000 filas) y bloquea los votos de todos.
5. Ranking con más de 50 opciones: error crudo de `poll_votes_rank_check`.

Sobre la propuesta del constructor (permitir `winner_wish_id` una vez tras el cierre): **no hace falta** (ver el apartado al final).

---

## H1 · Listados cortados a 1000 filas (votos, interés, opciones) · 6/10

- Dónde: `apps/web/src/lib/backend.ts` `supabaseWishes.listPollVotes` (1260), `listInterest` (1232), `listPollOptions` (1255); consumidos por
  `data/wishes.ts` (`usePollVotes`, que además refresca **toda** la tabla cada 8 s en una votación abierta) y por `PollPage` (`tally`, cierre automático).
- Flujo: el grupo acumula votaciones. Una votación de ranking con 8 candidatas y 12 personas son 96 filas vivas; con 10–11 votaciones se pasa
  de 1000. PostgREST (Supabase, `max_rows` = 1000) devuelve las 1000 primeras por `created_at` ascendente, es decir, **se pierden los votos más recientes**,
  sin error. La pantalla enseña un recuento incompleto y el cierre (manual o automático) escribe un ganador calculado con datos truncados,
  que luego no se puede corregir (`closed_at` y `winner_wish_id` quedan congelados). Mismo problema con «Me apunto»: 10 personas × 100 deseos = 1000 filas (el tope de BD es 20 000), y con las opciones (tope de BD 10 000).
- Evidencia: lectura del código (no hay `.range()` ni `.limit()` en estas consultas; el informe B1 ya señaló lo mismo para `listAllClips`/`listBagItems`);
  topes de BD: `poll_votes` 100 000, `wish_interest` 20 000, `poll_options` 10 000.
- Arreglo (cliente): leer solo lo necesario y paginar.
  - Votos: `listPollVotes(pollIds?)` con `.in('poll_id', ids)` (la página de una votación pide solo la suya; la lista de votaciones, solo las que enseña) y, si aun así puede pasar de 1000, bucle con `.range(from, from + 999)` ordenado por `id` hasta que llegue una página corta.
  - Interés y opciones: el mismo helper `fetchAll(query)` con `.range()`.
  - Mejor aún para el ganador: calcularlo en servidor (ver el apartado final, `close_poll`).
- Test: unitario del helper con un mock que devuelve páginas de 1000 (`listPollVotes` con 2500 filas devuelve 2500). En PGlite no se puede reproducir `max_rows`.

## H2 · Las opciones se pueden archivar o añadir con votos o con la votación cerrada · 5/10

- Dónde: migración `040000`: política `poll_options_open_delete` (332) y el `grant select, insert, delete` (351); `guard_group_links` rama `poll_options` (161) solo mira `closed_at is null`.
- Flujo: un script (el cliente no lo hace: no hay `deleteOption` en el backend) con el rol `anon` borra filas de `poll_options` → el trigger las convierte en `archived_at`.
- Evidencia (PGlite, `anon`): en una votación cerrada con ganador W1, el borrado de la opción de W1 se acepta, la opción desaparece
  (`select count(*)` pasa de 2 a 1) y `exists(opción de W1)` da `false`: **el ganador deja de ser una de las opciones** y los votos de esa opción siguen en `poll_votes`. También se aceptó
  añadir una opción a una votación que ya tenía un voto, y se vota por una opción cuyo deseo está archivado (ver H8).
- Impacto: un solo script cambia el resultado de una votación acabada. Confianza total en el grupo, pero el diseño ya protege el cierre y el ganador, y esto lo deja a medias.
- Arreglo: quitar el borrado de opciones al cliente (la opción solo se archiva con su votación vía `archive_row`, que es `security definer`) y proteger el alta.
  Importante: el guard del alta debe ser **security invoker**. Si es definer, `current_user` es el dueño y la comprobación de `anon` nunca se cumple (es el fallo H2 de B1; lo comprobé: con definer el guard no se ejecutaba).

```sql
revoke delete on public.poll_options from anon, authenticated;
drop policy if exists poll_options_open_delete on public.poll_options;

create or replace function private.guard_option_insert()
returns trigger
language plpgsql
set search_path = ''            -- invoker a propósito
as $$
begin
  if current_user::text not in ('anon', 'authenticated') then
    return new;
  end if;
  if exists (select 1 from public.poll_votes v where v.poll_id = new.poll_id and v.archived_at is null)
     or exists (select 1 from public.polls p where p.id = new.poll_id and p.closes_at is not null and p.closes_at <= now()) then
    raise exception 'poll_closed' using errcode = 'P0001';
  end if;
  if (select count(*) from public.poll_options o where o.poll_id = new.poll_id and o.archived_at is null) >= 50 then
    raise exception 'poll_options_cap_reached' using errcode = 'P0001';   -- ver H5
  end if;
  return new;
end;
$$;
revoke execute on function private.guard_option_insert() from public, anon, authenticated;
drop trigger if exists poll_options_c2_open on public.poll_options;
create trigger poll_options_c2_open before insert on public.poll_options
  for each row execute function private.guard_option_insert();
```

- Test: ver «Tests adicionales» (borrado de opción → `insufficient_privilege`; alta con votos → `poll_closed`). Cambio necesario en `plan_b2_checks.sql`: el caso «Caducada» inserta las opciones en una votación ya caducada; con el arreglo hay que crearla con `closes_at` futuro, añadir la opción y después, como `postgres`, retrasar `closes_at`.

## H3 · Se puede crear una votación con ganador ya puesto (y cerrar con él sin validar) · 4/10

- Dónde: `grant select, insert, delete on ... polls` (351): el insert es de tabla entera; `guard_poll_update` solo valida el ganador cuando **cambia** (`is distinct from old`), y solo corre en `update`.
- Flujo: se inserta una votación con `winner_wish_id` = cualquier deseo y después se hace `update polls set closed_at = now(), winner_wish_id = <el mismo>`: no es «distinto de old», así que no se comprueba que sea una de las opciones.
- Evidencia (PGlite, `anon`): el insert con `winner_wish_id` devolvió el ganador (deseo W3 que ni siquiera era opción). `closed_at` y `archived_at` en el insert sí se frenan (RLS y `stamp_new_row`).
- Arreglo: grant de columnas en el insert (como se hizo con `bag_draws` en `035000`). El cliente nunca envía `winner_wish_id`, `closed_at` ni `crew_id` (lo pone el trigger).

```sql
revoke insert on public.polls from anon, authenticated;
grant insert (id, title, vote_type, results_live, anonymous, closes_at, parent_poll_id, created_by_member_id)
  on public.polls to anon, authenticated;
```

- Test: insert con `winner_wish_id` → `insufficient_privilege`. Comprobado que `plan_b2_checks.sql` sigue pasando con este cambio (usa `id`, que va incluido).

## H4 · Cambiar el voto apila filas archivadas; un bucle de `cast_vote` bloquea las votaciones de todos · 5/10

- Dónde: `cast_vote` (362–405) archiva el voto anterior e inserta uno nuevo cada vez; `poll_votes_d_row_cap` = 100 000 vivas **o** 400 000 en total (`guard_simple_cap` cuenta también las archivadas).
- Flujo: `cast_vote` es público para `anon` y no tiene límite de ritmo. Un script que alterne el voto de un miembro unas 130 000 veces (3 filas por llamada) llega a 400 000 filas y, desde ahí, cualquier `cast_vote` de cualquiera falla con `poll_votes_cap_reached` hasta que el administrador purgue. Además el tope hace un `count(*)` por cada fila insertada bajo un bloqueo asesor, así que cada voto se vuelve más lento a medida que crece.
- Evidencia: lectura de `guard_simple_cap` (`v_total >= v_cap * 4`); 300 llamadas seguidas tardan 0,6 s en PGlite (el coste actual no preocupa, el crecimiento sí).
- Arreglo: que haya **como mucho una fila por (votación, persona, opción) para siempre** y un cambio de voto solo cambie `archived_at`/`rank`. El número de filas queda acotado por personas × opciones. Es cambio de `040000` (la tabla aún no existe en producción). Probado en PGlite: 50 vueltas de A↔B dejan 2 filas en total (antes 100).

```sql
drop index if exists public.poll_votes_once_key;
create unique index if not exists poll_votes_once_key on public.poll_votes (poll_id, member_id, option_id);  -- ya no parcial

-- dentro de cast_vote, en lugar de archivar todo y reinsertar:
  update public.poll_votes set archived_at = now()
  where poll_id = p_poll and member_id = p_member and archived_at is null
    and (v_n = 0 or option_id <> all (p_options));
  for i in 1 .. v_n loop
    insert into public.poll_votes (poll_id, crew_id, option_id, member_id, rank)
    values (p_poll, v_poll.crew_id, p_options[i], p_member, case when v_poll.vote_type = 'ranking' then i end)
    on conflict (poll_id, member_id, option_id)
    do update set archived_at = null, rank = excluded.rank, created_at = now();
  end loop;
```

- Test: tres `cast_vote` alternando A/B/A del mismo miembro → `count(*)` de sus filas (como `postgres`) = 2 (en «Tests adicionales»).
- Nota: el comentario de la migración (urnas rellenadas por un script) sobrestima: un script puede llamar a `cast_vote` una vez por cada miembro del grupo. Lo que se evita es votar sin ser miembro, repetir opciones, votar opciones ajenas y escribir filas directas. Conviene reescribirlo (confianza F2, como el resto).

## H5 · Ranking con más de 50 opciones falla con un error crudo · 4/10

- Dónde: `poll_votes.rank check (rank between 1 and 50)` (103) y ningún tope de opciones por votación (solo el global de 10 000 en `poll_options_d_row_cap`); el formulario (`PollFormDialog`) no limita cuántas candidatas se marcan (la lista de deseos admite hasta 1000).
- Flujo: se crea una votación de ranking con 51 o más candidatas (se permite) y al votar `cast_vote` revienta con `poll_votes_rank_check` (violación de check), que `wishError` no traduce.
- Evidencia (PGlite): 52 opciones, ranking con las 52 → ese error.
- Arreglo: tope de 50 opciones por votación en el guard del alta (incluido en el SQL de H2; con él, `insertPoll` falla con `poll_options_cap_reached`, que `wishError` ya traduce a «Se ha llegado al máximo») y límite equivalente en el formulario (bloquear la casilla 51 con un texto «Máximo 50 candidatas»). En la práctica 8–10 ya es mucho; 50 es el techo duro.
- Test: 51.ª opción → `poll_options_cap_reached` (probado).

## H6 · «Caducada» solo existe por `closes_at`: se puede reabrir moviendo la fecha; ajustes mutables tras cerrar · 4/10

- Dónde: `guard_poll_update` (174–203): solo congela con `closed_at is not null`. Una votación con `closes_at` pasado y `closed_at` nulo (es el caso del empate, que no se cierra sola) se comporta como cerrada en `cast_vote`, pero la fila sigue editable.
- Evidencia (PGlite): con `closes_at` pasado, `cast_vote` da `poll_closed`; después un `update` de `closes_at` a mañana se acepta y `cast_vote` vuelve a funcionar. Tras cerrar de verdad, `anonymous` y `results_live` siguen siendo editables (probado: cambiar título, `anonymous` y `results_live` a la vez se acepta), de modo que se puede **des-anonimizar** una votación terminada.
- Arreglo (en `guard_poll_update`: congelar también `anonymous`/`results_live` al cerrar y no mover `closes_at` de una votación ya caducada):

```sql
  if old.closed_at is not null then
    if new.closed_at is distinct from old.closed_at or new.winner_wish_id is distinct from old.winner_wish_id
       or new.vote_type is distinct from old.vote_type or new.closes_at is distinct from old.closes_at
       or new.anonymous is distinct from old.anonymous or new.results_live is distinct from old.results_live then
      raise exception 'poll_closed' using errcode = 'P0001';
    end if;
  elsif old.closes_at is not null and old.closes_at <= now() and new.closes_at is distinct from old.closes_at then
    raise exception 'poll_closed' using errcode = 'P0001';
  elsif new.closed_at is not null then
    new.closed_at := now();
  end if;
```

  Probado en PGlite: prorrogar una caducada y cambiar `anonymous` tras cerrar → `poll_closed`. El botón «Editar» de la interfaz solo sale en votaciones abiertas, así que no se rompe ningún flujo.
  El bloque `poll_has_votes` de la migración (191–194) es código muerto: `vote_type` no está en el `grant update`. No hace daño.
- Test: en «Tests adicionales».

## H7 · «Anónima» y «resultados al cerrar» son solo de presentación · 4/10

- Dónde: `poll_votes_open_select` (337) deja leer todas las filas con `member_id`, y el cliente descarga todos los votos aunque `results_live` sea falso.
- Flujo: cualquier móvil (o una petición con la clave anon) lee quién votó qué y el recuento en directo.
- Evidencia: la migración lo dice en su cabecera (anónimo es una regla de presentación, las filas son legibles); no es un descuido, pero la interfaz y el spec F11 ofrecen «con nombre o anónimos» y «visibles en directo o solo al cerrar» como si fueran reales.
- Arreglo: aceptar y decirlo en la interfaz, o, si importa de verdad, cambiar el diseño: quitar el `select` de `poll_votes` a `anon` y exponer un RPC `poll_results(p_poll)` `security definer` que devuelva agregados (y `member_id` solo si no es anónima o ya está cerrada) y `my_ballot(p_poll, p_member)`. Es bastante trabajo para un grupo de confianza; mi recomendación es aceptar y rotular (en la línea del spec: «un voto por persona se basa en la confianza»). El mínimo útil ya está en H6: congelar `anonymous` al cerrar.
- Test: ninguno si se acepta.

## H8 · Un deseo archivado deja su opción viva (se puede votar y ganar) · 3/10

- Dónde: `archive_row` para `wishes` solo archiva el deseo; `poll_options_open_select` no mira el deseo; `cast_vote` valida la opción, no el deseo.
- Evidencia (PGlite): archivado el deseo W1, `poll_options` sigue devolviendo 3 opciones y `cast_vote` por la opción de W1 devuelve 1 (aceptado). `wishes` ya no devuelve W1, de modo que la interfaz pinta «Ya no está en la lista» (`PollPage` lo contempla, también cuando el ganador está archivado).
- Arreglo mínimo: en `cast_vote` exigir deseo vivo (`join public.wishes w on w.id = o.wish_id and w.archived_at is null` en el recuento de opciones válidas). No ocultar la opción en la política: el recuento de una votación cerrada cambiaría al borrar un deseo, que es peor.
- Test: archivar un deseo y votar su opción → `vote_options_invalid`.

## H9 · Avisos de advisors esperables y comentario engañoso · 3/10

- Dónde: `public.cast_vote` es `security definer` en `public` y ejecutable por `anon`/`authenticated` → `anon_security_definer_function_executable` (0028) y `authenticated_security_definer_function_executable` (0029), como ya pasó con `storage_usage()` / `shared_takes_bytes()` (F3/F4). Es intencionado (los votos solo entran por la función).
- Resto de advisors previsibles: ninguno nuevo. Los guards nuevos tienen `search_path = ''`, están revocados a `public/anon/authenticated` y todas las FK tienen índice; las políticas usan `(select private.default_group())`. Los índices nuevos saldrán como `unused_index` (INFO) hasta que se usen.
- Arreglo: documentar el aviso en la cabecera de la migración (como en `takes.sql`, línea 301) y en `ESTADO-IMPLEMENTACION.md` al aplicarla; comprobar los advisors tras el DDL (CLAUDE.md).
- Alternativa sin avisos: `cast_vote` `security invoker` con insert por columnas y marca `app.cast_vote`, como `draw_from_bag`; no la recomiendo, el trigger tendría que repetir todas las validaciones.

## H10 · `added_video_id`: cualquier vídeo vivo, y el deseo queda huérfano si ese vídeo se archiva · 3/10

- Dónde: `guard_group_links` (139–143) y `grant update (... added_video_id)`.
- Evidencia (PGlite): un deseo se puede enlazar a un vídeo vivo que **no es** su canción (W1 → V2 aceptado) y reenlazar a otro; se puede poner a `null` (vuelve a la lista) y, si ya hay otro deseo vivo con el mismo `youtube_id`, da `wishes_crew_youtube_key` (correcto). Si luego se archiva el vídeo de la biblioteca, el deseo conserva `added_video_id` y **no vuelve a la lista**; se puede volver a desear la canción porque el índice único lo excluye.
- Impacto bajo: confianza total, y el spec dice «al pasar a la biblioteca, sale de la lista». Opcional: validar que el `youtube_id` del vídeo coincide con el del deseo cuando el vídeo es de YouTube y, en `archive_row` de `videos`, poner `added_video_id = null` en los deseos que lo apuntan para que vuelvan a la lista.
- Test: enlazar a un vídeo con otro `youtube_id` → `wish_video_invalid` (solo si se añade la validación).

## H11 · Pequeños puntos · 2/10

- `poll_votes_open_insert` (343) es una política muerta (el rol no tiene `insert`; `cast_vote` es definer y salta la RLS). Su comentario sugiere lo contrario, y si algún día se concede `insert` por error abriría el relleno de urnas: quitarla (`drop policy if exists poll_votes_open_insert on public.poll_votes;`).
- `anon` conserva los privilegios de vaciar tabla, `REFERENCES` y `TRIGGER` en las tablas nuevas (privilegios por defecto de Supabase, igual que en las tablas anteriores). PostgREST no expone el vaciado; no es nuevo.
- `insertPoll` (cliente) hace dos peticiones (votación y luego opciones) y, si la segunda falla, archiva la votación. Si el móvil pierde la red entre ambas queda una votación sin candidatas visible para todos. Es raro; un RPC `create_poll(...)` la haría atómica (3/10, no urgente).
- Auto-cierre: lo escribe el primer móvil que abre la votación vencida usando su reloj; un móvil con el reloj adelantado puede cerrar antes de hora (el servidor estampa `now()` pero no comprueba `closes_at`). Equivale al cierre a mano que ya existe, así que no lo cuento como fallo.

---

## Sobre `winner_wish_id` una vez tras el cierre: no hace falta

- Los dos caminos de desempate que hay hoy escriben el ganador **en el mismo `update` que el cierre**: el sorteo (`TieBlock.onDrawn` llama a `closeWith(drawn)`) y el cierre normal. El auto-cierre **no cierra los empates** (`PollPage` línea 134: sale sin cerrar cuando el resultado es un empate), así que una votación vencida y empatada espera sin `closed_at` a que alguien sortee o abra la segunda vuelta. La segunda vuelta cierra la original **sin ganador a propósito** (`useCreatePoll`) y el ganador es el de la nueva votación (`parent_poll_id`).
- Lo que sí quedaría sin arreglo con esa regla es el caso peligroso: un ganador **no nulo y equivocado** (por datos truncados, ver H1, o por un móvil con votos viejos). Permitir fijarlo «una vez si estaba vacío» solo ayuda al `null`, y abre que alguien fije ganadora a posteriori en una votación que ya tiene segunda vuelta. Además hoy el servidor ni comprueba que el ganador sea de los más votados.
- Si se quiere robustez de verdad: un RPC `close_poll(p_poll uuid, p_pick uuid default null)` `security definer` que, con el `for update` de la votación, calcule el recuento en el servidor (un voto / varios / ranking por puntos), ponga `closed_at = now()` y `winner_wish_id` = el único líder, o `p_pick` solo si es uno de los empatados, o `null` si nadie votó. Elimina H1 para el ganador, la carrera entre móviles y el ganador manipulado. Esfuerzo medio; recomendable antes de mostrarlo al grupo, no bloqueante hoy.

## Paridad de la demo (`demoWishes`)

La demo imita bien las reglas: unicidad de `youtube_id` vivo, «Me apunto» una vez, cierre una sola vez con ganador entre las opciones, congelado tras cerrar, y los checks de `cast_vote` (votación viva, no cerrada ni vencida, miembro vivo, opciones de la votación sin duplicados, `single` con una). Diferencias menores:

- `updateWish` acepta `added_video_id` de un vídeo archivado (la BD exige vivo): usar `!v.archived_at`.
- No valida `thumbnail_url` (regex de la BD), ni (tras los arreglos) el tope de 50 opciones, opciones tras votos, `anonymous`/`results_live` congelados al cerrar, ni `closes_at` de una vencida.
- `listInterest` filtra miembros y deseos archivados; la BD solo filtra por la propia fila (la interfaz debe seguir ignorándolos al contar, que es lo que hace).
- `castVote` archiva y reinserta (como la BD actual); si se adopta H4, que reutilice filas por (persona, opción).
- Error de `update` sin filas: la demo usa `PGRST116 0 rows`, igual que PostgREST con `.single()`; correcto.

## Tests adicionales propuestos (probados en PGlite: fallan sin los arreglos y pasan con ellos)

Para `supabase/tests/plan_b2_checks.sql`; la versión ejecutable está en el scratchpad (`b2r1/extra.sql`, con el SQL de arreglo en `b2r1/fix.sql`):

- Crear una votación con `winner_wish_id` → `insufficient_privilege` (H3).
- Votar A, B, A con el mismo miembro → como `postgres`, `count(*)` de sus filas = 2 (H4).
- Borrar una opción como `anon` → `insufficient_privilege` (H2).
- Añadir una opción a una votación con votos → error `poll_closed` (H2).
- Cerrada: cambiar `anonymous` → `poll_closed` (H6); prorrogar `closes_at` de una vencida → `poll_closed`.
- 51.ª opción de una votación → `poll_options_cap_reached` (H5).
- Archivar un deseo y votar su opción → `vote_options_invalid` (H8).
- Vitest: `listPollVotes` con más de 1000 filas devuelve todas (H1).

## Qué se ha ejecutado

- `pnpm db:test`: 18/18 migraciones, 7/7 ficheros, 73 PASS (incluidos los de `plan_b2_checks.sql`). `pnpm typecheck`: sin errores.
- Sondas en PGlite (`anon`): privilegios y grants por columna, voto directo, duplicados, `null` en el array, miembro nulo, retirada de voto, cierre doble, reapertura, ganador ajeno, opciones tras votos y tras cierre, expiración y prórroga, inserts de `polls` con ganador/cerrada/archivada, deseos/vídeos/miniaturas/interés, bolsas con deseos y sorteo, reaplicación idempotente de `040000`, ranking de 52 opciones, 300 votos seguidos.
- Con el SQL de arreglo aplicado: `plan_b2_checks.sql` pasa salvo el caso «Caducada» (ver H2, cambio de fixture) y los tests adicionales pasan.
- No se ha podido probar en PGlite: la concurrencia real entre dos móviles (razonado: el `for update` de la fila de `polls` serializa `cast_vote` y el cierre, y bajo `READ COMMITTED` el cierre se ve al desbloquearse) ni el límite `max_rows` de PostgREST.
