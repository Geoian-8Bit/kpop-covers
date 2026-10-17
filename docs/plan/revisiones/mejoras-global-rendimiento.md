# Revisión global de rendimiento · ronda de mejoras (17-10)

Revisor de solo lectura. No he tocado código, ni el navegador, ni Supabase.

## Alcance

- `git diff 11dee4d..HEAD` (HEAD = `d58885e`, rama `feat/plan-completo`): 245 archivos, 164 del cliente sin contar tests.
- Dos compilaciones de producción en carpetas temporales fuera del repo, con `vite build --outDir` y otra pasada con
  `--sourcemap` para saber qué módulo ocupa cada byte. Una de HEAD y otra de `11dee4d` (con `git worktree` temporal,
  ya borrado). Tamaños gzip calculados con nivel 9 sobre los archivos emitidos.
- Lectura de código: estudio (`covered`, olas, seguir, pantalla completa, zoom con dos dedos), grabador, ronda, copia
  para la nube, separación de voz, análisis de seguir, menú flotante, cuenta atrás y bolsas.
- `pnpm test`: 53 archivos y 706 tests en verde.
- Nota: durante la revisión apareció `apps/web/src/features/nav/quickNavCore.tsx` modificado en el árbol de trabajo.
  No lo he tocado yo. La compilación de HEAD se hizo antes de ese cambio.

## Tamaños antes y después

Todo en kB gzip salvo donde se indica. Las cifras de ESTADO §9 se midieron en `d75b994`, una versión anterior a
`11dee4d`. Las pongo como referencia; la comparación justa es entre las dos últimas columnas.

| Medida | ESTADO §9 / global | 11dee4d | HEAD | Δ ronda |
| --- | --- | --- | --- | --- |
| Entrada `index-*.js` | 54,8 | 52,8 (163,6 kB sin comprimir) | **71,3** (213,3 kB) | +18,5 (+35 %) |
| Camino crítico de la portada (entrada + 5 `modulepreload` + CSS) | ~285 | 277,2 | **302,3** | +25,1 (+9 %) |
| · CSS | 22,3 | 19,5 | 23,1 | +3,6 |
| · motion | 46,1 | 43,5 | 46,0 | +2,5 |
| · react / supabase / query / iconos | 83,3 / 58,5 / 11,4 / 8,7 | 83,2 / 58,3 / 11,3 / 8,5 | 83,2 / 58,3 / 11,5 / 8,8 | ≈0 |
| Chunk `StudioPage` | 48,9 | 54,2 | **62,2** | +8,0 (+15 %) |
| Lo que abre el estudio (su chunk + dependencias estáticas fuera del camino crítico) | — | 68,0 | **107,0** | +39,0 (+57 %) |
| Grabador `RecordStudio` (el resto ya llega con el estudio) | 20,8 | 32,9 | **45,0** | +12,1 (+37 %) |
| Precache del SW (entradas que da vite-plugin-pwa / KiB sin comprimir) | 77 / 1,66 MiB | 58 / 1552,9 | **77 / 1889,9** | +19 / +337 KiB (+22 %) |
| Precache en gzip (lo que baja una instalación) | 566 | 505,7 | **625,9** | +120 |

Lo que se precarga en la portada no ha cambiado. Siguen los mismos cinco `modulepreload` (react, motion, query,
supabase, iconos). En reposo, la portada pide además el estudio y la API de YouTube (`prefetch.ts`). En móvil pide
también el prototipo del menú elegido: Sensu (1,5) y `quickNavCore` (2,7).

**Fuera del arranque y del precache** (lo he comprobado en `sw.js`):

- `pose-tf` (1,09 MB, 273,7 gzip), `pose-mediapipe` (40,6) y `pose-tf-wasm` (34,2).
- Los dos `.wasm` de tfjs (311 y 425 kB).
- `stemSeparator.worker` con onnxruntime (128 kB).
- `ort-wasm-simd-threaded.asyncify.wasm` (26,8 MB).
- Los cinco `*Demo-*.js` del laboratorio.

P15 está corregido: las demos ya no entran en el precache.

**En el precache aunque solo lo usan algunos.** Es poco, pero crece con cada prototipo:

- El chunk compartido `cloudCopyJob` (21,4). Lleva además tomas y `recording.ts`, que antes iban en el estudio.
- `runSeparation` (6,0), `model` (1,7) y `wasmBackend` (0,5).
- Los menús no elegidos, Hanafuda, Kamon y Origami (5,8).
- Las olas B–G no elegidas (10,7).

## Hallazgos

De mayor a menor nota.

- **[6] `apps/web/src/features/studio/cloudCopy.ts:471-660` (y `lib/heavyWork.ts:6`, `follow/analysisHold.ts:10`) —
  la copia para la nube compite con todo y nada la para.**
  - Qué hace: corre en el hilo principal durante minutos. Un `<video>` oculto reproduce el original (más de 50 MB,
    normalmente 1080p o 4K) a hasta 2× (`MAX_RATE`, línea 37). En cada fotograma hace `drawImage` + `new VideoFrame(canvas)`
    + `VideoEncoder` (líneas 541-560).
  - Solo frena cuando pierde sus propios fotogramas o cuando la app se oculta. No mira si el estudio está reproduciendo
    (el bucle A–B depende del hilo principal) ni si el grabador está abierto (`covered`).
  - No se marca como trabajo pesado: `HeavyWorkKind` solo tiene `'voice'`. Así, el análisis de seguir y la separación
    pueden arrancar a la vez. Y el grabador puede grabar una toma 1080p60 mientras la copia descodifica y codifica:
    dos descodificadores y dos codificadores de hardware a la vez en un Samsung de gama media. Riesgo directo de
    tirones en el ensayo y de fotogramas perdidos en la toma, justo en el flujo «vincula el archivo y ponte a ensayar»
    que `LinkFilePanel` anima («Puedes sincronizar mientras»).
  - La revisión voz-archivo ronda 2 dejó esto «abierto (medir)»; con el grabador y el análisis encima, hay que
    arreglarlo.
  - Arreglo:
    - (a) `beginHeavyWork('copy')` en `cloudCopyJob` mientras dura el trabajo.
    - (b) En `encodePicture`, retener la copia (el mismo `held` + `video.pause()`) mientras
      `usePlayer.getState().covered`, mientras corra la separación y mientras siga el análisis prioritario. Con el
      estudio reproduciendo, limitar `rate` a 1× (o una fracción del tiempo, como `analysisDuty`).
    - (c) `holdReason()` devuelve también `'copy'`, para que el análisis espere.
    - (d) Medirlo con la traza B de la lista de abajo.

- **[5] `apps/web/src/features/studio/StudioPage.tsx:67-81` — lo que abre el estudio crece un 57 % (68,0 → 107,0
  kB gzip).**
  - Entran de forma estática cosas que casi nunca se usan al abrir:
    - `FollowFsMenu` (7,9 kB sin comprimir; solo en pantalla completa).
    - `SeparateVoiceButton` + `separateRules` (12,6 kB; solo vídeos con archivo).
    - `CloudCopyStatus` → `cloudCopyJob` → `cloudCopy` + `mp4Mux` + `audioAlign` (≈26 kB de codificador solo para
      pintar un estado).
    - `analyze.ts` + `followTrack` + `followPlan` (≈16 kB, a través de `useFollowActions.ts:12`).
  - Con el precache y la precarga en reposo casi no se nota. Sí en la primera visita por enlace directo a `/v/…`
    (enlaces compartidos) y en el análisis y compilación de cada apertura en móvil.
  - Arreglo:
    - Partir `cloudCopyJob` en un almacén pequeño (`useCopyJob`, `cancel`, `clear`) y un ejecutor con `import()`
      dentro de `startCloudCopy`.
    - `lazy()` para `FollowFsMenu` y para el botón de separar.
    - `import()` de `analyzeFollow` al empezar un análisis.
  - Objetivo: ≤ 88 kB gzip (−19 kB).

- **[5] `apps/web/src/features/voice/separate/encode.ts:148-178` y `separateRules.ts:326` — al codificar las pistas
  separadas, mucho trabajo y memoria en el hilo principal.**
  - Por cada pista:
    - `mono()` recorre la canción entera dos veces (la referencia y lo descodificado de vuelta).
    - `estimateLag` (`maxLag` = 7200, ventana de 1 s) hace unos 43 millones de multiplicaciones en la pasada gruesa.
  - Son 2–3 medidas por pista, cada una una tarea larga de 200–400 ms con CPU ×4. Si mientras tanto hay un clip en
    bucle en el estudio, el salto del bucle llega tarde.
  - Pico de memoria del hilo principal con una canción de 7 min (el máximo con < 8 GB), unos 0,9 GB:
    - 4 pistas de 74 MB.
    - El remuestreo (161 MB).
    - La descodificación de vuelta (161 MB).
    - Dos mezclas mono de 80 MB.
  - Con 4 GB de memoria, la pestaña puede cerrarse sin aviso.
  - Arreglo:
    - Mezclar a mono solo la ventana que mide `estimateLag` (inicio ± `maxLag` + ventana), no la canción entera.
    - Medir el retraso sobre la cabeza del archivo, como hace `soundShift` en `cloudCopy.ts:383` (solo los primeros
      `CHECK_SECONDS`). La comprobación de que la pista suena puede quedarse con la descodificación entera, pero
      soltándola nada más medir.
    - Ceder el hilo entre pasos (`await scheduler.yield?.()` o `setTimeout 0`), o hacer la medida en el worker.

- **[4] Entrada +35 % (52,8 → 71,3 kB gzip) por varias cosas que no hacen falta para pintar la biblioteca.**
  - `packages/shared/src/clap.ts:113`: `DECIDE_AFTER = … Math.max(...Object.values(CLAP_LEVELS).map(…))` es código de
    módulo con efectos posibles. Rollup conserva el módulo porque la entrada lo alcanza por el barril (`index.ts:8`),
    y todo el detector de aplausos acaba en la entrada (4,9 kB sin comprimir; antes estaba en el chunk del grabador).
    - Arreglo: dejar la constante literal o marcarla con `/* @__PURE__ */` en una función. Mejor aún, poner
      `"sideEffects": false` en `packages/shared/package.json`.
  - `features/lab/labState.ts:2` importa `registry.ts`, que importa los cuatro momentos con todas sus descripciones
    (≈8 kB sin comprimir en la entrada).
    - Arreglo: un `labIds.ts` con `{ id, defaultVariant, variantes }` para el almacén; los momentos, perezosos en
      `DesignLabSection`.
  - `features/events/EventCountdown.tsx:131`: las tres cuentas atrás largas van en la entrada (+6 kB sin comprimir).
    - Arreglo: cuando se elija una, borrar las otras (ya está previsto). Mientras, `lazy` para las no elegidas.
  - `cloudCopyRules.ts` entero (3,8 kB) llega a la entrada por `lib/backend.ts:22` (`videosBucketHasRoom`).
    - Arreglo: mover esa función a un módulo pequeño.
  - En total se recuperan unos 7 kB gzip.

- **[3] `apps/web/src/features/rpd/RpdPage.tsx:362` — `backdrop-blur-[6px]` nuevo en una barra pegajosa al 95 % de
  opacidad.**
  - Al desplazar la lista de pistas en el móvil, el desenfoque se recalcula en cada fotograma y casi no se ve.
  - Arreglo: quitar el blur (o `bg-sumi-850` opaco).

- **[3] `apps/web/vite.config.ts:141-160` — el `.wasm` de onnxruntime (26,8 MB) solo vive en la caché HTTP.**
  - No está en ninguna caché del SW. En Android esa caché expulsa antes los archivos grandes, y repetir una
    separación días después vuelve a bajar 26,8 MB.
  - Arreglo: añadirlo a una regla `CacheFirst` propia (`/^\/assets\/ort-wasm[^/]*\.wasm$/`, una entrada,
    `purgeOnQuotaError`).
  - Comprobar en producción que Vercel lo sirve comprimido (`content-encoding: br`).

- **[2] `features/nav/QuickNav.tsx:29-34` y `features/voice/VoiceSplitControl.tsx:27-35` — prototipos y variantes no
  elegidos en el precache.**
  - Son 16,5 kB gzip y crecen con cada prueba de diseño.
  - Arreglo: al elegir, borrar los perdedores (está previsto). Si la prueba se alarga, excluirlos con `globIgnores`,
    como las demos. El menú ya tiene su lista sencilla de reserva sin conexión.

- **[2] `features/voice/studioWave.ts:162-174` — la ola B («Audio real»).**
  - Lee el archivo entero (hasta 60 MB, o 30 MB con ≤ 4 GB).
  - Si Safari rechaza 8 kHz, `envelopeFromChannels` recorre la canción a 44,1 kHz en el hilo principal (≈300 ms con
    CPU ×4).
  - Solo afecta a una variante del laboratorio que no es la de por defecto. Si la eligen: calcular la envolvente en
    trozos con cesión, o en un worker.

- **[2] `features/events/EventCountdown.tsx:375-395` (anterior a la ronda) — los faroles el día del evento.**
  - Se balancean siempre con motion sobre SVG (animación JS en cada fotograma), y la elipse lleva `drop-shadow`.
  - Arreglo: CSS `@keyframes` sobre un `<g>` con `transform` y una sombra sin filtro, como en `BagShelf`.

- **[1] `features/record/useCamera.ts:493` y `features/rpd/RpdPlayPage.tsx:294` (anteriores a la ronda).**
  - El pellizco de zoom del grabador vuelve a pintar el componente raíz en cada fotograma mientras dura el gesto.
  - La cuenta previa de la ronda vuelve a pintar `RoundRunner` cada 80 ms.
  - Los dos son cortos y acotados.

**Sin hallazgo** (revisado):

- **Estudio, `covered`:** `useUnlessCovered` y `Dormant`, más la barra y la línea de tiempo pintadas por DOM, hacen
  que bajo el grabador no se pinte nada. El estudio no se suscribe a `zoom` (solo «con zoom o sin zoom»).
- **Grabador:**
  - El reloj de la toma (`TakeClock`) solo re-renderiza su texto; el intervalo de 200 ms escribe en refs.
  - `SongBar` se pinta con `transform`.
  - El compositor no pasa por React.
- **Olas A:** `transform` en CSS, en pausa si no suena, sin animación con movimiento reducido. El sondeo de mono es
  cada 600 ms y solo con la separación activa.
- **Seguir:** el conductor va limitado a 80 ms y respeta `covered`. El análisis, con su fracción de tiempo, cede y
  espera al grabador y a la voz. Los selectores son booleanos.
- **Ronda:** el título es un selector booleano.
- **Bucle sin cortes:** medición por elemento con `WeakMap`, sin estado en la interfaz.
- **Separación:** en un worker con transferencia; el modelo, en Cache Storage.
- **Menú flotante cerrado:** solo `fullscreenchange`, `matchMedia` y `useLocation`. Al abrirse, sus oyentes se
  limpian.
- **Temporizadores e intervalos:** todos los revisados se limpian. Los dos que no (el gracia de `forgetTake`, el
  `abort` del sondeo de versión) son de una sola vez y a propósito.
- **Precache:** fuera pose, demos, worker y `.wasm`. No hay `modulepreload` nuevos.

## Medidas que debe tomar el coordinador en producción

Todas en el despliegue de esta rama, en silencio (memoria `silent-tests`). Antes, si se puede, se mide la versión
desplegada ahora con el mismo método.

**1. Lighthouse móvil de la portada** (`/`: 3 pasadas, mediana; en frío sin SW y en visita repetida).
«No empeora» si:

- Rendimiento ≥ 90.
- LCP ≤ 2,5 s en frío y ≤ 1,2 s en visita repetida.
- TBT ≤ 150 ms.
- CLS ≤ 0,01.
- Accesibilidad, buenas prácticas y SEO = 100.
- En escritorio, en visita repetida: LCP ≤ 340 ms (296 + 15 %).

**2. Lighthouse móvil del estudio** (`/v/<id>` de un vídeo de YouTube y de otro con archivo, en frío). «No empeora»
si:

- LCP ≤ 3,0 s.
- TBT ≤ 250 ms.
- El script del chunk del estudio ≤ 150 ms en «Main-thread work».

**3. Trazas a 390×844, CPU ×4, 30 s cada una.**

- **A. Estudio en pantalla completa** con un clip en bucle de un archivo, en «sin voz».
  - Fotogramas: ≥ 55 fps de mediana, p95 ≤ 20 ms.
  - 0 tareas largas > 50 ms en régimen estable.
  - El salto del bucle sin hueco visible (≤ 1 fotograma entre el fin y el nuevo inicio).
- **B. La misma traza mientras corre una copia para la nube** (hallazgo [6]). Antes del arreglo es solo diagnóstico.
  Después: los mismos umbrales que A, ≤ 2 tareas > 50 ms por minuto y el bucle sin cambio.
- **C. Grabador.** Sin cámara en el ordenador: Chrome con `--use-fake-device-for-media-stream` o depuración remota en
  el Samsung.
  - Vista previa y 20 s de toma.
  - Hilo principal ocupado ≤ 50 %, 0 tareas > 100 ms.
  - `RecordStudio` ≤ 2 commits por segundo grabando (React Profiler).
  - Panel «i»: fluidez ≥ 58/60.
- **D. Ronda de Random Play Dance** (cuenta previa + 2 clips + cambio de clip).
  - ≤ 15 commits por segundo en la cuenta previa.
  - 0 tareas > 50 ms reproduciendo.
  - El cambio de clip con ≤ 1 tarea < 100 ms.

**4. Memoria.**

- Abrir y cerrar el estudio 5 veces (y el grabador 3): el montón JS vuelve a ±10 MB del inicio.
- En el Samsung, una separación de una canción de 3–4 min sin que se cierre la pestaña. Apuntar el pico en
  `chrome://inspect`.

**5. Tamaños** (con `vite build`, sin regresión respecto a esta tabla):

- Entrada ≤ 72 kB gzip (≤ 65 tras el [4]).
- Camino crítico ≤ 303.
- Lo que abre el estudio ≤ 107 (≤ 88 tras el [5]).
- Grabador ≤ 45.
- Precache ≤ 1900 KiB y ≤ 80 entradas.
- En `sw.js`: ningún `pose-*`, `*Demo-*`, `stemSeparator.worker-*` ni `.wasm`.

## Veredicto

**Sí, hay un hallazgo ≥ 6:** el [6]. La copia para la nube corre sin coordinarse con el estudio, el grabador, el
análisis ni la separación. Hay que corregirlo antes de dar la ronda por buena y verificarlo con la traza B.

Lo demás es ≤ 5:

- El estudio carga un 57 % más.
- La separación pesa en el hilo principal y en memoria al codificar.
- La entrada crece un 35 % (camino crítico +9 %).

Conviene hacerlo en este orden: [5] estudio, [5] separación, [4] entrada. Nada pesado (onnxruntime, tfjs, wasm,
workers, demos) entra en el arranque ni en el precache.
