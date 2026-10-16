# Revisión · F1 (archivo vinculado) y F2 (quién es quién) · Ronda 1 · Base de datos y seguridad

**Alcance:** commit `9ad9fd7` (`git diff b59550e..9ad9fd7`), parte de base de datos y seguridad: la migración nueva `supabase/migrations/20261016000000_linked_file_and_members.sql`, las comprobaciones `supabase/tests/plan_fase1_checks.sql` y el uso que hace el cliente (`apps/web/src/data/videos.ts`, `apps/web/src/lib/backend.ts`, `apps/web/src/data/members.ts`, `LinkFilePanel.tsx`, `StudioPage.tsx`, `AddVideoDialog.tsx`). Comparada con las migraciones anteriores, sobre todo `20261013000000_archive_and_hardening.sql`.
**Tipo de revisión:** solo lectura. Los números de línea son los del commit `9ad9fd7`. No se ha tocado Supabase real.
**Pruebas hechas:**
- `pnpm db:test`: 9/9 migraciones aplicadas, 2/2 ficheros de comprobación, 28 PASS. Ojo: aplicó también `20261016010000_takes.sql`, que está sin seguimiento en git y no es de este commit.
- Pruebas sueltas propias en un PGlite aparte, con las migraciones solo hasta la de este commit y actuando como `anon`. El script está fuera del repositorio, en la carpeta temporal. Sus resultados se citan como «prueba propia».

---

## Resumen

La migración es aditiva y compatible con la app desplegada (`main`, `6b9e4d3`). Conserva todas las protecciones de la ronda de archivado:
- permisos de escritura por columna;
- sellos de servidor al crear filas;
- topes de filas;
- bloqueo del borrado masivo;
- borrar = archivar;
- sin borrado ni sobrescritura en el bucket.

Las funciones nuevas o reescritas fijan `search_path` vacío. Las tres que `anon` puede ejecutar son las mismas que antes. `archive_row` con SQL dinámico no admite inyección: el nombre de tabla se compara con una lista cerrada antes de usarse y además va entre comillas de identificador.

He comprobado que `anon` **no** puede:
- leer archivos ajenos;
- apuntar `storage_path` al archivo de otro vídeo;
- desvincular el archivo de un vídeo subido;
- crear miembros fuera del grupo;
- saltarse el tope de miembros;
- poner `archived_at`;
- borrar miembros en bloque.

Los problemas están en la lógica de F1, no en los permisos:

- **Vincular sobre un vídeo que ya tiene archivo deja la ficha incoherente.** Pasa si otro móvil lo vinculó antes o si la biblioteca está desactualizada. La nube rechaza la subida, pero la ficha se actualiza igual: nombre, tamaño y duración del archivo nuevo, y el desfase vuelve a 0. El vídeo sigue apuntando al archivo viejo, así que todo el grupo pierde la sincronía.
- **Se rompe la regla «un archivo en la nube por vídeo».** Mientras una entrada de YouTube no tiene archivo, se pueden subir tantos archivos como se quiera con nombres distintos. Además, cada «Cambiar archivo» deja el anterior en el bucket para siempre, sin ningún tope ni lista de huérfanos.
- **Un segundo móvil puede reproducir un archivo viejo con el desfase nuevo.** La copia local se guarda por id de vídeo y tiene prioridad sobre la de la nube, aunque ya no sea el archivo vinculado.

| Gravedad | Nº | Notas |
| --- | --- | --- |
| 🔴 Serio | 1 | 7 |
| 🟡 Importante | 3 | 5, 5, 5 |
| 🟢 Menor | 4 | 4, 4, 3, 3 |
| ⚪ Cosmético / limpieza | 3 | 2, 2, 2 |

---

## Hallazgos

### 🔴 1 · Vincular un archivo a un vídeo que ya tiene uno pisa nombre, tamaño, duración y desfase, y deja el archivo viejo · nota 7

- **Dónde:**
  - `apps/web/src/data/videos.ts` 247–281 (`useLinkVideoFile`). El parche siempre lleva `file_name`, `file_size`, `file_duration_seconds` y `file_offset_seconds: 0`. Solo añade `storage_path` si la subida salió bien (275–276).
  - `LinkFilePanel.tsx` 66–72: con un archivo entrante (`initialFile`) va directo a la comprobación aunque `linked` sea verdadero.
  - `AddVideoDialog.tsx` 88–92: filtra los candidatos con la caché de la biblioteca (`!v.file_name`).
  - Migración, 134–150 (`guard_storage_path`): solo vigila `storage_path`.
- **Flujo:**
  1. El móvil A vincula su archivo a la entrada X: sube `X--a`, guarda el desfase y lo sincroniza.
  2. El móvil B tenía abierta la biblioteca antes de eso, o vincula a la vez desde «Añadir vídeo» → «¿Es el archivo de…?» → X, con el aviso calculado sobre la caché vieja.
  3. B sube `X--b`. La política del bucket lo rechaza, porque X ya tiene archivo, y el fallo se clasifica como `denied`.
  4. Como la copia local de B se guardó, el código sigue. Actualiza X con el nombre, el tamaño y la duración de B, y con desfase 0, sin tocar `storage_path`. El trigger no salta porque `storage_path` no está en el cambio.
  5. B ve un aviso informativo y pasa a sincronizar con su copia local. El desfase que guarde se aplicará en los demás móviles al archivo de A.
- **Cuándo pasa:** dos personas añaden el archivo del mismo vídeo con poco tiempo de diferencia, o alguien usa la sugerencia de «Añadir vídeo» con la biblioteca desactualizada. En un grupo que ensaya la misma cover es plausible.
- **Protecciones actuales:**
  - La nube no acepta el segundo archivo y `storage_path` no se puede cambiar. Eso funciona: no se pierde el archivo.
  - Nada impide cambiar los datos del archivo mientras sigue vinculado el anterior.
- **Impacto:**
  - Se pierde la sincronía guardada por A, que se hace a mano y vale para todo el grupo.
  - La ficha describe un archivo que no es el de la nube. El aviso de «puede ser otra versión» compara con la duración equivocada.
  - No hay forma de recuperar el desfase anterior.
- **Evidencia:** lectura del código. La prueba propia confirma que `anon` puede cambiar `file_name`, `file_size` y el desfase de una entrada con `storage_path` puesto sin que nada lo frene.
- **¿Nuevo?** Sí.
- **Arreglo, dos capas:**
  - **Cliente:**
    - Antes de vincular, releer la fila. Si ya tiene archivo, parar y ofrecer «Cambiar archivo».
    - Si la subida falla con `denied`, no escribir nada en la ficha.
    - Hacer la actualización condicionada a que `storage_path` siga vacío y comprobar que afectó a una fila.
  - **Base de datos:** que el trigger de `storage_path` también salte con cambios de `file_name`, `file_size` o `file_duration_seconds`. Si la fila ya tiene archivo en la nube, esos datos solo pueden cambiar a la vez que se quita o se pone el archivo. El desfase sí debe poder cambiarse solo, para «Volver a sincronizar».
- **Test:** en `plan_fase1_checks.sql`, como `anon`, sobre una entrada de YouTube con archivo vinculado:
  - cambiar `file_name` o `file_size` sin tocar `storage_path` debe fallar;
  - cambiar solo `file_offset_seconds` debe funcionar.

  En el cliente, un test de `useLinkVideoFile` con subida rechazada: no debe llamar a `updateVideo`.

### 🟡 2 · Sin tope de archivos por entrada de YouTube: se rompe «un archivo en la nube por vídeo» · nota 5

- **Dónde:** migración, 200–201 (para YouTube, subir se permite siempre que no haya archivo vinculado). La regla está en el plan, F1 → Reglas: «Un archivo en la nube por vídeo».
- **Flujo A, abuso:** con una entrada de YouTube sin archivo, cualquiera con la URL sube `X--a`, `X--b`, `X`, `X.webm`… sin vincular ninguno. Todos se aceptan.
- **Flujo B, uso normal:** cada «Cambiar archivo» quita el vinculado y sube otro con un nombre nuevo. El anterior se queda en el bucket, ilegible desde la app y sin borrar. También queda uno cada vez que la subida va bien pero falla la actualización de la ficha (red).
- **Cuándo pasa:** A, con un script. B, con el uso normal, poco a poco.
- **Protecciones actuales:**
  - 50 MB por archivo.
  - Solo se sube a una fila viva del grupo.
  - Los huérfanos no se pueden leer.
  - Para vídeos subidos se mantiene «un archivo por vídeo, siempre».
- **Impacto:**
  - El plan gratuito tiene 1 GB: 20 cambios de archivo de 50 MB lo llenan sin que nadie lo vea en la app.
  - Llenar el bucket a propósito ya era posible antes, creando filas de vídeo subido (tope de 500). Lo nuevo es que ya no hace falta crear filas y que el uso normal también deja basura.
  - El administrador no tiene una consulta preparada para ver los huérfanos.
- **Evidencia:** prueba propia. Cuatro subidas seguidas a la misma entrada sin archivo vinculado, aceptadas. Además, un ciclo vincular → quitar → vincular → quitar → vincular con tres archivos, aceptado.
- **¿Nuevo?** Sí.
- **Arreglo:**
  - En `video_object_allowed`, para YouTube, limitar cuántos objetos puede haber con el prefijo de ese vídeo (por ejemplo 3, contando los huérfanos). Pasado el tope, cambiar de archivo exige que el administrador limpie.
  - Documentar en `DEPLOY.md` una consulta de administrador que liste los objetos que no son el `storage_path` de ningún vídeo.
  - Revisar si la regla del plan debe decir «un archivo vinculado por vídeo» en vez de «un archivo en la nube».
- **Test:** como `anon`, sobre una entrada de YouTube sin archivo, subir el objeto N+1 debe fallar. Ciclo de quitar y vincular hasta el tope: el siguiente falla.

### 🟡 3 · Tras cambiar el archivo en otro móvil, este sigue reproduciendo su copia local vieja con el desfase nuevo · nota 5

- **Dónde:**
  - `StudioPage.tsx` 341–375 (`useFileSource`): mira primero la copia local por id de vídeo y solo después la nube.
  - `LinkFilePanel.tsx` 96–102 (`resync`): igual.
  - `videos.ts` 299: «Quitar» borra solo la copia local del móvil que lo pulsa.
- **Flujo:**
  1. El móvil A vincula el archivo 1. La copia local de A es el archivo 1.
  2. El móvil B pulsa «Cambiar archivo», vincula el archivo 2 y lo sincroniza. El desfase pasa a ser el del archivo 2.
  3. A abre el estudio. Hay copia local bajo el mismo id, así que reproduce el archivo 1 con el desfase del archivo 2.
- **Cuándo pasa:** cada vez que alguien cambia o quita y vuelve a poner el archivo y otro móvil tenía copia local. También si B pulsa «Quitar», porque la copia de A no se borra. Basta con que A ya tenga la copia local; no hace falta que esté conectado en ese momento.
- **Protecciones actuales:** ninguna. La copia local no guarda de qué archivo es.
- **Impacto:** clips, notas y tomas desplazados en ese móvil sin aviso. Si los dos archivos tienen distinta duración, el aviso de versión no salta, porque compara con la ficha y no con la copia local.
- **Evidencia:** lectura del código.
- **¿Nuevo?** Sí. Con los vídeos subidos no pasaba, porque su archivo nunca cambia.
- **Arreglo:** guardar con la copia local la huella del archivo (nombre y tamaño, o el `storage_path`). Ignorarla, y ofrecer borrarla, si no coincide con la ficha.
- **Test:** test de la función que decide qué fuente usar, con una copia local cuya huella no coincide con la ficha: debe usar la nube o marcar «falta».

### 🟡 4 · «Vincular archivo» y «Subir a la nube» en una entrada de YouTube no actualizan los datos del archivo y usan el nombre sin sufijo · nota 5

- **Dónde:**
  - `videos.ts` 205–233 (`useLinkLocalFile`, `useUploadToCloud`). Ambos suben con `uploadToGroup`, que usa el nombre `<grupo>/<vídeo>.<ext>`, y solo escriben `storage_path`.
  - `StudioPage.tsx` 449–466 y el bloque «falta» (≈ 685–720): se ofrecen también para entradas de YouTube con archivo.
- **Flujo:**
  1. A vincula un archivo de 80 MB. Se queda solo en A, pero la ficha tiene su nombre, tamaño, duración y desfase.
  2. B elige «Archivo», no tiene copia y pulsa «Vincular archivo» con su propia descarga, de 40 MB y quizá de otra versión.
  3. Se guarda la copia local, se sube a la nube y `storage_path` apunta al archivo de B.
  4. La ficha sigue diciendo nombre, tamaño y duración de A, con el desfase de A.
- **Variante:** después de un «Cambiar archivo», «Subir a la nube» intenta el nombre sin sufijo. Si una subida anterior ya lo usó, choca y falla con un mensaje genérico.
- **Cuándo pasa:** el plan propone justo esto para los archivos de más de 50 MB («los demás pueden vincular su propia copia»).
- **Protecciones actuales:** ninguna sobre los datos. La nube sí impide pisar un archivo existente.
- **Impacto:**
  - Todo el grupo usa el archivo de B con el desfase calculado para A.
  - La comprobación de duración del plan (F1, punto 5) no se hace en este camino.
- **¿Nuevo?** Sí. Estos caminos existían para vídeos subidos, pero ahora se abren también para YouTube.
- **Arreglo:** en entradas de YouTube, mandar estos botones al panel de vincular, que comprueba la duración, pone nombre con sufijo y pide sincronizar. Como mínimo, al subir a la nube la copia de otro, actualizar nombre, tamaño y duración, y pedir que se vuelva a sincronizar.
- **Test:** test de cliente: en una entrada de YouTube, «Vincular archivo» usa `useLinkVideoFile`, o escribe los datos del archivo junto a `storage_path`.

### 🟢 5 · Un vídeo subido que aún no tiene archivo en la nube se puede bloquear para siempre · nota 4

- **Dónde:** migración, 115–128. La restricción acepta el sufijo `--xxx` en cualquier vídeo, no solo en los de YouTube. También 134–150: se puede poner cualquier nombre propio aunque el objeto no exista.
- **Flujo:**
  1. Un vídeo subido se quedó solo en un móvil (`storage_path` vacío): falta de red, o pesa más de 50 MB y luego se recorta.
  2. Cualquiera pone su `storage_path` a `<grupo>/<vídeo>--zz.mp4`.
  3. Ese nombre no se puede subir (los vídeos subidos no admiten sufijo) y el `storage_path` ya no se puede cambiar. «Subir a la nube» no vuelve a funcionar para ese vídeo.
- **Cuándo pasa:** solo a propósito; la app nunca lo hace.
- **Protecciones actuales:** los permisos por columna y el trigger de una sola vez.
- **Evidencia:** prueba propia. Sobre una fila subida se acepta `storage_path` con sufijo, y la subida del nombre real se rechaza después por RLS.
- **¿Nuevo?** En parte. Antes ya se podía bloquear igual con otra extensión (`.webm` en vez de `.mp4`). El sufijo amplía el margen.
- **Arreglo:**
  - En la restricción, permitir el sufijo solo con `source = 'youtube'`.
  - Mejor aún, en el trigger de `storage_path` (con permisos de propietario), exigir que el objeto exista en el bucket al ponerlo. Eso cierra también el caso de la extensión y el de apuntar a un nombre inventado.
- **Test:** como `anon`, sobre un vídeo subido sin archivo, poner un `storage_path` con sufijo debe fallar. Poner un nombre sin objeto en el bucket debe fallar.

### 🟢 6 · Las comprobaciones dejan huecos importantes · nota 4

- **Dónde:** `supabase/tests/plan_fase1_checks.sql`.
- **Huecos:**
  1. **«storage_path only points at the video's own file» (163–176) no prueba la restricción.** En ese momento la entrada a1 ya tiene archivo vinculado, así que salta antes el trigger `storage_path_locked`, y el test lo acepta como éxito. La restricción funciona (la prueba propia lo confirma con una entrada sin archivo), pero el test pasaría igual si se borrara. Hay que probarlo con una entrada de YouTube sin archivo y exigir el error de restricción concreto.
  2. **Nunca se comprueba que el archivo vinculado de una entrada de YouTube se pueda leer.** Solo se mira que, tras quitarlo, no se vea. Si la lectura se rompiera, «firmar enlace» fallaría en todos los móviles y el test seguiría en verde.
  3. **El bloque de almacenamiento (104–136) termina con «INCONCLUSIVE» si falla la primera subida directa,** y el fichero cuenta como aprobado. Un fallo real de la política de subida pasaría inadvertido.
  4. **«uploaded videos keep one fixed file» acepta cualquier error** (`when others`) al subir con sufijo. Debería exigir el de permisos.
  5. **No se prueba:**
     - el tope de miembros (100 vivos y 400 en total);
     - el bloqueo del borrado masivo en `members`;
     - que al crear un miembro se ignoren `created_at` y `archived_at` del cliente;
     - que `anon` no pueda cambiar `author_member_id` ni `crew_id` de un miembro;
     - que un miembro archivado no se vea;
     - varias subidas sin vincular (hallazgo 2);
     - cambiar datos del archivo con uno vinculado (hallazgo 1);
     - el sufijo en vídeos subidos (hallazgo 5);
     - vincular o quitar en un vídeo archivado;
     - los permisos de ejecución y el `search_path` de las funciones nuevas.

  Todo esto lo he comprobado a mano y hoy funciona, salvo lo indicado en los hallazgos 1, 2 y 5.
- **Aviso general:** el arnés local inserta directamente en `storage.objects`. El servicio real de Storage primero prueba el permiso y luego escribe con permisos de administrador; con la política actual debería comportarse igual. Hay que confirmarlo con una subida real en una rama de Supabase antes de dar F1 por bueno: vincular, firmar enlace, quitar y volver a vincular.
- **¿Nuevo?** Sí.

### 🟢 7 · `guard_simple_cap` desactiva el tope sin avisar si falta el argumento, y depende del orden alfabético de los triggers · nota 3

- **Dónde:** migración, 52–73 y 238–248.
- **Detalle:**
  - Si un trigger futuro usa la función sin argumento o con uno vacío, el tope queda nulo, las comparaciones nunca son verdaderas y no hay límite.
  - El grupo que cuenta sale de la fila nueva, así que el tope solo es fiable si `*_set_crew` va antes por orden de nombre. `members` lo cumple. La migración de tomas, sin seguimiento, también, con los prefijos `a_`/`b_`/`c_`. Pero es una convención frágil.
- **Arreglo:** que la función falle si no recibe exactamente un argumento numérico positivo. Que tome el grupo con `private.default_group()` en vez de fiarse del orden.
- **Test:** no hace falta más allá de lo descrito en el hallazgo 6.
- **¿Nuevo?** Sí.

### 🟢 8 · Documentación desactualizada · nota 3

- **Dónde:**
  - `docs/ARCHITECTURE.md`, apartado «Acceso»: dice que nadie puede crear miembros desde el cliente. Ahora `members` sí se puede.
  - El mismo documento, en las columnas editables: faltan las de archivo de los vídeos y las de miembros.
  - El mismo documento, en Storage: describe solo `source = upload` y el nombre sin sufijo.
  - Faltan la tabla `members` y `notes.author_member_id`.
  - `docs/DEPLOY.md`, paso 5: solo cita `archive_checks.sql`, no `plan_fase1_checks.sql`.
- **Impacto:** quien despliegue o revise con los documentos tendrá reglas equivocadas.
- **Arreglo:** actualizar los dos documentos.
- **¿Nuevo?** Sí.

### ⚪ 9 · `author_member_id` acepta miembros archivados y de cualquier grupo, y no se puede corregir · nota 2

- **Dónde:** migración, 269–271; `members.ts`, `currentMemberId` (comprueba contra la lista en caché).
- **Detalle:**
  - La clave ajena no mira si el miembro está vivo ni si es del mismo grupo. La prueba propia confirma que una nota se guarda con un miembro archivado.
  - `anon` no tiene permiso para cambiar `author_member_id`. Si en el futuro se quiere ofrecer «asignar mis notas sin nombre», como el plan hace con las tomas, hará falta ese permiso o una función.
  - Cuando se muestre el autor: un miembro archivado no se ve (política de lectura), así que sus notas pasarán a «Sin nombre» en todo el grupo.
- **Arreglo:** decidirlo al mostrar el autor. Si se quiere, añadir un trigger que exija un miembro vivo del mismo grupo.
- **¿Nuevo?** Sí.

### ⚪ 10 · Las columnas de archivo se pueden editar también en vídeos subidos · nota 2

- **Dónde:** migración, 130.
- **Detalle:** cualquiera puede cambiar `file_name`, `file_size`, el desfase o la duración de un vídeo subido. El desfase no significa nada ahí. Encaja con el modelo de confianza del grupo abierto, que ya deja cambiar el título.
- **Arreglo:** si se aplica el arreglo del hallazgo 1, el mismo trigger puede rechazar desfase y duración en `source = 'upload'`.
- **¿Nuevo?** Sí.

### ⚪ 11 · `anon` tiene TRUNCATE, REFERENCES y TRIGGER sobre `members` · nota 2

- **Dónde:** migración, 264–266. Solo se retira UPDATE.
- **Detalle:** son los permisos por defecto de Supabase para tablas nuevas. A través de la API no se pueden usar, así que no hay riesgo práctico. Las demás tablas están igual.
- **Arreglo:** por limpieza, retirar todo y volver a dar solo lo necesario, en esta tabla y en las futuras.
- **¿Nuevo?** No, es el patrón de siempre.

---

## Fuera de foco, para el revisor funcional

- **«Cambiar archivo» primero quita y luego abre el selector** (`LinkFilePanel.tsx` 116–125). Si la persona cancela el selector, el vídeo se queda sin archivo y sin desfase. Además, el clic en el selector se hace después de una petición de red. En Safari de iPhone puede que no se abra, porque ya no cuenta como gesto del usuario. Mejor elegir el archivo primero y quitar el viejo al confirmar.

---

## Lo que está bien (comprobado)

- **Compatible con `main` (`6b9e4d3`):** la app vieja solo usa archivos con `source = 'upload'` y nombres `<grupo>/<vídeo>.<ext>`, que siguen permitidos. Las columnas nuevas admiten nulo, y las notas sin autor siguen valiendo. Los topes, el borrado = archivado y los nombres de restricción que reconoce `friendlyError` no cambian.
- **Restricciones de `storage_path`:** `videos_storage_path_file` sustituye bien a `_own` y `_shape`. Solo acepta el id del propio vídeo, con o sin sufijo, y también se aplica a escrituras nuevas si se quedara sin validar. En el arnés quedó validada.
- **Trigger de `storage_path`:** solo deja quitar el archivo en entradas de YouTube. En vídeos subidos sigue bloqueado (`storage_path_locked`, probado).
- **Política del bucket:**
  - Sin políticas de borrado ni de actualización, así que no se puede borrar ni sobrescribir.
  - Lectura solo del archivo vinculado de un vídeo vivo del grupo. Lo quitado o archivado no se lee.
  - Los vídeos subidos siguen sin sufijo y con un solo archivo.
- **`members`:**
  - RLS activo, con las cuatro políticas limitadas al grupo y a lo vivo.
  - El `crew_id` lo pone el servidor y el del cliente se ignora (probado).
  - `created_at` y `archived_at` los sella el servidor (probado).
  - Tope de 100 (probado).
  - Borrado masivo bloqueado (probado).
  - Borrar archiva.
  - Nombre único entre vivos, sin distinguir mayúsculas ni espacios, también al renombrar (probado).
  - UPDATE solo de `name` y `color`.
- **Funciones:**
  - Todas las de `private` tienen `search_path` vacío.
  - `anon` solo puede ejecutar `default_group`, `video_object_allowed` y `archive_row`, igual que antes.
  - `archive_row` llamada directamente falla («only runs from the delete trigger»).
  - `CREATE OR REPLACE` conserva los permisos.
- **Advisors probables:**
  - Sin funciones con `search_path` mutable.
  - Sin tablas con RLS y sin políticas.
  - Claves ajenas nuevas con índice (`members_crew_idx`, `notes_author_idx`).
- **Datos del cliente:** `useLinkVideoFile`, `useUnlinkVideoFile` y `members.ts`/`backend.ts` solo escriben columnas con permiso. Los nombres llevan un sufijo aleatorio de 6 caracteres que cumple la forma exigida. Con más de 50 MB no se intenta subir y se queda solo en el móvil, con aviso.
- **Vídeo archivado:** su archivo no se lee, y vincular o quitar no afecta a ninguna fila.
- **Tipos:** `database.types.ts` incluye `members`, `author_member_id` y las columnas nuevas.
