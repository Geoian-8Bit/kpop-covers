import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MEDIAPIPE_VERSION } from './models';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('model sources and the CSP', () => {
  const pkg = JSON.parse(read('../../../package.json')) as { dependencies: Record<string, string> };
  const csp = (
    JSON.parse(read('../../../vercel.json')) as { headers: { headers: { key: string; value: string }[] }[] }
  ).headers
    .flatMap((h) => h.headers)
    .find((h) => h.key.startsWith('Content-Security-Policy'))!;

  it('the MediaPipe WASM version is the installed one, and the CSP allows exactly its folder', () => {
    expect(pkg.dependencies['@mediapipe/tasks-vision']).toBe(MEDIAPIPE_VERSION);
    expect(csp.key).toBe('Content-Security-Policy-Report-Only');
    expect(csp.value).toContain(
      `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm/`,
    );
  });

  it('no whole CDN or bucket is allowed, only the model paths', () => {
    const sources = csp.value.split(';').flatMap((d) => d.trim().split(/\s+/).slice(1));
    expect(sources).not.toContain('https://cdn.jsdelivr.net');
    expect(sources).not.toContain('https://storage.googleapis.com');
    expect(sources).toContain('https://storage.googleapis.com/mediapipe-models/');
  });
});
