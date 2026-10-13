# Despliegue

## Supabase (proyecto `kpop-covers`, ref `pevbjaowyctqqldvzovz`, eu-central-1)

1. Aplicar las migraciones `supabase/migrations/*.sql` en orden y comprobar los advisors de Supabase.
2. **Crear el grupo a mano en un proyecto nuevo.** La app no crea grupos: usa el más antiguo
   (`private.default_group()`). Sin esa fila la app muestra «Revisa la conexión». En el SQL editor:

   ```sql
   insert into public.crews (name) values ('One Shoot');
   ```

3. **Acceso abierto, sin login:** el rol `anon` puede leer, crear y editar vídeos, clips, notas y archivos, pero solo
   del grupo por defecto. Quien tenga la URL puede usar la app; no hay pantalla de login ni hay que configurar Auth.
4. **Borrar = archivar:** lo que se borra desde la app queda con `archived_at` y deja de verse. Para recuperarlo,
   `update … set archived_at = null` (vídeo, y sus clips y notas con la misma marca de tiempo); para borrarlo de
   verdad, `delete` desde el SQL editor. Los archivos del bucket `videos` solo se borran desde el dashboard.
5. Comprobaciones tras cambios de permisos: `supabase/tests/archive_checks.sql` (termina en `rollback`, no deja nada).

## Vercel

Proyecto `kpop-covers` (https://kpop-covers.vercel.app) con **Root Directory = `apps/web`** (framework Vite detectado; pnpm instala el workspace completo).

- Build command: `pnpm build` (por defecto) · Output: `dist`
- Variables de entorno (Production + Preview):
  - `VITE_SUPABASE_URL=https://pevbjaowyctqqldvzovz.supabase.co`
  - `VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…`
  - `YOUTUBE_API_KEY=…` (solo servidor, **sin** prefijo `VITE_`): clave de YouTube Data API v3 para la búsqueda.
    Sin ella la búsqueda responde 503 y la app pide pegar el enlace. En `pnpm dev` sin clave salen resultados de prueba.
- `apps/web/vercel.json` añade el fallback SPA (excepto `/api/*`) y cabeceras de caché/seguridad.
- `apps/web/api/youtube-meta.ts` (oEmbed) y `apps/web/api/youtube-search.ts` (búsqueda; caché de 1 día en el edge más
  1 día sirviendo la copia antigua; redirige cada búsqueda a una única URL y limita a 20 búsquedas sin caché cada
  10 min por IP; cupo por defecto de YouTube ≈ 100 búsquedas/día) se despliegan como funciones Node.
- Fuera del código: en Google Cloud restringe `YOUTUBE_API_KEY` a la YouTube Data API v3 y pon una alerta de cuota.

CLI:

```bash
vercel login
cd apps/web && vercel link        # elegir "kpop-covers", root apps/web
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_PUBLISHABLE_KEY
vercel env add YOUTUBE_API_KEY
vercel --prod
```

## Argus (retirado)

El proyecto Supabase **Argus** está **pausado** (no borrado) y su proyecto de Vercel también (Settings → Resume para
reactivarlo). El código sigue en GitHub (`Geoian-8Bit/Argus`): los datos se conservan. En el plan gratuito un
proyecto pausado se puede restaurar desde el dashboard durante 90 días; pasado ese plazo sigue siendo posible
descargar la copia de seguridad. Para reactivarlo: Dashboard → Argus → *Restore project*.
