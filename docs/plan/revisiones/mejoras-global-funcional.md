# Revisión global funcional · ronda de mejoras (puntos 1 a 39)

## Alcance

Revisión de solo lectura de `git diff 11dee4d..HEAD` (rama `feat/plan-completo`, 12 commits, 245 archivos) centrada en
lo que los revisores por bloque no podían ver: las interacciones **entre zonas**. He leído los 16 informes
`mejoras-*-ronda-*.md` para no repetir lo cerrado. Después he seguido en el código, a 390×844, estos recorridos:
- biblioteca → estudio → clip → grabar → repaso → tomas;
- bolsas → sacar → ronda;
- próxima cover → proponer → votar → ganar → biblioteca;
- eventos, y ajustes con el laboratorio.

Sin servidor, navegador ni Supabase. Vitest: `apps/web` 53 archivos y 706 pruebas; `packages/shared` 7 y 154. Todo
en verde, 860 en total, lo mismo que dice PROGRESO.

Zonas cruzadas que he mirado:
- **Capas:** el menú flotante (`QuickNav`, z-42) frente a la cabecera (z-40), los diálogos (z-50), el repaso y la
  ronda (z-45), la pantalla completa del estudio (z-70/75), el grabador (z-90) y los avisos (z-100). También
  `--fab-clearance` en las barras fijas y `overlayHost` en la pantalla completa nativa y CSS.
- **Historial:** `useBackToClose` y `useHistorySettled` con todas las capas que meten entrada en el historial: «⋯»,
  menú flotante, diálogos, `ActionMenu`, grabador, repaso, seguir, velocidad y ronda.
- **Reproductor y trabajos pesados:** `covered` frente a seguir, olas, voz y zoom; `heavyWork`; la copia para la nube
  frente a seguir, el grabador y la separación.
- **Archivo y voz:** «el archivo manda» (`stagePref` v2) frente a la copia ligera, las pistas de voz, Random Play Dance
  y seguir.
- **Versión:** la actualización automática y la manual frente a las tareas largas.
- **Búsqueda de YouTube:** `YouTubePicker` en «Añadir vídeo», deseos y bolsas, con la cuota y la caché del borde.
- **Laboratorio:** valores por defecto de los 5 momentos `appliesLive` y trozos fuera del precache.
- **Datos:** los gemelos de la demo frente a `guard_bag_item`, `video_stems` y el tope del bucket.
- **Textos** en español en toda la app.

## Lo que quedaba ≥6 en las últimas rondas: comprobado en HEAD

| Informe | Hallazgo | Estado |
| --- | --- | --- |
| grupo r3 [6] | «Salir» muerto tras recargar en mitad de la ronda | **Corregido.** `ownBackPending()` (`useBackToClose.ts:22`). `historySettleStep` salta la entrada vieja si no hay ningún `back()` propio en camino (`roundRules.ts:156-165`). `leaveRoundBy(…, onLayerEntry)` cambia a `replace` (`:177`), con reserva si no cambia la URL. |
| voz-archivo r2 [7] | Reintento de la separación atascado | **Corregido** en la migración sin publicar: `and o.name <> p_name` (`20261017130000_video_stems.sql:244`). |
| grabador r3 [6] | Juicio de las tomas directas | **Corregido.** `directTakeVerdict` juzga por el retraso, `presented 0 → unknown` y la media frente a la cuenta atrás (`recording.ts:600-623`). |
| nav-lab r2 [6] | Despliegue con `vercel --prod` a secas | **Corregido** en `PROGRESO.md:101-102` y `DEPLOY.md`, y la memoria `deploy-functional.md` ya dice `pnpm deploy:prod`. |
| 38 r1 [6] | Chip «con archivo» a 360–384 px | **Corregido**: pasa a solo icono con consulta de contenedor (`VideoCard.tsx:138`). |
| bolsas r1 [4] | Doble envío en «Buscar en YouTube» | **Corregido**: una sola mutación (`add`) con `sending` (`AddItemsDialog.tsx:186-245`). |

Sin regresiones vistas en esos arreglos.

## Hallazgos (de mayor a menor)

### [6] La copia para la nube no cuenta como trabajo pesado, y nada pesado cede ante el grabador

**Dónde:**
- `apps/web/src/lib/heavyWork.ts:6`
- `features/studio/cloudCopyJob.ts:145-155`
- `features/studio/cloudCopy.ts:562-612`
- `features/follow/analysisHold.ts:10-14`
- `features/record/pace.ts:270-300`
- `data/videos.ts:234-238` y `features/studio/LinkFilePanel.tsx:117-122`

**Problema.**
- **Cuándo empieza.** La copia ligera (punto 13) arranca sola al añadir o vincular un archivo de más de 50 MB. Es el
  caso exacto del responsable: «ARrC · Boom Boom Bass», 55,8 MB.
- **Dónde la ve.** Justo después la persona está en el estudio. El aviso dice «Puedes sincronizar mientras».
- **Qué hace.** Dura minutos en el hilo principal. Reproduce el original en un `<video>` oculto a 1–2×, con
  `drawImage` y `VideoEncoder` en cada fotograma, y sube el ritmo a 2× cuando el móvil parece libre.
- **Qué no sabe nadie.** `HeavyWorkKind` solo tiene `'voice'`. Ni `startCloudCopy` ni nadie marca la copia.

**Consecuencias:**
1. **Seguir.** El análisis de «seguir» no espera a la copia, solo a la voz. Son dos `<video>` ocultos más el del
   escenario descodificando el mismo 1080p.
2. **Grabador, punto 19 (crítico).** Al abrir el grabador, `covered` solo frena a seguir y a lo que pinta el estudio.
   La copia sigue a toda marcha. La separación con IA también sigue: está permitida en el móvil con WebGPU, «lenta».
   - Vuelven el retraso y los tirones de la vista previa a 1080p60, y se pierden fotogramas en la toma.
   - La prueba de fluidez y el juicio de las tomas solo se cancelan con la página oculta, el giro o un cambio de
     cámara. Con la carga de la copia, dos medidas seguidas dicen `fps30` o `smaller` con facilidad, y la app
     aprende ese tope para **30 días**.
   - Es probable que el responsable pruebe el 13 y el 19 en la misma sesión.
3. **Sincronía.** La sincronía del archivo vinculado se hace tocando a tiempo mientras suenan los dos, y la copia le
   quita fluidez justo entonces.

**Arreglo:**
- **Marcar la copia.** `HeavyWorkKind = 'voice' | 'copy'`. `startCloudCopy` llama a `beginHeavyWork('copy')` y la
  suelta en `finally`.
- **Seguir espera.** `holdReason()` devuelve también `'copy'`, con el texto «En pausa mientras se prepara la copia
  para el grupo».
- **La copia cede al grabador.** En `cloudCopy.ts`, pausarla mientras `usePlayer.covered`, igual que `hiddenPause`.
  Es seguro porque los tiempos salen de `mediaTime`. Hay que excluir esa pausa del detector de atasco (`pump`,
  25 s), como ya se hace con `document.hidden`.
- **La copia deja sitio al estudio.** Con el estudio reproduciendo, limitar `rate` a 1×, o usar el `duty` de seguir.
- **La separación cede al grabador.** Esperar entre trozos mientras `covered`, o al menos avisar en el grabador de
  que la separación sigue en marcha.
- **No aprender bajo carga.** En `pace.ts`, si hay trabajo pesado durante la prueba o la toma, el veredicto es
  `unknown` y no se aprende nada.

**Pruebas:**
- `holdReason` con la copia;
- `paceVerdict` y `directTakeVerdict` con trabajo pesado → `unknown`;
- la regla de pausa de la copia con `covered`.

### [5] Una actualización puede recargar la app en mitad de la copia para la nube

**Dónde:**
- `apps/web/src/main.tsx:30-48`
- `features/nav/version/versionRules.ts:87-89`
- `features/nav/version/VersionCheck.tsx:18-23`
- `features/studio/cloudCopyJob.ts:19-23` y `:83-121`

**Problema.**
- **Por diseño, la copia sobrevive a la canción.** Está «fuera de React: salir de la canción no la para». Sube por
  XHR, fuera de React Query, así que `useIsMutating` la ve como 0.
- **La regla de momento seguro no la ve.** `reloadNeedsConfirm` solo conoce `/v/`, los `[role="dialog"]` y las
  mutaciones en curso.
- **Qué pasa.** Con la copia en marcha y la persona en la biblioteca o en las bolsas, llega una versión nueva. Basta
  con la comprobación de cada hora de la app instalada, o con un despliegue: hay varios al día. En ≤2 s,
  `applyUpdateIfSafe` la aplica: `SKIP_WAITING` y recarga. El `beforeunload` de la copia saca el aviso del navegador
  «¿Volver a cargar el sitio?»:
  - **Aceptar:** se pierden minutos de copia, que hay que volver a lanzar a mano desde el estudio.
  - **Cancelar:** el service worker nuevo ya manda sobre la página vieja, y `cleanupOutdatedCaches` ha borrado su
    precache. El siguiente trozo perezoso da 404, `recoverFromStaleChunks` recarga y el aviso sale otra vez.
- **Lo mismo a mano.** «Buscar actualización» en «⋯» o en Ajustes la aplica sin preguntar.

**Arreglo:**
- Añadir `busy` a `reloadNeedsConfirm`, con `heavyWorkRunning('copy') || heavyWorkRunning('voice')`, en `main.tsx` y
  en `VersionCheck`.
- En la confirmación, decir «Se está preparando la copia para el grupo: si actualizas ahora, se pierde».
- Añadir el caso a `versionRules.test.ts`.

### [4] En los demás móviles, la copia ligera sustituye sin avisar a YouTube a mejor calidad

**Dónde:** `features/studio/stageRules.ts:9`, `StudioPage.tsx:629-631` y `cloudCopyRules.ts:58`.

**Problema.**
- **Qué se elige.** Con el punto 12 («el archivo manda») y el 13, cualquier móvil con la copia en la nube abre la
  copia ligera, no YouTube. La copia es de 1080p o 720p con poco bitrate, más pequeña en vídeos largos.
- **Choca con el punto 6.** Pide la mayor calidad posible, y YouTube puede dar 1080p con la misma conexión.
- **Nadie lo sabe.** La fila «Vídeo» enseña `file_name`, el nombre del original, así que nadie sabe que ve una copia
  reducida.

**Arreglo:**
- Que la fila diga «Copia del grupo · 720p». La altura se puede leer en el momento con `videoHeight`.
- Preguntar al responsable si la copia debe ganar a YouTube, o solo cuando sea ≥1080p.

### [3] Los avisos tapan el botón flotante y las barras de acción fijas

**Dónde:** `providers/ToastProvider.tsx:70-82` y `components/AppShell.tsx:186`.

**Problema.**
- **Dónde están.** El contenedor de avisos va en `body`, fuera del `div` del shell que define `--fab-clearance`.
  Está centrado, ocupa casi todo el ancho en el móvil, va con `z-100` y cada aviso lleva `pointer-events-auto`.
- **Qué tapa.** Durante 3,2 s, o 5,2 s si es un error, tapa y se queda los toques de:
  - el botón flotante, abajo a la derecha;
  - la parte de la derecha de las barras pegadas abajo: «Crear votación», «Votar» y «Empezar».

**Arreglo:**
- Avisos con `pointer-events-none`, porque no llevan acciones.
- O, en el móvil con el menú flotante a la vista, subirlos por encima del botón con
  `bottom: calc(84px + env(safe-area-inset-bottom))`, poniendo la variable en `document.documentElement`.

### [3] Cuando una capa se abre mientras otra se cierra, queda una entrada vieja en el historial

**Dónde:**
- `lib/useBackToClose.ts:46-52`
- `features/nav/quickNavCore.tsx:140-145`
- `features/wishes/ActionMenu.tsx:23`
- `components/AppShell.tsx:382` y `:492`

**Problema.**
- **Cómo pasa.** La capa nueva hace `pushState` antes de que llegue el `back()` de la que se cierra. Ese pop se
  traga, la nueva vuelve a marcar y la entrada de la anterior queda debajo. Resultado: un «Atrás» que no hace nada
  antes de salir de la página.
- **Dónde se ve:**
  - «¿Quién eres?» desde el menú flotante, que lo esquiva con dos `requestAnimationFrame` y falla en un móvil lento;
  - las acciones de `ActionMenu` que abren un diálogo, en deseos y en la votación;
  - «Instalar app» en «⋯», cuya ayuda se abre con el menú abierto.
- **Por qué no está ya resuelto.** `useHistorySettled` lo arregla, pero solo en la ronda.

**Arreglo:**
- Llevar esa espera a `useBackToClose`: si `ownBackPending()` es verdadero al abrir, esperar al `popstate`, o a
  `WAIT_MS`, antes del primer `mark()`.
- Así lo aprovechan todas las capas y sobra el truco de los dos fotogramas.
- Añadir un test de la regla.

### [3] El diálogo elige su sitio en cada render: se monta de nuevo al salir de la pantalla completa

**Dónde:** `components/ui/Dialog.tsx:164`.

**Problema.**
- **Cómo pasa.** En el ordenador, con la pantalla completa nativa del estudio, «S» abre «Guardar clip» y «N» abre la
  nota, dentro del escenario.
  - Esc lo gasta el navegador en salir de la pantalla completa, y el diálogo sigue abierto.
  - En Android, «Atrás» también sale primero de la pantalla completa.
- **Qué falla.** Con el siguiente render, que es la primera tecla, `overlayHost()` devuelve `body`. El portal cambia
  de contenedor y React monta el diálogo otra vez: el campo del nombre pierde el foco y la animación de entrada se
  repite.

**Arreglo.** Fijar el contenedor al abrir, con un `ref` que se fija cuando `open` pasa a `true`. Si sale de la
pantalla completa, cerrar o reubicar una sola vez a propósito.

### [3] El punto 7 se dio por hecho, pero queda un botón «Ampliar»

**Dónde:** `features/studio/ZoomControls.tsx:125-142` y `ESTADO-IMPLEMENTACION.md:136`.

**Problema.**
- El responsable pidió zoom «solo con los dedos, sin botones de ampliar y reducir».
- Queda «Ampliar» en la fila «Zoom». Tiene un buen motivo: la alternativa de un solo dedo, WCAG 2.5.1.
- Pero es una decisión que no se le ha preguntado: MEJORAS dice «pregunta antes de inventar».

**Arreglo.** Contárselo y que decida, o pasar «Ampliar» a un menú discreto de la fila.

### [3] ESTADO no recoge esta ronda y en varios puntos dice lo contrario

**Dónde:** `docs/plan/ESTADO-IMPLEMENTACION.md:45`, `:50-51`, `:240-242` y la tabla de migraciones.

**Problema.** El responsable prueba con ESTADO («qué hay y cómo probarlo»), y dice:
- «Laboratorio retirado… ya no hay nada que elegir en Ajustes», justo cuando 6 puntos se eligen en el laboratorio;
- que más de 50 MB «queda solo en ese móvil», cuando ahora hay copia ligera;
- que «¿Quién eres?» está «arriba en el móvil», cuando ahora está en el menú de abajo a la derecha.

Además:
- no hay pasos de prueba para el menú flotante, la versión, la copia, la separación con IA, YouTube en las bolsas y
  al proponer, ni la cuenta atrás larga;
- las tres migraciones sin aplicar (`20261017120000`, `130000` y `140000`) no están en la tabla, y la regla del
  usuario es aplicarlas antes del despliegue.

**Arreglo.** Actualizar esos apartados y añadir una sección de prueba manual de los 39 puntos, con las migraciones
pendientes.

### [2] Random Play Dance no respeta «YouTube» elegido a mano

**Dónde:** `features/rpd/useClipSource.ts:40-63`.

**Problema.** Si en el estudio la persona eligió YouTube para una canción vinculada (`rememberStage`), la ronda pone
igualmente el archivo. Pasaba antes, pero el punto 12 dice «YouTube solo si no hay archivo o si la persona lo elige».

**Arreglo.** Leer `readStage(video.id)` en `resolveSource`.

### [2] «Este móvil» y «este dispositivo» se mezclan

**Dónde:** 18 «en este móvil» frente a 25 «en este dispositivo», por ejemplo `StudioPage.tsx:985` («Solo en este
móvil · Subir a la nube») y `DesignLabSection.tsx:67` («cambia la app en este móvil»).

**Problema.** También se ven en el ordenador, donde «móvil» no es verdad.

**Arreglo.** Una sola palabra: «dispositivo», o «móvil» solo cuando el puntero sea táctil.

### [2] El menú de reserva no tiene «¿Quién eres?»

**Dónde:** `features/nav/QuickNav.tsx:145-231`.

**Problema.** Si el trozo del prototipo no carga, `PlainQuickNav` solo tiene las 5 secciones. «¿Quién eres?» va
obligatoriamente en ese menú y ya no está en «⋯», así que en el móvil no hay forma de elegirlo, salvo las preguntas
al crear una nota o una toma.

**Arreglo.** Añadir la entrada con `openWho`.

### [2] Mensaje equivocado al llevar canciones de YouTube a la ronda

**Dónde:** `features/bags/BagPage.tsx:241-245`.

**Problema.** Al llevar a la ronda canciones de YouTube que solo están en la bolsa, el aviso dice «no tiene clips».
La causa real es que no está en la biblioteca.

**Arreglo.** Contar aparte las que no son de la biblioteca: «… no están en la biblioteca y se quedan fuera».

### [2] El puntero desaparece sobre un diálogo en la pantalla completa

**Dónde:** `StudioPage.tsx:894`.

**Problema.** `[&[data-idle]_*]:!cursor-none` también alcanza al diálogo montado dentro del escenario. Con la canción
sonando, el ratón desaparece sobre «Guardar clip» a los 2,5 s sin moverlo.

**Arreglo.** Excluir `[role=dialog]` del selector, o no ocultar los controles con un diálogo abierto.

### [1] La ola B sigue pintando bajo el grabador

**Dónde:** `features/voice/VoiceOlaAudio.tsx:156-168`.

**Problema.** El cabezal de «Olas del audio real» sigue pintando con cada cambio del store. No mira `covered`, como
sí hacen la línea de tiempo y el zoom. Es barato, porque está en `Dormant`, pero no sigue la regla del resto.

**Arreglo.** `if (usePlayer.getState().covered) return;` en `paint`.

### Comprobado sin hallazgos

- **Capas.** El menú flotante se oculta en `/v/…` (estudio, grabador y repaso), en `/rpd/jugar` y con cualquier
  pantalla completa. Las barras pegadas de `/rpd`, `/deseos` y la votación respetan `--fab-clearance`. `main` deja
  84 px abajo, y la fila «Sacar / Añadir» de la bolsa no queda bajo el botón a 390×844.
- **Diálogos y avisos.** En la ronda, `<html>` a pantalla completa, van a `body`. En el estudio CSS van dentro de
  `[data-fs]`, sobre los controles, y los avisos a z-100 en `body`, por encima de todo.
- **Historial.** Elegir en el menú flotante, en «⋯» o en el de reserva reemplaza la entrada del menú: «Atrás» vuelve
  en un toque. El grabador y el repaso tragan «Atrás» mientras hay algo que perder.
- **Separación y seguir.** La separación con IA para el análisis de seguir (`heavyWork` y `untilFree`, con el texto
  «En pausa mientras se separa la voz»), y se cancela al salir de la canción.
- **`covered`.** Lo respetan seguir, el zoom, la línea de tiempo y el reloj. Las pistas de voz siguen al vídeo bajo
  el grabador, que graba lo que se oye.
- **Laboratorio.** Valores por defecto: `sensu`, `koyomi`, `onda` (la A arreglada), `lista` y `actual`. Todos son
  `appliesLive`. Las demos (`*Demo-*.js`) están fuera del precache con caché propia, y ningún componente real importa
  una demo.
- **Búsqueda de YouTube.** Va a una URL canónica en minúsculas con `s-maxage=86400`, así que repetir una búsqueda en
  «Añadir vídeo», deseos o bolsas no gasta cuota.
- **Datos demo frente a la base.**
  - `insertBagItem` de la demo reproduce `guard_bag_item`: la canción de YouTube que ya está en la biblioteca entra
    como el vídeo de la biblioteca, una sola fuente, sin duplicados entre fuentes.
  - `demoStems` reproduce el orden de `stem_object_allowed` y el tope de 16 MiB.
  - `uploadFile` reproduce el tope del bucket.
- **Bolsas, deseos y eventos.**
  - Una canción de YouTube solo de la bolsa queda fuera de la ronda sin romperla.
  - Solo «Añadir a la biblioteca» crea vídeos.
  - La bolsa de candidatas de un evento solo mete vídeos de la biblioteca.
- **Textos.** No he encontrado textos en inglés en la interfaz nueva.

## Veredicto

**Sí, hay un hallazgo ≥6, que se corrige sí o sí: [6]**, la copia para la nube como trabajo pesado:
- que pare a seguir;
- que ella y la separación cedan ante el grabador;
- que el grabador no aprenda topes con carga ajena.

Choca de frente con el punto 19 (crítico) en el caso real del punto 13. Conviene hacer el **[5]** en la misma pasada,
porque usa la misma marca para que una actualización no recargue a mitad de la copia.

Todo lo que quedaba ≥6 en las rondas por bloque está bien corregido. El [4] y el [3] del zoom son decisiones del
responsable. El resto es menor y puede ir a pendientes, aunque los [3] de los avisos, el historial y ESTADO son
cortos.
