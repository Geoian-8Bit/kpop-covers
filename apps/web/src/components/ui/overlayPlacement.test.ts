import { describe, expect, it } from 'vitest';
import { needsMove } from './overlayPlacement';

const body = { name: 'body' };
const stage = { name: 'stage' };

describe('needsMove', () => {
  it('places a dialog that opens where overlays go now', () => {
    expect(needsMove('open', { parent: null, connected: false }, body)).toBe(true);
    expect(needsMove('open', { parent: stage, connected: true }, body)).toBe(true);
    expect(needsMove('open', { parent: body, connected: true }, body)).toBe(false);
  });

  it('moves it once when fullscreen is left or entered while it is open', () => {
    expect(needsMove('fullscreen', { parent: stage, connected: true }, body)).toBe(true);
    expect(needsMove('fullscreen', { parent: body, connected: true }, stage)).toBe(true);
    expect(needsMove('fullscreen', { parent: body, connected: true }, body)).toBe(false);
  });

  it('page changes never move a placed dialog, only one whose host was removed', () => {
    // A connected wrapper stays even if the host would be another now (e.g. the CSS fullscreen layer appeared).
    expect(needsMove('mutation', { parent: body, connected: true }, stage)).toBe(false);
    expect(needsMove('mutation', { parent: stage, connected: false }, body)).toBe(true);
  });
});
