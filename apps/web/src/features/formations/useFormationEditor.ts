import type { Formation, FormationPlan } from '@coverscape/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formationErrorMessage, formationKeys, type FormationInput, type FormationPlanFull, type FormationPlanPatch } from '@/data/formations';
import { formationsBackend } from '@/lib/backend';
import {
  diffKeyframes,
  fitPositions,
  historyPush,
  historyRedo,
  historyStart,
  historyUndo,
  roundTime,
  sortKeyframes,
  type History,
} from './formationRules';
import { fitProps } from './propRules';

/** «Guardado», «Guardando…», «Sin guardar» (with retry) or the conflict notice. */
export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict';

/** How long after the last change the formations are written (a drag or a typed number settles first). */
const SAVE_DELAY_MS = 600;

const toInput = (f: Formation): FormationInput => ({
  id: f.id,
  at: roundTime(f.at),
  transition: f.transition,
  positions: f.positions ?? {},
  note: f.note?.trim() || null,
  props: f.props ?? [],
});

const tidy = (f: FormationInput): FormationInput => ({ ...f, at: roundTime(f.at), note: f.note?.trim() || null });

function mapHistory<T>(h: History<T>, fn: (value: T) => T): History<T> {
  return { past: h.past.map(fn), present: fn(h.present), future: h.future.map(fn) };
}

/**
 * REQ-06 · The editor's working copy of a plan: the formations with undo / redo (this editing session only), and the
 * writes behind them. Every change is written formation by formation a moment later, in order, against the plan's
 * revision; when another device wrote first the save stops at «Alguien ha cambiado este plan» until «Recargar».
 */
export function useFormationEditor(full: FormationPlanFull, onError: (message: string) => void) {
  const queryClient = useQueryClient();
  const [plan, setPlan] = useState<FormationPlan>(full.plan);
  const [members, setMembers] = useState<string[]>(full.members);
  const [history, setHistory] = useState(() => historyStart(sortKeyframes(full.formations.map(toInput))));
  const [status, setStatus] = useState<SaveStatus>('idle');
  const revision = useRef(full.plan.revision);
  /** What the server has (as far as this editor knows): the diff against it is what gets written. */
  const saved = useRef<FormationInput[]>(history.present);
  const latest = useRef(history.present);
  latest.current = history.present;
  const flushing = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const stopped = useRef(false);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const planId = plan.id;

  const flush = useCallback((): Promise<void> => {
    if (stopped.current) return Promise.resolve();
    if (flushing.current) {
      again.current = true;
      return flushing.current;
    }
    const run = async () => {
      try {
        do {
          again.current = false;
          const { save, remove } = diffKeyframes(saved.current, latest.current);
          if (save.length === 0 && remove.length === 0) break;
          setStatus('saving');
          // Removals first: they free the moments a moved formation may take.
          for (const f of remove) {
            const r = await formationsBackend.deleteFormation(planId, revision.current, f.id);
            if (!r.ok) {
              stopped.current = true;
              setStatus('conflict');
              return;
            }
            revision.current = r.revision;
            saved.current = saved.current.filter((s) => s.id !== f.id);
          }
          for (const f of save) {
            const r = await formationsBackend.saveFormation(planId, revision.current, f);
            if (!r.ok) {
              stopped.current = true;
              setStatus('conflict');
              return;
            }
            revision.current = r.revision;
            saved.current = sortKeyframes([...saved.current.filter((s) => s.id !== f.id), f]);
          }
        } while (again.current);
        setStatus('saved');
      } catch (err) {
        setStatus('error');
        onErrorRef.current(formationErrorMessage(err));
      }
    };
    // Cleared after it settles (asynchronously): a run with nothing to write finishes before it is even stored.
    const promise: Promise<void> = run().finally(() => {
      if (flushing.current === promise) flushing.current = null;
    });
    flushing.current = promise;
    return promise;
  }, [planId]);

  // A change is written a moment after the last one.
  useEffect(() => {
    if (stopped.current) return;
    const { save, remove } = diffKeyframes(saved.current, history.present);
    if (save.length === 0 && remove.length === 0) {
      // Undone back to what the server has: nothing to write.
      setStatus((s) => (s === 'dirty' ? 'saved' : s));
      return;
    }
    setStatus((s) => (s === 'saving' ? s : 'dirty'));
    const timer = setTimeout(() => void flush(), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [history.present, flush]);

  // Leaving the editor with something pending still writes it; then the song's list of plans catches up (counts and
  // revisions changed here).
  const videoId = plan.video_id;
  useEffect(
    () => () =>
      void flush().then(() => queryClient.invalidateQueries({ queryKey: formationKeys.plans(videoId) })),
    [flush, queryClient, videoId],
  );

  const commit = useCallback((next: FormationInput[]) => {
    setHistory((h) => historyPush(h, sortKeyframes(next.map(tidy))));
  }, []);
  const update = useCallback((fn: (list: FormationInput[]) => FormationInput[]) => {
    setHistory((h) => {
      const next = fn(h.present);
      return next === h.present ? h : historyPush(h, sortKeyframes(next.map(tidy)));
    });
  }, []);
  const undo = useCallback(() => setHistory(historyUndo), []);
  const redo = useCallback(() => setHistory(historyRedo), []);

  /** «Recargar»: drop the unsaved changes and take the server's version (also after an error). */
  const reload = useCallback(async () => {
    const fresh = await formationsBackend.getPlan(planId);
    if (!fresh) {
      onErrorRef.current('Este plan ya no existe: puede que alguien lo haya borrado.');
      return null;
    }
    queryClient.setQueryData(formationKeys.plan(planId), fresh);
    const list = sortKeyframes(fresh.formations.map(toInput));
    revision.current = fresh.plan.revision;
    saved.current = list;
    stopped.current = false;
    setPlan(fresh.plan);
    setMembers(fresh.members);
    setHistory(historyStart(list));
    setStatus('idle');
    return fresh;
  }, [planId, queryClient]);

  /** Name, stage, grid, beat data or participants: written at once (after the pending formations). */
  const updatePlan = useCallback(
    async (patch: FormationPlanPatch): Promise<boolean> => {
      await flush();
      if (stopped.current) return false;
      setStatus('saving');
      try {
        const r = await formationsBackend.updatePlan(planId, revision.current, patch);
        if (!r.ok) {
          stopped.current = true;
          setStatus('conflict');
          return false;
        }
        revision.current = r.revision;
        setPlan(r.plan);
        if (patch.members) setMembers(patch.members);
        // The server pulled every point inside a smaller stage: the working copy (and its history) does the same.
        const stage = { width: r.plan.stage_width, depth: r.plan.stage_depth };
        const fit = (list: FormationInput[]) =>
          list.map((f) => ({ ...f, positions: fitPositions(f.positions, stage), props: fitProps(f.props, stage) }));
        saved.current = fit(saved.current);
        setHistory((h) => mapHistory(h, fit));
        setStatus('saved');
        void queryClient.invalidateQueries({ queryKey: formationKeys.plans(r.plan.video_id) });
        return true;
      } catch (err) {
        setStatus('error');
        onErrorRef.current(formationErrorMessage(err));
        return false;
      }
    },
    [flush, planId, queryClient],
  );

  const retry = useCallback(() => void flush(), [flush]);

  return {
    plan,
    members,
    list: history.present,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    status,
    commit,
    update,
    undo,
    redo,
    reload,
    retry,
    updatePlan,
  };
}

export type FormationEditorState = ReturnType<typeof useFormationEditor>;
