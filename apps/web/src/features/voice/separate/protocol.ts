import type { EngineKind } from './separateRules';

/** 18 · Messages between the page and the separation worker (`stemSeparator.worker.ts`). */

export interface RunRequest {
  type: 'run';
  engine: EngineKind;
  /** The song at 44.1 kHz, one array per channel (transferred: the page no longer has them). */
  left: Float32Array;
  right: Float32Array;
}

/** Global review [6] · Hold before the next segment (the recorder is open) or go on. */
export interface PauseRequest {
  type: 'pause';
  paused: boolean;
}

export type PageMessage = RunRequest | PauseRequest;

export type WorkerMessage =
  | { type: 'progress'; phase: 'model'; loaded: number; total: number }
  | { type: 'progress'; phase: 'compile' }
  /** The worker stopped between segments, as asked (nothing runs on the GPU until it is told to go on). */
  | { type: 'held' }
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
