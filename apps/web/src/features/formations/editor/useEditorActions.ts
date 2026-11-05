import type { FormationPositions, FormationProp, FormationPropKind } from '@coverscape/shared';
import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { FormationInput } from '@/data/formations';
import { usePlayer } from '@/player/store';
import type { useToast } from '@/providers/ToastProvider';
import {
  DEFAULT_TRANSITION,
  duplicateMoment,
  formatMoment,
  formationAt,
  freeMoment,
  keepPaths,
  positionsAt,
  propsSnapshot,
  rowPositions,
  snapPoint,
  sortKeyframes,
  withDefaults,
  withoutPaths,
  type Stage,
} from '../formationRules';
import { addPropFrom, newProp, patchProp, PROPS_MAX, removePropFrom } from '../propRules';
import type { FormationEditorState } from '../useFormationEditor';

interface EditorActionsInput {
  ed: FormationEditorState;
  list: FormationInput[];
  memberIds: string[];
  stage: Stage;
  toast: ReturnType<typeof useToast>;
  current: FormationInput | null;
  active: number;
  selectedProp: string | null;
  setSelectedProp: Dispatch<SetStateAction<string | null>>;
  setSelection: Dispatch<SetStateAction<string[]>>;
}

/**
 * REQ-27 · The editor's edits of the plan (formations, positions, props), moved out of FormationEditor as is.
 */
export function useEditorActions({
  ed,
  list,
  memberIds,
  stage,
  toast,
  current,
  active,
  selectedProp,
  setSelectedProp,
  setSelection,
}: EditorActionsInput) {
  const pause = useCallback(() => {
    const p = usePlayer.getState();
    if (p.playing) p.pause();
  }, []);

  /** Where the participants of a formation stand (their own place, or a free one at the side), keeping the rest. */
  const fullPositions = useCallback(
    (f: FormationInput): FormationPositions => ({ ...f.positions, ...withDefaults(f.positions, memberIds, stage) }),
    [memberIds, stage],
  );

  /**
   * Edits the plan around the formation at the playhead; with none there, a new formation is made at this moment
   * from where everybody (and every prop) is right now (REQ-06: the first drag on an empty plan makes the first one).
   * `fn` gets the list (sorted) and the id of that formation.
   */
  const editHere = useCallback(
    (fn: (list: FormationInput[], id: string) => FormationInput[]) => {
      const now = usePlayer.getState().time;
      const l = sortKeyframes(list);
      const here = formationAt(l, now);
      if (here) {
        ed.commit(fn(l, here.id));
        return;
      }
      const { at, shifted } = freeMoment(l, now);
      const base = l.length ? positionsAt(l, now, memberIds, stage) : rowPositions(memberIds, stage);
      const rounded: FormationPositions = {};
      for (const [id, p] of Object.entries(base)) rounded[id] = snapPoint(p, stage, false);
      const made: FormationInput = { id: crypto.randomUUID(), at, transition: DEFAULT_TRANSITION, positions: rounded, note: null, props: propsSnapshot(l, now) };
      ed.commit(fn(sortKeyframes([...l, made]), made.id));
      toast(shifted ? `Formación nueva en ${formatMoment(at)} (movida 0,1 s: ya había otra)` : `Formación nueva en ${formatMoment(at)}`, 'info');
      if (shifted || Math.abs(at - now) > 0.001) usePlayer.getState().seek(at);
    },
    [ed, list, memberIds, stage, toast],
  );

  /** Changes the positions of the formation at the playhead (REQ-08: everybody keeps the path into their place). */
  const editPositions = useCallback(
    (fn: (positions: FormationPositions) => FormationPositions) =>
      editHere((l, id) =>
        l.map((f) => {
          if (f.id !== id) return f;
          const before = fullPositions(f);
          return { ...f, positions: keepPaths(before, fn(before)) };
        }),
      ),
    [editHere, fullPositions],
  );

  /** REQ-10 · Changes the props of the formation at the playhead. */
  const editProps = useCallback(
    (fn: (props: FormationProp[]) => FormationProp[]) => editHere((l, id) => l.map((f) => (f.id === id ? { ...f, props: fn(f.props ?? []) } : f))),
    [editHere],
  );

  function addProp(kind: FormationPropKind) {
    pause();
    const id = crypto.randomUUID();
    editHere((l, here) => {
      const f = l.find((x) => x.id === here);
      if ((f?.props ?? []).length >= PROPS_MAX) {
        toast(`Caben hasta ${PROPS_MAX} objetos por formación`, 'info');
        return l;
      }
      return addPropFrom(l, here, newProp(kind, f?.props ?? [], stage, id));
    });
    setSelection([]);
    setSelectedProp(id);
  }

  function removeProp() {
    if (!selectedProp) return;
    const id = selectedProp;
    editHere((l, here) => removePropFrom(l, here, id));
    setSelectedProp(null);
    toast('Objeto quitado desde esta formación · puedes deshacerlo', 'info');
  }

  function turnProp(delta: number) {
    if (!selectedProp) return;
    const id = selectedProp;
    pause();
    editProps((props) => {
      const p = props.find((x) => x.id === id);
      return p ? patchProp(props, id, { rot: p.rot + delta }, stage) : props;
    });
  }

  function addHere() {
    const now = usePlayer.getState().time;
    if (formationAt(list, now)) {
      toast('Ya hay una formación en este momento', 'info');
      return;
    }
    pause();
    editPositions((p) => p);
  }

  function duplicate() {
    const source = current ?? (active >= 0 ? list[active] : null);
    if (!source) return;
    const now = usePlayer.getState().time;
    const { at, shifted } = duplicateMoment(list, source, now);
    // The copy lands elsewhere in time: the routes into the original don't apply to it (REQ-08).
    ed.commit([
      ...list,
      { ...source, id: crypto.randomUUID(), at, positions: withoutPaths(source.positions), props: structuredClone(source.props ?? []) },
    ]);
    usePlayer.getState().seek(at);
    toast(`Copia en ${formatMoment(at)}${shifted ? ' (movida 0,1 s: ya había otra)' : ''}`, 'info');
  }

  function removeCurrent() {
    if (!current) return;
    ed.commit(list.filter((f) => f.id !== current.id));
    toast('Formación borrada · puedes deshacerlo', 'info');
  }

  function patchCurrent(patch: Partial<FormationInput>) {
    if (!current) return;
    ed.commit(list.map((f) => (f.id === current.id ? { ...f, ...patch } : f)));
  }

  function moveMarker(id: string, to: number) {
    const { at, shifted } = freeMoment(list, to, id);
    ed.commit(list.map((f) => (f.id === id ? { ...f, at } : f)));
    if (shifted) toast(`Ya había una formación ahí: queda en ${formatMoment(at)}`, 'info');
  }

  return {
    pause,
    fullPositions,
    editHere,
    editPositions,
    editProps,
    addProp,
    removeProp,
    turnProp,
    addHere,
    duplicate,
    removeCurrent,
    patchCurrent,
    moveMarker,
  };
}
