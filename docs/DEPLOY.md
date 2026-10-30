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

CLI (siempre desde la **raíz del repositorio**, que es la carpeta enlazada con `kpop-covers`; `apps/web/.vercel`
apunta a otro proyecto y no se usa):

```bash
vercel login
vercel link                       # en la raíz: elegir "kpop-covers" (Root Directory = apps/web)
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_PUBLISHABLE_KEY
vercel env add YOUTUBE_API_KEY
pnpm deploy:prod                  # despliegue a producción (no uses «vercel --prod» a secas)
```

### Número de versión (P2)

La app enseña «Versión N · fecha» (menú «⋯» y Ajustes) y «Buscar actualización» compara ese número con el de
`/version.json`. N es el número de commits de la rama desplegada, así que sube solo en cada despliegue.

- Vercel compila en remoto **sin `.git`** (la CLI no lo sube): no puede contar commits. Por eso el despliegue se
  lanza con `pnpm deploy:prod` (`scripts/deploy.mjs`), que cuenta en local `git rev-list --count HEAD` y ejecuta
  `vercel --prod --yes -b APP_BUILD=<N>`. Funciona igual en Windows. Los argumentos extra pasan a `vercel`;
  `pnpm deploy:prod --dry-run` solo enseña el número y el comando.
- El script se niega a desplegar desde un clon superficial (`git rev-parse --is-shallow-repository`): el número
  saldría pequeño y no subiría. En ese caso, `git fetch --unshallow`.
- Procedimiento habitual: copia limpia de `main` al día (clon completo), migraciones aplicadas antes, y un único
  `pnpm deploy:prod` desde la raíz.
- Si una compilación de producción sale sin número (alguien lanzó `vercel --prod` a mano, o un despliegue conectado a
  Git, que clona con poca profundidad), el log de la compilación muestra un **AVISO** en amarillo y la app dice
  «Versión de desarrollo». No rompe nada: «Buscar actualización» sigue funcionando con el service worker, pero sin
  números que comparar. Se arregla desplegando otra vez con `pnpm deploy:prod`.
- (No se llama `pnpm deploy` porque ese nombre es un comando propio de pnpm.)

## Avisos del calendario (Web Push, REQ-05)

Cuando alguien cambia el calendario (ausencias, ensayos semanales, cancelaciones, ensayos extra) la base de datos
escribe una fila en `public.calendar_changes` con el texto del aviso. Con eso ya funciona el **punto de dentro de la
app** (carta 暦, botón del menú rápido y barra lateral). El **aviso en el móvil** necesita además la Edge Function
`notify-calendar`, sus secretos, un Database Webhook y la clave pública en Vercel. Mientras falte cualquiera de esas
piezas la app funciona igual: sin `VITE_VAPID_PUBLIC_KEY` el interruptor «Avisos» de Ajustes no aparece, y sin la
función o el webhook simplemente no llega ningún aviso.

Orden (cada paso deja la app funcionando):

1. **Migración.** Aplicar `supabase/migrations/20261030120000_calendar_push.sql` (después de
   `20261030110000_calendar.sql`), comprobar los advisors y ejecutar `supabase/tests/calendar_push_checks.sql` en el
   SQL editor (termina en `rollback`). Desde aquí ya funciona el punto dentro de la app.
2. **Claves VAPID** (una sola vez; guárdalas en tu gestor de contraseñas):

   ```bash
   npx web-push generate-vapid-keys
   ```

   Da una clave pública y una privada. La privada no va nunca al repositorio ni a Vercel.
3. **Secretos de la función** (Supabase CLI con sesión iniciada; `PUSH_WEBHOOK_SECRET` es una cadena larga al azar,
   por ejemplo `openssl rand -hex 32`):

   ```bash
   supabase secrets set --project-ref pevbjaowyctqqldvzovz \
     VAPID_PUBLIC_KEY=<clave pública> \
     VAPID_PRIVATE_KEY=<clave privada> \
     VAPID_SUBJECT=mailto:<correo del responsable> \
     PUSH_WEBHOOK_SECRET=<secreto al azar>
   ```

   `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los pone Supabase en todas las funciones: no hay que crearlos.
4. **Desplegar la función** (desde la raíz del repositorio):

   ```bash
   supabase functions deploy notify-calendar --project-ref pevbjaowyctqqldvzovz --no-verify-jwt
   ```

   `--no-verify-jwt` porque la llama el webhook con su propio secreto, no un usuario (también está en
   `supabase/config.toml`).
5. **Database Webhook** (Dashboard → Database → Webhooks → Create a new hook):
   - Nombre `notify-calendar`, tabla `public.calendar_changes`, evento **Insert** (solo ese).
   - Tipo *HTTP Request*, método `POST`, URL `https://pevbjaowyctqqldvzovz.supabase.co/functions/v1/notify-calendar`.
   - Cabeceras: `Content-Type: application/json` y `x-webhook-secret: <el mismo PUSH_WEBHOOK_SECRET>`.
   - Timeout 5000 ms.
6. **Vercel:** añadir `VITE_VAPID_PUBLIC_KEY=<clave pública>` (Production + Preview) y desplegar con
   `pnpm deploy:prod`. Desde ese despliegue aparece el interruptor «Avisos» en Ajustes y la sugerencia tras elegir
   «¿Quién eres?» por primera vez.

   ```bash
   vercel env add VITE_VAPID_PUBLIC_KEY
   ```

7. **Prueba real en el móvil** (no se puede probar en local): en Ajustes, activar «Avisos» en dos móviles con
   personas distintas en «¿Quién eres?». Marcar una ausencia futura en uno: al otro le llega «Calendario · Ana no
   puede el …»; al tocarlo se abre el calendario en ese día. En el iPhone solo funciona con la app añadida a la
   pantalla de inicio (iOS 16.4 o posterior). En Android el punto del icono lo pone el sistema con la notificación.
   Si no llega nada: Dashboard → Edge Functions → `notify-calendar` → Logs (401 = secreto del webhook distinto;
   500 `vapid_not_configured` = faltan secretos), y Database → Webhooks para ver los envíos.

Notas:

- Las suscripciones (`public.push_subscriptions`) no las puede leer `anon`: solo las RPC
  `save_push_subscription` / `delete_push_subscription` y la función con la service role. Las que caducan (404/410)
  las borra la función.
- `calendar_changes` guarda 120 días; lo más antiguo se borra solo.
- Cambiar las claves VAPID invalida todas las suscripciones: cada persona tendrá que volver a activar «Avisos».

## Argus (retirado)

El proyecto Supabase **Argus** está **pausado** (no borrado) y su proyecto de Vercel también (Settings → Resume para
reactivarlo). El código sigue en GitHub (`Geoian-8Bit/Argus`): los datos se conservan. En el plan gratuito un
proyecto pausado se puede restaurar desde el dashboard durante 90 días; pasado ese plazo sigue siendo posible
descargar la copia de seguridad. Para reactivarlo: Dashboard → Argus → *Restore project*.
