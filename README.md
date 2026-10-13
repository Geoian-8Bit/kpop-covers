# One Shoot

Estudio de práctica para un grupo de **covers de K-pop**. Pega un enlace de YouTube o sube el vídeo del dance practice y:

- **Espejo** con un toque (o tecla `M`).
- **Velocidad** de 0.25× a 2× (presets 0.5 · 0.6 · 0.75 · 0.8 · 1 · 1.2 · 1.5 · 2 y ajuste fino de 0.05×).
- **Tramos A–B en bucle**, con pausa opcional entre repeticiones para volver a la posición.
- **Clips guardados** (con su velocidad y modo espejo) y **acceso rápido** desde la biblioteca.
- **Notas con tiempo** sobre el vídeo («aquí entra el giro»), visibles como puntos en la línea de tiempo.
- **Búsqueda de YouTube** desde la propia app (o pega el enlace).
- **Biblioteca compartida sin login**: un único grupo; quien tenga la URL ve y edita los mismos vídeos, clips y notas.
  Borrar desde la app solo **archiva** (deja de verse, pero se puede recuperar desde Supabase).

## Monorepo

```
apps/web            React 19 + Vite + Tailwind v4 + motion  (frontend + función Vercel /api)
  api/              Vercel functions (metadatos de YouTube vía oEmbed y búsqueda con la Data API v3)
  src/
    components/     shell, fondo seigaiha, sello hanko, primitivas UI (Button, ElasticToggle, Segmented, Dialog…)
    features/       library · studio · legal
    player/         motor de reproducción (YouTube IFrame / <video>), store zustand, loop controller
    data/           hooks React Query sobre lib/backend (Supabase o demo local)
    providers/      auth, grupo, toasts
packages/shared     tipos de BD, parseo de YouTube, tiempo, velocidad/rangos (+ tests vitest)
supabase/           migraciones SQL (tablas, RLS, storage, archivado) y comprobaciones (tests/)
docs/               arquitectura, diseño y despliegue
```

## Empezar

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # rellena URL y publishable key de Supabase
pnpm dev                                        # http://localhost:5173
```

Otros comandos: `pnpm build`, `pnpm typecheck`, `pnpm test`.

**Modo demo (solo local, sin login):** `VITE_DEMO=true pnpm dev`. Usa datos guardados en el navegador en lugar de
Supabase; nunca se incluye en la build de producción.

> Si tu red intercepta TLS (antivirus/proxy) y `/api/youtube-meta` falla en local, arranca con
> `NODE_OPTIONS=--use-system-ca pnpm dev`.

## Instalar como app (PWA)

- **Android / Chrome / Edge (PC):** botón **Instalar app** en la barra lateral (o en el menú de la cuenta en móvil),
  o el icono de instalar de la barra de direcciones.
- **iPhone / iPad:** Safari → Compartir → *Añadir a pantalla de inicio* (la app lo explica al tocar *Instalar app*).

El service worker precachea solo la interfaz: abre al instante, pero sin conexión la biblioteca no carga (los datos del
grupo están en Supabase). Cada despliegue se instala solo, pero espera a que salgas del estudio y no haya ningún
diálogo abierto, para no cortar un ensayo.
Iconos: `pnpm --filter @coverscape/web pwa-assets` los regenera desde `apps/web/public/favicon.svg`.

## Sobre descargar de YouTube

La app **no descarga** vídeos de YouTube: sus condiciones lo prohíben y bloquean los servidores que lo intentan
(Vercel incluido). En su lugar reproduce el vídeo original con la IFrame API y aplica espejo, velocidad y bucles
encima. Si el vídeo no se puede insertar o no quieres depender de YouTube, descárgalo por tu cuenta y súbelo como
archivo:

- ≤ 50 MB → se sube a Supabase Storage y lo ve todo el grupo.
- \> 50 MB → se queda en el dispositivo (IndexedDB). Los demás pueden "vincular" su propia copia del archivo y
  usar los mismos clips.

Más detalle en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DESIGN.md](docs/DESIGN.md) y
[docs/DEPLOY.md](docs/DEPLOY.md).
