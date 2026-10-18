# Revisión · Ronda 2 de la prueba manual, puntos 40, 41 y calidad del 46 (laboratorio, menú rápido, voz) · ronda 1

Revisor de solo lectura, 18-10-2026, rama `feat/plan-completo` (cambios sin confirmar).

## Alcance

- 40 · Diseños elegidos: `features/lab/**` (labIds, registry, labState.test, `moments/nav.tsx`; borrados
  `moments/bags.tsx`, `countdown.tsx`, `voice.tsx`), `features/bags/` (BagIcon, BagShelf, BagsPage; borrados
  BagIconDemo y BagsListDemo), `features/events/` (EventCountdown, CountdownTsuki, countdownBand, eventRules+test,
  EventPage, NextEventBanner; borrados Koyomi, Sunadokei y EventCountdownDemo), `features/voice/` (VoiceSplitControl,
  VoiceOnda, controlParts, waveRules+test, waves.css; borradas las variantes, studioWave* y VoiceSplitDemo), y
  ESTADO apartado 7.
- 41 · Menú rápido: `features/nav/prototypes/NavSensu.tsx` (entrada nueva), `NavKakejiku.tsx` (nuevo), borrado
  `NavOrigami.tsx`, `navRules.ts`+test (`kakejikuLayout`), `NavDemo.tsx`, `QuickNav.tsx`.
- 46 (calidad) · `features/voice/separate/dsp.ts` (`reclaimResidual` y su uso en `twoStems`), `dsp.test.ts` y
  `stemSeparator.worker.ts`.
- `apps/web/vite.config.ts` (`globIgnores`, caché `lab-demos`).

## Qué he ejecutado

- `pnpm typecheck`: sin errores.
- `pnpm test`: 53 archivos, 695 pruebas, todas pasan.
- Compilación de producción en una carpeta temporal fuera del repositorio (`vite build --outDir <scratchpad>`, no
  toca `dist/`): 67 entradas en el precache. Entran `NavSensu` y `quickNavCore`. Quedan fuera `NavDemo`,
  `NavHanafuda`, `NavKamon` y `NavKakejiku`. No queda ningún chunk de Koyomi, Sunadokei, de las variantes de la ola,
  de las demos de bolsas ni de la pose. Tsuki va dentro del chunk de la cuenta atrás.
- `grep` de todos los nombres retirados (origami, koyomi, sunadokei, kinchaku, omikuji, hokusai, compacta, fusuma,
  capas, VoiceOlaAudio, studioWave, *Demo de bolsas, eventos y voz) en `src`, `vite.config.ts` y `vercel.json`:
  solo queda un comentario que dice que Kakejiku sustituye a Origami. No hay imports rotos.
- `git diff --quiet` de `NavHanafuda.tsx` y `NavKamon.tsx`: vacío (sin cambios).
- `reclaimResidual` con los tamaños reales (segmento de 343 980, nfft 4096, hop 1024), en Node y en el escritorio:
  **150–220 ms por segmento** (un `demucsSpec` solo: 65–130 ms). Ida y vuelta `demucsSpec` → `demucsIspecAdd` de una
  señal constante: 0,50 en la muestra 0, 0,68 en la 256, 0,99 en la 1024 y 1,00 desde la 2048 (al final, igual).
- Sin navegador. Lo de las animaciones sale de leer el código y calcular los muelles. La separación no la he
  probado con audio real.

## Comprobaciones que salen bien

- **Punto 40, literal:** Tsuki para la cuenta atrás larga (Chōchin sigue la última semana), «La ola partida»
  (`VoiceOnda`) como único control de voz, Furoshiki en «Bolsas» y Fukubukuro como icono. Son los mismos trazos
  que la variante del laboratorio. Se han quitado los momentos del laboratorio y el resto de variantes, y están
  apuntados en ESTADO apartado 7. El Furoshiki de `BagShelf` es el de la prueba, sin cambios.
- **`oneshoot.lab.v2`:** `parseChoices` descarta lo guardado para momentos que ya no existen y para variantes
  desconocidas. `{"nav":"origami"}` acaba en Sensu y hay una prueba de ello. El siguiente `setVariant` reescribe la
  clave sin esas entradas viejas. `QuickNav` cae en `prototypes.sensu` si la variante no está.
- **Kakejiku cumple el contrato:** usa `useQuickNav`, `QuickNavRoot`, `QuickNavScrim`, `QuickNavTrigger` y
  `EntryLink` en todas las líneas. Así tiene `data-nav-entry` y `aria-current`, y cierran igual Esc, Atrás de
  Android, un toque fuera y elegir. El foco va a tu sección y vuelve al botón. El nombre de cada enlace es su texto
  visible (kanji, icono y sello van con `aria-hidden`). Las líneas miden 52 px, o 44 si no caben, nunca menos.
- **Kakejiku en horizontal:** a 844×390, el botón empieza a 318 px y el papel pasa a enrollarse (viewH 266 + 32 de
  varillas, con el borde de arriba a 8 px). A 390×844 caben 6 líneas de 52 px sin enrollar. Al desenrollarse solo se
  mueve `transform`, con una sola `MotionValue` y sin render por fotograma. Si se vuelve a abrir mientras se
  enrolla, sigue desde donde estaba (`usePresence` y `cancelled` bien llevados). Con «reducir movimiento» solo hay
  un fundido.
- **Sensu:** solo se mueven `rotate`, `scale` y `opacity`, sin render por fotograma. Las hojas no se cruzan durante
  el rebote (el desfase máximo es de unos 7°, menos que el ancho de una hoja, 15°). El rebote es del 5 % (ζ ≈ 0,68),
  unos 4° en la varilla de la izquierda. Si se cierra en mitad de la apertura, el resorte sigue desde donde estaba,
  sin saltos.
- **`reclaimResidual`, la parte numérica:** el reparto `pi/(pi+pv)` va siempre de 0 a 1. Cuando `pv+pi ≤ 1e-20`
  da 1, así que no hay división por cero. Las potencias se calculan en doble precisión. «Voz» no se toca: `vocals`
  es de solo lectura y la prueba lo comprueba con diferencia 0. El residuo de cada trozo se calcula con ese mismo
  trozo (con el relleno de silencio del último) y luego se mezcla con los mismos pesos triangulares, así que nada se
  cuenta dos veces. La parte que se lleva la voz se descarta, y «Todo» sigue siendo el original.

## Hallazgos (de mayor a menor)

- **[4] `features/voice/separate/dsp.ts:318-333` — el reparto del residuo solo mira la rama de frecuencia del
  modelo: puede meter voz en «Sin voz».** El residuo se calcula con las pistas completas (rama de tiempo `xt` más la
  inversa de `x`), pero el peso de cada bin sale solo de `|x_voz|²` y `|x_resto|²`. En HTDemucs las dos ramas llevan
  sonido de toda la banda. Si en un bin la voz va sobre todo por `xt` (transitorios, sibilantes, las consonantes
  altas), `pv` sale casi 0 y la voz que el modelo no cogió acaba entera en la música, como con `mix − voz`. Es justo
  lo que el comentario dice que evita. Las cuatro pruebas nuevas ponen `xt` a cero y la voz y la música en bins
  distintos (4 y 12), así que no pueden verlo.
  **Arreglo:** sacar los pesos del espectrograma de las pistas finales: `demucsSpec(vocals[0], vocals[1])` y
  `demucsSpec(instrumental[0], instrumental[1])` antes de sumar el residuo. Son dos espectrogramas más por segmento
  (ver el coste en el [2]). Añadir una prueba con la voz solo en `xt` que compruebe que no pasa a la música.

- **[3] Punto 46 · no se sabe si mejora lo que pidió el responsable, y lo ya separado no cambia.** HTDemucs suele
  sumar casi exacto la mezcla: si «floja» viene de música que el modelo metió en la voz (sintes, coros), devolver
  el residuo no la recupera. No hay ninguna medida de cuánto cambia. Además, las canciones ya separadas siguen con
  las pistas antiguas (`useCurrentStems` coge la fila más reciente): para oír la diferencia hay que «Quitar las
  pistas separadas» y volver a separar, y eso no está apuntado en ningún «Cómo probar».
  **Arreglo:** en `separate()`, sacar por `console.info` la energía del residuo y la de lo devuelto respecto a la
  mezcla (dB, por canción) y probar con la canción que el responsable notó floja. Apuntar en ESTADO («Cómo
  probar», punto 46) que hay que quitar y volver a separar.

- **[3] `features/nav/prototypes/NavKakejiku.tsx:93-102` + `:148` — con el papel enrollable, el foco nunca enseña
  «¿Quién eres?».** `keepInView` usa `line.offsetTop`. El `<li>` de «¿Quién eres?» es `relative`, así que es el
  `offsetParent` de su enlace y `offsetTop` vale 0. Escenario: móvil en horizontal (el papel se enrolla), teclado o
  conmutador, Tab hasta la última línea. Si el papel está arriba no se mueve y la línea con foco queda oculta abajo.
  Si se había desplazado, salta arriba del todo (`scrollTop = -10`). Para las demás líneas funciona solo porque su
  `offsetParent` resulta ser la ventana `absolute`, lo cual es frágil.
  **Arreglo:** medir respecto al rollo:
  `const top = line.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop`, o
  quitar `relative` del `<li>` y poner la raya discontinua con un borde.

- **[3] `features/nav/prototypes/NavSensu.tsx:52-55, 73, 99-102, 133-134` — al abrir, las hojas de la izquierda se
  separan como cartas durante un momento.** Cada hoja arranca 30 ms antes que la de su derecha y todas usan el
  mismo muelle (`unfold`, ωn ≈ 16, ζ ≈ 0,68), pero recorren distancias distintas. Cálculo, a 390×844 con 6 hojas de
  15°: hacia los 0,07–0,10 s se abre un hueco de **≈ 7° entre la hoja 0 y la 1** y de ≈ 3,6° entre la 1 y la 2. Por
  ese hueco se ven el velo y las varillas de debajo. Las hojas solo se solapan 0,4°. No es un tirón, pero el papel
  deja de parecer continuo («arrastra el papel», dice la descripción) y recuerda a Hanafuda. Al cerrar pasa lo
  mismo en pequeño (≈ 2°), porque se cierran primero las de la derecha.
  **Arreglo:** un solo progreso `p` (0→1 con `unfold`) y el ángulo de cada hoja como
  `closed + (angle − closed)·p`, así se abren siempre repartidas como un abanico de verdad. El adelanto de la
  varilla puede ser un `p` propio con 20–30 ms de ventaja. Al cerrar, empezar por la izquierda
  (`closeAt(i) = i·0.012`) o usar también `p`.

- **[2] `features/voice/separate/dsp.ts:292-335` — coste y memoria de `reclaimResidual`.** Medido: 150–220 ms por
  segmento en el escritorio (Node). En un móvil puede ser de 3 a 5 veces más, 0,5–1 s por segmento: una canción de
  4 min tiene unos 31 segmentos, así que son 15–30 s más en el camino que ya avisa de «va más lento». Y cada
  segmento crea unos 25 MB de búferes que no se reutilizan (dos residuos, un espectrograma de 11 MB, los padding de
  `demucsSpec` y los acumuladores de 5,6 MB de `demucsIspecAdd`). Con el [4] serían dos espectrogramas más.
  **Arreglo:** saltarse el paso cuando la energía del residuo esté por debajo de unos −50 dB de la del segmento
  (comprobarlo en el bucle que ya existe) y reutilizar los búferes entre segmentos. Contarlo en el ETA, que ya sale
  de `times`, así que eso ya está bien.

- **[2] `features/nav/prototypes/NavSensu.tsx:102, 133` — cerrar y volver a abrir rápido deja las hojas quietas un
  momento.** Al volver a entrar mientras sale, `AnimatePresence` reaprovecha el abanico, pero los `animate`
  vuelven a llevar `delay: openAt(i) + PAPER_LAG`, hasta 0,205 s. El contenedor ya ha vuelto a la opacidad 1 y las
  hojas siguen congeladas a medio cerrar antes de abrirse. La versión anterior hacía lo mismo (hasta 0,195 s), así
  que no es una regresión. Se arregla de paso con el progreso único del [3].

- **[2] `features/nav/prototypes/NavKakejiku.tsx:60, 105` — sello equivocado si se vuelve a abrir durante el
  cierre.** Escenario: tocar una sección (sale el sello y hay 200 ms de espera), Esc o tocar fuera antes de que
  navegue, y abrir otra vez enseguida. El rollo se reaprovecha con `picked` aún puesto: el sello sigue en la línea
  que no se eligió, y `pickOnce` lo deja ahí aunque se elija otra. **Arreglo:** `setPicked(null)` cuando
  `isPresent` vuelva a `true`.

- **[1] `features/nav/prototypes/NavKakejiku.tsx:64` — tamaño de la última apertura.** `useMotionValue(viewH)` se
  inicia con el `stage` guardado de la vez anterior. Si se gira el móvil con el menú cerrado, el primer fotograma
  usa el `viewH` viejo y el desenrollado empieza un poco más arriba o más abajo. Se ve como un saltito.

- **[1] `features/nav/navRules.ts:161` — con zoom muy grande en horizontal el rollo se sale por arriba.** El suelo
  de 120 px gana cuando `buttonTop < 172` (unos 175 % de zoom de texto a 844×390). En ese caso la varilla superior
  queda hasta unos 20 px fuera de la pantalla. Se puede seguir usando, porque el papel se desplaza. **Arreglo:**
  `Math.min(…, buttonTop − 20 − frame)` sin el suelo cuando no quepa.

- **[1] `features/nav/prototypes/NavSensu.tsx:51` — el muelle `unfold` se crea en el componente.** CLAUDE.md pide
  usar los presets de `lib/motion.ts`. Si Sensu se queda, pasarlo allí con nombre propio.

- **[1] `features/voice/separate/dsp.ts:318`, `:335` — la ida y vuelta del espectrograma atenúa los bordes de cada
  trozo.** Baja al 50 % en la muestra 0 y llega al 100 % hacia los 23 ms. Entre trozos no se nota, porque ahí pesa
  el trozo vecino. Solo afecta a los primeros ~23 ms de la canción, sin importancia.

- **[1] `features/voice/controlParts.tsx:15` — nombre que ya no encaja.** `VoiceVariantProps` sigue diciendo
  «variante», pero solo queda un diseño. Puede llamarse `VoiceControlProps`.
