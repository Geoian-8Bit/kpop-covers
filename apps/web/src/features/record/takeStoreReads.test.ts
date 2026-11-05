import { describe, expect, it } from 'vitest';
import { mapLimited } from './takeStore';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('mapLimited (REQ-24 · parallel reads from the phone storage)', () => {
  it('keeps at most 16 reads in flight and returns them in order', async () => {
    let inFlight = 0;
    let most = 0;
    const items = Array.from({ length: 300 }, (_, i) => i);
    const out = await mapLimited(items, async (n) => {
      inFlight++;
      most = Math.max(most, inFlight);
      await tick();
      inFlight--;
      return n * 2;
    });
    expect(out).toEqual(items.map((n) => n * 2));
    expect(most).toBe(16);
  });

  it('fails with the error the serial loop would have met first', async () => {
    const run = mapLimited([0, 1, 2, 3], async (n) => {
      // The later piece fails sooner: still, the lowest index decides.
      await new Promise((resolve) => setTimeout(resolve, n === 3 ? 0 : 5));
      if (n === 1) throw new DOMException('gone', 'NotFoundError');
      if (n === 3) throw new Error('other');
      return n;
    });
    await expect(run).rejects.toMatchObject({ name: 'NotFoundError' });
  });

  it('copes with nothing to read', async () => {
    expect(await mapLimited([], async () => 1)).toEqual([]);
  });
});
