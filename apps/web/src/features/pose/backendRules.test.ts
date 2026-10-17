import { describe, expect, it } from 'vitest';
import {
  chooseBackend,
  isMobileDevice,
  isSoftwareRenderer,
  parseBench,
  probeOutcome,
  shouldProbeWasm,
  wasmWins,
  withBench,
} from './backendRules';

const desktop = { hasWebGpu: true, chromium: true, adapter: 'real' as const, broken: false, mobile: false };
const phone = { ...desktop, mobile: true };

describe('15 · WebGPU on a phone only when measured faster there', () => {
  it('a computer with a real graphics chip keeps WebGPU', () => {
    expect(chooseBackend(desktop)).toBe('webgpu');
  });
  it('a phone stays on WebGL, unless the pose test measured WebGPU clearly faster', () => {
    expect(chooseBackend(phone)).toBe('webgl');
    expect(chooseBackend({ ...phone, bench: { webgl: 40, webgpu: 38 } })).toBe('webgl');
    expect(chooseBackend({ ...phone, bench: { webgl: 40, webgpu: 25 } })).toBe('webgpu');
    expect(chooseBackend({ ...phone, bench: { webgpu: 25 } })).toBe('webgl');
    expect(chooseBackend({ ...phone, broken: true, bench: { webgl: 40, webgpu: 25 } })).toBe('webgl');
  });
});

describe('15 · WASM for a computer without a graphics chip, never on a phone', () => {
  const noGpu = { ...desktop, hasWebGpu: false };
  it('a WebGL drawn by the processor goes to WASM', () => {
    expect(chooseBackend({ ...noGpu, softwareGl: true })).toBe('wasm');
    expect(chooseBackend({ ...desktop, adapter: 'fallback', softwareGl: true })).toBe('wasm');
    expect(chooseBackend({ ...noGpu, softwareGl: true, wasmBroken: true })).toBe('webgl');
    expect(chooseBackend({ ...phone, hasWebGpu: false, softwareGl: true })).toBe('webgl');
  });
  it('or where the pose test (or a probe) measured WASM clearly faster', () => {
    expect(chooseBackend({ ...noGpu, bench: { webgl: 110, wasm: 60 } })).toBe('wasm');
    expect(chooseBackend({ ...noGpu, bench: { webgl: 70, wasm: 65 } })).toBe('webgl');
    expect(chooseBackend({ ...noGpu })).toBe('webgl');
  });
  it('knows the software renderers by name', () => {
    expect(
      isSoftwareRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'),
    ).toBe(true);
    expect(
      isSoftwareRenderer('ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0)'),
    ).toBe(true);
    expect(isSoftwareRenderer('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe(true);
    expect(
      isSoftwareRenderer('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)'),
    ).toBe(false);
    expect(isSoftwareRenderer(null)).toBe(false);
  });
  it('tries WASM after slow first frames on WebGL, once, on a computer only', () => {
    const base = { backend: 'webgl', mobile: false, frameMs: 110, wasmBroken: false, probed: false };
    expect(shouldProbeWasm(base)).toBe(true);
    expect(shouldProbeWasm({ ...base, frameMs: 60 })).toBe(false);
    expect(shouldProbeWasm({ ...base, mobile: true })).toBe(false);
    expect(shouldProbeWasm({ ...base, probed: true })).toBe(false);
    expect(shouldProbeWasm({ ...base, backend: 'webgpu' })).toBe(false);
    expect(wasmWins(60, 110)).toBe(true);
    expect(wasmWins(100, 110)).toBe(false);
  });
  it('no probe again where WASM and WebGL are both measured already: «auto» has decided', () => {
    const base = { backend: 'webgl', mobile: false, frameMs: 110, wasmBroken: false, probed: false };
    expect(shouldProbeWasm({ ...base, bench: { wasm: 130, webgl: 110 } })).toBe(false);
    expect(shouldProbeWasm({ ...base, bench: { webgl: 110 } })).toBe(true);
    expect(shouldProbeWasm({ ...base, bench: { webgpu: 20, wasm: 90 } })).toBe(true);
    expect(shouldProbeWasm({ ...base, bench: null })).toBe(true);
  });
  it('the probe keeps the very numbers it decides on: the next session’s «auto» says the same', () => {
    const noGpu = { ...desktop, hasWebGpu: false };
    for (const [w, g] of [
      [60, 110],
      [100, 110],
      [93.44, 110],
      [93.56, 110],
      [140, 90],
    ] as const) {
      const out = probeOutcome(w, g);
      expect(chooseBackend({ ...noGpu, bench: out.bench })).toBe(out.wasm ? 'wasm' : 'webgl');
      expect(parseBench(JSON.stringify(withBench(withBench({}, 'wasm', w), 'webgl', g)))).toEqual(out.bench);
    }
    expect(probeOutcome(60, 110).wasm).toBe(true);
    expect(probeOutcome(100, 110).wasm).toBe(false);
  });
});

describe('the device and the measurements', () => {
  it('phones and tablets, an iPad that says it is a Mac included', () => {
    expect(isMobileDevice({ uaMobile: true, ua: '', touchPoints: 5 })).toBe(true);
    expect(isMobileDevice({ ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)', touchPoints: 5 })).toBe(true);
    expect(isMobileDevice({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', touchPoints: 5 })).toBe(
      true,
    );
    expect(isMobileDevice({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', touchPoints: 0 })).toBe(
      false,
    );
    expect(
      isMobileDevice({ uaMobile: false, ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', touchPoints: 10 }),
    ).toBe(false);
  });
  it('the kept measurements are read safely and updated per backend', () => {
    expect(parseBench(null)).toEqual({});
    expect(parseBench('nope')).toEqual({});
    expect(parseBench('{"webgl":40,"wasm":-1,"cpu":3}')).toEqual({ webgl: 40 });
    expect(withBench({ webgl: 40 }, 'wasm', 61.26)).toEqual({ webgl: 40, wasm: 61.3 });
    expect(withBench({ webgl: 40 }, 'GPU', 10)).toEqual({ webgl: 40 });
  });
});
