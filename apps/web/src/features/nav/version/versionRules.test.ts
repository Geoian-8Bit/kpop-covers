import { describe, expect, it } from 'vitest';
import {
  decideUpdate,
  formatBuildDate,
  parseBuildNumber,
  parseVersionFile,
  reloadNeedsConfirm,
  resolveBuildNumber,
  updateMessage,
  versionLabel,
} from './versionRules';

describe('parseBuildNumber', () => {
  it('accepts positive whole numbers', () => {
    expect(parseBuildNumber('142')).toBe(142);
    expect(parseBuildNumber(' 143\n')).toBe(143);
    expect(parseBuildNumber(7)).toBe(7);
  });

  it('rejects everything else', () => {
    for (const raw of ['', '0', '-3', '1.5', '12a', 'abc', '1e3', 0, -1, 2.5, NaN, null, undefined, {}, '9999999999']) {
      expect(parseBuildNumber(raw)).toBeNull();
    }
  });
});

describe('resolveBuildNumber', () => {
  it('prefers the deploy number', () => {
    expect(resolveBuildNumber('150', () => '142')).toBe(150);
  });

  it('falls back to the git count', () => {
    expect(resolveBuildNumber(undefined, () => '142\n')).toBe(142);
    expect(resolveBuildNumber('not-a-number', () => '142')).toBe(142);
  });

  it('is null in a shallow clone (its count never grows), unless the deploy passes the number', () => {
    expect(resolveBuildNumber(undefined, () => '3', () => 'true\n')).toBeNull();
    expect(resolveBuildNumber('150', () => '3', () => 'true')).toBe(150);
    expect(resolveBuildNumber(undefined, () => '142', () => 'false\n')).toBe(142);
    expect(
      resolveBuildNumber(
        undefined,
        () => '142',
        () => {
          throw new Error('not a git repository');
        },
      ),
    ).toBeNull();
  });

  it('is null without either, also when git throws (no .git on the build machine)', () => {
    expect(resolveBuildNumber(undefined, () => null)).toBeNull();
    expect(
      resolveBuildNumber(undefined, () => {
        throw new Error('not a git repository');
      }),
    ).toBeNull();
  });
});

describe('formatBuildDate and versionLabel', () => {
  const builtAt = new Date(2026, 9, 17, 12, 30).toISOString();

  it('formats day-month-year', () => {
    expect(formatBuildDate(builtAt)).toBe('17-10-2026');
    expect(formatBuildDate(new Date(2026, 0, 5, 9).toISOString())).toBe('05-01-2026');
    expect(formatBuildDate('garbage')).toBeNull();
    expect(formatBuildDate(null)).toBeNull();
  });

  it('shows the number and the date', () => {
    expect(versionLabel(142, builtAt)).toBe('Versión 142 · 17-10-2026');
  });

  it('is honest without a number', () => {
    expect(versionLabel(null, builtAt)).toBe('Versión de desarrollo · 17-10-2026');
    expect(versionLabel(null, null)).toBe('Versión de desarrollo');
  });
});

describe('parseVersionFile', () => {
  it('reads the build number and date', () => {
    expect(parseVersionFile({ version: '143', builtAt: '2026-10-17T10:00:00.000Z' })).toEqual({
      version: 143,
      builtAt: '2026-10-17T10:00:00.000Z',
    });
    expect(parseVersionFile({ version: null })).toEqual({ version: null, builtAt: null });
  });

  it('rejects what is not an object', () => {
    expect(parseVersionFile(null)).toBeNull();
    expect(parseVersionFile('143')).toBeNull();
    expect(parseVersionFile([143])).toBeNull();
  });
});

describe('decideUpdate', () => {
  it('is the latest when the server serves the same build', () => {
    expect(decideUpdate({ current: 142, remote: 142, waiting: false })).toEqual({ kind: 'latest', version: 142 });
  });

  it('finds a newer build by its number', () => {
    expect(decideUpdate({ current: 142, remote: 143, waiting: false })).toEqual({ kind: 'newer', version: 143 });
  });

  it('applies a waiting service worker even without numbers or after a rollback', () => {
    expect(decideUpdate({ current: null, remote: null, waiting: true })).toEqual({ kind: 'newer', version: null });
    expect(decideUpdate({ current: 143, remote: 142, waiting: true })).toEqual({ kind: 'newer', version: 142 });
  });

  it('does not call a lower number on the server an update when nothing is waiting', () => {
    expect(decideUpdate({ current: 143, remote: 142, waiting: false })).toEqual({ kind: 'latest', version: 143 });
  });

  it('a service worker still installing is a new build on its way, with or without numbers', () => {
    expect(decideUpdate({ current: null, remote: null, waiting: false, installing: true })).toEqual({
      kind: 'newer',
      version: null,
    });
    expect(decideUpdate({ current: 142, remote: 142, waiting: false, installing: true })).toEqual({
      kind: 'newer',
      version: 142,
    });
  });

  it('without numbers and nothing waiting, it is the latest', () => {
    expect(decideUpdate({ current: null, remote: null, waiting: false })).toEqual({ kind: 'latest', version: null });
    expect(decideUpdate({ current: null, remote: 150, waiting: false })).toEqual({ kind: 'latest', version: 150 });
  });
});

describe('reloadNeedsConfirm', () => {
  it('asks inside the studio, with a dialog open or while saving', () => {
    expect(reloadNeedsConfirm({ pathname: '/v/abc', dialogOpen: false, saving: 0 })).toBe(true);
    expect(reloadNeedsConfirm({ pathname: '/', dialogOpen: true, saving: 0 })).toBe(true);
    expect(reloadNeedsConfirm({ pathname: '/bolsas', dialogOpen: false, saving: 2 })).toBe(true);
  });

  it('reloads straight away elsewhere', () => {
    expect(reloadNeedsConfirm({ pathname: '/', dialogOpen: false, saving: 0 })).toBe(false);
    expect(reloadNeedsConfirm({ pathname: '/ajustes', dialogOpen: false, saving: 0 })).toBe(false);
    expect(reloadNeedsConfirm({ pathname: '/', dialogOpen: false, saving: 0, busy: null })).toBe(false);
  });

  it('asks anywhere while the copy for the group or the voice separation runs', () => {
    expect(reloadNeedsConfirm({ pathname: '/', dialogOpen: false, saving: 0, busy: 'copy' })).toBe(true);
    expect(reloadNeedsConfirm({ pathname: '/bolsas', dialogOpen: false, saving: 0, busy: 'voice' })).toBe(true);
  });

  it('the confirmation says what would be lost', () => {
    expect(updateMessage({ kind: 'confirm', version: 150 }, 'copy')).toBe(
      'Hay una versión nueva (150). Hay una copia para el grupo en marcha: si actualizas ahora, se pierde y habrá que repetirla.',
    );
    expect(updateMessage({ kind: 'confirm', version: null }, 'voice')).toBe(
      'Hay una versión nueva. Se está separando la voz: si actualizas ahora, se pierde y habrá que repetirla.',
    );
    expect(updateMessage({ kind: 'confirm', version: 150 }, null)).toContain('se corta lo que estés haciendo');
  });
});

describe('updateMessage', () => {
  it('says the agreed sentences', () => {
    expect(updateMessage({ kind: 'checking' })).toBe('Buscando…');
    expect(updateMessage({ kind: 'latest', version: 142 })).toBe('Ya tienes la última versión (142).');
    expect(updateMessage({ kind: 'applying', version: 143 })).toBe('Hay una versión nueva (143). Actualizando…');
    expect(updateMessage({ kind: 'offline' })).toMatch(/^Sin conexión/);
    expect(updateMessage({ kind: 'idle' })).toBe('');
  });

  it('leaves the number out when there is none', () => {
    expect(updateMessage({ kind: 'latest', version: null })).toBe('Ya tienes la última versión.');
    expect(updateMessage({ kind: 'applying', version: null })).toBe('Hay una versión nueva. Actualizando…');
  });
});
