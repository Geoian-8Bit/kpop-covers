# Revisión · Ronda 2 de la prueba manual · puntos 50 (Tomas) y 51 (Repaso / comparar) · ronda 2

## Alcance

Revisión de solo lectura de la copia de trabajo sin commit (`feat/plan-completo`) después de los arreglos de la
ronda 1 (`ronda2-tomas-repaso-1.md`). Ya no había agentes editando. Archivos:

- `lib/useBackToClose.ts` (cambiado: una capa de encima hace que la de abajo no actúe ni duplique su entrada) y
  **todos** sus usos: `components/ui/Dialog.tsx` (todos los diálogos), `components/AppShell.tsx`,
  `features/wishes/ActionMenu.tsx`, `features/nav/QuickNav.tsx` y `quickNavCore.tsx`, `features/rpd/RpdPlayPage.tsx`
  con `useHistorySettled.ts`/`roundRules.ts`, `features/record/RecordStudio.tsx` (con sus `popstate` propios),
  `features/studio/StudioPage.tsx`, `Transport.tsx` (`Popover`), `FsVoiceButton.tsx` y `features/review/ReviewScreen.tsx`.
- `data/takes.ts` (`useSaveTake` con `takeSongZero`), `features/takes/takeRules.ts`, `features/record/takeStore.ts`
  (`meta.sync`), `RecordStudio.tsx` (dónde nace `songAtRoll` y qué `songStart` se pasa), y todos los lectores de
  `song_start_seconds` (`takeTiming`, `clipsInTake`, notas, `TakesPanel`).
- `features/review/`: `ReviewScreen.tsx`, `ReviewControls.tsx`, `CompareStage.tsx`, `ReviewMedia.tsx`,
  `reviewRules.ts`, `TakeNoteCard.tsx`, `reviewSync.test.ts`; `player/store.ts` (`useReview`), `player/reviewAlign.ts`.
- `features/takes/TakesPanel.tsx` (punto 50) y `takeListing.test.ts`.

Dato del responsable: «cuando vemos el vídeo en pantalla grande el móvil está en horizontal». He medido sobre todo a
844×390 y 667×375 en horizontal, con y sin barras de Safari, a partir de las clases (sin navegador). Las simulaciones
de Atrás/Esc están hechas a mano sobre el código del hook (pila de entradas y orden de los escuchadores).

## Qué he ejecutado y resultado

- `pnpm typecheck`: correcto (shared y web).
- `pnpm test`: correcto. shared 7 ficheros / 139 pruebas; web 53 ficheros / 714 pruebas.
- No he ejecutado `pnpm db:test`: esta zona no toca el esquema.

## Hallazgos de la ronda 1 (≥ 3) → estado

| # | Nota | Hallazgo | Estado |
| --- | --- | --- | --- |
| 1 | 8 | En horizontal el escenario se quedaba en una tira de ~150 px | **Arreglado.** `(max-height: 520px)` quita la cabecera, deja una sola fila de 56 px (+ zona segura) y quita el relleno. Escenario: 844×390 → 750×313 (toma 176×313, YouTube 556×313); 667×375 → 667×319; con barras de Safari ≈ 263 y ≈ 230 px de alto. A–B, fotogramas, «Nota» y «Cómo comparar» pasan a los ajustes, que van en hoja lateral. Queda un caso: con los ajustes abiertos en 667 de ancho (hallazgo nuevo 2). |
| 2 | 6 | Atrás con los ajustes abiertos cerraba el repaso entero | **Arreglado** por el cambio del hook: con una capa encima, la de abajo ve que su entrada sigue (`stillOurs`) y no actúa. La nota tiene ya su propia entrada. Simulado: ajustes, nota, ajustes + nota, redactor sobre nota, «Guardar clip» y «¿Quién eres?» sobre el repaso: cada Atrás cierra solo la de encima. Quedan entradas sobrantes al cerrar con botón (nuevos 3 y 4). |
| 3 | 5 | YouTube por debajo de 200×200 en vertical; la bisagra podía achicarlo | **Arreglado** en lo principal: `bestLayout` y `splitBounds` reciben `YOUTUBE_MIN_BOX` y la bisagra se sujeta a ese mínimo. Faltan el borde de 1 px del panel (nuevo 6) y el caso de los ajustes abiertos (nuevo 2). |
| 4 | 5 | Con YouTube, cada vuelta del tramo A–B y cada play acababa en un salto | **Arreglado** en vuelta y reanudar: `wrapLoop` adelanta YouTube lo que tardan sus saltos y no reinicia la racha; al reanudar desde pausa salta por delante lo que tarda en arrancar. **Pendiente** la parte de «recolocaciones del store mientras se reproduce» (nuevo 7). |
| 5 | 4 | La latencia de YouTube se medía con un `jumpAt` viejo | **Arreglado:** arranque y salto se miden por separado; un salto solo cuenta si pasó por `BUFFERING`; las marcas caducan a los 3 s y se borran en pausa y fin. Queda una carrera al arrancar (nuevo 8). |
| 6 | 4 | Si `play()` de la toma fallaba, la interfaz decía «reproduciendo» en silencio | **Arreglado:** el motor de la toma vigila la promesa; si se rechaza (no `AbortError`), pausa los dos y avisa «El móvil no dejó empezar la toma: toca ▶ para reproducirla.». Con zoom, el play ya no se aplaza fuera del toque (solo la pausa). Queda el caso de YouTube, que no se vigila (nuevo 9). |
| 7 | 4 | El repaso en otro móvil usaba otro «segundo 0» | **Arreglado:** `useSaveTake` guarda `takeSongZero(planeado, meta.sync)` en `song_start_seconds` y el repaso solo lee la fila. Comprobado que no se aplica dos veces: hay un único camino de alta (`useSaveTake` → `takeRow` → `insertTake`); `vars.songStart` sale siempre de `takeTiming.current.songStart` = `songSpan().start` (lo planeado), también en tomas recuperadas; un reintento repite el mismo cálculo y un duplicado devuelve la fila ya guardada; `ReviewScreen` ya no aplica la corrección (no queda ningún otro uso de `takeSongZero`). Clips en la toma, notas (`at_seconds`) y «Guardar como clip» usan el mismo `timing`, así que cuadran entre sí. Detalles en el nuevo 12. |
| 8 | 3 | Arrastrar la bisagra repintaba todo y redimensionaba los vídeos en cada movimiento | **Arreglado:** durante el arrastre solo se mueve la bisagra con `transform`; el reparto se aplica una vez al soltar (`pointercancel` lo descarta). |
| 9 | 3 | Hoja de ajustes: foco, nombre, muesca, tapaba YouTube | **Arreglado:** el foco entra en el título al abrir y vuelve al botón al cerrar; la hoja va después del escenario en el DOM; un solo `region` a la vez; insets de zona segura; ya no tapa el escenario (va debajo en vertical y al lado en horizontal). Pero ahora estrecha el escenario (nuevo 2). |
| 10 | 3 | Con «Se oye: el original» (archivo) el tempo oscilaba | **Arreglado** para los ajustes pequeños: se ajusta la velocidad de la toma silenciada (`takeRate`). Los saltos grandes y YouTube siguen tocando el sonido que se oye (nuevo 9). |

Punto 50 (panel de tomas): sin regresiones. Cada toma sale una vez; la de «Repaso» va primera, resaltada, con
«Repasar con el original», y no se repite; sin filtros de fecha; «Nube del grupo» solo con ≥ 80 %; el uso pasa a la
hoja «Compartir»; nota de cada toma con su contador; acciones de 44 px. Un detalle de accesibilidad en el nuevo 13.

## Hallazgos nuevos

### 1 [6] `useBackToClose`: después de recargar, Atrás deja de cerrar las capas

`lib/useBackToClose.ts:3` (`let nextId = 1`) y `:58-64` (`stillOurs`: `current >= id`).

Los ids vuelven a empezar en 1 en cada carga, pero las entradas del historial sobreviven a la recarga con su
`backToClose`. El hook nuevo decide «la entrada que se fue era de una capa de encima» comparando ids, así que una
entrada vieja con id alto parece siempre «de encima».

Escenario: en el iPhone, con el repaso abierto, se cambia de app y Safari descarta la pestaña. Al volver, la página
se recarga en la entrada vieja del repaso (`backToClose: 7`). Se abre «Repaso» otra vez (id 1): `[estudio, viejo 7,
repaso 1]`. Atrás va a la entrada 7: el repaso ve `7 ≥ 1` y no se cierra. Hace falta un segundo Atrás. Y pasa lo
mismo con cada capa que se abra en esa página (menú rápido, diálogos, ajustes…) hasta que los ids pasen de 7. Antes del
cambio esto cerraba bien (solo dejaba un Atrás de más al final). Solo la ronda de RPD limpia entradas viejas
(`useHistorySettled`). La app también se recarga sola al actualizarse (`main.tsx`).

**Arreglo:** que los ids no se repitan entre cargas (`let nextId = Date.now()`), o marcar cada entrada con un id de
carga (`{ backToClose: id, backToCloseLoad: LOAD }`) y que `stillOurs` exija que sea de esta carga. Añadir una prueba
del hook con un `history` falso: una y dos capas, cerrar con Atrás y con botón, y una entrada vieja de otra carga.

### 2 [5] Con los ajustes abiertos y YouTube, la toma se queda en nada (y YouTube baja de 200 px en 667×375)

`ReviewScreen.tsx:774` (`w-[min(340px,46vw)]` de la hoja lateral), `:726` (`max-h-[58%]` de la hoja de abajo) y
`reviewRules.ts:395` (si no cabe, se elige el reparto «más cercano»).

Ahora los ajustes no tapan nada, pero quitan sitio al escenario, y `bestLayout` da prioridad a YouTube:

| Pantalla, ajustes abiertos | Escenario | Toma | YouTube |
| --- | --- | --- | --- |
| 844×390 horizontal | 457×313 | 91×162 | 356×200 |
| 667×375 horizontal | 360×319 | ≈ 61×109 | 356×200 |
| 667×375 horizontal con barras de Safari | 360×≈230 | ≈ 18×33 | ≈ 332×187 (por debajo del mínimo) |
| 390×844 vertical con barras de Safari (≈ 664 visibles) | 374×≈241 | ≈ 17×31 | 356×200 |
| 390×844 vertical sin barras | 374×≈298 | ≈ 49×88 | 356×200 |

En el iPhone SE en horizontal, y en cualquier iPhone en vertical con Safari, «Ajuste fino» se toca justo para mirar
los dos a la vez, y la toma desaparece. En vertical, además, la hoja sustituye al pie: con ella abierta no hay ▶ ni
barra de tiempo (solo queda tocar el escenario).

**Arreglo:** que la hoja no le quite al escenario más de lo que deja «YouTube 356×200 + toma ≥ ~120 px»:
- En vertical, limitar su alto a lo que sobre de ese mínimo, o fijarla más baja (~40 %) con el contenido en scroll.
- En horizontal estrecho, poner la hoja sobre el panel de la toma (que sí se puede tapar) en vez de estrechar el
  escenario, o dejar «Ajuste fino» y ▶ en una franja compacta.
- Una prueba de `bestLayout` con estos marcos.

### 3 [4] Cerrar una capa y abrir otra a la vez deja un Atrás que no hace nada (p. ej., al guardar una nota nueva)

`lib/useBackToClose.ts:50` (`mark` empuja sin esperar) y `:75-81`; `ReviewScreen.tsx:376` y `:389`;
`data/members.ts:158-161` (`closeWho` cierra y abre lo siguiente en el mismo toque).

En `saveNote`, `setOpenNoteId(created.id)` y `setComposer(null)` van en el mismo render. React ejecuta primero las
limpiezas: el diálogo del redactor llama a `history.back()`, que es asíncrono. Después, la nota empuja su entrada
encima de la del redactor: `[repaso, redactor, nota]`. Al llegar el `back()`, el historial queda en la del redactor
y la nota se vuelve a marcar: `[repaso, redactor (muerta), nota]`. Atrás cierra la nota. El siguiente Atrás cae en la
entrada muerta y no hace nada. El tercero cierra el repaso.

Pasa con cada nota nueva, y también con «¿Quién eres?» → redactor (la primera nota). El hook tiene `ownBackPending()`
y la RPD ya lo resuelve con `useHistorySettled`, pero las demás capas no.

**Arreglo:** dentro del hook, si hay un `back()` propio en camino (`ownPops > 0`), aplazar el `mark()` hasta que llegue
su `popstate` (o como mucho ~400 ms), igual que hace `useHistorySettled`. Así lo cubren todas las capas.

### 4 [4] Cerrar el repaso con su X con los ajustes o una nota abiertos deja una entrada sobrante

`ReviewScreen.tsx:397-401`, `:667` y `:712` (X del repaso), `lib/useBackToClose.ts:77`.

Con `[estudio, repaso, ajustes]` (o la nota), al desmontar se limpian los hooks en orden. El del repaso ve que encima
está la entrada de los ajustes (`≠ id`) y no retrocede. El de los ajustes retrocede una vez. Queda la entrada del
repaso, ya sin escuchador, y el siguiente Atrás en el estudio no hace nada. Es justo el caso que pedía el encargo («que
no quede historial sobrante»). En horizontal es muy fácil, porque la X del pie está a la vista con la hoja lateral
abierta.

**Arreglo:** que el hook lleve una pila de los ids vivos en orden. Al limpiar, si la entrada de encima es de una capa
que también se está cerrando, retroceder una sola vez con `history.go(-n)` por todas, juntando en una microtarea las
capas que se cierran a la vez. Una alternativa más local: que `close` del repaso cierre primero los ajustes y la nota y
espere a que aterrice su `back()`.

### 5 [4] En horizontal, tocar el rombo de una nota en la barra mueve el tiempo en vez de abrir la nota

`ReviewControls.tsx:192` (`{bar && dots}` dentro del propio deslizador) y `:150-156` (el `pointerdown` del
deslizador captura el puntero y hace `seek`).

En la barra de una fila, los rombos de las notas son hijos del deslizador. Un toque sobre uno:
- Primero llega el `pointerdown` del deslizador: `setPointerCapture`, `setScrubbing(true)` y salta al punto tocado
  (hasta 22 px antes o después de la nota).
- Con el puntero capturado, Chrome en Android manda el `click` al elemento que captura (el deslizador), no al botón.
  Así que la nota no se abre: solo se mueve el tiempo.
- En iPhone sí suele abrirse, pero después de ese salto.

En vertical no pasa, porque los rombos van en una fila aparte.

**Arreglo:** en el botón de cada rombo, `onPointerDown={(e) => e.stopPropagation()}`, o que el deslizador ignore los
`pointerdown` cuyo `target` esté dentro de un `button`.

### 6 [3] El mínimo de YouTube no cuenta el borde del panel: el reproductor se queda en 352×198

`reviewRules.ts:292` (`YOUTUBE_MIN_BOX = 356×200`) y `CompareStage.tsx:525` (`PANEL` con `border`) y `:435`.

El reparto garantiza 356×200 para la caja del panel, pero el panel tiene un borde de 1 px y el reproductor va dentro:
quedan 354×198 de sitio y el 16:9 da unos 352×198. En el límite de la bisagra, y en todos los casos donde manda el
mínimo (vertical con barras y ajustes abiertos), YouTube se queda 2 px por debajo de los 200.

**Arreglo:** `YOUTUBE_MIN_BOX = { width: 358, height: 202 }` (o restar el borde en `meets`), con una prueba que mida el
hueco interior.

### 7 [3] Con YouTube, los saltos del store mientras se reproduce siguen cayendo tarde; «Ajuste fino» manda un salto en cada movimiento

`player/store.ts:709-714` (`seek`), `:665-668` (`setTiming` → `alignOriginal`) y `:790-794` (`alignOriginal`, objetivo
exacto); `ReviewControls.tsx:701-709` (deslizador «Sincronía»).

Es la parte del hallazgo 4 de la ronda 1 que queda. Soltar el dedo en la barra mientras suena, las flechas, elegir un
tramo de la canción con el repaso en marcha… todo eso manda a YouTube al segundo exacto. YouTube aterriza unos
300–400 ms tarde y el reloj empieza de cero: unos 2 s después hay un salto de corrección.

Además, cada `onChange` del deslizador «Sincronía» (pasos de 0,01 s) llama a `setTiming`, que lanza un `seekTo` de
YouTube. Arrastrarlo mientras suena hace decenas de saltos seguidos, con el vídeo cargando una y otra vez. Y el ajuste,
de centésimas, queda por debajo del margen con el que YouTube se da por sincronizado (0,1–0,2 s).

**Arreglo:**
- En `alignOriginal`, mientras se reproduce y el original es YouTube, ir a `seekAhead(objetivo, latencia)` (el store
  puede pedir la latencia a la sonda o recibirla en el `seek`).
- En `setTiming` con YouTube sonando, no saltar y dejar que el reloj lo absorba, o esperar a que el dedo se suelte.

### 8 [3] Al arrancar con YouTube, el `playing` de la toma provoca un segundo salto de YouTube

`ReviewMedia.tsx:118-122` (`onPlaying` de la toma → `originalEngine.play()`) y `:323-332` (el `play` de YouTube salta
por delante si `getPlayerState()` no dice `PLAYING`/`BUFFERING`).

Al tocar ▶, YouTube recibe `seekTo(adelantado)` + `playVideo()`. Su estado llega por `postMessage` decenas de ms
después. La toma, un archivo local ya cargado, dispara `playing` en uno o dos fotogramas. En ese momento
`getPlayerState()` todavía dice `PAUSED`/`CUED`, así que se manda otro `seekTo` + `playVideo`. Eso reinicia la carga de
YouTube (arranca más tarde) y deja `startAt` en el segundo envío, con lo que la latencia de arranque medida sale más
corta de la real.

**Arreglo:** en el `play` envuelto, contar como «arrancando» si hay un `startAt` reciente (menos de unos 1,5 s) y en
ese caso no volver a saltar.

### 9 [3] Cuando se oye el original, los saltos y las esperas recaen en el sonido que se oye, y si YouTube no arranca no se avisa

`reviewRules.ts:251` (el salto del archivo mueve el original aunque sea el que suena) y `:259-273` (YouTube: espera
y salto); `ReviewMedia.tsx:79-91` (solo se vigila el `play` de la toma).

- Con «Se oye: el original» y archivo, un desfase de más de 0,5 s hace saltar el original, que es el que suena. Lo
  silenciado debería ser lo que salta, es decir, la toma.
- Con YouTube y «el original», cada espera (hasta 1,5 s) corta la música, y cada salto se oye.
- Si YouTube no llega a arrancar (se queda en `CUED`/`UNSTARTED`, o el navegador bloquea su sonido), la pantalla dice
  «reproduciendo», la toma va en silencio y no suena nada, sin ningún aviso.

**Arreglo:**
- Con el original como lo que se oye, corregir la toma (saltos de la toma, que es un archivo y salta enseguida) en
  vez del original.
- Si `playing` lleva más de unos 3 s y YouTube no ha llegado a `PLAYING`, avisar («YouTube no arranca: toca ▶») y
  pausar.

### 10 [3] En horizontal, la tarjeta de la nota y su aviso quedan encima del reproductor de YouTube

`TakeNoteCard.tsx:60` (`absolute inset-x-2 top-2 … max-w-md mx-auto`) y `:140` (`NoteAlert`, centrado abajo).

En horizontal, con «Separados», la toma va a la izquierda (unos 176 px) y YouTube ocupa el resto. Tanto la tarjeta
(hasta 448 px de ancho, centrada) como el aviso «nota en este momento» (centrado abajo, mientras suena) caen encima de
YouTube. Va contra lo que se pidió («YouTube entero, sin tapar») y contra las condiciones de YouTube.

**Arreglo:** colocarlas sobre el panel de la toma (el escenario conoce `takeRect`) o, en horizontal, en la hoja
lateral.

### 11 [2] Esc y Atrás no cierran en el mismo orden

`ReviewScreen.tsx:434-436`.

Esc cierra siempre primero la nota y después los ajustes. Atrás cierra lo último que se abrió. Ejemplo: con una nota
abierta, se abren los ajustes (en horizontal es lo normal). Atrás cierra los ajustes, pero Esc cierra la nota.

**Arreglo:** llevar el orden de apertura, o cerrar con Esc lo que tenga la entrada de encima.

### 12 [2] Cero corregido: «desde» muestra el segundo corregido y no hay tope de seguridad

- `TakesPanel.tsx:540`: «desde» muestra el cero corregido. Una toma planeada en 1:00 puede salir como «desde 0:59».
  **Arreglo:** redondear a lo planeado al mostrarlo, o guardar el planeado aparte.
- `takeRules.ts:242-251`: la corrección se guarda para siempre en la fila, para todos los móviles, y no tiene tope.
  Si `songAtRoll` saliera raro (la canción parada al grabar, un motor que aún no da tiempo fiable), el error ya no se
  puede deshacer. Antes solo afectaba a ese móvil.
  **Arreglo:** aplicar la corrección solo si `|songAtRoll − songStart| ≤ ~2 s`.
- Las tomas que se guardaron antes de este cambio en el móvil que grabó pierden la corrección local que tenían, y su
  «Ajuste fino» se calibró sobre ella. Solo afecta a los móviles de prueba, si la sincronía 43 no llegó a publicarse.

### 13 [2] «Repasar con el original»: el nombre accesible no contiene el texto visible

`TakesPanel.tsx:582`.

El botón dice «Repasar con el original», pero su nombre accesible es «Repasar: comparar con el original la toma de…».
Quien maneja la app por voz y dice lo que ve no lo encuentra. Es el mismo criterio del commit 87056fe.

**Arreglo:** «Repasar con el original: toma de {nombre} ({fecha})».

### 14 [2] Pruebas

- Nada prueba `useBackToClose`, que es compartido y donde están los nuevos 1, 3 y 4.
- Nada prueba que `useSaveTake` envíe el cero corregido una sola vez (por ejemplo, con un duplicado o una toma
  recuperada).
- Sigue sin haber pruebas del reloj (`useReviewClock`, vuelta del tramo con YouTube, latencias): era el hallazgo 13 de
  la ronda 1.

## Pendiente de comprobar en un móvil real

- Atrás después de que Safari recargue la pestaña con el repaso abierto (nuevo 1).
- Guardar una nota nueva y luego pulsar Atrás varias veces: contar las pulsaciones que no hacen nada (nuevo 3).
- Con los ajustes abiertos y YouTube, a 667×375 con barras: tamaño de la toma (nuevo 2).
- Tocar el rombo de una nota en la barra horizontal en Android (nuevo 5).
- Con YouTube, el primer play: cuántos `seekTo` se mandan, y cuántos saltos hay en un tramo de 3 s durante 30 s.
