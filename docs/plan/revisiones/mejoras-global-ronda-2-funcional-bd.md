# Revisión global · ronda 2 (funcional y base de datos) de la ronda de mejoras

## Alcance

Revisión de solo lectura de `git diff d58885e..0e6df92` (rama `feat/plan-completo`), el commit «fix: global review —
heavy-work coordination, lighter chunks, accessibility». Compruebo los hallazgos ≥3 de `mejoras-global-funcional.md` y
`mejoras-global-bd-seguridad.md` y busco regresiones de las correcciones. He mirado con más detalle:
- `heavyWork` (copy/voice, `idle`, `reloadBusy`, `untilHeavyWork`) y su uso en `cloudCopy`, `cloudCopyRun` y
  `cloudCopyJob`;
- la separación (pausa del worker, `held`, `wait-copy`, `encodeFitting`, `stems_too_big`);
- `analysisHold` y `pace` (`unknown` con trabajo pesado, ventana de 60 s);
- `versionRules`, `main.tsx` y `VersionCheck`;
- `Dialog` con `overlayPlacement`, y `ToastProvider`;
- `stageRules` (`playsGroupCopy`, `groupCopyLabel`), `PlainQuickNav` con «¿Quién eres?» y `roundSkipText`;
- las cargas perezosas (`FollowFsMenu`, `SeparateVoiceButton`, `analyze`, `peopleInFrame`, `labIds`, las cuentas atrás,
  `cloudCopyRun`) y el `"sideEffects": false` de `packages/shared`;
- los tests SQL (`set_config`, 42501 como FAIL).

Sin servidor, navegador ni Supabase real.

**Ejecutado:**
- `vitest` en `apps/web`: 58 archivos, 749 tests, todo en verde. En `packages/shared`: 7 archivos, 155 tests.
- `tsc --noEmit` en `apps/web`: sin errores.
- `node supabase/tests/local/run.mjs`: 23/23 migraciones, 12/12 archivos, 129 PASS.

## Hallazgos de la ronda 1 → estado

| Hallazgo de ronda 1 | Estado |
| --- | --- |
| Funcional [6] · La copia no cuenta como trabajo pesado y nada cede ante el grabador | **Corregido.** Ver el detalle debajo de la tabla. Queda [2] menor: ver hallazgos nuevos. |
| Funcional [5] · Una actualización recarga a mitad de la copia | **Corregido.** `reloadBusy()` entra en `isSafeMoment` (`main.tsx:31-38`) y en `needsConfirm` de `VersionCheck`. La confirmación dice qué se pierde (`busyReloadText`). Tests en `versionRules.test.ts`. El sondeo de 2 s aplica la versión cuando acaba la copia. Queda un camino lateral, `vite:preloadError` ([2]). |
| Funcional [4] · La copia ligera sustituye a YouTube sin avisar | **Corregido en lo que toca al código.** La fila dice «Copia del grupo · 720p» (`stageRules.ts:47-66`, `StudioPage.tsx:721-733`). La regla es correcta, porque solo se hace copia si el original pasa del límite, y `uploadGroupFile` solo cambia `storage_path`, así que `file_size` sigue siendo el del original. La decisión de fondo está en PREGUNTAS 4 de ESTADO. |
| Funcional [3] · Los avisos tapan el botón flotante y las barras fijas | **Corregido.** El contenedor sube por encima de `--fab-scroll-pad` y `--sticky-bar-h` (`ToastProvider.tsx:74`), y la franja es `pointer-events-none`. `useStickyBarPadding` está en `/rpd`, en la votación y en «Elegir para votar». |
| Funcional [3] · Una capa que se abre mientras otra se cierra deja una entrada vieja en el historial | **No corregido; está apuntado** en ESTADO §5 («Grupo… entrada de historial de más (3)»). `useBackToClose` no cambia. El «¿Quién eres?» nuevo de `PlainQuickNav` usa el mismo truco de dos fotogramas que los prototipos. |
| Funcional [3] · El diálogo se monta de nuevo al salir de la pantalla completa | **Corregido a medias.** Ya no se monta de nuevo: el envoltorio es fijo y se conserva el foco. Pero al salir de la pantalla completa nativa no se lleva a `body` (hallazgo nuevo [3]). |
| Funcional [3] · Queda «Ampliar» en el zoom | **Pasa a decisión** (PREGUNTAS 5). Además hay flechas para mover la zona (`ZoomControls.tsx:210-248`, WCAG 2.5.7). |
| Funcional [3] · ESTADO no recoge la ronda | **Casi corregido.** Tiene los apartados 38–47 de prueba manual, las migraciones en la línea 20, PREGUNTAS 3–8 y los pendientes. Quedan tres restos ([2]). |
| BD [4] · Borrados directos en `storage.objects` en los tests | **Corregido.** `set_config('storage.allow_delete_query', 'true', true)` tras `begin;` en `plan_stems_checks.sql` y `archive_checks.sql`. Así `archive_checks` prueba la RLS y no el trigger. |
| BD [3] · Las pistas dan por hecho 16 MiB y nadie lo impone en la subida | **Apuntado como límite conocido** en ESTADO §5 («las pistas suponen 16 MiB por archivo sin bucket propio (3)»). Es lo que pedía la ronda 1. |
| BD [3] · No se comprueba que cada pista quepa en 16 MiB | **Corregido.** Ver el detalle debajo de la tabla. |
| BD [2] · Un 42501 sale como INCONCLUSIVE | **Corregido.** `when insufficient_privilege then raise exception 'FAIL …'` va antes de `when others`, en los tres bloques (`plan_stems_checks.sql:75`, `:192`, `:259`). |

**Detalle del [6] funcional:**
- La copia es `beginHeavyWork('copy')` desde que empieza hasta el `finally` (`cloudCopyJob.ts:96-110`). Pasa a
  `idle` mientras espera o sube.
- Seguir espera a una copia que está trabajando: `holdReason` devuelve `'copy'` y no lo hace si solo sube. Hay tests.
- La copia se para con el grabador abierto o con la separación en marcha, y va a 1× como mucho con el estudio
  sonando (`copyPace`, `readPace`). El detector de atasco no salta en esas pausas, porque se pone `lastFrameAt` al día.
- La separación espera a una copia que está trabajando (`wait-copy`). Con el grabador, se para entre trozos (mensaje
  `pause`/`held`) y antes de codificar (`whileCovered`).
- `runBench` da `unknown` y no guarda el reposo si hubo carga desde `restStart`. `judgePace` no aprende si hubo carga
  en los últimos 60 s.
- No hay bloqueo mutuo: la separación espera a que la copia esté **trabajando**, y la copia espera a que la separación
  esté **en marcha**. Una copia en pausa deja de trabajar, así que la separación arranca y la copia la espera.

**Detalle del [3] BD de las pistas:**
- `encodeFitting` vuelve a codificar hasta 3 veces con menos bitrate, como mínimo 64 kb/s, y solo sube pistas que
  pasan `stemFits`. `STEM_MAX_BYTES` vale lo mismo que el 16777216 de la migración.
- Si llega `stems_too_big` (por ejemplo, de una fila anterior), archiva la fila, olvida el pendiente y da un mensaje en
  español (`runSeparation.ts:411-427`).

**Comprobado sin hallazgos:**
- **`heavyWork`.** Tiene un contador por entrada, y terminar dos veces no hace nada. `lastBusyAt` solo se actualiza al
  dejar de trabajar. `untilHeavyWork` se suelta con el `abort`.
- **`sideEffects: false` en `packages/shared`.** Ningún módulo de `src/` tiene código de nivel superior con efectos:
  solo declaraciones y `export *`. `DECIDE_AFTER` es literal y un test lo ata a `CLAP_LEVELS`
  (20 + ⌈70/0,5⌉ + 4 = 164). `database.types` solo se reexporta como tipo.
- **`labIds` frente a `registry`.** `labState` usa un tipo estructural (`MomentShape`) y un test compara las dos
  listas. `tsc` pasa.
- **Cuentas atrás perezosas.** Si un trozo falla, queda `NoDesign` y la banda tiene tamaño fijo. Están en el precache.
- **`cloudCopyRun` perezoso.** Si no carga, el error es «No se pudo empezar la copia…» (en español), y con `abort` se
  limpia el trabajo. Los avisos de salida y el bloqueo de pantalla se activan al empezar el trabajo y se cuentan por
  trabajo (`active`).
- **`analyze` perezoso en `useFollowActions`.** Un fallo de red acaba en `friendlyError` («Sin conexión…»). Comparar
  por `err.name === 'FollowError'` es correcto, porque el constructor fija `name`.
- **`PlainQuickNav`.** «¿Quién eres?» / «Eres …» vienen de `MembersUI`, que ya va en el trozo de entrada. Tiene trampa
  de Tab y `role="dialog"` con nombre en el contenedor.
- **`roundSkipText`.** Distingue «aún no está en la biblioteca» de «no tiene clips». Los textos están en español, con
  singular y plural.
- **Prototipos del menú fuera del precache.** Se cachean al usarlos (`lab-demos`). Sin conexión, el menú de reserva se
  vuelve a intentar con `online`.

## Hallazgos nuevos

- **[5] `apps/web/src/features/studio/StudioPage.tsx:578-582` — Cambiar de motor cancela en silencio la separación con
  IA.**
  - **Qué cambia.** `SeparateVoiceButton` ahora se monta solo con `available` (`engine?.setVoiceMode`). Antes estaba
    siempre montado y devolvía `null` sin perder su estado.
  - **Cuándo pasa.** El motor del escenario se suelta (`detach`) cada vez que:
    - se toca «YouTube» en la fila «Vídeo»;
    - el escenario se monta de nuevo («Sincronizar», un desfase nuevo, reintentar, subir el archivo).
  - **Qué pasa.** El componente se desmonta. Su limpieza (`SeparateVoiceButton.tsx:54-61`) hace
    `job.current?.abort()`, y `set()` ya no pinta nada.
    - Se pierden entre 5 y 15 minutos de separación sin ningún aviso.
    - Desaparece el aviso de salida (`beforeunload`).
    - Al volver a «Archivo» solo aparece «Separar voz y música».
  - **Arreglo.** Montarlo mientras la canción tenga archivo vinculado, con `{hasLinkedFile(video) && <Suspense>…}`, y
    pasarle `available` como antes. Así el trozo sigue cargando solo en canciones con archivo y el trabajo sobrevive al
    cambio de motor.
  - **Test.** Desmontar y volver a montar con `available=false` → `true` no debe abortar.

- **[3] `apps/web/src/components/ui/overlayPlacement.ts:68-75` — Al salir de la pantalla completa nativa, el diálogo
  no vuelve a `body`.**
  - **Por qué.** `place('fullscreen')` se ejecuta en `fullscreenchange`, antes de que React quite `data-fs` del
    escenario: `fullscreenchange` tiene prioridad por defecto y el render va en una tarea posterior. Entonces
    `overlayHost()` sigue devolviendo el escenario, y `needsMove` dice que no hay que moverlo.
  - **Por qué no se corrige después.** Al quitar `data-fs` el envoltorio sigue conectado, y el `MutationObserver` solo
    mira `childList`, así que el diálogo se queda dentro del escenario. La prueba pura pasa, pero en la página no ocurre
    lo que dice el comentario («moved… if that changes while open»).
  - **Dónde se nota.** En el ordenador no se ve, porque el contenedor es `sm:static`. Por debajo de 640 px, el
    contenedor `sticky z-20` deja el diálogo y su fondo bajo la cabecera (z-40), que se puede tocar. Es raro en el
    móvil, porque los diálogos en pantalla completa se abren sobre todo con S y N.
  - **Arreglo.** Hacer `place('fullscreen')` en el siguiente fotograma (`requestAnimationFrame`), o observar también
    `attributes` con `attributeFilter: ['data-fs']` y tratarlo como `'fullscreen'`.

- **[3] `apps/web/src/features/studio/StudioPage.tsx:100-104`, `:578` y `:1320` — Las cargas perezosas del estudio no
  tienen un error boundary propio.**
  - **Qué pasa.** `SeparateVoiceButton` y `FollowFsButton` van dentro de `<Suspense>` sin red de seguridad. Si su trozo
    no carga, el error sube al `ErrorBoundary` de la ruta y el estudio entero pasa a «Recargar».
    - `SeparateVoiceButton` carga en cuanto hay archivo; `FollowFsButton`, al entrar en pantalla completa.
    - Puede pasar sin conexión antes de que acabe el precache, sin service worker, o en un iPhone que ha vaciado la
      caché.
    - Con conexión, `vite:preloadError` recarga el estudio a mitad del ensayo.
  - **Antes.** Iban en el trozo del estudio, así que si el estudio cargaba, cargaban ellos.
  - **Arreglo.** El mismo patrón que las cuentas atrás, `lazy(() => import(…).then(…, () => ({ default: () => null })))`,
    o un `Quiet` como el de `QuickNav`.

- **[2] `apps/web/src/features/follow/FollowStageLayer.tsx:285-288` — Error en inglés.** Si `import('./analyze')`
  falla, el selector muestra `err.message` del navegador, en inglés («Failed to fetch dynamically imported module…»,
  «Importing a module script failed»).
  - *Arreglo:* `friendlyError(err)` para lo que no sea un `FollowError` ni un `ModelLoadError`.

- **[2] `apps/web/src/main.tsx:77-80` — `vite:preloadError` no mira `reloadBusy()`.** Un trozo caducado recarga
  (`recoverFromStaleChunks`) con la copia o la separación en marcha, y sale el aviso del navegador.
  - Es poco probable: mientras espera la actualización, el precache viejo sigue sirviendo los trozos. Pero esta ronda
    añade más cargas perezosas en momentos sueltos.
  - *Arreglo:* `&& !reloadBusy()` en esa condición. El `ErrorBoundary` ya ofrece «Recargar».

- **[2] `apps/web/src/features/studio/cloudCopyRun.ts:94` — La copia espera también mientras la separación solo usa
  la red.** `separating: heavyWorkRunning('voice')` cuenta la separación entera:
  - la bajada del modelo, de 120 a 172 MB, que son minutos con datos del móvil;
  - la subida de las pistas.
  En esos tramos no hay carga en el dispositivo.
  - *Arreglo:* marcar la separación como `idle` durante la bajada y la subida, y que la copia mire
    `heavyWorkBusy('voice')`. Seguir puede seguir con `heavyWorkRunning`.

- **[2] `apps/web/src/features/record/pace.ts:138-145` — La ventana de 60 s no cubre las tomas largas.** En una toma
  de más de 60 s, una carga que solo coincidió con su principio no se ve. Por ejemplo, la fase de sonido de la copia,
  que no se para con el grabador.
  - *Arreglo:* pasar a `judgePace` el inicio de la toma y usar `loadedByHeavyWork(min(inicio, ahora − 60 s))`.

- **[2] `docs/plan/ESTADO-IMPLEMENTACION.md` — Restos de ESTADO:**
  - `:46-47` mezcla lo nuevo y lo viejo: «En el menú rápido de abajo a la derecha (móvil) o abajo a la izquierda (o
    arriba en el móvil)».
  - La decisión 11 (`:278-280`) sigue diciendo «ya no hay nada que elegir en Ajustes».
  - La tabla de migraciones (`:549`) no tiene filas para `20261017120000`, `130000` y `140000`.

- **[1] `apps/web/src/features/nav/version/VersionCheck.tsx:35` — El texto de la confirmación no se actualiza.** Se
  calcula al pintar y no escucha `onHeavyWorkChange`. Si la copia acaba con la confirmación abierta, sigue diciendo
  «Hay una copia… en marcha».

## Veredicto

**No hay nada ≥6.** Todos los hallazgos ≥4 de la ronda 1 están corregidos. Los [3] están corregidos o, si no,
apuntados como pregunta o pendiente. Lo que más cuenta son las dos correcciones grandes, la copia como trabajo pesado
y no recargar a mitad, que están bien hechas y sin bloqueos mutuos.

**Recomiendo corregir en esta misma pasada:**
- el **[5]**: una línea, y devuelve el comportamiento de antes con la separación;
- los dos **[3]**: el sitio del diálogo al salir de la pantalla completa nativa, y un respaldo nulo en las dos cargas
  perezosas del estudio.

El resto puede ir a pendientes.
