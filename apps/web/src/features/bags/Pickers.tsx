import { formatTime, type Member } from '@coverscape/shared';
import { motion } from 'motion/react';
import { Check, Search } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { CLIP_SWATCH } from '@/data/clips';
import type { LibraryVideo } from '@/lib/backend';
import type { ClipWithVideo } from '@/lib/backend';
import { MemberSeal } from '@/features/members/MembersUI';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';

/**
 * Lists to pick from (songs, clips, people): each row is a toggle button, 44 px or more, with a search above when
 * the list is long. «Ya está» rows (already in the bag) show it and can't be picked again.
 */

interface PickListProps<T> {
  items: T[];
  selected: ReadonlySet<string>;
  onToggle: (item: T) => void;
  /** Already there: shown with a mark, not selectable. */
  taken?: ReadonlySet<string>;
  takenLabel?: string;
  emptyText: string;
  className?: string;
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="well mb-2 flex h-11 w-full items-center gap-2 rounded-[10px] px-3.5 focus-within:border-kin-300/70">
      <Search aria-hidden className="size-4 text-washi-subtle" />
      <span className="sr-only">Buscar</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
      />
    </label>
  );
}

function Row({
  on,
  taken,
  takenLabel,
  onClick,
  children,
}: {
  on: boolean;
  taken: boolean;
  takenLabel: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <li>
      <motion.button
        type="button"
        aria-pressed={taken ? undefined : on}
        disabled={taken}
        onClick={onClick}
        whileTap={taken ? undefined : { scale: 0.98 }}
        transition={jelly}
        className={cn(
          'flex min-h-12 w-full items-center gap-3 rounded-[10px] px-2.5 py-1.5 text-left transition-colors',
          on ? 'bg-ai-700/50 ring-1 ring-ai-400/60' : 'hover:bg-washi/[0.05]',
          taken && 'opacity-60',
        )}
      >
        {children}
        <span
          aria-hidden
          className={cn(
            'ml-auto grid size-6 shrink-0 place-items-center rounded-[6px] border transition-colors',
            on || taken ? 'border-ai-300 bg-ai-500 text-washi' : 'border-washi-subtle/60',
          )}
        >
          {(on || taken) && <Check className="size-4" />}
        </span>
        {taken && <span className="sr-only">{takenLabel}</span>}
      </motion.button>
    </li>
  );
}

export function SongPickList({
  items,
  selected,
  onToggle,
  taken,
  takenLabel = 'Ya está',
  emptyText,
  className,
}: PickListProps<LibraryVideo>) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const query = q.trim().toLowerCase();
    return query ? items.filter((v) => `${v.title} ${v.artist ?? ''}`.toLowerCase().includes(query)) : items;
  }, [items, q]);
  if (!items.length) return <p className="py-6 text-center text-sm text-washi-muted">{emptyText}</p>;
  return (
    <div className={className}>
      {items.length > 6 && <SearchBox value={q} onChange={setQ} placeholder="Buscar canción o artista" />}
      <ul className="space-y-1">
        {shown.map((v) => (
          <Row
            key={v.id}
            on={selected.has(v.id)}
            taken={taken?.has(v.id) ?? false}
            takenLabel={takenLabel}
            onClick={() => onToggle(v)}
          >
            <span className="relative aspect-video w-16 shrink-0 overflow-hidden rounded-[6px] bg-sumi-950">
              {v.thumbnail_url && (
                <img
                  src={v.thumbnail_url}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 size-full object-cover"
                />
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-medium text-washi">{v.title}</span>
              <span className="block truncate text-[12px] text-washi-subtle">
                {taken?.has(v.id) ? takenLabel : v.artist || 'Artista sin especificar'}
              </span>
            </span>
          </Row>
        ))}
        {shown.length === 0 && (
          <li className="py-4 text-center text-sm text-washi-muted">Nada coincide con «{q}».</li>
        )}
      </ul>
    </div>
  );
}

export function ClipPickList({
  items,
  selected,
  onToggle,
  taken,
  takenLabel = 'Ya está',
  emptyText,
  className,
}: PickListProps<ClipWithVideo>) {
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const query = q.trim().toLowerCase();
    const map = new Map<string, { title: string; clips: ClipWithVideo[] }>();
    for (const clip of items) {
      if (!clip.video) continue;
      if (
        query &&
        !`${clip.name} ${clip.video.title} ${clip.video.artist ?? ''}`.toLowerCase().includes(query)
      )
        continue;
      const group = map.get(clip.video_id) ?? { title: clip.video.title, clips: [] };
      group.clips.push(clip);
      map.set(clip.video_id, group);
    }
    for (const g of map.values()) g.clips.sort((a, b) => a.start_seconds - b.start_seconds);
    return [...map.entries()].sort((a, b) => a[1].title.localeCompare(b[1].title, 'es'));
  }, [items, q]);
  if (!items.length) return <p className="py-6 text-center text-sm text-washi-muted">{emptyText}</p>;
  return (
    <div className={className}>
      {items.length > 6 && <SearchBox value={q} onChange={setQ} placeholder="Buscar clip o canción" />}
      {groups.map(([videoId, group]) => (
        <section key={videoId} aria-label={group.title} className="mb-2">
          <h4 className="truncate px-2.5 pb-1 pt-2 text-[12px] font-bold uppercase tracking-[0.08em] text-washi-subtle">
            {group.title}
          </h4>
          <ul className="space-y-1">
            {group.clips.map((clip) => (
              <Row
                key={clip.id}
                on={selected.has(clip.id)}
                taken={taken?.has(clip.id) ?? false}
                takenLabel={takenLabel}
                onClick={() => onToggle(clip)}
              >
                <span
                  aria-hidden
                  className={cn('size-7 shrink-0 rotate-[-3deg] rounded-[5px]', CLIP_SWATCH[clip.color].dot)}
                />
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-medium text-washi">{clip.name}</span>
                  <span className="tabular block truncate font-mono text-[12px] text-washi-subtle">
                    {taken?.has(clip.id)
                      ? takenLabel
                      : `${formatTime(clip.start_seconds)}–${formatTime(clip.end_seconds)}`}
                  </span>
                </span>
              </Row>
            ))}
          </ul>
        </section>
      ))}
      {groups.length === 0 && (
        <p className="py-4 text-center text-sm text-washi-muted">Nada coincide con «{q}».</p>
      )}
    </div>
  );
}

export function MemberPickList({
  items,
  selected,
  onToggle,
  taken,
  takenLabel = 'Ya está',
  emptyText,
  className,
}: PickListProps<Member>) {
  if (!items.length) return <p className="py-6 text-center text-sm text-washi-muted">{emptyText}</p>;
  return (
    <ul className={cn('space-y-1', className)}>
      {items.map((m) => (
        <Row
          key={m.id}
          on={selected.has(m.id)}
          taken={taken?.has(m.id) ?? false}
          takenLabel={takenLabel}
          onClick={() => onToggle(m)}
        >
          <MemberSeal member={m} />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-medium text-washi">{m.name}</span>
            {taken?.has(m.id) && <span className="block text-[12px] text-washi-subtle">{takenLabel}</span>}
          </span>
        </Row>
      ))}
    </ul>
  );
}

/** Toggles an id in a set (returns a new set). */
export function toggleIn(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
