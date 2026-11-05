import { describe, expect, it } from 'vitest';
import { replayHidden, stepPendulum, type Pendulum } from './hanging';

describe('replayHidden (REQ-22)', () => {
  it('applies each impulse at its time and steps up to the end in frames of at most 1/60 s', () => {
    const log: string[] = [];
    let total = 0;
    replayHidden(
      0,
      50,
      [
        { at: 0, impulse: 1 },
        { at: 20, impulse: 2 },
      ],
      (i) => log.push(`i${i}`),
      (dt) => {
        total += dt;
        log.push('s');
      },
    );
    expect(log).toEqual(['i1', 's', 's', 'i2', 's']);
    expect(total).toBeCloseTo(0.05, 6);
  });

  it('with nothing to replay (same instant) only applies the impulses', () => {
    const got: number[] = [];
    replayHidden(
      10,
      10,
      [{ at: 10, impulse: 0.5 }],
      (i) => got.push(i),
      () => got.push(-1),
    );
    expect(got).toEqual([0.5]);
  });

  it('caps a long absence: the swing has settled by the time it comes back', () => {
    const p: Pendulum = { theta: 0, omega: 0, target: null };
    const cfg = { period: 1.45, damping: 0.75, maxAngle: 1.15 };
    let steps = 0;
    replayHidden(
      0,
      60_000,
      [{ at: 0, impulse: 1 }],
      (i) => {
        p.omega += i;
      },
      (dt) => {
        steps++;
        stepPendulum(p, cfg, dt);
      },
    );
    expect(steps).toBeLessThanOrEqual(721);
    expect(Math.abs(p.theta)).toBeLessThan(0.01);
  });
});
