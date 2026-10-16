import type { Member, ReactionEmoji } from '@coverscape/shared';
import { Cloud, Play } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { MemberSeal } from '@/features/members/MembersUI';
import { ReactionBar } from './ReactionBar';
import { applyToggle, groupReactions, toggleReaction, type ReactionRow } from './reactionRules';

const PEOPLE: Pick<Member, 'id' | 'name' | 'color'>[] = [
  { id: 'flor', name: 'Flor', color: 'sakura' },
  { id: 'iker', name: 'Iker', color: 'ai' },
  { id: 'nerea', name: 'Nerea', color: 'rokusho' },
];

const START: ReactionRow[] = [
  { id: 'r1', take_id: 'demo', member_id: 'iker', emoji: '🔥', created_at: '2026-10-16T10:00:00Z' },
  { id: 'r2', take_id: 'demo', member_id: 'nerea', emoji: '🔥', created_at: '2026-10-16T10:01:00Z' },
  { id: 'r3', take_id: 'demo', member_id: null, emoji: '👏', created_at: '2026-10-16T10:02:00Z' },
];

/**
 * Lab stage for F15: a sample shared take with its reactions, in the chosen design. «Eres» switches who taps
 * (two people, or «Sin nombre») with the same rules as the real one (one of each per person). Nothing is saved.
 */
export function ReactionsDemo({ variant }: { variant: string }) {
  const [rows, setRows] = useState<ReactionRow[]>(START);
  const [me, setMe] = useState<string>('flor');
  const meId = me === 'anon' ? null : me;
  const groups = useMemo(() => groupReactions(rows, 'demo', meId), [rows, meId]);
  const memberOf = (id: string) => PEOPLE.find((p) => p.id === id) ?? null;

  function onToggle(emoji: ReactionEmoji) {
    const action = toggleReaction(rows, 'demo', meId, emoji);
    setRows((list) =>
      applyToggle(list, action, {
        id: crypto.randomUUID(),
        take_id: 'demo',
        member_id: meId,
        emoji,
        created_at: new Date().toISOString(),
      }),
    );
  }

  return (
    <div className="flex w-full flex-col gap-4 p-3 sm:p-4">
      <Segmented
        size="sm"
        label="Eres"
        layoutId="reactions-demo-me"
        value={me}
        onChange={setMe}
        options={[
          { value: 'flor', label: 'Flor' },
          { value: 'iker', label: 'Iker' },
          { value: 'anon', label: 'Sin nombre' },
        ]}
      />
      <div className="well rounded-[12px] p-2.5">
        <div className="flex items-center gap-3">
          <MemberSeal member={PEOPLE[2]!} />
          <div className="min-w-0 flex-1">
            <p className="flex items-baseline gap-1.5">
              <span className="truncate text-[15px] font-bold">Nerea</span>
              <span className="text-[13px] text-washi-muted">Hoy, 19:42</span>
            </p>
            <p className="mt-0.5 flex items-center gap-1 text-[12px] text-washi-muted">
              <Cloud aria-hidden className="size-3.5" /> Compartida
            </p>
          </div>
          <span aria-hidden className="grid size-11 place-items-center rounded-[10px] bg-washi text-sumi-900">
            <Play className="size-5 translate-x-px fill-current" />
          </span>
        </div>
        <div className="mt-2 border-t border-line pt-0.5">
          <ReactionBar variant={variant} groups={groups} onToggle={onToggle} memberOf={memberOf} />
        </div>
      </div>
      <p className="text-center text-[13px] text-washi-subtle">
        Toca un emoji para añadir o quitar la tuya. Cambia quién eres para ver a dos personas o a alguien sin nombre.
      </p>
    </div>
  );
}
