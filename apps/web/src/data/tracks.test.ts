import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listPlayableVideos = vi.fn();
const signVideoFiles = vi.fn();
vi.mock('@/lib/backend/bags', () => ({ bagsBackend: { listPlayableVideos, signVideoFiles } }));
vi.mock('@/lib/backend/core', () => ({ backend: {} }));

const { prefetchRound, roundVideoQuery, videoPlayKey } = await import('./tracks');

const video = (id: string, storage_path: string | null) => ({
  id,
  source: storage_path ? 'upload' : 'youtube',
  youtube_id: storage_path ? null : `yt-${id}`,
  storage_path,
  file_name: null,
  file_size: null,
  file_offset_seconds: null,
});

describe('prefetchRound (REQ-19)', () => {
  beforeEach(() => {
    listPlayableVideos.mockReset();
    signVideoFiles.mockReset();
  });

  it('asks once for every song and once for every file, and seeds the per-song keys', async () => {
    listPlayableVideos.mockResolvedValue([video('a', 'u/a.mp4'), video('b', null), video('c', 'u/c.mp4')]);
    const client = new QueryClient();
    await prefetchRound(client, ['a', 'b', 'a', 'c', 'b']);
    expect(listPlayableVideos).toHaveBeenCalledTimes(1);
    expect(listPlayableVideos).toHaveBeenCalledWith(['a', 'b', 'c']);
    expect(signVideoFiles).toHaveBeenCalledTimes(1);
    expect(signVideoFiles).toHaveBeenCalledWith(['u/a.mp4', 'u/c.mp4']);
    expect(client.getQueryData(videoPlayKey('b'))).toMatchObject({ youtube_id: 'yt-b' });
  });

  it('does not ask again for songs already known', async () => {
    const client = new QueryClient();
    client.setQueryData(videoPlayKey('x'), video('x', null));
    client.setQueryData(videoPlayKey('y'), video('y', null));
    await prefetchRound(client, ['x', 'y']);
    expect(listPlayableVideos).not.toHaveBeenCalled();
  });

  it('does not ask again for an id that came back unseeded (archived), and the round stays settled', async () => {
    listPlayableVideos.mockResolvedValue([video('k1', null)]);
    const client = new QueryClient();
    await prefetchRound(client, ['k1', 'gone']);
    await prefetchRound(client, ['k1', 'gone']);
    expect(listPlayableVideos).toHaveBeenCalledTimes(1);
    listPlayableVideos.mockClear();
    // A song of the round reads its own row at once instead of waiting for a warm-up already tried.
    listPlayableVideos.mockResolvedValue([]);
    expect(await client.fetchQuery(roundVideoQuery(client, 'gone'))).toBeNull();
    expect(listPlayableVideos).toHaveBeenCalledTimes(1);
  });

  it('survives a failing request: each song will ask for itself', async () => {
    listPlayableVideos.mockRejectedValue(new Error('offline'));
    const client = new QueryClient();
    await expect(prefetchRound(client, ['q'])).resolves.toBeUndefined();
    expect(signVideoFiles).not.toHaveBeenCalled();
  });
});

describe('a song of a round (REQ-19)', () => {
  beforeEach(() => {
    listPlayableVideos.mockReset();
    signVideoFiles.mockReset();
  });

  it('uses the warmed row once, then reads the server again (a file linked meanwhile reaches the round)', async () => {
    let finish: (rows: unknown[]) => void = () => undefined;
    listPlayableVideos.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const client = new QueryClient();
    const warming = prefetchRound(client, ['s1']);
    const first = client.fetchQuery(roundVideoQuery(client, 's1'));
    finish([video('s1', null)]);
    await warming;
    expect(await first).toMatchObject({ storage_path: null });
    expect(listPlayableVideos).toHaveBeenCalledTimes(1);

    listPlayableVideos.mockResolvedValueOnce([video('s1', 'u/s1.mp4')]);
    await client.invalidateQueries({ queryKey: videoPlayKey('s1') });
    expect(await client.fetchQuery({ ...roundVideoQuery(client, 's1'), staleTime: 0 })).toMatchObject({
      storage_path: 'u/s1.mp4',
    });
    expect(listPlayableVideos).toHaveBeenLastCalledWith(['s1']);

    listPlayableVideos.mockResolvedValueOnce([]);
    expect(await client.fetchQuery({ ...roundVideoQuery(client, 's1'), staleTime: 0 })).toBeNull();
  });
});
