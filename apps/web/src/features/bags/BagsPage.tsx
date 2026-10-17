import type { BagKind } from '@coverscape/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Page } from '@/components/AppShell';
import { Seal } from '@/components/Seal';
import { Button } from '@/components/ui/Button';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { useBags } from '@/data/bags';
import { useDesignVariant } from '@/features/lab/labState';
import { BagSettingsDialog } from './BagSettingsDialog';
import { BAGS_LIST_VARIANTS, BagGroup, type BagsListVariant } from './BagShelf';
import { KIND_COPY } from './drawRules';

const KIND_ORDER: BagKind[] = ['songs', 'clips', 'people'];

/** F13 · /bolsas: the group's bags, by kind, and «Nueva bolsa». */
export function BagsPage() {
  const bags = useBags();
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const list = bags.data ?? [];
  // Point 30 · the way of showing the bags chosen in the design lab on this device.
  const chosen = useDesignVariant('bags-list');
  const variant: BagsListVariant = (BAGS_LIST_VARIANTS as readonly string[]).includes(chosen)
    ? (chosen as BagsListVariant)
    : 'lista';

  return (
    // <main> already leaves room at the bottom for the floating menu button on phones (AppShell).
    <Page className="px-2.5 pb-3 pt-3 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
      <div className="paper mx-auto max-w-4xl rounded-[10px] sm:rounded-[12px]">
        <header className="flex flex-wrap items-end justify-between gap-4 px-5 pb-6 pt-6 sm:px-9 sm:pt-8">
          <div className="min-w-0">
            <h1 className="font-display text-[28px] font-bold leading-tight sm:text-[34px]">Bolsas</h1>
            <p className="mt-1 max-w-prose text-sm text-washi-subtle">
              Para sortear canciones, estribillos o personas, como en los ensayos. Son de todo el grupo.
            </p>
          </div>
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden className="size-4.5" /> Nueva bolsa
          </Button>
        </header>

        {bags.isPending ? (
          <div className="sep-t grid gap-3 px-5 py-7 sm:grid-cols-2 sm:px-9">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="skeleton h-[88px] rounded-[12px]" />
            ))}
          </div>
        ) : bags.isError && !bags.data ? (
          <div role="alert" className="sep-t px-5 py-12 text-center sm:px-9">
            <p className="font-display text-xl font-bold">No pudimos cargar las bolsas</p>
            <Button
              variant="secondary"
              className="mt-4"
              loading={bags.isFetching}
              onClick={() => void bags.refetch()}
            >
              Reintentar
            </Button>
          </div>
        ) : list.length === 0 ? (
          <div className="sep-t flex flex-col items-center px-6 py-14 text-center">
            <Seal glyph="籤" size={68} stamp />
            <h2 className="mt-6 font-display text-[26px] font-bold leading-tight">Aún no hay bolsas</h2>
            <p className="mt-3 max-w-[46ch] text-washi-muted">
              Crea una para la próxima coreo, para los estribillos de calentar o para decidir quién dirige
              hoy.
            </p>
            <Button size="lg" className="mt-7" onClick={() => setCreating(true)}>
              <Plus aria-hidden className="size-5" /> Crear la primera bolsa
            </Button>
          </div>
        ) : (
          KIND_ORDER.map((kind) => {
            const ofKind = list.filter((b) => b.kind === kind);
            if (!ofKind.length) return null;
            return (
              <section key={kind} aria-labelledby={`bags-${kind}`} className="sep-t px-5 py-7 sm:px-9">
                <SectionTitle id={`bags-${kind}`} glyph={KIND_COPY[kind].glyph} className="mb-4">
                  {KIND_COPY[kind].label}
                </SectionTitle>
                <BagGroup variant={variant} bags={ofKind} hrefFor={(bag) => `/bolsas/${bag.id}`} />
              </section>
            );
          })
        )}
      </div>
      <BagSettingsDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(bag) => navigate(`/bolsas/${bag.id}`)}
      />
    </Page>
  );
}
