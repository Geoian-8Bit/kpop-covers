import { cameraRequest, QUALITY_LABEL, resolutionLabel } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { Info, Music2, Settings, SwitchCamera, Timer, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { useRecordSettings, type RecordSettings } from '../settings';
import { GridOverlay } from './GridOverlay';
import { LevelIndicator } from './LevelIndicator';
import { RecorderSettingsSheet } from './RecorderSettingsSheet';

type Size = { width: number; height: number };

const PROFILES = {
  full: { maxSize: { width: 3840, height: 2160 } as Size | null, maxFps: 60 as number | null, songPossible: true },
  limited: { maxSize: { width: 1920, height: 1080 } as Size | null, maxFps: 30 as number | null, songPossible: false },
};

/** «1080p · 60 · Alta»: what the camera would really be asked for with these settings on this camera. */
function summaryFor(s: RecordSettings, maxSize: Size | null, maxFps: number | null): string {
  const req = cameraRequest({ quality: s.quality, resolution: s.resolution, fps: s.fps });
  const width = maxSize ? Math.min(req.width, maxSize.width) : req.width;
  const height = maxSize ? Math.min(req.height, maxSize.height) : req.height;
  const fps = maxFps != null && maxFps < 50 ? 30 : req.fps;
  return `${resolutionLabel(width, height)} · ${fps} · ${QUALITY_LABEL[s.quality]}`;
}

/**
 * Design lab stage for the recorder's settings (A1): a black recorder in a phone-shaped box with its ⚙ button,
 * opening the real panel in the chosen variant. The settings are the real ones of this phone (`useRecordSettings`),
 * so the grid, the level and the «i» button react here as they would in the recorder.
 */
export function RecorderSettingsDemo({ variant }: { variant: string }) {
  const [open, setOpen] = useState(false);
  const [shape, setShape] = useState<'portrait' | 'landscape'>('portrait');
  const [profile, setProfile] = useState<keyof typeof PROFILES>('full');
  const s = useRecordSettings();
  const data = PROFILES[profile];
  const summary = summaryFor(s, data.maxSize, data.maxFps);
  const turned = shape === 'landscape';

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Segmented
          size="sm"
          label="Forma del móvil"
          layoutId="rec-settings-demo-shape"
          value={shape}
          onChange={setShape}
          options={[
            { value: 'portrait', label: 'Vertical' },
            { value: 'landscape', label: 'Horizontal' },
          ]}
        />
        <Segmented
          size="sm"
          label="Cámara de ejemplo"
          layoutId="rec-settings-demo-profile"
          value={profile}
          onChange={setProfile}
          options={[
            { value: 'full', label: '4K · 60 · archivo' },
            { value: 'limited', label: '1080p · 30 · YouTube' },
          ]}
        />
      </div>

      <div
        className={cn(
          'relative isolate max-w-full select-none overflow-hidden rounded-[22px] bg-black text-washi ring-1 ring-line-strong',
          turned ? 'aspect-[16/9] w-[min(640px,100%)]' : 'aspect-[9/16] h-[min(640px,78vh)]',
        )}
      >
        {/* A rehearsal room, roughly: the floor and a mirror's edge (just something for the grid and level). */}
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-[30%] bg-sumi-900" />
        <div aria-hidden className="absolute inset-x-[12%] bottom-[30%] top-[18%] border-x border-t border-sumi-700" />

        <AnimatePresence>{s.grid && <GridOverlay key="grid" />}</AnimatePresence>
        {s.level && <LevelIndicator />}

        {/* Top bar, as in the recorder. */}
        <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 px-3 pt-3">
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-black/40">
            <X className="size-6" />
          </span>
          <span className="flex min-w-0 flex-1 justify-center">
            <span className="inline-flex min-w-0 items-center gap-2 rounded-full bg-black/40 px-3 py-1.5">
              <Music2 className="size-4 shrink-0 text-kin-300" />
              <span className="truncate text-[14px] font-bold">Canción de ejemplo</span>
            </span>
          </span>
          <button
            type="button"
            aria-label={`Ajustes de grabación: ${summary}`}
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
            className="tabular min-h-11 shrink-0 rounded-full px-1 font-mono text-[11px] font-bold text-washi/90"
          >
            <span className="rounded-full bg-black/45 px-2.5 py-1">{summary}</span>
          </button>
        </div>

        {/* Tools rail: right side upright, bottom left when turned. */}
        <div
          className={cn(
            'absolute z-10 flex gap-3',
            turned ? 'bottom-3 left-3 flex-row' : 'right-2.5 top-[78px] flex-col',
          )}
        >
          <FakeRail label="Girar">
            <SwitchCamera className="size-5" />
          </FakeRail>
          <FakeRail label="3 s">
            <Timer className="size-5" />
          </FakeRail>
          <motion.button
            type="button"
            aria-label="Ajustes de grabación"
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen(true)}
            whileTap={{ scale: 0.86 }}
            transition={jelly}
            className="flex w-14 flex-col items-center gap-1"
          >
            <span className={cn('grid size-11 place-items-center rounded-full', open ? 'bg-kin-300 text-sumi-900' : 'bg-black/45')}>
              <Settings className="size-5" />
            </span>
            <span className="text-[11px] font-bold leading-none [text-shadow:0_1px_4px_rgb(0_0_0/0.8)]">Ajustes</span>
          </motion.button>
          {s.info && (
            <FakeRail label="Info">
              <Info className="size-5" />
            </FakeRail>
          )}
        </div>

        {/* The shutter (decorative here). */}
        <span
          aria-hidden
          className={cn(
            'absolute grid size-[74px] place-items-center rounded-full border-4 border-washi/90',
            turned ? 'right-5 top-1/2 -translate-y-1/2' : 'bottom-6 left-1/2 -translate-x-1/2',
          )}
        >
          <span className="size-[58px] rounded-full bg-shu-500" />
        </span>

        <RecorderSettingsSheet
          variant={variant}
          open={open}
          onClose={() => setOpen(false)}
          maxSize={data.maxSize}
          maxFps={data.maxFps}
          songPossible={data.songPossible}
          summary={summary}
        />
      </div>
    </div>
  );
}

function FakeRail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span aria-hidden className="flex w-14 flex-col items-center gap-1">
      <span className="grid size-11 place-items-center rounded-full bg-black/45">{children}</span>
      <span className="text-[11px] font-bold leading-none [text-shadow:0_1px_4px_rgb(0_0_0/0.8)]">{label}</span>
    </span>
  );
}
