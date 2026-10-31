# Rendimiento integral · Progreso

- Spec: docs/specs/rendimiento-integral/SPEC.md
- Rama: feat/plan-completo (no se cambia)
- Commit de partida: 5566bed34385c90f6d7d2fa42e8e1e1be5c69bbc (2026-10-31)
- Carpeta de evidencias (fuera del repo, apartado 8.1): `C:/Users/iangi/oneshoot-rendimiento-integral-tmp/`
  (`ONESHOOT_EVIDENCE_DIR` no está definida; se usa el valor por defecto `~/oneshoot-rendimiento-integral-tmp/`).

## Estado de las fases

| Fase | Estado | Commit |
| --- | --- | --- |
| 0 Herramientas y líneas base | Hecha | (ver git log: chore(tooling) fase 0) |
| 1 Backend por dominio | Pendiente | |
| 2 Datos y base de datos | Pendiente | |
| 3 Carga, shell y PWA | Pendiente | |
| 4 Estudio fluido | Pendiente | |
| 5 Grupo y diálogos fluidos | Pendiente | |
| 6 Grabador, tomas y repaso | Pendiente | |
| 7 Trabajo pesado en workers | Pendiente | |
| 8 Cliente de Supabase ligero | Pendiente | |
| 9 Limpieza transversal | Pendiente | |
| 10 motion perezoso (condicional) | Pendiente | |
| Cierre final | Pendiente | |

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

## Diferencias visuales y su justificación

## Sugerencias para el responsable (no implementadas)

## Para el responsable: migraciones, despliegue y pruebas en dispositivo
