import { describe, expect, it } from 'vitest';
import { classifyLenses, fitChips, otherLensStep, probeFromCapabilities, torchHint, type LensProbe } from './lensRules';

const probe = (p: Partial<LensProbe>): LensProbe => ({
  torch: false,
  autofocus: null,
  maxWidth: 4000,
  maxHeight: 3000,
  zoomMin: 1,
  zoomMax: 8,
  ...p,
});

describe('classifyLenses', () => {
  it('reads iPhone names', () => {
    const lenses = classifyLenses([
      { id: 'w', label: 'Back Camera' },
      { id: 'u', label: 'Back Ultra Wide Camera' },
      { id: 't', label: 'Back Telephoto Camera' },
    ]);
    expect(lenses.map((l) => [l.id, l.role, l.name, l.factor])).toEqual([
      ['u', 'ultra', 'Gran angular', 0.5],
      ['w', 'main', 'Principal', 1],
      ['t', 'tele', 'Tele', null],
    ]);
    expect(lenses.every((l) => l.sure)).toBe(true);
  });

  it('Android camera 0 is the main one; an unknown second one stays «Otra lente»', () => {
    const lenses = classifyLenses([
      { id: 'a', label: 'camera2 2, facing back' },
      { id: 'b', label: 'camera2 0, facing back' },
    ]);
    expect(lenses.map((l) => [l.id, l.role, l.name])).toEqual([
      ['b', 'main', 'Principal'],
      ['a', 'other', 'Otra lente'],
    ]);
  });

  it('a fixed-focus camera seen once is the ultra-wide; a small one is a macro', () => {
    const lenses = classifyLenses([
      { id: 'm', label: 'camera2 0, facing back', probe: probe({ torch: true, autofocus: true }) },
      { id: 'u', label: 'camera2 2, facing back', probe: probe({ autofocus: false, maxWidth: 4000 }) },
      { id: 'c', label: 'camera2 3, facing back', probe: probe({ autofocus: false, maxWidth: 1600, maxHeight: 1200 }) },
    ]);
    expect(lenses.map((l) => [l.id, l.role])).toEqual([
      ['u', 'ultra'],
      ['m', 'main'],
      ['c', 'macro'],
    ]);
  });

  it('the flash marks the main camera when names say nothing', () => {
    const lenses = classifyLenses([
      { id: 'x', label: 'Rear 1', probe: probe({ torch: false, autofocus: true }) },
      { id: 'y', label: 'Rear 2', probe: probe({ torch: true, autofocus: true }) },
    ]);
    expect(lenses.find((l) => l.role === 'main')?.id).toBe('y');
    expect(lenses.find((l) => l.id === 'x')?.role).toBe('other');
  });

  it('without any clue the first one is a best guess, and a lone camera is surely the main one', () => {
    const two = classifyLenses([
      { id: 'x', label: '' },
      { id: 'y', label: '' },
    ]);
    expect(two[0]).toMatchObject({ id: 'x', role: 'main', sure: false });
    expect(two[1]).toMatchObject({ id: 'y', role: 'other', name: 'Otra lente' });
    expect(classifyLenses([{ id: 'only', label: '' }])[0]).toMatchObject({ role: 'main', sure: true });
  });

  it('numbers several unknown lenses', () => {
    const lenses = classifyLenses([
      { id: 'm', label: 'camera2 0, facing back' },
      { id: 'a', label: 'camera2 2, facing back' },
      { id: 'b', label: 'camera2 4, facing back' },
    ]);
    expect(lenses.map((l) => l.name)).toEqual(['Principal', 'Otra lente 1', 'Otra lente 2']);
  });

  it('keeps a single main when two claim it', () => {
    const lenses = classifyLenses([
      { id: 'a', label: 'Back Camera', probe: probe({ torch: false }) },
      { id: 'b', label: 'camera2 0, facing back', probe: probe({ torch: true }) },
    ]);
    expect(lenses.filter((l) => l.role === 'main').map((l) => l.id)).toEqual(['b']);
  });
});

describe('probeFromCapabilities', () => {
  it('reads focus, flash, size and zoom', () => {
    expect(
      probeFromCapabilities({
        torch: true,
        focusMode: ['manual', 'continuous'],
        width: { max: 4000 },
        height: { max: 3000 },
        zoom: { min: 1, max: 10 },
      }),
    ).toEqual({ torch: true, autofocus: true, maxWidth: 4000, maxHeight: 3000, zoomMin: 1, zoomMax: 10 });
    expect(probeFromCapabilities({ focusMode: ['manual'] }).autofocus).toBe(false);
    expect(probeFromCapabilities({ focusMode: [] }).autofocus).toBeNull();
    expect(probeFromCapabilities({}).autofocus).toBeNull();
  });
});

describe('torchHint', () => {
  const lenses = classifyLenses([
    { id: 'm', label: 'camera2 0, facing back' },
    { id: 'u', label: 'Back Ultra Wide Camera' },
  ]);
  it('names the lens with the flash', () => {
    expect(torchHint(lenses, { m: probe({ torch: true }) }, 'u')).toBe(
      'La lente gran angular no tiene flash: solo la principal (1×) lo tiene.',
    );
  });
  it('says only what it knows', () => {
    expect(torchHint(lenses, {}, 'u')).toBe('Esta lente no tiene flash.');
  });
});

describe('lens buttons that fit (P23 review)', () => {
  const k = (...keys: string[]) => keys.map((key) => ({ key }));
  it('keeps up to four; «2×» goes first, then from the end, never 1× or the one in use', () => {
    expect(fitChips(k('ultra', 'z1', 'z2', 'tele')).map((c) => c.key)).toEqual(['ultra', 'z1', 'z2', 'tele']);
    expect(fitChips(k('ultra', 'z1', 'z2', 'tele', 'other')).map((c) => c.key)).toEqual(['ultra', 'z1', 'tele', 'other']);
    expect(fitChips(k('ultra', 'z1', 'z2', 'tele', 'other'), 4, 'z2').map((c) => c.key)).toEqual(['ultra', 'z1', 'z2', 'tele']);
    expect(fitChips(k('z1', 'a', 'b', 'c', 'd', 'e'), 3).map((c) => c.key)).toEqual(['z1', 'a', 'b']);
  });
  it('the unidentified cameras share one button that goes through them', () => {
    expect(otherLensStep([], null)).toEqual({ active: null, next: null });
    expect(otherLensStep(['a', 'b'], 'main')).toEqual({ active: null, next: 'a' });
    expect(otherLensStep(['a', 'b'], 'a')).toEqual({ active: 'a', next: 'b' });
    expect(otherLensStep(['a', 'b'], 'b')).toEqual({ active: 'b', next: 'a' });
    expect(otherLensStep(['a'], 'a')).toEqual({ active: 'a', next: 'a' });
  });
});
