/**
 * 15 · TensorFlow.js on WebAssembly (SIMD, one thread), for computers without a usable graphics chip. Loaded only
 * when chosen (dynamic import from models.ts). The .wasm binaries come from this app's own domain (emitted by Vite
 * next to the code, outside the offline precache): no new origin in the CSP, which already has 'wasm-unsafe-eval'.
 * No threads: they need SharedArrayBuffer, i.e. COOP/COEP headers, which would break YouTube's player.
 */
import { env } from '@tensorflow/tfjs-core';
import plainUrl from '@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm.wasm?url';
import simdUrl from '@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm-simd.wasm?url';

let ready: Promise<void> | null = null;

export function ensureWasmBackend(): Promise<void> {
  ready ??= (async () => {
    const wasm = await import('@tensorflow/tfjs-backend-wasm');
    // Registered by the import; set before the backend starts (it would try the threaded binary where SAB exists).
    env().set('WASM_HAS_MULTITHREAD_SUPPORT', false);
    wasm.setWasmPaths({
      'tfjs-backend-wasm.wasm': plainUrl,
      'tfjs-backend-wasm-simd.wasm': simdUrl,
      // Never fetched (threads are off): mapped to the SIMD one so a stray request can't hit a missing file.
      'tfjs-backend-wasm-threaded-simd.wasm': simdUrl,
    });
  })().catch((err: unknown) => {
    ready = null;
    throw err;
  });
  return ready;
}
