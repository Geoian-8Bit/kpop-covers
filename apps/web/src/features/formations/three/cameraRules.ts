import type { StagePoint } from '@coverscape/shared';

/**
 * REQ-13 · Pure rules of the 3D view: where a stage point stands in the 3D world and where each camera shortcut
 * puts the camera. World: metres, y up, the stage's centre at the origin, the audience towards +z.
 */

export type CameraView = 'audience' | 'top' | 'side';

export const CAMERA_LABELS: Record<CameraView, string> = {
  audience: 'Público',
  top: 'Arriba',
  side: 'Lateral',
};

/** Where the camera looks: the stage's centre, a little above the floor (about the dancers' waist). */
export const CAMERA_TARGET: readonly [number, number, number] = [0, 0.5, 0];

interface Size {
  width: number;
  depth: number;
}

/** A stage point (metres from the back-left corner, y towards the audience) on the 3D floor: [x, z]. */
export function toWorld(p: StagePoint, stage: Size): [number, number] {
  return [p.x - stage.width / 2, p.y - stage.depth / 2];
}

/** Camera position of a shortcut, far enough to see the whole stage. */
export function cameraPosition(view: CameraView, stage: Size): [number, number, number] {
  const span = Math.max(stage.width, stage.depth);
  if (view === 'top') return [0, span * 1.25 + 1, 0.001];
  if (view === 'side') return [stage.width / 2 + span * 0.7 + 0.8, 2.6, 0];
  return [0, span * 0.5 + 1.4, stage.depth / 2 + span * 0.72 + 0.6];
}

/** Turn of a prop around the vertical axis (radians): the editor's degrees are clockwise seen from above. */
export function propYaw(rotDegrees: number): number {
  return (-rotDegrees * Math.PI) / 180;
}
