# Revisión · Mejoras 1, 2, 16, 17 y 39 (menú rápido, versión, laboratorio, olas, cuenta atrás) · ronda 2

Revisor de solo lectura, 17-10-2026, rama `feat/plan-completo` (cambios sin confirmar).

## Alcance

Comprobación de los arreglos de la ronda 1 (`mejoras-nav-lab-ronda-1.md`) y de lo que hayan podido romper:

- Despliegue: `scripts/deploy.mjs`, script `deploy:prod` del `package.json` raíz, `apps/web/vite.config.ts`
  (`buildNumber`, `warnMissingVersion`), `docs/DEPLOY.md` y el procedimiento de `docs/plan/PROGRESO.md`.
- Versión: `features/nav/version/**` (appUpdate, versionRules+test, VersionCheck) y `main.tsx`.
- Menú rápido: `navDemoPresence.ts`, `NavDemo.tsx`, `QuickNav.tsx` (con `PlainQuickNav`), `quickNavCore.tsx`.
- `features/wishes/WishesPage.tsx` y `Ballot.tsx` (solo las barras con `--fab-clearance`).
- Olas: `features/voice/studioWave.ts`, `studioWaveRules.ts` (+test), `VoiceOlaAudio.tsx` y el nuevo
  `mediaUrl()` de `player/engine.ts`.
- `apps/web/vercel.json` (CSP) y `features/events/eventRules.ts` (Tsuki).

Comprobado además: `vitest` de nav, versión, lab, eventRules, waveRules y studioWaveRules (108 pruebas, todas pasan).
`node scripts/deploy.mjs --dry-run` → `Versión 112 · feat/plan-completo @ a40ed5c` y
`vercel --prod --yes -b APP_BUILD=112`, con el aviso de cambios sin confirmar; sale con 0. El JSON de `vercel.json`
se lee sin errores. Sin navegador ni servidores.

## Hallazgos de la ronda 1 → estado

| Ronda 1 | Estado | Notas |
| --- | --- | --- |
| [7] Sin número de versión en producción | **Parcial** | Lo técnico está bien. `deploy.mjs` cuenta `git rev-list --count HEAD`, falla si el clon es superficial (y también con un git antiguo que no lo sabe decir) y lanza un único `vercel --prod --yes -b APP_BUILD=<n>` desde la raíz (la carpeta enlazada con `kpop-covers`). `git` va sin shell, con `cwd` absoluto sacado de `fileURLToPath`, así que las rutas con espacios no le afectan. Solo enseña rama, commit y número. `resolveBuildNumber` da `null` en un clon superficial y `APP_BUILD` gana antes de llamar a git. `vite.config` avisa en amarillo en toda compilación de producción sin número. `DEPLOY.md` está bien explicado. **Falta** el procedimiento de `PROGRESO.md`: sigue diciendo `vercel --prod --yes` (hallazgo nuevo [6]). |
| [7] El botón flotante tapa las barras de /deseos y de la votación | Corregido | `max-lg:mr-[var(--fab-clearance,0px)]` en las dos barras (`WishesPage.tsx:405`, `Ballot.tsx:173`). En `Ballot`, la variante `max-lg:mr` va detrás de `-mx-1.5` y gana. No hay más `sticky`/`fixed` abajo fuera de diálogos, salvo los avisos (aceptado en la ronda 1). |
| [6] El botón de la demo choca con el real | Corregido | `Stage` usa `IntersectionObserver` (umbrales 0 y 0,3) y lo anota en `navDemoPresence`; al desmontar lo borra. `QuickNav` oculta el real con fundido y luego `invisible` + `aria-hidden`, así que no se puede tocar ni enfocar (ningún prototipo vuelve a poner `visible`). `--fab-clearance` y el `pb` no cambian: la página no salta. |
| [6] Memoria de B (posible cierre de la pestaña) | Corregido | `res.arrayBuffer()` directo cuando hay `Content-Length`, y lectura por trozos con tope cuando no lo hay. Límite de 60 MB, o 30 MB si `deviceMemory <= 4`; un archivo que lo pasa se rechaza antes de bajarlo. Sigue el pico de decodificar a la frecuencia original, pero ahora acotado por el tamaño. |
| [5] Descarga doble de la nube y sin cancelar | Corregido (con un efecto nuevo) | Desde la nube solo con wifi o cable, o con ratón si el navegador no dice el tipo de conexión. Nunca con «ahorro de datos». Hay un `AbortController` por trabajo y un contador de quién espera: el último en irse lo cancela, salvo que ya haya terminado. No se hizo el botón «Dibujar la ola (N MB)»: ver hallazgo nuevo [4] (iPhone). |
| [4] B encuentra el vídeo por el DOM | Corregido | `mediaUrl()` lee `currentSrc`/`src` del propio elemento (no guarda estado) y `withOffset` lo conserva al copiar el motor con `...engine`. `useStudioEnvelope` depende de la URL. Un archivo nuevo crea un motor nuevo, y la URL se recalcula al cambiar `engine` o `ready`. |
| [4] Sin navegación si el prototipo no carga | Corregido | `PlainQuickNav` hace de reserva con `MAIN_NAV`: Atrás, Esc, toque fuera, `replace` y foco igual que los prototipos. Usa `role="dialog"` al abrirse, así que la actualización automática lo respeta. Con `online` se reintenta con instancias `lazy` nuevas. Comentario corregido. |
| [4] El escenario de 520 px no cabe en horizontal | Corregido | `h-[min(520px,calc(100dvh-96px))]`. |
| [3] Navegación con retraso (Hanafuda) | Corregido | `pickTimer` se cancela en `close()`, en `toggle()` y al desmontar. |
| [3] Sin límites de tiempo en la comprobación | Corregido | `fetch` con `AbortSignal.timeout(10 s)` (y otra vía si el navegador no lo tiene), `reg.update()` con 15 s, y un trabajador que aún se está instalando cuenta como «hay versión nueva» (`installing`, probado). Recarga de seguridad a los 6 s en todos los caminos de `apply()`. Peor caso de «Buscando…»: ~45 s, luego «Descargando…» o un error. Correcto. |
| [3] Registro del laboratorio en el chunk principal | No (opcional) | `labState.ts` sigue importando `MOMENTS` de `registry.ts`. Menor, como se dijo. |
| [3] CSP sin `blob:` en `connect-src` | Corregido | `blob:` añadido, y también Hugging Face (`huggingface.co/<repo>/`, `api/resolve-cache/...` y `https://*.hf.co`). La directiva está bien formada. Tras una redirección, la CSP no mira la ruta, solo el host, así que las descargas que pasan por `*.hf.co` quedan cubiertas. Sigue siendo solo de aviso. |
| [3] Tsuki apagada en eventos lejanos | Corregido | `MOON_MIN_ILLUMINATION = 0.1`: la luna actual es siempre al menos un creciente fino, y las demás muestran su fase (las que vienen, más tenues). Tiene prueba. |
| [2] `isSafeMoment` duplicado | Corregido | `main.tsx` usa `!reloadNeedsConfirm(...) && !isManualCheckRunning()`. |
| [2] `<p>` y `role="status"` dentro de `role="menu"` | Corregido | La versión va dentro de un `role="group"` con `aria-label="Versión"`. |
| [2] En escritorio también se monta el prototipo | Corregido | `useDesktop()` (`matchMedia('(min-width: 64rem)')`, igual que `lg`) y no se monta. |
| [2] Estado de actualización compartido | Sin cambios (aceptado) | Cerrar el menú durante la pregunta ahora equivale a «Más tarde»: coherente. |
| [2] Capas de Sensu · [2] Avisos sobre el botón | Sin cambios (aceptado) | — |

## Hallazgos nuevos

- **[6] `docs/plan/PROGRESO.md:98-99` — el procedimiento de despliegue que siguen los agentes sigue lanzando
  `vercel --prod --yes`.** Es la línea que se usa en cada cierre de fase («… push, `vercel --prod --yes` UNA vez»).
  Si el próximo despliegue la sigue, producción sale sin `APP_BUILD`: «Versión de desarrollo» y «Buscar
  actualización» sin números que comparar. Es justo el [7] de la ronda 1, y el aviso amarillo solo sale en el log
  de compilación, que en ese flujo nadie lee. La ronda 1 pedía expresamente apuntarlo aquí. Además, la memoria del
  usuario (`memory/deploy-functional.md`) dice «Deploy with `vercel --prod` from the repo root». Esa no la toca un
  agente revisor, pero lleva al mismo error.
  **Arreglo:** cambiar en `PROGRESO.md` `vercel --prod --yes` por `pnpm deploy:prod` (desde la raíz del worktree
  limpio de main, que ya es un clon completo y tiene el `.vercel` de la raíz). Proponer al usuario el mismo cambio en
  esa memoria.

- **[4] `features/voice/studioWaveRules.ts:28-33` + `VoiceOlaAudio.tsx:49-55` — en iPhone, B nunca dibuja un archivo
  de la nube, y no dice por qué.** Safari no tiene `navigator.connection` y la pantalla es táctil, así que
  `remoteWaveAllowed(undefined, true)` siempre da `false`. Con datos móviles en Android pasa lo mismo. Solo funcionan
  las copias del móvil (`blob:`). La etiqueta dice «Forma de ejemplo», igual que con YouTube o con un archivo
  demasiado grande. Con 90–95 % del uso en móvil, el responsable que pruebe B en su iPhone con una canción subida
  verá siempre la forma de ejemplo y puede descartar la variante por eso.
  **Arreglo:** que `readBytes` distinga el motivo («not on this connection»: un estado `needs-consent`, por ejemplo)
  y, en ese caso, enseñar un botón «Dibujar la ola (descarga N MB)». El tamaño sale de una petición `HEAD` o del
  `size` guardado del archivo. Al tocarlo, que `loadEnvelope` acepte el permiso. Como mínimo, que la etiqueta diga
  «Forma de ejemplo · con wifi o con el archivo en el móvil».

- **[2] `scripts/deploy.mjs:55` — en Windows, Node 24 avisa en cada despliegue y los argumentos extra no van entre
  comillas.** `spawn('vercel', args, { shell: true })` imprime `[DEP0190] DeprecationWarning: Passing args to a
  child process with shell option true…` (comprobado con Node 24.18). El shell recibe los argumentos pegados sin
  comillas: uno con espacios se parte (`--meta "a b"` → `a`, `b`) y un `&` ejecutaría lo que venga detrás. Solo afecta
  a los argumentos que el propio usuario pasa, y `APP_BUILD=<n>` es seguro.
  **Arreglo:** en `win32`, montar una sola cadena con los argumentos entre comillas y lanzarla con
  `spawn(command, { shell: true })` sin array, o `spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', …])`.

- **[2] `scripts/deploy.mjs:51` — si se le pasa `--token`, lo enseña en pantalla.** La línea
  `[deploy] vercel ${vercelArgs.join(' ')}` repite todos los argumentos. Con `pnpm deploy:prod --token xxx`, el token
  queda en la consola y en cualquier log o captura.
  **Arreglo:** enmascarar el valor que sigue a `--token`/`-t` (y `--token=…`) en lo que se imprime.

- **[1] `features/voice/studioWave.ts:71-93` — `readCapped` tiene el archivo dos veces en memoria** (los trozos y la
  copia final) cuando la respuesta no dice su tamaño. El tope de 60/30 MB lo acota; con `blob:` y Supabase casi
  siempre hay `Content-Length`. Se puede dejar así.

- **[1] `features/nav/QuickNav.tsx:138-147` — el reintento solo llega con `online`.** Si la descarga del prototipo
  falla estando en línea, se queda la reserva sencilla hasta recargar. La reserva funciona bien. Opcional: reintentar
  también en `visibilitychange`.

## Veredicto

**Hay un hallazgo de 6 o más:** [6] `PROGRESO.md` sigue con `vercel --prod --yes` en el procedimiento de
despliegue, lo que anula en la práctica el arreglo del número de versión. Se arregla cambiando una línea de la
documentación, y conviene proponer al usuario el mismo cambio en su memoria `deploy-functional.md`.

Todo lo demás de la ronda 1 con nota ≥4 está bien corregido y sin regresiones. Conviene hacer en la misma pasada el
[4] de B en iPhone (botón para dibujar la ola o, al menos, explicar por qué no sale). Los [2] del script son
menores.
