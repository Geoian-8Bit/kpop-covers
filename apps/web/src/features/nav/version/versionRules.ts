/**
 * App version and «Buscar actualización», as pure rules (covered by `versionRules.test.ts`). Also imported by
 * vite.config.ts at build time, so nothing here may touch the browser.
 *
 * The version is a build number that grows with every deploy: `APP_BUILD` when the deploy passes it
 * (`pnpm deploy:prod` → `scripts/deploy.mjs` → `vercel --prod -b APP_BUILD=<git rev-list --count HEAD>`), else the
 * commit count of the checkout. `null` when neither is known (a dev server, a clone without history, a shallow
 * clone, whose count would be a small number that never grows).
 */

/** A positive whole number written with digits only, else null. */
export function parseBuildNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isSafeInteger(raw) && raw > 0 ? raw : null;
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!/^\d{1,9}$/.test(text)) return null;
  const value = Number(text);
  return value > 0 ? value : null;
}

/**
 * Build-time choice: the deploy's `APP_BUILD` wins, then the git commit count (thunks: git may be missing). A
 * shallow clone (`isShallow` → 'true') has no meaningful count: null.
 */
export function resolveBuildNumber(
  appBuild: string | undefined,
  gitCount: () => string | null | undefined,
  isShallow: () => string | null | undefined = () => 'false',
): number | null {
  const fromEnv = parseBuildNumber(appBuild);
  if (fromEnv != null) return fromEnv;
  try {
    if (isShallow()?.trim() !== 'false') return null;
    return parseBuildNumber(gitCount());
  } catch {
    return null;
  }
}

/** «17-10-2026» in the device's time zone; null for a missing or broken date. */
export function formatBuildDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(date.getDate())}-${two(date.getMonth() + 1)}-${date.getFullYear()}`;
}

/** «Versión 142 · 17-10-2026», or an honest «Versión de desarrollo» when there is no number. */
export function versionLabel(version: number | null, builtAt: string | null | undefined): string {
  const date = formatBuildDate(builtAt);
  const head = version != null ? `Versión ${version}` : 'Versión de desarrollo';
  return date ? `${head} · ${date}` : head;
}

/** What the server says it is serving (`/version.json`), validated. */
export function parseVersionFile(raw: unknown): { version: number | null; builtAt: string | null } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const builtAt = typeof record.builtAt === 'string' ? record.builtAt : null;
  return { version: parseBuildNumber(record.version), builtAt };
}

export type UpdateDecision = { kind: 'latest'; version: number | null } | { kind: 'newer'; version: number | null };

/**
 * After `registration.update()`: is there something to apply?
 * - A service worker waiting means a new build is downloaded: apply it (even with no numbers to compare, or a
 *   lower number after a rollback: what the server serves is what counts).
 * - One still installing means a new build is on its way: «newer» too, never «the latest» (the caller waits for it).
 * - Without either, a higher number on the server still means «newer» (the caller then waits for it to download).
 * - Otherwise this is the latest.
 */
export function decideUpdate(input: {
  current: number | null;
  remote: number | null;
  waiting: boolean;
  installing?: boolean;
}): UpdateDecision {
  const { current, remote, waiting, installing = false } = input;
  if (waiting || installing) return { kind: 'newer', version: remote };
  if (current != null && remote != null && remote > current) return { kind: 'newer', version: remote };
  return { kind: 'latest', version: current ?? remote };
}

/** Reloading would cut something short: inside the studio (/v/…), with a dialog open or with saves in flight. */
export function reloadNeedsConfirm(input: { pathname: string; dialogOpen: boolean; saving: number }): boolean {
  return input.pathname.startsWith('/v/') || input.dialogOpen || input.saving > 0;
}

export type UpdateStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'latest'; version: number | null }
  | { kind: 'downloading'; version: number | null }
  | { kind: 'confirm'; version: number | null }
  | { kind: 'applying'; version: number | null }
  | { kind: 'later' }
  | { kind: 'offline' }
  | { kind: 'unsupported' }
  | { kind: 'dev' }
  | { kind: 'error' };

const withNumber = (text: string, version: number | null) => (version != null ? `${text} (${version})` : text);

/** The sentence shown (and announced) for each state. '' while idle. */
export function updateMessage(status: UpdateStatus): string {
  switch (status.kind) {
    case 'idle':
      return '';
    case 'checking':
      return 'Buscando…';
    case 'latest':
      return `${withNumber('Ya tienes la última versión', status.version)}.`;
    case 'downloading':
      return `${withNumber('Hay una versión nueva', status.version)}. Descargando…`;
    case 'confirm':
      return `${withNumber('Hay una versión nueva', status.version)}. Al actualizar, la app se recarga y se corta lo que estés haciendo.`;
    case 'applying':
      return `${withNumber('Hay una versión nueva', status.version)}. Actualizando…`;
    case 'later':
      return 'Se actualizará sola en cuanto sea seguro: fuera del estudio y sin nada a medio guardar.';
    case 'offline':
      return 'Sin conexión. Conéctate y vuelve a buscar.';
    case 'unsupported':
      return 'Este navegador no instala actualizaciones en segundo plano: recarga la página para tener la última.';
    case 'dev':
      return 'Es la versión de desarrollo: aquí no hay actualizaciones que buscar.';
    case 'error':
      return 'No se pudo comprobar. Inténtalo de nuevo en un momento.';
  }
}
