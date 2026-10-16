import { describe, expect, it } from 'vitest';
import { jobMilestone } from './followUi';

describe('what a screen reader hears', () => {
  it('each phase, and the progress only every 25 %', () => {
    const job = { label: 'Minji', pathId: null, done: 0, total: 1000 };
    expect(jobMilestone({ ...job, phase: 'model' })).toBe('Preparando el modelo…');
    const said = new Set<string>();
    for (let done = 0; done <= 1000; done += 7) said.add(jobMilestone({ ...job, phase: 'frames', done }));
    expect([...said]).toEqual([0, 25, 50, 75].map((p) => `Analizando a «Minji»: ${p} %`));
    expect(jobMilestone({ ...job, pathId: 'x', phase: 'frames', done: 600 })).toBe(
      'Recalculando a «Minji»: 50 %',
    );
  });
});
