# One Shoot · Estado de la implementación

Documento para leer al volver. Sin código: qué hay, cómo probarlo, qué se ha decidido y qué queda.
El día a día está en [PROGRESO.md](PROGRESO.md).

## 1. Resumen

| Bloque | Funcionalidad | Estado | Notas |
| --- | --- | --- | --- |
| Grabación | Paso 1 · Panel «i», compresión, formato, zoom de lente | Hecha (pendiente de cierre) | |
| Grabación | Paso 2 · Guardar mientras graba, espacio | Hecha (pendiente de cierre) | |
| Grabación | Paso 3 · Resolución máxima, 60 fps, cámara inicial | En curso | |
| Grabación | Pasos 4–6 | No empezados | |
| Ideas | F1–F10, F17, F18 | No empezadas | F18 no está definida en el plan (ver PREGUNTAS) |
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
6. **Espacio.** En la línea de abajo del grabador sale «~N min libres» para la calidad actual. Con el móvil
   casi lleno aparece un aviso en rojo.

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

_(todavía no existe; llega con el panel de ajustes del grabador, paso 6)_

## 8. Revisiones

| Funcionalidad | Rondas | Hallazgos (nota) | Corregido |
| --- | --- | --- | --- |
| Grabación paso 1 | 1 | Ninguno 🔴. 7: formato que falla sin alternativa · 6: sin opción H.264 compatible · 6: botones cortados en horizontal · 5: panel sin Esc/foco, panel tapa el diálogo, avisos solapados, niveles H.264/HEVC en 4:3 · ≤4 varios | Todos los ≥6 y los 5 citados. Pendiente: «atrás» del móvil cierra el grabador entero con el panel abierto (4), formato real leído del archivo (5, se deja «declarado») |

Informes: [funcional](revisiones/grabacion-paso1-ronda-1-funcional.md) ·
[rendimiento y diseño](revisiones/grabacion-paso1-ronda-1-rendimiento-diseno.md)
