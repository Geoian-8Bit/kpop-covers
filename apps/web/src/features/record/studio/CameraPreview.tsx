import { memo, useLayoutEffect, type RefObject } from 'react';
import { cn } from '@/lib/cn';
import type { CameraView } from '../useCamera';
import { useCameraZoom } from '../zoomStore';
import type { PreviewHandlers } from './usePreviewGestures';

/**
 * P19 · The preview is always the live camera <video>: the browser composites it on its own, so nothing the page
 * does (a busy main thread, the canvas being drawn) can hold it up. A digital zoom is shown by cropping it with
 * CSS inside a box of the frame's shape, exactly the centre crop the canvas records. Mirrored on screen only
 * for the front camera. REQ-23 · The crop comes from the zoom store and is written straight on the <video>: a pinch
 * never re-renders the recorder. Never hidden while a take may draw from it: some browsers stop presenting a hidden
 * video, and the canvas take (drawn from its frames) would freeze; when the canvas is the preview, it covers it.
 */
export const CameraPreview = memo(function CameraPreview({
  source,
  host,
  aspect,
  facing,
  showCamera,
  canvasOnScreen,
  handlers,
}: {
  source: RefObject<HTMLVideoElement | null>;
  host: RefObject<HTMLDivElement | null>;
  aspect: number;
  facing: CameraView['facing'];
  showCamera: boolean;
  canvasOnScreen: boolean;
  handlers: PreviewHandlers;
}) {
  // The value of this render (as before), then every new crop as it comes, until the next render.
  useLayoutEffect(() => {
    const paint = (crop: number) => {
      const el = source.current;
      if (el) el.style.transform = previewTransform(crop, facing) ?? '';
    };
    paint(useCameraZoom.getState().crop);
    return useCameraZoom.subscribe((z, before) => {
      if (z.crop !== before.crop) paint(z.crop);
    });
  }, [source, facing]);
  const transform = previewTransform(useCameraZoom.getState().crop, facing);
  return (
    <>
      <div
        className={cn(
          'pointer-events-none absolute inset-0 grid place-items-center [container-type:size]',
          !showCamera && 'invisible',
        )}
      >
        <div
          className="relative overflow-hidden"
          style={{ aspectRatio: aspect, width: `min(100cqw, calc(100cqh * ${aspect}))` }}
        >
          <video
            ref={source}
            autoPlay
            muted
            playsInline
            className="absolute inset-0 size-full object-contain"
            style={transform ? { transform } : undefined}
          />
        </div>
      </div>
      {/*
        The redrawn frame a canvas take records. Shown only when the phone was turned mid-take (the take keeps its
        first shape, with bars): then the preview has to be the recorded frame. Pinch zooms, tap focuses.
      */}
      <div
        ref={host}
        {...handlers}
        onPointerCancel={handlers.onPointerCancel}
        className={cn(
          'absolute inset-0 touch-none',
          facing === 'user' && '-scale-x-100',
          !showCamera && 'invisible',
          // The recorded frame on top of the live video, which stays playing underneath (covered, not hidden).
          canvasOnScreen ? 'bg-black' : '[&>canvas]:invisible',
        )}
      />
    </>
  );
});

/** The crop shown with CSS, mirrored for the front camera (undefined: the video as it comes). */
function previewTransform(crop: number, facing: CameraView['facing']): string | undefined {
  return crop > 1.001 || facing === 'user'
    ? `scale(${facing === 'user' ? -crop : crop}, ${crop})`
    : undefined;
}
