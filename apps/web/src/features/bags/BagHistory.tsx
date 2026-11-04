import type { BagDraw, BagKind } from '@coverscape/shared';
import { useMemo } from 'react';
import { useMembers } from '@/data/members';
import { historyDay, historyState } from './drawRules';

// REQ-27 · Split out of BagPage.tsx: who drew what, and when.

export function History({
  draws,
  kind,
  loading,
}: {
  draws: BagDraw[] | undefined;
  kind: BagKind;
  loading: boolean;
}) {
  const members = useMembers();
  const byId = useMemo(() => new Map((members.data ?? []).map((m) => [m.id, m])), [members.data]);
  if (loading) return <div className="skeleton mt-1 h-20 rounded-[10px]" />;
  if (!draws?.length) return <p className="px-1 py-3 text-sm text-washi-muted">Todavía no ha salido nada.</p>;
  return (
    <ol className="space-y-0.5">
      {draws.map((d) => {
        const who = d.member_id ? byId.get(d.member_id) : undefined;
        const state = historyState(kind, d.removed);
        return (
          <li key={d.id} className="flex items-start gap-2.5 rounded-[10px] px-1.5 py-1.5">
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rotate-45 bg-kin-400/70" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-[15px] font-bold leading-snug text-washi">
                {d.label}
                {state && <span className="font-sans text-[13px] font-normal text-shu-300"> {state}</span>}
              </span>
              <span className="block truncate text-[12px] text-washi-subtle">
                {historyDay(d.drawn_at)} ·{' '}
                {new Date(d.drawn_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                {who ? ` · lo sacó ${who.name}` : ''}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
