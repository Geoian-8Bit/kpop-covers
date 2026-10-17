import { formatTime, type FollowPath, type Video } from '@coverscape/shared';
import { useCallback } from 'react';
import {
  useCreateFollowPath,
  useDeleteFollowPath,
  useFollowPaths,
  useUpdateFollowPath,
} from '@/data/follow';
import { friendlyError } from '@/lib/supabase';
import { hasRange, usePlayer } from '@/player/store';
import { useToast } from '@/providers/ToastProvider';
import type { AnalyzeResult } from './analyze';
import {
  cleanManualKeyframes,
  compressKeyframes,
  keyframe,
  spliceFrom,
  removeKeyframeNear,
  spliceRange,
  upsertKeyframe,
  type Box,
  type FollowKeyframe,
  type FollowPick,
} from './followPath';
import { studioHost } from './analysisHold';
import { createEta, steadyRemaining, type Span } from './followPlan';
import { FILE_CHANGED, followUi, useFollowUi } from './followUi';

const isAbort = (err: unknown) => err instanceof DOMException && err.name === 'AbortError';

/** The studio's stage box (set by FollowStageLayer while it is mounted). */
let stageBox: HTMLElement | null = null;
export function registerFollowStage(el: HTMLElement | null): void {
  stageBox = el;
}

/** The <video> on the studio's stage (the file playing now), or null with YouTube. */
export function stageVideo(): HTMLVideoElement | null {
  return stageBox?.querySelector('video') ?? null;
}

/** 10 · The analysis running (or closing) now: the next one waits for it. */
let lastRun: Promise<void> = Promise.resolve();

type ReadyPart = { keyframes: FollowKeyframe[]; span: Span; model: string };

/** «de 0:40 a 1:30» */
const spanText = (s: Span) => `de ${formatTime(s.start)} a ${formatTime(s.end)}`;

/** F10 · What the follow controls do: new paths (analysed or by hand), corrections, manual points. */
export function useFollowActions(video: Video) {
  const toast = useToast();
  const create = useCreateFollowPath();
  const update = useUpdateFollowPath();
  const remove = useDeleteFollowPath();
  const paths = useFollowPaths(video.id);
  const offset = video.source === 'youtube' ? Number(video.file_offset_seconds ?? 0) : 0;

  /**
   * Runs the analysis with progress. 15 · `onReady` saves the stretch being watched as soon as it is done (true:
   * saved, the zoom follows from now on); the rest goes on. Returns the result (complete, or what was done when
   * stopped after that point) and whether the user stopped it; null when cancelled earlier or failed (already told).
   */
  const run = useCallback(
    async (opts: {
      pathId: string | null;
      label: string;
      at: number;
      pick: FollowPick;
      direction: 'both' | 'forward';
      /** `sameFile`: false once another file came on the stage (what was saved is not that file's). */
      onReady: (part: ReadyPart, sameFile: () => boolean) => Promise<boolean>;
    }): Promise<{ result: AnalyzeResult; stopped: boolean; abort: AbortController } | null> => {
      const src = stageVideo()?.currentSrc;
      if (!src) {
        toast('Abre el archivo del vídeo para analizarlo', 'info');
        return null;
      }
      if (useFollowUi.getState().job) return null;
      const abort = new AbortController();
      followUi.job({
        pathId: opts.pathId,
        label: opts.label,
        phase: 'model',
        done: 0,
        total: 0,
        abort,
        ready: false,
        remaining: null,
        held: null,
      });
      const { loop } = usePlayer.getState();
      const eta = createEta();
      const started = performance.now();
      // 7 · Stopped because another file (or offset) came on the stage: what was analysed is not that file's.
      const sameFile = () => abort.signal.reason !== FILE_CHANGED;
      // 10 · One analysis at a time: an older one (stopped by a change of song) first closes its video and frees
      // the shared detector and tracker.
      const before = lastRun;
      let finished!: () => void;
      lastRun = new Promise<void>((resolve) => (finished = resolve));
      try {
        await before;
        if (abort.signal.aborted) throw new DOMException('Cancelado', 'AbortError');
        // The analysis (pose models' glue, tracker, planner) loads when the first one starts, not with the studio.
        const { analyzeFollow } = await import('./analyze');
        if (abort.signal.aborted) throw new DOMException('Cancelado', 'AbortError');
        const result = await analyzeFollow({
          src,
          offset,
          at: opts.at,
          pick: opts.pick,
          direction: opts.direction,
          focus: hasRange(loop) ? { start: loop.start, end: loop.end } : null,
          signal: abort.signal,
          host: studioHost,
          onHold: (held) => {
            // The time waited is not the analysis being slow.
            if (!held) eta.reset();
            followUi.progress({ held, ...(held ? { remaining: null } : {}) });
          },
          onProgress: (p) => {
            if (p.phase !== 'frames') {
              followUi.progress({ phase: p.phase, done: p.done, total: p.total });
              return;
            }
            eta.push(performance.now(), p.total > 0 ? p.done / p.total : 0);
            const shown = useFollowUi.getState().job?.remaining ?? null;
            followUi.progress({
              phase: 'frames',
              done: p.done,
              total: p.total,
              remaining: steadyRemaining(shown, eta.remaining()),
            });
          },
          onReady: async (part) => {
            if (import.meta.env.DEV) {
              const s = Math.round((performance.now() - started) / 100) / 10;
              console.info('[seguir] tramo listo', { segundos: s, tramo: part.span });
            }
            // Stopped meanwhile: nothing saved now (a stop saves what was done at the end; a new file, nothing).
            if (abort.signal.aborted) return;
            const saved = await opts.onReady(part, sameFile);
            if (saved && !abort.signal.aborted) followUi.progress({ ready: true });
          },
        });
        if (!sameFile()) {
          toast('Análisis parado: has cambiado el archivo del vídeo', 'info');
          followUi.endJob(abort);
          return null;
        }
        followUi.progress({ phase: 'saving', held: null });
        if (import.meta.env.DEV) {
          // 15 · For measuring on real devices (development builds only).
          console.info('[seguir] análisis', {
            segundos: Math.round(result.ms / 100) / 10,
            carga: Math.round(result.loadMs),
            fotogramas: result.frames,
            soloRecorte: Math.round(result.cropShare * 100) + ' %',
            visto: Math.round((result.seen / Math.max(1, result.frames)) * 100) + ' %',
            motor: result.backend,
            tramo: result.span,
            completo: result.complete,
          });
        }
        return { result, stopped: abort.signal.aborted, abort };
      } catch (err) {
        if (isAbort(err)) toast('Análisis cancelado', 'info');
        else
          toast(
            err instanceof Error && (err.name === 'FollowError' || err.name === 'ModelLoadError')
              ? err.message
              : friendlyError(err),
            'error',
          );
        followUi.endJob(abort);
        return null;
      } finally {
        finished();
      }
    },
    [offset, toast],
  );

  /**
   * «Seguir»: the stretch being watched first — saved and followed as soon as it is done — then the rest of the
   * song in the background, saved again at the end (or what was done, if stopped).
   */
  const startAuto = useCallback(
    async (draft: { at: number; pick: FollowPick; label: string; memberId: string | null }) => {
      let savedId: string | null = null;
      const row = (keyframes: FollowKeyframe[], model: string) => ({
        video_id: video.id,
        label: draft.label,
        member_id: draft.memberId,
        source: 'auto' as const,
        model,
        keyframes: compressKeyframes(keyframes),
      });
      const done = await run({
        pathId: null,
        label: draft.label,
        at: draft.at,
        pick: draft.pick,
        direction: 'both',
        onReady: async (part, sameFile) => {
          try {
            const path = await create.mutateAsync(row(part.keyframes, part.model));
            if (!sameFile()) {
              // Another file came on while saving: this path is not of it (archived, as a delete always is).
              remove.mutate(path);
              return false;
            }
            savedId = path.id;
            usePlayer.getState().setFollowPath(path.id);
            toast(`Ya sigues a «${path.label}» aquí. Se sigue analizando el resto de la canción.`, 'success');
            return true;
          } catch (err) {
            // Tried again with the whole path at the end.
            toast(friendlyError(err), 'error');
            return false;
          }
        },
      });
      if (!done) return;
      const { result, stopped, abort } = done;
      try {
        let path: FollowPath;
        if (savedId) {
          path = await update.mutateAsync({
            id: savedId,
            patch: { keyframes: compressKeyframes(result.keyframes), model: result.model },
          });
        } else {
          path = await create.mutateAsync(row(result.keyframes, result.model));
          usePlayer.getState().setFollowPath(path.id);
        }
        const lost = result.frames > 0 ? 1 - result.seen / result.frames : 0;
        toast(
          !result.complete
            ? `${stopped ? 'Análisis parado' : 'El análisis se paró'}. «${path.label}» se sigue ${spanText(result.span)}.`
            : lost > 0.25
              ? `Recorrido de «${path.label}» guardado. En algunos momentos no se le veía: revisa y corrige si hace falta.`
              : `Recorrido de «${path.label}» completo y guardado para todo el grupo.`,
          result.complete && lost <= 0.25 ? 'success' : 'info',
        );
      } catch (err) {
        toast(friendlyError(err), 'error');
      } finally {
        followUi.endJob(abort);
      }
    },
    [create, remove, run, toast, update, video.id],
  );

  /** Manual mode: the first box placed, the rest come with «Añadir punto aquí». */
  const startManual = useCallback(
    async (draft: { at: number; box: Box; label: string; memberId: string | null }) => {
      try {
        const path = await create.mutateAsync({
          video_id: video.id,
          label: draft.label,
          member_id: draft.memberId,
          source: 'manual',
          model: null,
          keyframes: [keyframe(Math.round(draft.at * 100) / 100, draft.box)],
        });
        usePlayer.getState().setFollowPath(path.id);
        toast(`Primer punto de «${path.label}». Ve a otros momentos y pulsa «Añadir punto aquí».`, 'success');
      } catch (err) {
        toast(friendlyError(err), 'error');
      }
    },
    [create, toast, video.id],
  );

  /**
   * «Corregir desde aquí»: the right dancer at this moment; everything after is recomputed. 15 · The stretch
   * being watched is corrected first (the old path stays after it until the rest is done).
   */
  const correct = useCallback(
    async (path: FollowPath, at: number, pick: FollowPick) => {
      const old = path.keyframes;
      const done = await run({
        pathId: path.id,
        label: path.label,
        at,
        pick,
        direction: 'forward',
        onReady: async (part, sameFile) => {
          try {
            await update.mutateAsync({
              id: path.id,
              patch: {
                keyframes: compressKeyframes(spliceRange(old, at, part.span.end, part.keyframes)),
                model: part.model,
                source: 'auto',
              },
            });
            if (!sameFile()) {
              // Another file came on while saving: the path goes back to how it was.
              update.mutate({ id: path.id, patch: { keyframes: old, model: path.model, source: path.source } });
              return false;
            }
            toast(`Corregido «${path.label}» en este tramo. Se sigue con el resto.`, 'success');
            return true;
          } catch (err) {
            toast(friendlyError(err), 'error');
            return false;
          }
        },
      });
      if (!done) return;
      const { result, stopped, abort } = done;
      try {
        const keyframes = result.complete
          ? spliceFrom(old, at, result.keyframes)
          : spliceRange(old, at, result.span.end, result.keyframes);
        await update.mutateAsync({
          id: path.id,
          patch: { keyframes: compressKeyframes(keyframes), model: result.model, source: 'auto' },
        });
        toast(
          result.complete
            ? `Corregido: «${path.label}» desde este momento`
            : `${stopped ? 'Análisis parado' : 'El análisis se paró'}. «${path.label}» queda corregido ${spanText(result.span)}.`,
          result.complete ? 'success' : 'info',
        );
      } catch (err) {
        toast(friendlyError(err), 'error');
      } finally {
        followUi.endJob(abort);
      }
    },
    [run, toast, update],
  );

  /** Manual mode: place (or move) the box at this moment. */
  const placePoint = useCallback(
    async (path: FollowPath, at: number, box: Box) => {
      try {
        await update.mutateAsync({
          id: path.id,
          patch: { keyframes: cleanManualKeyframes(upsertKeyframe(path.keyframes, at, box)) },
        });
        toast('Punto guardado', 'success');
      } catch (err) {
        toast(friendlyError(err), 'error');
      }
    },
    [toast, update],
  );

  /** Manual mode: takes away the point placed near this moment (never the only one). */
  const removePoint = useCallback(
    async (path: FollowPath, at: number) => {
      if (path.keyframes.length <= 1) {
        toast('Es el único punto: borra el recorrido si ya no lo quieres', 'info');
        return;
      }
      try {
        await update.mutateAsync({
          id: path.id,
          patch: { keyframes: cleanManualKeyframes(removeKeyframeNear(path.keyframes, at)) },
        });
        toast('Punto quitado', 'success');
      } catch (err) {
        toast(friendlyError(err), 'error');
      }
    },
    [toast, update],
  );

  return {
    paths,
    startAuto,
    startManual,
    correct,
    placePoint,
    removePoint,
    saving: create.isPending || update.isPending,
  };
}
