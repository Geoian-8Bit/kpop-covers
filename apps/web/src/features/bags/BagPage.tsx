import { Link, useParams } from 'react-router';
import { guardNav, Page } from '@/components/AppShell';
import { Spinner } from '@/components/ui/Spinner';
import { useBagDraws, useBagItems, useBags } from '@/data/bags';

import { BagView } from './BagView';

export { shownFor } from './bagVisibility';

/** F13 · /bolsas/:bagId: draw, the items in and out of the bag, the history. */
export function BagPage() {
  const { bagId } = useParams();
  const bags = useBags();
  // REQ-18 · The items and the history start loading with the list, not after it (same keys as BagView's own calls).
  useBagItems(bagId);
  useBagDraws(bagId);
  const bag = bags.data?.find((b) => b.id === bagId);

  if (bags.isPending) {
    return (
      <Page className="grid min-h-[60dvh] place-items-center">
        <Spinner className="size-8 text-kin-300" label="Cargando la bolsa" />
      </Page>
    );
  }
  if (!bag) {
    return (
      <Page className="px-2.5 py-3 sm:px-5 sm:py-5">
        <div className="paper mx-auto max-w-xl rounded-[12px] px-6 py-12 text-center">
          <h1 className="font-display text-2xl font-bold">
            {bags.isError ? 'No pudimos cargar la bolsa' : 'Esta bolsa ya no existe'}
          </h1>
          <p className="mt-2 text-washi-muted">
            {bags.isError ? 'Revisa la conexión.' : 'Puede que otro móvil la haya borrado.'}
          </p>
          <Link
            to="/bolsas"
            onClick={guardNav}
            className="mt-6 inline-flex min-h-11 items-center font-bold text-kin-300 hover:underline"
          >
            Volver a las bolsas
          </Link>
        </div>
      </Page>
    );
  }
  return <BagView key={bag.id} bag={bag} />;
}
