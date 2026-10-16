import { describe, expect, it } from 'vitest';
import {
  durationMismatch,
  fileTime,
  nudgeOffset,
  offsetFromMarks,
  similarTitles,
  titleLikeness,
  titleWords,
  videoTime,
} from './linking';

describe('offset between the YouTube video and its file', () => {
  it('maps both ways', () => {
    expect(fileTime(10, 1.5)).toBe(11.5);
    expect(videoTime(11.5, 1.5)).toBe(10);
    expect(fileTime(10, null)).toBe(10);
    expect(videoTime(3, -2)).toBe(5);
  });

  it('comes from one moment marked in each player, to the millisecond', () => {
    expect(offsetFromMarks(12.3456, 10.1)).toBe(2.246);
    expect(offsetFromMarks(4, 6.5)).toBe(-2.5);
  });

  it('nudges in small steps within ±1 h', () => {
    expect(nudgeOffset(1.2, 0.05)).toBe(1.25);
    expect(nudgeOffset(3599.99, 1)).toBe(3600);
    expect(nudgeOffset(-3599.99, -1)).toBe(-3600);
  });
});

describe('durationMismatch', () => {
  it('warns past 1 s of difference', () => {
    expect(durationMismatch(200, 200.8)).toBe(false);
    expect(durationMismatch(200, 201.5)).toBe(true);
    expect(durationMismatch(200, 180)).toBe(true);
  });

  it('cannot compare unknown lengths', () => {
    expect(durationMismatch(null, 200)).toBe(false);
    expect(durationMismatch(200, 0)).toBe(false);
  });
});

describe('similar titles', () => {
  it('drops noise words, accents and extensions', () => {
    expect(titleWords('NewJeans (뉴진스) "Hype Boy" Dance Practice [MIRRORED].mp4')).toEqual([
      'newjeans',
      '뉴진스',
      'hype',
      'boy',
    ]);
    expect(titleWords('Canción de ÉXITO')).toEqual(['cancion', 'exito']);
  });

  it('scores shared words over the shorter title', () => {
    expect(titleLikeness('hype boy', 'NewJeans Hype Boy Official MV')).toBe(1);
    expect(titleLikeness('Supernova', 'Hype Boy')).toBe(0);
  });

  it('suggests library entries for a file name, best first', () => {
    const library = [
      { id: 1, title: 'Hype Boy', artist: 'NewJeans' },
      { id: 2, title: 'Supernova', artist: 'aespa' },
      { id: 3, title: 'Super Shy', artist: 'NewJeans' },
    ];
    expect(similarTitles('newjeans-hype-boy-dance-practice-mirrored.mp4', library).map((e) => e.id)).toEqual([1]);
    expect(similarTitles('aespa supernova.mp4', library).map((e) => e.id)).toEqual([2]);
    expect(similarTitles('video123.mp4', library)).toEqual([]);
  });
});
