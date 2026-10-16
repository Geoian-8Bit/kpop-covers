# Revisión · F1 (archivo vinculado) y F2 (quién es quién), lado cliente · Ronda 1

**Alcance:** commit `9ad9fd7` (`git diff b59550e..9ad9fd7`), solo el cliente: `LinkFilePanel.tsx`, `StudioPage.tsx` (selector «YouTube | Archivo», `useFileSource` con `enabled`, escenario recordado, llegada con `linkFile`), `player/store.ts` (`stage`, `pendingSeek`, `setStage`, `attach`), `player/engine.ts` (`withOffset`), `player/FileStage.tsx`, `AddVideoDialog.tsx` (parecidos), `VideoCard.tsx` («con archivo»), `data/videos.ts`, `data/members.ts`, `features/members/MembersUI.tsx`, `AppShell.tsx`, `NoteDialog.tsx` y `packages/shared/src/linking.ts` con sus tests. La migración y las políticas no entran.
**Objetivo:** Samsung S24/S25 con Chrome Android (PWA) y portátil en el local de ensayo.
**Tipo de revisión:** solo lectura. Los números de línea son los del commit `9ad9fd7`. El árbol de trabajo tiene cambios en curso de otro paso (grabador, tomas); no los he mirado.

---

## Resumen

La base está bien pensada. Todo habla en segundos de YouTube: el reproductor, los clips, las notas y el grabador. El archivo se traduce con un desfase fijo dentro del motor, así que los clips y las notas cuadran solos. Lo he comprobado en el modo demo: al cambiar de «Archivo» a «YouTube» y volver, se conservan el momento, la velocidad, el espejo y la marca A. La llegada desde «Añadir vídeo» con el archivo también funciona: el panel se abre con el archivo, y al ir atrás, adelante o recargar no se vuelve a abrir. «¿Quién eres?» sale una vez, no bloquea y la acción sigue.

Los fallos están en los bordes de la sincronía y en el ciclo de vida del archivo:

- **La sincronización usa siempre el reproductor del estudio.** Si el estudio está en «Archivo», el lado «YouTube» del panel mueve el archivo. Volver a sincronizar compara el archivo consigo mismo. Lo he comprobado en el navegador.
- **«Cambiar archivo» quita el archivo antes de elegir el nuevo.** Si se cancela el selector, el grupo se queda sin archivo y sin desfase.
- **Las copias guardadas en cada móvil mandan sobre la nube y nunca se renuevan.** Tras cambiar o quitar el archivo en otro dispositivo, esos móviles siguen usando el antiguo con el desfase nuevo.
- **Al abrir un vídeo con «Archivo» recordado, el archivo empieza en su segundo 0, no en el 0 de YouTube.** Con desfase positivo, el reloj se queda en 0:00 y el tiempo interno es negativo (comprobado: −4).
- **La duración del archivo se puede guardar como duración del vídeo de YouTube** (comprobado), y el panel dice «La duración coincide» cuando no la sabe (comprobado).

No hay pérdida de datos del grupo: ni clips, ni notas, ni miembros. El caso más delicado es el hallazgo 2. Ahí se pierden la sincronía y la copia del móvil, aunque el archivo original sigue en la galería de quien lo eligió.

| Gravedad | Nº | Notas |
| --- | --- | --- |
| 🔴 Serio | 2 | 7, 7 |
| 🟡 Importante | 6 | 6, 6, 5, 5, 5, 5 |
| 🟢 Menor | 6 | 4, 4, 4, 4, 3, 3 |
| ⚪ Cosmético / limpieza | 3 | 3, 3, 2 |

---

## Hallazgos

### 🔴 1 · Sincronizar con el estudio en «Archivo» compara el archivo consigo mismo · nota 7

- **Dónde:** `LinkFilePanel.tsx` 96–102 (`resync`), 116–125 (`replaceFile`), 342–364 (`testTogether`), 375–393 (el lado «YouTube» usa el reproductor del estudio); `StudioPage.tsx` 101–105 (escenario recordado), 390–399 (`rememberStage`).
- **Flujo:**
  1. El bailarín está en «Archivo», nota que no cuadra y abre «Archivo» → «Volver a sincronizar».
  2. El lado «YouTube» del panel reproduce, salta y marca con el reproductor del estudio. Ese reproductor es ahora el archivo, con el desfase antiguo.
  3. Al marcar el mismo golpe en los dos lados, sale otra vez el desfase antiguo. «Probar juntos» suena el archivo dos veces, así que siempre suena «en sincronía».
- **Cuándo pasa:**
  - Siempre que se resincroniza con el estudio en «Archivo», que es justo cuando se nota el desfase.
  - También con «Cambiar archivo»: quitar el archivo no borra «Archivo» como escenario recordado en este dispositivo. Al vincular el nuevo, el estudio vuelve solo a «Archivo» y el panel de sincronía mueve el archivo nuevo.
- **Protecciones actuales:** ninguna. Quitar y cambiar pasan el estudio a «YouTube», pero no borran lo recordado.
- **Impacto:** el texto dice «Se oye el vídeo del estudio» y el usuario cree oír YouTube. Se guarda un desfase que no se ha medido, para todo el grupo, y los clips y notas dejan de cuadrar en el archivo.
- **Evidencia:** en el modo demo, con el estudio en «Archivo», abrí «Volver a sincronizar» y pulsé «Reproducir YouTube». Empezó a sonar el `<video>` del estudio (el archivo, de 5 s a 7,1 s), no había ningún iframe de YouTube y el botón pasó a «Pausar YouTube».
- **¿Nuevo?** Sí.
- **Arreglo:** al entrar en el paso de sincronía, pasar el estudio a YouTube y recordarlo así; o desactivar «Volver a sincronizar» mientras se esté en «Archivo», explicando por qué. «Quitar» y «Cambiar» deben borrar también el escenario recordado de ese vídeo.
- **Test:** con el estudio en «Archivo», abrir la sincronía y comprobar que el escenario pasa a YouTube. Después de quitar, el escenario recordado debe ser YouTube.

### 🔴 2 · «Cambiar archivo» quita el archivo antes de elegir el nuevo · nota 7

- **Dónde:** `LinkFilePanel.tsx` 116–125 (`replaceFile`); `data/videos.ts` 285–302 (`useUnlinkVideoFile` borra la copia del móvil).
- **Flujo:**
  1. «Cambiar archivo» → «Elegir el nuevo».
  2. La app quita el archivo: vacía los datos del archivo del vídeo, pone el desfase en nada y borra la copia de este móvil.
  3. Solo después intenta abrir el selector de archivos.
- **Cuándo pasa:**
  - Si el bailarín cancela el selector o se equivoca de carpeta y sale.
  - Si la red tarda y el navegador ya no deja abrir el selector: tiene que abrirse justo tras un toque, y aquí se abre después de esperar a la base de datos (hipótesis; en Safari es más estricto).
- **Protecciones actuales:** la confirmación. Pero el texto dice «Cambia el archivo», no «lo quita ya».
- **Impacto:** el grupo se queda sin archivo y sin sincronía. Si pesaba más de 50 MB, la única copia de la app estaba en ese móvil y se ha borrado. El original sigue en la galería, pero hay que volver a vincular y sincronizar.
- **Evidencia:** lectura del código: el quitado va antes de abrir el selector, y no se deshace si no llega un archivo.
- **¿Nuevo?** Sí.
- **Arreglo:** primero elegir el archivo nuevo (con el toque del usuario) y comprobar su duración. Solo al pulsar «Vincular» quitar el anterior y guardar el nuevo, en ese orden. Si se cancela, no se toca nada.
- **Test:** con un vídeo vinculado, «Cambiar archivo», cancelar el selector y comprobar que el vídeo sigue con su archivo y su desfase.

### 🟡 3 · Las copias de cada móvil mandan sobre la nube y no se renuevan al cambiar el archivo · nota 6

- **Dónde:** `StudioPage.tsx` 343–378 (`useFileSource`: primero la copia del móvil, luego la nube); `LinkFilePanel.tsx` 96–98 (igual); `data/videos.ts` 247–283 (la copia se guarda antes de cambiar el vídeo), 285–302 (al quitar, solo se borra la copia de este dispositivo).
- **Flujo:**
  1. El móvil A vincula un archivo y guarda su copia.
  2. El móvil B lo cambia por otro (otra versión) y lo sincroniza.
  3. En A, el estudio y el panel siguen cargando su copia antigua, ahora con el desfase del archivo nuevo.
- **Cuándo pasa:**
  - Tras «Cambiar archivo» o «Quitar» y volver a vincular desde otro dispositivo.
  - Si dos personas vinculan a la vez: el segundo guardado falla en la base de datos, pero su copia ya está guardada, y en su móvil se usará con el desfase del otro.
- **Protecciones actuales:** ninguna. La limpieza de copias solo borra las de vídeos que ya no existen.
- **Impacto:** en los móviles que tenían copia, el archivo reproducido no es el del grupo y los clips quedan corridos sin ningún aviso. Además, las copias de archivos quitados nunca se borran (puede ser más de 1 GB por vídeo).
- **¿Nuevo?** Sí. Antes, el archivo de un vídeo subido no cambiaba nunca.
- **Arreglo:** antes de usar la copia, comprobar que coincide con el archivo del vídeo (nombre y tamaño ya están guardados en la fila). Si no coincide, descartarla y usar la nube, o pedir que se vincule la copia correcta. Si el vídeo ya no tiene archivo, borrar la copia.
- **Test:** guardar una copia con otro tamaño en el almacenamiento del navegador y comprobar que el estudio no la usa.

### 🟡 4 · Al abrir un vídeo con «Archivo» recordado, el archivo arranca en su segundo 0 · nota 6

- **Dónde:** `StudioPage.tsx` 101–105 (pone el escenario directamente, sin `setStage`, sin momento pendiente); `store.ts` 200–212 (`attach` solo salta si hay momento pendiente); `engine.ts` (`withOffset`).
- **Flujo:**
  1. Se abre un vídeo cuyo último escenario en este móvil fue «Archivo», con desfase positivo (el archivo tiene más intro).
  2. El archivo carga en su segundo 0, que en YouTube es «−desfase».
  3. Se pulsa reproducir: suena la intro sobrante del archivo y el reloj interno es negativo hasta llegar al 0 de YouTube.
- **Cuándo pasa:** cada vez que alguien abre ese vídeo con «Archivo» recordado y reproduce desde el principio. Es el uso normal de quien prefiere el archivo.
- **Impacto:**
  - El reloj se queda en «0:00.0» mientras el vídeo avanza, y los primeros segundos no son los de YouTube.
  - Una marca A o una nota hecha en ese tramo queda en tiempo negativo.
  - Hipótesis: la base de datos rechazaría la nota o el clip, o el tramo empezaría en 0 sin avisar.
  - Además, al abrir se monta y se desmonta un reproductor de YouTube sin usarlo.
- **Evidencia:** en el modo demo, con desfase +5 s y «Archivo» recordado: tras pulsar reproducir, la línea de tiempo marcaba −4 (archivo en 1,76 s) y el reloj mostraba «0:00.0». Después avanzó bien: archivo 8,43 s = reloj 0:03,4.
- **¿Nuevo?** Sí.
- **Arreglo:** al restaurar el escenario, pasar por `setStage` (o dejar el momento actual como pendiente), para que el archivo empiece en el 0 de YouTube. Recordar el escenario antes de pintar el estudio, para no crear el iframe de más.
- **Test:** guardar «Archivo» como escenario, crear un motor con desfase +5 y comprobar que, al conectarse, salta al segundo 5 del archivo y el tiempo es 0.

### 🟡 5 · La duración del archivo se guarda como duración del vídeo de YouTube · nota 5

- **Dónde:** `StudioPage.tsx` 172–178 (guarda la primera duración conocida si el vídeo no tiene); `LinkFilePanel.tsx` 63 (la comprobación usa la duración del reproductor).
- **Flujo:**
  1. El vídeo de YouTube no tiene duración guardada, por ejemplo porque YouTube no se pudo reproducir y por eso se añadió el archivo.
  2. El estudio está en «Archivo» y el reproductor da la duración del archivo menos el desfase.
  3. Esa cifra se guarda como duración del vídeo de YouTube, para todo el grupo.
- **Impacto:**
  - La tarjeta de la biblioteca muestra una duración falsa.
  - La comprobación de duración compara después contra esa cifra, así que un archivo de otra versión puede pasar como «coincide».
- **Evidencia:** en el modo demo, un vídeo de YouTube de 3:34 sin duración guardada, abierto en «Archivo» con un archivo de 20 s y desfase +5, quedó guardado con 14,954 s. La tarjeta mostró «0:14».
- **¿Nuevo?** Sí.
- **Arreglo:** guardar la duración solo cuando la da el reproductor de YouTube. En la comprobación, usar la duración propia de YouTube, no la del reproductor activo.
- **Test:** con el escenario en «Archivo», una duración conocida no debe llegar a guardarse en el vídeo.

### 🟡 6 · «La duración coincide» cuando no se sabe, sin espera visible y sin aviso de archivo ilegible · nota 5

- **Dónde:** `LinkFilePanel.tsx` 78–82 (`onPick`), 206–219; `localVideos.ts` (`probeMediaFile`); `linking.ts` (`durationMismatch` responde «no» si falta un dato).
- **Flujo:**
  1. Se elige un archivo cuya duración el navegador no lee (MKV, HEVC en algunos móviles, WebM grabados) o la duración de YouTube aún no se conoce.
  2. La comparación no puede hacerse, pero el panel enseña la marca verde «La duración coincide con la del vídeo de YouTube» y el botón «Vincular».
- **Más detalles:**
  - Mientras se lee el archivo (hasta 8 s, más 3 s para sacar un fotograma de portada que aquí no se usa), el panel sigue en el paso inicial sin ninguna señal de espera.
  - Si el archivo no se puede reproducir, se vincula igual y luego sale «No se pudo reproducir este archivo en el navegador».
- **Evidencia:** en el modo demo, con un WebM de 20 s sin duración legible, sugerido para un vídeo de 180 s, el panel mostró «La duración coincide con la del vídeo de YouTube».
- **¿Nuevo?** Sí. Es justo el caso que F1, punto 5, quería cerrar.
- **Arreglo:**
  - Tres estados: coincide, no coincide, no se puede comprobar. El tercero, con un texto neutro: «No se ha podido leer la duración del archivo».
  - Mostrar «Leyendo el archivo…» mientras dura la lectura, y leer solo la duración.
  - Si el archivo no se puede leer, avisar antes de vincularlo.
- **Test:** sin duración del archivo o sin la de YouTube, el resultado es «no se puede comprobar», no «coincide».

### 🟡 7 · La copia de otro dispositivo se vincula sin comprobar y puede reemplazar el archivo del grupo · nota 5

- **Dónde:** `StudioPage.tsx` 549–558 y 686–707 (aviso «Este archivo está en otro dispositivo» y «Vincular archivo»); `data/videos.ts` 205–219 (`useLinkLocalFile`), 221–232 (`useUploadToCloud`); `LinkFilePanel.tsx` 101.
- **Flujo (segundo dispositivo, archivo de más de 50 MB que solo tiene quien lo vinculó):**
  1. Elige «Archivo» y ve el aviso. El texto dice «No llegó a subirse a la nube», cuando en realidad nunca iba a subirse.
  2. Elige su propia copia. No se comprueba la duración, y no se avisa de que el desfase guardado es el de la copia de otra persona.
  3. Si su copia pesa 50 MB o menos, se sube como archivo del grupo, con un nombre sin sufijo. Desde ese momento, todos los que no tienen copia reproducen ese archivo con el desfase medido sobre otro.
- **Más detalles:**
  - El botón «Solo en este móvil · Subir a la nube» sale también con archivos de más de 50 MB, y siempre fallará. Ya pasaba con los vídeos subidos.
  - Si ese nombre sin sufijo ya se usó antes con el mismo vídeo, la nube rechaza la subida (hipótesis).
  - En el panel, «Volver a sincronizar» sin copia dice «Vincula tu copia primero», pero no dice dónde: el panel no tiene esa opción.
- **Impacto:** clips descuadrados en silencio, y un cambio del archivo de todo el grupo sin la confirmación que exige F1 («Reemplazarlo pide confirmación»).
- **¿Nuevo?** Sí para vídeos de YouTube. El mecanismo ya existía, pero solo para vídeos subidos.
- **Arreglo:**
  - Para vídeos de YouTube, en ese aviso abrir el mismo panel de vinculación, con la comprobación de duración, y guardar la copia solo en el dispositivo.
  - Subir a la nube solo desde el panel, con confirmación y con nombre con sufijo.
  - Ocultar «Subir a la nube» si el archivo pesa más de 50 MB.
  - Cambiar el texto del aviso por algo como «Este archivo solo está en el móvil de quien lo vinculó».
- **Test:** vincular una copia desde el aviso en un vídeo de YouTube no debe cambiar la ruta de la nube del vídeo.

### 🟡 8 · El selector «YouTube | Archivo» mide 32 px y su texto promete funciones que no existen · nota 5

- **Dónde:** `StudioPage.tsx` 402–425 (`StageSwitch` con el tamaño pequeño de `Segmented`, 32 px de alto); `LinkFilePanel.tsx` 136.
- **Problemas:**
  - En el móvil apoyado en el suelo es un control principal y queda por debajo de los 44 px de DESIGN.md.
  - Ocupa una fila más en la zona fija de arriba, lo que quita sitio a los controles en pantallas pequeñas. En la captura a 375 px ya se nota.
  - El texto «El archivo permite superpuesto, zoom y seguimiento», y en el panel «Lo usan el superpuesto, el zoom y el seguimiento», habla de F5, F9 y F10, que aún no existen.
- **¿Nuevo?** Sí.
- **Arreglo:** tamaño normal (o una zona de toque de 44 px) en móvil. Poner el texto de ayuda solo en escritorio o quitarlo. Mientras esas funciones no existan, decir para qué sirve hoy, por ejemplo: «Velocidad sin redondeos y sonido de la canción en las tomas».

### 🟢 9 · Quitar el archivo mientras suena puede perder el momento · nota 4

- **Dónde:** `LinkFilePanel.tsx` 104–114; `StudioPage.tsx` 101–105; `store.ts` 193–198.
- **Flujo:**
  1. Al quitar, la caché del vídeo cambia antes de que el panel llame a `setStage('youtube')`.
  2. Si el efecto del estudio pasa antes a YouTube con su asignación directa, `setStage` ve que ya está en YouTube y no hace nada.
  3. No queda momento pendiente: YouTube empieza en 0 mientras el reloj enseña el momento anterior, hasta que se reproduce.
- **Cuándo:** depende del orden en que React procese las actualizaciones (hipótesis, no reproducido).
- **Impacto:** pequeño. El vídeo se para y cambia a YouTube como se espera; solo se pierde el punto.
- **Arreglo:** el mismo del hallazgo 4. Que todo cambio de escenario pase por `setStage`, y que el efecto del estudio no fuerce el escenario si ya hay uno pendiente.

### 🟢 10 · Con desfase negativo, el principio de YouTube no existe en el archivo y no se avisa · nota 4

- **Dónde:** `engine.ts` (`withOffset`: un salto antes del inicio del archivo se queda en su 0); `store.ts` 200–212 (`attach` no ajusta el momento pendiente a la duración del nuevo motor).
- **Comportamiento:**
  - Con desfase −5, ir al 0:02 deja el archivo en su 0, y el cabezal salta a 0:05.
  - Un clip que empieza en 0:02 se recorta en silencio.
  - Al pasar de YouTube al archivo cerca del final, si el archivo es más corto, el salto cae fuera y el vídeo termina sin más.
- **Impacto:** casos límite (la intro de un MV). No se pierde nada.
- **Arreglo:** mostrar en la línea de tiempo la parte que el archivo no cubre, avisar al aplicar un clip que empieza fuera, y limitar el momento pendiente a la duración del motor nuevo.
- **Test:** `withOffset` con desfase negativo: el salto a 2 deja el archivo en 0 y la hora vale 5. La duración vale la del archivo más 5.

### 🟢 11 · «¿Quién eres?»: «Atrás» sigue con la acción, y un error de carga parece una lista vacía · nota 4

- **Dónde:** `data/members.ts` 138–157 (`askWho`, `closeWho`); `MembersUI.tsx` 341–389.
- **Detalles:**
  - Cerrar la pregunta con el botón «Atrás» de Android o con Esc ejecuta igual la acción pendiente: se abre el grabador o la nota. «Atrás» suele querer decir «cancelar».
  - Si la lista de miembros no carga (sin red o con error), el diálogo enseña directamente el formulario «Soy yo», como si el grupo estuviera vacío, y al guardar falla.
  - `NoteDialog` firma la nota solo si la lista ya ha cargado. Sin lista, la nota queda «Sin nombre» aunque el dispositivo sepa quién es (hipótesis, poco probable porque la lista se pide al abrir la app).
- **Bien:** el grabador se abre después de cerrar la pregunta, nunca debajo. Lo he comprobado con la nota: «Ahora no» → «Nueva nota», con el foco en el texto. La pregunta sale una vez por visita y no vuelve tras «Ahora no».
- **Arreglo:** distinguir entre «cerrar» (cancela) y «Ahora no» o elegir (sigue). Añadir el estado de error con «Reintentar» en el diálogo. Si la lista no ha cargado, firmar con el miembro guardado en el dispositivo.
- **Pendiente de F2:** «si luego se elige nombre, se ofrece asignarle las tomas sin nombre de ese dispositivo». No está, probablemente porque las tomas llegan en otro paso.

### 🟢 12 · Accesibilidad de los controles nuevos · nota 4

- **`WhoButton` se presenta como elemento de menú** (`MembersUI.tsx` 295) también en la barra lateral de escritorio, que no es un menú. Los lectores de pantalla lo anuncian mal y un validador lo marca como error.
- **En «¿Quién eres?», los miembros son una lista convertida en grupo de opciones** (348). Las opciones no se mueven con las flechas, y elegir una cierra el diálogo, que no es lo que se espera de una opción. Mejor botones normales con «(eres tú)» en la elegida. El selector de color tampoco se mueve con las flechas.
- **Los botones de ajuste de la sincronía tienen nombres repetidos:** «−1 s», «+0,1»… en YouTube y en Archivo. Con lector de pantalla no se sabe cuál es cuál. Deberían llevar «YouTube −1 s», «Archivo −1 s», etc.
- **«Añadir archivo»** (`StudioPage.tsx` 267–276) tiene como nombre accesible «Añadir el archivo de este vídeo», que no contiene el texto visible tal cual. El control por voz («pulsa Añadir archivo») puede fallar.
- **«Reintentar» en Miembros** es un enlace de texto de menos de 44 px.

### 🟢 13 · «Probar juntos» y «Volver a sincronizar»: temporizadores sueltos y esperas sin señal · nota 3

- **Dónde:** `LinkFilePanel.tsx` 342–364, 96–102.
- **Detalles:**
  - El arranque a los 400 ms no se cancela. Si se cierra el panel justo después de pulsar, YouTube empieza a sonar con el panel cerrado.
  - Si se cierra durante la prueba, el archivo se para pero YouTube sigue sonando, porque se cancela el temporizador que lo paraba.
  - Pulsar dos veces seguidas acumula arranques.
  - «Volver a sincronizar» espera a la copia o a la nube sin señal de carga.
- **Arreglo:** guardar y cancelar los dos temporizadores al cerrar, pausar el estudio al cerrar en mitad de una prueba, y poner el botón en espera mientras se carga.

### 🟢 14 · Textos · nota 3

- «Desfase (el archivo va por delante si es positivo)»: con desfase positivo, el mismo golpe llega **más tarde** en el archivo (tiene más intro). La mayoría lo entenderá al revés. Mejor algo como «+ = el archivo tiene más intro» o «El golpe llega X s más tarde en el archivo».
- «Hasta 50 MB se sube a la nube… si pesa más, se queda en este móvil» y «Solo en el móvil de quien lo vinculó» también se ven en el portátil, y el segundo también lo ve quien lo vinculó. Mejor «dispositivo», y «Solo en tu dispositivo» cuando sea el propio.
- Ejemplo del campo de nombre: «Como os llamáis en el grupo». Se pregunta a una persona, así que mejor «Como te llaman en el grupo».
- El tamaño sale «2,1 MB» en el panel y «2.1 MB» en «Añadir vídeo» (lo segundo ya estaba).

### ⚪ 15 · Rendimiento · nota 3

- `similarTitles` se calcula en cada render de «Añadir vídeo» con un archivo elegido (`AddVideoDialog.tsx` 88–93). Al escribir el título o el artista, se recorre toda la biblioteca (hasta 500 entradas, dos veces cada una) en cada tecla: unos milisegundos en un móvil. Bastaría con memorizarlo por archivo y biblioteca.
- Un nombre de una sola palabra («boy.mp4») coincide al 100 % con cualquier título que la contenga, porque la medida divide por el título más corto. Pasa poco.
- Al cerrar el panel, la dirección de objeto del archivo de la sincronía se libera la siguiente vez que se abre, no al cerrar. Es poco, porque apunta al archivo en disco.
- Al abrir con «Archivo» recordado, se crea y se destruye un iframe de YouTube (hallazgo 4).
- El reloj de la sincronía refresca el panel 10 veces por segundo mientras suena YouTube. Es aceptable: solo afecta a ese paso, y el resto del panel solo escucha la duración.

### ⚪ 16 · Calidad y patrones · nota 3

- **El escenario se escribe a veces sin pasar por `setStage`** (`StudioPage.tsx` 104): es el origen de los hallazgos 4 y 9. El escenario está en `store.ts`, como pide CLAUDE.md. Pero «recordar el escenario» vive en `StudioPage`, mientras que las demás preferencias del dispositivo (espejo, repetir todo, sonido de la cuenta) viven en `store.ts`. Mejor juntarlas.
- **Un salto mientras el motor nuevo aún no está conectado se pierde:** `seek` cambia el reloj, pero no el momento pendiente, y al conectarse gana el pendiente antiguo.
- `useLinkVideoFile` sube con sufijo, pero `useLinkLocalFile` y `useUploadToCloud` suben sin sufijo también para vídeos de YouTube (hallazgo 7). Conviene una sola forma de nombrar el archivo de un vídeo de YouTube.

### ⚪ 17 · Detalles visuales · nota 2

- Los diálogos de confirmación cambian de texto mientras se cierran. «¿Quitar el archivo?» pasa a «¿Cambiar el archivo?» con el botón «Elegir el nuevo», y «¿Quitar a Ana?» pasa a «¿Quitar a ?». Hay que guardar el último valor durante la salida.
- El sello del miembro coge el primer carácter con un método que parte los emojis (sale «�»).
- El paso «Guardando el archivo…» aparece sin el preset `soft` que usan los demás pasos.

---

## Respuestas a las preguntas del encargo

- **¿El cambio de escenario conserva el momento, el tramo A–B, la velocidad y el espejo?**
  - Sí: comprobado en el modo demo. Con desfase +5, YouTube 0:06,7 ↔ archivo 11,8 s, la velocidad 1,05× y la marca A se mantienen, y el espejo está en el store.
  - Al cambiar se pausa. Es razonable, pero no se reanuda solo.
  - Excepciones: al abrir con «Archivo» recordado (hallazgo 4), al quitar el archivo mientras suena (hallazgo 9) y con un salto hecho mientras carga el otro reproductor (hallazgo 16).
- **¿Clips y notas cuadran con desfase en los dos sentidos?** Sí, en la parte que tienen en común. Positivo comprobado: archivo 8,43 s = 0:03,4. Negativo, por lectura del código: bien, salvo el tramo inicial que el archivo no tiene (hallazgo 10).
- **¿Salto fuera de rango con desfase negativo?** Se queda en el 0 del archivo y el cabezal salta al desfase. No rompe nada, pero no avisa (hallazgo 10).
- **¿Duración mostrada?** En «Archivo», la línea de tiempo usa la duración del archivo en segundos de YouTube, que es lo correcto. El problema es que esa cifra puede guardarse como duración de YouTube (hallazgo 5).
- **¿Segundo dispositivo sin copia?** Con 50 MB o menos, se reproduce desde la nube. Con más, sale el aviso para vincular su copia, con los problemas del hallazgo 7. Si tiene una copia antigua, la usa sin avisar (hallazgo 3).
- **¿Archivo de más de 50 MB?** Se guarda en el móvil y el aviso dice la verdad («Guardado solo en este dispositivo… pesa más de 50 MB»). El botón «Subir a la nube» del escenario sale igual y siempre fallará (hallazgo 7).
- **¿Quitar el archivo mientras suena?** El estudio para y vuelve a YouTube. El mensaje sale solo tras guardar. Puede perderse el momento (hallazgo 9).
- **¿Volver atrás o recargar con `state.linkFile`?** Bien. Comprobado en el demo:
  - el estado se limpia al llegar;
  - «Atrás» cierra el panel;
  - otro «Atrás» vuelve a la biblioteca;
  - «Adelante» y recargar no reabren el panel.

  Si se cierra el panel, hay que elegir el archivo otra vez, lo que es aceptable. No he probado Firefox ni Safari con un `File` en el historial.
- **¿`askWho` y el grabador?** El diálogo nunca queda debajo: el grabador se abre al cerrarse la pregunta, y la acción sigue con cualquier respuesta. Detalle de «Atrás» en el hallazgo 11.
- **Mensajes solo tras éxito real:** sí en vincular, quitar, sincronizar, miembros y notas. No en «La duración coincide» (hallazgo 6).
- **Cachés:** la lista de la biblioteca se actualiza con el nombre del archivo al vincular y al quitar (comprobado: aparece «con archivo»). Los miembros se actualizan en la caché tras crear, editar y quitar. Los otros dispositivos lo ven cuando vuelven a pedir los datos.
- **¿Estado de reproductor fuera de `store.ts`?** El escenario y el momento pendiente están en `store.ts`. Pero `StudioPage` escribe el escenario directamente y guarda la preferencia por su cuenta (hallazgo 16). Los motores no guardan estado de interfaz.
- **Diseño:**
  - Los colores salen de tokens que existen en `index.css`.
  - Los movimientos usan `jelly`, `soft` y `snappy`, y el movimiento reducido lo cubre `MotionConfig`.
  - Fallan los 44 px del selector (hallazgo 8) y del enlace «Reintentar».
  - La etiqueta «con archivo» encaja con la tarjeta.

## Tests que faltan

- `withOffset` con un motor falso:
  - desfase positivo y negativo;
  - salto antes del inicio;
  - duración;
  - sin desfase devuelve el mismo motor.
- Store:
  - `setStage` guarda el momento y pausa;
  - `attach` salta al momento pendiente y lo limpia;
  - un salto sin motor actualiza el pendiente (hallazgo 16);
  - restaurar «Archivo» al abrir empieza en el 0 de YouTube (hallazgo 4).
- `durationMismatch` con tres resultados (coincide, no coincide, no se sabe), y el texto del panel para cada uno.
- `similarTitles`: nombre de una sola palabra, títulos solo en coreano, artista sin título, biblioteca vacía.
- `askWho` y `closeWho`: con nombre elegido o «Ahora no» la acción va directa; la pregunta sale una sola vez por visita; cerrar sigue con la acción (o cancela, si se cambia el hallazgo 11).
- `currentMemberId` con un miembro quitado.
- `readStage` y `rememberStage` con almacenamiento roto, y borrado al quitar el archivo.
- Uso de la copia local solo si coincide en nombre y tamaño (hallazgo 3).
- e2e en el modo demo:
  - «Añadir vídeo» → sugerencia → vincular → sincronizar → cambiar de escenario;
  - un clip suena en el mismo punto en los dos escenarios;
  - «Cambiar archivo» cancelado no quita nada (hallazgo 2);
  - resincronizar desde «Archivo» (hallazgo 1).

## Comprobaciones hechas

- He leído el diff completo del alcance y los ficheros enteros de `LinkFilePanel`, `store`, `FileStage`, `members`, `MembersUI` y las partes tocadas de `StudioPage`, `videos.ts` y `useBackToClose`.
- `pnpm test`: 82 tests de `shared` (incluidos los nuevos de `linking`) y 15 de `web`, todos pasan.
- `pnpm typecheck` en el árbol de trabajo falla en `RecordStudio.tsx`, pero por cambios en curso de otro paso, no de este commit. He pasado el compilador sobre una copia exacta de `9ad9fd7` (fuera del repo) y no da errores.
- En el modo demo (`localhost:5174`), con una entrada de YouTube y un archivo vinculado creados a mano en el almacenamiento del demo:
  - el arranque en tiempo negativo (hallazgo 4);
  - el panel de sincronía moviendo el archivo (hallazgo 1);
  - la duración guardada mal (hallazgo 5);
  - el falso «La duración coincide» (hallazgo 6);
  - el cambio de escenario conserva el momento y la velocidad;
  - la sugerencia de parecidos con un nombre «NewJeans (뉴진스) Hype Boy Dance Practice.webm»;
  - la llegada al estudio con el archivo, y el comportamiento con atrás y adelante;
  - «¿Quién eres?» → «Ahora no» → «Nueva nota» con el foco correcto;
  - la sección Miembros vacía en Ajustes.

  Al terminar he dejado los datos del demo como estaban.

## Limitaciones

- **Sin Supabase real:** en el demo la subida a la nube siempre falla, así que no he probado la ruta con sufijo, la firma de enlaces ni las respuestas de la base de datos (bloqueo de ruta, nombres repetidos).
- **Sin dispositivo:**
  - si el selector de archivos se abre tras la espera de «Cambiar archivo» en Chrome Android y Safari;
  - lectura de duración de archivos grandes;
  - «Probar juntos» con los dos sonidos a la vez en un móvil.
- **Sin audio de YouTube en el demo:** no he podido comprobar de oído que «Probar juntos» suene en sincronía tras guardar.
- **No he revisado** la migración, las políticas ni `plan_fase1_checks.sql` (lado servidor).
