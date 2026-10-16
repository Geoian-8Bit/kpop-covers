# One Shoot · Estado de la implementación

Documento para leer al volver. Sin código: qué hay, cómo probarlo, qué se ha decidido y qué queda.
El día a día está en [PROGRESO.md](PROGRESO.md).

## 1. Resumen

| Bloque | Funcionalidad | Estado | Notas |
| --- | --- | --- | --- |
| Grabación | Pasos 1–6 (Q1–Q8, C1–C5, S1–S3, R1–R5, A1) | **Hecha y desplegada** (16-10 17:33) | Falta probar en los Samsung (apartado 2) |
| Ideas | F1 Archivo vinculado · F2 Quién es quién | Hechas en la rama, en revisión | Necesitan su migración; se despliegan en el cierre de la fase 1 |
| Ideas | F3–F10, F17 | No empezadas | Migración de F3/F4 ya escrita |
| Ideas | F18 | No se hace | No está definida en el plan (ver PREGUNTAS) |
| Grupo | F11–F16 | No empezadas | |
| IA | Análisis de postura | No empezada | |

## 2. Cómo probar

### Grabación · pasos 1 y 2 (en un Samsung con la app instalada)

1. **Panel «i».** Abre una canción → «Grabar» → botón «Info» en la columna de la derecha. Comprueba:
   resolución real, fotogramas, zoom de lente (mínimo y máximo), qué controles ofrece la cámara, el formato
   (HEVC o H.264 High) y la compresión pedida. Apunta lo que salga en cada móvil (S24, S24 Ultra, S25).
2. **Formato.** En el mismo panel, «Formato preferido»: *Automático* (HEVC si el móvil puede) o *Compatible*
   (siempre H.264). Graba 20 s con cada uno y comprueba que el vídeo se ve en la Galería, en WhatsApp y en el
   ordenador. Si HEVC no se ve en algún sitio, deja *Compatible*.
3. **Calidad real.** Tras grabar, «Detalles» en la pantalla de repaso: «Compresión real (total)» debería
   acercarse a la pedida (12 Mbps a 1080p 30, 18 a 1080p 60). Compara con la prueba 2 del plan (vídeo de
   referencia de la app Cámara).
4. **Zoom.** Pellizca la vista previa y usa los botones 1×/2×/3×/5×. Si sale el aviso «Zoom digital: menos
   nitidez», ese zoom no es de la lente.
5. **Toma que sobrevive a un cierre.** Empieza a grabar, espera 20 s y cierra la app a la fuerza (multitarea →
   deslizar). Vuelve a abrir la misma canción y «Grabar»: debe aparecer «Hay una toma sin guardar de esta
   canción» con su tamaño. «Recuperar» la abre en el repaso para guardarla.
6. **Espacio.** En la línea de abajo del grabador sale «espacio para unos N min» para la calidad actual. Con el
   móvil casi lleno aparece un aviso en rojo.

### Grabación · pasos 3 a 6

7. **Cámara al abrir:** ahora abre la trasera. En Ajustes del grabador (botón «Ajustes» o tocando el chip
   «1080p · 60 · Auto» de arriba) se puede elegir frontal o «última usada».
8. **60 fps:** con «Fotogramas 60» el chip debe decir «· 60 ·». Si la cámara no da 60 a esa resolución, sale un
   aviso y el chip se pone dorado.
9. **4K:** Calidad «Máxima» pide 4K a 30. Comprueba en «i» la resolución real y que la toma no se corte en
   10 minutos (calor: a los 6 min sale un aviso).
10. **Imagen directa:** en la app instalada, una toma sin zoom digital graba la imagen de la cámara tal cual (el
    panel «i» dice «Directa»). Gira el móvil a mitad: la pantalla no rota durante la toma. En el navegador (sin
    instalar) la toma va «por lienzo». Graba una en vertical y otra en horizontal y comprueba en la Galería que
    salen derechas.
11. **Enfoque y luz:** toca un punto de la imagen (anillo dorado) y mantén pulsado para fijarlos («Enfoque y luz
    fijos»). Botón «Imagen»: luz −2 a +2 y color de la luz (Cálida, Fluorescente, Día, Nublado). Solo aparece lo
    que ofrezca la cámara.
12. **Sonido:** con un vídeo de archivo, toca la píldora de sonido de arriba para cambiar entre canción limpia y
    micro (estéreo). Comprueba en la toma que se oye lo elegido y va sincronizado.
13. **Rejilla y nivel:** actívalos en Ajustes del grabador; el nivel se pone dorado con el móvil recto.
14. **Recuperación:** como en el punto 5, también tras un cierre en mitad de la toma en la app instalada.

## 3. DECISIONES

1. **F17 y F18.** El plan de ideas que se copió a `docs/plan/` no define F17 ni F18. F17 se toma del plan de
   grabación («separar la voz de la música»). F18 no se puede deducir: no se implementa y va a PREGUNTAS.
2. **Pruebas de base de datos sin Docker.** En este ordenador no hay Docker ni la CLI de Supabase. Se ha
   añadido `pnpm db:test`, que aplica todas las migraciones desde cero en un Postgres en memoria (PGlite) con
   una imitación mínima de Supabase y pasa las comprobaciones de `supabase/tests/`. No sustituye a probar en el
   proyecto real, pero detecta migraciones rotas.
3. **Pasos 1 y 2 de grabación se cierran juntos.** La revisión del paso 1 avisó de que subir la compresión sin
   guardar la toma en el almacenamiento del móvil (paso 2) podía llenar la memoria en tomas largas. Por eso se
   publican los dos a la vez.
4. **Toma escrita en trozos.** Chrome solo confirma un archivo grande al cerrarlo; si la app se cerraba a mitad,
   se perdía todo. Cada segundo de toma se guarda como un archivo pequeño y al final se juntan sin copiarlos en
   memoria. Si la app muere, se pierde como mucho el último segundo.
5. **Formato que falla.** Si el navegador dice que puede grabar HEVC o H.264 High pero el codificador del móvil
   falla, la app lo recuerda en ese móvil y la siguiente toma usa el siguiente formato. Alternativa descartada:
   volver siempre al formato básico (Baseline), que pierde la mejora de calidad.
6. **Cámara al abrir: trasera** (plan Q8). Antes era la frontal.
7. **Pasos 1 a 6 de grabación se cerraron y desplegaron juntos.** Los seis tocan los mismos archivos del
   grabador y varios arreglos de revisión cruzaban pasos; desplegar a medias habría dejado versiones con fallos
   ya conocidos (por ejemplo, más compresión sin guardar la toma en el móvil).
8. **Despliegue desde la raíz del repositorio**, no desde `apps/web` como dice DEPLOY.md: la carpeta `apps/web`
   está vinculada en este ordenador a otro proyecto de Vercel llamado «web»; la raíz está vinculada a
   `kpop-covers`, que ya tiene `apps/web` como carpeta de la app. No se ha tocado ningún ajuste de Vercel.
   Para que cada despliegue sea exactamente `main`, se construye y despliega desde una copia limpia de `main`.
9. **Imagen directa solo con la rotación bloqueada.** Grabar la imagen de la cámara tal cual (Q5) solo es seguro
   si el tamaño no cambia a mitad; la app bloquea la rotación al empezar la toma. Eso solo se puede en la app
   instalada o a pantalla completa; si no se puede, la toma va por el lienzo (que sí aguanta un giro). En iPhone
   siempre lienzo (guardaba los vídeos tumbados).
10. **Formatos que fallan se recuerdan por familia** (HEVC, H.264 High…), 30 días y por versión del navegador, y
    se pueden volver a probar desde el panel «i».
11. **Laboratorio de diseño:** la variante elegida se aplica aunque se oculte el laboratorio (el laboratorio solo
    oculta el selector). Lo pidió el prompt («la elección se guarda en el dispositivo»).
12. **Panel «i» oculto por defecto** (A1: «Información técnica, desactivado»). Se activa en Ajustes del grabador.

## 4. PREGUNTAS

**Bloquean algo**

1. **¿Qué es F18?** El prompt la pone en la fase 1 de ideas, pero el documento de ideas no la describe. No se
   ha implementado nada.

**El resto**

_(ninguna todavía)_

## 5. PENDIENTES

- Pruebas en dispositivo (Samsung): todas las del apartado 2.
- Hallazgos de revisión con nota menor de 6 sin corregir: ver apartado 8.

## 6. Migraciones

_(ninguna nueva todavía)_

## 7. Laboratorio de diseño

Ajustes → «Mostrar laboratorio de diseño». Cada momento clave tiene sus variantes con una demostración en vivo.

| Momento | Variantes | Recomendada y por qué |
| --- | --- | --- |
| A1 · Panel de ajustes del grabador | **Bandeja de laca** (hoja inferior con celdas bento) · **Abanico** (varillas de un sensu que se despliegan) · **Makimono** (rollo de washi que se desenrolla) | **Bandeja**: la más rápida de leer y tocar con el móvil en la mano; las otras dos son más vistosas pero esconden opciones tras un gesto |

## 8. Revisiones

| Funcionalidad | Rondas | Hallazgos (nota) | Corregido |
| --- | --- | --- | --- |
| Grabación paso 1 | 1 | Ninguno 🔴. 7: formato que falla sin alternativa · 6: sin opción H.264 compatible · 6: botones cortados en horizontal · 5: panel sin Esc/foco, panel tapa el diálogo, avisos solapados, niveles H.264/HEVC en 4:3 · ≤4 varios | Todos los ≥6 y los 5 citados. Pendiente: «atrás» del móvil cierra el grabador entero con el panel abierto (4), formato real leído del archivo (5, se deja «declarado») |

Informes: [funcional](revisiones/grabacion-paso1-ronda-1-funcional.md) ·
[rendimiento y diseño](revisiones/grabacion-paso1-ronda-1-rendimiento-diseno.md)
