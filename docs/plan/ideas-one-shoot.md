# One Shoot · Funcionalidades nuevas

**Fecha:** 13-10-2026
**Objetivo:** que los ensayos del grupo de covers sean más ágiles y eficientes, sobre todo gracias a la **grabación**, y facilitar la vida del grupo: elegir canciones, sortear y montar *random play dance*.
**Estado:** propuesta funcional. No hay nada implementado.

---

## Índice

1. [Resumen](#1-resumen)
2. [Contexto: qué hay en el mercado](#2-contexto-qué-hay-en-el-mercado)
3. [Funcionalidades de grabación](#3-funcionalidades-de-grabación)
   - [F1 · Archivo vinculado al vídeo de YouTube](#f1--archivo-vinculado-al-vídeo-de-youtube)
   - [F2 · Quién es quién (opcional)](#f2--quién-es-quién-opcional)
   - [F3 · Guardar, descargar y borrar tomas](#f3--guardar-descargar-y-borrar-tomas)
   - [F4 · Mejor toma](#f4--mejor-toma)
   - [F5 · Repaso: apilado o superpuesto](#f5--repaso-apilado-o-superpuesto)
   - [F6 · Notas sobre la toma](#f6--notas-sobre-la-toma)
   - [F7 · Empezar a grabar con un aplauso](#f7--empezar-a-grabar-con-un-aplauso)
   - [F8 · Clips dentro de las tomas](#f8--clips-dentro-de-las-tomas)
   - [F9 · Zoom sobre el vídeo](#f9--zoom-sobre-el-vídeo)
   - [F10 · Seguir a un bailarín](#f10--seguir-a-un-bailarín)
4. [Funcionalidades de grupo](#4-funcionalidades-de-grupo)
   - [F11 · Propuestas y votación de la próxima cover](#f11--propuestas-y-votación-de-la-próxima-cover)
   - [F12 · Lista de deseos](#f12--lista-de-deseos)
   - [F13 · Bolsas para sortear](#f13--bolsas-para-sortear)
   - [F14 · Random Play Dance y pistas guardadas](#f14--random-play-dance-y-pistas-guardadas)
   - [F15 · Reacciones en las tomas compartidas](#f15--reacciones-en-las-tomas-compartidas)
   - [F16 · Cuenta atrás al próximo evento](#f16--cuenta-atrás-al-próximo-evento)
5. [Mejora futura: análisis de postura con IA](#5-mejora-futura-análisis-de-postura-con-ia)
6. [Orden de implementación](#6-orden-de-implementación)
7. [Límites técnicos](#7-límites-técnicos)
8. [Descartado](#8-descartado)
9. [Fuentes](#9-fuentes)

---

## 1. Resumen

| ID | Funcionalidad | Qué aporta | Necesita archivo | Viabilidad | Fase |
| --- | --- | --- | --- | --- | --- |
| **F1** | Archivo vinculado al vídeo de YouTube | El mismo vídeo con su archivo, sin duplicar la entrada | — | Alta | 1 |
| **F2** | Quién es quién (opcional) | Saber de quién es cada toma y para quién cada nota | No | Alta | 1 |
| **F3** | Guardar, descargar y borrar tomas | Las tomas se quedan en la app, solo las que se quieran | No | Alta | 2 |
| **F4** | Mejor toma | Marcar la buena de cada tramo | No | Alta | 2 |
| **F5** | Repaso apilado o superpuesto | Comparar la toma con el original, sincronizados | Solo para superpuesto | Alta | 3 |
| **F6** | Notas sobre la toma | Señalar qué se hace mal y en qué momento | No | Alta | 3 |
| **F7** | Empezar a grabar con un aplauso | Grabar sin ir hasta el móvil | No | Alta | 4 |
| **F8** | Clips dentro de las tomas | Repasar la toma por tramos | No | Alta | 4 |
| **F9** | Zoom sobre el vídeo | Ver de cerca pies, manos o a una persona | Recomendado | Alta | 4 |
| **F10** | Seguir a un bailarín | Zoom automático que sigue a un miembro | Sí | Media | 5 |
| **F11** | Propuestas y votación | Elegir entre todos la próxima cover | No | Alta | B2 |
| **F12** | Lista de deseos | Canciones que os gustaría hacer, con «me apunto» | No | Alta | B2 |
| **F13** | Bolsas para sortear | Sortear canciones, estribillos o personas | No | Alta | B1 |
| **F14** | Random Play Dance y pistas | Estribillos encadenados al azar, guardables y editables | Recomendado | Media-alta | B1 |
| **F15** | Reacciones en tomas | Emojis en las tomas compartidas | No | Alta | B3 |
| **F16** | Cuenta atrás al evento | Fecha del próximo evento y su repertorio | No | Alta | B3 |
| **IA** | Análisis de postura | Dónde y en qué parte del cuerpo se falla | Sí | Media-baja | Futura |

Las fases numéricas (1–5) son de la **línea de grabación** y las B1–B3 de la **línea de grupo**, que puede avanzar en paralelo (ver 6).

**Antes de todo (fase 0):** arreglar los dos fallos graves de la grabación detectados en la revisión de código:
- el bucle infinito al parar la grabación;
- la rotura al cambiar de lente mientras se graba.

---

## 2. Contexto: qué hay en el mercado

- **Apps de práctica individual:** Dance.io, LeapNow, SyncStep, Move Mirror, FYP Dance, SyncMirror.
  - Todas tienen espejo, velocidad y bucle A–B, igual que One Shoot.
  - Las mejores permiten **guardar tu toma y compararla con el original**, lado a lado o superpuesta.
  - Varias añaden IA, normalmente de pago.
  - Casi todas son solo de Apple.
- **Su gran problema es sincronizar** tu vídeo con el original: alinean por el audio y luego hay que ajustar a mano.
- **Ventajas de One Shoot:**
  - **Sincronización gratis:** al grabar, la app sabe en qué segundo de la canción empezó la toma, a qué velocidad y con qué espejo.
  - **Biblioteca compartida** por el grupo.
  - **Funciona en cualquier móvil** y es gratuita.

---

## 3. Funcionalidades de grabación

### F1 · Archivo vinculado al vídeo de YouTube

> **Es la base de todo lo demás.** Superpuesto, seguir a un bailarín e IA necesitan ver la imagen del vídeo, y con el reproductor de YouTube no se puede.

**Problema**
- Con el reproductor de YouTube la app no puede leer la imagen, y sus normas restringen taparlo o modificarlo.
- Hoy, si el grupo sube el archivo descargado de ese vídeo, se crea **otra entrada en la biblioteca, vacía**: sin clips, ni notas, ni nada de la entrada de YouTube.

**Cómo funciona**
1. En el estudio de un vídeo de YouTube, botón **«Añadir el archivo de este vídeo»**.
2. El archivo queda **vinculado a la misma entrada**: mismo vídeo, mismo título, mismos clips, notas y tomas.
3. **Dónde se guarda el archivo:** igual que las subidas actuales.
   - Si pesa 50 MB o menos, se sube a la nube y lo tiene todo el grupo.
   - Si pesa más, se queda en ese dispositivo, y los demás pueden **vincular su propia copia**, con el mecanismo que ya existe.
4. **Sincronizar con YouTube (una sola vez):**
   - Se marca **el mismo momento** en los dos, por ejemplo el primer golpe de la canción.
   - Un control fino ajusta hasta que coinciden.
   - Se guarda el **desfase**, y los clips, notas y tomas se trasladan solos al archivo.
   - No puede hacerse automáticamente porque no se puede leer el audio de YouTube.
5. **Comprobación de duración:** si el archivo dura más de 1 s más o menos que el vídeo de YouTube, la app avisa de que puede ser otra versión. Esto corrige también un fallo de la revisión: hoy se puede vincular un archivo distinto sin aviso.
6. **Selector «YouTube | Archivo»** en el estudio.
   - Por defecto, YouTube.
   - Las funciones que necesitan la imagen usan el archivo automáticamente. Si no lo hay, explican cómo añadirlo.

**Evitar entradas duplicadas**
- Al subir un archivo desde «Añadir vídeo», la app pregunta si es de un vídeo que ya está en la biblioteca y sugiere los parecidos por título. Si se elige uno, se vincula a él.
- La tarjeta de la biblioteca muestra el indicador **«con archivo»**.

**Reglas**
- **Quitar el archivo** deja el vídeo solo con YouTube. No borra clips, notas ni tomas.
- **Archivar el vídeo** archiva también su archivo, sin borrarlo.
- **Un archivo en la nube por vídeo.** Reemplazarlo pide confirmación, porque cambia la sincronía de todos.
- La app **no descarga nada de YouTube**: cada uno consigue el archivo por su cuenta.

**Viabilidad:** alta. La base de datos ya permite que un vídeo tenga a la vez enlace de YouTube y archivo; falta guardar el desfase.

---

### F2 · Quién es quién (opcional)

**Para qué:** saber de quién es una toma y para quién es una nota, sin volver a poner login.

**Cómo funciona**
- **Lista de miembros del grupo,** editable, con nombre y color.
- **«¿Quién eres?»:**
  - No se pregunta al abrir la app.
  - Sale como sugerencia la primera vez que alguien graba o escribe una nota, con el botón **«Ahora no»**.
  - Se puede elegir o cambiar desde el menú.
- **Sin nombre elegido:**
  - Todo funciona igual. Las tomas y notas quedan como **«Sin nombre»**; solo se pierde el filtro «mis tomas / mis notas».
  - Si luego se elige nombre, se ofrece asignarle las tomas sin nombre de ese dispositivo.

**Dónde se guarda**

| Qué | Dónde | Detalle |
| --- | --- | --- |
| Lista de miembros | Base de datos | Compartida por todo el grupo |
| Nombre elegido | Navegador de cada dispositivo | Se mantiene al cerrar la app y al reiniciar. Es por dispositivo y navegador (en iPhone, la app instalada y Safari van por separado). Se pierde si se borran los datos del navegador o en modo privado |
| Autor de tomas y notas | Con cada toma o nota | No se pierde aunque el dispositivo olvide quién eras |

**Límite:** es una identificación de confianza, no de seguridad. Para un grupo cerrado es suficiente.

---

### F3 · Guardar, descargar y borrar tomas

**Problema:** hoy la toma solo se puede mandar a la galería o compartir. Se pierde la relación con la canción y no se puede comparar después.

**Al terminar cada toma**

| Opción | Qué hace |
| --- | --- |
| **Guardar** | Queda en la app, en la pestaña **«Tomas»** del estudio |
| **Descargar** | Se guarda en el móvil o el ordenador (galería o Descargas) |
| **Descartar** | No se guarda nada |

- Se puede guardar y descargar a la vez.
- **Nada se guarda solo:** si se cierra el grabador sin elegir, la app pregunta antes de perder la toma.

**Qué recuerda cada toma guardada:**
- la canción;
- el **segundo de la canción en que empezó**;
- el tramo o clip grabado;
- la **velocidad** y el **espejo**;
- **quién** la grabó (F2);
- fecha y duración.

**Pestaña «Tomas»**
- **Filtros** por persona, clip y fecha.
- **Descargar** cualquier toma en cualquier momento.
- **Borrar** las que no se quieran. Las tomas se borran de verdad; los vídeos de la biblioteca, en cambio, se archivan.
- **Mejor toma** marcada con estrella (F4).

**Dónde se guardan**
- **Por defecto, en el dispositivo:** no gasta espacio en la nube.
- **«Compartir con el grupo»** (opcional, por toma):
  - **Calidad:** se sube reducida (720p, unos 15 MB por minuto) para caber en el límite de 50 MB. Esa versión es la que se descarga; la original sigue en el móvil de quien la grabó.
  - **Espacio:** el plan gratuito tiene 1 GB y no hay caducidades automáticas. La pestaña muestra cuánto ocupan las tomas compartidas y avisa al acercarse al límite.
  - **Borrarla** la quita de la nube. Solo puede hacerlo quien la grabó o el dispositivo donde está.

**Viabilidad:** alta.

---

### F4 · Mejor toma

- **Una estrella** en la pestaña «Tomas» para marcar **la buena** de cada tramo o canción. Puede haber una por persona.
- **Efectos:**
  - el repaso la abre por defecto;
  - aparece la primera en la lista;
  - al hacer limpieza es fácil borrar todo lo que no tenga estrella.

**Viabilidad:** alta.

---

### F5 · Repaso: apilado o superpuesto

**Para qué:** comparar la toma con el original para detectar los fallos.

**Selector arriba del repaso:** **«Apilado» | «Superpuesto»**.

**Controles comunes:** reproducir y pausar, velocidad, tramo A–B y avanzar fotograma a fotograma.

| | Apilado (uno encima de otro) | Superpuesto (transparente) |
| --- | --- | --- |
| **Cómo se ve** | En vertical, original arriba y toma abajo. En horizontal o en el portátil, lado a lado | La toma a pantalla completa y el original encima, semitransparente (o al revés) |
| **Ajustes** | Cambiar el orden y el tamaño de cada uno | Deslizador de transparencia (0–100 %). Mover y escalar con dos dedos hasta que los cuerpos coincidan; ese encaje se guarda con la toma |
| **Con YouTube** | Sí | No: usa el archivo vinculado (F1) |
| **Con archivo** | Sí | Sí |
| **Combina con** | Zoom (F9) | Zoom (F9) y seguir a un bailarín (F10) |

**Sincronización**
- Cada momento de la toma corresponde a un momento exacto de la canción: el inicio guardado más el tiempo de la toma, ajustado por la velocidad.
- **Si se grabó a 0,75×,** el original va también a 0,75×.
- Si el original es el archivo vinculado, se aplica además su desfase (F1).
- **Ajuste fino** de ±0,3 s, por el pequeño retraso de cámara y sonido del móvil. Se guarda con la toma.
- **Espejo:** la toma se guarda sin espejo. Un botón invierte la toma o el original para que miren igual.

**Viabilidad:** alta.

---

### F6 · Notas sobre la toma

**Para qué:** dejar indicado qué se está haciendo mal y en qué momento.

**Cómo funciona**
1. En el repaso, pausar en el fallo y pulsar **«Nota»** (o la tecla N).
2. La nota tiene:
   - **momento**: se toma solo;
   - **texto**;
   - **categoría** opcional: tiempo, brazos, piernas, dirección o mirada, espacio, expresión, energía;
   - **para quién**: por defecto, quien grabó la toma.
3. **Dibujar sobre el fotograma** (opcional): un círculo o una flecha. Se guarda una imagen pequeña con la nota.
4. Las notas salen como puntos en la ola de la toma y aparecen al reproducir.
5. **Estado:** «pendiente» o «resuelta».

**Reglas**
- Las notas de una toma se ven también en la canción, en ese momento, para su destinatario.
- Aunque la toma solo esté en un dispositivo, las notas, que son texto, se comparten.

**Viabilidad:** alta. Amplía las notas que ya existen.

---

### F7 · Empezar a grabar con un aplauso

**Problema:** el móvil está en el suelo o en un trípode, y hay que ir hasta él para pulsar Grabar.

**Cómo funciona**
1. Se pulsa **«Armar»**. La pantalla muestra en grande «Esperando señal…» y el nivel de sonido.
2. La persona se coloca y da un **doble aplauso**. Es doble para que un ruido suelto no lo dispare.
3. Suena la cuenta atrás y arrancan a la vez la canción y la grabación.
4. **La toma se para sola** al final del tramo o de la canción, como ahora.
5. Se elige qué hacer con la toma (F3) y aparece la opción **«Armar otra vez»**.

**Señales posibles**

| Señal | Valoración |
| --- | --- |
| **Doble aplauso** (dos picos de volumen separados entre 0,2 y 0,8 s) | **La elegida:** sencilla y fiable, con ajuste de sensibilidad para locales con eco |
| **Mano arriba** (brazo levantado unos segundos) | Vistosa, pero usa el modelo de postura. Segunda fase |
| **Voz («¡vamos!»)** | Poco fiable en iPhone. No recomendada |

**Reglas**
- **El aplauso solo sirve para empezar:** con la música sonando, el micrófono oye los altavoces.
- **Para parar:** el final automático o el botón.
- **Canciones de archivo:** hoy no piden el micrófono; al elegir «aplauso» habrá que pedirlo.
- **Tiempo límite:** si no llega la señal en unos minutos, se desarma solo.

**Viabilidad:** alta.

---

### F8 · Clips dentro de las tomas

- **Los clips de la canción sirven en la toma:** se elige uno y se hace el bucle A–B en la toma y en el original a la vez.
- **Marcar un tramo nuevo** en la toma lo crea como clip de la canción, para que sirva en todas las tomas y en la práctica.

**Viabilidad:** alta, gracias a la sincronización de F3 y F5.

---

### F9 · Zoom sobre el vídeo

- **Cómo:** ampliar con dos dedos, o con la rueda del ratón, una zona del vídeo, en la práctica y en el repaso. Por ejemplo, los pies en un paso rápido.
- **Doble toque** para volver al vídeo completo.
- **Guardar con un clip:** al abrir el clip, se ve ampliado.
- **Espejo:** el zoom se invierte con el vídeo.
- **Con archivo vinculado:** sin problemas.
- **Con YouTube:** se haría ampliando el reproductor, como ya se hace con el espejo, pero sus normas restringen modificar su aspecto. Es más seguro usar el archivo (F1).

**Viabilidad:** alta.

---

### F10 · Seguir a un bailarín

**Para qué:** en un *dance practice* con todo el grupo, centrarse en un miembro aunque cambie de posición en la formación.

**Cómo funciona**
1. Pausar, tocar al bailarín (o dibujar un recuadro sobre él) y pulsar **«Seguir»**.
2. La app analiza el vídeo **una sola vez** y calcula dónde está ese bailarín en cada momento, mostrando el progreso.
3. El recorrido se **guarda en la base de datos**, compartido. El resto del grupo lo usa sin repetir el cálculo, y cada uno elige a quién seguir.
4. **Un clip puede guardarse «siguiendo a X»:** al abrirlo, sale ampliado sobre ese bailarín.
5. **Corrección manual:** si en un cruce el seguimiento salta a otra persona, se pausa ahí, se toca al bailarín correcto y la app recalcula desde ese punto.
6. **En el superpuesto (F5):** se sigue al bailarín del original para encajarlo con la persona de la toma.

**Requisito:** el **archivo vinculado** (F1), porque hay que leer la imagen.
- Sin archivo, queda un **modo manual**: colocar el recuadro en varios momentos y la app mueve el zoom suavemente entre ellos.
- Sobre YouTube tiene el mismo riesgo con sus normas que el zoom.

**Modelos**

| | Modelo | Por qué |
| --- | --- | --- |
| **Principal** | **MoveNet MultiPose** (Google, gratuito, Apache 2.0) | Detecta hasta 6 personas y trae un seguidor que mantiene la identidad de cada una. Ligero y funciona en el navegador |
| **Plan B** | **EdgeTAM** (Meta, Apache 2.0 según Hugging Face) | Sigue cualquier cosa que se toque y es muy bueno con los cruces. Pero pesa unos 57 MB y solo está probado en app nativa de iPhone (unos 16 fotogramas por segundo en un iPhone 15 Pro Max), no en navegador |

**Viabilidad:** media. Se empieza por la prueba rápida del apartado 5.5, que sirve también para la IA.

---

## 4. Funcionalidades de grupo

Ideas para la vida del grupo, más allá de la práctica: elegir canciones, sortear y montar *random play dance*. Son **independientes de la grabación**, así que pueden hacerse en paralelo (ver el apartado 6).

### F11 · Propuestas y votación de la próxima cover

**Para qué:** decidir entre todos la siguiente coreografía sin perderse en el chat.

**Proponer**
- Cualquiera añade una canción candidata **pegando el enlace de YouTube**. Se guardan solos el título, el grupo y la miniatura.
- Datos opcionales:
  - número de miembros del grupo original;
  - dificultad orientativa (fácil, media, difícil);
  - un comentario, por ejemplo «ideal para el evento de diciembre».
- Las propuestas viven en la **lista de deseos** (F12) hasta que entran en una votación.

**Crear una votación**
1. Elegir qué candidatas entran.
2. Fecha y hora de cierre, por ejemplo el domingo a las 22:00. También se puede cerrar a mano.
3. **Tipo de voto:**

| Tipo | Cómo se vota | Cómo se gana |
| --- | --- | --- |
| **Un voto** | Cada persona elige una | La más votada |
| **Varios votos** | Cada persona marca todas las que le valen | La que más marcas tiene |
| **Ranking** | Cada persona ordena sus favoritas | La que más puntos suma (1.ª = más puntos) |

4. **Resultados:** visibles en directo o solo al cerrar.
5. **Votos:** con nombre o anónimos.

**Al cerrar**
- Se muestra la ganadora con un botón **«Añadir a la biblioteca»**, que la pasa directamente sin volver a pegar el enlace.
- **Empate:** desempate con un sorteo entre las empatadas (usando las bolsas de F13) o una segunda vuelta solo con ellas.
- Las que no ganan **vuelven a la lista de deseos**, conservando sus votos como referencia.
- La ganadora puede meterse además en la bolsa «Próxima coreo» (F13) si se prefiere decidir por sorteo.

**Reglas**
- **Cambiar el voto:** se puede hasta que la votación cierre.
- **Requisito:** necesita quién es quién (F2). Como no hay login, «un voto por persona» se basa en la confianza; alguien podría votar dos veces cambiando de nombre en otro dispositivo.

**Viabilidad:** alta.

---

### F12 · Lista de deseos

- **Qué es:** una lista permanente de **«canciones que nos gustaría hacer»**, con las propuestas de F11.
- **«Me apunto»:** cada persona puede marcarlo en las que le interesan, y la lista se ordena por interés.
- **Desde aquí se puede:**
  - crear una votación con las elegidas (F11);
  - meter canciones en una bolsa (F13);
  - añadir directamente a la biblioteca.
- **Al pasar a la biblioteca,** la canción sale de la lista de deseos.

**Viabilidad:** alta.

---

### F13 · Bolsas para sortear

**Para qué:** sortear canciones, estribillos o personas, como ya hacéis con los estribillos al azar.

**Tipos de contenido**

| Contenido | Ejemplos de bolsa |
| --- | --- |
| **Canciones** de la biblioteca o de la lista de deseos | «Próxima coreo», «Candidatas del evento» |
| **Clips** (estribillos o tramos) | «Estribillos para calentar», «Estribillos dominados» |
| **Personas** del grupo (F2) | «Quién dirige el calentamiento», «Quién elige canción», «Quién va al centro» |

**Comportamiento al sacar**

Cada bolsa tiene un modo por defecto, que se elige al crearla:

| Modo | Qué pasa al sacar | Ejemplo |
| --- | --- | --- |
| **Se queda** | El elemento vuelve a la bolsa y puede volver a salir | «Estribillos para calentar», que está siempre |
| **Se quita** | El elemento sale de la bolsa hasta rellenarla | «Próxima coreo», porque la que sale ya se aprende |

- **Al sacar** se puede cambiar puntualmente con dos botones: **«Quitar de la bolsa»** o **«Devolver»**. El botón resaltado es el del modo por defecto.
- **Sin repetir seguidas:** en las bolsas que «se quedan», opción de no repetir el mismo elemento dos veces seguidas.
- **Rellenar:** devuelve a la bolsa todo lo que se quitó.

**Cómo se usa**
1. Entrar en la bolsa y pulsar **«Sacar»**, con una animación corta de sorteo.
2. Sale el elemento:
   - una **canción** se abre en el estudio con un toque;
   - un **clip** se reproduce directamente en bucle;
   - una **persona** se muestra con su nombre y color.
3. **Sacar varios a la vez,** por ejemplo 3 estribillos, crea directamente una pista de *random play dance* (F14).

**Gestionar bolsas**
- Crear, renombrar y borrar bolsas. Son **compartidas** por el grupo.
- Añadir y quitar elementos a mano. Desde la biblioteca, el estudio o un clip, opción **«Añadir a una bolsa»**.
- **Historial** de cada bolsa: qué salió, cuándo y si se quitó. Por ejemplo: «martes 14: salió *Hype Boy* (quitada)».
- Si un vídeo o clip se archiva, desaparece de las bolsas sin romperlas.

**Viabilidad:** alta.

---

### F14 · Random Play Dance y pistas guardadas

**Para qué:** encadenar estribillos al azar para calentar o jugar, como un *random play dance* de K-pop, y poder guardar y retocar esa secuencia.

**Crear una ronda aleatoria**
1. Elegir de dónde salen los clips:
   - una bolsa de clips (F13);
   - una selección hecha a mano;
   - todos los clips de las canciones que se elijan.
2. Opciones:
   - número de clips;
   - pausa entre clips (0–5 s);
   - cuenta atrás antes de cada uno;
   - si se respetan el **espejo y la velocidad** guardados en cada clip;
   - mostrar el título antes o después de que empiece a sonar (modo adivinar).
3. La app los ordena al azar y muestra la lista.

**Reproducir**
- **Pantalla pensada para verse de lejos,** en el portátil o la tele del local:
  - título de la canción en grande;
  - cuenta atrás;
  - el clip;
  - el siguiente.
- **Controles:** pausa, repetir el clip, saltar al siguiente y terminar.

**Guardar como pista**
- Cualquier ronda se puede **guardar como pista** con nombre, por ejemplo «Calentamiento martes» o «RPD del showcase».
- **Editar una pista:**
  - **cambiar el orden** de los clips arrastrándolos;
  - **añadir clips** desde la biblioteca o desde una bolsa;
  - **quitar clips**;
  - cambiar las opciones de pausa, cuenta atrás y espejo/velocidad.
- **Volver a mezclar:** crea un orden aleatorio nuevo a partir de la misma pista, sin perder el guardado. Se puede guardar encima o como una pista nueva.
- **Compartidas:** las pistas son del grupo; cualquiera puede reproducirlas.
- Si un clip de la pista se archiva, aparece como «no disponible» y se salta al reproducir.

**Limitación con YouTube**
- **Cambio entre canciones:** cada clip de YouTube tiene que cargar su vídeo, lo que puede tardar 1–2 s. La pausa entre clips lo disimula, y se puede **ir cargando el siguiente** por detrás mientras suena el actual.
- **Anuncios:** los vídeos de YouTube con anuncios pueden mostrar uno al cargar y cortar el ritmo. Con el **archivo vinculado** (F1) no hay anuncios ni esperas, así que es lo recomendable para las pistas que se usan a menudo.

**Viabilidad:** media-alta. Reutiliza los clips y el reproductor actuales.

---

### F15 · Reacciones en las tomas compartidas

- **Qué:** emojis rápidos (🔥 👏 💯 😂) sobre las tomas que alguien comparte con el grupo (F3). Sin hilos de comentarios: para corregir están las notas (F6).
- **Cómo se ve:** cada persona ve en sus tomas quién ha reaccionado, si eligió nombre (F2).
- **Requisito:** tomas compartidas (F3).
- **Privacidad:** las tomas compartidas son vídeos personales. Hoy cualquiera con la URL de la app puede ver lo que hay en la nube, así que conviene reforzar el acceso (ver el apartado 7) antes de animar a compartir tomas.

**Viabilidad:** alta.

---

### F16 · Cuenta atrás al próximo evento

- **Qué:** un evento con nombre, fecha y lugar (por ejemplo, «Showcase de diciembre») y su **cuenta atrás en la portada**: «Faltan 12 días».
- **Repertorio del evento:** la lista de canciones que se van a bailar, con acceso directo a cada una.
- **Conexiones:**
  - se puede crear una bolsa «Candidatas del evento» (F13);
  - se puede crear una pista con los estribillos del repertorio (F14).
- **Varios eventos:** en la portada sale el más cercano.
- **Al pasar la fecha:** se archiva solo.

**Viabilidad:** alta.

---

## 5. Mejora futura: análisis de postura con IA

> **Estado:** anotada para el final, cuando todo lo anterior esté hecho.

### 5.1 Dónde se usaría

Sobre las **tomas** comparadas con el **archivo vinculado** del original (F1).
- Con el original solo en YouTube no funciona, porque no se puede leer su imagen.
- **Alternativa:** comparar con la mejor toma de un compañero (F4), que siempre es un archivo propio.

### 5.2 Cómo funcionaría

1. **Después de grabar,** no en directo: la app recorre la toma y el original y saca los puntos del cuerpo en cada momento (hombros, codos, muñecas, caderas, rodillas, tobillos…).
2. **Sincronía:** ya se conoce (inicio de la toma y desfase del archivo), así que se sabe qué momento del original corresponde a cada momento de la toma.
3. **Se comparan ángulos** (codo, rodilla, brazo respecto al tronco…), no posiciones. Así da igual la altura de cada uno o la distancia a la cámara.
4. **Adelantado o atrasado:** se calcula con DTW, un método clásico y gratuito que alinea dos secuencias en el tiempo.
5. **Todo en el dispositivo:** sin servidores, sin coste por uso y sin que los vídeos salgan del móvil.

### 5.3 Qué daría

- **Esqueleto** dibujado sobre la toma y el original.
- **Franja de colores sobre la ola** (verde, amarillo, rojo) con dónde hay más diferencia.
- **«Ir al peor momento»**, con un bucle A–B alrededor.
- **Detalle por partes del cuerpo:** «los brazos van bien, las piernas no».
- **Adelantado o atrasado** respecto al original.

### 5.4 Modelos gratuitos o de código abierto

| Modelo | De quién | Licencia | Qué hace | En el navegador | Valoración |
| --- | --- | --- | --- | --- | --- |
| **MediaPipe Pose Landmarker** | Google | Apache 2.0 (código) | 33 puntos, incluidos manos y pies; varias personas | Sí, con guía oficial | **El mejor para comparar tomas.** Versiones lite (≈ 5,5 MB), full (≈ 9 MB) y heavy (≈ 29 MB); tamaños de fuente no oficial |
| **MoveNet** (Lightning / Thunder / MultiPose) | Google (TensorFlow.js) | Apache 2.0 | 17 puntos; MultiPose detecta y sigue hasta 6 personas | Sí | **El mejor para varios bailarines y para F10.** Sin manos ni pies |
| **RTMPose / RTMO** | OpenMMLab | Apache 2.0 | Muy preciso; RTMO detecta varias personas de una vez | Sí, convertido a ONNX, con más trabajo | El más preciso de los ligeros. Lo usa el proyecto abierto «Just Dance», que compara profesor y alumno |
| **ViTPose** | Investigación (Hugging Face) | Apache 2.0 | Muy preciso | Sí, pero pesado (desde ≈ 57 MB) | Mejor en portátil; necesita un detector de personas aparte |
| **YOLO11-pose** | Ultralytics | **AGPL-3.0** | Varias personas con seguimiento | Sí, convertido a ONNX | Bueno, pero la licencia obliga a publicar el código de la app |
| **EdgeTAM** | Meta | Apache 2.0 (según Hugging Face) | Sigue cualquier objeto o persona | Sin pruebas en navegador | Solo seguimiento. Plan B de F10 |
| ~~OpenPose~~ | CMU | Solo uso no comercial | — | — | Antiguo. Descartado |

**Motores para ejecutarlos en el navegador** (gratuitos):
- **TensorFlow.js** (Apache 2.0).
- **ONNX Runtime Web** (MIT). Puede usar la tarjeta gráfica (WebGPU) en Chrome de escritorio y Safari reciente. En móviles el soporte es irregular y usa el procesador, más lento.

**Combinación recomendada**

| Uso | Modelo |
| --- | --- |
| Seguir a un bailarín (F10) y originales con varios miembros | MoveNet MultiPose |
| Comparar tomas con detalle | MediaPipe Pose Landmarker (lite) |
| Si la precisión se queda corta | RTMPose |

### 5.5 Pasos

| Paso | Qué | Duración orientativa |
| --- | --- | --- |
| **1. Prueba rápida** | Esqueleto con MoveNet y MediaPipe sobre una toma y un *dance practice*; medir tiempos en 2 o 3 móviles del grupo y un portátil. Si va lento o falla, se para aquí. Sirve también para F10 | 1–2 días |
| **2. Comparación básica** | Franja de diferencias e «ir al peor momento» | — |
| **3. Detalle** | Partes del cuerpo y adelantado o atrasado | — |

### 5.6 Límites

- **Varios bailarines en el original:** hay que elegir a quién comparar (F10), y los cruces pueden confundir. FYP Dance, por ejemplo, reconoce que no funciona con varios bailarines.
- **Ángulo de cámara:** grabar de frente ayuda mucho.
- **Móviles modestos:** puede ir lento; en ese caso, mejor en el portátil.
- **Tamaño:** cada modelo pesa de unos pocos megas a varias decenas, y solo se descarga la primera vez.
- **No es un juez:** sirve para encontrar dónde mirar, no para dar una nota fiable.

---

## 6. Orden de implementación

| Fase | Qué | Por qué |
| --- | --- | --- |
| **0** | Arreglar los fallos graves de la grabación | Base estable |
| **1** | F1 Archivo vinculado + F2 Quién es quién | Base de casi todo lo demás |
| **2** | F3 Tomas + F4 Mejor toma | Base de la grabación |
| **3** | F5 Repaso + F6 Notas sobre la toma | Comparar y corregir |
| **4** | F7 Aplauso + F8 Clips en tomas + F9 Zoom | Grabar sin tocar el móvil y repasar en detalle |
| **5** | F10 Seguir a un bailarín (empezando por la prueba rápida) | Primera función con IA |
| **Futura** | Análisis de postura con IA | Lo más costoso; se apoya en todo lo anterior |

**Línea de grupo** (independiente de la grabación; puede hacerse en paralelo):

| Fase | Qué | Por qué |
| --- | --- | --- |
| **B1** | F13 Bolsas + F14 Random Play Dance y pistas | Reutilizan clips y biblioteca; es lo que ya hacéis en los ensayos |
| **B2** | F11 Propuestas y votación + F12 Lista de deseos | Elegir la próxima cover entre todos |
| **B3** | F16 Cuenta atrás al evento + F15 Reacciones | La cuenta atrás es sencilla; las reacciones esperan a las tomas compartidas (F3) |

- **Dependencias:** las bolsas de personas, las votaciones y las reacciones necesitan F2 (quién es quién). Conviene hacer F2 antes de B1, o hacer primero las bolsas de canciones y clips y después la de personas.

---

## 7. Límites técnicos

| Tema | Límite | Cómo se resuelve |
| --- | --- | --- |
| **YouTube** | No se puede leer su imagen ni su audio, y sus normas restringen tapar o modificar su reproductor | Superpuesto, seguimiento e IA usan el archivo vinculado (F1) |
| **Descargas de YouTube** | Sus condiciones prohíben descargar | La app no descarga nada; cada uno consigue el archivo por su cuenta |
| **Micrófono** | El aplauso solo es fiable antes de que suene la música | Aplauso solo para empezar; para parar, final automático o botón |
| **Espacio** | Plan gratuito de 1 GB | Tomas en el móvil por defecto; las compartidas, con calidad reducida y aviso de espacio |
| **iPhone** | Grabación, micrófono, descargas e IA tienen particularidades en Safari | Probar en un iPhone real antes de darlo por bueno |
| **Identidad sin login** | Cualquiera podría elegir cualquier nombre; en votaciones, alguien podría votar dos veces | Suficiente para un grupo de confianza |
| **Privacidad de las tomas compartidas** | Hoy cualquiera con la URL de la app puede ver lo que hay en la nube, y las tomas son vídeos personales | Avisar al compartir y, mejor, proteger la entrada con una contraseña del grupo antes de animar a compartir (F3, F15) |
| **Random Play Dance con YouTube** | Cada cambio de canción carga un vídeo (1–2 s) y puede salir un anuncio | Cargar el siguiente por detrás y usar el archivo vinculado (F1) en las pistas habituales |

---

## 8. Descartado

- Ver el original en pequeño mientras se graba.
- Las ideas de ensayo de grupo de la primera propuesta:
  - conteos y secciones;
  - plan de ensayo;
  - reparto;
  - ángulos;
  - formaciones;
  - estado de secciones;
  - mando entre pantallas;
  - letra.
- Empezar a grabar desde otro móvil.
- Tomas en serie.
- Comparar dos tomas propias.
- Guía de encuadre.
- Recortar y exportar tomas.
- Espejo con retraso.
- Control con auriculares o mando Bluetooth.
- Contador de práctica.
- Vídeos sin conexión.
- Etiquetas en la biblioteca.
- Reto de la semana.
- Quedadas y asistencia.

---

## 9. Fuentes

**Mercado**
- [Dance.io: Mirror & Loop & Slow (App Store)](https://apps.apple.com/np/app/dance-io-mirror-loop-slow/id6748628387)
- [LeapNow · Learn & Review Dance](https://mwm.ai/apps/leapnow-learn-review-dance/6771540435)
- [SyncStep (App Store)](https://apps.apple.com/gb/app/syncstep/id6755161749)
- [Move Mirror AI: Dance Coach (App Store)](https://apps.apple.com/md/app/id6763208339)
- [FYP Dance: Cover Practice Tool (App Store)](https://apps.apple.com/app/id6759196501)
- [SyncMirror Player](https://mwm.ai/apps/syncmirror-dance-motion/6755509268)

**IA y seguimiento**
- [MediaPipe Pose Landmarker – guía web (Google)](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js)
- [MediaPipe Pose Landmarker – visión general](https://ai.google.dev/mediapipe/solutions/vision/pose_landmarker)
- [MediaPipe – condiciones de uso](https://ai.google.dev/edge/mediapipe/legal/tos)
- [MoveNet y TensorFlow.js (blog de TensorFlow)](https://blog.tensorflow.org/2021/05/next-generation-pose-detection-with-movenet-and-tensorflowjs.html?hl=pt-br)
- [Seguimiento con MoveNet MultiPose (foro de Google AI)](https://discuss.ai.google.dev/t/trying-to-use-tracker-in-movenet-pose-detector/30928)
- [MMPose (Apache 2.0)](https://pypi.org/project/mmpose/)
- [rtmlib (RTMPose/RTMO con ONNX)](https://pypi.org/project/rtmlib)
- [RTMPose (Harvard MMLA)](https://mmla.gse.harvard.edu/tools/rtmpose/)
- [mmpose «Just Dance»](https://cdn05042023.gitlink.org.cn/OpenMMLab/mmpose/src/branch/main/projects/just_dance/README.md)
- [ONNX Runtime Web (npm)](https://npmjs.com/package/onnxruntime-web)
- [ONNX Runtime – WebGPU](https://www.mintlify.com/microsoft/onnxruntime/execution-providers/webgpu)
- [ViTPose en ONNX (onnx-community)](https://huggingface.co/onnx-community/vitpose-base-simple/tree/main/onnx)
- [ViTPose – documentación de Transformers](https://huggingface.co/docs/transformers/main/model_doc/vitpose)
- [YOLO11 (AGPL-3.0)](https://huggingface.co/Ultralytics/YOLO11/blob/6adfddbf6be0deb88f7add0d1e8b7be5b80c2564/README.md)
- [Ultralytics en PyPI](https://pypi.org/project/ultralytics/8.3.80/)
- [EdgeTAM – artículo](https://huggingface.co/papers/2501.07256)
- [EdgeTAM – Qualcomm AI Hub](https://aihub.qualcomm.com/models/edgetam)
- [EdgeTAM – demo de Meta](https://huggingface.co/spaces/facebook/EdgeTAM/tree/main/sam2/modeling/sam)

**Normas de YouTube**
- [YouTube API Services – funcionalidad mínima requerida](https://developers.google.com/youtube/terms/required-minimum-functionality)
- [Guía de cumplimiento de las políticas de YouTube](https://developers.google.cn/youtube/terms/developer-policies-guide)
