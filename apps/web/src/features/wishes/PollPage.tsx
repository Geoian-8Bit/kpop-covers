import { PerfProbe } from '@/lib/perfProbe';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { guardNav, Page } from '@/components/AppShell';
import { Spinner } from '@/components/ui/Spinner';
import { usePolls } from '@/data/wishes';
import { PollView } from './PollView';

/** F11 · /deseos/votacion/:pollId: vote, results, closing, tie-break and the winner. */
export function PollPage() {
  const { pollId } = useParams();
  const polls = usePolls();
  const poll = polls.data?.find((p) => p.id === pollId);

  if (polls.isPending) {
    return (
      <Page className="grid min-h-[60dvh] place-items-center">
        <Spinner className="size-8 text-kin-300" />
      </Page>
    );
  }
  if (!poll) {
    return (
      <Page className="px-2.5 py-3 sm:px-5 sm:py-5">
        <div className="paper mx-auto max-w-3xl rounded-[12px] px-6 py-14 text-center">
          <p className="font-display text-xl font-bold">
            {polls.isError ? 'No pudimos cargar la votación' : 'Esta votación ya no existe'}
          </p>
          <Link
            to="/deseos?tab=votaciones"
            onClick={guardNav}
            className="mt-5 inline-flex min-h-11 items-center gap-2 font-bold text-kin-300 hover:underline"
          >
            <ArrowLeft aria-hidden className="size-4" /> Volver a las votaciones
          </Link>
        </div>
      </Page>
    );
  }
  return (
    <PerfProbe id="PollView">
      <PollView key={poll.id} poll={poll} polls={polls.data ?? []} />
    </PerfProbe>
  );
}
