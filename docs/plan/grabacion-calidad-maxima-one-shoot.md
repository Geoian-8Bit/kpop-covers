# One Shoot · Grabación con la máxima calidad del navegador

**Fecha:** 14-10-2026
**Base:** repositorio `Geoian-8Bit/kpop-covers`, commit `6b9e4d3` (estudio de grabación rehecho).
**Dispositivos del grupo:** Samsung Galaxy S24 / S24 Ultra / S25, con la app instalada como PWA en Chrome para Android. No hay iPhone.
**Decisión:** seguir grabando **dentro de la app**, con la cámara del navegador (opción 2), para conservar la música y la sincronía automáticas, pero llevando la calidad al máximo posible y añadiendo todas las opciones útiles.
**Estado:** propuesta. No hay nada implementado.

---

## Índice

1. [Resumen](#1-resumen)
2. [Cómo graba hoy](#2-cómo-graba-hoy)
3. [Prueba previa en vuestros móviles](#3-prueba-previa-en-vuestros-móviles)
4. [Mejoras de calidad de imagen](#4-mejoras-de-calidad-de-imagen)
5. [Controles de cámara](#5-controles-de-cámara)
6. [Sonido](#6-sonido)
7. [Fiabilidad con calidad alta](#7-fiabilidad-con-calidad-alta)
8. [Pantalla de ajustes del grabador](#8-pantalla-de-ajustes-del-grabador)
9. [Lo que no se puede hacer desde el navegador](#9-lo-que-no-se-puede-hacer-desde-el-navegador)
10. [Plan de pruebas](#10-plan-de-pruebas)
11. [Orden de implementación](#11-orden-de-implementación)
12. [Fuentes](#12-fuentes)

---

## 1. Resumen

| ID | Mejora | Qué aporta | Impacto en calidad | Viabilidad |
| --- | --- | --- | --- | --- |
| **Q1** | Más calidad de compresión | Menos manchas y bordes borrosos en movimientos rápidos | **Muy alto** | Alta |
| **Q2** | Formato H.264 más eficiente (perfil High) y, si existe, HEVC | Más calidad con el mismo tamaño de archivo | Alto | Alta (HEVC, a comprobar) |
| **Q3** | Resolución máxima (hasta 4K) | Más detalle, sobre todo al ampliar en el repaso | Alto | Media (a comprobar en cada móvil) |
| **Q4** | 60 fotogramas por segundo | Movimiento más fluido y mejor cámara lenta | Medio-alto | Media |
| **Q5** | Grabar la cámara directamente, sin lienzo, cuando se pueda | Sin pérdidas por redibujar ni saltos de fotogramas | Medio-alto | Media |
| **Q6** | Lienzo mejorado cuando sí haga falta | Fotogramas al ritmo de la cámara y a resolución completa | Medio | Alta |
| **Q7** | Zoom siempre de la lente, nunca recorte | El 2× y el 3× sin perder nitidez | Alto al usar zoom | Alta |
| **Q8** | Cámara inicial elegible (trasera por defecto para el grupo) | La cámara principal es la mejor del móvil | Medio | Alta |
| **C1–C5** | Controles de cámara: enfoque, exposición, balance de blancos, linterna | Imagen correcta en locales oscuros o con luz amarilla | Medio-alto | Media (depende del móvil) |
| **S1–S3** | Sonido: más calidad y estéreo | Música y micrófono más limpios | Medio | Alta |
| **R1–R5** | Fiabilidad: guardar mientras graba, espacio, calor, fotogramas perdidos | Que la calidad alta no cierre la app ni corte tomas | — (necesario) | Media |
| **A1** | Pantalla de ajustes del grabador | Elegir calidad, resolución, fps, cámara… | — | Alta |

**Lo que más se nota y menos cuesta:** Q1 + Q2 + Q7. Con eso solo ya debería verse una mejora clara.

---

## 2. Cómo graba hoy

- **Dónde está:** carpeta `apps/web/src/features/record/` (`camera.ts`, `useCamera.ts`, `compositor.ts`, `recorder.ts`, `RecordStudio.tsx`).

**Cómo funciona:**
1. La app pide la cámara al navegador con un tamaño **ideal de 1920×1080 a 30 fps**.
2. La imagen se dibuja en un **lienzo** que es a la vez la vista previa y lo que se graba. Así se ve exactamente lo que se graba, se gira bien y se puede aplicar el zoom digital.
3. El lienzo se graba con el grabador del navegador.

**Valores actuales:**

| Aspecto | Valor |
| --- | --- |
| Resolución pedida | 1920×1080 ideal |
| Tamaño máximo del lienzo | 1920 px por el lado largo |
| Fotogramas | 30 fps; el lienzo se redibuja con el refresco de pantalla, como mucho cada ~31 ms |
| Compresión de vídeo | ≈ 0,1 bits por píxel y fotograma: unos **6 Mbps** en 1080p (mínimo 2,5 y máximo 8 Mbps) |
| Formato | MP4 con H.264 **perfil Baseline** (el menos eficiente) como primera opción; WebM si no hay MP4 |
| Sonido | AAC u Opus a 160 kbps; la canción limpia si es un archivo, el micrófono si es YouTube |
| Zoom | De la lente si el navegador lo ofrece; si no, recorte digital hasta 4× |
| Cámara al abrir | Frontal, como TikTok |
| Dónde se guarda la toma mientras graba | En la memoria del navegador, en trozos de 1 segundo |

**Por qué no llega a la calidad del móvil:** sobre todo por la compresión baja y el formato Baseline, la resolución limitada a 1080p, el redibujado en el lienzo y, cuando se usa, el zoom digital. Además, el navegador no tiene estabilización, HDR ni modo noche (ver apartado 9).

---

## 3. Prueba previa en vuestros móviles

Antes de programar nada conviene saber **qué da cada Samsung** en Chrome, porque varía según el modelo.

**Prueba 1 · Resolución máxima (se puede hacer ya, sin tocar la app)**
1. En el móvil, abrir en Chrome la página de pruebas de resolución de WebRTC (webrtc.github.io/samples, apartado «getUserMedia resolution»).
2. Probar «4K», «Full HD» y «HD» con la cámara trasera.
3. Apuntar qué resolución sale realmente en cada móvil.

**Prueba 2 · Comparar con la cámara del móvil**
1. Grabar 20 segundos bailando con One Shoot y otros 20 con la app Cámara de Samsung, en el mismo sitio y con la misma luz.
2. En la Galería, ver los detalles de cada vídeo: resolución y tamaño. Dividiendo el tamaño entre la duración se saca la compresión.
3. Guardar estos dos vídeos como **referencia** para comparar después de cada mejora.

**Prueba 3 · Panel de información (primera mejora a implementar)**
- Un botón **«i»** en el grabador que muestre lo que de verdad está usando la cámara:
  - resolución real;
  - fotogramas por segundo;
  - zoom de lente disponible (mínimo y máximo);
  - qué controles ofrece (enfoque, exposición, balance de blancos, linterna);
  - formato y compresión con los que se graba;
  - fotogramas perdidos durante la última toma.
- **Para qué:** saber en cada móvil qué se puede activar, y comprobar que cada mejora funciona de verdad.

---

## 4. Mejoras de calidad de imagen

### Q1 · Más calidad de compresión

- **Qué:** subir la compresión de los ~6 Mbps actuales a valores parecidos a los de una cámara de móvil.
- **Valores orientativos** (a ajustar con la prueba 2):

| Resolución y fps | Hoy | Propuesta «Alta» | Propuesta «Máxima» |
| --- | --- | --- | --- |
| 1080p · 30 fps | ~6 Mbps | 12 Mbps | 16 Mbps |
| 1080p · 60 fps | — | 18 Mbps | 24 Mbps |
| 4K · 30 fps | — | 30 Mbps | 40 Mbps |

- **Tamaño de los archivos** (orientativo): a 16 Mbps, un minuto ocupa unos 120 MB; a 40 Mbps, unos 300 MB. Por eso hace falta R1 (guardar mientras graba) y R2 (comprobar el espacio).
- **Comprobación:** el navegador toma este valor como una indicación, no como una garantía. El panel «i» y el tamaño del archivo final dirán si se respeta.

### Q2 · Formato más eficiente

- **H.264 perfil High:**
  - pedir primero el perfil High, que da bastante más calidad con el mismo tamaño;
  - dejar el Baseline actual solo como respaldo;
  - para 4K hace falta un nivel de H.264 que admita esa resolución.
- **HEVC (H.265):** el formato que usa la cámara de Samsung por defecto. Da la misma calidad con aproximadamente la mitad de tamaño.
  - Que Chrome pueda grabar en HEVC depende de la versión y del móvil, así que la app lo **detectaría** y lo usaría solo si está disponible.
  - Hay que comprobar que el archivo se ve bien en la Galería y en WhatsApp.
- **MP4 siempre que se pueda**, porque se guarda en la Galería y se comparte sin problemas. WebM solo como último respaldo.

### Q3 · Resolución máxima

- **Qué:** pedir a la cámara la mayor resolución que dé, hasta **4K (3840×2160)**, con respaldo automático a 1440p, 1080p o 720p.
- **Cómo:**
  - la app pide 4K como «ideal» y luego **lee qué resolución ha dado de verdad**;
  - lo muestra en el panel «i» y en la pantalla de ajustes.
- **Lienzo:** quitar el límite de 1920 px cuando la cámara dé más.
- **A tener en cuenta:**
  - el 4K multiplica el tamaño de los archivos y el calor del móvil;
  - por defecto la app elegiría **«Auto»**: 1080p a 60 fps si se puede y, si no, 1080p a 30 fps. El 4K quedaría como opción de «Máxima».

### Q4 · 60 fotogramas por segundo

- **Qué:** opción de grabar a **60 fps** en lugar de 30.
- **Para qué:**
  - en un baile, los movimientos rápidos se ven mucho más fluidos;
  - al repasar a 0,5×, cada fotograma sigue siendo nítido.
- **Límites:**
  - 4K a 60 fps probablemente no lo dé el navegador;
  - 1080p a 60 fps es lo realista;
  - la app comprobaría los fps reales y avisaría si la cámara se queda en 30.

### Q5 · Grabar la cámara directamente, sin lienzo, cuando se pueda

- **Problema:** redibujar cada fotograma en el lienzo puede perder detalle al escalar, saltarse fotogramas si el móvil va cargado y gastar más batería.
- **Qué:** cuando **no** haga falta el lienzo, grabar la imagen de la cámara **tal cual sale**:
  - sin zoom digital;
  - sin cambiar de cámara a mitad de toma;
  - sin girar el móvil a mitad de toma.
- **El lienzo se usa solo** cuando haga falta:
  - zoom digital, si la lente no tiene zoom;
  - cambiar de cámara entre partes de una toma;
  - girar el móvil a mitad de toma.
- **A probar en vuestros Samsung:**
  - que la imagen directa salga derecha en vertical y en horizontal (el lienzo se puso, sobre todo, por un fallo de los iPhone, que guardaban los vídeos tumbados);
  - que la vista previa siga siendo fiel a lo que se graba.

### Q6 · Lienzo mejorado, cuando sí haga falta

- **Al ritmo de la cámara:** dibujar cada fotograma cuando llega de la cámara, no con el refresco de la pantalla. Así no se duplican ni se pierden fotogramas, y funciona igual a 30 y a 60 fps.
- **A resolución completa:** el lienzo a la resolución real de la cámara (Q3), no limitado a 1080p.
- **Suavizado de alta calidad** al escalar, para el zoom digital.
- **Que la interfaz moleste lo mínimo** mientras se graba: el contador de tiempo y los avisos, sin redibujar toda la pantalla.

### Q7 · Zoom siempre de la lente

- **En Chrome para Android, los Samsung suelen ofrecer el zoom de la cámara** al navegador. La app ya lo pide.
- **Mejoras:**
  - **el recorte digital solo como último recurso**, cuando la lente no tenga zoom;
  - **avisar** cuando el zoom sea digital: «Zoom digital: menos nitidez»;
  - **en los S24 Ultra y S25 Ultra** (teleobjetivo de 3× o 5×), comprobar si el navegador los ofrece como cámaras aparte o dentro del zoom, y usarlos en los botones 3× y 5×;
  - **gran angular (0,5×):** comprobar que el navegador la lista y que la app la reconoce por su nombre en Samsung.

### Q8 · Cámara inicial elegible

- **Hoy:** el grabador abre siempre la cámara frontal.
- **Propuesta:**
  - elegir en ajustes la cámara al abrir: **trasera** (recomendada para grabar al grupo), frontal o **la última usada**;
  - se recuerda en cada móvil.
- **Para qué:** la cámara trasera principal es la de más calidad del móvil.

---

## 5. Controles de cámara

En Chrome para Android, muchos móviles dejan controlar algunos ajustes de la cámara. **Cada Samsung ofrece unos u otros**: la app solo mostraría los que estén disponibles (se ven en el panel «i»).

| ID | Control | Cómo se usa | Para qué |
| --- | --- | --- | --- |
| **C1** | **Toca para enfocar y medir la luz** | Tocar un punto de la vista previa para enfocar ahí y ajustar la exposición a esa zona | Que el grupo salga enfocado y bien expuesto, no la ventana del fondo |
| **C2** | **Bloquear enfoque y exposición** | Mantener pulsado para fijarlos durante toda la toma | Que la imagen no «respire» ni cambie de brillo cuando alguien pasa cerca de la cámara |
| **C3** | **Compensación de exposición** | Deslizador de −2 a +2 | Aclarar locales oscuros u oscurecer si hay mucha luz |
| **C4** | **Balance de blancos** | Automático o preajustes (luz cálida, fluorescente, día) | Corregir el tono amarillo o verde de muchos locales de ensayo |
| **C5** | **Linterna** | Ya existe | Luz de apoyo en espacios oscuros, con la cámara trasera |

**Límites:** si un móvil no ofrece algún control, simplemente no aparece. No hay forma de activar la estabilización, el HDR ni el modo noche (apartado 9).

---

## 6. Sonido

| ID | Mejora | Detalle |
| --- | --- | --- |
| **S1** | **Más calidad** | Subir de 160 kbps a 256 kbps; el formato AAC de MP4 lo admite sin problema |
| **S2** | **Micrófono en estéreo** | Pedir dos canales cuando el móvil lo permita (los Samsung suelen tener varios micrófonos). Mantener el sonido sin procesar, como ahora: sin cancelación de eco, sin reducción de ruido y sin control automático de volumen, para que la música no se «coma» |
| **S3** | **Canción limpia o micrófono, elegible** | Hoy, con vídeos de archivo se graba la canción limpia y con YouTube el micrófono. Opción de elegir el **micrófono también con archivos**, por ejemplo para que se oigan los pasos o las voces del grupo |

**Con F17 (separar la voz de la música) hecha:** la toma de un vídeo con archivo podría llevar la versión **sin voz** como sonido.

---

## 7. Fiabilidad con calidad alta

Subir la calidad tiene costes: archivos mucho más grandes, más memoria, más calor y más batería. Estas mejoras evitan que la calidad alta acabe en tomas cortadas o en la app cerrándose.

### R1 · Guardar la toma mientras se graba
- **Problema:** hoy la toma se va acumulando **en la memoria** del navegador hasta que termina. A 16 Mbps, una toma de 3 minutos son unos 360 MB, y en 4K, cerca de 1 GB. Un móvil puede cerrar la página por falta de memoria y perder la toma entera.
- **Qué:** ir escribiendo cada trozo de la toma en el **almacenamiento del móvil** mientras se graba (el almacenamiento privado de la app en el navegador), no en la memoria.
- **Ventaja extra:** si la app se cierra a mitad, lo grabado hasta ese momento **se puede recuperar** al volver a abrirla.

### R2 · Comprobar el espacio antes de grabar
- **Antes de empezar,** la app mira cuánto espacio tiene disponible y lo muestra: «Te quedan unos 12 minutos de grabación en calidad Máxima».
- **Con poco espacio,** propone bajar la calidad.
- **Persistencia:** pedir al navegador que **no borre** lo guardado por la app cuando el móvil vaya justo de espacio.

### R3 · Calor y batería
- 4K, 60 fps y compresión alta calientan el móvil, sobre todo en tomas largas o enchufado.
- **Aviso** si la toma dura más de X minutos en Máxima.
- **Si el móvil empieza a perder fotogramas** (ver R4), ofrecer bajar a «Alta» para la siguiente toma.

### R4 · Vigilar los fotogramas perdidos
- **Durante la toma,** la app cuenta los fotogramas que llegan de la cámara y los que se graban.
- **Si se pierden muchos,** muestra un aviso discreto al terminar: «Se han perdido fotogramas: prueba 30 fps o calidad Alta».
- **El dato** se ve también en el panel «i».

### R5 · Lo que ya hace bien y se mantiene
- **Pantalla siempre encendida** mientras se graba.
- **Pausa automática** si se pierde la cámara o el sonido.
- **Recuperar lo grabado** si el navegador corta la grabación.
- **Esperar a que la canción suene** de verdad antes de empezar.

---

## 8. Pantalla de ajustes del grabador

### A1 · Un botón de ajustes ⚙ en el grabador

Las opciones se recuerdan **en cada móvil**.

| Ajuste | Opciones | Por defecto |
| --- | --- | --- |
| **Calidad** | Ahorro · Alta · Máxima · Auto | Auto |
| **Resolución** | Auto · 4K · 1440p · 1080p · 720p (solo las que dé la cámara) | Auto |
| **Fotogramas** | 30 · 60 fps (60 solo si la cámara lo da) | 60 si se puede |
| **Formato** | Automático (HEVC si existe, si no H.264 High) · H.264 compatible | Automático |
| **Cámara al abrir** | Trasera · Frontal · Última usada | Trasera |
| **Sonido** | Canción limpia (si hay archivo) · Micrófono | Canción limpia |
| **Micrófono** | Mono · Estéreo | Estéreo si se puede |
| **Rejilla** | Activada / desactivada: líneas de tercios para encuadrar | Desactivada |
| **Nivel** | Activado / desactivado: indicador de móvil recto, con el sensor de inclinación | Desactivado |
| **Información técnica** | Mostrar el panel «i» | Desactivado |

**Qué significa cada calidad** (orientativo, a ajustar con las pruebas):

| Calidad | Resolución | fps | Compresión | 1 minuto ocupa |
| --- | --- | --- | --- | --- |
| **Ahorro** | 720p | 30 | ~5 Mbps | ~40 MB |
| **Alta** | 1080p | 60 (o 30) | ~18 Mbps | ~135 MB |
| **Máxima** | 4K si se puede (si no, 1080p) | 30 | ~40 Mbps | ~300 MB |
| **Auto** | La mejor combinación estable para ese móvil según la prueba de la cámara | | | |

**En el propio grabador, sin entrar en ajustes:** una etiqueta pequeña con lo que se está usando, por ejemplo «1080p · 60 · Alta», que al tocarla abre los ajustes.

---

## 9. Lo que no se puede hacer desde el navegador

| Qué | Por qué | Alternativa |
| --- | --- | --- |
| **Estabilización** de imagen | El navegador no da forma de activarla; es cosa del sistema y de la app Cámara | Trípode o móvil apoyado (lo normal al grabar un ensayo) |
| **HDR** y **modo noche** | Solo están disponibles para la app Cámara y apps nativas de Android | Mejorar la luz del local; compensación de exposición (C3) |
| **Procesado de Samsung** (nitidez, colores, reducción de ruido propios) | Exclusivo de la app Cámara | — |
| **4K a 60 fps** | Muy probablemente no lo dé el navegador | 1080p a 60 o 4K a 30 |
| **La calidad exacta de la app Cámara** | Por lo anterior | Opción 1 (abrir la Cámara de Samsung desde la app) u opción 3 (app Android nativa), descartadas por ahora |

---

## 10. Plan de pruebas

Probar en **cada modelo del grupo** (S24, S24 Ultra, S25…) con la app instalada:

| Prueba | Qué comprobar |
| --- | --- |
| Resolución | Qué resoluciones da cada cámara (trasera principal, gran angular, teleobjetivo, frontal) |
| Fotogramas | Si 60 fps se mantiene en 1080p y qué pasa en 4K |
| Compresión real | Tamaño ÷ duración del archivo final frente al valor pedido |
| Formato | Que el MP4 (H.264 High o HEVC) se vea en la Galería, en WhatsApp y en el ordenador |
| Calidad visual | Comparar con el vídeo de referencia de la app Cámara (prueba 2) en movimientos rápidos |
| Zoom | Que 2×, 3× y 5× usen la lente y no el recorte; que 0,5× use la gran angular |
| Toma larga | 10 minutos en Máxima: memoria, calor, fotogramas perdidos, que no se corte |
| Poca luz | Local oscuro con y sin compensación de exposición y linterna |
| Girar el móvil | Vertical y horizontal con grabación directa (Q5): que salga derecho |
| Sonido | Canción limpia, micrófono estéreo y sincronía con la imagen |
| Recuperación | Cerrar la app a mitad de toma y comprobar que se recupera lo grabado (R1) |

---

## 11. Orden de implementación

| Paso | Qué | Por qué |
| --- | --- | --- |
| **1** | Panel «i» (prueba 3) + Q1 Compresión + Q2 Formato + Q7 Zoom de lente | Lo que más mejora con menos riesgo, y el panel permite medirlo |
| **2** | R1 Guardar mientras graba + R2 Espacio | Imprescindible antes de subir resolución o fps |
| **3** | Q3 Resolución máxima + Q4 60 fps + Q8 Cámara inicial | Más detalle y fluidez, ya con la fiabilidad resuelta |
| **4** | Q5 Grabación directa + Q6 Lienzo mejorado + R4 Fotogramas perdidos | Quitar pérdidas del redibujado |
| **5** | C1–C4 Controles de cámara + S1–S3 Sonido | Ajustes finos de imagen y sonido |
| **6** | A1 Pantalla de ajustes + R3 Calor | Dar el control al grupo con valores ya probados |

**Después de cada paso:** repetir la prueba 2 y comparar con el vídeo de referencia de la app Cámara.

---

## 12. Fuentes

- [Resoluciones de getUserMedia (webrtcHacks)](https://webrtchacks.com/getusermedia-resolutions-3/)
- [Restricciones de vídeo en getUserMedia (Addpipe)](https://blog.addpipe.com/getusermedia-video-constraints.md)
- [Control de zoom de cámara en Chrome para Android (Dynamsoft)](https://dynamsoft.com/codepool/camera-zoom-control-on-web.html)
- [Control de enfoque de cámara en la web (Dynamsoft)](https://www.dynamsoft.com/codepool/camera-focus-control-on-web.html)
- [Bitrates de MediaRecorder por navegador (Addpipe)](https://blog.addpipe.com/mediarecorder-video-bitrates/)
- [MediaRecorder: videoBitsPerSecond (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/videoBitsPerSecond)
- [Propuesta de control de estabilización en la web (W3C)](https://lists.w3.org/Archives/Public/public-webrtc/2025Feb/0002.html)
- [Modo noche solo vía APIs nativas (Android Developers)](https://developer.android.com/distribute/aep/aep-req-night-mode)
- [Introducing CameraX 1.5 (Android Developers Blog)](https://android-developers.googleblog.com/2025/11/introducing-camerax-15-powerful-video.html?hl=es)
