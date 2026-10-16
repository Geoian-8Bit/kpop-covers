import type { FollowPath, Video } from '@coverscape/shared';
import { useCallback } from 'react';
import { useCreateFollowPath, useFollowPaths, useUpdateFollowPath } from '@/data/follow';
import { MOVENET_MULTIPOSE } from '@/features/pose/models';
import { friendlyError } from '@/lib/supabase';
import { usePlayer } from '@/player/store';
import { useToast } from '@/providers/ToastProvider';
import { analyzeFollow, FollowError } from './analyze';
import {
  cleanManualKeyframes,
  compressKeyframes,
  keyframe,
  spliceFrom,
  upsertKeyframe,
  type Box,
  type FollowPick,
} from './followPath';
import { followUi, useFollowUi } from './followUi';

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

/** F10 · What the follow controls do: new paths (analysed or by hand), corrections, manual points. */
export function useFollowActions(video: Video) {
  const toast = useToast();
  const create = useCreateFollowPath();
  const update = useUpdateFollowPath();
  const paths = useFollowPaths(video.id);
  const offset = video.source === 'youtube' ? Number(video.file_offset_seconds ?? 0) : 0;

  /** Runs the analysis with progress; returns null when cancelled or failed (already told). */
  const run = useCallback(
    async (opts: {
      pathId: string | null;
      label: string;
      at: number;
      pick: FollowPick;
      direction: 'both' | 'forward';
    }) => {
      const src = stageVideo()?.currentSrc;
      if (!src) {
        toast('Abre el archivo del vídeo para analizarlo', 'info');
        return null;
      }
      if (useFollowUi.getState().job) return null;
      const abort = new AbortController();
      followUi.job({ pathId: opts.pathId, label: opts.label, phase: 'model', done: 0, total: 0, abort });
      try {
        const result = await analyzeFollow({
          src,
          offset,
          at: opts.at,
          pick: opts.pick,
          direction: opts.direction,
          signal: abort.signal,
          onProgress: (p) => followUi.progress(p),
        });
        followUi.progress({ phase: 'saving' });
        return result;
      } catch (err) {
        if (isAbort(err)) toast('Análisis cancelado', 'info');
        else
          toast(
            err instanceof Error && (err instanceof FollowError || err.name === 'ModelLoadError')
              ? err.message
              : friendlyError(err),
            'error',
          );
        followUi.job(null);
        return null;
      }
    },
    [offset, toast],
  );

  /** «Seguir»: analyse the whole song from the chosen dancer, then share the path and follow it. */
  const startAuto = useCallback(
    async (draft: { at: number; pick: FollowPick; label: string; memberId: string | null }) => {
      const result = await run({
        pathId: null,
        label: draft.label,
        at: draft.at,
        pick: draft.pick,
        direction: 'both',
      });
      if (!result) return;
      try {
        const path = await create.mutateAsync({
          video_id: video.id,
          label: draft.label,
          member_id: draft.memberId,
          source: 'auto',
          model: result.model,
          keyframes: compressKeyframes(result.keyframes),
        });
        usePlayer.getState().setFollowPath(path.id);
        const lost = result.frames > 0 ? 1 - result.seen / result.frames : 0;
        toast(
          lost > 0.25
            ? `Recorrido de «${path.label}» guardado. En algunos momentos no se le veía: revisa y corrige si hace falta.`
            : `Siguiendo a «${path.label}». El recorrido queda guardado para todo el grupo.`,
          'success',
        );
      } catch (err) {
        toast(friendlyError(err), 'error');
      } finally {
        followUi.job(null);
      }
    },
    [create, run, toast, video.id],
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

  /** «Corregir desde aquí»: the right dancer at this moment; everything after is recomputed. */
  const correct = useCallback(
    async (path: FollowPath, at: number, pick: FollowPick) => {
      const result = await run({ pathId: path.id, label: path.label, at, pick, direction: 'forward' });
      if (!result) return;
      try {
        const keyframes = compressKeyframes(spliceFrom(path.keyframes, at, result.keyframes));
        await update.mutateAsync({
          id: path.id,
          patch: { keyframes, model: result.model ?? MOVENET_MULTIPOSE, source: 'auto' },
        });
        toast(`Corregido: «${path.label}» desde este momento`, 'success');
      } catch (err) {
        toast(friendlyError(err), 'error');
      } finally {
        followUi.job(null);
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

  return { paths, startAuto, startManual, correct, placePoint, saving: create.isPending || update.isPending };
}
