# Revisión · Ronda 2 de la prueba manual · puntos 50 (Tomas) y 51 (Repaso / comparar) · ronda 1

## Alcance

Revisión de solo lectura de los cambios sin commit de `feat/plan-completo` para los puntos 50 y 51 de
`docs/plan/MEJORAS-PRUEBA-MANUAL.md` (sección «Ronda 2»). Archivos:

- `features/review/`: `ReviewMedia.tsx`, `CompareStage.tsx`, `ReviewControls.tsx` y `ReviewScreen.tsx` (rehechos),
  `reviewRules.ts` (`syncStep`, `needsAlignOnPlay`, `seekAhead`, `blendLatency`, `bestLayout`, `takeSongZero`) y
  `reviewSync.test.ts` (nuevo).
- `features/takes/`: `TakesPanel.tsx`, `takeRules.ts` (`uniqueTakes`, `takeListing`, `noteCountByTake`) y
  `takeListing.test.ts` (nuevo).
- `player/store.ts`: solo `useReview.play()`. `player/engine.ts` solo leído (motores de archivo y de YouTube).
- `data/takes.ts`: cómo se parchea la caché de react-query. `features/record/takeStore.ts`: `keepTake` y `meta.sync`.

Durante la revisión, el responsable añadió esto: «cuando vemos el vídeo en pantalla grande el móvil está en
horizontal». Por eso las medidas de horizontal (844×390 y 667×375) pesan más que las de vertical. No he arrancado
servidor ni navegador. Las medidas salen de las clases y las simulaciones del play las he hecho leyendo el código de
los motores.

## Ejecutado

- `vitest run src/features/review src/features/takes src/player`: 7 archivos, 141 pruebas, todas en verde.
- `tsc --noEmit` en `apps/web`: sin errores.

## Lo que está bien

- **Causa del «no suena».** Antes la toma solo se registraba en `loadedmetadata`. En iPhone, con `preload="auto"`,
  ese evento no llega hasta que se pide reproducir. Así que `takeEngine` era `null`, `play()` salía sin hacer nada y el
  botón no respondía. Ahora `attachTake` se llama al montar (`ReviewMedia.tsx:41`). El botón de play y el toque en el
  escenario llaman a `useReview.play()` dentro del mismo `click`/`pointerup`. Ese `play()` arranca el original y
  después la toma, sin nada asíncrono por medio, así que la toma suena desde el primer toque.
- **Causa del retraso.** Antes, en cada `playing` de la toma se recolocaba el original (`alignOriginal`). Con YouTube
  eso volvía a cargar el vídeo una y otra vez. Ahora no hay recolocación al empezar si el original ya está en su
  sitio (`needsAlignOnPlay`). La toma no espera nunca al original. Las correcciones esperan a que aterrice la anterior
  (`settleMs`) y se van espaciando (`syncCooldown`: 1,2 s y 2 s, que se doblan hasta 8 s). Un bucle de saltos no es
  posible: la prueba «a handful of times in half a minute» lo comprueba.
- **Archivo.** Si se desfasa poco, se acelera o se frena hasta un ±6 %. Si se desfasa más de 0,5 s, salta un poco por
  delante. Solo se juzga con `!paused && !seeking && readyState >= 3`. Pausa, seek, fotograma a fotograma, velocidad
  y A–B pasan por el store, que deja el original exacto en pausa. Al final de la toma, un tramo A–B vuelve a su
  inicio, y si no lo hay se pausa. Volver a reproducir desde el final empieza en 0.
- **YouTube entero.** Sin recorte ni etiqueta encima. La caja es 16:9 con `contain`
  (`min(100cqw, 100cqh·16/9)`). Ya no está el `top:-12%; height:124%` de antes, que recortaba el reproductor.
  «Superpuesto» solo se ofrece con archivo (`canOverlay = source === 'file'`) y, si no se puede, avisa con un toast.
- **Regresión en el estudio:** ninguna. El cambio de `play()` está en `useReview` (`store.ts:671-690`). El `play()` de
  `usePlayer` no se ha tocado. El resto del diff de `store.ts` es del punto 45 (quitar «seguir»).
- **Punto 50:**
  - Ya no hay filtros de fecha en la interfaz.
  - «Nube del grupo» solo aparece con un uso ≥ 80 % (`CloudNotice`, `warnRatio 0.8`). El dato de uso se ha pasado a la
    hoja «Compartir».
  - La toma que abre «Repaso» va primera, resaltada, con «Repasar con el original», y no se repite más abajo.
  - Las cuatro acciones de cada fila (estrella, descargar, compartir, borrar) son iconos de 44 px sin texto por debajo
    de `sm`: unos 200 px, que caben de sobra en 390.
- **Caché de react-query (pregunta del encargo).** No hay ninguna vía que deje una toma dos veces:
  - `useSaveTake` hace `[item, ...items.filter(id ≠)]`.
  - Compartir, ajustes del repaso y asignar usan `merge`, que es un `map`.
  - La estrella usa `applyBest`, que también es un `map`.
  - `listTakes` es un `select('*')` sin uniones.
  - Una lectura en vuelo que termina después del parche sustituye la lista entera por la del servidor.

  Así que lo que vio el responsable era la tarjeta «Repaso» más la fila de la misma toma, y eso ya está resuelto con la
  fila destacada. `uniqueTakes` es solo una defensa: no hace daño, pero su comentario («a cache patched twice may
  repeat one») describe algo que no pasa.

## Hallazgos

### 1 [8] En horizontal (el uso real con «pantalla grande») el escenario se queda en una tira de unos 150 px

`ReviewScreen.tsx:577` (cabecera), `:612` (relleno `p-2 sm:p-3`), `:686-716` (pie);
`ReviewControls.tsx:138-193` (barra de 40 px más la fila del reloj, `min-h-11`) y `:296` (transporte de 48 px).

No hay ninguna disposición para pantallas bajas: el `lg:grid` con el panel lateral solo entra a partir de 1024 px de
ancho, y un móvil girado sigue con la disposición vertical. Cuentas con las clases:

| Pantalla | Cabecera | Pie | Relleno | Escenario |
| --- | --- | --- | --- | --- |
| 844×390 (sin barras del navegador) | ≈ 56 | ≈ 161 (8 + 40 + 44 + 48 + 21 de zona segura; +24 con notas) | 24 (`sm:p-3`) | ≈ 149 px (125 con notas) |
| 667×375 | ≈ 56 | ≈ 148 | 24 | ≈ 147 px (123 con notas) |

En Safari con las barras visibles se queda en unos 90–100 px.

Con «Separados», `bestLayout` los pone uno al lado del otro:

- La toma vertical se ve de unos 84×149 px. Además, el reparto no baja del 30 %, así que su panel tiene 220 px de ancho
  con 135 px de bandas negras.
- YouTube se ve de unos 265×149, por debajo del mínimo de 200×200 px que exige YouTube para el reproductor
  incrustado.

La hoja de ajustes (`:678`, `max-h-[calc(100%-16px)]` del escenario) mide unos 157 px de alto y tapa todo el
escenario, YouTube incluido. Es una regresión respecto a antes: el pie no tenía la fila del reloj de 44 px ni el
relleno del escenario.

**Arreglo:** una disposición `[@media(max-height:500px)]`:
- Cabecera de 44 px, sin la línea de nombre y fecha.
- Pie de una sola fila: reloj, barra de tiempo, A–B, ‹ ▶ ›, sonido y ajustes. El tramo A–B y «Nota» pueden ir a los
  ajustes.
- Escenario sin relleno.
- Ajustes como hoja lateral derecha, a toda la altura y fuera del escenario.

Con eso el escenario pasa de 260 px a 390. Otra opción: una «vista grande» como la pantalla completa del estudio
(solo el vídeo, con las acciones abajo y ocultables).

### 2 [6] «Atrás» con los ajustes abiertos cierra el repaso entero

`ReviewScreen.tsx:400-403`.

Hay dos `useBackToClose` a la vez, el de la pantalla y el de la hoja. `popstate` llega a los dos escuchadores
(`useBackToClose.ts:56-67`). El de la pantalla no está «busy», porque `busy` solo mira el redactor de notas y guardar
clip, así que llama a `onClose` y se cierra el repaso. Su entrada se queda además en el historial: el siguiente
«Atrás» no hace nada visible.

Lo mismo pasa con una nota abierta (`TakeNoteCard`), que ni siquiera tiene su propia entrada.

El comentario de la línea 401 promete lo contrario. El encargo pedía expresamente que Atrás cerrara la hoja.

**Arreglo:** `useBackToClose(true, close, composer != null || savingClip || settingsOpen)`, como ya se hace con el
redactor. Y, si se quiere que «Atrás» cierre la nota, un `useBackToClose(openNoteId != null, …)` con la nota también
en el `busy` de la pantalla.

### 3 [5] YouTube puede quedar por debajo de 200×200 también en vertical

`reviewRules.ts:318` (`bestLayout`) y `CompareStage.tsx:169`.

El reparto maximiza el área de la imagen más pequeña y no conoce el mínimo de YouTube. A 390 de ancho con Safari
mostrando barras (unos 664 px visibles), el escenario mide unos 418 px de alto. El reparto «mejor» da a YouTube unos
153 px de alto (272×153) para dejar más sitio a la toma. Y el usuario puede arrastrar la bisagra hasta el 30 %, lo
que lo deja todavía más pequeño.

**Arreglo:** pasar a `bestLayout` un mínimo para el segundo panel cuando es YouTube (200 px en la dimensión corta) y
sujetar la bisagra a ese mínimo. Si no cabe, avisar o dar prioridad a YouTube.

### 4 [5] Con YouTube, cada vuelta del tramo A–B (y cada play) acaba en un salto visible

`ReviewMedia.tsx:362-364` y `:371-376`, `store.ts:714` y `:790-795`.

Al dar la vuelta, `s.seek(loop.start)` llama a `alignOriginal`, que manda a YouTube a su objetivo exacto, sin
adelantarlo lo que tarda en saltar. Así que YouTube aterriza unos 150–400 ms tarde. Además, el reloj interpreta esa
recolocación del store como «empezar de cero» (`memory = FRESH_SYNC`, racha a 0). En cuanto el original vuelve a
reproducirse y se pasa el enfriamiento de 2 s, salta otra vez por detrás de 0,2 s. En un tramo de 2–4 s eso es un
salto en cada vuelta, sin espaciarse nunca, porque la racha vuelve a 0 en cada vuelta.

Al reanudar desde la pausa pasa lo mismo: YouTube tarda en arrancar y la toma no. Si el retraso pasa de 200 ms, hay
un salto poco después de empezar.

**Arreglo:**
- En las recolocaciones del store mientras se reproduce (vuelta del tramo, seek), mandar a YouTube a
  `seekAhead(target, latencia)` con `{ loop: true }`, como hace el estudio con `wrapLead`.
- No reiniciar la racha en las vueltas del tramo.
- Al reanudar YouTube, plantearse un `seekAhead` previo con la latencia de arranque medida.

### 5 [4] La latencia de YouTube se mide con un `jumpAt` que puede ser viejo

`ReviewMedia.tsx:231-234` y `:274-278`.

`jumpAt` se marca en cada salto y al empezar a reproducir, y se mide en el siguiente `PLAYING`, venga de donde venga.
Hay dos casos que lo falsean:

- **Un salto sin cambio de estado.** Un salto dentro de lo ya cargado puede no pasar por `BUFFERING`/`PLAYING`.
  Entonces el `PLAYING` que llega después de una espera (`hold`), de una espera de datos de la toma o de una pausa
  mide segundos. La muestra se recorta a 3 s, pero aun así `blendLatency` sube a 1–1,4 s.
- **La puesta en marcha.** El arranque de YouTube (300–800 ms en móvil) se mide como si fuera un salto.

Con la latencia inflada, el siguiente salto cae muy por delante (hasta 1,5 s). Eso provoca una espera larga y otro
salto: un vaivén, aunque se vaya espaciando.

**Arreglo:**
- Medir solo los `PLAYING` que vienen después de un `BUFFERING` posterior al salto, y borrar `jumpAt` al empezar una
  espera, en `pause` y pasados unos 3 s.
- Guardar por separado la latencia de arranque y la de salto.

### 6 [4] Si `play()` de la toma falla, la interfaz dice que se reproduce y no suena nada

`player/engine.ts:145` (`el.play().catch(() => undefined)`) y `store.ts:681`.

`playing: true` se pone antes de saber si la toma arranca. Un rechazo (`NotAllowedError` o `NotSupportedError`) se
traga sin más. Esto pasa, por ejemplo, con un toque sobre el escenario ampliado, que llama a `onTap` desde un
`setTimeout` de 300 ms (`CompareStage.tsx:299`), fuera del gesto, en un iPhone que aún no ha reproducido la toma.
El original sigue andando (en silencio), la toma se queda quieta, el botón muestra pausa y el reloj corrige el original
contra una toma parada.

**Arreglo:** que el motor del repaso devuelva la promesa y, si se rechaza, se llame a `pause()` y se avise («Toca ▶ para
reproducir»). Y no aplazar el primer play fuera del gesto.

### 7 [4] El repaso en otro móvil usa otro «segundo 0» de la toma

`ReviewScreen.tsx:164-178` y `reviewRules.ts:103`.

`takeSongZero` solo se aplica en el móvil que grabó la toma (`meta.sync` está en OPFS). En cualquier otro móvil, con
la copia de la nube, se usa `song_start_seconds`. La diferencia (`songAtRoll − velocidad × retraso − song_start`) puede
ser de décimas. Además, «Ajuste fino» se guarda en la fila (`sync_adjust_seconds`) calibrado sobre el cero corregido,
así que, en otro móvil, el ajuste que dejó a punto quien grabó lo desajusta. Lo mismo pasa con las notas
(`take_seconds` frente a `at_seconds`) y con los clips dentro de la toma.

**Arreglo:** guardar el cero corregido en la fila al guardar la toma (en el grabador: `song_start_seconds =
takeSongZero(...)`) o en una columna propia, y que el repaso lo lea de la fila en todos los móviles. Este hallazgo toca
el punto 43.

### 8 [3] Arrastrar la bisagra repinta todo el repaso y cambia el tamaño de los vídeos en cada movimiento

`CompareStage.tsx:564-568` y `ReviewScreen.tsx:618`.

`onChange` llama a `setSplit` de `ReviewScreen` en cada `pointermove`, lo que repinta la pantalla entera (barra,
transporte, notas…). Cada caja cambia `left/top/width/height`, así que hay maquetación por fotograma y el iframe de
YouTube se redimensiona en cada movimiento. En un móvil eso da tirones.

**Arreglo:** llevar el reparto en un estado local de `CompareStage` (o en un ref con rAF) mientras se arrastra, y avisar
al soltar.

### 9 [3] Hoja de ajustes: el foco no entra ni vuelve, y en horizontal se mete bajo la muesca

`ReviewScreen.tsx:670-683`.

- Al abrirla, el foco se queda en el botón de ajustes, y la hoja está antes en el DOM, así que con Tab no se llega a
  ella sin dar la vuelta a toda la pantalla.
- Al cerrarla con su X, el foco se pierde en `body`.
- Es un `region` con el mismo nombre que el `aside`.
- `inset-x-2` es relativo al contenedor del escenario, sin `safe-area-inset-left/right`: en horizontal con muesca, el
  borde izquierdo queda debajo.
- Mientras se reproduce tapa el panel de YouTube.

**Arreglo:** enfocar el título de la hoja al abrir y devolver el foco al botón al cerrar. Usar los insets de zona
segura, y en horizontal, la hoja lateral del hallazgo 1. En vertical, que no tape la caja de YouTube o que pause
mientras está abierta.

### 10 [3] Con «Se oye: el original» (archivo), el sonido oscila de velocidad

`reviewRules.ts:271-274` y `ReviewMedia.tsx:396-401`.

Los pequeños ajustes de velocidad del ±6 % cambian `playbackRate` en cada fotograma mientras dura el desfase. Silenciado
no se nota, pero si el original es el que suena se oye que el tempo varía, y Safari puede meter cortes. El comentario
`maxNudge` («not heard on a muted original») lo da por hecho, pero no siempre está silenciado.

**Arreglo:** cuando suena el original, que el reloj sea el original y que la toma lo siga, o limitar los ajustes a
saltos de velocidad cada pocos cientos de ms.

### 11 [2] `keepTake` se usa para leer y reescribe `meta.json`

`ReviewScreen.tsx:168`.

`setKept(id, true)` lee, mezcla y escribe el archivo entero. Es seguro: una toma `where === 'here'` ya tiene
`kept: true`, un JSON roto hace que `readMeta` lance y no se escribe nada, y `createWritable` cambia el archivo de una
vez al cerrar. Aun así, es una escritura innecesaria en cada repaso. En Safari, si la escritura falla, la corrección se
pierde sin aviso.

**Arreglo:** exportar un `readTakeMeta(id)` de solo lectura.

### 12 [2] Restos

- `DateFilter`, `filter.date` y `startOfDay`/`startOfWeek` en `filterTakes`/`isFiltered`/`NO_FILTER`
  (`takeRules.ts:82-130`) ya no tienen interfaz.
- `followCorrection` (`packages/shared/src/review.ts:46`) ya no se usa en la app.
- `player/store.ts:11` importa de `features/review/reviewRules`: el reproductor pasa a depender de una función de la
  app. Mejor mover `needsAlignOnPlay` a `player/` o a `shared`.
- Transiciones sueltas: `{ duration: 0.15 }` en la salida de la hoja (`ReviewScreen.tsx:676`) y `duration-150/200` de
  CSS en `CompareStage`.
- Un color suelto: `rgb(124_156_196/0.35)` en `SoundPill` (`ReviewControls.tsx:223`) en vez del token `ai`.
- Los botones A/B/repetir miden 40 px de ancho (`ReviewControls.tsx:294`).

### 13 [2] Las pruebas no cubren el reloj

`reviewSync.test.ts` prueba bien `syncStep`: espera, ajuste de velocidad, salto, espaciado entre correcciones y vuelta
a empezar. Pero nada prueba `useReviewClock`, ni la medida de latencia, ni la vuelta del tramo con YouTube (hallazgos 4
y 5), que es donde están los fallos.

**Arreglo:** una prueba con motores falsos que dé la vuelta a un tramo de 3 s varias veces y cuente los saltos.

## Pendiente de comprobar en un móvil real

- Play con YouTube y con archivo, en iPhone y Android, a 844×390 y 667×375.
- Con YouTube, cuántos saltos en un tramo de 3 s durante 30 s.
- Que el panel de YouTube nunca baje de 200×200.
