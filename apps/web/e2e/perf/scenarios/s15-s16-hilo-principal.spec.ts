import { withDuration } from '../../support/studioVideo';
import { fluid } from '../fluid';
import { scenario } from '../harness';
import type { PassMetrics } from '../profile';

/**
 * S-15 / S-16 · The heavy audio and video packaging, called as modules from the dev page (the 126 MB separation model
 * is not run: spec 3, REQ-03 decisions). Only the main-thread cost of the encoding/packaging step is measured (M-09).
 */

scenario(
  'S-15',
  'Codificar y empaquetar las pistas de voz de un audio sintético de 3 min',
  ['M-09'],
  async (browser) => {
    let took: PassMetrics = {};
    const result = await fluid(browser, {
      setup: { url: '/' },
      prepare: async (page) => {
        // 3 minutes of stereo at 44.1 kHz: a few tones plus noise, so the encoder has something to chew on.
        await page.evaluate(() => {
          const rate = 44100;
          const n = rate * 180;
          const l = new Float32Array(n);
          const r = new Float32Array(n);
          let seed = 1;
          for (let i = 0; i < n; i++) {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            const noise = (seed / 4294967296 - 0.5) * 0.05;
            l[i] =
              0.3 * Math.sin((2 * Math.PI * 220 * i) / rate) +
              0.2 * Math.sin((2 * Math.PI * 660 * i) / rate) +
              noise;
            r[i] =
              0.3 * Math.sin((2 * Math.PI * 330 * i) / rate) +
              0.2 * Math.sin((2 * Math.PI * 990 * i) / rate) +
              noise;
          }
          (window as unknown as { __pcm: unknown }).__pcm = { l, r, rate };
        });
      },
      action: async (page) => {
        const ms = await page.evaluate(async () => {
          const w = window as unknown as { __pcm: { l: Float32Array; r: Float32Array; rate: number } };
          // A real dynamic import of the dev server's module (a plain import() would be rewritten by the test transform).
          type Enc = {
            pickCodec(d: number, r: number): Promise<unknown>;
            encodeStem(l: Float32Array, r: Float32Array, rate: number, c: unknown): Promise<unknown>;
          };
          const m = await (new Function('u', 'return import(u)') as (u: string) => Promise<Enc>)(
            '/src/features/voice/separate/encode.ts',
          );
          const choice = await m.pickCodec(180, w.__pcm.rate);
          if (!choice) throw new Error('this Chromium has no AudioEncoder for AAC or Opus');
          const t0 = performance.now();
          await m.encodeStem(w.__pcm.l, w.__pcm.r, w.__pcm.rate, choice);
          await m.encodeStem(w.__pcm.r, w.__pcm.l, w.__pcm.rate, choice);
          return performance.now() - t0;
        });
        took = { encodeTwoStemsMs: Math.round(ms) };
      },
      after: async () => took,
      passes: 3,
    });
    return {
      note: 'Two encodeStem calls (voice + music) of 3 min; the separation model itself is not run.',
      ...result,
    };
  },
);

scenario(
  'S-16',
  'Fase de sonido de la copia para la nube con un vídeo sintético',
  ['M-09'],
  async (browser) => {
    let took: PassMetrics = {};
    const result = await fluid(browser, {
      setup: { url: '/' },
      prepare: async (page) => {
        // A short video with sound, recorded in the page: a moving canvas and a tone.
        const base64 = await page.evaluate(async () => {
          const canvas = document.createElement('canvas');
          canvas.width = 320;
          canvas.height = 240;
          const g = canvas.getContext('2d')!;
          const ac = new AudioContext();
          const osc = ac.createOscillator();
          const dest = ac.createMediaStreamDestination();
          osc.connect(dest);
          osc.start();
          const stream = new MediaStream([
            ...canvas.captureStream(30).getTracks(),
            ...dest.stream.getTracks(),
          ]);
          const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
          const chunks: Blob[] = [];
          rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
          const done = new Promise<void>((resolve) => (rec.onstop = () => resolve()));
          let f = 0;
          const timer = setInterval(() => {
            g.fillStyle = `hsl(${(f * 4) % 360} 60% 35%)`;
            g.fillRect(0, 0, 320, 240);
            g.fillStyle = '#fff';
            g.fillRect((f * 5) % 300, 100, 20, 20);
            f++;
          }, 33);
          rec.start(250);
          await new Promise((r) => setTimeout(r, 8000));
          rec.stop();
          await done;
          clearInterval(timer);
          osc.stop();
          const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
          let binary = '';
          for (let i = 0; i < bytes.length; i += 0x8000)
            binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          return btoa(binary);
        });
        // MediaRecorder writes no Duration (the file would not probe); real files carry one, so the bytes get it here.
        // The copy plans its bitrate from the source's own (size / duration); a tiny synthetic file would be refused as too
        // poor to copy, so it is padded with trailing zeros (ignored after the last cluster) to look like a real 4 Mbit/s one.
        const fixed = Buffer.concat([
          withDuration(Buffer.from(base64, 'base64'), 8),
          Buffer.alloc(4_000_000),
        ]).toString('base64');
        await page.evaluate(async (b64) => {
          (window as unknown as { __src: Blob }).__src = await (
            await fetch('data:video/webm;base64,' + b64)
          ).blob();
        }, fixed);
      },
      action: async (page) => {
        const ms = await page.evaluate(async () => {
          const src = (window as unknown as { __src: Blob }).__src;
          const m = await (
            new Function('u', 'return import(u)') as (
              u: string,
            ) => Promise<{ makeCloudCopy(src: Blob, o: object): Promise<unknown> }>
          )('/src/features/studio/cloudCopy.ts');
          const abort = new AbortController();
          const t0 = performance.now();
          let soundMs = -1;
          try {
            await m.makeCloudCopy(src, {
              targetBytes: 20_000_000,
              limitBytes: 40_000_000,
              signal: abort.signal,
              onProgress: (p: { phase: string }) => {
                if (p.phase === 'picture' && soundMs < 0) {
                  soundMs = performance.now() - t0;
                  abort.abort();
                }
              },
            });
          } catch (e) {
            if (soundMs < 0) throw e;
          }
          return soundMs;
        });
        took = { soundPhaseMs: Math.round(ms) };
      },
      after: async () => took,
      passes: 3,
    });
    return {
      note: 'The copy is aborted when the picture pass starts: only the sound phase is measured.',
      ...result,
    };
  },
);
