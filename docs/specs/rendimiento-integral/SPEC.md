# One Shoot · Mejora integral de rendimiento y calidad del código

**Nombre de la especificación:** `rendimiento-integral`
**Fecha:** 26-10-2026
**Repositorio:** `Geoian-8Bit/kpop-covers` (app «One Shoot»)
**Estado:** especificación cerrada, lista para implementar.

---

## 0. Arranque del implementador

Haz esto, en este orden, antes de cualquier otra cosa:

1. Aplica el «Paso 0 del implementador» (abajo, copiado tal cual).
2. Guarda una copia literal de este documento en `docs/specs/rendimiento-integral/SPEC.md` dentro del repositorio,
   si todavía no existe. Ese es su sitio definitivo. Si ya existe, no la sobrescribas: es la misma spec.
3. Lee `docs/specs/rendimiento-integral/PROGRESO.md` si existe, para retomar el trabajo donde quedó. Si no existe,
   créalo con la plantilla del apartado 11.4.
4. Lee el resto de esta spec entera antes de lanzar ningún subagente.
5. Lee también `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md` y `apps/web/PRODUCT.md` del repositorio.
6. Crea (o localiza, si ya existe) la carpeta temporal de evidencias **fuera del repositorio** (apartado 8.1) y anota
   su ruta absoluta en `PROGRESO.md`. Ninguna captura ni evidencia se guarda dentro del repositorio.

### Paso 0 del implementador

- Nada más empezar, antes de leer nada más, comprueba si tienes disponible la skill
  `caveman`. Si la tienes, actívala. Si no, continúa sin ella.
- `caveman` se aplica a tu comunicación (mensajes, razonamiento visible, encargos y
  coordinación). NO se aplica al código, comentarios, tests, mensajes de commit, textos de
  la interfaz ni al contenido de `PROGRESO.md`, que siguen las convenciones del repo y deben
  ser comprensibles para otro agente sin contexto.
- Después lee `PROGRESO.md` (si existe) para retomar el trabajo, y luego esta spec.

---

## 1. Objetivo y regla de oro

### 1.1 Objetivo

Hacer que One Shoot cargue antes, vaya más fluida (más fotogramas por segundo, menos tirones) y responda al instante
a cada toque, y dejar el código más pequeño, limpio, claro y eficiente.

El responsable del producto ha probado la app en varios Android e iPhone. En general va bien, pero:

- Algunas pantallas tardan en cargar.
- Algunas partes van a pocos fotogramas por segundo.
- La mayoría de los problemas aparecen en el navegador (la web sin instalar), menos en la app instalada (PWA).
  Eso apunta sobre todo a la primera carga, a la caché y al trabajo en el hilo principal.

El 90–95 % del uso es en el móvil.

### 1.2 Regla de oro: el usuario no nota nada, salvo que todo va más rápido

- **Todas las funcionalidades se mantienen exactamente igual.** Nada se quita, nada se añade, nada cambia de
  comportamiento.
- **La interfaz se mantiene idéntica:** mismos textos, colores, tipografías, tamaños, posiciones, iconos,
  animaciones (misma curva, misma duración, mismo recorrido), sonidos, vibraciones y atajos de teclado.
- **Se permite** que algo aparezca **antes** o que una animación vaya **más fluida**. **No se permite** que algo
  aparezca **distinto**.
- Los datos guardados (Supabase, IndexedDB, OPFS, localStorage) se siguen leyendo igual. Ningún usuario pierde nada.
- Si una mejora no se puede hacer sin un cambio visible o funcional, **no se hace**: se documenta en `PROGRESO.md`
  como «Descartado (motivo)». Ningún cambio visible se acepta «porque es casi igual».

Cómo se demuestra la regla de oro: con las capturas de referencia y la comparación de fotogramas de animación del
REQ-02, tomadas **antes de tocar ningún archivo de la app**.

### 1.3 Qué significa «terminado»

Todos los REQ de esta spec están implementados y verificados con evidencias (tests, capturas, mediciones), la
regla de oro está demostrada y el protocolo de cierre final (apartado 12) se ha completado.

---

## 2. Contexto del proyecto

### 2.1 Qué es One Shoot

PWA de ensayo para un grupo de covers de K-pop. Sin login: un único grupo, y quien tenga la URL usa la app con el rol
`anon` de Supabase. Producción: https://kpop-covers.vercel.app. Interfaz en español de España.

Funcionalidades (todas deben seguir igual):

- **Biblioteca** (`/`): vídeos de YouTube o archivos subidos, búsqueda, accesos rápidos (clips fijados), banner del
  próximo evento.
- **Estudio** (`/v/:videoId`): reproductor YouTube o archivo, espejo, velocidad 0,25×–2×, tramo A–B en bucle con
  pausa entre repeticiones, clips, notas con tiempo, zoom con los dedos, pantalla completa, atajos de teclado, archivo
  vinculado con desfase, separación de voz en directo (mid/side) y con IA (Demucs en un worker), copia ligera para la
  nube (WebCodecs).
- **Grabador** (dentro del estudio): cámara con lentes, zoom, luz, exposición, color de la luz, cuadrícula, nivel,
  cuenta atrás con metrónomo, arranque con doble palmada, pausa y reanudación, medición de ritmo, recuperación de tomas
  interrumpidas (OPFS).
- **Tomas y repaso**: lista de tomas, mejor toma, descargar, compartir con el grupo (copia 720p), repaso sincronizado
  separado o superpuesto, notas de toma con dibujo, reacciones.
- **Grupo**: bolsas de sorteo (`/bolsas`), Random Play Dance y pistas (`/rpd`), lista de deseos y votaciones
  (`/deseos`), eventos con cuenta atrás y repertorio (`/eventos`), miembros («¿Quién eres?») en `/ajustes`.
- **PWA**: instalable, service worker con actualización en momento seguro, «Buscar actualización».

### 2.2 Stack

- Monorepo pnpm (`pnpm@11.11.0`, Node ≥ 20, `.nvmrc`).
- `apps/web`: React 19, Vite 7, Tailwind CSS v4, `motion` 12, React Router 7, TanStack Query 5, zustand 5,
  `@supabase/supabase-js` 2, `lucide-react`, `idb-keyval`, `onnxruntime-web` 1.30, `vite-plugin-pwa` (Workbox).
- `packages/shared`: TypeScript puro (tipos de BD, tiempos, YouTube, grabación, palmada, repaso) con tests vitest.
- `supabase/`: migraciones SQL, RLS, triggers, storage; tests SQL con PGlite.
- Vercel: app estática + dos funciones Node en `apps/web/api/` (búsqueda y metadatos de YouTube).

### 2.3 Estructura relevante

```
apps/web/
  api/                       funciones Vercel (youtube-search.ts, youtube-meta.ts)
  e2e/fake-media.js          cámara, micrófono y silencio falsos para pruebas en el navegador
  index.html                 preconnects, hojas de Google Fonts, meta viewport
  vite.config.ts             PWA/Workbox, manualChunks, API de desarrollo, versión
  vercel.json                cabeceras de caché y CSP (Report-Only)
  src/
    main.tsx                 registro del service worker, arranque
    App.tsx                  QueryClient, providers, rutas perezosas, Splash
    index.css                tokens de color, utilidades, fondo seigaiha, reglas de movimiento reducido
    components/              AppShell, Backdrop, Seal, Logo, YouTubePicker, ui/*
    data/                    hooks de React Query por dominio
    features/                library, studio, record, takes, review, reactions, voice, bags, rpd, wishes, events,
                             members, nav, settings, legal
    lib/                     backend.ts (2385 líneas), supabase.ts, snapshot.ts, prefetch.ts, motion.ts, heavyWork.ts…
    player/                  engine.ts, store.ts (zustand), useLoopController, YouTubeStage, FileStage, zoom
    providers/               AuthProvider, CrewProvider, ToastProvider
packages/shared/src/         database.types.ts (generado), domain.ts, recording.ts, clap.ts, review.ts, playback.ts…
supabase/migrations/         23 migraciones
supabase/tests/              comprobaciones SQL (PASS/FAIL, terminan en ROLLBACK) + local/run.mjs (PGlite)
docs/                        ARCHITECTURE.md, DESIGN.md, DEPLOY.md, plan/ (historial del proyecto)
```

### 2.4 Convenciones de código (obligatorias)

- Lógica pura en ficheros `*Rules.ts` (o en `packages/shared`) con su `*.test.ts` al lado. Componentes y hooks solo
  orquestan.
- Comentarios en inglés, narrativos, que explican el porqué. Llevan códigos de referencia (F1…F17, P1…P54,
  «Global review [n]»). Los nuevos usan el código del REQ de esta spec (por ejemplo `// REQ-21 · …`).
- Textos de la interfaz en español de España. Esta spec no añade ni cambia ningún texto visible.
- Colores solo con los tokens de `apps/web/src/index.css`. Animaciones con los presets de `apps/web/src/lib/motion.ts`
  (`jelly`, `snappy`, `soft`).
- Estado del reproductor solo en `player/store.ts` (o en los módulos que salgan de su división, REQ-27).
- Claves de localStorage con prefijo `oneshoot.*` o `coverscape.*` (las existentes no se renombran nunca).
- Alias `@/` para `apps/web/src`; paquete compartido `@coverscape/shared`.
- Base de datos: **borrar = archivar** (trigger), las políticas filtran por `private.default_group()`, el cliente
  nunca envía `crew_id`, columnas editables con `grant update (cols)`. Cambios de esquema siempre en una migración
  **nueva** (nunca se edita una publicada) con su test SQL en `supabase/tests/`.
- `tsconfig.base.json`: `strict`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`.
- Formato con Prettier (`.prettierrc`, `pnpm format`).

### 2.5 Arrancar en local

```bash
pnpm install
pnpm dev                    # http://localhost:5173, contra el Supabase de .env.local
pnpm typecheck
pnpm test                   # vitest en apps/web y packages/shared
pnpm build                  # tsc --noEmit && vite build
pnpm db:test                # aplica todas las migraciones en PGlite y ejecuta supabase/tests/*.sql
```

**Modo demo (el que se usa para probar):**

- Se activa con `VITE_DEMO=true` y solo en desarrollo (`import.meta.env.DEV`). Guarda los datos en localStorage
  (`coverscape.demo.v1`) y una sesión falsa. No toca Supabase.
- `App.tsx` exige que existan `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` antes de todo. Para el demo basta
  con valores ficticios, por ejemplo `VITE_SUPABASE_URL=http://127.0.0.1:54321` y
  `VITE_SUPABASE_PUBLISHABLE_KEY=demo` en `apps/web/.env.local`. Compruébalo en la fase 0 y anota en `PROGRESO.md`
  lo que haga falta.
- `.claude/launch.json` tiene la configuración `web-demo` (puerto 5174, `VITE_DEMO=true`).
- `apps/web/src/lib/devSilence.ts` silencia todo el sonido en el demo. **Todas las pruebas se hacen en silencio.**
- `apps/web/e2e/fake-media.js` simula cámara (canvas 1920×1080 a 30 fps con capacidades de Android), micrófono,
  `window.__fakeClap()`, `__fakeDoubleClap(gap)` y `__fakeMicLevel(level)`. Se inyecta con `page.addInitScript`.

**Variables de entorno:**

| Variable | Dónde | Uso |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | `apps/web/.env.local` (se parte de `apps/web/.env.example`) | URL del proyecto (o valor ficticio en demo y URL del servidor simulado en pruebas de carga) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `apps/web/.env.local` | clave publicable (o ficticia) |
| `YOUTUBE_API_KEY` | solo servidor | búsqueda real; sin ella `pnpm dev` devuelve resultados de prueba |
| `VITE_DEMO` | entorno | `true` activa el modo demo en desarrollo |
| `APP_BUILD` | entorno de build | número de versión; sin él el build avisa y dice «Versión de desarrollo» (inofensivo en local) |

### 2.6 Prohibiciones de entorno (seguridad de los datos reales)

- **Nunca** ejecutes pruebas, scripts ni builds de medición contra el Supabase de producción
  (`pevbjaowyctqqldvzovz`). Las pruebas usan el modo demo o un servidor local que simula Supabase (REQ-03).
- **Nunca** apliques migraciones en producción ni despliegues (`pnpm deploy:prod`, `vercel`). Eso lo hace el
  responsable con las instrucciones que dejes (apartado 12, paso 5).
- **Nunca** borres ni sobrescribas datos de usuario guardados en el navegador (localStorage, IndexedDB, OPFS, cachés)
  salvo lo que ya hace hoy el código.

### 2.7 Datos de prueba y migraciones

- No hay seeds en el repositorio. La fase 0 crea un **conjunto de datos de prueba determinista** (REQ-02) en
  `apps/web/e2e/fixtures/`.
- Migraciones nuevas de esta spec: las de REQ-14, REQ-17, REQ-19 y REQ-20. Se prueban **solo** con `pnpm db:test`
  (PGlite). `packages/shared/src/database.types.ts` se actualiza a mano imitando exactamente el formato generado
  (el responsable lo regenerará al aplicar las migraciones y debe salir igual).

### 2.8 Lo que ya está bien (no lo rehagas)

Las revisiones anteriores (`docs/plan/revisiones/global-rendimiento.md`, `mejoras-global-rendimiento.md`) ya
corrigieron P1–P4, P8, P10–P12 y P15 (parcial). Ya están bien y se mantienen:

- El cabezal de la línea de tiempo y la barra de pantalla completa se pintan directamente en el DOM con `translate3d`.
- `useLoopController` usa un único rAF y se duerme en pausa.
- `useUnlessCovered` y `Dormant` congelan el estudio mientras el grabador lo tapa.
- Los selectores de zustand devuelven primitivas o usan `useShallow`.
- El compositor del grabador usa `requestVideoFrameCallback`, `alpha:false` y se congela si nadie graba el lienzo.
- La copia para la nube limita el progreso a una actualización cada 400 ms.
- Los resultados del worker de separación se transfieren, no se copian.
- `VideoCard` es `memo`; las olas (`waves.css`) y el *shimmer* ya van solo en el compositor.

---

## 3. Método común de verificación

Todos los REQ se verifican con estas herramientas y métricas, que crea la fase 0 (REQ-01, REQ-02, REQ-03). Cada
métrica se mide **antes** (línea base de la fase 0, guardada en
`evidencias/fase-0/linea-base.json`, en la carpeta temporal fuera del repositorio del apartado 8.1, con su resumen en
texto en `PROGRESO.md`) y **después** de cada fase que la afecte.

### 3.1 Perfil de medición de laboratorio

- Chromium de Playwright, viewport 390×844, `deviceScaleFactor` 3, táctil.
- CPU ralentizada ×4 (`Emulation.setCPUThrottlingRate` por CDP).
- Red «4G lenta» por CDP (`Network.emulateNetworkConditions`): 150 ms de latencia, 1,6 Mbit/s de bajada,
  750 kbit/s de subida.
- 5 pasadas por medición; se usa la **mediana** (y el p95 donde se indique).
- Para las mediciones de carga: build de producción (`vite build` + `vite preview`) con un Supabase simulado
  (REQ-03), sin service worker («frío») o con él instalado («repetida»).
- Para las mediciones de fluidez: servidor de desarrollo en modo demo con los datos de prueba, o build de producción
  con Supabase simulado si la métrica lo exige.

### 3.2 Métricas

| Id | Métrica | Cómo se obtiene |
| --- | --- | --- |
| M-01 | Peso del camino crítico de `/`: JS de entrada + `modulepreload` + CSS, en kB gzip | script `pnpm perf:bundle` sobre `dist/` |
| M-02 | Peso del chunk de entrada, kB gzip | `pnpm perf:bundle` |
| M-03 | LCP de `/` en frío (ms) | Playwright + `PerformanceObserver('largest-contentful-paint')`, perfil 3.1 |
| M-04 | LCP de `/` en visita repetida (ms) | ídem, con el service worker ya instalado |
| M-05 | `/v/:id` en frío: tiempo hasta reproductor listo (ms) | `performance.mark('oneshoot:player-ready')` (REQ-03) |
| M-06 | Bytes de la respuesta de la lista de vídeos con 30 vídeos subidos con póster | Playwright, `response.body().length` |
| M-07 | Peticiones de red al entrar en cada pantalla (número y si van en serie) | Playwright, registro de peticiones |
| M-08 | Commits de React por segundo en un escenario, por componente | sonda de desarrollo `window.__oneshootPerf` (REQ-03) |
| M-09 | Duración de fotograma p50/p95 y número de *Long Animation Frames* > 50 ms en un escenario | contador rAF + `PerformanceObserver('long-animation-frame')` |
| M-10 | Eventos `Paint` por segundo en un escenario | traza CDP (`Tracing`), categoría `devtools.timeline` |
| M-11 | Entradas y bytes del precache del service worker | `dist/sw.js` / manifiesto de Workbox |
| M-12 | Ficheros de `apps/web/src` y `packages/shared/src` con más de 600 líneas (sin tests ni `database.types.ts`) | `pnpm check:size` (REQ-01) |
| M-13 | Tiempo entre una acción y su resultado (ms), por ejemplo «Guardar» → toma guardada | `performance.mark/measure` en el test |

### 3.3 Escenarios de medición

| Id | Escenario | Métricas |
| --- | --- | --- |
| S-01 | Arranque de `/` (frío y repetido) | M-01–M-04, M-07 |
| S-02 | Abrir `/v/:id` en frío (vídeo de YouTube y vídeo subido) | M-05, M-07 |
| S-03 | Estudio reproduciendo un clip en bucle 10 s | M-08, M-09, M-10 |
| S-04 | Pellizco de zoom de 3 s en el estudio con archivo | M-08, M-09 |
| S-05 | Arrastrar el asa B del tramo durante 3 s | M-08, M-09 |
| S-06 | Desplazar lateralmente los accesos rápidos de la biblioteca 3 s | M-09, M-10 |
| S-07 | Abrir y cerrar el diálogo «Guardar clip» | M-09, M-10 |
| S-08 | Revelado del ganador de una votación | M-09, M-10 |
| S-09 | «Sacar» de una bolsa (bombo girando) | M-09, M-10 |
| S-10 | Cuenta previa entre clips en una ronda de Random Play Dance | M-08 |
| S-11 | Grabador con cámara falsa: pellizco de zoom 3 s | M-08, M-09 |
| S-12 | Grabar 20 s, parar, «Guardar» | M-13 (guardar), M-09 |
| S-13 | «Compartir con el grupo» una toma de 20 s | M-08 (diálogo), número de fotogramas de la copia |
| S-14 | Repaso: reproducir 10 s, arrastrar la bisagra 3 s, encajar superpuesto 3 s | M-08, M-09 |
| S-15 | Codificar y empaquetar las pistas de voz de un audio sintético de 3 min | M-09 (hilo principal) |
| S-16 | Fase de sonido de la copia para la nube con un vídeo sintético | M-09 (hilo principal) |
| S-17 | Abrir «Tomas» con 10 tomas guardadas y pasar al repaso tras grabar 2 min | M-13 |

### 3.4 Comparación visual (la prueba de la regla de oro)

- **Capturas estáticas:** `toHaveScreenshot` de Playwright en todas las pantallas y estados del REQ-02, a 375, 768 y
  1440 px de ancho, con los datos de prueba deterministas y el reloj fijado (`page.clock`). Tolerancia
  `maxDiffPixelRatio: 0.002`. Como Playwright no informa de las diferencias por debajo del umbral, un script propio
  (`pixelmatch` sobre la captura nueva y la de referencia) registra en evidencias el ratio real de cada captura.
  Cualquier diferencia distinta de cero se inspecciona y se justifica por escrito en
  `PROGRESO.md` (por ejemplo, suavizado de un borde). Si no se puede justificar, es un hallazgo de nota ≥ 7.
- **Fotogramas de animación:** para cada animación que se toque (REQ-09, REQ-21, REQ-22, REQ-23, REQ-25, REQ-12),
  se capturan fotogramas en instantes fijos: por defecto 0, 100, 200, 400, 600, 1000 ms y el final; en animaciones
  infinitas o más largas, instantes propios que cubran un ciclo completo (los fija el REQ o, si no, el test, y se
  usan los mismos antes y después):
  - animaciones de `motion` (JS): con `page.clock.install()` y `page.clock.runFor(t)`;
  - animaciones CSS o Web Animations: pausando `document.getAnimations()` y fijando `currentTime = t`.
  Tolerancia `maxDiffPixelRatio: 0.01` por fotograma. Mismas reglas de justificación.
- Las capturas de referencia se generan **en la fase 0, antes de modificar ningún archivo de `apps/web/src`**, y se
  guardan en `evidencias/referencias/` (carpeta temporal **fuera del repositorio**, apartado 8.1; nunca se versionan).

---

## 4. Requisitos funcionales

Formato de cada REQ: descripción, comportamiento esperado, decisiones (con motivo), casos límite, interacción con
otras funcionalidades, estados de la interfaz y criterios de aceptación.

**Para todos los REQ salvo REQ-01, REQ-02 y REQ-03:** los estados de la interfaz (carga, vacío, error y éxito) se
mantienen **idénticos** a la línea base. Se permite que el estado de carga dure menos o no llegue a verse.

Las referencias `archivo:línea` son orientativas (las líneas pueden haberse movido). Las rutas `src/…` son
relativas a `apps/web/`.

Los códigos entre corchetes (C-xx, D-xx, R-xx, G-xx, Q-xx) son los identificadores de la auditoría que originó cada
punto; sirven para trazar el origen en `PROGRESO.md`.

---

### Bloque A · Herramientas y líneas base

#### REQ-01 · Herramientas de verificación

**Descripción.** El repositorio no tiene ESLint, Playwright, axe-core, análisis de bundle ni control de tamaño de
ficheros. Hay que añadirlos como dependencias de desarrollo, sin que nada llegue al bundle de producción.

**Comportamiento esperado.**

- `pnpm lint`: ESLint 9 con configuración plana (`eslint.config.js` en la raíz), `typescript-eslint`
  (`recommended`, con tipos si el tiempo de ejecución es razonable) y `eslint-plugin-react-hooks` (`rules-of-hooks`
  como error, `exhaustive-deps` como aviso). Cubre `apps/web/src`, `apps/web/api`, `packages/shared/src`.
- `pnpm e2e`: Playwright (`apps/web/playwright.config.ts`) con proyectos «móvil Chromium» (Pixel 7), «móvil WebKit»
  (iPhone 14) y «escritorio Chromium». El servidor del demo arranca solo (`webServer`, puerto 5174) y cada test
  inyecta `e2e/fake-media.js`.
- `@axe-core/playwright` disponible para los tests.
- `pnpm perf:bundle`: construye y escribe en JSON el tamaño gzip de cada chunk, el camino crítico de `/` (entrada +
  `modulepreload` + CSS) y el precache (M-01, M-02, M-11).
- `pnpm build:report`: igual que `build` pero con `rollup-plugin-visualizer` activado por una variable de entorno
  (`ANALYZE=1`). Sin la variable, el build es idéntico al actual.
- `pnpm check:size`: script (`scripts/check-file-size.mjs`) que lista los ficheros de M-12 y falla si alguno supera
  600 líneas **y no está en la lista de excepciones temporales** del propio script. La lista empieza con los ficheros
  que hoy superan el límite y se vacía a medida que avanzan las fases.
- `pnpm check:unused`: `knip` configurado para el monorepo (informe de exports, ficheros y dependencias sin uso).
- Vitest admite tests de componentes `*.test.tsx` con entorno `jsdom` y `@testing-library/react` (por fichero, con
  el comentario `// @vitest-environment jsdom`), sin cambiar el entorno `node` de los tests actuales.

**Decisiones.**

- La configuración inicial de ESLint debe dejar `pnpm lint` con **0 errores** sobre el código actual sin añadir
  `eslint-disable` nuevos. Cualquier regla que dé **errores** sobre el código actual se configura como aviso y se
  anota en `PROGRESO.md`; el recuento de avisos de la
  línea base se anota en `PROGRESO.md` y el REQ-30 lo reduce. *Motivo:* la fase 0 no puede cambiar código de la app.
- No se activa el React Compiler. *Motivo:* cambia la memoización de toda la app de golpe; el riesgo de cambio de
  comportamiento es alto y no se puede acotar por fases.
- Todas las dependencias nuevas son `devDependencies`.

**Casos límite.** Si un navegador de Playwright no puede instalarse en la máquina, se anota y se usa el resto; WebKit
es obligatorio para el cierre final si está disponible en la plataforma.

**Interacción.** Lo usan todas las fases. `package.json`, `pnpm-lock.yaml` y `vite.config.ts` son archivos
compartidos: solo los toca el dueño de la fase en curso.

**Criterios de aceptación.**

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e`, `pnpm perf:bundle`, `pnpm check:size`,
      `pnpm check:unused` y `pnpm db:test` funcionan desde la raíz.
- [ ] El `dist/` de `pnpm build` no contiene código de ESLint, Playwright, axe, visualizer ni knip (búsqueda en los
      chunks).
- [ ] Los scripts y su uso están documentados en `README.md` (apartado «Otros comandos»).

#### REQ-02 · Cobertura e2e de todos los flujos y capturas de referencia

**Descripción.** No hay tests e2e. Para demostrar que nada cambia, hace falta una suite de Playwright que recorra
todos los flujos y unas capturas de referencia tomadas antes de cambiar la app.

**Comportamiento esperado.**

1. **Datos de prueba deterministas** en `apps/web/e2e/fixtures/`:
   - `demo-db.json`: estado completo del demo (`coverscape.demo.v1`) con, como mínimo, 30 vídeos (20 de YouTube y 10
     subidos con póster en base64), 40 clips (algunos fijados, alguno con zoom), notas con tiempo, notas de toma con
     dibujo, 6 miembros, 3 bolsas (canciones, clips, personas) con historial, 2 pistas, 8 deseos con «Me apunto»,
     votaciones abiertas y cerradas de los tres tipos (con empate y con segunda vuelta), 3 eventos (uno a más de una
     semana, uno en la última semana, uno pasado), tomas con reacciones.
   - Un vídeo corto de prueba para las subidas (generado por el propio test con canvas + MediaRecorder, o un `.mp4`
     pequeño libre de derechos guardado en `fixtures/`).
   - Se inyectan con `page.addInitScript` antes de cargar la app.
2. **Reloj fijo** (`page.clock`) en las pruebas que muestran fechas o cuentas atrás.
3. **Flujos** (cada uno un test o varios), en el proyecto «móvil Chromium» como mínimo y en «escritorio Chromium»:
   - Biblioteca: abrir, buscar, filtrar, abrir un clip fijado, añadir un vídeo de YouTube (búsqueda simulada del
     servidor de desarrollo), subir un archivo, archivar un vídeo.
   - Estudio: reproducir y pausar, espejo, velocidad (preset y ajuste fino), marcar A y B, bucle, pausa entre
     repeticiones, guardar clip, editar y borrar clip, nota con tiempo, zoom (pellizco simulado por CDP y rueda),
     pantalla completa, todos los atajos de teclado del README, cambio YouTube/Archivo, vincular archivo con
     sincronización, modos de voz en directo.
   - Grabador (cámara falsa): abrir, cambiar lente, zoom, luz, exposición, color de la luz, cuadrícula, nivel,
     cuenta atrás, doble palmada (`__fakeDoubleClap`), pausar y reanudar, parar, guardar, descartar, repetir,
     recuperación de una toma interrumpida.
   - Tomas: lista, filtros, mejor toma, descargar, compartir con el grupo, borrar.
   - Repaso: abrir, separado y superpuesto, bisagra, encajar, velocidad, sonido, ajuste de sincronía, nota de toma con
     dibujo, reacciones.
   - Bolsas: crear, añadir elementos, sacar uno y varios, quitar y devolver, rellenar, historial, ajustes.
   - Random Play Dance: montar ronda desde bolsa y a mano, jugar con cuenta previa y pausa, modo adivinar, guardar
     como pista, editar y reordenar pista.
   - Próxima cover: proponer, «Me apunto», crear votación de cada tipo, votar, cerrar, desempate y segunda vuelta,
     revelado del ganador.
   - Eventos: crear, editar, cuenta atrás (más de 7 días y última semana), repertorio, crear bolsa y pista desde el
     evento.
   - Ajustes: miembros (alta, renombrar, color, archivar), «¿Quién eres?», «Buscar actualización», versión.
   - Navegación: menú Hanafuda en móvil, barra lateral en escritorio, «Atrás» del sistema en diálogos, pantalla
     completa y ronda; página `/privacidad`; ruta desconocida redirige a `/`.
4. **Capturas de referencia** (apartado 3.4) de cada pantalla y estado relevante (carga, vacío, error, con datos,
   diálogos abiertos), a 375, 768 y 1440 px, **en cada proyecto de Playwright** que se use en el cierre («móvil
   Chromium», «móvil WebKit», «escritorio Chromium»), porque Playwright guarda las referencias por proyecto.
5. **Fotogramas de referencia** de las animaciones que tocan los REQ (apartado 3.4): Splash, diálogo, ola de la línea
   de tiempo, zoom, revelado de votación, bombo de la bolsa, colgantes de accesos rápidos, cuenta previa de la ronda,
   barras de resultados, menú Hanafuda, cuenta atrás de eventos.
6. **Accesibilidad de referencia:** informe de axe-core por pantalla guardado en
   `evidencias/fase-0/axe-linea-base.json`.

**Decisiones.**

- Las capturas y fotogramas de referencia se generan sobre el código **sin modificar** (commit de partida, anotado en
  `PROGRESO.md`). *Motivo:* son la única prueba objetiva de que la interfaz no cambia.
- Las pruebas con YouTube real pueden necesitar red. Si el iframe no carga en el entorno, esas capturas enmascaran la
  zona del iframe (`mask`) y el flujo se prueba con un vídeo subido. Se anota.
- El estado de la app depende del ancho (`lg` = 64rem): las capturas se toman en los tres anchos y también tras girar
  (390×844 → 844×390) en el estudio, el repaso y la ronda.

**Casos límite.** Animaciones infinitas (Splash, bombo) se capturan con el reloj controlado. Los datos de fecha
relativa («hace 2 días») se congelan con `page.clock`.

**Interacción.** Es la red de seguridad de todas las fases. Si una fase necesita una captura nueva (un estado que no
estaba cubierto), se genera **sobre el commit de partida** en una copia temporal fuera del árbol de trabajo
(`git archive <commit> | tar -x -C <directorio temporal>`, `pnpm install` allí y la misma suite). **Prohibido usar
`git stash`** (con fases en paralelo podría guardar cambios de otros subagentes), y nunca
sobre código ya modificado.

**Criterios de aceptación.**

- [ ] `pnpm e2e` pasa en verde sobre el commit de partida, con todos los flujos del punto 3.
- [ ] Existen capturas de referencia de todas las pantallas a 375, 768 y 1440 px, y fotogramas de referencia de todas
      las animaciones del punto 5.
- [ ] `evidencias/fase-0/` contiene las capturas, el informe de axe y la lista de flujos cubiertos.

#### REQ-03 · Arnés de medición y línea base numérica

**Descripción.** Medir con números todas las métricas del apartado 3 antes de cambiar nada.

**Comportamiento esperado.**

- **Supabase simulado para las pruebas de carga:** un **servidor HTTP local real** (Node, `apps/web/e2e/perf/
  supabaseMock.mjs`, por ejemplo en `http://127.0.0.1:54329`) sirve `/rest/v1/**`, `/rest/v1/rpc/**` y
  `/storage/v1/**` con los datos de `fixtures/` (mismo contenido que el demo) y la misma forma JSON que PostgREST y
  Storage. El build de medición usa `VITE_SUPABASE_URL=http://127.0.0.1:54329` y una clave ficticia. Requisitos:
  - es un servidor de verdad (no `page.route`), para que la emulación de red de CDP, las conexiones y los
    `preconnect` se comporten como con Supabase real;
  - respeta `select=` (columnas, alias `alias:columna` y uniones embebidas que use la app), los filtros que use la app
    (`eq`, `in.()`, `is`, `not`, `order`, `limit`/`range`) y las RPC; así M-06 y M-07 reflejan de verdad REQ-14, 16,
    17 y 19;
  - envía `Timing-Allow-Origin: *` y CORS, para poder medir tiempos de conexión con Resource Timing;
  - permite añadir latencia por petición (por ejemplo 150 ms) además de la emulación de red;
  - tiene sus propios tests (unitarios) de `select`, alias y filtros;
  - se actualiza en la misma fase que cambie un contrato de datos (columnas nuevas, RPC nuevas).
  Así se mide el build de producción real sin tocar Supabase.
- **Marcas de rendimiento** (`performance.mark`) en el código de la app, invisibles para el usuario:
  `oneshoot:app-start` (main.tsx), `oneshoot:library-painted` (primer pintado de la biblioteca con datos),
  `oneshoot:player-ready` (reproductor listo en el estudio), `oneshoot:camera-ready` (grabador con imagen),
  `oneshoot:take-saved` (toma guardada), `oneshoot:review-ready` (repaso listo).
- **Sonda de commits** `src/lib/perfProbe.tsx`: componente `<PerfProbe id="…">` que, solo si
  `import.meta.env.DEV` y `localStorage['oneshoot.debug.perf'] === '1'`, envuelve a sus hijos en `React.Profiler` y
  acumula commits en `window.__oneshootPerf`. En producción devuelve `children` sin más (el minificador lo elimina).
  Se coloca alrededor de: `StudioPage`, `Timeline`, `ClipList`, `PlayerZoomLayer`, `ZoomControls`, `Transport`,
  `RecordStudio`, `ReviewScreen`, `ReviewControls`, `TakesPanel` (diálogo de compartir), `RoundRunner`, `PollView`,
  `WishesPage`, `PinnedClips`.
- **Scripts de medición** en `apps/web/e2e/perf/` que ejecutan los escenarios S-01…S-17 con el perfil 3.1 y escriben
  un JSON con todas las métricas. Comando: `pnpm perf` (todas) y `pnpm perf -- --grep S-03` (una).
- **Línea base** en `evidencias/fase-0/linea-base.json` (carpeta temporal, apartado 8.1), con fecha, commit, máquina y
  versión de Chromium.

**Decisiones.**

- Las marcas `performance.mark` quedan en producción. *Motivo:* coste despreciable y permiten al responsable medir en
  dispositivos reales con Chrome remoto.
- La sonda de commits solo existe en desarrollo. *Motivo:* `React.Profiler` tiene coste.
- Si un escenario no se puede ejecutar en el entorno (por ejemplo, la separación con el modelo de 126 MB), se mide la
  parte afectada de forma aislada (S-15 y S-16 usan audio y vídeo sintéticos) y se anota.

**Casos límite.** Variabilidad entre pasadas: si la dispersión (p95/p50) supera el 30 %, repetir con 9 pasadas.

**Interacción.** Las marcas y las sondas se añaden en la fase 0 y no se quitan. Las fases posteriores no deben
romperlas (si dividen un componente, la sonda pasa al componente equivalente).

**Criterios de aceptación.**

- [ ] `pnpm perf` produce el JSON con M-01…M-13 para S-01…S-17 (o la anotación de por qué uno no se pudo medir).
- [ ] `linea-base.json` está guardado y `PROGRESO.md` tiene una tabla resumen de la línea base.
- [ ] El build de producción no incluye `React.Profiler` (búsqueda en `dist/`).

---

### Bloque B · Carga inicial y empaquetado

#### REQ-04 · Registro diferido del service worker [C-01]

**Descripción.** `src/main.tsx` registra el service worker con `immediate: true`. En la primera visita web, Workbox
descarga el precache (≈84 archivos, ≈1,9 MiB) a la vez que el JS crítico, Supabase y la miniatura del LCP. En Safari
iOS sin instalar, el service worker se borra tras ~7 días sin uso, así que esa «primera visita» se repite a menudo.

**Comportamiento esperado.** El registro se hace después del evento `load` y en un momento de reposo
(`requestIdleCallback` con `timeout` de unos 3 s, o `setTimeout` donde no exista). `onNeedRefresh`,
`onRegisteredSW`, `noteRegistration`, el sondeo de 1 h y todo el mecanismo de «actualizar en momento seguro» siguen
exactamente igual. Como `updateSW` deja de existir de forma síncrona, `applyUpdate` (y lo que la llama:
`setUpdateApplier`, `setWaitingUpdateApplier`, `popstate`) no hace nada mientras no haya `updateSW` (no puede haber
una actualización esperando antes de registrar). `virtual:pwa-register` (workbox-window) se importa con `import()` en ese mismo momento para que
salga del chunk de entrada.

**Decisiones.** Se retrasa solo el registro, no la lógica. *Motivo:* el precache no aporta nada a la primera pintura y
compite por la red.

**Casos límite.**

- La app instalada ya tiene service worker activo: el registro tardío no cambia nada para ella.
- «Buscar actualización» pulsado antes de que termine el registro: debe comportarse igual que hoy cuando aún no hay
  registro (revisar `appUpdate.ts`: `noteRegistration` llega tarde, el botón espera o informa igual que hoy).
- `vite:preloadError` y `setWaitingUpdateApplier` deben seguir funcionando aunque el registro aún no exista.

**Interacción.** REQ-06 y REQ-11 también tocan `main.tsx` (misma fase). REQ-13 toca la configuración de Workbox.

**Criterios de aceptación.**

- [ ] En S-01 frío, la descarga del precache empieza después del LCP (traza de red en evidencias).
- [ ] M-03 mejora frente a la línea base (objetivo conjunto del bloque B en REQ-10).
- [ ] Test e2e: con una versión nueva servida, la actualización se aplica solo fuera del estudio y sin diálogos, igual
      que hoy; «Buscar actualización» funciona.
- [ ] `workbox-window` no está en el chunk de entrada (M-02, informe del visualizer).

#### REQ-05 · Conexiones anticipadas correctas [C-02]

**Descripción.** `index.html` hace `preconnect` a Google Fonts, `www.youtube.com` e `i.ytimg.com`, pero no al origen de
Supabase, que es el principio de la cascada crítica.

**Comportamiento esperado.**

- `<link rel="preconnect" href="%VITE_SUPABASE_URL%" crossorigin>` (Vite sustituye `%VITE_*%` en `index.html`).
- Se quita el `preconnect` a `https://www.youtube.com` del arranque (solo lo usa el estudio, y `prefetchStudio` ya lo
  calienta en reposo). Se mantiene `i.ytimg.com` (miniaturas de la biblioteca).
- Tras REQ-07 (fuentes propias) se quitan los `preconnect` a Google Fonts que dejen de ser críticos y se deja el de
  `fonts.gstatic.com` solo si la hoja japonesa diferida sigue usándolo.
- Máximo 4 `preconnect` en total.

**Decisiones.** Se quita el `preconnect` a YouTube del arranque. *Motivo:* abrir conexiones que la portada no usa
compite con las críticas, y el estudio ya las calienta en reposo.

**Casos límite.** Si `VITE_SUPABASE_URL` no está definida, el build no debe dejar un `href` vacío ni roto (usar un
plugin de transformación de `index.html` que omita la etiqueta).

**Interacción.** REQ-07 decide qué `preconnect` de fuentes quedan. REQ-06 depende de que la conexión a Supabase esté
abierta pronto.

**Criterios de aceptación.**

- [ ] En la traza de S-01 frío, la primera petición a Supabase no paga DNS + TCP + TLS (tiempo de conexión ≈ 0).
- [ ] `index.html` del build contiene el `preconnect` correcto; sin variable, no contiene ninguno vacío.

#### REQ-06 · Carga anticipada por ruta en arranque en frío [C-03, D-15 parcial]

**Descripción.** `lazy()` no pide el chunk de una ruta hasta que se renderiza, y eso ocurre después de que
`RequireCrew` tenga el grupo. En un enlace directo a `/v/:id`, `/bolsas/…`, `/rpd/…`, `/deseos/…` o `/eventos/…`, la
cadena es: entrada → grupo → chunk de la ruta → datos → (YouTube API).

**Comportamiento esperado.**

- Un mapa único de cargadores por ruta (`src/lib/routeLoaders.ts`) usado **a la vez** por `lazy()` en `App.tsx` y por
  `main.tsx`, que antes de `createRoot` lanza el `import()` del chunk de la ruta de `location.pathname`.
- En `/v/:id`, además, se lanza la carga de la IFrame API de YouTube (la misma función que ya usa el estudio, que
  debe ser idempotente) y la petición del grupo (`queryClient.prefetchQuery(['group'])` con el mismo `queryFn`).
- `lib/prefetch.ts` (`loadStudioPage`, precarga en reposo) se integra en ese mapa sin duplicar lógica.

**Decisiones.** No se cambia la clave `['videos', crewId]` (D-15 completo queda fuera: toca claves de consulta en
muchos sitios por una mejora pequeña).

**Casos límite.** Ruta desconocida: no se precarga nada. Error al cargar el chunk anticipado: el `lazy()` lo
reintenta como hoy y `vite:preloadError` sigue igual.

**Interacción.** Comparte `main.tsx` con REQ-04 (misma fase). La precarga del grupo debe usar exactamente la misma
clave y función que `CrewProvider`, para que no haya dos peticiones. No cambia `RequireCrew` ni el Splash.

**Criterios de aceptación.**

- [ ] En la traza de S-02 frío, el chunk del estudio empieza en paralelo a la petición del grupo, no después.
- [ ] M-05 mejora al menos un 15 % frente a la línea base.

#### REQ-07 · Fuentes autoalojadas sin cambio visual [C-04, P9]

**Descripción.** Las dos hojas de Google Fonts de `index.html` bloquean el primer pintado, llegan de un tercero y sus
`woff2` se descubren en un segundo salto.

**Comportamiento esperado.**

- Se descargan de Google **los mismos archivos** `woff2` que se sirven hoy y se guardan en el repositorio
  (`apps/web/src/assets/fonts/` o `public/fonts/`, con nombre con hash si es posible):
  - cortes `latin` y `latin-ext` de JetBrains Mono 500/600, Shippori Mincho B1 700/800, Zen Kaku Gothic New
    400/500/700;
  - los archivos del subconjunto de kanji de la interfaz (segunda hoja de `index.html`, parámetro `text=`) para
    Shippori Mincho B1 700/800.
- Un `@font-face` propio por archivo con **los mismos** `font-family`, `font-weight`, `unicode-range` y
  `font-display: swap` que las hojas de Google, en `index.css` o en un CSS importado desde él.
- `<link rel="preload" as="font" type="font/woff2" crossorigin>` solo para Zen Kaku Gothic New 400 latin y Shippori
  Mincho B1 700 latin.
- Para los glifos japoneses que no están en el subconjunto (títulos de canciones con kana o kanji): **no** se vuelve a
  cargar la hoja de Google (traería también los rangos latinos y, al declararse después, ganaría a los propios). En su
  lugar, los bloques `@font-face` de los cortes japoneses de la hoja de Google actual se copian a nuestro CSS **tal
  cual** (mismo `unicode-range`, `src` apuntando a sus mismas URLs de `fonts.gstatic.com`, `font-display: swap`). Así
  solo se descarga un corte japonés cuando un texto lo necesita, como hoy, y ya no hay hoja de un tercero bloqueando.
- **Orden de declaración** idéntico al de hoy: primero todos los bloques de la hoja principal (latin, latin-ext y
  japoneses, en el orden en que Google los sirve) y después los del subconjunto de kanji de la interfaz, para que a
  igualdad de rango gane el mismo `@font-face` que hoy.
- Se actualizan las reglas `runtimeCaching` de Workbox: desaparece la de `fonts.googleapis.com`; se mantiene
  `font-files` (`fonts.gstatic.com`) para los cortes japoneses. Las fuentes propias entran en el precache (`woff2` ya
  está en `globPatterns`).
- No se añade ningún script en línea.

**Decisiones.** Los cortes japoneses se siguen sirviendo desde `fonts.gstatic.com` con `@font-face` copiados.
*Motivo:* autoalojar todos los cortes japoneses añadiría cientos de archivos; quitarlos haría que los títulos japoneses
usaran la fuente del sistema (cambio visible). Las URLs de gstatic llevan versión y no cambian para un mismo archivo.

**Casos límite.** Navegador sin conexión a Google: la interfaz latina y los kanji de la interfaz se ven igual que con
conexión; los títulos japoneses usan la reserva igual que hoy sin conexión. Kanji de interfaz nuevo que no esté en el
subconjunto: no aplica (esta spec no añade textos), pero el comentario de `index.html` sobre cómo ampliar el
subconjunto se actualiza para explicar el nuevo proceso.

**Interacción.** Cambia el precache (M-11) y las reglas `runtimeCaching` de REQ-13. REQ-05 retira los `preconnect`
de fuentes que dejen de hacer falta. La CSP de `vercel.json` se actualiza si cambian orígenes.

**Criterios de aceptación.**

- [ ] Lighthouse (o la traza) de S-01 no lista `fonts.googleapis.com` como recurso que bloquea el render.
- [ ] Comparación visual (3.4) sin diferencias en todas las pantallas, incluido un título con kana y kanji y los kanji
      decorativos (稽古帳, 鏡, 速, 反復…).
- [ ] M-03 mejora (objetivo conjunto en REQ-10).

#### REQ-08 · Troceado del bundle [C-05, C-06, Q-split de backend]

**Descripción.** Tres cosas inflan el camino crítico de `/`:

1. `manualChunks` (`vite.config.ts`) mete **todos** los iconos de `lucide-react` en un chunk `icons` precargado en la
   portada, aunque la mayoría son de pantallas perezosas.
2. `src/lib/backend.ts` (2385 líneas) es un único módulo con objetos literales: Rollup no puede quitar los métodos que
   la portada no usa (bolsas, deseos, votaciones, tomas, stems, subidas).
3. La rama demo de `backend.ts` se elimina al minificar, pero hay que comprobar que sus objetos también desaparecen.

**Comportamiento esperado.**

- Se quita la regla `lucide-react → icons` de `manualChunks`, para que cada icono viaje con el chunk que lo usa. Se
  revisa la regla `@tanstack → query` con el informe del visualizer: se mantiene solo si el chunk se usa entero en la
  entrada.
- `src/lib/backend.ts` se convierte en la carpeta `src/lib/backend/` (plan de división en REQ-27), con un `index.ts`
  que reexporta todo lo público para no romper importaciones. Cada `src/data/*.ts` importa **solo** el módulo de su
  dominio (`@/lib/backend/bags`, etc.), de forma que el chunk de entrada solo lleve lo que usa la biblioteca y el
  shell.
- Las implementaciones demo (`*.demo.ts`) se cargan de forma que **no aparezcan en el build de producción** (rama
  `IS_DEMO` constante con `import()` dinámico solo en desarrollo, o equivalente comprobable). El comportamiento del
  demo no cambia.

**Decisiones.** Las firmas públicas (`backend`, `bagsBackend`, `wishesBackend`, `eventsBackend`, `stemsBackend` y
sus tipos) no cambian. *Motivo:* evita tocar decenas de consumidores y mantiene el demo.

**Casos límite.** Dependencias circulares entre dominios al dividir: los tipos compartidos van en
`lib/backend/types.ts` y los ayudantes en `lib/backend/shared.ts`.

**Interacción.** Es la base de las fases 2 y 8, que modifican `lib/backend/**` después. El cambio de `manualChunks`
se hace en la fase 3 (dueña de `vite.config.ts`).

**Criterios de aceptación.**

- [ ] M-02 baja al menos 6 kB gzip frente a la línea base. La fase 1 lo mide; lo verifica como criterio la fase 3
      (cuando también se ha cambiado `manualChunks`).
- [ ] El build de producción no contiene ninguna cadena exclusiva del demo (por ejemplo la clave
      `coverscape.demo.v1`).
- [ ] La portada no precarga iconos que no usa (informe del visualizer en evidencias).
- [ ] El demo funciona igual (suite e2e en verde).

#### REQ-09 · Shell más ligero: Splash, barras y fondo [C-07, C-08, R-06, C-11]

**Descripción.**

- `src/components/AppShell.tsx` monta siempre `SideRail` (escritorio) y `MobileBar` (móvil) y oculta uno por CSS. En
  el móvil se renderizan igualmente los enlaces, los clips fijados, `InstallAppButton`, `WhoButton`, `useQuickClips`
  y un `motion.span layoutId="rail-active"` que mide layout en cada navegación sobre un elemento invisible.
- La Splash (`App.tsx`, `Splash`) anima con `motion` (JS, en cada fotograma) un sello que lleva el filtro SVG
  `#ink-rough` (`feTurbulence` + `feDisplacementMap`), justo mientras el hilo principal analiza y arranca el JS. Se ve
  en el arranque y en cada `Suspense` de ruta perezosa.
- `src/components/Backdrop.tsx` es un `div` `fixed inset-0`: en el navegador, al aparecer y desaparecer la barra de
  direcciones cambia su alto y se rasteriza de nuevo a pantalla completa.

**Comportamiento esperado.**

- `AppShell` monta **solo** la barra que corresponde al ancho (con el `useDesktop()` de `features/nav/QuickNav.tsx`,
  que hoy es una función privada: se exporta o se mueve a `src/lib/useDesktop.ts`; `QuickNav.tsx` entra en la reserva
  de la fase 3 solo para eso), conservando exactamente las mismas clases y el mismo resultado visual en cada ancho.
- La animación de la Splash pasa a `@keyframes` CSS con **los mismos valores**: `transform: scale(1) rotate(-4deg)` →
  `scale(0.92) rotate(-8deg)` → `scale(1) rotate(-4deg)`, 1,4 s, `cubic-bezier(0.42, 0, 0.58, 1)` (equivale al
  `easeInOut` de motion), infinita, con `will-change: transform` en el envoltorio. Con movimiento reducido queda
  quieta, igual que hoy (regla global de `index.css`).
- `Backdrop`: `top: 0; height: 100lvh` (manteniendo `inset-0` como reserva donde `lvh` no exista). El área visible es
  la misma.

**Decisiones.** La Splash pasa a CSS en vez de optimizar el filtro. *Motivo:* el filtro forma parte del aspecto del
sello y no se puede quitar; lo que sí se puede quitar es el trabajo de JS por fotograma.

**Casos límite.**

- Girar el móvil o redimensionar la ventana cruzando `lg` (64rem): debe aparecer la otra barra igual que hoy, sin
  animaciones de `layoutId` extra al montar.
- La primera navegación tras montar la barra: la píldora `rail-active` no debe animar desde una posición incorrecta.

**Interacción.** La división de `AppShell.tsx` en `components/shell/` (REQ-27) se hace en la misma fase y antes de
este cambio. El foco en el `h1` tras navegar, el enlace para saltar al contenido, `SavingReporter` y `guardNav` siguen
igual. La Splash también es el `fallback` de los `Suspense` de ruta.

**Criterios de aceptación.**

- [ ] Fotogramas de la Splash idénticos (3.4) a 0, 350, 700, 1050 y 1400 ms.
- [ ] Capturas del shell idénticas a 375, 768 y 1440 px y tras cruzar `lg` en ambos sentidos.
- [ ] M-08: en un cambio de ruta en móvil, `SideRail` no hace commits (no está montado).
- [ ] M-10: en S-01, menos eventos `Paint` durante la Splash que en la línea base.

#### REQ-10 · Miniatura principal anticipada en visitas repetidas, y objetivo del bloque B [C-09]

**Descripción.** En visitas repetidas, aunque haya instantánea (`lib/snapshot.ts`), la `<img>` que marca el LCP no se
descubre hasta que se descargan y ejecutan ~300 kB de JS.

**Comportamiento esperado.**

- `LibraryPage` guarda en `localStorage` (`oneshoot.lcpThumb.v1`) la URL de la miniatura destacada que pintó (solo si
  es una URL http(s), nunca un `data:`).
- Un script mínimo **externo** cargado desde `index.html` antes del módulo principal lee esa URL e inserta
  `<link rel="preload" as="image" fetchpriority="high">`. No se usa script en línea (la CSP Report-Only no tiene
  hashes).
- La miniatura destacada se sigue pintando exactamente igual.

**Decisiones.** Script externo y no en línea. *Motivo:* la CSP no tiene hashes y añadirlos complica cada despliegue.

**Casos límite.** URL caducada o vídeo archivado: solo se desperdicia una descarga; nada visible. localStorage
bloqueado: el script no hace nada y no lanza errores.

**Interacción.** Toca `LibraryPage.tsx`, que la fase 2 modifica por los pósteres: se hace cuando la fase 2 haya
cerrado. Si la miniatura destacada es un póster de vídeo subido (`data:` o IndexedDB), no se precarga nada.

**Objetivo conjunto del bloque B (REQ-04 a REQ-10, REQ-13 y, después, REQ-11 y REQ-12):**

- [ ] M-01 ≤ 85 % de la línea base al cerrar la fase 3; ≤ 75 % al cerrar la fase 10 (con REQ-11 y REQ-12).
- [ ] M-03 (LCP frío) ≤ 80 % de la línea base al cerrar la fase 3.
- [ ] M-04 (LCP repetido) ≤ 80 % de la línea base al cerrar la fase 3.

**Criterios de aceptación de REQ-10.**

- [ ] En S-01 repetido, la miniatura del LCP empieza a descargarse antes de que termine de ejecutarse el JS de entrada
      (traza en evidencias).

#### REQ-11 · Cliente de Supabase ligero [C-12, D-14, P7]

**Descripción.** `@supabase/supabase-js` entero (~58 kB gzip en el camino crítico) incluye auth, realtime y functions.
La app no usa realtime ni functions; de auth solo lee una sesión antigua y ofrece cerrarla. Además, cada petición REST
pasa por `auth.getSession()` (bloqueo de `navigator.locks` y lectura de localStorage).

**Comportamiento esperado.**

- Las peticiones de datos usan `@supabase/postgrest-js` directamente, con las cabeceras `apikey` y `Authorization`.
- Storage (`createSignedUrl(s)`, subidas con `upload`) usa `@supabase/storage-js` cargado con `import()` solo cuando
  hace falta. La subida con progreso por XHR (`uploadWithProgress`) sigue igual.
- **Sesiones antiguas (época con login):** `AuthProvider` lee la sesión guardada de la clave de localStorage que usa
  hoy supabase-js (`sb-<ref>-auth-token`) y expone el mismo `user` que hoy, de modo que el bloque de usuario de
  `AppShell` se ve igual para quien lo veía. `signOut` borra esa clave y deja `user` en `null`, como hoy.
- Cabecera `Authorization`: el JWT de la sesión antigua **solo** si existe y no ha caducado; si no, la clave
  publicable (rol `anon`). No se refresca ningún token.
- La rama demo (sesión falsa) se comporta igual que hoy.
- `friendlyError` reconoce los mismos errores (los mensajes de PostgREST y Storage tienen la misma forma).

**Decisiones.**

- Las políticas RLS dan los mismos permisos a `anon` y a `authenticated` dentro del grupo (ver `docs/ARCHITECTURE.md`),
  así que dejar de refrescar tokens caducados no cambia qué datos ve ni qué puede hacer nadie. *Motivo:* refrescar
  exigiría incluir auth-js entero.
- Antes de implementar, comprueba con `grep` que ninguna pantalla muestra datos que dependan de `created_by` o de
  `auth.uid()`. Si alguna lo hace, documenta el impacto en `PROGRESO.md` y conserva el JWT mientras sea válido (ya
  está en el comportamiento esperado).
- Este REQ va en su propia fase (fase 8). *Motivo:* riesgo medio y afecta a todas las peticiones.

**Casos límite.** Sesión antigua caducada; clave de localStorage corrupta (se ignora sin errores); sin localStorage
(navegación privada); error de red en storage-js cargado bajo demanda (mismo mensaje que hoy: «Sin conexión. Revisa tu
red.»).

**Interacción.** Afecta a todo `lib/backend/**` (fases 1 y 2 ya cerradas) y a la memoria de URLs firmadas de REQ-15,
que debe seguir funcionando con storage-js cargado bajo demanda. `getProfile` (demo) y `CrewProvider` siguen igual.

**Criterios de aceptación.**

- [ ] El chunk de Supabase del camino crítico baja al menos 25 kB gzip (M-01).
- [ ] Tests unitarios del nuevo cliente: cabeceras con y sin sesión, sesión caducada, `signOut`, errores.
- [ ] Suite e2e completa en verde en el demo, y el escenario S-01/S-02 con Supabase simulado en verde.
- [ ] Captura del bloque de usuario con una sesión antigua simulada, idéntica a la línea base (generar esa captura
      de referencia sobre el commit de partida si no existía).

#### REQ-12 · `motion` con carga perezosa de funciones (condicional) [C-13, P13]

**Descripción.** `motion` completo (~46 kB gzip) va en el camino crítico. Se usa en 76 archivos, con `layoutId` en 27
sitios, `Reorder` y `drag`.

**Comportamiento esperado.**

- `LazyMotion` en `App.tsx` con `domAnimation` cargado **de forma síncrona** (para que las animaciones de entrada,
  salida, `whileTap` y `animate` funcionen desde el primer fotograma) y `domMax` (layout, `layoutId`, `drag`,
  `Reorder`) cargado con `import()` en cuanto la app esté en reposo.
- Todos los `motion.*` pasan a `m.*` y se activa `strict` en `LazyMotion` para detectar los que falten.
- Los componentes que usan `Reorder` o `drag` deben estar disponibles igual que hoy cuando el usuario puede
  interactuar con ellos.

**Decisión: REQ condicional.** Se implementa y se mide. **Solo se conserva si** la comparación visual (3.4) de todas
las pantallas y de todos los fotogramas de animación no muestra diferencias, **y** la suite e2e pasa, **y** M-01 baja
al menos 10 kB gzip. Si no se cumplen las tres cosas, se revierte entero y se documenta en `PROGRESO.md` como
«Descartado (motivo)» con las mediciones. *Motivo:* el ahorro es real, pero el riesgo de que una animación de layout no
se ejecute la primera vez es alto.

**Casos límite.** Una animación `layoutId` que ocurre antes de que llegue `domMax` (por ejemplo, navegar muy rápido
tras el arranque). Debe comprobarse con la red y la CPU del perfil 3.1.

**Interacción.** Toca los 76 archivos que usan `motion`, por eso va la última y sola. Los presets de
`lib/motion.ts` y `MotionConfig reducedMotion="user"` no cambian.

**Criterios de aceptación.**

- [ ] O bien: conservado con las tres condiciones cumplidas y evidencias; o bien: descartado con las mediciones y las
      diferencias encontradas.

#### REQ-13 · Caché del service worker y CSS [C-10, C-15]

**Descripción.**

- Las miniaturas de `i.ytimg.com` usan `StaleWhileRevalidate`: en cada visita, cada miniatura visible genera una
  petición en segundo plano, que vuelve como respuesta opaca (cada una cuenta varios MB de cuota).
- Tailwind v4 detecta solo las fuentes de clases desde la raíz de `apps/web`; puede estar escaneando `e2e/`, `api/`,
  tests y documentos y generando utilidades sin uso (el CSS bloquea el render).

**Comportamiento esperado.**

- Miniaturas (**condicional**): comprobar primero si `i.ytimg.com` responde con `Access-Control-Allow-Origin`. Si
  responde, añadir `crossOrigin="anonymous"` a las `<img>` de miniaturas de YouTube y cambiar la estrategia a
  `CacheFirst` con 14 días y `cacheableResponse: { statuses: [200] }`. Si no responde con CORS, se deja como está y se
  documenta.
- CSS: `@import 'tailwindcss' source('./')` (o `@source not` para `e2e`, `api` y tests) de modo que solo se escanee
  `src`. Se compara el CSS generado antes y después con `diff` de selectores: solo pueden desaparecer clases que no
  salen de `src`.

**Decisiones.** El cambio de miniaturas es condicional a la prueba de CORS. *Motivo:* si `i.ytimg.com` no envía
cabeceras CORS, `crossOrigin` haría que las imágenes no se cargaran (cambio visible).

**Casos límite.** Cuota de almacenamiento llena: `purgeOnQuotaError` se mantiene. Miniatura que falla con CORS en un
navegador concreto: si ocurre en alguno, se descarta el cambio entero.

**Interacción.** Comparte `vite.config.ts` con REQ-04, REQ-07 y REQ-08 (misma fase y mismo dueño).

**Criterios de aceptación.**

- [ ] Miniaturas: decisión documentada con la prueba de CORS; si se aplica, en una segunda visita no hay peticiones de
      red a `i.ytimg.com` para miniaturas ya vistas, y las capturas son idénticas.
- [ ] CSS: el `diff` de selectores está en evidencias y el tamaño del CSS no aumenta.
- [ ] Comparación visual sin diferencias.

---

### Bloque C · Datos y red

#### REQ-14 · Pósteres de vídeos subidos fuera de las listas [D-01, P6]

**Descripción.** `videos.thumbnail_url` guarda para los vídeos subidos un póster JPEG en base64 (`data:`, hasta 150 000
caracteres; en la práctica 20–47 kB por vídeo). La consulta de la biblioteca (`LIBRARY_COLUMNS`) lo incluye, igual que
las uniones de bolsas (`BAG_ITEM_SELECT`) y de eventos (`EVENT_SONG_SELECT`) y `getVideo` (`select('*')`). Con 30
vídeos subidos, la lista pesa 0,6–1,4 MB y se descarga otra vez al volver a la app pasados 5 min. Además,
`lib/snapshot.ts` quita los pósteres, así que en un arranque repetido las tarjetas salen primero sin póster.

**Comportamiento esperado.**

1. **Migración nueva** (`supabase/migrations/<timestamp>_video_list_columns.sql`) con tres columnas generadas en
   `public.videos`:
   - `poster_inline boolean generated always as (coalesce(thumbnail_url like 'data:%', false)) stored`;
   - `list_thumbnail_url text generated always as (case when thumbnail_url like 'data:%' then null else thumbnail_url
     end) stored`;
   - `poster_rev text generated always as (case when thumbnail_url like 'data:%' then md5(thumbnail_url) end) stored`.
   Postgres las rellena solas para las filas existentes: no hay que migrar datos. No se dan permisos de `update` sobre
   ellas (las columnas generadas no se pueden escribir). Test SQL en `supabase/tests/video_list_columns_checks.sql`
   (como `anon`, PASS/FAIL, ROLLBACK): valores para YouTube, subido con póster, subido sin póster; que `anon` puede
   leerlas y no escribirlas; que la RLS sigue ocultando lo archivado.
2. Las listas (biblioteca, bolsas, eventos, RPD) piden `thumbnail_url:list_thumbnail_url, poster_inline, poster_rev`
   en lugar de `thumbnail_url`.
3. Nueva consulta de pósteres: clave `['video-posters', crewId]`, `select id, poster_rev, thumbnail_url` con
   `poster_inline = true`, `staleTime: Infinity`. Cada póster se guarda en IndexedDB (`idb-keyval`, clave
   `oneshoot.poster.v1:<id>:<poster_rev>`) y en siguientes cargas solo se piden los que faltan (`.in('id', faltan)`).
   Se lanza en paralelo a la lista, no detrás.
4. `VideoCard`, las filas de bolsas y de eventos y `snapshot.ts` combinan el póster por `id`. El snapshot puede leer
   los pósteres de IndexedDB para el arranque repetido.
5. `getVideo` (estudio) pide columnas explícitas; el póster se combina igual que en la lista cuando se necesita.
6. El demo (`*.demo.ts`) imita exactamente el mismo contrato.
7. `packages/shared/src/database.types.ts` se actualiza a mano con las tres columnas (formato idéntico al generado:
   en `Row` como tipos de solo lectura y sin entradas en `Insert`/`Update`).

**Decisiones.**

- Columnas generadas en vez de una tabla nueva de pósteres. *Motivo:* no hay que migrar datos ni cambiar cómo se
  escribe el póster al subir.
- Se permite que en el arranque repetido los pósteres aparezcan antes que hoy (mismo aspecto final).

**Casos límite.**

- Póster que cambia (otro archivo vinculado): `poster_rev` cambia y se descarga el nuevo; el antiguo de IndexedDB se
  limpia en la misma pasada.
- Vídeo archivado: desaparece de la lista y su póster de IndexedDB se limpia como ya hace `purgeLocalVideos`.
- Cliente nuevo con base de datos sin migrar: fallaría la consulta. Por eso el despliegue exige aplicar la migración
  antes (apartado 12, paso 5). No hace falta compatibilidad hacia atrás.
- IndexedDB bloqueado o lleno: se piden todos los pósteres a la red, sin errores visibles.
- `patchListedVideo` (`data/videos.ts`) y las escrituras optimistas deben seguir copiando el póster correcto.

**Interacción.** Cambia `LIBRARY_COLUMNS` igual que REQ-16 (misma fase). Las pantallas de bolsas, eventos y RPD
consumen la misma lista. REQ-10 no precarga pósteres. `snapshot.ts` sigue sin escribir nada en la base de datos.

**Criterios de aceptación.**

- [ ] M-06 ≤ 10 % de la línea base con los datos de prueba (30 vídeos, 10 subidos con póster).
- [ ] En una segunda carga con los pósteres en IndexedDB, la consulta de pósteres no descarga ninguno.
- [ ] `pnpm db:test` pasa con el test nuevo.
- [ ] Capturas de la biblioteca, bolsas, eventos y RPD idénticas.

#### REQ-15 · URLs firmadas reutilizadas y en paralelo [D-02, D-03]

**Descripción.** Cada vez que se abre el estudio de un vídeo subido, `features/studio/fileSource.ts` lee primero
IndexedDB y después pide una URL firmada nueva (POST `/storage/v1/object/sign`). Como el token cambia, la URL cambia, y
la caché HTTP no puede reutilizar el vídeo ya descargado (hasta 50 MB). Lo mismo pasa en `rpd/useClipSource.ts` y con
las tomas y las pistas de voz. Además, las subidas usan `cache-control` de 3600 s aunque los archivos nunca se
sobrescriben.

**Comportamiento esperado.**

- Memoria de URLs firmadas en módulo (`Map<ruta, { url, caduca }>`) en las funciones de firma de `lib/backend/`
  (vídeos, tomas, stems): se reutiliza la URL mientras le queden más de 30 min de validez (las firmas son de 6 h). Se
  invalida la entrada si la descarga devuelve error.
- `fileSource.ts` y `useClipSource.ts` lanzan la firma **en paralelo** a la lectura de IndexedDB (`Promise.all`) y
  descartan la firma si hay copia local.
- Las pistas de voz piden sus dos URLs en una sola petición (`createSignedUrls`).
- Las subidas nuevas (las tres llamadas `.upload(` y el XHR de `uploadWithProgress`) usan
  `cacheControl: '31536000'`. Los archivos ya subidos no se tocan.

**Decisiones.** Memoria solo en el módulo (no persistente). *Motivo:* las URLs firmadas dan acceso a archivos privados
y no deben guardarse en disco; además caducan.

**Casos límite.** La pestaña queda abierta más de 6 h: la memoria caduca y se firma de nuevo. Dos aperturas a la vez de
la misma ruta comparten la misma promesa (sin dos firmas). Error de firma: mismo mensaje que hoy.

**Interacción.** La usan REQ-16 (precalentar al tocar), REQ-19 (ronda en lote) y la reproducción de tomas y pistas de
voz. REQ-11 debe conservarla al cambiar el cliente de storage.

**Criterios de aceptación.**

- [ ] Abrir dos veces el mismo vídeo subido en la misma sesión hace una sola firma (M-07) y la segunda descarga sale de
      la caché del navegador (Playwright: `response.fromServiceWorker()` o tamaño transferido 0, según el caso).
- [ ] Tests unitarios de la memoria de firmas (reutilizar, caducar, invalidar, compartir promesa).

#### REQ-16 · Abrir un vídeo subido sin cascada [D-04, P3]

**Descripción.** Para un vídeo subido o vinculado, la apertura es `getVideo` (`select *`, con póster) → IndexedDB →
firma → descarga, todo en serie. La instantánea (`videoFromLibraryRow`) solo sirve para YouTube sin archivo, porque la
fila de la lista no trae las columnas del archivo.

**Comportamiento esperado.**

- `LIBRARY_COLUMNS` incluye además `storage_path, file_size, file_offset_seconds, file_duration_seconds, updated_at`
  (unos 150 bytes por fila).
- `videoFromLibraryRow` devuelve la fila completa para todos los vídeos, de modo que el estudio puede empezar con el
  marcador de posición también para los subidos.
- El precalentamiento al tocar una tarjeta (`VideoCard`, `warm()` en `pointerdown`) lanza también la firma de REQ-15
  cuando hay `storage_path`.
- `getVideo` pide columnas explícitas.
- Se mantiene la regla P3: **nada escribe en la base de datos a partir del marcador de posición**. Revisa
  `LinkFilePanel` (`file_locked`) y `rowRef` en `StudioPage`.

**Decisiones.** Se añaden columnas pequeñas a la lista en vez de una consulta extra. *Motivo:* unos 150 bytes por
fila eliminan un viaje de red completo al abrir cada vídeo subido.

**Casos límite.** La fila de la lista está desactualizada (otro móvil vinculó un archivo hace un momento): la consulta
completa de `getVideo` llega después y corrige el estado igual que hoy. Vídeo archivado entre la lista y la apertura:
mismo comportamiento que hoy.

**Interacción.** Cambia `LIBRARY_COLUMNS` igual que REQ-14 (misma fase). Toca `StudioPage.tsx`, que después divide y
optimiza la fase 4.

**Criterios de aceptación.**

- [ ] S-02 con un vídeo subido: M-05 ≤ 75 % de la línea base.
- [ ] Test e2e: vincular un archivo desde el estudio abierto con el marcador de posición sigue funcionando igual, y el
      error `file_locked` se muestra igual.

#### REQ-17 · Notas sin dibujos en la lista [D-05, H2]

**Descripción.** `listNotes` hace `select('*')`, que incluye `sketch` (dibujo de la nota de toma, hasta 60 000
caracteres en base64). El estudio solo necesita los puntos de la línea de tiempo; 20 notas con dibujo pueden pesar
1,2 MB, y la tarjeta las precalienta al tocar.

**Comportamiento esperado.**

1. **Migración nueva** con la columna generada `notes.has_sketch boolean generated always as (sketch is not null)
   stored` y su test SQL.
2. `listNotes` pide columnas explícitas sin `sketch` (con `has_sketch`).
3. Consulta aparte `['note-sketches', videoId]` (`select id, sketch` de las notas con dibujo), lanzada en reposo justo
   después de la lista y combinada por `id` antes de que se pueda abrir una nota. `NoteDialog`, `TakeNoteCard` y
   `ReviewScreen` leen el dibujo de esa combinación.
4. Las escrituras optimistas de `data/notes.ts` conservan `sketch` en la caché.
5. Demo con el mismo contrato; `database.types.ts` actualizado.

**Decisiones.** Columna generada `has_sketch` en vez de comprobar en el cliente. *Motivo:* el cliente necesita saber
qué notas tienen dibujo sin descargarlo.

**Casos límite.** El usuario abre una nota con dibujo antes de que llegue su dibujo (hoy no puede pasar, porque llega
con la lista): la apertura espera a la consulta de dibujos **sin mostrar ningún indicador nuevo** y se abre ya con el
dibujo. Como la consulta se lanza justo después de la lista, la espera debe ser prácticamente nula; se mide en el test.
Nota sin dibujo: no se pide nada.

**Interacción.** Las notas se usan en el estudio (puntos de la ola), en el repaso (notas de toma) y en el
precalentamiento de `VideoCard`. Los archivos del repaso que leen el dibujo se tocan solo en esa lectura; su división y
optimización son de la fase 6.

**Criterios de aceptación.**

- [ ] Bytes de `GET /notes` con los datos de prueba ≤ 15 % de la línea base.
- [ ] Capturas del estudio, del repaso y de una nota de toma con dibujo idénticas.
- [ ] `pnpm db:test` pasa.

#### REQ-18 · Caché de consultas y cascadas de pantallas [D-06, D-07]

**Descripción.**

- El `QueryClient` (`App.tsx`) usa `staleTime` de 5 min sin `gcTime` propio: una pantalla que pasa más de 5 min sin
  montarse pierde su caché (por ejemplo, la biblioteca mientras se ensaya en el estudio), y vuelve con el estado de
  carga y la petición completa.
- Bolsa, evento y pista hacen dos viajes en serie al entrar por enlace o recargar: el padre pide la entidad y solo
  después el hijo pide sus elementos.

**Comportamiento esperado.**

- `gcTime` por defecto de 60 min; `gcTime` de 6 h en las URLs de las pistas de voz (`stemKeys.sources`). `staleTime`,
  `refetchOnWindowFocus` y `retry` no cambian.
- En `BagPage`, `EventPage` y `TrackPage`, el componente padre llama ya a los hooks de elementos (`useBagItems`,
  `useBagDraws`, `useEventSongs`, `useTrackItems`) con el id de la URL y la misma clave, para que las peticiones vayan
  en paralelo.
- `useTrack` usa `initialData` desde la lista de pistas (como ya hace `useEvent`).
- Precarga en `pointerdown` de las tarjetas de `BagsPage`, `EventsPage` y la lista de pistas (como `VideoCard`).

**Decisiones.** El `gcTime` por defecto se cambia en la fase 3 (dueña de `App.tsx`). El `gcTime` de 6 h de las
pistas de voz (`data/stems.ts`) y el resto de este REQ van en la fase 2.

**Casos límite.** Memoria: con `gcTime` de 60 min la caché crece algo; no se guardan URLs firmadas ni blobs en ella.
Enlace a una bolsa, pista o evento archivado: mismo estado de error o vacío que hoy.

**Interacción.** `afterArchive.ts` sigue invalidando las mismas claves. Las precargas al tocar no deben lanzarse al
desplazar la lista (solo en `pointerdown` real sobre la tarjeta, como `VideoCard`).

**Criterios de aceptación.**

- [ ] M-07: al entrar por enlace en `/bolsas/:id`, `/eventos/:id` y `/rpd/pista/:id` no hay un segundo nivel en serie.
- [ ] Recorrido biblioteca → estudio (10 min con reloj simulado) → biblioteca: la biblioteca se pinta con datos sin
      estado de carga.

#### REQ-19 · Consultas agrupadas [D-08, D-09, D-11, D-12, D-16]

**Descripción y comportamiento esperado, punto por punto:**

1. **«Añadir a bolsa»** (`data/bags.ts` `useBagsItems`, `AddToBagDialog.tsx`): hoy lanza una consulta completa por
   cada bolsa solo para saber en cuáles está ya el elemento. Pasa a **una** consulta
   `bag_items select bag_id` filtrada por `video_id`, `clip_id` o `wish_id`. Las mutaciones de bolsas invalidan
   también esa clave nueva.
2. **Ronda de Random Play Dance** (`RpdPlayPage.tsx`, `useClipSource.ts`): hoy hace un `getVideo` y una firma por
   canción a lo largo de la ronda. Al empezar la ronda, una sola petición
   `videos.select(columnas reproducibles sin póster).in('id', ids)` que siembra una clave propia
   `['video-play', id]`, más `createSignedUrls` en lote que alimenta la memoria de REQ-15.
3. **`linkYoutubeSongs`** (`lib/backend`): las operaciones por canción se lanzan con `Promise.all` manteniendo el
   tratamiento del error `23505`.
4. **Votaciones:**
   - `WishesPage` hace dos consultas solapadas de votos (cerradas y todas). Pasa a una sola consulta y los
     subconjuntos se derivan con `select`.
   - El sondeo de 8 s de `PollPage` (`data/wishes.ts`) descarga todas las papeletas. Pasa a consultar primero una firma
     ligera y solo descargar las papeletas si cambia. **Migración nueva:** función
     `public.poll_votes_signature(p_poll uuid) returns text`, `security invoker`, `stable`, que devuelve
     `md5(string_agg(option_id || ':' || member_id || ':' || coalesce(rank::text, ''), ',' order by option_id,
     member_id))` de los votos vivos; `revoke all from public; grant execute to anon, authenticated`. Test SQL que
     compruebe que cambia al votar, al cambiar el voto y al retirarlo, y que respeta la RLS.
5. **Funciones de YouTube** (`api/youtube-search.ts`, `api/youtube-meta.ts`): añadir `max-age=3600` (búsqueda) y
   `max-age=86400` (metadatos) a la cabecera `Cache-Control` sin quitar `s-maxage` ni `stale-while-revalidate`.
   El cliente (`youTubePickerRules.ts`) normaliza la consulta exactamente igual que `canonicalQuery` del servidor
   (trim, espacios simples, minúsculas) para evitar el redirect 308. Test unitario que compare ambas funciones con
   las mismas entradas.

**Decisiones.** Firma `md5` de los votos vivos en vez de recuento y fecha. *Motivo:* cambiar el voto reactiva filas
archivadas y no siempre cambia el número ni la fecha, así que un recuento no detectaría el cambio.

**Casos límite.** Votación cerrada mientras se sondea: la firma cambia y la vista se actualiza igual que hoy. Bolsa
borrada entre consultas: se ignora como hoy. La firma no detecta el cierre de la votación (no es un voto): el sondeo
de la propia votación (`polls`) sigue como hoy.

**Interacción.** El punto 2 usa la memoria de firmas de REQ-15. El punto 4 añade una migración (en serie con las de
REQ-14, REQ-17 y REQ-20). El demo implementa la misma firma.

**Criterios de aceptación.**

- [ ] M-07: «Añadir a bolsa» con 3 bolsas hace 1 petición de comprobación; una ronda de 15 canciones hace 1 petición de
      vídeos y 1 de firmas.
- [ ] Con `PollPage` abierta 2 min sin votos nuevos, los bytes descargados por el sondeo son ≤ 10 % de la línea base.
- [ ] `pnpm db:test` pasa; tests unitarios de la normalización.

#### REQ-20 · Reordenaciones atómicas e índices [D-10, D-17, D-13]

**Descripción.**

- Reordenar una pista o el repertorio de un evento envía una petición por elemento (30 elementos = 30 PATCH en
  paralelo, no atómicos).
- Faltan algunos índices para las consultas reales.
- `storage_usage()` recorre `storage.objects` y se vuelve a pedir cada vez que se monta el panel de tomas
  (`staleTime` 60 s).

**Comportamiento esperado.**

- **Migración nueva** con dos RPC: `public.set_track_positions(p_track uuid, p_ids uuid[])` y
  `public.set_event_song_positions(p_event uuid, p_ids uuid[])`, `security invoker`, que comprueban que todos los ids
  pertenecen a la pista o al evento (vivos) y actualizan `position` con
  `update … from unnest(p_ids) with ordinality`. Si algún id no pertenece, lanzan un error con el patrón de nombres
  del repo (`*_invalid`). `grant execute to anon, authenticated`. El cliente usa estas RPC en lugar de los N updates.
- Índices nuevos (con `create index if not exists`, **sin** `concurrently`, porque las migraciones se aplican en una
  transacción): `bag_items (youtube_id) where archived_at is null and video_id is null`;
  `polls (crew_id, created_at desc)`; `tracks (crew_id, updated_at desc)`; `clips (crew_id, created_at, id)`. Se
  comprueba con `explain` en PGlite que las consultas reales los usan donde corresponda.
- `storage_usage`: `staleTime` de 10 min en el cliente; las mutaciones que suben o comparten ya lo invalidan (se
  verifica). Este punto se hace en la fase 6 (dueña de `data/takes.ts`).

**Decisiones.** RPC `security invoker` (no `definer`). *Motivo:* así la RLS sigue decidiendo qué filas se pueden tocar,
como en las actualizaciones directas actuales.

**Casos límite.** Reordenar a la vez desde dos móviles: gana el último, como hoy, pero sin estados intermedios
mezclados. La demo implementa las mismas reglas. Lista vacía o con ids repetidos: error `*_invalid` sin cambios.

**Interacción.** La actualización optimista de la reordenación en el cliente (`data/tracks.ts`, `data/events.ts`)
sigue igual; solo cambia la llamada.

**Criterios de aceptación.**

- [ ] Soltar un elemento al reordenar hace 1 petición (M-07).
- [ ] Test SQL de las RPC (orden correcto, id ajeno rechazado, RLS respetada) y `pnpm db:test` en verde.

---

### Bloque D · Fluidez (fotogramas y respuesta al toque)

#### REQ-21 · Estudio fluido [R-01, R-02, R-03, R-04, R-14, R-15]

**Descripción y comportamiento esperado, punto por punto:**

1. **Marea de la ola** (`features/studio/Timeline.tsx`): hoy `tideRef.setAttribute('width', …)` cambia el `<rect>`
   del `clipPath` en cada fotograma mientras suena, y se rasterizan de nuevo los trazados de la ola en todo el ancho.
   Pasa a: la capa «reproducida» en su propio SVG (mismo `viewBox`, mismo `preserveAspectRatio="none"`), dentro de un
   `div` con `overflow: hidden` y `will-change: transform` movido con `translate3d((f - 1) * 100%)`, y el SVG interior
   con la contratraslación `translate3d((1 - f) * 100%)` y el ancho exacto del raíl. Todo se escribe desde el mismo
   `paint()` existente.
2. **Pellizco de zoom** (`StudioPage.tsx` MediaStage, `player/ZoomLayer.tsx`, `ZoomControls.tsx`): hoy cada
   `pointermove` lee `getBoundingClientRect` y llama a `setZoom`, re-renderizando `PlayerZoomLayer`, `ZoomControls`
   y `ZoomBadge` (dos commits por fotograma con dos dedos). Pasa a:
   - leer el rect una vez al empezar el gesto (invalidado con `resize`/`scroll`);
   - agrupar los punteros y hacer **un** `setZoom` por fotograma (rAF);
   - durante el gesto (`live`), `ZoomLayer` aplica `x`, `y` y `scale` con `MotionValue`s (`jump()`) desde una
     suscripción al store, sin re-render; al soltar, la animación con el preset `soft` arranca desde el valor actual,
     igual que hoy.
3. **Arrastre de A–B y selección en la franja de clips** (`Timeline.tsx`): hoy cada `pointermove` llama a `setRange` o
   `scrubTo` y re-renderiza toda la línea de tiempo, los botones de bucle de `Transport` y `SaveClipDialog` (cerrado).
   Pasa a: `move()` agrupado en rAF, con vaciado obligatorio de lo pendiente en `pointerup` y `pointercancel`;
   `ClipLane` y `NoteDots` extraídos con `memo`; `SaveClipDialog` lee `loop`, `rate` y `mirrored` solo cuando está
   abierto.
4. **Lista de clips** (`ClipList.tsx`): `ClipRow` con `memo` y *callbacks* estables, para que solo midan layout las
   filas que cambian. `layout` y `layoutId="clip-active"` se mantienen.
5. **Sincronizar archivo vinculado** (`LinkFilePanel.tsx`, `SyncStep`): los tiempos que cambian varias veces por
   segundo pasan a componentes pequeños (`YtReadout`, `FileReadout`), sin re-renderizar el paso entero ni su
   `<video>`.
6. **Botones con `drop-shadow` que escalan** (Play en `Transport.tsx`, `PinnedClips.tsx`, `VideoCard.tsx`,
   `components/shell/**` —antes `AppShell.tsx`—, `StudioPage.tsx`): `will-change: transform` en esos botones para que
   el filtro no se rasterice en cada fotograma del muelle. Los de `PinnedClips.tsx` y `VideoCard.tsx` los aplica la
   fase 5 (dueña de `library/**`); el resto, la fase 4.

**Decisiones.** Se elige la vía «capa en el compositor» (transform) en vez de reducir la calidad del dibujo. *Motivo:*
mismo aspecto con mucho menos pintado. La división de `StudioPage`, `Timeline`, `Transport` y `player/store.ts`
(REQ-27) se hace antes, como movimiento puro, para aislar los re-renders.

**Casos límite.** Pellizco que termina con un dedo levantado antes que otro; `pointercancel` del sistema; zoom
máximo y mínimo; espejo activo; giro del móvil a mitad de gesto; clip que aplica zoom al seleccionarse; teclado sobre
el vídeo; rueda con y sin tecla; vídeos que no son 16:9.

**Interacción.** El zoom del estudio se guarda en los clips (`zoom_scale/x/y`): los valores guardados deben ser los
mismos. El bucle A–B lo ejecuta `useLoopController`: agrupar en rAF el arrastre no debe cambiar el tramo aplicado. La
pantalla completa y el grabador (`covered`) siguen congelando el estudio igual.

**Criterios de aceptación.**

- [ ] S-03: M-10 (Paint por segundo) ≤ 30 % de la línea base; M-08: `Timeline` hace 0 commits en los 10 s del
      escenario, y los componentes que solo leen el tiempo (`TimeReadout` y similares) ≤ 10 commits por segundo.
- [ ] S-04: 0 commits de `PlayerZoomLayer` durante el gesto y ≤ 1 commit total por fotograma; M-09 p95 ≤ 20 ms.
- [ ] S-05: ≤ 1 commit de `Timeline` por fotograma y el valor final de A/B idéntico al de la línea base con la misma
      secuencia de punteros.
- [ ] Fotogramas de la ola, del zoom (al soltar) y de la píldora `clip-active` idénticos (3.4).
- [ ] Tests unitarios de la geometría que se extraiga (por ejemplo `timelineGeometry.ts`).

#### REQ-22 · Pantallas de grupo y diálogos fluidos [R-05, R-07, R-08, R-09, R-10, R-12, R-13, R-16, faroles de eventos]

**Descripción y comportamiento esperado, punto por punto:**

1. **Diálogos** (`components/ui/Dialog.tsx`): el panel `paper-raised` (4 sombras, hasta 80 px de desenfoque) anima `y`
   y `scale` con `soft` sin capa propia. Añadir `will-change: transform` **solo mientras anima**
   (`onAnimationStart`/`onAnimationComplete`) para que el texto quede nítido al terminar.
2. **Revelado de la votación** (`features/wishes/VoteReveal.tsx`): 100 `motion.rect` con 5 propiedades en
   *keyframes* más líneas y núcleos (~550 valores por fotograma) y el repintado del SVG de 360×200. Los pétalos pasan a
   `span` HTML dentro de una caja que reproduce **exactamente** el `preserveAspectRatio="xMidYMid slice"` del SVG
   (`aspect-ratio: 360/200`, `min-width: 100%`, `min-height: 100%`, centrada), animados con `@keyframes` o Web
   Animations sobre `transform` y `opacity`, con los mismos `times` y la curva `easeOutExpo` como
   `cubic-bezier(0.16, 1, 0.3, 1)`. Las estrellas y los núcleos pueden quedarse en el SVG. El sello `当選` lleva
   `will-change: transform` durante la entrada.
3. **Bombo de la bolsa** (`features/bags/BagDrawStage.tsx`): `motion.g` con `rotate` infinito en SVG. El bombo pasa a
   su propio `<svg>` (mismo `viewBox`) dentro de un `div` girado con `@keyframes` o Web Animations sobre `transform`,
   con `transform-origin: 50% 47.62%` (150,100 sobre 300×210). Mismo orden de capas (soporte detrás, bandeja delante) y
   mismas paradas en 22,5° y 202,5°.
4. **Colgantes de accesos rápidos** (`features/library/PinnedClips.tsx`, `lib/hanging.ts`): al desplazar se despiertan
   todos los colgantes (también los ocultos), cada uno escribe 6 `setAttribute('d')` por fotograma y `measure()` mezcla
   lecturas y escrituras en cada `scroll`. Pasa a: un `IntersectionObserver` (raíz = el contenedor desplazable,
   `rootMargin` de un elemento) para que solo los visibles respondan a `nudgeAll` y hagan *tick*; `measure()` agrupado
   en rAF; `will-change` solo en los visibles. Un colgante que entra en pantalla se despierta al entrar, de forma que
   no se vea quieto si debía balancearse.
5. **Cuenta previa de la ronda** (`features/rpd/RpdPlayPage.tsx`): `setNow` cada 80 ms re-renderiza toda la ronda.
   Pasa a un `setTimeout` al siguiente cambio de segundo y otro exacto al «go» (`leadStart + duración`), más `memo` en
   `RandomPlayScreen` y `RoundControls`. Sonidos (tic) y números idénticos en el tiempo.
6. **Barras de resultados** (`features/wishes/PollPage.tsx`): animan `width`. Pasan a `width: 100%` con
   `transform: translateX(-(100 - p)%)` dentro de la pista (que ya es `overflow-hidden rounded-full`), con el mismo
   muelle. El extremo redondo se mantiene.
7. **Tarjetas de deseos** (`WishesPage.tsx`): `memo(WishCard)` con props estables; `now` cambia solo cuando de verdad
   cierra una votación (temporizador a `msUntilClose`, como `PollView`), no cada 30 s.
8. **Menú Hanafuda** (`features/nav/NavHanafuda.tsx`): `elementFromPoint` en cada `pointermove` → agrupado en rAF y
   `setLifted` solo si cambia la carta.
9. **Faroles de la cuenta atrás** (`features/events/EventCountdown.tsx`, pendiente [2] de una revisión anterior):
   animar solo `transform`/`opacity` con el mismo resultado; si no es posible sin cambio visible, se deja y se
   documenta.

**Fuera de este REQ:** el `backdrop-blur` de «¿Preparados?» en la ronda (R-11) no se toca, porque mejorarlo cambia el
fundido.

**Decisiones.** Donde una animación de SVG cuesta mucho, se mueve la pieza a HTML o a su propio SVG animado con
`transform`, con las mismas curvas y duraciones. *Motivo:* el compositor la mueve sin repintar.

**Interacción.** `Dialog.tsx` lo usan todos los diálogos de la app: las capturas de todos los diálogos deben seguir
idénticas. Las cuentas atrás de eventos se ven también en el banner de la biblioteca (`NextEventBanner`).

**Casos límite.** Movimiento reducido (todas estas animaciones deben seguir respetándolo igual); reanudar una ronda
pausada en mitad de la cuenta previa (no debe aparecer un «3» extra ni un tic de más: ese era un fallo conocido de nota 5;
si el cambio lo corrige sin efecto visible distinto del previsto, se anota); `VoteReveal` a 360 y 1280 px; votación con
una sola opción.

**Criterios de aceptación.**

- [ ] S-07, S-08 y S-09: M-09 p95 ≤ 20 ms y M-10 ≤ 50 % de la línea base.
- [ ] S-06: M-09 p95 ≤ 20 ms.
- [ ] S-10: ≤ 2 commits de `RoundRunner` por segundo.
- [ ] Fotogramas de referencia idénticos (3.4) en diálogo, revelado, bombo, colgantes, cuenta previa, barras y
      Hanafuda.

#### REQ-23 · Grabador fluido y cámara antes [G-01, G-05, G-11, G-12, G-13a, G-14, G-15]

**Descripción y comportamiento esperado, punto por punto:**

1. **Pellizco de zoom de la cámara** (`features/record/useCamera.ts`, `camera.ts`): hoy `setZoom` en cada rAF llama a
   `track.applyConstraints` sin agrupar y a `setView`, que re-renderiza `RecordStudio` (2950 líneas) a 60–120 Hz.
   Pasa a:
   - como mucho **una** llamada a `applyConstraints` en vuelo; al terminar, se aplica solo el último valor pedido;
   - `zoom` y `crop` en un store pequeño (zustand o `MotionValue`) que leen solo el `<video>` (su `transform`) y el chip
     de zoom; `framePoint` y el ensayo leen `crop` del store;
   - el resto de `view` llega al componente raíz solo cuando cambia `digital`.
2. **`canRecordCanvas()`** (`compositor.ts`): crea un `<canvas>` en cada render. Pasa a memorizarse a nivel de módulo.
3. **Exposición** (`ImageControls.tsx` → `changeExposure`): mismo agrupamiento de `applyConstraints` que en el punto 1;
   el valor en vivo no re-renderiza el raíz.
4. **Nivel** (`settings/LevelIndicator.tsx`): `rotate.set()` en cada evento `deviceorientation` (100–200 Hz en algunos
   Android). Pasa a acumular y aplicar como mucho una vez por rAF. Mismo suavizado.
5. **Aplauso** (`clap/ClapArmView.tsx`, `clap/clapListener.ts`): `aria-valuenow` se escribe solo cuando cambia el
   entero (como `ReviewControls`). La lectura del analizador se puede limitar a una cada ≤ 33 ms (la ventana de 85 ms lo
   cubre); el detector puro de `packages/shared/src/clap.ts` no cambia y sus tests deben pasar igual.
6. **Paneles que solo aparecen tras un toque** (`InfoPanel`, `RecorderSettingsSheet/Fan`, `ClapArm`, `ImageControls`,
   `StartPicker` si no se ve al abrir): `lazy()` con `Suspense fallback={null}` y precarga en `pointerdown` de su botón,
   de modo que el chunk del grabador sea más pequeño y la cámara arranque antes. `ShareDialog` y `shareTake.ts` salen a
   su propio chunk: hoy `ShareDialog` está definido dentro de `TakesPanel.tsx` y `shareTake.ts` se importa de forma
   estática; tras la división (REQ-27) `ShareDialog.tsx` y `shareTake.ts` se cargan con `lazy()`/`import()`.
7. **Lecturas periódicas del panel «i»** (`InfoPanel.tsx`): `getCapabilities`/`getSettings` cada segundo → solo al
   cambiar `track`, `deviceId` o `zoom`. Las cifras mostradas no cambian.
8. **Unificar los bucles de `requestVideoFrameCallback`** del preview (compositor, `takePace.watch`, `countWatch`,
   `useLivePace`, ensayo) en una sola fuente (`FrameBus`) — **condicional**: solo se conserva si los tests de
   `pace`, `paceSkip` y `syncRules` pasan y las cifras `[oneshoot:pace]` con la cámara falsa son las mismas que en la
   línea base. Si no, se revierte y se documenta.

**Fuera de este REQ:** abrir la cámara en el `pointerdown` de «Grabar» antes de que cargue el chunk (cambia el momento
en que se pide el permiso).

**Decisiones.** Primero se divide `RecordStudio.tsx` (REQ-27, movimiento puro) y después se aíslan los re-renders.
*Motivo:* con el componente de 2950 líneas no se puede aislar nada sin riesgo. Las heurísticas de cámara, ritmo y
sincronía (umbrales, latencias) no se tocan.

**Interacción.** El zoom de la cámara afecta al lienzo del compositor y al punto de enfoque (`framePoint`). La
sincronía de la toma (`takeTiming`, `syncRules`, `takeSongZero`) no cambia: sus tests deben pasar igual. El estudio
debajo sigue congelado mientras el grabador lo tapa.

**Casos límite.** Cambiar de lente a mitad de pellizco; pellizco durante la grabación (canvas) y sin grabar (directo);
cámara que rechaza un valor de zoom; Safari sin `requestVideoFrameCallback` en algún contexto; panel lazy que falla al
cargar (sin conexión): el botón se comporta igual que hoy cuando falta un recurso (si hoy no existe ese caso, el panel
no se abre y no hay error en consola que rompa la grabación).

**Criterios de aceptación.**

- [ ] S-11: 0 commits del raíz del grabador durante el pellizco y ≤ 1 llamada a `applyConstraints` en vuelo (contador
      de depuración en el test).
- [ ] M-13: `oneshoot:camera-ready` desde el toque en «Grabar» ≤ 85 % de la línea base (perfil 3.1).
- [ ] El chunk del grabador baja al menos un 20 % (M-01 por chunk).
- [ ] Capturas y fotogramas del grabador (todos los paneles abiertos) idénticos.

#### REQ-24 · Guardar, compartir y abrir tomas sin esperas [G-02, G-06, G-07a]

**Descripción y comportamiento esperado, punto por punto:**

1. **«Guardar» tras grabar** (`RecordStudio.tsx`, `probeVideo`): hoy espera a que `probeVideo` recorra el WebM entero
   (`currentTime = 1e101`, hasta 4 s) aunque la duración ya se conoce (`secondsExact`). Pasa a
   `probeVideo(url, { needDuration })` que resuelve en `loadedmetadata` cuando no hace falta la duración. Los valores
   guardados son los mismos.
2. **Lecturas de OPFS** (`takeStore.ts`): `readPieces`, `listKeptTakes` y `listLeftovers` leen en serie (300 `getFile()`
   seguidos para una toma de 5 min). Pasan a leer en paralelo (`Promise.all`, con un límite de concurrencia razonable,
   por ejemplo 16). El formato en disco no cambia.
3. **Progreso de «Compartir con el grupo»** (`shareTake.ts`, `data/takes.ts`): hoy llama a `set({...})` en cada
   fotograma, re-renderizando `ShareDialog` a ~30 Hz mientras se recodifica en tiempo real, y eso quita fotogramas a la
   copia. Pasa a actualizar solo cuando cambia `Math.round(progreso * 100)` o la fase, o como mucho cada 400 ms (como
   `cloudCopyRun.ts`).

**Fuera de este REQ:** escribir la toma desde un worker con `createSyncAccessHandle` (G-07b): toca la recuperación de
tomas interrumpidas.

**Decisiones.** Concurrencia limitada (≈16) en las lecturas de OPFS. *Motivo:* sin límite, un móvil modesto podría
abrir cientos de lecturas a la vez y saturarse.

**Casos límite.** Toma sin OPFS (trozos en memoria, `memorySink`): mismo comportamiento. WebM sin metadatos de tamaño
(`videoWidth` 0): `probeVideo` espera como hoy. Compartir cancelado o con error a mitad: mismo mensaje que hoy. Toma
de 0 s o muy corta: igual que hoy.

**Interacción.** Los Web Locks de `holdTake` siguen protegiendo las tomas en uso. `useSaveTake` y `useShareTake`
mantienen su contrato. `storage_usage` (REQ-20) se invalida igual al compartir.

**Criterios de aceptación.**

- [ ] S-12: M-13 de «Guardar» ≤ 50 % de la línea base con una toma de 20 s, y medido también con 2 min.
- [ ] S-17: tiempo de «parar» a repaso y de abrir «Tomas» ≤ 60 % de la línea base.
- [ ] S-13: ≤ 3 commits por segundo de `ShareDialog`, y la copia tiene al menos tantos fotogramas como en la línea base
      (contados con `getVideoPlaybackQuality` o recorriendo la copia).
- [ ] Recuperación de una toma interrumpida: test e2e en verde (mismos datos recuperados).

#### REQ-25 · Repaso fluido [G-03, G-04, G-13b, G-16]

**Descripción y comportamiento esperado, punto por punto:**

1. **Encajar el superpuesto, la bisagra y el rect de la toma** (`ReviewScreen.tsx`, `CompareStage.tsx`): `setFit`,
   `setSplit` y `setTakeRect` en el raíz en cada `pointermove` re-renderizan unas 1000 líneas. Pasan a un store (el
   `useReview` existente o uno local) que solo lee la etapa de comparación, como ya se hace con los zooms. El raíz
   guarda solo el valor asentado para persistirlo; `fitSaver` (debounce 600 ms) y `onAutoSplit` siguen igual.
   `takeRect` se publica por ref o store (solo lo usa `noteArea`).
2. **Pulgar de la línea de tiempo** (`ReviewControls.tsx`): `style.left` en cada fotograma → capa `absolute inset-x-0`
   movida con `transform: translateX(ratio * 100%)` (misma geometría, incluido el `-translate-x-1/2` del pulgar).
3. **Ajuste fino de sincronía** (`ReviewScreen.tsx`, `setAdjust` en cada `input`): el valor en vivo va en
   `useReview.timing` (ya se escribe allí) y el raíz guarda solo el asentado.
4. **Lecturas forzadas y basura menor:** `getBoundingClientRect` en cada `pointermove` (`CompareStage.tsx`,
   `TakeNoteComposer.tsx`) → rect cacheado en `pointerdown` y actualizado con `ResizeObserver`; `useMatch` crea un
   `matchMedia` en cada `getSnapshot` → un `MediaQueryList` por consulta reutilizado; el trazo en vivo del compositor de
   notas se dibuja en un segundo canvas superpuesto o con rAF, sin `setState` en cada movimiento; el resultado del
   dibujo guardado es idéntico.

**Decisiones.** Se sigue el patrón que ya usa el repaso para los zooms (estado en el store y lectura solo donde se
pinta). *Motivo:* coherencia con el código existente.

**Casos límite.** Repaso con YouTube (sin superpuesto); giro a mitad de gesto; cerrar el repaso con un guardado
pendiente (debounce): debe guardarse igual que hoy; dos dedos en la bisagra.

**Interacción.** El reloj del repaso (`useReviewClock`, `syncStep`) y la sincronía con el original no cambian. Las
notas de toma (REQ-17) leen el dibujo de la consulta aparte.

**Criterios de aceptación.**

- [ ] S-14: ≤ 1 commit de `ReviewScreen` por gesto completado (no por movimiento) y M-09 p95 ≤ 20 ms.
- [ ] Valores guardados de encaje, bisagra y sincronía idénticos a la línea base para la misma secuencia de gestos.
- [ ] El dibujo de una nota de toma, codificado, es idéntico byte a byte (o visualmente idéntico si el códec no es
      determinista) para el mismo trazo.
- [ ] Capturas y fotogramas del repaso idénticos.

#### REQ-26 · Trabajo pesado fuera del hilo principal [G-08, G-09, G-10, Q-04]

**Descripción.** Tres procesos largos bloquean el hilo principal mientras el estudio sigue en uso (bucle de práctica):

- **Separación de voz** (`features/voice/separate/runSeparation.ts`, `encode.ts`): `decodeAudioData` de la canción
  entera y dos copias `Float32Array` (≈80 MB por canal en canciones largas); después el bucle de `AudioEncoder` solo
  cede cuando `encodeQueueSize > 64`, más `buildMp4` y una decodificación de comprobación con `file.slice()`.
- **Descarga del modelo** (`model.ts`, `stemSeparator.worker.ts`): un `postMessage` y una actualización de progreso por
  cada trozo de red, y memoria doble en el pico (`chunks[]` + concatenación).
- **Copia ligera para la nube** (`features/studio/cloudCopy.ts`): `blob.arrayBuffer()` del original entero para
  `decodeAudioData` y un bucle de relleno muestra a muestra que solo cede cuando la cola supera 8.

**Comportamiento esperado.**

1. Separación: la codificación de las pistas (`AudioEncoder`) y el empaquetado MP4 pasan **al worker**; el hilo
   principal recibe los dos `.m4a` y lo mínimo para medir el retardo con `OfflineAudioContext` (que no existe en
   workers). El remuestreo que hoy usa `OfflineAudioContext` (`encode.ts`) se queda en el hilo principal o se sustituye
   por un remuestreo equivalente en el worker **solo si** el resultado es idéntico en muestras (test). Hasta que esté
   todo en el worker, y en cualquier camino que quede en el hilo principal, el bucle cede cada N bloques
   (`scheduler.yield()` donde exista, `setTimeout(0)` si no) aunque la cola no esté llena.
2. Descarga del modelo: el worker envía progreso como mucho ~4 veces por segundo; si se conoce el tamaño esperado, se
   reserva el `Uint8Array` desde el principio y se escribe con `set` (sin `chunks[]`). Se mantiene la comprobación de
   tamaño exacto.
3. Copia para la nube: `encodeSound` y el empaquetado (`muxMp4`) pasan a un worker (`AudioEncoder` y `AudioData`
   existen allí; los canales se transfieren). El bucle interno usa `planar.set(src.subarray(...))` cuando no hay
   relleno. La parte de imagen (`drawImage` de un `<video>`) sigue en el hilo principal.
4. **Escritores MP4 duplicados (Q-04):** `features/studio/mp4Mux.ts` y `features/voice/separate/mp4.ts` comparten
   matriz, descriptor, configuración AAC y codificación por tramos. Se extrae `src/lib/mp4/boxes.ts` con esas piezas.
   Ojo: `audioSpecificConfig` y `aacConfig` se comportan distinto con una frecuencia desconocida (uno usa el índice 0 y
   el otro lanza error): **cada llamador conserva su comportamiento actual**.
5. `lib/heavyWork.ts` (coordinación con el grabador y la recarga) sigue funcionando igual con el trabajo en workers
   (pausar entre segmentos cuando el grabador tapa el estudio, `reloadBusy`).

**Decisiones.** El resultado en bytes (pistas `.m4a`, copia MP4) debe ser idéntico al actual para la misma entrada,
salvo donde el códec del navegador no sea determinista; en ese caso, mismas duraciones, mismo número de muestras y de
tramas, misma estructura de cajas MP4 y mismo desfase medido. *Motivo:* las pistas y copias ya subidas deben seguir
siendo equivalentes a las nuevas.

**Casos límite.** Navegador sin `AudioEncoder` en workers (algún Safari): se mantiene la ruta actual en el hilo
principal con las cesiones del punto 1. Cancelar a mitad (se termina el worker como hoy). Memoria baja: el pico no
puede ser mayor que hoy. Grabador abierto a mitad del proceso: pausa igual que hoy.

**Interacción.** La subida de las pistas y de la copia a Supabase Storage, el tope de espacio (`cloudSpace.ts`,
`videos_bucket_has_room`) y las filas de `video_stems` siguen igual. El worker nuevo de la copia no entra en el
precache (como el de separación, `globIgnores`). La reproducción de pistas (`voiceSplit.ts`, `StemPlayer`) no cambia.

**Criterios de aceptación.**

- [ ] S-15 y S-16: ninguna tarea del hilo principal > 100 ms durante las fases movidas, y el número de *Long Animation
      Frames* baja al menos un 70 % frente a la línea base.
- [ ] Tests de `mp4Mux.test.ts`, `mp4.test.ts`, `dsp.test.ts` y `separateRules.test.ts` en verde, más tests nuevos de
      `lib/mp4/boxes.ts` y de equivalencia de bytes con entradas fijas.
- [ ] Recuento de mensajes de progreso de la descarga del modelo ≤ 5 por segundo (test del worker con una respuesta
      simulada).

---

### Bloque E · Código limpio, claro y pequeño

#### REQ-27 · División de ficheros grandes

**Descripción.** Hay ficheros enormes que mezclan muchas responsabilidades: `features/record/RecordStudio.tsx` (2950),
`lib/backend.ts` (2385), `features/studio/StudioPage.tsx` (1869), `features/review/ReviewScreen.tsx` (1017),
`features/review/ReviewControls.tsx` (1014), `features/takes/TakesPanel.tsx` (954), `features/rpd/RpdPlayPage.tsx`
(944), `features/bags/BagPage.tsx` (882), `features/wishes/WishesPage.tsx` (872), `player/store.ts` (796) y muchos más
de 500 líneas.

**Comportamiento esperado.**

- **Límite:** ningún fichero de `apps/web/src` ni de `packages/shared/src` (salvo tests y `database.types.ts`) supera
  **600 líneas** al cerrar la fase 9. Objetivo orientativo: componentes ≤ 400 líneas.
- **Primero mover, luego optimizar:** en cada fase, la división de un fichero se hace como un movimiento puro de código
  (sin cambiar lógica), se comprueba con typecheck, tests y e2e, y solo después se aplican las optimizaciones de esa
  fase. Ambas cosas van en el mismo commit de fase.
- Los exports públicos se mantienen: el fichero original queda como barril que reexporta (o se actualizan todas las
  importaciones en la misma fase).
- Las sondas `PerfProbe` y las marcas `performance.mark` pasan al componente equivalente.

**Plan de división (destino orientativo; el implementador puede ajustar nombres si mantiene la idea):**

- **`lib/backend.ts` → `lib/backend/`** (fase 1): `types.ts` (todos los tipos e interfaces), `mode.ts` (`IS_DEMO`,
  `DEMO_USER_ID`, `cloudLimitBytes`), `upload.ts` (`uploadWithProgress`, `isDuplicate`), `demoDb.ts` (`DemoDb`,
  `readDb`, `writeDb`, `mutate`, `demoError`, `isLive`), `shared.ts` (ayudante `must()` para las 74 repeticiones de
  `if (error) throw error`, ayudante tipado para los resultados de selects con uniones), y por dominio
  `core.supabase.ts`/`core.demo.ts`, `bags.supabase.ts`/`bags.demo.ts`, `wishes.supabase.ts`/`wishes.demo.ts`,
  `events.supabase.ts`/`events.demo.ts`, `stems.ts`; `index.ts` reexporta.
- **`player/store.ts`** (fase 4): `playerStore.ts` (`usePlayer`), `reviewStore.ts` (`useReview`, `ReviewTiming`),
  `prefs.ts` (lecturas de preferencias), `loopActions.ts` (funciones puras `markStart`, `markEnd`, `toggleLoop`,
  `clearLoop` compartidas por los dos stores, Q-05); `store.ts` queda como barril. El estado mutable de módulo
  (`scrubTimer`, `scrubPending`, `playOnAttach`, `playCheck`) se agrupa en objetos con `reset()` para los tests.
- **`features/studio/StudioPage.tsx`** (fase 4): `MediaStage.tsx`, `useFullscreen.ts`, `fullscreen/` (`FsProgress`,
  `FullscreenBar`, `Countdown`…), `VoiceRow.tsx`, `SourceRow.tsx`; la página solo orquesta.
- **`features/studio/Timeline.tsx`** (fase 4): `timelineGeometry.ts` (puro y testeado: `seededSwell`, `buildPaths`,
  `assignLanes`, `waveY`, `localPeakY`, `layoutNoteDots`), `TimelineNotes.tsx`, `TimelineHandles.tsx`, `ClipLane.tsx`.
- **`features/studio/Transport.tsx`** (fase 4): `popover.tsx` (`useDismiss`, `useStayOnScreen`, `Popover`),
  `useLongPress.ts`, `transportButtons.tsx`, `RangeBar.tsx`; `PlayerBar` se queda.
- **`features/studio/SaveClipDialog.tsx`** (fase 4): `clipDialogParts.tsx`, `EditClipDialog.tsx`.
- **`features/studio/LinkFilePanel.tsx`** (fase 4): `LinkSyncStep.tsx`, `useLinkFlow.ts`.
- **`features/record/RecordStudio.tsx` → `features/record/studio/`** (fase 6). Hooks: `useStudioSession`,
  `useTakeSound`, `useImageControls`, `usePreviewGestures`, `useOrientationLock`, `useTakeSink`, `useBench`,
  `useTakeMachine` (fases `idle → countdown → arming → recording ⇄ paused → finishing → review`, con todos sus refs
  juntos), `useClapArm`, `useCloseGuard`, `useReviewActions` + `probeVideo.ts`, `useStartChoice`, `useLeftover`, y el
  cálculo puro `takeVerdict.ts` (con tests). Componentes con `memo`: `CameraPreview`, `StudioTopBar`, `ToolsRail`,
  `FocusLayer`, `OverlaysLayer`, `CountIn`, `BottomControls`, `TakeReviewPane`, `StudioConfirm`, `progress.tsx`
  (`SongBar`, `Shutter`, `TakeClock`…).
- **`features/review/ReviewScreen.tsx`** (fase 6): `reviewPrefs.ts`, `useTakeSaver.ts`, `useSyncAdjust.ts`,
  `useFitAndSplit.ts`, `useReviewNotes.ts`, `useClipSave.ts`, `useReviewLayout.ts`, `focusTrap.ts`, y del JSX
  `ReviewHeader`, `ReviewStage`, `ReviewBar`, `ReviewSettingsPanel`.
- **`features/review/ReviewControls.tsx`** (fase 6): `ReviewTimeline.tsx`, `ReviewPills.tsx`, `QuickStrip.tsx`,
  `ReviewTransport.tsx`, `ReviewSettings.tsx`; barril.
- **`features/takes/TakesPanel.tsx`** (fase 6): `useTakeActions.ts`, `TakeFilters.tsx`, `TakeRow.tsx` (con `memo`),
  `TakeDialogs.tsx`, `ShareDialog.tsx` (chunk aparte, REQ-23), `CloudNotice.tsx`.
- **`features/review/CompareStage.tsx`** (fase 6): `useStageSize.ts`, `stageLayout.ts` (puro, con tests),
  `useStageGestures.ts`, `Hinge.tsx`, `StageChrome.tsx`.
- **`packages/shared/src/recording.ts`** (fase 6): el ritmo (`PACE_*`, retrasos, `createMedianLog`) a `pace.ts`.
- **`features/review/reviewRules.ts`** (737) y **`features/review/ReviewMedia.tsx`** (650) (fase 6): `reviewRules.ts`
  por temas (sincronía `syncStep`/latencias, encaje, dibujo de notas, bucle), cada parte con sus tests; `ReviewMedia.tsx`
  en `useReviewClock.ts` y los componentes de medio.
- **`features/studio/cloudCopy.ts` → `features/studio/cloudCopy/`** (fase 7): `media.ts`, `sound.ts`, `picture.ts`,
  `index.ts`.
- **Fase 5:** `RpdPlayPage.tsx` (`useFullscreenRound.ts`, `RoundRunner.tsx` con `useRoundMachine`, `RoundStage.tsx`,
  `playCards.ts`), `BagPage.tsx` (`bagVisibility.ts`, `BagView.tsx`, `BagLists.tsx`, `BagHistory.tsx`),
  `WishesPage.tsx` (`WishList.tsx`, `WishCard.tsx`, `PollList.tsx`, `WishesTabs.tsx`), `PollPage.tsx` (`PollView.tsx`,
  `PollResults.tsx`), `TrackPage.tsx` (`TrackEditor.tsx`, `TrackRow.tsx`, `AddClipsDialog.tsx`), `RpdPage.tsx`
  (`RoundBuilder.tsx`, `TrackList.tsx`), `EventPage.tsx` (`EventDetail`, `SongRow`, `AddSongsDialog`),
  `PinnedClips.tsx` (`pinned/usePendulum.ts`, `pinned/Norigae.tsx`, `pinned/TextureDefs.tsx`), `MembersUI.tsx`,
  `quickNavCore.tsx` (`useQuickNav`), `components/YouTubePicker.tsx` (`useYouTubeSearch.ts`, `YouTubeResults.tsx`).
- **Fase 3:** `components/AppShell.tsx` → `components/shell/` (`routeFocus.ts`, `SideRail.tsx`, `MobileBar.tsx`,
  `Page.tsx`, `ShellUser.tsx` con el bloque de usuario que hoy se repite).
- **Fase 2:** `data/videos.ts` → `data/videos/` (`queries.ts`, `upload.ts`, `mutations.ts`, `localCopy.ts`).

**Decisiones.** Cada área se divide en la fase que la optimiza, no en una fase aparte al principio. *Motivo:* así cada
archivo se toca una sola vez y la división ayuda a aislar los re-renders de esa misma fase.

**Casos límite.** Dependencias circulares tras dividir (comprobar con el build y con `knip`); `React.lazy` de un
módulo que pasa a ser barril (importar el componente concreto, no el barril, para no arrastrar más código al chunk);
`memo` que deja de funcionar porque una prop pasa a ser un objeto nuevo en cada render (revisar con la sonda M-08).

**Interacción.** Las sondas `PerfProbe`, las marcas `oneshoot:*` y los tests existentes acompañan al código movido.
`docs/ARCHITECTURE.md` se actualiza en la fase 9 (REQ-29).

**Criterios de aceptación.**

- [ ] `pnpm check:size` en verde con la lista de excepciones vacía al cerrar la fase 9.
- [ ] Suite completa, e2e y comparación visual en verde tras cada división.

#### REQ-28 · Código duplicado fuera [Q-01…Q-08]

**Descripción.** Hay ayudantes y lógica copiados en varios sitios (inventario abajo). Cada copia es más código que
descargar y que mantener, y algunas ya se comportan distinto entre sí.

**Decisiones.** Al unificar, **cada llamador conserva su comportamiento exacto**, aunque las copias difieran (por
ejemplo `formatBytes` o la configuración AAC). *Motivo:* la regla de oro.

**Casos límite.** Copias con diferencias sutiles (redondeo, separador decimal, error frente a valor por defecto): se
documentan y se cubren con tests antes de unificar.

**Interacción.** El bucle compartido y el reinicio al acabar se hacen en la fase 4; el MP4 compartido en la fase 7; el
resto en la fase 9.

**Comportamiento esperado.**

- `src/lib/audioCtor.ts` con `audioContextCtor()` y `offlineAudioContextCtor()` (constructor o `null`), usado por los
  7 sitios que hoy repiten el ayudante webkit (`cloudCopySupport.ts`, `runSeparation.ts`, `encode.ts`, `syncAudio.ts`,
  `clapListener.ts`, `shareTake.ts`, `metronome.ts`).
- `deviceShape()` en `src/lib/deviceShape.ts` (hoy en `cloudCopyRun.ts` y `runSeparation.ts`).
- `formatBytes`: hay dos con salida distinta (`packages/shared/src/time.ts`: «1.5 MB»; `separateRules.ts`: «8,4 MB»).
  **Cada llamada conserva exactamente su salida actual**: se renombra la de voz (`formatBytesEs`) o se deja una sola con
  una opción explícita. Tests de las dos salidas.
- Lógica «al acabar, reiniciar» duplicada en `FileStage.tsx` y `YouTubeStage.tsx` → `restartOnEnded(engine)` común.
- Lógica de bucle duplicada entre `usePlayer` y `useReview` → `player/loopActions.ts` (REQ-27).
- Pantalla completa duplicada a propósito (`features/rpd/roundChrome.ts` es copia de `studio/fullscreenChrome.ts`; hay
  dos `useFullscreen`) → fábrica `createAutoHideChrome({ isPlaying })` en `lib/` y un `useFullscreenMode` común.
  Riesgo medio (orientación y reajuste del viewport): pruebas de giro en estudio y ronda obligatorias.
- Utilidades pequeñas en `src/lib/async.ts` (`sleep`, `abortError`, `isAbort`), `clamp` de `@coverscape/shared` en vez
  del local de `zoom.ts`, un `useNow` común (`src/lib/useNow.ts`, número) con adaptador a `Date`, `useSize` común,
  `probeVideo` común (`cloudCopy` y grabador), `isDuplicate` común.

**Criterios de aceptación.**

- [ ] Ningún duplicado de la lista sigue existiendo (búsqueda en evidencias).
- [ ] Tests nuevos de cada utilidad compartida; suite y e2e en verde; capturas idénticas.

#### REQ-29 · Código muerto, tipos y estado de módulo [Q-09, Q-10, Q-12, Q-13, Q-15, Q-16]

**Descripción.** Quedan restos de la época con login, exports sin uso (unos 15 sin ningún uso, unos 20 solo usados en
tests y unos 250 exportados sin necesidad), 26 `as unknown as`, 74 repeticiones de `if (error) throw error` en el
backend y estado mutable de módulo sin control.

**Decisiones.** No se borra nada que use el demo o una sesión antigua. *Motivo:* el demo es la herramienta de pruebas y
las sesiones antiguas aún pueden existir en algún móvil.

**Casos límite.** Un export que parece sin uso pero se usa por nombre dinámico o desde `vite.config.ts`
(`resolveBuildNumber`): comprobar con `grep` antes de borrar.

**Interacción.** Si REQ-11 ya rehízo `AuthProvider`, aquí solo se verifica. Los casts de backend se resuelven en la
fase 1.

**Comportamiento esperado.**

- `AuthProvider`: se quitan `signIn` y `signUp` (0 usos). Se mantienen `signOut` y el bloque de usuario (lo usan el demo
  y las sesiones antiguas). Si REQ-11 ya rehízo el provider, solo se verifica.
- Se quitan `CrewMember` (sin uso) y la dependencia sobrante `user` del `useMemo` de `CrewProvider`. `getProfile` se
  mantiene mientras exista el demo.
- Exports sin uso (verificados con `knip` y `grep`): se borran los que no tienen ningún uso; los que solo usan los tests
  se borran junto con su test **solo si** el test no cubre otra función viva; si no, se dejan con el comentario
  `/** test-only */`. Se quita `export` a lo que solo se usa en su propio fichero.
- Casts `as unknown as`: se eliminan los innecesarios (`StudioPage.tsx` `applyClip(clip) as unknown as …`,
  `TrackPage.tsx` FocusEvent→FormEvent, los de `lib/backend` con el ayudante tipado, `cloudCopyRun.ts` WakeLock,
  `stemSeparator.worker.ts` con `declare const self: DedicatedWorkerGlobalScope`). Los de `snapshot.ts`,
  `AuthProvider.tsx` (sesión demo) y `devSilence.ts` pueden quedarse con un comentario que lo justifique.
- Estado mutable de módulo: `export let badVersion` (`recorder.ts`) pasa a un getter; las cachés sin límite
  (`rpd/useClipSource.ts`, `VoiceOnda.tsx` `CACHE`) pasan a tener tope (LRU sencillo) con el mismo comportamiento para
  el uso normal.
- `lib/retiredData.ts` se mantiene (limpia datos de F10 en dispositivos que aún los tengan).
- `docs/ARCHITECTURE.md` se actualiza con la nueva estructura (`lib/backend/`, pósteres aparte, workers, memoria de
  firmas, fuentes propias). `CLAUDE.md` se actualiza si cambia alguna regla para agentes (por ejemplo, la ruta del
  estado del reproductor).

**Criterios de aceptación.**

- [ ] `pnpm check:unused` sin exports ni dependencias sin uso (o con cada excepción justificada en `PROGRESO.md`).
- [ ] Recuento de `as unknown as` anotado antes y después; solo quedan los justificados.

#### REQ-30 · Lint limpio y dependencias de efectos revisadas [Q-14]

**Descripción.** Hay 15 `eslint-disable react-hooks/exhaustive-deps` (10 en `RecordStudio.tsx`, más `useCamera.ts`,
`TakesPanel.tsx`, `ReviewScreen.tsx`, `LinkFilePanel.tsx`, `CloudCopyStatus.tsx`) sin que existiera ESLint.

**Comportamiento esperado.**

- Cada `eslint-disable` se revisa: se sustituye por `useEffectEvent` (si la versión instalada de React lo ofrece de
  forma estable) o por refs, **sin cambiar cuándo se ejecuta el efecto**. Si un caso no se puede cambiar sin riesgo,
  se mantiene con un comentario que explique por qué.
- Al cierre, `pnpm lint` da 0 errores y 0 avisos en las reglas `react-hooks/*`, y el total de avisos es menor que en la
  línea base (anotado).

**Decisiones.** Se prefiere no tocar un efecto antes que arriesgar un cambio de cuándo se ejecuta. *Motivo:* muchos de
estos efectos están en el grabador, donde un cierre obsoleto puede romper una toma.

**Casos límite.** Efectos que dependen de un valor a propósito obsoleto (el de la toma en curso): se documenta y se
mantiene con un comentario explícito.

**Interacción.** La mayoría de estos efectos están en archivos que la fase 6 ya dividió; se revisan en la fase 9 sobre
los módulos nuevos.

**Criterios de aceptación.**

- [ ] Tabla en `PROGRESO.md` con cada `eslint-disable` original y su resolución.
- [ ] Suite, e2e y capturas en verde.

---

## 5. Requisitos no funcionales

### 5.1 Rendimiento (resumen de objetivos)

| Métrica | Objetivo al cierre |
| --- | --- |
| M-01 camino crítico de `/` | ≤ 75 % de la línea base (≤ 85 % si se descarta REQ-12) |
| M-02 chunk de entrada | ≥ 6 kB gzip menos que la línea base |
| M-03 LCP frío de `/` | ≤ 80 % de la línea base |
| M-04 LCP repetido de `/` | ≤ 80 % de la línea base |
| M-05 estudio en frío | ≤ 85 % (YouTube) y ≤ 75 % (subido) de la línea base |
| M-06 lista de vídeos | ≤ 10 % de la línea base |
| M-09 p95 en S-03…S-14 | ≤ 20 ms con CPU ×4 |
| M-12 ficheros > 600 líneas | 0 |

Si un objetivo no se alcanza tras aplicar correctamente su REQ, no se fuerza con cambios visibles: se documenta con
las mediciones y la causa, y se trata como hallazgo en la revisión.

### 5.2 Responsive

Sin cambios respecto a hoy. Se verifica con las capturas a 375, 768 y 1440 px y con giro en estudio, repaso y ronda.
Sin scroll horizontal nuevo ni elementos solapados o cortados nuevos.

### 5.3 Accesibilidad (WCAG AA)

- **Ninguna regresión:** el informe de axe-core de cada pantalla no puede tener violaciones serias o críticas **nuevas**
  respecto a `axe-linea-base.json`. Las que ya existían no se corrigen en esta spec si hacerlo cambia la interfaz
  (están registradas en `docs/plan/ESTADO-IMPLEMENTACION.md`, apartado 5), y se listan en `PROGRESO.md`.
- Foco visible, orden de tabulación, roles ARIA (`switch`, `radiogroup`, `slider`, `dialog`), trampas de foco, `Esc`,
  anuncios (`aria-live`) y nombres accesibles: idénticos.
- Movimiento reducido: todas las animaciones nuevas en CSS o Web Animations respetan `prefers-reduced-motion` igual que
  las de `motion` con `MotionConfig reducedMotion="user"`.

### 5.4 Seguridad

- RLS, triggers de archivado, topes y privilegios por columna: sin cambios salvo lo que añaden las migraciones de esta
  spec, con sus tests.
- Las RPC nuevas son `security invoker` (respetan la RLS), con `revoke all from public` y `grant execute` solo a `anon`
  y `authenticated`.
- La clave de YouTube sigue solo en el servidor. Ningún secreto en el cliente.
- La CSP (Report-Only en `vercel.json`) se actualiza si cambian orígenes (fuentes propias: menos orígenes) y no se
  añaden scripts en línea.
- El memo de URLs firmadas vive solo en memoria (nunca en localStorage).

### 5.5 Consistencia visual

Regla de oro del apartado 1.2 y comparación del apartado 3.4. Tokens de color, tipografías y presets de movimiento sin
cambios. La skill `impeccable` se usa para revisar que nada se ha degradado (no para rediseñar).

### 5.6 Compatibilidad

Chrome Android, Samsung Internet, Safari iOS (navegador y app instalada) y Chrome/Edge/Safari de escritorio, igual que
hoy. Todo uso de APIs nuevas (`scheduler.yield`, `AudioEncoder` en worker, `lvh`, `requestIdleCallback`) tiene
alternativa donde no existan.

---

## 6. Fuera de alcance

El implementador **no** debe:

- Cambiar ningún texto, color, tipografía, tamaño, posición, icono, animación, sonido, atajo o flujo visible.
- Añadir o quitar funcionalidades, ni corregir fallos funcionales conocidos que no estén en esta spec (salvo los que
  aparezcan como efecto directo de un REQ, anotándolos).
- Corregir las violaciones de accesibilidad ya existentes que exijan un cambio visible.
- Cambiar el `backdrop-blur` de la ronda (R-11), `text-rendering: optimizeLegibility` ni `maximum-scale=1` del
  viewport.
- Sustituir `tailwind-merge` por `clsx` (C-14): riesgo de resolver conflictos de clases de otra forma.
- Activar el React Compiler.
- Escribir las tomas desde un worker con `createSyncAccessHandle` (G-07b).
- Abrir la cámara antes de que cargue el grabador (cambia el momento del permiso).
- Cambiar las claves de React Query de la lista de vídeos (D-15 completo).
- Retirar la tabla `follow_paths` ni otras tablas heredadas (`profiles`, `crew_members`) de la base de datos.
- Renombrar claves existentes de localStorage, IndexedDB, OPFS o cachés.
- Aplicar migraciones en producción, desplegar, tocar el proyecto de Vercel o ejecutar nada contra el Supabase real.
- Crear ramas, cambiar de rama o usar worktrees.
- Modificar los documentos históricos de `docs/plan/` (solo se leen).

---

## 7. Plan por fases

Cada fase deja la app compilando y funcionando, pasa por IMPLEMENTAR → REVISAR → PROBAR y se cierra con su commit.
Las bases (herramientas, backend, base de datos) van antes que las optimizaciones de interfaz.

### 7.1 Tabla de fases

| Fase | Nombre | REQs | Depende de | Paralelizable con |
| --- | --- | --- | --- | --- |
| 0 | Herramientas y líneas base | 01, 02, 03 | — | ninguna |
| 1 | Backend por dominio | 08 (backend y demo), 27 (backend), 29 (casts de backend) | 0 | 3 |
| 2 | Datos y base de datos | 14, 15, 16, 17, 18 (cascadas y `gcTime` de voz), 19, 20 (RPC e índices), 27 (`data/videos`) | 1 | 3 (salvo REQ-10) |
| 3 | Carga, shell y PWA | 04, 05, 06, 07, 08 (`manualChunks`), 09, 10, 13, 18 (`gcTime` por defecto), 27 (`AppShell`) | 0; REQ-10 y `crossOrigin` esperan a la 2 | 1, 2 |
| 4 | Estudio fluido | 21, 27 (estudio y `player/store`), 28 (bucle y reinicio) | 2, 3 | 5, 7, 8 |
| 5 | Grupo y diálogos fluidos | 22, 27 (pantallas de grupo, `YouTubePicker`) | 2, 3 | 4, 6, 7, 8 |
| 6 | Grabador, tomas y repaso | 23, 24, 25, 20 (`storage_usage`), 27 (grabador, repaso, tomas, `recording.ts`) | 4 | 5, 7, 8 |
| 7 | Trabajo pesado en workers | 26, 27 (`cloudCopy`), 28 (MP4) | 2, 3 | 4, 5, 6, 8 |
| 8 | Cliente de Supabase ligero | 11 | 2, 3 | 4, 5, 6, 7 |
| 9 | Limpieza transversal | 27 (resto), 28 (resto), 29, 30 | 1–8 | ninguna |
| 10 | `motion` perezoso (condicional) | 12 | 9 | ninguna |
| Cierre | Protocolo de cierre final | todos | 0–10 | — |

### 7.2 Grafo de dependencias

```
F0 ──┬─> F1 ──> F2 ──┐
     │               ├──> (F2 y F3 cerradas) ──┬─> F4 ──> F6 ──┐
     └─> F3 ─────────┘                         ├─> F5 ─────────┤
         (REQ-10 y crossOrigin                 ├─> F7 ─────────┤
          esperan a F2)                        └─> F8 ─────────┤
                                                               └─> F9 ──> F10 ──> Cierre
```

F1 → F2 y F3 corren en paralelo. Cuando F2 y F3 están cerradas, arrancan F4, F5, F7 y F8 en paralelo; F6 arranca al
cerrar F4. F9 espera a todas.

### 7.1 bis Archivos compartidos que obligan a serializar

| Archivo | Lo tocan | Regla |
| --- | --- | --- |
| `package.json` (todos) y `pnpm-lock.yaml` | 0, 3 (si hace falta), 7 (si hace falta), 8 | un dueño a la vez; instalación en serie |
| `apps/web/vite.config.ts` | 0, 3, 7 (configuración de workers, si hace falta) | 0 y 3 nunca a la vez; 7 empieza después de cerrar 3 |
| `apps/web/src/index.css` | 3 (fuentes, Splash), 9 | las animaciones CSS nuevas de las fases 4, 5 y 6 van en un CSS propio junto al componente (por ejemplo `features/wishes/voteReveal.css`), nunca en `index.css` |
| `apps/web/src/App.tsx` | 0 (sonda), 3, 10 | en serie (fases no simultáneas) |
| `supabase/migrations/`, `database.types.ts`, `domain.ts` | 2 | solo la fase 2; migraciones en serie |
| `apps/web/src/lib/backend/**` | 1, 2, 8 | 1 → 2 → 8 en serie; ninguna otra fase lo toca (si lo necesita, espera a que 8 cierre o lo pide al dueño) |
| `packages/shared/src/index.ts` | 6, 9 | en serie (fases no simultáneas) |
| `apps/web/src/features/library/**` | 2 (`VideoCard`, `LibraryPage`), 3 (REQ-10, `crossOrigin`), 4 (`will-change` de `PinnedClips` y `VideoCard`), 5 (`PinnedClips`) | 2 → 3 en serie; 4 y 5 arrancan tras 3; entre 4 y 5, `PinnedClips.tsx` y `VideoCard.tsx` son de la fase 5, que también aplica su `will-change` (REQ-21.6) |
| `apps/web/src/components/shell/**` | 3, 4 (`will-change` de REQ-21.6) | la fase 4 arranca tras cerrar la 3 |
| `apps/web/e2e/**` (capturas de referencia y fixtures) | 0; el resto solo añade tests nuevos | nadie modifica referencias ni fixtures de la fase 0 salvo encargo expreso del orquestador |

### 7.3 Detalle de cada fase

#### Fase 0 · Herramientas y líneas base

- **Objetivo:** poder verificar todo lo demás con números y capturas.
- **REQs:** 01, 02, 03.
- **Archivos:** `package.json` (raíz, `apps/web`, `packages/shared`), `pnpm-lock.yaml`, `eslint.config.js`,
  `knip.json` (o `knip.config.ts`), `apps/web/playwright.config.ts`, `apps/web/vitest.config.ts`, `apps/web/e2e/**`,
  `scripts/check-file-size.mjs`, `scripts/perf-bundle.mjs`, `apps/web/src/lib/perfProbe.tsx` (nuevo), los puntos de
  inserción de `PerfProbe` y `performance.mark` (lista del REQ-03), `README.md` (comandos), `.gitignore` (salvaguarda de
  Playwright), `docs/specs/rendimiento-integral/**`.
- **Orden interno obligatorio:** 1) herramientas; 2) datos de prueba y suite e2e; 3) capturas y fotogramas de referencia
  **sobre el código sin modificar**; 4) sondas y marcas; 5) comprobar que las capturas siguen idénticas con las sondas
  puestas; 6) mediciones de la línea base.
- **Dependencias:** ninguna.
- **Paralelizable con:** ninguna fase. Dentro de la fase, pueden ir en paralelo la configuración de ESLint/knip y la
  escritura de los tests e2e (archivos disjuntos), una vez instaladas las dependencias (en serie).
- **Definición de terminado:** todos los comandos del REQ-01 funcionan; e2e en verde; capturas, fotogramas, informe de
  axe y `linea-base.json` en `evidencias/fase-0/`; tabla de línea base en `PROGRESO.md`; commit.

#### Fase 1 · Backend por dominio

- **Objetivo:** dividir `lib/backend.ts` para que cada pantalla cargue solo su dominio y el demo salga del build de
  producción.
- **REQs:** 08 (backend y demo), 27 (backend), 29 (casts y `must()` de backend).
- **Archivos:** `apps/web/src/lib/backend.ts` → `apps/web/src/lib/backend/**`; importaciones en `apps/web/src/data/**`
  y en cualquier otro importador directo de `@/lib/backend` (solo la línea de importación).
- **Dependencias:** fase 0.
- **Paralelizable con:** fase 3 (archivos disjuntos). No puede coincidir con la fase 2.
- **Definición de terminado:** movimiento puro verificado; demo ausente del build (búsqueda); M-02 medido; suite, e2e y
  capturas en verde; commit.

#### Fase 2 · Datos y base de datos

- **Objetivo:** menos bytes y menos viajes de red.
- **REQs:** 14, 15, 16, 17, 18 (cascadas y precargas), 19, 20 (RPC e índices), 27 (`data/videos`).
- **Archivos:** `supabase/migrations/` (migraciones nuevas, en serie), `supabase/tests/` (tests nuevos),
  `packages/shared/src/database.types.ts`, `packages/shared/src/domain.ts`, `apps/web/src/lib/backend/**`,
  `apps/web/src/data/**` (salvo `takes.ts`), `apps/web/src/lib/snapshot.ts`, `apps/web/src/lib/localVideos.ts`,
  `apps/web/src/features/library/VideoCard.tsx`, `apps/web/src/features/library/LibraryPage.tsx` (solo la combinación de
  pósteres), `apps/web/src/features/studio/fileSource.ts`, `apps/web/src/features/studio/StudioPage.tsx` (solo el
  marcador de posición de REQ-16), `apps/web/src/features/rpd/useClipSource.ts`,
  `apps/web/src/features/rpd/RpdPlayPage.tsx` (solo la carga en lote), `apps/web/src/features/bags/BagPage.tsx`,
  `BagsPage.tsx`, `AddToBagDialog.tsx`, `apps/web/src/features/events/EventPage.tsx`, `EventsPage.tsx`,
  `apps/web/src/features/rpd/TrackPage.tsx`, `RpdPage.tsx` (precarga), `apps/web/src/features/wishes/WishesPage.tsx`,
  `PollPage.tsx` (solo consultas), `apps/web/src/features/studio/NoteDialog.tsx`,
  `apps/web/src/features/review/TakeNoteCard.tsx` y `ReviewScreen.tsx` (solo lectura del dibujo),
  `apps/web/api/*.ts`, `apps/web/src/components/youTubePickerRules.ts`, `apps/web/e2e/perf/supabaseMock.mjs` (columnas
  y RPC nuevas, REQ-03).
- **Dependencias:** fase 1.
- **Paralelizable con:** fase 3, salvo REQ-10 (que toca `LibraryPage.tsx` y espera a esta fase). Las migraciones van en
  serie y nunca a la vez que un `pnpm db:test` de otra tarea.
- **Definición de terminado:** `pnpm db:test` en verde con los tests nuevos; M-06 y M-07 medidos; demo con el mismo
  contrato; suite, e2e y capturas en verde; instrucciones de migración anotadas en `PROGRESO.md` (orden, copia de
  seguridad previa, comprobación de advisors); commit.

#### Fase 3 · Carga, shell y PWA

- **Objetivo:** primera pintura y LCP antes, sobre todo en la web sin instalar.
- **REQs:** 04, 05, 06, 07, 08 (`manualChunks`), 09, 10, 13, 18 (`gcTime`), 27 (`AppShell`).
- **Archivos:** `apps/web/index.html`, `apps/web/src/main.tsx`, `apps/web/src/App.tsx`, `apps/web/vite.config.ts`,
  `apps/web/vercel.json` (CSP), `apps/web/src/index.css` (fuentes y keyframes de la Splash), carpeta de fuentes nueva,
  script externo de precarga de miniatura (`apps/web/public/` o equivalente), `apps/web/src/components/AppShell.tsx` →
  `apps/web/src/components/shell/**`, `apps/web/src/components/Backdrop.tsx`, `apps/web/src/lib/prefetch.ts`,
  `apps/web/src/lib/routeLoaders.ts` (nuevo), `apps/web/src/features/nav/version/appUpdate.ts` (solo si el registro
  diferido lo exige), `apps/web/src/features/library/LibraryPage.tsx` (REQ-10, tras la fase 2), componentes de
  miniaturas de YouTube (solo el atributo `crossOrigin`, si REQ-13 lo permite), `apps/web/src/features/nav/QuickNav.tsx`
  (solo para exportar o mover `useDesktop`), `apps/web/e2e/perf/supabaseMock.mjs` (solo si un cambio de esta fase lo
  exige).
- **Dependencias:** fase 0; REQ-10 y el atributo `crossOrigin` en `VideoCard` esperan a que cierre la fase 2.
- **Paralelizable con:** fases 1 y 2.
- **Definición de terminado:** objetivos del bloque B (REQ-10) medidos y cumplidos; capturas y fotogramas de la Splash
  idénticos; actualización del service worker probada; commit.

#### Fase 4 · Estudio fluido

- **Objetivo:** el estudio a 60 fps reproduciendo, con zoom y arrastres.
- **REQs:** 21, 27 (estudio y `player/store`), 28 (bucle compartido y reinicio al acabar).
- **Archivos:** `apps/web/src/player/**`, `apps/web/src/features/studio/**` **excepto** `cloudCopy*.ts`,
  `cloudCopy/**`, `mp4Mux*.ts`, `CloudCopyStatus.tsx`, `cloudSpace.ts`, `audioAlign*.ts` y `fileSource.ts`;
  `apps/web/src/components/shell/**` (solo la clase `will-change` del botón con `drop-shadow` de REQ-21.6). Los botones
  de `PinnedClips.tsx` y `VideoCard.tsx` son de la fase 5.
- **Dependencias:** fases 2 (`fileSource.ts`, `StudioPage.tsx`) y 3 (`components/shell/**`).
- **Paralelizable con:** fases 5, 7 y 8.
- **Definición de terminado:** criterios de REQ-21; `player/reviewStore.ts` listo para la fase 6; commit.

#### Fase 5 · Grupo y diálogos fluidos

- **Objetivo:** animaciones de grupo, diálogos y biblioteca sin tirones.
- **REQs:** 22, 27 (pantallas de grupo y `YouTubePicker`).
- **Archivos:** `apps/web/src/features/{rpd,bags,wishes,events,library,nav,members,settings}/**` (incluye el
  `will-change` de REQ-21.6 en `PinnedClips.tsx` y `VideoCard.tsx`), `apps/web/src/components/ui/Dialog.tsx`,
  `apps/web/src/components/YouTubePicker.tsx`, `apps/web/src/lib/hanging.ts`, CSS propios nuevos junto a los
  componentes animados.
- **Dependencias:** fases 2 y 3.
- **Paralelizable con:** fases 4, 6, 7 y 8.
- **Definición de terminado:** criterios de REQ-22; commit.

#### Fase 6 · Grabador, tomas y repaso

- **Objetivo:** cámara antes, grabador y repaso fluidos, guardar y abrir tomas sin esperas.
- **REQs:** 23, 24, 25, 20 (`storage_usage`), 27 (grabador, repaso, tomas, `recording.ts`).
- **Archivos:** `apps/web/src/features/{record,takes,review,reactions}/**`, `apps/web/src/data/takes.ts`,
  `apps/web/src/player/reviewStore.ts` (creado en la fase 4), `packages/shared/src/recording.ts` (+ `pace.ts` nuevo y
  `index.ts` de shared).
- **Dependencias:** fase 4.
- **Paralelizable con:** fases 5, 7 y 8.
- **Definición de terminado:** criterios de REQ-23, 24 y 25; `reviewRules.ts` y `ReviewMedia.tsx` divididos (REQ-27);
  recuperación de tomas probada; commit.

#### Fase 7 · Trabajo pesado en workers

- **Objetivo:** separar voz y copiar a la nube sin bloquear el estudio.
- **REQs:** 26, 27 (`cloudCopy`), 28 (MP4 compartido).
- **Archivos:** `apps/web/src/features/voice/separate/**`, `apps/web/src/features/voice/SeparateVoiceButton.tsx`,
  `apps/web/src/features/studio/cloudCopy*.ts` → `cloudCopy/**`, `apps/web/src/features/studio/mp4Mux*.ts`,
  `apps/web/src/features/studio/CloudCopyStatus.tsx`, `apps/web/src/features/studio/audioAlign*.ts`,
  `apps/web/src/lib/heavyWork*.ts`, `apps/web/src/lib/mp4/**` (nuevo), workers nuevos, `apps/web/vite.config.ts` (solo
  si hace falta configurar un worker; la fase 3 ya está cerrada).
- **Dependencias:** fases 2 y 3 (la fase 1 cambia las importaciones del backend que usa `runSeparation.ts`, y la 3 es
  dueña de `vite.config.ts`).
- **Paralelizable con:** fases 4, 5, 6 y 8 (con reservas disjuntas).
- **Definición de terminado:** criterios de REQ-26; equivalencia de bytes demostrada; commit.

#### Fase 8 · Cliente de Supabase ligero

- **Objetivo:** quitar auth, realtime y functions del camino crítico.
- **REQs:** 11.
- **Archivos:** `apps/web/src/lib/supabase.ts`, `apps/web/src/providers/AuthProvider.tsx`,
  `apps/web/src/providers/CrewProvider.tsx`, `apps/web/src/lib/backend/**` (llamadas al cliente y a storage),
  `apps/web/package.json` y `pnpm-lock.yaml` (dependencias directas `@supabase/postgrest-js` y `@supabase/storage-js`,
  en serie).
- **Dependencias:** fases 2 y 3.
- **Paralelizable con:** fases 4, 5, 6 y 7, siempre que ninguna de ellas necesite tocar `lib/backend/**` (si lo
  necesita, espera).
- **Definición de terminado:** criterios de REQ-11; commit.

#### Fase 9 · Limpieza transversal

- **Objetivo:** dejar el código limpio y sin duplicados, y el lint en verde.
- **REQs:** 27 (ficheros restantes > 600 líneas), 28 (resto), 29, 30.
- **Archivos:** cualquiera de `apps/web/src` y `packages/shared/src`, `CLAUDE.md`, `docs/ARCHITECTURE.md`,
  `scripts/check-file-size.mjs` (vaciar excepciones).
- **Dependencias:** fases 1 a 8 cerradas.
- **Paralelizable con:** ninguna fase. Dentro de la fase, subagentes en paralelo por carpetas disjuntas.
- **Definición de terminado:** criterios de REQ-27…30; `pnpm check:size`, `pnpm check:unused` y `pnpm lint` en verde;
  commit.

#### Fase 10 · `motion` perezoso (condicional)

- **Objetivo:** sacar las funciones avanzadas de `motion` del camino crítico sin cambio visible.
- **REQs:** 12.
- **Archivos:** todos los que importan `motion` (76) y `App.tsx`.
- **Dependencias:** fase 9.
- **Paralelizable con:** ninguna.
- **Definición de terminado:** conservado con las tres condiciones de REQ-12 o descartado con mediciones; commit (si se
  descarta, el commit solo actualiza `PROGRESO.md`).

---

## 8. Rama y archivos

- Se trabaja **siempre en la rama actual** del repositorio, la que esté activa al empezar. No se crean ramas, no se
  cambia de rama y no se usan worktrees.
- Todas las rutas de esta spec son relativas a la raíz del repositorio, salvo la carpeta de evidencias.
- Spec: `docs/specs/rendimiento-integral/SPEC.md`.
- Registro de progreso: `docs/specs/rendimiento-integral/PROGRESO.md`.

### 8.1 Evidencias: temporales y FUERA del repositorio (decisión del responsable)

Todas las capturas, fotogramas, trazas, informes de axe, informes del visualizer, mediciones JSON, vídeos y resultados
de Playwright son **temporales**: se guardan **fuera del repositorio**, **nunca** entran en un commit y el responsable
los borrará al terminar.

- **Carpeta de evidencias** (en esta spec, «`evidencias/`» significa siempre esta carpeta): la ruta de la variable de
  entorno `ONESHOOT_EVIDENCE_DIR` o, si no está definida, `~/oneshoot-rendimiento-integral-tmp/` (en el directorio
  personal del usuario, fuera del repositorio). Es fija entre sesiones para poder retomar el trabajo si se pierde el
  contexto. Anota la ruta absoluta usada en `PROGRESO.md`.
- Estructura:
  - `evidencias/referencias/`: capturas y fotogramas de referencia de la fase 0 (Playwright
    `snapshotPathTemplate` apunta aquí).
  - `evidencias/fase-N/` (`fase-0` … `fase-10`) y `evidencias/cierre/`: capturas de cada fase con nombre
    `<pantalla>-<estado>-<ancho>.png`, mediciones en JSON (incluida `fase-0/linea-base.json`), trazas, informes.
  - `evidencias/playwright-output/`: `outputDir` de Playwright (resultados, diffs, vídeos, trazas de fallos).
  - `evidencias/perf/`: salida de `pnpm perf`, `pnpm perf:bundle` y `pnpm build:report`.
- `apps/web/playwright.config.ts` y los scripts de medición leen `ONESHOOT_EVIDENCE_DIR` (con el valor por defecto de
  arriba) para `snapshotPathTemplate`, `outputDir` y las salidas. No se escribe nada de esto dentro del repositorio.
- Por seguridad, `.gitignore` incluye también `playwright-report/`, `test-results/`, `blob-report/` y
  `**/__screenshots__/`, por si alguna herramienta las creara dentro por defecto.
- **Antes de cada commit**, el orquestador comprueba con `git status` y `git diff --cached --name-only` que no hay
  ningún `.png`, `.webm`, `.zip`, traza ni JSON de mediciones preparado para el commit.
- Lo que sí va al repositorio, porque es código o texto: los tests, los datos de prueba (`apps/web/e2e/fixtures/`), el
  simulador de Supabase, los scripts y `PROGRESO.md`. `PROGRESO.md` recoge en texto las tablas resumen (línea base,
  antes/después, ratios de diferencia visual, tabla final REQ → evidencia) y cita las evidencias por su ruta dentro de
  la carpeta temporal.
- Si la carpeta temporal se pierde (por ejemplo, se borró antes de tiempo), las referencias de la fase 0 se regeneran
  sobre el commit de partida con el procedimiento del REQ-02 (copia con `git archive`), nunca sobre código modificado.

---

## 9. Orquestación con subagentes

El agente principal (Opus 5.5, esfuerzo alto) actúa como ORQUESTADOR: planifica, reparte el
trabajo, integra los resultados, decide modelo y esfuerzo de cada subagente y es el único
responsable de dar algo por terminado.

### Skill `caveman` en los subagentes

- Todo encargo a un subagente empieza con esta línea, tal cual: «Si tienes disponible la
  skill `caveman`, actívala antes de empezar. Aplícala a tu comunicación y a tu respuesta,
  pero no al código, tests, comentarios, textos de UI ni documentación, que siguen las
  convenciones del repo».
- El formato de respuesta que pida el orquestador prevalece sobre `caveman`: los hallazgos
  deben incluir archivo, línea, descripción y nota legibles.

### Especialización: se espera y se fomenta

- Es deseable y se espera que el orquestador cree subagentes especializados. Preferible
  muchos subagentes pequeños con un encargo concreto que pocos generalistas.
- Cada subagente tiene un único rol y un encargo acotado. No hay subagentes "para todo".
  Roles orientativos (el orquestador crea los que necesite):
  - Exploración y análisis de código (localizar archivos, patrones, contratos existentes).
  - Implementación de backend/API.
  - Modelo de datos y migraciones.
  - Implementación de frontend/componentes de UI.
  - Tests (unitarios, integración, e2e con Playwright).
  - Revisor de corrección y cumplimiento de la spec.
  - Revisor de casos límite, errores, seguridad y rendimiento.
  - Revisor de calidad de código y consistencia con el código existente.
  - Tester de UI/UX con Playwright y la skill `impeccable` (responsive, accesibilidad,
    estética, usabilidad).
- Los subagentes no lanzan a su vez otros subagentes, no hacen commits y no cambian de rama.

### Selección de modelo y esfuerzo (la decide el orquestador)

- El orquestador decide, para CADA subagente, qué modelo y qué esfuerzo usa, según la
  complejidad, el riesgo y el volumen de la tarea. Es una decisión suya, tarea a tarea.
- **Modelos permitidos:** únicamente `opus` (Opus 5.5), `sonnet` y `haiku`.
- **PROHIBIDO usar `fable`**, en cualquier caso y por ningún motivo, aunque sea el modelo
  por defecto o algo lo sugiera.
- **Techo de potencia:** Opus 5.5 con esfuerzo alto. Esfuerzos permitidos: `low`, `medium`
  y `high`. Nunca `xhigh` ni `max`.
- Al lanzar cada subagente, indica SIEMPRE el modelo y el esfuerzo de forma explícita; no
  dependas de los valores por defecto (podrían ser `fable` o superar el techo). Si la
  herramienta no permite fijar el esfuerzo, fija al menos el modelo y anótalo.
- Guía orientativa (no obligatoria; el orquestador puede desviarse si lo justifica):

  | Tipo de tarea | Modelo / esfuerzo sugerido |
  |---|---|
  | Exploración, búsqueda de archivos, inventarios, capturas | `haiku` low–medium |
  | Cambios mecánicos, boilerplate, tests sencillos | `haiku` medium o `sonnet` low |
  | Features estándar de frontend/backend, tests de integración y e2e | `sonnet` medium–high |
  | Modelo de datos, migraciones, permisos, seguridad, concurrencia, lógica compleja, bugs difíciles | `opus` medium–high |
  | Revisor de corrección y cumplimiento de la spec | `sonnet` high u `opus` medium |
  | Revisor de casos límite, errores, seguridad y rendimiento | `opus` high |
  | Revisor de calidad y consistencia | `sonnet` medium–high |
  | Tester UI/UX con Playwright e `impeccable` | `sonnet` high |

- **Escalado:** si un subagente falla, se atasca o entrega poca calidad, se relanza con un
  nivel superior (sin pasar del techo). Si una tarea resulta trivial, se baja. No uses
  `opus` high para todo: reserva la máxima potencia para lo que lo justifique.
- Anota en `PROGRESO.md` el modelo y el esfuerzo de cada subagente, y el motivo si se
  escaló o se desvió de la guía.

### Paralelismo: entre tareas y entre fases

- **Límite:** como máximo 7 subagentes activos A LA VEZ. Puede crear tantos como necesite a
  lo largo del proyecto, pero nunca más de 7 en paralelo.
- El orquestador debe aprovechar el paralelismo siempre que sea seguro: puede lanzar varias
  tareas de una misma fase a la vez y también **avanzar varias fases en paralelo** (o
  adelantar trabajo de una fase posterior) si se cumplen TODAS estas condiciones:
  - Las dependencias están satisfechas. Por ejemplo, la UI que consume un endpoint puede
    empezar cuando el contrato de la API (rutas, tipos, payloads) esté fijado, aunque el
    endpoint aún no esté terminado.
  - Los conjuntos de archivos son disjuntos. Antes de lanzar cada subagente, el
    orquestador le **reserva** una lista explícita de archivos o carpetas; nadie toca nada
    fuera de su reserva y dos reservas activas nunca se solapan.
  - Los archivos compartidos (esquema de BD, migraciones, `package.json` y lockfile,
    configuración, rutas centrales, tipos globales, i18n, seeds) tienen un único dueño a la
    vez y sus cambios se hacen en serie.
  - Las migraciones y la instalación de dependencias van siempre en serie.
  - Los recursos compartidos no se pisan: la BD local y los puertos. Los tests e2e no
    corren a la vez que una migración; cada tester usa su propio puerto o el orquestador
    arranca un servidor compartido.
- **Ante la duda de si dos tareas se pisan, van en secuencia.**
- El paralelismo NO relaja el protocolo:
  - Cada fase pasa completa por IMPLEMENTAR → REVISAR → PROBAR y se cierra con su propio
    commit.
  - Solo el orquestador hace commits, uno por fase, añadiendo únicamente los archivos de
    esa fase (`git add` con rutas concretas, nunca `git add -A` con otra fase a medias).
  - Una fase no se cierra antes que otra de la que depende.
  - Los checks de cierre (lint, typecheck, build, tests) se ejecutan sobre el árbol
    completo; si otra fase en curso los rompe, el cierre espera o el orquestador coordina
    hasta que el árbol vuelva a estar en verde.
- Anota en `PROGRESO.md` qué fases y tareas corrieron en paralelo y con qué reservas.

### Encargo de cada subagente

El orquestador le pasa un encargo autocontenido, porque el subagente no tiene su contexto.
El encargo incluye:

- La línea de activación de `caveman` (ver arriba).
- Rol.
- REQs implicados.
- Archivos reservados que puede tocar y, explícitamente, que no puede tocar nada más.
- Contexto mínimo necesario (convenciones, contratos de API, rutas, comandos).
- Criterios de aceptación.
- Formato exacto de la respuesta (p. ej., lista de hallazgos con archivo, línea,
  descripción y nota 1–10; o resumen de cambios hechos y archivos modificados).
- Recordatorio: no hacer commits, no cambiar de rama, no lanzar subagentes, no desactivar
  tests ni reglas de lint.

### Reglas de independencia y verificación

- **Sin conflictos:** dos subagentes nunca editan los mismos archivos a la vez.
- **Independencia de los revisores:** un revisor nunca revisa código que haya escrito él
  mismo. Cada ronda de revisión usa subagentes NUEVOS.
- **Verificación del orquestador:** no se fía ciegamente de lo que reporta un subagente.
  Antes de cerrar una tarea comprueba que los cambios existen, que respetan la reserva de
  archivos y que lint, typecheck, build y tests pasan.
- **Registro:** el orquestador anota en `PROGRESO.md` qué subagentes lanzó en cada fase, con
  qué rol, modelo, esfuerzo y resultado.

### Añadidos para este proyecto

- Todo encargo a un subagente incluye además: la regla de oro (apartado 1.2) copiada tal cual, las prohibiciones de
  entorno (apartado 2.6) y la obligación de no tocar capturas de referencia ni fixtures de la fase 0 salvo encargo
  expreso.
- Los revisores de cada ronda reciben también la lista de métricas y escenarios afectados por la fase y las
  evidencias de antes y después.
- Un cambio que introduzca una diferencia visual no justificada se puntúa como mínimo con 7.

---

## 10. Protocolo por fase: IMPLEMENTAR → REVISAR → PROBAR

### 1. Implementar

- Implementa solo lo de la fase, repartiendo el trabajo entre subagentes especializados.
- Escribe o actualiza los tests automatizados (unitarios, de integración y e2e con
  Playwright) que cubran los criterios de aceptación de esos REQs.
- Antes de pasar a revisión, deben pasar lint, typecheck, build y toda la suite de tests
  (la anterior incluida, para detectar regresiones).

### 2. Revisar (bucle adaptativo por rondas)

- Cada ronda de revisión lanza en PARALELO 3 subagentes revisores nuevos, uno por enfoque:
  1. Corrección y cumplimiento de la spec.
  2. Casos límite, errores, seguridad y rendimiento.
  3. Calidad del código y consistencia con el código existente.
- El orquestador junta los hallazgos, elimina duplicados, ajusta las notas si están infladas
  o se quedan cortas, y reparte los arreglos.
- Cada hallazgo se puntúa del 1 al 10:
  - **1–4:** detalles cosméticos o de estilo. Opcional arreglarlos.
  - **5–6:** mejoras menores, poco relevantes. Se arreglan si son baratos; si no, se
    registran en el archivo de progreso.
  - **7–8:** problemas importantes (bug, requisito incompleto, mala UX, riesgo). Se
    arreglan obligatoriamente antes de la siguiente ronda.
  - **9–10:** críticos (rompe funcionalidad, pérdida de datos, seguridad). Se arreglan
    inmediatamente.
- Regla de parada (se aplica por RONDA):
  - Mínimo 2 rondas.
  - Si 2 rondas seguidas no tienen ningún hallazgo ≥7, se para.
  - Si siguen saliendo hallazgos ≥7, se hace otra ronda, y así sucesivamente.
  - Límite de seguridad: si tras 6 rondas siguen apareciendo hallazgos ≥7, para y documenta
    el bloqueo en `PROGRESO.md` con el análisis de la causa raíz. No entres en un bucle
    infinito.
- Tras cada ronda de arreglos se vuelven a ejecutar lint, typecheck y tests.

### 3. Probar (Playwright sobre el servidor local)

- Arranca el servidor en local y prueba como lo haría un usuario real.
- Usa la skill `impeccable` para evaluar el diseño y evitar resultados genéricos de IA
  ("AI-slop").
- Checklist obligatoria:
  - Todos los flujos de los REQs de la fase, de principio a fin.
  - Viewports de 375px (móvil), 768px (tablet) y 1440px (escritorio). Sin scroll
    horizontal ni elementos solapados o cortados.
  - Ninguna acción oculta o inaccesible: todo lo que se pueda hacer debe ser visible y
    descubrible.
  - Navegación completa con teclado, foco visible y comprobación con axe-core sin
    violaciones serias.
  - Consola sin errores ni warnings, y ninguna petición de red fallida.
  - Estados de carga, vacío y error, con mensajes claros y bien redactados.
  - Jerarquía visual, espaciado, tipografía y consistencia con el resto de la app.
  - Comodidad de uso: el mínimo de clics posible, feedback claro tras cada acción y
    confirmación en las acciones destructivas.
  - Modo oscuro, si la app lo tiene.
- Guarda capturas de cada pantalla y viewport en la carpeta `evidencias/fase-N/` (en este proyecto, la carpeta
  temporal fuera del repositorio del apartado 8.1; nunca en un commit).
- Lo que se detecte en las pruebas se puntúa con la misma escala. Si hay hallazgos ≥7:
  arreglar → revisión rápida → volver a probar.

### 4. Cerrar la fase

- Haz un commit por fase, en la rama actual, con un mensaje descriptivo y solo con los
  archivos de esa fase (nunca capturas ni evidencias: apartado 8.1).
- Actualiza `PROGRESO.md` (en la carpeta de la spec) con:
  - La fase completada.
  - Los subagentes lanzados, con su rol, modelo, esfuerzo y resultado.
  - Las fases o tareas que corrieron en paralelo.
  - Las rondas de revisión realizadas y sus hallazgos.
  - Las decisiones tomadas y las suposiciones hechas.
  - Los pendientes de nota baja.
- Este archivo sirve para retomar el trabajo si se pierde el contexto: léelo SIEMPRE al
  empezar.
- Después, pasa a la siguiente fase (o continúa con las que ya estén en marcha en paralelo).

### Aclaraciones del protocolo para este proyecto

Estas aclaraciones concretan la checklist anterior; no la sustituyen.

- **Regla de oro primero.** En «Probar», además de la checklist, se ejecuta la comparación visual completa (3.4) y las
  mediciones de los escenarios afectados por la fase, y se guardan en `evidencias/fase-N/` junto con la tabla «antes /
  después».
- **axe-core «sin violaciones serias»:** se interpreta como **ninguna violación seria o crítica nueva** respecto a la
  línea base de la fase 0. Las existentes que exigirían un cambio visible quedan fuera de alcance (apartado 6) y se
  listan en `PROGRESO.md`.
- **Estados, mensajes, clics y confirmaciones:** se verifican como **iguales a la línea base**. Esta spec no rediseña
  nada; si un revisor o tester propone una mejora visible de UX, se anota como sugerencia para el responsable en
  `PROGRESO.md` y **no** se implementa.
- **«Ninguna acción oculta»:** se verifica que no se ha ocultado nada que antes estuviera visible.
- **Modo oscuro:** la app tiene un único tema oscuro (tinta sumi); no hay modo claro. No aplica más allá de comprobar
  que el tema actual se ve igual.
- **Consola sin errores ni avisos:** sin errores ni avisos **nuevos** respecto a la línea base (los que ya existían se
  anotan; si se pueden quitar sin cambio visible, mejor).
- **`impeccable`:** se usa para confirmar que el aspecto no se ha degradado frente a la línea base, no para proponer un
  rediseño.
- Las pruebas con cámara y micrófono usan `apps/web/e2e/fake-media.js`; las pruebas son siempre en silencio.

---

## 11. Registro de progreso

### 11.1 Ubicación

`docs/specs/rendimiento-integral/PROGRESO.md`. Lo crea el implementador al empezar (apartado 0) y lo actualiza al
cerrar cada fase y cada vez que tome una decisión o suposición.

### 11.2 Qué debe contener siempre

- Commit de partida y fecha.
- Estado de cada fase (Pendiente · En curso · Hecha (commit) · Bloqueada (motivo)).
- Tabla de línea base y tabla «antes / después» de cada métrica afectada.
- Por fase: subagentes (rol, modelo, esfuerzo, resultado, escalados), tareas en paralelo y sus reservas, rondas de
  revisión con hallazgos y notas, decisiones y suposiciones, pendientes de nota baja.
- Diferencias visuales encontradas y su justificación.
- REQs condicionales (12, 13 miniaturas, 23.8) con su decisión final y mediciones.
- Sugerencias de UX recogidas (no implementadas).
- Apartado «Para el responsable» (apartado 12, paso 5).

### 11.3 Retomar

Si se pierde el contexto, el orquestador lee `PROGRESO.md` y continúa por la primera fase no cerrada, revisando que el
árbol de trabajo coincide con lo anotado (`git status`, `git log`).

### 11.4 Plantilla inicial

```markdown
# Rendimiento integral · Progreso

- Spec: docs/specs/rendimiento-integral/SPEC.md
- Rama: <rama actual al empezar> (no se cambia)
- Commit de partida: <hash> (<fecha>)

## Estado de las fases

| Fase | Estado | Commit |
| --- | --- | --- |
| 0 Herramientas y líneas base | Pendiente | |
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

## Línea base

(tabla de M-01…M-13 por escenario)

## Registro por fase

(una sección por fase con: subagentes, paralelismo, revisiones, decisiones, suposiciones, pendientes, antes/después)

## Diferencias visuales y su justificación

## Sugerencias para el responsable (no implementadas)

## Para el responsable: migraciones, despliegue y pruebas en dispositivo
```

---

## 12. Protocolo de cierre final

Cuando terminen todas las fases:

1. Suite completa de tests, más una prueba de regresión con Playwright de TODOS los flujos.
2. Una revisión global de todo el cambio, con el mismo bucle adaptativo por rondas.
3. Una tabla con cada REQ → estado → evidencia (test o captura) que lo demuestra.
4. Solo terminarás cuando todos los REQs estén verificados. Si algo no se ha podido
   completar, dilo explícitamente y explica por qué. Nunca lo des por hecho sin evidencia.

Concreción para este proyecto:

- En el paso 1, la regresión incluye la comparación visual completa (3.4) contra las referencias de la fase 0 en los
  tres anchos, en los proyectos de Playwright «móvil Chromium», «móvil WebKit» y «escritorio Chromium», y `pnpm db:test`.
- Además, se repiten **todas** las mediciones (S-01…S-17) y se guarda en `evidencias/cierre/` la tabla final «línea
  base / final / objetivo / cumple» de cada métrica.
- En el paso 3, los REQs condicionales (12, 13 miniaturas, 23.8) cuentan como verificados si están conservados con
  evidencias **o** descartados con sus mediciones y motivo.
- **Paso 5 · Entrega al responsable.** El implementador no despliega ni aplica migraciones. Deja en `PROGRESO.md`, en
  el apartado «Para el responsable», en este orden:
  1. Copia de seguridad de producción antes de nada (como en rondas anteriores).
  2. Lista ordenada de migraciones nuevas para aplicar en Supabase, con el aviso de que **deben aplicarse antes del
     despliegue** (el cliente nuevo las necesita), los tests SQL a ejecutar después y la comprobación de advisors.
  3. Regenerar `packages/shared/src/database.types.ts` desde el proyecto y comprobar que no hay diferencias con el
     editado a mano.
  4. Desplegar con `pnpm deploy:prod` desde la raíz (`docs/DEPLOY.md`).
  5. Lista de comprobaciones en dispositivos reales (Android de gama media e iPhone, en navegador y app instalada): LCP
     y fluidez percibida en biblioteca y estudio, pellizco de zoom en estudio y grabador, guardar y compartir tomas,
     repaso con gestos, separación de voz y copia para la nube con el estudio en uso, actualización de la PWA. Cómo
     medir en el móvil con Chrome remoto y las marcas `oneshoot:*`.
  6. Ruta absoluta de la carpeta temporal de evidencias (apartado 8.1), para que el responsable la revise si quiere y
     la borre después. El implementador no la borra.

---

## 13. Reglas generales para el agente implementador

- Trabaja de forma autónoma. Ante una ambigüedad menor, elige la opción más coherente con
  el código existente y anótala en `PROGRESO.md`.
- Trabaja siempre en la rama actual: no crees ramas, no cambies de rama ni uses worktrees.
- No amplíes el alcance ni refactorices cosas que no estén relacionadas.
- No desactives tests ni reglas de lint para que algo pase.
- Nunca uses el modelo `fable` ni superes Opus 5.5 con esfuerzo alto en ningún subagente.

Añadidos para este proyecto:

- La regla de oro (apartado 1.2) está por encima de cualquier objetivo de rendimiento: si chocan, gana la regla de oro.
- Ante una ambigüedad que afecte a lo que ve o hace el usuario, elige siempre «no cambiar nada» y anótalo.
- Respeta las convenciones del apartado 2.4 y las reglas de `CLAUDE.md` del repositorio.
- Mensajes de commit en el estilo del repositorio (Conventional Commits en inglés, por ejemplo
  `perf(studio): …`, `refactor(backend): …`, `chore(tooling): …`), uno por fase.
