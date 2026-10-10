# One Shoot

Estudio de práctica para un grupo de **covers de K-pop**. Pega un enlace de YouTube o sube el vídeo del dance practice y:

- **Espejo** con un toque (o tecla `M`).
- **Velocidad** de 0.25× a 2× (presets 0.5 · 0.6 · 0.75 · 0.8 · 1 · 1.2 · 1.5 · 2 y ajuste fino de 0.05×).
- **Tramos A–B en bucle**, con pausa opcional entre repeticiones para volver a la posición.
- **Clips guardados** (con su velocidad y modo espejo) y **acceso rápido** desde la biblioteca.
- **Biblioteca compartida**: un único grupo; todos los usuarios ven los mismos vídeos y clips.

## Monorepo

```
apps/web            React 19 + Vite + Tailwind v4 + motion  (frontend + función Vercel /api)
  api/              Vercel functions (backend ligero: metadatos YouTube vía oEmbed)
  src/
    components/     shell, fondo seigaiha, sello hanko, primitivas UI (Button, ElasticToggle, Segmented, Dialog…)
    features/       auth · library · studio
    player/         motor de reproducción (YouTube IFrame / <video>), store zustand, loop controller
    data/           hooks React Query sobre lib/backend (Supabase o demo local)
    providers/      auth, grupo, toasts
packages/shared     tipos de BD, parseo de YouTube, tiempo, velocidad/rangos (+ tests vitest)
supabase/           migraciones SQL (tablas, RLS, storage, RPCs)
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

El service worker precachea la interfaz (abre al instante y sin conexión) y se actualiza solo en cada despliegue.
Iconos: [ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT] None of the selected packages has a "pwa-assets" script los regenera desde .

## Sobre descargar de YouTube

La app **no descarga** vídeos de YouTube: sus condiciones lo prohíben y bloquean los servidores que lo intentan
(Vercel incluido). En su lugar reproduce el vídeo original con la IFrame API y aplica espejo, velocidad y bucles
encima. Si quieres trabajar offline, descarga el vídeo por tu cuenta y súbelo como archivo:

- ≤ 50 MB → se sube a Supabase Storage y lo ve todo el grupo.
- \> 50 MB → se queda en el dispositivo (IndexedDB). Los demás pueden "vincular" su propia copia del archivo y
  usar los mismos clips.

Más detalle en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DESIGN.md](docs/DESIGN.md) y
[docs/DEPLOY.md](docs/DEPLOY.md).
