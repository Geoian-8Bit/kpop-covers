import type { FormationPositions } from '@coverscape/shared';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { FormationInput } from '@/data/formations';
import { usePlayer } from '@/player/store';
import { clashingAt, type Clash } from '../clashRules';
import { mirrorPoint, positionsAt, propsAt, snapPoint, type Stage } from '../formationRules';
import type { Drag, PropDrag } from './stageDrag';

interface PainterInputs {
  list: FormationInput[];
  memberIds: string[];
  stage: Stage;
  mirrored: boolean;
  snap: boolean;
  clashes: Clash[];
}

/**
 * REQ-27 · The stage's painter, moved out of StageView as is: the points and the props are painted straight onto the
 * SVG on every frame of the player's clock (no React render per frame), with a drag in progress on top.
 */
export function useStagePainter({ list, memberIds, stage, mirrored, snap, clashes }: PainterInputs) {
  const dotRefs = useRef(new Map<string, SVGGElement>());
  const ringRefs = useRef(new Map<string, SVGCircleElement>());
  const propRefs = useRef(new Map<string, SVGGElement>());
  const drag = useRef<Drag | null>(null);
  const propDrag = useRef<PropDrag | null>(null);

  // Latest inputs for the painter (it runs from the player's subscription).
  const live = useRef({ list, memberIds, stage, mirrored, snap, clashes });
  // REQ-30 · Synced at commit, before the layout paint below (same order of layout effects as before).
  useLayoutEffect(() => {
    live.current = { list, memberIds, stage, mirrored, snap, clashes };
  }, [list, memberIds, stage, mirrored, snap, clashes]);

  /** Where everybody is drawn right now (stage metres): the moment's positions, plus a drag in progress. */
  const currentPositions = useCallback((): FormationPositions => {
    const { list: l, memberIds: ids, stage: s, snap: sn } = live.current;
    const at = positionsAt(l, usePlayer.getState().time, ids, s);
    const d = drag.current;
    if (d && d.moved) {
      for (const id of d.ids) {
        const from = d.from[id];
        if (!from) continue;
        at[id] = snapPoint({ x: from.x + d.delta.x, y: from.y + d.delta.y }, s, sn);
      }
    }
    return at;
  }, []);

  const currentProps = useCallback(() => {
    const { list: l, stage: s, snap: sn } = live.current;
    const frames = propsAt(l, usePlayer.getState().time);
    const d = propDrag.current;
    if (d && d.moved) {
      const p = snapPoint({ x: d.from.x + d.delta.x, y: d.from.y + d.delta.y }, s, sn);
      for (const f of frames) if (f.id === d.id) Object.assign(f, p, { opacity: 1 });
    }
    return frames;
  }, []);

  const paint = useCallback(() => {
    const { stage: s, mirrored: m, clashes: cl } = live.current;
    const at = currentPositions();
    const hot = clashingAt(cl, usePlayer.getState().time);
    for (const [id, el] of dotRefs.current) {
      const p = at[id];
      if (!p) continue;
      const shown = mirrorPoint(p, s, m);
      el.setAttribute('transform', `translate(${shown.x.toFixed(3)} ${shown.y.toFixed(3)})`);
      ringRefs.current.get(id)?.setAttribute('visibility', hot.has(id) ? 'visible' : 'hidden');
    }
    const frames = new Map(currentProps().map((f) => [f.id, f]));
    for (const [id, el] of propRefs.current) {
      const f = frames.get(id);
      if (!f || f.opacity <= 0.01) {
        el.setAttribute('opacity', '0');
        el.setAttribute('pointer-events', 'none');
        continue;
      }
      const shown = mirrorPoint(f, s, m);
      el.setAttribute('transform', `translate(${shown.x.toFixed(3)} ${shown.y.toFixed(3)})`);
      el.setAttribute('opacity', f.opacity.toFixed(2));
      el.setAttribute('pointer-events', f.opacity >= 0.5 ? 'auto' : 'none');
      // A mirrored stage turns the other way.
      el.querySelector('[data-rot]')?.setAttribute('transform', `rotate(${(m ? -f.rot : f.rot).toFixed(1)})`);
    }
  }, [currentPositions, currentProps]);

  useLayoutEffect(() => {
    paint();
  }, [paint, list, memberIds, stage, mirrored, clashes]);

  useEffect(
    () =>
      usePlayer.subscribe((s, prev) => {
        if (s.time !== prev.time || s.mirrored !== prev.mirrored) paint();
      }),
    [paint],
  );

  return { dotRefs, ringRefs, propRefs, drag, propDrag, currentPositions, currentProps, paint };
}
