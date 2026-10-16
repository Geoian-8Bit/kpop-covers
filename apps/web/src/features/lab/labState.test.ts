import { describe, expect, it } from 'vitest';
import { MOMENTS } from './designLab';
import { DEMOS } from './demos';
import { parseLab, registryProblems, resolveVariant, sanitizeLab, type DesignMoment } from './labState';

const moments: readonly DesignMoment[] = [
  {
    id: 'record-settings',
    name: 'Panel',
    description: '',
    defaultVariant: 'tray',
    variants: [
      { id: 'tray', label: 'Bandeja', description: '' },
      { id: 'fan', label: 'Abanico', description: '' },
    ],
  },
  {
    id: 'bag-draw',
    name: 'Bolsa',
    description: '',
    defaultVariant: 'pouch',
    variants: [
      { id: 'pouch', label: 'Bolsa', description: '' },
      { id: 'box', label: 'Caja', description: '' },
    ],
  },
];

describe('sanitizeLab', () => {
  it('turns anything that is not an object into the empty lab', () => {
    for (const raw of [null, undefined, 'x', 3, true, [], ['fan']]) {
      expect(sanitizeLab(raw, moments)).toEqual({ enabled: false, choices: {} });
    }
  });

  it('keeps a valid state as is', () => {
    const state = { enabled: true, choices: { 'record-settings': 'fan', 'bag-draw': 'box' } };
    expect(sanitizeLab(state, moments)).toEqual(state);
  });

  it('only accepts enabled === true', () => {
    expect(sanitizeLab({ enabled: 'true' }, moments).enabled).toBe(false);
    expect(sanitizeLab({ enabled: 1 }, moments).enabled).toBe(false);
    expect(sanitizeLab({ enabled: true }, moments).enabled).toBe(true);
  });

  it('drops unknown moments, unknown variants and non-string values', () => {
    const raw = {
      enabled: true,
      choices: { 'record-settings': 'neon', 'bag-draw': 7, 'gone-moment': 'fan', __proto__: { x: 1 } },
    };
    expect(sanitizeLab(raw, moments)).toEqual({ enabled: true, choices: {} });
  });

  it('does not accept a variant that belongs to another moment', () => {
    expect(sanitizeLab({ choices: { 'record-settings': 'box' } }, moments).choices).toEqual({});
  });

  it('ignores choices that are not a plain record', () => {
    expect(sanitizeLab({ enabled: true, choices: ['fan'] }, moments).choices).toEqual({});
    expect(sanitizeLab({ enabled: true, choices: 'fan' }, moments).choices).toEqual({});
  });
});

describe('parseLab', () => {
  it('reads stored JSON and survives garbage', () => {
    expect(parseLab(null, moments)).toEqual({ enabled: false, choices: {} });
    expect(parseLab('{not json', moments)).toEqual({ enabled: false, choices: {} });
    expect(parseLab('{"enabled":true,"choices":{"record-settings":"fan"}}', moments)).toEqual({
      enabled: true,
      choices: { 'record-settings': 'fan' },
    });
  });
});

describe('resolveVariant', () => {
  it('uses the saved choice while the lab is on', () => {
    expect(
      resolveVariant({ enabled: true, choices: { 'record-settings': 'fan' } }, moments, 'record-settings'),
    ).toBe('fan');
  });

  it('keeps the saved choice while the lab is hidden (the lab is only where it is chosen)', () => {
    expect(
      resolveVariant({ enabled: false, choices: { 'record-settings': 'fan' } }, moments, 'record-settings'),
    ).toBe('fan');
  });

  it('falls back to the default without a choice or with an invalid one', () => {
    expect(resolveVariant({ enabled: true, choices: {} }, moments, 'bag-draw')).toBe('pouch');
    expect(resolveVariant({ enabled: true, choices: { 'bag-draw': 'neon' } }, moments, 'bag-draw')).toBe(
      'pouch',
    );
  });

  it('returns undefined for a moment outside the registry', () => {
    expect(resolveVariant({ enabled: true, choices: {} }, moments, 'nope')).toBeUndefined();
  });
});

describe('MOMENTS registry', () => {
  it('is consistent', () => {
    expect(registryProblems(MOMENTS)).toEqual([]);
  });

  it('flags broken entries', () => {
    const broken: DesignMoment[] = [
      {
        id: 'a',
        name: '',
        description: '',
        defaultVariant: 'z',
        variants: [{ id: 'x', label: '', description: '' }],
      },
      { id: 'a', name: '', description: '', defaultVariant: 'x', variants: [] },
    ];
    expect(registryProblems(broken)).toHaveLength(4);
  });

  it('has a demo for every moment', () => {
    expect(Object.keys(DEMOS).sort()).toEqual(MOMENTS.map((m) => m.id).sort());
  });

  it('recommends «tray» for the recorder settings panel', () => {
    expect(resolveVariant({ enabled: false, choices: {} }, MOMENTS, 'record-settings')).toBe('tray');
  });

  it('recommends «onda» for separating voice and music (F17)', () => {
    expect(resolveVariant({ enabled: false, choices: {} }, MOMENTS, 'voice-split')).toBe('onda');
  });

  it('recommends «biombo» for comparing a take with the original (F5)', () => {
    expect(resolveVariant({ enabled: false, choices: {} }, MOMENTS, 'review-compare')).toBe('biombo');
  });

  it('recommends «omikuji» for drawing from a bag (F13) and «marquesina» for the Random Play Dance screen (F14)', () => {
    expect(resolveVariant({ enabled: false, choices: {} }, MOMENTS, 'bag-draw')).toBe('omikuji');
    expect(resolveVariant({ enabled: false, choices: {} }, MOMENTS, 'random-play')).toBe('marquesina');
  });

  it('recommends «hanabi» for revealing the winner of a vote (F11)', () => {
    expect(resolveVariant({ enabled: false, choices: {} }, MOMENTS, 'vote-reveal')).toBe('hanabi');
  });

  it('recommends «koyomi» for the event countdown (F16) and «hanko» for reactions (F15)', () => {
    expect(resolveVariant({ enabled: false, choices: {} }, MOMENTS, 'event-countdown')).toBe('koyomi');
    expect(resolveVariant({ enabled: false, choices: {} }, MOMENTS, 'reactions')).toBe('hanko');
  });
});
