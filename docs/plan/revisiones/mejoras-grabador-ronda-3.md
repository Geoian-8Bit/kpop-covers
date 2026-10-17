# Revisión · Mejoras del grabador (puntos 19 a 27), ronda 3

## Alcance

Revisión de solo lectura (última ronda) del trabajo sin confirmar en `feat/plan-completo`. Se ha comprobado que los
hallazgos de la ronda 2 (`mejoras-grabador-ronda-2.md`) están corregidos y que no hay regresiones.

Archivos leídos:
- `packages/shared/src/recording.ts` (`createMedianLog`, `createLagLog`, `createFrameIntervalLog`, `cameraRateFps`,
  `frameIntervalMs`, `takeVerdict`, `directTakeVerdict`, `confirmPace`) y `clap.ts` (`clapLogEntry`), con sus tests;
- `apps/web/src/features/record/`: compositor, pace, RecordStudio (juicio de tomas, ensayo, `retryMainLens`, diálogo
  de descartar, pausas y segundo 2), InfoPanel, useCamera, camera (`listBackLenses`), clap/ClapArm y clap/clapLog;
- `docs/plan/ESTADO-IMPLEMENTACION.md` (hallazgo [3] de la ronda 2).

Tests: vitest en verde en `shared` (`recording` + `clap`, 87) y en `features/record` (44). No se ha probado nada en un
móvil.

Notas de 1 a 10; con 6 o más se corrige sí o sí.

## Hallazgos de la ronda 2 → estado

| Ronda 2 | Estado |
|---|---|
| [6] Una toma directa con poca luz baja la calidad 30 días | **Corregido en lo que pedía; queda una vía nueva.** La toma directa ya no se compara con el reposo guardado: `directTakeVerdict` usa el ritmo real de la cámara durante la toma (mediana del intervalo entre `captureTime`) y el retraso. Está el test «sala oscura: cámara a 30, reposo a 60, sin retraso → `ok`». Pero restar las llamadas perdidas y usar la mediana abren otras vías de falso positivo; ver el hallazgo nuevo [6]. |
| [5] Tras un parón, la toma por lienzo sigue con rAF hasta el final | **Corregido.** En modo rAF queda pedido un rVFC de prueba (`onProbe`). Cuando llama, cancela el rAF, vuelve a `perFrame` y rearma `watch()`. `newFrames` usa `totalVideoFrames` para no dibujar un fotograma repetido, y `delivered` suma los fotogramas nuevos de verdad. Hay escape a 250 ms si el contador no se mueve nunca (sin contar una cámara que abre, `readyState < 2`); y si el contador baja (cámara reabierta), se reinicia. `freeze(true)` y `dispose` cancelan el rAF, el rVFC y la prueba; `freeze(false)` vuelve a rVFC. No se ha visto ninguna vía que congele el lienzo ni que deje los dos bucles a la vez. |
| [3] ESTADO-IMPLEMENTACION desfasado (cámara al abrir) | **Sin corregir.** Las líneas 75-76 siguen diciendo que en Ajustes «se puede elegir frontal o "última usada"», y la 224 sigue diciendo «Cámara al abrir: trasera». |
| [2] El retraso es la mediana de los últimos 10 s | **Corregido.** `createMedianLog` es un histograma fijo: `Uint32Array` de 2001 cubos (8 KB) para el retraso y de 5001 (20 KB) para los intervalos. No reserva memoria por fotograma y la mediana es de toda la toma. Se vacía en el segundo 2. Hay un test de 3 minutos. Coste: la mediana recorre como mucho 5001 cubos, una vez al acabar la toma y una por segundo en el panel; es despreciable. Las vigilancias viejas se sueltan (`stopPresented`, `takePace = null`, limpieza de `useLivePace`). |
| [2] Diálogo de descartar sin desplazamiento | **Corregido.** La tarjeta tiene `max-h-full overflow-y-auto overscroll-contain` dentro de una rejilla `grid-rows-[minmax(0,1fr)]`, así que el `max-h-full` tiene una altura de referencia. |
| [2] «Volver a medir» en un modo ligero no hace nada | **Corregido.** Solo sale con `paceCapped`, con `benchStats`, con un `pacePending()` o en un modo medido (`heavyMode`). En un modo ligero sale la nota «La fluidez se mide sola al grabar a 60 fps o por encima de 1080p». |
| [2] Aplauso: sin depuración | **Corregido.** `clapLogEntry` copia el sonido juzgado, que la lectura se reinicia en cada trozo (líneas 418-420), así que no hay duplicados. `clapLog` guarda los 8 últimos en memoria. El panel «i» tiene la sección «Aplauso» con nivel, brillo, ataque, caída y cresta, y la consola los escribe con `techLogging`. Memoria acotada; el `Set` de oyentes se limpia con `useSyncExternalStore`. |
| [1] La lente principal no se reintenta tras la toma | **Corregido.** `mainLater` + `retryMainLens`, llamado solo con `phase === 'idle'` y sin aplauso armado. Comprueba `busy()`, que la sesión de cámara sea la misma (no hubo otra petición de lente, giro ni reapertura) y que no esté ya en la principal. Ver la nota [1] nueva sobre el armado. |

## Hallazgos nuevos

**[6] recording.ts:575-602 + compositor.ts:124-131 + RecordStudio.tsx:1061-1071 — el juicio de las tomas directas
todavía puede bajar la calidad sin motivo.**
`directTakeVerdict` juzga con `frames = presented − missed` frente a `captureFps`, que sale de la *mediana* del
intervalo entre fotogramas. En una toma directa, el archivo recibe todos los fotogramas de la cámara, pasen o no por
la página. Hay tres vías de falso `fps30` o `smaller`; con dos tomas seguidas, eso son 30 días de calidad perdida.

1. **`missed` no son fotogramas perdidos en el archivo.** Es una llamada de rVFC que la página no llegó a ver: el
   hilo principal pintó menos veces de las que la cámara dio fotogramas. Con una cámara local, Chrome cuenta
   `presentedFrames` por cada fotograma que pasa a ser el actual (`RenderWithoutAlgorithm`), no por cada uno que se
   pinta. Hay que confirmarlo con la traza `take` (`counted.missed`) en el Samsung. Si es así, todo lo que haga ir
   la página por debajo de la cámara cuenta como pérdida, y la vista previa y el archivo no se ven afectados:
   - una pantalla de 60 Hz con la cámara a 60: con el desfase del reloj de la cámara, dos fotogramas caen a menudo
     en el mismo refresco, y la fase se mantiene durante minutos, de una toma a la siguiente;
   - un refresco limitado por el ahorro de batería: una pantalla a 30 Hz da un 50 % de `missed` siempre;
   - el iframe de YouTube, que en Android suele compartir proceso e hilo con la página.
2. **Una cámara que cambia de ritmo durante la toma.** Con luz justa, o un bailarín que entra y sale de la luz, la
   cámara pasa de 60 a 30. Con la mitad del tiempo a cada ritmo hay el doble de intervalos de 16,7 ms que de 33 ms:
   la mediana da 60, pero la media real es 45. 45/60 = 75 % < 85 %, y la toma pierde «15 × segundos» fotogramas
   (más de 30) → `fps30`. Es justo el caso que el arreglo quería quitar, en su versión con luz «a medias».
3. **Sin `requestVideoFrameCallback`.** `watchPresentedFrames` devuelve `count = 0`, así que `presented` es 0 y
   `captureFps` es null. `cameraFps` es `min(modeFps, 0) = 0`, y `takeVerdict` usa entonces `wantFps`: medido 0 →
   `fps30` (o `smaller` en 1440p/4K a 30). Antes daba `unknown`. Hoy casi no pasa (la vía directa es Chromium en
   Android), pero se arregla con una línea.

**Arreglo:** en una toma directa, juzgar por el retraso (la opción (a) de la ronda 2).
- Si `presented === 0`, devolver `unknown`.
- `missed` queda solo para el registro.
- Como señal de ritmo, si se quiere, usar la *media* de la toma (`presented / seconds`) frente al ritmo medido en esos
  mismos minutos y con la misma luz, por ejemplo en la cuenta atrás, con la cámara abierta y sin codificar (ver el
  hallazgo [4]); nunca la mediana.

Tests para `recording.test.ts`:
- «60 fps sin retraso con la mitad de llamadas perdidas → `ok`»;
- «cámara a 60 la mitad del tiempo y a 30 la otra mitad, sin retraso → `ok`»;
- «`presented` 0 con segundos > 0 → `unknown`».

**[4] recording.ts:591-592 — en una toma directa no se ve cuando la carga frena a la cámara.**
Con el arreglo de la sala oscura, todo bajón del ritmo de la cámara se toma por falta de luz: el objetivo pasa a ser
`min(modeFps, captureFps)`. Pero un móvil saturado o caliente también hace que la cámara dé menos fotogramas (de 60 a
40–45), y eso es justo el «tirón» del punto 19. Si el retraso no crece, se juzga `ok`. Tampoco se ve el codificador
cuando descarta fotogramas (`MediaRecorder` no lo cuenta). El retraso cubre el caso típico, así que no es grave.
**Arreglo:** medir el ritmo medio en la cuenta atrás (misma luz, cámara abierta, sin codificar) con la misma
vigilancia. Si la media de la toma queda por debajo del 85 % de ese ritmo, es la carga y no la luz. Sin cuenta atrás
(`timer === 0`), solo el retraso.

**[3] docs/plan/ESTADO-IMPLEMENTACION.md:75-76 y 224 — sigue desfasado (hallazgo de la ronda 2).** La prueba manual 7
manda buscar en Ajustes una opción que ya no existe. **Arreglo:** abre la última cámara usada (la trasera la primera
vez) y en su lente principal; no hay ajuste.

**[2] RecordStudio.tsx:1195-1202 + 1384-1388 — cada reanudación tras una pausa no se salta su arranque.** Solo se salta
el segundo 2 de la toma. Al reanudar, la canción vuelve a arrancar (`arming`) y el primer segundo tiene los mismos
tirones, que cuentan contra el margen de 30 fotogramas (`PACE_TAKE_MIN_LOST`). Con varias pausas en una toma por
lienzo se puede llegar a ese margen. **Arreglo:** en `roll()` de una reanudación, anotar un `skip` parcial: sumar a
`skip` lo que se cuente en los 2 s siguientes. Otra opción es subir el margen por cada pausa.

**[1] useCamera.ts:237-240 — `busy()` no incluye el aplauso armado.** Si la lista de lentes llega estando armado, se
reabre la cámara en ese momento, y una palmada antes de `ready` da «La cámara no está lista». La ventana es de
milisegundos (`enumerateDevices` responde justo después de `ready`), así que no pasa en la práctica. Si se quiere
cerrar: pasar `clapRes.current != null` dentro de `cameraBusy`.

**[1] useCamera.ts:428-434 — una reapertura por tope aprendido al acabar la toma descarta la lente principal pendiente.**
Al aprender un tope, la cámara se reabre con `v.deviceId`, que es la lente que eligió el navegador, y eso cambia la
sesión, así que `retryMainLens` ya no hace nada. Hasta tocar 1× se queda en esa lente. Es aceptable. Si se quiere
arreglar: en esa reapertura, usar `mainLater.current?.deviceId ?? v.deviceId`.

**[1] compositor.ts:249-253 — el primer tick de rAF tras cada cambio dibuja siempre.** Con `shownFrames == null`
devuelve 1 aunque no haya fotograma nuevo: queda un único fotograma repetido por cada parón. Es irrelevante.

**[1] pace.ts:145-148 — «Volver a medir» no olvida `REST_KEY`.** La fila «Prueba de fluidez: en reposo …» enseña el
reposo viejo hasta que acaba el ensayo nuevo. Es cosmético.

## Comprobaciones específicas

- **Juicio de tomas directas, según la pregunta:**
  - **Pantalla a menos de 60 Hz o página limitada:** puede bajar la calidad sin motivo (hallazgo [6].1).
  - **Pestaña oculta:** no; `visibilitychange` pone la toma en pausa, y la pausa para el medidor (`hold`) y el
    muestreo (`sampleLag(false)`, que además reinicia `prev`, así que el hueco no cuenta como perdido).
  - **Pausas:** bien en el recuento. Queda el arranque de cada reanudación, hallazgo [2].
  - **Segundo 2:** se salta bien: fotogramas, perdidos y segundos se restan, y el retraso y los intervalos se vacían.
  - **Dejar de bajarla cuando sí va mal:** el retraso sigue cubriendo el caso típico. Queda el ritmo frenado por la
    carga, hallazgo [4].
- **Compositor:** no hay congelación (el escape a 250 ms y la prueba de rVFC se cubren entre sí), ni duplicados
  (salvo el tick inicial de [1]), ni bucles dobles. `freeze` y `dispose` lo dejan todo cancelado.
- **Memoria:** unos 28 KB por vigilancia (toma, ensayo, panel) y se sueltan al acabar. El aplauso guarda 8 entradas.
  No hay fugas de intervalos ni de oyentes.
- **`retryMainLens`:** no reabre armado, grabando, en revisión ni tras otra petición de cámara (sesión distinta),
  porque el efecto pide `idle` y que no esté armado, y además comprueba `busy()`. Solo queda el detalle [1] de la
  lista de lentes.

## Veredicto

**Sí, queda un hallazgo de 6:** **[6]** el juicio de las tomas directas resta las llamadas de rVFC perdidas, que no
son fotogramas perdidos en el archivo, y usa la mediana del intervalo, que con luz justa no es el ritmo real. Puede
bajar de 60 a 30, o de 1440p/4K a 1080p, durante 30 días sin que el móvil vaya mal. Sin rVFC da `fps30` en vez de
`unknown`. El arreglo es corto: juzgar las tomas directas por el retraso, devolver `unknown` con 0 fotogramas y, si se
quiere una señal de ritmo, usar la media frente a la cuenta atrás. Hay que añadir sus tres tests.

Todo lo demás de la ronda 2 está corregido sin regresiones, salvo la documentación ([3], sin corregir). Conviene hacer
el [4] junto con el [6] (la medida en la cuenta atrás sirve para los dos) y el [3]. El resto es menor. La traza real
en el Samsung sigue pendiente como prueba manual; la línea `take` de `paceLog` (`counted.missed`) confirma o descarta
el punto 1 del [6] en un minuto.
