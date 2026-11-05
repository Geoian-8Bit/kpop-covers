// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  domNeedsExtraFonts,
  isDeferredCodePoint,
  needsExtraFonts,
  watchForExtraFonts,
} from './needsExtraFonts';

const css = (name: string) => readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), 'utf8');
const rangesOf = (source: string): [number, number][] => {
  const out: [number, number][] = [];
  for (const m of source.matchAll(/unicode-range:([^;]*);/g))
    for (const part of m[1]!.split(',')) {
      const [a, b] = part.trim().replace('U+', '').split('-');
      out.push([parseInt(a!, 16), parseInt(b ?? a!, 16)]);
    }
  return out;
};

describe('needsExtraFonts · tables against the real stylesheets', () => {
  it('no code point declared by fonts.css is deferred', () => {
    for (const [from, to] of rangesOf(css('fonts.css')))
      for (let cp = from; cp <= to; cp++)
        if (isDeferredCodePoint(cp)) throw new Error(`U+${cp.toString(16)}`);
  });

  it('every code point fonts-ja.css declares and fonts.css does not is deferred', () => {
    const covered = rangesOf(css('fonts.css'));
    const inCovered = (cp: number) => covered.some(([a, b]) => cp >= a && cp <= b);
    const missed: string[] = [];
    for (const [from, to] of rangesOf(css('fonts-ja.css')))
      for (let cp = from; cp <= to; cp++)
        if (!inCovered(cp) && !isDeferredCodePoint(cp)) missed.push(cp.toString(16));
    expect(missed).toEqual([]);
  });
});

describe('needsExtraFonts', () => {
  it('is false for latin text, accents and the UI kanji', () => {
    expect(needsExtraFonts('Biblioteca · Ensayo — canción €5 ñ ü')).toBe(false);
    expect(needsExtraFonts('人今作')).toBe(false);
  });

  it('is true for kanji outside the subset, kana, cyrillic, greek, vietnamese, symbols and astral kanji', () => {
    for (const text of ['踊', 'ありがとう', 'カタカナ', 'Привет', 'Ελλάδα', 'ệ', '♪', '𠮷', 'ＡＢ']) {
      expect(needsExtraFonts(text), text).toBe(true);
    }
  });

  it('ignores emoji (no slice for them)', () => {
    expect(needsExtraFonts('🎵 💃')).toBe(false);
  });
});

describe('domNeedsExtraFonts / watchForExtraFonts', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  const add = (textContent: string, parent: Element = document.body) =>
    parent.append(Object.assign(document.createElement('p'), { textContent }));

  it('reads text nodes and skips scripts and styles', () => {
    document.body.innerHTML = '<p>Hola</p><style>.a{content:"あ"}</style>';
    expect(domNeedsExtraFonts(document.body)).toBe(false);
    document.body.innerHTML += '<p>こんにちは</p>';
    expect(domNeedsExtraFonts(document.body)).toBe(true);
  });

  it('reads what is typed in a field and its placeholder, but not a password', () => {
    document.body.innerHTML = '<input value="Hola"><textarea placeholder="Notas"></textarea>';
    expect(domNeedsExtraFonts(document.body)).toBe(false);
    document.body.innerHTML = '<input placeholder="名前を入力">';
    expect(domNeedsExtraFonts(document.body)).toBe(true);
    document.body.innerHTML = '<textarea></textarea>';
    document.querySelector('textarea')!.value = 'ダンス';
    expect(domNeedsExtraFonts(document.body)).toBe(true);
    document.body.innerHTML = '<input type="password" value="ありがとう">';
    expect(domNeedsExtraFonts(document.body)).toBe(false);
  });

  it('calls back once, after a debounced change that brings such text', async () => {
    vi.useFakeTimers();
    const onNeeded = vi.fn();
    watchForExtraFonts(document.body, onNeeded, { debounceMs: 10 });
    add('Hola');
    await vi.advanceTimersByTimeAsync(30);
    expect(onNeeded).not.toHaveBeenCalled();
    add('ダンス');
    await vi.advanceTimersByTimeAsync(30);
    expect(onNeeded).toHaveBeenCalledTimes(1);
    add('ダンス');
    await vi.advanceTimersByTimeAsync(50);
    expect(onNeeded).toHaveBeenCalledTimes(1);
  });

  it('sees a portal outside #root (dialogs, toasts, review)', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="root"><p>Hola</p></div>';
    const onNeeded = vi.fn();
    watchForExtraFonts(document.body, onNeeded, { debounceMs: 10 });
    const portal = document.createElement('div');
    portal.setAttribute('role', 'dialog');
    document.body.append(portal);
    add('ありがとう', portal);
    await vi.advanceTimersByTimeAsync(30);
    expect(onNeeded).toHaveBeenCalledTimes(1);
  });

  it('scans what is already on screen when it starts', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<input value="カタカナ">';
    const onNeeded = vi.fn();
    watchForExtraFonts(document.body, onNeeded, { debounceMs: 10 });
    await vi.advanceTimersByTimeAsync(30);
    expect(onNeeded).toHaveBeenCalledTimes(1);
  });

  it('notices typing (no DOM change) and a placeholder change, and stops listening after cancel', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<input>';
    const field = document.querySelector('input')!;
    const onNeeded = vi.fn();
    const stop = watchForExtraFonts(document.body, onNeeded, { debounceMs: 10 });
    await vi.advanceTimersByTimeAsync(30);
    field.value = 'Привет';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(30);
    expect(onNeeded).toHaveBeenCalledTimes(1);

    const check = vi.fn(() => false);
    const stop2 = watchForExtraFonts(document.body, onNeeded, { debounceMs: 10, check });
    await vi.advanceTimersByTimeAsync(30);
    check.mockClear();
    field.setAttribute('placeholder', 'x');
    await vi.advanceTimersByTimeAsync(30);
    expect(check).toHaveBeenCalledTimes(1);
    stop2();
    stop();
    check.mockClear();
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.setAttribute('placeholder', 'y');
    await vi.advanceTimersByTimeAsync(30);
    expect(check).not.toHaveBeenCalled();
  });
});
