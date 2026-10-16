# F10 · Seguir a un bailarín y prueba rápida de IA de postura (5.5) · Ronda 1

Revisión de solo lectura del commit `675a775` (rama `feat/plan-completo`). No se ha editado nada del repo salvo este informe; no se ha tocado
Supabase real ni Vercel.
Alcance: `features/follow/*` (`followPath.ts` + test, `analyze.ts`, `useFollowActions.ts`, `followUi.ts`, `FollowStageLayer.tsx`, `FollowRow.tsx`),
`features/pose/*` (`models.ts`, `PoseLab.tsx`, `PoseLabSection.tsx`, `labStats.ts` + test, `mediapipePoseStub.ts`), `data/follow.ts`, la sección
`followBackend` de `lib/backend.ts` (real y demo), `player/store.ts` (`followPathId`), montajes en `StudioPage.tsx`, `SaveClipDialog.tsx`,
`SettingsPage.tsx`, `vite.config.ts`, `vercel.json`, `package.json`, la migración `20261016070000_follow_paths.sql` (sin aplicar) y
`supabase/tests/plan_f10_checks.sql`. Spec: `ideas-one-shoot.md` F10 y apartado 5.

Pruebas propias en el scratchpad (`cdp.mjs`, `flow*.mjs`, `vt/*.scratch.ts`): Chromium de Playwright con `--mute-audio` y CDP contra el demo
silenciado de `localhost:5174` (sin tocar `oneshoot.dev.sound`; no se ha abierto producción). Como no había vídeo con personas en el equipo, he
descargado una foto de Wikimedia Commons (varias personas, 960×639), la he convertido en un WebM de 8 s grabado con `MediaRecorder` (sin duración
en la cabecera, como una toma real) y la he subido al demo como archivo. Con eso he recorrido el flujo real: elegir persona, nombrar, analizar,
seguir, guardar clip, corregir, cancelar, borrar y el modo manual, en escritorio y a 390 px. El modelo MoveNet se ha descargado de verdad por la
cadena `tfhub.dev → kaggle.com → storage.googleapis.com`. El WebGL era SwiftShader (CPU): **los tiempos no valen para móviles** (unos 250 ms por
fotograma); para eso está la prueba de Ajustes.

`pnpm typecheck` pasa. `pnpm test` pasa (111 de `shared` + 247 de `web`; 25 de `followPath.test.ts`, 4 de `labStats.test.ts`). `pnpm db:test`: 18/18
migraciones, 8/8 archivos, 83 PASS (incluye `plan_f10_checks.sql`). `pnpm audit --prod`: sin vulnerabilidades conocidas.

La «nota» de cada hallazgo es su **gravedad** (10 = muy grave). 🔴 = bloquea. **Ningún hallazgo bloquea.**

## Resumen

La función hace lo que dice la spec y lo hace bien donde más duele. Lo verificado con el navegador, no solo con los tests:

- **Flujo completo real**: tocar a la persona 1, nombrar, «Seguir», progreso 1, 29, 43, 57, 85 y 100 %, «Siguiendo a «Minji»», zoom 134 % (0,7 / 0,52)
  centrado en ella y contorno con su nombre al pausar. Con espejo puesto, los recuadros de las personas caen sobre cada persona.
- **Sin fugas**: `tf.memory().numTensors` se queda en 303 tras 15 inferencias seguidas y tras 4 análisis completos (con y sin `requestVideoFrameCallback`,
  hacia delante y «Corregir»). Tras cada análisis hay 0 `<video>` ocultos en el DOM. Lo único que queda es el modelo (18,9 MB).
- **Cancelación**: abortar a mitad de análisis devuelve el control en unos 120 ms, quita el vídeo oculto y no crea recorrido (aviso «Análisis cancelado»).
- **Las dos pasadas**: reproduciendo más rápido (`requestVideoFrameCallback`) y fotograma a fotograma (`seeked`) acaban y dan recorrido. Un WebM sin duración
  se resuelve con `learnDuration`. Tocar donde no hay nadie da «No se ve a nadie ahí…» (`FollowError`).
- **Cajas de MoveNet**: la suposición de `candidatesOf` es correcta (cajas normalizadas 0…1, puntos en píxeles, ids del tracker presentes).
- **Seguimiento en cruces** (`followAround`, mis escenarios sintéticos con 0,1 / 0,2 / 0,5 / 1 s entre muestras, ids que se intercambian al cruzarse, un
  bailarín tapado 2 s y otro un 15 % más bajo): el seguido acaba siempre donde debe. Combina distancia, solape y tamaño; el id solo desempata.
- **Zoom y F9**: mover el zoom a mano (botón «Reducir», rueda, arrastre) deja de seguir y avisa; abrir un clip guardado «siguiendo a X» vuelve a seguirle; el
  zoom sigue el espejo; un recorrido borrado (archivado) deja el clip abriendo sin seguir.
- **Compresión**: 100 / 1000 / 5000 / 6000 puntos pesan 7,2 / 71,6 / 358,7 / 430,7 KB como `jsonb` (`pg_column_size` en PGlite); `estimateBytes` (80 B por
  punto) es conservador (real, unos 72 B). 12 000 puntos con ruido (20 min) pasan a 5808 en 11 ms, bajo el presupuesto de 480 KB. El límite de 600 KB es
  inalcanzable desde el cliente.
- **Carga**: `pose-tf` (1,09 MB, 273 KB gzip) y `pose-mediapipe` (136 KB) solo cuelgan de `models-*.js` por `import()` dinámico; no aparecen en `index.html`,
  en `sw.js` ni en el `__vite__mapDeps` de `StudioPage`. Precache: 77 entradas, 1669 KiB. `StudioPage` pesa 231 KB (73 gzip).
- **Base de datos**: la última `archive_row` conserva todas las ramas de la de `050000` y añade `follow_paths` (rama de `videos` y lista genérica). RLS con
  `(select private.default_group())`, `update` solo de las 5 columnas, `video_id` no se puede mover (comprobado), `crew_id` lo da el vídeo, miembro
  desconocido pasa a `null`, un clip solo sigue recorridos de su canción, `on delete set null` e índices en las tres FK. Tope de 500 vivos y 2000 en total.
- **Privacidad**: el vídeo nunca sale del dispositivo (blob local o la copia que el grupo ya tiene; el análisis lee el `<video>` en el cliente). Solo viajan la
  etiqueta, el modelo y los puntos.
- **CSP**: probada **aplicada** (cabecera `Report-Only` inyectada con CDP) con MoveNet y MediaPipe cargados de verdad: ninguna violación salvo el script
  en línea de Vite del modo desarrollo. Cada añadido hace falta (quitar `tfhub.dev`, `www.kaggle.com` o `'wasm-unsafe-eval'` da violaciones). Se puede
  apretar (H2).

Lo que conviene arreglar: las teclas que se tragan al elegir (H1), la CSP demasiado ancha y los terceros sin avisar (H2), el suavizado que cruza los
huecos (H3) y el modo manual que pierde puntos (H4).

---

## H1 · Mientras eliges bailarín, la `k` y el espacio dejan de escribirse en cualquier campo de la página · 5/10

- Dónde: `FollowStageLayer.tsx:233-243` (`onKey` en `window`, fase de captura, `stopImmediatePropagation` y `preventDefault` para `Escape`, espacio y `k` sin mirar el
  destino; solo se libra un `button` con espacio).
- Flujo: «Seguir a alguien» (o «Modo manual», «Corregir desde aquí», «Añadir punto aquí») → la superposición queda abierta → el resto de la página sigue activa
  (barra de reproducción, notas, nombre de clip…) → abrir «Nota» y escribir.
- Evidencia: con CDP, en el demo: «Seguir a alguien», clic en «Añadir una nota», foco en el campo y teclear «kilo karate». Valor del campo:
  `iloarate`. Faltan las dos `k` y el espacio. Con la superposición cerrada se escribe entero. También se traga `Ctrl+K` y `Cmd+K`.
- Arreglo: ignorar el evento si el destino es editable (`input`, `textarea`, `select`, `[contenteditable]`, o dentro de `[role=dialog]`) o lleva `ctrl`, `meta` o
  `alt`; mejor aún, escuchar en la propia superposición (con `tabIndex=-1` y foco al abrir) en vez de en `window`.
- Test: abrir la superposición, enfocar un `input` y comprobar que `k` y espacio llegan; `Escape` sigue cerrando; con el foco fuera de campos, espacio no
  reproduce.

## H2 · CSP: hosts completos donde bastan rutas, y tres terceros nuevos que la política de privacidad no cita · 4/10

- Dónde: `vercel.json` (CSP `Report-Only`: `script-src … https://cdn.jsdelivr.net` y `wasm-unsafe-eval`; `connect-src … https://cdn.jsdelivr.net https://tfhub.dev
  https://www.kaggle.com https://storage.googleapis.com`), `models.ts:16-19`, `PrivacyPage.tsx:53-76` (solo cita Google Fonts y YouTube).
- Flujo: cuando la política pase de `Report-Only` a obligatoria, `script-src https://cdn.jsdelivr.net` deja ejecutar cualquier script de cualquier paquete
  npm o repositorio de GitHub publicado en jsDelivr (el comodín clásico para saltarse una CSP tras un XSS), y `connect-src https://storage.googleapis.com`
  vale para cualquier bucket público de cualquiera.
- Evidencia: probé la política **aplicada** con una versión estrecha y MoveNet más MediaPipe siguen cargando sin violaciones:
  `script-src … https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm/ wasm-unsafe-eval` y
  `connect-src … https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm/ https://tfhub.dev https://www.kaggle.com
  https://storage.googleapis.com/mediapipe-models/` (en las redirecciones la CSP ignora la ruta, así que el salto a `storage.googleapis.com/kagglesdsdata/…`
  pasa). `tfhub.dev`, `www.kaggle.com` y `wasm-unsafe-eval` sí hacen falta: sin ellos hay violaciones. Además, la política de privacidad dice que el
  único tercero que ve la IP es Google Fonts; ahora el navegador también habla con jsDelivr (Cloudflare), `tfhub.dev` y Kaggle y Google Cloud Storage la
  primera vez que alguien usa F10 o la prueba, y Kaggle pone una cookie (`ka_sessionid`) en la redirección.
- Arreglo: (a) estrechar con las rutas de arriba; (b) añadir un párrafo en «Fuentes» o «Qué datos guardamos»: al seguir a un bailarín se descarga un modelo
  de IA desde servidores de Google y jsDelivr, el vídeo no se sube y solo se guarda el recorrido (texto); (c) opcional y mejor: **alojar los pesos de
  MoveNet (9,4 MB, 3 ficheros) y los WASM de MediaPipe en el propio dominio** (`public/models/…`, fuera del glob del precache). Quita `tfhub.dev`, Kaggle,
  GCS y jsDelivr de la CSP y del `urlPattern` del service worker, elimina la dependencia de una redirección ajena (ver H11) y deja `MEDIAPIPE_VERSION` sin
  riesgo de desajuste con `package.json`.
- Test: un script que lea `vercel.json` y compruebe que ninguna entrada de `script-src` es un host sin ruta salvo los previstos; prueba con CDP como la mía
  (cabecera inyectada y evento `securitypolicyviolation`) con F10 y la prueba abiertas.

## H3 · El suavizado mezcla puntos de antes y después de un hueco y arrastra el zoom hacia donde reaparecerá · 4/10

- Dónde: `followPath.ts:146-166` (`smoothKeyframes`, ventana de ±2 puntos **por índice**, sin mirar el tiempo); se aplica en `analyze.ts:283` a todo el recorrido.
- Flujo: el bailarín queda tapado o fuera de plano unos segundos (los fotogramas sin él no generan punto) y reaparece lejos. Los puntos contiguos al hueco se
  promedian con los del otro lado.
- Evidencia: `vt/a.scratch.ts`: tres puntos quietos en x = 0,1 (t de 0 a 0,4) y tres en x = 0,8 (t de 10 a 10,4). Tras `smoothKeyframes`, el último punto previo al
  hueco pasa de 0,100 a 0,333 (+0,23 del ancho del fotograma) y el primero posterior de 0,8 a 0,567. Con el zoom a 2× el centro se aleja 0,23 del bailarín que
  sigue ahí quieto; a 3× (el zoom habitual del seguimiento: `pathScale` va de 1,2 a 3,5) queda fuera de plano.
- Arreglo: al promediar, descartar los vecinos cuyo tiempo difiera más de unos 0,75 s (o más de 2,5 pasos de muestreo) del punto central; el hueco ya lo cubre
  la interpolación.
- Test: en `followPath.test.ts`, dos tramos quietos separados 10 s; tras `smoothKeyframes` el último punto del primero no se mueve de 0,1 (± 0,001).

## H4 · En modo manual, un punto colocado en línea con sus vecinos se borra al guardar, aunque diga «Punto guardado» · 4/10

- Dónde: `useFollowActions.ts:170` y `FollowRow.tsx:88` (`compressKeyframes(...)` también para `source` manual); `followPath.ts:462-521` (`simplify` quita puntos
  que una recta ya da, con tolerancia 0,002 y huecos de hasta 4 s).
- Flujo: modo manual, bailarín quieto: colocar el mismo recuadro en 0 s, 2 s y 4 s.
- Evidencia: `vt/a.scratch.ts`: `compressKeyframes(upsertKeyframe([[0, …]], 2, mismaCaja))` y otra vez en 4 deja **2 puntos, no 3**. El aviso dice «Punto guardado»
  pero el punto desaparece: el contador («con 2 puntos») no sube y, al pasar por ese momento, el botón dice «Añadir punto aquí» en vez de «Mover el punto». (En el
  demo con puntos a 0, 5 y 8 s no se nota porque 5 s supera el hueco de 4 s.)
- Arreglo: no simplificar los recorridos manuales (solo redondear y deduplicar): son pocos puntos y los ha puesto una persona.
- Test: tres cajas iguales a 0, 2 y 4 s en un recorrido manual se conservan las tres.

## H5 · Accesibilidad del flujo de elegir y del progreso · 4/10

- Dónde: `FollowRow.tsx:227` (`aria-live="polite"` en el párrafo que contiene el porcentaje); `FollowStageLayer.tsx:176-389` (`PickOverlay`);
  `FollowRow.tsx:57-60` (`startPicking`).
- Flujo: lector de pantalla o teclado.
- Evidencia: (1) el texto «Analizando a «Minji»: 43 %» cambia en cada 1 % dentro de una región `polite`: se anuncia de continuo (21 mutaciones en el contenedor de la
  fila en dos análisis parciales). (2) «Modo manual» y «Añadir punto aquí» solo se resuelven arrastrando: con teclado no se puede colocar el recuadro (con «Seguir a
  alguien» sí, por los botones «Persona N»). (3) Al empezar a elegir, el botón pulsado pasa a `disabled` (`picking != null`) y el foco se pierde en `body`; la
  superposición no tiene `role`, ni nombre, ni recibe el foco, y al terminar no se devuelve. (4) La superposición no es modal: el botón de reproducir de la barra
  sigue activo y el vídeo puede moverse mientras eliges (las cajas son del fotograma de cuando se abrió).
- Arreglo: anunciar solo los cambios de fase y, como mucho, cada 10 % (una región `sr-only` aparte); dar a la superposición `role="group"` con nombre y foco al
  abrir (en «Cancelar»), y devolver el foco al botón que la abrió; un método de teclado para el recuadro (flechas mueven, `+` y `-` cambian el tamaño, `Intro`
  confirma) o, como mínimo, que «Modo manual» ofrezca también las cajas de personas cuando hay archivo; volver a pausar (o cerrar la elección) si se reproduce.
- Test: con teclado, completar «Modo manual» sin ratón; el foco queda dentro durante la elección y vuelve después.

## H6 · «Guardar clip» ofrece a la vez «con el zoom» y «siguiendo a X», los dos activados · 3/10

- Dónde: `SaveClipDialog.tsx:58,114,208-209` (`withZoom` y `withFollow` empiezan en `true`).
- Flujo: seguir a alguien, marcar A–B y pulsar `s`.
- Evidencia: el diálogo muestra «Guardar con el zoom (134 %)» y «Guardar siguiendo a «Minji»», ambos marcados. Se guarda una foto fija del zoom de ese instante del
  seguimiento además del seguimiento. Si luego se borra el recorrido, el clip abre con ese zoom fijo, que no corresponde a nada.
- Arreglo: con `follow` activo, no ofrecer el zoom (o dejarlo desactivado por defecto y desactivarlo si se activa el seguimiento).
- Test: con `follow` presente, el zoom no se guarda salvo que se marque a propósito.

## H7 · Cancelar no hace nada hasta que acaba de descargarse el modelo · 3/10

- Dónde: `analyze.ts:226-227` (`await loadMoveNet` sin señal), `useFollowActions.ts:49-66`, `FollowRow.tsx:252-259`.
- Flujo: primera vez en un móvil con red lenta (10,5 MB entre código y pesos): «Seguir», «Preparando el modelo…», «Cancelar».
- Evidencia: por lectura (la descarga no se puede abortar y `throwIfAborted` solo se mira después). El botón sigue activo y la fila sigue en «Preparando…» hasta
  que acaba; quien pulsa varias veces no ve efecto. Pasa igual con `seekVideo` (10 s de espera máxima sin señal).
- Arreglo: en `run`, hacer una carrera (`Promise.race`) entre la carga y la señal de aborto y limpiar el trabajo al instante (la descarga sigue en segundo plano
  y queda en caché).
- Test: abortar con la carga pendiente (promesa simulada que no resuelve) y comprobar que `analyzeFollow` rechaza enseguida con `AbortError`.

## H8 · Si falla guardar el recorrido, se pierde el análisis entero · 3/10

- Dónde: `useFollowActions.ts:96-117` (`startAuto`) y `:149-158` (`correct`).
- Flujo: analizar una canción larga en el móvil (minutos) y que la red caiga justo al guardar (o que se llegue al tope de 500 recorridos).
- Evidencia: `result` es una variable local; el `catch` solo muestra el error y `finally` limpia el trabajo. No hay «Reintentar» ni se conserva en memoria.
- Arreglo: guardar el resultado en `followUi` (o en un `ref`) y ofrecer «Reintentar guardado» en la fila; o reintentar una vez de forma automática.
- Test: forzar un fallo de `insertFollowPath` y comprobar que se puede reintentar sin volver a analizar.

## H9 · Elegir bailarín borra el zoom que tenías si no seguías a nadie, y «Cancelar» no lo devuelve · 3/10

- Dónde: `FollowStageLayer.tsx:203-205` (`setZoom(NO_ZOOM)` al montar la superposición).
- Flujo: ampliar a mano un pie en F9, «Seguir a alguien», «Cancelar».
- Evidencia: por lectura del montaje: con un recorrido seguido, `useFollowDriver` lo reaplica al salir; sin recorrido el zoom queda en 100 %. Mostrar la imagen
  entera para elegir es correcto; lo que falta es devolverlo.
- Arreglo: guardar el zoom previo al abrir y restaurarlo en «Cancelar».
- Test: zoom 2× a mano, abrir y cancelar la elección: el zoom sigue siendo 2×.

## H10 · La spec F10 §6 (seguir al bailarín del original en el superpuesto del repaso) no está · 3/10

- Dónde: `followPath.ts:547-557` (`followZoomAt` con la opción `mirroredOutside`) y su test existen, pero ningún archivo de `features/review/` usa `followPathId` ni
  `followZoomAt` (búsqueda en todo `src/`).
- Flujo: repaso en «Superpuesto» con un original con varios bailarines.
- Evidencia: sin usos fuera de `features/follow`; `ESTADO-IMPLEMENTACION.md` aún pone F10 como «Pendiente». La opción `mirroredOutside` es código preparado y sin uso.
- Arreglo: o conectarlo (el original del repaso lee los recorridos del vídeo y aplica `followZoomAt` a `zoomOriginal`) o anotar en el plan que queda para otra ronda
  y quitar la opción hasta entonces.
- Test: el repaso con un recorrido seguido mueve `zoomOriginal` al avanzar el tiempo.

## H11 · Los pesos de MoveNet dependen de una redirección de `tfhub.dev` que ya no es el origen · 3/10

- Dónde: `models.ts:111-121` (`createDetector` con la URL por defecto de `pose-detection`).
- Flujo: cualquier primera descarga del modelo.
- Evidencia: hoy `tfhub.dev/.../model.json` responde 302 a `www.kaggle.com/models/google/movenet/tfJs/multipose-lightning/1/model.json`, otro 302 a
  `storage.googleapis.com/kagglesdsdata/…` con URL firmada (3 h). Funciona (probado), con CORS correcto en cada salto, pero es una compatibilidad que Google
  mantiene y el service worker cachea bajo la URL antigua. Si algún día la quitan, F10 deja de funcionar para todos y el único aviso es «No se pudo descargar el
  modelo de seguimiento». Nada en el repo lo detecta.
- Arreglo: alojar los 3 ficheros (9,4 MB) y pasar un `modelUrl` propio a `createDetector` (ver H2 c). Si no, una comprobación periódica del `model.json`.
- Test: el `model.json` propio es accesible y `loadMoveNet` no sale del origen.

## H12 · Los modelos y el contexto de GPU no se liberan nunca; la prueba puede cargar dos copias de MoveNet · 3/10

- Dónde: `models.ts:97-132` (`moveNets` por backend), `:166-204` (`landmarker` único), `:75-86` (`useBackend` cae a WebGL).
- Flujo: usar F10 una vez y seguir en la app; o, en Ajustes, elegir WebGPU en un equipo sin él.
- Evidencia: tras cargar MoveNet quedan 303 tensores y 18,9 MB, más la textura de WebGL, hasta cerrar la pestaña. Con `loadMoveNet` pidiendo webgl y luego webgpu sin
  WebGPU (el caso de este Chromium): `backend` resuelto webgl, detectores distintos y **606 tensores, 37,8 MB**: el respaldo crea un segundo detector en vez de
  reutilizar el de WebGL. MediaPipe añade su propio contexto GL y tampoco se cierra (no se llama a `landmarker.close()`). No hay control de `webglcontextlost` (un
  móvil que pasa a segundo plano durante un análisis: el siguiente `estimatePoses` falla con un error crudo).
- Arreglo: indexar `moveNets` por el backend **resuelto** (si pidió webgpu y cayó a webgl, devolver el mismo); `dispose()` del detector y `landmarker.close()` al
  salir del estudio o de Ajustes tras unos minutos sin uso; reintentar una vez la carga si falla por contexto perdido.
- Test: pedir webgpu sin WebGPU devuelve el mismo detector que webgl; `tf.memory().numBytes` no sube.

## H13 · Errores de carga del modelo: texto con inglés y sin reintento · 2/10

- Dónde: `models.ts:52` (`No se pudo preparar ${what}: ${raw}`), `FollowStageLayer.tsx:225` (`err.message` tal cual para errores que no son `ModelLoadError`).
- Flujo: un fallo que no sea de red (GPU, `estimatePoses` sobre un vídeo sin datos).
- Evidencia: el mensaje mezcla español e inglés técnico (por ejemplo «No se pudo preparar el modelo de seguimiento (MoveNet): Cannot read properties of null
  (reading features)», que es justo lo que sale hoy en la consola al pedir WebGPU sin adaptador). La barra de elegir añade «Puedes dibujar un recuadro», pero no hay
  botón «Reintentar».
- Arreglo: mensaje fijo en español para el caso genérico (el detalle, a `console.warn`) y «Reintentar» en la superposición.
- Test: cualquier excepción desconocida produce un texto en español, sin el mensaje de la librería.

## Observaciones sin nota

- **Densidad de muestreo en equipos lentos**: `passPlaying` no baja de 1× (el suelo está en `Math.max(1, …)`), así que si el modelo tarda más que 1/fps entre fotogramas la
  densidad cae al ritmo del modelo (con 250 ms por fotograma: 14 muestras en 5 s, unas 2,5 por segundo en vez de 10). Es razonable (el seguimiento planea sobre los
  huecos), pero conviene ver cuánto da en móviles reales con la prueba antes de fiarse de los cruces. El tracker usa un reloj propio (suma 1000 / fps por muestra) que
  no refleja ese espaciado.
- **Pestaña en segundo plano**: `requestVideoFrameCallback` no dispara; a los 4 s el vigilante abandona la pasada y empieza **de nuevo** con `seeked`. Se pierde lo hecho.
- **«Corregir desde aquí» solo recalcula hacia delante**: lo que hay entre el salto real y el momento en que se pausa queda mal, como pide la spec («recalcula desde ese
  punto»); conviene decirlo al usuario («pausa justo donde salta»).
- **Zoom y bandas negras**: el zoom del seguimiento hereda de F9 que el recorte es contra la caja, no contra la imagen; con vídeos verticales en el estudio 16:9 se ven
  bandas aunque el bailarín esté dentro de la imagen.
- **`listFollowPaths` trae los puntos de todos los recorridos de la canción** aunque solo se siga uno: con 6 bailarines de unos 70 KB son unos 430 KB cada vez que se abre
  el estudio. Aceptable hoy; si crece, pedir los puntos solo del seleccionado.
- **Sin verificar**: con WebGPU real, la primera llamada a `tf.getBackend()` (en `useBackend`) puede inicializar antes el backend WebGPU, de mayor prioridad, y luego
  cambiar a WebGL; no he podido probarlo (el Chromium de pruebas no tiene adaptador). Tampoco he medido móviles reales ni Safari de iOS (vídeo de 2×2 px fuera de
  pantalla con `play()`).
- **Textos**: español de España en todo (tú, «vídeo», «recuadro», «portátil»); sin americanismos. Colores solo por tokens (el lienzo de la prueba lee las variables
  `--color-*`) y movimiento con `jelly` y `snappy`.
