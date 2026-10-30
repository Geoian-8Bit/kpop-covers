import { describe, expect, it } from 'vitest';
import { cameraPosition, propYaw, toWorld } from './cameraRules';

const stage = { width: 8, depth: 6 };

describe('3D view rules', () => {
  it('centres the stage on the origin, audience towards +z', () => {
    expect(toWorld({ x: 4, y: 3 }, stage)).toEqual([0, 0]);
    expect(toWorld({ x: 0, y: 6 }, stage)).toEqual([-4, 3]);
  });

  it('camera shortcuts', () => {
    const audience = cameraPosition('audience', stage);
    expect(audience[0]).toBe(0);
    expect(audience[2]).toBeGreaterThan(stage.depth / 2);
    const top = cameraPosition('top', stage);
    expect(top[1]).toBeGreaterThan(audience[1]);
    const side = cameraPosition('side', stage);
    expect(side[0]).toBeGreaterThan(stage.width / 2);
    // A bigger stage pulls the camera back.
    expect(cameraPosition('audience', { width: 16, depth: 12 })[2]).toBeGreaterThan(audience[2]);
  });

  it('prop turn in radians, clockwise from above', () => {
    expect(propYaw(0)).toBeCloseTo(0);
    expect(propYaw(90)).toBeCloseTo(-Math.PI / 2);
  });
});
