import type { Clip } from '@coverscape/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { prefetchRound, useRoundVideo } from '@/data/tracks';
import type { ClipWithVideo } from '@/lib/backend';
import { tick } from '@/lib/metronome';
import { loadYouTubeApi } from '@/lib/youtubeIframe';
import type { PlayerEngine } from '@/player/engine';
import { usePlayer } from '@/player/store';
import { useLoopController } from '@/player/useLoopController';
import type { Entry } from './playCards';
import type { RoundDraft } from './roundDraft';
import {
  clipEndAt,
  followingPlayable,
  IDLE_ROUND,
  leadShown,
  nextPlayable,
  roundLeadStatus,
  roundReducer,
  type RoundAction,
  type RoundState,
} from './roundRules';
import { forgetFailedClipSource, releaseClipSources, useClipSource } from './useClipSource';

/**
 * REQ-27 · Split out of RoundRunner.tsx: the round's machine. The state (reducer), the song on the stage and when
 * its engine is really this song's, the lead-in clock, putting the clip on, the go, the count-in ticks, the clip's
 * end and the skips. RoundRunner only draws it and wires the controls.
 */
export function useRoundMachine(draft: RoundDraft, all: ClipWithVideo[]) {
  const queryClient = useQueryClient();
  const options = draft.options;
  const byId = useMemo(() => new Map(all.map((c) => [c.id, c])), [all]);
  const entries = useMemo<Entry[]>(
    () => draft.clipIds.map((id, i) => ({ key: `${i}-${id}`, clip: byId.get(id) ?? null })),
    [draft.clipIds, byId],
  );
  const available = useMemo(() => entries.map((e) => Boolean(e.clip?.video)), [entries]);
  const ctx = useRef({ available, options });
  ctx.current = { available, options };
  const [state, dispatch] = useReducer(
    (s: RoundState, a: RoundAction) => roundReducer(s, a, ctx.current),
    IDLE_ROUND,
  );

  // REQ-19 · The whole round's songs and files in one request each, before the first song asks for its own.
  useLayoutEffect(() => {
    void prefetchRound(
      queryClient,
      draft.clipIds.flatMap((id) => byId.get(id)?.video_id ?? []),
    );
  }, [queryClient, draft.clipIds, byId]);

  useLoopController();
  const prefMirror = useRef(true);
  useLayoutEffect(() => {
    usePlayer.getState().reset();
    prefMirror.current = usePlayer.getState().mirrored;
    void loadYouTubeApi().catch(() => undefined);
    return () => {
      usePlayer.getState().reset();
      releaseClipSources();
    };
  }, []);

  const current = state.index >= 0 ? entries[state.index] : undefined;
  const clip = current?.clip ?? null;
  const video = useRoundVideo(clip?.video_id);
  const source = useClipSource(video.data);
  const nextIndex =
    state.phase === 'idle'
      ? nextPlayable(available, 0)
      : state.index >= 0
        ? followingPlayable(available, state.index)
        : -1;
  const nextClip = nextIndex >= 0 ? entries[nextIndex]?.clip : null;
  const nextVideo = useRoundVideo(nextClip?.video_id);
  const nextSource = useClipSource(nextVideo.data);

  // ── The stage: which media is mounted, and when its engine is really this media's ──
  const stageKey =
    clip && source.status === 'youtube'
      ? `${clip.video_id}:yt:${source.youtubeId}`
      : clip && source.status === 'file'
        ? `${clip.video_id}:file:${source.url}`
        : null;
  const engine = usePlayer((s) => s.engine);
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const staleEngine = useRef<PlayerEngine | null>(null);
  useLayoutEffect(() => {
    // Another song: forget the old engine (and its length) before the new one attaches. The old media's error
    // goes too, even when it never got an engine (a file that failed to load, YouTube not answering): left behind,
    // it would skip every clip after it.
    const player = usePlayer.getState();
    staleEngine.current = player.engine;
    setReadyKey(null);
    if (staleEngine.current) player.reset();
    else if (player.error) player.sync({ error: null });
  }, [stageKey]);
  useEffect(() => {
    if (stageKey && engine && engine !== staleEngine.current) setReadyKey(stageKey);
  }, [engine, stageKey]);
  const stageReady = stageKey != null && readyKey === stageKey;

  // ── Clock for the lead-in ──
  // REQ-22 · The same 80 ms check as before (so the numbers, the ticks and the go land on exactly the same frames),
  // but the clock state, and with it the whole round, only moves when what the lead-in shows changes: each whole
  // second of the pause and of the 3-2-1, and the go. About one render a second instead of twelve. Resuming sets the
  // clock with the same instant as the resume (`syncClock`), so the first frame after a pause shows where the count
  // was, not a stale «3».
  const [now, setNow] = useState(() => performance.now());
  const leading = state.phase === 'lead' && state.pausedAt == null;
  const lead = roundLeadStatus(state, leading ? Math.max(now, state.leadStart) : now);
  const shown = lead ? leadShown(lead) : null;
  const shownRef = useRef(shown);
  const stateRef = useRef(state);
  useEffect(() => {
    shownRef.current = shown;
    stateRef.current = state;
  });
  useEffect(() => {
    if (!leading) return;
    const id = window.setInterval(() => {
      const s = stateRef.current;
      const t = performance.now();
      const fresh = roundLeadStatus(s, Math.max(t, s.leadStart));
      if (fresh && leadShown(fresh) !== shownRef.current) setNow(t);
    }, 80);
    return () => window.clearInterval(id);
  }, [leading]);

  // ── Put the clip on (paused, at its start) as soon as its media is ready ──
  const leadKey = `${state.index}:${state.leadStart}`;
  const applied = useRef<string | null>(null);
  // Tied to its clip: the next clip (even of the same song, when its own notice is set in the same commit) never
  // inherits it, and nothing has to clear it on the way.
  const [notice, setNotice] = useState<{ index: number; text: string } | null>(null);
  const noticeText = notice?.index === state.index ? notice.text : null;
  useEffect(() => {
    if (state.phase !== 'lead' || !clip || !stageReady || applied.current === leadKey) return;
    const player = usePlayer.getState();
    player.pause();
    const settings: Pick<Clip, 'id' | 'start_seconds' | 'end_seconds' | 'speed' | 'mirrored'> =
      options.useClipSettings ? clip : { ...clip, speed: 1, mirrored: prefMirror.current };
    const ok = player.applyClip(settings, { autoplay: false });
    applied.current = leadKey;
    if (!ok) {
      setNotice({ index: state.index, text: 'Este clip queda fuera de su vídeo: se salta' });
      return;
    }
    setNotice(null);
    // The round moves on at the clip's end: no A–B loop wrapping back.
    if (usePlayer.getState().loop.enabled) usePlayer.getState().toggleLoop();
  }, [state.phase, state.index, clip, stageReady, leadKey, options.useClipSettings]);

  // ── Go: lead-in over and clip ready (and not paused: a pause while «Cargando el clip…» holds it) ──
  const goPending = lead?.phase === 'go';
  const paused = state.pausedAt != null;
  useEffect(() => {
    if (!goPending || paused || applied.current !== leadKey || noticeText || !stageReady) return;
    dispatch({ type: 'go' });
    usePlayer.getState().play();
  }, [goPending, paused, leadKey, noticeText, stageReady]);

  // Count-in ticks, when the studio's count sound is on.
  const count = lead?.phase === 'countdown' ? lead.count : null;
  useEffect(() => {
    if (count != null && usePlayer.getState().countSound) tick(false);
  }, [count]);

  // ── The clip's end: on to the next one ──
  useEffect(() => {
    if (state.phase !== 'play' || !clip) return;
    const end = clip.end_seconds;
    return usePlayer.subscribe((s) => {
      if (!s.playing || s.engine == null) return;
      if (s.time >= clipEndAt(end, s.duration)) {
        s.pause();
        dispatch({ type: 'advance', now: performance.now() });
      }
    });
  }, [state.phase, state.leadStart, clip]);

  // ── Problems: a song that can't play, or a clip outside its video → skip it ──
  const playerError = usePlayer((s) => s.error);
  // REQ-15 · A file that failed to play from a remembered signature: the next round signs it again.
  const failedUrl = playerError && source.status === 'file' ? source.url : null;
  useEffect(() => {
    if (failedUrl) forgetFailedClipSource(failedUrl);
  }, [failedUrl]);
  // A failed background refetch keeps the song it already had (isError with data): that one still plays.
  const missing =
    clip != null &&
    (source.status === 'missing' ||
      (video.isError && !video.data) ||
      (video.isFetched && video.data == null));
  const problem =
    noticeText ??
    (missing
      ? 'Este vídeo no se puede reproducir aquí: se salta'
      : playerError && state.phase !== 'idle' && state.phase !== 'done'
        ? 'No se pudo reproducir: se salta'
        : null);
  // The skip waits while the round is paused, and gets its full time again on resuming.
  useEffect(() => {
    if (!problem || paused || state.phase === 'idle' || state.phase === 'done') return;
    const id = window.setTimeout(() => {
      setNotice(null);
      usePlayer.getState().pause();
      dispatch({ type: 'advance', now: performance.now() });
    }, 2200);
    return () => window.clearTimeout(id);
  }, [problem, paused, state.phase, state.index]);

  // «Otra vez» puts the same clip on again: the next lead-in applies it afresh.
  const forgetApplied = useCallback(() => {
    applied.current = null;
  }, []);

  return {
    syncClock: setNow,
    options,
    byId,
    entries,
    available,
    state,
    dispatch,
    current,
    clip,
    source,
    nextIndex,
    nextSource,
    stageKey,
    stageReady,
    lead,
    leadKey,
    forgetApplied,
    problem,
    paused,
  };
}
