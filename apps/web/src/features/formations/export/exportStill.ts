import type { FormationMember } from '@/data/formations';
import { activeIndex, describePoint, positionsAt, propsAt, withDefaults, type Keyframe, type Stage } from '../formationRules';
import { personColors } from '../StageView';
import { exportFileName, formatClock, PDF_PAGE_MM, PDF_PAGE_PX, pngSize, PNG_HEADER } from './exportRules';
import { canvasBlob, cssColor, cssFont, fontsReady, makeCanvas, paintStage, wrapText, type StageScene } from './stagePainter';

/**
 * REQ-11 · «Exportar imagen» (PNG of the moment on screen) and «Exportar PDF» (a page per formation). Loaded only
 * when an export starts; `jspdf` itself is imported on demand inside `formationsPdf`.
 */

export interface PlanSnapshot {
  planName: string;
  songTitle: string;
  stage: Stage;
  memberIds: readonly string[];
  people: Map<string, FormationMember>;
  /** Sorted by time. */
  list: readonly Keyframe[];
  mirrored: boolean;
}

const viewLabel = (mirrored: boolean) => (mirrored ? 'Desde los bailarines' : 'Desde el público');

function sceneAt(snap: PlanSnapshot, t: number): StageScene {
  return {
    stage: snap.stage,
    memberIds: snap.memberIds,
    people: snap.people,
    positions: positionsAt(snap.list, t, snap.memberIds, snap.stage),
    props: propsAt(snap.list, t),
    mirrored: snap.mirrored,
  };
}

/** «Formación 2 de 5» for a moment (or where it stands between two). */
function formationLabel(list: readonly Keyframe[], t: number): string {
  const i = activeIndex(list, t);
  if (list.length === 0) return 'Sin formaciones';
  if (i < 0) return 'Antes de la primera formación';
  return `Formación ${i + 1} de ${list.length}`;
}

/** PNG of the stage at `t`: plan, time, formation, view, the stage with names and the formation's note. */
export async function formationPng(snap: PlanSnapshot, t: number): Promise<File> {
  await fontsReady();
  const size = pngSize(snap.stage);
  const { canvas, ctx } = makeCanvas(size.width, size.height);
  const sans = cssFont('--font-sans');
  const display = cssFont('--font-display');
  ctx.fillStyle = cssColor('--color-sumi-900');
  ctx.fillRect(0, 0, size.width, size.height);

  const left = size.stage.x;
  const right = size.width - size.stage.x;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = cssColor('--color-washi');
  ctx.font = `700 48px ${display}`;
  ctx.textAlign = 'left';
  ctx.fillText(fit(ctx, snap.planName, right - left - 200), left, 66);
  ctx.fillStyle = cssColor('--color-washi-muted');
  ctx.font = `500 26px ${sans}`;
  ctx.fillText(fit(ctx, `${formationLabel(snap.list, t)} · ${viewLabel(snap.mirrored)} · ${snap.songTitle}`, right - left - 200), left, 108);
  ctx.fillStyle = cssColor('--color-kin-300');
  ctx.font = `700 52px ${sans}`;
  ctx.textAlign = 'right';
  ctx.fillText(formatClock(t), right, 72);

  paintStage(ctx, sceneAt(snap, t), size.stage);

  const i = activeIndex(snap.list, t);
  const note = i >= 0 ? snap.list[i]!.note : null;
  ctx.textAlign = 'left';
  ctx.font = `500 28px ${sans}`;
  ctx.fillStyle = cssColor(note ? '--color-ai-200' : '--color-washi-subtle');
  const lines = wrapText(ctx, note ?? 'Sin nota', right - left, 2);
  const top = PNG_HEADER + size.stage.h + 44;
  lines.forEach((l, n) => ctx.fillText(l, left, top + n * 38));

  const blob = await canvasBlob(canvas, 'image/png');
  return new File([blob], exportFileName(snap.planName, 'png', t), { type: 'image/png' });
}

/** One PDF page (as a canvas): header, the stage, the note and who is where. */
function pdfPage(snap: PlanSnapshot, index: number): HTMLCanvasElement {
  const f = snap.list[index]!;
  const { width: PW, height: PH } = PDF_PAGE_PX;
  const { canvas, ctx } = makeCanvas(PW, PH);
  const sans = cssFont('--font-sans');
  const display = cssFont('--font-display');
  const M = 64;
  ctx.fillStyle = cssColor('--color-sumi-900');
  ctx.fillRect(0, 0, PW, PH);

  // Header
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = cssColor('--color-washi');
  ctx.font = `700 54px ${display}`;
  ctx.fillText(fit(ctx, snap.planName, PW - M * 2 - 260), M, 96);
  ctx.fillStyle = cssColor('--color-washi-muted');
  ctx.font = `500 28px ${sans}`;
  ctx.fillText(fit(ctx, `Formación ${index + 1} de ${snap.list.length} · ${viewLabel(snap.mirrored)} · ${snap.songTitle}`, PW - M * 2 - 260), M, 142);
  ctx.textAlign = 'right';
  ctx.fillStyle = cssColor('--color-kin-300');
  ctx.font = `700 64px ${sans}`;
  ctx.fillText(formatClock(f.at), PW - M, 104);

  // Stage
  const stageBox = { x: M, y: 180, w: 1110, h: PH - 180 - 90 };
  const positions = withDefaults(f.positions, snap.memberIds, snap.stage);
  paintStage(
    ctx,
    { stage: snap.stage, memberIds: snap.memberIds, people: snap.people, positions, props: (f.props ?? []).map((p) => ({ ...p, opacity: 1 })), mirrored: snap.mirrored },
    stageBox,
  );

  // Side column: note, then people
  const colX = stageBox.x + stageBox.w + 56;
  const colW = PW - M - colX;
  let y = 220;
  ctx.textAlign = 'left';
  ctx.fillStyle = cssColor('--color-kin-300');
  ctx.font = `700 26px ${sans}`;
  ctx.fillText('NOTA', colX, y);
  y += 42;
  ctx.font = `500 26px ${sans}`;
  ctx.fillStyle = cssColor(f.note ? '--color-ai-200' : '--color-washi-subtle');
  for (const l of wrapText(ctx, f.note ?? 'Sin nota', colW, 7)) {
    ctx.fillText(l, colX, y);
    y += 36;
  }
  y += 30;
  ctx.fillStyle = cssColor('--color-kin-300');
  ctx.font = `700 26px ${sans}`;
  ctx.fillText('QUIÉN ESTÁ DÓNDE', colX, y);
  y += 44;
  const rowH = 52;
  const room = Math.max(1, Math.floor((PH - 110 - y) / rowH));
  const shown = snap.memberIds.length > room ? snap.memberIds.slice(0, room - 1) : snap.memberIds;
  for (const id of shown) {
    const person = snap.people.get(id);
    ctx.beginPath();
    ctx.arc(colX + 12, y - 9, 12, 0, Math.PI * 2);
    ctx.fillStyle = cssColor(personColors(person).fill);
    ctx.fill();
    ctx.fillStyle = cssColor('--color-washi');
    ctx.font = `700 24px ${sans}`;
    ctx.fillText(fit(ctx, person?.name ?? 'Alguien que ya no está', colW - 40), colX + 36, y);
    ctx.fillStyle = cssColor('--color-washi-subtle');
    ctx.font = `400 19px ${sans}`;
    ctx.fillText(fit(ctx, describePoint(positions[id]!, snap.stage), colW - 40), colX + 36, y + 22);
    y += rowH;
  }
  if (shown.length < snap.memberIds.length) {
    ctx.fillStyle = cssColor('--color-washi-subtle');
    ctx.font = `500 22px ${sans}`;
    ctx.fillText(`y ${snap.memberIds.length - shown.length} más`, colX, y);
  }

  // Footer
  ctx.fillStyle = cssColor('--color-washi-subtle');
  ctx.font = `400 20px ${sans}`;
  ctx.textAlign = 'right';
  ctx.fillText(`One Shoot · página ${index + 1} de ${snap.list.length}`, PW - M, PH - 40);
  return canvas;
}

/** The PDF of the plan: one A4 landscape page per formation. */
export async function formationsPdf(snap: PlanSnapshot, onPage?: (done: number, total: number) => void): Promise<File> {
  if (snap.list.length === 0) throw new Error('pdf: no formations');
  await fontsReady();
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  doc.setProperties({ title: `${snap.planName} · Formaciones`, subject: snap.songTitle, creator: 'One Shoot' });
  for (let i = 0; i < snap.list.length; i++) {
    if (i > 0) doc.addPage('a4', 'landscape');
    const page = pdfPage(snap, i);
    doc.addImage(page.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, PDF_PAGE_MM.width, PDF_PAGE_MM.height, undefined, 'FAST');
    page.width = 0; // let the page's pixels go before the next one
    onPage?.(i + 1, snap.list.length);
    // Let the progress paint between pages.
    await new Promise((r) => setTimeout(r, 0));
  }
  const blob = doc.output('blob');
  return new File([blob], exportFileName(snap.planName, 'pdf'), { type: 'application/pdf' });
}

/** Text cut with «…» to fit `width` in the current font. */
function fit(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > width) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}
