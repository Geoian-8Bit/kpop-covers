import { useRef } from 'react';
import { Link } from 'react-router';
import { guardNav } from '@/components/AppShell';
import { Seal } from '@/components/Seal';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useAllClips } from '@/data/bags';
import { PerfProbe } from '@/lib/perfProbe';
import { useRoundDraft } from './roundDraft';
import { ROOT, useInertOutside } from './roundLayer';
import { RoundRunner } from './RoundRunner';
import { useFullscreenRound } from './useFullscreenRound';

// REQ-27 · The page only picks what to show; the round itself is RoundRunner.tsx (and the modules beside it).

/** F14 · /rpd/jugar: the round on a screen made to be seen from across the room. */
export function RpdPlayPage() {
  const draft = useRoundDraft((s) => s.draft);
  const clips = useAllClips();
  // Out here, above the runner's `key`: «Volver a mezclar» remounts the runner but stays in full screen.
  const fullscreen = useFullscreenRound();

  if (!draft || draft.clipIds.length === 0) {
    return (
      <Shell>
        <div className="grid min-h-[60dvh] place-items-center p-6 text-center">
          <div>
            <Seal glyph="舞" size={64} stamp />
            <h1 className="mt-5 font-display text-2xl font-bold">No hay ninguna ronda preparada</h1>
            <p className="mt-2 text-washi-muted">Crea una ronda o abre una pista guardada.</p>
            <Link
              to="/rpd"
              onClick={guardNav}
              className="mt-6 inline-flex h-12 items-center rounded-[10px] bg-washi px-5 font-bold text-sumi-900"
            >
              Ir a Random Play Dance
            </Link>
          </div>
        </div>
      </Shell>
    );
  }
  if (!clips.data) {
    return (
      <Shell>
        <div className="grid min-h-[60dvh] place-items-center" role="status">
          {clips.isError ? (
            <div className="text-center">
              <p className="text-washi-muted">No se pudieron cargar los clips.</p>
              <Button className="mt-3" variant="secondary" onClick={() => void clips.refetch()}>
                Reintentar
              </Button>
            </div>
          ) : (
            <Spinner className="size-8 text-kin-300" label="Cargando la ronda" />
          )}
        </div>
      </Shell>
    );
  }
  return (
    <PerfProbe id="RoundRunner">
      <RoundRunner
        key={`${draft.mix ?? 0}:${draft.clipIds.join(',')}`}
        draft={draft}
        all={clips.data}
        fullscreen={fullscreen}
      />
    </PerfProbe>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useInertOutside(ref);
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label="Random Play Dance" className={ROOT}>
      {children}
    </div>
  );
}
