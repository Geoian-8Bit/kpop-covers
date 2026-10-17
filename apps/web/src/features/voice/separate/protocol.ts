import type { EngineKind } from './separateRules';

/** 18 · Messages between the page and the separation worker (`stemSeparator.worker.ts`). */

export interface RunRequest {
  type: 'run';
  engine: EngineKind;
  /** The song at 44.1 kHz, one array per channel (transferred: the page no longer has them). */
  left: Float32Array;
  right: Float32Array;
}

export type WorkerMessage =
  | { type: 'progress'; phase: 'model'; loaded: number; total: number }
  | { type: 'progress'; phase: 'compile' }
  | { type: 'progress'; phase: 'separate'; done: number; total: number; etaSeconds: number | null }
  | {
      type: 'done';
      vocals: [Float32Array, Float32Array];
      instrumental: [Float32Array, Float32Array];
      seconds: number;
    }
  | { type: 'error'; code: SeparationErrorCode; message: string };

/** What can go wrong in the worker, so the page can say it in plain words. */
export type SeparationErrorCode = 'no-webgpu' | 'model-download' | 'model-load' | 'gpu' | 'unknown';
