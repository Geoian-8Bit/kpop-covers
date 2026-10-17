import { describe, expect, it } from 'vitest';
import { needsMove, triggerOf } from './overlayPlacement';

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

describe('triggerOf (global review 2 [3])', () => {
  it('the stage gaining or losing data-fs counts as a fullscreen change', () => {
    expect(triggerOf([{ type: 'childList' }, { type: 'attributes', attributeName: 'data-fs' }])).toBe('fullscreen');
    expect(triggerOf([{ type: 'childList' }])).toBe('mutation');
    expect(triggerOf([{ type: 'attributes', attributeName: 'class' }])).toBe('mutation');
  });

  it('leaving native fullscreen: once data-fs is gone, the dialog inside the stage goes back to the page', () => {
    // fullscreenchange came first, while the stage was still marked: the host was still the stage, nothing moved.
    expect(needsMove('fullscreen', { parent: stage, connected: true }, stage)).toBe(false);
    // Then React removes data-fs: the host is the page again, and the attribute change moves the dialog there.
    const trigger = triggerOf([{ type: 'attributes', attributeName: 'data-fs' }]);
    expect(needsMove(trigger, { parent: stage, connected: true }, body)).toBe(true);
  });
});
