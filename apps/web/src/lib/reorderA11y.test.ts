import { describe, expect, it } from 'vitest';
import { moveTarget, positionMessage } from './reorderA11y';

describe('keyboard reorder', () => {
  it('moves inside the list and stops at both ends', () => {
    expect(moveTarget(2, -1, 5)).toBe(1);
    expect(moveTarget(2, 1, 5)).toBe(3);
    expect(moveTarget(0, -1, 5)).toBeNull();
    expect(moveTarget(4, 1, 5)).toBeNull();
    expect(moveTarget(0, 1, 1)).toBeNull();
  });

  it('announces the new place, counted from 1', () => {
    expect(positionMessage('Supernova', 1, 5)).toBe('“Supernova”, puesto 2 de 5');
  });
});
