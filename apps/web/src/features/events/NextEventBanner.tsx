import { motion } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { guardNav } from '@/components/AppShell';
import { useEvents } from '@/data/events';
import { useDesignVariant } from '@/features/lab/designLab';
import { snappy } from '@/lib/motion';
import { EventCountdown } from './EventCountdown';
import { nearestEvent } from './eventRules';
import { useNow } from './useNow';

/**
 * F16 · On the home page: the countdown to the nearest event still to come. Several events → the nearest; a
 * day after it started it stops showing on its own (nothing is deleted). Nothing at all without events.
 */
export function NextEventBanner() {
  // P8 · The events kept from the last visit show from the first paint (refreshed behind), so the banner is
  // already in place instead of arriving later and pushing the library down.
  const events = useEvents({ snapshot: true });
  const now = useNow();
  const variant = useDesignVariant('event-countdown');
  const event = nearestEvent(events.data ?? [], now);
  if (!event) return null;
  return (
    <motion.section
      aria-label="Próximo evento"
      // Fade only: no slide, so nothing around it moves while it appears.
      initial={events.isPlaceholderData ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={snappy}
      className="px-4 pt-4 sm:px-9 sm:pt-6"
    >
      <Link
        to={`/eventos/${event.id}`}
        onClick={guardNav}
        className="group flex items-center gap-2 rounded-[12px] border border-line bg-sumi-900/60 px-3 py-3 transition-colors hover:border-line-strong hover:bg-washi/[0.04] sm:px-5"
      >
        <EventCountdown
          variant={variant}
          name={event.name}
          startsAt={event.starts_at}
          createdAt={event.created_at}
          place={event.place}
          now={now}
          compact
          className="min-w-0 flex-1"
        />
        <span className="sr-only">Ver el evento y su repertorio</span>
        <ChevronRight aria-hidden className="size-5 shrink-0 text-washi-subtle transition-transform group-hover:translate-x-0.5" />
      </Link>
    </motion.section>
  );
}
