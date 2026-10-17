import { describe, expect, it } from 'vitest';
import { initialFocusIndex, type FocusCandidate } from './dialogFocus';

const node = (over: Partial<FocusCandidate> = {}): FocusCandidate => ({ autofocus: false, close: false, ...over });

describe('initialFocusIndex', () => {
  it('confirmation without the X: the first button (Cancelar), never the action after it', () => {
    expect(initialFocusIndex([node(), node()])).toBe(0);
  });

  it('dialog with the X: the first control after it (a form field)', () => {
    expect(initialFocusIndex([node({ close: true }), node(), node()])).toBe(1);
  });

  it('data-autofocus wins wherever it is', () => {
    expect(initialFocusIndex([node({ close: true }), node(), node({ autofocus: true })])).toBe(2);
    expect(initialFocusIndex([node(), node({ autofocus: true })])).toBe(1);
  });

  it('only the X: the X; nothing focusable: -1 (the panel)', () => {
    expect(initialFocusIndex([node({ close: true })])).toBe(0);
    expect(initialFocusIndex([])).toBe(-1);
  });
});
