import { describe, expect, it } from 'vitest';
import {
  cutChars,
  itemSource,
  roundClipIds,
  songYoutubeId,
  youtubeSongRow,
  youtubeSongStatus,
  type SongLike,
} from './songRules';

const base: SongLike = { video_id: null, clip_id: null, member_id: null, wish_id: null, youtube_id: null };
const yt = (id: string): SongLike => ({ ...base, youtube_id: id });
const lib = (videoId: string, youtubeId: string | null): SongLike => ({
  ...base,
  video_id: videoId,
  video: { youtube_id: youtubeId },
});

describe('youtubeSongRow', () => {
  it('keeps a good pick, trimmed, with an i.ytimg.com thumbnail', () => {
    expect(
      youtubeSongRow({
        youtubeId: 'dQw4w9WgXcQ',
        title: '  Magnetic  ',
        artist: ' ILLIT ',
        thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        durationSeconds: 158.1234,
      }),
    ).toEqual({
      youtube_id: 'dQw4w9WgXcQ',
      title: 'Magnetic',
      artist: 'ILLIT',
      thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      duration_seconds: 158.123,
    });
  });

  it('refuses a bad id or an empty title', () => {
    expect(youtubeSongRow({ youtubeId: 'nope', title: 'X' })).toBeNull();
    expect(youtubeSongRow({ youtubeId: 'dQw4w9WgXcQ', title: '   ' })).toBeNull();
  });

  it('cuts to the database limits and drops what is out of range', () => {
    const row = youtubeSongRow({
      youtubeId: 'dQw4w9WgXcQ',
      title: 'a'.repeat(250),
      artist: 'b'.repeat(130),
      thumbnailUrl: 'https://example.com/x.jpg',
      durationSeconds: -3,
    })!;
    expect(row.title).toHaveLength(200);
    expect(row.artist).toHaveLength(120);
    expect(row.thumbnail_url).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg');
    expect(row.duration_seconds).toBeNull();
    expect(youtubeSongRow({ youtubeId: 'dQw4w9WgXcQ', title: 'X', artist: '  ' })!.artist).toBeNull();
  });

  it("never keeps another video's thumbnail", () => {
    const row = youtubeSongRow({
      youtubeId: 'dQw4w9WgXcQ',
      title: 'X',
      thumbnailUrl: 'https://i.ytimg.com/vi/aaaaaaaaaaa/hqdefault.jpg',
    })!;
    expect(row.thumbnail_url).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg');
  });
});

describe('item source and YouTube id', () => {
  it('tells each source apart', () => {
    expect(itemSource(lib('v', 'x'))).toBe('video');
    expect(itemSource(yt('dQw4w9WgXcQ'))).toBe('youtube');
    expect(itemSource({ ...base, clip_id: 'c' })).toBe('clip');
    expect(itemSource({ ...base, member_id: 'm' })).toBe('member');
    expect(itemSource({ ...base, wish_id: 'w' })).toBe('wish');
    expect(itemSource(base)).toBe('none');
  });

  it('finds the YouTube video behind any song', () => {
    expect(songYoutubeId(yt('aaaaaaaaaaa'))).toBe('aaaaaaaaaaa');
    expect(songYoutubeId(lib('v', 'bbbbbbbbbbb'))).toBe('bbbbbbbbbbb');
    expect(
      songYoutubeId({ ...base, wish_id: 'w', wish: { youtube_id: 'ccccccccccc', added_video_id: null } }),
    ).toBe('ccccccccccc');
    expect(songYoutubeId(lib('v', null))).toBeNull();
  });
});

describe('youtubeSongStatus', () => {
  const library = [{ id: 'v1', youtube_id: 'aaaaaaaaaaa' }];
  it('in the bag by any source, else in the library, else new', () => {
    expect(youtubeSongStatus('aaaaaaaaaaa', [lib('v1', 'aaaaaaaaaaa')], library)).toEqual({
      status: 'in-bag',
    });
    expect(youtubeSongStatus('bbbbbbbbbbb', [yt('bbbbbbbbbbb')], library)).toEqual({ status: 'in-bag' });
    expect(youtubeSongStatus('aaaaaaaaaaa', [], library)).toEqual({ status: 'in-library', videoId: 'v1' });
    expect(youtubeSongStatus('ccccccccccc', [yt('bbbbbbbbbbb')], library)).toEqual({ status: 'new' });
  });
});

describe('roundClipIds', () => {
  const clips = [
    { id: 'c1', video_id: 'v1' },
    { id: 'c2', video_id: 'v1' },
    { id: 'c3', video_id: 'v2' },
  ];
  it('clips play as themselves; songs bring one of their clips; the rest are skipped', () => {
    const drawn: (SongLike | undefined)[] = [
      { ...base, clip_id: 'cX' },
      lib('v1', 'aaaaaaaaaaa'),
      lib('v2', 'bbbbbbbbbbb'),
      yt('ccccccccccc'),
      lib('v9', 'ddddddddddd'),
      { ...base, member_id: 'm' },
      undefined,
    ];
    expect(roundClipIds(drawn, clips, () => 0)).toEqual({ clipIds: ['cX', 'c1', 'c3'], skipped: 4 });
    expect(roundClipIds([lib('v1', 'a')], clips, () => 0.99).clipIds).toEqual(['c2']);
  });

  it('a wish already in the library plays its video’s clips', () => {
    const wish: SongLike = { ...base, wish_id: 'w', wish: { youtube_id: 'x', added_video_id: 'v2' } };
    expect(roundClipIds([wish], clips, () => 0)).toEqual({ clipIds: ['c3'], skipped: 0 });
  });
});

describe('cutChars', () => {
  it('counts code points like Postgres and never splits an emoji', () => {
    expect(cutChars('abc', 5)).toBe('abc');
    expect(cutChars('ab🎤cd', 3)).toBe('ab🎤');
    const long = `${'a'.repeat(199)}🎤🎤`;
    const cut = cutChars(long, 200);
    expect(Array.from(cut)).toHaveLength(200);
    expect(cut.endsWith('🎤')).toBe(true);
    expect(/[\uD800-\uDBFF]$/.test(cut)).toBe(false);
  });

  it('cuts a title of emojis within the database limit, with no lone surrogate', () => {
    const row = youtubeSongRow({ youtubeId: 'dQw4w9WgXcQ', title: '💃'.repeat(250) })!;
    expect(Array.from(row.title)).toHaveLength(200);
    expect(row.title).toBe('💃'.repeat(200));
  });
});
