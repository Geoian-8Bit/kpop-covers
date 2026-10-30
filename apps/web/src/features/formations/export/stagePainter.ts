import type { FormationPositions } from '@coverscape/shared';
import type { FormationMember } from '@/data/formations';
import { canShareFile, downloadFile, shareFile } from '@/features/record/recorder';
import { mirrorPoint, type PropFrame, type Stage } from '../formationRules';
import { PROP_SIZE } from '../propRules';
import { initialOf, personColors, shortName } from '../StageView';
import { cssColor, cssFont } from '../cssTokens';
import { fitStage, type Rect } from './exportRules';

export { cssColor, cssFont };

/**
 * REQ-11 / REQ-12 · The stage from above painted on a canvas: the same drawing as the editor's SVG (floor, grid,
 * centre line, «PÚBLICO», props, people with their colour, initial and name) for the PNG, the PDF pages and every
 * frame of the video. Colours are read from the index.css tokens at run time.
 */

export interface StageScene {
  stage: Stage;
  memberIds: readonly string[];
  people: Map<string, FormationMember>;
  positions: FormationPositions;
  props: readonly PropFrame[];
  mirrored: boolean;
}

/** Waits for the app's fonts, so the first picture doesn't come out in a fallback face. */
export async function fontsReady(): Promise<void> {
  try {
    await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
  } catch {
    /* no FontFaceSet: the fallback face is fine */
  }
}

/** Paints the stage inside `box` (px). */
export function paintStage(ctx: CanvasRenderingContext2D, scene: StageScene, box: Rect): void {
  const { stage, mirrored } = scene;
  const { width: W, depth: D } = stage;
  const { scale: k, originX, originY } = fitStage(stage, box);
  const X = (x: number) => originX + x * k;
  const Y = (y: number) => originY + y * k;
  const sans = cssFont('--font-sans');

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Floor
  ctx.fillStyle = cssColor('--color-sumi-850');
  ctx.strokeStyle = cssColor('--color-rule');
  ctx.lineWidth = 0.04 * k;
  roundRect(ctx, X(0), Y(0), W * k, D * k, 0.12 * k);
  ctx.fill();
  ctx.stroke();

  // Grid
  const g = stage.grid > 0 ? stage.grid : 0.5;
  ctx.strokeStyle = cssColor('--color-line');
  for (let x = 0, i = 0; x <= W + 1e-6; x += g, i++) line(ctx, X(x), Y(0), X(x), Y(D), (i % 2 === 0 ? 0.022 : 0.012) * k, i % 2 === 0 ? 0.9 : 0.5);
  for (let y = 0, i = 0; y <= D + 1e-6; y += g, i++) line(ctx, X(0), Y(y), X(W), Y(y), (i % 2 === 0 ? 0.022 : 0.012) * k, i % 2 === 0 ? 0.9 : 0.5);

  // Centre line, dashed
  ctx.strokeStyle = cssColor('--color-kin-300');
  ctx.setLineDash([0.18 * k, 0.14 * k]);
  line(ctx, X(W / 2), Y(0), X(W / 2), Y(D), 0.035 * k, 0.45);
  ctx.setLineDash([]);

  // The audience's edge
  ctx.strokeStyle = cssColor('--color-shu-400');
  line(ctx, X(0), Y(D), X(W), Y(D), 0.06 * k, 1);
  ctx.fillStyle = cssColor('--color-shu-300');
  ctx.font = `700 ${0.34 * k}px ${sans}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('PÚBLICO', X(W / 2), Y(D + 0.62));
  ctx.fillStyle = cssColor('--color-washi-subtle');
  ctx.font = `400 ${0.24 * k}px ${sans}`;
  ctx.textAlign = 'left';
  ctx.fillText(mirrored ? 'Desde los bailarines' : 'Desde el público', X(0), Y(-0.24));

  // Props, under the people
  for (const p of scene.props) {
    if (p.opacity <= 0.01) continue;
    const at = mirrorPoint(p, stage, mirrored);
    ctx.save();
    ctx.globalAlpha = Math.min(1, p.opacity);
    ctx.translate(X(at.x), Y(at.y));
    ctx.save();
    ctx.rotate(((mirrored ? -p.rot : p.rot) * Math.PI) / 180);
    paintProp(ctx, p.kind, k);
    ctx.restore();
    if (p.kind === 'mark' && p.label) {
      ctx.fillStyle = cssColor('--color-kin-200');
      ctx.font = `700 ${0.2 * k}px ${sans}`;
      ctx.textAlign = 'center';
      ctx.fillText(p.label, 0, 0.48 * k);
    }
    ctx.restore();
  }

  // People
  const DOT = 0.3;
  for (const id of scene.memberIds) {
    const p = scene.positions[id];
    if (!p) continue;
    const at = mirrorPoint(p, stage, mirrored);
    const person = scene.people.get(id);
    const c = personColors(person);
    const cx = X(at.x);
    const cy = Y(at.y);
    ctx.beginPath();
    ctx.arc(cx, cy, DOT * k, 0, Math.PI * 2);
    ctx.fillStyle = cssColor(c.fill);
    ctx.fill();
    ctx.lineWidth = 0.04 * k;
    ctx.strokeStyle = cssColor('--color-sumi-950');
    ctx.stroke();
    ctx.fillStyle = cssColor(c.ink);
    ctx.font = `800 ${0.32 * k}px ${sans}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initialOf(person?.name), cx, cy + 0.01 * k);
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = cssColor('--color-washi-muted');
    ctx.font = `600 ${0.2 * k}px ${sans}`;
    ctx.fillText(shortName(person?.name ?? '—'), cx, cy + (DOT + 0.3) * k);
  }
  ctx.restore();
}

/** A prop seen from above, centred on 0,0 (the editor's `PropShape`, simplified). */
function paintProp(ctx: CanvasRenderingContext2D, kind: PropFrame['kind'], k: number) {
  const { w, d } = PROP_SIZE[kind];
  const left = (-w / 2) * k;
  const top = (-d / 2) * k;
  ctx.lineWidth = 0.04 * k;
  if (kind === 'mark') {
    ctx.strokeStyle = cssColor('--color-kin-300');
    ctx.lineWidth = 0.07 * k;
    line(ctx, left, top, -left, -top, 0.07 * k, 1);
    line(ctx, -left, top, left, -top, 0.07 * k, 1);
    return;
  }
  ctx.fillStyle = cssColor(kind === 'step' ? '--color-sumi-600' : '--color-sumi-700');
  ctx.strokeStyle = cssColor(kind === 'step' ? '--color-washi-muted' : '--color-kiji-300');
  roundRect(ctx, left, top, w * k, d * k, 0.05 * k);
  ctx.fill();
  ctx.stroke();
  if (kind === 'chair') {
    ctx.fillStyle = cssColor('--color-kiji-300');
    roundRect(ctx, left, top, w * k, 0.11 * k, 0.03 * k);
    ctx.fill();
  } else if (kind === 'bench') {
    for (const x of [-0.4, 0, 0.4]) line(ctx, x * k, top + 0.06 * k, x * k, -top - 0.06 * k, 0.025 * k, 0.6);
  } else {
    line(ctx, left + 0.05 * k, 0, -left - 0.05 * k, 0, 0.025 * k, 1);
  }
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, width: number, alpha: number) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/** Text cut into lines no wider than `width` (at most `max` lines, the last one ending in «…» when cut). */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, width: number, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= width || !current) current = next;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  if (lines.length <= max) return lines;
  const kept = lines.slice(0, max);
  let last = kept[max - 1]!;
  while (last && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
  kept[max - 1] = `${last.trimEnd()}…`;
  return kept;
}

export function makeCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas: no 2d context');
  return { canvas, ctx };
}

export function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas: no blob'))), type, quality));
}

/**
 * Hands a finished file to the dancer: the share sheet on a phone that offers it (where «Guardar» reaches the
 * gallery or Files), else the browser's download.
 */
export async function deliverFile(file: File, title: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (touch && canShareFile(file)) {
    const result = await shareFile(file, title);
    if (result === 'shared') return 'shared';
    if (result === 'cancelled') return 'cancelled';
    // 'failed' (the sheet needs a fresh tap after a long export): the download still works.
  }
  downloadFile(file);
  return 'downloaded';
}
