import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Browser } from '@playwright/test';
import { EVIDENCE } from './evidence';

/**
 * REQ-02 · A short test video for the upload flows (`setInputFiles`): a few seconds of a moving, numbered picture,
 * recorded in the browser with canvas.captureStream + MediaRecorder (WebM/VP8, no audio, ~3 s, a few tens of kB).
 *
 * It is made at test time, never committed: the first call records it and caches it in the evidence folder
 * (ONESHOOT_EVIDENCE_DIR, outside the repo); later calls, in any project, read the cache.
 *
 * Recording runs in its own throwaway context, so a test's fake clock (`page.clock.install` fakes rAF and timers,
 * which would stall the recording) or fake media never get in the way. WebKit's MediaRecorder only writes MP4 and
 * is missing in some Playwright WebKit builds: when the browser at hand can't record WebM, Chromium records it.
 */
export interface TestVideo {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

function cacheDir(): string {
  const dir = path.join(EVIDENCE, 'cache');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Records the video in `browser`; null if it can't make WebM. */
async function record(browser: Browser, seconds: number): Promise<Buffer | null> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const base64 = await page.evaluate(async (seconds) => {
      const type = ['video/webm;codecs=vp8', 'video/webm'].find((t) =>
        window.MediaRecorder?.isTypeSupported?.(t),
      );
      if (!type) return null;
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      const g = canvas.getContext('2d')!;
      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 200_000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
      let frame = 0;
      // A timer, not rAF: rAF pauses in a hidden page.
      const draw = () => {
        const t = frame++ / 30;
        g.fillStyle = `hsl(${(t * 120) % 360} 60% 35%)`;
        g.fillRect(0, 0, 320, 240);
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(160 + Math.sin(t * 3) * 110, 120 + Math.cos(t * 2) * 70, 24, 0, Math.PI * 2);
        g.fill();
        g.fillRect(10, 220, (t / seconds) * 300, 10);
      };
      draw();
      const timer = setInterval(draw, 1000 / 30);
      recorder.start(250);
      await new Promise((r) => setTimeout(r, seconds * 1000));
      recorder.stop();
      await stopped;
      clearInterval(timer);
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunks, { type: 'video/webm' });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000)
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(binary);
    }, seconds);
    return base64 ? Buffer.from(base64, 'base64') : null;
  } finally {
    await context.close();
  }
}

/**
 * The test video (cached). Pass the test's `browser` fixture; any engine works (Chromium records when it can't).
 * Use as `await input.setInputFiles(await testVideo(browser))`.
 */
export async function testVideo(browser?: Browser, seconds = 3): Promise<TestVideo> {
  const file = path.join(cacheDir(), `test-video-${seconds}s.webm`);
  if (!existsSync(file)) {
    let buffer = browser ? await record(browser, seconds) : null;
    if (!buffer) {
      const own = await chromium.launch({ args: ['--mute-audio'] });
      try {
        buffer = await record(own, seconds);
      } finally {
        await own.close();
      }
    }
    if (!buffer?.length) throw new Error('No se pudo grabar el vídeo de prueba (MediaRecorder sin WebM).');
    // Workers may race here: write aside, then move into place in one step.
    const tmp = `${file}.${process.pid}`;
    writeFileSync(tmp, buffer);
    renameSync(tmp, file);
  }
  return { name: 'prueba.webm', mimeType: 'video/webm', buffer: readFileSync(file) };
}
