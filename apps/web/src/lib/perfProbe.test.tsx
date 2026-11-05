// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// REQ-03 · The flag is read once at module load, so each case loads a fresh copy of the module.
async function load(flag: string | null) {
  vi.resetModules();
  delete window.__oneshootPerf;
  if (flag === null) window.localStorage.removeItem('oneshoot.debug.perf');
  else window.localStorage.setItem('oneshoot.debug.perf', flag);
  return import('./perfProbe');
}

describe('PerfProbe', () => {
  beforeEach(() => window.localStorage.clear());

  it('counts commits per id when the flag is on', async () => {
    const { PerfProbe } = await load('1');
    const { rerender } = render(
      <PerfProbe id="Demo">
        <p>hola</p>
      </PerfProbe>,
    );
    rerender(
      <PerfProbe id="Demo">
        <p>adios</p>
      </PerfProbe>,
    );
    const perf = window.__oneshootPerf!;
    expect(perf.commits.Demo).toBe(2);
    expect(perf.log.map((e) => e.phase)).toEqual(['mount', 'update']);
    perf.reset();
    expect(perf.commits).toEqual({});
    expect(perf.log).toEqual([]);
  });

  it('does not wrap anything without the flag', async () => {
    const { PerfProbe } = await load(null);
    const { container } = render(
      <PerfProbe id="Demo">
        <p>hola</p>
      </PerfProbe>,
    );
    expect(container.innerHTML).toBe('<p>hola</p>');
    expect(window.__oneshootPerf).toBeUndefined();
  });
});
