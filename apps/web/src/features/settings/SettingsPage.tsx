import { Page } from '@/components/AppShell';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { DesignLabSection } from '@/features/lab/DesignLabSection';
import { PoseLabSection } from '@/features/pose/PoseLabSection';
import { MembersSection } from '@/features/members/MembersUI';

/** Ajustes: what lives on this device and, at the end, the design lab. One sheet, like every page. */
export function SettingsPage() {
  return (
    <Page className="px-2.5 py-3 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
      <div className="paper mx-auto max-w-3xl rounded-[10px] sm:rounded-[12px]">
        <header className="px-5 pb-6 pt-6 sm:px-9 sm:pt-8">
          <h1 className="font-display text-[28px] font-bold leading-tight sm:text-[34px]">Ajustes</h1>
          <p className="mt-1 text-sm text-washi-subtle">Los miembros son de todo el grupo; lo demás solo afecta a este dispositivo.</p>
        </header>

        <section aria-labelledby="device-title" className="sep-t px-5 py-7 sm:px-9">
          <SectionTitle id="device-title" glyph="手元">
            Este dispositivo
          </SectionTitle>
          <div className="mt-3 max-w-prose space-y-2 text-[15px] leading-relaxed text-washi-muted">
            <p>
              En este móvil u ordenador se guardan tus preferencias (espejo, bucle, sonido del metrónomo), los
              vídeos que abriste hace poco, las copias de los archivos grandes que subiste, las tomas que
              grabas con la cámara y lo que elijas en el laboratorio de diseño.
            </p>
            <p>Nada de esto lo ve el resto del grupo. Si borras los datos del navegador, se pierde.</p>
          </div>
        </section>

        <MembersSection />

        <DesignLabSection />

        <PoseLabSection />
      </div>
    </Page>
  );
}
