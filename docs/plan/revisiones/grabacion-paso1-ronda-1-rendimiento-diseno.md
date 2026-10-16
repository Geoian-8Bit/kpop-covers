# Revisión · Grabación paso 1 · Ronda 1 · Rendimiento, despliegue, diseño y seguridad

**Alcance:** diferencias entre `6b9e4d3` y `aef8bb5` (panel «i», Q1 compresión, Q2 formato, Q7 aviso de zoom digital).
**Foco de esta revisión:** G (rendimiento en Samsung), I (configuración y despliegue), J (diseño y movimiento), B (seguridad).
**Escala:** 9–10 datos/seguridad/no funciona · 7–8 fallo plausible o problema serio en móvil · 5–6 caso límite, accesibilidad importante o pulido claramente inferior · 3–4 calidad · 1–2 cosmético.
**Grupos:** 🔴 7–10 · 🟡 5–6 · 🟢 3–4 · ⚪ 1–2.
**Base revisada:** el commit `aef8bb5` leído directamente de git. Durante la revisión otro agente estaba cambiando el árbol de trabajo (ver «Limitaciones»); nada de eso se ha revisado.

---

## Resumen

- **No hay fallos graves (🔴) ni problemas de seguridad.** El panel solo muestra nombres de cámara (no identificadores), no guarda nada y no envía nada por red.
- **El coste de rendimiento del panel «i» es muy pequeño.** Lee la cámara una vez por segundo y repite unas pocas consultas de formato; en un S24 eso no se nota. Se puede limpiar, pero no es urgente.
- **El riesgo real en el móvil es la memoria, y también es una hipótesis.** La compresión pasa de unos 6 a 12 Mbps (casi el doble) y la toma entera sigue guardándose en memoria hasta que llegue R1 (paso 2). El plan ya lo sabía y lo ordenó así.
- **Hay cuatro problemas de interfaz de nivel 🟡:**
  - el panel tapa el diálogo de «¿Descartar la toma?»;
  - el aviso de zoom digital se monta encima del aviso de sonido de YouTube;
  - el botón «Info» hace que la columna de botones no quepa en horizontal;
  - si un móvil acepta HEVC en la consulta pero falla al grabar, no hay vuelta atrás (hipótesis).
- **Despliegue correcto.** La dependencia nueva (PGlite) no entra en el paquete web ni en el service worker, y el lockfile instala con `--frozen-lockfile`.

---

## 🔴 Graves (7–10)

Ninguno.

---

## 🟡 Importantes (5–6)

### J1 · El panel «i» tapa el diálogo «¿Descartar la toma?» — **5**

- **Archivo:** `apps/web/src/features/record/InfoPanel.tsx` línea 79 (capa 40) y `RecordStudio.tsx` líneas 494–499 y 963 (el diálogo de confirmar está en la capa 30).
- **Flujo:**
  1. Se graba una toma.
  2. En el repaso se toca «Detalles» y se abre el panel.
  3. Se toca la X de arriba, que sigue visible porque el panel empieza 60 px más abajo, o el botón «atrás» de Android.
  4. Como la toma no está guardada, se abre «¿Descartar la toma?», pero queda debajo del panel.
- **Condiciones:**
  - una toma sin guardar en repaso, o una toma en pausa (en pausa el botón «Info» también está disponible);
  - en vertical el diálogo queda tapado del todo;
  - en horizontal el panel ocupa la derecha (384 px) y tapa justo los botones del diálogo, que están alineados a la derecha.
- **Protecciones:** ninguna. Lo único que salva la situación es que el panel no bloquea la X de arriba.
- **Impacto:** el usuario toca cerrar y no pasa nada visible. Si pulsa «atrás» otra vez, el diálogo invisible se cierra. No se pierden datos, pero parece que la app no responde.
- **Evidencia:** el panel está en la capa 40 y el fondo y el diálogo en la capa 30. Nada cierra el panel al abrir el diálogo: `infoOpen` solo cambia con el botón Info, la X del panel y «Detalles».
- **Nuevo** (llega con el panel).
- **Arreglo:** cerrar el panel siempre que se abra un diálogo de confirmación (en `requestClose` y donde se pide confirmar). Otra opción es subir el diálogo de confirmar por encima del panel.
- **Test de regresión:**
  - con el panel abierto en el repaso, tocar la X y comprobar que «¿Descartar la toma?» se ve y responde;
  - lo mismo con «atrás» en Android.

### J2 · «Zoom digital: menos nitidez» se monta encima del aviso de sonido — **5**

- **Archivo:** `RecordStudio.tsx` líneas 731–744 (aviso de zoom, 104 px bajo el borde seguro) y 758–760 (aviso de sonido, 60 px bajo el borde seguro).
- **Flujo:**
  1. Se elige un vídeo de YouTube, así que el sonido llega por el micro y sale el aviso largo «YouTube no deja grabar su audio: se oye por el micro, sube el volumen».
  2. Se toca 2× en una cámara sin zoom de lente. Es habitual en la frontal, que es la cámara con la que abre el grabador.
- **Condiciones:**
  - móvil en vertical de 384 px de ancho (S24, S24 Ultra y S25 en resolución por defecto);
  - el aviso de sonido mide como mucho el ancho de pantalla menos 150 px (unos 234 px), así que ese texto ocupa unas 3 líneas y termina hacia los 120 px;
  - si la velocidad no es 1×, se añade « · velocidad 0,75×» y ocupa aún más.
- **Protecciones:** ninguna. Las dos posiciones son fijas e independientes.
- **Impacto:** dos píldoras semitransparentes se cruzan unos 15–35 px y los dos textos se leen mal. YouTube es la fuente más común del grupo.
- **Evidencia:** cálculo con las alturas de las clases (texto de 12 px con interlínea 1,375 más 12 px de relleno por línea). Hay que confirmarlo en el móvil.
- **Nuevo.**
- **Arreglo:** poner el aviso de zoom junto a los botones de zoom de abajo, donde además se entiende mejor. Otra opción es apilar los dos avisos en el mismo contenedor de arriba para que nunca se crucen.
- **Test de regresión:** captura con Playwright a 384×832 con sonido «mic», velocidad 0,75× y zoom digital activo. Comprobar que los dos rectángulos no se cruzan.

### J3 · En horizontal, la columna de botones ya no cabe con el botón «Info» — **5** (hipótesis con cálculo)

- **Archivo:** `RecordStudio.tsx` líneas 666–725 (columna de herramientas) y 716–725 (botón Info, el último).
- **Flujo:** en horizontal la columna va a la izquierda y empieza 78 px bajo el borde. Cada botón mide 59 px (círculo de 44, hueco y etiqueta) más 12 px de separación.
- **Condiciones:**
  - cámara trasera con linterna: Girar, Cuenta, Flash e Info, que llegan hasta los 350 px;
  - si además aparece «Empezar desde», la columna llega a unos 421 px. Ese botón sale casi siempre: hay tramo A–B, o la canción ya se había movido antes de abrir el grabador;
  - un S24 en horizontal tiene unos 384 px de alto, o menos si se ve la barra de estado;
  - con «Lente» hay 6 botones.
- **Protecciones:** ninguna. El contenedor del grabador oculta lo que sobresale.
- **Impacto:**
  - el botón Info, y con 6 botones también Lente, queda cortado o fuera de la pantalla;
  - antes del cambio solo pasaba en el caso raro de 5 botones (cuando aparecía «Lente»);
  - con el cambio pasa en el caso normal del grupo (trasera y tramo A–B).
- **Evidencia:** cálculo con las medidas de `RailButton` (líneas 1006–1045) y del contenedor. No lo he podido ver en un móvil.
- **Agravado por este cambio** (el corte con 5 botones ya existía).
- **Arreglo:** mover «Info» al hueco vacío que ya existe arriba a la derecha (línea 662, puesto solo por simetría). Libera la columna y encaja con la idea del plan de una etiqueta pequeña tipo «1080p · 30 · Alta» que abre los detalles. Además, en horizontal la columna debería poder desplazarse o partirse en dos.
- **Test de regresión:** con cámara falsa de Chrome, viewport de 832×384, tramo A–B activo y linterna simulada, comprobar que todos los botones de la columna están dentro de la pantalla.

### G1 · Si el móvil dice que acepta HEVC pero el codificador falla al arrancar, todas las tomas fallan — **5** (hipótesis)

- **Archivo:** `apps/web/src/features/record/recorder.ts` líneas 35–43 (elección del formato) y 72–82 y 103 (creación y error). `RecordStudio.tsx` línea 308 (cada toma vuelve a elegir).
- **Flujo:**
  1. La elección pone HEVC primero si la consulta del navegador dice que sí.
  2. Solo se protege el caso en que el grabador se niega al crearse.
  3. Si el error llega después de empezar (codificador ocupado o nivel no admitido), salta el aviso «La grabación se ha cortado» y queda una toma vacía: «No se ha grabado nada».
  4. La siguiente toma vuelve a elegir HEVC.
- **Condiciones:** que Chrome para Android responda «sí» a la consulta de HEVC y luego no pueda abrir el codificador. No lo he podido comprobar. Ya ha pasado en Chrome con codificadores por hardware que se anuncian pero fallan a ciertos tamaños.
- **Protecciones:** la vuelta atrás cuando el grabador se niega al crearse. No hay memoria de formatos que han fallado.
- **Impacto:** en ese móvil no se puede grabar hasta actualizar la app. Sería un 8 si se confirma.
- **Nuevo** (antes no se pedía HEVC).
- **Arreglo:**
  - si una toma muere en los primeros segundos sin datos, recordar ese formato como fallido (en la sesión y en el móvil) y volver a intentarlo con «solo H.264»;
  - mostrar en el panel «i» que se ha descartado HEVC.
- **Test de regresión:**
  - prueba unitaria en `packages/shared` de la elección con una lista de formatos descartados;
  - en la prueba 2 del plan, grabar 3 tomas seguidas en cada Samsung y apuntar el formato real que da el panel.

---

## 🟢 Calidad (3–4)

### G2 · La toma pesa casi el doble y sigue entera en memoria hasta R1 — **4** (hipótesis)

- **Archivo:** `packages/shared/src/recording.ts` líneas 35–39 (tabla de Mbps) y `recorder.ts` línea 83 (los trozos se guardan en una lista en memoria).
- **Flujo:**
  - el lienzo actual es de 1080×1920 a 30 fps;
  - antes se pedían unos 6,2 Mbps y ahora 12 Mbps con H.264, o 7,8 Mbps con HEVC;
  - una canción de 4 minutos pasa de unos 190 MB a unos 365 MB;
  - en el repaso esa toma se reproduce y al guardar o compartir se copia otra vez.
- **Condiciones:** canciones largas o varias partes en pausa. El plan dice S24, S24 Ultra y S25, que tienen 8–12 GB; un móvil de gama media tiene menos.
- **Protecciones:** Chrome puede pasar a disco los Blob grandes, pero no lo he podido comprobar en Android. El plan ordena R1 (guardar mientras graba) justo en el paso 2.
- **Impacto:** más riesgo de que Android cierre la pestaña al terminar una toma larga.
- **Nuevo** (por la subida de compresión).
- **Arreglo:** no publicar el paso 1 sin el paso 2, o mientras tanto limitar «Auto» a unos 10 Mbps. Medir en la prueba 2 con una toma de 5 minutos.
- **Test de regresión:** prueba manual en el móvil con una canción de 5 minutos y la memoria de Chrome a la vista (chrome://inspect). Comprobar que la toma termina y se guarda.

### J4 · El panel no se comporta como un diálogo — **4**

- **Archivo:** `InfoPanel.tsx` líneas 71–99. Uso del botón atrás en `RecordStudio.tsx` líneas 503–515.
- **Flujo:**
  - el panel dice ser un diálogo, pero al abrirse el foco se queda en el botón Info, que ahora está tapado;
  - Esc no lo cierra;
  - el botón atrás de Android no lo cierra: en reposo cierra todo el grabador y en el repaso sin guardar abre el diálogo de confirmar, que queda tapado (ver J1).
- **Condiciones:** teclado, lector de pantalla o el gesto atrás, que es lo habitual en Samsung.
- **Protecciones:** el botón X del panel mide 44 px y funciona.
- **Impacto:** `docs/DESIGN.md` promete diálogos con el foco atrapado y que se cierran con Esc. En móvil, «atrás» cierra el grabador entero en lugar del panel.
- **Nuevo.**
- **Arreglo:**
  - al abrir, llevar el foco al botón de cerrar;
  - cerrar con Esc;
  - que «atrás» cierre primero el panel (la utilidad `useBackToClose` ya sirve para capas);
  - marcarlo como diálogo modal dentro del grabador.
- **Test de regresión:**
  - abrir el panel con el teclado, comprobar que el foco va a «Cerrar la información» y que Esc lo cierra;
  - en móvil, comprobar que «atrás» cierra solo el panel.

### J5 · El panel y la «Última toma» siguen ahí al cerrar y volver a abrir el grabador — **4**

- **Archivo:** `RecordStudio.tsx` líneas 104–105 (estado) y 163–226 (al abrir y cerrar se reinicia todo menos esto).
- **Flujo:** el grabador no se desmonta al cerrarse (`StudioPage` lo mantiene y solo cambia `open`).
  - Si se cierra con el panel abierto, al volver a abrirlo el panel aparece solo.
  - «Última toma» sigue mostrando la toma de otra sesión o de otro vídeo.
- **Condiciones:** cerrar el grabador con la X de arriba mientras el panel está abierto. La X se ve en vertical.
- **Protecciones:** ninguna.
- **Impacto:** confunde, porque el grabador se abre tapado. Los datos de la última toma ya no corresponden a lo que se ve.
- **Nuevo.**
- **Arreglo:** poner `infoOpen` a cerrado al abrir y al cerrar. Borrar la última toma al cerrar, o mostrar con ella el título del vídeo.
- **Test de regresión:** abrir el panel, cerrar el grabador, volver a abrirlo y comprobar que el panel está cerrado.

### J6 · El aviso de zoom digital se lee mal sobre fondos claros — **3**

- **Archivo:** `RecordStudio.tsx` línea 738.
- **Flujo:** texto en oro viejo (`kin-300`) de 12 px sobre negro al 60 %, encima de la imagen de la cámara.
- **Condiciones:** pared blanca o espejo iluminado, lo normal en un local de ensayo.
- **Protecciones:** el texto va en negrita.
- **Impacto:** sobre blanco, el fondo queda gris medio. El contraste calculado es de unos 3,5:1, por debajo del 4,5:1 que pide `DESIGN.md`. Los otros avisos usan washi, que es más claro, y pasan por poco.
- **Nuevo.**
- **Arreglo:** texto washi con un icono en oro, o fondo `sumi-900` al 85–90 % como el aviso de abajo. Si el aviso se mueve junto a los botones de zoom (J2), heredar ese estilo.
- **Test de regresión:** captura sobre una imagen blanca y medición del contraste (≥ 4,5:1).

### J7 · El panel no sigue el estilo de lámina del resto de la app — **3**

- **Archivo:** `InfoPanel.tsx` líneas 79 y 180.
- **Flujo:** el panel es un rectángulo `sumi-900` al 95 % con borde fino.
  - El diálogo de confirmar del mismo archivo usa la superficie laca urushi (`paper-raised`, con brillo y filete dorado).
  - Los títulos de sección van en mayúsculas pequeñas en oro, un estilo que no aparece en ningún otro sitio de la app. `DESIGN.md` pide mincho con regla y kanji en bermellón.
  - En horizontal, el margen derecho de 12 px no tiene en cuenta la zona segura, cuando el resto del grabador sí lo hace.
- **Impacto:** se ve como una pantalla de depuración, menos cuidada que el resto. En horizontal, con la cámara frontal del móvil a la derecha, el agujero de la cámara puede tapar el final de algún valor.
- **Nuevo.**
- **Arreglo:**
  - usar `paper-raised`;
  - títulos de sección con la regla dorada (versión pequeña de `SectionTitle`, sin kanji si no cabe);
  - respetar la zona segura derecha en horizontal.
- **Test de regresión:** revisión visual en 384×832 y 832×384.

---

## ⚪ Cosméticos y limpieza (1–2)

### G3 · Consultas de formato repetidas en cada render — **2**

- **Archivo:**
  - `InfoPanel.tsx` líneas 61–66 (lectura cada segundo) y 138–139 (5 consultas en cada render);
  - `RecordStudio.tsx` línea 749 (`plannedFormat()`, hasta 13 consultas en cada render del grabador con el panel abierto) y línea 308.
- **Impacto:**
  - unas 5 consultas por segundo con el panel abierto, cada una de microsegundos: no se nota en un S24;
  - la elección del formato se hace en `roll()`, justo cuando la canción ya suena, así que sus milisegundos retrasan el arranque de la cámara frente a la canción;
  - la lista de pruebas HEVC del panel está copiada a mano y es distinta de la que usa la grabación: el panel puede decir «HEVC disponible: sí» y la grabación salir en H.264.
- **Nuevo.**
- **Arreglo:**
  - calcular la disponibilidad de formatos una vez al abrir el panel;
  - elegir el formato al pulsar el disparador (durante la cuenta atrás), no en `roll()`;
  - sacar una única función en `recorder.ts` que use la misma lista de candidatos para el panel y para la grabación;
  - actualizar el estado del panel cada segundo solo si algo ha cambiado.
- **Test de regresión:** prueba unitaria de que la disponibilidad que muestra el panel sale de la misma lista que la elección.

### G4 · Calor — **2** (hipótesis)

- Con codificador por hardware, subir la compresión casi no cambia el calor. Lo que más calienta es redibujar el lienzo en cada fotograma, que ya existía y se trata en Q5/Q6.
- **Arreglo:** ninguno ahora; vigilarlo en la prueba 2 y con R3.

### I1 · PGlite (35 MB) se instala en cada despliegue de Vercel — **2**

- **Archivo:** `package.json` (dependencias de desarrollo de la raíz) y `pnpm-lock.yaml`.
- **Evidencia:**
  - no aparece en el paquete web: he buscado «pglite» en `dist` y no sale;
  - el service worker sigue precargando lo mismo (28 entradas, 985 KiB);
  - el lockfile instala bien con `--frozen-lockfile`.
- **Impacto:** `DEPLOY.md` dice que Vercel instala todo el espacio de trabajo, así que cada build descarga 35 MB más. No afecta a los usuarios.
- **Arreglo opcional:** pasar las pruebas locales de base de datos a su propio paquete del espacio de trabajo, o filtrar la instalación en Vercel a `@coverscape/web` y sus dependencias.

### J8 · Textos — **2**

- Los modos de enfoque, exposición y balance de blancos salen en inglés, tal como los da el navegador («continuous, manual, single-shot»). Mejor traducirlos: «continuo», «manual», «un disparo».
- «Compresión 12 Mbps» confunde: un número más alto es menos compresión. Mejor «Calidad de vídeo: 12 Mbps» o «Tasa de vídeo».
- «Compresión real» incluye el sonido y el contenedor, y «pedida» es solo el vídeo. Con 160 kbps la diferencia es pequeña, pero en tomas cortas desvía el dato. Mejor restar el sonido o decir «total».

### J9 · Movimiento del aviso de zoom — **2**

- **Archivo:** `RecordStudio.tsx` línea 736.
- El aviso usa `jelly`, el muelle con rebote que `DESIGN.md` reserva para interruptores, pestañas y sellos. Los demás avisos usan `soft`.
- Con movimiento reducido, `MotionConfig` ya quita la escala, así que esa parte está bien.
- **Arreglo:** usar `soft`.

### I2 · Constantes compartidas sin usar — **1**

- `AUDIO_BITS_PER_SECOND` (256 kbps), `droppedFrames`, `minutesLeft` y `HEAT_WARN_MINUTES` se exportan pero no se usan. La grabación usa 160 kbps escrito a mano (`recorder.ts` línea 41).
- Es razonable porque llegan en pasos siguientes. Conviene decirlo en un comentario para que nadie crea que el sonido ya va a 256 kbps.
- «Fotogramas perdidos» siempre dice «sin medir»: R4 llega en el paso 4.

---

## Seguridad (B)

Sin hallazgos:

- el panel muestra la etiqueta de la cámara (`track.label`) y los nombres de `enumerateDevices`, pero nunca el identificador del dispositivo;
- nada se guarda en el almacenamiento local, en Supabase ni en registros, y no hay llamadas de red nuevas;
- en Samsung las etiquetas son del tipo «camera2 0, facing back». En un ordenador podrían mostrar el modelo de una webcam USB, pero solo las ve quien tiene el móvil o el ordenador delante;
- la CSP y los permisos de cámara no cambian.

---

## Tests que faltan

- Elección del formato en la web con una consulta falsa:
  - HEVC primero si se acepta;
  - H.264 High con el nivel correcto;
  - Baseline después;
  - formato vacío si no hay ninguno;
  - lista de formatos fallidos (G1).
- Que el panel y la grabación usen la misma lista de formatos (G3).
- Pruebas de interfaz, que la web aún no tiene (`apps/web` no tiene tests):
  - el diálogo de confirmar se ve con el panel abierto (J1);
  - el panel se cierra al cerrar el grabador (J5);
  - Esc y el foco del panel (J4).
- Pruebas visuales con Playwright y cámara falsa de Chrome en 384×832 y 832×384:
  - avisos sin cruzarse (J2);
  - columna de botones dentro de la pantalla (J3);
  - contraste del aviso (J6).
- Prueba manual en los Samsung: toma de 5 minutos (memoria, G2) y 3 tomas seguidas con HEVC (G1).

---

## Comprobaciones ejecutadas

Todas sobre una copia exacta del commit `aef8bb5`, extraída con `git archive` en una carpeta temporal fuera del repo.

| Comprobación | Resultado |
| --- | --- |
| `pnpm install --frozen-lockfile --offline` | Correcto: el lockfile coincide con `package.json` |
| `pnpm typecheck` | Correcto |
| `pnpm test` | 62 tests correctos, 15 de ellos de `recording.test.ts` |
| `pnpm build` | Correcto. Bloque `StudioPage` de 117,6 kB (36,9 kB gzip). Service worker con 28 entradas (985 KiB) |
| Buscar «pglite» en `dist` | No aparece |
| `pnpm db:test` | 7/7 migraciones y 13 comprobaciones PASS |

En el árbol de trabajo actual, `pnpm typecheck` falla (variables `leftover` y `free` sin usar en `RecordStudio.tsx`). Es trabajo sin commitear de otro agente, no de este commit.

---

## Limitaciones

- No he probado en un Samsung ni en un navegador con cámara. J2 y J3 son cálculos con las medidas del código, y G1, G2 y G4 son hipótesis sobre cómo se comporta Chrome para Android (HEVC, memoria de Blob, calor).
- No he medido el coste real de `isTypeSupported` ni de `getCapabilities` en Android.
- Mientras revisaba, otro proceso modificó `RecordStudio.tsx`, `recorder.ts` y `packages/shared/src/recording.ts` y creó `takeStore.ts`, sin commitear. Todo el informe se refiere a `aef8bb5` y las líneas citadas son las de ese commit.
- No he revisado a fondo la corrección funcional general (otros revisores), solo lo que toca a rendimiento, despliegue, diseño y seguridad.
