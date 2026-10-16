# Revisión · Grabación pasos 3 y 4 (Q3, Q4, Q5, Q6, Q8, R4) · Ronda 1

**Alcance:** commit `ca87fcd` (`git diff 84efe01..ca87fcd`), solo la parte de los pasos 3 y 4: `settings.ts` (nuevo), `camera.ts` (petición de tamaño y ritmo, `settleCameraMode`), `useCamera.ts` (cámara inicial, reapertura al cambiar ajustes, bloqueo del zoom digital), `compositor.ts` (dibujo al ritmo de la cámara, `captureStream(0)` + `requestFrame`, vigilante, contador de fotogramas), `RecordStudio.tsx` (toma directa o de lienzo, vista previa, pausa al girar, reanudar, fotogramas perdidos) y `packages/shared/src/recording.ts` (`cameraRequest`, `belowRequested`). Las correcciones de los pasos 1 y 2 que van en el mismo commit las mira otro revisor.
**Objetivo:** Samsung S24/S25, Chrome Android, PWA instalada.
**Tipo de revisión:** solo lectura. Los números de línea son los del commit `ca87fcd` (el árbol de trabajo ya tiene cambios de otro paso).

---

## Resumen

El diseño es bueno. Por defecto la app pide 1080p a 60 fps con la cámara trasera. Si la cámara solo da 60 fps bajando a 720p, vuelve a pedir 1080p a 30, que es lo que quiere el plan. Si nada obliga a redibujar, graba la pista de la cámara tal cual. El lienzo deja de dibujar cuando no hace falta, lo que ahorra batería. Y cuando sí se usa, dibuja un fotograma por cada uno que llega de la cámara y lo entrega a la grabación en ese momento. La vista previa sigue siendo fiel en los dos modos: misma imagen y mismo encuadre, y con la cámara frontal el espejo solo se ve en pantalla.

Los puntos débiles están en los bordes de la toma directa y en la medida de fotogramas:

- **La toma directa también se usa en iPhone.** El plan dice que el lienzo se puso sobre todo porque los iPhone guardaban los vídeos tumbados. No hay ninguna exclusión por plataforma.
- **Girar el móvil durante una toma directa pausa la toma, pero tarde.** El aviso de cambio de tamaño llega cuando la grabación ya ha recibido fotogramas con el tamaño nuevo, así que unos cuantos entran en el archivo.
- **El contador de fotogramas perdidos (R4) no mide lo que dice.** Compara con los fps nominales de la cámara, así que con poca luz dará falsas alarmas. En toma directa cuenta lo que se ve en pantalla, no lo que se graba. Y el aviso recomienda opciones que la app todavía no deja elegir.
- **Toma directa en pausa:** ya no se puede cambiar de cámara entre partes, ni seguir si la cámara se ha reiniciado. Los botones desaparecen o no hacen nada, sin explicar por qué.

No he encontrado pérdida de datos: en todos los casos lo grabado se conserva y se puede terminar la toma con «Listo».

| Gravedad | Nº | Notas |
| --- | --- | --- |
| 🔴 Serio | 1 | 7 |
| 🟡 Importante | 3 | 6, 5, 5 |
| 🟢 Menor | 6 | 4, 4, 3, 3, 3, 3 |
| ⚪ Cosmético / limpieza | 3 | 2, 2, 2 |

---

## Hallazgos

### 🔴 1 · La toma directa se usa también en iPhone, donde el plan avisa de vídeos tumbados · nota 7

- **Dónde:** `RecordStudio.tsx` 253–261 (`directPossible`) y 498–504 (elección del modo en `roll`); `recorder.ts` (ahí ya existe `IS_IOS`); plan, Q5 («el lienzo se puso, sobre todo, por un fallo de los iPhone, que guardaban los vídeos tumbados»).
- **Flujo:**
  1. En un iPhone se abre el grabador con los ajustes por defecto (modo «auto»).
  2. Sin zoom digital, `directPossible` responde que sí.
  3. La grabación recibe la pista de la cámara tal cual, sin pasar por el lienzo.
- **Cuándo pasa:** en cualquier toma en iPhone/iPad sin zoom digital. En iPhone el 0,5× suele acabar en zoom digital por el fallo preexistente descrito al final; entonces la toma va por lienzo y este problema no aparece.
- **Protecciones actuales:** ninguna. La decisión solo mira el modo de los ajustes, el zoom digital y que la pista esté viva.
- **Impacto (hipótesis, sin probar en Safari actual):** si Safari sigue guardando la orientación como dato aparte en vez de girar la imagen, el archivo sale tumbado en algunos reproductores o al subirlo. El grupo usa Samsung, pero la app soporta iPhone: tiene «Guardar en Fotos» y el menú de compartir propio de iOS.
- **Evidencia:** no hay ninguna comprobación de plataforma en `directPossible`, y el plan describe el fallo como la razón de ser del lienzo.
- **¿Nuevo?** Sí, la toma directa llega en este commit.
- **Arreglo:** limitar la toma directa a Chrome en Android y en escritorio hasta probarla en iPhone. En iOS, ir siempre por el lienzo. Lo más limpio es una lista de plataformas permitidas, no de prohibidas.
- **Test:** extraer la decisión «directa o lienzo» a una función pura (plataforma, modo, zoom digital, pista viva) y probar que en iOS siempre devuelve lienzo. En dispositivo: una toma vertical en iPhone, abierta en Fotos y en un ordenador.

### 🟡 2 · Al girar el móvil en una toma directa, la pausa llega después de que entren fotogramas de otro tamaño · nota 6

- **Dónde:** `RecordStudio.tsx` 410–424 (escucha `resize` del vídeo y pausa); `vite.config.ts` 69 (el manifiesto permite cualquier orientación).
- **Flujo:**
  1. Toma directa en vertical (1080×1920) y el móvil se gira, o se tumba al cogerlo para parar.
  2. Chrome Android gira los fotogramas de la cámara según la pantalla: la pista empieza a entregar 1920×1080.
  3. La grabación recibe esos fotogramas directamente de la pista, en paralelo a la vista previa.
  4. El aviso `resize` del elemento de vídeo llega después, como tarea aparte, y solo entonces se pausa.
- **Cuándo pasa:** con el giro automático del móvil activado, si se gira o se coge el móvil con la toma en marcha. Pasa a menudo al acercarse al trípode para parar.
- **Protecciones actuales:** la pausa, y al reanudar se exige el tamaño original (684–694). Las dos funcionan, pero no evitan los fotogramas que ya entraron.
- **Impacto (hipótesis):** quedan varios fotogramas (de 1 a 6 a 60 fps) con el tamaño cambiado en mitad de la toma o justo al final. Según el formato, el codificador se reconfigura y el reproductor puede enseñar unos fotogramas estirados, verdes o cortados. Sobre todo en MP4/H.264, porque la cabecera fija un único tamaño. No se pierde la toma, pero puede quedar una mancha visible justo donde se pausó.
- **Evidencia:** la pausa depende de un aviso del elemento de vídeo, no de la pista. La grabación no espera a ese aviso.
- **¿Nuevo?** Sí. Con el lienzo el tamaño del vídeo grabado nunca cambiaba: el lienzo se bloquea y el giro sale con bandas negras.
- **Arreglo:** al empezar una toma directa, bloquear la orientación de la pantalla en la actual (la PWA instalada en Android lo permite; `StudioPage.tsx` 713 ya lo hace) y soltarla al terminar. Si Chrome no gira la pantalla, tampoco gira la cámara y el tamaño no cambia. Si el bloqueo falla, hacer la toma por el lienzo.
- **Test:** en dispositivo, girar el móvil a mitad de una toma directa y abrir el archivo en Galería, WhatsApp y el ordenador. Automático: con el ayudante `fake-media.js`, cambiar el tamaño de la cámara falsa a mitad de toma y comprobar que el archivo tiene un solo tamaño.

### 🟡 3 · Los fotogramas perdidos (R4) se calculan contra los fps nominales: falsas alarmas y una cifra que no es la de la grabación · nota 5

- **Dónde:** `RecordStudio.tsx` 445–448 (cálculo), 471–478 (aviso), 499–510 (qué se cuenta en cada modo); `compositor.ts` 64–86 (`watchPresentedFrames`), 151–160 y 227 (`delivered` se calcula pero nadie lo usa).
- **Flujo:**
  1. Lo esperado son los segundos grabados por los fps que la cámara declara al terminar.
  2. En toma directa se cuentan los fotogramas que el navegador **pinta en pantalla**. La grabación toma los suyos de la pista, sin pasar por la pantalla.
  3. En toma de lienzo se cuentan los fotogramas dibujados.
  4. Si faltan más de un 5 % (y al menos 12), sale el aviso.
- **Cuándo falla:**
  - **Con poca luz** (un local de ensayo), la cámara baja el ritmo para exponer más, pero sigue declarando 30 o 60. Si a 30 fps declarados entrega 24, la app dice que se ha perdido un 20 % aunque el archivo tenga todos los fotogramas que dio la cámara. Hipótesis: depende de qué rango de fps elija Chrome en cada Samsung.
  - En toma directa, si la pantalla va justa, la cifra baja y el archivo puede estar perfecto. Al revés, si el codificador descarta fotogramas, no se detecta.
  - En toma de lienzo con cambio de cámara entre partes, lo esperado usa la cámara del final para toda la toma.
- **Protecciones actuales:** el umbral (5 % y 12 fotogramas).
- **Impacto:** avisos falsos después de tomas buenas, que restan confianza al aviso y a la cifra del panel «i». No hay pérdida de datos.
- **¿Nuevo?** Sí (R4).
- **Arreglo:**
  - **Lienzo:** comparar lo dibujado con lo que llegó de la cámara (`delivered`, que ya existe). Eso sí mide lo que se pierde al redibujar.
  - **Directa:** no hablar de «perdidos». Enseñar en «i» los fps reales (fotogramas ÷ segundos). Si el navegador da estadísticas de la pista (descartados frente a totales, en Chrome reciente), usarlas.
  - Guardar los fps declarados al empezar cada parte, no leerlos al final.
- **Test:** función pura con casos: cámara a 24 fps reales con 30 declarados (no avisa en directa), lienzo con un 10 % menos dibujado que entregado (avisa), cambio de cámara entre partes.

### 🟡 4 · Toma directa en pausa: no se puede cambiar de cámara ni seguir tras un reinicio, y los controles desaparecen o no hacen nada sin explicarlo · nota 5

- **Dónde:** `RecordStudio.tsx` 350 (`canChangeCamera`), 1007 y 1046 (botones «Girar» y «Lente» ocultos), 1241 (chips de zoom), 684–694 (reanudar); `useCamera.ts` 228 (el pellizco no hace nada sin zoom de lente), 249 y 253 (el chip que necesita otra lente no hace nada), 215 (al volver de segundo plano con la pista terminada se abre una nueva).
- **Flujo A:** se pausa una toma directa para pasar a la cámara frontal en la segunda parte. El botón «Girar» ya no está. Antes de este commit todas las tomas iban por el lienzo y sí se podía.
- **Flujo B:** con la toma directa en pausa se sale de la app. Si al volver la pista de la cámara ha terminado, se abre otra. Al tocar para seguir sale «La cámara se ha reiniciado: esta toma no puede seguir». Hipótesis: no sé si Chrome en Samsung termina la pista o solo la silencia en segundo plano. El código cuenta con que la termina.
- **Flujo C:** en toma directa con la cámara frontal (normalmente sin zoom de lente), pellizcar o tocar 2× no hace nada y no da ninguna explicación.
- **Protecciones actuales:** lo grabado se conserva y se puede terminar con «Listo». Los mensajes de reanudar son claros.
- **Impacto:** una función que existía (cambiar de cámara entre partes) se pierde en el modo por defecto. Además, la decisión se toma al empezar la toma, cuando todavía no se sabe si hará falta. Botones que desaparecen o no responden confunden, sobre todo con lector de pantalla.
- **¿Nuevo?** Sí. El plan lo acepta para la toma directa («sin cambiar de cámara a mitad de toma»), pero también dice que el lienzo se usa «cuando haga falta», y eso aquí no se puede saber de antemano.
- **Arreglo:**
  - Dejar «Girar», «Lente» y los chips visibles pero desactivados (con `aria-disabled`). Al tocarlos, un aviso: «Esta toma graba la cámara tal cual: termínala para cambiar de cámara o de zoom».
  - Valorar un ajuste «Permitir cambiar de cámara entre partes» que fuerce el lienzo, o que «Repetir» ofrezca empezar ya con el lienzo.
  - En el flujo B, ofrecer «Terminar y guardar» directamente en el aviso.
- **Test:** e2e con la cámara falsa: toma directa, pausa y comprobar que el botón está desactivado con su explicación. En dispositivo: pausa, salir de la app 30 s, volver y ver qué pasa con la pista.

### 🟢 5 · El aviso de fotogramas perdidos recomienda opciones que todavía no se pueden elegir · nota 4

- **Dónde:** `RecordStudio.tsx` 471–478; `settings.ts` (fps y calidad se guardan, pero ninguna pantalla los cambia; solo el formato se cambia desde el panel «i»).
- **Impacto:** «prueba 30 fps o calidad Alta» no se puede seguir hasta el paso 6 (pantalla de ajustes). Sumado al hallazgo 3, el aviso puede salir sin motivo y sin nada que hacer.
- **¿Nuevo?** Sí.
- **Arreglo:** mientras no exista la pantalla de ajustes, el aviso debe decir algo que se pueda hacer: «cierra otras apps», o «la cámara dio N fps: más luz ayuda». O añadir ya un selector de 30/60 en el panel «i», como el de formato.
- **Test:** revisar los textos al cerrar el paso 6.

### 🟢 6 · Lienzo a 4K sin medir su coste · nota 4

- **Dónde:** `compositor.ts` 38–39 (límite a 3840), 117–149 (dibujo de cada fotograma a tamaño completo).
- **Cuándo pasa:** con calidad «Máxima» o resolución 4K y zoom digital, o con el lienzo forzado. Hoy no se llega desde la interfaz: no hay pantalla de ajustes. Es un riesgo latente.
- **Impacto (hipótesis):** dibujar 3840×2160 en el hilo principal y que el navegador lo lea para codificarlo (unos 33 MB por fotograma) puede costar calor, batería y fotogramas perdidos. La vista previa también se dibuja a 4K sin estar grabando, en cuanto hay zoom digital.
- **¿Nuevo?** Sí (Q6 quita el límite de 1920).
- **Arreglo:** medirlo en un S24 antes de ofrecer 4K. Si cuesta, limitar el lienzo a 1440p, o pedir 4K solo cuando la toma vaya a ser directa.
- **Test:** prueba de dispositivo, 2 min a 4K con zoom digital, con temperatura y fotogramas perdidos (cuando el hallazgo 3 esté arreglado).

### 🟢 7 · El vigilante del lienzo se rinde sin reintentar y el cambio al refresco de pantalla es para siempre · nota 3

- **Dónde:** `compositor.ts` 172–186.
- **Flujo:** si al cumplirse 1 s la cámara aún no tiene imagen (una apertura lenta, como 4K con reajuste a 30 fps), el vigilante se va sin volver a armarse. Si salta, el lienzo pasa al ritmo de la pantalla y no vuelve nunca al de la cámara. En ese modo se pueden dibujar fotogramas repetidos, y el contador no lo nota.
- **Protecciones:** ahora el vídeo está visible y los avisos de fotograma llegan, así que el vigilante casi nunca hace falta.
- **¿Nuevo?** Sí.
- **Arreglo:** si no hay imagen todavía, volver a armarlo en vez de irse. Y volver al ritmo de la cámara en cuanto llegue un aviso de fotograma.
- **Test:** unitario con un vídeo falso que tarda 1,5 s en tener imagen.

### 🟢 8 · Cambiar los ajustes reabre la cámara sin mirar si hay una toma en marcha o en pausa · nota 3

- **Dónde:** `useCamera.ts` 296–306.
- **Flujo:** cambia la calidad, la resolución o los fps y se reabre la cámara si no se está abriendo ya. No mira la fase de la toma. El comentario dice que los ajustes solo se abren entre tomas, pero el código no lo comprueba.
- **Impacto hoy:** ninguno, porque no hay forma de cambiar esos tres ajustes. Cuando llegue la pantalla de ajustes (paso 6), si se abre en pausa, una toma directa no podría seguir y una de lienzo cambiaría de tamaño.
- **Arreglo:** que el estudio diga si hay toma en marcha o en pausa y aplazar la reapertura hasta volver a «idle», o que la pantalla de ajustes solo se abra entre tomas.
- **Test:** al hacer el paso 6.

### 🟢 9 · Los avisos dicen «termina con ✓», pero el botón se llama «Listo» · nota 3

- **Dónde:** `RecordStudio.tsx` 419, 687, 692 (avisos); 1273–1276 (botón: texto «Listo», nombre accesible «Terminar la toma»).
- **Impacto:** con lector de pantalla el «✓» se lee como «marca de verificación», que no coincide con ningún botón. A la vista se entiende, pero «Listo» es más claro.
- **Arreglo:** «…o termina la toma con «Listo»». Lo mismo en la línea de pausa («toca para seguir o ✓ para terminar»), que es de antes.

### 🟢 10 · Una toma de lienzo puede bloquearse con el tamaño viejo de un lienzo parado · nota 3

- **Dónde:** `RecordStudio.tsx` 657–660 (`frameReady`), 506 (bloqueo del tamaño); `useCamera.ts` 108–148 (se marca «lista» en cuanto se asigna la pista, antes de que el vídeo sepa su tamaño).
- **Flujo:**
  1. Se usó el zoom digital en otra orientación y luego se volvió a 1×. El lienzo se para con el tamaño de entonces.
  2. Se reabre la cámara y se pulsa grabar sin cuenta atrás en las primeras decenas de milisegundos.
  3. Como el vídeo aún no sabe su tamaño, la toma directa no es posible. `frameReady` acepta el lienzo viejo y la toma va por el lienzo, bloqueada al tamaño antiguo.
- **Impacto:** una toma con bandas negras en toda su duración. La ventana de tiempo es muy estrecha.
- **Arreglo:** que `frameReady` exija también que el lienzo no esté parado y que su tamaño coincida con el del vídeo. O no marcar la cámara como lista hasta tener su tamaño.

### ⚪ 11 · Al pasar al zoom digital se ve un instante el último fotograma del lienzo parado · nota 2

- **Dónde:** `RecordStudio.tsx` 345 y 943; `compositor.ts` 206–210.
- **Impacto:** el lienzo se hace visible antes de su primer dibujo nuevo y enseña, durante un fotograma, una imagen antigua, quizá de otra orientación.
- **Arreglo:** al reanudar el dibujo, ocultar el lienzo hasta el primer fotograma nuevo, igual que al crearlo.

### ⚪ 12 · Chip «1080p · 60 · Auto»: el comentario dice que abre los ajustes, y el aviso de 30 fps solo se nota por el color · nota 2

- **Dónde:** `RecordStudio.tsx` 985–999, 377–386.
- **Detalle:**
  - Es un texto, no un botón (el comentario se adelanta al paso 6).
  - El color oro para «se queda en 30» no se anuncia; el aviso de texto sale una vez por cámara, lo cual está bien.
  - Si el navegador no da los fps, el aviso diría «graba a 0».
- **Arreglo:** corregir el comentario, añadir una etiqueta accesible («Grabará en 1080p a 30 fotogramas por segundo, calidad automática») y no avisar si los fps son 0.

### ⚪ 13 · Con el lienzo encima, el vídeo de debajo se sigue componiendo · nota 2

- **Dónde:** `RecordStudio.tsx` 924–944.
- **Impacto:** en modo lienzo, la pantalla compone dos capas de vídeo del mismo tamaño y una tapa la otra. El coste en batería es pequeño. Ocultar el vídeo podría parar los avisos de fotograma, que es justo lo que se quiere evitar, así que se deja como observación.

---

## Fuera de alcance (preexistente, visto de paso)

- **El chip 0,5× abre el gran angular y lo vuelve a acercar a ~1×** · nota 5 · `useCamera.ts` 249 llama a la apertura de la lente sin decir a qué zoom ir, así que se usa 1. Con la escala del gran angular (0,5), el código aplica un zoom de 2 (lente) o un recorte de 1,9 (digital). Viene del commit `6b9e4d3`. Afecta sobre todo a iPhone, que nombra la lente «Ultra Wide», y a los Android que la nombran. En Samsung la lente no suele llevar ese nombre y se usa el botón «Lente». Desde este commit, además, el recorte fuerza la toma por el lienzo y el aviso de zoom digital. Arreglo: pedir 0,5 al abrir el gran angular.

---

## Respuestas a las preguntas del encargo

- **¿Una toma directa en vertical sale derecha?** En Chrome Android, la cámara entrega los fotogramas ya girados según la pantalla: en vertical el vídeo mide 1080×1920. La grabación los guarda así, así que lo esperable es que salga derecha. No lo he probado en dispositivo. En iPhone hay riesgo (hallazgo 1).
- **¿Girar el móvil, cambiar de lente, perder la cámara o volver de segundo plano en una toma directa?**
  - Girar: pausa, pero tarde (hallazgo 2).
  - Cambiar de lente o de cámara: bloqueado (hallazgo 4).
  - Perder la cámara: la toma se pausa. Lo grabado se conserva aunque la pista de vídeo haya terminado; si además no hay sonido, la grabación se para sola y se guarda lo que hay.
  - Volver de segundo plano: si la pista terminó, no se puede seguir (hallazgo 4).
- **¿`requestFrame` con `captureStream(0)` da marcas de tiempo correctas?** Chrome pone a cada fotograma del lienzo la hora en que lo captura, y la grabación usa esas horas. La duración sigue el reloj real y las pausas se descuentan. El vídeo del lienzo va 1 o 2 fotogramas por detrás de la cámara (unos 17–66 ms), lo que no se nota. No he encontrado ningún problema, pero falta medirlo (ver comprobaciones).
- **¿rVFC con el vídeo visible u oculto, y el vigilante?** Ahora el vídeo está visible, así que los avisos de fotograma llegan. En el repaso se oculta, pero entonces el lienzo está parado. El vigilante casi nunca hará falta (hallazgo 7).
- **¿El contador mide algo útil?** En lienzo, a medias. En directa, no mide la grabación (hallazgo 3).
- **¿Puede reabrirse la cámara a mitad de toma al cambiar ajustes?** Hoy no, porque no hay forma de cambiarlos. Es un riesgo para el paso 6 (hallazgo 8).
- **¿Se pide y se respeta 60 fps?** Se pide 60 como «ideal» y, si cuesta resolución, se vuelve a pedir a 30. En toma directa se graba lo que dé la cámara. En lienzo, el tope es el refresco de la pantalla: con 120 Hz no hay problema. Con el modo de 60 Hz o el ahorro de energía de Samsung se perderían fotogramas (hipótesis), y ese caso sí lo detectaría un contador bien hecho. La compresión y el nivel de H.264 se calculan con los fps reales.
- **¿La vista previa es fiel?** Sí en los dos modos: misma imagen y mismo encuadre. Con la cámara frontal el espejo solo está en pantalla y el archivo no va espejado, igual que antes.
- **Rendimiento a 4K:** sin medir (hallazgo 6).
- **Batería al parar el lienzo:** bien hecho. En modo automático, sin zoom digital, el lienzo no dibuja ni en reposo ni en tomas directas. En una toma de lienzo en pausa sigue dibujando, porque es la vista previa.
- **Accesibilidad y textos:** los textos están en español de España y son claros. Hay detalles en los hallazgos 4, 9 y 12.

## Tests que faltan

- `createFrameMeter`: contar solo mientras corre, con pausas intermedias (es pura y fácil de probar).
- `settleCameraMode` con una pista falsa:
  - 720p60 pasa a 1080p30;
  - 1080p30 se queda;
  - un fallo de `applyConstraints` deja lo que había.
- La decisión «directa o lienzo» como función pura, con la plataforma (hallazgo 1).
- Cálculo de fotogramas perdidos por modo (hallazgo 3).
- Compositor con un vídeo falso:
  - parar y reanudar el dibujo;
  - el vigilante con una apertura lenta;
  - `requestFrame` una vez por dibujo.
- `sanitizeSettings` e `initialFacing` (no tienen tests; `apps/web` no tiene tests unitarios).
- e2e con `fake-media.js` (admite tamaño y fps):
  - toma directa de 60 s: la duración del archivo coincide con la contada;
  - cambio de tamaño a mitad de toma;
  - cámara falsa a 60 fps;
  - sincronía con la palmada falsa (`__fakeClap`).

## Comprobaciones hechas

- He leído el diff completo de los ficheros del alcance y los ficheros enteros en el commit.
- `pnpm --filter @coverscape/shared test`: 72 tests, todos pasan (incluidos los nuevos de `cameraRequest` y `belowRequested`).
- He seguido el flujo de una toma directa de principio a fin: elección, inicio, pausa por giro, pérdida de cámara, reanudar, terminar y liberar. Al terminar no se para la pista de la cámara, como debe ser: `createTakeRecorder` no para pistas.
- He comprobado que `delivered` del compositor no se usa en ningún sitio.
- He comprobado que ninguna pantalla cambia la calidad, la resolución, los fps, el modo ni la cámara inicial. Solo el formato, desde el panel «i».
- He comprobado los niveles de H.264 para 1080p60 en vertical y horizontal: nivel 4.2, correcto.

## Limitaciones

- **No he podido ejecutar `pnpm typecheck` sobre el commit.** El árbol de trabajo tiene cambios en curso de otro paso (RecordStudio, camera, recorder, useCamera e ImageControls modificados), así que el resultado no correspondería a `ca87fcd`.
- **Sin dispositivo.** No he podido probar:
  - el giro de fotogramas en Chrome Android;
  - qué pasa con un cambio de tamaño a mitad de grabación en MP4;
  - si Samsung termina o silencia la pista en segundo plano;
  - qué rango de fps elige Chrome con poca luz;
  - el coste del lienzo a 4K.

  Todo eso va marcado como hipótesis.
- **No he revisado las correcciones de los pasos 1 y 2** que van en el mismo commit (takeStore, leftovers, formatos).
