# Mejoras · revisión global de base de datos y seguridad (17-10)

**Alcance.** Revisión de solo lectura de la rama `feat/plan-completo`. Cubre las tres migraciones que van a
producción, en este orden:

1. `20261017120000_bag_youtube_items.sql`
2. `20261017130000_video_stems.sql`
3. `20261017140000_videos_storage_cap.sql`

Las he leído enteras y las he comparado con la versión vigente de todo lo que redefinen:

| Qué redefine | Versión vigente |
| --- | --- |
| `guard_bag_item`, `bag_items_one_ref`, `bag_items_once_key`, política de lectura de `bag_items` | `20261016040000` |
| `draw_from_bag` | `20261016040000` (sobre `035000`) |
| `archive_row` | `20261016070000` |
| `video_object_allowed` | `20261016000100` |
| Políticas de `videos` | `20261013000000` |
| `take_object_allowed`, `storage_bytes_used`, `storage_usage` | `20261016010000` |
| `stamp_new_row`, `guard_simple_cap` | `20261016000000` |
| `archive_instead_of_delete`, `guard_bulk_delete` | `20261013000000` |

**También he revisado:**
- Las comprobaciones `bag_youtube_checks.sql`, `plan_stems_checks.sql`, `videos_storage_cap_checks.sql`,
  `plan_cloud_copy_checks.sql` y `archive_checks.sql`.
- Los tipos de `packages/shared/src/database.types.ts`.
- El uso desde el cliente:
  - `lib/backend.ts`: subida XHR, bolsas y pistas.
  - `data/bags.ts`, `data/stems.ts` y `data/videos.ts`.
  - `features/voice/separate/{model,runSeparation,separateRules,encode}.ts`.
- `vercel.json` (CSP), `PrivacyPage.tsx` y `scripts/deploy.mjs`.
- Como contexto: `CLAUDE.md`, `global-bd-seguridad.md`, `mejoras-bolsas-ronda-1.md` y `mejoras-voz-archivo-ronda-1/2.md`.

**Pruebas ejecutadas:**
- `node supabase/tests/local/run.mjs`: **OK**.
  - 23/23 migraciones aplicadas.
  - 12/12 archivos de comprobación en verde.
  - 129 PASS y ningún INCONCLUSIVE.
  - Las tres migraciones nuevas: 12 PASS (`bag_youtube`), 20 (`stems`) y 7 (`storage_cap`).
- `vitest` de `features/bags`, `features/voice`, `features/studio` y `lib`: 20 archivos y 250 tests en verde.
- Las comprobaciones de producción del final de este informe las he ejecutado en PGlite, sobre las 23 migraciones.
  Salen `PASS A`, `PASS B` y `PASS C`.
- No he usado navegador, servidor ni Supabase real. Tampoco he ejecutado los advisors.

## Hallazgos (de mayor a menor)

- **[4] `supabase/tests/plan_stems_checks.sql:223` y `:335` — borrados directos en `storage.objects`.**
  - La comprobación hace un `delete` como `anon` (`:223`, sin manejador de excepciones) y otro como postgres para
    quitar el relleno (`:335`).
  - Los proyectos Supabase recientes tienen un trigger de Storage que rechaza los borrados SQL directos («Direct
    deletion from storage tables is not allowed…»). En el stub de PGlite no existe. Si el proyecto lo tiene, el archivo
    aborta en `:223` con un error que no es `FAIL …`. No pasa nada, porque todo se revierte, pero el coordinador lo leería
    como una regresión. `archive_checks.sql:146` sí está protegido con `exception when others`.
  - No lo he podido confirmar en el proyecto real.
  - *Arreglo:*
    - Añadir `select set_config('storage.allow_delete_query', 'true', true);` justo después de `begin;`. Si el trigger
      no existe, no tiene efecto.
    - O cambiar `:335` por un `update … set metadata = '{"size": 0}'` y meter `:223` en un `begin … exception`.
    - Hasta entonces, el coordinador debe añadir esa línea al ejecutarla en producción (ver abajo).

- **[3] `supabase/migrations/20261017130000_video_stems.sql:253-262` (y la política `:272-273`) — la regla de sitio de
  las pistas da por hecho 16 MiB por archivo, pero nadie lo impone en la subida.**
  - `stem_object_allowed` no recibe `metadata`. Storage solo aplica el límite del bucket, que es de 50 MB.
  - Un script con la clave pública puede subir dos pistas de hasta 50 MB por fila. `stems_too_big` impide completarla,
    pero los archivos se quedan y cuentan en el 1 GiB.
  - Cerca del tope, eso puede pasar la línea `1 GiB − 50 MB` hasta unos 68 MB y dejar sin sitio a las tomas. Con
    `videos` ya no es posible, porque `140000` supone 50 MB cuando no sabe el tamaño.
  - La app no lo hace: la tasa de bits va al 92 % de 16 MiB.
  - *Arreglo:* apuntarlo como límite conocido junto a H13. Para cerrarlo, la opción más simple es mover las pistas a un
    bucket propio con `file_size_limit = 16777216`, que Storage impone por archivo. La alternativa es pasar
    `private.object_size(metadata)` a la política, como en `140000`, sabiendo que en la comprobación previa de Storage
    el tamaño llega vacío.

- **[3] `apps/web/src/features/voice/separate/runSeparation.ts:292-340` — no se comprueba que cada pista quepa en 16 MiB
  antes de subirla.**
  - Si el codificador (VBR) se pasa del margen del 8 %, las dos pistas se suben y `completeStems` falla con
    `stems_too_big`. Ese error no está traducido: el usuario ve un mensaje genérico.
  - La fila pendiente se reutiliza. En cada reintento las subidas dan `exists` y `completeStems` vuelve a fallar, así
    que se repiten minutos de separación sin salida. Además, quedan unos 32 MB que el cliente no puede borrar.
  - Es poco probable con la tasa calculada, pero no imposible.
  - *Arreglo:*
    - Antes de subir: si `blob.size > STEM_MAX_BYTES`, volver a codificar con una tasa menor o parar con un mensaje
      claro.
    - Ante `stems_too_big`, archivar la fila y olvidar el pendiente.

- **[2] `supabase/tests/plan_stems_checks.sql:73-75` (y `:187`, `:251`) — un rechazo real sale como INCONCLUSIVE.**
  - `exception when others` también se traga un 42501 de RLS, que sería una regresión de verdad.
  - Lo compensa en parte el paso 5: sin los archivos, el `completeStems` posterior falla con `FAIL`.
  - *Arreglo:* `when insufficient_privilege then raise exception 'FAIL …'` antes del `when others`.

- **[2] `apps/web/vercel.json:72` — la CSP sigue en Report-Only y sin destino de informes (H10).**
  - Las entradas nuevas son coherentes:
    - las rutas de Hugging Face, limitadas a los dos repositorios;
    - `*.hf.co` para la redirección al CDN;
    - `blob:` en `connect-src`.
  - `*.hf.co` es amplio, pero solo sirve para conexiones.
  - *Arreglo:* el de H10 (`report-to` y pasar a obligatoria cuando no haya informes).

- **[2] `apps/web/src/features/voice/separate/model.ts:41-90` — los modelos de terceros llevan el commit fijado y el
  tamaño exacto, pero no un hash.**
  - El commit fijado de Hugging Face ya apunta a un contenido concreto (LFS por sha256), así que el riesgo es que el
    propio HF sirva otro archivo. Un ONNX no ejecuta JS.
  - Los modelos de MoveNet y MediaPipe tampoco llevan SRI (H10).
  - La política de privacidad menciona Hugging Face (`huggingface.co`, `*.hf.co`), el tamaño (120–172 MB, que cuadra en
    MiB con 125,9 y 180,5 MB) y la subida de las pistas a la nube del grupo.
  - *Arreglo opcional:* guardar el sha256 de cada pieza y comprobarlo con `crypto.subtle.digest` antes de cachearla.

- **[2] `scripts/deploy.mjs:50-88` — el token va en la línea de comandos.**
  - No hay inyección:
    - `git` va con `execFileSync`;
    - en Windows se rechazan `"`, `%` y los saltos de línea;
    - el resto va entre comillas, con `/d /s /c` y `windowsVerbatimArguments`;
    - `-b APP_BUILD=<n>` es un número validado.
  - `--token` se enmascara al imprimirlo, pero sigue visible en la lista de procesos.
  - Un argumento que acabe en `\` se juntaría con el siguiente al leerlo Node. Es inocuo, porque solo lo escribe el
    operador.
  - *Arreglo:* recomendar `VERCEL_TOKEN` en el entorno en lugar de `--token`.

- **[2] `apps/web/src/data/bags.ts` (versión de `main`, `itemTitle`/`itemRef`) — clientes viejos en caché.**
  - Un móvil con la versión de `main` muestra una canción de YouTube como «No disponible», con `itemRef = ''`.
  - En el sorteo sale con su título (`draw.label`). No se rompe nada; se arregla al actualizar.
  - *Arreglo:* ninguno. Desplegar justo después de la migración.

- **[2] `20261017120000_bag_youtube_items.sql:14-23` — datos de la API de YouTube guardados sin caducidad.**
  - Título, artista, miniatura y duración quedan en `bag_items`, igual que ya pasa en `videos` y `wishes`.
  - Las políticas de la API de YouTube limitan cuánto tiempo se guardan datos de la API, salvo los ids. No es nuevo.
  - *Arreglo:* ninguno en esta ronda. Si se revisa, que sea a la vez para las tres tablas.

- **[1] `20261017120000_bag_youtube_items.sql:101` frente a `guard_simple_cap` — orden de bloqueos.**
  - En una sola fila, siempre se toma primero el bloqueo de la canción (`hashtext`, clave bigint) y luego el del tope
    (dos `int4`, otro espacio de claves). No hay ciclo.
  - Solo un insert de varias filas a la vez desde dos transacciones podría bloquearse mutuamente. Postgres lo detecta y
    aborta una. La app inserta de una en una.
  - `draw_from_bag` (`for update` de la bolsa) no toma bloqueos asesores.
  - *Arreglo:* ninguno.

- **[1] `20261017130000_video_stems.sql:197-198` — privilegios por defecto.**
  - Como en todas las tablas, `anon` conserva `TRUNCATE`, `REFERENCES` y `TRIGGER` por los privilegios por defecto de
    Supabase. PostgREST no los expone.
  - *Arreglo opcional:* un `revoke truncate, references, trigger on all tables in schema public from anon,
    authenticated` en una migración de limpieza.

## Comprobado y correcto

- **Las tres son aditivas.** Todo es `if not exists`, `create or replace` o `drop … if exists` seguido de `create`.
  - `120000`:
    - las columnas nuevas admiten `null`;
    - `bag_items_one_ref` se amplía a un superconjunto;
    - `bag_items_youtube_fields` se cumple en las 9 filas actuales, porque todo es `null`;
    - el índice único parcial nuevo no tiene filas.
  - `130000`: solo crea tabla, funciones y dos políticas de Storage con nombres nuevos.
  - `140000`: solo funciones y la política de insert de `videos`.
- **Se aplican en orden sobre los datos actuales.** `130000` usa funciones que ya existen (`stamp_new_row`,
  `guard_simple_cap`, `archive_instead_of_delete`, `guard_bulk_delete`, `storage_bytes_used`). Ninguna valida filas que
  no existan ya.
- **Con los datos de producción no cambia nada.** El bucket tiene un objeto de unos 33,7 MB.
  `videos_bucket_has_room(null)` sale cierto mientras el grupo use menos de unos 924 MiB.
- **Compatibles con `main`.**
  - Inserta ítems de bolsa como antes y no usa `video_id` en el update.
  - No conoce `video_stems`: al archivar un vídeo, la nueva `archive_row` archiva también sus pistas.
  - Sus subidas pasan la nueva comprobación de sitio.
- **Ninguna redefinición pierde nada:**
  - `guard_bag_item`: `security definer`, `search_path=''`, `bag_not_found`, las ramas de vídeo, deseo, clip y persona,
    y el `revoke`. Añade la conversión a vídeo de biblioteca, la canción de YouTube, el duplicado entre fuentes (con
    los deseos, que cierra el [3] de la ronda de bolsas) y el bloqueo asesor.
  - `draw_from_bag`: idéntica a la de `040000` (`invoker`, `app.bag_draw` al entrar y al salir, `for update`, «sin
    repetir», de 1 a 10, `revoke` a `public` y `grant` a los clientes), más el título propio.
  - `archive_row`: idéntica a la de `070000`, más `video_stems` en la rama de vídeos y en la lista; conserva
    `pg_trigger_depth`.
  - `video_object_allowed`: las mismas reglas que en `000100`, más el sitio. La de dos argumentos sigue con `grant`.
  - `videos_bucket_open_select` no cambia.
- **RLS de lo nuevo:**
  - `video_stems`:
    - RLS activa y cuatro políticas (grupo por defecto y no archivado);
    - la lectura además exige vídeo vivo;
    - el grupo lo pone `set_stems_crew` (definer) desde el vídeo, y el `with check` lo comprueba después de los
      triggers.
  - Privilegios en `video_stems`:
    - el cliente solo actualiza `*_path` y `*_size`, y `guard_stems_files` (invoker, para ver al rol real) fija los
      tamaños reales y bloquea tras completar;
    - `stems_insert_rules` impide nacer con archivos.
  - `bag_items`:
    - las columnas nuevas se pueden insertar y leer;
    - de update, solo `video_id` y `removed_at`;
    - `guard_bag_item_link` solo deja pasar de canción de YouTube a vídeo vivo del grupo con el mismo `youtube_id`, y
      limpia las columnas de YouTube;
    - dos enlaces a la vez se resuelven solos: el segundo ve `old.video_id` ya puesto y no hace nada.
- **Storage:**
  - Las rutas `<grupo>/stems/<fila>/(vocals|instrumental).<ext>` no se solapan con las de vídeos y tomas.
  - El bucket `videos` admite `audio/*`.
  - Hay una pista por tipo y no hay segunda extensión.
  - Solo se puede leer con la fila completa.
  - En `storage.objects` no hay ninguna política UPDATE, DELETE ni ALL.
  - El mismo nombre da 409 (y no 403), también cerca del tope, para pistas y para vídeos `upload` y de YouTube.
  - El tope: vídeos `usado + tamaño (o file_size_limit) < 1 GiB − 50 MB`; pistas `usado + 16 MiB × faltan < 1 GiB −
    50 MB`; tomas `usado < 1 GiB − 50 MB`. La reserva para una toma se cuenta una sola vez.
- **Creación de vídeos.** Ningún trigger crea vídeos: la conversión y el enlace solo usan vídeos que ya existen.
  `insertVideo` solo se llama desde `useCreateVideo`, y este desde `AddVideoDialog`, `useAddWishToLibrary` y
  `useAddBagSongToLibrary`. Los dos últimos solo desde su botón «Añadir a la biblioteca».
- **Índices parciales:**
  - `bag_items_youtube_once_key` cubre `(bag_id, youtube_id)` en filas vivas.
  - `bag_items_once_key` no choca con las canciones de YouTube (su clave es `null`, y en un índice único los `null`
    no chocan) y al enlazar impide tener dos veces el vídeo. El cliente lo evita archivando la copia, una fila por
    petición, por `guard_bulk_delete`.
- **Advisors esperables:**
  - Ninguna función `security definer` nueva en `public`, así que no hay 0028/0029 nuevos. Sigue el ya aceptado de
    `public.storage_usage`.
  - Todas las funciones nuevas llevan `search_path=''`.
  - Rendimiento:
    - `multiple_permissive_policies` en `storage.objects`: ya existía y ahora suma la política de pistas;
    - `unused_index` (INFO) para los índices nuevos;
    - `video_stems.video_id` está cubierto por `video_stems_video_idx`.
- **Tipos.** `database.types.ts` tiene las cinco columnas de `bag_items` y `video_stems` completa: `id` obligatorio al
  insertar, los numéricos como `number` y las tres relaciones.
- **Subida XHR (`backend.ts:74-123`):**
  - Hace lo mismo que supabase-js: `POST`, `x-upsert: false`, `apikey` con la clave pública y `Authorization` con el
    token de sesión o, si no hay sesión, con la clave pública.
  - No hay secretos en `src`, `api` ni `scripts`: ni `service_role` ni `sb_secret`.

## Veredicto

**Nada llega a 6.** Las tres migraciones se pueden aplicar en producción en ese orden: son aditivas, compatibles con
`main` y con la nueva versión, y no abren nada nuevo al cliente.

Recomiendo:
- Antes de ejecutar las comprobaciones en producción: el [4], o añadir a mano la línea de `allow_delete_query`.
- En una ronda posterior: los dos [3], la comprobación de 16 MiB en el cliente y apuntar como límite conocido el exceso
  posible de las pistas.

---

## Comprobaciones para el coordinador en producción

Todo como `postgres` (MCP `execute_sql` o el editor SQL), sin service role en el cliente.

**Cómo funcionan:**
- Cada bloque `A`, `B` y `C` es un `do $$ … $$` que solo mira el catálogo.
- Si todo está bien, termina con `raise exception 'PASS X (todo revertido)'`. Si algo falla, sale antes con
  `FAIL …`. En los dos casos se revierte todo.
- **El resultado es el texto del error:** `PASS X` es correcto y `FAIL …` es un problema.

### 0 · Antes de aplicar (solo lectura)

```sql
select version from supabase_migrations.schema_migrations order by version desc limit 3;
-- esperado: la última es 20261017010000 y ninguna de las tres nuevas está
select count(*) filter (where archived_at is null) as vivos, count(*) as total from public.videos;  -- 2 / 5
select count(*) from public.bags;                                                                     -- 4
select count(*) from public.bag_items;                                                                -- 9
select count(*), sum((metadata ->> 'size')::bigint) from storage.objects where bucket_id = 'videos'; -- 1 / ≈ 33,7 MB
select private.storage_bytes_used();                                                                  -- anotar
select file_size_limit, allowed_mime_types, public from storage.buckets where id = 'videos';         -- 52428800 / {video/*,audio/*} / false
```

Después de cada migración, las cifras de datos deben seguir iguales. `video_stems` debe tener 0 filas.

### A · Después de `20261017120000_bag_youtube_items`

```sql
begin;
do $$
declare
  f text;
begin
  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'bag_items' and is_nullable = 'YES'
        and column_name in ('youtube_id', 'title', 'artist', 'thumbnail_url', 'duration_seconds')) <> 5 then
    raise exception 'FAIL A1 columnas nuevas de bag_items (5, nulas)';
  end if;
  if (select count(*) from pg_constraint where conrelid = 'public.bag_items'::regclass and convalidated
      and conname in ('bag_items_one_ref', 'bag_items_youtube_fields')) <> 2
     or (select pg_get_constraintdef(oid) from pg_constraint
         where conrelid = 'public.bag_items'::regclass and conname = 'bag_items_one_ref') not like '%wish_id, youtube_id%' then
    raise exception 'FAIL A2 restricciones one_ref / youtube_fields';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'bag_items_youtube_once_key'
                 and indexdef like 'CREATE UNIQUE INDEX%' and indexdef like '%archived_at IS NULL%' and indexdef like '%youtube_id IS NOT NULL%')
     or not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'bag_items_once_key'
                 and indexdef like 'CREATE UNIQUE INDEX%' and indexdef like '%wish_id%' and indexdef like '%archived_at IS NULL%') then
    raise exception 'FAIL A3 índices únicos parciales';
  end if;
  if (select count(*) from pg_trigger where tgrelid = 'public.bag_items'::regclass and not tgisinternal and tgenabled = 'O'
      and tgname in ('bag_items_a_set_crew', 'bag_items_b_client_stamp', 'bag_items_c_check', 'bag_items_d_row_cap',
                     'bag_items_e_link', 'bag_items_archive_on_delete', 'bag_items_bulk_delete_guard')) <> 7 then
    raise exception 'FAIL A4 triggers de bag_items';
  end if;
  foreach f in array array['private.guard_bag_item()', 'private.guard_bag_item_link()'] loop
    if not (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = f::regprocedure)
       or has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception 'FAIL A5 % (definer, search_path, sin execute de cliente)', f;
    end if;
  end loop;
  if (select prosecdef or not proconfig @> array['search_path=""'] from pg_proc
      where oid = 'public.draw_from_bag(uuid, integer, boolean, uuid)'::regprocedure)
     or not has_function_privilege('anon', 'public.draw_from_bag(uuid, integer, boolean, uuid)', 'EXECUTE')
     or exists (select 1 from pg_proc p, aclexplode(p.proacl) a
                where p.oid = 'public.draw_from_bag(uuid, integer, boolean, uuid)'::regprocedure and a.grantee = 0)
     or (select prosrc from pg_proc where oid = 'public.draw_from_bag(uuid, integer, boolean, uuid)'::regprocedure)
        not like '%app.bag_draw%for update%nullif(btrim(v_item.title)%' then
    raise exception 'FAIL A6 draw_from_bag (invoker, search_path, marca app.bag_draw, grants)';
  end if;
  if not has_column_privilege('anon', 'public.bag_items', 'video_id', 'UPDATE')
     or not has_column_privilege('anon', 'public.bag_items', 'removed_at', 'UPDATE')
     or has_table_privilege('anon', 'public.bag_items', 'UPDATE') then
    raise exception 'FAIL A7 update de cliente solo en video_id y removed_at';
  end if;
  foreach f in array array['youtube_id', 'title', 'artist', 'thumbnail_url', 'duration_seconds', 'archived_at', 'bag_id',
                           'crew_id', 'clip_id', 'member_id', 'wish_id', 'created_at'] loop
    if has_column_privilege('anon', 'public.bag_items', f, 'UPDATE') then
      raise exception 'FAIL A7 anon puede actualizar bag_items.%', f;
    end if;
  end loop;
  if (select relrowsecurity from pg_class where oid = 'public.bag_items'::regclass) is not true then
    raise exception 'FAIL A8 RLS de bag_items';
  end if;
  if exists (select 1 from public.bag_items where num_nonnulls(video_id, clip_id, member_id, wish_id, youtube_id) <> 1) then
    raise exception 'FAIL A9 filas actuales con una sola fuente';
  end if;
  raise exception 'PASS A (todo revertido)';
end $$;
rollback;
```

Después, ejecutar enteros (cada uno abre su transacción y termina en `rollback`). Todos deben imprimir solo `PASS`:
- `supabase/tests/bag_youtube_checks.sql` (12 PASS);
- `supabase/tests/plan_b1_checks.sql` y `supabase/tests/plan_b2_checks.sql`, regresión de bolsas, sorteos y deseos;
- `supabase/tests/archive_checks.sql`.

### B · Después de `20261017130000_video_stems`

```sql
begin;
do $$
declare
  f text;
begin
  if (select relrowsecurity from pg_class where oid = 'public.video_stems'::regclass) is not true then
    raise exception 'FAIL B1 RLS de video_stems';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'video_stems'
      and roles @> array['anon'::name, 'authenticated'::name]
      and qual like '%default_group()%' and (qual like '%archived_at IS NULL%')) <> 3
     or (select count(*) from pg_policies where schemaname = 'public' and tablename = 'video_stems') <> 4 then
    raise exception 'FAIL B2 políticas de video_stems';
  end if;
  if (select count(*) from pg_trigger where tgrelid = 'public.video_stems'::regclass and not tgisinternal and tgenabled = 'O'
      and tgname in ('video_stems_a_set_crew', 'video_stems_b_client_stamp', 'video_stems_c_row_cap', 'video_stems_d_insert_rules',
                     'video_stems_archive_on_delete', 'video_stems_bulk_delete_guard', 'video_stems_files_once')) <> 7 then
    raise exception 'FAIL B3 triggers de video_stems';
  end if;
  if not has_table_privilege('anon', 'public.video_stems', 'SELECT')
     or not has_table_privilege('anon', 'public.video_stems', 'INSERT')
     or not has_table_privilege('anon', 'public.video_stems', 'DELETE')
     or has_table_privilege('anon', 'public.video_stems', 'UPDATE') then
    raise exception 'FAIL B4 grants de tabla';
  end if;
  foreach f in array array['vocals_path', 'instrumental_path', 'vocals_size', 'instrumental_size'] loop
    if not has_column_privilege('anon', 'public.video_stems', f, 'UPDATE') then raise exception 'FAIL B4 falta update %', f; end if;
  end loop;
  foreach f in array array['id', 'crew_id', 'video_id', 'member_id', 'source_file_name', 'source_file_size', 'model',
                           'duration_seconds', 'delay_seconds', 'mime_type', 'created_at', 'archived_at'] loop
    if has_column_privilege('anon', 'public.video_stems', f, 'UPDATE') then raise exception 'FAIL B4 anon puede actualizar %', f; end if;
  end loop;
  foreach f in array array['private.set_stems_crew()', 'private.video_object_size(text)', 'private.stem_object_allowed(text, text)',
                           'private.archive_row(text, uuid)'] loop
    if not (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = f::regprocedure) then
      raise exception 'FAIL B5 % no es definer con search_path vacío', f;
    end if;
  end loop;
  foreach f in array array['private.stems_insert_rules()', 'private.guard_stems_files()'] loop
    if (select prosecdef or not proconfig @> array['search_path=""'] from pg_proc where oid = f::regprocedure) then
      raise exception 'FAIL B5 % debería ser invoker con search_path vacío', f;
    end if;
  end loop;
  foreach f in array array['private.set_stems_crew()', 'private.stems_insert_rules()', 'private.guard_stems_files()'] loop
    if has_function_privilege('anon', f, 'EXECUTE') then raise exception 'FAIL B6 anon ejecuta %', f; end if;
  end loop;
  foreach f in array array['private.video_object_size(text)', 'private.stem_object_allowed(text, text)', 'private.archive_row(text, uuid)'] loop
    if not has_function_privilege('anon', f, 'EXECUTE') then raise exception 'FAIL B6 anon no ejecuta %', f; end if;
  end loop;
  foreach f in array array['''videos''', '''bags''', '''tracks''', '''polls''', '''events''', 'public.follow_paths', 'public.video_stems',
                           '''take_reactions''', '''event_songs''', '''poll_options''', '''wish_interest''', '''wishes''',
                           '''track_items''', '''bag_items''', '''takes''', '''members''', '''notes''', '''clips''', '''follow_paths''',
                           '''video_stems''', 'pg_trigger_depth() < 1'] loop
    if (select prosrc from pg_proc where oid = 'private.archive_row(text, uuid)'::regprocedure) not like '%' || f || '%' then
      raise exception 'FAIL B7 archive_row ha perdido %', f;
    end if;
  end loop;
  if (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname in ('videos_bucket_stems_select', 'videos_bucket_stems_insert')) <> 2 then
    raise exception 'FAIL B8 políticas de storage de las pistas';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd in ('UPDATE', 'DELETE', 'ALL')) then
    raise exception 'FAIL B9 hay políticas UPDATE/DELETE/ALL en storage.objects';
  end if;
  if (select allowed_mime_types @> array['audio/*'] and file_size_limit = 52428800 and not public
      from storage.buckets where id = 'videos') is not true then
    raise exception 'FAIL B10 bucket videos (privado, 50 MB, admite audio/*)';
  end if;
  raise exception 'PASS B (todo revertido)';
end $$;
rollback;
```

Después, ejecutar entero `supabase/tests/plan_stems_checks.sql` (20 PASS). Por el hallazgo [4], mientras no se corrija
el archivo, añadir a mano la línea `select set_config('storage.allow_delete_query', 'true', true);` justo debajo de
`begin;`. Si aparece un INCONCLUSIVE, la inserción directa en `storage.objects` ha fallado: mirar el `sqlstate`. Un
42501 sería una regresión.

Volver a ejecutar `supabase/tests/archive_checks.sql`, porque `archive_row` ha cambiado.

### C · Después de `20261017140000_videos_storage_cap`

```sql
begin;
do $$
declare
  f text;
  r record;
begin
  foreach f in array array['private.video_object_allowed(text, text, bigint)', 'private.video_object_allowed(text, text)',
                           'private.videos_bucket_has_room(bigint)'] loop
    if not (select prosecdef and provolatile = 's' and proconfig @> array['search_path=""'] from pg_proc where oid = f::regprocedure) then
      raise exception 'FAIL C1 % (definer, stable, search_path vacío)', f;
    end if;
  end loop;
  if not has_function_privilege('anon', 'private.video_object_allowed(text, text, bigint)', 'EXECUTE')
     or not has_function_privilege('anon', 'private.video_object_allowed(text, text)', 'EXECUTE')
     or not has_function_privilege('anon', 'private.object_size(jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'private.videos_bucket_has_room(bigint)', 'EXECUTE') then
    raise exception 'FAIL C2 grants de las funciones del tope';
  end if;
  if (select with_check from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'videos_bucket_open_insert') not like '%video_object_allowed(name, ''insert''::text, private.object_size(metadata))%'
     or (select qual from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'videos_bucket_open_select') not like '%video_object_allowed(name, ''read''::text)%' then
    raise exception 'FAIL C3 políticas de videos (insert con tamaño, lectura sin cambios)';
  end if;
  if (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname in ('takes_bucket_open_select', 'takes_bucket_open_insert')) <> 2 then
    raise exception 'FAIL C4 políticas de tomas';
  end if;
  if not private.videos_bucket_has_room(null) then
    raise exception 'FAIL C5 sin sitio con % bytes usados', private.storage_bytes_used();
  end if;
  for r in select v.storage_path from public.videos v
           where v.archived_at is null and v.storage_path is not null and v.crew_id = private.default_group() loop
    if not private.video_object_allowed(r.storage_path, 'read') then
      raise exception 'FAIL C6 % ya no se puede leer', r.storage_path;
    end if;
  end loop;
  raise exception 'PASS C (todo revertido)';
end $$;
rollback;
```

Después, ejecutar enteros:
- `supabase/tests/videos_storage_cap_checks.sql` (7 PASS) y `supabase/tests/plan_cloud_copy_checks.sql`;
- otra vez `plan_stems_checks.sql`, porque comparte la reserva de 50 MB, y `archive_checks.sql`.

**Para cerrar:**
- Ejecutar `get_advisors` de seguridad y de rendimiento. Lo esperado está en «Advisors esperables»: nada nuevo de
  seguridad salvo el ya aceptado de `storage_usage`.
- Comprobar que las cifras del paso 0 siguen iguales.
- Hacer la prueba funcional con datos «PRUEBA …» en la app, a tamaño móvil, y archivarlos al acabar:
  - meter una canción de YouTube en una bolsa, sacarla y pulsar «Añadir a la biblioteca»;
  - separar la voz de un vídeo de prueba y quitar las pistas.
