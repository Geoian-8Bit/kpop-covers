import { useSharedTakesBytes } from '@/data/takes';
import { formatBytes } from '@coverscape/shared';
import { TriangleAlert } from 'lucide-react';
import { quotaState } from './takeRules';

// ───────────── Cloud space ─────────────

export function CloudNotice() {
  const bytes = useSharedTakesBytes();
  if (!bytes.data) return null;
  const q = quotaState(bytes.data.total);
  if (!q.warn) return null;
  const pct = Math.round(q.ratio * 100);
  return (
    <p role="status" className="mt-3 flex items-start gap-1.5 text-[13px] leading-snug text-shu-300">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      {q.full
        ? 'La nube del grupo está llena: no se pueden compartir más tomas. Avisad a quien administra la app para vaciarla.'
        : `La nube del grupo va por el ${pct} % (${formatBytes(q.used)} de 1 GB). Avisad a quien administra la app para vaciarla.`}
    </p>
  );
}
