import { describe, expect, it } from 'vitest';
import { parseYouTubeId, parseYouTubeStart, youTubeThumbnail, youTubeWatchUrl } from './youtube';

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
});
