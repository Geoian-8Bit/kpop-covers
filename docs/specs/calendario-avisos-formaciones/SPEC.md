# SPEC · Calendario, avisos y formaciones (One Shoot)

Especificación para un agente implementador nuevo, sin contexto previo. Describe seis cambios sobre la app
One Shoot (repositorio `kpop-covers`): el arreglo de la zona de agarre de A/B en la línea de tiempo, la pantalla
completa vertical y horizontal, el calendario de ausencias, los horarios de ensayo, los avisos en el icono de la
app (Web Push) y el editor de formaciones. Incluye además dos piezas de infraestructura de comprobación: ESLint y
pruebas e2e con Playwright y axe.

Nombre de la spec: `calendario-avisos-formaciones`.

---

## 0. Arranque del implementador

### Paso 0 del implementador

- Nada más empezar, antes de leer nada más, comprueba si tienes disponible la skill
  `caveman`. Si la tienes, actívala. Si no, continúa sin ella.
- `caveman` se aplica a tu comunicación (mensajes, razonamiento visible, encargos y
  coordinación). NO se aplica al código, comentarios, tests, mensajes de commit, textos de
  la interfaz ni al contenido de `PROGRESO.md`, que siguen las convenciones del repo y deben
  ser comprensibles para otro agente sin contexto.
- Después lee `PROGRESO.md` (si existe) para retomar el trabajo, y luego esta spec.

### Primeros pasos concretos

1. Esta spec se entrega fuera del repositorio, en
   `/Users/iangiron/Downloads/kpop-covers-spec/docs/specs/calendario-avisos-formaciones/SPEC.md`.
   Si el repositorio todavía no contiene `docs/specs/calendario-avisos-formaciones/SPEC.md`, copia este archivo a
   esa ruta del repositorio (sin modificar su contenido).
2. Si `docs/specs/calendario-avisos-formaciones/PROGRESO.md` no existe, créalo con la plantilla de la sección 6.3.
   Si existe, léelo entero: indica en qué fase estás y qué queda pendiente.
3. Los dos archivos se añaden al commit de la fase 0.
4. Lee entera esta spec antes de lanzar ningún subagente.

---

## 1. Contexto del proyecto

### 1.1 Qué es la app

One Shoot es una PWA en español para un grupo de covers de K-pop. Sirve para ensayar coreografías: biblioteca de
canciones (vídeos de YouTube o archivos subidos), estudio con espejo, velocidad, bucle A–B y clips, grabación y
revisión de tomas, bolsas para sortear, lista de deseos y votaciones, Random Play Dance y eventos con cuenta atrás.

No hay inicio de sesión. Todo el que abre la app actúa con el rol `anon` de Supabase, y las políticas RLS lo limitan
al grupo por defecto (`private.default_group()`, el grupo más antiguo). La identidad de cada persona es una fila de la
tabla `members` que el usuario elige en el diálogo «¿Quién eres?»; el `id` elegido se guarda en `localStorage` con la
clave `oneshoot.me.v1` (ver `apps/web/src/data/members.ts`: `useIdentity`, `useMe`, `askWho`, `openWho`,
`currentMemberId`).

### 1.2 Stack

- Monorepo pnpm (`packageManager: pnpm@11.11.0`, Node ≥ 20).
- `apps/web`: React 19, Vite 7, Tailwind CSS v4, `motion`, `zustand`, TanStack React Query 5, `react-router` 7,
  `vite-plugin-pwa` (estrategia `generateSW` con Workbox, `registerType: 'prompt'`, registro manual desde
  `main.tsx`), `lucide-react`, `idb-keyval`, `onnxruntime-web`.
- `packages/shared`: TypeScript puro con tests vitest. Contiene tipos de dominio (`domain.ts`), los tipos generados
  de la base de datos (`database.types.ts`) y reglas puras (`time.ts`, `youtube.ts`, `playback.ts`…).
- `supabase/`: migraciones SQL en `supabase/migrations/` y scripts de comprobación SQL en `supabase/tests/*.sql`,
  ejecutados en local con PGlite mediante `pnpm db:test` (`supabase/tests/local/run.mjs` aplica todas las
  migraciones en orden sobre un stub de Supabase y ejecuta cada script de comprobación).
- Funciones serverless de Vercel en `apps/web/api/` (`youtube-meta.ts`, `youtube-search.ts`), servidas también en
  `vite dev` por el plugin `devApi` de `apps/web/vite.config.ts`.
- Despliegue en Vercel con `pnpm deploy:prod` (no lo ejecutes, ver sección 4).

### 1.3 Estructura relevante

- `apps/web/src/App.tsx`: rutas (carga diferida con `lazy`).
- `apps/web/src/components/AppShell.tsx`: carcasa; contiene `SideRail` (barra lateral de escritorio) y `MobileBar`.
- `apps/web/src/features/nav/`: menú rápido Hanafuda (`NavHanafuda.tsx`, `QuickNav.tsx`, `quickNavCore.tsx`),
  `navItems.ts` (`MAIN_NAV`: hoy 5 cartas 書 袋 願 舞 祭, más 誰 «¿Quién eres?»), `navRules.ts`.
- `apps/web/src/features/studio/`: estudio. `StudioPage.tsx` (incluye el hook `useFullscreen`, con modos
  `'none' | 'native' | 'css'`, que hoy bloquea la orientación en horizontal), `Timeline.tsx` (línea de tiempo con
  A–B; el componente `Handle` está al final del archivo), `fullscreenChrome.ts`, `mp4Mux.ts` (muxer MP4 propio),
  `cloudCopy*.ts` (recodificación con WebCodecs), `ClipList.tsx`.
- `apps/web/src/player/`: `store.ts` (único lugar con el estado del reproductor), `engine.ts`, `YouTubeStage.tsx`
  (recorta el iframe con `[&_iframe]:top-[-12%] [&_iframe]:h-[124%]` para ocultar el título de YouTube),
  `FileStage.tsx`, `ZoomLayer.tsx`, `useLoopController.ts`.
- `apps/web/src/features/review/`: revisión de tomas. No tiene marcadores A/B arrastrables.
- `apps/web/src/features/events/`: eventos (tabla `events` con `starts_at`, `place`), cuenta atrás.
- `apps/web/src/features/settings/SettingsPage.tsx`: Ajustes (ruta `/ajustes`).
- `apps/web/src/data/*.ts`: hooks de React Query por dominio (`members.ts`, `events.ts`, `clips.ts`…).
- `apps/web/src/lib/backend.ts`: capa de acceso a datos con dos implementaciones: Supabase y demo local
  (`IS_DEMO = import.meta.env.DEV && import.meta.env.VITE_DEMO === 'true'`, datos en el almacenamiento del
  navegador). Todo dato nuevo necesita las dos implementaciones.
- `apps/web/src/lib/motion.ts`: presets de animación (`jelly`, `snappy`, `soft`).
- `apps/web/src/index.css`: tokens de color (pigmentos tradicionales: `shu`, `ai`, `kin`, `enji`, `murasaki`,
  `fuji`, `sakura`, `rokusho`, `kiji`, `washi`, `sumi`…).
- `apps/web/src/lib/devSilence.ts`: silencia la consola en tests.
- `apps/web/e2e/fake-media.js`: script ya existente para simular cámara y micrófono en un navegador automatizado.
- `apps/web/vercel.json`: cabeceras (CSP en modo `Content-Security-Policy-Report-Only`).
- `docs/`: `ARCHITECTURE.md` (desactualizado), `DESIGN.md`, `DEPLOY.md`, `plan/` (historial de decisiones).
- `apps/web/PRODUCT.md` y `apps/web/.impeccable`: contexto de producto y diseño para la skill `impeccable`.

### 1.4 Convenciones (de `CLAUDE.md` y del código)

- Textos de la interfaz en español. Comentarios del código en inglés, breves, explicando el porqué.
- Estado del reproductor solo en `apps/web/src/player/store.ts`; los motores no guardan estado de UI.
- Animaciones con los presets de `src/lib/motion.ts`. Colores solo mediante tokens de `index.css`.
- Reglas puras en archivos `*Rules.ts` con su `*Rules.test.ts` al lado (vitest, entorno `node`, solo
  `src/**/*.test.ts` en `apps/web`). No hay tests de componentes.
- Los tests son siempre silenciosos: sin salida de consola (usar `devSilence.ts` si hace falta).
- Cambios de esquema: nueva migración `supabase/migrations/AAAAMMDDhhmmss_nombre.sql` (orden por nombre de archivo,
  posterior a `20261017140000_videos_storage_cap.sql`) y regenerar a mano `packages/shared/src/database.types.ts`
  de forma coherente con la migración (no hay acceso a la base de datos real).
- Patrón de tabla nueva (copiarlo de `supabase/migrations/20261016050000_events_and_reactions.sql`):
  - columnas `id uuid default gen_random_uuid()`, `crew_id uuid not null references public.crews on delete
    cascade`, `created_at`, `archived_at`;
  - triggers `before insert`: `private.set_group_crew()`, `private.stamp_new_row()`,
    `private.guard_simple_cap('N')`;
  - borrar = archivar: trigger `before delete` que convierte el `delete` en `archived_at`, y trigger `after delete`
    que bloquea borrados masivos (más de 3 filas por sentencia: error `bulk_delete_blocked`);
  - RLS que limita a `private.default_group()` y oculta lo archivado;
  - `grant update (columnas)` solo sobre las columnas editables.
- Cada migración nueva lleva su script `supabase/tests/<nombre>_checks.sql` que actúa como `anon`, imprime
  `PASS …`, lanza `FAIL …` ante el primer problema y termina con `ROLLBACK`.

### 1.5 Comandos

| Comando | Qué hace |
|---|---|
| `pnpm install` | Instala dependencias. |
| `pnpm dev` | Servidor de desarrollo en `http://localhost:5173` (contra Supabase real; NO usar para pruebas). |
| `VITE_DEMO=true pnpm --filter @coverscape/web dev --port 5174` | Modo demo con datos locales en el navegador. Es el servidor de todas las pruebas. |
| `pnpm typecheck` | `tsc --noEmit` en todos los paquetes. |
| `pnpm test` | vitest en todos los paquetes. |
| `pnpm db:test` | Aplica todas las migraciones en PGlite y ejecuta `supabase/tests/*.sql`. |
| `pnpm build` | Compila la web (incluye `tsc`). |
| `pnpm lint` | Nuevo en la fase 0 (ESLint). |
| `pnpm test:e2e` | Nuevo en la fase 0 (Playwright contra el modo demo). |

`.claude/launch.json` ya define `web` (5173), `web-demo` (5174, `VITE_DEMO=true`) y `web-preview` (4173).

### 1.6 Variables de entorno

- Existentes (`apps/web/.env.example`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `YOUTUBE_API_KEY`
  (solo servidor, opcional en local).
- Nuevas (fase 5):
  - `VITE_VAPID_PUBLIC_KEY`: clave pública VAPID para suscribirse a Web Push. Si falta, la app oculta el interruptor
    «Avisos» y no falla.
  - Secretos de la Edge Function (solo en Supabase, nunca en el repo): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
    `VAPID_SUBJECT` (`mailto:` del responsable) y `PUSH_WEBHOOK_SECRET`.
  - Añade las nuevas a `apps/web/.env.example` con valores vacíos y un comentario.

### 1.7 Datos de prueba

- Todas las pruebas son locales y con datos inventados. Nunca se usan datos reales del grupo.
- Interfaz: modo demo (puerto 5174). Los tests e2e siembran sus propios datos (miembros, vídeos, ausencias, horarios,
  planes de formación) mediante la propia interfaz o escribiendo en el almacenamiento del modo demo antes de cargar la
  página, con un helper en `apps/web/e2e/`.
- SQL: `pnpm db:test` con datos insertados dentro de cada script de comprobación, que termina en `ROLLBACK`.

### 1.8 Migraciones y producción

- El agente escribe las migraciones y las comprueba con `pnpm db:test`. NUNCA las aplica a la base de datos real, no
  despliega la Edge Function, no ejecuta `pnpm deploy:prod` y no usa herramientas MCP de Supabase contra el proyecto
  real.
- Todo lo que el usuario tenga que hacer en producción (aplicar migraciones, generar claves VAPID, guardar secretos,
  desplegar la Edge Function, crear el webhook de base de datos, añadir la variable en Vercel) se documenta paso a
  paso en una sección nueva de `docs/DEPLOY.md` (fase 5) y se resume en el mensaje final.

---

## 2. Requisitos funcionales

Formato de fechas en la interfaz y en los avisos: abreviaturas en español en minúscula (`lun`, `mar`, `miér`, `jue`,
`vie`, `sáb`, `dom`; `ene`, `feb`, `mar`, `abr`, `may`, `jun`, `jul`, `ago`, `sept`, `oct`, `nov`, `dic`). Horas en
24 h `HH:MM`. Todas las fechas y horas de calendario y horarios son de reloj de pared en `Europe/Madrid`.

### REQ-00 · Infraestructura de comprobación (ESLint y e2e)

**Descripción.** Hoy el repo no tiene linter ni pruebas e2e. Se añaden para que formen parte de las comprobaciones
de cada fase.

**Comportamiento esperado.**
- ESLint en configuración plana (`eslint.config.js` en la raíz) con `typescript-eslint` (recomendado) y
  `eslint-plugin-react-hooks` (recomendado), más `globals` para navegador, Node y service worker según la carpeta.
  Ignora `dist`, `dev-dist`, `node_modules`, `packages/shared/src/database.types.ts` y archivos generados.
- Script raíz `"lint": "eslint ."` (y el equivalente por paquete si hace falta).
- El código existente debe quedar en verde: se arreglan los avisos mecánicos (imports sin usar, `let` que puede ser
  `const`…). Las reglas que exigirían refactorizar código existente se bajan a `warn` en la configuración, cada una
  con un comentario que explique por qué. Ninguna regla se desactiva en línea para hacer pasar código nuevo.
- `pnpm lint` termina con código 0 (los `warn` se permiten; los `error`, no).
- Playwright: devDependencies `@playwright/test` y `@axe-core/playwright` en `apps/web`. Configuración
  `apps/web/playwright.config.ts`:
  - `webServer` que arranca el modo demo en el puerto 5174 (`VITE_DEMO=true`), reutilizando uno ya arrancado;
  - `outputDir` y la carpeta del reporte HTML dentro de
    `${TMPDIR:-/tmp}/calendario-avisos-formaciones-evidencias/playwright/` (nunca dentro del repo);
  - reporter `list` en consola (silencioso salvo fallos) y `html` con `open: 'never'` en la carpeta temporal;
  - proyectos de viewport: 375×812, 768×1024, 1440×900, 390×844 y 844×390.
- Script raíz `"test:e2e"` que ejecuta Playwright de `apps/web`. Specs en `apps/web/e2e/*.spec.ts`, reutilizando
  `fake-media.js` cuando haga falta cámara o micrófono.
- Un helper `apps/web/e2e/axe.ts` que ejecuta axe y falla con violaciones `serious` o `critical`.
- Un helper para sembrar datos en el modo demo y otro que falla el test si la consola muestra errores o warnings o
  hay peticiones fallidas.
- Un spec de humo (`smoke.spec.ts`) que abre la biblioteca en los cinco viewports, comprueba que no hay scroll
  horizontal y pasa axe.
- Comprueba que vitest no recoge los specs de Playwright y que `tsc` no se rompe con la carpeta `e2e`.

**Decisiones y motivo.** ESLint y e2e se piden para que el lint y las pruebas de interfaz formen parte de las
comprobaciones. Se usa el modo demo para no tocar nunca datos reales.

**Casos límite.** Si `eslint-plugin-react-hooks` trae reglas del compilador de React que fallan en código antiguo,
van a `warn` con comentario. El directorio temporal se resuelve con `os.tmpdir()` si `TMPDIR` no está definido.

**Estados de la interfaz.** No aplica.

**Criterios de aceptación.**
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm db:test`, `pnpm build` y `pnpm test:e2e` terminan en verde.
- Tras `pnpm test:e2e`, `git status` no muestra archivos nuevos generados por Playwright dentro del repo.

### REQ-01 · Agarre de A/B en la línea de tiempo

**Descripción.** En el estudio, al tocar cerca de la línea roja del bucle A–B se agarra el marcador A o B en lugar
de mover el tiempo. Además, cuando la línea amarilla del tiempo coincide con una línea roja no se puede mover.

**Causa (verificada en `apps/web/src/features/studio/Timeline.tsx`).** El componente `Handle` es una columna de
toque (`absolute -inset-y-3.5 z-10 w-7 cursor-ew-resize touch-none`, desplazada `-left-[15px]`/`-right-[15px]`) que
ocupa toda la altura del borde rojo, no solo el sello. El cabezal amarillo (`bg-kin-300`) es `pointer-events-none` y
el arrastre del tiempo nace en la pista (`begin(e.shiftKey ? 'select' : 'scrub', e)`), así que encima del borde rojo
gana siempre el `Handle`.

**Comportamiento esperado.**
- A y B solo se agarran tocando su sello (la etiqueta «A» arriba y «B» abajo). El área de toque de cada sello es de
  al menos 44×44 px, centrada en el sello.
- La línea roja del borde no captura eventos de puntero.
- Tocar o arrastrar en cualquier otro punto de la pista, también sobre la línea roja o la amarilla, mueve el tiempo
  (modo `scrub`). Mayúsculas + arrastre sigue creando una selección (`select`).
- El estado «solo A» (línea `w-0.5` con sello `size-5`) sigue la misma regla: solo el sello agarra A.
- El teclado y la accesibilidad de los marcadores no cambian.

**Decisiones y motivo.** Separar la zona de agarre de la línea evita agarrar A/B por error al buscar un momento
cercano. Solo afecta a la línea de tiempo del estudio, porque la revisión de tomas no tiene A/B arrastrables.

**Casos límite.** Cuando A y B están muy juntos, sus áreas de 44 px pueden solaparse: A está arriba y B abajo, así
que no compiten. Cuando el sello queda en el borde de la pista, su área de toque no debe salirse de forma que
provoque scroll horizontal.

**Interacción.** Clips, zoom y bucle siguen igual.

**Estados.** No aplica.

**Criterios de aceptación.**
- Pulsar sobre la línea roja a media altura y arrastrar mueve el tiempo y no mueve A ni B.
- Pulsar sobre el sello A y arrastrar mueve A; lo mismo con B.
- Con el cabezal amarillo encima de la línea roja, arrastrar desde ese punto mueve el tiempo.
- Proceso ligero: ver la excepción de la fase 1 en la sección 5.

### REQ-02 · Pantalla completa vertical y horizontal

**Descripción.** Hoy la pantalla completa del estudio fuerza el horizontal y usa un escenario 16:9, así que los
vídeos verticales (shorts y reels de YouTube, o archivos grabados en vertical) se ven pequeños y con bandas negras.

**Comportamiento esperado.**
- Solo cambia la pantalla completa del estudio. El escenario normal del estudio (`aspect-video`) y la pantalla de
  Random Play Dance (`RpdPlayPage.tsx`, que también bloquea el horizontal) se quedan como están.
- Al entrar en pantalla completa ya no se bloquea la orientación: la vista sigue cómo está el móvil.
- El vídeo se ajusta con su proporción real (`object-contain` o equivalente), centrado y lo más grande posible.
- Botón nuevo «Fijar orientación» en los controles de pantalla completa, con tres estados: automática (por defecto),
  vertical y horizontal. Su nombre accesible indica el estado actual.
  - En modo `native` (Android y navegadores que lo permiten) usa `screen.orientation.lock('portrait')` o
    `lock('landscape')`, y `unlock()` al volver a automática o al salir.
  - En modo `css` (iPhone, sin bloqueo posible) gira el contenido 90° con CSS cuando la orientación fijada no
    coincide con la del dispositivo, ocupando toda la pantalla, de modo que el resultado visual es el mismo.
  - Si el bloqueo falla, se usa el giro CSS como alternativa.
- Recorte de YouTube: el recorte del 24 % de `YouTubeStage.tsx` (que oculta el título) se elimina solo cuando el vídeo
  es vertical. En los vídeos horizontales se mantiene como ahora.
- Saber si un vídeo es vertical:
  - Archivo: `videoWidth` y `videoHeight` del elemento de vídeo.
  - YouTube: columna nueva `videos.aspect_ratio numeric null` (ancho / alto). Se rellena al añadir el vídeo: con
    la anchura y altura del oEmbed de YouTube si las devuelve (`apps/web/api/youtube-meta.ts` se amplía para
    devolverlas), o con `9/16` si la URL añadida es de tipo `/shorts/` (`packages/shared/src/youtube.ts` ya detecta
    ese formato). Si no se sabe (`null`), se trata como horizontal, que es el comportamiento actual.
  - Antes de implementar, comprueba con un short real qué devuelve el oEmbed y anótalo en `PROGRESO.md`.
- Los vídeos ya existentes quedan con `aspect_ratio` a `null`. No se hace ninguna migración de datos.

**Decisiones y motivo.** El usuario quiere que la pantalla completa detecte sola la orientación del móvil y tenga un
botón para cambiarla. Solo en pantalla completa, para no alterar el resto de pantallas.

**Casos límite.** El usuario gira el móvil con la orientación fijada (no cambia nada). Salir de pantalla completa con
el gesto atrás o la tecla Escape libera el bloqueo. En escritorio el botón no aparece si no tiene efecto. La columna
nueva necesita su `grant update` si es editable por el cliente, o se rellena solo en la inserción.

**Interacción.** Espejo, zoom (solo archivo), bucle, separación de voz y controles de pantalla completa
(`fullscreenChrome.ts`) siguen funcionando en las dos orientaciones.

**Estados.** Carga del vídeo como hoy. Si el bloqueo falla, no se muestra error: se aplica el giro CSS.

**Criterios de aceptación.**
- En 390×844 un archivo vertical en pantalla completa ocupa el alto de la pantalla sin bandas laterales grandes.
- En 844×390 un vídeo horizontal ocupa el ancho.
- El botón cambia de automática a vertical a horizontal y vuelve a automática. En modo CSS, la vista gira 90°.
- Un vídeo de YouTube con `aspect_ratio < 1` se ve sin recorte; uno horizontal mantiene el recorte.
- `RpdPlayPage` sigue bloqueando el horizontal como antes.
- `db:test` comprueba la columna nueva.

### REQ-03 · Calendario de ausencias

**Descripción.** Sustituye al Excel de Drive donde el grupo apunta quién no puede ir cada día.

**Comportamiento esperado.**
- Sección nueva «Calendario», ruta `/calendario`, carta nueva del menú Hanafuda con el kanji 暦 (tono a elegir entre
  los tokens existentes, distinto de los otros cinco) y entrada en la barra lateral de escritorio. El menú pasa de 5 a
  6 cartas, más 誰. Revisa que `NavHanafuda.tsx`, `QuickNav.tsx` y `navRules.ts` se ajustan sin solapes en 375 px.
- Vista mensual: semana empezando en lunes, mes anterior y siguiente, botón «Hoy». En cada día se ven:
  - los ensayos de ese día (REQ-04), con su hora;
  - los eventos existentes (tabla `events`), con su nombre;
  - un punto del color de cada miembro ausente (`MEMBER_SWATCH` de `data/members.ts`). Si hay más de 4, se muestran 3
    y «+N».
- Tocar un día abre su detalle: quién falta y cómo (todo el día, llega a las HH:MM o se va a las HH:MM, con la nota),
  los ensayos y los eventos. Si hay un ensayo y falta alguien, el ensayo muestra un aviso con el número de ausencias.
- Marcar una ausencia («Marcar ausencia»):
  - Persona: por defecto la de «¿Quién eres?». Si no hay identidad, se pide con `askWho`. Se puede cambiar a
    cualquier otro miembro (cualquiera puede marcar a cualquiera).
  - Fechas: un día o un rango de días consecutivos (desde–hasta).
  - Tipo, excluyente: «No puede» (todo el día, por defecto), «Llega a las HH:MM» o «Se va a las HH:MM».
  - Nota opcional de hasta 140 caracteres.
- Editar una ausencia: cambiar fechas, tipo, hora y nota. Quitar una ausencia («Ya puede»): pide confirmación y
  archiva la fila. Para quitar un solo día de un rango, se edita el rango.
- Sin importación del Excel.

**Modelo de datos (fase 3).** Tabla `public.absences`:
- `member_id uuid not null references public.members`;
- `starts_on date not null`, `ends_on date not null`, con `check (ends_on >= starts_on and ends_on - starts_on <=
  60)`;
- `kind text not null check (kind in ('all_day', 'arrives', 'leaves'))`;
- `at_time time null`, con `check ((kind = 'all_day') = (at_time is null))`;
- `note text null check (char_length(note) <= 140)`;
- `created_by_member uuid null references public.members` (quién lo marcó; lo envía el cliente desde
  «¿Quién eres?»);
- columnas y triggers del patrón de la sección 1.4, con un tope de filas razonable (por ejemplo 20000);
- `grant update` solo en `starts_on`, `ends_on`, `kind`, `at_time`, `note` y `archived_at`;
- índice por `(crew_id, starts_on)`.

Un rango es una sola fila, para que genere un solo aviso.

**Decisiones y motivo.** Día entero por defecto, con la opción de «llega» o «se va» a una hora, porque es lo que
pasa en la práctica. Cualquiera marca a cualquiera porque a veces avisa otra persona. La persona viene rellena con
«¿Quién eres?» porque lo normal es marcarse a uno mismo.

**Casos límite.**
- Rango con fin anterior al inicio: el formulario no deja guardar.
- Rango de más de 61 días: no se permite.
- Dos ausencias de la misma persona que se solapan: se permite y se muestran las dos en el detalle.
- Miembro archivado: sus ausencias pasadas se siguen viendo con su nombre en gris; no se puede marcar a un miembro
  archivado.
- Fechas pasadas: se pueden marcar y editar, pero no generan aviso (REQ-05).
- Sin conexión: el error se muestra con un toast y el formulario conserva lo escrito.

**Interacción.** Ensayos (REQ-04), avisos (REQ-05) y eventos (solo lectura).

**Estados de la interfaz.**
- Carga: esqueleto del mes.
- Vacío: el mes se ve igual, con el texto «Nadie ha marcado ausencias este mes» y el botón de marcar.
- Error: mensaje con «Reintentar».
- Éxito: toast «Ausencia guardada» y el día se actualiza al momento.

**Criterios de aceptación.**
- En el modo demo, marcar «No puede» del 8 al 12 crea una sola ausencia y se ven los puntos en los cinco días.
- «Llega a las 19:00» se ve en el detalle con la hora.
- La persona viene rellena con «¿Quién eres?» y se puede cambiar.
- Quitar pide confirmación y la ausencia desaparece.
- `db:test` comprueba los `check`, el archivado, el aislamiento por grupo y las columnas no editables.

### REQ-04 · Horarios de ensayo

**Descripción.** Ensayos que se repiten cada semana (por ejemplo, miércoles de 18:00 a 20:00 y viernes de 18:00 a
21:00), que se pueden crear, editar y borrar, con excepciones por fecha.

**Comportamiento esperado.**
- En `/calendario`, una sección «Horario de ensayos» lista las reglas semanales activas («Miércoles · 18:00–20:00»).
  Cualquiera puede crear, editar o borrar una regla.
- Editar una regla se aplica desde hoy: las semanas pasadas conservan el horario anterior. Se implementa cerrando la
  regla vieja (`valid_until = hoy - 1`) y creando una nueva (`valid_from = hoy`) en una sola RPC.
- Borrar una regla también se aplica desde hoy (`valid_until = hoy - 1`) y pide confirmación.
- Excepciones desde el detalle de un día:
  - «Cancelar este ensayo»: el ensayo de ese día sale tachado como «Cancelado». Se puede deshacer quitando la
    excepción.
  - «Añadir ensayo suelto»: fecha, hora de inicio y hora de fin.
- Los ensayos de cada día se calculan en el cliente a partir de las reglas vigentes en esa fecha y sus excepciones.
  Solo se guardan las reglas y las excepciones.
- El ensayo no lleva campo de lugar (decisión por defecto: el usuario no pidió el lugar).

**Modelo de datos (fase 3).**
- `public.rehearsal_rules`: `weekday smallint check (weekday between 1 and 7)` (ISO, 1 = lunes),
  `starts_at time`, `ends_at time` (`check (ends_at > starts_at)`), `valid_from date not null`,
  `valid_until date null`, más el patrón de la sección 1.4.
- `public.rehearsal_exceptions`: `on_date date not null`, `kind text check (kind in ('cancel', 'extra'))`,
  `rule_id uuid null references public.rehearsal_rules` (obligatorio en `cancel`), `starts_at time null` y
  `ends_at time null` (obligatorios en `extra`), más el patrón.
- RPC `public.edit_rehearsal_rule(p_rule uuid, p_weekday smallint, p_starts time, p_ends time)` y
  `public.end_rehearsal_rule(p_rule uuid)`, `security definer`, con `search_path` fijo y limitadas al grupo por
  defecto, usando `Europe/Madrid` para calcular hoy.
- Regla pura en el cliente: `apps/web/src/features/calendar/rehearsalRules.ts` (sesiones de un rango de fechas a
  partir de reglas y excepciones), con tests.

**Decisiones y motivo.** Calcular las sesiones en lugar de guardarlas evita generar filas sin fin. Editar desde hoy
protege el historial.

**Casos límite.**
- Dos reglas el mismo día que se solapan: se permite, pero el formulario lo avisa.
- Regla creada y editada el mismo día: la regla vieja queda con `valid_until < valid_from` y no produce sesiones
  (la regla pura debe tolerarlo).
- Cancelar un ensayo que ya tiene una cancelación: no duplica.
- Ensayo suelto el mismo día y a la misma hora que uno de la regla: se muestran los dos y se avisa al guardar.
- Cambio de hora (verano e invierno): no afecta, porque las horas son de reloj de pared.

**Interacción.** Calendario (REQ-03), avisos (REQ-05). El aviso de ausencias en un ensayo usa las ausencias de ese
día (todo el día o con hora).

**Estados de la interfaz.**
- Carga: esqueleto.
- Vacío: «Todavía no hay horario. Añade el primer ensayo semanal».
- Error: mensaje con «Reintentar».
- Éxito: toast y lista actualizada.

**Criterios de aceptación.**
- Crear «Miércoles 18:00–20:00» y «Viernes 18:00–21:00» los muestra en todos los miércoles y viernes desde hoy.
- Editar el miércoles a 18:00–21:00 cambia desde hoy y no cambia las semanas pasadas.
- Cancelar un viernes lo muestra tachado; añadir un sábado suelto lo muestra ese sábado.
- `rehearsalRules.test.ts` cubre reglas vigentes, cancelaciones, sueltos y reglas cerradas.
- `db:test` cubre las RPC y los `check`.

### REQ-05 · Avisos en el icono (Web Push) y punto en la app

**Descripción.** Cuando alguien cambia el calendario, las demás personas reciben un aviso del sistema y el icono de
la app muestra un indicador, como el punto rojo de WhatsApp.

**Contexto técnico.** La Badging API (`navigator.setAppBadge`) no funciona en Android. Android solo muestra un punto
en el icono cuando hay notificaciones sin leer. Por eso hacen falta notificaciones Web Push reales. `setAppBadge`
funciona en Chrome y Edge de escritorio y en apps web instaladas en iOS (16.4 o posterior) con permiso de
notificaciones. En iOS solo hay Web Push si la app está añadida a la pantalla de inicio.

**Comportamiento esperado.**
- Qué genera aviso (solo estos cambios, y solo si afectan a hoy o a fechas futuras en `Europe/Madrid`):
  - Marcar ausencia: «Ana no puede el sáb 8 nov». Con hora: «Ana llega a las 19:00 el sáb 8 nov» o «Ana se va a las
    20:00 el sáb 8 nov». En un rango hay un solo aviso: «Ana no puede del 8 al 12 nov» (entre meses: «del 30 oct al
    2 nov»).
  - Editar una ausencia: el texto nuevo con «Cambio: » delante.
  - Quitar una ausencia: «Ana ya puede el sáb 8 nov» (o el rango).
  - Crear o editar una regla semanal: «Desde el miércoles 5, ensayo los miércoles de 18:00 a 21:00».
  - Borrar una regla: «Desde el miércoles 5, ya no hay ensayo los miércoles».
  - Cancelar un ensayo: «Cancelado el ensayo del vie 7 nov». Quitar la cancelación: «Vuelve el ensayo del vie 7 nov».
  - Ensayo suelto: «Ensayo extra el sáb 8 nov de 18:00 a 20:00».
  - Eventos y formaciones NO generan avisos.
- Título de la notificación: «Calendario». Icono: el de la PWA. `tag` por fecha (`calendario-AAAA-MM-DD`), para que
  varios cambios del mismo día se sustituyan en la bandeja.
- Destinatarios: todas las suscripciones del grupo salvo las del miembro autor del cambio. El miembro marcado recibe
  el aviso aunque lo haya marcado otra persona. Una suscripción sin miembro asociado (dispositivo sin «¿Quién eres?»)
  recibe los avisos generales, pero no se puede excluir como autora.
- Tocar la notificación abre (o enfoca) la app en `/calendario?dia=AAAA-MM-DD`, con el detalle de ese día abierto.
- Icono: el service worker lleva la cuenta de avisos no vistos (en IndexedDB) y llama a
  `navigator.setAppBadge(cuenta)` donde exista. Al abrir la app, o al volver a ella, se llama a `clearAppBadge()` y
  la cuenta vuelve a 0. En Android (Samsung incluido) el punto lo muestra el sistema por la notificación.
- Dentro de la app: punto en la carta 暦 del menú rápido, en el botón del menú rápido y en la entrada de la barra
  lateral cuando hay cambios no vistos. «No visto» se calcula por dispositivo: cambios del feed (ver modelo) con
  `created_at` posterior a la marca guardada en `localStorage` (`oneshoot.calendar.seen.v1`) y cuyo autor no es el
  miembro de este dispositivo. Abrir `/calendario` actualiza la marca y quita el punto.
- Permiso:
  - Ajustes tiene un interruptor «Avisos» (activar: pide permiso y suscribe; desactivar: anula la suscripción y la
    borra en el servidor).
  - Una única sugerencia tras elegir «¿Quién eres?» por primera vez: «¿Quieres enterarte cuando alguien cambie el
    calendario?», con «Activar avisos» y «Ahora no». No se vuelve a mostrar si se rechaza (marca en
    `localStorage`).
  - En iOS sin instalar, el interruptor explica que hay que añadir la app a la pantalla de inicio (reutiliza lo que
    ya hace `components/InstallApp.tsx` si encaja).
  - Si el permiso está denegado en el navegador, el interruptor lo explica y no insiste.
  - Si falta `VITE_VAPID_PUBLIC_KEY` o estamos en modo demo, el interruptor no aparece (en demo puede aparecer
    simulado para las pruebas).

**Arquitectura (fase 5).**
- Feed de cambios: tabla `public.calendar_changes` (`crew_id`, `author_member uuid null`, `subject_member uuid
  null`, `target_date date`, `body text`, `created_at`). Solo lectura para `anon`; la escriben triggers
  `security definer` en `absences`, `rehearsal_rules` y `rehearsal_exceptions`. El texto en español se compone en
  SQL (función `private.calendar_change_text(...)` o similar) y se comprueba con `db:test`. Si la fecha afectada es
  pasada, no se inserta nada.
- Suscripciones: tabla `public.push_subscriptions` (`crew_id`, `member_id uuid null`, `endpoint text unique`,
  `p256dh text`, `auth text`, `created_at`, `last_ok_at`). `anon` no puede leerla. Se gestiona solo con RPC
  `security definer`: `public.save_push_subscription(p_endpoint, p_p256dh, p_auth, p_member)` (inserta o actualiza
  por `endpoint`) y `public.delete_push_subscription(p_endpoint)`. Al cambiar «¿Quién eres?», la suscripción se
  actualiza con el miembro nuevo.
- Envío: Edge Function `supabase/functions/notify-calendar/index.ts` (Deno, `npm:web-push`, claves VAPID desde
  secretos). Se invoca con un Database Webhook de Supabase en `insert` sobre `calendar_changes`, con la cabecera
  `x-webhook-secret` que la función compara con `PUSH_WEBHOOK_SECRET`. Lee las suscripciones con la service role
  (solo en el servidor), excluye al autor, envía el payload `{ title, body, tag, url }` y borra las suscripciones
  que responden 404 o 410. La lógica pura (destinatarios, payload) va en
  `supabase/functions/notify-calendar/rules.ts`, sin dependencias de Deno, con tests vitest (añade la ruta al
  `include` de un vitest existente o crea uno mínimo; no la dejes sin probar).
- Service worker: se mantiene `generateSW`. Se añade `public/push-sw.js` y se carga con `workbox.importScripts` en
  `vite.config.ts`. Ese archivo maneja `push` (muestra la notificación, incrementa la cuenta y llama a
  `setAppBadge`) y `notificationclick` (abre o enfoca `/calendario?dia=…`).
- Cliente: `apps/web/src/features/calendar/pushRules.ts` (soporte, estado del permiso, iOS instalado o no) con
  tests, y `apps/web/src/data/push.ts` para suscribir y anular.
- CSP: comprueba que `vercel.json` no bloquea nada nuevo (la suscripción la hace el navegador; el cliente solo habla
  con Supabase).
- Documentación en `docs/DEPLOY.md`: generar claves VAPID (`npx web-push generate-vapid-keys`), guardar secretos
  (`supabase secrets set …`), desplegar la función (`supabase functions deploy notify-calendar --no-verify-jwt`),
  crear el Database Webhook con la cabecera secreta, aplicar migraciones y añadir `VITE_VAPID_PUBLIC_KEY` en Vercel.

**Decisiones y motivo.** El punto del icono en Android solo existe con notificaciones reales. El feed en la base de
datos sirve a la vez para el envío y para el punto de dentro de la app. No hay Realtime en la app; el feed se lee
con React Query al abrir la app y al volver a ella.

**Casos límite.**
- Suscripción caducada (404 o 410): se borra.
- El mismo dispositivo se suscribe dos veces: el `endpoint` es único y se actualiza.
- El autor no tiene identidad: el aviso va a todos.
- Muchos cambios seguidos: un aviso por cambio, sustituidos por `tag` si son del mismo día.
- Permiso denegado o navegador sin soporte: la app funciona igual, sin avisos, y el punto de dentro de la app sí
  aparece.
- `anon` no puede leer ni modificar suscripciones ajenas ni insertar en el feed directamente.

**Estados de la interfaz.**
- Interruptor: «Activando…» mientras pide permiso.
- Error: «No se pudieron activar los avisos» con el motivo.
- Éxito: «Avisos activados».

**Criterios de aceptación.**
- `db:test`: insertar, editar o archivar una ausencia, una regla o una excepción futura crea una fila en el feed con
  el texto exacto; una fecha pasada no crea nada; `anon` no lee `push_subscriptions` ni escribe en el feed; las RPC
  funcionan.
- vitest: destinatarios (excluye al autor, incluye al marcado) y payload.
- e2e en modo demo: se simula un evento `push` en el service worker (o se llama al manejador con un payload de
  prueba) y se comprueba la notificación y el clic hacia `/calendario?dia=…`. El punto 暦 aparece con un cambio de
  otro miembro y desaparece al abrir el calendario.
- El envío real lo verifica el usuario en su móvil, después de desplegar. Se indica en el mensaje final.

### REQ-06 · Editor de formaciones: base (F-1)

**Descripción.** Editor visual de posiciones de los bailarines sobre el escenario, sincronizado con el vídeo de la
canción, inspirado en la app «Choreographic: Dance Formation» pero con el estilo de One Shoot (Hanafuda, pigmentos
tradicionales, tokens de `index.css`, presets de `motion.ts`). Muy visual e intuitivo.

**Comportamiento esperado.**
- En el estudio, el selector `Clips | Tomas` (componente `Segmented` en `StudioPage.tsx`) pasa a
  `Clips | Tomas | Formaciones`. La pestaña lista los planes de esa canción («Con 5», «Con 4 si falta alguien»…),
  con «Nuevo plan» y las opciones renombrar, duplicar y borrar (con confirmación; borrar = archivar).
- Crear un plan: nombre (hasta 60 caracteres), participantes (miembros del grupo que bailan en ese plan, todos
  marcados por defecto) y escenario (ancho × fondo en metros, 8×6 por defecto, rejilla de 0,5 m).
- Abrir un plan lleva al editor, ruta `/v/:videoId/formaciones/:planId`, con el mismo reproductor (YouTube o
  archivo) y el mismo `player/store.ts`. Disposición:
  - móvil en vertical: vídeo pequeño arriba, escenario en el centro, línea de tiempo abajo;
  - horizontal y escritorio: vídeo y escenario lado a lado, línea de tiempo abajo.
- Escenario 2D: rectángulo con la proporción del escenario, rejilla, línea central y lado del público marcado
  («Público»). Cada participante es un punto con su color de miembro y su inicial.
- Formaciones como fotogramas clave anclados al tiempo del vídeo. Cada una tiene el segundo en que se alcanza (`at`)
  y la duración de la transición hasta ella (por defecto 2 s). Entre dos formaciones, cada punto va en línea recta
  con interpolación suave.
- Línea de tiempo del editor: marcadores de cada formación; tocar uno salta a ese tiempo; arrastrarlo cambia `at`;
  arrastrar la pista mueve el tiempo (misma regla de agarre que REQ-01: solo el marcador agarra).
- «Añadir formación aquí» crea una formación en el tiempo actual, copiando las posiciones interpoladas de ese
  momento.
- Arrastrar puntos con el dedo o el ratón, con ajuste a la rejilla activado por defecto y conmutable. También con
  teclado: seleccionar un punto con Tab y moverlo con las flechas (paso de rejilla) y Mayúsculas + flechas (paso
  fino).
- Reproducción: al reproducir el vídeo, los puntos se mueven sincronizados. Velocidad, bucle A–B y espejo del
  estudio funcionan.
- Vista «Desde el público» o «Desde los bailarines» (espejo horizontal del escenario), enlazada con el espejo del
  estudio: activar el espejo del vídeo activa la vista desde los bailarines, y al revés.
- «Mi recorrido»: destaca al miembro de «¿Quién eres?» (o al que se elija), atenúa al resto y dibuja su trayectoria.
- Duplicar una formación (la copia se coloca 2 s después o en el tiempo actual si está libre).
- Deshacer y rehacer (historial en memoria de la sesión de edición, botones y Ctrl/Cmd+Z y Ctrl/Cmd+Mayúsculas+Z).
- Guardado: cada formación se guarda sola al soltar un punto o cambiar un dato (con un pequeño retardo). Si otro
  dispositivo ha cambiado el plan desde que se cargó, el guardado no se aplica y sale el aviso «Alguien ha cambiado
  este plan», con «Recargar» (descarta los cambios locales sin guardar de esa formación y carga la versión del
  servidor).
- No genera avisos al icono.

**Modelo de datos (fase 6).**
- `public.formation_plans`: `video_id uuid references public.videos`, `name text` (1–60), `stage_width numeric`
  (2–30, defecto 8), `stage_depth numeric` (2–30, defecto 6), `grid numeric` (defecto 0.5), `bpm numeric null`,
  `first_beat numeric null` (para REQ-09), `revision int not null default 0`, más el patrón de la sección 1.4.
- `public.formation_plan_members`: `plan_id`, `member_id`, único por plan y miembro, más el patrón.
- `public.formations`: `plan_id`, `at numeric` (segundos, ≥ 0), `transition numeric` (0–30, defecto 2),
  `positions jsonb` (objeto `{ [memberId]: { x, y } }` en metros desde la esquina del escenario, ampliable con
  `path` en REQ-08), `note text null` (REQ-07, hasta 280), `props jsonb` (REQ-10, defecto `[]`), más el patrón.
  Índice por `(plan_id, at)`.
- RPC `public.save_formation(p_plan uuid, p_expected_revision int, p_formation jsonb)` (crea o actualiza una
  formación, valida la estructura del `jsonb` y los límites del escenario, incrementa `revision` y la devuelve). Si
  `revision` no coincide, devuelve un conflicto sin escribir. Igual para borrar
  (`public.delete_formation(p_plan, p_expected_revision, p_formation_id)`) y para cambiar el plan.
- Reglas puras en `apps/web/src/features/formations/formationRules.ts` (interpolación, formación activa en un
  tiempo, ajuste a la rejilla, espejo, validación) con tests.
- Si un miembro se archiva, su punto sigue en el plan en gris con su nombre.

**Decisiones y motivo.**
- Los puntos son los miembros directamente, no partes de idols.
- Varios planes por canción, para cubrir ausencias.
- Guardado por formación con aviso de conflicto, en lugar de tiempo real, porque la app no usa Realtime y así nadie
  pisa a nadie sin enterarse.

**Casos límite.**
- Plan sin formaciones: estado vacío con «Añade la primera formación».
- Dos formaciones en el mismo segundo: no se permite (se desplaza 0,1 s y se avisa).
- Transición más larga que el hueco con la anterior: empieza en la formación anterior.
- Tiempo antes de la primera formación: posiciones de la primera. Después de la última: posiciones de la última.
- Participante añadido después: aparece en todas las formaciones en una posición libre a un lado del escenario.
- Participante quitado: deja de mostrarse; sus posiciones se conservan por si vuelve.
- Punto fuera del escenario al reducir el tamaño: se encaja dentro del borde.
- Vídeo sin duración conocida: la línea de tiempo usa la duración del reproductor cuando se conozca.

**Estados de la interfaz.**
- Carga: esqueleto del escenario.
- Vacío: escenario con los participantes en fila y el botón de añadir.
- Error al guardar: indicador «Sin guardar» y reintento.
- Conflicto: el aviso descrito.
- Éxito: indicador discreto «Guardado».

**Criterios de aceptación.**
- En el modo demo: crear un plan con 5 miembros, añadir tres formaciones en 0 s, 10 s y 20 s, colocar los puntos y
  reproducir. A los 9 s, los puntos están a mitad de camino hacia la segunda formación (transición de 2 s).
- El espejo del estudio invierte el escenario.
- Deshacer y rehacer funcionan.
- Simular un cambio de `revision` desde otro contexto muestra el aviso de conflicto.
- En 390×844 y 844×390 todo es visible y usable.
- `formationRules.test.ts` y `db:test` cubren interpolación, conflictos y validación.

### REQ-07 · Formaciones: edición rápida (F-2)

**Comportamiento esperado.**
- Fantasma: muestra, semitransparentes, las posiciones de la formación siguiente y una línea hacia ellas
  (conmutable).
- Plantillas: línea, V, V invertida, círculo, pirámide (triángulo), filas alternas («ventanas»). Se aplican a los
  participantes o a la selección, centradas, respetando la rejilla.
- Notas por formación (hasta 280 caracteres), visibles en el escenario y en la línea de tiempo.
- Selección múltiple (arrastrar un recuadro, o Mayúsculas + clic, o un modo «Seleccionar» en táctil) con las acciones
  voltear horizontal, voltear vertical, girar (pasos de 15°) y escalar, alrededor del centro de la selección.
- Intercambiar dos posiciones: con dos puntos seleccionados, «Intercambiar».

**Casos límite.** Plantilla con 1 persona (se coloca en el centro). Escalar o girar que saca puntos del escenario
(se encajan dentro). Selección vacía (las acciones se desactivan).

**Estados.** Igual que REQ-06.

**Criterios de aceptación.** Cada acción se puede deshacer. Las plantillas colocan a N participantes sin solaparse.
Hay tests puros de plantillas, voltear, girar, escalar e intercambiar.

### REQ-08 · Formaciones: recorridos (F-3)

**Comportamiento esperado.**
- Por punto y transición, el recorrido puede ser recto (por defecto), curvo (un punto de control arrastrable),
  con varios puntos intermedios, o dibujado a mano (se simplifica la línea y se guarda como una lista de puntos).
- Se guarda en `positions[memberId].path` de la formación de destino.
- Aviso de choque: si dos personas pasan a menos de 0,5 m en algún momento de una transición, se marcan en rojo
  ese tramo y los dos puntos, y aparece un aviso en la línea de tiempo. Se calcula muestreando la transición.

**Casos límite.** Recorrido dibujado muy corto (se convierte en recto). Borrar un punto intermedio. Choque en el
instante inicial (cuenta como choque).

**Criterios de aceptación.** Hay tests puros de interpolación en curva y en varios puntos, de simplificación del
trazo y de detección de choques. El e2e dibuja una curva y comprueba la posición a mitad de la transición.

### REQ-09 · Formaciones: ritmo (F-4)

**Comportamiento esperado.**
- Cuentas de 8: BPM y primer tiempo se ponen a mano en el plan, con un botón «Marcar al ritmo» (se toca al compás y
  se calcula el BPM con la mediana de los intervalos). La línea de tiempo del editor muestra los tiempos y numera
  los ochos (1–8). Opción «Ajustar formaciones al tiempo».
- Forma de onda real del audio, solo con archivo (no con YouTube): se calcula una vez (decodificando el audio, en un
  worker o con `heavyWork.ts` si encaja) y se dibuja bajo la línea de tiempo. Con YouTube no se muestra.

**Casos límite.** BPM fuera de 40–240 (no se acepta). Menos de 4 toques (no calcula). Archivo enorme (se reduce la
resolución de la onda). Archivo no disponible en este dispositivo (sin onda).

**Criterios de aceptación.** Tests puros del cálculo de BPM, de la posición de los tiempos y del ajuste al tiempo.
El e2e comprueba que la onda aparece con un archivo y no con YouTube.

### REQ-10 · Formaciones: atrezo (F-5)

**Comportamiento esperado.** Objetos en el escenario: silla, banco, marca libre (con texto corto) y escalón. Se
añaden, se mueven, se giran y se borran como los puntos, por formación (se guardan en `formations.props`), con
transición igual que las personas. Se distinguen visualmente de las personas y no cuentan en los choques entre
personas.

**Criterios de aceptación.** Añadir una silla, moverla entre dos formaciones y verla desplazarse al reproducir.
Tests puros de interpolación de atrezo.

### REQ-11 · Formaciones: exportar imagen y PDF (F-6)

**Comportamiento esperado.**
- «Exportar imagen»: PNG de la formación actual (escenario, puntos con nombre, nota, tiempo).
- «Exportar PDF»: una página por formación con el escenario, el tiempo (`m:ss`), los nombres, las notas y la vista
  elegida (público o bailarines). Se genera con `jspdf` cargado bajo demanda (import dinámico; nueva dependencia).
- La descarga usa el mecanismo de descarga del navegador o el diálogo de compartir donde exista.

**Criterios de aceptación.** El e2e descarga el PDF a la carpeta temporal y comprueba su número de páginas. El PNG
tiene el tamaño esperado.

### REQ-12 · Formaciones: exportar vídeo (F-7)

**Comportamiento esperado.**
- «Exportar vídeo»: MP4 de la animación del escenario de principio a fin del plan (o del bucle A–B si está activo),
  dibujada en un canvas, codificada con WebCodecs y montada con `apps/web/src/features/studio/mp4Mux.ts`.
- Con archivo local lleva el audio de la canción. Con YouTube va sin audio, y la interfaz lo dice antes de exportar.
- Progreso con porcentaje y botón «Cancelar». Si el navegador no tiene WebCodecs, el botón se desactiva con una
  explicación.

**Casos límite.** Cancelar a mitad (no se descarga nada). Plan muy largo (límite de 10 minutos). Falta de memoria
(error claro).

**Criterios de aceptación.** El e2e exporta un plan corto en modo demo y comprueba que el MP4 tiene la duración
esperada. Hay tests puros del cálculo de fotogramas.

### REQ-13 · Formaciones: vista 3D (F-8)

**Comportamiento esperado.**
- Botón «3D» en el editor. Abre una vista con `three` y `@react-three/fiber` (nuevas dependencias), cargada solo al
  abrirla (import dinámico; no debe entrar en el bundle principal ni en el precache del service worker, igual que
  `stemSeparator.worker` en `globIgnores`).
- Suelo del escenario con la rejilla y el lado del público. Cada miembro es una cápsula con su color y su inicial.
- Cámara que se gira con el dedo o el ratón, con atajos «Público», «Arriba» y «Lateral».
- Sincronizada con la reproducción, el tiempo y el atrezo (como cajas sencillas).
- Si WebGL no está disponible, el botón se desactiva con una explicación.

**Criterios de aceptación.** El chunk 3D no aparece en la carga inicial (comprobado en las peticiones de red del
e2e). La vista abre, gira y se sincroniza. Alternativa accesible: la vista 2D sigue siendo la principal.

---

## 3. Requisitos no funcionales

- **Responsive:** 375, 768 y 1440 px, más 390×844 y 844×390 (móvil vertical y horizontal). Sin scroll horizontal ni
  elementos cortados o solapados. Objetivos táctiles de al menos 44×44 px.
- **Accesibilidad WCAG AA:** contraste AA con los tokens existentes (hay tests en `lib/a11yTokens.test.ts`),
  navegación completa con teclado, foco visible, nombres accesibles en español, `prefers-reduced-motion` respetado
  (sin animación de transición entre formaciones al saltar), axe sin violaciones `serious` ni `critical`. El
  escenario de formaciones tiene alternativa en texto: lista de posiciones de la formación actual.
- **Rendimiento:** la reproducción de formaciones a 60 fps en un móvil de gama media (animación con
  `requestAnimationFrame`, sin rerender de React por fotograma). La vista 3D, el PDF, la onda y el exportador de
  vídeo se cargan bajo demanda. El tamaño del bundle principal no crece más de un 10 % (anota antes y después en
  `PROGRESO.md`).
- **Seguridad:** RLS en todas las tablas nuevas, limitadas a `private.default_group()`. `anon` no lee
  suscripciones push. Las RPC son `security definer` con `search_path` fijo. La service role y la clave VAPID
  privada solo existen en la Edge Function. El webhook va protegido con un secreto. Se validan todos los `jsonb` en
  el servidor. Topes de filas por tabla.
- **Consistencia visual:** estilo Hanafuda, tokens de color de `index.css`, presets de `motion.ts`, componentes de
  `components/ui`, tipografía y textos en el tono de la app (español, cercano). Usa la skill `impeccable` y
  `apps/web/.impeccable` y `docs/DESIGN.md` como referencia. La app solo tiene tema oscuro.
- **Sin conexión:** la app no debe romperse sin red. Los errores se muestran con el patrón actual de toasts.

---

## 4. Fuera de alcance

- No aplicar migraciones a la base de datos real, no desplegar (`pnpm deploy:prod`), no desplegar la Edge Function,
  no crear el webhook ni los secretos y no usar herramientas MCP de Supabase contra el proyecto real.
- No cambiar la pantalla de Random Play Dance ni el escenario normal del estudio (solo la pantalla completa).
- No importar el Excel de ausencias.
- No añadir lugar a los ensayos.
- No avisar por eventos ni por formaciones.
- No usar Supabase Realtime ni edición colaborativa en tiempo real.
- No añadir un tema claro.
- No refactorizar código que no esté relacionado. No actualizar dependencias existentes salvo que sea imprescindible
  (y se anota).
- No usar la tabla `follow_paths` (función retirada) ni reutilizarla para formaciones.
- No cambiar el modelo sin inicio de sesión.

---

## 5. Plan por fases

Cada fase deja la app compilando y funcional. Comprobaciones de cierre de cada fase (sobre todo el árbol):
`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm db:test` (si hay SQL), `pnpm test:e2e` y `pnpm build`.

Archivos compartidos con un único dueño a la vez (cambios en serie): `supabase/migrations/*`,
`packages/shared/src/database.types.ts`, `packages/shared/src/domain.ts`, `apps/web/src/lib/backend.ts`,
`apps/web/src/App.tsx`, `apps/web/src/features/nav/navItems.ts`, `apps/web/src/components/AppShell.tsx`,
`apps/web/vite.config.ts`, `package.json` y `pnpm-lock.yaml` de cualquier paquete, `eslint.config.js`,
`apps/web/playwright.config.ts`, `apps/web/src/features/studio/StudioPage.tsx`.

### Fase 0 · Arranque e infraestructura de comprobación
- **Objetivo:** spec y progreso en el repo; ESLint; Playwright con axe; helpers e2e.
- **REQs:** REQ-00.
- **Archivos:** `docs/specs/calendario-avisos-formaciones/SPEC.md`, `PROGRESO.md`, `eslint.config.js`,
  `package.json` (raíz y `apps/web`), `pnpm-lock.yaml`, `apps/web/playwright.config.ts`, `apps/web/e2e/*`, archivos
  con arreglos mecánicos de lint.
- **Dependencias:** ninguna.
- **Paralelizable con:** nada (toca `package.json`, el lockfile y potencialmente muchos archivos por el lint).
- **Terminado:** las seis comprobaciones en verde; el spec de humo pasa en los cinco viewports; ninguna salida de
  Playwright dentro del repo.

### Fase 1 · Agarre de A/B (proceso ligero)
- **Objetivo:** REQ-01.
- **REQs:** REQ-01.
- **Archivos:** `apps/web/src/features/studio/Timeline.tsx` y, si hace falta, una regla pura con su test.
- **Dependencias:** fase 0.
- **Paralelizable con:** fases 2 y 3 (archivos disjuntos).
- **Excepción de proceso (decidida por el usuario):** esta fase NO pasa por el bucle de revisión de la sección 8
  (sin rondas de 3 revisores) ni por la checklist de pruebas Playwright con capturas y viewports. Se implementa, se
  pasan las comprobaciones automáticas (`pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build`) y se hace el
  commit. Esta excepción se aplica solo a la fase 1. En el cierre final (sección 9) la regresión e2e sí incluye el
  flujo de A/B.
- **Terminado:** comprobaciones automáticas en verde, commit hecho y anotado en `PROGRESO.md`.

### Fase 2 · Pantalla completa vertical y horizontal
- **Objetivo:** REQ-02.
- **REQs:** REQ-02.
- **Archivos:** `StudioPage.tsx` (hook `useFullscreen` y controles), `studio/fullscreenChrome.ts`,
  `player/YouTubeStage.tsx`, `player/FileStage.tsx`, `apps/web/api/youtube-meta.ts`, `lib/youtubeMeta.ts`, el alta de
  vídeos en `features/library`, migración `…_video_aspect_ratio.sql` y su test SQL, `database.types.ts`,
  `backend.ts` (columna nueva, también en demo), reglas puras nuevas con test, `apps/web/e2e/fullscreen.spec.ts`.
- **Dependencias:** fase 0.
- **Paralelizable con:** fase 1. Con la fase 3 solo si la migración y `database.types.ts` de la fase 2 van antes
  (en serie) que los de la fase 3, y `backend.ts` tiene un solo dueño a la vez.
- **Terminado:** criterios de REQ-02 cumplidos con evidencia; protocolo completo de la sección 8.

### Fase 3 · Calendario y horarios: datos
- **Objetivo:** tablas, RPC, tipos, acceso a datos (Supabase y demo) y reglas puras de calendario y horarios.
- **REQs:** REQ-03 y REQ-04 (parte de datos).
- **Archivos:** migración `…_calendar.sql`, `supabase/tests/calendar_checks.sql`, `database.types.ts`,
  `domain.ts`, `backend.ts`, `apps/web/src/data/calendar.ts`, `apps/web/src/features/calendar/rehearsalRules.ts`,
  `calendarRules.ts` y sus tests.
- **Dependencias:** fase 0; migración después de la de la fase 2.
- **Paralelizable con:** fase 1; con la fase 2 según lo indicado arriba.
- **Terminado:** `db:test` y vitest cubren los criterios de datos de REQ-03 y REQ-04; protocolo completo (la parte
  de Playwright se limita a comprobar que nada se rompe, porque aún no hay interfaz).

### Fase 4 · Calendario y horarios: interfaz
- **Objetivo:** ruta `/calendario`, carta 暦, entrada en la barra lateral, vista mensual, detalle del día, formularios
  de ausencias, reglas y excepciones.
- **REQs:** REQ-03 y REQ-04.
- **Archivos:** `apps/web/src/features/calendar/*` (componentes), `App.tsx`, `navItems.ts`, `NavHanafuda.tsx`,
  `QuickNav.tsx`, `navRules.ts`, `AppShell.tsx`, `lib/pageTitle.ts`, `apps/web/e2e/calendar.spec.ts`.
- **Dependencias:** fase 3.
- **Paralelizable con:** fase 6 (formaciones), siempre que `App.tsx` y `backend.ts` tengan un solo dueño a la vez.
- **Terminado:** criterios de REQ-03 y REQ-04 con evidencia; protocolo completo.

### Fase 5 · Avisos
- **Objetivo:** feed de cambios, suscripciones, Edge Function, service worker, Ajustes, sugerencia, badge y punto en
  la app, documentación de despliegue.
- **REQs:** REQ-05.
- **Archivos:** migración `…_calendar_push.sql` y `supabase/tests/calendar_push_checks.sql`,
  `supabase/functions/notify-calendar/*`, `supabase/config.toml` (si hace falta declarar la función),
  `apps/web/public/push-sw.js`, `vite.config.ts`, `features/calendar/pushRules.ts`, `data/push.ts`,
  `features/settings/SettingsPage.tsx`, `data/members.ts` (sugerencia tras «¿Quién eres?»), componentes de navegación
  (punto), `apps/web/.env.example`, `docs/DEPLOY.md`, `database.types.ts`, `backend.ts`,
  `apps/web/e2e/push.spec.ts`.
- **Dependencias:** fases 3 y 4.
- **Paralelizable con:** las fases de formaciones que no toquen migraciones, `backend.ts`, `vite.config.ts` ni la
  navegación al mismo tiempo.
- **Terminado:** criterios de REQ-05 con evidencia (salvo el envío real, que verifica el usuario); protocolo
  completo.

### Fases 6 a 13 · Formaciones F-1 a F-8

| Fase | Subfase | REQ | Archivos principales | Depende de |
|---|---|---|---|---|
| 6 | F-1 Base | REQ-06 | migración `…_formations.sql` y su test, `database.types.ts`, `domain.ts`, `backend.ts`, `data/formations.ts`, `features/formations/*`, `StudioPage.tsx` (pestaña), `App.tsx` (ruta), `e2e/formations.spec.ts` | 0, 2 (por `StudioPage.tsx`), migraciones previas en serie |
| 7 | F-2 Edición rápida | REQ-07 | `features/formations/*` (plantillas, selección, notas) | 6 |
| 8 | F-3 Recorridos | REQ-08 | `features/formations/*` (recorridos, choques), validación del `jsonb` en una migración nueva | 7 |
| 9 | F-4 Ritmo | REQ-09 | `features/formations/*` (cuentas, onda) | 6 |
| 10 | F-5 Atrezo | REQ-10 | `features/formations/*`, validación de `props` en una migración nueva | 8 |
| 11 | F-6 Imagen y PDF | REQ-11 | `features/formations/export/*`, dependencia `jspdf` | 10 |
| 12 | F-7 Vídeo | REQ-12 | `features/formations/export/*`, reutiliza `mp4Mux.ts` | 10, 11 |
| 13 | F-8 3D | REQ-13 | `features/formations/three/*`, dependencias `three` y `@react-three/fiber`, `vite.config.ts` (`globIgnores`) | 10 |

- **Paralelizable con:** la fase 9 (ritmo) puede ir en paralelo con las fases 7 y 8 si se reservan archivos
  distintos dentro de `features/formations/` (por ejemplo, `beats*` y `waveform*` para la fase 9). Las fases 11, 12 y
  13 tocan `package.json` y el lockfile: las instalaciones de dependencias van en serie, pero el resto del trabajo
  puede solaparse con reservas disjuntas.
- **Terminado (cada una):** criterios de su REQ con evidencia; protocolo completo de la sección 8; commit propio.

### Grafo de dependencias

```
0 ──┬── 1
    ├── 2 ──────────────┐
    └── 3 ── 4 ── 5     │
         (migraciones   │
          en serie)     ▼
                        6 ──┬── 7 ── 8 ── 10 ──┬── 11 ── 12
                            │                  └── 13
                            └── 9
```

Orden de migraciones (en serie): fase 2 → fase 3 → fase 5 → fase 6 → fase 8 → fase 10. Si la fase 6 avanza antes
que la 5, la migración de formaciones toma el número siguiente al de la última migración aplicada en ese momento y
se anota.

---

## 6. Rama y archivos

### 6.1 Rama

- Se trabaja SIEMPRE en la rama actual del repositorio cuando empieza el agente. No se crean ramas, no se cambia de
  rama y no se usan worktrees.
- Un commit por fase, hecho solo por el orquestador, con `git add` de rutas concretas.

### 6.2 Rutas

- Spec: `docs/specs/calendario-avisos-formaciones/SPEC.md`.
- Progreso: `docs/specs/calendario-avisos-formaciones/PROGRESO.md`.
- Capturas y artefactos de prueba: `${TMPDIR:-/tmp}/calendario-avisos-formaciones-evidencias/fase-N/` (y
  `…/playwright/` para la salida de Playwright). Fuera del repositorio. Nunca se commitean. No se crea ninguna
  carpeta `evidencias/` dentro de `docs/specs/` y no se toca `.gitignore` para esto.

### 6.3 Plantilla inicial de `PROGRESO.md`

```markdown
# PROGRESO · calendario-avisos-formaciones

## Estado
- Fase actual:
- Última actualización:
- Carpeta de evidencias: ${TMPDIR:-/tmp}/calendario-avisos-formaciones-evidencias/

## Fases
| Fase | Estado | Commit | Notas |
|---|---|---|---|
| 0 | pendiente | | |
| 1 | pendiente | | proceso ligero |
| 2 | pendiente | | |
| 3 | pendiente | | |
| 4 | pendiente | | |
| 5 | pendiente | | |
| 6 | pendiente | | |
| 7 | pendiente | | |
| 8 | pendiente | | |
| 9 | pendiente | | |
| 10 | pendiente | | |
| 11 | pendiente | | |
| 12 | pendiente | | |
| 13 | pendiente | | |

## Registro por fase
(Por cada fase: subagentes con rol, modelo, esfuerzo y resultado; paralelismo y reservas; rondas de revisión y
hallazgos; capturas y qué muestran; decisiones y suposiciones; pendientes de nota baja.)

## Pasos de producción para el usuario
(Migraciones, claves VAPID, secretos, Edge Function, webhook, variable en Vercel.)

## Tabla final REQ → estado → evidencia
```

---

## 7. Orquestación con subagentes

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

---

## 8. Protocolo por fase: IMPLEMENTAR → REVISAR → PROBAR

> Excepción: la fase 1 sigue el proceso ligero descrito en la sección 5. El resto de fases siguen este protocolo
> completo.

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
- Haz capturas de cada pantalla y viewport y guárdalas SOLO en la carpeta temporal
  `${TMPDIR:-/tmp}/<nombre-spec>-evidencias/fase-N/`, fuera del repositorio. Nunca dentro
  del repo (ni en `docs/`, ni en `test-results/`, ni en ninguna carpeta versionada), y nunca
  se añaden a un commit. Configura Playwright (`outputDir`, rutas de `screenshot`) para que
  escriba ahí. En `PROGRESO.md` anota la ruta temporal y qué muestra cada captura.
- Si hace falta regenerar capturas, se regeneran en la carpeta temporal; nunca se
  sustituyen ni se añaden capturas versionadas en el repo.
- Lo que se detecte en las pruebas se puntúa con la misma escala. Si hay hallazgos ≥7:
  arreglar → revisión rápida → volver a probar.

### 4. Cerrar la fase

- Haz un commit por fase, en la rama actual, con un mensaje descriptivo y solo con los
  archivos de esa fase.
- Antes de cada commit, revisa `git status` y `git diff --cached --name-only`: no debe
  entrar ninguna captura ni imagen generada por las pruebas (`.png`, `.jpg`, `.webm`,
  reportes de Playwright, etc.). Si aparece alguna, quítala del stage. No hay commits
  dedicados a capturas.
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

### Notas de aplicación a esta spec

- `<nombre-spec>` es `calendario-avisos-formaciones`.
- Además de 375, 768 y 1440 px, se prueban 390×844 y 844×390 (móvil vertical y horizontal), porque la pantalla
  completa y el editor de formaciones dependen de la orientación.
- La app solo tiene tema oscuro: el punto «Modo oscuro» se cumple comprobando que todo se ve bien en ese tema.
- Servidor de pruebas: modo demo en el puerto 5174.

---

## 9. Protocolo de cierre final

Cuando terminen todas las fases:

1. Suite completa de tests, más una prueba de regresión con Playwright de TODOS los flujos.
2. Una revisión global de todo el cambio, con el mismo bucle adaptativo por rondas.
3. Una tabla con cada REQ → estado → evidencia que lo demuestra (nombre del test
   automatizado y/o ruta de la captura en la carpeta temporal fuera del repo). Esta tabla
   va en `PROGRESO.md` y en tu mensaje final; las capturas no se suben al repositorio.
4. Solo terminarás cuando todos los REQs estén verificados. Si algo no se ha podido
   completar, dilo explícitamente y explica por qué. Nunca lo des por hecho sin evidencia.

Además, en esta spec:

- La regresión incluye el flujo de A/B de la fase 1 y los flujos existentes que se tocan: estudio (clips, bucle,
  espejo, pantalla completa), biblioteca, eventos, menú rápido y Ajustes.
- El mensaje final incluye la lista de pasos de producción para el usuario (sección «Pasos de producción» de
  `PROGRESO.md` y `docs/DEPLOY.md`) y deja claro que el envío real de avisos debe verificarlo el usuario en su móvil
  después de desplegar.

### Reglas generales para el agente implementador

- Trabaja de forma autónoma. Ante una ambigüedad menor, elige la opción más coherente con
  el código existente y anótala en `PROGRESO.md`.
- Trabaja siempre en la rama actual: no crees ramas, no cambies de rama ni uses worktrees.
- No amplíes el alcance ni refactorices cosas que no estén relacionadas.
- No desactives tests ni reglas de lint para que algo pase.
- Nunca uses el modelo `fable` ni superes Opus 5.5 con esfuerzo alto en ningún subagente.
- Las capturas y demás artefactos de prueba viven solo en la carpeta temporal fuera del
  repo y nunca se commitean. Esta regla también va en el encargo de todo subagente que
  haga pruebas o capturas.
