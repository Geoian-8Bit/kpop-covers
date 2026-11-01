import { Plus, LogOut, Settings } from 'lucide-react';
import { LayoutGroup, motion } from 'motion/react';
import { useId } from 'react';
import { Link, NavLink } from 'react-router';
import { CLIP_SWATCH, useQuickClips } from '@/data/clips';
import { useCalendarUnseen } from '@/data/calendar';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { useAuth } from '@/providers/AuthProvider';
import { useCrew } from '@/providers/CrewProvider';
import { WhoButton } from '@/features/members/MembersUI';
import { MAIN_NAV } from '@/features/nav/navItems';
import { InstallAppButton } from '../InstallApp';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Logo } from '../Logo';
import { guardNav } from './guardNav';
import { UnseenDot } from './UnseenDot';
import { warmAdd } from './warmAdd';

export function SideRail({ onAdd }: { onAdd: () => void }) {
  const { activeCrew, profile } = useCrew();
  const { user, signOut } = useAuth();
  const quick = useQuickClips(activeCrew?.id);
  const pinned = (quick.data ?? []).filter((c) => c.is_pinned).slice(0, 10);
  const calendarUnseen = useCalendarUnseen();
  const name = profile?.display_name ?? user?.email ?? 'Tú';
  // REQ-09 · A group id per mount: the rail is mounted afresh when the width crosses `lg`, and the `rail-active` pill
  // must start where its link is instead of resuming from the snapshot of a rail that is gone.
  const groupId = useId();

  return (
    <aside className="sticky top-0 z-30 hidden h-dvh flex-col border-r border-line-strong bg-sumi-950/95 shadow-[4px_0_0_-3px_rgb(228_200_143/0.16),16px_0_32px_-16px_rgb(0_0_0/0.8)] lg:flex">
      <Link
        to="/"
        aria-label="One Shoot · Biblioteca"
        onClick={guardNav}
        className="mx-3 mt-5 rounded-[10px] px-3 py-1"
      >
        <Logo />
      </Link>

      <div className="mt-6 px-4">
        <Button className="w-full" onClick={onAdd} {...warmAdd}>
          <Plus className="size-4.5" /> Añadir vídeo
        </Button>
      </div>

      <LayoutGroup id={groupId}>
        <nav aria-label="Principal" className="mt-6 space-y-0.5 px-3">
          {MAIN_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={guardNav}
              className={({ isActive }) =>
                cn(
                  'relative flex h-11 items-center gap-3 rounded-[10px] px-3 text-[15px] font-bold transition-colors',
                  isActive
                    ? 'bg-washi/[0.07] text-washi'
                    : 'text-washi-muted hover:bg-washi/[0.04] hover:text-washi',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="rail-active"
                      transition={jelly}
                      className="absolute inset-y-2.5 left-0 w-[3px] rounded-full bg-shu-500"
                    />
                  )}
                  <item.Icon className="size-4.5" /> {item.label}
                  {item.to === '/calendario' && calendarUnseen && (
                    <UnseenDot className="ml-auto" label="cambios sin ver" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </LayoutGroup>

      <div className="mt-7 flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2 px-6 pb-2">
          <span className="font-display text-[15px] font-bold text-washi">Clips fijados</span>
          <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-washi/20 to-transparent" />
          <span aria-hidden className="font-display text-[13px] font-bold text-shu-400">
            札
          </span>
        </div>
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
          {pinned.map((clip) => (
            <li key={clip.id}>
              <Link
                to={`/v/${clip.video_id}?clip=${clip.id}`}
                onClick={guardNav}
                className="group flex items-center gap-3 rounded-[10px] px-3 py-2 transition-colors hover:bg-washi/[0.05] active:bg-washi/[0.08]"
              >
                <span
                  className={cn(
                    'size-3.5 shrink-0 rotate-[-4deg] rounded-[3px] transition-transform group-hover:rotate-0',
                    CLIP_SWATCH[clip.color].dot,
                  )}
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-washi">{clip.name}</span>
                  <span className="block truncate text-xs text-washi-subtle">{clip.video?.title}</span>
                </span>
              </Link>
            </li>
          ))}
          {!quick.data && (quick.isError || quick.fetchStatus === 'paused') ? (
            // A failed load is not "nothing pinned".
            <li className="px-3 py-1 text-[13px] leading-relaxed text-washi-subtle">
              {quick.fetchStatus === 'paused' || !navigator.onLine
                ? 'Sin conexión.'
                : 'No se pudieron cargar.'}{' '}
              <button
                type="button"
                onClick={() => void quick.refetch()}
                className="font-medium text-kin-300 hover:underline"
              >
                Reintentar
              </button>
            </li>
          ) : (
            !quick.isPending &&
            pinned.length === 0 && (
              <li className="px-3 py-1 text-[13px] leading-relaxed text-washi-subtle">
                Fija un clip con la chincheta y aparecerá aquí, a un toque.
              </li>
            )
          )}
        </ul>
      </div>

      <div className="px-4 pb-3">
        <InstallAppButton compact />
        <WhoButton className="mt-1" />
        <NavLink
          to="/ajustes"
          onClick={guardNav}
          className={({ isActive }) =>
            cn(
              'mt-1 flex h-11 items-center gap-2.5 rounded-[10px] px-3 text-sm font-medium transition-colors',
              isActive
                ? 'bg-washi/[0.07] text-washi'
                : 'text-washi-muted hover:bg-washi/[0.04] hover:text-washi',
            )
          }
        >
          <Settings className="size-4" /> Ajustes
        </NavLink>
        <Link
          to="/privacidad"
          onClick={guardNav}
          className="mt-1 block px-3 py-1.5 text-xs text-washi-subtle transition-colors hover:text-washi-muted"
        >
          Privacidad y condiciones
        </Link>
      </div>

      {user && (
        <div className="flex items-center gap-3 border-t border-line px-4 py-3">
          <Avatar name={name} hue={profile?.avatar_hue} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-washi">{name}</p>
            <p className="truncate text-xs text-washi-subtle">{user?.email}</p>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Cerrar sesión" onClick={() => void signOut()}>
            <LogOut className="size-4" />
          </Button>
        </div>
      )}
    </aside>
  );
}
