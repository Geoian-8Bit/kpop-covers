import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchModelFile, throttledModelProgress } from './model';

/**
 * REQ-26 · The model download as the worker runs it, against a simulated response: thousands of small network pieces
 * over ten seconds must reach the page as at most ~4 progress messages a second (5 with the final one), and the bytes
 * must come out whole and in order.
 */

const PIECES = 2000;
const PIECE = 777;
/** Simulated time per network piece: 2000 pieces → 10 s. */
const STEP_MS = 5;

let clock = 0;

function simulatedResponse(): Response {
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i === PIECES) {
        controller.close();
        return;
      }
      clock += STEP_MS;
      controller.enqueue(new Uint8Array(PIECE).fill(i % 251));
      i++;
    },
  });
  return new Response(body, { headers: { 'Content-Length': String(PIECES * PIECE) } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  clock = 0;
});

describe('model download progress', () => {
  it('sends at most 5 progress messages a second and keeps every byte', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => simulatedResponse()));
    const total = PIECES * PIECE;
    const sent: { at: number; loaded: number }[] = [];
    const report = throttledModelProgress(total, (loaded) => sent.push({ at: clock, loaded }), undefined, () => clock);
    const bytes = new Uint8Array(await fetchModelFile('https://example.com/m.onnx', (read) => report('m', read), undefined, total));

    expect(bytes.byteLength).toBe(total);
    for (let p = 0; p < PIECES; p += 199) expect(bytes[p * PIECE]).toBe(p % 251);
    // Whole at the end, told once.
    expect(sent[sent.length - 1]!.loaded).toBe(total);
    expect(sent.filter((s) => s.loaded === total)).toHaveLength(1);
    // Never more than 5 in any second of the download.
    const seconds = (PIECES * STEP_MS) / 1000;
    for (let s = 0; s < seconds; s++) {
      expect(sent.filter((m) => m.at > s * 1000 && m.at <= (s + 1) * 1000).length).toBeLessThanOrEqual(5);
    }
    expect(sent.length).toBeGreaterThanOrEqual(seconds * 3);
  });

  it('a download of the wrong length is still refused with the size known up front', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => simulatedResponse()));
    await expect(fetchModelFile('https://example.com/m.onnx', () => undefined, undefined, PIECES * PIECE + 1)).rejects.toThrow('model-truncated');
    clock = 0;
    await expect(fetchModelFile('https://example.com/m.onnx', () => undefined, undefined, PIECES * PIECE - 1)).rejects.toThrow('model-truncated');
  });
});
