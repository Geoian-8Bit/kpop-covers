# Despliegue

## Supabase (proyecto `kpop-covers`, ref `pevbjaowyctqqldvzovz`, eu-central-1)

1. Migraciones aplicadas: `supabase/migrations/*.sql` (en orden).
2. **Acceso abierto, sin login** (migración `open_access_single_group`): el rol `anon` puede leer y escribir vídeos, clips y
   ficheros, pero solo del grupo único (`private.default_group()`). Quien tenga la URL puede usar la app. Las cuentas
   existentes siguen funcionando, pero la interfaz ya no muestra login.
4. Auth → URL Configuration → *Site URL* = URL de producción de Vercel, y añadirla a *Redirect URLs*.

## Vercel

Proyecto `kpop-covers` (https://kpop-covers.vercel.app) con **Root Directory = `apps/web`** (framework Vite detectado; pnpm instala el workspace completo).

- Build command: `pnpm build` (por defecto) · Output: `dist`
- Variables de entorno (Production + Preview):
  - `VITE_SUPABASE_URL=https://pevbjaowyctqqldvzovz.supabase.co`
  - `VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…`
- `apps/web/vercel.json` añade el fallback SPA (excepto `/api/*`) y cabeceras de caché/seguridad.
- `apps/web/api/youtube-meta.ts` se despliega como función Node.

CLI:

```bash
vercel login
cd apps/web && vercel link        # elegir "kpop-covers", root apps/web
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_PUBLISHABLE_KEY
vercel --prod
```

## Argus (retirado)

El proyecto Supabase **Argus** está **pausado** (no borrado) y su proyecto de Vercel también (Settings → Resume para
reactivarlo). El código sigue en GitHub (`Geoian-8Bit/Argus`): los datos se conservan. En el plan gratuito un
proyecto pausado se puede restaurar desde el dashboard durante 90 días; pasado ese plazo sigue siendo posible
descargar la copia de seguridad. Para reactivarlo: Dashboard → Argus → *Restore project*.
