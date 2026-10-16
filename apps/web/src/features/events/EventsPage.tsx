import { motion } from 'motion/react';
import { ChevronRight, MapPin, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { guardNav, Page } from '@/components/AppShell';
import { Seal } from '@/components/Seal';
import { Button } from '@/components/ui/Button';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { useEvents, type EventWithCount } from '@/data/events';
import { cn } from '@/lib/cn';
import { fadeUpCapped } from '@/lib/motion';
import { EventFormDialog } from './EventFormDialog';
import { countdown, countdownHeadline, eventDateLabel, splitEvents } from './eventRules';
import { useNow } from './useNow';

const cardIn = fadeUpCapped(0.05, 8);

/** F16 · /eventos: the group's events (to come, then past ones) and «Nuevo evento». */
export function EventsPage() {
  const events = useEvents();
  const now = useNow();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const { upcoming, past } = splitEvents(events.data ?? [], now);

  return (
    <Page className="px-2.5 py-3 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
      <div className="paper mx-auto max-w-4xl rounded-[10px] sm:rounded-[12px]">
        <header className="flex flex-wrap items-end justify-between gap-4 px-5 pb-6 pt-6 sm:px-9 sm:pt-8">
          <div className="min-w-0">
            <h1 className="font-display text-[28px] font-bold leading-tight sm:text-[34px]">Eventos</h1>
            <p className="mt-1 max-w-prose text-sm text-washi-subtle">
              Showcases, quedadas y concursos: con su repertorio y la cuenta atrás en la portada. Son de todo el grupo.
            </p>
          </div>
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden className="size-4.5" /> Nuevo evento
          </Button>
        </header>

        {events.isPending ? (
          <div className="sep-t space-y-3 px-5 py-7 sm:px-9">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="skeleton h-[84px] rounded-[12px]" />
            ))}
          </div>
        ) : events.isError && !events.data ? (
          <div role="alert" className="sep-t px-5 py-12 text-center sm:px-9">
            <p className="font-display text-xl font-bold">No pudimos cargar los eventos</p>
            <Button variant="secondary" className="mt-4" loading={events.isFetching} onClick={() => void events.refetch()}>
              Reintentar
            </Button>
          </div>
        ) : !events.data?.length ? (
          <div className="sep-t flex flex-col items-center px-6 py-14 text-center">
            <Seal glyph="祭" size={68} stamp />
            <h2 className="mt-6 font-display text-[26px] font-bold leading-tight">Aún no hay eventos</h2>
            <p className="mt-3 max-w-[46ch] text-washi-muted">
              Crea el próximo showcase: la portada contará los días que faltan y tendréis a mano las canciones que vais a
              bailar.
            </p>
            <Button size="lg" className="mt-7" onClick={() => setCreating(true)}>
              <Plus aria-hidden className="size-5" /> Crear el primer evento
            </Button>
          </div>
        ) : (
          <>
            <section aria-labelledby="events-next" className="sep-t px-5 py-7 sm:px-9">
              <SectionTitle id="events-next" glyph="暦" className="mb-4">
                Próximos
              </SectionTitle>
              {upcoming.length ? (
                <motion.ul initial="hidden" animate="show" className="space-y-3">
                  {upcoming.map((event, i) => (
                    <EventCard key={event.id} event={event} index={i} now={now} />
                  ))}
                </motion.ul>
              ) : (
                <p className="text-sm text-washi-muted">No hay ninguno por venir.</p>
              )}
            </section>
            {past.length > 0 && (
              <section aria-labelledby="events-past" className="sep-t px-5 pb-9 pt-7 sm:px-9">
                <SectionTitle id="events-past" className="mb-4">
                  Pasados
                </SectionTitle>
                <motion.ul initial="hidden" animate="show" className="space-y-3">
                  {past.map((event, i) => (
                    <EventCard key={event.id} event={event} index={i} now={now} past />
                  ))}
                </motion.ul>
              </section>
            )}
          </>
        )}
      </div>
      <EventFormDialog open={creating} onClose={() => setCreating(false)} onCreated={(e) => navigate(`/eventos/${e.id}`)} />
    </Page>
  );
}

function EventCard({ event, index, now, past }: { event: EventWithCount; index: number; now: Date; past?: boolean }) {
  const date = new Date(event.starts_at);
  const c = countdown(event.starts_at, now);
  return (
    <motion.li variants={cardIn} custom={index}>
      <Link
        to={`/eventos/${event.id}`}
        onClick={guardNav}
        className={cn(
          'group flex min-h-[84px] items-center gap-4 rounded-[12px] border border-line bg-sumi-900/60 px-3.5 py-3 transition-colors hover:border-line-strong hover:bg-washi/[0.04] active:scale-[0.99]',
          past && 'opacity-70',
        )}
      >
        {/* A small calendar leaf with the day. */}
        <span
          aria-hidden
          className="flex w-14 shrink-0 rotate-[-3deg] flex-col overflow-hidden rounded-[6px] bg-washi text-center text-sumi-900 shadow-[0_6px_12px_-8px_rgb(0_0_0/0.9)] transition-transform group-hover:rotate-0"
        >
          <span className={cn('py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-washi', past ? 'bg-sumi-600' : 'bg-shu-500')}>
            {date.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')}
          </span>
          <span className="font-display text-[24px] font-extrabold leading-9">{date.getDate()}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-[18px] font-bold text-washi">{event.name}</span>
          <span className="mt-0.5 block truncate text-[13px] text-washi-muted">
            {eventDateLabel(event.starts_at, past)}
          </span>
          <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-3 text-[12px] text-washi-subtle">
            {!past && <span className={cn('font-bold', c.kind === 'today' ? 'text-shu-400' : 'text-kin-300')}>{countdownHeadline(c)}</span>}
            <span>{event.songs === 1 ? '1 canción' : `${event.songs} canciones`}</span>
            {event.place && (
              <span className="flex min-w-0 items-center gap-1">
                <MapPin aria-hidden className="size-3 shrink-0" />
                <span className="truncate">{event.place}</span>
              </span>
            )}
          </span>
        </span>
        <ChevronRight aria-hidden className="size-5 shrink-0 text-washi-subtle transition-transform group-hover:translate-x-0.5" />
      </Link>
    </motion.li>
  );
}
