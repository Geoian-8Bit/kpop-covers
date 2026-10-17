import { lazy } from 'react';
import { describe, expect, it } from 'vitest';
import {
  getDesignVariant,
  parseChoices,
  readChoices,
  registryProblems,
  resolveVariant,
  sanitizeChoices,
  setVariant,
  STORAGE_KEY,
  writeChoices,
} from './labState';
import { MOMENTS } from './registry';
import type { LabMoment } from './types';

const Demo = lazy(async () => ({ default: () => null }));

const moments: LabMoment[] = [
  {
    id: 'nav',
    code: 'P1',
    name: 'Menú',
    description: '',
    defaultVariant: 'sensu',
    appliesLive: true,
    variants: [
      { id: 'sensu', label: 'Sensu', description: '', Demo },
      { id: 'kamon', label: 'Kamon', description: '', Demo },
    ],
  },
  {
    id: 'wave',
    code: 'F17',
    name: 'Ola',
    description: '',
    defaultVariant: 'a',
    variants: [
      { id: 'a', label: 'A', description: '', Demo },
      { id: 'b', label: 'B', description: '', Demo },
    ],
  },
];

describe('sanitizeChoices', () => {
  it('turns anything that is not a plain record into no choices', () => {
    for (const raw of [null, undefined, 'x', 3, true, [], ['sensu']]) {
      expect(sanitizeChoices(raw, moments)).toEqual({});
    }
  });

  it('keeps valid choices', () => {
    expect(sanitizeChoices({ nav: 'kamon', wave: 'b' }, moments)).toEqual({ nav: 'kamon', wave: 'b' });
  });

  it('drops unknown moments, unknown variants, non-strings and inherited keys', () => {
    const raw = Object.assign(Object.create({ nav: 'kamon' }) as object, { wave: 7, gone: 'a', other: 'sensu' });
    expect(sanitizeChoices(raw, moments)).toEqual({});
    expect(sanitizeChoices({ nav: 'neon' }, moments)).toEqual({});
  });

  it('does not accept a variant that belongs to another moment', () => {
    expect(sanitizeChoices({ nav: 'b' }, moments)).toEqual({});
  });
});

describe('parseChoices', () => {
  it('reads stored JSON and survives garbage', () => {
    expect(parseChoices(null, moments)).toEqual({});
    expect(parseChoices(undefined, moments)).toEqual({});
    expect(parseChoices('{not json', moments)).toEqual({});
    expect(parseChoices('{"nav":"kamon","wave":"zzz"}', moments)).toEqual({ nav: 'kamon' });
  });
});

describe('resolveVariant', () => {
  it('uses the saved choice', () => {
    expect(resolveVariant({ nav: 'kamon' }, moments, 'nav')).toBe('kamon');
  });

  it('falls back to the default without a choice or with an invalid one', () => {
    expect(resolveVariant({}, moments, 'wave')).toBe('a');
    expect(resolveVariant({ wave: 'neon' }, moments, 'wave')).toBe('a');
  });

  it('returns undefined for a moment outside the registry', () => {
    expect(resolveVariant({}, moments, 'nope')).toBeUndefined();
  });
});

describe('storage', () => {
  it('reads from a storage that is missing or throws', () => {
    expect(readChoices(undefined, moments)).toEqual({});
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readChoices(throwing, moments)).toEqual({});
  });

  it('writes and reads back under its key', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    expect(writeChoices(storage, { nav: 'kamon' })).toBe(true);
    expect(data.has(STORAGE_KEY)).toBe(true);
    expect(readChoices(storage, moments)).toEqual({ nav: 'kamon' });
  });

  it('reports a refused write', () => {
    expect(writeChoices(undefined, {})).toBe(false);
    const full = {
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(writeChoices(full, { nav: 'kamon' })).toBe(false);
  });
});

describe('store (no localStorage in tests)', () => {
  it('applies a known choice in memory and ignores unknown ones', () => {
    expect(getDesignVariant('nav')).toBe('sensu');
    setVariant('nav', 'kamon');
    expect(getDesignVariant('nav')).toBe('kamon');
    setVariant('nav', 'neon');
    expect(getDesignVariant('nav')).toBe('kamon');
    setVariant('nav', 'sensu');
    expect(getDesignVariant('nope')).toBe('');
  });
});

describe('MOMENTS registry', () => {
  it('is consistent', () => {
    expect(registryProblems(MOMENTS)).toEqual([]);
  });

  it('flags broken entries', () => {
    const broken = [
      { id: 'a', defaultVariant: 'z', variants: [{ id: 'x' }, { id: 'x' }] },
      { id: 'a', defaultVariant: 'x', variants: [] },
    ];
    expect(registryProblems(broken)).toEqual([
      'a: variantes repetidas',
      'a: la variante por defecto no existe',
      'momento repetido: a',
      'a: sin variantes',
      'a: la variante por defecto no existe',
    ]);
  });

  it('has the four quick-menu prototypes, applied live', () => {
    const nav = MOMENTS.find((m) => m.id === 'nav');
    expect(nav?.appliesLive).toBe(true);
    expect(nav?.variants.map((v) => v.id)).toEqual(['sensu', 'hanafuda', 'kamon', 'origami']);
  });
});
