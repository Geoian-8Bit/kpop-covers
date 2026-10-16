import { formatTime, type Member, type Note } from '@coverscape/shared';
import { motion } from 'motion/react';
import { ArrowUpRight, Circle, Eraser, PenLine, Undo2, Users } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Segmented } from '@/components/ui/Segmented';
import { MemberSeal } from '@/features/members/MembersUI';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import {
  arrowHead,
  cleanNoteBody,
  ellipseOf,
  encodeSketch,
  isNoteCategory,
  isShape,
  isValidSketch,
  NOTE_CATEGORIES,
  NOTE_MAX,
  type NoteCategory,
  type Pt,
  type SketchShape,
} from './reviewRules';
import { capturePointer } from './pointer';

/**
 * F6 · Write (or edit) a note on a take: the moment is taken by itself; text, an optional category, who it is for
 * (by default whoever recorded the take) and, optionally, a circle or an arrow drawn over the paused frame. The
 * drawing is saved with the frame as a small image (WebP ≤ 60 000 characters; JPEG if the browser has no WebP).
 */

export type ComposerDraft =
  | { mode: 'new'; takeSeconds: number; songSeconds: number; frame: HTMLCanvasElement | null }
  | { mode: 'edit'; note: Note; frame: HTMLCanvasElement | null };

export interface ComposerValues {
  body: string;
  category: NoteCategory | null;
  forMemberId: string | null;
  /** undefined = leave the saved drawing as it is; null = no drawing. */
  sketch: string | null | undefined;
}

interface Props {
  draft: ComposerDraft | null;
  /** The take is shown mirrored: the frame too, and the drawing lands where the finger is. */
  mirrored: boolean;
  members: Member[];
  /** Default recipient: whoever recorded the take. */
  defaultFor: string | null;
  authorName: string | null;
  onClose: () => void;
  onSave: (values: ComposerValues) => Promise<void>;
}

/** CSS tokens for the canvas (it can't read Tailwind classes). */
function token(name: string, fallbackVar: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || getComputedStyle(document.documentElement).getPropertyValue(fallbackVar).trim();
}

function drawShapes(ctx: CanvasRenderingContext2D, shapes: readonly SketchShape[], scale: number) {
  const ink = token('--color-shu-400', '--color-washi');
  const halo = token('--color-sumi-950', '--color-sumi-900');
  const width = Math.max(2.5, ctx.canvas.width / 90);
  for (const pass of [
    { color: halo, w: width + 3 },
    { color: ink, w: width },
  ]) {
    ctx.strokeStyle = pass.color;
    ctx.lineWidth = pass.w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const raw of shapes) {
      const s = { kind: raw.kind, from: { x: raw.from.x * scale, y: raw.from.y * scale }, to: { x: raw.to.x * scale, y: raw.to.y * scale } };
      ctx.beginPath();
      if (s.kind === 'circle') {
        const e = ellipseOf(s);
        ctx.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI * 2);
      } else {
        ctx.moveTo(s.from.x, s.from.y);
        ctx.lineTo(s.to.x, s.to.y);
        const [a, b] = arrowHead(s.from, s.to, Math.max(10, width * 4));
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(s.to.x, s.to.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
    }
  }
}

/** The frame with its shapes, encoded small enough for the note. */
export function sketchImage(frame: HTMLCanvasElement, shapes: readonly SketchShape[]): string | null {
  return encodeSketch((type, quality, width) => {
    const scale = Math.min(1, width / frame.width);
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(frame.width * scale));
    out.height = Math.max(1, Math.round(frame.height * scale));
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(frame, 0, 0, out.width, out.height);
    drawShapes(ctx, shapes, scale);
    try {
      return out.toDataURL(type, quality);
    } catch {
      return null; // a tainted frame (a cloud copy without CORS)
    }
  });
}

/** Grab the take's current frame (unmirrored) at up to 640 px wide; null when it can't be read. */
export function captureFrame(video: HTMLVideoElement | null): HTMLCanvasElement | null {
  if (!video || !video.videoWidth || !video.videoHeight) return null;
  const scale = Math.min(1, 640 / video.videoWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  try {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.getImageData(0, 0, 1, 1); // throws if the frame can't be read
    return canvas;
  } catch {
    return null;
  }
}

export function TakeNoteComposer({ draft, mirrored, members, defaultFor, authorName, onClose, onSave }: Props) {
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<NoteCategory | null>(null);
  const [forMember, setForMember] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [shapes, setShapes] = useState<SketchShape[]>([]);
  const [tool, setTool] = useState<SketchShape['kind']>('circle');
  const [dropSketch, setDropSketch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const lastDraft = useRef(draft);
  if (draft) lastDraft.current = draft;
  const shown = draft ?? lastDraft.current;
  const note = shown?.mode === 'edit' ? shown.note : null;
  const frame = shown?.frame ?? null;
  const savedSketch = note && isValidSketch(note.sketch) && !dropSketch ? note.sketch : null;

  useEffect(() => {
    if (!draft) return;
    const n = draft.mode === 'edit' ? draft.note : null;
    setBody(n?.body ?? '');
    setCategory(n && isNoteCategory(n.category) ? n.category : null);
    setForMember(n ? (n.for_member_id ?? null) : defaultFor);
    setDrawing(false);
    setShapes([]);
    setTool('circle');
    setDropSketch(false);
    setError(null);
  }, [draft, defaultFor]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const text = cleanNoteBody(body);
    if (!text || saving) return;
    let sketch: string | null | undefined = note ? (dropSketch ? null : undefined) : null;
    if (shapes.length && frame) {
      sketch = sketchImage(frame, shapes);
      if (!sketch) {
        setError('No se pudo guardar el dibujo. Prueba con menos trazos o guarda la nota sin dibujo.');
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ body: text, category, forMemberId: forMember, sketch });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'No se pudo guardar la nota.');
    } finally {
      setSaving(false);
    }
  }

  const when =
    shown?.mode === 'new'
      ? `En el ${formatTime(shown.takeSeconds, { tenths: true })} de la toma (${formatTime(shown.songSeconds, { tenths: true })} de la canción).`
      : note
        ? `En el ${formatTime(Number(note.take_seconds ?? 0), { tenths: true })} de la toma.`
        : undefined;

  return (
    <Dialog open={draft != null} onClose={onClose} busy={saving} title={note ? 'Editar nota' : 'Nota sobre la toma'} description={when} size="lg">
      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <label htmlFor="take-note-body" className="mb-1.5 block text-[13px] font-medium text-washi-muted">
            Qué hay que corregir
          </label>
          <textarea
            id="take-note-body"
            data-autofocus="desktop"
            rows={3}
            maxLength={NOTE_MAX}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Ej. El brazo derecho llega tarde al giro"
            className="well w-full resize-none rounded-[10px] px-3.5 py-3 text-[15px] leading-relaxed text-washi outline-none placeholder:text-washi-subtle focus:border-kin-300/70"
          />
          <p className="tabular mt-1 text-right text-[12px] text-washi-subtle">
            {body.trim().length}/{NOTE_MAX}
          </p>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-washi-muted">Categoría (opcional)</legend>
          <div role="radiogroup" aria-label="Categoría" className="flex flex-wrap gap-1.5">
            <Chip active={category == null} onClick={() => setCategory(null)}>
              Sin categoría
            </Chip>
            {NOTE_CATEGORIES.map((c) => (
              <Chip key={c.id} active={category === c.id} onClick={() => setCategory(category === c.id ? null : c.id)}>
                {c.label}
              </Chip>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-washi-muted">Para quién</legend>
          <div role="radiogroup" aria-label="Para quién" className="flex flex-wrap gap-1.5">
            {members.map((m) => (
              <Chip key={m.id} active={forMember === m.id} onClick={() => setForMember(m.id)}>
                <MemberSeal member={m} size="sm" />
                {m.name}
              </Chip>
            ))}
            <Chip active={forMember == null} onClick={() => setForMember(null)}>
              <Users className="size-4" aria-hidden />
              Todo el grupo
            </Chip>
          </div>
          <p className="mt-1.5 text-[12px] text-washi-subtle">
            {authorName ? `La firmas como ${authorName}.` : 'Se guarda sin firma: di quién eres en Ajustes para firmarla.'}
          </p>
        </fieldset>

        <section aria-label="Dibujo sobre el fotograma" className="space-y-2">
          {savedSketch && !shapes.length && (
            <div className="flex flex-wrap items-end gap-3">
              <img src={savedSketch} alt="Dibujo guardado sobre el fotograma" className="w-full max-w-[240px] rounded-[8px] border border-line" />
              <Button variant="ghost" size="sm" className="min-h-11" onClick={() => setDropSketch(true)}>
                <Eraser className="size-4" /> Quitar dibujo
              </Button>
            </div>
          )}
          {!drawing ? (
            <Button
              variant="secondary"
              className="min-h-11"
              disabled={!frame}
              onClick={() => setDrawing(true)}
              aria-describedby={!frame ? 'sketch-why' : undefined}
            >
              <PenLine className="size-4" /> {savedSketch ? 'Dibujar de nuevo' : 'Dibujar sobre el fotograma'}
            </Button>
          ) : (
            frame && (
              <SketchPad frame={frame} mirrored={mirrored} shapes={shapes} onShapes={setShapes} tool={tool} onTool={setTool} />
            )
          )}
          {!frame && (
            <p id="sketch-why" className="text-[12px] text-washi-subtle">
              Este fotograma no se puede dibujar todavía (la toma aún está cargando).
            </p>
          )}
        </section>

        {error && (
          <p role="alert" className="text-sm text-enji-300">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2 border-t border-line pt-4">
          <Button variant="ghost" className="ml-auto" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!body.trim()} loading={saving}>
            Guardar nota
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      whileTap={{ scale: 0.92 }}
      transition={jelly}
      className={cn(
        'flex min-h-11 items-center gap-2 rounded-[10px] px-3 text-[13px] transition-colors duration-200',
        active ? 'bg-washi font-bold text-sumi-900' : 'well font-medium text-washi-muted hover:text-washi',
      )}
    >
      {children}
    </motion.button>
  );
}

/** The paused frame, with circles and arrows drawn by dragging (finger or mouse). */
function SketchPad({
  frame,
  mirrored,
  shapes,
  onShapes,
  tool,
  onTool,
}: {
  frame: HTMLCanvasElement;
  mirrored: boolean;
  shapes: SketchShape[];
  onShapes: (shapes: SketchShape[]) => void;
  tool: SketchShape['kind'];
  onTool: (tool: SketchShape['kind']) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState<SketchShape | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(frame, 0, 0);
    drawShapes(ctx, live ? [...shapes, live] : shapes, 1);
  }, [frame, shapes, live]);

  const point = (e: ReactPointerEvent<HTMLCanvasElement>): Pt => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * frame.width;
    const y = ((e.clientY - rect.top) / rect.height) * frame.height;
    // Shown mirrored like the take: the frame's own x is the other side.
    return { x: mirrored ? frame.width - x : x, y };
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Qué dibujar"
          layoutId="sketch-tool"
          value={tool}
          onChange={onTool}
          options={[
            { value: 'circle', label: <span className="flex items-center gap-1.5"><Circle className="size-4" /> Círculo</span> },
            { value: 'arrow', label: <span className="flex items-center gap-1.5"><ArrowUpRight className="size-4" /> Flecha</span> },
          ]}
        />
        <Button variant="ghost" size="icon" aria-label="Deshacer el último trazo" disabled={!shapes.length} onClick={() => onShapes(shapes.slice(0, -1))}>
          <Undo2 className="size-5" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Borrar el dibujo" disabled={!shapes.length} onClick={() => onShapes([])}>
          <Eraser className="size-5" />
        </Button>
      </div>
      <canvas
        ref={canvasRef}
        width={frame.width}
        height={frame.height}
        role="img"
        aria-label={`Fotograma de la toma para dibujar: ${shapes.length} ${shapes.length === 1 ? 'trazo' : 'trazos'}. Arrastra para dibujar ${tool === 'circle' ? 'un círculo' : 'una flecha'}.`}
        className={cn('block max-h-[46dvh] w-full touch-none rounded-[10px] border border-line-strong bg-sumi-950 object-contain', mirrored && '-scale-x-100')}
        style={{ aspectRatio: `${frame.width} / ${frame.height}`, cursor: 'crosshair' }}
        onPointerDown={(e) => {
          capturePointer(e);
          const p = point(e);
          setLive({ kind: tool, from: p, to: p });
        }}
        onPointerMove={(e) => {
          if (!live) return;
          setLive({ ...live, to: point(e) });
        }}
        onPointerUp={() => {
          if (live && isShape(live)) onShapes([...shapes, live]);
          setLive(null);
        }}
        onPointerCancel={() => setLive(null)}
      />
    </div>
  );
}
