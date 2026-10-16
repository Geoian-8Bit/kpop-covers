/**
 * Stand-in for `@mediapipe/pose` (the old BlazePose solution that `@tensorflow-models/pose-detection` imports for
 * one of its runtimes). One Shoot only uses MoveNet from that package — and MediaPipe through
 * `@mediapipe/tasks-vision` — so the legacy script is never bundled (vite.config.ts aliases it here).
 */
export const VERSION = '0.0.0-stub';

export class Pose {
  constructor() {
    throw new Error('BlazePose (MediaPipe heredado) no está incluido en One Shoot.');
  }
}
