import type { Clip } from '@coverscape/shared';
import { AnimatePresence } from 'motion/react';
import { memo, Suspense } from 'react';
import type { TrackInfo } from '../camera';
import type { ImageState } from '../imageState';
import type { TakeStats } from '../InfoPanel';
import type { BenchResult, PaceRest } from '../pace';
import type { RecordFormat } from '../recorder';
import { GridOverlay } from '../settings/GridOverlay';
import type { RecorderSettingsProps } from '../settings/model';
import type { StartChoice } from '../startRules';
import { ImageControls, InfoPanel, LevelIndicator, RecorderSettingsSheet, StartList } from './lazyPanels';

/** The panels over the camera: «Imagen», the grid and level, the settings fan, the start list and the «i» panel. */
export const OverlaysLayer = memo(function OverlaysLayer({
  covered,
  showCamera,
  camReady,
  aspect,
  grid,
  level,
  image,
  settings,
  start,
  info,
}: {
  /** A confirmation is up: the panels give way. */
  covered: boolean;
  showCamera: boolean;
  camReady: boolean;
  aspect: number;
  grid: boolean;
  level: boolean;
  image: {
    open: boolean;
    info: TrackInfo | null;
    state: ImageState;
    onExposure: (value: number) => void;
    onExposurePreview: (value: number) => void;
    onWhiteBalance: (kelvin: number | null) => void;
    onLock: (locked: boolean) => void;
    onClose: () => void;
  };
  settings: RecorderSettingsProps;
  start: {
    open: boolean;
    current: StartChoice;
    hereAt: number | null;
    range: { start: number; end: number } | null;
    clips: Clip[];
    onPick: (choice: StartChoice) => void;
    onClose: () => void;
  };
  info: {
    open: boolean;
    track: MediaStreamTrack | undefined;
    format: RecordFormat | null;
    deviceId: string | null;
    mode: string;
    pace: string;
    video: HTMLVideoElement | null;
    bench: BenchResult | null;
    rest: PaceRest | null;
    onRemeasure: (() => void) | undefined;
    paceHint: string | undefined;
    last: TakeStats | null;
    onClose: () => void;
  };
}) {
  return (
    <>
      {/* REQ-23 · Each panel loads on demand (lazyPanels.tsx), in a boundary of its own: a loading one hides nothing else. */}
      <Suspense fallback={null}>
        <AnimatePresence>
          {image.open && image.info && !covered && showCamera && (
            <ImageControls
              info={image.info}
              state={image.state}
              onExposure={image.onExposure}
              onExposurePreview={image.onExposurePreview}
              onWhiteBalance={image.onWhiteBalance}
              onLock={image.onLock}
              onClose={image.onClose}
            />
          )}
        </AnimatePresence>
      </Suspense>

      {/* A1: grid of thirds and level, over the live picture only. */}
      {showCamera && camReady && grid && (
        <GridOverlay aspect={aspect} className="pointer-events-none absolute inset-0 z-[5]" />
      )}
      {showCamera && camReady && level && (
        <Suspense fallback={null}>
          <LevelIndicator className="pointer-events-none absolute inset-0 z-[5]" />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <RecorderSettingsSheet {...settings} />
      </Suspense>

      <Suspense fallback={null}>
        <AnimatePresence>
          {start.open && !covered && (
            <StartList
              current={start.current}
              hereAt={start.hereAt}
              range={start.range}
              clips={start.clips}
              onPick={start.onPick}
              onClose={start.onClose}
            />
          )}
        </AnimatePresence>
      </Suspense>

      <Suspense fallback={null}>
        <AnimatePresence>
          {info.open && !covered && (
            <InfoPanel
              track={info.track}
              format={info.format}
              deviceId={info.deviceId}
              mode={info.mode}
              pace={info.pace}
              video={info.video}
              bench={info.bench}
              rest={info.rest}
              // Only where measuring again changes something: a lighter mode learnt, a first «too slow» waiting, or a
              // mode that is measured (60 fps, above 1080p). Otherwise the panel says when it will be measured.
              onRemeasure={info.onRemeasure}
              paceHint={info.paceHint}
              last={info.last}
              onClose={info.onClose}
            />
          )}
        </AnimatePresence>
      </Suspense>
    </>
  );
});
