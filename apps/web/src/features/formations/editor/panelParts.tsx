import { AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';
import type { FormationMember } from '@/data/formations';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import type { Clash } from '../clashRules';
import { TEMPLATE_LABELS, type TemplateKind } from '../formationEditRules';
import { formatMoment } from '../formationRules';
import { tool, toolIdle } from '../EditorTools';

const fmtMetres = (v: number) => v.toLocaleString('es-ES', { maximumFractionDigits: 1 });

/** REQ-08 · The clashes in words, each one a jump to its moment. */
export function ClashNotice({ clashes, people, onSeek }: { clashes: Clash[]; people: Map<string, FormationMember>; onSeek: (c: Clash) => void }) {
  const name = (id: string) => people.get(id)?.name.split(/\s+/)[0] ?? 'Alguien';
  const shown = clashes.slice(0, 3);
  return (
    <div role="status" className="mt-2 rounded-[10px] border border-shu-500/50 bg-shu-700/20 px-2.5 py-2">
      <p className="flex items-center gap-1.5 text-[13px] font-bold text-shu-300">
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        {clashes.length === 1 ? 'Un choque' : `${clashes.length} choques`}: pasan a menos de 0,5 m
      </p>
      <ul className="mt-1 flex flex-wrap gap-1.5">
        {shown.map((c, i) => (
          <li key={`${c.formationId}-${c.a}-${c.b}-${i}`}>
            <button
              type="button"
              onClick={() => onSeek(c)}
              className="flex h-11 items-center gap-1 rounded-[8px] border border-shu-500/40 px-2.5 text-[12px] font-medium text-washi hover:border-shu-400"
            >
              {name(c.a)} y {name(c.b)} · {fmtMetres(c.distance)} m · {formatMoment(c.start)}
            </button>
          </li>
        ))}
        {clashes.length > shown.length && <li className="self-center text-[12px] text-washi-subtle">y {clashes.length - shown.length} más</li>}
      </ul>
    </div>
  );
}

/** A template as a small drawing of its shape. */
export function TemplateButton({ kind, disabled, onClick }: { kind: TemplateKind; disabled: boolean; onClick: () => void }) {
  const dots: Record<TemplateKind, [number, number][]> = {
    line: [[3, 8], [8, 8], [13, 8]],
    v: [[3, 4], [8, 12], [13, 4]],
    'inverted-v': [[3, 12], [8, 4], [13, 12]],
    circle: [[8, 3], [13, 8], [8, 13], [3, 8]],
    pyramid: [[8, 12], [4, 5], [12, 5]],
    windows: [[3, 11], [8, 5], [13, 11]],
  };
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onClick}
      whileTap={disabled ? undefined : { scale: 0.9 }}
      transition={jelly}
      className={cn(tool, toolIdle)}
    >
      <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
        {dots[kind].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={1.8} fill="currentColor" />
        ))}
      </svg>
      {TEMPLATE_LABELS[kind]}
    </motion.button>
  );
}
