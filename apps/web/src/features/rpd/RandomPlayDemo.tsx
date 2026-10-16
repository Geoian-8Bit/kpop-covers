import { motion } from 'motion/react';
import { Play } from 'lucide-react';
import { useEffect, useReducer, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { TONE, type Tone } from '@/features/bags/tones';
import { cn } from '@/lib/cn';
import { RandomPlayScreen, type PlayCard } from './RandomPlayScreen';
import { RoundControls } from './RoundControls';
import {
  followingPlayable,
  IDLE_ROUND,
  nextPlayable,
  roundLeadStatus,
  roundReducer,
  titleShown,
  type RoundAction,
  type RoundOptions,
  type RoundState,
} from './roundRules';
import type { TitleMode } from '@coverscape/shared';

/** Sample round: four short clips (one «no disponible», skipped like in a real track). */
const CARDS: (PlayCard | null)[] = [
  { key: 'd1', title: 'Hype Boy', artist: 'NewJeans', clipName: 'Estribillo', tone: 'enji' },
  { key: 'd2', title: 'Supernova', artist: 'aespa', clipName: 'Puente', tone: 'rokusho' },
  null,
  { key: 'd3', title: 'Magnetic', artist: 'ILLIT', clipName: 'Dance break', tone: 'fuji' },
  { key: 'd4', title: 'Love Dive', artist: 'IVE', clipName: 'Final', tone: 'kin' },
];
const AVAILABLE = CARDS.map(Boolean);
const CLIP_MS = 4500;

/**
 * Lab stage for F14: the real screen and the real round logic (`roundReducer`: pause, countdown, skipping what isn't
 * available, modo adivinar) over a silent stand-in for the video, so each design can be tried without YouTube.
 */
export function RandomPlayDemo({ variant }: { variant: string }) {
  const [titleMode, setTitleMode] = useState<TitleMode>('before');
  const options: Pick<RoundOptions, 'pauseSeconds' | 'countdown'> = { pauseSeconds: 1, countdown: true };
  const ctx = useRef({ available: AVAILABLE, options });
  const [state, dispatch] = useReducer(
    (s: RoundState, a: RoundAction) => roundReducer(s, a, ctx.current),
    IDLE_ROUND,
  );
  const [now, setNow] = useState(() => performance.now());
  const [played, setPlayed] = useState(0);

  const paused = state.pausedAt != null;
  const ticking = (state.phase === 'lead' || state.phase === 'play') && !paused;
  useEffect(() => {
    if (!ticking) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const t = performance.now();
      setNow(t);
      if (state.phase === 'play') setPlayed((p) => p + (t - last));
      last = t;
    }, 80);
    return () => window.clearInterval(id);
  }, [ticking, state.phase]);

  const lead = roundLeadStatus(state, now);
  useEffect(() => {
    if (lead?.phase === 'go') {
      setPlayed(0);
      dispatch({ type: 'go' });
    }
  }, [lead?.phase]);
  useEffect(() => {
    if (state.phase === 'play' && played >= CLIP_MS) dispatch({ type: 'advance', now: performance.now() });
  }, [played, state.phase]);

  const current = state.index >= 0 ? CARDS[state.index] : null;
  const nextIndex =
    state.phase === 'idle' ? nextPlayable(AVAILABLE, 0) : followingPlayable(AVAILABLE, state.index);
  const upcoming: PlayCard[] = [];
  for (let i = nextIndex; i >= 0 && upcoming.length < 4; i = followingPlayable(AVAILABLE, i))
    upcoming.push(CARDS[i]!);
  const total = AVAILABLE.filter(Boolean).length;
  const position = {
    index: state.index >= 0 ? AVAILABLE.slice(0, state.index + 1).filter(Boolean).length : 0,
    total,
  };
  const playing = state.phase === 'play' && !paused;

  const stage = (
    <FakeStage
      tone={current?.tone ?? 'ai'}
      progress={state.phase === 'play' ? Math.min(1, played / CLIP_MS) : 0}
      playing={playing}
    />
  );

  return (
    <div className="flex w-full flex-col gap-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => dispatch({ type: 'start', now: performance.now() })}>
          <Play aria-hidden className="size-4" /> {state.phase === 'idle' ? 'Empezar' : 'Desde el principio'}
        </Button>
        <Segmented
          size="sm"
          label="Título"
          layoutId="rpd-demo-title"
          value={titleMode}
          onChange={setTitleMode}
          options={[
            { value: 'before', label: 'Título antes' },
            { value: 'after', label: 'Adivinar' },
          ]}
        />
        <span className="text-[12px] text-washi-subtle">Sin sonido · un clip «no disponible» se salta</span>
      </div>
      <RandomPlayScreen
        variant={variant}
        compact
        stage={stage}
        current={current ?? (state.phase === 'idle' ? (upcoming[0] ?? null) : null)}
        upcoming={state.phase === 'idle' ? upcoming.slice(1) : upcoming}
        position={position}
        lead={state.phase === 'lead' ? lead : null}
        waiting={false}
        titleVisible={
          state.phase === 'idle'
            ? titleMode === 'before'
            : titleShown(
                titleMode,
                playing || (state.phase === 'play' && paused),
                played / 1000,
                CLIP_MS / 1000,
              )
        }
        nextVisible={titleMode === 'before'}
        paused={paused}
        notice={state.phase === 'done' ? 'Ronda terminada' : null}
        controls={
          <RoundControls
            paused={paused}
            disabled={state.phase !== 'lead' && state.phase !== 'play'}
            onTogglePause={() => dispatch({ type: paused ? 'resume' : 'pause', now: performance.now() })}
            onRepeat={() => {
              setPlayed(0);
              dispatch({ type: 'repeat', now: performance.now() });
            }}
            onSkip={() => dispatch({ type: 'advance', now: performance.now() })}
            onFinish={() => dispatch({ type: 'finish' })}
          />
        }
      />
    </div>
  );
}

/** A silent stand-in for the video: the clip's colour, a few dancing bars and the progress. */
function FakeStage({ tone, progress, playing }: { tone: Tone; progress: number; playing: boolean }) {
  return (
    <div className="seigaiha absolute inset-0">
      <div className="absolute inset-0 flex items-end justify-center gap-[3%] px-[12%] pb-[14%]">
        {Array.from({ length: 7 }, (_, i) => (
          <motion.span
            key={i}
            className={cn('w-[6%] rounded-t-full', TONE[tone].bg)}
            initial={false}
            animate={playing ? { height: ['20%', `${40 + ((i * 23) % 45)}%`, '25%'] } : { height: '14%' }}
            transition={
              playing
                ? { duration: 0.6 + (i % 3) * 0.15, repeat: Infinity, ease: 'easeInOut' }
                : { duration: 0.3 }
            }
          />
        ))}
      </div>
      <div className="absolute inset-x-0 bottom-0 h-1.5 bg-sumi-950/80">
        <div className={cn('h-full', TONE[tone].bg)} style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}
