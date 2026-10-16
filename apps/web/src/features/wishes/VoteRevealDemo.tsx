import type { VoteType } from '@coverscape/shared';
import { RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ElasticToggle } from '@/components/ui/ElasticToggle';
import { Segmented } from '@/components/ui/Segmented';
import { drawAmongTied, outcomeOf, scoreLabel, tally, VOTE_TYPE_COPY } from './pollRules';
import { TieDraw } from './TieDraw';
import { VoteReveal } from './VoteReveal';

const SONGS = [
  { id: 'A', title: 'Hype Boy', artist: 'NewJeans' },
  { id: 'B', title: 'Supernova', artist: 'aespa' },
  { id: 'C', title: 'Magnetic', artist: 'ILLIT' },
];
const OPTIONS = SONGS.map((s) => ({ id: `o${s.id}`, wish_id: s.id, poll_id: 'demo' }));

/** Sample ballots for each type; «Empate» swaps in ballots where A and B finish level. */
function sampleVotes(type: VoteType, tie: boolean) {
  const v = (member: string, option: string, rank: number | null = null) => ({
    poll_id: 'demo',
    member_id: member,
    option_id: option,
    rank,
  });
  if (type === 'ranking') {
    return tie
      ? [v('m1', 'oA', 1), v('m1', 'oB', 2), v('m1', 'oC', 3), v('m2', 'oB', 1), v('m2', 'oA', 2), v('m2', 'oC', 3)]
      : [v('m1', 'oB', 1), v('m1', 'oA', 2), v('m1', 'oC', 3), v('m2', 'oB', 1), v('m2', 'oC', 2), v('m2', 'oA', 3)];
  }
  if (type === 'multi') {
    return tie
      ? [v('m1', 'oA'), v('m1', 'oB'), v('m2', 'oA'), v('m2', 'oB'), v('m3', 'oC')]
      : [v('m1', 'oB'), v('m1', 'oC'), v('m2', 'oB'), v('m3', 'oA'), v('m3', 'oB')];
  }
  return tie ? [v('m1', 'oA'), v('m2', 'oB'), v('m3', 'oC'), v('m4', 'oA'), v('m5', 'oB')] : [v('m1', 'oB'), v('m2', 'oB'), v('m3', 'oC')];
}

type Phase = 'idle' | 'tie' | 'reveal';

/**
 * Lab stage for F11 «al cerrar»: a sample vote counted with the real rules (`tally`, ties), closed with the
 * chosen design; with «Empate» on, the tie draw runs first. Nothing is saved.
 */
export function VoteRevealDemo({ variant }: { variant: string }) {
  const [type, setType] = useState<VoteType>('single');
  const [tie, setTie] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [run, setRun] = useState(0);

  const results = useMemo(() => tally(type, OPTIONS, sampleVotes(type, tie)), [type, tie]);
  const outcome = outcomeOf(results);

  function closeVote() {
    setRun((n) => n + 1);
    if (outcome.kind === 'tie') {
      setWinnerId(drawAmongTied(outcome.wishIds));
      setPhase('tie');
    } else if (outcome.kind === 'winner') {
      setWinnerId(outcome.wishId);
      setPhase('reveal');
    }
  }

  function reset() {
    setPhase('idle');
    setWinnerId(null);
  }

  const winner = SONGS.find((s) => s.id === winnerId);
  const winnerScore = results.find((r) => r.wishId === winnerId)?.score ?? 0;

  return (
    <div className="flex w-full flex-col gap-4 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          size="sm"
          label="Tipo de voto"
          layoutId="vote-demo-type"
          value={type}
          onChange={(t) => {
            setType(t);
            reset();
          }}
          options={(['single', 'multi', 'ranking'] as const).map((t) => ({ value: t, label: VOTE_TYPE_COPY[t].label }))}
        />
        <ElasticToggle
          label="Empate"
          checked={tie}
          onChange={(next) => {
            setTie(next);
            reset();
          }}
        />
      </div>

      {phase === 'idle' && (
        <ol className="space-y-1.5" aria-label="Recuento de ejemplo">
          {results.map((r) => {
            const song = SONGS.find((s) => s.id === r.wishId)!;
            return (
              <li key={r.optionId} className="flex min-h-11 items-center justify-between gap-3 rounded-[10px] border border-line px-3">
                <span className="truncate font-bold text-washi">{song.title}</span>
                <span className="tabular text-[13px] text-washi-muted">{scoreLabel(type, r.score)}</span>
              </li>
            );
          })}
        </ol>
      )}

      {phase === 'tie' && winnerId && outcome.kind === 'tie' && (
        <TieDraw
          key={run}
          candidates={outcome.wishIds.map((id) => ({ id, title: SONGS.find((s) => s.id === id)!.title }))}
          winnerId={winnerId}
          onDone={() => setPhase('reveal')}
        />
      )}

      {phase === 'reveal' && winner && (
        <VoteReveal
          key={`${run}-${variant}`}
          variant={variant}
          winner={{ title: winner.title, artist: winner.artist, score: scoreLabel(type, winnerScore) }}
        />
      )}

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={closeVote} disabled={phase === 'tie'}>
          {phase === 'reveal' ? 'Cerrar otra vez' : 'Cerrar votación'}
        </Button>
        <Button variant="ghost" onClick={reset} disabled={phase === 'idle'}>
          <RotateCcw aria-hidden className="size-4" /> Reabrir
        </Button>
      </div>
      <p className="text-center text-[13px] text-washi-subtle" aria-live="polite">
        {outcome.kind === 'tie'
          ? 'Empate: al cerrar se sortea entre las empatadas.'
          : `Va ganando ${SONGS.find((s) => s.id === (outcome.kind === 'winner' ? outcome.wishId : ''))?.title ?? '—'}.`}
      </p>
    </div>
  );
}
