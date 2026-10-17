# Revisión · Seguir a un bailarín, puntos 14 y 15 · ronda 2

## Alcance

Revisión de solo lectura de la copia de trabajo de `feat/plan-completo`, que no tiene commit. He comprobado los
hallazgos de `mejoras-seguir-ronda-1.md`, con más detalle los de nota 4 o más.

Archivos revisados:
- `features/follow/`: analyze, analysisHold, followPath, followTrack, followPlan, followUi, useFollowActions,
  FollowStageLayer, FollowFsMenu, FollowRow y sus pruebas.
- `features/pose/`: models, backendRules (+ prueba), wasmBackend, PoseLab.
- `lib/heavyWork.ts` y el envoltorio de `voice/separate/runSeparation.ts`.
- `FsTopBar` en `StudioPage.tsx`.
- `vite.config.ts` y la CSP de `vercel.json`.
- `@tensorflow/tfjs-backend-wasm@4.22.0`.

Qué he ejecutado:
- `npx tsc --noEmit -p apps/web`: sin errores en ninguna zona.
- Vitest de `src/features/follow`, `src/features/pose` y `src/lib`: 14 archivos y 116 pruebas, todas en verde.
- `vite build` con la salida en el scratchpad, sin tocar el `dist/` del repositorio. Resultado:
  - Se emiten `assets/tfjs-backend-wasm-<hash>.wasm` (311 KB) y `assets/tfjs-backend-wasm-simd-<hash>.wasm` (425 KB).
    El de hilos no se emite.
  - El chunk `pose-tf-wasm` ocupa 136 KB.
  - `sw.js` no precachea ninguno de los dos `.wasm`; solo lleva la regla de caché en tiempo de ejecución.
- Simulaciones con `createFollower` en el scratchpad, para el nuevo hallazgo 2.

No he arrancado servidor ni navegador.

## Hallazgos de la ronda 1 → estado

| # | Ronda 1 | Estado |
|---|---|---|
| 1 | [6] El análisis sigue con el grabador abierto | **Corregido.** `studioHost.held()` mira `covered` y la separación de voz. En `playRange`, cada fotograma pregunta `pace.held()` antes de mirar (`analyze.ts:402`). En `seekRange`, se pregunta antes de cada búsqueda (`:453`). `runRange` espera en `pace.free`, con la copia pausada (`:550-561`), y vuelve a `last.t + 1/fps`, así que no se pierde ningún fotograma. Si una espera llega con un fotograma a medias, el fotograma acaba y la espera empieza en el siguiente; nunca hay dos a la vez. El vigilante no salta mientras hay un fotograma en curso (`busy`, `:397`). La línea de progreso dice «En pausa mientras grabas». |
| 2 | [5] El segundo plano no deja sitio al estudio | **Corregido.** Carga de trabajo `duty` de 0,35 si el estudio reproduce y 0,6 en pausa (`followPlan.ts:143-161`). El tramo prioritario conserva 1/1,3 y nunca baja de 1× (`playbackRate`): sigue igual de rápido. Frame a frame hay descanso proporcional solo fuera del tramo prioritario. La separación de voz pone el análisis en espera. |
| 3 | [5] En un fotograma «both», MultiPose mira otro fotograma | **Corregido.** `capture` copia el fotograma a 256 px antes del primer `await` (`:570-579`), y `multiDetect` lee esa copia. El recorte de SinglePose también se dibuja de forma síncrona, en la misma llamada. |
| 4 | [5] Caída de WebGPU a WebGL a mitad de un tramo | **Corregido.** `fallBackToWebGl` hace: pausa, carga de WebGL, calentamiento, `newSession`, `dropBackend` del motor roto. Va con `switching`, así que solo pasa una vez. Después lanza `Restart` y el tramo vuelve a empezar desde `last.t`. Tras `finish`, nada sigue: `busy`/`deferred` y `if (done) return`. Detectores liberados. Queda un fleco: ver los nuevos 3 y 6. |
| 5 | [5] «Los otros» envejecen mientras el bailarín no se ve | **Corregido, con una regresión.** Ahora cada «otro» guarda cuándo se vio, se sigue en cada MultiPose y se olvida pasados 1,5 s. Hay pruebas en `followOthers.test.ts`. La regresión es el nuevo hallazgo 2. |
| 6 | [5] El recorte se va al vecino | **Corregido.** Ahora se tapan en negro los «otros» dentro del recorte (`cropMasks`) y se rechaza la caja con `w > 1,4 × lo esperado`. Hay pruebas. Queda un margen justo: ver el nuevo 5. |
| 7 | [4] Cambio de archivo o de desfase a mitad del análisis | **Corregido.** `fileKey` → `reset(FILE_CHANGED)`. `run` lo detecta con `sameFile()` y no guarda el final. Queda una carrera pequeña en `onReady`: ver el nuevo 8. |
| 8 | [4] El recalibrado compara cajas distintas | **Corregido.** `calibrate` pasa SinglePose sobre la copia a 1280 px del mismo fotograma (`shotCanvas`) y solo cuando MultiPose miró primero. Hay pruebas. |
| 9 | [4] WebGPU en Android sin medir | **Corregido.** En el móvil se usa WebGL, salvo que la prueba de postura haya medido WebGPU ≥15 % más rápido (`backendRules.ts:46`). |
| 10 | [3] `job(null)` borra un análisis más nuevo | Corregido: `endJob(abort)` y la cadena `lastRun`. |
| 11 | [3] El tiempo restante baila | Corregido: `steadyRemaining`, con histéresis. |
| 12 | [3] Lienzos pequeños sin aceleración | Sin cambios (pide medir). Pendiente. |
| 13 | [3] Tocar fuera del panel pausa o reproduce | Corregido: se ignora el `click` durante 700 ms, en captura. |
| 14 | [3] Dos `aria-live` con el mismo texto | Corregido: la fila calla con `fsHosts > 0`. |
| 15 | [3] Zona segura a los lados | Corregido en `FsTopBar` y en la barra del selector (`FollowStageLayer.tsx:440`). |
| 16 | [3] Reloj del rastreador | Corregido: `createStampClock`, con prueba. |
| 17 | [2] Esc en pantalla completa nativa | Sin cambios. Pendiente. |
| 18 | [2] Falta «Quitar punto» en pantalla completa | Corregido. |
| 19 | [2] El aviso del 25 % repite el texto | Corregido. |
| 20 | [2] `releasePoseModels` no libera el motor | Sin cambios. Ver el nuevo 6. |

Motor WASM (sección 4 de la ronda 1):
- **Elección:** WebGPU real → WebGPU. En escritorio: renderer por software → WASM, o medida guardada con WASM ≥15 %
  más rápido → WASM. Si no, WebGL.
- **Prueba en marcha:** tras 12 fotogramas a más de 80 ms, en escritorio, una vez por análisis.
- **Móvil:** nunca. `chooseBackend` lo excluye y `shouldProbeWasm` exige `!mobile`.
- **Fallos:** si falla al cargar, `useBackend` lo marca como roto y cae a WebGL. Si falla una operación al ejecutarse,
  `guarded` → `fallBackToWebGl`. Si falla durante la prueba, el `catch` lo marca como roto y vuelve a WebGL.
- **Binarios:** `setWasmPaths` con `?url` da los tres nombres que exige la 4.22 (si falta uno, lanza un error). El de
  hilos apunta al SIMD y `WASM_HAS_MULTITHREAD_SUPPORT` va a false. El paquete no tiene `exports`, así que la
  importación profunda se resuelve.
- **CSP:** sirve tal cual: `connect-src 'self'` y `'wasm-unsafe-eval'`, sin orígenes nuevos.
- **heavyWork:** `beginHeavyWork` es síncrono y `separate` es async, así que cualquier error pasa por el
  `try/finally`. `release` es idempotente.

## Hallazgos nuevos

1. **[4] `analyze.ts:671-675, 808-814` + `backendRules.ts:73-87` — la prueba WASM se repite en cada análisis y la
   medida guardada no la evita.**
   - El problema:
     - `probed` es local de cada `analyzeFollow`, y `shouldProbeWasm` no mira la medida guardada.
     - En un ordenador con WebGL lento (>80 ms) donde WASM pierde, cada «Seguir» o «Corregir» vuelve a hacer la
       prueba. Eso es: cargar el chunk y el `.wasm`, recrear los dos detectores (`dropBackend('wasm')` los liberó),
       calentarlos y hacer 6 pasadas.
     - Son unos segundos dentro del tramo prioritario, que es justo el que el usuario espera.
     - Además, la medida guardada es `multi` (`:698-699`), pero la decisión se toma con `all` (multi+single, `:701`).
       Si WASM gana en `multi` y pierde en `all`, la siguiente sesión arranca en WASM por la medida guardada, aunque
       la prueba dijo que no.
   - *Arreglo:*
     - No hacer la prueba si `readBench()` ya tiene `wasm` y `webgl`: la decisión ya está tomada.
     - Además, un indicador de sesión `wasmProbed` en models.ts.
     - Guardar como medida el mismo número con el que se decide (`all`), o decidir con `multi`.
     - Prueba en `backendRules.test.ts`.

2. **[4] `followPath.ts:340-356` — un «otro» que se queda con el bailarín provoca un cambio de persona.**
   - El problema:
     - Pasado `CLAIM_AFTER` (0,5 s perdido), cualquier candidato que un «otro» reciente reclame queda excluido.
     - La memoria de ese «otro» se mueve cada fotograma, así que su reclamación nunca envejece.
     - Simulado con `createFollower`:
       - El nuestro (O) queda tapado por B entre 1,0 y 1,75 s (solo se ve B).
       - Entre 2,0 y 2,5 s, MultiPose solo ve a O, justo donde la memoria de B esperaba a B. La memoria de B salta a
         O, y O queda excluido (`found=false` estando a la vista).
       - A 2,75 s, con los dos a la vista, la memoria de B sigue reclamando a O, y el seguidor se queda con B.
       - Es un cambio de persona definitivo.
     - Antes de la ronda, este caso salía bien: `someoneElse`, con la memoria antigua, dejaba coger a O, porque
       estaba donde se esperaba.
     - Los casos normales siguen bien: B delante todo el cruce, o una sola mancha fundida.
   - *Arreglo:* no excluir un candidato reclamado si está a menos de ~0,3 tamaños de `expected` y más cerca de
     `expected` que de la memoria que lo reclama. O no dejar que una memoria salte a un candidato que esté dentro del
     alcance del nuestro mientras el nuestro está perdido. Añadir la prueba «tapado por B y luego B tapado por él».

3. **[3] `followTrack.ts:283-291` + `analyze.ts:662, 794` — un `Restart` en `calibrate` llega con el seguidor ya
   movido.**
   - El problema:
     - `whole()` hace `follower.step(t)` y después llama a `calibrate`.
     - La primera SinglePose real de cada tramo es precisamente una calibración, así que es el sitio más probable de
       la caída del motor. Si cae ahí, el `Restart` llega con el seguidor ya en `t` y sin `afterMulti`. El fotograma
       de `t` se pierde.
     - El tramo vuelve a `last.t`, y el siguiente fotograma tiene `t' ≈ t`. Con `dt` de 0–0,03 s, la velocidad sale
       del ruido. Está limitada a ±0,6, pero desvía el siguiente recorte.
   - *Arreglo:* `calibrate` (y `multi`) leen copias (`shotCanvas`, `multiCanvas`), no el vídeo en marcha. Pueden ir con
     `guarded(fn, false)`, que repite sobre la misma copia, o atrapar el `Restart` en `calibrate` y devolver `null`.
     Solo `single` (que lee el vídeo) necesita reiniciar el tramo.

4. **[3] `analyze.ts:272-289` — `peopleInFrame` no cae a WebGL.**
   - El problema: con «auto» en WASM (renderer por software, sin medir) o en WebGPU, un fallo de ejecución al tocar al
     bailarín deja el selector en error. No marca el motor como roto, así que cada intento vuelve a fallar. El
     análisis sí cae a WebGL; el selector no.
   - *Arreglo:* `try/catch` alrededor de `estimatePoses`. Si el motor no es `webgl`: `markBackendBroken`,
     `loadMoveNet('webgl')` y repetir.

5. **[3] `followTrack.ts:81-82` + `followPath.ts:395` — margen justo de las máscaras.**
   - El problema:
     - Lo que queda sin tapar alrededor del nuestro es su `expected` ±5 % del ancho.
     - Las máscaras son la última posición de los «otros», de hasta 0,75 s antes, sin seguir su rumbo.
     - Si el bailarín se mueve más rápido de lo previsto, o extiende un brazo hacia el vecino, la máscara le tapa
       parte. SinglePose da entonces una caja más estrecha, el centro se desplaza y el siguiente `expected` tapa
       todavía más.
     - La comprobación de cada 1,5 s lo corrige, pero el zoom tiembla.
   - *Arreglo:* margen de ~15–20 % del ancho, o solo enmascarar cuando la caja del otro no se solapa en horizontal con
     `expected`. Y bajar `OTHERS_MASK_AGE` a ~0,5 s, o desplazar la máscara según el rumbo.

6. **[3] `models.ts:335-351` — `dropBackend` libera los detectores, pero no el motor.**
   - El problema:
     - Tras una caída de WebGPU, el motor sigue registrado, con su reserva de búferes y texturas.
     - También se quedan los tensores intermedios del `estimatePoses` que falló (no hay `tidy` que los recoja tras la
       excepción).
     - En WASM, el heap no se encoge.
   - *Arreglo:* tras liberar los detectores de un motor marcado como roto, `tf.removeBackend('webgpu')`. Ya no se
     vuelve a usar en la sesión.

7. **[3] Sin archivo concreto — WASM corre en el hilo principal.**
   - El problema: con el estudio reproduciendo, la carga del 35 % limita el tiempo total, pero cada inferencia sigue
     siendo una tarea larga de 45–80 ms, y el zoom y los toques la notan.
   - *Arreglo:* llevar el análisis a un worker (ya recomendado en la ronda 1). Hasta entonces, como mitigación, se
     puede usar en WASM un `duty` menor mientras el estudio reproduce (p. ej. 0,2).

8. **[2] `useFollowActions.ts:126-132` — un cambio de archivo durante el guardado de `onReady`.**
   - El problema: si `FILE_CHANGED` llega mientras se crea la fila del tramo listo, ese guardado termina igual. Luego
     hace `setFollowPath` y avisa «Ya sigues a…».
   - *Arreglo:* comprobar `abort.signal.aborted` antes y después de `opts.onReady`.

9. **[2] `analysisHold.ts:19-35` + `analyze.ts:550-561` — el motivo de la espera no se actualiza.**
   - El problema: si mientras se graba empieza a separarse la voz (o al revés), la línea sigue con el primer motivo.
   - *Arreglo:* llamar a `onHold(holdReason())` en cada `check` que no resuelva.

10. **[2] `analyze.ts:753-761` — el calentamiento y el primer fotograma no esperan.** Si el grabador se abre en los
    primeros segundos, la compilación de shaders ocurre con él abierto. Es poco probable.

11. **[2] `PoseLab.tsx:418` — en el móvil, la prueba de postura deja elegir WASM.** No contamina «auto», porque el
    móvil ignora la medida de WASM. Pero va contra «nunca en el móvil». *Arreglo:* ocultar la opción con `onMobile()`.

## Veredicto

**No hay ningún hallazgo ≥ 6.** Los 9 hallazgos de la ronda 1 con nota 4 o más están corregidos:
- Pausa con `covered` sin perder fotogramas ni solapar pasos.
- Carga limitada sin frenar el tramo prioritario.
- Caída de motor limpia.
- Máscaras.
- «Los otros» con olvido.
- Cancelación por cambio de archivo.
- Calibración con el mismo fotograma.
- WebGPU en Android.

El motor WASM se elige como se pidió y nunca en el móvil. Vite emite los `.wasm`, quedan fuera del precache y la CSP
sirve. Typecheck limpio y 116 pruebas en verde.

Recomiendo corregir en esta ronda los dos de nota 4: la prueba WASM que se repite en cada análisis (1) y el cambio de
persona por reclamación de «otro» (2), con su prueba. Los de nota 3 pueden ir a pendientes.
