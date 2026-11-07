import { CLIP_SWATCH } from '@/data/clips';
import type { TakeItem } from '@/data/takes';
import { MemberSeal } from '@/features/members/MembersUI';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import type { Clip, Member } from '@coverscape/shared';
import { motion } from 'motion/react';
import { type ReactNode, useMemo } from 'react';
import { takeOwnTitle } from './takeNames';
import { isFiltered, NO_FILTER, type TakeFilter } from './takeRules';

// ───────────── Filters ─────────────

export function Chip({
  active,
  onClick,
  children,
  label,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  label?: string;
}) {
  return (
    <motion.button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={label}
      onClick={onClick}
      whileTap={{ scale: 0.92 }}
      transition={jelly}
      className={cn(
        'flex min-h-11 shrink-0 items-center gap-2 rounded-[10px] px-3 text-[13px] transition-colors duration-200',
        active ? 'bg-washi font-bold text-sumi-900' : 'well font-medium text-washi-muted hover:text-washi',
      )}
    >
      {children}
    </motion.button>
  );
}

function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 py-0.5"
    >
      {children}
    </div>
  );
}

export function Filters({
  all,
  filter,
  onChange,
  memberById,
  clipById,
  meId,
}: {
  all: TakeItem[];
  filter: TakeFilter;
  onChange: (f: TakeFilter) => void;
  memberById: Map<string, Member>;
  clipById: Map<string, Clip>;
  meId: string | null;
}) {
  // Only people and clips that have takes here; the chosen «yo» first.
  const memberIds = useMemo(() => {
    const ids = [...new Set(all.map((t) => t.member_id).filter((id): id is string => Boolean(id)))];
    return ids.sort((a, b) => Number(b === meId) - Number(a === meId));
  }, [all, meId]);
  const hasUnnamed = all.some((t) => !t.member_id);
  // Takes of nobody in particular that carry their own name («Grupo 1 · Primera versión») are the group's.
  const unnamedLabel = all.some((t) => !t.member_id && takeOwnTitle(t)) ? 'Grupo / sin nombre' : 'Sin nombre';
  const clipIds = useMemo(
    () => [...new Set(all.map((t) => t.clip_id).filter((id): id is string => Boolean(id)))],
    [all],
  );
  const hasNoClip = all.some((t) => !t.clip_id);
  const set = (patch: Partial<TakeFilter>) => onChange({ ...filter, ...patch });

  return (
    <div className="mt-3 space-y-2 empty:hidden">
      {memberIds.length + Number(hasUnnamed) > 1 && (
        <ChipRow label="Filtrar por persona">
          <Chip active={filter.member === 'all'} onClick={() => set({ member: 'all' })}>
            Todos
          </Chip>
          {memberIds.map((id) => {
            const m = memberById.get(id) ?? null;
            return (
              <Chip key={id} active={filter.member === id} onClick={() => set({ member: id })}>
                <MemberSeal member={m} size="sm" />
                {m?.name ?? 'Antiguo miembro'}
                {id === meId && <span className="sr-only"> (tú)</span>}
              </Chip>
            );
          })}
          {hasUnnamed && (
            <Chip active={filter.member === 'none'} onClick={() => set({ member: 'none' })}>
              <MemberSeal member={null} size="sm" />
              {unnamedLabel}
            </Chip>
          )}
        </ChipRow>
      )}
      {clipIds.length + Number(hasNoClip) > 1 && (
        <ChipRow label="Filtrar por clip">
          <Chip active={filter.clip === 'all'} onClick={() => set({ clip: 'all' })}>
            Todos los tramos
          </Chip>
          {clipIds.map((id) => {
            const c = clipById.get(id);
            return (
              <Chip key={id} active={filter.clip === id} onClick={() => set({ clip: id })}>
                <span
                  aria-hidden
                  className={cn(
                    'size-3 rotate-[-3deg] rounded-[2px]',
                    c ? CLIP_SWATCH[c.color].dot : 'bg-sumi-600',
                  )}
                />
                {c?.name ?? 'Clip borrado'}
              </Chip>
            );
          })}
          {hasNoClip && (
            <Chip active={filter.clip === 'none'} onClick={() => set({ clip: 'none' })}>
              Sin clip
            </Chip>
          )}
        </ChipRow>
      )}
      {isFiltered(filter) && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onChange(NO_FILTER)}
            className="min-h-11 rounded-[8px] px-2.5 text-[13px] font-bold text-kin-300 hover:bg-washi/10"
          >
            Quitar filtros
          </button>
        </div>
      )}
    </div>
  );
}
