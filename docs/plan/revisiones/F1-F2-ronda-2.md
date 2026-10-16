# Revisión · F1 (archivo vinculado) y F2 (quién es quién) · Ronda 2

**Alcance:** las correcciones de la ronda 1, commit `7644c8c` (comparado con `9ad9fd7`): migración nueva `20261016000100_linked_file_guard.sql`, comprobaciones nuevas en `plan_fase1_checks.sql`, y en el cliente `data/videos.ts`, `LinkFilePanel.tsx`, `StudioPage.tsx`, `lib/stagePref.ts`, `player/FileStage.tsx` y `player/engine.ts`. Los cambios del grabador que hay en el mismo tramo (`058e4bf`) no entran.
**Tipo de revisión:** solo lectura, sobre los commits (`git show`). El árbol de trabajo tiene archivos nuevos de otros agentes (tomas, voz); no los he mirado.
**Informes de partida:** `F1-F2-ronda-1-bd-seguridad.md` (BD) y `F1-F2-ronda-1-cliente.md` (Cliente).

**Pruebas hechas:**
- `pnpm db:test`: 10/10 migraciones (incluida la de tomas, sin commit), 3/3 ficheros de comprobación, 40 PASS.
- `pnpm typecheck`: sin errores. `pnpm test`: 89 tests de `shared` y 59 de `web`, todos pasan (sobre el árbol de trabajo, que incluye cambios sin commit de otros pasos).
- Pruebas propias en un PGlite aparte, con las migraciones tal como están en `7644c8c`, actuando como `anon`. El script está fuera del repositorio, en la carpeta temporal. Sus resultados se citan como «prueba propia».
- Consulta de solo lectura a Supabase: en producción están aplicadas las migraciones hasta `archive_and_hardening`. Ninguna de F1/F2 está aplicada.

---

## Resumen

Las correcciones van en la buena dirección y la mayoría funcionan:
- Ya no se puede reescribir la ficha de un archivo que está en la nube.
- «Cambiar archivo» abre el selector directamente desde el toque y, si se cancela, no toca nada.
- La sincronía siempre marca sobre YouTube.
- Un archivo vinculado ya no arranca en tiempo negativo.
- Hay un tope de 5 archivos por vídeo de YouTube.

Quedan tres problemas, dos de ellos introducidos por las propias correcciones:

- **«Cambiar archivo» sigue sin ser atómico, y el tope de 5 lo convierte en una pérdida segura.** Primero se quita el archivo viejo y luego se sube el nuevo. En el quinto cambio la nube rechaza la subida y el vídeo se queda sin archivo y sin sincronía. El mensaje dice «prueba otra vez», pero no va a funcionar nunca. Comprobado en la prueba propia.
- **La nueva limpieza de copias viejas borra copias que sí sirven.** Pasa con la copia propia que otro móvil vincula desde el aviso «Este archivo está en otro dispositivo»: tiene otro tamaño, así que se borra en cuanto se abre. El usuario ve «Archivo vinculado» y, acto seguido, otra vez el aviso.
- **Los archivos que solo están en un móvil (más de 50 MB) siguen sin protección.** Otro móvil con la biblioteca desactualizada puede vincular encima: se pierde la sincronía y, además, la limpieza nueva borra la copia del primer móvil. Comprobado en la prueba propia, por la parte de la base de datos.

Las dos migraciones de la fase 1 son compatibles con la app de producción (`main` = `650b974`) y con sus datos. Hay que aplicarlas en orden.

| Gravedad | Nº | Notas |
| --- | --- | --- |
| 🔴 Serio | 1 | 7 |
| 🟡 Importante | 3 | 6, 6, 5 |
| 🟢 Menor | 3 | 4, 3, 3 |
| ⚪ Cosmético / limpieza | 1 | 2 |

---

## 1 · Estado de los hallazgos de nota 5 o más de la ronda 1

| Ronda 1 | Hallazgo | Nota | Estado | Evidencia |
| --- | --- | --- | --- | --- |
| BD 1 | Vincular sobre un vídeo que ya tiene archivo pisa la ficha | 7 | **Parcial** | **Corregido para archivos en la nube:** el cliente relee la fila y para si ya hay archivo en la nube; si la nube rechaza la subida, no escribe nada; el trigger nuevo `videos_file_lock` impide cambiar nombre, tamaño y duración mientras haya archivo en la nube, y el desfase sigue editable. Prueba propia: reescribir falla con `file_locked` y cambiar solo el desfase funciona. **Sin corregir para archivos solo en un móvil:** el cliente solo mira si hay archivo en la nube, no si hay archivo vinculado, y el trigger solo protege si hay archivo en la nube. Prueba propia: con una entrada vinculada solo en un móvil (80 MB, desfase 1,25), otro móvil sube su archivo y lo vincula encima con desfase 0, sin ningún error. Ver regresión R3. |
| BD 2 | Sin tope de archivos por entrada de YouTube | 5 | **Parcial** | Tope de 5 archivos por vídeo, contando los quitados. Prueba propia: el sexto se rechaza. Falta la consulta de administrador para ver los huérfanos en `DEPLOY.md`, y el aviso en la app cuando se llega al tope. Además, el tope crea la regresión R1. |
| BD 3 / Cliente 3 | La copia vieja de un móvil manda sobre la nube | 5 / 6 | **Corregido, con regresión** | El estudio y «Volver a sincronizar» descartan una copia si su tamaño no coincide con el de la ficha, y el estudio la borra. Solo en entradas de YouTube, así que los vídeos subidos no se tocan. Pero también borra copias válidas (R2, R3). Las copias de un archivo quitado en otro móvil siguen sin borrarse mientras nadie vincule otro (R7). |
| BD 4 / Cliente 7 | «Vincular archivo» y «Subir a la nube» en YouTube no comprueban ni actualizan la ficha | 5 / 5 | **Sin corregir** | `useLinkLocalFile` y `useUploadToCloud` no han cambiado: suben con el nombre sin sufijo y solo escriben la ruta de la nube. El aviso sigue diciendo «No llegó a subirse a la nube». «Subir a la nube» sigue saliendo con archivos de más de 50 MB. Ahora es peor: el trigger nuevo deja esa ficha incoherente bloqueada (no se puede corregir sin quitar el archivo) y la limpieza de copias borra la copia recién vinculada (R2). |
| Cliente 1 | Sincronizar con el estudio en «Archivo» compara el archivo consigo mismo | 7 | **Casi corregido** | Al entrar en la sincronía, el estudio pasa a YouTube y conserva el momento. «Quitar» y «Cambiar» limpian el escenario recordado. Queda un caso: si otro móvil quitó el archivo, este móvil sigue recordando «Archivo». Al vincular uno nuevo aquí, el estudio vuelve solo a «Archivo» justo después de abrir la sincronía (R4). |
| Cliente 2 | «Cambiar archivo» quita el archivo antes de elegir el nuevo | 7 | **Parcial** | Ahora se elige primero, con el selector abierto desde el toque, y cancelar no toca nada. Pero al pulsar «Vincular» se quita el viejo antes de saber si el nuevo se guarda. Si falla la subida, se pierde (R1). |
| Cliente 4 | El archivo arranca en su segundo 0 al abrir con «Archivo» recordado | 6 | **Corregido** | Al cargar, el archivo salta al momento actual de la canción si no hay otro salto pendiente, y el tiempo nunca baja de 0. El escenario se sigue restaurando sin pasar por `setStage` y se sigue creando un reproductor de YouTube de más al abrir (menor). |
| Cliente 5 | La duración del archivo se guarda como duración de YouTube | 5 | **Parcial** | El estudio ya no guarda la duración mientras está en «Archivo». Quedan dos huecos. (a) Al cambiar el archivo desde «Archivo», el escenario pasa a YouTube antes de que se compruebe la duración, con la duración del archivo viejo aún en el reproductor, y se guarda (R5). (b) La comprobación del panel sigue usando primero la duración del reproductor activo: en «Archivo» compara el archivo nuevo con el viejo, no con YouTube. |
| Cliente 6 | «La duración coincide» cuando no se sabe | 5 | **Casi corregido** | Hay tres estados: coincide, no coincide y «No se ha podido leer la duración». Sigue sin haber señal de espera mientras se lee el archivo (hasta 8 s), y sin aviso previo si el archivo no se puede reproducir. |
| Cliente 8 | Selector de 32 px y textos que prometen funciones que no existen | 5 | **Parcial** | El texto junto al selector ya dice lo que hace hoy. El selector sigue midiendo 32 px y la descripción del panel sigue diciendo «Lo usan el superpuesto, el zoom y el seguimiento». |

De nota menor que 5 no se ha tocado casi nada:
- comprobaciones SQL débiles (BD 6), con alguna mejora;
- `guard_simple_cap` (BD 7);
- documentación (BD 8): `ARCHITECTURE.md` y `DEPLOY.md` siguen sin `members`, sin las columnas nuevas y sin `plan_fase1_checks.sql`;
- temporizadores de «Probar juntos» (Cliente 13), textos (Cliente 14) y accesibilidad (Cliente 12).

---

## 2 · Regresiones y huecos nuevos

### 🔴 R1 · «Cambiar archivo» quita el viejo antes de subir el nuevo: al quinto cambio se pierde seguro · nota 7

- **Dónde:** `LinkFilePanel.tsx`, «Vincular» con cambio pendiente (primero quita y luego vincula); `videos.ts`, `useLinkVideoFile` (si la nube dice que no, lanza un error); migración nueva, tope de 5 archivos.
- **Flujo:**
  1. Un vídeo de YouTube con archivo en la nube ha cambiado de archivo 4 veces, o alguna subida anterior falló a medias. Ya hay 5 archivos de ese vídeo en el bucket.
  2. «Cambiar archivo» → se elige el nuevo → «Vincular».
  3. La app quita el viejo: vacía la ficha y el desfase, y borra la copia de este móvil.
  4. Sube el nuevo y la nube lo rechaza por el tope. Sale «La nube no ha aceptado el archivo… prueba otra vez».
  5. El vídeo se queda sin archivo y sin sincronía para todo el grupo. Reintentar da el mismo error para siempre.
- **Otros casos con el mismo efecto:**
  - cualquier otro rechazo de la nube después de quitar el viejo;
  - en archivos de más de 50 MB, no poder guardar la copia en el móvil (falta de espacio).
  - Si el archivo viejo solo estaba en el móvil, quitarlo ni siquiera hace falta, y aun así se borra su copia antes de guardar el nuevo.
- **Cuándo pasa:** de forma segura en el quinto cambio de un mismo vídeo. Antes, si se suman subidas fallidas.
- **Impacto:** se pierde la sincronía, que se hace a mano y vale para todo el grupo. El archivo viejo sigue en el bucket, pero la app no tiene forma de volver a vincularlo.
- **Evidencia:** prueba propia. Ciclo de vincular y quitar: los cinco primeros archivos se aceptan, el sexto se rechaza por RLS y la fila queda sin ruta, sin nombre y sin desfase.
- **Arreglo, cualquiera de los dos:**
  - **Deshacer si falla:** si después de quitar el viejo la vinculación falla, volver a poner la ruta, el nombre, el tamaño, la duración y el desfase anteriores. La base de datos lo permite: el objeto viejo existe y pasar de «sin archivo» a su ruta propia está permitido.
  - **Mejor:** dejar subir el archivo nuevo aunque haya uno vinculado (dentro del tope) y cambiar la ruta en una sola actualización, permitiendo en el trigger que la ruta pase de un archivo propio a otro archivo propio solo en entradas de YouTube.
  - **En los dos casos:**
    - antes de quitar nada, comprobar si se ha llegado al tope y avisar: «Este vídeo ya ha cambiado de archivo demasiadas veces; pide al administrador que limpie»;
    - con un archivo que solo estaba en el móvil, no quitar el viejo: vincular encima directamente.
- **Test:** con 5 objetos en el bucket para un vídeo vinculado, «Cambiar archivo» debe dejar la fila igual que estaba y mostrar el aviso del tope.

### 🟡 R2 · La limpieza de copias borra la copia propia vinculada desde «Este archivo está en otro dispositivo» · nota 6

- **Dónde:** `StudioPage.tsx`, `useFileSource` (descarta y borra la copia si su tamaño no coincide con el de la ficha) y `onPick` del aviso «falta», que sigue usando `useLinkLocalFile`.
- **Flujo:**
  1. A vincula un archivo de 80 MB. Se queda solo en su móvil.
  2. B elige «Archivo», ve el aviso y vincula su propia descarga, de otro tamaño.
  3. Sale «Archivo vinculado en este dispositivo» y el estudio recarga.
  4. Como el tamaño no coincide con el de la ficha, la copia de B se borra sin aviso y vuelve a salir «Este archivo está en otro dispositivo».
- **Variante:** si la copia de B pesa 50 MB o menos, antes de borrarse se sube a la nube como archivo del grupo, con el nombre sin sufijo y sin tocar la ficha (hallazgo BD 4 sin corregir). Desde entonces, todos los que no tienen copia reproducen el archivo de B con el desfase medido sobre el de A. Y el trigger nuevo impide corregir la ficha sin quitar el archivo.
- **Cuándo pasa:** es justo el camino que propone el plan para los archivos de más de 50 MB («los demás pueden vincular su propia copia»). Solo funciona si la copia es idéntica byte a byte.
- **Impacto:** B no puede usar «Archivo» en ese vídeo y la app le dice lo contrario. En la variante, el grupo entero reproduce un archivo descuadrado.
- **Evidencia:** lectura del código.
- **Arreglo:** en entradas de YouTube, que ese aviso abra el panel de vincular (comprobación de duración y sincronía propia), como pedía la ronda 1. Si se quiere permitir una copia distinta solo en el móvil, guardar con ella su huella y su propio desfase, en vez de compararla con la ficha. Cambiar el texto del aviso. No subir a la nube desde ahí.
- **Test:** en una entrada de YouTube vinculada solo en otro móvil, vincular una copia de otro tamaño desde el aviso no debe cambiar la ruta de la nube, y la copia no debe borrarse.

### 🟡 R3 · Un archivo vinculado solo en un móvil se puede pisar, y después se borra su copia · nota 6

- **Dónde:** `videos.ts`, `useLinkVideoFile`: la relectura solo mira si hay archivo en la nube. Migración nueva: el trigger solo protege si hay archivo en la nube. `useFileSource`: borra la copia que no coincide.
- **Flujo:**
  1. A vincula un archivo de 80 MB, que se queda solo en su móvil, y lo sincroniza.
  2. B, con la biblioteca desactualizada, vincula su archivo a la misma entrada: desde «Añadir vídeo» → «¿Es el archivo de…?», o con el panel abierto antes del cambio de A.
  3. La relectura ve que no hay archivo en la nube y sigue. B sube el suyo (si cabe) y escribe nombre, tamaño, duración y desfase 0.
  4. Cuando A vuelve a abrir el vídeo en «Archivo», su copia ya no coincide con la ficha y se borra.
- **Cuándo pasa:** dos personas añaden el archivo del mismo vídeo con poco tiempo de diferencia, y el primero pesa más de 50 MB. Es menos probable que con archivos en la nube, pero es el mismo escenario que la ronda 1 puntuó con un 7.
- **Impacto:**
  - Se pierde la sincronía de A.
  - Se borra la única copia de la app en el móvil de A. El original sigue en su galería.
- **Evidencia:** prueba propia en la base de datos (la segunda vinculación se acepta y deja desfase 0). La parte del cliente, por lectura del código.
- **Arreglo:**
  - **Cliente:** en la relectura, parar si la entrada tiene cualquier archivo vinculado (nombre de archivo o ruta), no solo si tiene ruta.
  - **Base de datos:** extender el bloqueo a cuando hay nombre de archivo aunque no haya ruta, permitiendo solo vaciar los datos del archivo (quitar) o poner la ruta sin cambiar los datos (subir el mismo archivo a la nube).
- **Test:** como `anon`, sobre una entrada con nombre de archivo y sin ruta, cambiar nombre o tamaño debe fallar, y vaciarlos debe funcionar.

### 🟡 R4 · Si otro móvil quitó el archivo, al vincular uno nuevo aquí el estudio vuelve a «Archivo» durante la sincronía · nota 5

- **Dónde:** `StudioPage.tsx`, el efecto que restaura el escenario recordado cuando cambia «tiene archivo»; `LinkFilePanel.tsx`, `startSync`.
- **Flujo:**
  1. En este móvil se usaba «Archivo» en el vídeo X, y queda recordado.
  2. Otro móvil quita el archivo de X. Aquí no se borra lo recordado, porque «Quitar» solo lo limpia en el móvil que lo pulsa.
  3. Más tarde, en este móvil se vincula un archivo nuevo a X. `startSync` pone el estudio en YouTube.
  4. Justo después llega la actualización de la ficha («ya tiene archivo») y el efecto vuelve a poner «Archivo», el valor recordado.
  5. El lado «YouTube» del panel vuelve a mover el archivo: es el hallazgo Cliente 1 de la ronda 1.
- **Cuándo pasa:** solo con esa secuencia entre dos móviles. Es plausible en un grupo.
- **Evidencia:** lectura del código. React Query avisa de los cambios de caché en un turno posterior, así que el efecto corre después de `startSync`. No reproducido en el navegador.
- **Arreglo:** cuando el efecto ve que la entrada no tiene archivo, borrar también lo recordado. Y que el efecto no cambie el escenario mientras el panel está sincronizando, o que el panel recuerde «YouTube» al empezar.
- **Test:** con «Archivo» recordado y una entrada sin archivo, vincular un archivo nuevo debe dejar el escenario en YouTube durante toda la sincronía.

### 🟢 R5 · Al cambiar el archivo desde «Archivo», la duración del archivo viejo puede guardarse como la de YouTube · nota 4

- **Dónde:** `StudioPage.tsx`: el efecto del escenario va antes que el de la duración; los dos corren en el mismo pintado.
- **Flujo:**
  1. Un vídeo de YouTube sin duración guardada, que suele ser justo el que no se reproduce bien en YouTube.
  2. Con el estudio en «Archivo», se pulsa «Cambiar archivo» → «Vincular».
  3. Al quitar el viejo, el efecto del escenario pone YouTube.
  4. El efecto de la duración ve YouTube y guarda la duración que tiene el reproductor, que todavía es la del archivo viejo.
- **Impacto:** la tarjeta muestra una duración falsa, y la próxima comprobación compara contra ella.
- **Arreglo:** guardar la duración solo cuando la da el motor de YouTube (por ejemplo, marcando de qué motor viene), no según el escenario del momento. En el panel, comparar con la duración propia de YouTube antes que con la del reproductor.

### 🟢 R6 · Tras sincronizar desde «Archivo», el estudio se queda en YouTube · nota 3

- **Dónde:** `LinkFilePanel.tsx`, `startSync`.
- **Detalle:**
  - `startSync` pasa el estudio a YouTube sin cambiar lo recordado. Al guardar o cerrar el panel, el estudio sigue en YouTube, aunque la persona estaba en «Archivo». La próxima vez que abra el vídeo, volverá a «Archivo».
  - El momento sí se conserva al pasar a YouTube y al volver.
  - Si YouTube no se puede reproducir (vídeo bloqueado para insertar, que es uno de los motivos para añadir el archivo), ahora no hay forma de sincronizar: el panel solo permite ajustar en centésimas sin marcas. Antes tampoco se podía hacer bien, porque comparaba el archivo consigo mismo.
- **Arreglo:** al cerrar el panel, devolver el estudio al escenario en que estaba. Para vídeos que no se pueden reproducir en YouTube, ofrecer escribir el desfase a mano.

### 🟢 R7 · Las copias de un archivo quitado en otro móvil no se borran nunca · nota 3

- **Dónde:** `useFileSource` solo corre en «Archivo», y una entrada sin archivo no tiene «Archivo».
- **Detalle:** si otro móvil quita el archivo y nadie vincula otro, la copia de este móvil (puede pasar de 1 GB) se queda en el almacenamiento del navegador hasta que se borre el vídeo.
- **Arreglo:** en la limpieza que ya se hace al cargar la biblioteca, borrar también las copias de entradas de YouTube sin archivo vinculado.

### ⚪ R8 · El error `file_locked` no tiene mensaje en español · nota 2

- `friendlyError` traduce `storage_path_locked`, pero no `file_locked`. Hoy la app no debería provocarlo nunca, pero si pasa (dos móviles a la vez), se verá un mensaje genérico o en inglés. Basta con «Este vídeo ya tiene otro archivo vinculado».

---

## Respuestas a las preguntas del encargo

- **¿«Quitar el archivo» sigue funcionando con el trigger `videos_file_lock`?** Sí. El trigger solo bloquea si la ruta de la nube no cambia, y al quitar se vacía en la misma actualización. Prueba propia: se acepta con la actualización exacta que manda el cliente. También funciona con un archivo que solo estaba en el móvil.
- **¿El cliente vacía `file_name` junto a `storage_path`?** Sí. `useUnlinkVideoFile` manda en una sola actualización la ruta, el nombre, el tamaño, el desfase y la duración, todo vacío. Volver a mandar los mismos valores con el archivo puesto también se acepta (prueba propia).
- **¿«Cambiar archivo» elige primero y luego quita y vincula, también si el primero era solo local?**
  - Sí, en ese orden. El selector se abre en el mismo toque de «Elegir el nuevo», así que vale para el iPhone, y cancelar no toca nada.
  - Con un archivo que solo estaba en el móvil también quita primero, aunque no haría falta, y borra la copia del móvil antes de saber si el nuevo se guarda.
  - El problema es lo que pasa si falla después de quitar (R1).
- **¿La limpieza de copias viejas borra copias válidas?**
  - **Vídeos subidos:** no. Solo actúa en entradas de YouTube.
  - **Archivo de más de 50 MB solo local, en el móvil que lo vinculó:** no. La copia se guarda tal cual en IndexedDB y tiene el mismo tamaño que la ficha.
  - **Sí borra** la copia propia que otro móvil vincula desde el aviso (R2), y la del primer móvil si otro pisa la ficha (R3).
- **¿`startSync` cambia el escenario? ¿Qué pasa al cerrar el panel?**
  - Sí: pasa a YouTube con `setStage`, que pausa y guarda el momento para el motor de YouTube.
  - No cambia lo recordado.
  - Al cerrar, el estudio se queda en YouTube (R6).
  - Con «Archivo» recordado de antes y el archivo quitado en otro móvil, el estudio vuelve solo a «Archivo» en plena sincronía (R4).
- **¿Arranque con desfase y `pendingSeek`?**
  - Bien. Al cargar el archivo, si no hay salto pendiente, salta al momento actual de la canción, que al abrir es 0 tras el reinicio del reproductor. Si hay salto pendiente (cambio de escenario), lo hace `attach`.
  - El tiempo ya no baja de 0. Con desfase positivo, el principio sobrante del archivo cuenta como 0.
  - Con desfase 0 no salta, que es lo correcto.
  - **Detalle sin cambios:** si otro móvil cambia el desfase mientras este reproduce en «Archivo», el reproductor se rehace con el desfase nuevo, conserva el momento y se pausa.

---

## 3 · Compatibilidad con producción y orden de aplicación

- **Estado de producción:** en el proyecto real están aplicadas las siete migraciones hasta `archive_and_hardening`. Las versiones son fechas de aplicación, no los nombres de los ficheros. No están aplicadas ni `20261016000000_linked_file_and_members` ni `20261016000100_linked_file_guard`.
- **`main` (`650b974`)** no tiene el código de F1/F2: es el arreglo del grabador sobre `b59550e`. Solo usa vídeos subidos con nombre sin sufijo, YouTube sin archivo y notas sin autor.
- **La app de producción con las dos migraciones aplicadas** (prueba propia, como `anon`), todo funciona:
  - crear un vídeo subido;
  - subir su archivo con el nombre normal;
  - guardar la ruta;
  - cambiar el título y la duración;
  - añadir una entrada de YouTube;
  - crear una nota sin autor;
  - borrar (archivar).
- **El trigger nuevo** también afecta a los vídeos subidos con archivo en la nube: no se puede cambiar su nombre, tamaño ni duración de archivo. `main` nunca lo hace (solo escribe esos datos al crear la fila, antes de tener ruta), así que no rompe nada.
- **Datos existentes** (prueba propia, con una fila subida antigua y su objeto en el bucket):
  - las dos restricciones de ruta quedan validadas;
  - el archivo antiguo se sigue pudiendo leer.
- **Orden obligatorio:** `20261016000000` → `20261016000100` → `20261016010000_takes`.
  - `000100` aplicada sola falla porque falta la columna de duración del archivo (prueba propia).
  - La de tomas usa funciones que crea `000000` (el tope de filas y el borrado = archivado con `members`), y su `archive_row` reescrita conserva `members`.
  - `000100` y la de tomas no se pisan: la de tomas no toca `video_object_allowed` ni los triggers de `videos`.
- **Despliegue:**
  1. Primero las migraciones; la app vieja sigue funcionando con ellas.
  2. Después la app nueva, que necesita las columnas nuevas.
  3. Tras aplicarlas, pasar `archive_checks.sql` y `plan_fase1_checks.sql` contra el proyecto real y mirar los advisors. Yo no lo he hecho: revisión de solo lectura.
  4. Antes de dar F1 por bueno, sigue pendiente lo que pedía la ronda 1: una subida real en una rama de Supabase (vincular, firmar enlace, quitar y volver a vincular). El tope cuenta objetos con una consulta dentro de la política, y el servicio real de Storage puede comportarse distinto del arnés.

---

## Comprobaciones SQL: lo que mejoró y lo que falta

- **Nuevas y bien planteadas:**
  - bloqueo de la ficha con archivo en la nube, con el error exacto;
  - sufijo prohibido en vídeos subidos, con el error de restricción exacto;
  - tope de 5, con el error de permisos exacto.
- **Siguen como en la ronda 1:**
  - «storage_path only points at the video's own file» acepta también `storage_path_locked`, así que no prueba la restricción;
  - no hay ninguna prueba de que el archivo vinculado se pueda leer;
  - los bloques de almacenamiento pueden acabar en «INCONCLUSIVE» y el fichero cuenta como aprobado;
  - «uploaded videos keep one fixed file» acepta cualquier error.
- **Faltan:**
  - quitar con la actualización completa del cliente (yo lo he probado aparte: funciona);
  - pisar una ficha que solo tiene archivo en el móvil (R3);
  - el tope de miembros y el bloqueo del borrado masivo en `members`.
- **Cliente:** el commit no añade ningún test de las correcciones:
  - que una subida rechazada no escriba la ficha;
  - que se ignore una copia de otro tamaño;
  - que cancelar «Cambiar archivo» no toque nada;
  - que el archivo arranque en el 0 de la canción;
  - que `withOffset` no baje de 0.

## Limitaciones

- Sin Supabase real ni dispositivo: la subida, la firma de enlaces y el tope se han probado en PGlite, insertando directamente en `storage.objects`.
- R2, R4 y R5 son por lectura del código; no los he reproducido en el modo demo.
- `pnpm typecheck` y `pnpm test` corren sobre el árbol de trabajo, que incluye cambios sin commit de otros pasos. Pasan igual.
