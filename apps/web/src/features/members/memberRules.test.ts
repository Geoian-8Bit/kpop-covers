import { describe, expect, it } from 'vitest';
import { isVanishedMe, memberNameError } from './memberRules';

const members = [
  { id: 'a', name: 'Aoi' },
  { id: 'b', name: 'Bora ' },
];

describe('memberNameError', () => {
  it('rejects an empty or blank name', () => {
    expect(memberNameError('', members)).toBe('Escribe un nombre.');
    expect(memberNameError('   ', members)).toBe('Escribe un nombre.');
  });

  it('rejects a name another member has, ignoring case and spaces', () => {
    expect(memberNameError('aoi', members)).toBe('Ya hay alguien con ese nombre en el grupo.');
    expect(memberNameError('  BORA', members)).toBe('Ya hay alguien con ese nombre en el grupo.');
    expect(memberNameError('Aoi', members, 'b')).toBe('Ya hay alguien con ese nombre en el grupo.');
  });

  it('lets a member keep or re-case their own name, and accepts new ones', () => {
    expect(memberNameError('AOI', members, 'a')).toBeNull();
    expect(memberNameError('Chae', members)).toBeNull();
    expect(memberNameError('Chae', undefined)).toBeNull();
  });
});

describe('isVanishedMe', () => {
  it('is true only when the loaded list lacks this device’s member', () => {
    expect(isVanishedMe('x', members)).toBe(true);
    expect(isVanishedMe('a', members)).toBe(false);
    expect(isVanishedMe(null, members)).toBe(false);
    expect(isVanishedMe('x', undefined)).toBe(false);
    expect(isVanishedMe('x', [])).toBe(true);
  });
});
