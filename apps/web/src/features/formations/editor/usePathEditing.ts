import type { FormationPath, FormationPositions, StagePoint } from '@coverscape/shared';
import { useMemo, useState } from 'react';
import type { FormationInput } from '@/data/formations';
import { usePlayer } from '@/player/store';
import type { useToast } from '@/providers/ToastProvider';
import { clashRanges, findClashes, type Clash } from '../clashRules';
import { withDefaults, type Stage } from '../formationRules';
import { convertPath, strokeToPath, type PathChoice } from '../pathRules';
import type { FormationEditorState } from '../useFormationEditor';

interface PathEditingInput {
  ed: FormationEditorState;
  list: FormationInput[];
  memberIds: string[];
  stage: Stage;
  current: FormationInput | null;
  selection: string[];
  showPaths: boolean;
  fullPositions: (f: FormationInput) => FormationPositions;
  pause: () => void;
  toast: ReturnType<typeof useToast>;
}

/**
 * REQ-27 · REQ-08's paths and clashes, moved out of FormationEditor as is: whose route is being edited, the path
 * tools' state, and the edits of that route.
 */
export function usePathEditing({ ed, list, memberIds, stage, current, selection, showPaths, fullPositions, pause, toast }: PathEditingInput) {
  const [drawMode, setDrawMode] = useState(false);
  const [selectedHandle, setSelectedHandle] = useState<number | null>(null);

  const clashes = useMemo(() => findClashes(list, memberIds, stage), [list, memberIds, stage]);
  const ranges = useMemo(() => clashRanges(clashes), [clashes]);
  const pathIndex = current ? list.indexOf(current) : -1;
  const pathMember = showPaths && pathIndex > 0 && selection.length === 1 ? selection[0]! : null;
  const pathEnds = useMemo(() => {
    if (!pathMember || pathIndex < 1) return null;
    const from = withDefaults(list[pathIndex - 1]!.positions, memberIds, stage)[pathMember];
    const to = withDefaults(list[pathIndex]!.positions, memberIds, stage)[pathMember];
    return from && to ? { from, to, path: to.path } : null;
  }, [pathMember, pathIndex, list, memberIds, stage]);

  // A new person, formation or mode starts the path tools afresh.
  // REQ-30 · Adjusted while rendering (React's pattern for state that follows a prop) instead of in an effect.
  const currentId = current?.id;
  const [toolsFor, setToolsFor] = useState({ pathMember, currentId, showPaths });
  if (toolsFor.pathMember !== pathMember || toolsFor.currentId !== currentId || toolsFor.showPaths !== showPaths) {
    setToolsFor({ pathMember, currentId, showPaths });
    setDrawMode(false);
    setSelectedHandle(null);
  }

  /** The route of the person being edited into the formation at the playhead (null: straight). */
  function setPath(path: FormationPath | null) {
    if (!current || !pathMember || !pathEnds) return;
    const { to } = pathEnds;
    const id = pathMember;
    ed.commit(
      list.map((f) =>
        f.id === current.id ? { ...f, positions: { ...fullPositions(f), [id]: path ? { x: to.x, y: to.y, path } : { x: to.x, y: to.y } } } : f,
      ),
    );
  }

  function choosePath(choice: PathChoice) {
    if (!pathEnds) return;
    pause();
    setSelectedHandle(null);
    if (choice === 'free') {
      setDrawMode(true);
      return;
    }
    setDrawMode(false);
    const next = convertPath(choice, pathEnds.from, pathEnds.to, pathEnds.path, stage);
    if (next !== undefined) setPath(next);
  }

  function onStroke(points: StagePoint[]) {
    const path = strokeToPath(points, stage);
    setPath(path);
    setDrawMode(false);
    toast(path ? 'Recorrido dibujado' : 'Trazo muy corto: el recorrido queda recto', 'info');
  }

  function seekClash(c: Clash) {
    pause();
    usePlayer.getState().seek(c.start);
  }

  return {
    clashes,
    ranges,
    pathIndex,
    pathMember,
    pathEnds,
    drawMode,
    setDrawMode,
    selectedHandle,
    setSelectedHandle,
    setPath,
    choosePath,
    onStroke,
    seekClash,
  };
}
