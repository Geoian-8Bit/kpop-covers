export const APP_NAME = 'One Shoot';

/** Page names by route, most specific first (they're matched in order). */
const PAGES: [RegExp, string][] = [
  [/^\/$/, 'Biblioteca'],
  [/^\/v\/[^/]+\/?$/, 'Estudio'],
  [/^\/ajustes\/?$/, 'Ajustes'],
  [/^\/bolsas\/?$/, 'Bolsas'],
  [/^\/bolsas\/[^/]+\/?$/, 'Bolsa'],
  [/^\/rpd\/jugar\/?$/, 'Ronda de Random Play Dance'],
  [/^\/rpd\/pista\/[^/]+\/?$/, 'Pista de Random Play Dance'],
  [/^\/rpd\/?$/, 'Random Play Dance'],
  [/^\/deseos\/votacion\/[^/]+\/?$/, 'Votación'],
  [/^\/deseos\/?$/, 'Próxima cover'],
  [/^\/eventos\/?$/, 'Eventos'],
  [/^\/eventos\/[^/]+\/?$/, 'Evento'],
  [/^\/calendario\/?$/, 'Calendario'],
  [/^\/privacidad\/?$/, 'Privacidad y condiciones'],
];

/** The document title for a path: «<página> · One Shoot», or just the app's name for an unknown path. */
export function pageTitle(pathname: string): string {
  const page = PAGES.find(([pattern]) => pattern.test(pathname))?.[1];
  return page ? `${page} · ${APP_NAME}` : APP_NAME;
}
