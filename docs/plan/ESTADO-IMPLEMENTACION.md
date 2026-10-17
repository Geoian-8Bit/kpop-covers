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
| Ideas | F10 Seguir a un bailarín y prueba de postura con IA | **Hechas y desplegadas** (17-10 00:01) | 1 ronda de revisión con correcciones. Migración `follow_paths` aplicada. Incluye la prueba de postura de Ajustes (MoveNet y MediaPipe, solo para medir tiempos) |
| Ideas | F18 | No se hace | No está definida en el plan (ver PREGUNTAS) |
| Grupo | F13 Bolsas · F14 Random Play Dance | **Hechas y desplegadas** (16-10 21:58) | 1 ronda de revisión (BD e interfaz) con correcciones |
| Grupo | F11 Votaciones · F12 Lista de deseos | **Hechas y desplegadas** (17-10 00:01) | 1 ronda de revisión (BD e interfaz, dos informes) con correcciones. Migraciones `wishes_and_polls`, `close_poll_zero_votes` y `close_poll_live_rank` (17-10 02:16) aplicadas |
| Grupo | F15 Reacciones · F16 Cuenta atrás | **Hechas y desplegadas** (17-10 00:01) | 1 ronda de revisión con correcciones. Migración `events_and_reactions` |
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

15. **Miembros (F2).** Ajustes → «Miembros del grupo» → «Añadir miembro» con nombre y color. Abajo a la izquierda
    (o arriba en el móvil) sale «¿Quién eres?»: elige tu nombre. Se recuerda en ese móvil.
16. **Archivo de un vídeo de YouTube (F1).** Abre una canción de YouTube → «Añadir archivo» → elige el mismo vídeo
    descargado por tu cuenta (la app no descarga nada de YouTube). Si dura distinto, avisa. Luego «Sincronizar»:
    reproduce los dos y pulsa en el mismo golpe de música; ajusta con ±. Desde entonces el selector
    «YouTube | Archivo» cambia de uno a otro en el mismo punto. Hasta 50 MB se sube a la nube para todo el grupo;
    más grande queda solo en ese móvil y los demás pueden vincular su propia copia.
17. **Cambiar / quitar archivo:** en el mismo panel. «Cambiar» elige el nuevo antes de quitar el viejo y, si falla,
    deja el anterior.
18. **Duplicados:** al añadir un vídeo con un título parecido a otro de la biblioteca, sale «¿Es la misma
    canción?». Las tarjetas con archivo llevan la marca «con archivo».

### Ideas · F3, F4 y F17 (en producción)

19. **Guardar una toma (F3).** Graba una toma → en el repaso, «Guardar en «Tomas»». Debe salir «Guardada en «Tomas»
    de esta canción». Cierra el grabador y abre la pestaña «Tomas» del estudio: está ahí con quién, cuándo, desde qué
    segundo y a qué velocidad. Recarga la página: sigue ahí y se reproduce. Sin red, «Guardar» avisa y se puede
    reintentar.
20. **Filtros y descarga:** filtra por persona, clip y fecha; «Descargar» desde la lista (en iPhone abre la hoja
    para guardarla en Fotos).
21. **Mejor toma (F4):** la estrella marca una por persona y tramo; aparece primera; «Limpiar» borra las que no
    tienen estrella.
22. **Compartir con el grupo:** «Compartir» hace una copia de 720p (≤ 50 MB) y la sube. En otro móvil se ve «En la
    nube» y se puede reproducir y descargar. El medidor «Nube del grupo» enseña el espacio real (vídeos y tomas).
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
    fijos»). Botón «Imagen»: luz −2 a +2 y color de la luz (Cálida, Fluorescente, Día, Nublado). Solo aparece lo
    que ofrezca la cámara.
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
    repaso»; en el ordenador están a la derecha.
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
27. **Sensibilidad del aplauso.** En Ajustes del grabador: Baja, Media (por defecto), Alta o Muy alta (mejora 21). Prueba cada una a varias distancias
    y anota desde dónde dispara. «Media» promete dos palmadas normales a unos metros, y esa distancia no está
    medida (apartado 5). Si no dispara, prueba «Alta» o «Muy alta» y mira la marca roja del medidor. Con «Información
    técnica» activada, el panel «i» lista los últimos sonidos juzgados y por qué se rechazaron.

### Clips y zoom · F8 y F9 (navegador; el pellizco, en el móvil)

28. **Clips dentro de una toma (F8).** Abre en el repaso una toma de una canción que tenga clips. En «Ajustes del
    repaso», «Tramos de la canción en esta toma» lista los clips que caen dentro de la toma. Elige uno: la toma y
    el original repiten ese tramo a la vez. Si marcas A y B, «Guardar el tramo como clip» o «Guardar como clip»
    abren el diálogo «Guardar clip» con el tramo, su velocidad y el espejo. El clip aparece en la lista de clips
    del estudio.
29. **Zoom (F9, mejora 7).** Con un archivo, pellizca el vídeo con dos dedos (también en pantalla completa) o usa
    «Ampliar» en la fila «Zoom»; la fila muestra el porcentaje y «Ver completo» solo con zoom. Antes había «Reducir el zoom», el porcentaje,
    «Ampliar el centro del vídeo» y «Ver completo». Con la rueda o arrastrando amplías y mueves. Con dos dedos
    (en el móvil) también. Doble clic o doble toque vuelve al vídeo entero. Con el foco en el vídeo: «+» amplía,
    las flechas mueven la vista si hay zoom, «−» reduce y «0» muestra el vídeo entero. Guarda un clip con zoom
    con «Guardar con el zoom» en el diálogo «Guardar clip»: el clip se abre ampliado y la lista muestra una lupa.
    «Quitar el zoom del clip» lo borra. Con YouTube la fila sale desactivada.

### Seguir a un bailarín y prueba de postura · F10 (navegador; los tiempos, en el móvil)

30. **Seguir a un bailarín (F10).** Con un archivo cargado y el vídeo en pausa, en la fila «Seguir a un bailarín»
    pulsa «Seguir a alguien» y toca a la persona en la imagen. Salen «Persona 1», «Persona 2»…; también puedes
    dibujar un recuadro. La app analiza el vídeo una sola vez («Progreso del análisis», con «Cancelar»). Al
    terminar, el zoom va con esa persona. Si en un cruce salta a otra, pausa ahí y pulsa «Corregir desde aquí».
    «¿A quién sigues?» cambia de bailarín o quita el seguimiento («Nadie»). En «Modo manual» pones tú el recuadro
    en varios momentos con «Añadir punto aquí», «Mover el punto» y «Quitar punto». Al guardar un clip, «Guardar
    siguiendo a «X»» y el zoom fijo no van juntos.
31. **Prueba de postura (Ajustes).** Ajustes → «Análisis de postura (prueba)» → «Abrir la prueba» → «Elegir vídeo» →
    «Probar los dos» (o solo MoveNet, o solo MediaPipe). Muestra tiempos por fotograma, carga y personas detectadas.
    «Copiar» copia los resultados. El vídeo no sale del dispositivo. Los tiempos del ordenador no sirven para
    decidir: en el equipo de pruebas, sin GPU, tardó unos 250 ms por fotograma. Las cifras buenas salen en el móvil.

### Votaciones y lista de deseos · F11 y F12 (navegador; para votar a la vez, dos pestañas o dos móviles)

32. **Votaciones (F11).** Menú «Próxima cover» (/deseos) → «Nueva votación». Puedes marcar antes las candidatas
    con «Elegir para votar» (hacen falta dos propuestas). Pon título, candidatas, cuándo cierra («Fecha y hora» o
    «A mano»), tipo («Un voto», «Varios votos» o «Ranking»), resultados («En directo» o «Al cerrar») y votantes
    («Con nombre» o «Anónimos») → «Crear votación». Para votar, pon tu nombre («Elegir mi nombre para votar») y
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
11. **Diseños elegidos y laboratorio retirado (17-10).** Hubo un laboratorio de diseño con 3 variantes por momento.
    El responsable del producto eligió una por momento (apartado 7); las demás y el laboratorio se han quitado del
    código, así que ya no hay nada que elegir en Ajustes.
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

## 4. PREGUNTAS

**Bloquean algo**

1. **¿Qué es F18?** El prompt la pone en la fase 1 de ideas, pero el documento de ideas no la describe. No se
   ha implementado nada.

**El resto**

2. **Borrar una toma compartida no libera espacio en la nube.** La regla del repositorio es «borrar = archivar» y el
   cliente nunca borra archivos del bucket; la especificación de F3 decía «Borrarla la quita de la nube». Se ha
   hecho: deja de verse y de poder leerse, pero el archivo sigue ocupando hasta que el administrador lo purgue. El
   medidor cuenta ese espacio. ¿Queréis una forma de purgar desde la app (solo para un administrador)?

## 5. PENDIENTES

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
