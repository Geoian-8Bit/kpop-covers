import { describe, expect, it } from 'vitest';
import { beginHeavyWork } from '@/lib/heavyWork';
import { judgePace, loadedByHeavyWork } from './pace';

describe('global review [6] · the recorder learns nothing from the app’s own heavy work', () => {
  it('judges a slow measurement when nothing else loads the phone', () => {
    expect(loadedByHeavyWork(performance.now() - 60_000)).toBe(false);
    expect(judgePace('fps30', '1080p')).toBe('pending');
  });

  it('not while the copy for the group or the separation loads it', () => {
    const copy = beginHeavyWork('copy');
    expect(judgePace('fps30', '1080p')).toBe('none');
    copy();
    // It loaded the phone a moment ago: the take that just ended carried that load.
    expect(judgePace('smaller', '4k')).toBe('none');
  });

  it('a job paused for the recorder since before the measurement doesn’t count', () => {
    const voice = beginHeavyWork('voice');
    voice.idle(true);
    const measuredFrom = performance.now() + 1;
    expect(loadedByHeavyWork(measuredFrom)).toBe(false);
    voice();
  });
});
