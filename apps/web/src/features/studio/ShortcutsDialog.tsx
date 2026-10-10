import { Dialog } from '@/components/ui/Dialog';
import { Kbd } from './ClipList';

const SHORTCUTS: Array<[keys: string[], action: string]> = [
  [['Espacio'], 'Reproducir / pausar'],
  [['←', '→'], 'Retroceder / avanzar 5 s (con Shift: 1 s)'],
  [[',', '.'], 'Mover 0,1 s'],
  [['↑', '↓'], 'Velocidad ±0,05×'],
  [['1', '…', '8'], 'Velocidades rápidas (0,5× … 2×)'],
  [['M'], 'Activar / quitar espejo'],
  [['A'], 'Marcar inicio del tramo'],
  [['B'], 'Marcar final del tramo'],
  [['L'], 'Activar / quitar bucle'],
  [['Esc'], 'Quitar tramo'],
  [['S'], 'Guardar clip'],
  [['Inicio'], 'Volver al inicio del tramo'],
  [['?'], 'Ver atajos'],
];

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Atajos de teclado" description="Para ensayar sin soltar las manos del teclado.">
      <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[auto_1fr]">
        {SHORTCUTS.map(([keys, action]) => (
          <div key={action} className="contents">
            <dt className="flex items-center gap-0.5 pt-2 sm:pt-1.5">
              {keys.map((k) => (k === '…' ? <span key={k} className="px-0.5 text-washi-subtle">…</span> : <Kbd key={k}>{k}</Kbd>))}
            </dt>
            <dd className="pb-2 text-sm text-washi-muted sm:py-1.5">{action}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
