/**
 * P23 · Which back camera is which. Browsers list the phone's rear cameras by name only ("camera2 0, facing back"
 * on Android, "Back Ultra Wide Camera" on iPhone); the recorder offers them like the phone's camera app does
 * (0,5× · 1× · Tele) instead of "Lente 1/2". What tells them apart, from strongest to weakest:
 *
 * 1. the name, when it says it (ultra / gran angular / 0,5 · tele / telephoto · macro);
 * 2. Android's numbering: camera 0 is always the main rear camera;
 * 3. what a camera showed once opened (remembered per phone): the flash sits next to the main lens, a fixed-focus
 *    camera is an ultra-wide (or, when small, a macro);
 * 4. a phone with a single rear camera: that one is the main.
 *
 * Whatever stays unknown is offered as «Otra lente», never guessed.
 */

export type LensRole = 'ultra' | 'main' | 'tele' | 'macro' | 'other';

/** What a camera showed when it was open (getCapabilities), remembered per phone. */
export interface LensProbe {
  torch: boolean;
  /** null: the browser didn't say. */
  autofocus: boolean | null;
  maxWidth: number | null;
  maxHeight: number | null;
  zoomMin: number | null;
  zoomMax: number | null;
}

export interface LensInput {
  id: string;
  label: string;
  probe?: LensProbe | null;
}

export interface Lens {
  id: string;
  role: LensRole;
  /** «Gran angular», «Principal», «Tele», «Macro», «Otra lente». */
  name: string;
  /** Zoom as the camera app counts it (0.5 the ultra-wide, 1 the main); null when unknown (tele, other). */
  factor: number | null;
  /** Said by the name or the numbering, or seen once opened (false: a best guess). */
  sure: boolean;
}

const ULTRA = /ultra|0[.,]5\s*x?|gran\s?angular|grand\s?angle|weitwinkel/i;
const TELE = /tele|periscop|\b[2-9](?:[.,]\d)?\s?x\b/i;
const MACRO = /macro/i;
/** Android: "camera2 0, facing back" (and "camera 0, facing back" on older builds). */
const ANDROID_ID = /camera2?\s*(\d+)\s*,\s*facing\s*back/i;
/** iPhone and some Androids name the main camera plainly. */
const PLAIN_MAIN = /^(back|rear)\s+camera$|^c[aá]mara\s+trasera$/i;

const NAMES: Record<LensRole, string> = {
  ultra: 'Gran angular',
  main: 'Principal',
  tele: 'Tele',
  macro: 'Macro',
  other: 'Otra lente',
};

function fromLabel(label: string): { role: LensRole; sure: boolean } | null {
  if (MACRO.test(label)) return { role: 'macro', sure: true };
  if (ULTRA.test(label)) return { role: 'ultra', sure: true };
  if (TELE.test(label)) return { role: 'tele', sure: true };
  const android = ANDROID_ID.exec(label);
  if (android && android[1] === '0') return { role: 'main', sure: true };
  if (PLAIN_MAIN.test(label.trim())) return { role: 'main', sure: true };
  return null;
}

function fromProbe(probe: LensProbe | null | undefined): LensRole | null {
  if (!probe || probe.autofocus !== false) return null;
  // Fixed focus: macros are small sensors (under 1080p wide); otherwise it's the ultra-wide.
  if (probe.maxWidth != null && Math.max(probe.maxWidth, probe.maxHeight ?? 0) < 1920) return 'macro';
  return 'ultra';
}

/** Classifies the rear cameras (in the browser's order) and sorts them like the camera app: 0,5× · 1× · Tele · others. */
export function classifyLenses(inputs: LensInput[]): Lens[] {
  const out = inputs.map((l) => {
    const named = fromLabel(l.label);
    if (named) return { id: l.id, role: named.role, sure: named.sure };
    const seen = fromProbe(l.probe);
    if (seen) return { id: l.id, role: seen, sure: true };
    return { id: l.id, role: 'other' as LensRole, sure: false };
  });
  const hasMain = () => out.some((l) => l.role === 'main');
  // The flash sits next to the main camera.
  if (!hasMain()) {
    const flash = out.filter((l, i) => l.role === 'other' && inputs[i]!.probe?.torch);
    if (flash.length === 1) {
      flash[0]!.role = 'main';
      flash[0]!.sure = true;
    }
  }
  // A single rear camera is the main one; with several unknown ones, the browser's first (Android lists camera 0
  // first) is the best guess.
  if (!hasMain()) {
    const first = out.find((l) => l.role === 'other');
    if (first) {
      first.role = 'main';
      first.sure = out.length === 1;
    }
  }
  // Two "mains" (a numbering quirk): the one with the flash, else the first, stays main.
  const mains = out.filter((l) => l.role === 'main');
  if (mains.length > 1) {
    const keep = mains.find((l) => inputs[out.indexOf(l)]!.probe?.torch) ?? mains[0]!;
    for (const m of mains) if (m !== keep) m.role = 'other';
  }
  const order: Record<LensRole, number> = { ultra: 0, main: 1, tele: 2, other: 3, macro: 4 };
  const others = out.filter((l) => l.role === 'other').length;
  let n = 0;
  return out
    .map((l) => ({
      ...l,
      name: l.role === 'other' && others > 1 ? `${NAMES.other} ${++n}` : NAMES[l.role],
      factor: l.role === 'ultra' ? 0.5 : l.role === 'main' ? 1 : null,
    }))
    .sort((a, b) => order[a.role] - order[b.role]);
}

/** The probe of an open camera, from its capabilities. */
export function probeFromCapabilities(caps: {
  torch?: boolean;
  focusMode?: string[];
  width?: { max?: number };
  height?: { max?: number };
  zoom?: { min?: number; max?: number };
}): LensProbe {
  const modes = caps.focusMode ?? null;
  return {
    torch: Boolean(caps.torch),
    // A camera that lists its focus modes says whether it can focus; an empty list says nothing.
    autofocus: modes && modes.length ? modes.some((m) => m === 'continuous' || m === 'single-shot') : null,
    maxWidth: caps.width?.max ?? null,
    maxHeight: caps.height?.max ?? null,
    zoomMin: caps.zoom?.min ?? null,
    zoomMax: caps.zoom?.max ?? null,
  };
}

/** What the flash control says on a lens without one. */
export function torchHint(lenses: Lens[], probes: Record<string, LensProbe | undefined>, currentId: string | null): string {
  const withFlash = lenses.filter((l) => probes[l.id]?.torch);
  const here = lenses.find((l) => l.id === currentId);
  if (withFlash.length === 1 && withFlash[0]!.id !== currentId) {
    const f = withFlash[0]!;
    return `${here ? `La lente ${here.name.toLowerCase()}` : 'Esta lente'} no tiene flash: solo la ${f.name.toLowerCase()}${f.factor ? ` (${String(f.factor).replace('.', ',')}×)` : ''} lo tiene.`;
  }
  return 'Esta lente no tiene flash.';
}

/**
 * P23 review · How many lens/zoom buttons fit beside the shutter on a turned phone (390 px tall, 44 px each). The
 * rear cameras nobody could identify already share one button (`otherLensStep`); beyond that «2×» goes first (a
 * pinch still reaches it), then the narrowest zooms from the end.
 */
export const MAX_LENS_CHIPS = 4;

export function fitChips<T extends { key: string }>(chips: T[], max = MAX_LENS_CHIPS, keep: string | null = null): T[] {
  let out = chips;
  if (out.length > max) out = out.filter((c) => c.key !== 'z2' || c.key === keep);
  while (out.length > max) {
    const drop = [...out].reverse().find((c) => c.key !== keep && c.key !== 'z1');
    if (!drop) break;
    out = out.filter((c) => c !== drop);
  }
  return out;
}

/** The one button for the unidentified rear cameras: the one in use, and the one a tap goes to. */
export function otherLensStep(others: string[], current: string | null): { active: string | null; next: string | null } {
  if (!others.length) return { active: null, next: null };
  const i = current ? others.indexOf(current) : -1;
  return { active: i >= 0 ? others[i]! : null, next: others[(i + 1) % others.length]! };
}
