import { motion } from 'motion/react';
import { useEffect, useMemo, useRef } from 'react';
import { cn } from '@/lib/cn';
import { soft } from '@/lib/motion';
import { GROUP_LABEL, ModeSeals, useVoiceMotion, WaveTags, type VoiceVariantProps } from './controlParts';
import { studioClock, useStudioEnvelope, type StudioEnvelopeState } from './studioWave';
import { waveChipCopy, waveDownloadLabel } from './studioWaveRules';
import { envelopePaths, playheadFraction, syntheticEnvelope, type VoiceEnvelope } from './waveRules';

/**
 * B · «Olas del audio real»: the song itself, from start to end, as a sea. The music (what the two channels don't
 * share: the sides) is the indigo body; the voice (the centre) rides on it as a vermilion crest, so you can see
 * where it sings and where it rests. A playhead crosses it as the song plays. «Sin voz» flattens the crest into
 * foam on the music; «Voz» sinks the music and leaves the crest.
 *
 * The drawing spans the width on purpose (it is a timeline, like the one above): the height carries the levels, so
 * it never flattens on a wide screen. Without the real envelope (YouTube, a file too big to read, reading it), a
 * sample shape is drawn faded.
 */

const VB_W = 1000;
const SAMPLE = syntheticEnvelope('one-shoot');

export function VoiceOlaAudio({
  mode,
  onChange,
  available,
  compact,
  noteId,
  clock,
  envelope,
}: VoiceVariantProps) {
  const { reduce, transition } = useVoiceMotion(soft);
  const h = compact ? 64 : 80;
  const studio = useStudioEnvelope(envelope === undefined && available);
  const state: StudioEnvelopeState = envelope ?? studio.state;
  const real: VoiceEnvelope | null = available && state.status === 'ready' ? state.envelope : null;
  const paths = useMemo(
    () =>
      envelopePaths(real ?? SAMPLE, {
        width: VB_W,
        height: h,
        floor: 4,
        bodyRange: 0.38 * h,
        crestRange: 0.4 * h,
      }),
    [real, h],
  );

  const chip = available ? waveChipCopy(state.status) : null;
  // A cloud file on a connection that doesn't download on its own (iPhone, mobile data): the user decides.
  const ask = available && state.status === 'ask' ? state : null;

  const crest =
    mode === 'sin-voz'
      ? reduce
        ? { scaleY: 1, opacity: 0.12 }
        : { scaleY: 0.2, opacity: 0.5 }
      : { scaleY: 1, opacity: 1 };
  const body =
    mode === 'voz'
      ? reduce
        ? { y: 0, opacity: 0.22 }
        : { y: 0.32 * h, opacity: 0.3 }
      : { y: 0, opacity: 1 };

  return (
    <div
      role="radiogroup"
      aria-label={GROUP_LABEL}
      aria-describedby={noteId}
      aria-disabled={!available || undefined}
      className="well w-full rounded-[14px] p-1.5"
    >
      <div className="relative">
        <div
          aria-hidden
          className={cn(
            'relative overflow-hidden rounded-[10px] bg-linear-to-b from-sumi-950 to-ai-900',
            !available && 'opacity-40',
          )}
          style={{ height: h }}
        >
          <motion.svg
            key={real ? 'real' : 'sample'}
            initial={{ opacity: 0 }}
            animate={{ opacity: real ? 1 : 0.55 }}
            transition={soft}
            viewBox={`0 0 ${VB_W} ${h}`}
            preserveAspectRatio="none"
            className="absolute inset-0 size-full"
          >
            <motion.g
              initial={false}
              animate={crest}
              transition={transition}
              style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}
            >
              <path d={paths.crest} className="fill-shu-500" />
              <path
                d={paths.crestTop}
                fill="none"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
                className="stroke-washi/70"
              />
            </motion.g>
            <motion.g initial={false} animate={body} transition={transition}>
              <path d={paths.body} className="fill-ai-600" />
              <motion.path
                d={paths.surface}
                fill="none"
                strokeWidth={2}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                className="stroke-washi"
                initial={false}
                animate={{ opacity: mode === 'sin-voz' ? 0.9 : 0.2 }}
                transition={transition}
              />
            </motion.g>
          </motion.svg>
          {available && <Playhead clock={clock ?? studioClock} />}
          <WaveTags />
          {chip && (
            <span className="absolute right-2 top-1.5 rounded-[4px] bg-sumi-950/70 px-1.5 text-[11px] font-bold leading-[16px] text-washi-muted">
              {chip}
            </span>
          )}
        </div>
        {ask && (
          <div className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center">
            <motion.button
              type="button"
              onClick={studio.download}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={soft}
              className="pointer-events-auto min-h-11 max-w-[min(15rem,calc(100vw-9rem))] rounded-full border border-washi/40 bg-sumi-950/85 px-3 text-[12px] font-bold leading-tight text-washi focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-washi"
            >
              {waveDownloadLabel(ask.bytes)}
            </motion.button>
          </div>
        )}
      </div>

      <ModeSeals mode={mode} onChange={onChange} available={available} compact={compact} className="mt-1.5" />
    </div>
  );
}

/**
 * The playhead and the part already heard (a lighter wash), painted from the clock with a transform: a full-width
 * layer whose right edge is the line, slid to the time. No React render per frame.
 */
function Playhead({ clock }: { clock: NonNullable<VoiceVariantProps['clock']> }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let last = -1;
    const paint = () => {
      const { time, duration } = clock.read();
      const f = playheadFraction(time, duration);
      if (Math.abs(f - last) < 0.0005) return;
      last = f;
      ref.current?.style.setProperty('transform', `translate3d(${((f - 1) * 100).toFixed(3)}%,0,0)`);
    };
    paint();
    return clock.subscribe(paint);
  }, [clock]);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        ref={ref}
        className="absolute inset-0 border-r-2 border-washi bg-washi/[0.07] will-change-transform"
        style={{ transform: 'translate3d(-100%,0,0)' }}
      />
    </div>
  );
}
