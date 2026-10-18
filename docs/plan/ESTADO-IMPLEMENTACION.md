# One Shoot · Estado de la implementación

Documento para leer al volver. Sin código: qué hay, cómo probarlo, qué se ha decidido y qué queda.
El día a día está en [PROGRESO.md](PROGRESO.md).

## 1. Resumen

| Bloque | Funcionalidad | Estado | Notas |
| --- | --- | --- | --- |
| Grabación | Pasos 1–6 (Q1–Q8, C1–C5, S1–S3, R1–R5, A1) | **Hecha y desplegada** (16-10 17:33) | Falta probar en los Samsung (apartado 2) |
| Ideas | F1 Archivo vinculado · F2 Quién es quién | **Hechas y desplegadas** (16-10 18:13) | 3 rondas de revisión; migraciones aplicadas en Supabase |
| Ideas | F3 Tomas · F4 Mejor toma · F17 Voz y música | **Hechas y desplegadas** (16-10 19:14) | 2 rondas de revisión; migración `takes` aplicada |
| Ideas | F5 Repaso · F6 Notas sobre la toma · F7 Aplauso | **Hechas y desplegadas** (16-10 21:58) | 1 ronda de revisión por feature (repaso y notas en dos informes, aplauso en otro) con correcciones. Lo que queda, en el apartado 5. El aplauso no se ha probado en un iPhone ni en un Android reales |
| Ideas | F8 Clips en tomas · F9 Zoom | **Hechas y desplegadas** (17-10 00:01) | 1 ronda de revisión con correcciones. Migración `clip_zoom` aplicada |
| Ideas | F10 Seguir a un bailarín y prueba de postura con IA | **Retirada** (18-10, ronda 2, punto 45) | La función y la prueba de postura de Ajustes se han quitado de la app, con sus modelos y dependencias. La tabla `follow_paths` sigue en la BD, sin uso (borrar = archivar). Antes: desplegada el 17-10 00:01 con 1 ronda de revisión |
| Ideas | F18 | No se hace | No está definida en el plan (ver PREGUNTAS) |
| Grupo | F13 Bolsas · F14 Random Play Dance | **Hechas y desplegadas** (16-10 21:58) | 1 ronda de revisión (BD e interfaz) con correcciones |
| Grupo | F11 Votaciones · F12 Lista de deseos | **Hechas y desplegadas** (17-10 00:01) | 1 ronda de revisión (BD e interfaz, dos informes) con correcciones. Migraciones `wishes_and_polls`, `close_poll_zero_votes` y `close_poll_live_rank` (17-10 02:16) aplicadas |
| Grupo | F15 Reacciones · F16 Cuenta atrás | **Hechas y desplegadas** (17-10 00:01) | 1 ronda de revisión con correcciones. Migración `events_and_reactions` |
| Mejoras | 39 puntos de la prueba manual (MEJORAS-PRUEBA-MANUAL.md) | **Hechos** (17-10, commits 2a29b94 a 0e6df92) | Revisiones con nota por bloque (2–3 rondas) y global (2 rondas); 6 diseños en el laboratorio para que elija el responsable. Migraciones `20261017120000`, `130000` y `140000` |
| Mejoras | Ronda 2 de la prueba manual (puntos 40–54) | **Hecha** (18-10) | 2 rondas de revisión por bloque; todo lo ≥6 corregido (tomas y repaso necesitaron 4 rondas más una de cierre de «Atrás»). Sin migraciones. Falta probar en iPhone y Android (apartado 5) |
| Todo | Revisión global, rendimiento y verificación en producción | **Hecha y desplegada** (17-10 02:47) | 4 revisores (funcional, BD, rendimiento, accesibilidad); ninguno ≥6 en funcional y BD; lo ≥6 de accesibilidad y rendimiento corregido. Prueba manual de todo en producción con datos «PRUEBA», ya archivados (apartado 9) |

## 2. Cómo probar

### Grabación · pasos 1 y 2 (en un Samsung con la app instalada)

1. **Panel «i».** Abre una canción → «Grabar» → botón «Info» en la columna de la derecha. Comprueba:
   resolución real, fotogramas, zoom de lente (mínimo y máximo), qué controles ofrece la cámara, el formato
   (HEVC o H.264 High) y la compresión pedida. Apunta lo que salga en cada móvil (S24, S24 Ultra, S25).
2. **Formato.** En el mismo panel, «Formato preferido»: *Automático* (HEVC si el móvil puede) o *Compatible*
   (siempre H.264). Graba 20 s con cada uno y comprueba que el vídeo se ve en la Galería, en WhatsApp y en el
   ordenador. Si HEVC no se ve en algún sitio, deja *Compatible*.
3. **Calidad real.** Tras grabar, «Detalles» en la pantalla de repaso: «Compresión real (total)» debería
   acercarse a la pedida (12 Mbps a 1080p 30, 18 a 1080p 60). Compara con la prueba 2 del plan (vídeo de
   referencia de la app Cámara).
4. **Zoom.** Pellizca la vista previa y usa los botones 1×/2×/3×/5×. Si sale el aviso «Zoom digital: menos
   nitidez», ese zoom no es de la lente.
5. **Toma que sobrevive a un cierre.** Empieza a grabar, espera 20 s y cierra la app a la fuerza (multitarea →
   deslizar). Vuelve a abrir la misma canción y «Grabar»: debe aparecer «Hay una toma sin guardar de esta
   canción» con su tamaño. «Recuperar» la abre en el repaso para guardarla.
6. **Espacio.** En la línea de abajo del grabador sale «espacio para unos N min» para la calidad actual. Con el
   móvil casi lleno aparece un aviso en rojo.

### Ideas · F1 y F2 (en producción)

15. **Miembros (F2).** Ajustes → «Miembros del grupo» → «Añadir miembro» con nombre y color. En el menú rápido de abajo a la derecha (móvil) o abajo a la izquierda
    (escritorio) sale «¿Quién eres?»: elige tu nombre. Se recuerda en ese móvil.
16. **Archivo de un vídeo de YouTube (F1).** Abre una canción de YouTube → «Añadir archivo» → elige el mismo vídeo
    descargado por tu cuenta (la app no descarga nada de YouTube). Si dura distinto, avisa. Luego «Sincronizar»:
    reproduce los dos y pulsa en el mismo golpe de música; ajusta con ±. Desde entonces el selector
    «YouTube | Archivo» cambia de uno a otro en el mismo punto. Hasta 50 MB se sube a la nube para todo el grupo;
    más grande, el dispositivo hace una copia más ligera para el grupo y se queda con el original (mejora 13).
17. **Cambiar / quitar archivo:** en el mismo panel. «Cambiar» elige el nuevo antes de quitar el viejo y, si falla,
    deja el anterior.
18. **Duplicados:** al añadir un vídeo con un título parecido a otro de la biblioteca, sale «¿Es la misma
    canción?». Las tarjetas con archivo llevan la marca «con archivo».

### Ideas · F3, F4 y F17 (en producción)

19. **Guardar una toma (F3).** Graba una toma → en el repaso, «Guardar en «Tomas»». Debe salir «Guardada en «Tomas»
    de esta canción». Cierra el grabador y abre la pestaña «Tomas» del estudio: está ahí con quién, cuándo, desde qué
    segundo y a qué velocidad. Recarga la página: sigue ahí y se reproduce. Sin red, «Guardar» avisa y se puede
    reintentar.
20. **Filtros y descarga:** filtra por persona y clip (los de fecha se quitaron en la ronda 2, punto 50);
    «Descargar» desde la lista (en iPhone abre la hoja para guardarla en Fotos).
21. **Mejor toma (F4):** la estrella marca una por persona y tramo; aparece primera; «Limpiar» borra las que no
    tienen estrella.
22. **Compartir con el grupo:** «Compartir» hace una copia de 720p (≤ 50 MB) y la sube. En otro móvil se ve «En la
    nube» y se puede reproducir y descargar. El espacio real (vídeos y tomas) sale en la hoja «Compartir»; el aviso
    «Nube del grupo» solo aparece con la nube al 80 % o más (ronda 2, punto 50).
23. **Voz y música (F17):** con un vídeo de archivo, la fila «Voz y música» del estudio: «Todo», «Sin voz» (baja
    la voz del centro; sale en mono) y «Voz» (el centro al frente). Con YouTube la fila explica que no se puede.
    Graba con «Sin voz»: el grabador dice «Con la canción sin voz» y la toma suena así.

### Grabación · pasos 3 a 6

7. **Cámara al abrir:** abre siempre la última cámara usada (la trasera la primera vez), en su lente principal (1×).
   Ya no hay ajuste «Cámara al abrir» (mejora 25). Tocar el chip «1080p · 60 · …» de arriba abre solo «Calidad».
8. **60 fps:** con «Fotogramas 60» el chip debe decir «· 60 ·». Si la cámara no da 60 a esa resolución, sale un
   aviso y el chip se pone dorado.
9. **4K:** Calidad «Máxima» pide 4K a 30. Comprueba en «i» la resolución real y que la toma no se corte en
   10 minutos (calor: a los 6 min sale un aviso).
10. **Imagen directa:** en la app instalada, una toma sin zoom digital graba la imagen de la cámara tal cual (el
    panel «i» dice «Directa»). Gira el móvil a mitad: la pantalla no rota durante la toma. En el navegador (sin
    instalar) la toma va «por lienzo». Graba una en vertical y otra en horizontal y comprueba en la Galería que
    salen derechas.
11. **Enfoque y luz:** toca un punto de la imagen (anillo dorado) y mantén pulsado para fijarlos («Enfoque y luz
    fijos»). Botón «Imagen»: luz −2 a +2 y color de la luz (Auto, Fría, Día, Cálida, Muy cálida; los nombres dicen
    el tono que toma la imagen). Volver a «Auto» puede reiniciar la cámara un momento. Solo aparece lo que ofrezca
    la cámara (ronda 2, punto 48).
12. **Sonido:** con un vídeo de archivo, toca la píldora de sonido de arriba para cambiar entre canción limpia y
    micro (estéreo). Comprueba en la toma que se oye lo elegido y va sincronizado.
13. **Rejilla y nivel:** actívalos en Ajustes del grabador; el nivel se pone dorado con el móvil recto.
14. **Recuperación:** como en el punto 5, también tras un cierre en mitad de la toma en la app instalada.

### Pruebas nuevas

Cada apartado dice si basta con el navegador o si hace falta un móvil de verdad. Los pasos siguen la numeración
de arriba.

### Repaso y notas · F5 y F6 (navegador)

24. **Repaso (F5).** Hace falta una toma guardada de una canción con archivo. Con YouTube, «Superpuesto» sale
    desactivado. En el estudio, pestaña «Tomas» → «Reproducir la toma» de la tarjeta. Se abre el repaso con la
    toma y el original sincronizados: el desfase del archivo vinculado (F1) se aplica solo. En «Cómo comparar»
    eliges «Apilado» o «Superpuesto». En «Superpuesto», arrastra el original para encajarlo; la rueda cambia su
    tamaño y las flechas lo mueven. Prueba «Velocidad común», «Qué se oye» (la toma o el original), «Toma en
    espejo» y «Original en espejo», y la sincronía con «Retrasar el original 0,01 s» y «Adelantar el original
    0,01 s». Con «,» y «.» avanzas por fotogramas. Con «Marcar A (inicio del tramo)» y «Marcar B (fin del tramo)»
    repites un tramo. Cierra con «Cerrar el repaso» o con Escape. En el móvil, los ajustes salen con «Ajustes del
    repaso»; en el ordenador están a la derecha. El repaso se rehízo en la ronda 2 (punto 51): ver la prueba 59.
25. **Notas sobre la toma (F6).** En el repaso, pausa en el momento y pulsa «Nota en este momento (N)». Escribe el
    texto. Si quieres, elige una categoría (Tiempo, Brazos, Piernas, Dirección o mirada, Espacio, Expresión o
    Energía) y dibuja con «Dibujar sobre el fotograma». En «Para quién» queda quien grabó la toma, o eliges otra
    persona. «Guardar nota». Aparece un punto en la barra de tiempo: al tocarlo se abre la tarjeta, donde la
    marcas «Resuelta» o «Pendiente» y puedes «Editar». En la canción, una nota para otra persona solo la ve
    su destinatario. Para comprobarlo, cambia de persona en «¿Quién eres?».

### Aplauso · F7 (hace falta un móvil)

26. **Armar con un aplauso (F7).** Hace falta un móvil con cámara y micrófono. En el navegador de escritorio solo
    se puede probar con el micrófono falso. En el grabador, con la canción cargada y la cámara lista, aparece
    «Armar» (solo con el grabador en reposo). Se abre «Grabación armada: esperando el doble aplauso». Pon el móvil
    en el suelo o en un trípode, aléjate unos metros y da dos palmadas: empieza la cuenta atrás y la toma. Cancela
    con «Cancelar» o con Escape. Tras una toma que empezó con aplauso aparece «Armar otra vez». Si no llega señal
    en 3 minutos, se desarma solo.
27. **Sensibilidad del aplauso.** En Ajustes del grabador › Sonido: Baja, Media (por defecto) o Alta. Vuelve el
    detector de antes de la mejora 21 (ronda 2, punto 42). Prueba cada una a varias distancias y anota desde dónde
    dispara. «Media» promete dos palmadas normales a unos metros, y esa distancia no está medida (apartado 5). Si no
    dispara, prueba «Alta» y mira la marca roja del medidor. Con «Información técnica» activada, el panel «i» lista
    los últimos sonidos juzgados y por qué se rechazaron.

### Clips y zoom · F8 y F9 (navegador; el pellizco, en el móvil)

28. **Clips dentro de una toma (F8).** Abre en el repaso una toma de una canción que tenga clips. En «Ajustes del
    repaso», «Tramos de la canción en esta toma» lista los clips que caen dentro de la toma. Elige uno: la toma y
    el original repiten ese tramo a la vez. Si marcas A y B, «Guardar el tramo como clip» o «Guardar como clip»
    abren el diálogo «Guardar clip» con el tramo, su velocidad y el espejo. El clip aparece en la lista de clips
    del estudio.
29. **Zoom (F9, mejora 7).** En el móvil el zoom es solo con los dedos (ronda 2, punto 44): no hay fila «Zoom» ni
    flechas, solo la línea para guardar o quitar el zoom del clip. Lo que sigue es para el ordenador, con ratón.
    Con un archivo, pellizca el vídeo con dos dedos (también en pantalla completa) o usa
    «Ampliar» en la fila «Zoom»; la fila muestra el porcentaje y «Ver completo» solo con zoom. Antes había «Reducir el zoom», el porcentaje,
    «Ampliar el centro del vídeo» y «Ver completo». Con la rueda o arrastrando amplías y mueves. Con dos dedos
    (en el móvil) también. Doble clic o doble toque vuelve al vídeo entero. Con el foco en el vídeo: «+» amplía,
    las flechas mueven la vista si hay zoom, «−» reduce y «0» muestra el vídeo entero. Guarda un clip con zoom
    con «Guardar con el zoom» en el diálogo «Guardar clip»: el clip se abre ampliado y la lista muestra una lupa.
    «Quitar el zoom del clip» lo borra. Con YouTube la fila sale desactivada.

### Seguir a un bailarín y prueba de postura · F10 (retirada)

30–31. **Retiradas** (18-10, ronda 2, punto 45): la app ya no tiene «Seguir a un bailarín» ni la prueba de postura.

### Votaciones y lista de deseos · F11 y F12 (navegador; para votar a la vez, dos pestañas o dos móviles)

32. **Votaciones (F11).** Menú «Próxima cover» (/deseos) → «Nueva votación». Puedes marcar antes las candidatas
    con «Elegir para votar» (hacen falta dos propuestas). Pon título, candidatas y tipo («Un voto», «Varios votos» o
    «Ranking») → «Crear votación». Desde la ronda 2 (punto 52) no hay más opciones: resultados en directo, votos con
    nombre y cierre a mano. Para votar, pon tu nombre («Elegir mi nombre para votar») y
    «Votar». Luego «Cambiar voto» o «Retirar mi voto». En ranking, «Subir» y «Bajar». «Cerrar votación» →
    «¿Cerrar la votación?»: el servidor cuenta y elige la ganadora. Con empate salen «Sorteo entre empatadas» y
    «Segunda vuelta». La ganadora ofrece «Añadir a la biblioteca», «Abrir en el estudio» y «Meter en «Próxima
    coreo»».
33. **Lista de deseos (F12).** En «Próxima cover», «Proponer canción» → pega el enlace de YouTube. El título, el
    grupo y la miniatura salen solos → «Proponer». Cada persona pulsa «Me apunto» (si no sabe quién es, sale
    «¿Quién eres?»). La lista se ordena por interés. En el menú «Más acciones de «…»» de una propuesta está
    «Añadir a la biblioteca»: la canción pasa a la biblioteca y sale de la lista. Si la propuesta está en una
    votación abierta, el aviso lo dice antes de borrarla.

### Bolsas · F13 (navegador)

34. **Bolsas (F13).** Menú «Bolsas» → «Nueva bolsa»: nombre, tipo (canciones, clips o personas), «Sin repetir
    seguidas» y la forma de sacar: «Se queda» (vuelve a la bolsa y puede volver a salir) o «Se quita» (sale de la
    bolsa hasta que la rellenes). Para meter algo, «Añadir a una bolsa» en la tarjeta de una canción o en la fila de
    un clip. Dentro de la bolsa: «Sacar» saca uno con su animación; «Sacar» con un número (N) crea una ronda de
    Random Play Dance con lo que salga; «Quitar de la bolsa» o «Devolver» deshacen el resultado; «Rellenar»
    devuelve todo cuando ya ha salido; «Sacar a mano» escoge uno. El historial dice qué salió, cuándo y si se quitó.

### Random Play Dance · F14 (navegador)

35. **Random Play Dance (F14).** Menú «Random Play Dance» (/rpd). En «De dónde salen los clips» eliges «Una bolsa»,
    «A mano» o «Canciones». Ajusta «Uno menos» y «Uno más» (número de clips), «Pausa entre clips», «Cuándo se ve
    el título» («Antes de sonar» o «Después (adivinar)»), la cuenta atrás y el espejo y la velocidad de cada clip.
    La mezcla se hace sola al cambiar la fuente o el número; «Volver a mezclar» la rehace. «Empezar» va fijo abajo; el resto, en «Más opciones». En la ronda: «Pausa» (o «Seguir»), «Repetir»,
    «Saltar», «Terminar» y «Pantalla completa». También Espacio, R y la flecha derecha. Al acabar: «Otra vez»,
    «Volver a mezclar», «Guardar como pista» y «Salir». Las pistas guardadas aparecen en la misma página.

### Reacciones · F15 (navegador, con dos identidades; también en dos móviles)

36. **Reacciones (F15).** Solo en tomas compartidas. En la pestaña «Tomas», la toma tiene que estar «Compartida»
    (botón «Compartir»). Bajo la toma salen 🔥 👏 💯 😂 con su contador; tocar añade o quita la tuya. «Quién»
    lista quién ha reaccionado. Si no sabes quién eres, sale «¿Quién eres?»; con «Ahora no», la reacción va como
    «sin nombre». Prueba con dos identidades: la reacción de una aparece en la otra.

### Eventos con cuenta atrás · F16 (navegador)

37. **Eventos (F16).** Menú «Eventos» → «Nuevo evento»: nombre, «Día y hora» y «Lugar (opcional)» → «Crear evento».
    La portada enseña la cuenta atrás al evento más cercano: «Faltan N días», las horas el último día y «Hoy» el
    día del evento. Un evento que empezó hace menos de 3 horas tiene prioridad sobre los próximos. Si no hay
    ninguno próximo, el de ayer sale como «Ayer» hasta 24 horas después. En la ficha del evento, «Repertorio» →
    «Añadir canciones» → «Añadir». Con el repertorio: «Crear bolsa de candidatas» y «Crear pista con los
    estribillos» (clips cuyo nombre dice estribillo, chorus, coro o hook). Las secciones «Próximos» y «Pasados»
    separan los eventos.

### Ronda de mejoras de la prueba manual (17-10, puntos de MEJORAS-PRUEBA-MANUAL.md)

Todo a 390×844, con toques. Lo que necesita cámara, micro o un archivo propio está marcado.

38. **Navegación (1, 2).** Abajo a la derecha, el botón redondo dice en qué sección estás. Ábrelo: las 5 secciones
    y «¿Quién eres?». Se cierra con «Atrás», tocando fuera o al elegir. En el «⋯» de arriba: Ajustes, «Instalar app»,
    Privacidad y «Versión N · fecha» con «Buscar actualización». En el estudio, la ronda y el grabador no sale.
39. **Laboratorio (17).** Ajustes → «Laboratorio de diseño»: desde la ronda 2 solo queda el menú rápido (P1: Sensu,
    Hanafuda, Rueda de kamon y Kakejiku); lo demás ya está elegido (apartado 7). Cada una con su demo; «Usar esta»
    la aplica en ese móvil.
40. **Estudio (3–12).** Sin botón rojo sobre el vídeo: tocar el vídeo pausa. Pantalla completa: un toque muestra
    los controles sin tirones. Pellizca para ampliar (solo con archivo) y arrastra; doble toque vuelve (las flechas,
    solo con ratón: ronda 2, punto 44). Bucle A–B sin pausa: la vuelta es inmediata. Mantén «Bucle»: el panel de pausa se ve entero. Lápiz de
    un clip: «Editar clip». «Guardar clip» cabe en media pantalla. «Fijar en la portada». Con archivo vinculado
    la canción abre con el archivo; la fila «Vídeo: Archivo | YouTube» está bajo la barra.
41. **Archivo de más de 50 MB (13, hace falta el archivo).** Vincúlalo: el dispositivo hace una copia más ligera
    para el grupo (barra, tiempo, «Cancelar») y sigue usando el original. En otro móvil la fila «Vídeo» dice
    «Copia del grupo · 720p». Con el grabador abierto, la copia espera.
42. **Seguir a un bailarín (14, 15).** Retirada (ronda 2, punto 45).
43. **Separar voz y música (18, en el ordenador con Chrome y un archivo).** «Separar voz y música» → confirmación
    (descarga del modelo de unos 120–172 MB la primera vez) → «Empezar». Al acabar, «Sin voz» y «Voz» suenan con las
    pistas en todos los móviles. «Quitar las pistas separadas» lo deshace.
44. **Grabador (19–27, hace falta el Samsung).** 1080p 60: vista previa fluida; panel «i» → «Fluidez» y «Retraso».
    «Descartar» deja la cámara lista. «Empieza en»: tocar cambia, mantener abre la lista con los clips. Lentes
    0,5× / 1× / 2×. Abre la última cámara usada. El chip de arriba abre solo «Calidad». Abanico con «Calidad» e
    «Imagen». Aplauso: Baja, Media y Alta, con el detector de antes (ronda 2, punto 42). Color de la luz: cambia al
    primer toque (opciones de la ronda 2 en la prueba 11).
45. **Bolsas (28–32).** En una bolsa de canciones, «Añadir» → «Buscar en YouTube»: entra en la bolsa sin pasar a la
    biblioteca; al salir en el sorteo, «Añadir a la biblioteca». Cabecera en una línea, sorteo y «Sacar» / «Añadir»
    a la vista, pestañas «En la bolsa», «Fuera» e «Historial».
46. **Random Play Dance (33, 34).** Crear ronda: fuente, cuántos y el orden ya mezclado; el resto en «Más opciones»;
    «Empezar» fijo abajo. La ronda: fondo de la app, tarjeta Kamishibai, controles grandes. «Salir» pregunta.
47. **Próxima cover (35–37).** «Proponer» con el buscador de YouTube. «Elegir para votar» con su barra. En la votación,
    la papeleta y «Votar» primero. Solo «Añadir a la biblioteca» lleva una propuesta a la biblioteca.

### Ronda 2 de la prueba manual (18-10, puntos 40–54 de MEJORAS-PRUEBA-MANUAL.md)

Primero en el móvil, con toques. La pantalla completa, siempre en **horizontal**: «cuando vemos el vídeo en pantalla
grande el móvil está en horizontal», dice el responsable. Lo que necesita cámara, micro o un archivo propio está
marcado.

48. **Diseños elegidos (40).** Una canción a más de 7 días: la portada enseña Tsuki (la luna crece); en la última
    semana, Chōchin. Voz y música del estudio: la ola partida. Menú «Bolsas»: Furoshiki, y el icono de bolsa,
    Fukubukuro. No queda ninguna otra variante.
49. **Laboratorio, solo el menú (41).** Ajustes → «Laboratorio de diseño»: solo sale el menú rápido. Prueba los
    cuatro: Sensu (entrada nueva: el abanico se abre de una vez, sin huecos entre hojas), Hanafuda, Rueda de kamon y
    Kakejiku (nuevo, pergamino colgante que se desenrolla). Origami ya no está. Prueba también Kakejiku en
    horizontal: el papel se enrolla y se desplaza.
50. **Aplauso (42, hace falta el móvil).** Arma la grabación y da dos palmadas a la misma distancia que en la primera
    prueba (la de antes de la mejora 21). Debe disparar en «Media» y en «Alta». Si no, apunta la distancia y la
    sensibilidad.
51. **Sincronía (43, hace falta el móvil y un archivo).** Graba con «Canción» a 1080p 60 y luego a 30, bailando a
    tempo. Mira la toma: los pasos tienen que caer a tempo, sin la imagen detrás de la música. Con «Información
    técnica», el panel «i» enseña la fila «Sincronía del sonido» (cuánto se ha retrasado el sonido y si se aplicó).
    Si aún se nota, Ajustes del grabador › Sonido › «Ajuste fino de sincronía»: súbelo si ves los pasos después de
    la música, bájalo si los ves antes (±150 ms, de 10 en 10, por móvil). Repite con «Micrófono».
52. **Zoom solo con los dedos (44, con archivo).** En el móvil no hay fila «Zoom» ni flechas. Pellizca y arrastra;
    doble toque vuelve. Con un clip activo sale solo una línea: «Guardar el zoom en «X»» si has ampliado, o «Quitar
    el zoom del clip» si el clip ya tiene zoom. En el ordenador, con ratón, la fila sigue.
53. **Sin «Seguir» (45).** El estudio y la pantalla completa no tienen fila ni botón de persona; Ajustes no tiene la
    prueba de postura. Los clips que se guardaron «siguiendo a X» se abren con su tramo, sin ampliar.
54. **Voz en pantalla completa (46, con archivo).** Pantalla completa en horizontal → botón de ondas arriba: un panel
    pequeño con «Todo», «Sin voz» y «Voz», sin tapar media imagen. Se cierra con «Cerrar», tocando fuera o con Esc.
    Con YouTube el botón no sale. Para oír la mejora de «Sin voz» en una canción ya separada: «Quitar las pistas
    separadas» y volver a separar; el worker escribe `[voice] residual …` en la consola.
55. **Salir de pantalla completa tras girar (47).** Entra en pantalla completa, gira a horizontal, vuelve a vertical
    y sal. La página queda centrada, sin hueco a la derecha ni desplazada. Igual en la ronda de Random Play Dance.
56. **Color de la luz (48, hace falta el móvil).** «Imagen» → color de la luz: Auto, Fría, Día, Cálida y Muy cálida.
    El nombre dice el tono que toma la imagen («Fría» azulea, «Muy cálida» da naranja). Ya no hay fluorescente (el
    tono lila). Cada toque cambia el tono al momento. Volver a «Auto» puede reiniciar la cámara un momento; la luz y
    el flash se conservan. Si un móvil no cambia el color, las opciones se ocultan y el tono vuelve de verdad a automático.
57. **Barra de luz (49, hace falta el móvil).** Toca para enfocar: junto al anillo sale una barra pequeña de luz.
    Arrastra arriba para más luz, abajo para menos. Se oculta sola a los 3 s; un segundo dedo la quita. No tapa
    botones ni la pantalla del aplauso.
58. **Tomas (50).** Pestaña «Tomas»: la toma del repaso sale primera, resaltada, con «Repasar con el original», y no
    se repite más abajo. Una sola entrada por toma. Sin los filtros de fecha (hoy, esta semana, todas). La «Nube
    del grupo» solo avisa si la nube está al 80 % o más.
59. **Repaso (51, hace falta una toma).** «Repasar con el original»: el play suena con el sonido de la toma desde el
    primer toque, y la toma y el original van a la par, sin saltos repetidos. Gira a horizontal: la toma y el
    original ocupan la pantalla, con los ajustes a la derecha. Arrastra la bisagra para repartir el sitio. Con
    YouTube, el reproductor nunca baja de 356×200 ni queda tapado. «Atrás» cierra solo lo de arriba (los ajustes o
    la nota); otro «Atrás» cierra el repaso. Prueba con YouTube y con archivo.
60. **Votaciones (52).** «Nueva votación»: solo título, candidatas y tipo. Resultados en directo, votos con nombre y
    cierre a mano con «Cerrar votación». Las votaciones antiguas mantienen su anonimato y su plazo.
61. **Random Play Dance, crear (53).** En el móvil la cabecera es una sola línea: «Random Play Dance» y «Pistas». Lo
    demás sube a la vista.
62. **Random Play Dance, ronda (54).** Empieza una ronda → «Pantalla completa» y gira a horizontal: solo el vídeo y
    la barra abajo, como en el estudio. Mientras suena, la barra se oculta sola; un toque en el vídeo la enseña.
    En la pausa y la cuenta atrás, la barra no tapa el pie de la tarjeta Kamishibai. «Reducir» sale de la pantalla
    completa. «Ver en YouTube» va fuera del vídeo.

## 3. DECISIONES

1. **F17 y F18.** El plan de ideas que se copió a `docs/plan/` no define F17 ni F18. F17 se toma del plan de
   grabación («separar la voz de la música»). F18 no se puede deducir: no se implementa y va a PREGUNTAS.
2. **Pruebas de base de datos sin Docker.** En este ordenador no hay Docker ni la CLI de Supabase. Se ha
   añadido `pnpm db:test`, que aplica todas las migraciones desde cero en un Postgres en memoria (PGlite) con
   una imitación mínima de Supabase y pasa las comprobaciones de `supabase/tests/`. No sustituye a probar en el
   proyecto real, pero detecta migraciones rotas.
3. **Pasos 1 y 2 de grabación se cierran juntos.** La revisión del paso 1 avisó de que subir la compresión sin
   guardar la toma en el almacenamiento del móvil (paso 2) podía llenar la memoria en tomas largas. Por eso se
   publican los dos a la vez.
4. **Toma escrita en trozos.** Chrome solo confirma un archivo grande al cerrarlo; si la app se cerraba a mitad,
   se perdía todo. Cada segundo de toma se guarda como un archivo pequeño y al final se juntan sin copiarlos en
   memoria. Si la app muere, se pierde como mucho el último segundo.
5. **Formato que falla.** Si el navegador dice que puede grabar HEVC o H.264 High pero el codificador del móvil
   falla, la app lo recuerda en ese móvil y la siguiente toma usa el siguiente formato. Alternativa descartada:
   volver siempre al formato básico (Baseline), que pierde la mejora de calidad.
6. **Cámara al abrir: la última usada** (mejora 25, 17-10). Antes, trasera por defecto (plan Q8) con ajuste para elegir; el ajuste se quitó.
7. **Pasos 1 a 6 de grabación se cerraron y desplegaron juntos.** Los seis tocan los mismos archivos del
   grabador y varios arreglos de revisión cruzaban pasos; desplegar a medias habría dejado versiones con fallos
   ya conocidos (por ejemplo, más compresión sin guardar la toma en el móvil).
8. **Despliegue desde la raíz del repositorio**, no desde `apps/web` como dice DEPLOY.md: la carpeta `apps/web`
   está vinculada en este ordenador a otro proyecto de Vercel llamado «web»; la raíz está vinculada a
   `kpop-covers`, que ya tiene `apps/web` como carpeta de la app. No se ha tocado ningún ajuste de Vercel.
   Para que cada despliegue sea exactamente `main`, se construye y despliega desde una copia limpia de `main`.
9. **Imagen directa solo con la rotación bloqueada.** Grabar la imagen de la cámara tal cual (Q5) solo es seguro
   si el tamaño no cambia a mitad; la app bloquea la rotación al empezar la toma. Eso solo se puede en la app
   instalada o a pantalla completa; si no se puede, la toma va por el lienzo (que sí aguanta un giro). En iPhone
   siempre lienzo (guardaba los vídeos tumbados).
10. **Formatos que fallan se recuerdan por familia** (HEVC, H.264 High…), 30 días y por versión del navegador, y
    se pueden volver a probar desde el panel «i».
11. **Diseños elegidos y laboratorio retirado (17-10; vuelve para 6 momentos nuevos, decisión 36).** Hubo un laboratorio de diseño con 3 variantes por momento.
    El responsable del producto eligió una por momento (apartado 7); las demás y el laboratorio se han quitado del
    código. Para la ronda de mejoras vuelve con otros momentos (decisión 36).
12. **Panel «i» oculto por defecto** (A1: «Información técnica, desactivado»). Se activa en Ajustes del grabador.
13. **Repaso: la toma manda el reloj.** El original sigue a la toma, con el desfase del archivo vinculado (F1). El
    ajuste fino de sincronía se guarda con la toma.
14. **El encaje de «Superpuesto» se guarda con la toma** (posición y tamaño) y se comparte con el grupo. Hoy
    queda relativo al marco de la pantalla, no a la toma (apartado 5).
15. **«Superpuesto» y el zoom no van con YouTube.** Solo con archivo. La app lo dice al pulsar y el zoom nunca
    toca el reproductor de YouTube.
16. **Notas como texto en la base de datos.** Las notas viajan con la base de datos, así que se ven aunque el
    vídeo esté en otro móvil. El dibujo es una imagen dentro de la nota, de hasta 60 000 caracteres.
17. **Notas: quién las ve.** En la canción, el filtro de la app solo muestra la nota a su destinatario. La base
    deja leer las notas a quien tenga la clave pública del proyecto, como el resto de datos del modelo sin login.
18. **Aplauso: un doble aplauso, no un ruido suelto.** El detector filtra los sonidos graves y pide un golpe
    brusco. Los pasos y las sílabas no deben disparar (apartado 5). El armado dura 3 minutos como máximo. El
    disparo sigue el mismo camino que el botón «Empezar a grabar».
19. **Sorteo de las bolsas en el servidor.** `draw_from_bag` elige, evita repetir seguidas y escribe el historial
    con la hora del servidor. El cliente no puede escribir sorteos ni historial.
20. **Bolsas: «Se queda» o «Se quita».** «Se queda» vuelve a la bolsa y puede volver a salir. «Se quita» sale de la
    bolsa hasta que se rellene.
21. **Votos solo por `cast_vote`.** El cliente no puede escribir votos ni poner la ganadora a mano. La función
    comprueba que la votación siga abierta, que la persona sea miembro del grupo y que las opciones sean válidas.
22. **`close_poll` cuenta en el servidor.** Un voto por persona: gana el más votado. Ranking: puntos (n − posición
    + 1). Sin votos, no hay ganadora. Una opción sin votos cuenta 0 (migración `close_poll_zero_votes`).
    Con empate, la votación no se cierra sola. Quien cierra elige «Sorteo entre empatadas» (una de las
    empatadas) o «Segunda vuelta» (votación nueva; la original se cierra sin ganadora).
23. **Votaciones: anónimo y resultados al cerrar son de presentación.** La app los respeta, pero la base deja
    leer los votos (lo dice la migración). Si hace falta secreto de verdad, habría que cambiar el diseño
    (apartado 5). La app no deja pasar de «Anónimos» a «Con nombre» con votos ya emitidos, y la base congela
    ese campo al cerrar.
24. **Borrar = archivar en las tablas nuevas.** Desde el cliente, borrar archiva. Así pasa con las tablas nuevas
    de esta fase (deseos, votaciones, eventos, reacciones y recorridos). Los archivos del bucket no se borran
    desde el cliente.
25. **Eventos: qué sale en la portada.** Primero, el evento que empezó hace menos de 3 horas. Después, el próximo.
    Si no hay ninguno, el de ayer hasta 24 horas después. Los eventos pasados van en «Pasados».
26. **«Crear pista con los estribillos».** Coge los clips cuyo nombre dice estribillo, chorus, coro o hook. No
    coge «Pre-estribillo» ni «Post-chorus».
27. **Reacciones «sin nombre».** Quien no tiene nombre comparte un hueco por emoji con los demás sin nombre. Quitar
    una reacción «sin nombre» puede quitar la de otra persona (apartado 5).
28. **Modelos de postura desde terceros.** Para MoveNet, la app baja los pesos de TensorFlow Hub, que redirige a
    Kaggle y a Google Cloud Storage. Los WASM de MediaPipe vienen de jsDelivr y su modelo de Google Cloud Storage.
    La política de privacidad lo dice: Kaggle puede poner una cookie al redirigir la descarga. Alojar los modelos
    en el propio dominio está pendiente (apartado 5).
29. **CSP en modo Report-Only.** `vercel.json` tiene la política en modo informe: avisa en la consola y no bloquea.
    Se han reducido los orígenes de jsDelivr y de Google Cloud Storage a las rutas que usa la app. TF Hub y Kaggle
    siguen como dominio completo. Pasar a modo obligatorio es otra decisión.
30. **Zoom y seguimiento no van juntos al guardar un clip.** Con el seguimiento activo, la opción de zoom fijo sale
    desactivada: el zoom va con el bailarín.
31. **Análisis de postura sin vídeo fuera del móvil.** El análisis lee el vídeo en el propio navegador. Solo se
    guardan el recorrido (puntos) y su etiqueta.
32. **Migraciones ya publicadas no se editan.** El arreglo de `close_poll` con cero votos es una migración nueva
    (`20261016080000_close_poll_zero_votes`), no un cambio de la `040000` ya aplicada.
33. **Listados completos.** La app pide las listas largas por páginas, porque PostgREST corta a 1000 filas por
    defecto. Así no se pierden las filas nuevas.

34. **Zoom con YouTube: no (mejora 7).** El responsable lo pidió, pero las condiciones de YouTube prohíben modificar,
    recortar o tapar su reproductor («You must not make changes to the YouTube player that are not explicitly described
    by the API documentation»; III.I.6). El zoom con los dedos va solo con el archivo vinculado.
35. **Vídeo limpio (mejora 4).** Sin botón propio encima del vídeo y sin los controles de YouTube (`controls: 0`), para
    no romper bucle, velocidad ni sincronía. YouTube sigue pintando su icono de pausa: no se puede quitar desde fuera.
36. **Laboratorio de diseño otra vez (mejora 17).** Temporal, en Ajustes, para P1 (menú rápido), F17 (olas), P29
    (icono de bolsa), P30 (lista de bolsas) y F16 (cuenta atrás larga). Por defecto se ve lo de antes o la primera
    propuesta. Cuando el responsable elija, se borran las demás y el laboratorio.
37. **Número de versión.** Se despliega con `pnpm deploy:prod`, que lanza un único `vercel --prod --yes -b APP_BUILD=<n>`
    con el número de commits de main; sin él la app dice «Versión de desarrollo».
38. **Separar voz con IA solo con el archivo (mejora 18).** HTDemucs (MIT) en ONNX con WebGPU, una vez por canción,
    en el ordenador. Las pistas (AAC, unos 5 MB cada una) suenan sincronizadas con el vídeo del archivo. Con YouTube no:
    sus condiciones prohíben separar o modificar su audio (III.I.7). El mid/side queda de respaldo.
39. **Copia más ligera para la nube (mejora 13).** Si el archivo pasa de 50 MB, el dispositivo lo recodifica (WebCodecs y
    un escritor MP4 propio) hasta quedar por debajo; el original se queda en ese dispositivo. El bucket `videos` ya
    impone en el servidor el tope de 1 GiB del grupo, dejando 50 MB para tomas.
40. **Trabajo pesado coordinado.** La copia para la nube, la separación de voz y el análisis de seguir nunca van a la vez
    y se pausan con el grabador abierto; una actualización de la app no recarga a mitad de uno de ellos.
41. **El grabador baja de calidad solo si se confirma.** Si un móvil no va fluido a 60 fps (o a 4K), lo dice y baja a 30
    (o a 1080p) solo tras dos medidas seguidas; las tomas directas se juzgan por el retraso. Se recuerda 30 días y se
    puede «Volver a medir».

**Ronda 2 de la prueba manual (18-10)**

42. **F10 retirada sin migración destructiva (punto 45).** La función, la prueba de postura y sus modelos se han
    quitado de la app. La tabla `follow_paths` y `clips.follow_path_id` siguen en la BD, sin uso: borrar = archivar,
    y no se borran datos del grupo. Al arrancar, la app borra del móvil la caché de los modelos y sus claves locales.
    Las decisiones 28, 30 y 31 ya no aplican.
43. **Zoom táctil solo con pellizco (punto 44).** Pedido por el responsable. En el móvil no quedan «Ampliar» ni las
    flechas, así que se renuncia en táctil a la alternativa de un solo dedo de WCAG 2.5.1 y 2.5.7. Quedan el doble
    toque, las teclas y, con ratón, la fila completa. Un revisor futuro no debe «arreglarlo». Sí se queda la línea
    para guardar o quitar el zoom de un clip, que no tenía otra vía en el móvil. Responde a la PREGUNTA 5.
44. **Votaciones con reglas fijas (punto 52).** Las nuevas son siempre en directo, con nombre y con cierre a mano. Las
    antiguas conservan su anonimato (los nombres siguen ocultos) y su plazo (la base las cierra a su hora). «Resultados
    al cerrar» ya no se respeta: el 18-10 no había en producción ninguna votación abierta con resultados ocultos ni
    anónima. La base sigue aceptando esas columnas; la regla la pone la app. Sustituye en parte a la decisión 23.
45. **Color de la luz por el tono de la imagen (punto 48).** Cuatro presets, como los de Chrome en Android: «Fría»
    (2850 K), «Día» (5000), «Cálida» (6000) y «Muy cálida» (7000). El nombre dice el tono que toma la imagen, no la
    luz de la sala. Sin fluorescente (4250 K, el tono lila). Cualquier modo manual cuenta como aplicado; si dos
    presets acaban en la misma temperatura, se enseña uno. Volver a «Auto» se comprueba y, si la cámara no vuelve,
    se reabre (nunca durante una toma) y se reponen la luz y el flash.
46. **Sincronía: se retrasa el audio de la canción al grabar (punto 43).** La imagen llega tarde (latencia del
    altavoz, de la cámara y, por lienzo, del dibujo), así que se retrasa la pista de audio que graba el
    MediaRecorder. Lo que suena y la vista previa no cambian. Con el micrófono solo se compensa la cámara. Los valores
    son estimados (unos 110–130 ms con la canción); hay un «Ajuste fino de sincronía» por móvil (±150 ms) y el
    panel «i» enseña lo aplicado. En iPhone el retraso va dentro del grafo de audio del motor, sin un segundo
    contexto. El cero corregido de la toma se guarda en `song_start_seconds`, así que el repaso, las notas y los
    clips usan el mismo cero en todos los móviles.
47. **Pantalla completa pensada en horizontal.** El responsable ve el vídeo en grande con el móvil girado. El panel de
    voz, la ronda de Random Play Dance y el repaso se diseñan y revisan sobre todo a 844×390 y 667×375. Al salir, la
    página se reajusta al ancho real (punto 47).
48. **Repaso: la toma manda y el original se corrige sin bucles (punto 51).** El play arranca la toma en el mismo
    toque; la toma no espera nunca al original. El original se acelera o frena un poco si se desfasa poco y salta si
    se desfasa más, con correcciones espaciadas, así que no hay bucles de saltos. YouTube nunca baja de 356×200
    (lo que pide su reproductor) ni queda tapado, sin recorte ni etiqueta encima; «Superpuesto» solo con archivo.
    Amplía la decisión 13.

## 4. PREGUNTAS

**Bloquean algo**

1. **¿Qué es F18?** El prompt la pone en la fase 1 de ideas, pero el documento de ideas no la describe. No se
   ha implementado nada.

**El resto**

2. **Borrar una toma compartida no libera espacio en la nube.** La regla del repositorio es «borrar = archivar» y el
   cliente nunca borra archivos del bucket; la especificación de F3 decía «Borrarla la quita de la nube». Se ha
   hecho: deja de verse y de poder leerse, pero el archivo sigue ocupando hasta que el administrador lo purgue. El
   medidor cuenta ese espacio. ¿Queréis una forma de purgar desde la app (solo para un administrador)?

**De la ronda de mejoras (17-10)**

3. **El reproductor de YouTube recortado y en espejo.** Desde antes, el iframe es un 24 % más alto que su marco para
   esconder el título y la franja de abajo, y el espejo lo voltea con CSS. Las condiciones de YouTube no permiten tapar
   partes del reproductor ni cambiarlo. ¿Lo dejamos así o se quita el recorte (y el espejo con YouTube)?
4. **Copia del grupo frente a YouTube.** En los móviles sin el original, ¿la copia ligera (720p) debe ganar a YouTube
   (que puede verse a 1080p), o mejor YouTube y la copia solo para el zoom, seguir y voz?
5. **Botón «Ampliar» del zoom.** Se dejó (y flechas para mover) para quien no puede pellizcar (accesibilidad), aunque el
   punto 7 pedía sin botones. ¿Se queda? **Resuelta (18-10):** en el móvil, no (decisión 43).
6. **Licencia del modelo de respaldo** (`timcsy/demucs-web-onnx`, para tarjetas sin fp16): su ficha no declara licencia
   (el código y Demucs son MIT). ¿Lo aceptamos o se usa solo el de `monteslu` (MIT declarada)?
7. **Cuenta atrás:** Chōchin empieza a 6 días (1 farolillo) para cubrir la semana con el día del evento; Tsuki va en una
   escala fija de una luna. ¿Os vale?
8. **Seguir con otro archivo a mitad:** si se cambia el archivo mientras se guarda un recorrido nuevo, se archiva ese
   recorrido. ¿Correcto? **Ya no aplica:** F10 retirada (decisión 42).

## 5. PENDIENTES

**Ronda 2 de la prueba manual (18-10).** Todo lo ≥6 está corregido. Queda por probar
en dispositivos reales, en un iPhone y en un Android (este ordenador no tiene cámara, micro ni GPU buena):
- Sincronía medida (punto 43): una palmada delante de la cámara con «Micrófono» y clics de metrónomo con «Canción»,
  por lienzo y directa, a 30 y 60. Con esos datos, fijar el retraso de la cámara y del altavoz, que hoy son
  estimados. En iPhone, además: pausa, llamada entrante y reanudar, y aplauso con «Canción».
- Color de la luz en el Samsung (48): que cada opción cambie el tono al primer toque y que «Auto» vuelva de verdad.
  Entre «Fría» (2850 K) y «Día» (5000 K) no hay ninguna opción intermedia.
- Barra de luz al tocar para enfocar (49): posición junto al anillo, zona segura y arrastre.
- Pantalla completa nativa con giro (47, 54): entrar, girar dentro y salir, en el estudio y en la ronda.
- Repaso con YouTube y con archivo (51): play desde el primer toque, cuántos saltos en un tramo de 3 s durante 30 s, y
  que el panel de YouTube no baje de 356×200, en vertical y a 844×390 y 667×375.
- «Atrás» en pantalla completa nativa con el panel de voz abierto (46): Chrome para Android sale antes de la pantalla
  completa, así que «Atrás» la cierra en vez de cerrar solo el panel. No se puede evitar desde la app; confirmar.
- Hallazgos de 1–2 que quedan en los informes `ronda2-*-2.md`: la separación tarda unos 140 ms más por segmento por
  el residuo, que casi nunca se salta (unos 13–22 s más en un móvil para una canción de 4 min; N5); «Atrás» en el
  modo CSS de pantalla completa (iPhone) pregunta «¿Salir de la ronda?» en vez de salir de la pantalla completa,
  igual que en el estudio.
- Tomas y repaso: los hallazgos de las rondas 2 a 4 (`revisiones/ronda2-tomas-repaso-*.md`) están corregidos, con
  «Atrás» rehecho en `lib/backLayers.ts` (id de carga, varias capas, diálogos que navegan con `replace`). Queda: si
  una capa se cierra sin ninguna capa abierta debajo mientras hay otra encima, su entrada cuesta un «Atrás» sin efecto
  (caso raro); con los ajustes abiertos en horizontal el panel tapa la toma (se ve a través al mover un deslizador);
  faltan pruebas del reloj del repaso y de `useSaveTake`.

**Ronda de mejoras de la prueba manual (17-10).** Todo lo ≥6 está corregido. Lo menor que queda (detalle y nota en
`revisiones/mejoras-*`):
- Sin probar en un móvil real (este ordenador no tiene cámara, micro ni GPU buena): el retraso del grabador a 1080p 60 y
  la prueba de fluidez (punto 19), lentes y flash (23), color de la luz (24), aplauso con ruidos reales (21), la
  sincronía de las pistas de voz tras cada vuelta del bucle (18, medir con un clic de metrónomo), la copia ligera en el
  móvil (13: tiempo, calor, pantalla apagada) y los tiempos de seguir con WebGPU, WebGL o WASM (15).
- Grabador: umbrales a ojo (caída del 25 % y +30 ms de retraso; 85 % en reposo); solo se mide la primera cuenta atrás
  de la toma (2).
- Estudio: menú de velocidad y A/B de 36–38 px a la vista (zona táctil de 44 con relleno) (2); tope de anticipación del
  bucle de YouTube (200 ms) sin medir con metrónomo (3).
- Seguir: margen de las máscaras y rechazo de cajas anchas sin medir con vídeo real (3); el primer medio segundo de una
  oclusión puede confundir a dos bailarines (3; «Corregir desde aquí»).
- Voz y nube: subidas en paralelo pueden comerse la reserva de 50 MB (2); las pistas suponen 16 MiB por archivo sin
  bucket propio (3); modelos sin sha256 (2, revisión fijada y tamaño exacto); la subida de la copia no se reanuda (4).
- Bolsas: un móvil con la versión anterior ve las canciones de YouTube de una bolsa como «No disponible» (2).
- Grupo: «Atrás» del sistema en la ronda pregunta, pero una capa abierta mientras otra se cierra deja a veces una
  entrada de historial de más fuera de la ronda (3).
- Rendimiento: precache con 84 entradas (1,9 MB), por encima de las 80 propuestas; el grabador pesa más porque ya no
  viene con el estudio (estudio + grabador bajan de 152 a 138 kB gzip).
- CSP en Report-Only (H10 de antes) con Hugging Face y `blob:` añadidos; `maximum-scale=1` en index.html (decisión
  de 2fa8679) impide ampliar la página con los dedos (4).

- Pruebas en dispositivo (Samsung): todas las del apartado 2. Dentro de ellas, las que exigen un móvil de verdad:
  el aplauso (F7: micrófono, cámara y distancia), los gestos de dos dedos (F5 y F9), los tiempos de la prueba de
  postura (F10) y las reacciones con dos móviles (F15). En iPhone, además, el aplauso y la cuenta atrás (F7, hallazgo 5).
- Hallazgos de revisión con nota menor de 6 sin corregir: ver apartado 8. Lo que sigue abajo sale de cada informe
  y de los commits; si algo no aparece aquí, no está confirmado como corregido.
- F1/F2 (ronda 3, todos < 6): si la vinculación falla justo después de guardar la copia nueva en el móvil, ese
  móvil puede quedar con la copia equivocada (5); si la subida falla durante «Cambiar archivo», el nuevo queda solo
  en ese móvil (5); «Quitar» y «Restaurar» no releen la ficha antes (4); el trigger de la 000200 deja algunos huecos
  a un cliente manipulado (3); «Volver a sincronizar» compara tamaños (3); las marcas de copia local no se limpian
  nunca (2). De rondas anteriores: R5 (4), R6 (3), R7 (3), consulta de administrador para limpiar archivos viejos
  del bucket (BD2), selector YouTube|Archivo de 36 px.
- F3/F4/F17 (ronda 2, todos < 6): faltan tests automáticos de `takeStore`, `useSaveTake`, `shareTake`, motor y
  almacén (5); tras un error dudoso al guardar se deshace la marca sin comprobar si la fila llegó (3); una carpeta
  con datos ilegibles y trozos ya no se borra pero tampoco se ofrece (3); `friendlyError` reconoce «0 filas» por
  texto (2); `DEPLOY.md` sin la receta de purga de tomas archivadas (2). De ronda 1: tomas huérfanas en un móvil si
  otra persona las borra (5), sin conexión con datos en caché (5), subida de «Compartir» sin cancelar (5), aviso de
  que Safari borra datos tras 7 días (5), «Voz» no aísla del todo la voz (5, textos ajustados), accesibilidad de
  chips y selector de fecha (4).
- F5 Repaso (ronda 1, < 6): el guardado de ajustes y de encaje no tiene reintento, y los errores al cerrar son
  mudos (5); el encaje superpuesto se guarda relativo al marco de la pantalla, no a la toma (5); zonas táctiles de
  36 px en el selector de modo, la velocidad, el sonido y la barra de tiempo (4); con YouTube, «Linterna» pinta
  bandas encima del reproductor (4); el store y el reloj de sincronía no tienen pruebas propias (4); la carga
  perezosa del repaso no tiene botón de cerrar ni salida si falla (3); rendimiento por cada movimiento del puntero
  (3); accesibilidad: el estudio sigue en el árbol de accesibilidad, el selector no tiene flechas y el marco del
  superpuesto no tiene el rol adecuado (3); `clampFit` deja el original fuera del marco (2); copys, transiciones con
  `duration` suelto y la URL de la toma que se libera mientras el vídeo sigue montado (2). Decisión pendiente: si
  la toma y el original empiezan los dos en espejo (3).
- F6 Notas sobre la toma (ronda 1, < 6): si quien grabó ya no está en el grupo, la nota se queda sin destinatario
  en silencio (4); `listNotes` baja también los dibujos de todas las notas (4); la reversión optimista restaura la
  lista entera y pisa cambios ajenos (4); el índice único `(video, segundo, texto)` choca entre una nota de toma y
  una de canción con el mismo texto (4); editar el destinatario de una nota de una toma archivada la hace pública
  (3); los puntos van en una barra y no en la ola de la toma (3); quien escribe una nota para otra persona no la ve
  en la canción (3); accesibilidad del lienzo y del compositor (4); detalles (2–3).
- F7 Aplauso (ronda 1, < 6): si el micro se corta o el contexto se suspende, el armado no avisa ni se recupera (5);
  el umbral de «Media» no está medido en móviles (5); tras el aplauso no hay gesto del usuario, con riesgo en iOS
  para la canción y la cuenta atrás (5; sin verificar, hace falta un iPhone); el armado no tiene trampa de foco ni
  devuelve el foco (3); transiciones con `duration` suelto en las figuras (2); faltan pruebas del escucha y de los
  flujos del grabador (3); el bloqueo de pantalla puede quedar sin soltar si llegan dos avisos seguidos (2). Ya
  corregidos: el desarme al cambiar de fase, la lectura con más ventana (4096) y los pasos y sílabas.
- F8 y F9 Clips y zoom (ronda 1, < 6): «Ampliar» y «Reducir» mueven la vista con vídeos que no son 16:9 (4); tocar
  para pausar con zoom tarda 300 ms (4); el teclado solo sirve con el foco en el vídeo, sin botones de mover (4); la
  rueda sin tecla amplía y roba el scroll de la página (3); la capa de zoom «patina» al cambiar el tamaño de la caja
  (3); un clip ampliado no se aplica en «Superpuesto» ni con YouTube (3); «Guardar como clip» no deja guardar el
  mismo tramo con otro zoom (3); el botón «Ampliar / Encajar» de «Superpuesto» mezcla `aria-pressed` con un nombre
  que cambia (3); faltan pruebas de `stepZoom` con barras laterales y de la restricción SQL del zoom (3); detalles (2).
- F10 Seguir a un bailarín y prueba de postura (ronda 1, < 6): H3: el suavizado cruza los huecos (4). H5: resto de
  H5 (colocar el recuadro con teclado en modo manual, volver a pausar si se reproduce mientras se elige) (4). H8: si
  falla el guardado se pierde el análisis, y falta «Reintentar guardado» (3). H9: restaurar el zoom manual al
  cancelar la elección (3). H10: el superpuesto del repaso no sigue a nadie (3). H11: alojar los pesos de MoveNet y el
  WASM en el propio dominio (3). H12: liberar los modelos y no crear un segundo detector cuando WebGPU cae a WebGL
  (3). H13: mensaje genérico de error en español y «Reintentar» (2). Ya corregidos: las teclas que se tragaban al
  elegir (H1), la CSP y la política de privacidad (H2), el modo manual que borraba puntos (H4), el zoom contra el
  seguimiento (H6), y cancelar durante la descarga del modelo (H7).
- F11 y F12 Votaciones y lista de deseos (ronda 1, < 6): el voto anterior se archiva y se inserta otro en cada
  cambio, sin límite de ritmo (5); el enlace de vídeo de una propuesta no se valida contra su YouTube ID, y la
  propuesta queda huérfana si se archiva el vídeo (3); `insertPoll` hace dos pasos y puede dejar una votación sin
  candidatas (3); los votos anónimos y los resultados «al cerrar» son de presentación, no secreto (4, decisión
  pendiente, apartado 3); en ranking, la papeleta no se maneja bien con teclado y lector (5); el radio de «Un voto»
  usa `li` dentro de `radiogroup` (4); la ganadora se estrena en cada visita y retrasa los botones (3); al cerrar
  por hora, el reloj del móvil decide el cierre, y la lista puede dar por cerrada una votación sin ganadora (4);
  detalles (2): «Elegir para votar» sin explicar que hacen falta dos propuestas, «Segunda vuelta · Segunda vuelta»,
  y el aviso de YouTube (422) al proponer.
- F13 y F14 Bolsas y Random Play Dance (ronda 1, < 6). Base de datos: «Quitar» y «Devolver» tras sortear no son
  atómicos (3); reordenar una pista hace una petición por clip, y crearla no es atómico (3); la demo no imita todas
  las reglas de la base (3); `plan_b1_checks.sql` no cubre todos los casos (3); el orden de los listados no tiene
  desempate por `id` (2). Interfaz: el lector de pantalla no anuncia nada durante la ronda (5); al reanudar, la
  cuenta atrás parpadea «3» y suena un tic de más (5); la bolsa cambia mientras «Sacando…» (5); «Guardar como pista»
  falla con un clip archivado y sin salida (5); los contadores cuentan también lo que está fuera (4); «Quitar» y
  «Sacar» seguidos pueden pisarse (4); pausar mientras carga el clip se ignora (4); el aviso de «clip fuera de su
  vídeo» se borra en la misma pasada (4); el fin del clip depende de `requestAnimationFrame` (4); en modo adivinar,
  pausar oculta el título ya revelado (4); reordenar una pista con teclado y lector (4); «Nueva bolsa» abre sin foco
  en el nombre (3); textos ambiguos («Quitar de la bolsa» para dos cosas) (3); Ctrl+R repite el clip, y «Salir» no
  pide confirmación (3); tamaños de pausa y de pistas (3); «Sacar» se desplaza al revelar (3); detalles (2).
- F15 y F16 Reacciones y cuenta atrás (ronda 1, < 6): faltan pruebas SQL de los casos de `plan_b3_checks.sql` (3);
  el hueco «sin nombre» sigue compartido (3); detalles (2–3): `reactionRules.whoWords` sin uso, la pantalla del
  evento no muestra el año en fechas pasadas, el formulario admite fechas pasadas sin aviso, las horas que no existen
  por el cambio de hora no avisan, `TakeReactions` no muestra nada si falla la consulta, y cada cambio de reacción
  deja una fila archivada.
- Revisión global, base de datos, datos y API (`revisiones/global-bd-seguridad.md`, 17-10). `pnpm db:test` pasa
  (19 migraciones, 84 PASS). Ningún hallazgo de nota 6 o más. Pendientes:
  - H1 (5): el bucket `videos` no tiene tope de bytes; si se llena, bloquea las tomas.
  - H2 (5): los topes cuentan filas, no bytes (dibujos de notas, recorridos, miniaturas); un script podría llenar la
    base de datos, y `listNotes` trae los dibujos siempre.
  - H4 (4): el límite por IP de la búsqueda de YouTube es por instancia, y la cuota diaria se puede agotar. Hace
    falta una regla de firewall o un contador global, fuera del código.
  - H5 (4): `follow_paths` no tiene tope por canción ni valida la forma de los puntos.
  - H6 (3): un cliente puede cerrar una votación con un cambio directo y elegir la ganadora entre las opciones.
  - H7 (3): reordenar pistas y repertorio son varias peticiones, no atómicas.
  - H8 (3): las filas de «Me apunto» de miembros archivados siguen en la base (la app ya no las cuenta). Los votos
    de miembros archivados ya no cuentan (migración `close_poll_live_rank`).
  - H9 (3): listados por canción sin paginar (corte en 1000); `.in()` con muchas votaciones.
  - H10 (3): la CSP sigue en Report-Only y sin destino de informes; los WASM de MediaPipe no tienen SRI.
  - H11 (3): no hay una prueba genérica de que toda tabla archivable llegue a `archive_row`.
  - H12 (2): `updated_at` lo elige el cliente en pistas y recorridos.
  - H13 (2): carreras menores en las subidas: dos a la vez pueden pasar un tope.
  H3 (ranking de `close_poll`, puntos 0 o negativos al archivar una candidata) está corregido en la migración
  `close_poll_live_rank`, aplicada.
- Revisión global, accesibilidad (`revisiones/global-accesibilidad.md`). Corregidos A11Y-01 a 05 (≥6) y 19, 20 y
  partes de 07 y 08. Pendientes: botón con foco que pasa a `disabled` al cargar pierde el foco (5); menú móvil sin
  flechas completas y con la navegación principal detrás de «Menú» en vez de una barra (5); la ronda de Random Play
  Dance no anuncia los cambios de clip (5); mover el zoom ampliado sin arrastrar (5); grupos de radios sin flechas en
  `Segmented` y la papeleta (5); el foco tras una acción del menú ⋯ que abre un diálogo (5); quitar del repertorio o
  de la pista sin confirmar ni deshacer, y la confirmación de bolsa que caduca a 2,6 s (5); texto pequeño con
  `opacity` (4); toasts de error que se van a los 5,2 s (4); nombres ambiguos («Sacar a mano», «Uno más») (4);
  resultados asíncronos sin anunciar (4); controles tapados por «¿Preparados?» tabulables (4); copys incoherentes
  Eliminar/Borrar/Quitar y «Próxima coreo»/«Próxima cover» (4); objetivos táctiles de 32–36 px en la ronda (3);
  detalles de las reacciones (3).
- Revisión global, rendimiento (`revisiones/global-rendimiento.md`). Corregidos P1, P2, P3, P4, P8, P10, P11, P12 y
  P15. Pendientes: precargar las secciones del menú y dar señal al tocar (P5, 5); pósteres en base64 dentro de la
  fila del vídeo (P6, 5); quitar auth y realtime del cliente de Supabase (P7, 5); fuentes propias en vez de Google
  Fonts (P9, 4); `LazyMotion` (P13, 3); tailwind-merge en el entry (P14, 3).
- Revisión global, funcional (`revisiones/global-funcional.md`). Ninguno ≥6. Corregidos F1, F2, F3, F4, F7 y F11.
  Pendientes: «Atrás» tras crear o borrar desde un diálogo deja una entrada de historial de más (F5, 4); «Jugar la
  ronda» con la caché de la bolsa vieja (F6, 3); un móvil cuyo miembro se archivó no vuelve a preguntar «¿Quién
  eres?» (F8, 3); al cambiar el archivo vinculado los recorridos siguen siendo del anterior (F9, 3); un deseo
  añadido a la biblioteca desaparece si luego se archiva el vídeo (F10, 3); «Añadir a una bolsa» que falla en parte
  (F12, 3); una reacción que falla restaura toda la caché (F13, 2); «Proponer» bloqueado si oEmbed se cuelga (F14, 2).
- Sin probar en este ordenador (no tiene cámara ni micro): grabar, tomas, reacciones, aplauso y la prueba de
  postura con un vídeo propio. Van con las pruebas en dispositivo.
- Duda de producto: si una revisión marca algo que hoy depende de la confianza en el grupo (votos y notas legibles,
  decisiones 17 y 23 del apartado 3), decidid si se acepta o se cambia el diseño.
- PREGUNTAS 1 y 2 (apartado 4) siguen abiertas.

## 6. Migraciones

| Fecha | Migración | Qué hace | Estado |
| --- | --- | --- | --- |
| 16-10 18:08 | `20261016000000_linked_file_and_members` | Columnas de archivo vinculado (desfase, duración), reglas del bucket para el archivo de un vídeo de YouTube, tabla `members`, autor de las notas | Aplicada y verificada (19 PASS en producción, todo revertido) |
| 16-10 18:09 | `20261016000100_linked_file_guard` | La descripción del archivo vinculado no se reescribe; máximo 5 archivos por vídeo de YouTube; nombre simple para vídeos subidos | Aplicada |
| 16-10 18:09 | `20261016000200_linked_file_identity` | La protección anterior también para archivos que solo están en un móvil | Aplicada |
| 16-10 19:09 | `20261016010000_takes` | Tabla `takes`, bucket `takes`, compartir, una mejor toma por persona y tramo, tope de 1 GiB y `storage_usage()` | Aplicada y verificada (13 PASS en producción, todo revertido) |
| 16-10 21:55 | `20261016020000_review_and_take_notes` | Ajuste fino y encaje de la toma; notas sobre la toma (categoría, destinatario, estado, dibujo) | Aplicada y verificada (5 + 10 PASS, todo revertido) |
| 16-10 21:55 | `20261016030000_bags_and_tracks` | Bolsas, sorteos (`draw_from_bag`) y pistas | Aplicada y verificada (5 + 10 PASS, todo revertido) |
| 16-10 21:55 | `20261016035000_bag_draws_hardening` | El historial solo lo escribe el sorteo, con la hora del servidor; índice y tope | Aplicada y verificada (5 + 10 PASS, todo revertido) |
| 16-10 23:50 | `20261016040000_wishes_and_polls` | Deseos, interés, votaciones, `cast_vote` (votar) y `close_poll` (cerrar) | Aplicada y verificada (13 PASS en F11/F12, todo revertido) |
| 16-10 23:50 | `20261016050000_events_and_reactions` | Eventos, repertorio, reacciones sobre tomas compartidas | Aplicada y verificada (5 PASS en F15/F16, todo revertido) |
| 16-10 23:50 | `20261016060000_clip_zoom` | Zoom del clip (`zoom_scale`, `zoom_x`, `zoom_y`) con sus rangos | Aplicada; verificada en el conjunto de la fase final (todo revertido) |
| 16-10 23:50 | `20261016070000_follow_paths` | Recorridos del bailarín (`follow_paths`), tope de 500 vivos y 2000 en total | Aplicada y verificada (6 PASS en F10, todo revertido) |
| 17-10 00:00 | `20261016080000_close_poll_zero_votes` | `close_poll` cuenta como 0 una opción sin votos (antes contaba 1) | Aplicada. Idempotente: producción ya tenía esta versión |
| 17-10 02:16 | `20261017010000_close_poll_live_rank` | `close_poll` con ranking: renumera los puestos sobre las candidatas vivas (archivar una candidata ya no da puntos 0 o negativos); no cuenta los votos de miembros archivados | Aplicada y verificada (empates esperados en producción, todo revertido) |
| 17-10 21:15 | `20261017120000_bag_youtube_items` | Canciones de YouTube en una bolsa (columnas en `bag_items`, una fuente por fila, enlace a la biblioteca) | Aplicada y verificada (12 PASS, todo revertido) |
| 17-10 21:18 | `20261017130000_video_stems` | Pistas de voz y música separadas con IA (`video_stems`, reglas del bucket) | Aplicada y verificada (20 PASS, todo revertido) |
| 17-10 21:20 | `20261017140000_videos_storage_cap` | Tope de 1 GiB del grupo en el servidor para el bucket `videos`, reservando 50 MB para tomas | Aplicada y verificada (7 PASS; copia 5 PASS; archivado 12 PASS) |

Las fechas son la hora de aplicación en producción. El commit que añade cada migración está en `git log`:
`683e39c` (takes), `cfc6296` y `7bd80cd` (020000, 030000, 035000), `675a775` (040000 a 070000) y `85d6bf6` (080000).

**Revisión global (17-10 02:16):** `20261017010000_close_poll_live_rank` corrige H3 y la parte de votos de H8 de
`revisiones/global-bd-seguridad.md`. Es la misma función que `20261016080000` con solo la consulta de puntos
cambiada. Copia previa en `~/one-shoot-backups/20261017-0215-close-poll/` (`backup.json` y `rollback.sql`, que repone
la versión `080000`). En local, `pnpm db:test` con 86 PASS (prueba nueva en `plan_b2_checks.sql`). En producción, la
misma prueba da los empates esperados, todo revertido. Advisors: sin cambios. Datos: sin cambios.

**Copia de seguridad previa:** `~/one-shoot-backups/20261016-1806-fase1/backup.json` (todas las tablas de
`public`, `storage.buckets` y `storage.objects`; 1 grupo, 3 vídeos, 3 clips, 2 notas, 0 archivos) y las
definiciones que se cambiaron. Fuera del repositorio.

**Vuelta atrás:** `~/one-shoot-backups/20261016-1806-fase1/rollback-fase1.sql` vuelve a poner las reglas
anteriores (funciones, restricciones, permisos). No borra la tabla `members` ni las columnas nuevas (la versión
anterior de la app las ignora). Antes de ejecutarlo, comprobar que ningún vídeo de YouTube tiene `storage_path`.

**Advisors tras aplicar:** nada nuevo. Siguen los avisos que ya había (protección de contraseñas filtradas en
Auth, que es un ajuste del panel y no se toca; dos políticas de lectura en `crews`; índices sin usar).

**Tipos:** regenerados desde el proyecto real y comparados con `database.types.ts`: coinciden. Diferencia
intencionada: en `members` el `crew_id` es opcional al insertar porque lo pone el servidor.

**Fase 2 (16-10 19:09):** `20261016010000_takes`: tabla `takes`, bucket privado `takes` (50 MB, solo vídeo),
compartir solo con el archivo subido (tamaño real), una mejor toma por persona y tramo, tope de 1 GiB entre vídeos
y tomas, función `storage_usage()` para el medidor. Aplicada y verificada (13 PASS en producción, todo revertido;
después 0 tomas, 0 objetos). Copia previa: `~/one-shoot-backups/20261016-1907-fase2/backup.json` (incluye la
definición anterior de `archive_row`). Vuelta atrás: `rollback-fase2.sql` en la misma carpeta (quita el acceso a
las tomas y repone `archive_row`; la tabla y el bucket se quedan, vacíos). Advisors: nuevos avisos 0028/0029 por
`public.storage_usage()`, intencionados (solo devuelve tres números, la app la necesita sin login); índices de
`takes` sin usar todavía. Tipos regenerados: coinciden.

**Fase 3 + bolsas (16-10 21:55):** `20261016020000_review_and_take_notes` (ajuste fino y encaje en la toma; notas
sobre la toma), `20261016030000_bags_and_tracks` (bolsas, sorteos, pistas; sorteo en el servidor con
`draw_from_bag`), `20261016035000_bag_draws_hardening` (el historial solo lo escribe el sorteo, con la hora del
servidor; índice y tope). Aplicadas y verificadas (5 + 10 PASS en producción, todo revertido). Copia previa y vuelta
atrás en `~/one-shoot-backups/20261016-2151-fase3-b1/`. Advisors: nada nuevo. Columnas reales comparadas con
los tipos: coinciden.

**Ideas fase final (16-10 23:50 y 17-10 00:00):** se aplicaron en orden `20261016040000_wishes_and_polls`
(deseos, interés, votaciones, `cast_vote` y `close_poll`), `20261016050000_events_and_reactions`,
`20261016060000_clip_zoom` y `20261016070000_follow_paths`, después de una copia de seguridad en
`~/one-shoot-backups/20261016-2346-final/` (`backup.json` y `rollback.sql`). El `rollback.sql` quita el acceso del
cliente a las tablas y funciones nuevas, y repone `archive_row` y `guard_bag_item`. Las tablas y las columnas se
quedan. La `040000` se aplicó como un único SQL con el mismo estado final que el fichero, incluido el arreglo de
`close_poll` con cero votos. Ese arreglo tiene su propia migración, `20261016080000_close_poll_zero_votes`
(aplicada el 17-10 00:00; es idempotente porque producción ya tenía esa versión), porque no se editan las
migraciones ya publicadas.

Verificación en producción, todo revertido: F11/F12 13 PASS, F15/F16 5 PASS, F10 6 PASS, comprobaciones de
archivado 13 PASS. Después, los datos no cambiaron: 3 vídeos, 3 clips, 2 notas, 0 en las tablas nuevas y 0
archivos.

Advisors: los avisos 0028/0029 ahora incluyen también `cast_vote`. Es intencionado: es `security definer` porque el
cliente no puede escribir votos directamente, y la función comprueba la votación, la persona y las opciones.
Quedan los índices sin usar y nada más nuevo. Tipos: 216 columnas reales comparadas con `database.types.ts`:
coinciden.

## 7. Diseños elegidos

Elegidos por el responsable del producto el 17-10 tras probar el laboratorio de diseño. El laboratorio y el resto de
variantes se han eliminado; estos son los únicos diseños de la app.

| Momento | Diseño |
| --- | --- |
| A1 · Panel de ajustes del grabador | **Abanico**: los ajustes se despliegan desde ⚙ como las varillas de un sensu |
| F5 · Repaso: comparar la toma con el original | **Biombo**: dos paneles de laca con una bisagra dorada; en «Superpuesto», el original va en un marco de biombo |
| F7 · Armar y empezar con un aplauso | **Taiko**: el parche se hincha con el sonido y cada palmada gira el mitsudomoe |
| F17 · Separar voz y música | **La ola partida**: la ola se parte en voz bermellón y música índigo |
| F13 · Sacar de una bolsa | **Fukubiki**: la rueda de la feria gira y suelta una bola del color de lo que ha salido |
| F14 · Pantalla de Random Play Dance | **Kamishibai**: la tarjeta con el título tapa el vídeo durante la cuenta atrás y se desliza al sonar |
| F11 · Revelar la ganadora de una votación | **Hanabi**: fuegos de papel sobre un cielo índigo que dejan el título y el sello 当選 |
| F16 · Cuenta atrás al próximo evento | **Chōchin**: siete farolillos; uno encendido por día de la última semana y todos el día del evento |
| F15 · Reacciones en las tomas compartidas | **Hanko**: cada reacción es un sello bermellón que se estampa al tocar |

Segunda tanda, elegida el 18-10 tras probar el laboratorio de la ronda de mejoras (ronda 2, puntos 40 y 41 de
MEJORAS-PRUEBA-MANUAL.md). Las variantes perdedoras y sus momentos del laboratorio se han eliminado.

| Momento | Diseño |
| --- | --- |
| F16 · Cuenta atrás larga (más de una semana) | **Tsuki**: la luna crece hasta el día del evento |
| F17 · Voz y música en el estudio | **A · La ola partida mejorada** |
| P30 · Pantalla «Bolsas» | **Furoshiki** |
| P29 · Icono de bolsa | **Fukubukuro** |
| P1 · Menú rápido | **Hanafuda** (elegido el 18-10 con el grupo): del botón sale una mano de cartas; la carta que tocas se eleva y vuela al centro. El laboratorio de diseño se ha retirado |

## 8. Revisiones

| Funcionalidad | Rondas | Hallazgos (nota) | Corregido |
| --- | --- | --- | --- |
| Grabación paso 1 | 1 | Ninguno 🔴. 7: formato que falla sin alternativa · 6: sin opción H.264 compatible · 6: botones cortados en horizontal · 5: panel sin Esc/foco, panel tapa el diálogo, avisos solapados, niveles H.264/HEVC en 4:3 · ≤4 varios | Todos los ≥6 y los 5 citados. Pendiente: «atrás» del móvil cierra el grabador entero con el panel abierto (4), formato real leído del archivo (5, se deja «declarado») |
| Grabación pasos 2–6 | 3 | Ronda 3: 🔴 9 «el iPhone no grababa» (lienzo congelado) | Todo lo ≥6 |
| F1 · F2 | 3 | Ronda 1: 🔴 7 vincular encima de otro archivo, 🔴 cambio no atómico · Ronda 2: 🔴 7 al quinto cambio se perdía el archivo, 6 copia propia borrada, 6 archivo solo-móvil pisable · Ronda 3: ninguno ≥6 | Todo lo ≥6; lo <6 en PENDIENTES |
| F3 · F4 · F17 | 2 | Ronda 1: 🔴 9 «Guardar» sin aviso en el repaso, 🔴 8/7 toma «compartida» sin archivo, 🔴 7 vídeo congelado con el audio suspendido, 🔴 7 «Sin voz» mudo en mono, 7 «Guardar» sin reintento, 6 tope de 1 GB solo en la app, 6 `meta.json` pisable, 6 contextos de audio sin cerrar, 6 grabador sin decir el modo · Ronda 2: ninguno ≥6 | Todo lo ≥6 y varios menores; lo <6 en PENDIENTES |
| F5 · F6 | 1 (repaso y notas, dos informes) | Repaso: sin 🔴. 6: no se pausa si un vídeo tarda en cargar · 5: guardado mudo y sin reintento · 5: encaje relativo al marco. Notas: sin 🔴. 6: el dibujo se queda sobre la toma · 5: «Dibujar de nuevo» captura otro fotograma · 4: destinatario archivado, dibujos en cada carga, reversión que pisa, índice único | Corregido: la pausa conjunta mientras carga (F5), el dibujo en su momento y «Dibujar de nuevo» (F6), el formato de velocidad con coma. Pendiente: lo <6 (apartado 5) |
| F7 · Aplauso | 1 | Sin 🔴. 6: pasos y voz disparan el doble aplauso · 5: un cambio de fase deja micro y contexto abiertos · 5: umbral de «Media» sin medir · 5: sin recuperación si el micro se corta · 5: sin gesto del usuario en iOS (sin verificar) | Corregido: pasos y voz (filtro de paso alto y ataque), el desarme al cambiar de fase y la ventana de lectura más larga. Pendiente: micro cortado, umbral, iOS, foco (apartado 5) |
| F13 · F14 (B1) | 1 (base de datos e interfaz) | 🔴 base de datos: la demo no compilaba (falta `wish_id`) · 🔴 interfaz: «Volver a mezclar» no hacía nada si salía el mismo orden · 5: historial falsificable · 5: el historial no tiene tope · 4: listados cortados a 1000 filas · 5: lector de pantalla mudo en la ronda | Corregido: los dos 🔴, el historial solo lo escribe el sorteo con la hora del servidor, índice y tope, listados paginados, foco y capa inerte en la ronda. Pendiente: lo <6 (apartado 5) |
| F11 · F12 (B2) | 1 (base de datos e interfaz, dos informes) | 🔴 interfaz: la ganadora se escribía con votos en caché · 🔴 interfaz: borrar una candidata rompía la papeleta · 6: listas de votos cortadas a 1000 · 5: opciones que cambian tras votar · 5: anonimato cambiable con votos · 5: ranking por teclado | Corregido: el cierre lo calcula el servidor (`close_poll`, con empates), listas paginadas, opciones y votos protegidos al cerrar, anonimato bloqueado con votos, aviso al borrar candidatas, «Me apunto» sin doble toque. Pendiente: lo <6 (apartado 5) |
| F15 · F16 (B3) | 1 | Sin 🔴. 5: calendario que decía «AYER» en eventos pasados y chōchin encendido · 5: el evento de hoy ya empezado tapaba al siguiente · 4: titular con `aria-live` que cambia cada minuto · 4: sello hanko sin animar en el primer toque · 4: «Crear pista con los estribillos» con «Pre-estribillo» | Corregido: calendario de «Ayer» y «Pasó», el evento de hoy ya empezado (3 horas), «Pre-estribillo» fuera de los estribillos, titular sin `aria-live`, listas de votos completas. El sello hanko cambiado en el código, sin probar en el navegador. Pendiente: pruebas SQL y detalles (apartado 5) |
| F8 · F9 | 1 | Sin 🔴. 6: cada paso de un gesto repintaba toda la página · 5: la lupa del clip no se veía en la lista · 4: «Ampliar» movía la vista con vídeos verticales · 4: 300 ms al tocar con zoom | Corregido: la página ya no se repinta con el zoom, la lupa se ve, las flechas funcionan con el foco en el vídeo. Pendiente: lo <6 (apartado 5) |
| F10 | 1 | Sin 🔴. 5: las teclas se tragaban al elegir bailarín · 4: CSP ancha y terceros sin avisar · 4: el suavizado cruza los huecos · 4: el modo manual borra puntos en línea · 4: accesibilidad del flujo · 3: cancelar no respondía durante la descarga del modelo · 3: «Guardar clip» ofrecía zoom y seguimiento a la vez · otros 3 y 2 (apartado 5) | Corregido: teclas, CSP y privacidad, modo manual sin simplificar, zoom y seguimiento excluyentes, cancelar durante la descarga, foco y progreso (en parte). Pendiente: H3, H5 (resto), H8 a H13 (apartado 5) |

| Funcionalidad | Rondas | Hallazgos (nota) | Corregido |
| --- | --- | --- | --- |
| Revisión global (todo) | 1 (4 revisores) | Funcional: ninguno ≥6 (5: un clip nuevo no salía en RPD durante 5 min) · BD: ninguno ≥6 (5: topes por filas y no por bytes) · Accesibilidad: 8 anillo de foco invisible en los botones rellenos, 7 diálogos que abrían en la acción destructiva, 6 contraste del botón principal, 6 reordenar con teclado, 6 rutas sin título ni foco · Rendimiento: 8 el repaso se repintaba 60 veces por segundo, 7 arranque en cascada, 7 abrir un vídeo esperaba una petición, 6 grabador siempre montado | Todo lo ≥6 y varios menores (cachés entre funciones, zoom contra seguimiento, recuento de votos, aviso de clip inexistente). Pendiente: lo <6 (apartado 5) |

**Revisión global (17-10):** [funcional](revisiones/global-funcional.md) · [accesibilidad](revisiones/global-accesibilidad.md) ·
[base de datos, datos y API](revisiones/global-bd-seguridad.md) · [rendimiento](revisiones/global-rendimiento.md).

Informes: [funcional](revisiones/grabacion-paso1-ronda-1-funcional.md) ·
[rendimiento y diseño](revisiones/grabacion-paso1-ronda-1-rendimiento-diseno.md) ·
[F1/F2 ronda 1 BD](revisiones/F1-F2-ronda-1-bd-seguridad.md) · [F1/F2 ronda 1 cliente](revisiones/F1-F2-ronda-1-cliente.md) ·
[F1/F2 ronda 2](revisiones/F1-F2-ronda-2.md) · [F1/F2 ronda 3](revisiones/F1-F2-ronda-3.md) ·
[F3/F4/F17 ronda 1 BD](revisiones/F3-F4-F17-ronda-1-bd.md) · [cliente](revisiones/F3-F4-F17-ronda-1-cliente-tomas.md) ·
[voz](revisiones/F3-F4-F17-ronda-1-voz.md) · [ronda 2](revisiones/F3-F4-F17-ronda-2.md) ·
[F5 repaso](revisiones/F5-F6-ronda-1-repaso.md) · [F6 notas](revisiones/F5-F6-ronda-1-notas.md) ·
[F7 aplauso](revisiones/F7-ronda-1.md) · [B1 BD](revisiones/B1-ronda-1-bd.md) · [B1 interfaz](revisiones/B1-ronda-1-interfaz.md) ·
[B2 BD](revisiones/B2-ronda-1-bd.md) · [B2 interfaz](revisiones/B2-ronda-1-interfaz.md) · [B3](revisiones/B3-ronda-1.md) ·
[F8/F9](revisiones/F8-F9-ronda-1.md) · [F10](revisiones/F10-ronda-1.md)

**Ronda 2 de la prueba manual (18-10, puntos 40–54).** Dos rondas por bloque, de solo lectura.

| Bloque | Rondas | Hallazgos (nota) | Corregido |
| --- | --- | --- | --- |
| Grabador (42, 43, 48, 49) | 2 | Ronda 1: ninguno ≥6. 5: en iPhone el audio retrasado cruzaba a un segundo contexto (posible toma muda) · 5: retraso estimado sin forma de verlo ni corregirlo · 4: una vuelta a «Auto» pendiente deshacía un preset · 3: «Auto» perdía la luz; la barra de luz quedaba encima de otras pantallas. Ronda 2: ninguno ≥6. 3: la vigilancia del contexto no miraba al reanudar · 3: «Auto» apagaba el flash | Todo lo ≥3 de las dos rondas: retraso dentro del grafo del motor, «Ajuste fino de sincronía» y fila en «i», luz y flash repuestos, barra que se va con otras capas y respeta la zona segura. Queda sin opción entre 2850 y 5000 K (apartado 5) |
| Estudio (44–47) | 2 | Ronda 1: 6: en táctil no se podía guardar ni quitar el zoom de un clip · 3: trampa de foco del panel de voz · 3: el panel tapaba media imagen en horizontal | Todo lo ≥3: línea del zoom del clip en táctil, foco, panel de una línea. Ronda 2 en el informe «resto» |
| Laboratorio, menú y voz (40, 41, 46) | 2 | Ronda 1: 4: el residuo devuelto a «Sin voz» podía llevar voz · 3: el 46 no se medía · 3: Kakejiku no enseñaba la línea con foco · 3: huecos entre hojas al abrir Sensu | Todo lo ≥3 (el 46, con el `console.info` y la nota de la prueba 54). Queda el coste del residuo (2, apartado 5) |
| Votaciones y Random Play Dance (52–54) | 2 | Ronda 1: ninguno ≥6. 3: votaciones antiguas «al cerrar» con resultados a la vista · 3: sin reajuste al salir del modo CSS · 3: foco perdido al entrar o salir · 3: la columna no cabía en horizontal. Ronda 2 («resto»): 4: la barra tapaba el pie de la tarjeta Kamishibai | Todo lo ≥3: votaciones aceptadas (decisión 44), reajuste, foco también al girar, barra abajo como en el estudio, tarjeta con hueco para la barra |
| Tomas y repaso (50, 51) | 2 | Ronda 1: 8: en horizontal el escenario se quedaba en ~150 px · 6: «Atrás» con los ajustes abiertos cerraba el repaso · 5: YouTube por debajo de 200 px · 5: un salto en cada vuelta del tramo con YouTube. Ronda 2: 6: tras una recarga, «Atrás» deja de cerrar las capas (`useBackToClose`) · 5: con los ajustes abiertos y YouTube, la toma se queda en nada · 4: entradas de historial sobrantes al guardar una nota o cerrar con la X · 4: en horizontal, tocar el rombo de una nota mueve el tiempo | Ronda 1: todo lo ≥3 (disposición para pantallas bajas, capas apiladas, mínimo de YouTube, latencia, aviso si la toma no arranca, cero corregido en la fila). Ronda 2: **pendiente** al escribir esto (apartado 5) |

Informes: [estudio 1](revisiones/ronda2-estudio-1.md) · [laboratorio, menú y voz 1](revisiones/ronda2-lab-voz-menu-1.md) ·
[votaciones y RPD 1](revisiones/ronda2-votaciones-rpd-1.md) · [resto 2](revisiones/ronda2-resto-2.md) (ronda 2 de los
tres anteriores) · [grabador 1](revisiones/ronda2-grabador-1.md) · [grabador 2](revisiones/ronda2-grabador-2.md) ·
[tomas y repaso 1](revisiones/ronda2-tomas-repaso-1.md) · [tomas y repaso 2](revisiones/ronda2-tomas-repaso-2.md) · [tomas y repaso 3](revisiones/ronda2-tomas-repaso-3.md) · [tomas y repaso 4](revisiones/ronda2-tomas-repaso-4.md).

## 9. Verificación en producción (17-10, 02:20–02:50)

Con la versión `8a472aa` y luego `d75b994` (dos arreglos encontrados aquí). Todo en silencio: el navegador de
pruebas tenía el sonido anulado y YouTube en mute.

**Probado de punta a punta, con datos «PRUEBA» que luego se borraron desde la propia app:**

1. Miembros: alta de «PRUEBA Ana», «Soy yo» («Eres PRUEBA Ana» en el menú); al final «Quitar» (vuelve «¿Quién eres?»).
2. Biblioteca: «Añadir vídeo» con un enlace de YouTube (el título se rellena solo) y con el buscador de YouTube
   (resultados en 1,3 s); el estudio abre al momento.
3. Estudio: reproducir, avanzar 5 s, A–B con «Nuevo clip», guardar «PRUEBA clip» fijado (sale en «Clips fijados»),
   bucle del clip (vuelve de 0:07 a 0:02), velocidad, nota «PRUEBA nota» con aviso, abrir un clip que ya no existe
   (avisa), grabador (abre y cierra; este ordenador no tiene cámara).
4. Bolsas: «PRUEBA bolsa» de clips, añadir 4 (aviso «4 clips en la bolsa», incluido el clip recién creado), sacar
   (1,2 s con animación; el historial dice quién lo sacó), «Sacar 3» y «Jugar la ronda».
5. Random Play Dance: la ronda corre con cuenta atrás, «Guardar como pista» («PRUEBA pista»; el aviso se ve durante
   la ronda), «Terminar», y la pista aparece en «Pistas guardadas».
6. Próxima cover: dos propuestas con enlace (título automático), «Me apunto», «Elegir para votar», votación en
   ranking con resultados en directo, reordenar con las flechas (el foco se queda y se anuncia el puesto), votar,
   cerrar (el diálogo abre en «Cancelar»), ganadora con 当選 y «Añadir a la biblioteca».
7. Eventos: «PRUEBA evento» dentro de 7 días con lugar, repertorio con 2 canciones y cuenta atrás en la portada.
8. Ajustes: miembros y prueba de postura (el laboratorio de diseño se retiró después, apartado 7); privacidad con
   los modelos de postura. Cada página cambia el
   título de la pestaña y lleva el foco a su encabezado; «Saltar al contenido» presente.

**Encontrado y corregido durante la prueba:** el menú de velocidad de la barra mostraba «0.75» (ahora «0,75×»); al
entrar en una ronda el foco iba al título oculto en vez de a «Empezar».

**Datos creados y archivados:** 1 miembro, 2 vídeos (con 1 clip y 1 nota), 1 bolsa (4 elementos, 4 sorteos), 1 pista
(3 clips), 2 propuestas (1 «Me apunto»), 1 votación (2 candidatas, 2 votos) y 1 evento (2 canciones). Todo se borró
desde la app (archivado), salvo una propuesta que ya estaba en la biblioteca y que la app no enseña (hallazgo F10 de
la revisión funcional): se archivó igual que lo haría la app. El «Me apunto» y los 2 votos colgaban de padres
archivados y la app no puede tocarlos: se archivaron directamente. Comprobado después: 0 filas «PRUEBA» vivas y los
datos del grupo igual que antes (2 vídeos vivos, 3 clips, 2 notas, 0 archivos).

**Rendimiento medido en producción:**

| Medida | Antes | Después |
| --- | --- | --- |
| Portada, LCP (visita repetida, escritorio) | 736 ms | 296 ms |
| Portada, CLS | 0,04 | 0,00 |
| Estudio con un clip en bucle | 58 fps, p95 16,9 ms | igual |
| Chunk del estudio (gzip) | 73,8 kB | 48,9 kB (el grabador va aparte: 20,8 kB) |
| Lighthouse móvil (accesibilidad / buenas prácticas / SEO) | 95 / 100 / 80 | 100 / 100 / 100 |

**Ronda de mejoras (17-10 21:26–21:40, versiones 137 y 139).** En producción, a 390×844 táctil y con todo el sonido anulado: portada sin desbordes; menú flotante; «⋯» con «Versión 137» y «Ya tienes la última versión»; «Añadir vídeo» con el buscador (0,8 s); estudio sin botón propio sobre el vídeo, tocar para reproducir y pausar, «Guardar clip» compacto (443 px), «Editar clip», panel de pausa del bucle visible; bolsa con una canción de YouTube (sacar 0,8 s, «Añadir a la biblioteca»); dos propuestas con el buscador sin crear vídeos, votación, voto y cierre con 当選; evento a 20 días con Koyomi en la portada; ronda de RPD y «¿Salir de la ronda?»; 0 errores de consola. Datos «PRUEBA» (2 vídeos, 1 clip, 1 bolsa, 2 deseos, 1 votación, 1 evento, 1 miembro) borrados desde la app; el voto colgado de la votación archivada se archivó a mano. Después: 0 «PRUEBA» vivos y el grupo igual (2 vídeos, 3 clips, 2 bolsas, 5 elementos, 1 miembro, 1 archivo). Lighthouse móvil: accesibilidad 94, buenas prácticas 100, SEO 100; LCP 360 ms (visita repetida), CLS 0. No probado aquí (sin cámara, micro ni GPU): grabar, aplauso, lentes, color de la luz, separar voz y los tiempos de seguir.

## 10. Texto del correo

En esta sesión no hay ninguna herramienta de correo, así que el texto queda aquí para enviarlo a mano:

> **Asunto:** One Shoot · todo el plan hecho y en producción
>
> Hola:
>
> Ya está todo el plan implementado, revisado y desplegado en https://kpop-covers.vercel.app.
>
> - Grabación de máxima calidad (pasos 1 a 6) y las ideas F1 a F17: archivo vinculado, quién es quién, tomas y mejor
>   toma, voz y música, repaso, notas sobre la toma, aplauso, clips en tomas, zoom, seguir a un bailarín con prueba de
>   postura, votaciones, lista de deseos, bolsas, Random Play Dance, reacciones y cuenta atrás.
> - Cada bloque pasó revisiones con nota y todo lo de 6 o más está corregido. Al final, una revisión global
>   (funcional, base de datos, rendimiento y accesibilidad) y una prueba manual de todas las funciones en producción,
>   con datos de prueba que ya están borrados.
> - Rendimiento: la portada pinta en 0,3 s en visitas repetidas, sin saltos; Lighthouse 100 en accesibilidad, buenas
>   prácticas y SEO.
> - Base de datos: todas las migraciones aplicadas con copia de seguridad previa (`~/one-shoot-backups/`), sin tocar
>   los datos del grupo.
>
> Queda por vuestra parte: probar en los Samsung lo que necesita cámara y micro (apartado 2 de
> `docs/plan/ESTADO-IMPLEMENTACION.md`) y contestar dos preguntas (qué es F18 y si queréis purgar archivos desde la
> app). Lo menor que queda está en el apartado 5.
