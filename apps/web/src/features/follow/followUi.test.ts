import { describe, expect, it } from 'vitest';
import { followUi, jobLine, jobMilestone, jobShort, useFollowUi } from './followUi';

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

describe('15 · the progress line', () => {
  const job = { label: 'Minji', pathId: null, done: 420, total: 1000, phase: 'frames' as const };
  it('says the percent and the time left', () => {
    expect(jobLine({ ...job, remaining: 40 })).toBe('Analizando a «Minji»: 42 % · quedan unos 40 s');
    expect(jobLine({ ...job, remaining: null })).toBe('Analizando a «Minji»: 42 %');
    expect(jobShort({ ...job, remaining: 5 })).toBe('Analizando 42 % · quedan menos de 10 s');
  });
  it('once the stretch being watched is ready, it says so and goes on with the rest', () => {
    expect(jobLine({ ...job, ready: true, remaining: 120 })).toBe(
      'Ya sigues a «Minji» aquí. Resto de la canción: 42 % · quedan unos 2 min',
    );
    // «Ya sigues a…» was said once already (the notice): every 25 % only the progress.
    expect(jobMilestone({ ...job, ready: true })).toBe('Resto de la canción: 25 %');
  });
});

describe('15 · while the analysis waits', () => {
  const job = { label: 'Minji', pathId: null, done: 420, total: 1000, phase: 'frames' as const };
  it('says why, instead of a time left', () => {
    expect(jobLine({ ...job, held: 'recording', remaining: 40 })).toBe('En pausa mientras grabas · 42 %');
    expect(jobLine({ ...job, held: 'voice' })).toBe('En pausa mientras se separa la voz · 42 %');
    expect(jobShort({ ...job, held: 'recording' })).toBe('En pausa 42 %');
    expect(jobMilestone({ ...job, held: 'recording' })).toBe('En pausa mientras grabas');
  });
});

describe('10 · an old analysis ending never clears a newer one', () => {
  it('only its own job goes', () => {
    const old = new AbortController();
    const fresh = new AbortController();
    const base = {
      pathId: null,
      label: 'X',
      phase: 'frames' as const,
      done: 0,
      total: 1,
      ready: false,
      remaining: null,
    };
    followUi.job({ ...base, abort: fresh });
    followUi.endJob(old);
    expect(useFollowUi.getState().job?.abort).toBe(fresh);
    followUi.endJob(fresh);
    expect(useFollowUi.getState().job).toBeNull();
  });
});
