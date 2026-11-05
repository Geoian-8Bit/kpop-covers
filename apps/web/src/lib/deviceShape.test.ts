import { afterEach, describe, expect, it, vi } from 'vitest';
import { deviceShape } from './deviceShape';

function stub({ coarse, w, h, memory }: { coarse: boolean; w: number; h: number; memory?: number }) {
  vi.stubGlobal('navigator', memory === undefined ? {} : { deviceMemory: memory });
  vi.stubGlobal('matchMedia', () => ({ matches: coarse }));
  vi.stubGlobal('screen', { width: w, height: h });
}

describe('deviceShape', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a phone: coarse pointer and a short side under 820 px', () => {
    stub({ coarse: true, w: 412, h: 915, memory: 4 });
    expect(deviceShape()).toEqual({ mobile: true, memoryGb: 4 });
  });

  it('a tablet or a computer is not a phone; unknown memory is null', () => {
    stub({ coarse: true, w: 1024, h: 1366 });
    expect(deviceShape()).toEqual({ mobile: false, memoryGb: null });
    stub({ coarse: false, w: 390, h: 844, memory: 8 });
    expect(deviceShape()).toEqual({ mobile: false, memoryGb: 8 });
  });
});
