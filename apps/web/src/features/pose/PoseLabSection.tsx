import { lazy, Suspense, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Spinner } from '@/components/ui/Spinner';

// The lab and its models load only when opened: nothing of it is in Ajustes' own download.
const PoseLab = lazy(() => import('./PoseLab'));

/** Ajustes › Análisis de postura (prueba): 5.5 paso 1, MoveNet and MediaPipe timed on this device. */
export function PoseLabSection() {
  const [open, setOpen] = useState(false);
  return (
    <section aria-labelledby="pose-lab-title" className="sep-t px-5 pb-9 pt-7 sm:px-9">
      <SectionTitle id="pose-lab-title" glyph="眼">
        Análisis de postura (prueba)
      </SectionTitle>
      <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-washi-muted">
        Dibuja el esqueleto con dos modelos de IA sobre un vídeo de este dispositivo y mide cuánto tardan,
        para comparar móviles y portátiles. El vídeo no sale del dispositivo; los resultados se guardan aquí y
        puedes copiarlos.
      </p>
      {open ? (
        <Suspense
          fallback={
            <div className="mt-5 flex items-center gap-2 text-sm text-washi-muted">
              <Spinner className="size-4" label="Abriendo la prueba" /> Abriendo la prueba…
            </div>
          }
        >
          <PoseLab />
        </Suspense>
      ) : (
        <Button variant="secondary" className="mt-4" onClick={() => setOpen(true)}>
          Abrir la prueba
        </Button>
      )}
    </section>
  );
}
