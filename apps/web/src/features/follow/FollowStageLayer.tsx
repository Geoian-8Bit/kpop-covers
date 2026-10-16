import type { FollowPath, Video } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { useFollowPaths } from '@/data/follow';
import { cn } from '@/lib/cn';
import { snappy } from '@/lib/motion';
import { usePlayer } from '@/player/store';
import { NO_ZOOM, sameZoom, type Pt, type Size, type Zoom } from '@/player/zoom';
import { useToast } from '@/providers/ToastProvider';
import { peopleInFrame } from './analyze';
import {
  boxAt,
  boxFromDrag,
  followZoomAt,
  pathScale,
  pickCandidate,
  pictureToScreen,
  screenToPicture,
  type Box,
  type Candidate,
  type FollowPick,
} from './followPath';
import { followUi, jobPercent, takeFollowOpener, useFollowUi, type PickMode } from './followUi';
import { registerFollowStage, stageVideo, useFollowActions } from './useFollowActions';

/**
 * F10 · Over the studio's stage: drives the zoom along the followed dancer, lets the user choose a dancer on the
 * paused picture (a tap on a person found by the model, or a box drawn by hand), and shows where the followed
 * dancer is while paused. Mounted inside the stage box (StudioPage › MediaStage) with one line.
 */
export function FollowStageLayer({
  video,
  box,
  media,
  canZoom,
}: {
  video: Video;
  box: Size;
  media: Size | null;
  /** A file is playing and ready (the zoom can be applied; YouTube's player is never altered). */
  canZoom: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    registerFollowStage(ref.current?.parentElement ?? null);
    return () => registerFollowStage(null);
  }, []);
  // Leaving the song: no half-finished choice or analysis carries over to the next one.
  useEffect(() => () => followUi.reset(), [video.id]);

  const paths = useFollowPaths(video.id).data;
  const followId = usePlayer((s) => s.followPathId);
  const path = paths?.find((p) => p.id === followId) ?? null;
  const picking = useFollowUi((s) => s.picking);
  // While choosing, the whole picture shows (the right dancer may be outside the zoom); following resumes after.
  useFollowDriver(path, canZoom && !picking);

  const job = useFollowUi((s) => s.job);
  const playing = usePlayer((s) => s.playing);
  const pickPath =
    picking && 'pathId' in picking ? (paths?.find((p) => p.id === picking.pathId) ?? null) : null;

  return (
    <>
      <span ref={ref} hidden />
      {path && canZoom && !playing && !picking && <PathOutline path={path} box={box} media={media} />}
      {picking && (
        <PickOverlay
          key={JSON.stringify(picking)}
          mode={picking}
          video={video}
          path={pickPath}
          box={box}
          media={media}
          canRead={canZoom}
        />
      )}
      <AnimatePresence>
        {job && (
          <motion.div
            key="follow-job"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={snappy}
            aria-hidden
            className="pointer-events-none absolute right-3 top-3 z-30 flex items-center gap-2 rounded-[10px] bg-sumi-950/85 px-3 py-2 text-[12px] font-semibold text-washi"
          >
            <span aria-hidden className="contents">
              <Spinner className="size-3.5" />
            </span>
            {job.phase === 'frames'
              ? `Analizando ${jobPercent(job)} %`
              : job.phase === 'saving'
                ? 'Guardando…'
                : 'Preparando…'}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * While a path is followed and a file shows: the zoom glides along the dancer (keyframes interpolated, a few
 * updates a second, the zoom layer's spring smooths between them). Moving the zoom by hand stops following.
 */
function useFollowDriver(path: FollowPath | null, canZoom: boolean) {
  const toast = useToast();
  useEffect(() => {
    if (!path || !canZoom || path.keyframes.length === 0) return;
    const kfs = path.keyframes;
    const scale = pathScale(kfs);
    let applied: Zoom | null = null;
    let lastAt = 0;
    const apply = (t: number) => {
      const z = followZoomAt(kfs, t, { scale });
      if (applied && sameZoom(applied, z)) return;
      applied = z;
      usePlayer.getState().setZoom(z);
    };
    apply(usePlayer.getState().time);
    return usePlayer.subscribe((s, prev) => {
      if (s.followPathId !== path.id) return;
      // A clip (re)applied sets its own zoom: follow again from there, it isn't the user moving it.
      if (s.loop !== prev.loop || s.activeClipId !== prev.activeClipId) {
        applied = null;
        apply(s.time);
        return;
      }
      if (s.zoom !== prev.zoom && applied && !sameZoom(s.zoom, applied)) {
        s.setFollowPath(null);
        toast(`Has movido el zoom: ya no sigues a «${path.label}»`, 'info');
        return;
      }
      if (s.time !== prev.time) {
        const now = performance.now();
        if (s.playing && now - lastAt < 80) return;
        lastAt = now;
        apply(s.time);
      }
    });
  }, [path, canZoom, toast]);
}

/** Where the followed dancer is on the paused picture. */
function PathOutline({ path, box, media }: { path: FollowPath; box: Size; media: Size | null }) {
  const time = usePlayer((s) => s.time);
  const zoom = usePlayer((s) => s.zoom);
  const mirrored = usePlayer((s) => s.mirrored);
  const b = boxAt(path.keyframes, time);
  if (!b || !(box.width > 0)) return null;
  const r = pictureToScreen(b, zoom, box, media, mirrored);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-[15] rounded-[6px] border-2 border-kin-300/80"
      style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
    >
      <span className="absolute -top-6 left-0 max-w-40 truncate rounded-[6px] bg-sumi-950/85 px-1.5 py-0.5 text-[11px] font-semibold text-kin-200">
        {path.label}
      </span>
    </div>
  );
}

const PICK_TEXT: Record<PickMode['kind'], string> = {
  auto: 'Toca al bailarín que quieres seguir (o dibuja un recuadro a su alrededor).',
  manual: 'Dibuja un recuadro alrededor del bailarín (o tócalo).',
  correct: 'Toca al bailarín correcto: se recalcula desde este momento.',
  point: 'Coloca el recuadro donde está el bailarín ahora.',
};

/** Choosing on the paused picture: people found by the model as buttons, or a box drawn with the finger. */
function PickOverlay({
  mode,
  video,
  path,
  box,
  media,
  canRead,
}: {
  mode: PickMode;
  video: Video;
  path: FollowPath | null;
  box: Size;
  media: Size | null;
  /** The picture can be read (a file is on screen): look for people with the model. */
  canRead: boolean;
}) {
  const toast = useToast();
  const actions = useFollowActions(video);
  const zoom = usePlayer((s) => s.zoom);
  const mirrored = usePlayer((s) => s.mirrored);
  const findPeople = canRead && (mode.kind === 'auto' || mode.kind === 'correct');
  const [people, setPeople] = useState<Candidate[] | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>(findPeople ? 'loading' : 'idle');
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ from: Pt; to: Pt; id: number } | null>(null);
  const layer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    usePlayer.getState().setZoom(NO_ZOOM);
  }, []);

  useEffect(() => {
    if (!findPeople) return;
    const el = stageVideo();
    if (!el) {
      setStatus('error');
      setError('No hay archivo en pantalla.');
      return;
    }
    let alive = true;
    peopleInFrame(el)
      .then(({ candidates }) => {
        if (!alive) return;
        setPeople(candidates);
        setStatus('idle');
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setStatus('error');
        setError(err instanceof Error ? err.message : 'No se pudo cargar el modelo.');
      });
    return () => {
      alive = false;
    };
  }, [findPeople]);

  // Focus goes into the picker (on «Cancelar») and back to the button that opened it when it closes (unless the
  // name dialog takes it).
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    return () => {
      setTimeout(() => {
        // Still choosing (the picker came back, as React does in development): nothing to give back yet.
        if (useFollowUi.getState().picking) return;
        if (document.querySelector('[role="dialog"]')) return;
        const back = takeFollowOpener();
        const target =
          back && back.isConnected && !back.matches(':disabled')
            ? back
            : document.querySelector<HTMLElement>('[data-follow-cancel]');
        target?.focus();
      }, 60);
    };
  }, []);

  // Escape cancels; space and k don't play the song while choosing (ahead of the studio's own shortcuts). Only for
  // keys meant for the picker: never in a field, a dialog, with modifiers, or with the focus elsewhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== ' ' && e.key !== 'k') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target?.closest(
          'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="dialog"]',
        )
      )
        return;
      const inPicker =
        target === document.body ||
        target === document.documentElement ||
        (target != null && layer.current?.contains(target));
      if (!inPicker) return;
      if (e.key === ' ' && target?.closest('button')) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      if (e.key === 'Escape') followUi.pick(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const local = (e: { clientX: number; clientY: number }): Pt => {
    const rect = layer.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const toPicture = (p: Pt) => screenToPicture(p, zoom, box, media, mirrored);

  function choose(pick: FollowPick, shown: Box) {
    const at = usePlayer.getState().time;
    switch (mode.kind) {
      case 'auto':
        followUi.draft({ mode: 'auto', at, pick, box: shown });
        return;
      case 'manual':
        followUi.draft({ mode: 'manual', at, pick: { box: shown }, box: shown });
        return;
      case 'correct':
        followUi.pick(null);
        if (path) void actions.correct(path, at, pick);
        return;
      case 'point':
        followUi.pick(null);
        if (path) void actions.placePoint(path, at, shown);
        return;
    }
  }

  function release(from: Pt, to: Pt) {
    const a = toPicture(from);
    const b = toPicture(to);
    const tap = Math.hypot(to.x - from.x, to.y - from.y) < 10;
    if (tap && (b.x < 0 || b.x > 1 || b.y < 0 || b.y > 1)) return; // a tap on the black bars
    if (mode.kind === 'manual' || mode.kind === 'point' || !canRead) {
      choose({ box: boxFromDrag(a, b) }, boxFromDrag(a, b));
      return;
    }
    if (tap) {
      const i = people ? pickCandidate(people, { point: b }) : null;
      if (i == null) {
        toast(
          people?.length
            ? 'Ahí no hay nadie: toca encima de un bailarín'
            : 'No se ve a nadie: dibuja un recuadro a su alrededor',
          'info',
        );
        return;
      }
      choose({ box: people![i]!.box }, people![i]!.box);
      return;
    }
    const drawn = boxFromDrag(a, b);
    choose({ box: drawn }, drawn);
  }

  const dragRect = drag
    ? {
        left: Math.min(drag.from.x, drag.to.x),
        top: Math.min(drag.from.y, drag.to.y),
        width: Math.abs(drag.to.x - drag.from.x),
        height: Math.abs(drag.to.y - drag.from.y),
      }
    : null;

  return (
    <div
      ref={layer}
      role="group"
      aria-label="Elegir bailarín"
      aria-describedby="follow-pick-help"
      className="absolute inset-0 z-[35] cursor-crosshair touch-none bg-sumi-950/40"
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* gone */
        }
        const p = local(e);
        setDrag({ from: p, to: p, id: e.pointerId });
      }}
      onPointerMove={(e) => {
        if (!drag || drag.id !== e.pointerId) return;
        setDrag({ ...drag, to: local(e) });
      }}
      onPointerUp={(e) => {
        if (!drag || drag.id !== e.pointerId) return;
        setDrag(null);
        release(drag.from, local(e));
      }}
      onPointerCancel={() => setDrag(null)}
    >
      {/* The text lets the finger through (drawing can start under it); only Cancelar takes taps. */}
      <div className="pointer-events-none absolute inset-x-2 top-2 z-10 flex items-start gap-2">
        <p
          id="follow-pick-help"
          role="status"
          className="min-w-0 flex-1 rounded-[10px] bg-sumi-950/85 px-3 py-2 text-[12px] leading-snug text-washi sm:text-[13px]"
        >
          {status === 'loading' ? (
            <span className="flex items-center gap-2">
              <span aria-hidden className="contents">
                <Spinner className="size-3.5" />
              </span>{' '}
              Buscando bailarines… (la primera vez se descarga el modelo)
            </span>
          ) : status === 'error' ? (
            <span className="text-enji-200">{error} Puedes dibujar un recuadro.</span>
          ) : (
            PICK_TEXT[mode.kind]
          )}
        </p>
        <button
          ref={cancelRef}
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => followUi.pick(null)}
          className="pointer-events-auto min-h-11 shrink-0 rounded-[10px] bg-sumi-950/90 px-3.5 text-[13px] font-bold text-washi hover:bg-sumi-800"
        >
          Cancelar
        </button>
      </div>
      {people?.map((p, i) => {
        const r = pictureToScreen(p.box, zoom, box, media, mirrored);
        return (
          <button
            key={i}
            type="button"
            aria-label={`Persona ${i + 1}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => choose({ box: p.box }, p.box)}
            className="absolute rounded-[8px] border-2 border-washi/85 bg-washi/10 transition-colors hover:border-kin-300 hover:bg-kin-300/20 focus-visible:border-kin-300 focus-visible:bg-kin-300/25 focus-visible:outline-none"
            style={{ left: r.left, top: r.top, width: Math.max(r.width, 44), height: Math.max(r.height, 44) }}
          >
            <span className="absolute -bottom-6 left-0 rounded-[6px] bg-sumi-950/85 px-1.5 py-0.5 text-[11px] font-bold text-washi">
              {i + 1}
            </span>
          </button>
        );
      })}
      {dragRect && dragRect.width + dragRect.height > 10 && (
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute rounded-[6px] border-2 border-dashed border-kin-300 bg-kin-300/10',
          )}
          style={dragRect}
        />
      )}
    </div>
  );
}
