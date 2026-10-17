import { afterEach, describe, expect, it } from 'vitest';
import { beginHeavyWork } from '@/lib/heavyWork';
import { usePlayer } from '@/player/store';
import { holdReason } from './analysisHold';

describe('15 · when the follow analysis waits', () => {
  afterEach(() => usePlayer.setState({ covered: false }));

  it('waits for the recorder, then the voice separation, then the copy for the group', () => {
    expect(holdReason()).toBeNull();
    const copy = beginHeavyWork('copy');
    expect(holdReason()).toBe('copy');
    const voice = beginHeavyWork('voice');
    expect(holdReason()).toBe('voice');
    usePlayer.setState({ covered: true });
    expect(holdReason()).toBe('recording');
    usePlayer.setState({ covered: false });
    voice();
    copy();
    expect(holdReason()).toBeNull();
  });

  it('not while the copy only uploads (idle: no load on the device)', () => {
    const copy = beginHeavyWork('copy');
    copy.idle(true);
    expect(holdReason()).toBeNull();
    copy();
  });
});
