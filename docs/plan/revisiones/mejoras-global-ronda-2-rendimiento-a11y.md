# Revisión global · ronda 2 · rendimiento y accesibilidad (17-10)

Revisor de solo lectura. No he tocado código, ni git, ni el navegador, ni Supabase. Solo he escrito este informe.

## Alcance

- `git diff d58885e..0e6df92`: 83 archivos, el commit `fix: global review — heavy-work coordination, lighter chunks,
  accessibility`. Lo comparo con los dos informes de la ronda 1, `mejoras-global-rendimiento.md` y
  `mejoras-global-accesibilidad.md`.
- Una compilación de producción de `0e6df92` en una carpeta temporal fuera del repo (`vite build --outDir`). Los tamaños
  gzip están calculados con nivel 9 sobre los archivos emitidos, con el mismo método que en la ronda 1. Para atribuir
  módulos a chunks he buscado cadenas propias de cada módulo en los archivos emitidos.
- `pnpm test`: en verde. `shared` pasa 7 archivos y 155 tests; `web`, 58 archivos y 749 tests.
- Lectura de código: coordinación del trabajo pesado (`heavyWork`, copia, separación, análisis, grabador, versión),
  `encode.ts`, menú flotante (núcleo, alternativa y prototipos), `scroll-padding`, avisos, zoom, chips del estudio,
  laboratorio, bolsa, papeleta, ronda y copys.
- Nota: en el árbol de trabajo aparecen `docs/plan/ESTADO-IMPLEMENTACION.md` y `docs/plan/PROGRESO.md` modificados. No
  los he tocado yo.

## Tamaños (kB gzip salvo donde se indica)

| Medida | Ronda 1 (`d58885e`) | Umbral | **`0e6df92`** | Estado |
| --- | --- | --- | --- | --- |
| Entrada `index-*.js` | 71,3 (213,3 kB) | ≤ 65 | **64,8** (197,6 kB) | ✅ (margen de 0,2) |
| Camino crítico de la portada (entrada + 5 `modulepreload` + CSS) | 302,3 | ≤ 303 | **296,2** | ✅ |
| · CSS / react / motion / supabase / query / iconos | 23,1 / 83,2 / 46,0 / 58,3 / 11,5 / 8,8 | — | 23,4 / 83,2 / 46,0 / 58,3 / 11,5 / 8,9 | ≈ |
| Chunk `StudioPage` | 62,2 | — | **51,7** | −10,5 |
| Lo que abre el estudio (su chunk + dependencias estáticas fuera del camino crítico) | 107,0 | ≤ 88 | **78,6** | ✅ |
| Grabador: chunk `RecordStudio` | 45,0 | ≤ 45 | **47,3** | ⚠ ver nota |
| Grabador + lo que no llega con el estudio (`RecordStudio` + `takes`) | — | — | 59,8 | — |
| Estudio + grabador juntos | 152,0 | ≤ 152 | **138,4** | ✅ |
| Precache del SW (entradas que da vite-plugin-pwa / KiB sin comprimir) | 77 / 1889,9 | ≤ 80 / ≤ 1900 | **84 / 1895,9** | ✅ KiB (margen de 4) · ⚠ entradas |
| Precache en gzip (lo que baja una instalación) | 625,9 | — | 632,5 | +6,6 |

Lo que abre el estudio, en detalle (78,6): `StudioPage` 51,7, `YouTubeStage` 6,7, `VoiceOnda` 4,5, `store` 4,2,
`models` 3,9, `cloudCopySupport` 2,5 (lleva también `cloudCopyRules`), `voiceRules` 1,5, `cloudCopyJob` 0,8,
`ElasticToggle` 0,8, `Segmented` 0,7, `Field` 0,7 y `linking` 0,6.

**Nota sobre el grabador.** El chunk crece 2,3 kB porque el detector de aplausos (`clap.ts`) vuelve a él desde la
entrada, que es donde debe estar. `takes` (12,5) sale del estudio y ahora solo baja con el grabador, «Tomas» o la
revisión. Por eso cumple la alternativa (estudio + grabador ≤ 152): 138,4, 14 kB menos que en la ronda 1.

**Comprobaciones de los chunks:**

- Lo que el estudio carga con `import()`, no al abrir: `analyze`, `FollowFsMenu`, `SeparateVoiceButton`,
  `RecordStudio`, `TakesPanel`, `ReviewScreen` y las olas B–G.
- `cloudCopy`, `mp4Mux` y `audioAlign` ya no están en el chunk del estudio. Las cadenas propias de los tres (`ftyp`,
  `tkhd`, `Copia cancelada`, `HandBrake`) solo aparecen en `cloudCopyRun-*.js`, que se carga con `import()` al
  empezar una copia, y en `runSeparation` (su propio `mp4.ts`).
- `cloudCopyRules` ya no está en la entrada. Ahí solo llega `cloudSpace.ts`, con `takesReserveBytes`. `projectFrom` y
  `acceptRatio` solo aparecen en `cloudCopySupport-*.js`.
- `clap.ts`: `maxDecayMs` solo aparece en `RecordStudio-*.js`. Han funcionado `DECIDE_AFTER` como literal y
  `"sideEffects": false`.
- `labState`: el registro con las descripciones (por ejemplo, «Rueda de kamon») ya no está en la entrada; va en
  `SettingsPage`. En la entrada quedan solo los nombres de chunk del mapa de `import()`.
- Las cuentas atrás largas van en tres chunks perezosos (`CountdownKoyomi`, `CountdownSunadokei` y `CountdownTsuki`),
  con el hueco de tamaño fijo (sin CLS).

**`sw.js`:** no hay ningún `pose-*`, `*Demo-*`, `*.worker-*`, `.wasm`, `NavHanafuda`, `NavKamon` ni `NavOrigami`.
`PoseLab-*.js` sí está, pero es la página del laboratorio, no el modelo. Lo nuevo:

- Una regla `CacheFirst` `voice-runtime` para `ort-wasm*.wasm`, con 1 entrada y `purgeOnQuotaError`.
- Los menús no elegidos están en `lab-demos`.

## Hallazgos de la ronda 1 → estado

### Rendimiento

| Ronda 1 | Estado | Comprobado en |
| --- | --- | --- |
| [6] La copia para la nube compite con todo | **Corregido** (queda un resto: [4] nuevo) | `beginHeavyWork('copy')` dura todo el trabajo (`cloudCopyJob.ts:96`). Mientras espera o sube, la copia cuenta como trabajo en reposo (`idle`) y no como carga. `copyPace` aplica: pausa con `covered`, pausa con la separación, 1× con el estudio reproduciendo y 2× si no (`cloudCopyRules.ts:68`, con tests). En `encodePicture`, `readPace` corre cada 250 ms y hace `video.pause()`, `rateCap` y el aviso «En pausa mientras…». `holdReason` incluye `'copy'`, y el análisis lo vuelve a mirar dentro de su bucle (`analyze.ts:576`), así que tampoco coinciden si el análisis empezó antes. La separación espera a la copia (`wait-copy`), y la copia, a la separación. No hay interbloqueo: la separación solo espera a una copia que está trabajando, no a una en reposo. El grabador no aprende de una carga ajena (`judgePace`/`runBench` con `heavyWorkBusySince`). Una actualización no corta la copia (`reloadBusy` en `main.tsx` y `VersionCheck`). |
| [5] Lo que abre el estudio, 107 kB | **Corregido** | 78,6 ≤ 88. `cloudCopyJob` queda en almacén y ejecutor; `lazy` para `FollowFsMenu` y `SeparateVoiceButton`; `import('./analyze')` en `useFollowActions` y en `PickOverlay`. Ojo: el `lazy` de `SeparateVoiceButton` trae una regresión, el [5] nuevo. |
| [5] `encode.ts`: hilo principal y memoria | **Corregido en memoria y cesión; queda la tarea larga** ([3] nuevo) | `monoHead` solo de los primeros 30 s, el retraso medido sobre un MP4 de cabeza (`headFrameCount`), la descodificación entera solo para `provePlays` y soltada al momento, y `breathe()` (`scheduler.yield` o `setTimeout`) entre pasos. El pico de unos 0,9 GB baja a unos 160 MB transitorios. Pero `estimateLag` sigue siendo una sola tarea de unos 43 M de multiplicaciones. |
| [4] Entrada +35 % | **Corregido** | 64,8 ≤ 65: `clap` fuera, `labIds.ts`, cuentas atrás perezosas y `cloudSpace.ts`. |
| [3] `backdrop-blur` en la barra de la ronda | **Corregido** | `RpdPage.tsx:366`: `bg-sumi-850` opaco y sin blur. |
| [3] El `.wasm` de onnxruntime solo en la caché HTTP | **Corregido** | `vite.config.ts:174-183`: `CacheFirst` `voice-runtime`. Falta comprobar en producción `content-encoding: br`. |
| [2] Prototipos no elegidos en el precache | **Corregido para el menú** | `globIgnores` + `lab-demos`. Las variantes de voz se quedan a propósito, porque no tienen alternativa si no cargan. |
| [2] Ola B, envolvente en el hilo | Abierto (sin cambios) | Es una variante del laboratorio. |
| [2] Faroles con motion y `drop-shadow` | Abierto (sin cambios) | `EventCountdown.tsx:192`. |
| [1] Pellizco del grabador y cuenta previa | Abierto (sin cambios) | Son cortos y acotados. |

### Accesibilidad

| Ronda 1 | Estado | Comprobado en |
| --- | --- | --- |
| [6] Kamon: arrastrar para llegar a la mitad (2.5.7) | **Corregido** | Hay dos botones de paso de 44 px, «Sección anterior» y «Sección siguiente», fuera del borde y a los dos lados de la muesca (`dialStepPlaces`). Tests a 390×844, 844×390, 300×650 y 650×300: dentro de pantalla, sin solaparse y fuera del disco. Usan `aria-disabled` en los extremos, para que el foco no se pierda, y un `aria-live` con «En la muesca: X. Tócala para ir». La ayuda ahora dice «Gira o usa las flechas». |
| [5] Origami en horizontal con la página ampliada | **Corregido** | `origamiLayout`: 3×2 con caras de 64 px cuando no cabe, y `maxHeight` con `overflow-y-auto` como red. Tests a 844×390, 650×300, 562×260 y con el escenario del laboratorio. |
| [5] Botón flotante y barras pegadas tapan el foco (2.4.11) | **Corregido** | `html { scroll-padding-bottom }` usa `--sticky-bar-h` y, en < 64rem, el máximo de las dos variables con `--fab-scroll-pad`. `--fab-scroll-pad` vale 80 px + zona segura y el botón ocupa 72 px. La barra se mide con `ResizeObserver` en la papeleta, «Elegir para votar» y «Empezar». La página la desplaza el documento (`min-h-dvh`), así que el `scroll-padding` de `<html>` sí actúa. |
| [5] Mover el zoom sin arrastrar (2.5.7) | **Corregido** (con un matiz: [2] nuevo) | `PanArrows`: cuatro flechas de 44 px con `keyZoom`, que tienen en cuenta el espejo. El texto de ayuda se ha actualizado. |
| [4] Texto pequeño sobre la cámara o el vídeo | **Corregido** | «Empieza en»: pastilla `sumi-900/90` con 11/12 px. Lentes: `sumi-900/90` y `text-washi`. Chips «YouTube» y «Solo en este dispositivo · Subir a la nube», en la barra y en pantalla completa: `sumi-900/90` a 12 px, con un área de 44 px hecha con `before:` (−10 px arriba y abajo). Sobre una imagen blanca, `washi-muted` da unos 8,3:1 y `washi`, unos 10:1. |
| [4] «Usar esta» deja el foco en `body` | **Corregido** | `DesignLabSection.tsx`: la línea «Es la que usas» lleva `tabIndex={-1}` y recibe el foco al pulsar. |
| [4] Nombres de Hanafuda y Sensu cortados a 360 y 300 px | **Corregido** | Hanafuda: con cartas de < 66 px, sin icono, kanji de 24 px y nombre de 11 px en dos líneas, con `hyphens-auto`, `lang="es"` y `overflow-wrap:anywhere`. Sensu en `compact`: solo el nombre, a 12 px en dos líneas. |
| [3] Separar voz: el final se anuncia tres veces | **Corregido** | Sin `role="status"` en el `<p>`, que recibe el foco. Quedan el aviso y el foco, con textos distintos. |
| [3] Copia: dos regiones vivas | **Corregido** | `announce={!linking}` en la fila del estudio. |
| [3] BagPage: contraste de «Fuera» y confirmación | **Corregido** | Sin `opacity-80` y con `washi-muted` en «Salió el…». La confirmación dura 10 s, no caduca mientras el botón tiene el foco, Esc la cancela y se dice en un `aria-live`. |
| [3] Copys | **Corregido** | «dispositivo», «Descartar», «Encender/Apagar el flash», «Sacar uno menos/más a la vez», «Un clip menos/más», «La música sin la voz» y `modeHint` cuando hay pistas IA. |
| [3] La barra de la papeleta ocupa demasiado | **Corregido** | Solo «Votar»/«Cambiar voto» van en la barra. «Deshacer cambios» y «Retirar mi voto» van debajo, fuera de ella. |
| [2] «Secciones» dos veces, `aria-haspopup`, Tab en la alternativa | **Corregido** | Los grupos ya no tienen nombre. `aria-haspopup="dialog"` en el botón del núcleo y en el de la alternativa. `PlainQuickNav` atrapa el Tab con `trapFocusIndex` y añade «¿Quién eres?». |
| [2] Cuenta atrás de la ronda: `aria-label` en un `span` | **Corregido** | `aria-hidden`. |
| [2] Nombre cortado en el laboratorio a 360 px | **Corregido** | Por debajo de 400 px, una sola columna con salto de línea. |
| [2] Los avisos tapan el botón flotante | **Corregido** | En < lg, `bottom` = máx. de la zona segura, `--sticky-bar-h` + 8 y `--fab-scroll-pad`. |
| [2] Esc en pantalla completa nativa | Abierto (no tocado) | — |
| [4] `maximum-scale=1.0` (fuera de alcance) | Abierto (decisión de 2fa8679) | `index.html:5`. |

**Sin regresiones** en lo demás que he revisado:

- `overlayPlacement`: el diálogo ya no se monta otra vez al salir de pantalla completa. El `MutationObserver` solo
  hace una comprobación barata, `isConnected`.
- El cursor oculto ya no se aplica sobre los diálogos en pantalla completa.
- La etiqueta de la sección actual se ha movido encima del botón.
- `FollowError` sigue reconociéndose por su `name`.
- El hueco de `FollowFsButton` mientras carga ya no mueve la barra.

## Hallazgos nuevos

De mayor a menor nota.

- **[5] `apps/web/src/features/studio/StudioPage.tsx:578-582` + `features/voice/SeparateVoiceButton.tsx:55-62` — el
  `lazy` de «Separar voz» cancela en silencio una separación en marcha.**
  - Antes, el componente estaba siempre montado y, sin `available`, devolvía `null`. Ahora solo se monta mientras
    `available`, que viene de `Boolean(s.engine?.setVoiceMode)`. Ese valor pasa a `false` cada vez que el motor se
    suelta: al cambiar «Archivo | YouTube» a YouTube en una entrada de YouTube con archivo, al cambiar `src` u
    `offset` del `FileStage` (resincronizar) o con un error del medio.
  - Al desmontarse, el efecto hace `job.current?.abort()`. Como `mounted` ya vale `false`, no sale ningún aviso.
    Cuando el motor vuelve, aparece otra vez «Separar» como si nada.
  - Se pierden minutos de trabajo. Y ahora la ventana es mayor, porque la separación puede pasar un buen rato en
    «Esperando a que acabe la copia…».
  - Arreglo: que el componente no se desmonte después de la primera vez. Por ejemplo, un `useState` que se queda en
    `true` en cuanto `available` es verdadero, y `<SeparateVoiceButton available={available} />` desde entonces. O
    llevar el trabajo a un almacén de módulo, como `cloudCopyJob`.

- **[4] `features/voice/separate/runSeparation.ts:298-303, :351` + `stemSeparator.worker.ts:242` +
  `features/studio/cloudCopy.ts:651` — el grabador abierto puede coincidir con trabajo pesado que no se para.**
  - Separación: espera con `heavyWorkBusy('copy')`, pero la copia pasa a reposo justo cuando se abre el grabador.
    Entonces la separación arranca mientras se graba. Lee y descodifica la canción entera en el hilo principal
    (`decodeSong`: `decodeAudioData` y unos 160 MB de PCM). El worker descarga y compila el modelo en la GPU antes de
    mirar la pausa, porque `untilGoOn` solo está en el bucle de segmentos.
  - Es justo el flujo que la app anima: vincular un archivo (empieza la copia), «Separar» (se queda esperando) y
    ponerse a ensayar en el grabador.
  - Copia: `untilFree` solo se mira antes del sonido. Si el grabador se abre durante la fase de sonido (descodificar el
    original, codificar, descodificar de vuelta y `measureShift`, varios segundos en un móvil), no se para.
  - Arreglo:
    - En `runSeparation`, esperar también mientras `covered`. Por ejemplo, `untilHeavyWork` con un predicado
      `heavyWorkBusy('copy') || covered()`, suscrito además a `usePlayer`. O `whileCovered` antes de `decodeSong`.
    - En el worker, `await untilGoOn()` antes de cargar y compilar el modelo, o no mandar `run` hasta que el grabador
      se cierre.
    - En la copia, un `await untilFree(opts)` entre los pasos del sonido.

- **[3] `features/voice/separate/encode.ts:212` (`separateRules.ts:369-375`) — `estimateLag` sigue siendo una sola
  tarea larga.**
  - La cesión rodea la llamada, pero dentro siguen los 3601 desfases × 12 000 muestras de la pasada gruesa: unos 43 M
    de multiplicaciones, 200–400 ms con CPU ×4.
  - Se repite 2–4 veces por canción (pasada normal y con lista de edición, en dos pistas). Si el estudio está en bucle,
    el salto llega tarde.
  - Arreglo: partir el bucle de desfases en tramos de unos 400 con `await breathe()` entre ellos, o hacer la medida en
    el worker, que ya tiene las muestras.

- **[2] Precache: 84 entradas (umbral de la ronda 1, ≤ 80) y 1895,9 KiB, a 4 KiB del límite de 1900.**
  - Partir los chunks suma entradas pequeñas: `cloudCopyRun`, `cloudCopySupport`, tres cuentas atrás,
    `FollowFsMenu`, `SeparateVoiceButton` y `analyze`. Sacar los tres menús apenas lo compensa.
  - El coste por entrada es pequeño, pero el margen en KiB casi se ha acabado. El siguiente prototipo lo pasará.
  - Arreglo: al elegir los diseños del laboratorio, borrar los perdedores (las 6 olas, las 2 cuentas atrás no elegidas
    y los 3 menús) y fijar los umbrales nuevos en ESTADO §9.

- **[2] `features/nav/QuickNav.tsx:225` — la lista de reserva del menú (`PlainQuickNav`) no tiene límite de alto.**
  - Con «¿Quién eres?» son 7 filas de 48 px más el relleno, unos 350 px, colgadas a 84 px del borde de abajo. En
    844×390 (unos 306 px libres), y antes aún con la página ampliada, la primera fila se sale por arriba. Es lo mismo
    que se ha arreglado en Origami (1.4.10).
  - Solo aparece si el prototipo elegido no carga (sin conexión antes de la primera carga).
  - Arreglo: `max-h-[calc(100dvh-100px)] overflow-y-auto` en el `<nav>`.

- **[2] `features/studio/ZoomControls.tsx:145` — las flechas para mover el zoom solo están en la fila de debajo del
  vídeo, no en pantalla completa.**
  - En pantalla completa, mover el encuadre sigue pidiendo arrastrar. 2.5.7 se cumple, porque la función existe sin
    arrastre fuera de la pantalla completa, pero obliga a salir de ella.
  - Arreglo, si se quiere: las mismas flechas en la barra de pantalla completa mientras haya zoom.

- **[1] Entrada a 64,8 de 65.**
  - No es un fallo, pero cualquier añadido a la entrada romperá el umbral. Lo más barato que queda en ella es
    `heavyWork` + `reloadBusy` y el mapa de `import()` del laboratorio.
  - Conviene medirlo en cada ronda.

- **[1] `features/nav/quickNavCore.tsx:384` — la etiqueta de la sección, ahora encima del botón, queda a la misma altura
  que los avisos (80–106 px).**
  - En un móvil de 390 px, un aviso ancho la tapa los 2 s que se ve. Es solo visual: la etiqueta es `aria-hidden`.

## Medidas pendientes en producción

Las mismas de la ronda 1, en silencio:

- La traza B (estudio en bucle con una copia en marcha) ya debe cumplir los umbrales de la A: ≤ 2 tareas de más de
  50 ms por minuto y el bucle sin cambios.
- Ahora, una separación en el Samsung con una canción de 7 min debe tener un pico claramente por debajo del de la
  ronda 1.
- Comprobar `content-encoding: br` en `ort-wasm*.wasm`.

## Veredicto

**No queda nada ≥ 6.** Todos los hallazgos ≥ 3 de la ronda 1 están corregidos, sin regresiones en lo medido:

- Entrada: 64,8.
- Camino crítico: 296,2.
- Estudio: 78,6.
- Estudio + grabador: 138,4.
- Precache: 1895,9 KiB.
- `sw.js`, limpio.

El [6] de rendimiento (coordinar la copia) y el [6] de accesibilidad (Kamon) están bien resueltos y con tests.

Conviene corregir en la misma pasada:

- El **[5]**: la separación se cancela en silencio al soltarse el motor, una regresión del `lazy`. Es un cambio de
  pocas líneas.
- El **[4]**: la separación o el sonido de la copia pueden correr con el grabador abierto.

El [3] de `estimateLag` y los [2] pueden esperar.
