import { describe, expect, it, vi } from 'vitest';
import { writePositions } from './positionsRetry';

const invalid = () => Object.assign(new Error('track_positions_invalid'), { code: 'P0001' });

describe('writePositions (REQ-20)', () => {
  it('writes the whole order once when it goes through', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const readLive = vi.fn();
    await writePositions(['a', 'b', 'c'], write, readLive, 'track_positions_invalid');
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(['a', 'b', 'c']);
    expect(readLive).not.toHaveBeenCalled();
  });

  it('drops the ids archived meanwhile and retries once, keeping the requested order', async () => {
    const write = vi.fn().mockRejectedValueOnce(invalid()).mockResolvedValueOnce(undefined);
    const readLive = vi.fn().mockResolvedValue(['c', 'a', 'z']);
    await writePositions(['c', 'b', 'a'], write, readLive, 'track_positions_invalid');
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith(['c', 'a']);
  });

  it('reports the second failure as before', async () => {
    const second = new Error('track_positions_invalid (again)');
    const write = vi.fn().mockRejectedValueOnce(invalid()).mockRejectedValueOnce(second);
    await expect(
      writePositions(['a', 'b'], write, async () => ['a'], 'track_positions_invalid'),
    ).rejects.toBe(second);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('ends quietly when none of the ids is left (the old per-row writes changed nothing)', async () => {
    const write = vi.fn().mockRejectedValueOnce(invalid());
    await writePositions(['a'], write, async () => [], 'track_positions_invalid');
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('does not retry other errors, nor when the live ids cannot be read', async () => {
    const offline = new Error('Failed to fetch');
    const write = vi.fn().mockRejectedValue(offline);
    const readLive = vi.fn();
    await expect(writePositions(['a'], write, readLive, 'track_positions_invalid')).rejects.toBe(offline);
    expect(readLive).not.toHaveBeenCalled();

    const first = invalid();
    const write2 = vi.fn().mockRejectedValueOnce(first);
    await expect(
      writePositions(['a'], write2, () => Promise.reject(new Error('offline')), 'track_positions_invalid'),
    ).rejects.toBe(first);
    expect(write2).toHaveBeenCalledTimes(1);
  });
});
