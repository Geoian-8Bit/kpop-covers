# Revisión · Grabación · Correcciones · Ronda 3

**Alcance:** las correcciones del commit `b59550e` (`git diff 34776d1..b59550e -- apps/web/src/features/record packages/shared/src/recording.ts`) a los hallazgos de nota 5 o más de:

- `grabacion-pasos1-2-ronda-2.md` (N1–N13 y la tabla de estado de la ronda 1);
- `grabacion-pasos3-4-ronda-1.md` (hallazgos 1–4 y el 0,5× «fuera de alcance»).

El panel de ajustes del paso 6 (`settings/`, rejilla, nivel, aviso de calor), que llega en el mismo commit, no se revisa aquí. Solo se toca cuando afecta a una corrección.

**Base revisada:** el commit `b59550e`, leído de git y comprobado en el worktree limpio `oneshoot-check`. Las líneas citadas son las del commit. El árbol de trabajo principal tiene cambios sin commit de otra funcionalidad, que no se miran.

**Escala:** 9–10 pérdida de datos o no funciona · 7–8 fallo plausible · 5–6 caso límite · 3–4 calidad · 1–2 cosmético.

---

## Resumen

- **Casi todas las correcciones están bien hechas.**
  - El grabador que no produce datos ya se marca como malo, por familia de códec, con caducidad, con la versión del navegador y con un botón para volver a probar.
  - La toma guardada en un móvil sin sitio para la descarga ya no se borra.
  - Descartar siempre borra la copia.
  - Los fotogramas se miden de verdad en el modo lienzo, y la toma directa enseña sus fps reales.
  - Los botones «Girar» y «Lente» se ven y se explican. El 0,5× abre el gran angular en 0,5×.
- **Regresión grave en iPhone.** Al sacar el iPhone de la toma directa, el lienzo ya no dibuja nunca en el modo «Automático». El botón de grabar no hace nada: el iPhone no puede grabar con los ajustes por defecto (A, nota 9).
- **Regresión en la app instalada.** La rotación se bloquea al tocar grabar, no al empezar la toma. Si se gira el móvil durante la cuenta atrás (por ejemplo, al ponerlo en el trípode), la toma entera sale tumbada y no salta ningún aviso (B, nota 6).
- **Riesgo por medir en el dispositivo.** El vigilante de 3,5 s da por muerto el grabador si no ha llegado ningún trozo. Si en el S24 el MP4 tarda más en entregar el primero, cortaría tomas buenas a los 3,5 s (C, hipótesis).
- En un navegador normal (sin instalar la app), `screen.orientation.lock` falla y **todas las tomas van por el lienzo**. Funciona, y el lienzo se dibuja a tiempo, pero la toma directa (Q5) solo existe en la app instalada (G).

| Gravedad | Nº | Notas |
| --- | --- | --- |
| 🔴 | 1 | 9 |
| 🟡 | 2 | 6, 5 |
| 🟢 | 4 | 4, 3, 3, 3 |
| ⚪ | 2 | 2, 2 |

---

## Estado de los hallazgos anteriores (nota ≥ 5)

### Pasos 1 y 2 (ronda 2)

| Hallazgo (nota) | Estado | Comprobación |
| --- | --- | --- |
| N1 · El codificador que no arranca no se marca (7) | **Corregido** | Ahora se marca si el grabador no entregó ningún trozo, dure lo que dure (`RecordStudio.tsx:711`). Además, un vigilante para el grabador si a los 3,5 s no ha llegado ningún trozo (`recorder.ts:140-141` y `187-189`), y la toma vacía avisa «Este formato no funciona en este móvil…». Hay dos matices: el vigilante puede cortar tomas buenas si el primer trozo tarda (C), y el umbral para las tomas terminadas a mano ha desaparecido (D). |
| N2 · Toma que cupo pero no deja sitio a la descarga (7) | **Corregido** | `takeKept` vuelve a medir el espacio libre y lo compara con 1,1 veces el tamaño de la toma (`RecordStudio.tsx:1067-1081`). Si no cabe, no la marca como guardada, avisa de que se compruebe Descargas y la conserva para ofrecerla otra vez. `noSpace` se guarda en `meta.json` al fallar una escritura (`takeStore.ts:215-217`), y al recuperar la toma se vuelve a aplicar (`RecordStudio.tsx:1187`). Matices: hay una carrera de milisegundos con «Repetir» (H). La marca en `meta.json` puede no escribirse con el disco lleno, pero la nueva medida al guardar lo cubre. |
| N3 · Se marca la cadena y no el códec (6) | **Corregido** | `codecFamily` agrupa HEVC, H.264 High, Main, Baseline, avc1 a secas, VP9 y VP8, y tiene test (`recording.ts:139-154`, `recording.test.ts:117-129`). Con un solo fallo HEVC, la siguiente toma va en H.264 High. Lo mismo pasa en el bucle de `roll()`. |
| N4 · Marcas para siempre, sin versión y por cualquier error (5) | **Corregido** | Las marcas guardan el agente de usuario y caducan a los 30 días (`recorder.ts:38-53`). En `roll()` solo cuenta `NotSupportedError` (`RecordStudio.tsx:796-798`). El panel «i» enseña «Formatos que fallaron aquí» y tiene el botón «Volver a probar» (`InfoPanel.tsx:189-205`). Matices menores en D, J y en el punto «errores que no son del formato» de D. |
| N5 · Descartar una toma «sin espacio» no la borra (5) | **Corregido** | Una toma no guardada se borra siempre al dejarla (`RecordStudio.tsx:211`). «Sin espacio» solo protege a las guardadas (`212`). |
| F1 / G1 · Sin plan B si el formato no graba (7) | **Corregido** | Queda resuelto con N1, N3 y N4. Sigue el texto «Este navegador no puede grabar vídeo…» (`RecordStudio.tsx:818`; N12, nota 2). |
| P2-1 · «Guardar» da la toma por guardada sin saberlo (7) | **Corregido** | Ver N2. El aviso «comprueba que la toma está en Descargas» solo sale cuando falta espacio, que es el caso que importa. |
| F5 / J4 · El panel «i» no cumple la regla de diálogos (5) | **Parcial (sin cambios)** | Este commit no lo toca. El gesto «atrás» con el panel abierto en reposo sigue cerrando el grabador entero. No hay trampa de foco. N6 sigue igual. |
| P2-9 · `listLeftovers` borra ante errores (5) | **Parcial (sin cambios)** | Sin cambios en `takeStore.ts` salvo `noSpace`. N8 (nota 4) sigue igual. |
| N13 · Toma terminada tras cerrar, con cerrojo (2) | **Corregido** | Ahora se suelta el cerrojo y la toma se ofrece la próxima vez (`RecordStudio.tsx:702-706`). |

### Pasos 3 y 4 (ronda 1)

| Hallazgo (nota) | Estado | Comprobación |
| --- | --- | --- |
| 1 · Toma directa también en iPhone (7) | **Corregido, con regresión** | `directPossible` excluye iOS (`RecordStudio.tsx:327`). Pero nada pone el lienzo a dibujar en iPhone antes de grabar, y el botón de grabar no responde (A, nota 9). |
| 2 · Al girar en una toma directa, la pausa llega tarde (6) | **Corregido, con regresión** | La toma directa solo se hace con la rotación bloqueada (`lockForDirect`, `RecordStudio.tsx:260-286`). `go()` espera al bloqueo (`845-853`) y `roll()` exige `locked` (`756`). Si el bloqueo falla, la toma va por el lienzo y el lienzo se prepara a tiempo. Se desbloquea en todas las salidas normales. Restos: el bloqueo se pide al tocar grabar, antes de la cuenta atrás (B), y hay una carrera si se cancela o se cierra antes de que resuelva (F). |
| 3 · Fotogramas perdidos contra los fps nominales (5) | **Corregido** | Lienzo: los dibujados se comparan con los que llegaron de la cámara, contados en cada parte (`RecordStudio.tsx:687-698`, `768-771`). Directa: no se habla de «perdidos». El panel enseña «no aplica (imagen directa)» y los fps reales (`InfoPanel.tsx:218-225`). Con poca luz ya no hay falsas alarmas: lo esperado es lo que dio la cámara. Detalle: en navegadores sin `requestVideoFrameCallback`, dibujados y llegados son siempre iguales y salen «0 perdidos» (J). |
| 4 · Toma directa en pausa: controles mudos (5) | **Parcial** | «Girar» y «Lente» se ven atenuados, con `aria-disabled`, y al tocarlos explican por qué (`RecordStudio.tsx:590-593`, `1295-1341`, `1804-1806`). Siguen mudos los chips de zoom y el pellizco: el 0,5× o el 2× sin zoom de lente no hacen nada ni explican nada (`RecordStudio.tsx:1627`, `useCamera.ts:228` y `248-253`). Tras un reinicio de la cámara, el aviso nombra «Listo», pero no lleva un botón «Terminar y guardar». |
| 5 · El aviso recomienda opciones que no existen (4) | **Corregido** | Ahora remite a «los ajustes del grabador», que ya existen (paso 6). |
| 9 · Textos «✓» en vez de «Listo» (3) | **Parcial** | Los tres avisos dicen «Listo». La línea de pausa sigue diciendo «toca para seguir o ✓ para terminar» (`RecordStudio.tsx:1676`). |
| 0,5× abre el gran angular y lo acerca a 1× (5, fuera de alcance) | **Corregido** | `pickZoom` pasa el zoom pedido a `start` (`useCamera.ts:249`). Con la escala 0,5 del gran angular cae justo en 0,5×, sin zoom de lente ni recorte. |

---

## Hallazgos nuevos

### 🔴 A · En iPhone, el botón de grabar no hace nada con los ajustes por defecto · nota 9

- **Dónde:**
  - `RecordStudio.tsx:327`: `directPossible` excluye iOS.
  - `RecordStudio.tsx:572` y `598-601`: el lienzo solo dibuja si es la imagen («Siempre lienzo», zoom digital o toma de lienzo).
  - `RecordStudio.tsx:922-925` (`frameReady`) y `930`: guarda del botón.
  - `RecordStudio.tsx:265-268`: `lockForDirect` sale antes de preparar el lienzo.
  - `compositor.ts:94-97` y `206-209`: el lienzo nace en 2×2 y, si está congelado, no dibuja.
- **Flujo:**
  1. Se abre el grabador en un iPhone, en «Automático» y a 1×.
  2. `useCamera` crea el lienzo, y en el mismo montaje el estudio lo congela, porque no es la imagen. Se queda en 2×2 y no dibuja nunca.
  3. Se toca grabar. `directPossible()` dice que no, por ser iOS. `frameReady()` mira el ancho del lienzo, que es 2, y también dice que no.
  4. `shutter()` sale sin hacer nada y sin ningún aviso.
- **Condiciones:** cualquier iPhone o iPad con el modo «Automático» (el de serie) y sin zoom digital. Solo funciona tras elegir «Siempre lienzo» en los ajustes o tras usar el zoom digital alguna vez en la sesión. Antes de este commit, en iPhone se grababa en directa y el botón funcionaba.
- **Impacto:** grabar no funciona en iPhone. No afecta a la prueba en el S24, pero la app ofrece iPhone («Guardar en Fotos»).
- **Evidencia:** demostrada por código. He seguido el orden de los efectos: `useCamera` (línea 135) declara sus efectos antes que el de `freeze` (598), así que el lienzo ya existe cuando se congela. El vigilante del lienzo tampoco dibuja si está congelado (`compositor.ts:180`).
- **¿Nuevo?** Sí: es una regresión de la corrección del hallazgo 1.
- **Fix:**
  - Cuando la toma no vaya a ser directa, poner `takeKind` en «lienzo» al tocar grabar, igual que ya se hace cuando falla el bloqueo. `go()` ya espera a que el lienzo tenga imagen.
  - La guarda del botón debe pedir solo que la cámara esté lista, no que el lienzo ya haya dibujado.
  - Alternativa más simple: en iOS, que el lienzo sea siempre la imagen, como antes de Q5.
- **Test:**
  - Sacar a una función pura la decisión «qué imagen usa la toma y si hay que preparar el lienzo», con plataforma, modo, zoom digital, pista viva y bloqueo como entradas. En iOS debe devolver «lienzo, prepararlo ya».
  - e2e con la cámara falsa y un agente de usuario de iPhone: tocar grabar debe llevar a la cuenta atrás.
  - A mano, en un iPhone: abrir el grabador y grabar 5 s sin tocar nada más.

### 🟡 B · En la app instalada, girar el móvil durante la cuenta atrás deja la toma entera tumbada · nota 6

- **Dónde:** `RecordStudio.tsx:932` (el bloqueo se pide al tocar grabar) y `265-286` (se bloquea en la orientación de ese momento). El vigilante de giro (`655-668`) no salta, porque con la pantalla bloqueada el tamaño de la imagen no cambia.
- **Flujo:**
  1. En la PWA instalada, la bailarina toca grabar con el móvil en vertical, con la cuenta atrás de 3 s de serie (o de 5 o 10 s).
  2. La pantalla queda bloqueada en vertical en ese momento.
  3. Durante la cuenta atrás pone el móvil en el trípode en horizontal. La pantalla ya no gira, y la cámara sigue entregando la imagen como si el móvil estuviera en vertical.
  4. La toma directa empieza con ese tamaño y graba toda la canción con la imagen girada 90°.
- **Condiciones:** app instalada (donde el bloqueo funciona), modo «Automático», sin zoom digital, y girar el móvil después de tocar grabar. La cuenta atrás existe precisamente para colocarse.
- **Impacto:** no se pierde nada, pero la toma sale entera de lado y no salta ningún aviso. Antes de este commit, girar durante la cuenta atrás era inofensivo: el tamaño se fijaba al empezar la toma.
- **Evidencia:** demostrada por código el momento del bloqueo. Que Chrome Android gire la imagen de la cámara según la pantalla es la hipótesis de la ronda 1 (hallazgo 2), sin probar en el dispositivo.
- **Fix:**
  - Pedir el bloqueo al acabar la cuenta atrás, en `go()`, con la orientación de ese momento. `go()` ya sabe esperar al bloqueo.
  - O, si se mantiene al tocar grabar, escuchar el cambio de orientación durante la cuenta atrás y volver a bloquear en la nueva.
- **Test:**
  - Función pura «cuándo se fija la orientación» si se extrae.
  - A mano en el S24 (PWA): tocar grabar en vertical, girar en la cuenta atrás y abrir el archivo en Galería.

### 🟡 C · El vigilante de 3,5 s puede cortar tomas buenas si el primer trozo tarda · nota 5 (hipótesis; sube a 8 si se confirma)

- **Dónde:** `recorder.ts:140-141` y `187-189`. El grabador muerto acaba en `onDead` y luego en `finish` (`RecordStudio.tsx:786-791` y `707-716`).
- **Flujo:**
  1. Con `start(1000)`, el código da por hecho que el primer trozo llega en «bastante menos» de 3,5 s.
  2. Puede que el MP4 de Chrome solo entregue datos al cerrar un fragmento, en el siguiente fotograma clave, y que el codificador del móvil espacie los fotogramas clave más de 3 s (por ejemplo, cada 100 fotogramas a 30 fps, unos 3,3 s, o más con poca luz). Entonces el primer trozo llegaría después del vigilante.
  3. Si pasa eso, a los 3,5 s se para el grabador. Al parar, Chrome entrega lo que tenía, así que la toma no está vacía y no se marca el formato.
  4. La bailarina recibe una toma de 3,5 s con «La grabación se ha cortado», y lo mismo en cada toma.
- **Condiciones:** depende de cómo agrupe Chrome el MP4 en ese móvil (HEVC o H.264 por hardware). No lo he podido medir: el navegador de pruebas no me deja abrir una página para medirlo.
- **Impacto:** si se da, no se podría grabar más de 3,5 s en el móvil objetivo. Si no se da, no pasa nada.
- **Evidencia:** razonamiento. El código no comprueba la suposición y no hay ninguna medida en el repositorio.
- **Fix:**
  - Medirlo primero en el S24: anotar cuándo llega el primer trozo con HEVC y con H.264, a 30 y a 60 fps.
  - Que el vigilante no pare a ciegas: a los 3,5 s pedir `requestData()` y esperar a la respuesta, o subir el umbral a 8–10 s.
  - O no parar la toma: dejarla correr y decidir al terminar, con «sin trozos» como señal para marcar el formato.
- **Test:** unitario con un `MediaRecorder` falso que entrega el primer trozo a los 4 s: la toma no debe cortarse. Otro falso que no entrega nada: la toma termina vacía y se marca la familia.

### 🟢 D · Una toma vacía terminada a mano o por la canción al instante marca el formato · nota 3

- **Dónde:** `RecordStudio.tsx:711`. La condición `seconds > 0` se cumple siempre.
- **Flujo:**
  1. Una toma se termina con «Listo», o por el final de un tramo A–B muy corto, antes de que el codificador haya recibido un fotograma.
  2. El archivo sale vacío y sin trozos.
  3. Se marca la familia, sale «Este formato no funciona en este móvil» y se usa la siguiente durante 30 días o hasta la próxima versión de Chrome.
- **Variante:** `NotSupportedError` también lo lanza Chrome al arrancar con un flujo inactivo. En ese caso el bucle de `roll()` marcaría hasta 6 familias en un toque. Hoy es casi imposible: la toma directa comprueba que la pista sigue viva, y la pista del lienzo siempre lo está.
- **Impacto:** se baja de calidad sin motivo. Se recupera con «Volver a probar».
- **Fix:** marcar solo cuando el grabador murió solo (por `onDead` o el vigilante), o cuando la toma terminada a mano duró más de un par de segundos. En el bucle, marcar solo si falla el constructor, y como mucho una familia por toque.
- **Test:** con la decisión en una función pura: «terminada a mano a los 0,3 s, sin trozos» no marca; «murió sola, sin trozos» marca.

### 🟢 G · En el navegador (sin instalar) nunca hay toma directa, y el panel no dice qué camino se usó · nota 4

- **Dónde:** `RecordStudio.tsx:269-284`. El bloqueo de orientación solo funciona en la app instalada o a pantalla completa. Fuera de ahí falla, y la toma va por el lienzo.
- **Respuesta a la pregunta del encargo:** en un Chrome normal el bloqueo se rechaza. El rechazo pone `takeKind` en «lienzo», el lienzo empieza a dibujar y `go()` espera a la vez al bloqueo y al lugar en el disco. Después, el bucle de arranque espera a que el lienzo tenga imagen. La toma sale bien y derecha, y girar durante la toma es inofensivo. Con la cuenta atrás, el lienzo ya dibuja durante esos segundos.
- **Consecuencias:**
  - Las pruebas en el S24 darán resultados distintos según se abra la app desde el navegador o instalada (batería, calor, fotogramas). Nada en el panel «i» dice qué camino usó la toma.
  - Con 4K elegido en los nuevos ajustes, el lienzo dibuja a 4K. El hallazgo 6 de la ronda 1 deja de ser latente.
  - El hallazgo 10 de la ronda 1 (lienzo parado con el tamaño viejo) ahora afecta a todas las tomas del navegador. Si se usó el zoom digital en otra orientación y la canción arranca antes del primer dibujo nuevo, el tamaño viejo queda fijado. La ventana es de unas decenas de milisegundos.
- **Fix:**
  - Añadir «Imagen: directa / lienzo» en «Última toma» del panel «i».
  - Que `frameReady` exija un dibujo posterior a descongelar el lienzo.
  - Documentar en el plan de pruebas que la prueba 3 se hace con la app instalada.
- **Test:** a mano, la misma toma en el navegador y en la app instalada, comparando el panel.

### 🟢 F · Si el bloqueo de orientación resuelve tras cancelar o cerrar, la pantalla se queda bloqueada · nota 3

- **Dónde:** `RecordStudio.tsx:274-285` (el bloqueo se da por hecho al resolver, sin mirar si la toma sigue) y `287-296` (`unlockOrientation` solo desbloquea lo que ya está bloqueado). La salida de `go()` cuando falta el reproductor (`836-838`) tampoco desbloquea ni suelta el lugar en el disco (eso ya pasaba antes).
- **Flujo:** en la PWA, con la cuenta atrás a 0, se toca grabar y enseguida se pausa o se cierra. `dropUnusedSink` ve el bloqueo aún pendiente y no desbloquea. Luego el bloqueo resuelve y la pantalla queda fija hasta la siguiente toma directa o hasta salir de la pantalla completa del estudio. Si la siguiente toma no es directa, `lockForDirect` sustituye el estado sin desbloquear.
- **Condiciones:** una ventana de decenas de milisegundos. Es poco probable.
- **Impacto:** el estudio se queda sin girar después de cerrar el grabador.
- **Fix:** al resolver el bloqueo, si el estado ya no es el actual o la fase no es «countdown»/«arming», desbloquear en el momento. Desbloquear también en la salida de `go()` sin reproductor.
- **Test:** con un `screen.orientation` falso cuyo bloqueo resuelve a los 200 ms, cancelar a los 50 ms y comprobar que se llama a desbloquear.

### 🟢 H · Guardar y tocar «Repetir» antes de medir el espacio programa el borrado de una toma que no cabía · nota 3

- **Dónde:** `RecordStudio.tsx:1067-1081`. `disk.saved` se pone a sí al momento, y `noSpace` llega después, cuando responde `freeSpace()`. `replaceTake` (`208-217`) decide con lo que haya en ese instante.
- **Flujo:** se toca «Guardar en el móvil» y enseguida «Repetir», que no pide confirmación porque la toma ya cuenta como guardada. `replaceTake` ve «guardada, con espacio» y programa el borrado a los 10 minutos. La medida llega después y ya no sirve. Lo mismo pasa al cerrar.
- **Condiciones:** hacen falta dos toques en pocos milisegundos y un móvil lleno.
- **Fix:** marcar «guardada» después de medir, o que `replaceTake` espere a la medida pendiente antes de decidir.
- **Test:** con la política de limpieza como función pura, «guardada + medida pendiente» da «conservar».

### ⚪ I · Textos · nota 2

- `RecordStudio.tsx:1676`: «toca para seguir o ✓ para terminar». Debería decir «Listo».
- `RecordStudio.tsx:1078`: tras «Compartir» o en iPhone (Fotos), el aviso habla de «Descargas».
- `RecordStudio.tsx:590-593`: «…o elige "Siempre lienzo" en los ajustes». En pausa los ajustes no se pueden abrir, y solo valdría para la siguiente toma. Mejor «Para la próxima, elige "Siempre lienzo"…».
- `InfoPanel.tsx:192`: las familias salen con su nombre interno («hevc, avc-high»). Mejor «HEVC, H.264 High».

### ⚪ J · Detalles de las marcas y del contador · nota 2

- `recorder.ts:64-66`: cada marca nueva renueva la fecha de todas, así que una familia vieja no caduca mientras se marquen otras.
- El agente de usuario reducido de Chrome cambia con cada versión mayor, más o menos cada 4 semanas. Tras cada actualización, un móvil con HEVC roto pierde una toma antes de volver a H.264. Es aceptable, pero conviene saberlo para la prueba 3.
- En navegadores sin `requestVideoFrameCallback` (`compositor.ts:162-170`), dibujados y llegados suben a la vez: el panel dice «0 de N» perdidos sin haberlo medido.

---

## Tests que faltan

- **Decisión de imagen (A, B, G):** función pura con plataforma, modo, zoom digital, pista viva y bloqueo. Debe decir si la toma es directa o de lienzo, si hay que preparar el lienzo ya y cuándo se bloquea la orientación.
- **Decisión de marcar formato (C, D):** murió sola, vigilante, terminada a mano, trozos y segundos.
- **Política de limpieza al dejar la revisión (H):** guardada, sin espacio, medida pendiente y descartada.
- **`createTakeRecorder` con un `MediaRecorder` falso (C):** primer trozo tardío, ningún trozo, error a los 50 ms y pausa antes de 3,5 s.
- **e2e con `fake-media.js`:** grabar con un agente de usuario de iPhone (A); y una toma de 10 s en Chromium con MP4, para ver el ritmo de los trozos (C).

## Comprobaciones ejecutadas

- **Worktree limpio en `b59550e`:**
  - `pnpm typecheck` correcto en shared y web;
  - `pnpm test`: 73 tests en shared (incluye el nuevo de `codecFamily`) y 15 en web, todos correctos.
- **Recorridos de punta a punta, leyendo el código:**
  - tocar grabar → `lockForDirect` → cuenta atrás o espera en `go()` → arranque → `roll()` (directa o lienzo) → pausa, giro, pérdida de cámara y reanudar → `finish()` (vacía, sin trozos, con trozos) → revisión;
  - guardar, compartir, «Repetir», «Borrar», cerrar y recuperar;
  - todas las salidas que desbloquean la orientación (`finish`, `roll` con error, `discardTake`, cierre, cuenta atrás cancelada, pausa en «arming», tiempo agotado desde reposo).
- **Orden de los efectos de React al abrir:** el lienzo se crea antes de congelarse, que es la base de A.
- **Contadores del lienzo:** dibujados frente a llegados, con saltos de `presentedFrames`, cambio de cámara entre partes y el modo sin `requestVideoFrameCallback`.
- **Lista de candidatos y familias:** con una sola marca HEVC, `pickMime` pasa a H.264 High.
- **Zoom 0,5×:** escala del gran angular y zoom pedido.

## Limitaciones

- Sin dispositivo:
  - el momento del primer trozo en MP4 con HEVC y H.264 (C);
  - el giro de la imagen con la pantalla bloqueada (B);
  - el comportamiento real de `screen.orientation.lock` en la PWA del S24.
- He intentado medir el ritmo de los trozos en el navegador de pruebas, pero no me deja abrir páginas locales ni externas.
- `freeSpace` es la cuota del origen menos lo usado. Por lo que sé de Chromium, la cuota se limita al espacio libre del disco menos una reserva, así que la medida es prudente. No lo he comprobado en Android.
- No he revisado el panel de ajustes del paso 6, ni la rejilla, el nivel o el aviso de calor.
