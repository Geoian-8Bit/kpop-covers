import { describe, expect, it } from 'vitest';
import {
  declaredBytes,
  formatMegabytes,
  remoteWaveAllowed,
  remoteWaveOffer,
  waveByteLimit,
  waveChipCopy,
  waveDownloadLabel,
} from './studioWaveRules';

const MB = 1024 * 1024;

describe('waveByteLimit', () => {
  it('reads up to 60 MB, or 30 MB on a phone with little memory', () => {
    expect(waveByteLimit(8)).toBe(60 * MB);
    expect(waveByteLimit(4)).toBe(30 * MB);
    expect(waveByteLimit(2)).toBe(30 * MB);
    expect(waveByteLimit(0.5)).toBe(30 * MB);
  });

  it('uses 60 MB when the browser does not say', () => {
    expect(waveByteLimit(undefined)).toBe(60 * MB);
    expect(waveByteLimit(null)).toBe(60 * MB);
    expect(waveByteLimit(0)).toBe(60 * MB);
  });
});

describe('remoteWaveAllowed', () => {
  it('never with «ahorro de datos», not even on wifi', () => {
    expect(remoteWaveAllowed({ saveData: true, type: 'wifi' }, false)).toBe(false);
  });

  it('on wifi or cable, also on a touch screen', () => {
    expect(remoteWaveAllowed({ type: 'wifi' }, true)).toBe(true);
    expect(remoteWaveAllowed({ type: 'ethernet' }, true)).toBe(true);
  });

  it('not on mobile data or another known link', () => {
    expect(remoteWaveAllowed({ type: 'cellular' }, false)).toBe(false);
    expect(remoteWaveAllowed({ type: 'bluetooth' }, false)).toBe(false);
    expect(remoteWaveAllowed({ type: 'none' }, false)).toBe(false);
  });

  it('when the link is unknown: a computer yes, a touch screen no', () => {
    expect(remoteWaveAllowed(undefined, false)).toBe(true);
    expect(remoteWaveAllowed({ type: 'unknown' }, false)).toBe(true);
    expect(remoteWaveAllowed(undefined, true)).toBe(false);
    expect(remoteWaveAllowed({}, true)).toBe(false);
  });
});

describe('declaredBytes', () => {
  it('reads a plain Content-Length', () => {
    expect(declaredBytes('1048576')).toBe(MB);
    expect(declaredBytes(' 42 ')).toBe(42);
  });

  it('null when missing, empty, zero or not a number', () => {
    expect(declaredBytes(null)).toBeNull();
    expect(declaredBytes(undefined)).toBeNull();
    expect(declaredBytes('')).toBeNull();
    expect(declaredBytes('0')).toBeNull();
    expect(declaredBytes('-5')).toBeNull();
    expect(declaredBytes('12.5')).toBeNull();
    expect(declaredBytes('abc')).toBeNull();
  });
});

describe('remoteWaveOffer', () => {
  const limit = 30 * MB;

  it('asks with the size when it fits the limit', () => {
    expect(remoteWaveOffer(12 * MB, limit)).toEqual({ kind: 'ask', bytes: 12 * MB });
    expect(remoteWaveOffer(limit, limit)).toEqual({ kind: 'ask', bytes: limit });
  });

  it('asks without a size when the server does not say', () => {
    expect(remoteWaveOffer(null, limit)).toEqual({ kind: 'ask', bytes: null });
    expect(remoteWaveOffer(undefined, limit)).toEqual({ kind: 'ask', bytes: null });
    expect(remoteWaveOffer(0, limit)).toEqual({ kind: 'ask', bytes: null });
  });

  it('does not offer a file known to be past the limit', () => {
    expect(remoteWaveOffer(limit + 1, limit)).toEqual({ kind: 'too-big' });
    expect(remoteWaveOffer(45 * MB, waveByteLimit(4))).toEqual({ kind: 'too-big' });
    expect(remoteWaveOffer(45 * MB, waveByteLimit(8))).toEqual({ kind: 'ask', bytes: 45 * MB });
  });
});

describe('waveDownloadLabel', () => {
  it('says how much it downloads', () => {
    expect(waveDownloadLabel(4.2 * MB)).toBe('Dibujar la ola (descarga 4,2 MB)');
    expect(waveDownloadLabel(23.4 * MB)).toBe('Dibujar la ola (descarga 23 MB)');
    expect(waveDownloadLabel(10 * MB)).toBe('Dibujar la ola (descarga 10 MB)');
  });

  it('never says 0 MB, nor «10,0 MB»', () => {
    expect(formatMegabytes(1000)).toBe('0,1 MB');
    expect(formatMegabytes(9.97 * MB)).toBe('10 MB');
  });

  it('without a known size, still says it downloads', () => {
    expect(waveDownloadLabel(null)).toBe('Dibujar la ola (descarga el audio)');
  });
});

describe('waveChipCopy', () => {
  it('says it is reading, and nothing once drawn or while the button asks', () => {
    expect(waveChipCopy('loading')).toBe('Leyendo el audio…');
    expect(waveChipCopy('ready')).toBeNull();
    expect(waveChipCopy('ask')).toBeNull();
  });

  it('says why it is the sample shape when the file is too big', () => {
    expect(waveChipCopy('too-big')).toBe('Forma de ejemplo · archivo muy grande');
    expect(waveChipCopy('failed')).toBe('Forma de ejemplo');
    expect(waveChipCopy('none')).toBe('Forma de ejemplo');
  });
});
