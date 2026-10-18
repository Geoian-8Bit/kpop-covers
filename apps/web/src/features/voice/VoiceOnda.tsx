import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { soft } from '@/lib/motion';
import {
  DriftStrip,
  driftAttrs,
  GROUP_LABEL,
  ModeSeals,
  useVoiceMotion,
  WaveTags,
  type VoiceWaveProps,
} from './controlParts';
import type { VoiceMode } from './voiceRules';
import { bandPath, crestXs, linePath, sineWave, STRIP_WIDTH, trochoidWave } from './waveRules';

/**
 * «La ola partida» (chosen in the design lab, point 40): the sea of the timeline split in two, the voice in
 * vermilion riding on top and the music in indigo below, each in two layers. The waves repeat at their own width (a pattern, never stretched: a
 * wave is as wide on a phone as on a 1.400 px screen), the voice's crest is sharp and carries white foam, and the
 * layers drift slowly, at different speeds, while the song plays. Taking a part out lays it flat and fades it,
 * like water going still. Under it, three seals (全 todo · 楽 sin voz · 声 voz).
 */

const VOICE_BACK = 230;
const VOICE_MAIN = 170;
const MUSIC_MAIN = 200;
const MUSIC_FRONT = 260;

/** Paths for a box `h` px tall (the strips are STRIP_WIDTH + period wide). Memoised per height. */
function layers(h: number) {
  const back = sineWave(VOICE_BACK, 0.27 * h, [
    { amp: 0.07 * h, cycles: 1 },
    { amp: 0.03 * h, cycles: 2, phase: 1 },
  ]);
  const crest = trochoidWave(VOICE_MAIN, 0.36 * h, 0.13 * h, 0.55);
  const music = trochoidWave(MUSIC_MAIN, 0.64 * h, 0.08 * h, 0.35);
  const front = sineWave(MUSIC_FRONT, 0.82 * h, [
    { amp: 0.05 * h, cycles: 1, phase: 2 },
    { amp: 0.02 * h, cycles: 3 },
  ]);
  const w = (period: number) => STRIP_WIDTH + period;
  const spray = crestXs(VOICE_MAIN, w(VOICE_MAIN)).flatMap((x) => {
    const y = crest(x);
    return [
      { cx: x - 5, cy: y - 3, r: 1.5 },
      { cx: x + 2, cy: y - 5, r: 1.1 },
      { cx: x + 8, cy: y - 2.5, r: 0.9 },
    ];
  });
  return {
    back: bandPath(back, h + 1, w(VOICE_BACK)),
    voice: bandPath(crest, h + 1, w(VOICE_MAIN)),
    foam: linePath((x) => crest(x) + 0.6, w(VOICE_MAIN)),
    spray,
    music: bandPath(music, h + 1, w(MUSIC_MAIN)),
    engraving: linePath((x) => music(x) + 0.14 * h, w(MUSIC_MAIN)),
    front: bandPath(front, h + 1, w(MUSIC_FRONT)),
    frontLine: linePath(front, w(MUSIC_FRONT)),
  };
}

const CACHE = new Map<number, ReturnType<typeof layers>>();
function layersFor(h: number) {
  let found = CACHE.get(h);
  if (!found) {
    found = layers(h);
    CACHE.set(h, found);
  }
  return found;
}

type Pose = { y: number; scaleY: number; opacity: number };

function poses(mode: VoiceMode, reduce: boolean, h: number): { voice: Pose; music: Pose } {
  const whole: Pose = { y: 0, scaleY: 1, opacity: 1 };
  const still = (y: number, scaleY: number): Pose =>
    reduce ? { y: 0, scaleY: 1, opacity: 0.25 } : { y, scaleY, opacity: 0.35 };
  const lifted = (y: number): Pose => (reduce ? whole : { y, scaleY: 1, opacity: 1 });
  if (mode === 'sin-voz') return { voice: still(0, 0.3), music: lifted(-0.05 * h) };
  if (mode === 'voz') return { voice: lifted(-0.04 * h), music: still(0.35 * h, 1) };
  return { voice: whole, music: whole };
}

export function VoiceOnda({ mode, onChange, available, compact, noteId, playing }: VoiceWaveProps) {
  const { reduce, transition } = useVoiceMotion(soft);
  const h = compact ? 56 : 72;
  const paths = layersFor(h);
  const pose = poses(mode, reduce, h);

  return (
    <div
      role="radiogroup"
      aria-label={GROUP_LABEL}
      aria-describedby={noteId}
      aria-disabled={!available || undefined}
      className="well w-full rounded-[14px] p-1.5"
    >
      <div
        aria-hidden
        {...driftAttrs(Boolean(playing && available))}
        className={cn(
          'relative overflow-hidden rounded-[10px] bg-linear-to-b from-sumi-950 to-ai-900',
          !available && 'opacity-40',
        )}
        style={{ height: h }}
      >
        <motion.div
          initial={false}
          animate={pose.voice}
          transition={transition}
          className="absolute inset-0"
          style={{ transformOrigin: '50% 100%' }}
        >
          <DriftStrip period={VOICE_BACK} seconds={17} reverse height={h}>
            <path d={paths.back} className="fill-shu-700" opacity={0.75} />
          </DriftStrip>
          <DriftStrip period={VOICE_MAIN} seconds={10} height={h}>
            <path d={paths.voice} className="fill-shu-500" />
            <path
              d={paths.foam}
              fill="none"
              strokeWidth={2}
              strokeLinecap="round"
              className="stroke-washi/80"
            />
            {paths.spray.map((dot, i) => (
              <circle key={i} cx={dot.cx} cy={dot.cy} r={dot.r} className="fill-washi/85" />
            ))}
          </DriftStrip>
        </motion.div>
        <motion.div
          initial={false}
          animate={pose.music}
          transition={transition}
          className="absolute inset-0"
          style={{ transformOrigin: '50% 100%' }}
        >
          <DriftStrip period={MUSIC_MAIN} seconds={13} reverse height={h}>
            <path d={paths.music} className="fill-ai-600" />
            <path
              d={paths.engraving}
              fill="none"
              strokeWidth={1}
              strokeDasharray="12 7"
              className="stroke-ai-400/45"
            />
          </DriftStrip>
          <DriftStrip period={MUSIC_FRONT} seconds={21} height={h}>
            <path d={paths.front} className="fill-ai-700" />
            <path d={paths.frontLine} fill="none" strokeWidth={1.25} className="stroke-ai-300/35" />
          </DriftStrip>
        </motion.div>
        <WaveTags />
      </div>

      <ModeSeals mode={mode} onChange={onChange} available={available} compact={compact} className="mt-1.5" />
    </div>
  );
}
