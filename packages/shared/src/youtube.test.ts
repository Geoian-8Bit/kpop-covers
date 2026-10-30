import { describe, expect, it } from 'vitest';
import {
  isVerticalAspect,
  isYouTubeShortsUrl,
  parseYouTubeId,
  parseYouTubeStart,
  videoAspectRatio,
  withYouTubeThumbQuality,
  youTubeThumbnail,
  youTubeWatchUrl,
} from './youtube';

describe('parseYouTubeId', () => {
  it.each([
    ['dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PL123', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://music.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc', 'dQw4w9WgXcQ'],
    ['youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ?start=10', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['  https://youtu.be/dQw4w9WgXcQ  ', 'dQw4w9WgXcQ'],
  ])('parses %s', (input, expected) => {
    expect(parseYouTubeId(input)).toBe(expected);
  });

  it.each([
    '',
    'hello world',
    'https://vimeo.com/123456',
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/channel/UC123',
    'https://evil.com/watch?v=dQw4w9WgXcQ',
  ])('rejects %s', (input) => {
    expect(parseYouTubeId(input)).toBeNull();
  });

  it.each(['NewJeansOMG', 'TWICE-FANCY', 'blackpinkxx', 'LESSERAFIMS', 'aespa_drama'])(
    'treats the 11-character word %s as a search, not an id',
    (input) => {
      expect(parseYouTubeId(input)).toBeNull();
    },
  );

  it.each(['dQw4w9WgXcQ', 'aBcDeFgHi-J', 'xY_zzzzzzzz', '12345678901'])('accepts the bare id %s', (input) => {
    expect(parseYouTubeId(input)).toBe(input);
  });

  it('still accepts an id without digits when pasted as a link', () => {
    expect(parseYouTubeId('https://youtu.be/NewJeansOMG')).toBe('NewJeansOMG');
  });
});

describe('parseYouTubeStart', () => {
  it('reads seconds and h/m/s forms', () => {
    expect(parseYouTubeStart('https://youtu.be/dQw4w9WgXcQ?t=90')).toBe(90);
    expect(parseYouTubeStart('https://youtu.be/dQw4w9WgXcQ?t=1m30s')).toBe(90);
    expect(parseYouTubeStart('https://youtu.be/dQw4w9WgXcQ?t=1h2m3s')).toBe(3723);
    expect(parseYouTubeStart('https://www.youtube.com/embed/dQw4w9WgXcQ?start=12')).toBe(12);
  });

  it('returns null without an offset', () => {
    expect(parseYouTubeStart('https://youtu.be/dQw4w9WgXcQ')).toBeNull();
    expect(parseYouTubeStart('https://youtu.be/dQw4w9WgXcQ?t=abc')).toBeNull();
  });
});

describe('url builders', () => {
  it('builds thumbnail and watch urls', () => {
    expect(youTubeThumbnail('dQw4w9WgXcQ')).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    expect(youTubeWatchUrl('dQw4w9WgXcQ', 61.7)).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=61s');
    expect(youTubeWatchUrl('dQw4w9WgXcQ')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('resizes a stored YouTube thumbnail and leaves other urls alone', () => {
    expect(withYouTubeThumbQuality(youTubeThumbnail('dQw4w9WgXcQ'), 'mqdefault')).toBe(
      'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
    );
    expect(withYouTubeThumbQuality('https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg', 'mqdefault')).toBe(
      'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
    );
    const poster = 'data:image/webp;base64,AAAA';
    expect(withYouTubeThumbQuality(poster, 'mqdefault')).toBe(poster);
    const other = 'https://example.com/vi/dQw4w9WgXcQ/hqdefault.jpg';
    expect(withYouTubeThumbQuality(other, 'mqdefault')).toBe(other);
  });
});

describe('video aspect ratio', () => {
  it('detects Shorts links only', () => {
    expect(isYouTubeShortsUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(true);
    expect(isYouTubeShortsUrl('youtube.com/shorts/dQw4w9WgXcQ?feature=share')).toBe(true);
    expect(isYouTubeShortsUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(false);
    expect(isYouTubeShortsUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(false);
    expect(isYouTubeShortsUrl('')).toBe(false);
  });

  it('prefers the oEmbed size, then Shorts, then unknown', () => {
    expect(videoAspectRatio({ width: 200, height: 113 })).toBeCloseTo(1.7699, 3);
    expect(videoAspectRatio({ width: 113, height: 200 })).toBeCloseTo(0.565, 3);
    expect(videoAspectRatio({ url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ' })).toBe(9 / 16);
    expect(videoAspectRatio({ width: 0, height: 0, url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ' })).toBe(9 / 16);
    expect(videoAspectRatio({ width: 200, height: 113, url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ' })).toBeCloseTo(
      1.7699,
      3,
    );
    expect(videoAspectRatio({ url: 'https://youtu.be/dQw4w9WgXcQ' })).toBeNull();
    expect(videoAspectRatio({ width: 'x', height: null })).toBeNull();
    expect(videoAspectRatio({ width: 1, height: 100 })).toBeNull();
  });

  it('only a ratio under 1 is vertical', () => {
    expect(isVerticalAspect(9 / 16)).toBe(true);
    expect(isVerticalAspect(1)).toBe(false);
    expect(isVerticalAspect(16 / 9)).toBe(false);
    expect(isVerticalAspect(null)).toBe(false);
    expect(isVerticalAspect(undefined)).toBe(false);
    expect(isVerticalAspect(Number.NaN)).toBe(false);
  });
});
