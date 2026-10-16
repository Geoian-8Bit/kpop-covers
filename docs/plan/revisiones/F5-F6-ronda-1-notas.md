# F5 · F6 — ronda 1: notas sobre la toma y capa de datos de la fase 3

Revisión de solo lectura (sin commit). Alcance: migración `20261016020000_review_and_take_notes.sql`, `supabase/tests/plan_fase3_checks.sql`, y en el cliente `features/review/{TakeNoteComposer,TakeNoteCard,reviewRules}`, `data/notes.ts`, `lib/backend.ts` (NotePatch, TakePatch, demo), `lib/supabase.ts`, `features/studio/{NoteDialog,StudioPage}.tsx` y `database.types.ts`.

## Resumen

- `pnpm typecheck`: limpio. `reviewRules.test.ts`: 34/34. `pnpm db:test`: 17/17 migraciones, 7/7 ficheros, 72 PASS (incluidos los 5 de `plan_fase3_checks.sql`). El repo no tiene configuración de ESLint, así que no se ha podido pasar el linter.
- Probado en navegador (Chromium, demo local con una toma real en OPFS): componer nota con categoría, destinatario y dibujo (círculo y flecha), guardar, abrir desde el punto, y filtro del estudio por destinatario (Eva no ve la nota de Eva para Ian; Ian sí).
- Reglas de la spec cubiertas: momento automático, categoría opcional, «para quién» por defecto quien grabó, dibujo opcional, puntos y aviso al reproducir, estado pendiente o resuelta, y notas de toma visibles en la canción solo para su destinatario. Las notas son texto en la base de datos, así que se comparten aunque el vídeo esté en otro móvil.
- Nada bloquea el despliegue de la migración (ningún 🔴). Conviene arreglar antes de dar F6 por cerrada H1 y H2.
- Seguridad: el dibujo solo entra como `data:image/(webp|png|jpeg);base64,…` (misma regex en cliente y en la restricción de la base de datos, ≤ 60 000 caracteres). No hay vector de XSS en `<img src>` y la CSP ya permite `data:` en `img-src`. Los grants de `update` son por columna (`category`, `for_member_id`, `status`, `sketch`, más `body` y `at_seconds` de antes); `take_id` y `take_seconds` no se pueden cambiar. Correcto.

## Hallazgos

### H1 · El dibujo se queda pegado sobre la toma al moverse del momento de la nota — nota 6
- Dónde: `ReviewScreen.tsx` (`const sketch = openNote && sketchShown && !playing && …`), `TakeNoteComposer.sketchImage`.
- Flujo: abrir una nota con dibujo desde su punto, pausar y avanzar con `→`, `.` o la barra.
- Evidencia: probado. Nota en 0:03, tiempo actual 0:06, y `img[alt^="Dibujo de la nota"]` sigue en el DOM. El dibujo guardado es el fotograma entero (opaco) más las formas, no una capa transparente. Al moverse, el fotograma congelado tapa la imagen real de la toma.
- Arreglo: mostrar el dibujo solo mientras `|review.time - note.take_seconds| < ~0,15 s` (u ocultarlo al hacer seek o scrub), o guardar solo las formas con transparencia. Lo primero es lo más barato.
- Test: regla pura `sketchVisibleAt(note, time)` en `reviewRules.test.ts` y comprobación en navegador.

### H2 · «Dibujar de nuevo» al editar captura el fotograma del momento actual, no el de la nota — nota 5
- Dónde: `ReviewScreen.editNote` (`captureFrame(takeVideo.current)`).
- Flujo: abrir una nota, mover el cursor a otro momento (la tarjeta sigue abierta), pulsar «Editar» y «Dibujar de nuevo». El dibujo nuevo se guarda sobre un fotograma que no es el de `take_seconds`, y la canción (`NoteDialog`) y el repaso muestran un fotograma distinto del momento que dice la nota. (Por lectura de código; H1 prueba que el cursor puede estar lejos con la tarjeta abierta.)
- Arreglo: en `editNote`, hacer seek a `note.take_seconds` y esperar a `seeked` antes de capturar, o desactivar «Dibujar de nuevo» si el cursor está a más de 0,15 s del momento, con una frase que lo explique.
- Test: unitaria de la regla de distancia.

### H3 · La nota se queda sin destinatario en silencio si quien grabó ya no está en el grupo — nota 4
- Dónde: `TakeNoteComposer` (`defaultFor={take.member_id}`) y trigger `private.guard_note_links`.
- Flujo: se revisa una toma cuyo `member_id` es un miembro archivado (RLS lo oculta de `useMembers`). Ningún chip aparece marcado (ni «Todo el grupo»). Al guardar se envía el UUID archivado y el trigger lo pone a `null` sin avisar. La nota queda «para todo el grupo» y visible a todos en la canción, aunque el compositor no mostraba destinatario.
- Arreglo: `defaultFor = members.some(m => m.id === take.member_id) ? take.member_id : null`; lo mismo con `note.for_member_id` al editar.
- Test: unitaria de la función que resuelve el destinatario por defecto.

### H4 · `listNotes` descarga todos los dibujos con `select *` — nota 4
- Dónde: `lib/backend.ts` (`listNotes`), `useNotes` (estudio y repaso).
- Evidencia: cada nota puede llevar hasta 60 KB de base64. Con el tope de 5000 notas por grupo son hasta 300 MB en base de datos, y una canción con 40 notas dibujadas puede pasar de 1,5 MB en cada recarga. Se descargan también las notas dirigidas a otras personas, que el estudio luego oculta.
- Arreglo: listar sin `sketch` (columnas explícitas) y pedirlo por nota al abrirla; opcionalmente un tope de notas con dibujo por canción.

### H5 · Optimismo de `useUpdateNote`: la reversión pisa cambios ajenos — nota 4
- Dónde: `data/notes.ts` (`onError` restaura `context.before`, la lista entera).
- Flujo: se marca «Resuelta» (petición lenta), se crea otra nota y la primera falla. Se restaura la lista antigua y la nota nueva desaparece hasta el próximo refetch. Con dos cambios de estado seguidos, la reversión del primero deshace también el segundo.
- Arreglo: revertir solo esa nota y añadir `onSettled` con `invalidateQueries`, como hace `useDeleteNote`.
- Test: prueba con `QueryClient` en memoria que cree una nota durante una actualización fallida.

### H6 · Una nota de toma y otra de canción chocan por la clave única `(video_id, at_seconds, body)` — nota 4
- Dónde: índice `notes_video_at_body_key` (migración `20261013000000`), que esta migración no ajusta. `friendlyError` responde «Esa nota ya está guardada».
- Flujo: un texto frecuente («Más energía») en el mismo segundo de canción, escrito en dos tomas con el mismo inicio, o en la toma y en la canción. La segunda falla con un mensaje que parece un doble toque, y la primera puede estar oculta por el filtro por destinatario.
- Arreglo: incluir `coalesce(take_id, uuid nulo)` y `coalesce(for_member_id, uuid nulo)` en el índice único parcial (mantiene la protección contra el doble toque en la misma toma).
- Test: en `plan_fase3_checks.sql`, dos notas iguales en tomas distintas deben convivir y la repetida en la misma toma debe fallar.

### H7 · Si la toma se archiva, editar el destinatario convierte la nota en pública — nota 3
- Dónde: `guard_note_links` (`before insert or update of take_id, for_member_id, author_member_id`).
- Flujo (por lectura, no ejecutado): la toma se archiva (es un `update`, no salta `on delete set null`); alguien cambia `for_member_id` de una nota de esa toma. El trigger ve la toma archivada, pone `take_id` y `take_seconds` a `null`, y `songNotes` deja de filtrar por destinatario (`!n.take_id`). La nota para Ian pasa a verla todo el grupo.
- Arreglo: en el `update`, validar la toma solo si `take_id` ha cambiado (`new.take_id is distinct from old.take_id`). Test en el SQL con una toma archivada.

### H8 · Los puntos están en una barra, no en «la ola» de la toma — nota 3
- Dónde: `ReviewControls.ReviewTimeline`. La spec dice «puntos en la ola de la toma».
- Detalle: los puntos van sobre el control deslizante, sin ola de audio, y sin `assignLanes` como en el estudio: con varias notas cercanas en una toma larga los objetivos de 44 px se superponen y el último tapa a los demás.
- Arreglo: aceptable si se considera «ola» la barra; si no, usar la ola o añadir carriles o agrupación.

### H9 · El autor de una nota para otra persona no la ve en la canción — nota 3
- Dónde: `reviewRules.songNotes` (`n.for_member_id === meId`).
- Detalle: la regla de la spec es literal («para su destinatario»), pero quien escribe una corrección para Ian no la ve ni la puede editar desde el estudio, solo desde el repaso. El destinatario ve «Pendiente» pero no puede marcarla «Resuelta» desde `NoteDialog`. Además, el filtro es solo de interfaz: las notas son legibles para todo el grupo por la API (modelo de confianza sin login).
- Arreglo: mostrar también al autor (`author_member_id === meId`) y añadir el estado en `NoteDialog` para notas con `take_id`; documentar la decisión en la spec.
- Test: ampliar el test de `songNotes`.

### H10 · Accesibilidad del lienzo y del compositor — nota 4
- Lienzo (`SketchPad`): el dibujo solo funciona con puntero; no hay alternativa con teclado (colocar un círculo con flechas y Enter, por ejemplo). Es opcional y la nota se guarda sin él, pero quien usa teclado o lector de pantalla no puede dibujar. Con `touch-none` en el lienzo no se puede desplazar el diálogo arrastrando sobre él en móvil, y en 800 px de alto el lienzo (346 px) queda en parte bajo el pliegue.
- Chips (`Chip`): `role="radio"` dentro de `radiogroup` sin flechas ni tabindex itinerante, y «Categoría» deja desmarcar el chip activo (comportamiento de interruptor, no de radio). Usar `role="group"` con `aria-pressed`, o implementar las flechas.
- `TakeNoteCard`: el botón de estado combina `aria-pressed` con un texto «Pulsa para marcarla como…» que cambia; elegir una de las dos formas.
- La tarjeta de nota (`absolute top-2`) tapa la parte superior del fotograma, justo donde puede estar el dibujo. Colocarla fuera del encuadre o permitir ocultarla.

### H11 · Detalles menores — nota 2–3
- `newNote` toma `review.time` y `review.timing` de la instantánea previa a `pause()`: el fotograma capturado puede ir hasta ~1 fotograma por delante de `take_seconds`.
- `at_seconds` usa el ajuste fino vigente al escribir; si luego cambia, las notas ya guardadas quedan con el desfase antiguo (el punto del repaso usa `take_seconds`, el de la canción `at_seconds`). Documentarlo.
- Si llegara `take_seconds` sin `take_id`, `friendlyError` responde «Ese momento queda fuera de la toma», que no es la causa real (la restricción `notes_take_seconds_range` exige también el `take_id`).
- El demo (`insertNote`) no reproduce el trigger, la clave única ni la restricción del dibujo, así que esas rutas solo las cubre `db:test`. Convendría que validase `isValidSketch` y descartase `take_id` inexistentes.
- `encodeSketch` empieza siempre a 320 px; el dibujo de prueba pesaba ~4 000 caracteres de 60 000, hay margen para 480 px.
- Textos en español de España y colores solo con tokens (`shu`, `sumi`, `rokusho`, `ai`, `kin`, `washi`); el lienzo lee los tokens de `:root`.

## Lo que está bien
- Migración aditiva, con valores por defecto y restricciones con nombre que `friendlyError` traduce; repetible (`drop constraint if exists` y `add`). `notes_zz_links` se ejecuta después de `notes_set_crew` y deja caer enlaces rotos en lugar de perder la nota.
- Los rangos de `takes` coinciden con `clampFit`, `clampAdjust` y `NO_FIT`.
- `songTimeAt` y la nota: con `songStart` 10 y momento 3 salió `at_seconds` 13 (comprobado en el demo).
- Tests de reglas y de SQL cubren categorías, estados, filtro por destinatario, dibujo (WebP, estrechamiento, JPEG, rechazo) y avisos solo con reproducción natural.

## Notas por área (1–10)
| Área | Nota |
| --- | --- |
| Migración y tests SQL | 8 |
| Reglas puras (`reviewRules`) | 8 |
| Compositor y dibujo | 6 |
| Tarjeta, puntos y avisos | 6 |
| Capa de datos (React Query, backend, demo) | 6 |
| Seguridad (dibujo, grants, RLS) | 9 |
| Accesibilidad | 5 |
| Regresiones en notas del estudio | 8 |
