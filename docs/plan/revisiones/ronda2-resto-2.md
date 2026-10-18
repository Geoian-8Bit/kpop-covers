# Ronda 2 de la prueba manual · resto (estudio, laboratorio/menú/voz, votaciones/RPD) · revisión 2

Revisión de solo lectura (18-10), rama `feat/plan-completo`, cambios sin commit y nadie editando. No se ha tocado
código, Supabase real, Vercel ni el navegador.

## Alcance

- Comprobar uno por uno los hallazgos ≥ 3 de `ronda2-estudio-1.md`, `ronda2-lab-voz-menu-1.md` y
  `ronda2-votaciones-rpd-1.md`, y buscar regresiones en sus arreglos.
- Dato del responsable: **la pantalla completa se ve con el móvil en horizontal**. La pantalla completa del estudio y
  la de la ronda se han revisado sobre todo a 844×390 y 667×375.
- Estudio: `ZoomControls.tsx` (línea compacta en táctil), `FsVoiceButton.tsx`, `VoiceSplitControl` (`bare`),
  `controlParts.tsx`, `useVoiceSplit.ts`, `useFullscreen` y `FsTopBar` en `StudioPage.tsx`, `lib/viewport.ts`.
- Menú: `NavSensu.tsx` (reescrito), `NavKakejiku.tsx`, `navRules.ts`+test, `lib/motion.ts` (`unfold`),
  `lab/moments/nav.tsx`. `NavHanafuda.tsx` y `NavKamon.tsx`: `git diff --quiet` vacío, sin cambios.
- Voz: `dsp.ts`, `dsp.test.ts`, `separateRules.ts`+test (`planSegments` con `lead`, `accumulate`),
  `stemSeparator.worker.ts` y el ciclo de vida del worker en `runSeparation.ts`.
- RPD: `RpdPlayPage.tsx` (`useFullscreen`, foco, Esc, crédito), `RandomPlayScreen.tsx`, `RoundControls.tsx`,
  `roundChrome.ts`, `fullscreenRules.ts`+test. Votaciones: `pollRules.ts`, `PollPage.tsx`, `PollFormDialog.tsx`.

## Qué he ejecutado y resultado

- `pnpm typecheck`: correcto (shared y web).
- `pnpm test`: correcto. shared 7 ficheros / 139 pruebas; web 53 ficheros / 714 pruebas.
- Medida de `twoStems` con el tamaño real (segmento 343 980, nfft 4096, hop 1024), compilado con el esbuild del repo
  en el scratchpad y ejecutado en Node en el escritorio. Sin el residuo: 104–138 ms. Con el residuo a −21,7 dB (no
  llega al suelo): 241–281 ms, es decir, unos **+140 ms por segmento**.

## Estado de los hallazgos de la ronda 1

### `ronda2-estudio-1.md`

| Hallazgo | Estado |
| --- | --- |
| H1 [6] En táctil no se puede guardar ni quitar el zoom del clip | **Corregido.** `ZoomControls.tsx:89` `clipLine = clip && ((zoomed && !saved) \|\| clipHasZoom(clip))`. Con un clip, en táctil queda una línea (`pointer-coarse:py-2`) con «Guardar el zoom en «X»» y «Quitar el zoom del clip». Con YouTube también sale el aviso «se guardó ampliado». Lo demás (título, «Ampliar», cifra, «Ver completo», flechas, ayudas) sigue con `pointer-coarse:hidden`. Sin clip activo la fila no se ve. Los casos (pellizcar sin guardar, volver a vista completa con el zoom guardado, YouTube con el zoom guardado) dan la línea esperada. |
| H2 [3] La trampa de foco cuenta los modos con `tabindex=-1` | **Corregido.** `FsVoiceButton.tsx:13-15`: `tabbable()` filtra `tabIndex >= 0`. Solo cuentan el modo elegido y «Cerrar», y Tab y Mayús+Tab dan la vuelta entre los dos. El foco inicial va al radio marcado. |
| H3 [3] En horizontal el panel tapa media altura del vídeo | **Corregido.** `bare` (`VoiceSplitControl.tsx:41-68`) deja solo los tres sellos (44 px) y una nota de una línea con `truncate`. El panel mide 56 px (unos 75 con la nota de mono), arranca a 60 px de arriba y mide como mucho 400 px de ancho, anclado a la derecha. A 844×390 ocupa del 15 % al 30 % del alto, lejos de la línea de progreso. `FsTopBar` es `absolute`: el panel se coloca respecto a la barra. `pointer-events` le llega del contenedor `fs-hit`. |
| H4 [2], H6 [2], H7 [2] | Corregidos: `useEffect` que cierra al perder `shown`; `unlock()` siempre al desmontar y `exitFullscreen()` solo si hay elemento (`StudioPage.tsx:1196-1208`); el comentario de Atrás en Android está corregido. |
| H5 [2] Restos de follow | Corregidos los tres comentarios. Queda `ESTADO-IMPLEMENTACION.md:15`, que aún da F10 por «Hechas y desplegadas». |

### `ronda2-lab-voz-menu-1.md`

| Hallazgo | Estado |
| --- | --- |
| [4] Los pesos del residuo solo miran la rama de frecuencia | **Corregido.** `reclaimResidual` (`dsp.ts:380-437`) toma los pesos de `demucsSpec` de las pistas finales (`xt + ispec(x)`), calculados antes de sumar el residuo, por canal. La prueba nueva «also when the model put the voice on its time branch only» pone la voz solo en `xt` y comprueba que no pasa a la música. El espectrograma de la mezcla es el `mag` de la entrada del modelo, que sale de los mismos `segL`/`segR`. |
| [3] Punto 46: no se mide y lo ya separado no cambia | **Parcial.** El worker deja un `console.info` por canción con el residuo y lo devuelto en dB (`stemSeparator.worker.ts:292-296`). **No está apuntado** en ningún «Cómo probar» (ni en ESTADO ni en MEJORAS) que hay que «Quitar las pistas separadas» y volver a separar para oír el cambio (ver N4). |
| [3] Kakejiku: `keepInView` con `offsetTop` | **Corregido.** `NavKakejiku.tsx:103` mide con `getBoundingClientRect` respecto al rollo más `scrollTop`. Funciona aunque el rollo tenga su propio `y` (línea y rollo se mueven juntos) y aunque el `<li>` de «¿Quién eres?» sea `relative`. |
| [3] Sensu: huecos entre hojas al abrir | **Corregido.** Un solo progreso `paper` (`unfold`) y `useSwing` lineal: las hojas van siempre repartidas por igual, así que el hueco entre dos vecinas es `wedge·p`. Cada hoja se dibuja con `wedge·1,07 + 0,4°`. `unfold` tiene ζ = 22/(2·√260) ≈ 0,68, así que se pasa un 5,3 % (p ≈ 1,053), por debajo de 1,07 + 0,4/15 ≈ 1,097: no se ve nada entre hojas tampoco durante el rebote. Al cerrar con `snappy` (ζ ≈ 0,83, se pasa un 0,9 %) no hay huecos. Las varillas van con su propio progreso, 25 ms por delante, y solo se ven entre el remache y el papel. |
| [2] Reabrir rápido deja las hojas quietas | Corregido: el `usePresence` sigue desde el valor actual (el papel espera 25 ms, imperceptible). `safeToRemove` no cambia de identidad mientras sale, así que el fundido no se reinicia. |
| [2] Sello equivocado al volver a abrir durante el cierre | Corregido: `setPicked(null)` al volver `isPresent` (`NavKakejiku.tsx:78`). |
| [2] Coste de `reclaimResidual` | **Sigue (ver N5).** Búferes reutilizados y suelo de −50 dB, pero con un HTDemucs real el residuo ronda los −20/−30 dB y casi nunca se salta. |
| [1] `viewH` de la última apertura, suelo de 120 px, preset `unfold` | Corregidos. `view` es una `MotionValue` que se pone en un `useLayoutEffect`. El suelo pasa a ser `max(rowH, buttonTop − 20 − frame)`: a 200 % (buttonTop 123) quedan 71 px a la vista y el cordón no se sale. `unfold` está en `lib/motion.ts`. |

### `ronda2-votaciones-rpd-1.md`

| Hallazgo | Estado |
| --- | --- |
| [3] Las votaciones antiguas «al cerrar» enseñan ya los resultados | **Aceptado (opción b).** El comentario de `pollRules.ts:7-11` dice que en producción no había ninguna abierta con resultados ocultos ni anónima. **No lo he podido comprobar aquí** (prohibido consultar producción), y la consulta y su resultado no están apuntados en ningún documento. Conviene dejarlos en ESTADO. |
| [3] RPD: al salir del modo CSS no se llama a `refitViewport()` | **Corregido.** Efecto `css → none` (`RpdPlayPage.tsx:218-223`), al desmontar en `css` o en la pantalla completa propia, y en `sync` al salir de la nativa (además del `fullscreenchange` global de `viewport.ts`; repetirlo no hace daño). |
| [3] Se pierde el foco al entrar o salir | **Corregido para el cambio de modo.** `data-fs-toggle` está en los tres diseños y hay un `useLayoutEffect` sobre `fullscreen.mode`. **No cubre el giro** que llega después del `lock('landscape')` (ver N2). |
| [3] La columna de la derecha no cabe en horizontal | **Ya no aplica.** En horizontal, la pantalla completa usa ahora la barra del estudio en el borde de abajo (`barLayout = 'overlay'`): 5 botones redondos de 44 px y una línea «n/N · título». A 667×375 caben (unos 236 px de botones). Se oculta a los 3 s mientras suena (`roundChrome.ts`, copia de `fullscreenChrome`) y un toque en el vídeo la enseña o la quita (`stageTap`). |
| [2] Texto falso al editar (`PollFormDialog`) | Corregido: el texto solo sale al crear (`PollFormDialog.tsx:192-198`). |
| [2] Nombre de «Pistas», etiqueta para salir, Esc según el momento, crédito de YouTube | Corregidos. `sr-only " guardadas: "`. Salida «Reducir: salir de pantalla completa» o «Salir de pantalla completa». Esc solo con `fullscreen.mode === 'none'`, y en modo CSS Esc sale de la pantalla completa (`escapeInFullscreen`). «Ver en YouTube» va en la barra de arriba y en la línea de la pantalla completa, fuera del vídeo, y abre en el segundo actual. |
| [2] Atrás en modo CSS | Sin cambios (no es una regresión, igual que en el estudio). |

## Hallazgos nuevos (de mayor a menor)

### N1 · Ronda en horizontal: durante la pausa y la cuenta atrás, la barra tapa el pie de la tarjeta Kamishibai · 4/10

- Dónde: `features/rpd/RandomPlayScreen.tsx:126` (la tarjeta, `p-[clamp(12px,4cqw,44px)]` y `justify-between`) con
  `:203-213` (la línea «n/N · título») y `SideColumn` `:226-245` (la barra `absolute bottom-0 z-30`).
- Qué pasa: en `overlay` la barra solo se oculta si el reproductor suena (`roundChrome.ts:19-22`). Durante la pausa
  y la cuenta atrás no suena, así que está siempre a la vista, encima de la tarjeta (z-30 sobre su z-20). Cálculo a
  844×390: imagen de 693×390 (cqw ≈ 6,9 px). La línea del artista (19 px) queda en y ≈ 333–362. La barra ocupa
  y ≈ 285–390, con el degradado y los botones a 325–369 en iPhone (zona segura de 21 px) o 340–384 en Android.
  La línea «1/8 · Título» (13 px, empieza en x ≈ 63) y los cinco botones (x ≈ 549–785) caen justo **encima del
  texto del artista** (x ≈ 103–740): texto sobre texto. Con un título de 3 líneas, la última entra en el degradado.
  En modo adivinar, el «Escucha y adivina» del pie queda bajo los botones.
- Escenario: Android o iPhone girado, ronda en pantalla completa, entre dos clips. Es el momento de leer qué viene,
  en el uso principal.
- Arreglo: en `fs && landscape`, darle a la tarjeta un relleno inferior igual al de la barra
  (`landscape:pb-[calc(clamp(12px,4cqw,44px)+56px+env(safe-area-inset-bottom))]`). Otra opción: no pintar en la línea
  de la barra el título mientras `covered`, porque la tarjeta ya lo enseña, y ocultar solo esa línea.

### N2 · El foco se sigue perdiendo cuando el móvil gira dentro de la pantalla completa · 2/10

- Dónde: `features/rpd/RpdPlayPage.tsx:295-302` (el efecto solo mira `fullscreen.mode`) y `RoundControls.tsx:151-199`
  (`CompactControls` devuelve otro árbol según `useLandscape()`).
- Qué pasa: en Android, al entrar llega primero `fullscreenchange`, que cambia el modo. El efecto lleva entonces el
  foco a «Reducir» del diseño vertical. Después, `lockLandscape` gira la pantalla, `CompactControls` cambia de raíz y
  ese botón desaparece: el foco cae a `body`. Con TalkBack o con un teclado, tras «Pantalla completa» no se anuncia
  nada. Pasa lo mismo con cualquier giro dentro.
- Arreglo: añadir `layout` (o `landscape`) a las dependencias del efecto (`lastMode` pasa a guardar `${mode}:${layout}`),
  o pintar los dos diseños compactos con el mismo árbol y solo cambiar clases.

### N3 · En horizontal los toques en las franjas negras y en la tira de la barra no hacen lo del estudio · 2/10

- Dónde: `RandomPlayScreen.tsx:226-245` y `RpdPlayPage.tsx:898-903`.
- Qué pasa: el cubre-toques solo cubre el 16:9. A 844×390 (iPhone con muesca) quedan unos 28–75 px negros a cada
  lado: un toque ahí no enseña la barra oculta. Con la barra a la vista, toda la tira de abajo (ancho completo por
  unos 95 px, degradado incluido) recibe los toques (`SideColumn` sin `pointer-events-none`). Tocar el cuarto de abajo
  del vídeo no la oculta. En el estudio la capa es `pointer-events-none` y solo los `fs-hit` reciben toques.
- Arreglo: dar a `SideColumn` en `overlay` `pointer-events-none` con `pointer-events-auto` solo en la línea y en el
  grupo de botones, y un manejador de toque en `FS_ROOT` (fuera del 16:9) que haga `stageTap`.

### N4 · Punto 46: falta decir cómo oír la mejora · 2/10

- Dónde: `docs/plan/ESTADO-IMPLEMENTACION.md` (no hay «Cómo probar» del 46) y `MEJORAS-PRUEBA-MANUAL.md` (ronda 2).
- Qué pasa: `useCurrentStems` coge las pistas ya guardadas. Una canción ya separada suena igual hasta que se quitan
  sus pistas y se vuelve a separar. El responsable podría dar el punto por no mejorado.
- Arreglo: una línea en ESTADO: «46 · para oírlo en una canción ya separada: Quitar las pistas separadas → Separar
  otra vez; la consola dice cuánto residuo se devolvió (`[voice] residual …`)».

### N5 · El residuo casi nunca se salta y alarga la separación · 2/10

- Dónde: `dsp.ts:395` (`RESIDUAL_FLOOR = 1e-5`) y `:401-403`.
- Qué pasa: medido, unos +140 ms por segmento en el escritorio (dos espectrogramas y una inversa). En un móvil, de 3
  a 5 veces más: 13–22 s más en una canción de 4 min (31 segmentos), en el camino que ya avisa de «va más lento». El
  suelo de −50 dB no salta con un HTDemucs real (residuo de −20 a −30 dB). El ETA ya lo cuenta (`times` incluye
  `twoStems`). Los búferes nuevos no contaminan nada: cada trabajo tiene su worker y se termina al acabar
  (`runSeparation.ts:256, 277, 292`), así que no hay dos separaciones a la vez ni restos de otra canción. Las claves
  van por nombre y tamaño, los acumuladores y `others` se ponen a cero, y `demucsSpec`/`reflectPad` escriben todo el
  búfer. `segL`, `segR`, `mix` y `magBuffer` solo se reescriben después de que `session.run` termine.
- Arreglo (opcional): subir el suelo a unos −35 dB por segmento si la medida del `console.info` lo permite, o
  calcular los pesos con un espectrograma de nfft menor. No hay prisa.

### N6 · El texto del laboratorio de Sensu ya no describe la animación · 2/10

- Dónde: `features/lab/moments/nav.tsx:22`: «las varillas se despliegan una tras otra desde el remache, arrastrando
  el papel».
- Qué pasa: con un solo progreso, todas las hojas se abren a la vez, repartidas como un abanico (lo que pedía el
  arreglo). El responsable elige leyendo ese texto.
- Arreglo: «Un abanico de washi y laca se abre desde la esquina de una vez, repartido como uno de verdad, pasa un
  poco de su sitio y se asienta…».

### N7 · Restos menores · 1/10

- `StudioPage.tsx:470`: el comentario «Only with a mouse: on a phone the zoom is the fingers' alone» ya no es cierto
  (queda la línea del clip).
- `ESTADO-IMPLEMENTACION.md:15`: F10 sigue como «Hechas y desplegadas» (punto 45, retirada).

## Resumen de notas ≥ 3

| Nota | Dónde | Qué |
| --- | --- | --- |
| 4 | `features/rpd/RandomPlayScreen.tsx:126`, `:203-245` | Pantalla completa en horizontal: durante la pausa y la cuenta atrás, la barra (que no se oculta) tapa el artista o «Escucha y adivina» de la tarjeta: texto sobre texto |

Todos los hallazgos ≥ 3 de la ronda 1 están corregidos, salvo dos. El [3] de medir el punto 46 queda parcial: falta
la nota de «Cómo probar» (N4). La parte de votaciones se ha aceptado con una comprobación en producción que no está
apuntada.
