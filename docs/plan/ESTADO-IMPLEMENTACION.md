# One Shoot · Estado de la implementación

Documento para leer al volver. Sin código: qué hay, cómo probarlo, qué se ha decidido y qué queda.
El día a día está en [PROGRESO.md](PROGRESO.md).

## 1. Resumen

| Bloque | Funcionalidad | Estado | Notas |
| --- | --- | --- | --- |
| Grabación | Pasos 1–6 (Q1–Q8, C1–C5, S1–S3, R1–R5, A1) | **Hecha y desplegada** (16-10 17:33) | Falta probar en los Samsung (apartado 2) |
| Ideas | F1 Archivo vinculado · F2 Quién es quién | **Hechas y desplegadas** (16-10 18:13) | 3 rondas de revisión; migraciones aplicadas en Supabase |
| Ideas | F3 Tomas · F4 Mejor toma · F17 Voz y música | **Hechas y desplegadas** (16-10 19:14) | 2 rondas de revisión; migración `takes` aplicada |
| Ideas | F5 Repaso · F6 Notas sobre la toma · F7 Aplauso | **Hechas y desplegadas** (16-10 21:58) | 1 ronda de revisión con correcciones |
| Ideas | F8 Clips en tomas · F9 Zoom | En la rama, sin revisar | Migración `clip_zoom` escrita |
| Ideas | F10 Seguir a un bailarín | Pendiente | Migración `follow_paths` escrita |
| Ideas | F18 | No se hace | No está definida en el plan (ver PREGUNTAS) |
| Grupo | F13 Bolsas · F14 Random Play Dance | **Hechas y desplegadas** (16-10 21:58) | 1 ronda de revisión (BD e interfaz) con correcciones |
| Grupo | F11 Votaciones · F12 Lista de deseos | En la rama, sin revisar | Migración escrita |
| Grupo | F15 Reacciones · F16 Cuenta atrás | En construcción | Migración escrita |
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

### Ideas · F1 y F2 (en producción)

15. **Miembros (F2).** Ajustes → «Miembros del grupo» → «Añadir miembro» con nombre y color. Abajo a la izquierda
    (o arriba en el móvil) sale «¿Quién eres?»: elige tu nombre. Se recuerda en ese móvil.
16. **Archivo de un vídeo de YouTube (F1).** Abre una canción de YouTube → «Añadir archivo» → elige el mismo vídeo
    descargado por tu cuenta (la app no descarga nada de YouTube). Si dura distinto, avisa. Luego «Sincronizar»:
    reproduce los dos y pulsa en el mismo golpe de música; ajusta con ±. Desde entonces el selector
    «YouTube | Archivo» cambia de uno a otro en el mismo punto. Hasta 50 MB se sube a la nube para todo el grupo;
    más grande queda solo en ese móvil y los demás pueden vincular su propia copia.
17. **Cambiar / quitar archivo:** en el mismo panel. «Cambiar» elige el nuevo antes de quitar el viejo y, si falla,
    deja el anterior.
18. **Duplicados:** al añadir un vídeo con un título parecido a otro de la biblioteca, sale «¿Es la misma
    canción?». Las tarjetas con archivo llevan la marca «con archivo».

### Ideas · F3, F4 y F17 (en producción)

19. **Guardar una toma (F3).** Graba una toma → en el repaso, «Guardar en «Tomas»». Debe salir «Guardada en «Tomas»
    de esta canción». Cierra el grabador y abre la pestaña «Tomas» del estudio: está ahí con quién, cuándo, desde qué
    segundo y a qué velocidad. Recarga la página: sigue ahí y se reproduce. Sin red, «Guardar» avisa y se puede
    reintentar.
20. **Filtros y descarga:** filtra por persona, clip y fecha; «Descargar» desde la lista (en iPhone abre la hoja
    para guardarla en Fotos).
21. **Mejor toma (F4):** la estrella marca una por persona y tramo; aparece primera; «Limpiar» borra las que no
    tienen estrella.
22. **Compartir con el grupo:** «Compartir» hace una copia de 720p (≤ 50 MB) y la sube. En otro móvil se ve «En la
    nube» y se puede reproducir y descargar. El medidor «Nube del grupo» enseña el espacio real (vídeos y tomas).
23. **Voz y música (F17):** con un vídeo de archivo, la fila «Voz y música» del estudio: «Todo», «Sin voz» (baja
    la voz del centro; sale en mono) y «Voz» (el centro al frente). Con YouTube la fila explica que no se puede.
    Graba con «Sin voz»: el grabador dice «Con la canción sin voz» y la toma suena así.

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

2. **Borrar una toma compartida no libera espacio en la nube.** La regla del repositorio es «borrar = archivar» y el
   cliente nunca borra archivos del bucket; la especificación de F3 decía «Borrarla la quita de la nube». Se ha
   hecho: deja de verse y de poder leerse, pero el archivo sigue ocupando hasta que el administrador lo purgue. El
   medidor cuenta ese espacio. ¿Queréis una forma de purgar desde la app (solo para un administrador)?

## 5. PENDIENTES

- Pruebas en dispositivo (Samsung): todas las del apartado 2.
- Hallazgos de revisión con nota menor de 6 sin corregir: ver apartado 8.
- F1/F2 (ronda 3, todos < 6): si la vinculación falla justo después de guardar la copia nueva en el móvil, ese
  móvil puede quedar con la copia equivocada (5); si la subida falla durante «Cambiar archivo», el nuevo queda solo
  en ese móvil (5); «Quitar» y «Restaurar» no releen la ficha antes (4); el trigger de la 000200 deja algunos huecos
  a un cliente manipulado (3); «Volver a sincronizar» compara tamaños (3); las marcas de copia local no se limpian
  nunca (2). De rondas anteriores: R5 (4), R6 (3), R7 (3), consulta de administrador para limpiar archivos viejos
  del bucket (BD2), selector YouTube|Archivo de 36 px.
- F3/F4/F17 (ronda 2, todos < 6): faltan tests automáticos de `takeStore`, `useSaveTake`, `shareTake`, motor y
  almacén (5); tras un error dudoso al guardar se deshace la marca sin comprobar si la fila llegó (3); una carpeta
  con datos ilegibles y trozos ya no se borra pero tampoco se ofrece (3); `friendlyError` reconoce «0 filas» por
  texto (2); `DEPLOY.md` sin la receta de purga de tomas archivadas (2). De ronda 1: tomas huérfanas en un móvil si
  otra persona las borra (5), sin conexión con datos en caché (5), subida de «Compartir» sin cancelar (5), aviso de
  que Safari borra datos tras 7 días (5), «Voz» no aísla del todo la voz (5, textos ajustados), accesibilidad de
  chips y selector de fecha (4).

## 6. Migraciones

| Fecha | Migración | Qué hace | Estado |
| --- | --- | --- | --- |
| 16-10 18:08 | `20261016000000_linked_file_and_members` | Columnas de archivo vinculado (desfase, duración), reglas del bucket para el archivo de un vídeo de YouTube, tabla `members`, autor de las notas | Aplicada y verificada (19 PASS en producción, todo revertido) |
| 16-10 18:09 | `20261016000100_linked_file_guard` | La descripción del archivo vinculado no se reescribe; máximo 5 archivos por vídeo de YouTube; nombre simple para vídeos subidos | Aplicada |
| 16-10 18:09 | `20261016000200_linked_file_identity` | La protección anterior también para archivos que solo están en un móvil | Aplicada |

**Copia de seguridad previa:** `~/one-shoot-backups/20261016-1806-fase1/backup.json` (todas las tablas de
`public`, `storage.buckets` y `storage.objects`; 1 grupo, 3 vídeos, 3 clips, 2 notas, 0 archivos) y las
definiciones que se cambiaron. Fuera del repositorio.

**Vuelta atrás:** `~/one-shoot-backups/20261016-1806-fase1/rollback-fase1.sql` vuelve a poner las reglas
anteriores (funciones, restricciones, permisos). No borra la tabla `members` ni las columnas nuevas (la versión
anterior de la app las ignora). Antes de ejecutarlo, comprobar que ningún vídeo de YouTube tiene `storage_path`.

**Advisors tras aplicar:** nada nuevo. Siguen los avisos que ya había (protección de contraseñas filtradas en
Auth, que es un ajuste del panel y no se toca; dos políticas de lectura en `crews`; índices sin usar).

**Tipos:** regenerados desde el proyecto real y comparados con `database.types.ts`: coinciden. Diferencia
intencionada: en `members` el `crew_id` es opcional al insertar porque lo pone el servidor.

**Fase 2 (16-10 19:09):** `20261016010000_takes`: tabla `takes`, bucket privado `takes` (50 MB, solo vídeo),
compartir solo con el archivo subido (tamaño real), una mejor toma por persona y tramo, tope de 1 GiB entre vídeos
y tomas, función `storage_usage()` para el medidor. Aplicada y verificada (13 PASS en producción, todo revertido;
después 0 tomas, 0 objetos). Copia previa: `~/one-shoot-backups/20261016-1907-fase2/backup.json` (incluye la
definición anterior de `archive_row`). Vuelta atrás: `rollback-fase2.sql` en la misma carpeta (quita el acceso a
las tomas y repone `archive_row`; la tabla y el bucket se quedan, vacíos). Advisors: nuevos avisos 0028/0029 por
`public.storage_usage()`, intencionados (solo devuelve tres números, la app la necesita sin login); índices de
`takes` sin usar todavía. Tipos regenerados: coinciden.

**Fase 3 + bolsas (16-10 21:55):** `20261016020000_review_and_take_notes` (ajuste fino y encaje en la toma; notas
sobre la toma), `20261016030000_bags_and_tracks` (bolsas, sorteos, pistas; sorteo en el servidor con
`draw_from_bag`), `20261016035000_bag_draws_hardening` (el historial solo lo escribe el sorteo, con la hora del
servidor; índice y tope). Aplicadas y verificadas (5 + 10 PASS en producción, todo revertido). Copia previa y vuelta
atrás en `~/one-shoot-backups/20261016-2151-fase3-b1/`. Advisors: nada nuevo. Columnas reales comparadas con
los tipos: coinciden.

## 7. Laboratorio de diseño

Ajustes → «Mostrar laboratorio de diseño». Cada momento clave tiene sus variantes con una demostración en vivo.

| Momento | Variantes | Recomendada y por qué |
| --- | --- | --- |
| F17 · Separar voz y música | **La ola partida** (la ola se parte en voz bermellón y música índigo) · **Puertas correderas** (dos puertas de washi tapan lo que se quita) · **Capas de grabado** (tres planchas de ukiyo-e apiladas) | **La ola partida**: enseña de un vistazo qué suena sin tapar la ola de la canción |
| A1 · Panel de ajustes del grabador | **Bandeja de laca** (hoja inferior con celdas bento) · **Abanico** (varillas de un sensu que se despliegan) · **Makimono** (rollo de washi que se desenrolla) | **Bandeja**: la más rápida de leer y tocar con el móvil en la mano; las otras dos son más vistosas pero esconden opciones tras un gesto |

## 8. Revisiones

| Funcionalidad | Rondas | Hallazgos (nota) | Corregido |
| --- | --- | --- | --- |
| Grabación paso 1 | 1 | Ninguno 🔴. 7: formato que falla sin alternativa · 6: sin opción H.264 compatible · 6: botones cortados en horizontal · 5: panel sin Esc/foco, panel tapa el diálogo, avisos solapados, niveles H.264/HEVC en 4:3 · ≤4 varios | Todos los ≥6 y los 5 citados. Pendiente: «atrás» del móvil cierra el grabador entero con el panel abierto (4), formato real leído del archivo (5, se deja «declarado») |

| Grabación pasos 2–6 | 3 | Ronda 3: 🔴 9 «el iPhone no grababa» (lienzo congelado) | Todo lo ≥6 |
| F1 · F2 | 3 | Ronda 1: 🔴 7 vincular encima de otro archivo, 🔴 cambio no atómico · Ronda 2: 🔴 7 al quinto cambio se perdía el archivo, 6 copia propia borrada, 6 archivo solo-móvil pisable · Ronda 3: ninguno ≥6 | Todo lo ≥6; lo <6 en PENDIENTES |
| F3 · F4 · F17 | 2 | Ronda 1: 🔴 9 «Guardar» sin aviso en el repaso, 🔴 8/7 toma «compartida» sin archivo, 🔴 7 vídeo congelado con el audio suspendido, 🔴 7 «Sin voz» mudo en mono, 7 «Guardar» sin reintento, 6 tope de 1 GB solo en la app, 6 `meta.json` pisable, 6 contextos de audio sin cerrar, 6 grabador sin decir el modo · Ronda 2: ninguno ≥6 | Todo lo ≥6 y varios menores; lo <6 en PENDIENTES |

Informes: [funcional](revisiones/grabacion-paso1-ronda-1-funcional.md) ·
[rendimiento y diseño](revisiones/grabacion-paso1-ronda-1-rendimiento-diseno.md) ·
[F1/F2 ronda 1 BD](revisiones/F1-F2-ronda-1-bd-seguridad.md) · [F1/F2 ronda 1 cliente](revisiones/F1-F2-ronda-1-cliente.md) ·
[F1/F2 ronda 2](revisiones/F1-F2-ronda-2.md) · [F1/F2 ronda 3](revisiones/F1-F2-ronda-3.md) ·
[F3/F4/F17 ronda 1 BD](revisiones/F3-F4-F17-ronda-1-bd.md) · [cliente](revisiones/F3-F4-F17-ronda-1-cliente-tomas.md) ·
[voz](revisiones/F3-F4-F17-ronda-1-voz.md) · [ronda 2](revisiones/F3-F4-F17-ronda-2.md)
