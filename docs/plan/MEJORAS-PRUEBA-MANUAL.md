# One Shoot · Mejoras de la prueba manual

Notas del responsable del producto mientras prueba la app a mano en producción (https://kpop-covers.vercel.app),
sobre todo en el móvil. Cada punto es un cambio pedido para que lo haga otro agente.

## Para el agente que haga estos cambios

- Lee antes `CLAUDE.md`, `docs/plan/ESTADO-IMPLEMENTACION.md` (qué hay y cómo probarlo) y este documento.
- El 90–95 % del uso es en móvil: revisa y prueba primero a tamaño de móvil, con toques reales.
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
| 1 | Navegación en móvil | Sacar las secciones del menú «⋯» y llevarlas a un menú de acciones rápidas abajo a la derecha, con un diseño creativo y animado (4 prototipos para elegir). Detalle abajo | Alta | Pendiente |
| 2 | Menú «⋯» · versión | El menú «⋯» queda solo para Ajustes, «Instalar app», la política (Privacidad y condiciones de YouTube) y el número de versión, que sube en cada despliegue, con un botón «Buscar actualización» que descarga y aplica la nueva. Detalle abajo | Alta | Pendiente |

| 3 | Estudio · clips | Poder editar un clip ya guardado: nombre, color, inicio y fin (duración), velocidad, espejo, fijado | Alta | Pendiente |
| 4 | Estudio · reproductor | Quitar nuestro botón grande rojo de play/pausa sobre el vídeo; usar los controles de YouTube cuando los haya, y que lo que aparece encima del vídeo se vaya lo antes posible | Alta | Pendiente |
| 5 | Estudio · pantalla completa | Al tocar la pantalla para ver los controles (línea de tiempo, etc.) con el vídeo en marcha, hay un momento lento y el vídeo se para o da tirones. Tiene que ser instantáneo y fluido | Alta | Pendiente |
| 6 | Estudio · calidad | Que el vídeo se vea con la mayor calidad posible lo antes posible (dentro de lo que permita la conexión) | Media | Pendiente |
| 7 | Estudio · zoom | El zoom solo con los dedos (pellizcar y arrastrar), sin botones de ampliar y reducir; sobre todo en pantalla completa, como en cualquier vídeo del móvil | Alta | Pendiente |
| 8 | Estudio · bucle | Al repetir la canción o el clip sin pausa entre vueltas, la vuelta tarda un poco en arrancar. Tiene que ser inmediata | Alta | Pendiente |
| 9 | Estudio · pausa del bucle | En vista normal, al mantener pulsado «Bucle», el panel «Pausa entre vueltas de la canción» se sale de la pantalla en el móvil (en la captura se corta el lado izquierdo del texto). Y el numerito rojo del botón (los segundos de pausa) casi no se lee | Alta | Pendiente |
| 10 | Estudio · guardar clip | El diálogo «Guardar clip» (nombre, etiquetas rápidas, color, fijar) ocupa demasiado y está todo suelto, sin estructura. Hacerlo más compacto y ordenado | Media | Pendiente |
| 11 | Estudio · «Fijar en acceso rápido» | No se entiende para qué sirve el interruptor. Explicarlo en la propia interfaz (texto o etiqueta más clara) | Media | Pendiente |

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
