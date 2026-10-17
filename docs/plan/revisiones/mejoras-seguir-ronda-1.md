# Revisión · Seguir a un bailarín, puntos 14 y 15 · ronda 1

## Alcance

He revisado en modo de solo lectura los puntos 14 (seguir en pantalla completa) y 15 (por qué tarda) de
`docs/plan/MEJORAS-PRUEBA-MANUAL.md`, sobre la copia de trabajo de `feat/plan-completo`, que aún no tiene commit.
Archivos: `features/follow/` (analyze, followPath, followPlan, followTrack, followUi, useFollowActions, FollowRow,
FollowStageLayer, FollowFsMenu y sus pruebas), `features/pose/models.ts` (+ prueba) y los 4 bloques de
`features/studio/StudioPage.tsx`: imports, `fullscreen={fullscreen}` en la línea 933, `FsChromeLayer` oculto mientras
se elige (1133–1135) y `FollowFsButton` en `FsTopBar` (1263). Doy por buenas las decisiones 28, 30 y 31 de ESTADO y
los pendientes H3–H13 de F10. No cuento como hallazgo `FollowStageLayer.tsx:162`, que está tocando el corrector del
estudio.

No he arrancado servidor ni navegador. Vitest de `src/features/follow` y `src/features/pose`: 7 archivos y 68 pruebas,
todas en verde. Los tiempos que doy son estimaciones razonadas, no medidas.

Lo que está bien:
- El orden del análisis (`followPlan`): primero lo que se va a ver, luego el resto.
- El guardado en dos pasos: `onReady` y luego el final; con «Parar» se guarda lo hecho.
- `untilAborted` mientras se descarga el modelo.
- Una sola copia de cada detector por motor (H12, en `models.ts:162-205`).
- Los avisos de progreso y la pantalla, limitados a 1 por punto porcentual.
- La línea fina de progreso en pantalla completa.
- Foco atrapado y Esc en el panel.
- El nombre se pide dentro de la pantalla completa (`fsHosts`).
- H3 bien resuelto en `smoothKeyframes`.

## Hallazgos (de mayor a menor)

1. **[6] `analyze.ts:250-318` (+ `useFollowActions.ts:83`) — el análisis en segundo plano sigue con el grabador
   abierto.** El estudio no se desmonta al abrir el grabador (`covered`). Solo el conductor del zoom lo tiene en cuenta
   (`FollowStageLayer.tsx:164`). La copia muda sigue decodificando hasta a 8× y MoveNet ocupa la GPU un 77 % del tiempo,
   porque el ritmo se ajusta a `cost * 1.3`. En el móvil (el 90–95 % del uso), eso compite con la cámara, el compositor
   (`record/compositor.ts`, un `drawImage` por fotograma) y el codificador mientras se graba una toma. Es lo que más
   probablemente haga perder fotogramas o calentar el móvil, y la toma es lo que el grupo guarda.
   *Arreglo:* añadir a `AnalyzeRequest` una espera `hold(): Promise<void> | null`, que el hook alimenta con
   `usePlayer.covered`. Mientras dure: `video.pause()`, no pedir fotogramas, y al volver `seekVideo(last.t + offset)` y
   seguir. La línea de progreso dice «En pausa mientras grabas». Basta con hacerlo entre fotogramas: en el
   `onFrame` de `playRange` y en el bucle de `runRange`.

2. **[5] `analyze.ts:304` — el segundo plano no deja sitio al estudio.** Tras `onReady`, el usuario practica con el
   estudio, pero el ritmo es el mismo que cuando espera. MoveNet en tfjs-webgl manda cada operación desde el hilo
   principal: unos 10–20 ms de JS por inferencia. Así, en un equipo rápido el hilo principal está ocupado más de la
   mitad del tiempo. El zoom con muelle de `motion`, el salto del bucle A–B y los toques lo notan. Si a la vez se
   separa la voz con IA (`SeparateVoiceButton`), se suman los dos.
   *Arreglo:* en los tramos sin `priority`, poner como tope una carga de trabajo, por ejemplo
   `rate = duty / (fps * cost)` con `duty` 0,35 mientras `usePlayer.playing` (0,6 en pausa), y no lanzar el análisis
   mientras se separa la voz. Medir con el Performance panel en el móvil.

3. **[5] `followTrack.ts:240-255` + `analyze.ts:386-388` — en un fotograma «both» (el recorte lo pierde → MultiPose),
   MultiPose mira otro fotograma.** El primer `drawImage` ocurre dentro del `requestVideoFrameCallback`. El de
   MultiPose va después del `await` de SinglePose, cuando la copia ya ha avanzado `rate × ms de SinglePose`. Como el
   ritmo se calcula con el coste, ese desfase es casi siempre de 1/(1,3·fps) ≈ 0,19 s a 4 fps, en cualquier equipo. Y
   pasa justo en cruces y oclusiones: el punto se apunta en `t` con la caja de `t+0,19`, y la velocidad del seguidor
   (`dt` = 0,25) sale mal.
   *Arreglo:* hacer la foto del fotograma en el propio callback: dibujar siempre el lienzo de 256 px de MultiPose (es
   barato) antes del primer `await`, y que `multiDetect` use ese lienzo. O `createImageBitmap(video)` al empezar el paso.

4. **[5] `analyze.ts:412-421` (+ `models.ts:81, 162`) — la caída de WebGPU a WebGL a mitad de un tramo.**
   - No hay un segundo detector: bien.
   - Pero `guarded` carga WebGL y repite `fn()` sin calentar ni volver a buscar el momento. Compilar los shaders la
     primera vez cuesta segundos. A 8×, el fotograma que se dibuja es de hasta unos 16 s después y se apunta en `t`.
   - Si eso pasa de 4 s, salta el vigilante (`:284-286`). `runRange` empieza a buscar fotograma a fotograma mientras
     el fotograma en curso sigue: dos `step` a la vez sobre el mismo seguidor (`:328-338`).
   - Los detectores WebGPU se quedan en el mapa, ocupando la memoria de la GPU, hasta salir del estudio (H12 a medias).
   *Arreglo:* en `guarded`, `video.pause()`; después, cargar WebGL, calentarlo (como en `:464-467`), liberar con
   `dispose()` y quitar del mapa las claves `*:webgpu` (exportar `dropBackend('webgpu')` en models.ts) y lanzar un
   error centinela. `runRange` lo recoge y vuelve a empezar desde `last.t`, buscando el momento. En `playRange`, que
   `onFrame` no pueda seguir tras `finish`: comprobar `done` antes de `r.onFrame`.

5. **[5] `followPath.ts:302-335` — la lista de «los otros» envejece mientras el bailarín no se ve.** `others` solo se
   actualiza en un fotograma de MultiPose que encuentra al bailarín. Si se pierde (oclusión, salida de cuadro), se
   queda con las posiciones de entonces mientras dure la pérdida. Cuando reaparece donde estaba otro hace 1–2 s, cosa
   frecuente en los cambios de formación, `someoneElse` lo rechaza. La búsqueda se va ampliando, así que puede acabar
   cogiendo a otro.
   *Arreglo:*
   - Guardar con `others` el momento en que se vio.
   - En cada MultiPose sin encontrarle, mover cada «otro» a su candidato más cercano (dentro de un alcance).
   - Olvidarlos pasados unos 1,5 s.
   - Prueba: dos bailarines que cambian de sitio mientras uno está tapado 2 s.

6. **[5] `followTrack.ts:157-169, 240-250` — el recorte puede irse al vecino.** Con `pad` 1,4 el recorte es de unas
   1,4 alturas, es decir, de 3 a 4 anchos de cuerpo. Un vecino a más de 0,1 anchos no cuenta como «cruce», pero entra
   en el recorte. SinglePose puede quedarse con él o mezclar extremidades de los dos: la caja se ensancha (`wr ≤ 2`
   pasa), el centro se desplaza, y el siguiente recorte se centra ya en el vecino. La comprobación de cada 1,5 s
   compara con lo esperado, que ya está desviado. Las pruebas de `followTrack.test.ts:232-241` usan detectores
   simulados que no se equivocan así.
   *Arreglo:* tapar en negro las cajas de `others` (las del último MultiPose, según su rumbo) dentro del lienzo del
   recorte antes de SinglePose. Rechazar en el paso del recorte una caja con `w > 1.4 × expected.w`. Medir con un vídeo
   de grupo de verdad la proporción de recortes y los saltos (el `console.info` de desarrollo ya da `soloRecorte`).

7. **[4] `FollowStageLayer.tsx:55` + `useFollowActions.ts:46, 62` — cambiar de archivo (o de desfase) a mitad del
   análisis.** El análisis solo se cancela al cambiar de canción (`video.id`). Si se vincula otro archivo, o se ajusta
   `file_offset_seconds` mientras analiza, sigue con la `src` y el `offset` del principio. Guarda para la canción un
   recorrido del archivo anterior y, si se revoca el blob, puede guardar a medias tras el error de búsqueda.
   *Arreglo:* cancelar también cuando cambie el archivo o el desfase, añadiendo al efecto
   `[video.id, video.storage_path, video.file_name, offset]`. Y en `onReady` y en el guardado final, descartar si
   `stageVideo()?.currentSrc !== src`.

8. **[4] `analyze.ts:150-172` frente a `followTrack.ts:74-94, 231, 245` — el recalibrado compara cajas distintas.**
   La calibración se aprende con la caja de puntos de MultiPose (4 o más puntos, cualesquiera) y se aplica a la de
   SinglePose (6 o más, con hombro y cadera). En un recorte nítido, SinglePose suele ver los tobillos y MultiPose a
   256 px no: `sh` se va hacia 1,5 y las cajas de SinglePose salen más altas. El zoom no cambia de escala
   (`pathScale` es fijo por recorrido), pero el centro sube y baja en cada comprobación (cada 1,5 s), y el suavizado de
   ±0,5 s no lo tapa del todo.
   *Arreglo:* aprender la calibración con las dos cajas del mismo fotograma: en los fotogramas de comprobación, pasar
   también el recorte por SinglePose (cuesta poco) y calibrar «puntos de SinglePose → caja de MultiPose».

9. **[4] `models.ts:90-98` — WebGPU en Android sin medir.** `chooseBackend` elige WebGPU en cualquier Chromium con
   adaptador real, también en Android (Chrome 121+). En GPU de móvil, el motor WebGPU de tfjs puede ir más lento que
   WebGL en modelos pequeños y compila más al principio.
   *Arreglo:* medir en el móvil de pruebas con la prueba de postura (WebGL y WebGPU) antes de dar «auto» por bueno. Si
   no gana, `chromium && !mobile`.

10. **[3] `useFollowActions.ts:136, 203, 280` — `followUi.job(null)` puede borrar un análisis más nuevo.**
    `followUi.reset()` (cambio de canción) pone `job` a null en el momento, antes de que acabe el anterior. Si en ese
    rato se empieza otro, el `finally` del viejo borra el `job` del nuevo: deja de verse y no se puede cancelar. Además,
    los dos comparten un tiempo el detector y el rastreador de MultiPose (`peopleInFrame` y `newSession` lo reinician).
    *Arreglo:* `if (useFollowUi.getState().job?.abort === abort) followUi.job(null)`, y no dejar empezar uno nuevo
    hasta que el anterior haya cerrado su vídeo (una promesa «terminado» en followUi).

11. **[3] `followPlan.ts:170-176` — el tiempo restante puede bailar entre dos pasos.** Con 5 s por paso y sin
    histéresis, una estimación cerca del límite (22,4 ↔ 22,6) alterna «unos 20 s» y «unos 25 s». Al cambiar de tramo
    (recorte ↔ MultiPose, con pesos fijos 1 y 1,8) sube durante unos 8 s.
    *Arreglo:* cambiar de paso solo si el nuevo valor se aleja más de medio paso del mostrado, y no subir salvo que
    supere en dos pasos lo que se muestra.

12. **[3] `analyze.ts:183-190` — lienzos pequeños sin aceleración (medir).** El de 192×192 y el de 256×144 quedan por
    debajo del área mínima con la que Chrome acelera el canvas 2D. `drawImage` del vídeo puede leer el fotograma de la
    GPU a la CPU y tfjs volver a subirlo.
    *Arreglo:* comprobarlo en el Performance panel. Si es así, `createImageBitmap(video, { resizeWidth, resizeHeight })`
    para MultiPose, y `createImageBitmap(video, sx, sy, sw, sh, {…})` para el recorte, que tfjs acepta directamente.

13. **[3] `FollowFsMenu.tsx:79-83` — tocar fuera para cerrar el panel también pausa o reproduce.** El `pointerdown`
    cierra, pero el toque sigue hasta `onStageClick`.
    *Arreglo:* si cierra, marcar el toque para que el escenario ignore el `click` siguiente (o `preventDefault` del
    click en captura).

14. **[3] `FollowRow.tsx:230` + `FollowFsMenu.tsx:278` — dos regiones `aria-live` con el mismo texto.** Con el panel
    abierto en pantalla completa, el lector anuncia cada 25 % dos veces: la fila sigue en el DOM.
    *Arreglo:* la de la fila callada cuando `fsHosts > 0`, o una sola región compartida.

15. **[3] `FollowStageLayer.tsx:420-423` y `StudioPage.tsx:1246` — zona segura a los lados.** En horizontal en iPhone
    (con `viewport-fit=cover`), «Cancelar» del selector (`inset-x-2`) y el botón de seguir (`px-4`) quedan dentro de
    `safe-area-inset-left/right`. El panel sí lo respeta.
    *Arreglo:* `left/right: max(8px, env(safe-area-inset-*))` en las dos barras.

16. **[3] `analyze.ts:388` — reloj del rastreador.** `stamp += 1000/fps` en cada MultiPose, pero entre dos
    comprobaciones pasan 1,5 s de canción: el rastreador cree que han pasado 250 ms. Mantiene vivas pistas viejas y les
    da su id a quien ocupe la caja, y `associate` le da a ese id un plus de 0,15.
    *Arreglo:* `stamp = t * 1000` del momento de la canción (creciente dentro de cada tramo, que ya empieza sesión
    nueva).

17. **[2] `FollowFsMenu.tsx:84-89` — Esc en pantalla completa nativa** (escritorio) sale de la pantalla completa sin
    llegar a la página: el panel se desmonta y el foco va a `body`.
    *Arreglo:* al desmontar con el foco dentro, dárselo al botón de pantalla completa.

18. **[2] `FollowFsMenu.tsx:331-348` — al modo manual en pantalla completa le faltan «Quitar punto» y «Borrar
    recorrido».** El punto 14 no lo pide; se puede añadir «Quitar punto» con `nearPoint`.

19. **[2] `followUi.ts:116` — el aviso de cada 25 % repite «Ya sigues a «X» en este tramo».** Basta con «Resto de la
    canción: 50 %».

20. **[2] `models.ts:247-259` — `releasePoseModels` no libera la reserva de texturas ni el dispositivo WebGPU.** Si
    una carga lenta empezó antes de programar la liberación, su detector se queda vivo. Mejora menor.

## 4 · ¿Vale la pena el motor WASM (SIMD, sin hilos) para el ordenador sin GPU?

**Estimación.** MoveNet Lightning es una red pequeña de tipo MobileNet. Con XNNPACK SIMD en un solo hilo de un
portátil normal (i5 o Ryzen de los últimos 5 años), lo razonable es:
- SinglePose a 192 px: unos 20–35 ms.
- MultiPose a 256×160: unos 45–80 ms (más cabeza de salida y su decodificación).

WebGL por software (SwiftShader) es muy ineficiente para los shaders de tfjs: hoy unos 110 ms por fotograma.
Calculo, para una canción de 3 min analizada desde la mitad, a 4 fps:

| | Hoy (WebGL por software) | Con WASM |
|---|---|---|
| Ida (unos 360 fotogramas, 85 % recortes) | — | ~13 s |
| Vuelta (unos 360 fotogramas, solo MultiPose) | — | ~22 s |
| **Canción entera** | **80–100 s** | **unos 35–40 s** |
| Tramo prioritario (unos 120 fotogramas) | ~13 s | ~5 s |

Con WASM entra en el objetivo de 30–40 s. Es una horquilla: depende de que tfjs-wasm 4.22 tenga todas las operaciones
de MultiPose (sin vuelta automática a la CPU: si falta una, falla).

**Coste.**
- **Tamaño:** `@tensorflow/tfjs-backend-wasm` 4.22 son unos 150–200 KB de JS y un `.wasm` de unos 0,4–0,5 MB (unos
  150–200 KB comprimido). Hay que alojar el SIMD y el básico, pero solo se baja uno, y solo al usarlo (import
  dinámico, como hoy).
- **CSP:** ya tiene `'wasm-unsafe-eval'`. Alojado en el propio dominio (`setWasmPaths` con imports `?url` de Vite)
  no hace falta ningún origen nuevo (`connect-src 'self'`), y va en la línea de H11. Desde jsDelivr habría que añadir
  su ruta exacta a `script-src` y `connect-src`, como con MediaPipe.
- **PWA:** el `.wasm` ya está fuera del precache (`vite.config.ts:140`); basta la caché HTTP.
- **Sin hilos:** sin COOP/COEP (que romperían el iframe de YouTube) no hay SharedArrayBuffer. Con 4 núcleos los hilos
  darían 1,5–2,5× más, pero no compensa.
- **El coste de verdad:** WASM corre de forma síncrona en el hilo principal: cada inferencia es una tarea larga de
  30–80 ms. En segundo plano, con el estudio en uso, se notaría mucho más que hoy (ver hallazgo 2). Para usarlo bien
  hace falta un Web Worker (tfjs-wasm funciona en workers, con fotogramas por `createImageBitmap` transferidos), o como
  mínimo la carga limitada del hallazgo 2.

**Recomendación.** Sí, pero solo como tercera opción elegida al medir, nunca en el móvil:
1. Antes, mirar `chrome://gpu` en ese ordenador. Muchas veces «sin GPU» es una GPU integrada bloqueada por un driver
   viejo o por escritorio remoto. Actualizar el driver da mucho más que WASM.
2. Añadir «MoveNet · WASM» a la prueba de postura de Ajustes y medir allí MultiPose y SinglePose.
3. Si gana, que `chooseBackend` elija `wasm` cuando el renderizador WebGL sea por software (`WEBGL_debug_renderer_info`:
   SwiftShader, «Microsoft Basic Render Driver», llvmpipe) o cuando los 12 primeros fotogramas pasen de unos 80 ms.
   Y llevarlo a un worker.

## Veredicto

**Hay 1 hallazgo ≥ 6, que se corrige sí o sí:** el análisis en segundo plano sigue con el grabador abierto (1). Los
de nota 5 merecen arreglo en esta ronda, porque afectan a la calidad del recorrido o al estudio en uso: fotograma
desfasado en «both» (3), caída a WebGL sin calentar (4), «otros» que envejecen (5), el recorte que se va al vecino
(6) y el segundo plano sin freno (2). El resto puede ir a pendientes. Pruebas: 68 en verde.
