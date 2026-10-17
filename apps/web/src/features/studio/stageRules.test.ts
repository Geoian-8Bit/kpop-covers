import { describe, expect, it } from 'vitest';
import { groupCopyLabel, initialStage, needsLocalCheck, playsGroupCopy } from './stageRules';

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

describe('playsGroupCopy', () => {
  const limit = 50 * 1024 * 1024;
  it('is the copy when the cloud file stands for an original too big for the cloud', () => {
    expect(playsGroupCopy({ fromCloud: true, originalBytes: limit * 3, limitBytes: limit })).toBe(true);
  });
  it('is the original when it fits the cloud, or when this device plays its own file', () => {
    expect(playsGroupCopy({ fromCloud: true, originalBytes: limit, limitBytes: limit })).toBe(false);
    expect(playsGroupCopy({ fromCloud: false, originalBytes: limit * 3, limitBytes: limit })).toBe(false);
    expect(playsGroupCopy({ fromCloud: true, originalBytes: null, limitBytes: limit })).toBe(false);
  });
});

describe('groupCopyLabel', () => {
  it('names the picture by its short side', () => {
    expect(groupCopyLabel({ width: 1280, height: 720 })).toBe('Copia del grupo · 720p');
    expect(groupCopyLabel({ width: 1080, height: 1920 })).toBe('Copia del grupo · 1080p');
  });
  it('says only that it is the copy until the size is known', () => {
    expect(groupCopyLabel(null)).toBe('Copia del grupo');
    expect(groupCopyLabel({ width: 0, height: 0 })).toBe('Copia del grupo');
  });
});
