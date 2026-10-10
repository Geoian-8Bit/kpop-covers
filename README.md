# Coverscape

Estudio de práctica para crews de **covers de K-pop**. Pega un enlace de YouTube o sube el vídeo del dance practice y:

- **Espejo** con un toque (o tecla `M`).
- **Velocidad** de 0.25× a 2× (presets 0.5 · 0.6 · 0.75 · 0.8 · 1 · 1.2 · 1.5 · 2 y ajuste fino de 0.05×).
- **Tramos A–B en bucle**, con pausa opcional entre repeticiones para volver a la posición.
- **Clips guardados** (con su velocidad y modo espejo) y **acceso rápido** desde la biblioteca.
- **Biblioteca compartida por crew**: todos los miembros ven los mismos vídeos y clips.

## Monorepo

```
apps/web            React 19 + Vite + Tailwind v4 + motion  (frontend + función Vercel /api)
  api/              Vercel functions (backend ligero: metadatos YouTube vía oEmbed)
  src/
    components/     shell, fondo aurora, primitivas UI (Button, ElasticToggle, Segmented, Dialog…)
    features/       auth · crew · library · studio
    player/         motor de reproducción (YouTube IFrame / <video>), store zustand, loop controller
    data/           hooks React Query sobre Supabase
    providers/      auth, crew, toasts
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

> Si tu red intercepta TLS (antivirus/proxy) y `/api/youtube-meta` falla en local, arranca con
> `NODE_OPTIONS=--use-system-ca pnpm dev`.

## Sobre descargar de YouTube

La app **no descarga** vídeos de YouTube: sus condiciones lo prohíben y bloquean los servidores que lo intentan
(Vercel incluido). En su lugar reproduce el vídeo original con la IFrame API y aplica espejo, velocidad y bucles
encima. Si quieres trabajar offline, descarga el vídeo por tu cuenta y súbelo como archivo:

- ≤ 50 MB → se sube a Supabase Storage y lo ve toda la crew.
- \> 50 MB → se queda en el dispositivo (IndexedDB). Los demás pueden "vincular" su propia copia del archivo y
  usar los mismos clips.

Más detalle en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DESIGN.md](docs/DESIGN.md) y
[docs/DEPLOY.md](docs/DEPLOY.md).
