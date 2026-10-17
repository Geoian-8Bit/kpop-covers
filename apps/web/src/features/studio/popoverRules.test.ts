import { describe, expect, it } from 'vitest';
import { menuStep, popoverShift, popoverSide, sheetScreen } from './popoverRules';

describe('popoverShift', () => {
  it('leaves a popover that fits where it is', () => {
    expect(popoverShift(100, 224, 390)).toBe(0);
  });

  it('pushes it right when it spills past the left edge (the phone bug)', () => {
    // Anchored to the right of a button near the left: its left edge sat at -60 px.
    expect(popoverShift(-60, 224, 390)).toBe(72);
  });

  it('pulls it left when it spills past the right edge', () => {
    expect(popoverShift(300, 224, 390)).toBe(390 - 12 - 524);
  });

  it('lines a too-wide popover up with the left margin', () => {
    expect(popoverShift(40, 500, 390)).toBe(-28);
  });

  it('does nothing without a usable viewport or box', () => {
    expect(popoverShift(-60, 224, 0)).toBe(0);
    expect(popoverShift(-60, 0, 390)).toBe(0);
  });
});

describe('popoverSide', () => {
  // A 390×844 phone: top bar to 64 px, the pinned video down to 292 px.
  const base = { height: 190, anchorTop: 600, anchorBottom: 646, ceiling: 292, floor: 844, narrow: true };

  it('stays above its button when it clears the pinned video', () => {
    expect(popoverSide({ ...base, top: 600 - 8 - 190 })).toBe('natural');
  });

  it('opens below its button when the pinned video would cover it', () => {
    expect(popoverSide({ ...base, anchorTop: 420, anchorBottom: 466, top: 420 - 8 - 190 })).toBe('below');
  });

  it('becomes a bottom sheet on a phone when it fits on neither side', () => {
    expect(popoverSide({ ...base, anchorTop: 480, anchorBottom: 526, top: 480 - 8 - 190, floor: 700 })).toBe('sheet');
  });

  it('takes the roomier side on a big screen instead of a sheet', () => {
    const fit = { ...base, narrow: false, anchorTop: 480, anchorBottom: 526, top: 480 - 8 - 190, floor: 700 };
    expect(popoverSide(fit)).toBe('natural');
    expect(popoverSide({ ...fit, ceiling: 400 })).toBe('below');
  });

  it('only minds the screen top with nothing pinned (fullscreen)', () => {
    expect(popoverSide({ ...base, ceiling: 0, anchorTop: 250, anchorBottom: 294, top: 52 })).toBe('natural');
    expect(popoverSide({ ...base, ceiling: 0, anchorTop: 200, anchorBottom: 244, top: 2 })).toBe('below');
  });

  it('does nothing without a usable box or screen', () => {
    expect(popoverSide({ ...base, top: 0, height: 0 })).toBe('natural');
    expect(popoverSide({ ...base, top: 0, floor: 0 })).toBe('natural');
  });
});

describe('sheetScreen', () => {
  it('uses the sheet on a phone held upright', () => {
    expect(sheetScreen({ width: 390, height: 844, coarse: true })).toBe(true);
  });

  it('also on a phone on its side (844×390 counts as wide, but is short)', () => {
    expect(sheetScreen({ width: 844, height: 390, coarse: false })).toBe(true);
    expect(sheetScreen({ width: 844, height: 390, coarse: true })).toBe(true);
  });

  it('also on a touch screen, where dragging to a cut-off menu would close it', () => {
    expect(sheetScreen({ width: 1024, height: 768, coarse: true })).toBe(true);
  });

  it('not on a desktop window with a mouse', () => {
    expect(sheetScreen({ width: 1280, height: 800, coarse: false })).toBe(false);
    expect(sheetScreen({ width: 1280, height: 0, coarse: false })).toBe(false);
  });

  it('turns the landscape phone case into a sheet instead of a menu under the top bar', () => {
    // 844×390: top bar to 64 px, a 180 px pause menu over a button at mid height fits neither side.
    const fit = { top: 195 - 8 - 180, height: 180, anchorTop: 195, anchorBottom: 239, ceiling: 64, floor: 390 };
    expect(popoverSide({ ...fit, narrow: sheetScreen({ width: 844, height: 390, coarse: true }) })).toBe('sheet');
    expect(popoverSide({ ...fit, narrow: false })).not.toBe('sheet');
  });
});

describe('menuStep', () => {
  // The fullscreen speed menu: 8 speeds in 2 columns.
  it('moves sideways with wrap-around', () => {
    expect(menuStep(0, 8, 'ArrowRight', 2)).toBe(1);
    expect(menuStep(7, 8, 'ArrowRight', 2)).toBe(0);
    expect(menuStep(0, 8, 'ArrowLeft', 2)).toBe(7);
  });

  it('moves a row up and down, and stays at the edges', () => {
    expect(menuStep(1, 8, 'ArrowDown', 2)).toBe(3);
    expect(menuStep(3, 8, 'ArrowUp', 2)).toBe(1);
    expect(menuStep(1, 8, 'ArrowUp', 2)).toBe(1);
    expect(menuStep(6, 8, 'ArrowDown', 2)).toBe(6);
  });

  it('reaches a shorter last row (the pause menu: 6 choices in 3 columns, then the tick switch)', () => {
    expect(menuStep(4, 7, 'ArrowDown', 3)).toBe(6);
    expect(menuStep(6, 7, 'ArrowUp', 3)).toBe(3);
  });

  it('jumps to the ends, and ignores other keys', () => {
    expect(menuStep(3, 8, 'Home', 2)).toBe(0);
    expect(menuStep(3, 8, 'End', 2)).toBe(7);
    expect(menuStep(3, 8, 'a', 2)).toBeNull();
    expect(menuStep(-1, 8, 'ArrowDown', 2)).toBeNull();
  });
});
