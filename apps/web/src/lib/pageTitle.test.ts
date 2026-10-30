import { describe, expect, it } from 'vitest';
import { pageTitle } from './pageTitle';

describe('pageTitle', () => {
  it('names every route', () => {
    expect(pageTitle('/')).toBe('Biblioteca · One Shoot');
    expect(pageTitle('/v/abc123')).toBe('Estudio · One Shoot');
    expect(pageTitle('/v/abc123/formaciones/p1')).toBe('Formaciones · One Shoot');
    expect(pageTitle('/ajustes')).toBe('Ajustes · One Shoot');
    expect(pageTitle('/bolsas')).toBe('Bolsas · One Shoot');
    expect(pageTitle('/bolsas/42')).toBe('Bolsa · One Shoot');
    expect(pageTitle('/rpd')).toBe('Random Play Dance · One Shoot');
    expect(pageTitle('/rpd/jugar')).toBe('Ronda de Random Play Dance · One Shoot');
    expect(pageTitle('/rpd/pista/7')).toBe('Pista de Random Play Dance · One Shoot');
    expect(pageTitle('/deseos')).toBe('Próxima cover · One Shoot');
    expect(pageTitle('/deseos/votacion/9')).toBe('Votación · One Shoot');
    expect(pageTitle('/eventos')).toBe('Eventos · One Shoot');
    expect(pageTitle('/eventos/3')).toBe('Evento · One Shoot');
    expect(pageTitle('/calendario')).toBe('Calendario · One Shoot');
    expect(pageTitle('/privacidad')).toBe('Privacidad y condiciones · One Shoot');
  });

  it('falls back to the app name', () => {
    expect(pageTitle('/nada/por/aqui')).toBe('One Shoot');
  });
});
