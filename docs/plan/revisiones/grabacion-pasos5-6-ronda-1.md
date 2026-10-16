# Revisión · Grabación pasos 5 y 6 (C1–C4, S1–S3, A1, R3) · Ronda 1

**Alcance:** `git diff ca87fcd..b59550e`, centrado en lo nuevo de los pasos 5 y 6:

- **Paso 5** (`34776d1`): tocar para enfocar y mantener para fijar (`RecordStudio.tsx`: `previewHandlers`, `framePoint`, `focusHere`), `ImageControls.tsx`, funciones de cámara de `camera.ts` (`focusAt`, `lockFocusExposure`, `setExposureCompensation`, `setWhiteBalance`), sonido a 256 kbps, micro estéreo y el conmutador canción/micro.
- **Paso 6** (`b59550e`): panel de ajustes en `features/record/settings/` (variantes Bandeja, Abanico y Makimono, `controls.tsx`, `model.ts`, `GridOverlay`, `LevelIndicator`, `RecorderSettingsDemo`), su integración en `RecordStudio.tsx` (`settingsAllowed`, chip resumen, botón «Ajustes» del riel), aviso de calor R3, laboratorio de diseño (`features/lab/`), página `/ajustes`, ruta y enlaces, y vitest en `apps/web`.

**Objetivo:** Samsung S24/S25, Chrome Android, PWA instalada (pantalla de 360 × 780 px CSS).
**Tipo de revisión:** solo lectura. Los números de línea son los del commit `b59550e`. El árbol de trabajo tiene cambios de otra funcionalidad y no se ha mirado.

---

## Resumen

El trabajo es sólido y está bien encajado en el grabador:

- **Los ajustes no se pueden cambiar con una toma en marcha o en pausa.** El panel solo se abre en reposo y sin grabadora, y se cierra solo si la fase cambia. El chip resumen queda desactivado. El sonido de la toma no cambia a mitad, porque su elección se salta mientras hay grabadora. En pausa solo queda el panel «Imagen», que actúa sobre la misma pista y no rompe la toma.
- **Los tres paneles cumplen el contrato de teclado:** atrapan el foco, cierran con Esc y devuelven el foco al cerrar. Respetan el movimiento reducido, animan solo con transform y opacity, y se adaptan al teléfono girado: bandeja lateral, abanico hacia arriba y rollo en horizontal. Dentro de los paneles todos los objetivos miden 44 px o más.
- **El nivel lee el sensor sin volver a pintar React en cada lectura.** Solo escucha mientras está activado.
- **`pnpm typecheck`, `pnpm test` (73 + 15) y `pnpm build` pasan** en el worktree limpio.
- **Diseño:** la bandeja recomendada es sobria y fiel a DESIGN.md. No hay neón, ni cristal, ni degradados nuevos.

Los puntos débiles están en los bordes:

- **Reabrir la cámara al cambiar calidad, resolución o fps funciona en el caso normal, pero tiene dos agujeros.**
  - Un segundo cambio hecho mientras la cámara aún se está abriendo se pierde.
  - Si la cámara se reabre con el mismo dispositivo, el estado de «Imagen» (enfoque y luz fijos, luz +1, «Cálida») se queda en pantalla, pero la cámara nueva vuelve a automático. Pasa al cambiar ajustes, al volver de otra app y al reintentar.
- **El bloqueo de enfoque no sobrevive a un cambio de lente.** Se reinicia sin avisar. La interfaz queda coherente, pero en una toma de lienzo en pausa la segunda parte vuelve a «respirar».
- **Mantener pulsado para fijar probablemente fija lo que había antes, no el punto pulsado.** Además, la exposición manual se fija sin la sensibilidad (ISO). Es una hipótesis que hay que probar en el S24.
- **El botón atrás de Android cierra el grabador entero** si hay un panel abierto (Ajustes, Imagen o Abanico).
- **En horizontal (360 px de alto), el panel «Imagen» no cabe** y el botón «Fijar enfoque y luz» queda cortado.
- **Tocar la opción que ya se ve marcada puede cambiar el ajuste guardado.** Por ejemplo, «30» en una cámara sin 60 fps, o «Micrófono» con un vídeo de YouTube. La siguiente toma con otra cámara o con un archivo sale distinta de lo esperado.

No he encontrado pérdida de datos: ningún hallazgo puede borrar ni cortar una toma.

| Gravedad | Nº | Notas |
| --- | --- | --- |
| 🔴 Serio | 0 | — |
| 🟡 Importante | 6 | 6, 6, 6, 5, 5, 5 |
| 🟢 Menor | 8 | 4, 4, 4, 3, 3, 3, 3, 3 |
| ⚪ Cosmético / limpieza | 4 | 2, 2, 2, 1 |

---

## Hallazgos

### 🟡 1 · Un cambio de ajustes hecho mientras la cámara se reabre se pierde · nota 6

- **Dónde:** `useCamera.ts` 295–306 (la reapertura solo ocurre si la cámara no está «abriéndose») y 94 (`start` lee los ajustes una sola vez, al empezar).
- **Flujo:**
  1. Con la bandeja abierta, el bailarín toca «Alta» en Calidad. La cámara empieza a reabrirse, lo que tarda entre medio segundo y un segundo.
  2. Antes de que termine, toca «60» en Fotogramas o «1080p» en Resolución.
  3. El efecto ve la cámara «abriéndose» y no hace nada, pero apunta el ajuste como ya aplicado.
  4. La apertura en curso usa los ajustes leídos en el paso 1. La cámara queda con el tamaño o los fps anteriores y nada vuelve a intentarlo.
- **Cuándo pasa:** con dos cambios de calidad, resolución o fps en menos de un segundo. En la bandeja todo está a la vista y lo normal es tocar varias filas seguidas. Con el teclado, las flechas de un grupo de opciones eligen al momento, así que se encadenan cambios.
- **Protecciones actuales:** el chip resumen muestra el modo real de la cámara. Quien lo mire verá «1080p · 30» en vez de «· 60». La compresión sí sigue a la calidad nueva, porque se calcula al empezar la toma.
- **Impacto:** la toma se graba con una resolución o unos fps distintos de los elegidos, sin aviso. Se arregla solo cuando algo vuelve a abrir la cámara (girarla, cambiar de lente).
- **Evidencia:** condición de la línea 305 y orden de las líneas 91–95. El contador de sesión ya descarta una apertura vieja, así que reabrir siempre sería seguro.
- **¿Nuevo?** Sí. Antes del paso 6 no había forma de cambiar estos ajustes con el grabador abierto.
- **Arreglo:** reabrir siempre que cambie la clave, también durante una apertura. El contador de sesión ya para la apertura anterior. Otra opción: apuntar «hay que reabrir» y hacerlo al terminar la apertura en curso.
- **Test:** extraer la decisión de reabrir a una función pura y comprobar que un cambio durante «abriéndose» no se pierde. En navegador con `fake-media.js`: cambiar calidad y fps seguidos y comprobar el modo pedido a la cámara.

### 🟡 2 · Tras reabrir la cámara con el mismo dispositivo, «Imagen» sigue diciendo «fijo», pero la cámara está en automático · nota 6

- **Dónde:** `RecordStudio.tsx` 443–447 (el estado de imagen solo se reinicia si cambia el dispositivo o la orientación de la cámara), 1400–1404 (etiqueta «Enfoque y luz fijos» y anillo que no se va). En `useCamera.ts`: 208–219 (reapertura al volver de otra app), 301–306 (reapertura por ajustes) y 308–310 (reintentar).
- **Flujo A, el más dañino:**
  1. Toma de lienzo con enfoque y luz fijos.
  2. Entra una llamada o el bailarín cambia de app. La toma se pausa y el móvil para la cámara.
  3. Al volver, la cámara se reabre con el mismo dispositivo.
  4. La pista nueva arranca con enfoque, exposición y balance automáticos. El estado de la app no cambia, porque el dispositivo es el mismo.
  5. El bailarín sigue la toma convencido de que la imagen no «respirará».
- **Flujo B:**
  1. Con la luz a +1 y «Cálida», se cambia la calidad en Ajustes.
  2. La cámara se reabre en automático.
  3. El deslizador sigue en +1 y «Cálida» sigue marcada.
- **Cambio de lente (pregunta del encargo):** al cambiar a 0,5× o a otra lente sí cambia el dispositivo, y todo vuelve a «automático». La interfaz queda coherente, pero no se avisa. En una toma de lienzo en pausa se puede cambiar de lente: la segunda parte pierde el bloqueo sin que nadie lo diga.
- **Protecciones actuales:** la linterna sí se apaga en la interfaz al reabrir (`start` pone `torch: false`). Imagen no tiene nada equivalente.
- **Impacto:** el objetivo de C2 (que la imagen no cambie en toda la toma) falla sin que se vea. La interfaz dice lo contrario, y el anillo dorado se queda en pantalla.
- **Evidencia:** las dependencias del efecto de las líneas 443–447 son solo `view.deviceId` y `view.facing`. Cada reapertura crea una pista nueva con `getUserMedia`, y los ajustes de `applyConstraints` son de la pista vieja.
- **¿Nuevo?** Sí (paso 5, agravado por la reapertura del paso 6).
- **Arreglo:**
  - Lo mejor: reaplicar exposición, balance y bloqueo a la pista nueva cuando la cámara vuelve a estar lista con el mismo dispositivo, y comprobar después con la configuración real de la pista.
  - Lo mínimo: reiniciar el estado en cada apertura (por ejemplo, con un contador de aperturas en la vista) y avisar «La cámara se ha reiniciado: vuelve a fijar el enfoque» si estaba fijo.
  - Al cambiar de lente con el enfoque fijo, avisar también.
- **Test:** con `fake-media.js`, fijar el enfoque, simular volver de otra app y comprobar que la etiqueta desaparece o que se ha vuelto a pedir el bloqueo. Probar también la función que decide qué reaplicar.

### 🟡 3 · Mantener pulsado para fijar puede fijar el enfoque y la luz de antes, y con exposición manual sin ISO (hipótesis) · nota 6

- **Dónde:** `RecordStudio.tsx` 471–484 (`focusHere`: primero enfoca en el punto y en seguida bloquea) y `camera.ts` 215–233 (`lockFocusExposure` copia la distancia de enfoque y el tiempo de exposición de ese instante).
- **Flujo:**
  1. El bailarín mantiene pulsado sobre el grupo.
  2. Se pide enfocar y medir en ese punto. La promesa se cumple cuando la cámara acepta la orden, no cuando ha terminado de enfocar.
  3. Justo después, la app lee la distancia de enfoque y el tiempo de exposición actuales y los fija en manual.
- **Por qué falla (hipótesis, sin probar en el S24):**
  - **Enfoque y luz:** el enfoque automático tarda de 100 a 500 ms en llegar al punto nuevo. Lo leído es lo que había antes de pulsar, así que la imagen vuelve al enfoque y la luz anteriores y se quedan fijos ahí. Es lo contrario de lo que se pidió.
  - **ISO:** el modo manual fija solo el tiempo de exposición. Con la exposición automática apagada, el móvil puede usar una sensibilidad por defecto en lugar de la que tenía. En un local oscuro, la imagen podría oscurecerse de golpe al fijar.
  - **Comprobación:** la app da el bloqueo por bueno si la orden se acepta, sin comprobar el modo que queda de verdad.
- **Protecciones actuales:** si no hay modo manual se usa «una vez» (`single-shot`), que sí enfoca en el punto y se queda. Pero el código prefiere el manual cuando existe, y el S24 probablemente lo ofrece.
- **Impacto:** el gesto que más importa de C2 deja la imagen desenfocada en el grupo, o con un salto de brillo, durante toda la toma.
- **¿Nuevo?** Sí (paso 5).
- **Arreglo:**
  - Para el gesto de mantener pulsado, usar enfoque y exposición «una vez» en el punto, que es exactamente «enfoca aquí y quédate».
  - O esperar a que el enfoque se asiente (leer la distancia de enfoque hasta que deje de cambiar, con un máximo de unos 800 ms) antes de fijarlo.
  - Si se usa exposición manual, fijar también la sensibilidad que tenía la cámara.
  - Después, leer la configuración real y solo entonces mostrar «Enfoque y luz fijos».
- **Test:**
  - En dispositivo: enfocar con un objeto cerca y mantener pulsado sobre el fondo lejano. Debe quedar nítido el fondo y sin salto de brillo, en luz normal y en penumbra.
  - Automático: con una pista falsa, que el bloqueo se pida con lo leído después de asentarse.

### 🟡 4 · El botón atrás cierra el grabador entero si hay un panel abierto · nota 5

- **Dónde:** `RecordStudio.tsx` 1041 (solo el grabador se registra para el botón atrás); `RecorderSettingsTray.tsx`, `RecorderSettingsFan.tsx`, `RecorderSettingsScroll.tsx` e `ImageControls.tsx` (ninguno lo hace).
- **Flujo:**
  1. En reposo, se abre Ajustes (o Imagen, o un grupo del Abanico).
  2. Se pulsa atrás o se hace el gesto de volver de Android, que es la forma natural de cerrar una hoja.
  3. El grabador no está «ocupado» en reposo, así que se cierra entero. Se apaga la cámara y hay que volver a entrar.
- **Con la toma en pausa y el panel Imagen abierto:** el atrás se trata como «salir del grabador». Aparece «¿Descartar la toma?» y el panel desaparece. No se pierde nada, porque hay confirmación, pero desconcierta.
- **Protecciones actuales:** Esc funciona bien en los tres paneles (en el Abanico, primero vuelve atrás y luego cierra). El atrás no.
- **Impacto:** flujo claramente peor en móvil. No hay pérdida de datos.
- **¿Nuevo?** Sí para Ajustes, Abanico e Imagen. El panel «i» ya tenía este comportamiento antes.
- **Arreglo:** que cada panel use `useBackToClose` mientras está abierto. En el Abanico, el atrás debe hacer lo mismo que Esc: primero volver al abanico, luego cerrar. Así, como en los diálogos de la app, el atrás cierra la capa de arriba.
- **Test:** con un e2e, abrir Ajustes, ejecutar `history.back()` y comprobar que el grabador sigue abierto y el panel no.

### 🟡 5 · En horizontal (≈360 px de alto) el panel «Imagen» no cabe y el botón de fijar queda cortado · nota 5

- **Dónde:** `ImageControls.tsx` 65: en horizontal se coloca arriba, sin altura máxima ni desplazamiento, dentro de un contenedor que recorta (`overflow-hidden` en la raíz del grabador).
- **Cálculo, con los tres controles que probablemente ofrece el S24:**
  - Relleno: 32 px.
  - Cabecera: 44 px.
  - Luz: unos 120 px (etiqueta, deslizador de 44 y fila «Restablecer» de 44).
  - Color de la luz: unos 130 px. Los cinco chips no caben en una fila de 288 px y bajan a dos.
  - Botón de fijar: 60 px.
  - Ayuda: unos 40 px.
  - **Total: unos 430 px.** Con 12 px de margen arriba quedan unos 348 px, así que se cortan unos 80 px: el botón «Fijar enfoque y luz» y el texto de ayuda.
- **Impacto:** en horizontal no se llega al bloqueo desde el panel. Queda el gesto de mantener pulsado, que el texto cortado ya no explica. El panel tapa además parte de los chips de zoom de la columna derecha.
- **Evidencia:** las clases de la línea 65 (no hay `max-h` ni `overflow-y-auto`) y la suma de alturas de arriba. No lo he medido en un navegador.
- **¿Nuevo?** Sí (paso 5).
- **Arreglo:** en horizontal, limitar la altura al espacio disponible con desplazamiento interno, o repartir el panel en dos columnas (Luz | Color + Fijar). Ponerlo a la izquierda de la columna de controles sin solaparla.
- **Test:** e2e a 780 × 360 con una cámara falsa que ofrezca los tres controles. El botón de fijar debe quedar dentro de la ventana.

### 🟡 6 · Tocar la opción que ya se ve marcada puede sobrescribir el ajuste guardado · nota 5

- **Dónde:** `controls.tsx` 113–117 (un toque guarda siempre el valor tocado). Las flechas sí lo evitan (66–67). En `model.ts`, el valor mostrado no es el guardado en 129–130 y 180–186 (fps sin 60) y en 134 y 242–249 (sonido con YouTube).
- **Flujo:**
  1. Con la cámara frontal, que da 30 fps como máximo, la fila de fotogramas muestra «30» marcado. El ajuste guardado sigue en 60 para cuando haya una cámara que lo dé.
  2. El bailarín toca «30» para confirmar y se guarda 30.
  3. Al volver a la trasera, que sí da 60, graba a 30.
  4. Con YouTube pasa igual: «Micrófono» se ve marcado y «Canción limpia» desactivada. Tocar «Micrófono» guarda el micro, y la próxima toma con un archivo graba la sala en vez de la canción limpia.
  5. En el laboratorio, el perfil de ejemplo «1080p · 30 · YouTube» provoca lo mismo sobre los ajustes reales del móvil.
- **Protecciones actuales:** el chip resumen y la etiqueta de sonido muestran luego lo que pasa, así que se puede descubrir. El código de las flechas ya reconoce el problema: tiene un comentario para no volver a guardar el valor mostrado encima del guardado.
- **Impacto:** un ajuste cambia sin que se vea en el momento y afecta a tomas posteriores con otra cámara u otro vídeo.
- **¿Nuevo?** Sí (paso 6).
- **Arreglo:** en el toque, no guardar si la opción tocada ya es la marcada, igual que hacen las flechas.
- **Test:** sacar la lógica de los campos a una función pura (ajustes guardados + capacidades → campos) y probar que elegir el valor mostrado no cambia el guardado cuando difieren.

### 🟢 7 · Mientras la cámara se reabre, las opciones de resolución y fps saltan bajo el dedo · nota 4

- **Dónde:** `RecordStudio.tsx` 439 (la información de la cámara es «nula» si no está lista) y 1432–1435. `model.ts` 121 (sin información, se ofrecen todos los tamaños) y 129 (60 queda disponible).
- **Flujo:**
  1. En una cámara que llega a 1080p, la fila de resolución muestra Auto, 1080p y 720p.
  2. Al tocar 720p, la cámara se reabre y durante ese tiempo la fila pasa a mostrar Auto, 4K, 1440p, 1080p y 720p. Los botones se estrechan y se recolocan.
  3. Al terminar vuelve a tres opciones.
- **Cuándo pasa:** un segundo toque en ese tiempo cae en otra opción, por ejemplo 4K, que esta cámara no da. Con la nota del hallazgo 1, además, ese toque se pierde.
- **¿Nuevo?** Sí.
- **Arreglo:** recordar las capacidades por cámara (máximo de tamaño y de fps) y no pasar «nulo» al panel mientras se reabre la misma cámara.
- **Test:** función pura del punto 6 con la información «desconocida» frente a «conocida». En e2e, comprobar que el número de opciones no cambia durante la reapertura.

### 🟢 8 · Tocar para enfocar no tiene en cuenta el zoom digital, y el anillo aparece aunque el móvil no pueda enfocar en un punto · nota 4

- **Dónde:** `RecordStudio.tsx` 456–469 (`framePoint`) y 471–478 (`focusHere`); `compositor.ts` 131–141 (el zoom digital recorta el centro).
- **Zoom digital:** con zoom digital (cámara frontal, móviles sin zoom de lente, iPhone), la vista previa muestra solo el centro de la imagen. A 2×, tocar el borde izquierdo de la pantalla manda enfocar al borde izquierdo de la imagen completa, que ni siquiera se ve. Lo correcto sería el punto a un cuarto del ancho. Tampoco se corrige en una toma de lienzo con el móvil girado, donde el lienzo sale con bandas.
- **Anillo:** sin la opción de enfocar en un punto, el toque dibuja igualmente el recuadro dorado, que aparenta enfocar sin hacer nada. El plan (C1) pide que lo que no existe no aparezca.
- **¿Nuevo?** Sí (paso 5).
- **Arreglo:** deshacer el zoom digital en la conversión (punto en pantalla → punto en el fotograma). Mostrar el anillo solo si se va a pedir algo a la cámara.
- **Test:** sacar la conversión a una función pura (tamaño de la caja, tamaño del vídeo, espejo, zoom digital) y probar bandas, espejo y 2×.

### 🟢 9 · El deslizador de luz manda una orden a la cámara y vuelve a pintar todo el grabador en cada movimiento, también grabando (hipótesis) · nota 4

- **Dónde:** `ImageControls.tsx` 98 y `RecordStudio.tsx` 551–554. El botón «Imagen» también está disponible grabando (1292 y 1344).
- **Problema:** arrastrar el deslizador genera decenas de eventos por segundo. Cada uno vuelve a pintar `RecordStudio` (unas 1.900 líneas) y pide un `applyConstraints` sin esperar al anterior.
- **Impacto (hipótesis):** en una toma de lienzo, que dibuja en el hilo principal, puede costar fotogramas mientras se arrastra. En la cámara, las órdenes se acumulan y la luz va con retraso detrás del dedo.
- **¿Nuevo?** Sí.
- **Arreglo:** mandar a la cámara como mucho una orden por fotograma (o al soltar) y, si hay una en curso, quedarse solo con el último valor. Opcionalmente, guardar el valor del deslizador fuera del estado del grabador.
- **Test:** perfil de rendimiento en gama media arrastrando durante una toma de lienzo. Comparar los fotogramas perdidos del panel «i».

### 🟢 10 · Las tres variantes del panel se cargan siempre con el estudio · nota 3

- **Dónde:** `RecorderSettingsSheet.tsx` 1–3 (importa las tres variantes directamente). En el build, el trozo `RecorderSettingsSheet` ocupa 42,3 kB (13,5 kB comprimido) y `StudioPage` lo importa directamente.
- **Impacto:** el Abanico y el Makimono (unas 770 líneas) se descargan y analizan cada vez que se abre un estudio, aunque casi nadie los elija. El trozo comparte código con el almacén de ajustes, así que no se puede separar sin tocar el reparto.
- **¿Nuevo?** Sí.
- **Arreglo:** dejar la Bandeja directa y cargar el Abanico y el Makimono con `lazy` solo si están elegidas. Cuando el laboratorio decida, quitar las que sobren.
- **Test:** comprobar en el build que el trozo del estudio no contiene «Toca una varilla» ni «Desliza para ver más».

### 🟢 11 · Chip resumen: 36 px, desactivado sin explicación y no cierra los otros paneles · nota 3

- **Dónde:** `RecordStudio.tsx` 1273–1288.
- **Tamaño:** el botón mide 36 px de alto (`min-h-9`) aunque su caja sea de 44. DESIGN.md pide 44 px.
- **Desactivado:** en pausa o grabando, el chip queda desactivado. El toque no hace nada y un lector de pantalla no puede llegar a él. El riel, en cambio, explica por qué no se puede girar en una toma directa.
- **Paneles:** al abrir Ajustes desde el chip no se cierran «Imagen» ni «i» (el botón del riel sí los cierra). Quedan dos paneles abiertos, y un solo Esc cierra los dos, porque los dos escuchan Esc en la ventana.
- **¿Nuevo?** Sí.
- **Arreglo:** alto de 44 px, cerrar Imagen e «i» al abrir desde el chip y, en pausa, mostrar un aviso («Los ajustes se cambian entre tomas») en vez de desactivarlo.

### 🟢 12 · Chip de sonido: 36 px, dice «estéreo» sin comprobarlo y desaparece al cambiar · nota 3

- **Dónde:** `RecordStudio.tsx` 1457–1489 y 416–419.
- **Tamaño:** el botón para cambiar entre canción y micro mide 36 px.
- **«Estéreo»:** la etiqueta pone «(estéreo)» según el ajuste, no según la pista que da el móvil. Si el móvil da un solo canal, lo que se dice no es cierto.
- **Al tocarlo:** el chip pasa a «pendiente», desaparece hasta que el micro abre y vuelve a aparecer. Se pierde el foco y la fila salta.
- **Dar a grabar en ese momento:** si se da a grabar sin cuenta atrás mientras el micro se abre (o con el aviso de permiso en pantalla), la toma sale sin sonido. Sí se avisa.
- **¿Nuevo?** Sí (paso 5 y 6).
- **Arreglo:**
  - 44 px.
  - Leer el número de canales real de la pista para decir «estéreo».
  - Mantener el chip visible con un estado «Abriendo el micro…».
  - No empezar la cuenta atrás mientras el sonido está pendiente.

### 🟢 13 · El aviso de calor habla de «calidad Máxima» aunque la causa sea el 4K con otra calidad · nota 3

- **Dónde:** `RecordStudio.tsx` 983–989.
- **Problema:** la toma cuenta como pesada con calidad Máxima o con más de 1440p. Con resolución fijada en 4K y calidad Alta o Auto, el aviso dice «Llevas más de 6 min en calidad Máxima… mejor Alta», cuando ya está en Alta.
- **Arreglo:** dos textos. Uno para Máxima («mejor Alta») y otro para 4K («mejor 1080p»). Mejor aún, una función pura en `shared` que decida el texto, con su test.

### 🟢 14 · Panel «Imagen»: el foco no vuelve al cerrar y el balance de blancos no responde a las flechas · nota 3

- **Dónde:** `ImageControls.tsx` 44–54 y 115–135.
- **Foco:** al abrir, el foco pasa al botón de cerrar. Al cerrar no vuelve al botón «Imagen» del riel: se queda en el cuerpo de la página.
- **Balance de blancos:** el grupo se anuncia como grupo de opciones, pero no se mueve con las flechas y todas las opciones son paradas del tabulador. Los grupos del panel de ajustes (`Choice`) sí lo hacen bien.
- **Arreglo:** guardar el foco anterior y devolverlo al cerrar. Usar el mismo componente `Choice` para el balance.

### ⚪ 15 · Textos de calidad que no cuadran con una resolución fija, y «Auto» promete de más · nota 2

- **Dónde:** `model.ts` 84–89 y 153–156.
- **Problema:** con la resolución fijada, «Ahorro: 720p a 30 fps» puede grabar a 1080p y 60 fps. «Auto: lo mejor que este móvil graba sin cortes» es siempre 1080p a 60, sin la prueba de cámara que describe el plan.
- **Arreglo:** si la resolución no es Auto, que la ayuda de calidad diga solo la compresión. Para Auto: «1080p a 60 si la cámara puede».

### ⚪ 16 · El laboratorio cambia los ajustes reales del grabador sin decirlo · nota 2

- **Dónde:** `RecorderSettingsDemo.tsx` 30–38 (es intencionado, según el comentario).
- **Problema:** en la página de Ajustes nada indica que probar la demostración cambia la calidad, el sonido o los fps de verdad. Junto con el hallazgo 6, el perfil «YouTube» puede dejar el sonido en micrófono.
- **Arreglo:** una línea bajo la demostración: «Los cambios se guardan: son tus ajustes del grabador». O usar un almacén de prueba aparte.

### ⚪ 17 · Tocar la imagen con el enfoque fijo lo suelta, y si soltar falla la interfaz sigue en «fijo» · nota 2

- **Dónde:** `RecordStudio.tsx` 478–482.
- **Comportamiento:** un toque con el bloqueo puesto enfoca en continuo y suelta el bloqueo, como en la app Cámara. Está bien, pero en plena toma basta un toque accidental de alguien del grupo para soltar un bloqueo pensado «para toda la toma».
- **Si soltar no se puede:** si el móvil no tiene modo continuo de exposición, la orden de soltar falla. La interfaz sigue en «fijo» aunque el enfoque ya va en continuo.
- **Arreglo:** que grabando no se pueda soltar con un toque (solo desde el panel), y leer el estado real tras soltar.

### ⚪ 18 · Comentario contradictorio en el laboratorio y colores sueltos · nota 1

- **Comentario:** `designLab.ts` 79 dice que con el laboratorio apagado se usan los diseños recomendados. El código, los tests y el texto de la página dicen lo contrario: se siguen usando las elecciones guardadas. Hay que corregir el comentario.
- **Colores:** algunas sombras usan colores de la paleta escritos a mano (`controls.tsx` 147–148, `RecorderSettingsTray.tsx` 113, `RecorderSettingsFan.tsx` 321) en vez de los tokens. El patrón ya existía en la app, así que es menor.

---

## Respuestas a las preguntas del encargo

- **Cambiar ajustes con una toma en pausa:** no se puede, y está bien resuelto. El panel solo se abre en reposo sin grabadora y se cierra si la fase cambia. El chip queda desactivado (hallazgo 11 para el detalle). El sonido no cambia a mitad de toma.
- **Reapertura al cambiar calidad, resolución o fps:** funciona en el caso normal y no toca la toma, porque solo pasa entre tomas. Fallan los cambios rápidos (1), el estado de Imagen (2) y las opciones que saltan (7).
- **¿El bloqueo de enfoque sobrevive a cambiar de lente?** No. Se reinicia sin aviso (2). Con el zoom de la propia lente (1× → 2×) sí se mantiene, porque la pista es la misma.
- **Accesibilidad y móvil:**
  - Bien: trampa de foco, Esc y devolución del foco en los tres paneles; 44 px dentro de los paneles; textos en español de España, claros y sin jerga, salvo «lienzo»; adaptación a horizontal en los tres paneles.
  - Mal: el botón atrás (4), Imagen en horizontal (5) y los dos chips de 36 px (11, 12).
- **Rendimiento:**
  - Bien: las animaciones son de transform y opacity, incluido el muelle del interruptor (escala en X, no anchura). El nivel solo escucha el sensor mientras está activado y no vuelve a pintar React en cada lectura.
  - Mal: las variantes cargadas siempre (10) y el deslizador de luz (9).
- **Diseño:**
  - La Bandeja es fiel a DESIGN.md: lámina laca, celdas bento, sellos, `jelly`/`soft`/`snappy`, sin cristal ni degradados.
  - El Abanico y el Makimono son más decorativos. El Makimono pone una gran superficie clara (washi) sobre la cámara, que en un local oscuro deslumbra. Además, los dos piden dos gestos por cambio (Abanico) o deslizar en horizontal (Makimono). Para el principio «la práctica primero», la Bandeja es la buena elección por defecto.
- **Dependencias y tests:** se añade vitest 3.2.7, la misma versión que ya usa `shared`, así que no se duplica. `pnpm test` en la raíz pasa: 73 tests en `shared` y 15 en `web`. La configuración solo incluye `*.test.ts`. Para tests de componentes hará falta `*.test.tsx` y un entorno DOM.

---

## Tests que faltan

1. **Campos del panel** (`model.ts`): sacar a función pura y probar:
   - qué tamaños se ofrecen según el máximo de la cámara;
   - 60 desactivado con cámaras de 30 y la nota de 4K;
   - el sonido con YouTube;
   - que elegir el valor mostrado no sobrescribe el guardado (6).
2. **Controles de cámara** (`camera.ts`): con una pista falsa, comprobar lo que piden `focusAt`, `lockFocusExposure` y `setWhiteBalance` según los modos disponibles. Que el bloqueo use lo leído después de asentarse (3).
3. **Conversión del toque** (`framePoint`): bandas negras, espejo de la frontal y zoom digital (8).
4. **Reapertura de la cámara:** que un cambio durante «abriéndose» no se pierda (1) y que el estado de Imagen se reaplique o se reinicie al reabrir (2).
5. **Aviso de calor:** función pura de umbral y texto (13).
6. **Geometría del Abanico** (`fanGeometry` es pura): que las tiras no se solapen ni se salgan en 360 × 780, 780 × 360 y 320 × 568.
7. **Nivel:** sacar el cálculo del ángulo a una función pura. Probar vertical recto, horizontal recto e inclinado 5°.
8. **`sanitizeSettings`** de `settings.ts` (paso 3): sigue sin test en `apps/web`, ahora que hay vitest.
9. **e2e con `fake-media.js`:**
   - abrir Ajustes, cambiar calidad y fps seguidos y comprobar el modo de la cámara;
   - el botón atrás con un panel abierto;
   - Imagen a 780 × 360.

## Comprobaciones hechas

- `pnpm typecheck` en `C:\Users\iangi\oneshoot-check` (en `b59550e`): pasa.
- `pnpm test`: pasa (`shared` 73 tests en 4 archivos; `web` 15 tests en `labState.test.ts`).
- `pnpm build`: pasa.
  - `RecorderSettingsSheet` ocupa 42,28 kB (13,49 kB comprimido) y lo importan directamente `StudioPage` y `RecorderSettingsDemo`.
  - `SettingsPage` ocupa 7,3 kB y carga la demostración bajo demanda.
  - Precaché de la PWA: 33 entradas, 1.083 KiB.
- Lectura completa de los archivos nuevos y de los cambios en `RecordStudio.tsx`, `camera.ts`, `useCamera.ts`, `recorder.ts`, `InfoPanel.tsx`, `App.tsx` y `AppShell.tsx`.
- Contraste revisado sobre los valores de `index.css`: el texto de ayuda gris claro sobre laca da 5,8:1 y el gris sumi sobre washi 7,8:1.

## Hipótesis sin verificar (necesitan el móvil)

- **Coordenadas del toque en vertical:** no sé si Chrome Android gira bien el punto de enfoque en vertical (si interpreta las coordenadas sobre el fotograma girado o sobre el del sensor). Hay que probar en el S24: tocar arriba a la izquierda y ver dónde enfoca.
- **Estéreo real:** no sé si Chrome Android da de verdad dos canales con el procesado de audio apagado.
- **Respuesta de la cámara:** no sé si Chrome responde «bien» a órdenes de enfoque o exposición que la cámara ignora. Eso refuerza leer el estado real tras cada cambio (3, 17).
- **Riel en vertical:** en reposo con la trasera del S24 puede tener hasta 8 botones y llegar a unos 614 px de los 780. Podría solaparse con la tarjeta de «toma sin guardar» o con el aviso de poco espacio, que suben desde abajo a lo ancho. No lo he medido.

## Limitaciones

- No he podido probar en un Samsung ni en un navegador con cámara. Los hallazgos 3 y 9 son hipótesis basadas en cómo funciona la API, y la altura del 5 está calculada, no medida.
- No he revisado los cambios del mismo rango que corresponden a correcciones de pasos anteriores (familias de formatos fallidos, `noSpace`, temporizador de «encoder mudo») más allá de comprobar que no chocan con los pasos 5 y 6.
- No he revisado el árbol de trabajo (F1/F2).
