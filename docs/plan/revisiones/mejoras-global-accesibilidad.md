# Revisión global · accesibilidad e interfaz móvil de la ronda de mejoras (17-10)

## Alcance

Revisión de solo lectura de `git diff 11dee4d..HEAD` (puntos 1–39 de `MEJORAS-PRUEBA-MANUAL.md`), con criterio WCAG 2.2 AA
y móvil primero: 390×844 vertical, 844×390 horizontal, 360 px y letra del sistema grande. En Chrome para Android, la
letra grande amplía la página y el ancho CSS baja: 390 px al 130 % se quedan en unos 300 px, y 844×390 en 650×300.
No he abierto navegador ni servidor. Las medidas salen del código y de las reglas de geometría (`navRules.ts`, etc.).
Los contrastes los he calculado con los tokens de `index.css`.

No repito lo ya cerrado o anotado en `global-accesibilidad.md` ni en los informes `mejoras-*-ronda-*.md`. Si algo
anterior sigue abierto y la ronda lo toca, lo digo.

Revisado: menú flotante (núcleo, alternativa y los 4 prototipos), laboratorio y su demo, «⋯» con la versión, lentes,
«Empieza en», abanico del grabador, panel de seguir en pantalla completa, separar voz, copia para la nube, bolsas
(estantería, escena, pestañas, listas), papeleta, crear ronda y ronda, cuenta atrás larga y Chōchin, y olas de voz.

## Hallazgos (de mayor a menor)

- **[6] features/nav/prototypes/NavKamon.tsx:62-72, :93-119 + navRules.ts:166-169 — la «Rueda de kamon» deja la mitad
  de las secciones fuera de la pantalla, y solo se llega a ellas arrastrando (2.5.7 Movimientos de arrastre, AA).**
  Las secciones van cada 32° y la muesca está a −45°. Solo se ve el cuarto entre −90° y 0°. A 390×844 (r = 220), en
  Biblioteca se ven Biblioteca y Bolsas, Random Play asoma unos 20 px y Eventos y «¿Quién eres?» quedan fuera. En
  Eventos pasa lo mismo, pero al revés. Para llegar a esas entradas hay que girar la rueda arrastrando en círculo. El
  teclado (flechas) y el foco del lector sí la giran, pero no existe ninguna forma de hacerlo con un solo toque. Es un
  prototipo, pero si el responsable lo elige será la navegación principal del móvil.
  **Arreglo:** dos botones de paso de 44 px junto a la muesca («Girar a la anterior» / «Girar a la siguiente»), que
  llamen a `turnTo(notch ± 1)`. Otra opción: que tocar una sección que no está en la muesca la gire primero y que el
  segundo toque lleve a ella, siempre que todas tengan al menos un borde tocable. Hay que quitar «Gira la rueda» del
  texto de ayuda o completarlo, y probarlo a 390, 360 y 300 px.

- **[5] features/nav/prototypes/NavOrigami.tsx:364-370, :434 (+ NavDemo.tsx:36) — en horizontal, «Origami» se sale por
  arriba en cuanto la página se amplía.** El panel mide unos 284 px de alto: una cabecera de unos 30 px y 3 filas fijas
  de 84 px. Va a 68 px sobre el botón, que está a `max(16px, zona segura + 12px)` del borde de abajo. Margen arriba:
  - a 844×390, unos 22 px;
  - en iPhone en horizontal (con la barra de inicio), unos 5 px;
  - con la página al 110 %, −14 px;
  - al 130 %, −68 px: la primera fila (Biblioteca y Bolsas) queda medio cortada;
  - al 150 %, la primera fila desaparece entera.

  La raíz lleva `overflow-hidden` y no hay desplazamiento, así que esas secciones no se pueden alcanzar (1.4.10). En la
  demo del laboratorio pasa ya sin ampliar, porque el escenario mide `100dvh − 96px`, unos 294 px en horizontal.
  **Arreglo:** con poca altura (`stage.h` < unos 400 px), 3 columnas × 2 filas o filas de 64 px. Como red de
  seguridad, `max-height: calc(100% − top − bottom)` con `overflow-y-auto`.

- **[5] components/AppShell.tsx:186-209 (+ wishes/Ballot.tsx:173, wishes/WishesPage.tsx:411, rpd/RpdPage.tsx:362) —
  el botón flotante y las barras pegadas abajo pueden tapar entero el control que recibe el foco (2.4.11 Foco no
  oculto, AA, nuevo en 2.2).** Al tabular o al avanzar con el lector, el navegador desplaza lo justo para que el control
  quede en el borde de abajo. Ahí lo cubren:
  - el botón flotante (56×56, a 16 px de la esquina), que tapa entero un icono de 44 px pegado a la derecha, como la
    papelera de cada fila de la bolsa o los botones ⋯ de las tarjetas;
  - la barra «Votar» o «Elegir para votar» (unos 60–72 px), que tapa la candidata o la tarjeta siguiente.

  No hay `scroll-padding` en ningún sitio.
  **Arreglo:** mientras se vea el menú rápido, `scroll-padding-bottom: calc(88px + env(safe-area-inset-bottom))` en
  `<html>`, puesto desde AppShell igual que `--fab-clearance`. Mientras se vea una barra pegada, ese valor más su
  altura (una variable que la propia barra sube y baja).

- **[5] features/studio/ZoomControls.tsx:27-40 — con el dedo, la imagen ampliada solo se mueve arrastrando (2.5.7,
  AA). Viene de A11Y-09 y sigue abierto.** El punto 7 quitó los botones y la revisión del estudio añadió «Ampliar» para
  cumplir 2.5.1. Pero «Ampliar» siempre amplía alrededor del mismo sitio, y mover el encuadre sigue pidiendo arrastrar.
  Las flechas solo funcionan con teclado.
  **Arreglo:** una alternativa de un toque sin arrastrar. Por ejemplo: con el zoom puesto, en la fila del zoom, un
  «Mover» que abra cuatro flechas de 44 px usando `keyZoom`. O que el doble toque sobre un punto amplíe ese punto, con
  «Ver completo» para volver.

- **[4] features/record/StartPicker.tsx:103-107, RecordStudio.tsx:2388 (+ StudioPage.tsx:972, :981, :1278) — texto
  pequeño sobre la cámara o el vídeo, por debajo de 4,5:1 cuando la imagen es clara.**
  - «Empieza en» (nuevo): 9,5 px en `washi/80`, sin fondo, solo con sombra de texto. El valor va a 11 px. Es lo más
    pequeño de la app y sale sobre la imagen de la cámara.
  - Botones de lente (rehechos en P23): 12 px en `washi/90` sobre `black/45`. Sobre una pared blanca da 2,6:1.
  - Chips «YouTube» y «Solo en este móvil · Subir a la nube» (el estilo ya existía): 11 px en `washi/75–85` sobre
    `black/55`, unos 3,0:1. Además miden unos 24 px de alto, menos de los 44 px que pide el proyecto.

  **Arreglo:** el fondo del texto a `sumi-900/90` (da 7,8:1 aunque la imagen sea blanca). Para «Empieza en», 11 px con
  el valor a 12 px dentro de una pastilla. Para los chips, `min-h-11`, o un área de toque ampliada con `before:` como en
  el resto del estudio.

- **[4] features/lab/DesignLabSection.tsx:141-148 — «Usar esta» desaparece al pulsarlo y el foco cae al `body`.** El
  botón se cambia por «Es la que usas» (un `<p>`), y esa confirmación está fuera de la región viva, así que el lector no
  dice nada.
  **Arreglo:** pasar el foco a esa línea (con `tabIndex={-1}`) o meterla en el `aria-live` de debajo. Mejor aún: dejar
  el botón en su sitio, desactivado con `aria-disabled` y con el texto «Es la que usas».

- **[4] features/nav/prototypes/NavHanafuda.tsx:178 + navRules.ts:104 — los nombres de las cartas no caben a 360 px ni
  con la letra grande.** El rótulo va a 10,5 px dentro de una carta de 56–65 px de ancho y alto fijo (×1,6), con
  `overflow-hidden`.
  - A 360 px (carta de 65 px, 57 de hueco), «Biblioteca» ronda los 60 px y sale cortada.
  - A unos 300 px (página ampliada, carta de 56 px), se cortan «Biblioteca», «Próxima cover» y «Random Play».
  - Si además crece el texto, la segunda línea se sale por abajo.

  En «Sensu» pasa algo parecido, aunque menos grave: con poca altura (`compact`, r < 250) cada nombre se queda en unos
  54 px y se trunca. El nombre accesible está completo, pero quien ve la pantalla no lo lee entero.
  **Arreglo:** en Hanafuda, quitar el icono en las cartas de menos de 64 px y dejar el kanji a 24 px para que el nombre
  tenga dos líneas a 11 px, con `hyphens: auto` y `lang="es"` para que las palabras largas se partan. Comprobarlo a
  300 px.

- **[3] features/voice/SeparateVoiceButton.tsx:135-142, :190-192 — al terminar la separación se anuncia lo mismo tres
  veces.** Suenan el aviso «Listo: …», luego el foco sobre el `<p>` y además ese `<p>` lleva `role="status"`. Al quitar
  las pistas pasa algo parecido: el aviso y el foco.
  **Arreglo:** quitar `role="status"` del `<p>` (ya recibe el foco) o no lanzar el aviso cuando el foco ya va a esa
  línea.

- **[3] features/studio/CloudCopyStatus.tsx:116, :158 (+ StudioPage.tsx:429 y LinkFilePanel) — dos regiones vivas con
  el mismo texto.** Con el diálogo del archivo abierto y una copia en marcha, están montadas a la vez la fila del
  estudio y la del panel (el diálogo no deja inerte lo de debajo). Las dos dicen las mismas fases, y también «Copia
  subida».
  **Arreglo:** que solo anuncie una, por ejemplo con `announce={variant === 'panel' || !linking}`, igual que se hizo con
  `fsHosts` en seguir a un bailarín.

- **[3] features/bags/BagPage.tsx:774, :755 — la lista «Fuera» y la confirmación de borrar.**
  - La fila de «Fuera» lleva `opacity-80`, y su segunda línea (12 px, `washi-subtle`, «Salió el…») baja a 4,26:1 sobre
    el papel. Arreglo: quitar la opacidad (el tachado ya marca lo que ha salido) o pasar esa línea a `washi-muted`.
  - Borrar en dos toques caduca ahora a los 4 s (antes a los 2,6 s, A11Y-12). Al lector le cuesta llegar a tiempo, y
    cambiar el `aria-label` del botón que tiene el foco no siempre se anuncia. Arreglo: que no caduque mientras el
    botón tenga el foco y que «Confirmar: borrar…» se diga en una región viva. O un deshacer en el aviso.

- **[3] Copys incoherentes en lo nuevo.**
  - `StudioPage.tsx:985` dice «Solo en este móvil · Subir a la nube», mientras que la ronda cambió a «dispositivo» en
    `LinkFilePanel` y `CloudCopyStatus.tsx:197` («Solo está en este dispositivo»). Hay que elegir una palabra.
  - `RecordStudio.tsx:2416`: el botón dice «Borrar», pero su nombre accesible y el diálogo dicen «Descartar la toma».
  - `RecordStudio.tsx:1990`: el botón dice «Flash», pero su nombre es «Encender/Apagar la linterna». El nombre no
    contiene el texto visible (2.5.3, A): Voice Access no lo encuentra si dices «Flash». Arreglo: «Encender el flash» /
    «Apagar el flash».
  - `BagPage.tsx:376/:398`: «Uno menos» y «Uno más» no dicen de qué (ya venía de A11Y-15). Arreglo: «Sacar uno menos a
    la vez» y «Sacar uno más a la vez».
  - `voice/controlParts.tsx:52`: la pista de «Sin voz», «Baja la voz centrada (en mono)», ya no es verdad cuando hay
    pistas separadas con IA. Arreglo: un texto neutro, «La canción sin la voz».

- **[3] features/wishes/Ballot.tsx:173-193 — a 360 px y con letra grande, la barra pegada de la papeleta ocupa mucho.**
  Tiene «Cambiar voto» (lg), «Retirar mi voto» y «Deshacer cambios». Si se le resta el hueco del botón flotante (72 px),
  queda un ancho de unos 180–250 px, así que los botones pasan a 2–3 filas. La barra llega a unos 170 px pegados en una
  pantalla de unos 600 px. No tapa nada, pero deja poca lista a la vista.
  **Arreglo:** dejar «Retirar mi voto» y «Deshacer cambios» como enlaces debajo, fuera de la barra, o juntarlos en un ⋯.

- **[2] features/nav/quickNavCore.tsx:276-278, :335-340 + prototipos (`role="group" aria-label="Secciones"`) — el
  lector oye «Secciones» dos veces (el diálogo y el grupo).** Además, el botón no dice que abre un diálogo. Arreglo:
  quitar el nombre al grupo interior (o el rol), y poner `aria-haspopup="dialog"` en el botón. La alternativa sin
  prototipo (`QuickNav.tsx:160-181`) no atrapa el Tab. Se puede usar `trapFocusIndex`, como en los prototipos.

- **[2] features/rpd/RandomPlayScreen.tsx:110 — `aria-label` en un `span` sin rol** (la cuenta atrás «Empieza en 3»).
  No se lee. Basta con el anuncio del clip que ya existe; quitar el `aria-label` o poner `aria-hidden`.

- **[2] features/lab/DesignLabSection.tsx:121-128 — a 360 px, el nombre de la propuesta elegida se trunca por la
  etiqueta «En uso»**, por ejemplo «D · Seigaiha…» o «Rueda de ka…». La descripción de debajo lo da completo; una
  columna en `max-[400px]` lo arreglaría.

- **[2] Sigue abierto de nav-lab ronda 1:** los avisos (abajo en el centro, z-100) tapan el botón flotante mientras se
  ven. Y el Esc en pantalla completa nativa sigue sin cambiar (seguir, ronda 2, punto 17).

- **[4] Fuera del alcance (anterior a la ronda, decisión de 2fa8679): `apps/web/index.html:5` lleva
  `maximum-scale=1.0`.** Bloquea el zoom con los dedos en Android (en iOS no se hace caso), así que quien ve poco solo
  cuenta con la letra del sistema (1.4.4). Lo anoto porque obliga a que todo lo anterior funcione con la página
  ampliada. Si el motivo era el pellizco del vídeo, ya lo resuelve `touch-action` en el escenario.

### Lo que está bien (sin hallazgo)

- **Menú flotante:**
  - El núcleo es común a los 4 prototipos. Tiene diálogo con nombre, foco dentro (primero la sección actual), Tab
    atrapado, Esc, «Atrás» de Android (con `replace` al elegir, para que «Atrás» vuelva a la página de origen), tocar
    fuera para cerrar y foco devuelto al botón.
  - El botón dice dónde estás («Secciones. Estás en …»), mide 56 px y va dentro de la zona segura.
  - Se oculta en `/v/`, en la ronda y en pantalla completa. `--fab-clearance` y el relleno de `main` evitan que tape el
    final de la página y las barras pegadas.
  - El nombre accesible de cada entrada contiene su texto visible.
- **Movimiento:** «reducir movimiento» está bien cubierto en todo lo nuevo. Lo hacen tres cosas:
  - `MotionConfig reducedMotion="user"`;
  - ramas `reduce` en los prototipos (abanico, cartas, dial, origami), en la bola, el tambor, Koyomi, Sunadokei, Tsuki,
    Chōchin (sin balanceo ni parpadeo), en la ronda y en la barra de progreso;
  - CSS para las olas (`waves.css`), la estantería y la regla global.
- **Contrastes que pasan:**
  - el número de pausa (`GapBadge`): 5,6:1;
  - washi sobre `shu-600` (varillas, sellos, origami): 5,0:1;
  - «En uso» en el laboratorio: 4,5–4,7:1;
  - la cabecera del panel de seguir: 6,9:1;
  - la cuenta atrás de la ronda y los chips de la votación.

  Los kanji de las cartas en `shu-300/shu-700` dan 3,3:1, pero son texto grande y decorativo.
- **Seguir en pantalla completa:** diálogo con título, foco dentro, Tab atrapado, Esc, «Atrás», toque fuera sin efecto
  sobre el vídeo y una sola región viva.
- **«Empieza en»:** diálogo con flechas, Inicio y Fin y una sola parada de Tab; «Atrás» cierra la lista.
- **Abanico del grabador:** el chip de calidad abre su grupo y «Imagen» pasa el foco al panel de imagen.
- **Separar voz:** el foco no se pierde en ningún paso.
- **Pestañas:** las de la bolsa tienen flechas, Inicio y Fin; las de Próxima cover, flechas.
- **Ronda:** lo de fuera está inerte, hay una sola región viva y los objetivos son de 48 px o más.

## Veredicto

**Sí, queda uno de 6 o más: [6] la «Rueda de kamon» exige arrastrar para llegar a la mitad de las secciones (2.5.7).**
Hay que corregirlo antes de que el responsable pueda elegir ese prototipo, o retirarlo del laboratorio. Conviene hacer
en la misma pasada los tres [5]:

- Origami en horizontal con la página ampliada;
- `scroll-padding` para que el botón flotante y las barras no tapen el foco;
- mover el zoom sin arrastrar.

Los [4] (texto sobre la cámara, «Usar esta», nombres de Hanafuda) cuestan poco.
