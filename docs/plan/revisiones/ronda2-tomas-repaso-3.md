# Revisión · Ronda 2 de la prueba manual · puntos 50 (Tomas) y 51 (Repaso / comparar) · ronda 3 (última)

## Alcance

Revisión de solo lectura de la copia de trabajo sin commit (`feat/plan-completo`) después de los arreglos de la
ronda 2 (`ronda2-tomas-repaso-2.md`). Ya no había agentes editando. Archivos:

- `lib/backLayers.ts` (nuevo), `lib/backLayers.test.ts` (nuevo), `lib/useBackToClose.ts` y todos sus usos:
  `components/ui/Dialog.tsx`, `components/AppShell.tsx` (menú del móvil), `features/nav/QuickNav.tsx` y
  `quickNavCore.tsx`, `features/wishes/ActionMenu.tsx`, `features/rpd/RpdPlayPage.tsx` con `useHistorySettled.ts` y
  `roundRules.ts`, `features/record/RecordStudio.tsx` (con sus `popstate` propios), `features/studio/StudioPage.tsx`
  (menú de velocidad y pantalla completa por CSS), `Transport.tsx`, `FsVoiceButton.tsx`, `features/review/ReviewScreen.tsx`,
  `main.tsx` (actualización en `popstate`). También todos los `navigate(…)` y `<Link>` que se lanzan con una capa abierta.
- `features/review/`: `ReviewScreen.tsx`, `ReviewControls.tsx`, `CompareStage.tsx`, `ReviewMedia.tsx`, `reviewRules.ts`
  (`sideSheet`, `bottomSheetHeight`, `YOUTUBE_MIN_BOX`, `seekAhead`, `syncStep`), `TakeNoteCard.tsx`,
  `reviewSync.test.ts`; `player/store.ts` (`useReview`), `player/reviewAlign.ts`.
- `features/takes/takeRules.ts` (`takeSongZero`, `SONG_ZERO_MAX_SHIFT`), `data/takes.ts`, `features/takes/TakesPanel.tsx`.

Cómo he simulado Atrás y Esc: además de leer el código, he copiado `backLayers.ts` tal cual a un directorio temporal
(fuera del repositorio) y lo he ejecutado con Node contra un historial falso en el que `go()` aterriza más tarde, como
en un navegador. Escenarios: una capa; dos capas; cerrar con botón; cerrar tres a la vez; cerrar una y abrir otra en el
mismo render; abrir y cerrar una capa dentro de la espera; Atrás del usuario durante la espera (antes y después de
nuestro `go`); `popstate` que tarda más de 400 ms; recarga con entradas viejas; `navigate` (push) con un diálogo abierto;
cerrar la capa de abajo con la de encima abierta; `ownHistoryBack` (RPD) sobre una capa viva. Las medidas salen de las
clases y de `sideSheet`/`bestLayout` con los números de la ronda 2 (844×390 con zona segura 47/47 y 21 abajo; 667×375
sin zona segura; barras de Safari: escenario ≈ 263 y ≈ 230 px de alto en horizontal, ≈ 664 px visibles en vertical).

## Qué he ejecutado y resultado

- `pnpm typecheck`: correcto (shared y web).
- `pnpm test`: correcto. shared 7 ficheros / 139 pruebas; web 54 ficheros / 729 pruebas (incluye las 8 nuevas de
  `backLayers.test.ts`).
- No he ejecutado `pnpm db:test`: esta zona no toca el esquema.

## Hallazgos de la ronda 2 (≥ 3) → estado

| # | Nota | Hallazgo | Estado |
| --- | --- | --- | --- |
| 1 | 6 | Después de recargar, Atrás dejaba de cerrar las capas | **Arreglado.** Cada entrada lleva `backToCloseLoad` (un id de carga) y `currentId()` solo reconoce las de esta carga; hay prueba. Simulado: con la entrada vieja `{7, carga vieja}` debajo, Atrás cierra el repaso a la primera. Queda la propia entrada vieja como un Atrás sin efecto al final (nuevo 12, nota 2). |
| 2 | 5 | Con los ajustes abiertos y YouTube, la toma se quedaba en nada | **Arreglado en los tamaños:** `sideSheet` y `bottomSheetHeight` reservan YouTube 358×202 y una toma de ≥ 120 px de alto (tabla abajo), y en vertical el pie con ▶ sigue debajo de la hoja. Pero la hoja lateral se queda en 220 px y sus propios controles ya no caben (nuevo 1). |
| 3 | 4 | Cerrar una capa y abrir otra a la vez dejaba un Atrás que no hacía nada | **Arreglado:** con un `back()` propio en camino (o un cierre en cola), la capa nueva espera a su `popstate` (como mucho 400 ms) antes de empujar su entrada. Simulado: guardar una nota nueva deja `[repaso, nota]`; abrir y cerrar una capa dentro de la espera no deja nada; Atrás del usuario durante la espera cierra la capa nueva, que es la que se ve. Quedan dos carreras raras (nuevo 11). |
| 4 | 4 | Cerrar el repaso con su X con los ajustes o una nota abiertos dejaba una entrada | **Arreglado:** las capas que se cierran en el mismo momento se juntan en una microtarea y retroceden una sola vez con `go(-n)`; simulado con repaso + ajustes + nota: no queda nada. Queda el caso de cerrar la capa de abajo con la de encima abierta (nuevo 3). |
| 5 | 4 | En horizontal, tocar el rombo de una nota movía el tiempo | **Arreglado** en lo pedido: los rombos ya no son hijos del deslizador, sino hermanos encima de él, y su `pointerdown` no llega a la barra. Pero sus 44 px tapan la propia línea (nuevo 5). |
| 6 | 3 | El mínimo de YouTube no contaba el borde: 352×198 | **Arreglado:** `YOUTUBE_MIN_BOX = 358×202`, y el reproductor queda en 356×200 dentro del panel. En móviles de 360 px de ancho en vertical no se llega (nuevo 10). |
| 7 | 3 | Saltos del store con YouTube sonando caían tarde; «Sincronía» saltaba en cada movimiento | **Arreglado:** el `seek` envuelto de YouTube salta por delante (`seekAhead` con la latencia medida) si suena, y «Sincronía» solo cambia el `timing` mientras se arrastra y recoloca al soltar. Quedan un salto que se pierde justo después de ▶ (nuevo 8) y un soltar que no se detecta (nuevo 9). |
| 8 | 3 | Al arrancar, el `playing` de la toma provocaba un segundo `seekTo` | **Arreglado:** `starting()` (un arranque de hace menos de 1,5 s) evita el segundo salto. Por cada ▶ desde pausa: un `seekTo` adelantado y `playVideo` (el `alignOriginal` de `play()` queda en `deferred` y no salta). |
| 9 | 3 | Con el original como sonido, los saltos recaían en lo que se oye; YouTube atascado sin aviso | **Arreglado en lo principal:** con «el original», lo que salta es la toma (`takeSeek`, archivo y YouTube) y lo que cambia de velocidad es la toma; YouTube ya no se pausa ni salta por el seguimiento; si YouTube no está en `PLAYING` a los 3,5 s, se pausa y avisa «YouTube no ha arrancado: toca ▶ otra vez para seguir.». Pero cada salto de la toma la hace esperar datos, y esa espera pausa el original que suena (nuevo 6). |
| 10 | 3 | En horizontal, la tarjeta de la nota y su aviso quedaban encima de YouTube | **Arreglado en la colocación:** con YouTube, la tarjeta y el aviso van dentro del panel de la toma (`takeRect`). Pero en horizontal ese panel mide 79–178 px de ancho y la tarjeta queda ilegible (nuevo 2). |

Los de nota < 3 de la ronda 2: el 11 (orden de Esc) está **arreglado** (`openedOrder`: Esc cierra lo último que se
abrió, como Atrás); el 12 está **arreglado** («desde» redondea el cero corregido; `SONG_ZERO_MAX_SHIFT = 2` con pruebas
en el límite, 1,9 s sí y 4 s no); el 13 está **arreglado** («Repasar con el original: toma de …»); el 14 (pruebas),
**parcial**: `backLayers` ya tiene pruebas; siguen sin probarse que `useSaveTake` envíe el cero corregido una sola vez y
el reloj del repaso (`useReviewClock`, `wrapLoop`, latencias).

Punto 50 (panel de tomas): sin regresiones.

### Medidas (YouTube, toma vertical 9:16, «Separados»)

| Pantalla | Ajustes | Escenario | Toma (panel → imagen) | YouTube (reproductor) | Ancho útil de la hoja |
| --- | --- | --- | --- | --- | --- |
| 844×390 horizontal | cerrados | 750×313 | 178 → 176×313 | 556×313 | — |
| 844×390 horizontal | abiertos (hoja 220 + 47) | 530×313 | 162 → 162×288 | 356×200 | 204 px |
| 844×390 con barras de Safari | abiertos (hoja 234 + 47) | 516×263 | 148 → 148×263 | 356×200 | 218 px |
| 667×375 horizontal | cerrados | 667×319 | 180 → 179×319 | 475×267 | — |
| 667×375 horizontal | abiertos (hoja 220) | 447×319 | 79 → 79×140 | 356×200 | 188 px |
| 667×375 con barras de Safari | abiertos (hoja 220) | 447×230 | 79 → 79×140 | 356×200 | 188 px |
| 390×844 vertical, barras de Safari (≈ 664) | cerrados | 374×538 | 374×326 → 183×326 | 356×200 | — |
| 390×844 vertical, barras de Safari | abiertos (hoja 206 de alto) | 374×332 | 374×120 → 67×120 | 356×200 | 358 px |
| 390×844 vertical, sin barras | abiertos (hoja 305 de alto) | 374×332 | 374×120 → 67×120 | 356×200 | 358 px |

YouTube nunca queda por debajo de 200 de alto ni tapado por las hojas en estos tamaños. La hoja flotante sobre la toma
(`overlay`) solo aparece con escenarios de menos de ~655 px de ancho (p. ej., 640×360): allí mide 272 px y sus controles
caben mejor que en la hoja de al lado.

## Hallazgos nuevos

### 1 [6] La hoja lateral de 220 px no deja sitio a sus controles: «Sincronía» se queda en 4–34 px

`reviewRules.ts:424` (`SIDE_SHEET.min = 220`), `ReviewScreen.tsx:846` (ancho de la hoja) y `ReviewControls.tsx:495-511`
(`Range`: etiqueta `w-24` + valor `w-16` + dos huecos de 12 px = 184 px fijos).

En horizontal con YouTube, `sideSheet` da casi siempre el mínimo, 220 px. Quitando el relleno (`p-4` y, con muesca,
47 px de zona segura a la derecha), quedan 188 px (667×375), 204 px (844×390) o 218 px (844 con barras). Dentro:

- Cada `Range` necesita 184 px solo para la etiqueta y el valor. El deslizador queda en **4 px** a 667, **20 px** a 844 y
  **34 px** con barras. Pasa con «Sincronía» (el «Ajuste fino», que es justo lo que se abre para mirar los dos a la vez),
  con «Fina» (velocidad) y con «Transparencia».
- Los `Segmented` de tamaño normal no cortan línea: «Velocidad común» (0,5× · 0,75× · 1× · 1,25×) mide ~265 px,
  «Cómo comparar» ~230 y «Qué se oye» ~200. Se salen de la hoja, que hace scroll en horizontal.

Antes (ronda 2) la hoja medía `min(340px, 46vw)` (unos 307 px a 667) y los deslizadores tenían ~90 px. Es una regresión
del arreglo 2. Solo quedan los botones ±0,01: para mover 0,3 s hacen falta 30 toques, y con YouTube cada toque es un
`seekTo`.

**Arreglo:** en `compact`, poner la etiqueta y el valor del `Range` en una línea y el deslizador debajo, a todo el
ancho; los `Segmented` de la hoja en `size="sm"` y que puedan partir línea (o en rejilla). Una prueba visual o de clases
a 188 px. Otra opción es subir `SIDE_SHEET.min` a ~280 y dejar que `sideSheet` caiga antes en `overlay`, pero entonces
la toma queda tapada al ajustar.

### 2 [6] En horizontal con YouTube, la tarjeta de la nota mide 63–162 px de ancho y no se puede leer

`ReviewScreen.tsx:608` y `:646` (`noteArea = takeRect` con YouTube), `TakeNoteCard.tsx:60` (`inset-x-2`, `p-3.5`) y
`:62-72` (fila con la hora, el texto y la X).

La tarjeta va ahora dentro del panel de la toma, que en horizontal es estrecho: 178 px (844, ajustes cerrados), 162 px
(844, abiertos), 180 px (667, cerrados) y 79 px (667, abiertos). Restando `inset-x-2` y `p-3.5`, por dentro quedan 134,
118, 136 y **35 px**. En la primera fila van la hora (~52 px), la X (44 px, 38 efectivos) y dos huecos de 8 px. Para el
texto de la nota quedan unos 28 px (2–3 letras por línea a 15 px) en el mejor caso, y nada a 667 con los ajustes
abiertos: allí la X ni siquiera cabe. Los botones «Pendiente», «Editar» y «Borrar» van uno por línea y la tarjeta hace
scroll dentro de sus ~297 px. El responsable dijo que el vídeo en grande se ve con el móvil en horizontal, así que las
notas con YouTube no se pueden usar justo en el caso principal. El aviso «nota en este momento» cabe a duras penas
(máx. 154 px, dos líneas).

**Arreglo:** si el panel de la toma mide menos de ~260 px de ancho, sacar la tarjeta a la columna lateral, con la misma
lógica que los ajustes (`sideSheet`: al lado del escenario y nunca sobre YouTube; si están abiertos los ajustes, la nota
encima de ellos o en su lugar). Otra opción: una hoja baja sobre la barra. Una prueba con los rectángulos de la tabla.

### 3 [4] Cerrar la capa de abajo con la de encima abierta deja un Atrás que no hace nada (ajustes y nota del repaso)

`lib/backLayers.ts:86-104` (`flush` solo retrocede si las capas que se cierran están arriba del todo; si no, la entrada
de la capa cerrada queda debajo de la otra) y `:97` (se borra de `live`, así que nadie la reconoce después).

Simulado. En horizontal, con los ajustes abiertos, se toca un rombo y se abre la nota: `[repaso 1, ajustes 2, nota 3]`.
Se cierran los ajustes con su X, y la nota sigue. La entrada 2 se queda donde está. Atrás cierra la nota y deja el
historial en la entrada 2. El siguiente Atrás va a la 1: el repaso ve `1 ≥ 1` y no hace nada. Hace falta un tercer
Atrás para cerrar el repaso. Pasa lo mismo al revés (nota abierta → ajustes → se cierra la nota con su X). Es el orden
normal en horizontal.

**Arreglo:** no borrar de `live` la capa que se cierra por debajo: dejarla como «muerta». `flush` cuenta como suyas las
muertas que estén justo debajo de las que se cierran (`go(-n)` las salta todas). En el despachador, si un `popstate`
cae en una entrada de esta carga que es de una capa muerta, retroceder una más contándola como propia. Así también se
arregla el nuevo 4. Añadir las dos pruebas.

### 4 [4] Navegar con un diálogo abierto (push) deja la entrada del diálogo: un Atrás sin efecto en la página anterior

`features/wishes/PollFormDialog.tsx:113-114`, `features/events/EventFormDialog.tsx:61-62` → `EventsPage.tsx:97`,
`features/bags/BagSettingsDialog.tsx:177-178` → `BagsPage.tsx:87`, `features/library/AddVideoDialog.tsx:330`,
`features/bags/AddToBagDialog.tsx:184-186` (`<Link to="/bolsas" onClick={onClose}>`), `features/rpd/TrackPage.tsx:316`
(`SaveTrackDialog.onSaved`); `lib/backLayers.ts:100` (si arriba no está la entrada de la capa, no retrocede).

El router empuja la página nueva encima de la entrada del diálogo: `[lista, lista+diálogo, página nueva]`. Al cerrar, el
diálogo ve que arriba no está su entrada y la deja. Simulado: Atrás desde la página nueva vuelve a la lista (por la
entrada del diálogo) y el siguiente Atrás también cae en la lista, con la misma `key`, así que no se ve nada. Es un
Atrás que no hace nada después de crear una votación, un evento o una bolsa, de ir a una canción repetida desde
«Añadir vídeo», de «Ver bolsas» o de guardar una pista mezclada. Ya pasaba antes del hook nuevo, pero entra en lo que
pide el encargo. El menú rápido, el menú del móvil y `WishFormDialog` ya lo resuelven bien con `replace`.

**Arreglo:** en esos seis sitios, navegar con `{ replace: true }`. La página nueva ocupa la entrada del diálogo y Atrás
vuelve a la lista en un toque. Para que no vuelva a pasar, el despachador del nuevo 3 (saltar entradas de capas
muertas) lo cubre en general.

### 5 [4] Los rombos de las notas tapan la línea de tiempo: tocar cerca de una nota la abre en vez de mover el tiempo

`ReviewControls.tsx:209` (capa de rombos `absolute inset-x-0 top-0 h-3` sobre la pista de 40 px) y `:120` (cada rombo
es un botón de 44×44 centrado en y = 6 px).

En la barra de una fila, cada botón cubre de y = −16 a y = 28 px de la pista. La raya va en y = 16–24 y el pulgar en
y = 20, así que todo el tramo de la línea a ±22 px de una nota es del botón. Un toque ahí, o empezar a arrastrar el
pulgar cuando está cerca de una nota, abre la nota. A 667×375 con los ajustes abiertos, la pista mide ~120 px, y cada
nota se come el 37 % de la línea. Con tres notas casi no queda dónde arrastrar (solo la franja de abajo, de 12 px).

**Arreglo:** que los botones de los rombos queden por encima de la raya, por ejemplo 44 px de ancho por ~22 de alto,
de y = −18 a y = 4, sin tocar la franja de 12–40 px. Otra opción: que el deslizador abra la nota más cercana (±12 px)
con un toque sin movimiento al soltar, y que arrastre en los demás casos.

### 6 [4] Con «Se oye: el original», cada salto de la toma pausa un momento el original que suena

`ReviewMedia.tsx:118-121` (`onWaiting` de la toma pausa el original) y `:122-126` (`onPlaying` lo vuelve a poner);
`reviewRules.ts:257-266` (`takeSeek`).

El seguimiento ya no toca lo que se oye: salta la toma silenciada. Pero ese salto suele hacer que la toma espere datos
(siempre con la copia de la nube y a menudo con el archivo local). `waiting` llama a `originalEngine.pause()`, que es
justo el sonido que suena, y `playing` lo arranca de nuevo. Con YouTube, cada pausa y vuelta corta la música unos
300 ms y lo deja otra vez desfasado, con lo que viene otro `takeSeek`: puede entrar en bucle. Con el archivo, se oye
un corte en cada corrección. Es lo que pedía evitar el hallazgo 9 de la ronda 2.

**Arreglo:** en `onWaiting`/`onPlaying` de la toma, no pausar ni reanudar el original cuando `audio === 'original'`:
la toma se pone al día sola y el seguimiento la vuelve a cuadrar.

### 7 [3] En la pantalla completa por CSS (iPhone), Atrás saca de la canción

`features/studio/StudioPage.tsx:1126-1210` (`useFullscreen`: el modo `css` no tiene capa de Atrás; Esc sí lo cierra).

En el iPhone no hay Fullscreen API para un `div`, así que se usa la capa CSS. El gesto de volver desde el borde, o Atrás
en Android si cae en este modo, sale de `/v/…` en vez de salir de la pantalla completa. El comentario del menú de
velocidad (`:1628`) ya lo da por hecho. Va contra «que no haya Atrás que saque de la página», y Esc y Atrás hacen cosas
distintas.

**Arreglo:** `useBackToClose(mode === 'css', () => setMode('none'))` dentro de `useFullscreen`. El menú de velocidad y
los popovers ya van encima como capas propias, así que el orden sale solo.

### 8 [3] Un salto del store en el primer segundo y medio después de ▶ no llega a YouTube

`ReviewMedia.tsx:383-386` (`seek` envuelto: si `starting()`, marca `deferred` y no salta) y `:364-372` (el siguiente
`play()` también cae en `starting()` y no salta).

Después de ▶, durante `YOUTUBE_STARTING_MS = 1500`, cualquier `seek` del store mientras suena se queda en
`deferred = true`: un toque en la línea, soltar el dedo, elegir un tramo o el «Sincronía» al soltar. Ese salto solo lo
aplica `play()` cuando ya no está arrancando o `resume()` después de una espera. El `playing` de la toma, que llega
justo entonces, entra en `starting()` y se lo salta. YouTube sigue desde el punto viejo hasta que el seguimiento salta
por su cuenta (tras su `settle` y su espera), unos segundos con los dos desfasados por todo lo que se saltó.

**Arreglo:** guardar el destino en `deferred` (o leer `originalTarget()`) y, cuando llegue el `PLAYING` del arranque
(`onStateChange`, con `startAt`), aplicarlo con `seekAhead` si el desfase pasa de ~0,25 s.

### 9 [3] «Sincronía» solo se aplica con `pointerup`: si el gesto se cancela, el original queda donde estaba

`ReviewControls.tsx:506-507` (`onPointerUp`/`onKeyUp` → `onCommit`) y `ReviewScreen.tsx:208-217`.

Mientras se arrastra, solo cambia el `timing`. El original se recoloca al soltar. Pero:
- Si el navegador cancela el gesto, no llega `pointerup` y no se recoloca. Pasa con `pointercancel`, por ejemplo
  cuando la hoja con `overflow-y-auto` toma el gesto como scroll, o con el ratón soltado fuera del control.
- Con YouTube, un cambio de menos de 0,25 s tampoco se corrige al dar a ▶ (`needsAlignOnPlay`) ni lo arregla el
  seguimiento (por debajo de `holdOver`). El original queda corrido justo lo que se quiso ajustar, sin ninguna señal.
- Además, cada toque de ±0,01 es un `seekTo` con YouTube sonando, y cada uno lo hace cargar otra vez.

**Arreglo:** hacer el `commit` también en `onPointerCancel`, en `onLostPointerCapture` y en el evento nativo `change`
(llega al soltar). Agrupar los toques de ±0,01 con un aplazamiento de ~300 ms antes de recolocar.

### 10 [3] En móviles de 360 px de ancho en vertical, YouTube no llega a 200 px de alto

`ReviewScreen.tsx:616` (`p-2`, 8 px a cada lado del escenario en vertical) y `reviewRules.ts:313`.

En vertical, el panel de YouTube ocupa todo el ancho del escenario: 360 − 16 = 344 px. Por dentro quedan 342 px, y en
16:9 eso da 342×192. `bestLayout` no encuentra ningún reparto que cumpla y se queda con el más cercano. Pasa en muchos
Android (360 y 384 px), con los ajustes abiertos o cerrados. Con 375 px (iPhone SE) cumple justo.

**Arreglo:** en vertical con YouTube, quitar el relleno lateral del escenario (`px-0`, respetando la zona segura). Con
360 px quedan 358 por dentro, es decir, 358×201. Una prueba de `bestLayout` con 360 de ancho.

### 11 [2] Dos carreras de la espera de 400 ms

`lib/backLayers.ts:143-146` (`setTimeout(waiter, SETTLE_MS)`) y `:72-74` (`swallowed = ownPops > 0`).

- Si nuestro `popstate` tarda más de 400 ms (un iPhone muy ocupado mientras carga el repaso o el grabador), la capa
  nueva empuja encima de la entrada que se iba a quitar. Cuando por fin aterriza el `go(-1)`, la capa nueva vuelve a
  empujar la suya y la entrada vieja queda debajo: un Atrás sin efecto. Lo he simulado.
- Si el usuario pulsa Atrás justo antes de que salga nuestro `go(-1)` (cerrar con botón y Atrás en el mismo instante),
  su `popstate` se toma como nuestro y el nuestro como suyo: se cierra la capa que se acababa de abrir.

Las dos son raras. **Arreglo:** el mismo despachador del nuevo 3, que salta entradas muertas, cubre la primera.

### 12 [2] Después de una recarga, la entrada vieja sigue siendo un Atrás sin efecto; `useHistorySettled` toma por viejas las capas vivas

`lib/backLayers.ts:58-61`; `features/rpd/roundRules.ts:143-145` (`isLayerEntry` no distingue la carga ni si la capa
está viva).

- La entrada de la carga anterior ya no bloquea nada, pero sigue en el historial. Al final hace falta un Atrás de más,
  que no hace nada. Solo la ronda de RPD la salta.
- `isLayerEntry` ve como «sobrante» también la entrada de una capa que está abierta. Si `useHistorySettled` se activa
  con una capa abierta, retrocede hasta 3 veces (cada vez la capa se vuelve a marcar) y luego empuja la guarda encima.
  Atrás va entonces a la guarda, no a la capa que se ve. En la ronda hoy no hay ninguna capa que se pueda abrir antes,
  así que no se da.

**Arreglo:** que `backLayers` exponga `isStaleEntry()` (de otra carga, o de esta pero de una capa que ya no vive) y
usarlo en `useHistorySettled`. Al arrancar, si la entrada actual es de otra carga, retroceder una vez contándolo como
propio.

### 13 [2] «YouTube no ha arrancado» también salta cuando solo está cargando

`ReviewMedia.tsx:313-320`.

A los 3,5 s se comprueba `getPlayerState() === PLAYING`. Con mala conexión, `BUFFERING` también cuenta como «no ha
arrancado»: se pausa y se pide «toca ▶ otra vez», con lo que vuelve a cargar desde cero. **Arreglo:** con `BUFFERING`,
esperar otro tramo (hasta ~8 s) antes de avisar.

### 14 [2] El aviso de error y los toasts largos pueden quedar encima de YouTube en horizontal

`ReviewScreen.tsx:674` (`role="alert"`, `absolute inset-x-3 bottom-3 … max-w-md`, centrado en el escenario) y el
contenedor de toasts (abajo y centrado, `z-[100]`).

Con un error de la toma, el aviso cae sobre YouTube, que sigue funcionando. Un toast de dos o tres líneas («YouTube no
admite esa velocidad…») sube por encima de la barra unos 10–20 px y pisa el borde de abajo del reproductor.
**Arreglo:** el error de la toma, dentro de `takeRect`, como la nota. Los toasts del repaso, por encima de la barra pero
sin entrar en el escenario, o arriba sobre el panel de la toma.

### 15 [2] Pruebas

- A `backLayers.test.ts` le faltan los casos de los nuevos 3, 4 y 11: capa que se cierra debajo de otra, `pushState`
  del router encima de una capa y `popstate` que llega después de la espera.
- Sigue sin haber pruebas de que `useSaveTake` envíe el cero corregido una sola vez, ni del reloj del repaso
  (`useReviewClock`, `wrapLoop`, `deferred`/`starting()` del YouTube envuelto).

## Pendiente de comprobar en un móvil real

- 667×375 y 844×390 con YouTube: abrir los ajustes y mover «Sincronía» (nuevo 1); abrir una nota (nuevo 2).
- Repaso en horizontal: nota abierta + ajustes, cerrar uno con su X y contar los Atrás (nuevo 3).
- Crear una bolsa o una votación y volver con Atrás dos veces (nuevo 4).
- Con «Se oye: el original» y una toma de la nube: si la música se corta en cada corrección (nuevo 6).
- iPhone en pantalla completa: el gesto de volver desde el borde (nuevo 7).
- Android de 360 px en vertical con YouTube: alto real del reproductor (nuevo 10).
- iPhone con «el original» y YouTube: si `playVideo()` arranca con sonido sin tocar el iframe (es `pointer-events:none`).
  Si no arranca, el aviso del nuevo 13 se repetiría cada vez que se pulse ▶.
