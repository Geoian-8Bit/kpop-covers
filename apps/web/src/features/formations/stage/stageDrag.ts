import type { FormationPositions, StagePoint } from '@coverscape/shared';

export const PAD = 0.7;
export const AUDIENCE = 0.9;
export const DOT = 0.3;
/** 0.5 m around the dot: about 44 px on a phone-wide 8 m stage. */
export const HIT = 0.5;
export const HANDLE = 0.2;

export interface Drag {
  /** The point that was pressed. */
  id: string;
  pointerId: number;
  ids: string[];
  /** Where each dragged point started (stage metres) and where the pointer grabbed. */
  from: FormationPositions;
  grab: StagePoint;
  delta: StagePoint;
  moved: boolean;
  shift: boolean;
}

export interface PropDrag {
  id: string;
  pointerId: number;
  from: StagePoint;
  grab: StagePoint;
  delta: StagePoint;
  moved: boolean;
}

/** REQ-08 · The handle index of a straight route's middle (a path's real handles count from 0). */
export const BEND = -1;

export interface HandleDrag {
  index: number;
  pointerId: number;
  point: StagePoint;
  moved: boolean;
}

export interface Box {
  pointerId: number;
  a: StagePoint;
  b: StagePoint;
}

/** What a finger can drag on the stage (people, props, path handles) carries this attribute. */
const DRAGGABLE = 'data-drag';

/**
 * Whether a touch that starts on `target` must not scroll the page. Browsers ignore `touch-action` on the shapes inside
 * an <svg>: the stage's own `pan-y` decides, so a finger that lands on a person and goes up or down scrolls the page
 * and the drag never starts. One finger on something draggable (and a stage that takes edits) keeps the gesture.
 */
export function holdsTouch(target: EventTarget | null, touches: number, locked: boolean): boolean {
  if (locked || touches !== 1 || !target || !('closest' in target)) return false;
  return (target as Element).closest(`[${DRAGGABLE}]`) != null;
}

/** SVG `points` from stage points. */
export const line = (pts: StagePoint[]) => pts.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ');
