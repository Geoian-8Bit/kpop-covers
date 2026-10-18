# Revisión · Ronda 2 de la prueba manual · puntos 50 (Tomas) y 51 (Repaso / comparar) · ronda 4 (verificación)

## Alcance

Verificación corta, de solo lectura, de la copia de trabajo sin commit (`feat/plan-completo`) después de los arreglos de
la ronda 3 (`ronda2-tomas-repaso-3.md`). Ya no había agentes editando. Sobre todo:

- `lib/backLayers.ts` (el despachador salta ahora solo las entradas que no son de ninguna capa abierta), `lib/useBackToClose.ts`,
  `features/rpd/useHistorySettled.ts` (usa `isStaleEntry`) y sus usos: `RpdPlayPage.tsx` (guarda, «¿Salir de la
  ronda?», salir), `RecordStudio.tsx` (sus `popstate` propios), `StudioPage.tsx` (`useFullscreen` en modo CSS y menú de
  velocidad), `QuickNav`/`quickNavCore`, `AppShell` (menú del móvil), `main.tsx` (actualización en `popstate`) y los
  `navigate` con `replace`.
- `coverPanelWidth` y el panel sobre la toma en horizontal: `reviewRules.ts`, `ReviewScreen.tsx:611-705`,
  `CompareStage.tsx:185-200` (`takeRoom` forzado y acotado por `splitBounds`), `ReviewControls.tsx` (`Range`, rombos).

Cómo lo he comprobado: he copiado `backLayers.ts` tal cual a un directorio temporal (fuera del repositorio) y lo he
ejecutado con Node contra un historial falso en el que `go()` aterriza más tarde y se calcula al aterrizar, como en un
navegador, con salida por debajo del índice 0 contada aparte. Además del despachador, he reproducido el oyente de
`useHistorySettled` con la misma `historySettleStep`. Escenarios: cierre en el mismo commit en que arranca
`useHistorySettled`; recarga con dos entradas viejas; dos entradas muertas de esta carga más la X de la de arriba;
«Adelante» sobre una entrada muerta; dos «Atrás» rápidos con una muerta debajo; cadena de tres muertas; recarga sin
capas abiertas; capa ocupada (grabador) sobre una muerta; `pushState` del router con la capa todavía abierta. Las
medidas salen de `coverPanelWidth`, `splitBounds` (pasos de 0,01) y las clases, con los números de la ronda 3.

## Qué he ejecutado y resultado

- `pnpm typecheck`: correcto (shared y web).
- `pnpm test`: correcto. shared 7 ficheros / 139 pruebas; web 54 ficheros / 732 pruebas.
  `src/lib/backLayers.test.ts` sola: 12/12.
- Simulación: 7 de 11 escenarios bien (cadena de muertas sin bucle ni salida, capa ocupada, `push` con la capa abierta,
  dos «Atrás» rápidos). Fallan 4: los nuevos 1, 2, 4 y 5.

## Hallazgos de la ronda 3 (≥ 3) → estado

| # | Nota | Hallazgo | Estado |
| --- | --- | --- | --- |
| 1 | 6 | Hoja lateral de 220 px: «Sincronía» en 4–34 px | **Arreglado** con el panel sobre la toma: 360 px (844) y 299 px (667). Por dentro, 336 y 275 px. El deslizador mide 152 y 91 px. «Velocidad común» (~265 px) cabe justo en 275. Ver la tabla. |
| 2 | 6 | Tarjeta de la nota de 63–162 px en horizontal | **Arreglado:** con el panel abierto, la tarjeta va dentro del panel (360/299 px, unos 255 px de texto a 667). |
| 3 | 4 | Cerrar la capa de abajo dejaba un Atrás sin efecto | **Arreglado:** el despachador salta la entrada muerta. Hay prueba, y una cadena de tres muertas también sale bien en la simulación. |
| 4 | 4 | Navegar (push) con un diálogo abierto dejaba un Atrás sin efecto | **Arreglado en general** por el mismo salto (prueba «a page pushed over a dialog»). A cambio, «Adelante» queda roto sobre esa entrada (nuevo 4). |
| 5 | 4 | Los rombos tapaban la línea | **Arreglado:** en la barra, cada rombo es una franja de 44×22 px por encima de la línea (y = −8 a 14). La raya va en 16–24 y solo pisa 3 px del pulgar. |
| 6 | 4 | Con «el original», cada espera de la toma lo pausaba | **Arreglado** (`ReviewMedia.tsx:120-129`: no pausa ni reanuda si `audio === 'original'`). |
| 7 | 3 | Pantalla completa CSS: Atrás sacaba de la canción | **Arreglado** (`StudioPage.tsx:1196-1197`). El menú de velocidad va encima como capa propia y Atrás lo cierra primero. Esc cierra la capa y su entrada retrocede sola. |
| 8 | 3 | Un salto en el primer 1,5 s tras ▶ no llegaba a YouTube | **Arreglado:** `pendingAfterStart` + `applyAfterStart` en el `PLAYING` (`ReviewMedia.tsx:372-382`, `:452`), con `seekAhead` si el desfase pasa de 0,25 s. |
| 9 | 3 | «Sincronía» solo con `pointerup` | **Arreglado:** también con `pointercancel`, `lostpointercapture`, `blur` y teclas. `alignFor` descarta las repeticiones. Los ±0,01 se juntan en 300 ms. |
| 10 | 3 | 360 px en vertical: YouTube < 200 | **Arreglado:** con `tightPortrait`, el escenario va sin relleno lateral y YouTube queda en 358×201. |

Los < 3 de la ronda 3: el 11 sigue siendo una carrera rara (la primera mitad la cubre el salto). El 12 está
**parcial**: `isStaleEntry` ya existe y lo usa `useHistorySettled`, pero falta el salto al arrancar (nuevo 5). El 15 está
**arreglado** en lo que toca a `backLayers` (pruebas de 3, 4 y 11).

### Medidas (YouTube, toma vertical 9:16, «Separados», ajustes abiertos)

| Pantalla | Escenario | Panel (por dentro) | Panel de la toma | YouTube: caja → reproductor | Deslizador |
| --- | --- | --- | --- | --- | --- |
| 844×390 (47/47, 21 abajo) | 750×313 | 360 (336) | 360, tapado entero | 380×313 → 378×213 | 152 px |
| 844×390 con barras de Safari | 750×263 | 360 (336) | 360, tapado entero | 380×263 → 378×213 | 152 px |
| 667×375 | 667×319 | 299 (275) | 296 (`splitBounds` lo baja de 0,455 a 0,45; el panel pisa 3 px de la bisagra, no YouTube) | 361×319 → 359×202 | 91 px |
| 667×375 con barras de Safari | 667×230 | 299 (275) | 296 | 361×230 → 359×202 | 91 px |
| 780×360 (Android de 360 en horizontal) | 780×304 | 360 (336) | 360 | 410×304 → 408×230 | 152 px |
| 360×780 vertical | — | hoja debajo | — | 360 de ancho → 358×201 | — |

YouTube nunca baja de 356×200 ni queda bajo el panel en estos tamaños, en los dos órdenes. Con el orden «original
primero», a 667 la cuenta sale igual al revés (`splitBounds.min` = 0,55: YouTube 361, toma 296).

## Hallazgos nuevos

### 1 [6] «Salir» en «¿Salir de la ronda?» puede devolver a la ronda: `useHistorySettled` ya no espera al diálogo que se cierra en el mismo commit

`lib/backLayers.ts:69-74` (`isStale` da por viva una capa que está en `closing` porque su `flush` aún no ha corrido),
`features/rpd/useHistorySettled.ts:36`, `features/rpd/RpdPlayPage.tsx:841-849` (el botón «Salir»:
`setConfirmExit(false)` + `leave()`) y `:506-540` (el efecto de salir).

Al pulsar «Salir», el diálogo se cierra y `leaving` pasa a `true` en el mismo commit. React ejecuta primero la limpieza
de `useBackToClose` del diálogo (`close()`: la capa entra en `closing` y el `flush` queda para una microtarea) y después
el efecto de `useHistorySettled(leaving)`. En ese momento la entrada actual es la del diálogo, que sigue en `live`, así
que `isStaleEntry` da `false` y `historySettleStep` devuelve `ready` sin esperar. Simulado (S1): `isStaleEntry=false`,
`ownBackPending=true`, resultado `ready`. En la ronda 3, con `isLayerEntry`, aquí salía `wait`. **Es una regresión.**

Después, el efecto de salir corre en el siguiente render, que React agenda como tarea normal (unos milisegundos). El
`go(-1)` del diálogo, en cambio, tarda lo que tarda el navegador en recorrer el historial, normalmente más. Si el
efecto llega antes, ve `isLayerEntry(history.state) === true`, elige `replace` y hace `navigate('/rpd', { replace: true })`
sobre la entrada del diálogo. Luego aterriza el `go(-1)` en la entrada de la ronda, y el router vuelve a montar
`RpdPlayPage`, que recupera la ronda de `sessionStorage`. La red de seguridad (`check`) no actúa porque se quitó al
desmontar. El usuario pulsa «Salir», ve un momento `/rpd` y vuelve a la ronda, con `/rpd` como entrada de «Adelante».

**Arreglo:** en `isStale`, contar como muerta la capa que se está cerrando:
`!live.some((l) => l.id === id && l.marked && !closing.has(l.id))`. Entonces sale `stale` con `ownBackPending`
(`flushQueued`) y `useHistorySettled` espera al `popstate`, como antes. Un `popstate` no puede colarse entre `close()` y
la microtarea, así que el despachador no cambia. Prueba: abrir, `close()` y, en el mismo tick,
`isStaleEntry(state) === true` con `ownBackPending() === true`.

### 2 [5] Una sola entrada muerta puede costar dos pasos atrás: el despachador y `useHistorySettled` saltan los dos

`lib/backLayers.ts:89-93` (salto en el despachador) y `features/rpd/useHistorySettled.ts:36-50` (`onPop` → `step` →
`ownHistoryBack`). Los dos escuchan el mismo `popstate` y leen el mismo `history.state` antes de que aterrice ningún
`go`. Si los dos ven una entrada muerta, cada uno manda su `go(-1)`.

- **Recarga con dos capas abiertas en la ronda (simulado, S2).** Safari o Chrome descartan la pestaña con «¿Salir de
  la ronda?» abierto (guarda y diálogo: `[rpd, ronda, guarda(vieja), diálogo(vieja)]`) y la ronda vuelve de
  `sessionStorage`. Al empezarla, `useHistorySettled(guardWanted)` retrocede de la entrada del diálogo y cae en la de la
  guarda, también vieja. Retroceden los dos, se salta la entrada de la ronda y se acaba en `/rpd`. La ronda se cierra
  sola.
- **Dos muertas de esta carga bajo la capa que se cierra con su X mientras `useHistorySettled` espera (S2b).** Igual,
  pero con un `go(-1)` de más: con la ronda abierta desde un enlace en la PWA, el `go` por debajo del índice 0 no hace
  nada y `ownPops` se queda en 1. El siguiente «Atrás» del usuario se toma por propio y la guarda se vuelve a poner en
  vez de preguntar (un Atrás sin efecto). En el navegador, puede salir de la app.

Es raro (hace falta que haya dos entradas muertas seguidas), pero cuando pasa saca de la ronda o de la app.
**Arreglo:** que salte uno solo. Lo más simple: en `historySettleStep`, devolver `wait` si `ownBackPending()`, aunque
haya `popped` (el despachador ya mandó su paso), y que `useHistorySettled` solo dé el primer paso al arrancar. Mejor
todavía: mover ese primer paso a `backLayers` (p. ej. `stepOverStale()`, que solo retrocede si no hay nada propio en
camino) y que `useHistorySettled` solo espere a `!isStaleEntry && !ownBackPending`. Prueba con los dos oyentes y dos
entradas muertas: se acaba en la ronda.

### 3 [3] En horizontal, con los ajustes abiertos, la toma queda tapada entera: «Sincronía» se ajusta sin ver la toma

`reviewRules.ts:434-440` (`coverPanelWidth`), `ReviewScreen.tsx:621` y `:684-705`, `CompareStage.tsx:196`.

El panel de la toma se hace tan ancho como el panel de ajustes, y el panel lo tapa: a 844, la toma (360) queda debajo
de los 360 px del panel; a 667, la toma (296) queda debajo de los 299. Con un archivo pasa igual (360 de 740). Los
deslizadores ya caben (hallazgo 1 de la ronda 3), pero el «Ajuste fino» sirve justo para mirar los dos a la vez y
ahora solo se ve YouTube. Es la contrapartida que ya anotaba la ronda 3. No rompe nada, pero el ajuste se hace a ciegas
en el caso principal (el móvil en horizontal).

**Arreglo:** mientras se arrastra un `Range` del panel (de `pointerdown` a `onCommit`), bajar la opacidad del panel
salvo la fila del control (`opacity`, sin relayout), para que la toma se vea debajo. Otra opción: un botón «Ver la
toma» que oculte el panel mientras se mantiene pulsado.

### 4 [2] «Adelante» sobre una entrada muerta vuelve atrás: no se llega a la página empujada

`lib/backLayers.ts:89-93`. El salto siempre es `go(-1)`. Simulado (S3): un diálogo, una página empujada encima con
`navigate` y el diálogo cerrado. «Atrás» vuelve a la lista (bien), pero «Adelante» cae en la entrada muerta y el salto
devuelve a la lista: no hay manera de ir hacia delante. Lo mismo con «Adelante» después de cerrar cualquier capa con su
botón, aunque ahí no hay nada que perder. Solo afecta a quien usa «Adelante» (escritorio o el menú de Chrome).
**Arreglo:** saber la dirección. Las entradas de capa copian el `idx` del router (`...state()`): si el `idx` de la
entrada muerta es mayor o igual que el de la última ubicación vista, se va hacia delante, así que el salto es `go(1)`.

### 5 [2] Tras una recarga, mientras no se abre ninguna capa, el despachador no escucha y las entradas viejas siguen siendo un Atrás sin efecto

`lib/backLayers.ts:80-97` (`listen()` solo se llama desde `open` y `ownHistoryBack`). Simulado (S6): con
`[lista, capa(vieja), nueva]` recargado en «nueva», «Atrás» cae en la entrada vieja y se queda allí. Es lo que queda del
12 de la ronda 3. **Arreglo:** registrar el despachador al cargar (desde `main.tsx`), después de arreglar el nuevo 2
para no sumar otro saltador.

### 6 [2] Con los ajustes abiertos en horizontal, el aviso «nota en este momento» y el error de la toma quedan debajo del panel

`ReviewScreen.tsx:668-680`. `NoteAlert` y el `role="alert"` siguen en `noteArea` (`takeRect`, `z-20`), y el panel
(`z-30`) tapa ese mismo rectángulo. Una nota que llega mientras se ajusta no se ve, y el error de la toma tampoco.
**Arreglo:** con `coverOpen`, pintarlos dentro del panel, como la tarjeta.

### 7 [2] Abrir una nota en horizontal con YouTube encoge YouTube y lo devuelve al cerrarla

`ReviewScreen.tsx:620-621` (`coverOpen` también con solo la nota) y `CompareStage.tsx:196`. A 844, YouTube pasa de
556×313 a 378×213, y a 667, de 475×267 a 359×202, cada vez que se toca un rombo. Con solo la nota, el panel no tiene
fondo y la toma se ve, pero los dos vídeos cambian de tamaño de golpe. Es aceptable a cambio de una tarjeta legible.
Si molesta: con solo la nota, mantener el reparto automático cuando el panel de la toma mida ≥ 260 px.

## Casos de Atrás repasados sin problema

- **Botón Atrás de Android con un diálogo abierto:** cierra el diálogo y, si debajo había una muerta, la salta. Nunca
  pasa de una entrada que no sea de capa, así que no se salta páginas del router ni sale de la PWA (S5: 0 salidas). Las
  excepciones son el nuevo 2 y, con dos toques casi a la vez, la carrera 11 de la ronda 3.
- **Dos «Atrás» rápidos con una muerta debajo (S4):** se acaba donde tocaba, porque el salto es un paso gratis.
- **Router:** `push` con una capa que sigue abierta (S9): Atrás vuelve a la entrada de la capa, viva, y no la cierra.
  Después, su X la quita bien. Los `replace` de QuickNav, AppShell, `WishFormDialog` y `AddVideoDialog` sustituyen la
  entrada de la capa, y su cierre no retrocede (`currentId()` es `null`).
- **Grabador:** con el estudio ocupado sobre una muerta (S7), Atrás vuelve a poner la entrada del estudio y no hay
  salto. Sus `popstate` propios (aplauso, paneles, confirmación) no reciben pasos extra en ningún caso realista.
- **Pantalla completa CSS del estudio:** capa normal. El menú de velocidad va encima.
- **Recarga con una sola entrada vieja (lo normal):** un solo paso.

## Pendiente de comprobar en un móvil real

- Ronda de RPD: «Salir» → «Salir» del diálogo, en un Android de gama media y en un iPhone. ¿Se queda en `/rpd` o
  vuelve a la ronda? (nuevo 1).
- 844×390 y 667×375 con YouTube: mover «Sincronía» con el panel abierto. ¿Se puede ajustar sin ver la toma? (nuevo 3).
- 667×375: que «Velocidad común» (cuatro opciones) no haga scroll lateral en los 275 px del panel.
