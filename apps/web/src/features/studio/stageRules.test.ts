import { describe, expect, it } from 'vitest';
import { initialStage, needsLocalCheck } from './stageRules';

describe('initialStage', () => {
  it('opens YouTube when there is no linked file', () => {
    expect(initialStage({ linked: false, choice: 'file', reachable: true })).toBe('youtube');
  });

  it('opens the file by default when it can play here', () => {
    expect(initialStage({ linked: true, choice: null, reachable: true })).toBe('file');
  });

  it('opens YouTube when the file is not reachable on this device', () => {
    expect(initialStage({ linked: true, choice: null, reachable: false })).toBe('youtube');
    expect(initialStage({ linked: true, choice: 'file', reachable: false })).toBe('youtube');
  });

  it('keeps an explicit choice of YouTube', () => {
    expect(initialStage({ linked: true, choice: 'youtube', reachable: true })).toBe('youtube');
  });

  it('keeps an explicit choice of the file', () => {
    expect(initialStage({ linked: true, choice: 'file', reachable: true })).toBe('file');
  });
});

describe('needsLocalCheck', () => {
  it('only looks for a device copy when nothing else decides', () => {
    expect(needsLocalCheck({ linked: true, choice: null, inCloud: false })).toBe(true);
    expect(needsLocalCheck({ linked: true, choice: 'file', inCloud: false })).toBe(true);
    expect(needsLocalCheck({ linked: true, choice: null, inCloud: true })).toBe(false);
    expect(needsLocalCheck({ linked: true, choice: 'youtube', inCloud: false })).toBe(false);
    expect(needsLocalCheck({ linked: false, choice: null, inCloud: false })).toBe(false);
  });
});
