import type { FormationProp, FormationPropKind, StagePoint } from '@coverscape/shared';

/**
 * REQ-10 · Stage props (chair, bench, free mark, step): placed per formation like people (stored in
 * `formations.props`), moved and turned, and travelling with the same transition. They are not people: never in the
 * clash check. A prop keeps its id across formations, which is how it is followed from one to the next.
 */

export const PROP_KINDS = ['chair', 'bench', 'mark', 'step'] as const satisfies readonly FormationPropKind[];

export const PROP_LABELS: Record<FormationPropKind, string> = {
  chair: 'Silla',
  bench: 'Banco',
  mark: 'Marca',
  step: 'Escalón',
};

/** Footprint in metres (width × depth before turning). */
export const PROP_SIZE: Record<FormationPropKind, { w: number; d: number }> = {
  chair: { w: 0.5, d: 0.5 },
  bench: { w: 1.6, d: 0.45 },
  mark: { w: 0.4, d: 0.4 },
  step: { w: 1.2, d: 0.6 },
};

export const PROPS_MAX = 30;
export const PROP_LABEL_MAX = 24;
export const PROP_ROTATE_STEP = 15;

interface Size {
  width: number;
  depth: number;
}

/** What the prop helpers need of a formation. */
export interface WithProps {
  id: string;
  props?: FormationProp[];
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** 0–359 (whole or decimal), whatever turn it came from. */
export function normalizeAngle(deg: number): number {
  const r = ((deg % 360) + 360) % 360;
  return round3(r >= 360 ? 0 : r);
}

/** The shortest turn from `a` to `b` at fraction `p`. */
export function lerpAngle(a: number, b: number, p: number): number {
  const diff = ((((b - a) % 360) + 540) % 360) - 180;
  return normalizeAngle(a + diff * p);
}

export function clampProp(prop: FormationProp, stage: Size): FormationProp {
  return {
    ...prop,
    x: round3(Math.min(stage.width, Math.max(0, prop.x))),
    y: round3(Math.min(stage.depth, Math.max(0, prop.y))),
  };
}

export function fitProps(props: readonly FormationProp[], stage: Size): FormationProp[] {
  return props.map((p) => clampProp(p, stage));
}

/** Tolerant read of `formations.props` (old rows: `[]`; anything malformed is skipped, never fatal). */
export function readProps(value: unknown): FormationProp[] {
  if (!Array.isArray(value)) return [];
  const out: FormationProp[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue;
    const o = raw as Record<string, unknown>;
    if (typeof o.id !== 'string' || !PROP_KINDS.includes(o.kind as FormationPropKind)) continue;
    if (typeof o.x !== 'number' || typeof o.y !== 'number' || !Number.isFinite(o.x) || !Number.isFinite(o.y)) continue;
    const prop: FormationProp = {
      id: o.id,
      kind: o.kind as FormationPropKind,
      x: o.x,
      y: o.y,
      rot: typeof o.rot === 'number' && Number.isFinite(o.rot) ? normalizeAngle(o.rot) : 0,
    };
    if (typeof o.label === 'string' && o.label.trim()) prop.label = o.label.trim().slice(0, PROP_LABEL_MAX);
    out.push(prop);
  }
  return out;
}

/** The same check as the server's (`formation_invalid` / `formation_out_of_stage`), or null. */
export function propsError(props: unknown, stage: Size): 'formation_invalid' | 'formation_out_of_stage' | null {
  if (!Array.isArray(props) || props.length > PROPS_MAX) return 'formation_invalid';
  const seen = new Set<string>();
  for (const raw of props) {
    if (typeof raw !== 'object' || raw === null) return 'formation_invalid';
    const o = raw as Record<string, unknown>;
    if (Object.keys(o).some((k) => !['id', 'kind', 'x', 'y', 'rot', 'label'].includes(k))) return 'formation_invalid';
    if (typeof o.id !== 'string' || !UUID.test(o.id) || seen.has(o.id)) return 'formation_invalid';
    seen.add(o.id);
    if (!PROP_KINDS.includes(o.kind as FormationPropKind)) return 'formation_invalid';
    if (typeof o.x !== 'number' || typeof o.y !== 'number' || !Number.isFinite(o.x) || !Number.isFinite(o.y)) return 'formation_invalid';
    if (o.rot !== undefined && (typeof o.rot !== 'number' || !(o.rot >= 0 && o.rot < 360))) return 'formation_invalid';
    if (o.label !== undefined && (typeof o.label !== 'string' || o.label.length > PROP_LABEL_MAX)) return 'formation_invalid';
    if (o.x < 0 || o.y < 0 || o.x > stage.width || o.y > stage.depth) return 'formation_out_of_stage';
  }
  return null;
}

export function sameProps(a: readonly FormationProp[] | undefined, b: readonly FormationProp[] | undefined): boolean {
  const pa = a ?? [];
  const pb = b ?? [];
  if (pa.length !== pb.length) return false;
  return pa.every((p, i) => {
    const q = pb[i]!;
    return (
      p.id === q.id &&
      p.kind === q.kind &&
      Math.abs(p.x - q.x) < 1e-6 &&
      Math.abs(p.y - q.y) < 1e-6 &&
      Math.abs(p.rot - q.rot) < 1e-6 &&
      (p.label ?? '') === (q.label ?? '')
    );
  });
}

/** A new prop near the front centre, on a spot no other prop takes. */
export function newProp(kind: FormationPropKind, taken: readonly StagePoint[], stage: Size, id: string): FormationProp {
  const y0 = Math.max(0, stage.depth - 1);
  const offsets = [0, -1, 1, -2, 2, -3, 3];
  for (const row of [0, -1, -2]) {
    for (const dx of offsets) {
      const p = { x: stage.width / 2 + dx, y: y0 + row };
      if (p.x < 0 || p.x > stage.width || p.y < 0) continue;
      if (taken.every((t) => Math.hypot(t.x - p.x, t.y - p.y) >= 0.6)) return clampProp({ id, kind, x: p.x, y: p.y, rot: 0 }, stage);
    }
  }
  return clampProp({ id, kind, x: stage.width / 2, y: y0, rot: 0 }, stage);
}

/**
 * «Añadir»: the prop goes into formation `formationId` and stays on stage from there on (every later formation
 * that doesn't have it gets it at the same spot). `list` sorted by time.
 */
export function addPropFrom<T extends WithProps>(list: readonly T[], formationId: string, prop: FormationProp): T[] {
  const start = list.findIndex((f) => f.id === formationId);
  if (start < 0) return [...list];
  return list.map((f, i) => {
    if (i < start) return f;
    const props = f.props ?? [];
    if (props.some((p) => p.id === prop.id) || props.length >= PROPS_MAX) return f;
    return { ...f, props: [...props, { ...prop }] };
  });
}

/** «Quitar»: the prop leaves the stage from formation `formationId` on (earlier formations keep it). */
export function removePropFrom<T extends WithProps>(list: readonly T[], formationId: string, propId: string): T[] {
  const start = list.findIndex((f) => f.id === formationId);
  if (start < 0) return [...list];
  return list.map((f, i) => (i < start || !(f.props ?? []).some((p) => p.id === propId) ? f : { ...f, props: (f.props ?? []).filter((p) => p.id !== propId) }));
}

/** Place and turn change in one formation only (like people). */
export function patchProp(props: readonly FormationProp[], propId: string, patch: Partial<Pick<FormationProp, 'x' | 'y' | 'rot'>>, stage: Size): FormationProp[] {
  return props.map((p) => {
    if (p.id !== propId) return p;
    const next = clampProp({ ...p, ...patch }, stage);
    return { ...next, rot: normalizeAngle(next.rot) };
  });
}

/** A mark's text is the same everywhere: it changes in every formation that has the prop. */
export function relabelProp<T extends WithProps>(list: readonly T[], propId: string, label: string): T[] {
  const text = label.trim().slice(0, PROP_LABEL_MAX);
  return list.map((f) =>
    (f.props ?? []).some((p) => p.id === propId)
      ? { ...f, props: (f.props ?? []).map((p) => (p.id === propId ? { ...p, label: text } : p)) }
      : f,
  );
}
