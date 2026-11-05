import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { usePlayer } from '@/player/store';
import { fileTime, formatTime, nudgeOffset, offsetFromMarks } from '@coverscape/shared';
import { Check, Flag, Pause, Play } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { fmtSigned } from './useLinkFlow';

/**
 * Mark one moment in each player; the offset is the difference. «Probar juntos» plays both from just before the
 * marks so they can be heard together (they sound as one when in sync), and ± nudges fix the last hundredths.
 */
export function SyncStep({
  url,
  initialOffset,
  saving,
  onSave,
}: {
  url: string;
  initialOffset: number;
  saving: boolean;
  onSave: (offset: number) => void;
}) {
  const fileRef = useRef<HTMLVideoElement>(null);
  const [ytMark, setYtMark] = useState<number | null>(null);
  const [fileMark, setFileMark] = useState<number | null>(null);
  const [offset, setOffset] = useState(initialOffset);
  const [filePlaying, setFilePlaying] = useState(false);
  const [testing, setTesting] = useState(false);
  // REQ-21 · The two clocks (several changes a second) live in YtReadout and FileReadout: the step and its <video>
  // don't re-render with them. The speed is only needed when «Probar juntos» starts.
  const ytPlaying = usePlayer((s) => s.playing);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const el = fileRef.current;
    if (!el) return;
    const playing = () => setFilePlaying(!el.paused);
    el.addEventListener('play', playing);
    el.addEventListener('pause', playing);
    return () => {
      el.removeEventListener('play', playing);
      el.removeEventListener('pause', playing);
      el.pause();
      clearTimeout(stopTimer.current);
    };
  }, [url]);

  // Both marks set: the offset follows them (nudges then fine-tune it).
  useEffect(() => {
    if (ytMark != null && fileMark != null) setOffset(offsetFromMarks(fileMark, ytMark));
  }, [ytMark, fileMark]);

  const nudgeFile = (d: number) => {
    const el = fileRef.current;
    if (el) el.currentTime = Math.max(0, el.currentTime + d);
  };

  function testTogether() {
    const el = fileRef.current;
    const p = usePlayer.getState();
    if (!el) return;
    const from = Math.max(0, (ytMark ?? p.time) - 2);
    clearTimeout(stopTimer.current);
    p.pause();
    p.seek(from);
    el.pause();
    el.playbackRate = p.rate;
    el.currentTime = Math.max(0, fileTime(from, offset));
    setTesting(true);
    // Give YouTube a moment to land on the seek, then start both. One timer at a time, so closing the panel
    // within that moment cancels the start too.
    stopTimer.current = setTimeout(() => {
      usePlayer.getState().play();
      void el.play().catch(() => undefined);
      stopTimer.current = setTimeout(() => {
        usePlayer.getState().pause();
        el.pause();
        setTesting(false);
      }, 6000);
    }, 400);
  }

  const ready = ytMark != null && fileMark != null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {/* YouTube side: the studio's own player, above. */}
        <div className="well rounded-[12px] p-3">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-kin-300">YouTube</p>
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              aria-label={ytPlaying ? 'Pausar YouTube' : 'Reproducir YouTube'}
              onClick={() => usePlayer.getState().togglePlay()}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-shu-500 text-washi"
            >
              {ytPlaying ? <Pause className="size-5" /> : <Play className="size-5" />}
            </button>
            <YtReadout />
          </div>
          <p className="mt-1 text-[13px] text-washi-muted">
            Se oye el vídeo del estudio: busca el golpe de oído.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <NudgeButton label="−1 s" onClick={() => usePlayer.getState().nudge(-1)} />
            <NudgeButton label="−0,1" onClick={() => usePlayer.getState().nudge(-0.1)} />
            <NudgeButton label="+0,1" onClick={() => usePlayer.getState().nudge(0.1)} />
            <NudgeButton label="+1 s" onClick={() => usePlayer.getState().nudge(1)} />
          </div>
          <Button
            className="mt-2 w-full"
            variant={ytMark != null ? 'secondary' : 'primary'}
            onClick={() => setYtMark(usePlayer.getState().time)}
          >
            <Flag className="size-4" />{' '}
            {ytMark != null ? `Marcado en ${formatTime(ytMark, { tenths: true })}` : 'Marcar aquí'}
          </Button>
        </div>

        {/* File side */}
        <div className="well rounded-[12px] p-3">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-kin-300">Archivo</p>
          <div className="relative mt-1 aspect-video overflow-hidden rounded-[8px] bg-black">
            <video ref={fileRef} src={url} playsInline preload="auto" className="size-full object-contain" />
            <button
              type="button"
              aria-label={filePlaying ? 'Pausar el archivo' : 'Reproducir el archivo'}
              onClick={() => {
                const el = fileRef.current;
                if (!el) return;
                if (el.paused) void el.play().catch(() => undefined);
                else el.pause();
              }}
              className="absolute inset-0 grid place-items-center"
            >
              <span className="grid size-11 place-items-center rounded-full bg-black/55">
                {filePlaying ? <Pause className="size-5" /> : <Play className="size-5" />}
              </span>
            </button>
          </div>
          <FileReadout video={fileRef} url={url} />
          <div className="mt-1 flex flex-wrap gap-1.5">
            <NudgeButton label="−1 s" onClick={() => nudgeFile(-1)} />
            <NudgeButton label="−0,1" onClick={() => nudgeFile(-0.1)} />
            <NudgeButton label="+0,1" onClick={() => nudgeFile(0.1)} />
            <NudgeButton label="+1 s" onClick={() => nudgeFile(1)} />
          </div>
          <Button
            className="mt-2 w-full"
            variant={fileMark != null ? 'secondary' : 'primary'}
            onClick={() => setFileMark(fileRef.current?.currentTime ?? 0)}
          >
            <Flag className="size-4" />{' '}
            {fileMark != null ? `Marcado en ${formatTime(fileMark, { tenths: true })}` : 'Marcar aquí'}
          </Button>
        </div>
      </div>

      <div
        className={cn(
          'rounded-[12px] border p-3 transition-colors',
          ready ? 'border-kin-400/50' : 'border-line',
        )}
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-washi-muted">Desfase (el archivo va por delante si es positivo)</p>
            <motion.p
              key={offset}
              initial={{ scale: 1.08 }}
              animate={{ scale: 1 }}
              transition={jelly}
              className="tabular font-mono text-[22px] font-bold"
            >
              {fmtSigned(offset)}
            </motion.p>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ajuste fino del desfase">
            <NudgeButton label="−0,05" onClick={() => setOffset((o) => nudgeOffset(o, -0.05))} />
            <NudgeButton label="−0,01" onClick={() => setOffset((o) => nudgeOffset(o, -0.01))} />
            <NudgeButton label="+0,01" onClick={() => setOffset((o) => nudgeOffset(o, 0.01))} />
            <NudgeButton label="+0,05" onClick={() => setOffset((o) => nudgeOffset(o, 0.05))} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={testTogether} loading={testing}>
            <Play className="size-4" /> Probar juntos
          </Button>
          <Button onClick={() => onSave(offset)} loading={saving}>
            <Check className="size-4" /> Guardar sincronía
          </Button>
        </div>
        <p className="mt-2 text-[12px] leading-snug text-washi-subtle">
          «Probar juntos» suena los dos a la vez durante unos segundos: si oyes eco, ajusta el desfase en
          centésimas.
        </p>
      </div>
    </div>
  );
}

/** The studio player's time, in tenths (re-renders only itself). */
function YtReadout() {
  const ytTime = usePlayer((s) => Math.floor(s.time * 10) / 10);
  return <p className="tabular font-mono text-[22px] font-bold">{formatTime(ytTime, { tenths: true })}</p>;
}

/** The file's time, from its own media events (re-renders only itself). */
function FileReadout({ video, url }: { video: RefObject<HTMLVideoElement | null>; url: string }) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const tick = () => setNow(el.currentTime);
    el.addEventListener('timeupdate', tick);
    el.addEventListener('seeked', tick);
    return () => {
      el.removeEventListener('timeupdate', tick);
      el.removeEventListener('seeked', tick);
    };
  }, [video, url]);
  return <p className="tabular mt-1 font-mono text-[15px] font-bold">{formatTime(now, { tenths: true })}</p>;
}

function NudgeButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.88 }}
      transition={jelly}
      onClick={onClick}
      className="tabular min-h-11 min-w-11 rounded-[8px] border border-line-strong bg-sumi-800 px-2 font-mono text-[13px] font-bold text-washi hover:border-washi/40"
    >
      {label}
    </motion.button>
  );
}
