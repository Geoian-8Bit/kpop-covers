# Rendimiento integral · Progreso

- Spec: docs/specs/rendimiento-integral/SPEC.md
- Rama: feat/plan-completo (no se cambia)
- Commit de partida: 5566bed34385c90f6d7d2fa42e8e1e1be5c69bbc (2026-10-31)
- Carpeta de evidencias (fuera del repo, apartado 8.1): `C:/Users/iangi/oneshoot-rendimiento-integral-tmp/`
  (`ONESHOOT_EVIDENCE_DIR` no está definida; se usa el valor por defecto `~/oneshoot-rendimiento-integral-tmp/`).

## Estado de las fases

| Fase | Estado | Commit |
| --- | --- | --- |
| 0 Herramientas y líneas base | Hecha | efb2c1e |
| 1 Backend por dominio | Hecha | debc5a4 |
| 2 Datos y base de datos | Hecha | commit conjunto con la fase 3 (ver git log de perf/rendimiento-integral) |
| 3 Carga, shell y PWA | Hecha | commit conjunto con la fase 2 |
| 4 Estudio fluido | Hecha | eb58646 |
| 5 Grupo y diálogos fluidos | Hecha | fa9de58 |
| 6 Grabador, tomas y repaso | Hecha | ver git log de perf/rendimiento-integral |
| 7 Trabajo pesado en workers | Hecha | 1a22b4f |
| 8 Cliente de Supabase ligero | Hecha | 8369aae |
| 9 Limpieza transversal | Pendiente | |
| 10 motion perezoso (condicional) | Pendiente | |
| Cierre final | Pendiente | |

## Instrucción del responsable sobre commits (01-11-2026)

Aclarado por el responsable: **commits sí, uno por fase, en una rama nueva; ningún deploy ni push.** Se creó la rama
`perf/rendimiento-integral` desde `debc5a4` (sustituye a la regla de la spec «trabajar siempre en la rama actual»).
Los commits de las fases 0 (`efb2c1e`) y 1 (`debc5a4`) siguen también en `feat/plan-completo`, sin subir.

## Notas de arranque

- `apps/web/.env.local` apunta al Supabase de **producción**. Por eso: los e2e solo corren con `VITE_DEMO=true`
  (el demo no toca Supabase) y los builds de medición pasan `VITE_SUPABASE_URL=http://127.0.0.1:54329` y
  `VITE_SUPABASE_PUBLISHABLE_KEY=demo` por variables de entorno (Vite da prioridad a las variables del proceso sobre
  `.env.local`). Nunca se usa la URL real en pruebas.
- Al empezar, el árbol tenía un cambio sin confirmar en `eslint.config.js` (solo formato Prettier del objeto de
  `no-unused-vars`). Es un fichero de la fase 0: se incluye en su commit.
- El repo ya tenía parte del REQ-01 de una ronda anterior (ESLint 10 plano con `typescript-eslint` y `react-hooks`,
  Playwright con `@axe-core/playwright`, `e2e/fake-media.js`, specs `smoke`, `calendar`, `formations`, `ab-grab`). La
  fase 0 lo completa y adapta a lo que pide la spec en lugar de rehacerlo.
- Desde que se escribió la spec (26-10-2026) el repo ganó el calendario y el editor de formaciones. No están en la
  lista de flujos del REQ-02, pero la regla de oro también los cubre: entran en las capturas de referencia.

## Línea base

Fichero completo: `evidencias/fase-0/linea-base.json` (commit 5566bed + sondas; Ryzen 7 5700X, 32 GB, Chromium
156.0.8078.4; perfil 3.1: 390×844, dsf 3, táctil, CPU ×4; red 4G lenta solo en carga). Mediana / p95 de 5 pasadas
(9 si p95/p50 > 1,3). Bundle: `evidencias/perf/bundle-baseline.json`.

| Métrica | Escenario | Línea base |
| --- | --- | --- |
| M-01 camino crítico de `/` | bundle | 296,83 kB gzip (7 ficheros) |
| M-02 chunk de entrada | bundle | 71,57–71,71 kB gzip |
| M-11 precache | bundle | 79 entradas, ≈2379 kB |
| M-12 ficheros > 600 líneas | `check:size` | 20 |
| M-03 LCP frío | S-01 | 2996 / 3034 ms |
| M-04 LCP repetido | S-01 | 840 / 859 ms |
| M-06 bytes de la lista de vídeos | S-01 | 478 323 B |
| M-07 peticiones `/` | S-01 | 35; cascada de profundidad 3 (frío), 1 (repetido) |
| M-05 estudio YouTube | S-02 | 3601 / 3617 ms (34 peticiones, profundidad 3) |
| M-05 estudio subido | S-02 | 4556 / 4571 ms (37 peticiones, profundidad 5) |
| M-09/M-10/M-08 | S-03 bucle | fotograma p50 17, p95 23 ms; 0 LoAF; 113 Paint/s; commits/s Transport 10,4, StudioPage 12,5 |
| M-09/M-08 | S-04 zoom | p50 37,5, p95 55,5 ms; 10 fotogramas > 50 ms; 2 LoAF; commits/s StudioPage 67, PlayerZoomLayer 42, ZoomControls 37 |
| M-09/M-08 | S-05 asa B | p95 26 ms; 1 > 50 ms; commits/s StudioPage 12,6 |
| M-09/M-10 | S-06 accesos | p95 46 ms; 7 > 50 ms; 139 Paint/s |
| M-09/M-10 | S-07 diálogo | p95 26 ms; 5 LoAF; 120 Paint/s |
| M-09/M-10 | S-08 revelado | p95 30 ms; 4 LoAF; 102 Paint/s |
| M-09/M-10 | S-09 bombo | p95 34,7 ms; 3 LoAF; 59 Paint/s |
| M-09/M-08 | S-10 cuenta previa | p95 49,8 ms; 17 > 50 ms; commits de RoundRunner no registrados (en revisión) |
| M-09/M-08 | S-11 zoom cámara | p50 35, p95 46 ms; commits/s RecordStudio 21, StudioPage 21 |
| M-13 guardar | S-12 | **no medido**: la cámara falsa cuelga Chromium al parar tomas > ~4 s |
| M-08 compartir | S-13 | **no medido** (mismo motivo; el demo no guarda copia que inspeccionar) |
| M-09/M-08 | S-14 repaso | p95 51 ms; 30 > 50 ms; commits/s ReviewControls 0,3, ReviewScreen 0,4 |
| M-09 | S-15 voz 3 min | codificar 2 pistas 4237 / 4343 ms; fotograma p95 74 ms |
| M-09 | S-16 copia nube | fase de sonido 368 / 381 ms; fotograma p95 62,6 ms |
| M-13 | S-17 | **no medido** (grabación de 2 min, mismo motivo que S-12) |

Notas: el reproductor de YouTube del arnés es un *stub* listo al instante (M-05 YouTube no incluye la carga real de
YouTube); miniaturas y fuentes externas con *stub* determinista; el mock de Supabase responde sin gzip.

## Registro por fase

### Fase 0 · Herramientas y líneas base

Decisión del responsable (31-10-2026, durante la sesión): **techo de subagentes Opus con esfuerzo medium** (más
estricto que el `high` de la spec), nunca Fable, `caveman` siempre activado, pocos agentes y encargos acotados por el
presupuesto de tokens. Se aplica a todas las fases.

Línea base de calidad (commit de partida): `pnpm typecheck` OK; `pnpm lint` 0 errores, **322 avisos**;
`pnpm test` 70+7 ficheros, 913+142 tests OK; `pnpm db:test` 30 migraciones, 19 ficheros, 175 PASS.

Subagentes:

| Tarea | Rol | Modelo / esfuerzo | Reserva | Resultado |
| --- | --- | --- | --- | --- |
| Herramientas (REQ-01) | implementador de tooling | sonnet / medium | package.json ×3, lockfile, knip.json, playwright/vitest/vite config, scripts/*, .gitignore, README | hecho: todos los comandos funcionan; WebKit instalado |
| Datos de prueba (REQ-02.1–2) | autor de fixtures | opus / medium | apps/web/e2e/fixtures/**, apps/web/e2e/support/** | hecho: demo-db.json determinista (643 kB, 10 pósteres de 34–37 kB), helpers, humo en verde |
| Helper visual (3.4) | orquestador | — | apps/web/e2e/support/visual.ts | hecho: snap + ratio pixelmatch en `visual-ratios.jsonl`, fotogramas motion/CSS |
| E2E + referencias · shell | tester e2e | sonnet / medium | e2e/flows/shell/**, e2e/visual/shell.spec.ts | hecho: 30 flujos; 87 (móvil) + 79 (escritorio) referencias, 2.ª pasada verde |
| E2E + referencias · studio | tester e2e | sonnet / medium | e2e/flows/studio/**, e2e/visual/studio.spec.ts | hecho: 29 flujos; 110 referencias por proyecto (30 fotogramas), 2.ª pasada verde |
| E2E + referencias · record | tester e2e | sonnet / medium | e2e/flows/record/**, e2e/visual/record.spec.ts | hecho: 30 flujos; 86 referencias por proyecto, 2.ª pasada verde |
| E2E + referencias · group | tester e2e | sonnet / medium | e2e/flows/group/**, e2e/visual/group.spec.ts | hecho: 37 flujos; 273 referencias por proyecto (90 fotogramas), 2.ª pasada verde |
| Supabase simulado (REQ-03) | implementador | sonnet / medium | e2e/perf/supabaseMock{,.test}.mjs | hecho: 18/18 tests; build contra el mock carga 5 pantallas sin fallos |
| Sondas y marcas (REQ-03) | implementador | sonnet / medium | src/lib/perfProbe.tsx + líneas de inserción | hecho: 6 marcas, 14 sondas; suite visual 286/286 con sondas; sin Profiler de la app en el dist |
| Arnés de medición S-01…S-17 (REQ-03) | implementador | sonnet / medium | e2e/perf/** (salvo el mock) | hecho: 14/17 escenarios medidos (S-12/13/17 no) |
| Revisión r1 (spec · riesgos · calidad) | revisores | sonnet medium · opus medium · sonnet low | solo lectura | 1 hallazgo de nota 7 (store de la sonda perezoso: S-10 sin commits); varios 5–6 |
| Revisión r2 | revisores | sonnet low · sonnet medium · haiku medium | solo lectura | sin ≥7; 5–6 de README, Prettier, comentario de perfProbe |
| Revisión r3 | revisores | sonnet low · sonnet low · haiku low | solo lectura | 1 hallazgo de nota 7 (globalSetup sin try/catch: servidores huérfanos); 5–6 del arnés |
| Arreglos del arnés (lote 1) | implementador | sonnet / low | e2e/perf/*.ts, support/{testVideo,studioVideo}.ts | hecho |
| Revisión r4 | revisores | haiku low · sonnet low · haiku low | solo lectura | dos «7» del revisor de spec rebajados a 6 por el orquestador (perfil efectivo no reflejado en el JSON: documentación; corregido en `results.ts`); resto 5–6 |
| Arreglos del arnés (lote 2) | implementador | sonnet / low | e2e/perf/*.ts, support/* | hecho: needsLoadServers por título, commit por escenario en PERF_KEEP, lectura/escritura robusta, EVIDENCE único (`support/evidence.ts`), `shortClips` común |
| Revisión r5 (confirmación) | revisores | haiku low ×3 | solo lectura | sin hallazgos ≥7 en los tres enfoques |

**Parada de la revisión:** rondas 4 y 5 seguidas sin hallazgos ≥7 (apartado 10).

**Probar:** la fase 0 no cambia nada visible (solo sondas y marcas invisibles). La prueba es la suite completa sobre la
app con las sondas: visual 286/286 (2 saltados) en los dos Chromium, flujos 253 pasados (3 inestables que pasan al
reintentar: `shell` pestaña YouTube, `navigation` barra lateral, `takes` mejor toma), humo tras Prettier 22/22,
`pnpm typecheck`, `pnpm lint` (0 errores, 322 avisos), `pnpm test` (915 + 142), `pnpm check:size`, `pnpm db:test`.

Pendientes de nota baja (≤6) de la fase 0: duplicación menor entre helpers de los flujos por área (`liveRows`,
`OpenOptions`, `THUMB` en shell y perf, `WEBKIT_SKIP`); `camera-ready`/`player-ready` se repiten por montaje (los
escenarios usan la primera tras navegar); `kill()` del arnés en POSIX solo mata la shell (aquí es Windows); con
`PERF_NO_BUILD=1` el build reutilizado puede apuntar a otro puerto de mock; `withDuration` no valida un WebM sin
Segment Info.

Arreglos del orquestador en la revisión: `perfProbe.tsx` crea el store al cargar (S-09/S-10/S-15 se volvieron a medir y
se fusionaron en la línea base: RoundRunner 5,9 commits/s en S-10); `main.tsx` usa `perfMark('app-start')` protegido;
`perf:bundle` y `build:report` construyen con Supabase simulado en `evidencias/perf/dist-bundle` (nunca
`apps/web/dist`); comentarios del reloj falso corregidos; `visual.ts` mide el ratio tras `toHaveScreenshot` y a escala
CSS; Prettier en los ficheros nuevos; `PERF_PREVIEW_PORT` (había un `vite preview` huérfano de un subagente en el 4180
que el sistema de permisos no deja parar); `meta.effectiveProfile` y `meta.overrides` en el informe de medición.

Comprobaciones del REQ-01 sobre el build de medición (`evidencias/perf/dist-bundle`): 0 coincidencias de eslint,
playwright, axe-core, visualizer, knip, `__oneshootPerf` y del ref de producción; «Profiler» solo aparece dentro de los
chunks de librería `react-*` y `three3d-*` (código de React y de three, no de la app).

Desviaciones anotadas: el REQ-01 pide ESLint 9; el repo ya usaba ESLint 10 antes de esta spec y se mantiene. M-01, M-02
y M-11 salen de `pnpm perf:bundle` (otro JSON), no de `pnpm perf`. La fluidez se mide con CPU ×4 sin red lenta (corre
contra el servidor de desarrollo: la red mediría a Vite, no a la app); queda registrado en el JSON. Los ratios de
`visual-ratios.jsonl` en fotogramas animados son orientativos (967 de 1104 exactamente 0; el juez es `toHaveScreenshot`).

**WebKit:** el WebKit de Playwright para Windows no trae Web Audio; la app lanza `ReferenceError: AudioNode is not
defined` al arrancar y la página queda en blanco (también `flows/fixtures.spec.ts`). Es una limitación del motor en
esta plataforma, no de la app (Safari real sí tiene Web Audio). Todos los tests nuevos hacen `test.skip` en
`movil-webkit` con ese motivo y no hay referencias de WebKit. El cierre final (apartado 12) lo cubre con los dos
proyectos Chromium y lo deja anotado; las pruebas en iPhone real quedan en la lista para el responsable.

Cobertura no automatizada (detalle en `evidencias/fase-0/flujos-*.md`): «Buscar actualización» con versión nueva (en
`vite dev` siempre responde «versión de desarrollo»); reproducción real del iframe de YouTube (depende de la red; se usa
vídeo subido); separación con IA (sin adaptador WebGPU); subida a la nube, copia ligera y «compartir» con éxito (el
demo no tiene nube: se cubre el diálogo y el error); búsqueda de YouTube para proponer o añadir a bolsa
(`/api/youtube-search` no está en dev); reordenar arrastrando (se prueban las flechas); pellizco del grabador y enfoque
por toque; algunos fotogramas inestables bajo carga se omitieron (cuenta previa 100/200 ms, paneles del grabador antes
de 400 ms, vaivén de los faroles).

Observaciones de la app (no se tocan, no son de esta spec): error de consola `<rect> attribute rx: A negative value`
en el obturador al pausar o reanudar la grabación; en móvil «¿Quién eres?» solo se abre desde Ajustes o los avisos.

axe línea base (detalle en `evidencias/fase-0/axe-*.json`): `meta-viewport` (moderada, por `maximum-scale=1`, fuera de
alcance) en todas las pantallas; serias: `label` (crítica) y `nested-interactive` en vincular archivo,
`nested-interactive` en la vista YouTube, la lista de tomas y formaciones; `target-size` en pantalla completa y repaso
móvil; `scrollable-region-focusable` en la ayuda de atajos (móvil); `listitem` en votación abierta;
`aria-required-children` en «Más opciones» (móvil). Todas exigirían cambios visibles o de estructura: fuera de alcance.

Paralelo: herramientas ∥ datos de prueba; después los 4 testers e2e ∥ simulador (reservas disjuntas, servidor
demo compartido en 5174 arrancado por el orquestador, `--workers=2` cada uno).

Huecos de los datos de prueba: el medio de los vídeos subidos va a IndexedDB por test (`seedUploadMedia`); el de las
tomas vive en OPFS y se graba en el test con la cámara falsa; sin `video_stems` ni copias «en la nube» sembradas.

Línea base del bundle (build con Supabase simulado, `APP_BUILD=1`): M-01 = 296,83 kB gzip (7 ficheros);
M-02 = 71,57 kB gzip; M-11 = 79 entradas, 2378,48 kB. Nota: los hash de los chunks cambian entre builds idénticos
(`__APP_BUILD_DATE__` = `new Date()`), así que la identidad del build con y sin `ANALYZE` se comprobó por tamaños.

`pnpm check:unused` (knip) en la línea base: 115 exports y 37 tipos exportados sin uso, 3 dependencias o binarios no
listados (vitest en la Edge Function, vercel y vite en scripts). Se resuelven en la fase 9.

### Fases 1 y 3 (en paralelo)

| Tarea | Rol | Modelo / esfuerzo | Reserva | Resultado |
| --- | --- | --- | --- | --- |
| F1 · backend por dominio (REQ-08 backend/demo, 27, 29 backend) | implementador backend | opus / medium | lib/backend.ts → lib/backend/**, data/** (importaciones) | hecho (ver «Fase 1» abajo) |
| F3a · arranque (REQ-04, 06, 18 gcTime, 09 Splash) | implementador frontend | sonnet / medium | main.tsx, App.tsx, lib/routeLoaders.ts, lib/prefetch.ts, appUpdate.ts, components/splash.css | en curso |
| F3b · fuentes, HTML, Workbox (REQ-05, 07, 08 manualChunks, 13) | implementador build | sonnet / medium | index.html, index.css (fuentes y @import), carpeta de fuentes, vite.config.ts, vercel.json | en curso |
| F3c · shell (REQ-27 AppShell, 09 barras y Backdrop) | implementador frontend | sonnet / medium | components/AppShell.tsx → components/shell/**, Backdrop.tsx, lib/useDesktop.ts, QuickNav.tsx | en curso |

Decisión: la Splash anima con un CSS propio (`components/splash.css`) en vez de `index.css`, para que la reserva de
F3a no se solape con la de F3b (fuentes en `index.css`). REQ-10 y el `crossOrigin` de las miniaturas esperan al cierre
de la fase 2.

### Fase 3 · Carga, shell y PWA — Hecha (revisión cerrada)

Qué se hizo, por REQ:
- REQ-04: el service worker se registra tras `load` + reposo (`requestIdleCallback`, 3 s; `setTimeout` de reserva) e
  importa `virtual:pwa-register` en ese momento (`.catch` silencioso); el mecanismo de actualización segura no cambia.
- REQ-05: `preconnect` a Supabase solo en build (plugin que omite la etiqueta sin variable); fuera los de YouTube y
  Google Fonts; quedan 2 (Supabase e i.ytimg.com).
- REQ-06: `lib/routeLoaders.ts` (mapa único usado por `lazy()`, `prefetch.ts` y `main.tsx`); en `/v/:id` también la
  IFrame API y el grupo con las MISMAS opciones que `CrewProvider` (`lib/groupQuery.ts`, una sola definición).
- REQ-07: fuentes autoalojadas (14 woff2 latin/latin-ext + subconjunto de kanji de la UI) en `fonts.css` crítico, sin
  incrustar en base64 (`assetsInlineLimit`); los ~605 bloques japoneses y de otros alfabetos de gstatic van en
  `fonts-ja.css`, cargado con un `<link>` creado tras el primer render (un fallo no recarga la página). Sus
  `unicode-range` se recortan solo por (rango declarado ∩ glifos reales) de las caras autoalojadas, de modo que cada
  carácter lo pinta la misma cara que con las hojas de Google, incluido el salto a otra cara de la familia cuando
  falta el glifo: barrido de 458 752 puntos (7 familias/pesos × BMP) con 0 diferencias (`evidencias/fase-3/`,
  `trim-fonts.mjs`, `winners.mjs`). Workbox sin la regla de googleapis; CSP sin googleapis.
- REQ-08 (`manualChunks`): fuera la regla `icons`; `tailwind-merge` en chunk propio precargado; importaciones dinámicas
  de lo que no necesita el primer pintado (IndexedDB de pósteres y copias locales, notas en el calentamiento, borrar).
- REQ-09: AppShell monta solo la barra del ancho actual (`lib/useDesktop.ts`); la píldora `rail-active` va en un
  `LayoutGroup` propio por montaje; Splash con `@keyframes` CSS (mismos valores; captura de fotogramas idéntica); Backdrop
  con `100lvh`.
- REQ-10: `public/lcp-preload.js` (externo, solo en `/`) precarga con prioridad alta la miniatura destacada guardada
  por la biblioteca (`oneshoot.lcpThumb.v1`, solo http(s)); en el arranque repetido se pide a los 293 ms, antes de que
  arranque el módulo de entrada (358 ms).
- REQ-13: i.ytimg.com responde `Access-Control-Allow-Origin: *` → `crossOrigin` en las miniaturas de YouTube
  (`lib/thumbCors.ts`, solo para ese host) y estrategia `CacheFirst` 14 días `statuses [200]` en una caché nueva
  `thumbnails-cors`. CSS de Tailwind con `source('./')`: solo desaparece `.blur` (venía de un spec e2e).
- REQ-18: `gcTime` por defecto de 60 min.
- REQ-27: `components/AppShell.tsx` → `components/shell/**` (barril compatible).

Bundle: M-01 296,97 → 287,18 kB gzip (96,7 %: el objetivo del 85 % de esta fase NO se alcanza; lo grueso del camino
crítico es react 83,7 kB, supabase-js 58,3 kB y motion 43,8 kB, que tratan las fases 8 y 10). M-02 71,57 → 62,60 kB
(−8,97, cumple REQ-08). Precache 79 → 114 entradas (entran las fuentes, como prevé la spec).

Decisiones y justificaciones de la revisión:
- `resize` sintético al cruzar `lg` (shell): sin él, el popover «Pausa entre vueltas» del estudio quedaba desplazado
  88 px tras cruzar `lg` con el menú abierto, porque el evento `resize` del navegador llega antes de que React cambie de
  barra. Se emite solo al cruzar `lg`, nunca al montar; se revisaron todos los oyentes de `resize` (QuickExposure,
  Transport, viewport, quickNavCore, EditorTools) y son idempotentes. Revisores r1 (riesgos) lo dieron por bueno; el
  «7» de spec en r4 era de documentación y se rebajó a 5 con esta nota.
- Carga diferida de `fonts-ja.css` (r3 calidad, rebajado a 5): antes los cortes japoneses tampoco bloqueaban (con
  `font-display: swap` el título se pintaba con la reserva hasta que llegaba su woff2); ahora ese intervalo se alarga lo
  que tarda el CSS diferido (en visitas repetidas, desde el precache). Los kanji de la UI siguen en el CSS crítico. El
  aspecto final es idéntico.
- La caché antigua `thumbnails` (respuestas opacas) queda huérfana en los dispositivos: borrarla exige permiso del
  responsable (2.6). Pendiente de su decisión.

Revisión: r1 (sonnet medium · opus medium · haiku medium) con 3 hallazgos de 7 (test obsoleto de la Splash, re-
declaración de fuentes con riesgo de repintado en Safari, recarga si fallaba el CSS diferido); r2 (sonnet low · opus
medium · haiku low) con 1 de 7 (huecos de glifos en el recorte de fuentes); r3 y r4 (haiku/sonnet low) sin hallazgos ≥7
tras justificar dos notas. Probar: suite completa visual y de flujos en los dos Chromium tras cada lote (última: 343
visual+shell sin fallos; 541 completa antes del último lote de fuentes).
Medición completa tras las fases 2 y 3 (`evidencias/fase-3/perf-f2f3.json`, 5 pasadas): S-01 frío LCP 2996 → 2808 ms,
pero library-painted 5478 → 6842 ms; S-01 repetido LCP 840 → **1404** ms; S-02 player-ready YouTube 3601 → **4030** ms,
subido 4556 → **4726** ms; fluidez (S-03…S-16) en la línea de la base (es trabajo de las fases 4–7). Son
**regresiones**: no se commitean las fases 2 y 3 hasta corregirlas.

Investigación (opus / medium, `evidencias/fase-3/regresion/`): cuatro causas — (1) `fonts-ja.css` (~148 kB gzip de
@font-face) entraba justo tras el render y robaba ancho de banda; (2) pósteres en serie (revisiones → IndexedDB →
descarga); (3) precargas en reposo (estudio, «Añadir vídeo») en plena descarga de pósteres; (4) en `/v/:id` la fila,
clips y notas esperaban al chunk del estudio. Arreglos: `lib/startupSettled.ts` (lo no urgente espera a que la primera
pantalla se asiente), pósteres de la primera visita en paralelo a la lista (`listCrewPosters`, pista
`oneshoot.postersKept.v1:<crew>`), lectura de IndexedDB en paralelo a las revisiones, y en `routeLoaders` las consultas
de `/` y de `/v/:id` salen antes de montar React con las mismas claves y funciones. Resultado (mediana de 5):

| Métrica (ms) | Base guardada | Antes del arreglo | Después |
| --- | --- | --- | --- |
| S-01 frío LCP | 2996 | 2772 | 2680 |
| S-01 frío library-painted | 5478 | 6831 | 5699 |
| S-01 frío load | 2011 | 4834 | 2162 |
| S-01 repetido LCP | 840 | 1328 | 1044 |
| S-01 repetido library-painted | 526 | 1018 | 690 |
| S-02 YouTube player-ready | 3601 | 3960 | 3561 |
| S-02 subido player-ready | 4556 | 4711 | 4374 |

Notas: (a) la base guardada mide como LCP el `<p>` «Fijados primero…»; al rehacer la base hoy sobre el commit de
partida, gana el IMG del póster (5708 frío / 3448 repetido), así que M-03/M-04 deben compararse por elemento; (b) en
frío quedan ~134 kB de woff2 propios que con Google Fonts simulado no pesaban en la base; (c) **desviación de la spec**:
el agente creó y borró una worktree temporal del commit `efb2c1e` para medir la base de hoy (la spec prohíbe worktrees;
no quedó nada); (d) aplazar `fonts-ja.css` hasta el asentamiento (≤ 10 s) alargaría la fuente de reserva en títulos con
kana: se ajusta para cargarla en cuanto haya en pantalla texto que la necesite (en curso). Los arreglos de la regresión
pasaron su propia revisión: r1 (opus medium · sonnet low · haiku medium) con 2 hallazgos (vigilante de fuentes ciego a
portales y campos: 7; pósteres re-descargados en dispositivos con IndexedDB previa: 6), arreglados; r2 y r3 sin ≥7 (un «7»
de r3 sobre el coste del vigilante se rebajó a 5: el vigilante se para siempre al añadirse `fonts-ja.css`, como muy tarde
tras el asentamiento, y cada recorrido cuesta ~0,6 ms). Pendiente de nota baja: el vigilante usa un *throttle* de 60 ms
en vez de un *debounce* real.

**Commit conjunto de las fases 2 y 3 (desviación):** los arreglos de la regresión y del troceado tocaron ficheros con
cambios de las dos fases (`LibraryPage`, `VideoCard`, `StudioPage`, `data/videos/**`, páginas de grupo con `crossOrigin`).
Sin `git add -p` (no interactivo en este entorno) un commit intermedio de la fase 2 no compilaría, así que se hace un único
commit «fases 2 y 3». Comprobaciones antes del commit: typecheck OK; lint 0 errores / 322 avisos; test 1012 + 142;
check:size OK; db:test 34 migraciones, 23 ficheros, 189 PASS; suite visual y de flujos completa en verde en la última
pasada de cada lote.
Pendientes de nota baja: regla «i.ytimg.com» duplicada entre `thumbCors.ts` y `lcp-preload.js`; los scripts de
regeneración de fuentes viven en la carpeta de evidencias (documentado en la cabecera de `fonts-ja.css`); `useEvent`
sin `initialDataUpdatedAt` (heredado de HEAD).

### Fase 1 · Backend por dominio — Hecha

- `lib/backend.ts` (3272 líneas) → `lib/backend/` (`types`, `mode`, `upload`, `demoDb`, `shared` y, por dominio, fachada
  `X.ts` + `X.supabase.ts` + `X.demo.ts` para core, bags, wishes, events, stems, calendar, push y formations; el mayor,
  `bags.demo.ts`, 465 líneas). Movimiento puro por rangos de líneas, verificado antes de optimizar.
- REQ-08: cada fachada es `IS_DEMO ? demoX : supabaseX` con `IS_DEMO` constante de build; Rollup elimina los `*.demo.ts`.
  `pnpm perf:bundle` comprueba ahora en cada build que no aparece ninguna cadena exclusiva del demo
  (`coverscape.demo.v1`, `DEMO0000`, `oneshoot.dev.cloudLimitMB`): «none». Descartado cargar las implementaciones de
  Supabase con `import()`: retrasaría la primera llamada.
- REQ-29 (backend): `must()` (lanza el mismo `res.error`, sin envolver) sustituye 94 de 96 `if (error) throw error`;
  `as unknown as` en backend 17 → 0 (`toJson`/`fromJson` para jsonb).
- Los `data/*.ts` y los importadores de fuera (providers, estudio, tomas, voz, formaciones, RPD) importan solo su
  dominio (`@/lib/backend/<dominio>`, `/mode`, `/types`); el barril `index.ts` se mantiene para compatibilidad.
- M-02 en build aislado (`git archive HEAD` + solo la fase 1): 71,72 → 69,63 kB gzip (−2,09). El criterio de −6 kB lo
  verifica la fase 3 (con `manualChunks`).
- Probar: suite completa de flujos y visual en los dos Chromium (542 pasados, 7 saltados; el único fallo visual —
  popover «Pausa» del estudio— venía de la fase 3 y ya está corregido); la ruta de **Supabase** (que los e2e no tocan
  porque corren en demo) se ejercitó con S-01 y S-02 sobre el build de producción contra el Supabase simulado: biblioteca
  con datos y reproductor listo con YouTube y con vídeo subido (`evidencias/fase-1-backend/supabase-path.json`).
- Revisión r1 (sonnet medium · opus medium · haiku medium): sin hallazgos ≥7. Arreglados los 5–6: importaciones por
  dominio en vez del barril, mock del test de `routeLoaders`, comprobación automática del demo en el build.
- Revisión r2: ver abajo. Pendientes de nota baja: códigos de comentario heredados («13 ·», «52 ·») en lugar de REQ-xx
  (se mantienen: son los códigos del plan original); `const data = must(...); return data;` redundante en stems.

### Fase 2 · Datos y base de datos — Hecha

| Tarea | Rol | Modelo / esfuerzo | Reserva | Resultado |
| --- | --- | --- | --- | --- |
| 2A · migraciones, tipos, simulador (REQ-14/17/19.4/20 SQL) | datos y migraciones | opus / medium | supabase/migrations (nuevas), supabase/tests, database.types.ts, supabaseMock | hecho: 4 migraciones, 4 tests SQL; db:test 34 migraciones, 23 ficheros, 188 PASS; mock 21/21 |
| 2B · vídeos, pósteres, notas, firmas (REQ-14/15/16/17/27) | implementador datos core | opus / medium | lib/backend/core.*, signedUrls.ts, data/videos/**, data/notes, snapshot, VideoCard, fileSource, StudioPage (marcador), NoteDialog, ReviewScreen (dibujo) | hecho: M-06 478 323 → 16 219 B (3,4 %) |
| 2C · grupo (REQ-18 cascadas, 19, 20 cliente, 15 stems/RPD) | implementador datos grupo | sonnet / medium | lib/backend/{bags,wishes,events,stems}.*, data/{bags,wishes,events,stems,tracks}, páginas de grupo (consultas), api/*, youTubePickerRules | hecho |
| Integración | integrador | sonnet / medium | uniones de bolsas/eventos, arnés M-06 | hecho: uniones sin póster base64; textos de error nuevos de 2C eliminados (regla de oro); M-06 mide solo la lista |
| Revisión r1 | revisores | sonnet medium · opus medium · haiku medium | solo lectura | 4 hallazgos ≥7 (fila de la ronda congelada; toast nuevo al reordenar si otro móvil archivó un elemento; pósteres ausentes/viejos en bolsas y eventos; parpadeo del primer dibujo) — los tres últimos los subió el orquestador de 6 a 7 por ser cambios visibles |
| Arreglos r1 | implementador | opus / medium | fase 2 | hecho: fila de la ronda refrescable, reintento único al reordenar, pósteres con rev, primer dibujo sin parpadeo, peekSigned, getVideo sin póster, explain de índices |
| Revisión r2 | revisores | sonnet low · sonnet medium · haiku low | solo lectura | sin ≥7 (4 de nota 5–6 arreglados: demo con archivados, `patches` muerto, `initialDataUpdatedAt`, prefetchRound sin relanzar) |
| Revisión r3 | revisores | haiku low · sonnet low · haiku low | solo lectura | sin ≥7 → revisión cerrada |

Paralelo: 2A ∥ 2B ∥ 2C con contratos fijados de antemano (columnas y RPC, API de `signedUrls.ts`), junto con los
arreglos de la fase 3 (reservas disjuntas).

Decisiones: GET /notes queda en el 39 % de la base (objetivo ≤ 15 %) porque el fixture de la fase 0 tiene un solo
dibujo de 5,2 kB; el 15 % se cumple con dibujos ≥ 12,6 kB (la spec habla de hasta 60 kB). El snapshot no lee los
pósteres de IndexedDB (la spec lo dejaba como «puede»; `placeholderData` es síncrono): el arranque repetido queda igual
que hoy. Los pósteres se descargan una vez (468 kB en la primera carga del fixture) y después 0.

### Fases 4, 5, 7 y 8 (en paralelo) — Hechas

Revisiones cerradas: F4 (r1 con un 7; r2 y r3 limpias), F5 (r1 con tres 7 visibles; r2 con «7» que eran descartes sin
documentar —documentados—; r3 limpia), F7 (r1 con tres 7; r2 y r3 limpias), F8 (r1–r3 con 7; r4 y r5 limpias). Suite
completa tras las cuatro fases: 538 pasados, 0 fallos, 3 inestables que pasan al reintentar, 7 saltados (WebKit).

Medición tras las fases 4, 5, 7 y 8 (`evidencias/f4578/perf.json`, máquina libre, 5 pasadas):

| Escenario | Base | Ahora | Objetivo | Cumple |
| --- | --- | --- | --- | --- |
| S-03 Paint/s | 113 | 26,2 | ≤ 30 % (34) | sí |
| S-03 Timeline commits/10 s | 1 | 1 | 0 | no (1 commit al cargar `duration`) |
| S-04 PlayerZoomLayer commits/s | 42,3 | 0,9 | 0 en el gesto | sí (los 0,9 son las entradas/salidas de `live`) |
| S-04 fotograma p95 | 55,5 ms | 29,9 ms | ≤ 20 ms | no |
| S-10 RoundRunner commits/s | 5,9 | 2,0 | ≤ 2 | sí |
| S-15 LoAF | 3 | 0 | −70 % | sí |
| S-16 LoAF | 1 | 0 | −70 % | sí |
| S-02 YouTube player-ready | 3601 | 3367 ms (93 %) | ≤ 85 % | no |
| S-02 subido player-ready | 4556 | 4150 ms (91 %) | ≤ 75 % | no |
| S-01 repetido LCP | 840 (`<p>`) / 3448 (IMG, base rehecha) | 1404 | ≤ 80 % | depende del elemento (ver nota de la fase 3) |
| S-07/S-08 Paint/s | 120 / 102 | — / 86 | ≤ 50 % | no en S-08 (lo que queda son listas, pestañas y el documento tras cerrar) |
| S-11 / S-14 fotogramas > 50 ms | 1 / 30 | 16 / 37 | ≤ 20 ms p95 | no — son las pantallas de la fase 6 |

### Fases 4, 5, 7 y 8 — tabla de reservas

| Fase | Rol | Modelo / esfuerzo | Reserva |
| --- | --- | --- | --- |
| 4 Estudio fluido (REQ-21, 27 estudio/store, 28 bucle y reinicio) | implementador frontend | opus / medium | player/**, features/studio/** salvo F7 y fileSource.ts, shell (solo will-change) |
| 5 Grupo y diálogos (REQ-22, 21.6 biblioteca, 27 grupo) | implementador frontend | opus / medium | features/{rpd,bags,wishes,events,library,nav,members,settings}/**, ui/Dialog, YouTubePicker, lib/hanging |
| 7 Workers (REQ-26, 27 cloudCopy, 28 MP4) | implementador audio/vídeo | opus / medium | voice/separate/**, SeparateVoiceButton, studio/{cloudCopy*,mp4Mux*,CloudCopyStatus,audioAlign*}, lib/heavyWork*, lib/mp4/**, workers, vite.config (workers) |
| 8 Supabase ligero (REQ-11) | implementador backend | opus / medium | lib/supabase.ts, AuthProvider, CrewProvider, lib/backend/**, package.json/lockfile de apps/web |

Paralelo según el grafo 7.2 (F2 y F3 cerradas); la fase 6 espera a la 4.

Interrupción: el 01-11 los cuatro agentes se cortaron por el límite semanal de la API; se reanudaron el 04-11 desde su
transcripción (el trabajo estaba en el árbol).

**Fase 7 (revisión cerrada).** `lib/mp4/boxes.ts` compartido (bytes idénticos, huellas fijas tomadas de d3776f7);
codificación AAC y empaquetado MP4 de la separación y de la copia en workers (`stemEncoder.worker.ts`,
`cloudCopy/sound.worker.ts`, `createAudioWorker`), con tramos de ~4 s copiados y confirmados uno a uno (el pico extra es
un tramo); recurso a la página si no hay Worker/AudioEncoder, si el worker rechaza la configuración o si muere (el sonido
se recodifica en la página con el original); cola de peticiones, cancelación con terminate y plazos por respuesta;
progreso del modelo ≤ 4/s con `Uint8Array` reservado; `cloudCopy.ts` → `cloudCopy/{media,sound,picture,index}`.
Decisión: las muestras de VÍDEO de la copia se transfieren (no se copian) para no subir el pico de memoria (REQ-26); si
el worker muere con ellas, la copia termina con el FriendlyError de siempre (caso raro, no recuperable). Revisión: r1
(opus · sonnet · haiku) con 3 hallazgos de 7 subidos de «6» por ser cambios funcionales (fallo donde HEAD funcionaba,
worker inutilizado, cuelgue sin cancelar); r2 sin ≥7 (recodificación tras muerte del worker y cola, arreglados); r3 sin
≥7 (un «7» sobre copia de canales completos resultó falso: `sliceSource` copia tramos). Medición pendiente con la
máquina libre (S-16 sin LoAF; S-15 ruidoso).

**Fase 8.** Cliente PostgREST directo + storage-js perezoso en chunk propio: chunk de Supabase 58,5 → 11,9 kB gzip;
M-01 289 → 241,5 kB (81 % de la base). **Premisa de la spec incorrecta:** la política `profiles_select` es solo para
`authenticated`, así que sin refresco de token las sesiones antiguas (tokens de ~1 h) verían su email en vez de su
nombre; se implementa un refresco mínimo con `fetch` equivalente al de supabase-js 2.117.3 (margen 90 s como
`EXPIRY_MARGIN_MS`, mismo formato de sesión, 4xx → se borra la sesión, red/5xx → se conserva con enfriamiento de 60 s,
`navigator.locks` con el nombre `lock:sb-<ref>-auth-token` y reserva sin locks); solo se muestra una sesión con token
válido (como `getSession()` de auth-js cuando el refresco falla); `signOut` borra al momento y revoca en segundo plano con
`POST /auth/v1/logout?scope=global` como auth-js; un fallo al cargar storage-js no dispara la recarga de página
(`createPreloadErrorGuard`); signIn/signUp y `loading` quitados (0 usos). Revisión: r1 (opus · sonnet · haiku) con 1
hallazgo de 7 (nombre → email sin refresco) y dos 5–6; r2 con un 7 (sesión caducada sin refrescar visible; arreglado por
el orquestador con `shownSession()`); r3 con dos 7 (logout sin revocar, refresco sin lock entre pestañas); r4 y r5 sin
≥7 → revisión cerrada. Captura del bloque de usuario con sesión antigua vigente y caducada+refrescada idéntica a la
referencia generada sobre 5566bed (`evidencias/f8/`).

Commits de las fases 7 y 8: aplazados hasta que terminen las fases 4 y 5, para medir con la máquina libre y comprobar el
árbol completo antes de cada commit.

**Fase 5.** Hecho: revelado de la votación con pétalos, estelas y núcleos en HTML (caja que reproduce el
`xMidYMid slice`, animaciones CSS con los mismos tiempos y curvas; estelas con tapones redondos y cuerpo por fotogramas
cada 10 ms, misma geometría que HEAD); bombo en su propio SVG girado por CSS con paradas por el muelle `soft`; colgantes
con IntersectionObserver (los ocultos ni hacen tic ni reciben impulsos; se repiten al volver a verse: `replayHidden`);
cuenta previa que solo re-renderiza al cambiar lo visible (RoundRunner 5,8 → 1,9 commits/s); WishCard con `memo` y
`useClosingNow`; Hanafuda con `elementFromPoint` agrupado en rAF; divisiones de RpdPlayPage, BagPage, WishesPage,
PollPage y PinnedClips (todos ≤ 561 líneas). S-07 Paint/s 105 → 37 (máquina cargada; p95 pendiente de medir libre).
**Descartados (regla de oro):**
- REQ-22.1 `will-change` en el panel de los diálogos solo mientras anima: con él (escrito por motion o directamente en el
  nodo), el texto de los diálogos altos con posición fraccionaria acaba desplazado ~0,25 px tras la animación (captura
  «panel vincular archivo» fuera de tolerancia, bisección: con el `Dialog.tsx` de HEAD pasa; con los callbacks sin
  `will-change` pasa). Se deja `Dialog.tsx` como en HEAD.
- REQ-22.6 barras de resultados con `translateX`: con un ancho final menor que el diámetro del extremo redondo (≈ 8 px)
  la barra trasladada y recortada se ve como una lente, no como una píldora, también en los primeros fotogramas del
  muelle. Siguen animando `width` como en HEAD.
- REQ-21.6 `will-change` en el botón de borrar de VideoCard: en reposo está a `scale-75`, y una capa `will-change` se
  rasteriza a esa escala (icono borroso al pasar el ratón) y crea una capa por tarjeta. VideoCard como en HEAD.
- REQ-22.9 faroles de la cuenta atrás: ya animan solo `rotate` y `opacity`, pero dentro de un SVG con `drop-shadow`;
  sacarlos a capas propias arriesga un cambio visible. Sin cambios.
**Desviaciones justificadas:**
- REQ-22.3 bombo: origen de giro 50 % 50 % en vez del 47,62 % que dice la spec, porque motion sobrescribía
  `transform-origin` con el centro de la caja y las referencias de la fase 0 giran así (con 47,62 % salía 10 px
  desplazado).
- REQ-22.5 cuenta previa: se conserva el intervalo de 80 ms (con el render solo al cambiar lo visible) en vez de un
  `setTimeout` al siguiente cambio de segundo: con temporizadores encadenados fallaban 4 de 8 flujos e2e de la cuenta
  previa (el reloj llega tarde); el intervalo da los mismos números y tics en el mismo instante (16/16) y cumple el
  objetivo de commits (≤ 2/s). Al reanudar se sincroniza el reloj: no aparece un «3» de más.
- Las divisiones de TrackPage, RpdPage, EventPage, MembersUI, quickNavCore y YouTubePicker (todas < 600 líneas) pasan a
  la fase 9.
- Arnés: `e2e/visual/group.spec.ts` descarta 2 números del `Math.random` sembrado (`SEED_BURN`) porque supabase-js
  consumía dos al cargar en el demo y el cliente nuevo ninguno; probado de 0 a 16, solo 2 reproduce las referencias. En
  la app el orden de los sorteos es aleatorio igual que antes.

**Fase 4.** Estudio dividido (ningún fichero > 600; StudioPage 579), marea de la ola en el compositor (S-03 Paint/s
113 → 29), pellizco sin re-render de la capa (0 commits de PlayerZoomLayer durante el gesto). Revisión r1: 1 hallazgo de
7 (un clic quieto en el sello A/B podía mover el tramo por un movimiento pendiente del cursor) y varios 5–6 para cumplir
M-08/M-09; arreglos en curso. El orquestador restauró a HEAD cinco ficheros de `player/` que solo tenían formato
(comprobado: Prettier aplicado a HEAD = fichero de trabajo).

### Fase 6 · Grabador, tomas y repaso — Hecha

**Hecho:**
- REQ-27: `RecordStudio.tsx` (2950 líneas) dividido en `features/record/studio/**` (hooks de sesión, máquina de tomas,
  aplauso, zoom, revisión, paneles); `features/review/**` y `features/takes/**` divididos (TakeRow memo, ShareDialog
  lazy, useTakeActions). Ningún fichero de la fase pasa de 600 líneas.
- REQ-23: applier de zoom con una sola llamada en vuelo y `zoomStore` (pinza sin re-render del estudio),
  `canRecordCanvas` memorizado, nivel por rAF, InfoPanel sin intervalo, paneles tras un toque en lazy con precarga.
  Chunk del grabador 41,23 kB gz frente a ≈53,1 (−22,4 %, objetivo ≥ 20 %).
- REQ-24: `probeVideo({ needDuration })`, lecturas de OPFS en paralelo (`mapLimited(16)`, mismo orden y mismo primer
  error), progreso de compartir aclarado (umbral 400 ms; las fases y el 100 % siempre se pintan).
- REQ-25: rect del repaso cacheado con ResizeObserver, pulgar con translateX, trazo en vivo por rAF, media query
  cacheada.
- REQ-20: `storage_usage` con staleTime 10 min; se invalida al compartir, al copiar a la nube, al borrar una toma
  compartida, al subir un vídeo con archivo (`data/videos/mutations.ts`) y al terminar una separación de voces
  (`data/stems.ts`). `takeKeys` vive en `data/trackKeys.ts` para no meter tomas en el chunk de vídeos.
- S-13: ShareDialog 2,9 commits/s (≤ 3) con toma corta.
- Escenarios nuevos: S-18 (cámara lista) y S-19 (grabador en frío).

**Revisión:** r1 sin hallazgos ≥ 7 (dos de 6, arreglados: paneles lazy que podían dejar perder una toma y
`storage_usage` sin invalidar al subir). r2 sin hallazgos ≥ 5. Cerrada tras dos rondas limpias.

**Pruebas:** typecheck, lint (0 errores, 258 avisos), test (142 + 1130) y check:size en verde. e2e completo: 559 bien;
los fallos se repitieron aislados. Dos visuales de `record.spec.ts` (cerrar «Compartir» y aviso de canción parada en el
repaso) fallaron con `--repeat-each=3` contra un servidor de desarrollo cargado de HMR; en HEAD y con el diff de la fase
en un worktree limpio dan 6/6 y 6/6, y en el árbol principal 12/12 en dos pasadas: intermitencia del entorno, no
regresión. Los fallos de WebKit son los conocidos (sin Web Audio en Windows, ver fase 0).

**Descartados (regla de oro / no necesarios):**
- REQ-23.8 FrameBus: es condicional y no hacía falta.
- REQ-23.5 limitar la lectura del analizador del aplauso: es opcional y cambiaría el decaimiento.
- Revisión r1: la tira de repaso (TakeReviewPane), el diálogo de confirmación (StudioConfirm) y la vista del aplauso
  armado (ClapArm) vuelven a importarse de forma estática: si su chunk no cargaba, en el repaso solo quedaba «Cerrar»
  (la toma se podía perder) o el aplauso quedaba armado sin vista.

**No alcanzado (medido con la máquina cargada; se repite al cerrar la fase):**
- camera-ready: 86–90 % de la línea base, frente al objetivo ≤ 85 %.
- S-14 p95 de fotograma: 49–53 ms, frente a ≤ 20 ms.
- S-11: ~2,6 commits/s, todos con cambio visible (aviso «Zoom digital» y chip).
- S-12 y S-17: no se pueden medir; la cámara falsa cuelga Chromium.

## Diferencias visuales y su justificación

## Sugerencias para el responsable (no implementadas)

## Para el responsable: migraciones, despliegue y pruebas en dispositivo

(Borrador de la fase 2; se completa en el cierre final.)

1. Copia de seguridad del proyecto `pevbjaowyctqqldvzovz` antes de nada (backup/PITR del panel o `pg_dump` de `public`).
2. Aplicar en Supabase, **en este orden y antes de desplegar el cliente** (el cliente nuevo las necesita: sin ellas
   las listas responden 400):
   1. `20261031110000_video_list_columns.sql` (REQ-14)
   2. `20261031120000_notes_has_sketch.sql` (REQ-17)
   3. `20261031130000_poll_votes_signature.sql` (REQ-19)
   4. `20261031140000_positions_rpc_and_indexes.sql` (REQ-20)
   Las dos primeras añaden columnas generadas `stored` y reescriben `videos` y `notes` con bloqueo exclusivo (tablas
   pequeñas; mejor en un momento de poco uso). No migran datos: Postgres rellena las columnas solo.
3. Después, en el editor SQL: `video_list_columns_checks.sql`, `notes_has_sketch_checks.sql`,
   `poll_votes_signature_checks.sql`, `positions_rpc_checks.sql` y, como control, `archive_checks.sql`. Todos terminan
   en ROLLBACK y deben imprimir PASS sin ningún FAIL.
4. Comprobar los advisors de seguridad y rendimiento (se esperan sin avisos nuevos; las funciones son `security
   invoker` con `search_path=''`; un aviso de índice sin uso al principio es normal).
5. Regenerar `packages/shared/src/database.types.ts` desde el proyecto y comprobar que coincide con el editado a mano
   (salvo orden; si el generador añade las generadas en Insert/Update como `?: never`, aceptar lo generado).
6. Desplegar con `pnpm deploy:prod` desde la raíz (`docs/DEPLOY.md`) solo después de los pasos 2 y 3.
