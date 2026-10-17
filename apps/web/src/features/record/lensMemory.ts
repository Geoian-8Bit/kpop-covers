import type { LensProbe } from './lensRules';

/**
 * P23 · What each rear camera showed once opened (flash, focus, size), remembered on this phone: the lens buttons
 * know which is which from the next visit on, without opening every camera. Device ids stay the same for the app
 * until the site data is cleared; a camera whose name changed is measured again.
 */
const KEY = 'oneshoot.record.lenses';

type Memory = Record<string, { label: string; probe: LensProbe }>;

function read(): Memory {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Memory | null;
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

export function lensProbes(cams: { id: string; label: string }[]): Record<string, LensProbe | undefined> {
  const memory = read();
  const out: Record<string, LensProbe | undefined> = {};
  for (const c of cams) {
    const m = memory[c.id];
    if (m && m.label === c.label) out[c.id] = m.probe;
  }
  return out;
}

export function rememberLens(id: string, label: string, probe: LensProbe): void {
  if (!id) return;
  const memory = read();
  memory[id] = { label, probe };
  try {
    localStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    /* for this visit only */
  }
}

const MAIN_KEY = 'oneshoot.record.mainLens';

/** The main rear camera's id, once known for sure: the recorder opens straight on it (1× by default). */
export function rememberedMainLens(): string | null {
  try {
    return localStorage.getItem(MAIN_KEY);
  } catch {
    return null;
  }
}

export function rememberMainLens(id: string | null): void {
  try {
    if (id) localStorage.setItem(MAIN_KEY, id);
    else localStorage.removeItem(MAIN_KEY);
  } catch {
    /* for this visit only */
  }
}
