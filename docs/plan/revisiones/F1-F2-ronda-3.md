# Revisión · F1 (archivo vinculado) y F2 (quién es quién) · Ronda 3 (última)

**Alcance:** las correcciones de la ronda 2, commit `0ad9363` (comparado con `7644c8c`):
- la migración nueva `20261016000200_linked_file_identity.sql`;
- la comprobación nueva en `plan_fase1_checks.sql`;
- en el cliente, `data/videos.ts`, `LinkFilePanel.tsx`, `StudioPage.tsx` y `lib/supabase.ts`.

**Tipo de revisión:** solo lectura, sobre los commits (`git show` / `git diff`). El árbol de trabajo tiene cambios sin commit de otros agentes (tomas, voz, grabador); no entran en la revisión.

**Informes de partida:** `F1-F2-ronda-1-bd-seguridad.md`, `F1-F2-ronda-1-cliente.md` y `F1-F2-ronda-2.md`.

**Pruebas hechas:**
- `pnpm db:test`: 11/11 migraciones (incluida la de tomas, sin commit), 3/3 ficheros de comprobación, 41 PASS.
- `pnpm typecheck`:
  - **sobre el árbol de trabajo falla**, en `RecordStudio.tsx` (nombres que no existen: `useSaveTake`, `useMembers`, `askWho`…). Son cambios sin commit de otro agente, que está trabajando en ellos ahora mismo; no son de este commit;
  - **sobre una copia limpia del commit `0ad9363`** (extraída aparte, en la carpeta temporal): sin errores en `web` ni en `shared`.
- `pnpm test`:
  - árbol de trabajo: 89 tests de `shared` y 59 de `web`, todos pasan;
  - copia limpia del commit: 82 y 15, todos pasan.
- **Pruebas propias** en un PGlite aparte, con las tres migraciones de la fase 1 tal como están en el commit (sin la de tomas), actuando como `anon`. El script está fuera del repositorio. Sus resultados se citan como «prueba propia».
- **Consulta de solo lectura a Supabase:** en producción siguen aplicadas solo las siete migraciones hasta `archive_and_hardening`. Ninguna de F1/F2 está aplicada.

---

## Resumen

La ronda 2 ha arreglado lo principal:
- **«Cambiar archivo» ya no pierde el archivo cuando la nube rechaza el nuevo** (el caso del tope de 5): se vuelve a poner el anterior, y la copia del móvil se conserva. Comprobado en la prueba propia.
- **La limpieza de copias ya no borra copias válidas.** Cada copia lleva una marca que dice para qué archivo del grupo se hizo. Se borra solo si el grupo ha cambiado de archivo después.
- **Un archivo que solo está en un móvil ya no se puede pisar:** ni desde el cliente, que relee la fila, ni desde la base de datos, con el trigger nuevo.
- R4 (el estudio vuelve a «Archivo» durante la sincronía) y R8 (mensaje de `file_locked`) están corregidos.

Queda un hueco nuevo de nota media, del mismo tipo que R1 pero menos probable: **si la vinculación falla después de guardar la copia nueva en el móvil**, esa copia queda marcada como si fuera la del archivo anterior. El móvil reproduce entonces el archivo equivocado con el desfase del grupo, sin ningún aviso. Pasa cuando falla la conexión en mitad del cambio, o cuando dos móviles vinculan a la vez.

Además, un fallo pasajero de la subida durante «Cambiar archivo» deja al grupo sin el archivo de la nube. Y ya no hay forma de subirlo después para entradas de YouTube.

Las tres migraciones de la fase 1 son compatibles con la app de producción (`main` = `650b974`) y con sus datos (prueba propia). Hay que aplicarlas en orden.

| Gravedad | Nº | Notas |
| --- | --- | --- |
| 🔴 Serio | 0 | — |
| 🟡 Importante | 3 | 5, 5, 4 |
| 🟢 Menor | 2 | 3, 3 |
| ⚪ Cosmético / limpieza | 1 | 2 |

---

## 1 · Estado de los hallazgos anteriores

### Regresiones de la ronda 2

| Ronda 2 | Hallazgo | Nota | Estado | Evidencia |
| --- | --- | --- | --- | --- |
| R1 | «Cambiar archivo» quita el viejo antes de subir el nuevo; al quinto cambio se pierde | 7 | **Corregido en lo principal; queda un resto** | Si la vinculación nueva falla, se vuelve a escribir la ficha anterior (ruta, nombre, tamaño, duración y desfase). La copia del móvil no se borra al quitar como parte de un cambio. Prueba propia: con 5 archivos en el bucket, quitar → el sexto se rechaza → restaurar funciona, y el archivo anterior vuelve a poder leerse. Lo mismo con un archivo que solo estaba en el móvil. El mensaje ya explica el tope. **Resto:** si el fallo llega después de guardar la copia nueva en el móvil, la copia queda mal marcada (N1). Si la restauración falla, no se dice nada (N3). Sigue sin haber aviso del tope antes de empezar. |
| R2 | La limpieza borra la copia propia vinculada desde «Este archivo está en otro dispositivo» | 6 | **Corregido (no se borra); parcial en lo demás** | Desde ese aviso, para entradas de YouTube, la copia se guarda solo en el móvil, nunca se sube, y se marca como copia del archivo actual del grupo. Ya no se borra, y ya no puede acabar como archivo del grupo. **Falta:** no se comprueba la duración ni se guarda un desfase propio. Si la descarga de esa persona es otra versión, se reproduce descuadrada con el desfase medido sobre el archivo de otro. El texto del aviso sigue diciendo «No llegó a subirse a la nube», que no es cierto cuando el archivo está en la nube pero no se puede abrir (por ejemplo, sin conexión). Ver N5. |
| R3 | Un archivo solo en un móvil se puede pisar, y luego se borra su copia | 6 | **Corregido** | El cliente para si la ficha tiene nombre de archivo, no solo ruta. En la base de datos, la función `guard_linked_file` bloquea cualquier cambio de nombre, tamaño o duración en entradas de YouTube con archivo descrito, esté o no en la nube. Prueba propia: describir otro archivo encima falla con `file_locked`; quitar y luego vincular funciona; volver a sincronizar (solo desfase, o desfase con los mismos datos) funciona. Queda un resto, solo para un cliente manipulado (N4). |
| R4 | Con «Archivo» recordado y el archivo quitado en otro móvil, el estudio vuelve a «Archivo» en plena sincronía | 5 | **Corregido** | Cuando el vídeo ya ha cargado y no tiene archivo, se olvida lo recordado. Al vincular, el escenario vuelve a lo recordado, que ya es YouTube. En «Cambiar archivo», el panel además pone YouTube justo después de quitar. Por lectura del código. |
| R5 | La duración del archivo viejo puede guardarse como la de YouTube | 4 | **Sin corregir** | Sin cambios en ese efecto. |
| R6 | Tras sincronizar desde «Archivo», el estudio se queda en YouTube | 3 | **Sin corregir** | Sin cambios. Ahora «Cambiar archivo» también deja lo recordado en YouTube a propósito. |
| R7 | Las copias de un archivo quitado en otro móvil no se borran nunca | 3 | **Sin corregir** | Sigue igual. Con las marcas nuevas sería fácil: al cargar la biblioteca, borrar las copias marcadas de entradas de YouTube que ya no tienen archivo. |
| R8 | `file_locked` sin mensaje en español | 2 | **Corregido** | Ahora dice «Otro móvil ya ha vinculado un archivo a este vídeo. Cierra y vuelve a abrirlo para verlo». |

### Hallazgos parciales de la ronda 1

| Ronda 1 | Hallazgo | Estado ahora |
| --- | --- | --- |
| BD 1 | Vincular encima pisa la ficha | **Corregido** (ver R3), con el resto N4. |
| BD 2 | Tope de archivos por vídeo | **Parcial.** El mensaje ya nombra el tope y no se pierde nada al llegar. Sigue faltando la consulta de administrador en `DEPLOY.md` para ver y limpiar los archivos antiguos. Sin esa consulta, el mensaje «el administrador puede limpiar los antiguos» no tiene receta. |
| BD 3 / Cliente 3 | La copia vieja manda sobre la nube | **Corregido**, con la marca de identidad. Las copias antiguas sin marca se aceptan: solo existen en los móviles de prueba, porque F1 no está en producción. |
| BD 4 / Cliente 7 | «Vincular archivo» y «Subir a la nube» en YouTube no actualizan la ficha | **Corregido por retirada.** En YouTube ya no suben nada. Consecuencia en N2. |
| Cliente 1 | La sincronía compara el archivo consigo mismo | **Corregido** (con R4). |
| Cliente 2 | «Cambiar archivo» quita antes de elegir | **Corregido** (con R1). |
| Cliente 5 | Duración del archivo guardada como la de YouTube | **Parcial**, sin cambios (R5). |
| Cliente 6 | «La duración coincide» cuando no se sabe | Sin cambios: falta una señal de espera mientras se lee. |
| Cliente 8 | Selector pequeño y textos que prometen funciones | **Casi corregido.** La descripción del panel ya no promete superpuesto ni zoom. El selector pasa a 36 px de alto, aún por debajo de los 44 px recomendados para el dedo. |

---

## 2 · Hallazgos nuevos

### 🟡 N1 · Si la vinculación falla después de guardar la copia nueva, el móvil reproduce el archivo equivocado · nota 5

- **Dónde:** `useLinkVideoFile` guarda la copia nueva en el móvil antes de escribir la ficha, y solo pone la marca si la ficha se escribe. `LinkFilePanel`, `doLink`, restaura la ficha anterior si falla.
- **Flujo A (cambio con la conexión fallando):**
  1. Un vídeo con archivo, sincronizado, con copia en este móvil.
  2. «Cambiar archivo» → se elige el nuevo → «Vincular».
  3. Se quita el anterior (conservando la copia).
  4. La subida va bien, o el archivo es grande y no se sube. La copia nueva sustituye a la anterior en el móvil.
  5. Escribir la ficha falla: se corta la conexión, o justo otro móvil ha vinculado otro archivo.
  6. Se restaura la ficha anterior. La marca de la copia sigue siendo la del archivo anterior.
  7. Desde entonces, en «Archivo», este móvil reproduce el archivo nuevo con el desfase del anterior. No hay ningún aviso.
- **Flujo B (dos móviles vinculan a la vez por primera vez):**
  - el segundo recibe «Otro móvil ya ha vinculado un archivo», pero su copia ya está guardada y sin marca;
  - una copia sin marca se acepta;
  - ese móvil reproduce su propio archivo con el desfase medido sobre el del primero.
- **Impacto:**
  - Sincronía falsa en ese móvil: clips, notas y bucles caen en otro sitio.
  - Si el archivo anterior solo estaba en este móvil (más de 50 MB), su única copia en la app se ha sustituido. El grupo lo sigue describiendo, pero nadie lo tiene. El original sigue en la galería.
  - En el flujo A con subida correcta, además queda un archivo huérfano en el bucket, que cuenta para el tope de 5.
- **Cuándo pasa:** solo si falla la escritura de la ficha justo después de guardar la copia. Es poco frecuente, pero en un móvil con mala cobertura es plausible.
- **Evidencia:** lectura del código. La base de datos rechaza la segunda vinculación como debe (prueba propia); el problema está en la copia local.
- **Arreglo:**
  - si la vinculación falla después de guardar la copia, borrar esa copia y su marca. Mejor aún: guardar la copia nueva con otra clave y cambiarla por la definitiva solo cuando la ficha se haya escrito;
  - con un archivo anterior que solo estaba en el móvil, no sustituir la copia hasta que la ficha nueva esté escrita.
- **Test:** simular un fallo al escribir la ficha después de guardar la copia. La copia del móvil debe seguir siendo la del archivo anterior, o no debe haber copia.

### 🟡 N2 · Un fallo pasajero de la subida en «Cambiar archivo» deja al grupo sin el archivo de la nube, sin forma de volver a subirlo · nota 5

- **Dónde:** `useLinkVideoFile`: un fallo de la subida que no sea un rechazo (sin conexión, nube no disponible, formato) no es un error, y el archivo se vincula solo en este móvil. `MediaStage`: «Subir a la nube» ahora solo aparece en vídeos subidos.
- **Flujo:**
  1. Un vídeo de YouTube con archivo en la nube, que todo el grupo usa.
  2. «Cambiar archivo» con un archivo de 30 MB. La subida falla por un corte de red.
  3. El cambio sigue adelante: la ficha describe el archivo nuevo, sin ruta en la nube. Sale «Guardado solo en este dispositivo: no se subió a la nube porque no hay conexión».
  4. El resto del grupo pasa a ver «Este archivo está en otro dispositivo». El archivo anterior, que funcionaba, ya no está vinculado.
  5. No hay botón para reintentar la subida. La única salida es otro «Cambiar archivo», que gasta otro de los 5 huecos y obliga a sincronizar de nuevo.
- **También en la primera vinculación:** un archivo de 50 MB o menos cuya subida falló se queda solo en ese móvil para siempre.
- **Impacto:** el grupo pierde un archivo que funcionaba por un fallo de red pasajero. El toast avisa, pero no da salida.
- **Arreglo:**
  - en un cambio cuyo archivo anterior estaba en la nube, tratar como error un fallo de subida de un archivo que cabe (y restaurar);
  - ofrecer «Subir a la nube» también en entradas de YouTube: con nombre nuevo con sufijo, y escribiendo solo la ruta cuando la marca de la copia coincide con la ficha. La base de datos ya lo permite: poner la ruta sin cambiar la descripción.
- **Test:** con la subida fallando por red, «Cambiar archivo» sobre un vídeo con archivo en la nube debe dejar la ficha como estaba.

### 🟡 N3 · Quitar y restaurar no comprueban qué hay en la ficha, y si restaurar falla no se dice · nota 4

- **Dónde:** `useUnlinkVideoFile` y `useRestoreVideoFile` escriben por id, sin condición. `doLink` ignora el error de la restauración.
- **Detalle:**
  - **Con la biblioteca desactualizada,** «Cambiar archivo» (y también «Quitar») borra el archivo que otro móvil acaba de poner. Si además el nuevo falla, la restauración vuelve a poner un archivo más antiguo, que el grupo ya había sustituido. La base de datos lo deja hacer: pasar de «sin archivo» a la ruta propia anterior está permitido.
  - **Si la restauración falla** (normalmente por la misma falta de conexión que hizo fallar el cambio), el vídeo se queda sin archivo y sin sincronía. Solo se ve el mensaje del error de la vinculación, que no dice que el anterior se ha perdido.
- **Arreglo:**
  - quitar solo si la ficha sigue describiendo el archivo que se ve en pantalla (comparar ruta y nombre en la propia actualización), y si no, avisar;
  - si restaurar falla, decirlo claramente («El archivo anterior se ha quitado; vuelve a vincularlo») y reintentar al recuperar la conexión.

### 🟢 N4 · El bloqueo de la base de datos se puede saltar en dos pasos, y los vídeos subidos pierden el suyo · nota 3

- **Dónde:** `20261016000200_linked_file_identity.sql`. Sustituye la función del trigger `videos_file_lock` por otra regla: «solo YouTube, solo con nombre de archivo».
- **Detalle:** la regla de la ronda 1 era «con ruta en la nube, no se cambia la descripción». La nueva regla ya no la incluye. Prueba propia, como `anon`:
  - **Dos pasos:** en una entrada con archivo en la nube, vaciar solo el nombre (dejando la ruta) se acepta. Después, describir otro archivo encima también se acepta. La ficha queda describiendo un archivo que no es el de la nube.
  - **Fila con ruta y sin nombre** (fichas incoherentes de antes de la ronda 2): se puede describir cualquier archivo encima.
  - **Ruta sobre una ficha solo local:** se puede poner la ruta de un archivo recién subido sin cambiar la descripción, y la ficha describe el archivo de otra persona. La política del bucket lo permite porque la ficha no tiene ruta.
  - **Vídeos subidos con archivo en la nube:** vuelven a poder cambiar nombre, tamaño y duración del archivo. Es lo mismo que antes de F1, y `main` no lo hace.
- **Por qué es menor:** la app no hace ninguno de estos pasos (quitar siempre vacía todo junto), y en un grupo abierto un cliente manipulado ya puede archivar cualquier cosa.
- **Arreglo:** mantener las dos reglas a la vez:
  - con ruta y sin cambiar la ruta, no se cambia la descripción;
  - en YouTube, con nombre, la descripción solo se vacía entera.
  
  Y añadir que una entrada de YouTube con ruta tenga siempre nombre.
- **Test:** los cuatro casos anteriores como `anon` deben fallar.

### 🟢 N5 · «Volver a sincronizar» y el aviso de «otro dispositivo» no cuadran con las copias propias · nota 3

- **Dónde:** `LinkFilePanel`, `resync` (sigue comparando el tamaño de la copia con el de la ficha); `MediaStage`, el aviso «falta».
- **Detalle:**
  - **«Volver a sincronizar» ignora la copia propia:** quien vinculó su propia copia desde el aviso tiene un archivo de otro tamaño, y «Volver a sincronizar» no la usa. Si no hay archivo en la nube, dice «El archivo no está en este dispositivo ni en la nube. Vincula tu copia primero», justo después de hacerlo. No usar esa copia es correcto (cambiaría el desfase del grupo con otro archivo), pero el mensaje engaña.
  - **El aviso dice algo que puede ser falso:** sigue diciendo «No llegó a subirse a la nube» también cuando el archivo está en la nube pero el enlace no se pudo firmar (sin conexión).
  - **Nada avisa de otra versión:** al vincular una copia propia no se comprueba la duración (resto de R2).
- **Arreglo:**
  - en «Volver a sincronizar», decir «Tu copia es distinta del archivo del grupo; la sincronía la hace quien lo vinculó»;
  - distinguir en el aviso «está solo en otro móvil» de «no se ha podido abrir desde la nube»;
  - al vincular una copia propia, comparar su duración con la de la ficha y avisar si no coincide.

### ⚪ N6 · Orden manual de migraciones y marcas que no se limpian · nota 2

- **Orden de migraciones:** `000200` solo sustituye la función y deja el trigger de `000100`. Aplicadas por orden de nombre, que es lo que hace `supabase db push`, todo va bien. Si alguien las aplicara a mano con la `000200` antes que la `000100`, esta volvería a la regla vieja sin dar error. Conviene que la `000200` vuelva a crear el trigger, o anotarlo en `DEPLOY.md`.
- **Marcas que se quedan:** las marcas de copia viven en el almacenamiento del navegador y no se borran cuando se borra un vídeo o se purgan sus copias. Es poco espacio, pero crece sin límite.

---

## 3 · Respuestas a las preguntas del encargo

1. **¿«Cambiar archivo» es atómico?** Casi.
   - **Tope de 5 o nube que rechaza:** el rechazo llega antes de tocar la copia del móvil, y se restaura la ficha anterior. Lo permiten:
     - `guard_storage_path`: la ruta pasa de vacía a la propia anterior;
     - `guard_linked_file`: la ficha no tenía nombre en ese momento;
     - la política del bucket: el objeto anterior vuelve a poder leerse porque la ficha apunta otra vez a él.
     
     Prueba propia, con archivo en la nube y con archivo solo local. La copia del móvil sigue, con su marca, y vale otra vez.
   - **No es atómico en tres casos:**
     - el fallo llega después de guardar la copia nueva (N1);
     - la subida falla por red y el cambio sigue solo en el móvil (N2);
     - la restauración falla, y no se dice (N3).
   - **Carrera:** si otro móvil vincula entre el quitar y el restaurar, la restauración se rechaza (`file_locked`) y se queda el archivo del otro móvil. Es lo correcto (prueba propia).
2. **Marca de identidad de la copia** (nombre y tamaño del archivo del grupo):
   - **Copias válidas:** no se borran. La del móvil que vinculó se marca con la ficha que devuelve la base de datos. La copia propia vinculada desde el aviso se marca con el archivo actual del grupo.
   - **Copias antiguas sin marca:** se aceptan siempre. Solo existen en móviles de prueba (F1 no está en producción). Una copia sin marca puede aparecer también en el flujo B de N1.
   - **Vídeos subidos:** nunca se consideran viejos.
   - **«Vincular archivo» desde el aviso:** en YouTube ya no sube nada, guarda y marca. Ya no se borra. Sigue sin comprobar duración (N5).
   - **Copia del propio móvil que vinculó:** se conserva. Se borra solo si otro móvil cambia o quita el archivo y luego se vincula otro, que es lo correcto.
   - **Archivo quitado en otro móvil:** la copia se queda (R7).
3. **`guard_linked_file`:** bloquea en YouTube aunque el archivo sea solo local (prueba propia y la comprobación nueva). El trigger salta en toda actualización que incluya nombre, tamaño o duración:
   - **al quitar:** salta y deja pasar, porque el nombre nuevo es vacío;
   - **al restaurar:** salta y deja pasar, porque el nombre anterior era vacío;
   - **al volver a sincronizar:** solo cambia el desfase, así que no salta. Con los mismos datos y otro desfase, salta y deja pasar.
   
   Pierde la regla de la ronda 1 (N4).
4. **R4:** corregido con el efecto que olvida «Archivo» cuando el vídeo ya ha cargado sin archivo. **R8:** corregido.
5. **Regresiones nuevas:** N1 a N3. Ninguna pierde datos del grupo de forma segura, como pasaba con R1.
6. **Migraciones y producción:**
   - **Orden:** `20261016000000` → `000100` → `000200` → `20261016010000_takes`. La de tomas no toca la función ni el trigger del archivo vinculado, ni la política del bucket de vídeos. Solo reescribe `archive_row` y conserva `members`.
   - **Prueba propia en orden,** partiendo de las siete migraciones de producción con datos antiguos (un vídeo subido con su archivo y una entrada de YouTube), y aplicando después las tres de la fase 1:
     - las dos restricciones de ruta quedan validadas;
     - el archivo antiguo se puede leer;
     - la app de `main` funciona: crear un vídeo subido, subir su archivo, poner la ruta, cambiar título y duración, crear una nota sin autor y borrar.
   - **Versiones:** las de producción son fechas de aplicación (hasta `20261013200139`). Las nuevas son posteriores, así que `db push` las coloca detrás.
   - **Despliegue:**
     1. primero las migraciones;
     2. después la app;
     3. pasar `archive_checks.sql` y `plan_fase1_checks.sql` contra el proyecto real y mirar los advisors.
     
     Sigue pendiente una prueba real de subida, firma, quitar y restaurar en una rama de Supabase.

## Comprobaciones SQL

- **Nueva y bien planteada:** «un archivo solo local también está bloqueado, y quitar y luego vincular funciona».
- **Faltan:**
  - restaurar la ficha anterior tras un cambio fallido, con archivo en la nube y solo local;
  - restaurar rechazado si otro móvil vinculó entretanto;
  - los casos de N4.
- **Cliente:** sigue sin tests de las correcciones. `fileIdentity`, `markLocalCopy` e `isStaleCopy` se pueden probar de forma aislada, y sería barato hacerlo.

## Limitaciones

- Sin Supabase real ni dispositivo: la subida, la firma de enlaces y el tope se han probado en PGlite, insertando directamente en `storage.objects`.
- N1, N2, N3 y N5 son por lectura del código; no los he reproducido en el navegador.
- `pnpm typecheck` falla en el árbol de trabajo por cambios sin commit de otro agente. El commit revisado, comprobado aparte, no tiene errores.
