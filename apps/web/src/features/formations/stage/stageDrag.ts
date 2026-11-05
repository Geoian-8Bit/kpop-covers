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

/** SVG `points` from stage points. */
export const line = (pts: StagePoint[]) => pts.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ');
