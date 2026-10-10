# Despliegue

## Supabase (proyecto `kpop-covers`, ref `pevbjaowyctqqldvzovz`, eu-central-1)

1. Migraciones aplicadas: `supabase/migrations/*.sql` (en orden).
2. **Auth → Providers → Email → desactivar "Confirm email"**. El SMTP por defecto de Supabase solo envía a los
   miembros del equipo del proyecto, así que con la confirmación activa el resto de la crew no podría registrarse.
   (Alternativa: configurar un SMTP propio en Auth → SMTP.)
3. Auth → URL Configuration → *Site URL* = URL de producción de Vercel, y añadirla a *Redirect URLs*.

## Vercel

Proyecto con **Root Directory = `apps/web`** (framework Vite detectado; pnpm instala el workspace completo).

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

El proyecto Supabase **Argus** está **pausado** (no borrado): los datos se conservan. En el plan gratuito un
proyecto pausado se puede restaurar desde el dashboard durante 90 días; pasado ese plazo sigue siendo posible
descargar la copia de seguridad. Para reactivarlo: Dashboard → Argus → *Restore project*.
