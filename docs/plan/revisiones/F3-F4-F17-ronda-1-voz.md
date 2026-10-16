# F17 «Voz y música» · Revisión ronda 1

Revisión de solo lectura del árbol de trabajo (rama `feat/plan-completo`, sin commit). Alcance de este informe: F17
(`apps/web/src/features/voice/*`, `player/engine.ts`, `player/store.ts`, `VoiceRow` en `StudioPage.tsx`, momento
`voice-split` del laboratorio) y su cruce con el grabador (`RecordStudio.tsx` → `captureAudio`). F3/F4 se revisan aparte.

`pnpm typecheck` y `pnpm test` pasan (shared 89, web 59, de ellos 19 de `voiceRules`).

## Cómo se ha comprobado

- Chrome 149 headless propio (perfil en el scratchpad), contra el servidor demo de `localhost:5174`, con audio mudo.
  Se han subido tres archivos sintéticos (estéreo, mono y voz descentrada) para ver el comportamiento real.
- El AudioContext se ha instrumentado (contador y estado) con un script de inicio.
- La calidad del reparto mid/side se ha medido con `OfflineAudioContext` usando el `createVoiceSplit` real (módulo
  servido por Vite), con tonos de 80, 300, 500 y 1000 Hz y un análisis Goertzel.
- La toma se ha grabado de punta a punta con la cámara falsa (`e2e/fake-media.js`, copia sin `volume = 0`) y se ha
  decodificado el audio del archivo resultante.

## Resumen

La parte de audio funciona en el caso feliz: el modo «Sin voz» quita una voz centrada unos 65 dB, conserva el bajo, no hay
sonido duplicado ni mudo al cambiar de vídeo, y la toma sale con el modo elegido. Los problemas están en lo que pasa fuera
del camino feliz.

| # | Hallazgo | Nota | Bloquea |
| --- | --- | --- | --- |
| 1 | Un AudioContext suspendido congela el vídeo y nadie lo reanuda al dar a reproducir | 7 | 🔴 |
| 2 | «Sin voz» sale con los canales en oposición de fase: en un altavoz mono la música desaparece (también en la toma) | 7 | 🔴 |
| 3 | Se crea un AudioContext por elemento y no se cierra nunca (fuga) | 6 |  |
| 4 | El grabador no avisa de que la toma lleva «Sin voz» o «Voz», y su texto dice «audio original» | 6 |  |
| 5 | «Voz» no aísla la voz y la interfaz promete más de lo que hace; la voz descentrada se queda | 5 |  |
| 6 | La interfaz enseña un modo que no está aplicado (fallo silencioso, pestaña YouTube) | 5 |  |
| 7 | El aviso de «pista mono» se queda pegado de un vídeo a otro | 4 |  |
| 8 | Sin pruebas del motor, del almacén ni del grafo; la cámara falsa del repo silencia la toma | 4 |  |
| 9 | Mientras carga el archivo, la fila dice «YouTube no deja tocar su sonido» | 3 |  |
| 10 | Dos fuentes de verdad del modo (`voiceMode` y `split.mode`) y `attach` solo aplica si no es «original» | 3 |  |
| 11 | El laboratorio enseña un control compacto «en el grabador» que no existe en el grabador | 3 |  |
| 12 | Latencia y batería del contexto por defecto (`latencyHint`), no medidas | 3 |  |
| 13 | Colores en bruto en `VoiceFusuma` y `VoiceCapas` | 2 |  |

Lo que se ha comprobado y está bien: ver el apartado «Sin hallazgo» al final.

---

## 1. Un AudioContext suspendido congela el vídeo y nadie lo reanuda · nota 7 · 🔴

**Dónde:** `apps/web/src/player/engine.ts:54-60` (`graphFor`), `:71-73` (`play`, no reanuda), `:108-115` (`setVoiceMode`,
único sitio que reanuda); `apps/web/src/player/store.ts:212` (`attach` aplica el modo fuera de un gesto).

**Flujo:** el dancer elige «Sin voz» (gesto, el contexto arranca). Después el contexto pasa a `suspended` o `interrupted`:
llamada, Siri, bloqueo de pantalla o cambio de app en iOS; o bien el contexto se crea fuera de un gesto. Casos que lo crean
sin gesto: (a) con el modo ya elegido, el dancer cambia de «YouTube» a «Archivo» → `FileStage` nuevo →
`loadedmetadata` → `attach` → `setVoiceMode` → `graphFor` crea un contexto nuevo; en iOS Safari nace suspendido y
`resume()` fuera de un gesto se rechaza; (b) el grabador abre y `captureAudio` crea el grafo desde un `useEffect` en
navegadores sin `captureStream`. Desde ese momento el elemento solo suena por el contexto.

**Evidencia (Chrome, medida):** con «Sin voz» activo, `ctx.suspend()` y pulsar «Reproducir»: tras 4 s el `<video>` dice
`paused: false` pero `currentTime` sigue en 0 (reproducción congelada, sin sonido y sin error ni aviso). Tras
`ctx.resume()` avanza (`t = 2,01`). Ningún código reanuda el contexto en `play()`, ni escucha `statechange`, ni
`visibilitychange`. Solo volver a pulsar un botón de modo lo reanuda, y el dancer no tiene por qué saberlo. El grabador
queda además esperando a que la canción «se mueva», y la pista de `MediaStreamDestination` sigue `live` aunque el
contexto esté parado, así que no salta el aviso «No llega el sonido».
No se ha podido probar en un iPhone; la parte de iOS se apoya en las reglas de WebKit para contextos de audio.

**Arreglo:** (1) en `createMediaEngine.play`, si hay grafo y `ctx.state !== 'running'`, llamar a `ctx.resume()` dentro del
mismo gesto antes de `el.play()`; (2) escuchar `statechange` del contexto y, si deja de estar `running` con el vídeo
reproduciendo, pausar y avisar («El sonido se ha parado: toca reproducir»); (3) en el `attach` sin gesto, no crear el
grafo hasta el siguiente gesto (guardar el modo como pendiente y aplicarlo en `play`) en lugar de enrutar el elemento a un
contexto suspendido; (4) en el grabador, comprobar `ctx.state` antes de dar por buena la pista.

**Test:** vitest del motor con un `AudioContext` falso (estado `suspended`): `play()` debe llamar a `resume()` y a
`el.play()`; con `statechange` a `interrupted` mientras suena, el almacén debe pasar a pausa. En navegador: repetir el
experimento de arriba y comprobar que `currentTime` avanza tras pulsar reproducir.

---

## 2. «Sin voz» deja los canales en oposición de fase: en un altavoz mono la música desaparece · nota 7 · 🔴

**Dónde:** `apps/web/src/features/voice/voiceSplit.ts:159-163` (el lado va con +side a la izquierda y −side a la
derecha); comentario en `:44-46`; `voiceRules.ts` `modeGains`.

**Flujo:** el dancer se pone «Sin voz» y escucha por el altavoz del móvil (mono en la mayoría), un altavoz Bluetooth
suelto, o graba la toma y la comparte en una app que suma a mono. La música está en el lado, que sale en fase opuesta en L
y R: al sumar a mono se anula.

**Evidencia (medida con el grafo real, suma mono frente al nivel estéreo):**

| Señal | Estéreo (L) | Suma mono |
| --- | --- | --- |
| Música (guitarra izquierda, teclado derecha, centro 220 Hz, bajo 80 Hz) | −14,8 dB | −17,6 dB (queda solo el bajo) |
| Parte ancha de la mezcla (reverb, coros abiertos) | −19,5 dB | −83,0 dB (silencio) |

El comentario dice que «se adelgaza»; en realidad todo lo que no sea bajo se va. Y la toma grabada con «Sin voz» es
exactamente ese estéreo en oposición de fase (medido en el archivo de la toma: 300 Hz en L y R a −18 dB, 80 Hz a
−14,7 dB), así que al subirla a una red social que mezcle a mono, o verla en un altavoz mono, la canción casi no se oye.

**Arreglo:** cambiar el enfoque de «sin voz» a restar solo la banda de la voz del centro en cada canal, es decir, L menos
g por la banda de voz del centro y R menos g por la misma banda. Así se conserva la imagen estéreo, es compatible con
mono, el bombo y el bajo siguen, y no hace falta el truco de la polaridad invertida. Si se quiere mantener el reparto
actual, al menos ofrecer una salida «mono seguro» (lado en ambos canales con la misma polaridad) y avisarlo en la fila.

**Test:** en `voiceSplit` con `OfflineAudioContext` (o un test de navegador): para una señal de solo lado, la suma
mono en «sin voz» debe quedar a menos de 6 dB del estéreo, y para una voz centrada la reducción debe seguir siendo
mayor de 40 dB.

---

## 3. Un AudioContext por elemento, nunca se cierra · nota 6

**Dónde:** `engine.ts:50-67` (`elementGraphs` es un `WeakMap` sin cierre), `FileStage.tsx:73` (el cleanup solo hace
`detach`), `voiceSplit.ts:205` (`setInterval` por grafo), `voiceSplit.ts:227-237` (`dispose` existe y no se llama).

**Flujo:** cada `<video>` nuevo que usa un modo (otro vídeo, volver a la biblioteca y entrar, el interruptor
YouTube/Archivo) crea un contexto, un `setInterval` de 250 ms y 8 filtros más 2 analizadores. Al desmontarse el elemento
el contexto sigue `running` y el intervalo lo mantiene vivo, así que ni siquiera el recolector lo libera.

**Evidencia (medida):** cinco ciclos «biblioteca → vídeo → Sin voz» dejan 5 contextos en `running`. El laboratorio sí
cierra el suyo (`VoiceSplitDemo.tsx:195-203`), el motor real no. En iOS Safari el número de contextos simultáneos es bajo
(WebKit lo limita; no probado aquí): al agotarse, `new AudioContext()` lanza, `graphFor` devuelve `null` y el modo deja
de aplicarse sin avisar (ver hallazgo 6). Además cada contexto abandonado sigue gastando batería.

**Arreglo:** que `FileStage` llame a una función `releaseGraph(el)` del motor en su cleanup (`split.dispose()`,
`ctx.close()`, borrar la entrada), o reutilizar un único contexto de la página y un grafo por elemento. Parar el
intervalo cuando el contexto no está `running`.

**Test:** tras montar y desmontar `FileStage` cinco veces con un modo activo, el número de contextos sin cerrar debe ser
1 como máximo (con un `AudioContext` falso que cuente `close()`).

---

## 4. El grabador no avisa de que la toma lleva «Sin voz» o «Voz» · nota 6

**Dónde:** `RecordStudio.tsx:1577` («Sonido de la toma: canción limpia»), `:1591` («Con el audio original de la
canción»), `:436-441` (el efecto que elige la pista), `engine.ts:90-91` (`captureAudio` devuelve la salida procesada).

**Flujo:** el dancer prueba «Voz» o «Sin voz» en el estudio, se olvida, abre el grabador y graba. La toma sale con el
modo puesto y no se puede deshacer; el grabador dice «canción limpia» y «audio original».

**Evidencia:** grabación completa con cámara falsa en los tres modos; el audio decodificado de la toma coincide con el
modo (Todo: sin cambios; Sin voz: 1000 Hz a −74 dB; Voz: 80 Hz a −44 dB, en mono y con la banda recortada). El texto del
grabador no cambia con el modo. El plan de grabación (sección 6) dice que la toma «podría llevar la versión sin voz»,
pero no hay forma de elegirlo ni de verlo en el grabador.

**Arreglo:** que el resumen del sonido diga «canción sin voz» o «solo la voz» según `voiceMode`, y mejor aún un conmutador
en el panel de sonido del grabador con la fila compacta (ya existe `compact`). Si no, que la toma use siempre «Todo»
(forzando el modo mientras se graba) y que el sin voz sea una elección explícita.

**Test:** unitario de la función que construye el texto del sonido de la toma para los tres modos; en navegador, grabar
con «Sin voz» y ver que el texto del grabador lo dice.

---

## 5. «Voz» no aísla la voz; la interfaz promete más de lo que hace · nota 5

**Dónde:** `voiceRules.ts:75-83` (`modeGains`), `controlParts.tsx:24-28` (`MODE_COPY`: «Solo la música», «La voz al
frente»), `voiceSplit.ts:28-37`.

**Evidencia (medida):**
- «Voz» es el centro pasado por 200–6000 Hz: una guitarra tocada solo por la izquierda sigue sonando a −20 dB frente a
  la voz a −12,4 dB, es decir, una ganancia de unos 6 dB sobre el original. Es un mono con graves y agudos recortados,
  no la voz sola.
- Una voz ligeramente descentrada (28 % izquierda, 12 % derecha) en «Sin voz» baja de −11,1 dB a −20 dB: queda un
  fantasma de la voz unos 9 dB por debajo. Los dobles de voz y la reverb ancha se quedan (−16,5 dB en la prueba).
- La pista mono sí se avisa (hallazgo 7), pero el caso descentrado y el de «Voz» no.

**Arreglo:** texto honesto en la fila, por ejemplo «Sin voz: quita lo que suena en el centro» y «Voz: realza el centro»,
con una frase corta bajo la fila («Funciona mejor con canciones mezcladas en estéreo; puede quedar algo de voz»). No
prometer «Solo la música».

**Test:** prueba de texto (que `MODE_COPY` no contenga «Solo»); la medida de arriba como test de navegador con umbrales
(voz descentrada al 70/30 debe quedar al menos 6 dB por debajo, y documentarlo).

---

## 6. La interfaz enseña un modo que no está aplicado · nota 5

**Dónde:** `store.ts:205-208`, `engine.ts:64-66` y `:109-112`, `StudioPage.tsx` `VoiceRow`.

- **Fallo silencioso.** `graphFor` devuelve `null` si falla (sin contexto, límite de contextos, el elemento ya conectado)
  y el `setVoiceMode` del motor sale sin hacer nada; el almacén guarda el modo igualmente y la fila marca «Sin voz»
  mientras suena la canción entera.
- **Pestaña YouTube.** `reset()` solo borra el modo al cambiar de vídeo; al pasar de «Archivo» a «YouTube» el almacén
  conserva «Sin voz», la fila lo marca (desactivada) y YouTube suena entero. Al volver a «Archivo» el modo se reaplica
  solo, lo que es bueno, pero el estado intermedio engaña.

**Arreglo:** que el `setVoiceMode` del motor devuelva un booleano, que el almacén solo guarde el modo si se aplicó (o
guarde un error de voz) y que la fila lo diga («Este navegador no deja separar el sonido»). Mostrar «Todo» marcado
cuando `available` es falso.

**Test:** almacén con un motor falso cuyo `setVoiceMode` falla: `voiceMode` debe quedar en `original`. Fila con
`available = false` y `mode = 'sin-voz'`: debe marcar «Todo».

---

## 7. El aviso de «pista mono» se queda pegado entre vídeos · nota 4

**Dónde:** `StudioPage.tsx` `VoiceRow` (estado `monoLike` que solo se actualiza con un modo distinto de «Todo»);
`engine.ts` nunca llama a `resetAnalysis()`.

**Flujo:** vídeo mono con «Sin voz» → aviso. Se abre un vídeo estéreo: `VoiceRow` sigue montado, `monoLike` sigue en
`true` y el aviso se muestra con «Todo» elegido hasta que el vídeo nuevo suene 3 s con un modo activo.

**Evidencia (medida):** mono, «Sin voz», a los 2,5 s sale «Esta pista suena en mono…». Se vuelve a «Todo» y sigue.
Se navega al vídeo estéreo: el aviso sigue ahí con «Todo». Tras 6 s con «Sin voz» en el estéreo desaparece. Un mismo
elemento con otra `src` (por ejemplo al pasar de copia local a copia en la nube) arrastra además las muestras viejas
porque nadie llama a `resetAnalysis`.

**Arreglo:** reiniciar `monoLike` en un `useEffect` con la clave del vídeo y la etapa, o guardar el resultado en el
almacén y ponerlo a falso en `reset()` y `attach`; llamar a `resetAnalysis()` cuando cambie `src`. Mostrar el aviso mono
solo con «Sin voz».

**Test:** componente `VoiceRow` con un motor falso: cambiar de vídeo debe borrar el aviso.

---

## 8. Sin pruebas del motor, del almacén ni del grafo · nota 4

**Dónde:** `voiceRules.test.ts` cubre solo las reglas puras; nada prueba `engine.ts` (`graphFor`, `captureAudio`,
`setVoiceMode`), `store.ts` (`attach`, `reset`, `setVoiceMode`) ni `voiceSplit.ts`. Además `apps/web/e2e/fake-media.js`
pone `this.volume = 0` en cada `play()`: un elemento enrutado por Web Audio respeta el volumen del elemento, así que en
cualquier prueba con ese archivo la toma con un modo de voz sale **sin audio** (comprobado: audio de la toma en −inf),
mientras que con `captureStream` (modo «Todo») sale bien. Es un falso fallo para quien pruebe con el procedimiento de
`PROGRESO.md`.

**Arreglo:** pruebas del almacén (motor falso) y del grafo (`OfflineAudioContext` en el navegador); y en
`fake-media.js` silenciar solo por el contexto (ya lo hace) en vez de por `volume`.

**Test:** los de los hallazgos 1, 2, 3, 6 y 7.

---

## 9. Mientras carga el archivo, la fila dice «YouTube no deja tocar su sonido» · nota 3

**Dónde:** `StudioPage.tsx` `VoiceRow` (`available = Boolean(s.engine?.setVoiceMode)`), `controlParts.tsx:30`.

**Evidencia (medida):** al abrir un vídeo subido, el `role=status` pasa por «Solo con el archivo del vídeo (YouTube no
deja tocar su sonido)» y luego se vacía. Con un archivo que falla al cargar se quedaría ese texto. Es un parpadeo
anunciado a lectores de pantalla (`aria-live`).

**Arreglo:** calcular `available` por el tipo de vídeo y la etapa (archivo o YouTube), no por la presencia del motor; si
el motor aún no está, mostrar la fila activa o neutra.

**Test:** `VoiceRow` con `engine = null` y etapa de archivo: no debe mostrar el texto de YouTube.

---

## 10. Dos fuentes de verdad del modo · nota 3

**Dónde:** `engine.ts:41-46` (el grafo guarda `split.mode`), `store.ts:204-213`.

`attach` solo llama a `setVoiceMode` si el modo no es «original». Hoy no falla porque un vídeo distinto trae un
elemento nuevo (se probó A→B directo: `<video>` distinto), pero si algún día el elemento persiste con el grafo en «Sin
voz» y `reset()` pone `original` en el almacén, la fila diría «Todo» y sonaría sin voz. Además la regla del proyecto es
que los motores no guardan estado de UI.

**Arreglo:** que `attach` llame siempre a `engine.setVoiceMode` con el modo actual (el motor ya sale sin hacer nada si
es «original» y no hay grafo) y que el modo viva solo en el almacén.

**Test:** `attach` con un motor falso: debe recibir siempre el modo actual.

---

## 11. El laboratorio enseña un control «en el grabador» que no existe · nota 3

**Dónde:** `VoiceSplitDemo.tsx:228-241` («En el grabador (compacto)»), `VoiceSplitControl.tsx:15` (comentario sobre el
panel de ajustes del grabador); no hay ningún uso de `VoiceSplitControl` en `features/record`.

La variante compacta solo se usa en el estudio. Quien elija una variante en el laboratorio creyendo que irá al grabador
se equivoca. Se relaciona con el hallazgo 4.

**Arreglo:** colocarlo en los ajustes del grabador (hallazgo 4) o quitar la sección del laboratorio y el comentario.

**Test:** no aplica.

---

## 12. Latencia y batería del contexto por defecto · nota 3 (no medido)

**Dónde:** `engine.ts:54` (`new AudioContext()` sin opciones).

Con el `latencyHint` por defecto el contexto usa búferes pequeños y despierta más veces: más batería en sesiones largas
de ensayo. Al ir el elemento por Web Audio, el vídeo no compensa la latencia de salida (pocos milisegundos con cable,
bastante más con Bluetooth, igual que antes). Para el sonido grabado no hay cambio de sincronía respecto a
`captureStream`: el dancer oye lo mismo con retraso en ambos casos. No se ha podido medir en un móvil real.

**Arreglo:** probar `new AudioContext({ latencyHint: 'playback' })` y comprobar la sincronía imagen y sonido con una
palmada en un móvil; parar el muestreo de 250 ms cuando el vídeo está en pausa.

**Test:** prueba manual en iPhone y Android con un altavoz Bluetooth.

---

## 13. Colores en bruto · nota 2

**Dónde:** `VoiceFusuma.tsx:18-19` (`rgb(74 52 36 / 0.32)`), `VoiceCapas.tsx:29` (`rgb(169 194 222 / 0.45)`). Las
sombras con `rgb(0 0 0 / …)` y `rgb(255 246 230 / …)` de las tres variantes repiten el patrón del resto de la app.

La regla del proyecto es usar colores solo mediante los tokens de `index.css`. Los dos primeros son colores de marca
(madera y azul) metidos a mano en un degradado.

**Arreglo:** definir tokens (o `color-mix` sobre los existentes) y usarlos en los degradados.

**Test:** no aplica.

---

## Sin hallazgo (comprobado)

- Un elemento solo se conecta una vez: `elementGraphs` por elemento evita el error de doble conexión; el `FileStage` que
  se vuelve a montar trae un `<video>` nuevo y un grafo nuevo que funciona. Cambiar de vídeo, volver al estudio y pasar
  de A a B directamente se probaron sin sonido duplicado ni mudo (lo único que sobra es la fuga del hallazgo 3).
- El grabador usa la salida procesada (`captureAudio` devuelve el `tap`) y el archivo de la toma lleva el modo elegido,
  sin quedarse sin audio en «Todo», «Sin voz» ni «Voz» (con la cámara falsa sin `volume = 0`).
- Calidad: una voz centrada en «Sin voz» baja de −14 dB a −80 dB; bajo conservado (−14,7 dB); sin clics (las
  transiciones usan `setTargetAtTime`); una pista mono, que deja solo el bajo, se detecta y avisa a los 3 s.
- Accesibilidad de la fila: `radiogroup` con nombre «Voz y música», radios con nombre «Todo», «Sin voz» y «Voz» (los
  sellos van `aria-hidden`), una sola parada de tabulación, flechas, Inicio y Fin funcionan y no disparan los atajos de
  ±5 s, la descripción apunta al aviso, destinos de 44 px.
- Movimiento: variantes con `useReducedMotion` y presets de `src/lib/motion.ts`.
- Rendimiento de la animación continua de «La ola partida»: unos 20 cuadros por segundo de rAF y alrededor del 1 % de
  CPU en reposo.
- Textos de la interfaz en español de España.
