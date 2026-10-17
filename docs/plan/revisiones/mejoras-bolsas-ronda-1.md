# Revisión · Mejoras de bolsas (puntos 28–32), ronda 1

**Revisor:** solo lectura (17-10). Rama `feat/plan-completo`, cambios sin commit.

## Alcance

- `supabase/migrations/20261017120000_bag_youtube_items.sql`, leída entera junto a `20261016030000_bags_and_tracks.sql`,
  `20261016035000_bag_draws_hardening.sql` y `20261016040000_wishes_and_polls.sql`. Ninguna migración posterior
  redefine `guard_bag_item` ni `draw_from_bag`: `20261017130000_video_stems` solo toca `archive_row`.
- `supabase/tests/bag_youtube_checks.sql`, `packages/shared/src/database.types.ts` (`bag_items`).
- `apps/web/src/lib/backend.ts` (bolsas: Supabase y demo), `apps/web/src/data/bags.ts`.
- `apps/web/src/features/bags/**`: BagPage, BagDrawStage, BagIcon, BagShelf, BagsPage, AddItemsDialog, songRules y su
  test, BagIconDemo, BagsListDemo. `features/lab/moments/bags.tsx` y su línea en `registry.ts`.
- Comparado con lo que hay en producción (`main`), para ver la compatibilidad con la app desplegada.

**Ejecutado:**
- `node supabase/tests/local/run.mjs` (PGlite) cinco veces. En las cuatro últimas, 22/22 migraciones,
  **11/11 ficheros y 112 PASS**. `bag_youtube_checks.sql` da sus 8 PASS. En la primera salió 10/11 y 107 PASS: no
  guardé qué fichero falló. Lo más probable es `plan_stems_checks.sql`, que otro agente estaba escribiendo en ese
  momento. No se ha vuelto a repetir.
- `vitest run src/features/bags`: 23/23 (drawRules y songRules).
- `tsc --noEmit` en `apps/web`: nada en bolsas. Los únicos errores están en `features/voice/separate/encode.ts`
  (otra zona, otro agente).

## Hallazgos (de mayor a menor)

- **[4] apps/web/src/features/bags/AddItemsDialog.tsx:106 y :189 — doble envío en «Buscar en YouTube».**
  `YouTubeSongForm` tiene su propio `useAddBagItem()`. El botón del pie («Añadir a la bolsa») y el `busy` del
  diálogo miran el `add` de fuera, que nunca está pendiente en esa pestaña. Así que el botón no se bloquea ni gira
  mientras se guarda. Con un doble toque salen dos inserts. El segundo lo frena `bag_items_youtube_once_key`, y debajo
  del aviso de éxito aparece «Eso ya está en la bolsa.». No duplica nada, pero confunde.
  *Arreglo:* usar una sola mutación. Por ejemplo, pasar `add` como prop al formulario, o subir el `isPending` con
  un callback, y usar ese valor en `loading` y en el `busy` del Dialog.

- **[3] supabase/migrations/20261017120000_bag_youtube_items.sql:91-104 — el duplicado por vídeo de YouTube no mira
  los deseos.** El trigger impide tener a la vez la canción de YouTube X y el vídeo de biblioteca con X. Pero sí deja
  meter X como canción de YouTube cuando en la bolsa ya hay un deseo con `youtube_id` X, y al revés. La interfaz
  (`youtubeSongStatus` → «Ya en la bolsa») y la demo (`backend.ts:1075`, `songYoutubeId` incluye el deseo) sí lo
  impiden. La demo es más estricta que la base.
  *Arreglo:* en la comprobación, añadir los deseos vivos: `or exists (select 1 from public.wishes w where
  w.id = i.wish_id and w.youtube_id = v_ytid and w.archived_at is null)`. Y para una fila nueva de deseo, calcular
  `v_ytid` con su `youtube_id`. Así base, demo e interfaz coinciden. Añadir el caso a `bag_youtube_checks.sql`.

- **[3] apps/web/src/data/bags.ts:244-281 — «Añadir a la biblioteca» solo enlaza la fila de esta bolsa.** Si la
  misma canción de YouTube está en otras bolsas, allí sigue como «no está en la biblioteca» aunque ya lo esté. No hay
  duplicado y el historial se conserva. En esas bolsas, al pulsar el botón se encuentra el vídeo y se enlaza bien,
  pero mientras tanto la etiqueta es falsa.
  *Arreglo:* después de crear o encontrar el vídeo, enlazar todas las filas vivas del grupo con ese `youtube_id`.
  O hacerlo en el servidor, con un `after insert` en `videos` que enlace las canciones de YouTube del mismo grupo.
  El trigger de enlace ya valida cada fila.

- **[3] apps/web/src/data/bags.ts:259-271 — carrera al crear el vídeo.** Si dos móviles pulsan «Añadir a la
  biblioteca» a la vez, el segundo `createVideo` choca con la unicidad de `videos (crew_id, youtube_id)` y ve un error
  genérico. Al reintentar funciona.
  *Arreglo:* ante un 23505 al crear, volver a leer la biblioteca y enlazar con el vídeo encontrado.

- **[3] supabase/tests/bag_youtube_checks.sql — faltan casos negativos del enlace y de columnas.** Ya cubre mucho:
  id, título, longitudes, miniatura, dos fuentes, título en un ítem que no es de YouTube, YouTube en una bolsa de
  clips, duplicados, enlace a otro vídeo, editar el título y cambiar el vídeo de un ítem de biblioteca. Falta probar:
  enlazar a un vídeo **archivado**; enlazar a un vídeo de **otro grupo** (insertar crew y vídeo como postgres antes de
  `set role`); `video_id = null` en una canción de YouTube; poner `video_id` a un ítem de clip o de persona; YouTube en
  una bolsa de personas; que `anon` no puede actualizar `youtube_id`, `artist`, `thumbnail_url` ni `duration_seconds`
  (hoy solo se prueba `title`); enlazar un ítem sacado en una bolsa «se quita» (`removed_at` puesto); y meter X como
  YouTube cuando el vídeo X de la bolsa está archivado (debe entrar).
  *Arreglo:* añadir esos bloques `do $$ … $$`.

- **[3] apps/web/src/features/bags/BagPage.tsx:278 (y BagsPage.tsx:30) — `--fab-clearance` como relleno inferior.**
  El shell define la variable como espacio **a la derecha**: `72px + env(safe-area-inset-right)`
  (`AppShell.tsx:184-186`). Usarla como relleno inferior deja unos 96 px. En un iPhone con barra de inicio (unos 34 px
  de zona segura abajo), el botón flotante llega a unos 106 px del borde. La papelera de la última fila puede quedar
  unos 10 px debajo del botón. No lo he medido en un dispositivo.
  *Arreglo:* `pb-[calc(var(--fab-clearance,0px)+env(safe-area-inset-bottom)+1.5rem)]`, o una variable propia para el
  hueco inferior en el shell.

- **[2] supabase/migrations/20261017120000_bag_youtube_items.sql:91-104 — carrera entre fuentes.** Dos inserts a la
  vez de la misma canción, uno como YouTube y otro como vídeo de biblioteca, pasan los dos el trigger. Los índices no
  chocan porque las claves son distintas. Es muy raro con un solo grupo.
  *Arreglo, si se quiere cerrar:* `perform pg_advisory_xact_lock(hashtext(new.bag_id::text || v_ytid))` antes de la
  comprobación.

- **[2] apps/web/src/features/bags/BagDrawStage.tsx:222 — el panel del resultado crece al revelar.** La altura mínima
  es de 96 px, y la tarjeta más las fichas de «Sacar varios» empujan «Sacar» hacia abajo justo cuando se va a volver a
  tocar. A 390×844 sigue cabiendo sin desplazar. Mi cálculo: cabecera de unos 52 px, escena de unos 314 px y «Sacar»
  de 52 px; terminan hacia los 520 px, contando la barra superior.
  *Arreglo:* reservar la altura de la tarjeta (`min-h` de unos 120 px) y dejar que solo crezca la lista de «También
  salieron».

- **[2] apps/web/src/features/bags/BagPage.tsx:612-618 — pestañas sin Inicio/Fin.** Las flechas funcionan y el
  marcado es correcto (`tablist`, `tab`, `aria-selected`, `aria-controls` y `tabpanel` con foco). Faltan `Home` y
  `End`.
  *Arreglo:* dos casos más en `onKey`.

- **[2] apps/web/src/features/bags/BagPage.tsx:335-337 — el sorteo no se anuncia mientras gira.** «Ha salido: …» se
  anuncia bien al revelar, también cuando repite la misma canción. Durante el giro, «Sacar» se desactiva sin decir
  nada.
  *Arreglo:* poner «Sorteando…» en la misma región `aria-live` en la fase `shaking`.

- **[2] apps/web/src/features/bags/BagShelf.tsx:309-315 — brillo de los farolillos.** Es correcto: solo anima
  `opacity`, sobre una capa con `blur-2xl` de 118 px por farolillo, dentro de una capa que gira. En móviles flojos y
  con muchas bolsas pesa al pintar la primera vez.
  *Arreglo, si gana «Farolillos»:* cambiar el `filter: blur` por un `radial-gradient` con los mismos tokens.

- **[2] apps/web/src/features/bags/BagShelf.tsx:141, :217 y :282 — `<style>{SHELF_CSS}</style>` repetido.** Se
  inyecta una vez por grupo: hasta 3 en la página y otras más en el laboratorio.
  *Arreglo:* llevar los keyframes a `index.css` o ponerlos una sola vez en `BagsPage`.

- **[2] apps/web/src/features/bags/songRules.ts:41-43 — recorte por unidades UTF-16.** `slice(0, 200)` puede partir
  un emoji y dejar un sustituto suelto, que PostgREST o Postgres rechazan.
  *Arreglo:* `Array.from(str).slice(0, n).join('')`.

- **[1] BagShelf.tsx:177 y BagDrawStage.tsx:182, :244 — colores `rgb(...)` sueltos en sombras.** Ya estaban antes
  (BagsPage y BagDrawStage de `HEAD`). Se pueden pasar a tokens cuando se toque el diseño elegido.

## Lo que está bien (comprobado)

- **Migración aditiva y compatible.** Las columnas nuevas admiten `null`. `bag_items_one_ref` se amplía a un
  superconjunto, y `bag_items_youtube_fields` se cumple en todas las filas actuales (todo `null`). Ninguna restricción
  nueva puede fallar al aplicarse. Todo usa `if not exists` / `drop … if exists`, así que se puede repetir.
- **La app de producción (`main`) sigue funcionando.** Inserta ítems de biblioteca, clip, persona o deseo igual que
  antes. Un móvil con la versión vieja en caché que vea una canción de YouTube la muestra como «No disponible» en la
  lista y con su título en el sorteo (`draw.label`). No se rompe.
- **`create or replace` conserva todo.**
  - `guard_bag_item`: `security definer`, `search_path = ''`, la rama de deseos de 040000, el grupo y el archivado.
    Se vuelve a hacer `revoke execute`.
  - `draw_from_bag`: idéntica a la de 040000 (`security invoker`, marca `app.bag_draw` al entrar y al salir,
    `for update`, «sin repetir», tope de 1 a 10, grants), más la etiqueta `nullif(btrim(title), '')`.
  - `guard_bag_item_link`: `security definer`, `search_path = ''`, `revoke execute`.
- **`grant update (video_id)` no abre nada.**
  - RLS de update sin cambios: grupo por defecto y no archivado.
  - El cliente solo puede tocar `removed_at` y `video_id`. Hay prueba de que `title` se rechaza.
  - El trigger solo deja pasar de canción de YouTube a vídeo vivo del mismo grupo y con el mismo `youtube_id`, y
    limpia las columnas de YouTube.
  - Un ítem de biblioteca, clip o persona no se puede cambiar de vídeo. Poner `video_id` a `null` se rechaza.
  - El upsert no sirve de atajo: exige `update` sobre `bag_id`, o el insert cae en `bag_not_found`.
- **Índices parciales.** `bag_items_youtube_once_key` excluye las filas archivadas y las ya enlazadas.
  `bag_items_once_key` sigue cubriendo el resto de fuentes. Al enlazar, el `once_key` impide tener dos veces el mismo
  vídeo, y el cliente lo evita antes borrando (archivando) la copia.
- **Ningún paso crea un vídeo por su cuenta** (punto 36 aplicado a las bolsas). Solo hay tres sitios que crean
  vídeos: `AddVideoDialog`, `useAddWishToLibrary` y `useAddBagSongToLibrary`, y los dos últimos solo se llaman desde
  su botón «Añadir a la biblioteca». El trigger de insert convierte en vídeo de biblioteca, pero nunca crea vídeos.
  `YouTubePicker` solo busca.
- **Función.**
  - Una canción ya en la biblioteca entra como ese vídeo (base, demo e interfaz).
  - El enlace después de sacar mantiene la fila y su historial.
  - «Sacar varios» → ronda: un clip al azar por canción. Las de YouTube y los deseos sin vídeo se quedan fuera, con
    aviso y contador.
  - La demo copia fielmente la conversión, el enlace, el duplicado entre fuentes y la etiqueta, salvo el caso de los
    deseos del hallazgo 3.
- **Interfaz.**
  - Cabecera de una línea, con iconos de 44 px.
  - «Sacar» y «Añadir» van juntos; «Sacar varios» y las pestañas tienen 44 px.
  - El texto largo se trunca y nada se sale a 390 px.
  - La bola es una capa HTML que solo usa `transform` y `opacity` (`soft`, `jelly` y `snappy`).
  - `MotionConfig reducedMotion="user"`, y las animaciones CSS del laboratorio se apagan con
    `prefers-reduced-motion`.
- **Laboratorio.** `bags.tsx` carga las demos de forma diferida (`BagsListDemo-*.js` y `BagIconDemo-*.js`, que no
  entran en el precache). La línea del registro es correcta. Las propuestas animan con CSS (`transform` y
  `opacity`), sin nada de React por fotograma.

## Veredicto

**Nada llega a 6.** La migración se puede aplicar en producción tal cual: es aditiva, compatible con la app
desplegada y no abre nada nuevo al cliente. Recomiendo, antes del despliegue o justo después:

- arreglar el doble envío (4);
- cerrar el hueco de los deseos en `guard_bag_item` y añadir sus pruebas negativas (3 + 3);
- en una ronda posterior, enlazar las copias de las otras bolsas (3).
