# B1 · Ronda 1 · Base de datos y capa de datos (F13 bolsas, F14 pistas)

Revisión de solo lectura. Alcance: `supabase/migrations/20261016030000_bags_and_tracks.sql`, `supabase/tests/plan_b1_checks.sql`,
`apps/web/src/data/bags.ts`, `data/tracks.ts`, bloque `bagsBackend` de `apps/web/src/lib/backend.ts` (Supabase y demo),
`packages/shared/src/database.types.ts` y `domain.ts`. Nada aplicado en ningún entorno; no se ha tocado Supabase real ni Vercel.

## Resumen

La migración es sólida: aditiva, idempotente, con RLS por grupo y filas vivas, grants por columna, orden de triggers correcto,
`archive_row` como superconjunto de la versión anterior y un RPC invoker que respeta RLS. `pnpm db:test` pasa (17/17
migraciones, 7/7 ficheros, 72 PASS) y `plan_b1_checks.sql` pasa tanto con 030000 sola como con todas las migraciones (030000 a 070000).
Sondas propias en PGlite: reparto uniforme del sorteo (102/95/103 sobre 300), 0 repeticiones seguidas en 300 sorteos con
«sin repetir», bolsas y pistas archivadas invisibles, imposible mezclar tipos, mover items a otro grupo o escribir
`kind`/`archived_at`/`label`.

Hallazgos que importan:

1. 🔴 `pnpm typecheck` falla: la demo de `insertBagItem` no rellena `wish_id` (columna que ya trae `database.types.ts`).
2. El historial `bag_draws` se puede falsificar (fecha retrocedida, `seq` propio, etiquetas inventadas) y el estampado de `drawn_at`
   del trigger no funciona (es `security definer`, así que `current_user` nunca es `anon`).
3. `bag_draws` no tiene tope ni limpieza ni índice `(bag_id, seq)`: crece sin límite y cada sorteo ordena todo el historial de la bolsa.
4. Listados sin paginar: PostgREST corta a 1000 filas (`listAllClips`, `listBagItems`) con topes de BD de 5000.

Aviso de encadenado: `040000` redefine `guard_bag_item`, `draw_from_bag` y `bag_items_open_select`. Cualquier arreglo que se haga en
esas piezas dentro de `030000` quedará machacado por la copia de `040000`; hay que replicarlo allí. Comprobado que no hay sobrecarga
(misma firma `draw_from_bag(uuid,int,boolean,uuid)`), así que PostgREST no verá PGRST203.

---

## H1 · 🔴 La demo no compila con los tipos regenerados (falta `wish_id`) · 7/10

- Dónde: `apps/web/src/lib/backend.ts:942` (`demoBags.insertBagItem`), también `NewBagItem` y `itemRef` en `data/bags.ts`.
- Flujo: `pnpm typecheck` y `pnpm build` (el build de Vercel) fallan.
- Evidencia: `error TS2741: Property 'wish_id' is missing in type { id; crew_id; bag_id; video_id; clip_id; member_id; removed_at: null; created_at; archived_at: null }`
  (`database.types.ts` ya incluye `bag_items.wish_id` de 040000).
- Arreglo: en el objeto `item` de la demo añadir `wish_id: null`. Si B2 va a permitir deseos en bolsas de canciones, la demo debe
  aceptarlos igual que `guard_bag_item` de 040000 (bolsa `songs` admite `video_id` o `wish_id`) y la etiqueta del sorteo
  (`wishes.title`); en Supabase, `itemTitle` hoy devuelve «No disponible» para un item con `wish_id` porque `BAG_ITEM_SELECT` no
  incrusta `wish:wishes(...)`. Si no se quiere arrastrar eso a B1, regenerar los tipos solo con 030000.
- Test: `pnpm typecheck` en verde; un test de `demoBags` que inserte y lea un item.

## H2 · Historial de sorteos falsificable; `drawn_at` no se estampa; `seq` sobrescribible · 5/10

- Dónde: migración 030000, `private.guard_bag_draw` (líneas 158–185) y `grant select, insert on public.bag_draws` (346).
- Flujo: cualquier móvil (anon) puede insertar directamente en `bag_draws` sin pasar por el RPC.
- Evidencia (PGlite, rol `anon`):
  - `insert into bag_draws (bag_id,label,removed,drawn_at) values (..., 'FALSO', true, '2000-01-01') returning drawn_at` devuelve
    `1999-12-31T23:00Z`. El `if current_user::text in ('anon','authenticated') then new.drawn_at := clock_timestamp()` nunca se ejecuta
    porque la función es `security definer` y `current_user` es el dueño (postgres). (`stamp_new_row` sí funciona porque es invoker.)
  - `insert ... overriding system value (bag_id,label,seq) values (..., 'SEQ', 99999999)` se acepta: se puede fijar `seq` y con ello
    manipular «sin repetir seguidas» (`order by seq desc limit 1`).
  - Etiquetas, `removed` e `item_id` (de la misma bolsa) libres: se pueden crear salidas que nunca ocurrieron.
- Impacto: el grupo es de confianza, así que no es una brecha de seguridad, pero el spec dice «historial: qué salió, cuándo y si se quitó» y
  el RPC existe para que sea fiable. Además el comentario del código promete un estampado que no existe.
- Arreglo mínimo (en 030000): grants de columna en el insert y guard invoker.

```sql
revoke insert on public.bag_draws from anon, authenticated;
grant insert (bag_id, crew_id, item_id, label, removed, member_id) on public.bag_draws to anon, authenticated;
-- id, drawn_at y seq quedan siempre por defecto (el RPC invoker solo inserta esas columnas).
```

  Y convertir `guard_bag_draw` en invoker (quitar `security definer`, mantener `set search_path = ''`): sus subconsultas a
  `bags`, `bag_items` y `members` correrían con el RLS del llamante, que es justo la visibilidad deseada (vivas). Para cerrar también
  las etiquetas inventadas: que el insert directo falle salvo desde el RPC, con el mismo patrón que `app.archive_burst`:
  `perform set_config('app.bag_draw','1',true)` en `draw_from_bag` y, en el guard, una comprobación de
  `current_setting('app.bag_draw', true)` que lance `bag_draw_direct` si no vale `1`
  (replicar el `set_config` en la copia de `draw_from_bag` de 040000).
- Test (añadir a `plan_b1_checks.sql`, como anon): insertar con `drawn_at` pasado da `insufficient_privilege`; insertar con
  `overriding system value` da error; `insert ... label` directo da `bag_draw_direct`; el RPC sigue funcionando.

## H3 · `bag_draws` sin tope, sin limpieza y sin índice de orden · 5/10

- Dónde: migración 030000 líneas 56–71 (tabla e índices) y triggers 219–222 (solo `a_set_crew` y `c_check`).
- Flujo: `draw_from_bag` (hasta 10 filas por llamada) lo puede invocar cualquiera sin límite; no hay borrado (correcto) ni tope. El resto
  de tablas nuevas sí tienen `guard_simple_cap` (200/5000/300/20000); esta no, y `guard_simple_cap` no sirve porque la tabla no tiene `archived_at`.
- Evidencia: con 50 000 filas en una bolsa, `select ... where bag_id=... order by seq desc limit 1` y el listado de 40 hacen Bitmap Scan + Sort de
  todo el historial de esa bolsa (`bag_draws_bag_idx` es `(bag_id, drawn_at desc)`, pero el RPC y `listBagDraws` ordenan por `seq`):
  23 ms por sorteo en PGlite, y crece lineal. Un script puede llenar la BD gratuita.
- Arreglo: (a) `create index bag_draws_bag_seq_idx on public.bag_draws (bag_id, seq desc)` en lugar de `bag_draws_bag_idx`;
  (b) dar a la tabla `archived_at timestamptz`, ocultar archivados en `bag_draws_open_select` y recortar al insertar
  (trigger `after insert` definer que archiva lo que exceda las últimas ~300 de esa bolsa); (c) tope duro de grupo con
  `private.guard_simple_cap('60000')` (200 bolsas x 300 vivos; el 4x incluye archivados), mapeando `bag_draws_cap_reached` en `bagError`.
  Alternativa sin tocar el esquema: tope duro por bolsa y mensaje «Historial lleno» (peor: bloquea el sorteo).
- Test: insertar 301 sorteos en una bolsa y comprobar que quedan 300 vivos; `explain` usa `bag_draws_bag_seq_idx`.

## H4 · Listados cortados a 1000 filas por PostgREST · 4/10

- Dónde: `backend.ts` `listAllClips`, `listBagItems`, `listTrackItems`, `listBags` (sin `.range` ni `.limit`).
- Evidencia: `clips` admite hasta 5000 por grupo y `bag_items` 5000; Supabase corta a `max_rows` = 1000 por defecto. 500 canciones x 3
  clips ya superan los 1000: el selector «todos los clips» de la ronda aleatoria y las bolsas grandes se truncan en silencio, y el orden
  `created_at` empata dentro de un mismo insert.
- Arreglo: helper de paginado con `range(0,999)`, `range(1000,1999)`... hasta que una página venga corta, con orden por `created_at` y luego `id`.
- Test: demo con 1200 clips; o unitario del helper con un mock de 2 páginas.

## H5 · «Quitar» / «Devolver» tras sortear no es atómico y permite reescribir cualquier línea del historial · 3/10

- Dónde: `backend.ts` `setDrawRemoved` (dos peticiones: `bag_draws.update({removed})` y luego `setBagItemOut`) y
  `grant update (removed) on bag_draws` más la política `bag_draws_open_update`.
- Evidencia: `update public.bag_draws set removed = not removed returning label` como anon cambió las 4 filas del historial. Si la segunda
  petición falla, el historial dice «quitada» y el item sigue en la bolsa (o al revés). `BagPage.setRemoved` además lanza hasta 10x2 peticiones en paralelo.
- Arreglo: un RPC invoker que haga las dos escrituras en una transacción (con invoker sigue haciendo falta el grant de columna; la ganancia es la atomicidad):

```sql
create or replace function public.set_draw_removed(p_draw uuid, p_removed boolean)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_item uuid;
begin
  update public.bag_draws set removed = p_removed where id = p_draw returning item_id into v_item;
  if not found then raise exception 'bag_not_found' using errcode = 'P0001'; end if;
  if v_item is not null then
    update public.bag_items set removed_at = case when p_removed then now() end where id = v_item;
  end if;
end $$;
revoke execute on function public.set_draw_removed(uuid, boolean) from public;
grant execute on function public.set_draw_removed(uuid, boolean) to anon, authenticated;
```

- Test: el RPC marca ambos; con `p_draw` inexistente lanza `bag_not_found`.

## H6 · Pistas: consistencia y coste · 3/10

- `setTrackPositions` lanza una petición por item cambiado (`Promise.all`): mover uno al principio de una pista de 100 clips son 100 PATCH, con
  fallos parciales que dejan el orden mezclado. Un RPC `reorder_track(p_track uuid, p_ids uuid[])` (invoker, `update ... from unnest(p_ids) with ordinality`) lo resolvería en una.
- `tracks.updated_at` solo se toca al editar la fila de `tracks`; añadir, quitar o reordenar clips no lo cambia, así que el orden por `updated_at desc`
  no sube la pista. La demo sí lo actualiza en `insertTrackItems` (divergencia). Decidir una regla y copiarla en las dos.
- `insertTrack` crea la pista y luego los clips; si fallan, la «borra» (la archiva) y consume cupo del tope 300 (x4 incluyendo archivadas).
  Un RPC `create_track(...)` atómico lo evita.
- `track_items.position between 0 and 999` y no hay tope por pista: `insertTrackItems(trackId, ids, from)` con `from+i > 999` da `track_items_position_check`,
  que `bagError` no traduce (cae en `friendlyError`). Traducirlo («Una pista admite 1000 clips») o validar en cliente.
- Sin `unique (track_id, position)` a propósito (permite el intercambio); dos móviles pueden crear posiciones duplicadas y el desempate por `created_at` lo cubre. Correcto.

## H7 · La demo no imita del todo las reglas de la BD · 3/10

Comprobado en `demoBags`:

- Sin topes (200 bolsas, 5000 items, 300 pistas, 20 000 clips de pista) ni errores `*_cap_reached`.
- `pause_seconds`: la BD redondea a 0,1 (`2.55` pasa a `2.6`, `5.04` a `5.0`); la demo guarda 2.55. `title_mode` no se valida en `updateTrack`.
- `insertTrackItems` no comprueba posición 0–999; `insertBag` no valida `kind` ni `draw_mode`.
- `deleteBag` y `deleteTrack` borran de verdad (la BD archiva); inocuo en demo, pero el historial `bag_draws` desaparece y en BD se conserva.
- `no_repeat`: el RPC lo aplica con cualquier `draw_mode`; `effectiveNoRepeat` (solo `keep`) existe en `drawRules.ts` pero no lo usa el servidor ni la demo. Elegir una sola regla.
- `p_count` menor o igual que 0, o nulo, devuelve 1 sorteo en servidor y demo (coherente, pero silencioso).

Arreglo: pequeñas validaciones en la demo y un test `demoBags` que recorra los mismos casos que `plan_b1_checks.sql`.

## H8 · Cobertura de `plan_b1_checks.sql` · 3/10

Cubre bien: grupo forzado, nombre único, tipo de item, duplicado, modo quita/rellena/devolver, «sin repetir», archivado de canción, pista y clip archivado,
rango de pausa, historial no borrable, archivado de bolsa. No cubre:

- fecha y `seq` falsificados (H2), inserción directa en `bag_draws`, tope y recorte del historial (H3);
- sorteo de bolsa archivada (`bag_not_found`), de otro grupo, con `p_member` de miembro archivado (se pone a null), `p_count` 0, negativo o mayor que 10;
- bolsa de personas con miembro archivado, bolsa de clips con vídeo archivado (el item desaparece);
- `update` de `kind`, `archived_at`, `label`, `crew_id` (permission denied) y de `position` fuera de rango;
- item de pista con clip archivado (`track_item_invalid`), pista archivada (`track_not_found`), `title_mode` inválido, redondeo de `pause_seconds`;
- concurrencia: dos sesiones sorteando a la vez (ver nota abajo).

Todas las que he probado a mano dan el resultado correcto salvo H2 y H3.

## H9 · Mapeo de errores incompleto · 2/10

`bagError` cubre los nombres reales (`bags_crew_name_key`, `bag_items_once_key`, `bag_item_invalid`, `bag_not_found`, `track_*`, `*_cap_reached`, `*_check`).
Faltan `track_items_position_check`, `bulk_delete_blocked`, `no_group` y el futuro `bag_draws_cap_reached`. El catch-all `friendlyError` los cubre sin romper; es solo texto.

## H10 · Detalles menores · 1–2/10

- `order('created_at')` sin desempate en `listBags`, `listBagItems` y `listAllClips`: items insertados en la misma transacción comparten `created_at`; añadir `.order('id')`.
- Los grants por defecto de Supabase dejan `TRUNCATE`, `REFERENCES` y `TRIGGER` a `anon` en las tablas nuevas. No es alcanzable por PostgREST y es igual que en las tablas previas; si se quiere endurecer:
  `revoke truncate, references, trigger on public.bags, public.bag_items, public.bag_draws, public.tracks, public.track_items from anon, authenticated;`.
- Advisors esperables: `unused_index` (INFO) en `bags_crew_idx`, `bag_items_*_idx`, `bag_draws_*_idx`, `tracks_crew_idx`, `track_items_*` hasta que haya tráfico (son los índices de FK que exige el linter; no quitar).
  `auth_rls_initplan`: sin avisos, todas las políticas usan `(select private.default_group())`. `multiple_permissive_policies`: sin avisos (una política por acción y rol).
  `function_search_path_mutable`: sin avisos. `anon_security_definer_function_executable`: no aplica a `draw_from_bag` (invoker); los guards están revocados.

---

## Verificado sin hallazgos

- Atomicidad con dos móviles: `select ... for update` sobre `bags` exige privilegio UPDATE; anon lo tiene por la columna (`grant update (name, draw_mode, no_repeat)`).
  Comprobado que `for update` pasa y que `draw_from_bag` funciona como anon. En READ COMMITTED el segundo llamante espera al primero y sus consultas
  posteriores (nuevo snapshot por sentencia) ya ven `removed_at` y el último sorteo, así que no se saca el mismo item dos veces ni se repite seguido.
  PGlite tiene una sola conexión, por lo que esto es razonamiento y no un test concurrente. Test real en el entorno con dos `psql`:
  sesión A `begin; select * from draw_from_bag('<bolsa>');` (sin commit), sesión B lo mismo (queda bloqueada), commit en A; B debe devolver otro item o vacío.
  Si algún día se revocan todos los UPDATE de columna de `bags`, el RPC se rompería; el test actual lo cubre al llamar al RPC como anon.
- Aleatoriedad: `order by (i.id = v_last) nulls first, random()`. Reparto uniforme (102/95/103 en 300), el último queda siempre al final.
  Con `p_count` mayor que los items devuelve solo los que hay. Coste con 2000 items y 50 000 sorteos: 9–23 ms.
- Límite de cantidad: `greatest(1, least(coalesce(p_count,1), 10))`; 0, −5 y null dan 1; 100 da todos hasta 10.
- RLS: bolsas, items, sorteos y pistas archivados invisibles (también items de canción, clip o persona archivados); los items de pista siguen visibles con clip archivado
  (el cliente recibe `clip: null`, que `TrackItemView` ya modela). Imposible insertar items en bolsa de otro tipo, con 0 o 2 referencias, de
  otro grupo o con referencias archivadas; `crew_id` siempre forzado; `created_at` y `archived_at` reiniciados por el sello.
- Columnas escribibles: `bags(name,draw_mode,no_repeat)`, `bag_items(removed_at)`, `bag_draws(removed)`, `tracks(name,pause_seconds,countdown,use_clip_settings,title_mode)`,
  `track_items(position)`. `kind`, `archived_at`, `crew_id`, `label` y referencias: `permission denied`. Borrar en `bag_draws`: denegado.
- Triggers por nombre: `a_set_crew`, `b_client_stamp`, `c_check`, `d_row_cap` (el chequeo de tipo va antes del tope y del lock). `tracks_touch` es BEFORE UPDATE, sin choque.
- Consultas del cliente con RLS real: `select(*, bag_items(count))`, incrustados `video:videos`, `clip:clips(video:videos)`, `member:members` y
  `clip:clips(*, video:videos)` no son ambiguos (una sola FK por relación) y el conteo respeta RLS. Listar 2000 items con RLS anidado: unos 42 ms.
- Encadenado con 040000–070000: `create or replace` mantiene la firma; `archive_row` se reconstruye como superconjunto cada vez; `bag_items_one_ref` y
  `bag_items_once_key` se recrean con `wish_id`; el b1 pasa con todas aplicadas. Reaplicar 030000 sobre una base con 040000 ya aplicada revertiría
  `guard_bag_item`, `draw_from_bag` y la política (las migraciones no se reaplican, pero conviene saberlo si se ejecuta a mano).
- Compatibilidad con la app desplegada: solo tablas y funciones nuevas más `archive_row` ampliado; no se modifican datos.
- `database.types.ts` y `domain.ts` coinciden con el esquema (incluidas `seq?: never` y `SetofOptions` del RPC); `BagKind`, `DrawMode` y `TitleMode` estrechan correctamente.
