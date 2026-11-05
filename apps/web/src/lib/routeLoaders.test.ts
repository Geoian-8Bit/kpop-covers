import { describe, expect, it, vi } from 'vitest';

// The group request needs the backend and the snapshot store; only the route table is under test here.
vi.mock('@/lib/backend/core', () => ({ backend: {} }));
vi.mock('@/lib/backend/mode', () => ({ IS_DEMO: true }));
vi.mock('@/lib/youtubeIframe', () => ({ loadYouTubeApi: vi.fn() }));

import { routeKeyFor, routeLoaders } from './routeLoaders';

describe('routeKeyFor (REQ-06)', () => {
  it.each([
    ['/v/abc123', 'studio'],
    ['/v/abc123/formaciones/p1', 'studio'],
    ['/ajustes', 'settings'],
    ['/bolsas', 'bags'],
    ['/bolsas/b1', 'bag'],
    ['/rpd', 'rpd'],
    ['/rpd/pista/t1', 'track'],
    ['/rpd/jugar', 'rpdPlay'],
    ['/deseos', 'wishes'],
    ['/deseos/votacion/p1', 'poll'],
    ['/eventos', 'events'],
    ['/eventos/e1', 'event'],
    ['/calendario', 'calendar'],
    ['/privacidad', 'privacy'],
  ])('%s -> %s', (path, key) => {
    expect(routeKeyFor(path)).toBe(key);
  });

  it('preloads nothing for the library or unknown paths', () => {
    expect(routeKeyFor('/')).toBeNull();
    expect(routeKeyFor('/nada')).toBeNull();
    expect(routeKeyFor('/v')).toBeNull();
  });

  it('every key maps to a loader', () => {
    for (const key of Object.keys(routeLoaders))
      expect(typeof routeLoaders[key as keyof typeof routeLoaders]).toBe('function');
  });
});
