# One Shoot · Mejoras de la prueba manual

Notas del responsable del producto mientras prueba la app a mano en producción (https://kpop-covers.vercel.app),
sobre todo en el móvil. Cada punto es un cambio pedido para que lo haga otro agente.

## Para el agente que haga estos cambios

- Lee antes `CLAUDE.md`, `docs/plan/ESTADO-IMPLEMENTACION.md` (qué hay y cómo probarlo) y este documento.
- El 90–95 % del uso es en móvil: revisa y prueba primero a tamaño de móvil, con toques reales. **Todo lo que el
  responsable dice de la interfaz en este documento es en el móvil**, salvo que diga otra cosa.
- Todas las pruebas en el navegador, en silencio (el demo ya se silencia con `apps/web/src/lib/devSilence.ts`).
- Interfaz en español de España; colores solo con los tokens de `index.css`; animaciones con los presets de
  `src/lib/motion.ts`.
- Cambios de base de datos: migración nueva, nunca editar una publicada; copia de seguridad antes de aplicarla.
- Al terminar cada punto, márcalo como hecho aquí (con el commit) y apúntalo en `docs/plan/PROGRESO.md`.
- Si un punto no está claro, pregunta antes de inventar.

Estados: **Pendiente** · **En curso** · **Hecho** (commit) · **Descartado** (motivo).

## Mejoras pedidas

| # | Zona | Qué cambiar | Prioridad | Estado |
| --- | --- | --- | --- | --- |
| 1 | Navegación en móvil | Sacar las secciones del menú «⋯» y llevarlas a un menú de acciones rápidas abajo a la derecha, con un diseño creativo y animado (4 prototipos para elegir). Detalle abajo | Alta | **Hecho** (caa8abe) · el responsable elige en el laboratorio |
| 2 | Menú «⋯» · versión | El menú «⋯» queda solo para Ajustes, «Instalar app», la política (Privacidad y condiciones de YouTube) y el número de versión, que sube en cada despliegue, con un botón «Buscar actualización» que descarga y aplica la nueva. Detalle abajo | Alta | **Hecho** (caa8abe) |

| 3 | Estudio · clips | Poder editar un clip ya guardado: nombre, color, inicio y fin (duración), velocidad, espejo, fijado | Alta | **Hecho** (684c3c8) |
| 4 | Estudio · reproductor | Quitar nuestro botón grande rojo de play/pausa sobre el vídeo; usar los controles de YouTube cuando los haya, y que lo que aparece encima del vídeo se vaya lo antes posible | Alta | **Hecho** (684c3c8) |
| 5 | Estudio · pantalla completa | Al tocar la pantalla para ver los controles (línea de tiempo, etc.) con el vídeo en marcha, hay un momento lento y el vídeo se para o da tirones. Tiene que ser instantáneo y fluido | Alta | **Hecho** (684c3c8) |
| 6 | Estudio · calidad | Que el vídeo se vea con la mayor calidad posible lo antes posible (dentro de lo que permita la conexión) | Media | **Hecho** (684c3c8) |
| 7 | Estudio · zoom | El zoom solo con los dedos (pellizcar y arrastrar), sin botones de ampliar y reducir; sobre todo en pantalla completa, como en cualquier vídeo del móvil | Alta | **Hecho** (684c3c8) · solo con archivo: las condiciones de YouTube no dejan ampliar su reproductor |
| 8 | Estudio · bucle | Al repetir la canción o el clip sin pausa entre vueltas, la vuelta tarda un poco en arrancar. Tiene que ser inmediata | Alta | **Hecho** (684c3c8) |
| 9 | Estudio · pausa del bucle | En vista normal, al mantener pulsado «Bucle», el panel «Pausa entre vueltas de la canción» se sale de la pantalla en el móvil (en la captura se corta el lado izquierdo del texto). Y el numerito rojo del botón (los segundos de pausa) casi no se lee | Alta | **Hecho** (684c3c8) |
| 10 | Estudio · guardar clip | El diálogo «Guardar clip» (nombre, etiquetas rápidas, color, fijar) ocupa demasiado y está todo suelto, sin estructura. Hacerlo más compacto y ordenado | Media | **Hecho** (684c3c8) |
| 11 | Estudio · «Fijar en acceso rápido» | No se entiende para qué sirve el interruptor. Explicarlo en la propia interfaz (texto o etiqueta más clara) | Media | **Hecho** (684c3c8) |
| 12 | Estudio · archivo vinculado | Si la canción tiene archivo, se usa el archivo por defecto (no YouTube), en todos los móviles que lo tengan. El selector «YouTube | Archivo» sale de la zona de arriba (quita espacio a lo importante) y pasa abajo o a otro sitio discreto | Alta | **Hecho** (684c3c8) |
| 13 | Archivo vinculado · nube | Un archivo vinculado desde el ordenador no llegó a la nube: en el móvil sale «está en otro dispositivo». Todos tienen que poder usarlo | Alta | **Hecho** (baf83fe) |
| 14 | Seguir a un bailarín · pantalla completa | Poder elegir y seguir a un bailarín también con el vídeo en pantalla completa | Alta | **Hecho** (a926739) |
| 15 | Seguir a un bailarín · velocidad | El análisis es demasiado lento (en el ordenador, unos 3 min para llegar al 50 % de una canción de 2:38). Tiene que ser lo más rápido posible | Alta | **Hecho** (a926739) |
| 16 | Voz y música · «La ola partida» | Gusta el concepto de olas, pero ahora se ven dos líneas planas (roja y azul) que no parecen olas: visualmente está mal. Rediseñar la ola (propuestas abajo) o, si no convence, volver a uno de los diseños de antes | Media | **Hecho** (daf2f35) · el responsable elige en el laboratorio |
| 17 | Laboratorio de diseño | Volver a poner un laboratorio de diseño en Ajustes para elegir probando: las propuestas de la ola de voz y música (punto 16) y los 4 prototipos del menú de abajo a la derecha (punto 1). Cuando el responsable elija, se quita lo descartado | Alta | **Hecho** (caa8abe) · el responsable elige en el laboratorio |
| 18 | Voz y música · separar de verdad | «Sin voz» y «Voz» no funcionan con su archivo: la app avisa de que la pista suena en mono y no se puede separar. Separar la voz con IA para que funcione con cualquier archivo | Alta | **Hecho** (daf2f35) |
| 19 | Grabador · rendimiento | **Crítico.** Grabando a 1080p 60 (también en «Alta» y «Máxima») la imagen de la cámara va con muchísimo retraso y tirones; la música suena bien, pero así no se puede grabar. Todo el grabador tiene que ir fluido | Crítica | **Hecho** (af63e2b) |
| 20 | Grabador · descartar | Al descartar una toma, quedarse en la cámara lista para grabar otra, no volver a la pantalla anterior | Alta | **Hecho** (af63e2b) |
| 21 | Aplauso · sensibilidad | Con «Baja», en una habitación tranquila, se disparó dos veces solo al mover la silla. Bajar todas las sensibilidades y pasar a cuatro: Baja, Media, Alta (más baja que la Alta de ahora) y Muy alta (la Alta de ahora). Que rechace mejor golpes que no son palmadas | Alta | **Hecho** (af63e2b) |
| 22 | Grabador · «Inicio / 0:26» | No se entiende qué hace ese botón (desde dónde empieza la canción al grabar). Explicarlo mejor, y al mantenerlo pulsado mostrar los clips de la canción para empezar en uno | Media | **Hecho** (af63e2b) |
| 23 | Grabador · lentes | «Lente 1/2» no se entiende: la 2 tiene un zoom de base que no gusta y solo una de ellas tiene flash. Explicarlo o cambiarlo por algo claro (ver detalle) | Alta | **Hecho** (af63e2b) |
| 24 | Grabador · color de la luz | Se quiere mantener. Fallo: al elegir Cálida, Fluorescente… no cambia nada; al pulsar después «Auto», entonces sí cambia el tono (el de la opción anterior). El control aplica tarde o en mal orden | Media | **Hecho** (af63e2b) |
| 25 | Grabador · cámara al abrir | Quitar la opción «Visor / Cámara al abrir»: siempre la última usada | Baja | **Hecho** (af63e2b) |
| 26 | Grabador · chip de calidad | Al tocar el chip de arriba a la derecha («1080p · 60 · Máxima») que abra directamente esa opción, no el abanico entero | Media | **Hecho** (af63e2b) |
| 27 | Grabador · Abanico | Juntar «Calidad» y «Tamaño» en una sola opción, y meter «Imagen» (luz, color y enfoque) dentro del abanico | Media | **Hecho** (af63e2b) |
| 28 | Bolsas de canciones · añadir de YouTube | Además de elegir canciones de la biblioteca, poder buscar en YouTube (el mismo buscador de «Añadir vídeo») y añadir canciones nuevas directamente a la bolsa. Esas no se guardan en la biblioteca; si al salir del sorteo se decide hacerla, entonces sí se añade a la biblioteca | Alta | **Hecho** (d389da9) |
| 29 | Bolsas · icono | No gusta cómo se ve el icono de las bolsas (`BagIcon`). Rediseñarlo | Baja | **Hecho** (d389da9) · el responsable elige en el laboratorio |
| 30 | Bolsas · elegir bolsa | La lista de bolsas (pantalla «Bolsas») tiene que ser más creativa. Varias propuestas al laboratorio de diseño (punto 17) | Media | **Hecho** (d389da9) · el responsable elige en el laboratorio |
| 31 | Bolsa · estructura | En la pantalla de una bolsa, el título y «← Bolsas» ocupan mucho. Lo importante es el sorteo: la escena, «Sacar» y «Añadir» (que esté más a mano). Rehacer la jerarquía: listas «En la bolsa» e «Historial» con otra presentación, y mejor sitio para ajustes y borrar | Alta | **Hecho** (d389da9) |
| 32 | Bolsa · animación | Gusta el giro de la rueda (Fukubiki). Hacer más fluida la salida de la bola | Media | **Hecho** (d389da9) |
| 33 | Random Play Dance · crear ronda | La pantalla para crear la ronda tiene que ser más sencilla e intuitiva, con mejor estructura | Alta | **Hecho** (87759a0) |
| 34 | Random Play Dance · ronda | La pantalla de la ronda es «la peor»: fondo como el del resto de la app (no negro) y mejor jerarquía y estructura visual | Alta | **Hecho** (87759a0) |
| 35 | Próxima cover · proponer | «Proponer canción» tiene que poder buscar en YouTube (como «Añadir vídeo»), no solo pegar un enlace. Sin esto el responsable no puede probar deseos ni votaciones | Alta | **Hecho** (87759a0) |
| 36 | Próxima cover · biblioteca | Las canciones propuestas (también las buscadas en YouTube) no salen en la biblioteca hasta que se confirme con «Añadir a la biblioteca» | Alta | **Hecho** (87759a0) |
| 37 | Próxima cover · estructura | La pantalla tiene que ser más sencilla e intuitiva: mejor estructura y jerarquía en el móvil | Alta | **Hecho** (87759a0) |
| 38 | Biblioteca · se sale del marco | **Fallo visual.** En el móvil, las tarjetas de la biblioteca se salieron del marco por la derecha (la miniatura grande y la fila de «ARrC», con «con archivo» cortado). Pasó al volver de otra página, quizá con «Atrás» del móvil. No puede pasar nunca | Crítica | **Hecho** (2a29b94) |
| 39 | Eventos · cuenta atrás larga | Chōchin (farolillos) encanta, pero con más de 7 días no se aprecia porque no hay ninguno encendido. Otro diseño igual de bonito para cuando faltan más de 7 días, y Chōchin para los últimos 7. Propuestas al laboratorio de diseño | Media | **Hecho** (81d6e0e) · el responsable elige en el laboratorio |

### 1 · Menú de acciones rápidas abajo a la derecha (móvil)

**Qué hay hoy.** En móvil, la barra de arriba tiene el botón «Menú» (`AppShell.tsx`, `role="menu"`) con todo dentro:
las 5 secciones (`MAIN_NAV`: Biblioteca, Bolsas, Próxima cover, Random Play Dance, Eventos), «Instalar app»,
«¿Quién eres?», Ajustes y Privacidad y condiciones. En escritorio está el carril lateral, **que se queda como está**.

**Qué quiere el responsable.**
- En móvil, las secciones salen del menú de arriba y pasan a un botón flotante abajo a la derecha, donde el pulgar
  llega y donde suelen estar las acciones rápidas en el móvil.
- No una barra inferior simple ni un desplegable: algo bonito, con animación y un panel distinto e innovador, con la
  estética de la app (washi, laca, kamon, sellos bermellón y oro).
- Le gusta mucho la idea del **Abanico** de los ajustes del grabador (`features/record/settings/RecorderSettingsFan.tsx`):
  aquí sería un abanico que se abre desde la esquina inferior derecha y la cubre con su ángulo (un cuarto de círculo),
  con una varilla por opción.
- Quiere **4 prototipos para elegir**: el abanico y otros 3 creativos. Propuestas (el agente puede afinarlas o cambiar
  alguna si encuentra algo mejor, pero tienen que encajar con la estética):
  1. **Sensu (abanico de esquina).** Botón redondo con un kamon en la esquina. Al tocarlo, un abanico de washi y laca se
     despliega en un cuarto de círculo hacia arriba y a la izquierda, con física de muelle; cada varilla es una
     sección con su icono y su kanji. La sección actual tiene la varilla en bermellón.
  2. **Hanafuda (mano de cartas).** Del botón salen cartas de hanafuda que se abren en abanico como una mano de naipes,
     cada una con la ilustración y el kanji de su sección. La carta que toca el pulgar se eleva; al soltar, vuela al
     centro y lleva a la sección.
  3. **Rueda de kamon (dial).** Un sello circular grande asoma desde la esquina (solo se ve un cuarto). Las secciones
     están en su borde, como en un dial: se gira con el pulgar arrastrando y la que queda en la muesca dorada se
     resalta; tocar cualquiera también lleva. Ligera vibración en cada paso si el móvil lo permite.
  4. **Origami (papel que se despliega).** Un cuadrado de washi doblado en la esquina se despliega en pliegues
     (animación de papel) hasta formar un panel con las secciones en sus caras; al cerrar, se vuelve a doblar.
- Cómo comparar: construir los 4 como prototipos temporales (por ejemplo, un selector en una ruta oculta o en una
  vista previa de Vercel) para que el responsable los pruebe en su móvil. **Cuando elija uno, se borran los otros
  tres** y su selector (como se hizo con el laboratorio de diseño).

**Qué va en cada menú (confirmado por el responsable).**
- **Abajo a la derecha:** las 5 secciones y «¿Quién eres?».
- **Arriba, en «⋯»:** Ajustes, Privacidad y condiciones, «Instalar app» y la versión con «Buscar actualización» (punto 2).

**Requisitos que no pueden faltar.**
- Pensado para el pulgar derecho: el botón dentro de la zona segura (`env(safe-area-inset-*)`), con objetivos de 44 px.
- No tapar controles: se oculta o se aparta en el estudio (`/v/…`) si choca con el reproductor, y no sale en la
  ronda de Random Play Dance a pantalla completa ni con el grabador abierto. Revisar cada página a 390×844.
- Se cierra con «Atrás» de Android, con Esc, al tocar fuera y al elegir una opción. Foco atrapado dentro mientras está
  abierto y devuelto al botón al cerrar; nombres accesibles; el botón dice en qué sección estás.
- Con «reducir movimiento», sin muelles ni giros: aparece con un fundido.
- Fluido a 60 fps en un móvil medio (solo `transform` y `opacity`).

### 2 · Número de versión y «Buscar actualización»

**Qué quiere el responsable.** El menú «⋯» de arriba queda solo para:
- Ajustes (`/ajustes`) e «Instalar app»;
- la política (Privacidad y condiciones, con los términos de YouTube: `/privacidad`);
- el **número de versión**, que sube en cada despliegue, para saber si la app instalada es la última;
- un botón para **buscar si hay versión nueva** y, si la hay, descargarla y aplicarla al momento.

**Cómo funciona hoy la actualización** (`apps/web/src/main.tsx`): el service worker baja la versión nueva en segundo
plano y la aplica sola en un momento seguro (fuera del estudio y sin diálogos abiertos); la app instalada lo comprueba
cada hora. No hay número de versión visible ni botón.

**Qué hacer.**
- Un número que suba solo en cada despliegue, sin acordarse de cambiarlo a mano. Por ejemplo, el número de commits de
  `main` en el momento de construir (`git rev-list --count HEAD`), inyectado con `define` de Vite, más la fecha. Se
  muestra como «Versión 142 · 17-10-2026». Comprobar que en Vercel el clon tiene historial suficiente; si no, usar
  otro contador fiable.
- El botón «Buscar actualización» llama a `registration.update()` y da respuesta clara:
  - «Buscando…» mientras busca;
  - «Ya tienes la última versión (142)» si no hay nada;
  - «Hay una versión nueva (143). Actualizando…» y la aplica (recarga) si la hay.
  Si se pulsa dentro del estudio o con algo a medio guardar, avisa antes de recargar.
- Que funcione igual en la app instalada (Android) y en el navegador.

## Probado y correcto

Lo que el responsable ya probó y le parece bien, para no tocarlo sin motivo.

| Zona | Comentario |
| --- | --- |
| Bloque 1 · Miembros y biblioteca (17-10) | Correcto: miembros y «¿Quién eres?», añadir vídeo (buscador, enlace, aviso de duplicado), portada, acceso rápido y borrar con confirmación |
| Bloque 2 · Estudio (17-10) | Correcto lo no apuntado como mejora: reproductor, velocidad, espejo, clips (crear, fijar, bolsa, borrar), notas, archivo vinculado (sincronía, cambio YouTube/Archivo sin saltos), zoom a mano y «Guardar zoom con el clip». Seguir a un bailarín: el responsable lo volverá a probar cuando estén los puntos 14 y 15. Voz y música: ver puntos 16–18 |
| Bloque 5 · Bolsas y Random Play Dance (17-10) | El funcionamiento va bien: crear bolsas, añadir, sacar, historial, sacar varios, rondas, pistas guardadas. La animación de la rueda (giro) gusta. Lo demás, en los puntos 28–34 |
| Bloque 7 · Eventos (17-10) | Gusta mucho y está «genial»: crear, cuenta atrás Chōchin, aviso en la portada, repertorio, bolsa de candidatas y pista. Solo el punto 39. Reacciones sin probar (necesitan tomas, punto 19) |

### 3 a 11 · Estudio (bloque 2 de la prueba manual, 17-10)

Probado en el móvil con una canción de YouTube. Captura del punto 9: el panel de pausa del bucle sale cortado por el
borde de la pantalla y el numerito rojo del botón «Bucle» casi no se lee.

**3 · Editar clips.** Hoy un clip guardado solo se puede fijar, añadir a una bolsa, guardar su zoom o borrar
(`features/studio/StudioPage.tsx`, lista de clips; `data/clips.ts` ya tiene `useUpdateClip`). Hace falta «Editar» en
cada clip, con el mismo diálogo que al guardarlo (más compacto, punto 10): nombre, color, inicio y fin (con ajuste
fino y «poner aquí» desde el momento actual), velocidad, espejo y fijado. Las columnas `name`, `color`, `is_pinned`,
`speed`, `mirrored`, `start_seconds` y `end_seconds` ya son editables por el cliente.

**4 · Botón de play propio.** Quitar el botón grande rojo de play/pausa que la app pinta encima del vídeo. El
responsable prefiere los controles de YouTube «si los hay» y que todo lo que tape el vídeo desaparezca lo antes posible.
Ojo: hoy el reproductor va con `controls: 0` (`player/YouTubeStage.tsx`) porque la app gobierna velocidad, bucle,
espejo y sincronía. Antes de activar los controles de YouTube, comprobar que no rompen el bucle, la velocidad ni el
reloj de la app; si chocan, la alternativa es dejar el vídeo limpio (tocar para pausar, sin botón encima) y los
controles en la barra de abajo. **Confirmar con el responsable cuál de las dos quiere.**

**5 · Fluidez en pantalla completa.** Con el vídeo en marcha, al tocar para que salgan los controles hay un momento
lento y el vídeo se para o da tirones. Medir con una traza a 390×844 (CPU ×4) qué pasa al mostrar los controles:
repintados, animaciones de layout, tareas largas, mensajes al iframe de YouTube. Debe ser inmediato y a 60 fps.

**6 · Calidad.** Pedir la mejor calidad en cuanto empieza: con YouTube, revisar `playerVars` y el tamaño del
reproductor (YouTube elige la calidad por el tamaño en píxeles reales); con archivo, que no se baje la resolución.
No se puede forzar por encima de la conexión, pero sí evitar que arranque en baja calidad por culpa de la app.

**7 · Zoom con los dedos.** Quitar los botones «Reducir el zoom», «Ampliar el centro del vídeo» y similares
(`features/studio/ZoomControls.tsx`): pellizcar para ampliar y reducir, arrastrar para mover, doble toque para volver
(o lo que sea natural en un reproductor de móvil), también en pantalla completa. Mantener «Guardar zoom con el clip».
Ojo: hoy el zoom solo funciona con el archivo vinculado, porque la app decidió no tocar el reproductor de YouTube
(ESTADO, decisión 15). Si el responsable lo quiere también con YouTube (ampliando el marco del reproductor), revisar
antes que no incumpla las condiciones de YouTube y **preguntar**.

**8 · Bucle sin pausa.** Con la pausa entre vueltas a 0, la vuelta al inicio tarda un poco. Revisar
`player/useLoopController.ts` y el motor de YouTube: la vuelta tiene que ser inmediata (por ejemplo, saltar un poco
antes del final en vez de esperar al evento de fin, y no esperar a que el reproductor confirme el salto).

**9 · Panel de pausa del bucle.** El panel que sale al mantener «Bucle» (`StudioPage.tsx` y `Transport.tsx`, con
`GapBadge`) se sale de la pantalla en el móvil. Debe quedarse siempre dentro (posición calculada o como hoja inferior
en móvil). El número de segundos del botón (`GapBadge`) tiene que leerse bien: más grande, más contraste y sin tapar
el icono.

**10 · «Guardar clip» compacto.** El diálogo (`features/studio/SaveClipDialog.tsx`) ocupa casi toda la pantalla:
nombre, siete etiquetas rápidas sueltas, seis colores y los interruptores uno debajo de otro. Darle estructura: nombre
con las etiquetas en una fila que se desplaza; color en la misma línea; interruptores agrupados; botones siempre a la
vista. Que quepa en la mitad de la pantalla de un móvil.

**11 · «Fijar en acceso rápido».** Sirve para que el clip salga el primero en «Acceso rápido» de la portada y en
«Clips fijados» del menú, para empezar a repetirlo con un toque. Decirlo así en la interfaz (por ejemplo, «Fijar en la
portada» con una línea de ayuda debajo).

**Falta por probar del bloque 2:** voz y música (necesita el archivo vinculado) y seguir a un bailarín (bloque 4).

### 12 y 13 · Archivo vinculado (bloque 2, 17-10)

**12 · El archivo manda.** Hoy, aunque haya archivo, la canción abre con YouTube; la elección se recuerda por canción
y por móvil (`lib/stagePref.ts`, `readStage`, por defecto `youtube`; `StudioPage.tsx` ~146). Cambiarlo a: si hay archivo
accesible en este dispositivo (en la nube o guardado aquí), se usa el archivo; YouTube solo si no hay archivo o si la
persona lo elige. El selector «YouTube | Archivo» sale de encima del vídeo: moverlo abajo (con los ajustes del vídeo
o en un menú de la canción), que no quite sitio al vídeo ni a los controles.

**13 · Por qué no se subió.** El archivo de «ARrC · Boom Boom Bass» pesa 55,8 MB (`videos.file_size` = 58 477 041,
`storage_path` vacío, 0 objetos en el bucket). El límite por archivo del bucket es 50 MB (plan gratuito de Supabase),
así que la app lo dejó solo en el ordenador donde se vinculó, como está diseñado (F1: «más grande queda solo en ese
móvil»). Además, todo el grupo comparte 1 GiB entre vídeos y tomas.

**Propuesta.** Cuando el archivo pase de 50 MB, hacer en el propio dispositivo una copia para la nube que quepa: volver
a codificarla a 1080p o 720p con menos bitrate hasta quedar por debajo de 50 MB (ya existe algo parecido para
compartir tomas a 720p ≤ 50 MB, `shareTake`), con barra de progreso y la opción de cancelar; el dispositivo que la
subió conserva el original. La sincronía (desfase) se mantiene porque es el mismo vídeo. Avisar si el espacio del
grupo (1 GiB) no da.
**Otra vía, solo si el responsable lo decide:** pasar a un plan de pago de Supabase, que permite archivos más grandes
y más espacio. Es un cambio de cuenta y de coste; no tocar ajustes del proyecto sin su permiso.

### 14 y 15 · Seguir a un bailarín (prueba del 17-10, en el ordenador)

**14 · En pantalla completa.** Hoy «Seguir a alguien» y el modo manual solo están en la fila «Seguir a un bailarín»
del estudio (`features/follow/FollowRow.tsx`, `FollowStageLayer.tsx`). En pantalla completa hay que poder: empezar
el seguimiento (tocar al bailarín sobre el vídeo o dibujar el recuadro), ver el progreso, cambiar de bailarín y
dejar de seguir, con controles que no tapen el vídeo y se oculten como el resto.

**15 · Por qué tarda.** `features/follow/analyze.ts` recorre la canción entera desde el principio (`direction: both`,
`from: 0`) a 5–10 fotogramas por segundo (`analysisFps`), con MoveNet MultiPose Lightning sobre el fotograma completo
(hasta 6 personas), en WebGL y en el hilo principal. La velocidad de reproducción se adapta a lo que tarda el modelo
(1×–4×). Una canción de 2:38 son unos 1.000 análisis; a ~300 ms cada uno salen ~6 min.

Ideas, de más a menos impacto (medir cada una):
- **Analizar primero lo que se va a ver.** Empezar por el clip o tramo activo (o desde el momento actual) y seguir ya
  mientras se analiza el resto en segundo plano; el resto de la canción solo si hace falta.
- **Seguir con un recorte, no con el fotograma entero.** Tras el primer fotograma, analizar solo un recorte alrededor
  del bailarín elegido con MoveNet SinglePose Lightning (mucho más rápido que MultiPose), y volver a MultiPose solo si
  se pierde.
- **Menos fotogramas e interpolar.** 3–4 por segundo suelen bastar para un zoom que sigue; el recorrido ya se suaviza.
- **Reducir el fotograma antes del modelo** (lado largo ~256–320 px en un canvas) en vez de pasarle el 1080p.
- **WebGPU cuando exista**, con WebGL de reserva (hoy se fuerza `webgl`). Calentar el modelo una vez antes del pase.
- **Un Web Worker con OffscreenCanvas** para no competir con la interfaz.
- Mostrar el tiempo que queda («unos 40 s») en vez de solo el porcentaje.
Objetivo orientativo: una canción de 3 min en menos de 30–40 s en un portátil normal, y el seguimiento usable en
unos segundos para el tramo que se está practicando.

### 16 · «La ola partida» (prueba del 17-10, en el ordenador)

**Qué pasa.** `features/voice/VoiceOnda.tsx` dibuja la ola en un SVG de 240 de ancho (dos periodos) y se estira a todo
el ancho de la fila: en el ordenador son ~1.400 px, así que las curvas se aplanan y quedan dos franjas casi rectas (voz
en bermellón arriba, música en índigo abajo) que no se leen como olas. Además la ola es un dibujo fijo, no sale del
audio.

**Propuestas** (el responsable elige; se pueden combinar):
- **A · Arreglar proporciones.** No estirar: repetir el periodo a lo ancho (patrón que se repite) y dar más alto (56–72
  px), con más amplitud, cresta con espuma blanca y varias capas. Las olas se mueven despacio mientras suena. Es la más
  barata y mantiene la idea.
- **B · Olas del audio real.** Dibujar la envolvente real de la canción a lo largo del tiempo: la voz (centro, mid)
  en bermellón como la cresta y la música (laterales, side) en índigo como el cuerpo, con la marca de reproducción
  avanzando. Al elegir «Sin voz» la cresta se aplana en espuma; con «Voz», el cuerpo se hunde. Sirve además para ver
  dónde canta y dónde no.
- **C · Una gran ola estilo Hokusai.** Una sola ola grabada (líneas de ukiyo-e) donde la cresta es la voz y el cuerpo
  la música; al cambiar de modo, la cresta se separa, se apaga o queda sola, con animación de muelle.
- **D · Seigaiha + pincel.** La música como el patrón de olas concéntricas seigaiha (ya existe la utilidad `seigaiha`)
  y la voz como un trazo de pincel bermellón ondulado encima; cada modo enciende o atenúa una capa.
- **E · Compacta para el móvil.** Quitar la franja grande y dejar los tres botones con una mini ola animada dentro de
  cada uno (ahorra espacio en el estudio).
- **Volver a un diseño anterior:** «Puertas correderas» (`VoiceFusuma.tsx`) o «Capas de grabado» (`VoiceCapas.tsx`),
  borrados en el commit `5e5217a`; se recuperan con `git show 5e5217a^:apps/web/src/features/voice/VoiceFusuma.tsx`
  (y `VoiceCapas.tsx`, más sus ramas en `VoiceSplitControl.tsx`).
Sea cual sea, revisar a 390 px de ancho y en escritorio, con «reducir movimiento».

### 17 · Laboratorio de diseño (decidido el 17-10)

El responsable quiere elegir probando, como antes. Recuperar el laboratorio que se quitó en el commit `5e5217a`
(«feat(design): keep the chosen design per moment, remove the design lab»):
- Código anterior: `git show 5e5217a^:apps/web/src/features/lab/designLab.ts` (y `labState.ts`, `labState.test.ts`,
  `DesignLabSection.tsx`, `demos.tsx`), la sección en `features/settings/SettingsPage.tsx`, y en `vite.config.ts` el
  `globIgnores` de `**/*Demo-*.js` y la caché `lab-demos`.
- Solo con los momentos que están en duda; los 9 diseños elegidos (ESTADO, apartado 7) **no** vuelven al laboratorio.

**Momentos del laboratorio:**
1. **F17 · Voz y música** (punto 16), con una demo en vivo de cada una:
   - A · La ola partida arreglada (repetida a lo ancho, más alta, espuma y movimiento);
   - B · Olas del audio real (cresta = voz, cuerpo = música, con la marca de reproducción);
   - C · Gran ola estilo Hokusai;
   - D · Seigaiha y pincel;
   - E · Compacta: tres botones con una mini ola animada dentro (pensada para el móvil);
   - y, como referencia, los dos diseños anteriores: Puertas correderas (`VoiceFusuma.tsx`) y Capas de grabado
     (`VoiceCapas.tsx`), que se recuperan del mismo commit.
2. **Pantalla «Bolsas»: cómo se elige una bolsa** (punto 30), con 3 propuestas creativas; y, si se rediseña el icono
   (punto 29), sus variantes.
3. **Cuenta atrás cuando faltan más de 7 días** (punto 39), con 3 propuestas (ver detalle del punto 39).
4. **Menú de acciones rápidas en el móvil** (punto 1): Sensu (abanico de esquina), Hanafuda (mano de cartas), Rueda de
   kamon (dial) y Origami. Como afecta a toda la app, en el laboratorio se elige y se aplica al momento en ese móvil.

**Cuando el responsable elija** en cada momento: dejar solo el elegido, borrar el resto y el laboratorio otra vez (como
en `5e5217a`), y apuntarlo en ESTADO (apartado 7, «Diseños elegidos»).

### 18 · Separar voz y música con IA (prueba del 17-10)

**Qué pasa.** F17 separa con mid/side: «Sin voz» resta lo común a los dos canales (la voz suele ir al centro). Con
pistas mono o casi mono no hay nada que restar. `features/voice/voiceRules.ts` (`judgeMono`, `MONO_RULES`: correlación
≥ 0,97 en la mayoría de los fragmentos) lo detecta y la app lo dice. Los audios de dance practice y los MP4 de webs
conversoras suelen ser casi mono, así que la función casi nunca sirve en la práctica.

**Decisión del responsable (17-10): vía A.** La B (separar fuera con UVR5 y adjuntar) queda descartada: es demasiado trabajo para él; quiere algo rápido y fácil, sin pasos a mano. Que el flujo sea un solo botón («Separar voz y música») con progreso y tiempo restante, y que avise si el dispositivo no puede (sin WebGPU) para hacerlo desde el ordenador.

**Vías** (estudiadas):
- **A · La app separa con IA una vez y comparte el resultado (recomendada).** En un dispositivo potente (el ordenador),
  un modelo de separación (Demucs o MDX en ONNX, con WebGPU) saca dos pistas de audio de la canción: instrumental y voz.
  Tarda unos minutos y se hace una sola vez por canción. Se suben a la nube como audio comprimido (3–6 MB cada una, muy
  por debajo de los 50 MB) y todos los móviles usan esas pistas, sincronizadas con el vídeo, para «Sin voz» y «Voz».
  El mid/side actual queda como respaldo cuando no hay pistas separadas.
- **B · Adjuntar pistas hechas fuera.** El responsable separa con un programa gratuito (por ejemplo Ultimate Vocal
  Remover, UVR5) y la app permite adjuntar «Instrumental» y «Voz» como archivos de audio a la canción. Más simple de
  programar y con la mejor calidad, pero exige ese paso a mano.
- Se pueden hacer las dos: B primero (rápida) y A después.
**Detalles para cualquiera de las dos:** nueva tabla o columnas para las pistas de audio de un vídeo (migración nueva y
reglas del bucket para audio), carga en el motor de audio de `features/voice/voiceSplit.ts`, sincronía con el desfase
del archivo vinculado, y que funcione aunque el vídeo se vea desde YouTube (el audio separado puede sonar con el vídeo
de YouTube en silencio). El espacio de todo el grupo es 1 GiB: avisar del tamaño.

**Mientras tanto (consejo para el responsable, ya dado):** descargar en 720p en la web conversora o pasar el MP4 por
HandBrake (gratuito) con «Fast 1080p30» o «Fast 720p30» para dejarlo por debajo de 50 MB.

### 19 a 27 · Grabador (bloque 3, prueba del 17-10 en el móvil)

El repaso, las tomas, compartir y las notas sobre la toma **no se han podido probar**: grabar va tan lento que no hay
tomas buenas. Se probarán cuando esté el punto 19.

**19 · Rendimiento (lo primero).** A 1080p 60 la vista previa va con mucho retraso y tirones mientras la canción suena
bien. Medir en un móvil real (o con una traza en Chrome remoto) dónde se va el tiempo: si la toma va «por lienzo» (en el
navegador sin instalar, o con zoom digital) el dibujo en el canvas a 60 fps puede ser el cuello de botella; también la
interfaz encima del visor (repintados por fotograma, filtros, desenfoques), el reloj del grabador y el audio. Objetivos:
vista previa sin retraso perceptible a 1080p 60 en un Samsung de gama media, sin fotogramas perdidos en la toma
(`presentedFrames` en el panel «i»), y si el móvil no da para 60 fps, bajar solo a 30 avisando. **Probado con la app
instalada** (Samsung), así que no es solo el camino «por lienzo» del navegador: mirar también la imagen directa.

**20 · Descartar.** Tras «Descartar» (y su confirmación), volver al visor listo para la siguiente toma.

**21 · Aplauso.** `features/record/clap/clapListener.ts` y `packages/shared/src/clap.ts` (umbrales por sensibilidad,
filtro de paso alto, ataque). Nuevos niveles: Baja, Media, Alta y Muy alta (la Alta de ahora), con todos los umbrales
más exigentes que hoy; rechazar golpes graves o sordos (silla, pasos, mesa) mirando más el timbre de una palmada
(agudo y seco). Por defecto, Media. Probar con ruidos de habitación.

**22 · «Inicio / 0:26».** Es el punto desde el que empieza la canción al grabar: «Inicio», el momento actual («0:26»)
o el tramo A–B (`RecordStudio.tsx` ~1586). Ponerle un texto claro («Empieza en: Inicio») y, al mantener pulsado, una
lista con Inicio, el momento actual y los clips de la canción.

**23 · Lentes.** «Lente 1/2» recorre las cámaras traseras físicas que da el navegador (`view.lenses`). Lo más probable
en su Samsung: la 1 es el gran angular y la 2 la principal (por eso se ve con «zoom» respecto a la 1, y el flash solo
va con la principal). Hacerlo como la cámara del móvil: botones de zoom 0,5× / 1× / 3× que cambian de lente por
debajo, con la principal (1×) por defecto, en vez de «Lente N». Si no se puede saber qué es cada una, nombrarlas
(«Gran angular», «Principal», «Tele») por su campo de visión. Explicar que el flash solo existe en una.

**24 · Color de la luz (se mantiene).** Los ajustes «Cálida / Fluorescente / Día / Nublado» piden una temperatura de
color (`camera.ts`, `colorTemperature`). En su Samsung el tono **sí puede cambiar**: al elegir una opción no pasa nada,
pero al pulsar después «Auto» se ve el tono de la opción anterior. Parece que la temperatura se pide sin poner antes
`whiteBalanceMode: "manual"` (o en la misma llamada en mal orden) y el cambio de modo de la siguiente pulsación es el que
la aplica. Aplicar en dos pasos (primero modo manual, luego la temperatura) y comprobar con `getSettings()` que quedó;
«Auto» vuelve a `continuous`. Si un móvil de verdad lo ignora, ocultar la opción solo en ese móvil.

**25 · Cámara al abrir.** Quitar el ajuste: abrir siempre con la última cámara usada (la primera vez, la trasera).

**26 · Chip de calidad.** Tocar el chip de arriba abre solo el ajuste de calidad (y tamaño, punto 27), no el abanico.

**27 · Abanico.** Una sola varilla «Calidad» que reúna calidad, tamaño y fotogramas, y una varilla «Imagen» con luz,
color y enfoque (hoy es un botón aparte en la columna derecha).

### 28 a 34 · Bolsas y Random Play Dance (bloque 5, prueba del 17-10)

El funcionamiento va bien; lo apuntado es de presentación y de una función nueva.

**28 · Canciones de YouTube en una bolsa.** Hoy una bolsa de canciones solo admite vídeos de la biblioteca (o deseos,
`bag_items.wish_id`). Añadir en «Añadir» una pestaña «Buscar en YouTube» con el buscador de «Añadir vídeo»
(`api/youtube-search.ts`, enlace o búsqueda). Esas canciones viven solo en la bolsa: hace falta guardarlas sin crear
un vídeo de la biblioteca (por ejemplo, columnas `youtube_id`, `title`, `artist`, `thumbnail_url` en `bag_items` con
`kind` propio, en una migración nueva, con las reglas de `guard_bag_item` y `draw_from_bag` para la etiqueta). Al salir
en el sorteo, la tarjeta ofrece «Añadir a la biblioteca» (como la ganadora de una votación); si ya estaba en la
biblioteca, la enlaza en vez de duplicarla.

**29 y 30 · Icono y lista de bolsas.** Proponer al laboratorio 3 formas creativas de elegir bolsa, con la estética de
la app (por ejemplo: bolsitas de tela furoshiki colgadas que se balancean, cajas omikuji en un estante, o farolillos con
el nombre), y variantes del icono si se cambia.

**31 · Pantalla de una bolsa.** Jerarquía de arriba abajo: cabecera mínima (atrás y nombre en una línea, ajustes y
borrar en un menú o iconos pequeños), la escena del sorteo grande con «Sacar» y «Sacar varios» debajo, «Añadir» siempre
a mano (botón fijo o junto a «Sacar»), y luego «En la bolsa» e «Historial» en pestañas o en tarjetas plegables, más
compactas. Revisar a 390×844 que el sorteo y «Sacar» se vean sin desplazarse.

**32 · Bola.** La rueda gira bien; la bola que sale y rueda hasta la bandeja tiene que ir más fluida (solo `transform`,
curva y rebote con los presets de `lib/motion.ts`).

**33 · Crear ronda.** `features/rpd/RpdPage.tsx`: hoy son muchas opciones seguidas. Hacerlo en pasos o con lo
importante arriba («De dónde salen los clips» y «Empezar») y el resto (pausa, título, cuenta atrás, espejo y
velocidad) en «Más opciones» con valores por defecto sensatos.

**34 · Pantalla de la ronda.** `features/rpd/RpdPlayPage.tsx` y `RandomPlayScreen.tsx` (Kamishibai, que se mantiene):
fondo como el del resto de la app (washi y seigaiha en vez de negro), el vídeo y la tarjeta como protagonistas,
«Siguiente» y los controles con una jerarquía clara (los principales grandes, los secundarios agrupados), y que se lea
bien de lejos en una tele. Revisar también en horizontal.

### 35 a 37 · Próxima cover (bloque 6, prueba del 17-10)

**No se ha podido probar** porque proponer exige pegar un enlace. Las votaciones se probarán cuando esté el punto 35.

**35 · Buscar en YouTube al proponer.** `features/wishes/WishFormDialog.tsx`: añadir el buscador de «Añadir vídeo»
(`api/youtube-search.ts`; reutilizar el componente de resultados de `features/library/AddVideoDialog.tsx`). Al elegir
un resultado se rellenan título, grupo y miniatura como con el enlace. Pegar enlace sigue funcionando.

**36 · Fuera de la biblioteca hasta confirmar.** Hoy una propuesta vive en `wishes` y solo crea un vídeo con
«Añadir a la biblioteca» (`useAddWishToLibrary`). Mantenerlo así también para las buscadas en YouTube, y comprobar que
ningún paso (buscar, proponer, votar, ganar) crea un vídeo por su cuenta. Mismo criterio que las canciones de YouTube
en una bolsa (punto 28).

**37 · Estructura.** `features/wishes/WishesPage.tsx` y `PollPage.tsx`: en el móvil, lo primero tiene que ser
«Proponer» (buscar) y la lista ordenada por interés con «Me apunto» bien visible; las votaciones abiertas destacadas
arriba si las hay; «Elegir para votar» como modo claro con su barra de acción; y en una votación, la papeleta y
«Votar» antes que la información secundaria (tipo, cierre, anonimato). Menos texto explicativo fijo.

### 38 y 39 · Biblioteca y eventos (bloque 7, prueba del 17-10)

**38 · La biblioteca se sale del marco.** Captura del responsable (Samsung, 390 px aprox.): bajo «Biblioteca», la tarjeta
destacada (GOT7) y la fila siguiente (ARrC) sobresalen por la derecha del marco de papel; la etiqueta «con archivo»
sale cortada. Ocurrió al volver a la portada desde otra página (quizá con «Atrás» de Android). Pistas: una animación de
`motion` interrumpida al volver (layout, «brisa» o física de las tarjetas en `features/library/VideoCard.tsx` y
`LibraryPage.tsx`) que deja un `transform` a medias; el pintado con la copia guardada (snapshot) con otro ancho; o un
`min-w-0` u `overflow` que falta en la rejilla. Reproducir: abrir una canción, volver con «Atrás» del móvil y con el botón
de la app, varias veces y rápido, también girando el móvil. Arreglo de fondo: ninguna tarjeta puede salirse del marco
(contención en el contenedor y en la tarjeta) y la animación se reinicia limpia al montar. Revisar las demás páginas.

**39 · Cuenta atrás larga.** `features/events/EventCountdown.tsx` (Chōchin, `litLanterns` en `eventRules.ts`): con
más de 7 días los siete farolillos están apagados. Mantener Chōchin para los últimos 7 días y añadir un diseño para
cuando faltan más; el cambio de uno a otro al entrar en la última semana puede ser una pequeña transición (por
ejemplo, el primer farolillo se enciende). Propuestas para el laboratorio:
- **Koyomi**, el calendario de hojas que había antes (se arranca una hoja por día; el número se lee de un vistazo). Se
  recupera de `git show 5e5217a^:apps/web/src/features/events/EventCountdown.tsx` (`pageFace` en `eventRules.ts`).
- **Sunadokei**, el reloj de arena de antes, que baja desde que se creó el evento (se recupera del mismo commit).
- **Tsuki** (nueva): las fases de la luna en una fila; la luna se va llenando según se acerca el día, y el número de
  días grande al lado.
Con «reducir movimiento», sin animaciones. En la portada no debe empujar el contenido (ver P8 de la revisión global).

## Ronda 2 de la prueba manual (18-10, versión 139)

Lo que no se menciona aquí está bien y no se toca.

| # | Zona | Qué cambiar | Prioridad | Estado |
| --- | --- | --- | --- | --- |
| 40 | Laboratorio · elegidos | Cuenta atrás larga: **Tsuki**. Voz y música: **A · La ola partida mejorada**. Pantalla «Bolsas»: **Furoshiki**. Icono de bolsa: **Fukubukuro**. Dejar solo esos, borrar el resto y sus momentos del laboratorio; apuntarlos en ESTADO apartado 7 | Alta | **Hecho** (01d7f4e) |
| 41 | Menú rápido (laboratorio) | Aún sin decidir: se quedan Sensu, Hanafuda y Rueda de kamon (estos dos gustan más; **no tocarlos**). Mejorar la **animación de entrada de Sensu**. **Origami no gusta nada**: sustituirlo por un prototipo nuevo | Alta | **Hecho** (01d7f4e; elegido Hanafuda: fb1978d) |
| 42 | Aplauso | Con el detector nuevo no dispara ni en «Baja» ni en «Alta» a la misma distancia que antes. **Volver al detector anterior** (como estaba antes de la mejora 21) | Alta | **Hecho** (e646aef) |
| 43 | Grabador · sincronía | Ya no hay retraso en la vista previa, pero al ver la toma el vídeo va un poco por detrás del audio (bailando a tempo, la imagen llega después de la música). Igual a 1080p 60 y 30 | Crítica | **Hecho** (e646aef) |
| 44 | Estudio · zoom | En el móvil, con el vídeo pequeño, quitar la fila «Zoom» (y sus flechas): el zoom es solo con los dedos | Media | **Hecho** (5ba045c) |
| 45 | Seguir a un bailarín | **Eliminar la función por completo** (fila, pantalla completa, análisis, flechas, prueba de postura de Ajustes y dependencias de modelos). La tabla `follow_paths` se queda (borrar = archivar), sin uso | Alta | **Hecho** (5ba045c) |
| 46 | Voz y música | Funciona bien. En algunas partes la música suena floja (mejorar el modelo un poco, sin urgencia). Que «Todo / Sin voz / Voz» también salga **en pantalla completa** | Media | **Hecho** (4a50952 y 5ba045c) |
| 47 | Pantalla completa · salir | En pantalla completa, girar el móvil a vertical y salir: la página queda desplazada, con un hueco a la derecha, en vez de centrada | Alta | **Hecho** (5ba045c) |
| 48 | Grabador · color de la luz | «Cálida» puso un tono azulado; otra opción, morado; después se ocultaron las opciones con «este móvil no cambia el color de la luz… se queda en automático», pero el tono había cambiado (lila) y no volvió a normal. Arreglar: valores correctos, no ocultar si sí cambia, y al ocultar volver de verdad a automático | Alta | **Hecho** (e646aef) |
| 49 | Grabador · acceso rápido a la luz | Al tocar para enfocar, que salga una barra pequeña con el control de luz (exposición), como en la cámara del móvil | Media | **Hecho** (e646aef) |
| 50 | Tomas | «Nube del grupo» más pequeño y sencillo (como mucho, avisar si se está llenando). Quitar los filtros (hoy, esta semana, todas). Las tomas salen repetidas: la última sale como «Repaso» y abajo la misma dos veces con más opciones: que salga **una sola vez** | Alta | **Hecho** (0f92ab9) |
| 51 | Repaso / comparar | No funciona: al dar a reproducir no suena nada y va con mucho retraso; la interfaz se ve rara, sin la estética de la app. **Rehacerlo** para que funcione y se vea como el resto | Crítica | **Hecho** (0f92ab9) |
| 52 | Votaciones | Quitar opciones: los resultados siempre en directo, los votos siempre con nombre y el cierre siempre a mano | Media | **Hecho** (7936132) |
| 53 | Random Play Dance · crear | En el móvil la cabecera (título, descripción y «Pistas guardadas») ocupa casi media pantalla: solo el título, compacto | Alta | **Hecho** (7936132) |
| 54 | Random Play Dance · ronda | Con la ronda en marcha, la pantalla completa es solo el vídeo, con las acciones abajo, como en la pantalla completa del estudio | Alta | **Hecho** (7936132) |
