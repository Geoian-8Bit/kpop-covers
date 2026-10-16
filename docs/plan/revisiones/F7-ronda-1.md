# F7 · Empezar a grabar con un aplauso — revisión ronda 1

Revisión de solo lectura de los cambios **sin commit** de F7 en `feat/plan-completo` (spec: `docs/plan/ideas-one-shoot.md`, F7). Archivos: `packages/shared/src/clap.ts` (+`clap.test.ts`), `apps/web/src/features/record/clap/*`, los cambios de `RecordStudio.tsx`, `settings.ts`, `settings/model.ts` y los tres paneles, el momento `clap-arm` del laboratorio y `e2e/fake-media.js`.

## Cómo se ha comprobado

- `clap.test.ts`: 20/20 en verde. `labState.test.ts`: 18/18. `pnpm typecheck`: sin errores en archivos de F7 (los de otras funciones no se han mirado).
- Simulación propia del detector real (`createClapDetector` copiado al scratchpad, ventana de 42 ms leída a 60/30/20/15 fps) con aplausos, pasos y sílabas.
- Navegador (Chromium de Playwright, demo en `localhost:5174`, audio mudo, cámara y micro falsos de `fake-media.js`, canción sembrada en el almacén demo): armar, doble aplauso falso, cuenta atrás, fin con «Listo», «Armar otra vez» con toma sin guardar, Escape, Atrás, dos palmadas sueltas a 1,2 s, doble a 100 ms, y recuento de pistas y `AudioContext` abiertos tras cada paso (envolviendo `getUserMedia`, `clone()` y `AudioContext`). Guiones en el scratchpad.
- No se ha podido probar en un iPhone ni en un Android reales: lo que depende de ellos se dice como tal.
- Nada de «Descartado» está implementado (no hay tomas en serie): «Armar otra vez» arma una sola toma y exige pasar por el repaso.

## Resumen

Veredicto: **sin bloqueantes**. El flujo básico funciona y es limpio: el disparo entra por `shutter()` (misma sincronía `takeTiming`, misma cuenta atrás, mismo fin automático), el micro y el `AudioContext` se liberan al disparar, cancelar, Escape y Atrás (verificado: tras cada salida vuelven a las pistas y contextos de partida), y el permiso denegado desarma con aviso. Hay un estado imposible real (hallazgo 1, nota 5) y el detector se deja engañar por pasos y voz (hallazgo 2, nota 6), que es justo el uso previsto: el móvil en el suelo y la bailarina andando hacia su sitio. Lo que más hay que probar en móvil real son los hallazgos 3, 4 y 5.

| # | Hallazgo | Nota | 🔴 |
|---|---|---|---|
| 1 | Con el armado puesto, un cambio de fase deja micro y contexto abiertos y reaparece el armado | 5 | no |
| 2 | Pasos y voz disparan el doble aplauso (sin filtro de frecuencia ni de ataque) | 6 | no |
| 3 | Umbral absoluto sin calibrar: un aplauso lejano (pico 0,10) no salta en «Media» | 5 | no |
| 4 | Sin recuperación si el micro se corta o el contexto se suspende (segundo plano, llamada, iOS) | 5 | no |
| 5 | Tras el aplauso no hay gesto del usuario: riesgo en iOS para la canción y la cuenta atrás (no verificado) | 5 | no |
| 6 | La lectura depende de `requestAnimationFrame` con ventana de 42 ms: a ≤15 fps se pierden aplausos | 3 | no |
| 7 | Foco y teclado del armado: sin trampa de foco, sin devolverlo, `radiogroup` sin flechas | 3 | no |
| 8 | Transiciones con `duration/ease` sueltos y un `rgb()` literal | 2 | no |
| 9 | Huecos de pruebas: detector sin casos negativos de voz y pasos, listener y flujos sin ninguna | 3 | no |
| 10 | Wake Lock: dos `visibilitychange` seguidos pueden dejar un sentinel sin soltar | 2 | no |

---

## 1. Un cambio de fase con el armado puesto deja micro y contexto abiertos, y el armado reaparece — nota 5

**Dónde:** `RecordStudio.tsx:2003` (`{clap && phase === 'idle' && <ClapArm …/>}`), `RecordStudio.tsx:1171` (`disarmClap`), `RecordStudio.tsx:1014` (`shutter`). Solo se desarma por los botones de `ClapArm`, por `clapFired`, por Atrás, por el tiempo y al cerrar el estudio. Nada desarma cuando `phase` deja de ser `idle`.

**Flujo:**
1. Se arma. El superpuesto cubre el obturador con `z-20`, pero el estudio no es inerte: el obturador de debajo («Empezar a grabar») sigue en el orden de tabulación.
2. Con el teclado (o un lector de pantalla que ignora `aria-modal`) se llega a él y se pulsa Intro. `shutter()` pasa a `countdown`.
3. `ClapArm` se desmonta (la condición pide `phase === 'idle'`) y para el listener, pero `clap` y `clapRes` siguen vivos: el clon del micro y el `AudioContext` quedan abiertos durante la cuenta atrás y toda la toma.
4. Si la cuenta atrás se cancela (segundo Intro) la fase vuelve a `idle`, `clap` sigue no nulo y `ClapArm` se monta otra vez con el `ctx` y la pista antiguos: el estudio está armado sin que nadie haya pulsado «Armar», y puede disparar solo.

**Evidencia (navegador):** tras armar hay 4 pistas de audio vivas (2 de partida + el clon). Intro en el obturador: cuenta atrás, y siguen 4 pistas y 3 contextos `running`. Segundo Intro: el diálogo «Grabación armada» vuelve a existir. Tras disparar normalmente o cancelar, en cambio, vuelve a 3 pistas y el contexto queda `closed`.

**Arreglo:** un efecto que desarme cuando el armado deja de ser válido:

```tsx
useEffect(() => {
  if (clap && phase !== 'idle') disarmClap();
}, [clap, phase]);
```

Además `inert` (o `aria-hidden`) en el resto del estudio mientras `clap` está activo, y llevar el foco dentro del armado. Así también se cubre el rescate de una toma sobrante por teclado (`recoverLeftover` pone `phase` en `review`).

**Test:** el guion de navegador de arriba (pistas y contextos vivos tras Intro en el obturador y tras cancelar la cuenta atrás: deben ser los de partida y sin diálogo de armado).

## 2. Pasos y voz disparan el doble aplauso — nota 6

**Dónde:** `clap.ts:113-126` (el detector decide solo con el pico de amplitud de la ventana) y `clapListener.ts:42-44` (el micro entra al analizador sin filtrar).

**Flujo:** el móvil está en el suelo o en un trípode (el caso de uso). La bailarina camina hasta su sitio: dos pisadas separadas 0,2–0,8 s, cada una con un pico corto y fuerte, cumplen «dos sonidos cortos» tal como lo ve el detector. Lo mismo dos sílabas fuertes («va-mos», una risa «ja, ja») a 0,3 s.

**Evidencia (simulación con el detector real, 60 fps, ventana 42 ms, «Media», fondo 0,01):**

| Señal | Resultado |
|---|---|
| Dos aplausos, pico 0,5, a 0,4 s | dispara a 1,42 s (correcto) |
| Pisadas, pico 0,3, subida 10 ms, caída 60 ms, cada 0,5 s | **dispara** a 1,52 s |
| Dos sílabas, pico 0,25, subida 20 ms, caída 80 ms, a 0,3 s | **dispara** a 1,32 s |

El doble aplauso se eligió «para que un ruido suelto no lo dispare», pero los ruidos que acompañan a quien se coloca no son sueltos sino periódicos.

**Arreglo:** dos barreras baratas, sin cambiar el contrato del detector:
- Filtro paso alto (`BiquadFilterNode`, tipo `highpass`, ~1,5 kHz) entre la fuente y el analizador: un aplauso es sobre todo energía alta; pisadas, golpes al suelo y voz grave quedan muy por debajo.
- Exigir ataque: contar un golpe solo si la lectura anterior estaba por debajo de, por ejemplo, el 40 % del umbral (un aplauso salta de silencio a pico en una ventana; una sílaba sube en varias).

**Test:** en `clap.test.ts`, casos negativos con la tabla de arriba (pisadas, sílabas) que hoy disparan, y el aplauso de pico 0,5 que debe seguir disparando. El filtro no se puede probar en shared: comprobarlo con el micro falso (tono grave de 220 Hz fuerte, no dispara; ráfaga corta de ruido blanco, dispara).

## 3. Umbral absoluto sin calibrar: un aplauso lejano no salta en «Media» — nota 5

**Dónde:** `clap.ts:33-37` (`floor`: alta 0,06, media 0,12, baja 0,22 de pico) y `model.ts:93-99` («Media: dos palmadas normales a unos metros del móvil»).

**Flujo:** el micro se abre con `autoGainControl: false` (`camera.ts:60-69`), así que el nivel real depende del dispositivo y no se corrige. A 3–5 m, con el móvil en el suelo, un aplauso puede dar un pico de 0,05–0,10 (−26 a −20 dBFS).

**Evidencia (simulación):** dos aplausos con pico 0,10: «Media» no dispara; «Alta» dispara. Con pico 0,05 ni «Alta». La ayuda de «Media» promete «unos metros». La medida real en móviles no se ha podido hacer aquí: es una hipótesis que hay que medir, no un fallo demostrado.

**Arreglo:** medir en 2–3 móviles reales (iPhone y Android) un aplauso a 2 y 4 m con este mismo micro en bruto y fijar los `floor` con esos datos (probablemente a la mitad); que el copy prometa una distancia medida. La marca roja del medidor ya ayuda a ver si se llega.

**Test:** caso de `clap.test.ts` con el pico medido en «Media».

## 4. Sin recuperación si el micro se corta o el contexto se suspende — nota 5

**Dónde:** `ClapArm.tsx:56-74` (nada escucha `track.onended`/`onmute`, ni `ctx.onstatechange`, ni `visibilitychange` para `ctx.resume()`), `clapListener.ts:33` (`resume()` solo una vez al montar).

**Flujo:** el armado dura hasta 3 minutos. En iOS Safari, al pasar a otra app o recibir una llamada, la captura se detiene y el contexto queda `interrupted`; en Android, el sistema puede cortar el micro si otra app lo pide. Al volver, la pantalla sigue en «Esperando señal…» con el medidor a cero y no oye nada, sin aviso, hasta el desarme por tiempo.

**Evidencia:** lectura de código (no hay manejadores). No se ha podido provocar un corte de micro real aquí.

**Arreglo:** en `ClapArm`: `track.addEventListener('ended', …)` y `'mute'` → desarmar con aviso «El micrófono se ha cortado: vuelve a armar»; `visibilitychange` visible → `ctx.resume()`; y si pasados 2 s `level` sigue siendo exactamente 0, mostrar «No oigo nada: revisa el micrófono».

**Test:** navegador: `track.stop()` desde un `initScript` con el armado puesto → debe desarmar con aviso; `ctx.suspend()` y volver visible → vuelve a leer.

## 5. Tras el aplauso no hay gesto del usuario: riesgo en iOS para la canción y la cuenta atrás — nota 5 (no verificado)

**Dónde:** `RecordStudio.tsx:1180-1190` (`clapFired` → `shutter` → `countIn` → `go` → `usePlayer.play()`), `lib/metronome.ts:17-20` (`unlockAudio` solo hace `resume()`).

**Flujo:** hasta ahora la canción se arrancaba a los pocos segundos de un toque. Con F7 pueden pasar 3 minutos y ningún gesto. En iOS Safari, `playVideo()` del iframe de YouTube y el `resume()` de un `AudioContext` interrumpido (abrir el micro puede interrumpir el del metrónomo) necesitan un gesto reciente. Si fallan: la cuenta atrás suena muda y/o salta «La canción no arranca. Dale al play…» a los 8 s (`ARM_TIMEOUT_MS`), con el móvil en el suelo y quien baila lejos.

**Evidencia:** en Chromium todo funciona (cuenta atrás y toma completa). El comportamiento de iOS es conocido de la plataforma pero no se ha ejecutado aquí.

**Arreglo:** probar en un iPhone real (YouTube y archivo): armar, esperar 30 s, aplaudir. Si falla: en el toque de «Armar» hacer `play()` seguido de `pause()` del reproductor y reanudar ahí el contexto del metrónomo; y si `go()` agota el tiempo tras un disparo por aplauso, volver al armado en lugar de a `idle`, con el aviso.

## 6. La lectura depende de `requestAnimationFrame` con ventana de 42 ms — nota 3

**Dónde:** `clapListener.ts:37,50-56` (`fftSize = 2048` ≈ 42 ms a 48 kHz, una lectura por fotograma).

**Flujo:** si el navegador baja de ~24 fps (preview de cámara a 1080p con lienzo, desenfoque del superpuesto, ahorro de energía), entre dos lecturas pasa más de 42 ms de audio que no se mira, y un aplauso (10–40 ms) puede caer en el hueco. El comentario «longer than a frame» solo vale a ≥ 24 fps.

**Evidencia (simulación, doble aplauso de pico 0,2):** dispara a 60, 30 y 20 fps; a 15 fps **no dispara**. Las pestañas ocultas no leen nada (rAF parado), pero tras volver el detector se comporta bien: el primer aplauso caduca por `time - firstAt > CLAP_MAX_GAP` antes de procesar la lectura.

**Arreglo:** `fftSize = 4096` (≈ 85 ms, aguanta hasta ~12 fps; solo duplica el bucle de `peakOf`) o, mejor, un `AudioWorklet` que mande el pico por bloque. Revisar `CLAP_MAX_LENGTH` si se amplía la ventana.

**Test:** caso en la simulación a 15 fps (hoy falla).

## 7. Foco y teclado del armado — nota 3

**Dónde:** `ClapArm.tsx:135-155`, `ClapArmView.tsx:233-272`.

- `role="dialog" aria-modal="true"` sin trampa de foco: el Tab sale del armado hacia el estudio (ver hallazgo 1; recorrido de 30 Tab medido).
- Al cancelar o disparar, el foco no vuelve al botón «Armar» y queda perdido.
- El `radiogroup` de sensibilidad no tiene navegación con flechas, que `role="radio"` promete (Tab recorre los tres botones: funciona, pero no es el patrón).
- Bien: Escape desarma (captura y `stopPropagation`), «Cancelar» con `autoFocus`, tamaños (`min-h-11` en sensibilidad, `min-h-14` en «Cancelar»), `role="meter"`, `role="status"` con `aria-live="polite"`, textos en español de España y `prefers-reduced-motion` respetado en las tres figuras.

**Arreglo:** `inert` en lo de debajo (mismo arreglo que el hallazgo 1), devolver el foco a «Armar» al desmontar, y flechas en el `radiogroup` (o botones con `aria-pressed`).

## 8. Transiciones sueltas y un color literal — nota 2

**Dónde:** `ClapFigures.tsx:141, 201, 229, 258, 313, 368` (`{ duration, ease: 'easeOut' }`) y `ClapArmView.tsx:163` (`rgb(0 0 0/0.6)` en `text-shadow`). El CLAUDE.md pide presets de `lib/motion.ts` y colores por tokens. Hay precedente en el repo (`Dialog.tsx:129`, `VideoCard.tsx:67`), y el trazo del ensō y las ondas son tweens por naturaleza: cabo suelto, no fallo.

**Arreglo:** `soft`/`snappy` donde sea un muelle; si hacen falta tweens, exportarlos como preset de `motion.ts`. Los colores de las figuras sí van por tokens (`color('kiji-700')`, `stroke-shu-400`…) y todos existen en `index.css`.

## 9. Huecos de pruebas — nota 3

- `clap.test.ts` cubre bien el camino feliz, el eco, la cola, el ruido de fondo y la sensibilidad, pero no los casos negativos del hallazgo 2 ni un hueco de tiempo grande entre lecturas (pestaña oculta).
- Nada prueba `clapListener.ts` ni los flujos de `RecordStudio` (armar, disparar, `rearm`, desarmar). `fake-media.js` ya trae `__fakeDoubleClap` y `__fakeMicLevel`, pero no hay un guion de e2e que los use; los de esta revisión (scratchpad) sirven de base.

## 10. Wake Lock: dos solicitudes pendientes pueden dejar un sentinel sin soltar — nota 2

**Dónde:** `ClapArm.tsx:116-125`. `request()` se llama en cada `visibilitychange` y comprueba `lock && !lock.released`, pero mientras la primera petición no resuelve `lock` es `null`: dos eventos seguidos hacen dos peticiones, y el segundo `lock = next` pierde el primer sentinel, que ya no se suelta al desmontar. Impacto mínimo (el estudio ya tiene el suyo y el navegador lo suelta al ocultarse). Arreglo: una bandera `pending`.

---

## Revisado sin hallazgos

- **Camino del disparo:** `clapFired` desarma, comprueba cámara lista y llama a `shutter()` con `clapFiring` puesto; mismas `takeTiming`, `songSpan`, cuenta atrás, `prepareSink` y fin automático. Verificado en navegador: la toma arranca y se para con «Listo»; la segunda, tras «Armar otra vez» + «Descartar», se arma igual.
- **«Armar otra vez»:** solo en tomas empezadas con aplauso (`fromClap`), pregunta antes de perder una toma sin guardar (`confirm 'rearm'`, probado), y `fromClap` se reinicia en el siguiente `shutter` y al recuperar una toma sobrante.
- **Micro:** reutiliza un clon de la pista de la toma (`RecordStudio.tsx:1151`) o abre una nueva si la canción es de archivo (spec: «habrá que pedirlo»); pista en bruto (sin AGC ni supresión: bien para aplausos). Carreras (cancelar mientras se pide el permiso, cerrar el estudio, rearmar rápido): la pista tardía se detiene.
- **Estados:** no se puede armar con fase ≠ `idle`, con cámara no lista ni sin soporte; armar cierra ajustes, imagen e información; Atrás desarma sin cerrar el estudio (probado); Escape y «Cancelar» liberan todo (probado).
- **Tiempo límite** de 3 minutos (spec: «unos minutos») con cuenta visible y aviso al desarmar.
- **Nada de «Descartado»:** ni tomas en serie, ni «mano arriba», ni voz.
- **Rendimiento:** por fotograma solo `peakOf` (2048 valores) y `MotionValue`s; el estado de React cambia solo en golpes y cambios de recuento.
- **Ajustes:** `clapSensitivity` con lista cerrada (`ALLOWED`), campo en los tres paneles (bandeja comprobada), ayuda en español.
- **Observación:** con la cuenta atrás en 0 s la toma arranca ~0,5 s tras el aplauso (`FIRE_HOLD_MS`): nadie tiene tiempo de colocarse. Considerar una cuenta mínima de 3 s cuando el inicio es por aplauso.
