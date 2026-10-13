import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration, formatTime, parseTime } from './time';

describe('formatTime', () => {
  it('formats minutes and seconds', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(65.3)).toBe('1:05');
    expect(formatTime(3723)).toBe('1:02:03');
  });

  it('adds tenths on demand', () => {
    expect(formatTime(65.37, { tenths: true })).toBe('1:05.3');
    expect(formatTime(0.1, { tenths: true })).toBe('0:00.1');
  });

  it('guards against invalid input', () => {
    expect(formatTime(Number.NaN)).toBe('0:00');
    expect(formatTime(-4)).toBe('0:00');
  });
});

describe('parseTime', () => {
  it('parses seconds and clock formats', () => {
    expect(parseTime('75')).toBe(75);
    expect(parseTime('75.5')).toBe(75.5);
    expect(parseTime('1:15')).toBe(75);
    expect(parseTime('1:15,5')).toBe(75.5);
    expect(parseTime('1:01:15')).toBe(3675);
  });

  it('rejects malformed values', () => {
    expect(parseTime('')).toBeNull();
    expect(parseTime('abc')).toBeNull();
    expect(parseTime('1:75')).toBeNull();
    expect(parseTime('1:2:3:4')).toBeNull();
  });
});

describe('formatDuration / formatBytes', () => {
  it('formats durations', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(212)).toBe('3:32');
  });

  it('formats bytes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(48 * 1024 * 1024)).toBe('48 MB');
  });

  it('carries a value that would round to 1024 into the next unit', () => {
    expect(formatBytes(1024 * 1024 - 1)).toBe('1 MB');
    expect(formatBytes(1024 * 1024 - 300)).toBe('1 MB');
    expect(formatBytes(1023 * 1024)).toBe('1023 KB');
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
    expect(formatBytes(1024 * 1024 * 1024 - 1)).toBe('1 GB');
  });
});
