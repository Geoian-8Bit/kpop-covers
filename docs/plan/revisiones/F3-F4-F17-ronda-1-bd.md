# F3 · Tomas, F4 · Mejor toma — ronda 1, base de datos, storage y capa de datos

Revisión de solo lectura de los cambios de fase 2 sin commit: `supabase/migrations/20261016010000_takes.sql`, `supabase/tests/plan_fase2_checks.sql`, `apps/web/src/data/takes.ts`, las funciones de takes de `apps/web/src/lib/backend.ts` y `apps/web/src/features/takes/shareTake.ts` (con `takeRules.ts` y los usos de `TakesPanel.tsx` / `RecordStudio.tsx` cuando hacía falta). Especificación: `docs/plan/ideas-one-shoot.md`, F3 (l. 150) y F4 (l. 190).

Cómo se ha comprobado: lectura completa; `pnpm db:test` (11/11 migraciones, 3/3 ficheros, 41 PASS, todo en verde) y sondas propias en PGlite (aplican el stub y las 11 migraciones y ejecutan SQL como `anon`). Las sondas están en el scratchpad de la sesión: `f34probe.mjs` (runner), `f34_t1.sql` (reproduce los hallazgos), `f34_fix.sql` (arreglos propuestos, ya probados) y `f34_t2.sql` (comprueba los arreglos). PGlite es una sola conexión: las condiciones de carrera se razonan por lectura, no se han reproducido.

## Resumen

La migración es aditiva y compatible con la app desplegada: tabla y bucket nuevos, `archive_row` se reemplaza por un superconjunto y no se toca ninguna migración existente. El patrón general es correcto: `crew_id` lo fija el servidor desde el vídeo, `shared_path` nace a `null` para el cliente, no hay políticas UPDATE/DELETE en el bucket, un archivo por toma, lectura solo del `shared_path` registrado, grants de columna mínimos, índices en todas las FK, funciones `private` sin ejecución pública. No he encontrado forma de leer o subir archivos de otro grupo ni de leer un archivo no compartido.

Los problemas están en lo que no se comprueba al compartir y en lo que el servidor cree del cliente:

1. Una toma puede quedar «compartida» sin archivo, de forma irreversible (hallazgo 1, bloqueante). Pasa con un error de subida corriente; no hace falta un cliente hostil.
2. El tope de 1 GB solo existe en el cliente, el medidor baja al «borrar» aunque los archivos siguen en el bucket, y `shared_size` lo escribe el cliente (hallazgo 2).
3. «Guardar» no se puede reintentar si el insert llegó a hacerse (hallazgo 3).
4. «Una mejor toma por trío» tiene huecos: reasignar persona o tramo no reevalúa, y hay carrera entre dos móviles (hallazgo 4).
5. `clip_id` y `member_id` aceptan un tramo de otro vídeo o referencias archivadas (hallazgo 5).

Un bloqueante (1). Los arreglos de 1, 2 (parte servidor), 4 y 5 caben en la propia migración `20261016010000_takes.sql`: es la única sin commit y no figura entre las de `main`, así que si aún no se ha aplicado en ningún entorno se puede editar; si ya se hubiese aplicado en alguno, irían en una migración nueva `20261016020000_takes_hardening.sql` con el mismo SQL. Los arreglos están probados con `f34_fix.sql` (ver el SQL propuesto al final).

| # | Hallazgo | Nota |
|---|----------|------|
| 1 | 🔴 Toma «compartida» sin archivo, bloqueada para siempre | 7 |
| 2 | Tope de 1 GB solo en el cliente; el medidor miente tras «borrar»; `shared_size` falsificable | 6 |
| 3 | «Guardar» no se puede reintentar si la fila ya existe (id duplicado) | 5 |
| 4 | Mejor toma: reasignar persona o tramo salta la regla; carrera entre móviles | 5 |
| 5 | `clip_id` y `member_id` sin validar (tramo de otro vídeo, archivados) | 4 |
| 6 | Subidas huérfanas: carrera de extensiones, subida a tomas ajenas, copia de objetos | 3 |
| 7 | Mensajes de error sin traducir | 3 |
| 8 | Tope duro 4x (12 000 filas contando archivadas) sin salida desde la app | 3 |
| 9 | Pruebas SQL demasiado laxas y con huecos | 3 |
| 10 | URL firmada de 6 h sigue válida tras archivar; `recorded_at` libre; límite de 1000 filas | 2 |
| 11 | Nits: id sin default, guía de restauración, índices y advisors | 1 |

---

## 1. 🔴 Una toma puede quedar «compartida» sin archivo y no hay forma de deshacerlo — nota 7

**Dónde:** `supabase/migrations/20261016010000_takes.sql:96-113` (`guard_take_share`), `:222-227` (rama `insert` de `take_object_allowed`), `:160` (grant de `shared_path`); `apps/web/src/features/takes/shareTake.ts:367-385`; `apps/web/src/lib/backend.ts:48-58` (`uploadFailure`).

**Flujo concreto (sin atacante):**
1. En `shareTake`, `uploadTakeFile` falla con cualquier error con `status` que no sea 413/415 ni de red: 400, 401 (token caducado), 403, 404 (bucket aún sin migrar), 409, 429, 5xx. `uploadFailure` lo clasifica como `'denied'`.
2. `shareTake` trata `'denied'` como «el archivo ya estaba subido de un intento anterior» (comentario en l. 368-369) y sigue: `updateTake(take.id, { shared_path: path, shared_size })`.
3. La base acepta (`null → ruta` está permitido y no mira si el objeto existe). La fila queda con `shared_path` y sin archivo.
4. Ya no hay vuelta atrás: `guard_take_share` impide cambiar o vaciar la ruta (`shared_path_locked`), y la política de inserción del bucket exige `shared_path is null` (l. 224), así que el archivo ya no se puede subir nunca. El cliente enseña «En la nube» (`takeWhere`) y la reproducción desde otro móvil falla («No se pudo abrir la copia de la nube»). Solo el administrador puede arreglarlo.

También se puede provocar a propósito o por un cliente viejo o roto: cualquier móvil puede hacer `update takes set shared_path = '<grupo>/<id>.mp4'` en cualquier toma (ruta propia, el check lo permite) y bloquea la subida real.

**Evidencia (sonda `f34_t1.sql`, ejecutada como `anon`):**

    A1 shared_path set WITHOUT any file: accepted
    A2 upload after dangling share rejected (new row violates row-level security policy for table "objects"): take shared with no file forever

**Arreglo propuesto (servidor, la defensa real):** que la base solo acepte `shared_path` si el objeto existe y que el tamaño sea el real del objeto:
- función `security definer` `private.shared_object_size(path)` que lee `storage.objects` (bucket `takes`, `metadata->>'size'`);
- `guard_take_share` (sigue siendo `security invoker`, porque necesita el `current_user` del cliente) llama a esa función: si es `null`, `raise 'shared_file_missing'`; si existe, `new.shared_size := tamaño real`. Con la ruta ya fijada, `shared_size` también queda bloqueado. El trigger pasa a `before update of shared_path, shared_size`.
- Importante: el trigger no puede ser `security definer` entero, porque dentro `current_user` es el dueño y la comprobación de rol dejaría de aplicarse (lo comprobé: mi primer intento de arreglo se quedó sin efecto por eso).

**Arreglo propuesto (cliente):** en `shareTake.ts`, tratar como «ya subido» solo el caso que lo es de verdad. Distinguir el «ya existe» (409 `Duplicate` o mensaje «already exists») del resto de `'denied'`: añadir `'exists'` a `UploadFailure`. Ante cualquier otro `'denied'`, no apuntar la ruta y devolver `UPLOAD_COPY.denied`. Con el trigger de arriba, `shared_file_missing` queda como red de seguridad (y hay que traducirlo, hallazgo 7). Además, en el reintento tras «ya existe», el `shared_size` que manda el cliente es el de la copia recién regenerada, no el del archivo subido antes; con el trigger deja de importar.

**Test:** en `plan_fase2_checks.sql`: (a) `update ... set shared_path` sin objeto falla con `shared_file_missing`; (b) con objeto (`metadata '{"size": 4242}'`) acepta y `shared_size = 4242` aunque el cliente mande otro valor; (c) tras compartir, `update set shared_size = 0` no cambia nada. Probado en `f34_t2.sql`: «FIX A1 … rejected: shared_file_missing», «A2 … 4242 (client said 1)», «A3 … 4242».

---

## 2. Tope de 1 GB solo en el cliente, medidor engañoso y `shared_size` falsificable — nota 6

**Dónde:** `…takes.sql:30` (`shared_size`), `:160` (grant), `:222-227` (sin control de espacio en la subida), `:190-194` (bucket: 50 MB por archivo, sin tope total); `apps/web/src/lib/backend.ts:260-264` (`sharedTakesBytes`); `apps/web/src/features/takes/takeRules.ts:310-313` (`wouldOverflow`), `TakesPanel.tsx:306-330` y `:845-860`.

**Tres problemas relacionados:**

a) **Nada en el servidor limita el espacio.** `wouldOverflow` solo deshabilita el botón en la interfaz. Un móvil con la app antigua en caché, o cualquier cliente `anon`, puede subir 50 MB por cada toma viva: hasta 3000 tomas vivas x 50 MB, y hasta 12 000 contando archivadas, muy por encima del 1 GB del plan gratuito. Pasarse del límite del plan afecta a todo el proyecto (también a los vídeos de la biblioteca, que comparten el mismo 1 GB de storage).

b) **«Borrar» no libera espacio, pero el medidor sí baja.** Borrar archiva la fila y el archivo se queda en el bucket (regla del proyecto y de la propia migración, l. 8-9). `sharedTakesBytes` suma `shared_size` de las filas que RLS deja ver, es decir, solo las vivas. Tras borrar una toma de 40 MB el medidor muestra 40 MB menos, el diálogo dice «Borrad tomas compartidas que ya no hagan falta» (`TakesPanel.tsx` ~l. 858) y el espacio real sigue igual. El grupo puede llegar al límite real con el medidor al 50 %. Además la spec (F3) dice «Borrarla la quita de la nube», que no es lo que ocurre.

c) **`shared_size` lo escribe el cliente, siempre.** Se puede poner en cualquier toma, esté o no compartida, y cambiarlo después de compartir (la guarda solo cubre `shared_path`). Sondas: A3 (puesto a 0 tras compartir) y A4 (50 MB en una toma sin `shared_path`), ambos aceptados. El medidor y cualquier tope basado en él son falsificables.

**Arreglo propuesto:**
- Servidor, en la rama `insert` de `take_object_allowed`: negar si el espacio ya usado supera un umbral, contando todos los objetos (incluidos los de tomas archivadas y los huérfanos): suma del tamaño (`metadata->>'size'`) de `storage.objects` en los buckets `takes` y `videos` (es el mismo 1 GB) más 50 MB de margen, frente a 1 GiB (umbral como constante documentada). Hay índice por `(bucket_id, name)`, así que es un recorrido por rango pequeño.
- `shared_size` verdadero lo da el trigger del hallazgo 1.
- Medidor: una función `public.shared_takes_bytes()` (`security definer`, quitar el permiso a `public`, dárselo a `anon`) que sume el tamaño real del bucket `takes` incluyendo lo archivado. Los advisors avisarán de `anon_security_definer_function_executable` (0028) para esa función; es intencionado y se documenta en la migración.
- Copys: cambiar «Borrad tomas compartidas que ya no hagan falta» por algo que no prometa liberar espacio («Avisad al administrador para liberar espacio»), y ajustar la spec F3 («Borrarla la quita de la nube») para que diga que la copia se oculta y el administrador la purga.

**Test:** (a) con objetos que sumen más del umbral (insertados con tamaño en `metadata` como `postgres`), subir otro objeto como `anon` falla; (b) `shared_size` no se puede editar; (c) la función del medidor cuenta una toma archivada.

---

## 3. «Guardar» no se puede reintentar si la fila ya existe (id duplicado) — nota 5

**Dónde:** `apps/web/src/data/takes.ts:176-194` (`useSaveTake`), `apps/web/src/lib/backend.ts:236-240`; `…takes.sql:13` (`id uuid primary key` lo fija el cliente); `apps/web/src/features/record/RecordStudio.tsx:1118-1146` (`keepInApp`).

**Flujos concretos:**
1. `insertTake` llega a la base pero la respuesta se pierde (túnel, iPhone que pasa a segundo plano). El cliente ve un error, la fila existe pero `keepTake` nunca se ejecutó. El usuario pulsa «Guardar» otra vez: `insert` con el mismo id da `23505 takes_pkey`, siempre. La toma queda como fila «Ya no está en este móvil», el vídeo sigue en la carpeta de trabajo sin marcar `kept`, y la interfaz solo dice «Algo salió mal».
2. `keepTake` devuelve `false` (OPFS sin acceso): `useSaveTake` archiva la fila (`deleteTake` con el error tragado) y avisa. Si el usuario vuelve a pulsar «Guardar», la fila archivada sigue ocupando el id: otra vez `takes_pkey`. Además, si ese `deleteTake` falla, la fila queda viva sin archivo.

**Evidencia:** `E1 reinsert same id after archive: duplicate key value violates unique constraint "takes_pkey" [23505]`.

**Arreglo propuesto:** en `useSaveTake`, ante `23505` sobre `takes_pkey`, leer la fila por id: si existe y está viva, seguir con `keepTake` (idempotente). Si el id está archivado no se puede reutilizar: generar un id nuevo y renombrar la carpeta local, o impedir el reintento con un mensaje claro («Descarga la toma»). No tragarse el error de `deleteTake` del rollback: si falla, avisar de que la toma puede quedar listada sin vídeo.

**Test (cliente):** primer `insertTake` guarda y falla la respuesta; el segundo intento debe terminar con la toma «aquí». Test SQL: un insert con `on conflict (id) do nothing` como `anon` funciona (solo exige INSERT).

---

## 4. Mejor toma: huecos en la regla y carrera entre móviles — nota 5

**Dónde:** `…takes.sql:115-138` (`one_best_take`, trigger `after insert or update of is_best`); `:160` (el cliente puede cambiar `member_id` y `clip_id`); `apps/web/src/features/takes/takeRules.ts:152-165` (`assignPatch`).

**a) Reasignar no reevalúa (probado).** El trigger solo se dispara al cambiar `is_best`. Si se cambia `member_id` o `clip_id` de una toma con estrella a un trío que ya tiene otra con estrella, quedan dos. El cliente lo parchea a medias: `assignPatch` solo contempla `member_id` y usa la lista local (que puede estar desfasada respecto a otros móviles); el cambio de `clip_id` (comentario de l. 159, «re-file a take under a section») no tiene compensación alguna. Sonda: `B1 best takes in the same trio after reassigning member_id: 2`.

**b) Carrera.** Con READ COMMITTED, dos móviles que marcan a la vez dos tomas distintas del mismo trío ejecutan cada uno el `update` de limpieza sobre filas que el otro aún no ha confirmado: ninguno ve la estrella del otro, ambos confirman y quedan dos. No hay índice único que lo impida ni bloqueo por trío. Probabilidad baja (dos móviles en el mismo segundo), pero el fallo es silencioso y permanente (la interfaz asume una).

**Arreglo propuesto** (probado en `f34_fix.sql` y `f34_t2.sql`: «FIX B1 … 1 (mover lost its star: t)», «B2 … 1»):
- Pasar `one_best_take` a `before insert or update of is_best, member_id, clip_id`, con `pg_advisory_xact_lock` por trío (hash de vídeo, miembro y clip).
- Si se marca (o inserta) con estrella: poner a `false` las demás del trío (como ahora).
- Si solo cambia el trío y ya hay otra mejor en el trío de destino: `new.is_best := false` (la que se mueve pierde la estrella; es lo que ya hace `assignPatch`, así que no cambia la interfaz).
- Red de seguridad: índice único parcial `takes_one_best_key` sobre vídeo, miembro y clip (con `coalesce` a un uuid cero) donde `is_best and archived_at is null`. Con el trigger `before` que limpia antes de escribir no choca; si dos transacciones se cruzaran, una recibe `23505` (reintentable). Restaurar a mano tomas archivadas con estrella puede chocar con él: añadirlo a la guía de restauración.

**Test:** en `plan_fase2_checks.sql`, mover una toma con estrella a otro miembro que ya tiene estrella y comprobar que queda una sola; repetir con `clip_id`.

---

## 5. `clip_id` y `member_id` sin validar — nota 4

**Dónde:** `…takes.sql:16-17` (FK simples), `:160` (grant de actualización).

- `clip_id` puede apuntar a un tramo de otro vídeo (insert y update). La FK solo exige que el clip exista. La toma queda archivada bajo un tramo que no se ve en su canción y el trío de la regla de mejor toma se mezcla (C1 y C2 aceptados).
- Archivar un tramo o un miembro es un `update archived_at`, no un borrado real, así que `on delete set null` nunca salta: las tomas siguen apuntando a un clip o miembro archivado (`D1 takes still pointing at archived clip/member: 2`). La interfaz mostrará «Sin nombre» o sin tramo, pero la agrupación y el filtro seguirán usando un id que ya no existe en las listas.

**Arreglo propuesto** (probado): `private.guard_take_links()` (`before insert or update of clip_id, member_id`, `security definer`): si el clip no pertenece al mismo vídeo o está archivado, `new.clip_id := null`; si el miembro no es del grupo o está archivado, `new.member_id := null`. Anular en silencio y no fallar: un móvil con la lista desfasada no debe perder la toma al guardar. Para las que ya apuntan a un archivado, el cliente ya filtra por listas vivas; no recomiendo vaciar `member_id` al archivar un miembro (se perdería la autoría).

**Test:** insertar toma con clip de otro vídeo, `clip_id` queda `null`; con miembro archivado, `member_id` queda `null`.

---

## 6. Subidas huérfanas — nota 3

**Dónde:** `…takes.sql:222-227`.

- «Un archivo por toma» es un `not exists` sobre el prefijo del nombre, evaluado por la política al insertar. Dos subidas simultáneas con extensiones distintas (`.mp4` y `.webm`) pasan ambas la comprobación (cada transacción no ve la otra) y quedan dos archivos para una toma. El índice único `(bucket_id, name)` solo frena el mismo nombre. `useShareTake` no permite dos a la vez y solo un móvil tiene el original, así que el riesgo real es bajo.
- Cualquier móvil puede subir un vídeo a la ruta de una toma ajena sin compartir (la política solo exige fila viva y `shared_path is null`). Es lo esperado en un modelo de confianza sin login, pero deja al dueño con «denied» al compartir y, por el hallazgo 1, con un `shared_path` que apunta al archivo de otro. Con el arreglo del hallazgo 1 queda en: el dueño enlaza el archivo ajeno con su tamaño real. Aceptable según el modelo de confianza; documentarlo.
- `copy` de objetos de Storage (necesita SELECT en el origen e INSERT en el destino): un cliente puede copiar el archivo de una toma compartida al nombre de otra toma sin compartir y consumir espacio sin subir bytes. Lo cubre el tope de espacio del hallazgo 2.

**Arreglo:** los hallazgos 1 y 2 acotan los daños; no recomiendo tocar la política por esto. **Test:** subida a la carpeta de otro grupo, a un uuid en mayúsculas y a una toma archivada (hoy solo se prueba con una toma inexistente).

---

## 7. Mensajes de error sin traducir — nota 3

**Dónde:** `apps/web/src/lib/supabase.ts:22-46` (`friendlyError`). No está en el diff, pero decide lo que ve el usuario de las tomas.

Casos que hoy caen en «Algo salió mal. Inténtalo otra vez.»:
- `takes_cap_reached` (tope de filas): «El grupo ya tiene el máximo de tomas».
- `video … not found` (P0001 de `set_take_crew`): el vídeo se archivó mientras se grababa.
- `takes_pkey` (hallazgo 3) y `shared_file_missing` (hallazgo 1).
- `shared_path_locked` ya existe pero dice «Ese archivo no se puede cambiar» (copy de vídeos); en tomas lo que ve el usuario al compartir dos veces es otra cosa: «Esta toma ya está compartida».
- Un `update` sobre una toma que otro móvil acaba de archivar devuelve `PGRST116` (0 filas con `.single()`), también «Algo salió mal»; `useSetBestTake` revierte bien por `onError`, pero el usuario no sabe por qué.

**Arreglo:** añadir esas ramas a `friendlyError` con copys en español de España («Esta toma ya no existe», «El vídeo ya no está en la biblioteca», «El grupo ya tiene el máximo de tomas», «Esta toma ya está compartida»). **Test:** `friendlyError` con cada mensaje.

---

## 8. Tope duro 4x sin salida — nota 3

**Dónde:** `20261016000000_linked_file_and_members.sql:52-70` (`guard_simple_cap`), usado con `'3000'` en `…takes.sql:69-70`.

Las filas archivadas cuentan para un tope duro de 12 000 (4x). Cada toma guardada y cada «Limpiar» (archivar) suma una fila archivada que nunca se purga desde la app, y `useSaveTake` archiva también el intento fallido. Un grupo activo tarda años en llegar, pero cuando llegue el insert fallará con `takes_cap_reached` y solo se arregla desde el panel de Supabase. No bloquea. Documentar en `docs/DEPLOY.md` la purga de tomas archivadas (junto a la de archivos del bucket, que también es manual) y traducir el mensaje (hallazgo 7).

---

## 9. Pruebas SQL laxas y con huecos — nota 3

**Dónde:** `supabase/tests/plan_fase2_checks.sql`.

- l. 87-99: el bloque `exception when others` acepta cualquier error (un typo en el nombre de la tabla pasaría como «rechazado»). Comprobar `sqlstate = '42501'`.
- l. 71-76: si el `insert` directo en `storage.objects` falla, el bloque termina en `INCONCLUSIVE` con `return` y se pierden todas las comprobaciones de compartir. En el stub funciona; en Supabase real el insert directo puede estar restringido por el esquema `storage`, y entonces esa parte no prueba nada. Documentarlo.
- Faltan: subir a la carpeta de otro grupo o a un uuid de otra toma, subir a una toma archivada, leer un archivo no compartido, leer tras archivar la toma individualmente (solo se prueba tras archivar el vídeo), trío con `clip_id`, mover a otro trío, `shared_size`, miembro archivado, tope de filas (`takes_cap_reached`) y reintento con id duplicado.

Los tests de los hallazgos 1, 2, 4 y 5 cubren la mayoría de estos huecos.

---

## 10. Menores — nota 2

- **URL firmada de 6 h sigue válida tras archivar** (`backend.ts:256-259`): una URL ya emitida no se revoca al archivar la toma. La cabecera de la migración dice «its cloud copy stops being readable»; es cierto para firmas nuevas, no para las ya emitidas. Documentarlo o acortar a 1 h.
- **`recorded_at` libre** (`…takes.sql:28`; `stamp_new_row` no lo toca): un cliente puede fijar una fecha futura (`F1 recorded_at in 2099 accepted`) y la toma queda siempre la primera por «reciente» y dentro de «Hoy». Acotarlo en `take_insert_rules` a, como mucho, ahora más un día (el reloj del móvil puede ir adelantado).
- **`sharedTakesBytes` y el máximo de 1000 filas de PostgREST** (`backend.ts:260-264`): trae una fila por toma compartida y suma en el cliente; por encima de 1000 filas (el `max-rows` de Supabase) la suma se trunca sin avisar. Lo resuelve el RPC del hallazgo 2.
- **Lectura del bucket**: la política llama a `take_object_allowed` por objeto (una consulta y un join por archivo); bien con cientos, a revisar si algún día se lista el bucket entero.

## 11. Nits — nota 1

- `id uuid primary key` sin `default gen_random_uuid()`: no molesta al cliente, pero cualquier inserción manual del administrador debe poner el id.
- Falta, junto a la cabecera de `20261013000000_archive_and_hardening.sql`, la receta de restauración de tomas (poner `archived_at` a `null` en las tomas del vídeo con la misma marca de tiempo que el vídeo) y la advertencia del índice único del hallazgo 4.
- Advisors esperables: «unused index» en `takes_member_idx`, `takes_clip_idx` y `takes_crew_idx` mientras no haya tráfico (son índices de FK, mantenerlos); «anon security definer function executable» solo si se añade el RPC del hallazgo 2 (esperado). Sin `auth_rls_initplan` (las políticas usan `(select private.default_group())`).
- Bien y conviene no tocar: `set_take_crew` se ejecuta antes del tope (`takes_a_…` antes de `takes_c_…`); `take_insert_rules` anula `shared_path` y `shared_size` al insertar; las funciones `private` no son ejecutables salvo las que RLS necesita; `archive_row` conserva el comportamiento anterior; la migración se puede reaplicar (`if not exists`, `drop … if exists`).

## Aceptado por el modelo de confianza (sin hallazgo)

Cualquier móvil puede marcar la estrella, reasignar persona o tramo, o borrar (archivar) tomas de otro: «Solo puede borrarla quien la grabó o el móvil donde está» es una regla de la aplicación, como indica la propia migración y la spec («es una identificación de confianza, no de seguridad»).

---

## SQL propuesto (probado en PGlite, `f34_fix.sql`)

Se aplica tras `20261016010000_takes.sql`; si la migración aún no está aplicada, integrarlo en ella (y quitar de ella los triggers `takes_share_once` y `takes_one_best` que se reemplazan).

```sql
-- 1) existencia y tamaño real del archivo
create or replace function private.shared_object_size(p_path text)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce((o.metadata ->> 'size')::bigint, 0)
  from storage.objects o where o.bucket_id = 'takes' and o.name = p_path;
$$;
revoke execute on function private.shared_object_size(text) from public;
grant execute on function private.shared_object_size(text) to anon, authenticated;

-- invoker a propósito: current_user debe ser el del cliente
create or replace function private.guard_take_share()
returns trigger language plpgsql set search_path = '' as $$
declare v_size bigint;
begin
  if current_user::text not in ('anon', 'authenticated') then return new; end if;
  if old.shared_path is not null then
    if new.shared_path is distinct from old.shared_path then
      raise exception 'shared_path_locked' using errcode = 'P0001';
    end if;
    new.shared_size := old.shared_size;
  elsif new.shared_path is not null then
    v_size := private.shared_object_size(new.shared_path);
    if v_size is null then raise exception 'shared_file_missing' using errcode = 'P0001'; end if;
    new.shared_size := v_size;
  else
    new.shared_size := null;
  end if;
  return new;
end $$;
drop trigger if exists takes_share_once on public.takes;
create trigger takes_share_once before update of shared_path, shared_size on public.takes
  for each row execute function private.guard_take_share();

-- 5) clip del mismo vídeo y miembro vivo del grupo (si no, se anula en silencio)
create or replace function private.guard_take_links()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.clip_id is not null and not exists (
    select 1 from public.clips c
    where c.id = new.clip_id and c.video_id = new.video_id and c.archived_at is null) then
    new.clip_id := null;
  end if;
  if new.member_id is not null and not exists (
    select 1 from public.members m
    where m.id = new.member_id and m.crew_id = new.crew_id and m.archived_at is null) then
    new.member_id := null;
  end if;
  return new;
end $$;
create trigger takes_e_links before insert or update of clip_id, member_id on public.takes
  for each row execute function private.guard_take_links();

-- 4) una mejor toma por trío: before, con bloqueo por trío, reevalúa al mover, índice único de respaldo
create or replace function private.one_best_take()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not new.is_best or new.archived_at is not null then return new; end if;
  perform pg_advisory_xact_lock(hashtext('takes_best'),
    hashtext(new.video_id::text || coalesce(new.member_id::text, '-') || coalesce(new.clip_id::text, '-')));
  if tg_op = 'INSERT' or not old.is_best then
    update public.takes t set is_best = false
    where t.id <> new.id and t.video_id = new.video_id
      and t.member_id is not distinct from new.member_id and t.clip_id is not distinct from new.clip_id
      and t.is_best and t.archived_at is null;
  elsif old.member_id is distinct from new.member_id or old.clip_id is distinct from new.clip_id then
    if exists (select 1 from public.takes t where t.id <> new.id and t.video_id = new.video_id
        and t.member_id is not distinct from new.member_id and t.clip_id is not distinct from new.clip_id
        and t.is_best and t.archived_at is null) then
      new.is_best := false;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists takes_one_best on public.takes;
create trigger takes_f_one_best before insert or update of is_best, member_id, clip_id on public.takes
  for each row execute function private.one_best_take();
create unique index takes_one_best_key on public.takes
  (video_id, coalesce(member_id, '00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(clip_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where is_best and archived_at is null;
```

Notas sobre este SQL: (1) el orden de los triggers `before insert`, por nombre, es `takes_a_set_crew`, `takes_b_client_stamp`, `takes_c_row_cap`, `takes_d_insert_rules`, `takes_e_links`, `takes_f_one_best`: los vínculos necesitan el `crew_id` ya puesto y la mejor toma va la última, con el trío definitivo. (2) Falta, sin probar, el tope de espacio del hallazgo 2 (rama `insert` de `take_object_allowed` y la función `public.shared_takes_bytes()`). (3) Con `metadata` ausente (el stub de PGlite no la rellena al insertar objetos a mano) el tamaño sale 0; en Supabase real Storage siempre la rellena. (4) No he vuelto a pasar `pnpm db:test` con este SQL integrado en la migración; las comprobaciones actuales deberían seguir en verde (el objeto sin metadata da tamaño 0 y la ruta existe), pero conviene ejecutarlo tras integrarlo.

## Resultados de las sondas (antes y después)

Antes (migración actual): A1 aceptado; A2 la subida queda rechazada para siempre; A3 y A4 `shared_size` libre; B1 dos mejores en el mismo trío; C1 y C2 aceptados; D1 dos tomas apuntan a clip o miembro archivado; E1 `takes_pkey` (23505); E2 `video … not found` (P0001); F1 fecha 2099 aceptada.

Después (`f34_fix.sql`): A1 `shared_file_missing`; A2 `shared_size` = 4242 (tamaño real, el cliente mandó 1); A3 sigue 4242; C1 clip ajeno pasa a `null`; B1 una sola mejor toma y la que se movió perdió la estrella; B2 una sola mejor toma tras marcar.
