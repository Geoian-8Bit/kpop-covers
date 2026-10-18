# Revisión · Ronda 2 de la prueba manual · Repaso en «Superpuesto»: gestos del escenario y accesos rápidos · ronda 1

## Alcance

Revisión corta, de solo lectura, de la copia de trabajo sin commit (`feat/plan-completo`), solo en `features/review/`:
`CompareStage.tsx`, `ReviewControls.tsx`, `ReviewScreen.tsx`, `reviewRules.ts` y `reviewSync.test.ts`. La petición del
responsable: «En la interfaz de solapar la toma con el vídeo no me deja hacer las acciones como mover la vara y abrir
los ajustes, además de que los ajustes tendrían que ser mejor y sobre todo con accesos rápidos; seguramente esto se
hará en horizontal».

Qué he mirado:

1. «Superpuesto» táctil: si algo del escenario bloquea el pie o la columna rápida. He revisado `stageGesture`, el
   umbral de 6 px, la captura de puntero, `onPointerLeave`, `overflow-hidden`/`isolate`, los `z-index` del pie y de las
   capas con zoom (`ZoomLayer`) y los oyentes globales (`quickNavCore`, z-42, bajo el repaso, z-45). También he
   probado de cabeza el pulgar apoyado, con «Encajar» encendido y apagado, con zoom, el pellizco y la rueda.
2. `QuickStrip`, en vertical y en horizontal, con medidas a 667×375, 390×844 y 360×640, y el panel de ajustes antes y
   después del cambio.
3. Regresiones en «Separados», las notas, Atrás y Esc.

Causa probable del fallo que se veía: en «Superpuesto» con zoom, la `ZoomLayer` de los dos (`absolute inset-0`,
escalada) se salía del marco, que no recortaba. En horizontal, el pie (`bar`) no tenía posición ni `z-index`, así que
lo ampliado se pintaba encima de la línea de tiempo y de los ajustes y se quedaba con los toques. Ya está arreglado:
el marco lleva `overflow-hidden isolate`, el escenario `isolate` y los dos pies `relative z-20`. Lo del encaje ya
estaba recortado por el panel del original.

## Qué he ejecutado y resultado

- `pnpm typecheck`: correcto (shared y web).
- `pnpm test`: correcto. Web: 53 ficheros, 708 pruebas, incluidas las 4 nuevas de `quick controls and the stage
  gestures`.
- Sin navegador ni dispositivo, como pide el encargo. Lo que depende de cómo se comporta el navegador va marcado
  «verificar en el móvil».

## Comprobaciones pedidas → resultado

| Punto | Resultado |
| --- | --- |
| Nada del escenario se pone encima del pie o de la columna | **Bien.** Recorte en el marco, `isolate` en el escenario y `z-20` en los dos pies. La columna va fuera del marco (`touch-none` solo en el marco); el `html` deja `pan-y`, así que la columna se puede desplazar. |
| Captura de puntero | **Bien.** Ya no se captura en `pointerdown`. Se capturan todos los dedos solo cuando el gesto es `fit` o `zoom` (`CompareStage.tsx:298`). Un dedo de otra zona nunca entra en `pointers`. |
| Pulgar apoyado en el vídeo, «Encajar» apagado y sin zoom | `stageGesture` devuelve `none`: nada se mueve ni se captura. Pero ver los hallazgos 1, 2 y 3. |
| «Encajar» encendido | Con 1 dedo, mueve el original pasados 6 px; con 2, lo mueve y escala. La rueda y las teclas encajan. El botón corta la propagación y no entra en el gesto. Bien. |
| Con zoom | Con 1 dedo mueve los dos; con 2 los amplía; el doble toque vuelve al entero. Bien. |
| `overlayStartOpacity` | Pasa por `setMode` desde la cabecera y desde la columna. Bien (ver el 9). |
| Columna en horizontal por el lado de la toma | Bien: `takeAtEnd` la pone en el borde de la toma, nunca junto a YouTube, y se oculta con el panel abierto. YouTube se queda con 667−50−10−toma, que cumple `splitBounds` (≥358×202, alto 375−56 = 319). |
| 44 px, estados, accesibilidad | 44×44 y `aria-pressed`. Ver los hallazgos 6 y 8. |
| Desplazamiento a 667×375 | Hay `overflow-y-auto` y la altura máxima funciona; ver el 4. |
| Fila en vertical a 360 px | Como mucho 4 botones (~190 px): cabe. Ver el 5, por la altura. |
| Panel de ajustes reordenado | Siguen la sincronía fina, los ±0,01, «Poner a 0», encajar («Recolocar», «Encima», transparencia), el zoom, los tramos (guardar y quitar A–B), el espejo de los dos, la velocidad fina (0,5–1,25) y los fotogramas (`compact`). Lo que sale del panel (A, B, bucle, nota, modo, «Sonido», velocidades fijas) sigue en la columna, el pie o la cabecera; 1,25× solo queda en la velocidad fina. Ver el 7. |
| «Separados», notas, Atrás y Esc | Sin cambios de lógica salvo el hallazgo 1. La bisagra corta la propagación; `noteArea`/`takeRect` siguen en el sistema del marco (la columna va fuera del envoltorio). `useBackToClose` y Esc sin cambios. |

## Hallazgos

### 1 · [5] Un deslizamiento corto sobre la imagen entera cuenta ahora como toque y pausa o reproduce
`CompareStage.tsx:293-299` y `:321`. Antes, `g.moved = true` se ponía al pasar los 6 px, antes de cualquier `return`,
así que arrastrar nunca era un toque. Ahora, si el gesto es `none` (un dedo sobre una imagen sin zoom, en los dos
modos), se sale antes de marcar `moved`. Al levantar el dedo, `!g.moved && < 450 ms` llama a `tap()`.
- Escenario: en «Superpuesto» (ahora empieza en «zoom») alguien arrastra para mover el original, como hacía antes; o en
  «Separados» desliza el pulgar al coger el móvil. Si dura menos de medio segundo, la reproducción se para o arranca.
- Arreglo: separar «se movió» de «está capturado». Marcar `g.travelled = true` al pasar el umbral, sea cual sea el
  gesto, y no contar el toque si `travelled`. Así `none` sigue sin capturar.

### 2 · [5] Con un pulgar apoyado en la pantalla, los botones del pie y de la columna pueden no responder (verificar en el móvil)
`ReviewControls.tsx` (`QuickButton`, `SettingsButton`, `PlayCrest`, `SoundPill`) y `ReviewScreen.tsx:763-777`.
Todos se activan con `onClick`. Chrome para Android (su detector de gestos cancela el toque cuando baja un segundo
dedo) y, por lo que sé, también Safari en iOS (su reconocedor de toques espera un solo dedo) no generan `click` para un
toque mientras otro dedo está apoyado, esté donde esté. Arrastrar la línea de tiempo funciona porque usa
`pointerdown`/`pointermove`. Abrir los ajustes, ▶, Toma/Original y los accesos rápidos, no.
- Escenario: móvil en horizontal sujeto con el pulgar sobre el vídeo. El otro pulgar toca «Ajustes» y no se abre. Es
  justo lo que contó el responsable («abrir los ajustes»), y no depende del escenario: ningún cambio de este diff lo
  arregla.
- Arreglo: comprobarlo en un móvil de verdad. Si se confirma, añadir a estos botones (por ejemplo, un ayudante
  `tapAnyFinger`) la acción en `pointerup` cuando `pointerType === 'touch' && !e.isPrimary` y el dedo no se ha movido
  más de 10 px, y saltarse el `click` que pudiera llegar después.

### 3 · [4] Pulgar apoyado y un toque de otro dedo en el vídeo: un microzoom en vez de reproducir
`CompareStage.tsx:284` y `reviewRules.ts:686-691`. El umbral de 6 px solo se aplica con un dedo. Con dos, cualquier
`pointermove` da `zoom`, se capturan los dos y `gestureZoom` aplica la razón de distancias: 2 px de temblor sobre 300
px dan ×1,0067, por encima de `ZOOM_MIN + 0,005`. Además, el toque no reproduce, porque al levantarlo aún queda un
dedo.
- Escenario: en horizontal, con el pulgar sobre la toma, se toca el vídeo para reproducir. Aparece «· 101 %»,
  reproducir no hace nada y, a partir de ahí, el doble toque y el arrastre de un dedo se comportan como con zoom.
- Arreglo: para dos dedos, exigir que uno se haya movido más de 6 px o que la distancia entre ellos cambie más de 8 px
  antes de dar `zoom`. Si el segundo dedo baja y sube sin moverse (menos de 450 ms) y el primero no se ha movido,
  contarlo como toque.

### 4 · [3] En horizontal a 667×375 la columna no cabe y «Nota» queda escondida sin ninguna pista
`ReviewControls.tsx:370-436` y `ReviewScreen.tsx:669-674`. Con archivo en «Superpuesto» hay 8 botones: 8×44 + 7×2 +
6 ≈ 372 px. Hay unos 319 px (375−56), y unos 286 si se restan la zona segura de abajo y el `py-1.5`. En Safari con
barras, menos todavía. Se desplaza, pero «%» y «Nota», que va la última y es de lo más usado, quedan fuera y no hay
sombra ni corte que lo indique.
- Arreglo: poner primero lo más usado (nota, velocidad, A, B, bucle) y lo del modo al final, o pasar a dos columnas
  cuando `scrollHeight > clientHeight`. Como mínimo, un degradado en el borde cuando haya más.

### 5 · [4] En vertical, la fila nueva quita unos 52 px al escenario y en 360×640 la toma baja de su mínimo
`ReviewScreen.tsx:882-885`. Con YouTube en «Separados» (en columna), notas y un A–B marcado, el pie pasa de ~220 a ~272
px. El escenario queda en ~296 px: 202 de YouTube + 10 de bisagra + **~84 px de toma**, por debajo de `TAKE_MIN_HEIGHT`
(120). A 390×844 cabe (toma ~213). Además, en vertical el botón de modo repite el `Segmented` «Separados/Superpuesto»
de la cabecera.
- Arreglo: en vertical, quitar el modo de la fila (ya está en la cabecera) y meter velocidad, espejo y % en la fila del
  reloj (`actions`, junto a Toma/Nota) o en la del transporte, sin añadir una fila más. O mostrar la fila solo cuando
  sobre altura.

### 6 · [3] El botón «%» dice «el original» aunque la toma esté encima
`ReviewControls.tsx:423-424`. `prefs.opacity` es la opacidad de la capa de arriba (`CompareStage.tsx:429-430`). Con
«Encima: Toma», el botón dice «El original se ve al 75 %» y «Cuánto se ve el original», pero lo que cambia es la toma.
- Arreglo: pasar `onTop` a `QuickStrip` y decir «La toma se ve al …» o «El original se ve al …» según la capa de
  arriba, o usar un nombre neutro, «Transparencia de la de encima».

### 7 · [3] El texto del zoom habla de un botón «Ampliar» que ya no existe
`ReviewControls.tsx:939`: «Pulsa «Ampliar» sobre el vídeo para que los dedos amplíen en vez de encajar». Ahora los
dedos amplían por defecto y el botón se llama «Encajar»/«Listo».
- Arreglo: «En «Superpuesto» los dedos amplían los dos a la vez; pulsa «Encajar» sobre el vídeo para mover y escalar
  el original. Doble toque para verlos enteros.»

### 8 · [2] Accesibilidad de la columna
`ReviewControls.tsx:370` y `:422-425`. `role="toolbar"` sin navegación con flechas: en la columna las flechas mueven
el tiempo, porque el filtro global de `ReviewScreen.tsx:488` no incluye `toolbar`. El botón «%» lleva `aria-pressed`
siempre a `true`. El de modo y «Encajar» combinan `aria-pressed` con una etiqueta que cambia (el estado se anuncia dos
veces). Si se guarda una nota creada desde la columna en horizontal, la nota abierta oculta la columna y el foco vuelve
a un botón desmontado.
- Arreglo: usar `role="group"` (o flechas con tabindex móvil), quitar `pressed` al «%» y dejar en el modo una etiqueta
  fija con `aria-pressed`.

### 9 · [2] Entrar en «Superpuesto» siempre pisa una transparencia elegida por encima de 0,8
`ReviewScreen.tsx:655-656` y `reviewRules.ts:676-678`. Quien elige que la de encima se vea al 85 % la pierde, y se
guarda en 0,5, cada vez que vuelve al modo. Si el repaso abre ya en «Superpuesto» con 1, no se aplica.
- Arreglo: aplicarlo solo si la opacidad es 1 o menor de 0,15, o también al cargar las preferencias.

### 10 · [1] El valor por defecto de `overlayGesture` no coincide
`CompareStage.tsx:173` deja `'fit'` como valor por defecto y la pantalla usa `'zoom'` (`ReviewScreen.tsx:299`).
Igualarlos.

## Resumen

No he encontrado nada ≥ 6. El arreglo de fondo (recorte y orden de capas) es correcto, y el panel no pierde ningún
ajuste. Antes de publicar convienen el 1 (es una regresión: un deslizamiento pausa o reproduce) y comprobar el 2 en un
móvil, porque puede ser justo lo que vio el responsable al abrir los ajustes con el pulgar sobre el vídeo y el diff no
lo resuelve.
