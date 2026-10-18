import { describe, expect, it, vi } from 'vitest';
import { forgetRetiredData, RETIRED_CACHES, RETIRED_KEYS } from './retiredData';

describe('forgetRetiredData (45)', () => {
  it('drops the pose models’ cache and the pose test’s local results', async () => {
    const caches = { delete: vi.fn(async (_name: string) => true) };
    const storage = { removeItem: vi.fn((_key: string) => undefined) };
    await forgetRetiredData({ caches, storage });
    expect(caches.delete.mock.calls.map((c) => c[0])).toEqual([...RETIRED_CACHES]);
    expect(storage.removeItem.mock.calls.map((c) => c[0])).toEqual([...RETIRED_KEYS]);
  });

  it('never throws: no Cache API, blocked storage, a failing delete', async () => {
    await expect(forgetRetiredData({ caches: null, storage: null })).resolves.toBeUndefined();
    const storage = {
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    const caches = { delete: () => Promise.reject(new Error('nope')) };
    await expect(forgetRetiredData({ caches, storage })).resolves.toBeUndefined();
  });
});
