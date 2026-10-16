import type { Take, Video } from '@coverscape/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { canShareFile, downloadFile, IS_IOS, shareFile, takeFileName } from '@/features/record/recorder';
import { forgetTake, keepTake, listKeptTakes, loadKeptTake, unkeepTake } from '@/features/record/takeStore';
import { isAbort, shareTake, type SharePhase } from '@/features/takes/shareTake';
import {
  applyBest,
  assignPatch,
  isDeviceId,
  newDeviceId,
  takeRow,
  withWhere,
  type SaveTakeInput,
  type TakeItem,
} from '@/features/takes/takeRules';
import { backend } from '@/lib/backend';
import { friendlyError, FriendlyError } from '@/lib/supabase';

/**
 * F3 / F4 · Saved takes. The row (song, second, speed, who, when…) is shared through the database; the video
 * lives on the phone that recorded it (OPFS, `takeStore`) and, only if someone shares it, as a reduced copy in
 * the private `takes` bucket. «Borrar» archives the row (the delete trigger does it) and deletes this phone's
 * copy; cloud files are never deleted from the app.
 */

export type { TakeItem, TakeWhere } from '@/features/takes/takeRules';
export type { SharePhase } from '@/features/takes/shareTake';

export const takeKeys = {
  all: ['takes'] as const,
  forVideo: (videoId: string | undefined) => ['takes', 'video', videoId] as const,
  sharedBytes: ['takes', 'shared-bytes'] as const,
};

// ───────────── This device ─────────────

const DEVICE_KEY = 'oneshoot.device.v1';
let memoryDeviceId: string | null = null;

/**
 * A random id for this browser on this device, kept in localStorage (lost with the browser's data; in private
 * mode it lasts this visit). It says which phone holds a take; it isn't a secret.
 */
export function deviceId(): string {
  if (memoryDeviceId) return memoryDeviceId;
  try {
    const stored = localStorage.getItem(DEVICE_KEY);
    if (isDeviceId(stored)) return (memoryDeviceId = stored);
  } catch {
    /* storage blocked: an id for this visit */
  }
  const id = newDeviceId();
  try {
    localStorage.setItem(DEVICE_KEY, id);
  } catch {
    /* this visit only */
  }
  return (memoryDeviceId = id);
}

/** An object URL handed to `onPlay`: revoke it when the player closes (cloud URLs are left alone). */
export function releaseTakeUrl(url: string | null | undefined): void {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
}

/**
 * A URL to play a take: this phone's copy (an object URL: release it with `releaseTakeUrl`) or, if it isn't here,
 * a signed URL of the shared copy. Throws a FriendlyError when neither can be opened.
 */
export async function takeUrl(take: TakeItem): Promise<string> {
  if (take.where === 'here') {
    const blob = await loadKeptTake(take.id);
    if (blob) return URL.createObjectURL(blob);
  }
  if (take.shared_path) {
    const url = await backend.signedTakeUrl(take.shared_path);
    if (url) return url;
    throw new FriendlyError('No se pudo abrir la copia de la nube. Revisa la conexión.');
  }
  throw new FriendlyError(take.where === 'here' ? 'Esta toma ya no está en este móvil.' : 'Esta toma está en otro móvil.');
}

/** Name for a downloaded take: the one it was saved with, or one made from the song and the date. */
export function takeDownloadName(take: TakeItem, video: Pick<Video, 'title'>, extension?: string): string {
  const base = take.file_name || takeFileName(video, take.mime_type ?? '', take.recorded_at);
  if (!extension) return base;
  return `${base.replace(/\.[A-Za-z0-9]{1,10}$/, '')}-720p.${extension}`;
}

/**
 * Download a take: this phone's copy (on iPhone through the share sheet, so it can reach Photos), or else the
 * shared 720p copy. Resolves 'cancelled' when the share sheet was closed.
 */
export async function downloadTake(take: TakeItem, video: Pick<Video, 'title'>): Promise<'saved' | 'cancelled'> {
  if (take.where === 'here') {
    const blob = await loadKeptTake(take.id);
    if (blob) {
      const name = takeDownloadName(take, video);
      const file = new File([blob], name, { type: blob.type || take.mime_type || 'video/mp4' });
      if (IS_IOS && canShareFile(file)) {
        const result = await shareFile(file, video.title);
        if (result === 'cancelled') return 'cancelled';
        if (result === 'shared') return 'saved';
      }
      downloadFile(file);
      return 'saved';
    }
  }
  if (take.shared_path) {
    const url = await backend.signedTakeUrl(take.shared_path);
    if (!url) throw new FriendlyError('No se pudo descargar la copia de la nube. Revisa la conexión.');
    const extension = /\.([A-Za-z0-9]{1,10})$/.exec(take.shared_path)?.[1] ?? 'mp4';
    // Storage serves it as an attachment with this name (a cross-site link ignores the `download` attribute).
    const a = document.createElement('a');
    a.href = `${url}${url.includes('?') ? '&' : '?'}download=${encodeURIComponent(takeDownloadName(take, video, extension))}`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return 'saved';
  }
  throw new FriendlyError(take.where === 'here' ? 'Esta toma ya no está en este móvil.' : 'Esta toma está en otro móvil.');
}

// ───────────── Reading ─────────────

/** A song's takes (newest first), each with where its video is: on this phone, in the cloud, or elsewhere. */
export function useTakes(videoId: string | undefined) {
  return useQuery({
    queryKey: takeKeys.forVideo(videoId),
    enabled: Boolean(videoId),
    queryFn: async (): Promise<TakeItem[]> => {
      const [rows, kept] = await Promise.all([backend.listTakes(videoId!), listKeptTakes()]);
      return rows.map((row) => withWhere(row, kept));
    },
  });
}

/**
 * Cloud space really used (against the free plan's 1 GB): by shared takes and in total. Deleted takes still count:
 * their files stay in the cloud until the admin purges them.
 */
export function useSharedTakesBytes() {
  return useQuery({
    queryKey: takeKeys.sharedBytes,
    queryFn: () => backend.storageUsage(),
    staleTime: 60_000,
  });
}

function patchCache(queryClient: QueryClient, videoId: string, fn: (items: TakeItem[]) => TakeItem[]) {
  queryClient.setQueryData<TakeItem[]>(takeKeys.forVideo(videoId), (current) => (current ? fn(current) : current));
}

/** Keep the item's `where` when the server hands back a fresh row. */
function merge(items: TakeItem[], row: Take): TakeItem[] {
  return items.map((t) => (t.id === row.id ? { ...row, where: t.where } : t));
}

// ───────────── Saving (the recorder's «Guardar») ─────────────

export interface SaveTakeVars extends Omit<SaveTakeInput, 'videoId' | 'mimeType' | 'fileName'> {
  video: Pick<Video, 'id'>;
  /** The finished take: its type and name fill `mimeType` / `fileName` when they aren't given. */
  file?: Blob | File | null;
  mimeType?: string | null;
  fileName?: string | null;
}

const isDuplicate = (err: unknown) => {
  const e = err as { code?: string; message?: string } | null;
  return e?.code === '23505' || /takes_pkey|duplicate key/i.test(e?.message ?? '');
};

/**
 * «Guardar»: first marks this phone's copy as kept (`keepTake`), then writes the take's row. If the phone can't
 * keep it (no OPFS / the copy is gone) nothing is written and the error says to download it. If the row fails,
 * the mark is undone (the copy goes back to being the recorder's unsaved take, offered later). Retrying after an
 * answer that got lost on the way finds the row already there and carries on.
 */
export function useSaveTake() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: SaveTakeVars): Promise<TakeItem> => {
      const file = vars.file ?? null;
      const meta = await keepTake(vars.id);
      if (!meta) {
        throw new FriendlyError('Este navegador no deja guardar la toma en el móvil. Descárgala para no perderla.');
      }
      const row = takeRow(
        {
          ...vars,
          videoId: vars.video.id,
          mimeType: vars.mimeType ?? (file?.type || null),
          fileName: vars.fileName ?? (file instanceof File ? file.name : null),
          // When it was recorded, not when it was saved (a recovered take may be days old).
          recordedAt: vars.recordedAt ?? meta.startedAt,
        },
        deviceId(),
      );
      try {
        const take = await backend.insertTake(row);
        return { ...take, where: 'here' };
      } catch (err) {
        if (isDuplicate(err)) {
          const existing = await backend.getTake(vars.id).catch(() => null);
          if (existing) return { ...existing, where: 'here' };
          await unkeepTake(vars.id);
          throw new FriendlyError('Esta toma ya se guardó y luego se borró de «Tomas». Descárgala para no perderla.');
        }
        await unkeepTake(vars.id);
        throw err;
      }
    },
    onSuccess: (item) => {
      patchCache(queryClient, item.video_id, (items) => [item, ...items.filter((t) => t.id !== item.id)]);
      void queryClient.invalidateQueries({ queryKey: takeKeys.forVideo(item.video_id) });
    },
  });
}

// ───────────── Deleting ─────────────

/** Archives the row (everyone stops seeing it, the cloud copy stops being readable) and deletes this phone's copy. */
export function useDeleteTake() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (take: TakeItem) => {
      await backend.deleteTake(take.id);
      // Only once the row is gone: if archiving fails, the video is still here.
      if (take.where === 'here' || take.device_id === deviceId()) await forgetTake(take.id);
      return take;
    },
    onSuccess: (take) => {
      patchCache(queryClient, take.video_id, (items) => items.filter((t) => t.id !== take.id));
      if (take.shared_path) void queryClient.invalidateQueries({ queryKey: takeKeys.sharedBytes });
    },
  });
}

// ───────────── Best take (F4) ─────────────

const BEST_WRITE = ['take-best'] as const;

/** Star / unstar (optimistic). Starring clears the other best take of that person and section (database trigger). */
export function useSetBestTake() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: BEST_WRITE,
    mutationFn: ({ take, isBest }: { take: TakeItem; isBest: boolean }) => backend.updateTake(take.id, { is_best: isBest }),
    onMutate: async ({ take, isBest }) => {
      const key = takeKeys.forVideo(take.video_id);
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData<TakeItem[]>(key);
      queryClient.setQueryData<TakeItem[]>(key, (current) => (current ? applyBest(current, take.id, isBest) : current));
      return { before, key };
    },
    onError: (_err, _vars, context) => {
      if (context?.before) queryClient.setQueryData(context.key, context.before);
    },
    onSettled: (_data, _err, { take }) => {
      // The server is the truth once the last tap of a burst settles.
      if (queryClient.isMutating({ mutationKey: BEST_WRITE }) > 1) return;
      void queryClient.invalidateQueries({ queryKey: takeKeys.forVideo(take.video_id) });
    },
  });
}

// ───────────── «Asignarme las tomas sin nombre» (F2) ─────────────

/** Gives `takes` (this device's unnamed ones) to a member, one by one. Resolves with how many were assigned. */
export function useAssignTakes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ takes, memberId, all }: { takes: TakeItem[]; memberId: string; all: TakeItem[] }) => {
      let current: Take[] = [...all];
      let done = 0;
      for (const take of takes) {
        const fresh = current.find((t) => t.id === take.id) ?? take;
        const row = await backend.updateTake(take.id, assignPatch(fresh, memberId, current));
        current = current.map((t) => (t.id === row.id ? row : t));
        patchCache(queryClient, row.video_id, (items) => merge(items, row));
        done++;
      }
      return done;
    },
    onSettled: (_n, _err, { takes }) => {
      const videoId = takes[0]?.video_id;
      if (videoId) void queryClient.invalidateQueries({ queryKey: takeKeys.forVideo(videoId) });
    },
  });
}

// ───────────── «Compartir con el grupo» ─────────────

export interface ShareState {
  /** The take being shared (null when idle). */
  takeId: string | null;
  phase: SharePhase | 'idle' | 'done' | 'error';
  /** 0–1 while reducing. */
  progress: number;
  error: string | null;
}

const IDLE: ShareState = { takeId: null, phase: 'idle', progress: 0, error: null };

/**
 * Drives one share at a time: `start(take, source)` must be called straight from the tap (iPhone), with the
 * take's Blob already loaded. `cancel()` stops the 720p copy; leaving the screen cancels too.
 */
export function useShareTake() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<ShareState>(IDLE);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);

  const set = useCallback((next: ShareState) => {
    if (mounted.current) setState(next);
  }, []);

  const start = useCallback(
    (take: TakeItem, source: Blob): Promise<Take | null> => {
      if (controller.current) return Promise.resolve(null);
      const abort = new AbortController();
      controller.current = abort;
      set({ takeId: take.id, phase: 'reducing', progress: 0, error: null });
      // Called synchronously (no await before it): the tap must reach the video element.
      const run = shareTake({
        take,
        source,
        signal: abort.signal,
        onProgress: (phase, progress) => set({ takeId: take.id, phase, progress, error: null }),
      });
      return run.then(
        (row) => {
          patchCache(queryClient, row.video_id, (items) => merge(items, row));
          void queryClient.invalidateQueries({ queryKey: takeKeys.sharedBytes });
          set({ takeId: take.id, phase: 'done', progress: 1, error: null });
          return row;
        },
        (err: unknown) => {
          if (isAbort(err)) set(IDLE);
          else set({ takeId: take.id, phase: 'error', progress: 0, error: friendlyError(err) });
          return null;
        },
      ).finally(() => {
        if (controller.current === abort) controller.current = null;
      });
    },
    [queryClient, set],
  );

  const cancel = useCallback(() => controller.current?.abort(), []);
  const reset = useCallback(() => {
    if (!controller.current) set(IDLE);
  }, [set]);

  return { ...state, busy: state.phase === 'reducing' || state.phase === 'uploading' || state.phase === 'saving', start, cancel, reset };
}
