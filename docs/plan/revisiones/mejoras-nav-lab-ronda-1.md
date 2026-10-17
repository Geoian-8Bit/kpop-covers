# Revisión · Mejoras 1, 2, 16, 17 y 39 (menú rápido, versión, laboratorio, olas, cuenta atrás) · ronda 1

Revisor de solo lectura, 17-10-2026, rama `feat/plan-completo` (cambios sin confirmar).

## Alcance

- P1 · Menú de acciones rápidas: `features/nav/**` (navItems, navRules+test, quickNavCore, QuickNav, NavDemo,
  prototipos Sensu/Hanafuda/Kamon/Origami) y su montaje en `components/AppShell.tsx`.
- P2 · Menú «⋯», versión y «Buscar actualización»: `features/nav/version/**`, `main.tsx`, `vite.config.ts`,
  `vite-env.d.ts`, `features/settings/SettingsPage.tsx`, `apps/web/vercel.json` (sin cambios).
- P17 · Laboratorio: `features/lab/**` (types, registry, labState+test, DesignLabSection, moments).
- P16 · Olas de voz y música: `features/voice/` (VoiceOnda, VoiceOlaAudio, studioWave, Hokusai, Seigaiha, Compacta,
  Fusuma, Capas, VoiceSplitControl, VoiceSplitDemo, controlParts, waves.css, waveRules+tests).
- P39 · Cuenta atrás larga: `features/events/` (EventCountdown, EventCountdownDemo, eventRules+test, NextEventBanner,
  EventPage).

Comprobado además: `vitest` de nav, lab, waveRules, voiceDesigns y eventRules (102 pruebas, todas pasan) y una
compilación de producción en una carpeta temporal (no en `dist/`): `version.json` = `{"version":112,…}` en local; los
cinco chunks `*Demo-*.js` quedan fuera del precache del service worker y los prototipos del menú y las variantes de la
ola sí entran (funcionan sin red). Sin navegador (lo de 390×844 sale de leer el código y calcular posiciones).

## Hallazgos (de mayor a menor)

- **[7] `apps/web/vite.config.ts:15-19` + `docs/DEPLOY.md:44` — en producción no habrá número de versión.** El
  despliegue es `vercel --prod` desde la CLI: Vercel compila en remoto sin `.git` (la CLI no lo sube) y nadie pasa
  `APP_BUILD`, así que `__APP_VERSION__` = `null`. Resultado: la app de producción dice «Versión de desarrollo ·
  17-10-2026», `version.json` lleva `version: null` y «Buscar actualización» solo se fía del service worker. Si
  `registration.update()` tarda más de 20 s en bajar la versión nueva, `decideUpdate` responde «Ya tienes la última
  versión» mientras la nueva todavía se descarga, porque no tiene números que comparar. Eso incumple «un número que
  suba solo en cada despliegue, sin acordarse». Y si algún día el proyecto se conecta a Git, Vercel clona con poca
  profundidad y `git rev-list --count` daría siempre el mismo número pequeño.
  **Arreglo:** un script de despliegue (`scripts/deploy.mjs`, que en Windows funciona igual) que calcule
  `git rev-list --count HEAD` en local y lance `vercel --prod --yes -b APP_BUILD=<n>`. Llamarlo desde
  `pnpm deploy:prod` y apuntarlo en `DEPLOY.md` y en el procedimiento de `PROGRESO.md`. En `resolveBuildNumber`,
  devolver `null` si `git rev-parse --is-shallow-repository` dice `true`. Y en `vite build`, avisar con
  `console.warn` cuando `appVersion` sea `null` y `VERCEL_ENV === 'production'`, para que no pase desapercibido.

- **[7] `features/wishes/WishesPage.tsx:404` y `features/wishes/Ballot.tsx:172` — el botón flotante tapa acciones
  principales de las barras pegadas abajo de /deseos y de la votación.** Las dos barras son `sticky` a
  `bottom: env(safe-area-inset-bottom) + 12px` y ocupan todo el ancho. El botón flotante (z-42, 56 px, a 16 px de
  la esquina) queda encima de su tercio derecho. En «Elegir para votar» tapa «Crear votación» (`flex-[2]`, a la
  derecha). En la papeleta tapa el lado derecho de «Votar» y entero «Retirar mi voto» o «Deshacer cambios» cuando
  aparecen. El `pb` de `<main>` solo protege el final de la página, no lo que va pegado abajo. Solo `RpdPage.tsx:360`
  usa `--fab-clearance`.
  **Arreglo:** en las dos barras, `max-lg:mr-[var(--fab-clearance,0px)]` (o `pr` en su fila de botones), igual que
  en /rpd. Buscar más `sticky bottom` o `fixed bottom` en zonas que se estén cambiando ahora (bolsas, deseos).

- **[6] `features/nav/NavDemo.tsx:176` + `quickNavCore.tsx:268` + `AppShell.tsx:224` — confirmado: en Ajustes ›
  Laboratorio, el botón de la demo choca con el botón flotante real.** Cálculo a 390 px: el escenario de la demo
  acaba unos 30 px antes del borde derecho (`px-2.5` de la página más `px-5` de la sección), así que su botón ocupa
  x≈288–344. El real ocupa x≈318–374 y está fijo a 16–72 px del borde de abajo. En cuanto el final del escenario de
  520 px queda cerca del borde de abajo (que es justo como se mira entero en 844 px), los dos se solapan unos 26 px.
  El real va encima (z-42 sobre z-10), así que un toque abre el menú de verdad en vez de la demo. Además, dos
  botones iguales confunden: no se sabe cuál es la demo.
  **Arreglo:** mientras el escenario de una demo de navegación esté a la vista (`IntersectionObserver` en `Stage`
  con un umbral de ~0,3, que guarda `demoOnScreen` en un estado pequeño de `QuickNav.tsx`), ocultar con un fundido
  solo el botón real: `<QuickNav shown={quickNav && !demoOnScreen} />`. No tocar `--fab-clearance` ni el `pb` de
  `<main>`, para que la página no salte al desplazarse. Si se prefiere no ocultarlo, la alternativa es apartar el
  escenario: `max-lg:mr-[var(--fab-clearance)]` en el contenedor de `Stage`.

- **[6] `features/voice/studioWave.ts:91, 120-131, 140` — la variante B («Olas del audio real») puede tumbar la
  pestaña en el móvil.** Para un archivo local acepta hasta 200 MB y el «archivo» suele ser un vídeo MP4. Lo lee
  entero: `res.blob()` y luego `arrayBuffer()`, que lo copia otra vez, así que llega a ~2× el tamaño. Después
  `decodeAudioData` lo decodifica primero a la frecuencia original (4 min estéreo a 48 kHz en float32 ≈ 90 MB) y
  luego lo baja a 8 kHz. Al final quedan ~15 MB, no los ~8 MB del comentario (240 s × 8000 × 2 canales × 4 B). Con
  un vídeo de 150 MB, el pico pasa de 400 MB mientras el vídeo se reproduce en el estudio: en un Android medio,
  riesgo real de que el sistema mate la pestaña a mitad del ensayo. Pasa justo cuando el responsable pruebe B con
  un archivo de verdad.
  **Arreglo:** `res.arrayBuffer()` directo, sin el paso por `blob()`. Límite local mucho más bajo y según la memoria
  del móvil (p. ej. 60 MB, o 30 MB si `navigator.deviceMemory <= 4`), fuera de eso «Forma de ejemplo». Mejor aún,
  sacar la envolvente de lo que ya analiza la separación de voz (`voiceSplit.ts`) o irla dibujando mientras suena,
  sin decodificar el archivo entero.

- **[5] `features/voice/studioWave.ts:92, 133-138, 185-191` — B descarga el archivo de la nube por segunda vez, y
  la descarga no se cancela.** Un archivo en la nube de hasta 60 MB se baja entero aparte del que ya reproduce el
  `<video>`. Solo se evita con «ahorro de datos», que casi nadie activa: con datos móviles son 60 MB de golpe. El
  `AbortController` solo se usa si el archivo resulta demasiado grande. Al salir del estudio o cambiar de variante,
  la descarga y la decodificación siguen.
  **Arreglo:** en la nube, solo si ya hay copia local o con `connection.type === 'wifi'`; si no, un botón «Dibujar
  la ola (descarga N MB)». Pasar una señal de cancelación desde `useStudioEnvelope` que corte la descarga al
  desmontar, salvo que otro componente siga esperando el mismo resultado guardado.

- **[4] `features/voice/studioWave.ts:158-162` — B encuentra el vídeo por el DOM.** Usa
  `document.querySelector('[data-stage]')?.parentElement?.querySelector('video')`, que depende del marcado de
  `StudioPage.tsx:874`. Un cambio de estructura, o el `<video>` de la cámara del grabador o del repaso cerca, y lee
  otra cosa o nada. Además el efecto solo se repite si cambian `engine` o `ready`, no si cambia el `src` con el mismo
  motor. Va contra la norma de CLAUDE.md: el estado del reproductor, en `player/store.ts`.
  **Arreglo:** que el motor de archivo publique la URL de su fuente en el store (`mediaUrl`) y que
  `useStudioEnvelope` dependa de ella.

- **[4] `features/nav/QuickNav.tsx:74-86` — si el chunk del prototipo no carga, el móvil se queda sin navegación.**
  `Quiet` lo cambia por `null` y el comentario dice que «la barra de arriba sigue llegando a todas las páginas»,
  pero desde P2 el menú «⋯» ya no tiene las secciones: solo queda el logo, que lleva a Biblioteca. Pasa sin red antes
  de que el service worker termine el precache, o si falla la descarga. Como `lazy()` guarda el fallo, ni siquiera
  se reintenta al recuperar la red.
  **Arreglo:** como alternativa, un botón sencillo con la lista de `MAIN_NAV` (que ya va en el chunk principal), o
  reintentar con una instancia `lazy` nueva en el evento `online`. Corregir el comentario.

- **[4] `features/nav/NavDemo.tsx:176` — el escenario de 520 px no cabe en horizontal.** A 844×390, el escenario
  ocupa más que la pantalla (menos la barra de 64 px): no se ven a la vez el botón de abajo y el abanico o la mano de
  arriba, que es justo lo que se quiere probar.
  **Arreglo:** `h-[min(520px,calc(100dvh-96px))]`. Los prototipos ya se adaptan al tamaño que miden.

- **[3] `features/nav/quickNavCore.tsx:150-158` — una navegación con retraso puede saltarse una página del
  historial.** Con Hanafuda (340 ms de vuelo), si en ese tiempo se pulsa Atrás o se toca fuera, el menú se cierra,
  pero el `setTimeout(go)` sigue y hace `navigate(..., { replace: true })`. Como la entrada del menú ya se quitó,
  sustituye la página de origen y Atrás se la salta.
  **Arreglo:** guardar el temporizador y cancelarlo en `close()` y al desmontar, o comprobar que el menú sigue
  abierto antes de `go()`.

- **[3] `features/nav/version/appUpdate.ts:54, 136, 84` — sin límites de tiempo en una conexión que dice estar en
  línea pero no responde.** Ni `fetch('/version.json')` ni `reg.update()` tienen tiempo máximo: con red mala se
  queda en «Buscando…» varios minutos. Y en `apply()`, si `applyWaiting()` devuelve `true` pero no queda ningún
  service worker esperando (otra pestaña ya lo activó), se queda en «Actualizando…» para siempre.
  **Arreglo:** `AbortSignal.timeout(10_000)` en el `fetch`, un `Promise.race` de 15 s alrededor de `reg.update()`
  («No se pudo comprobar…») y una recarga de seguridad a los 6 s en todos los caminos de `apply()`.

- **[3] `features/lab/labState.ts:52` + `registry.ts` — todo el registro del laboratorio va en el chunk principal.**
  `QuickNav`, `EventCountdown`, `VoiceSplitControl` y `BagIcon` leen `useDesignVariant`, y `labState` importa
  `MOMENTS` entero. Por eso las descripciones de las 14+ variantes y los `lazy()` de las demos van en `index-*.js`
  (en la compilación están «Koyomi», «Hanafuda», «Ola partida»…). Son unos 5–6 KB sin comprimir: poco, pero no hace
  falta. Lo demás del arranque es razonable: `quickNavCore` y los prototipos van en chunks propios, y la versión
  pesa poco.
  **Arreglo:** un `labIds.ts` ligero (ids, variante por defecto y lista de ids de variantes) para `labState`, y
  descripciones y demos solo en `registry.ts`, que importa únicamente `DesignLabSection`.

- **[3] `apps/web/vercel.json` (CSP) — falta `blob:` en `connect-src`.** B hace `fetch()` de URLs `blob:` (copias
  locales), y `connect-src 'self'` no las cubre. Hoy la CSP es solo de aviso y no bloquea, pero el día que se active
  de verdad, B dejará de funcionar con archivos locales. `/version.json` sí está cubierto por `'self'` y no expone
  nada sensible (número de commits y fecha).
  **Arreglo:** añadir `blob:` a `connect-src` al activar la CSP.

- **[3] `features/events/eventRules.ts:230` — Tsuki repite el problema de origen en eventos lejanos.** Con 35 días
  o más, la luna está nueva (`illumination` 0) y toda la fila sale apagada: lo mismo que se criticó de Chōchin con
  más de 7 días. El número grande lo compensa, pero el dibujo no cuenta nada.
  **Arreglo:** que la escala vaya desde que se creó el evento hasta 7 días antes (como Sunadokei con `sandRun`), o
  una primera luna fina siempre encendida.

- **[2] `features/nav/version/VersionCheck.tsx:36` — el estado de la actualización es compartido.** Cerrar el menú
  «⋯» llama a `resetUpdateStatus()` y borra la pregunta «Actualizar ahora / Más tarde» que Ajustes pudiera estar
  mostrando. Caso raro: el menú cubre la página.
  **Arreglo:** no hace falta tocarlo; si acaso, borrar solo cuando no quede ningún `VersionCheck` montado.

- **[2] `main.tsx:28` y `versionRules.ts:72` — la regla del «momento seguro» está escrita dos veces.**
  `isSafeMoment` repite `reloadNeedsConfirm`, que sí tiene pruebas; si una cambia y la otra no, se separan.
  **Arreglo:** usar `!reloadNeedsConfirm(...) && !isManualCheckRunning()` en `main.tsx`.

- **[2] `components/AppShell.tsx:518` — dentro de `role="menu"` hay un `<p>` (versión) y un `role="status"`.** No
  son hijos válidos de un menú según ARIA; algunos lectores no leen la respuesta. El encabezado con el avatar ya lo
  hacía antes.
  **Arreglo:** envolver la versión en `role="group" aria-label="Versión"`, o sacar el mensaje de estado fuera del
  menú, junto al botón «⋯».

- **[2] `features/nav/prototypes/NavSensu.tsx:75-101` — capas grandes al abrir el abanico.** Seis cajas de 2r×r
  (≈620×310 px), recortadas con `clip-path` y animadas con muelle: con DPR 3 son ~7 MB de memoria gráfica cada una
  mientras dura la animación. Se mueve solo con `transform` y `opacity` (bien), pero en un móvil justo puede costar
  el primer fotograma.
  **Arreglo:** medir en un Android medio; si se nota, encoger cada caja al rectángulo de su cuña.

- **[2] `providers/ToastProvider.tsx:67` — los avisos tapan el botón flotante.** Van centrados abajo, con z-100 y
  hasta `max-w-md`: mientras se ven, cubren el botón. Es temporal y la acción del aviso sigue a mano. Aceptable.

- **[2] `features/nav/QuickNav.tsx:89-100` — en escritorio también se monta el prototipo** (oculto con `lg:hidden`)
  y se descarga su chunk. Ya está en el precache, así que el coste es casi nulo.
  **Arreglo:** opcional, montarlo solo si `matchMedia('(max-width: 1023px)')`.

### Lo que está bien (sin hallazgo)

- Menú rápido: destinos `MAIN_NAV` más «¿Quién eres?»; se cierra con Atrás (`useBackToClose`), Esc, un toque fuera y
  al elegir. `navigate(replace)` sustituye la entrada del menú, así que Atrás vuelve al origen de una vez. Foco dentro
  al abrir (en tu sección), atrapado con Tab y devuelto al botón. Nombre «Secciones. Estás en …». Se oculta en
  `/v/…` (que incluye el grabador y el repaso), en `/rpd/jugar` y en pantalla completa. Zona segura y 56 px en el
  botón; destinos ≥ 44 px en los cuatro prototipos. El dial se maneja con flechas, Inicio y Fin, y vibra solo
  mientras se arrastra. Con «reducir movimiento», todo es fundido (y `MotionConfig reducedMotion="user"`). Las
  geometrías caben a 390×844 y a 844×390 (Origami roza la barra de arriba en horizontal, sin cortarse).
- `--fab-clearance` y el `pb` de `<main>` se calculan bien con la zona segura. Los diálogos (z-50) quedan encima del
  botón, así que sus pies (p. ej. `TrackPage`) no chocan.
- Menú «⋯»: solo Ajustes, Instalar app, Privacidad y la versión (más «Cerrar sesión» si hubiera sesión).
- Actualización: `version.json` fuera del precache y pedido con `no-store` y `?t=`. `registration.update()`, espera
  al service worker nuevo y aplicación con `SKIP_WAITING`. En el estudio, con un diálogo o con algo guardándose,
  pregunta antes; sin red responde «Sin conexión». La comprobación manual impide que la automática recargue mientras
  dura. La automática respeta estudio, diálogos (también la ronda de RPD, que es `role="dialog"`) y lo que se esté
  guardando.
- Laboratorio: persistencia con try/catch, ids desconocidos limpiados, otra pestaña sincronizada, demos con `lazy`,
  `Suspense` y una barrera de error propia, chunks `*Demo-*.js` fuera del precache con caché `lab-demos` al
  usarlos. Ninguna demo crea audio (reloj simulado).
- Cuenta atrás: Chōchin desde 6 días (un farolillo), diseño largo con 7 o más; días de calendario del móvil (sin
  saltos por cambio de hora). La banda de 280×66 tiene la misma altura en todos los diseños (P8). El paso de uno a
  otro es un fundido más el encendido del primer farolillo; sin animación con «reducir movimiento».
- Olas: animación de deriva por CSS (`transform`), en pausa si no suena y quieta con «reducir movimiento»; la marca
  de reproducción de B se pinta sin renderizar React. Las tiras de 2400 px no se estiran en escritorio.

## Veredicto

**Hay cuatro hallazgos de 6 o más que hay que corregir:**

1. [7] Número de versión en producción: falta `APP_BUILD` en el despliegue y el aviso cuando no lo hay.
2. [7] El botón flotante tapa las barras pegadas abajo de /deseos y de la votación (`--fab-clearance`).
3. [6] El botón de la demo del laboratorio choca con el botón real (confirmado): ocultar el real mientras la demo
   está a la vista.
4. [6] Memoria de la variante B: `arrayBuffer` directo y un límite local mucho más bajo, o envolvente sin
   decodificar el archivo entero.

Los de 4–5 (descarga doble y sin cancelar de B, el vídeo buscado por el DOM, el menú sin alternativa si no carga, el
escenario en horizontal) conviene hacerlos en la misma pasada. El resto es menor.
