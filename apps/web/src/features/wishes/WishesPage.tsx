import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Page } from '@/components/AppShell';
import { usePolls } from '@/data/wishes';
import { useClosingNow } from './identity';
import { PollFormDialog, type PollPreset } from './PollFormDialog';
import { isPollClosed } from './pollRules';
import { WishFormDialog } from './WishFormDialog';

import { PollList } from './PollList';
import { WishList } from './WishList';
import { ProposeBar, Tabs, type Tab } from './WishesTabs';

/**
 * F12 + F11 · /deseos: «Próxima cover». Phone first (37): «Proponer» (search YouTube) on top, the open votes
 * right under it, then the wish list by interest with «Me apunto» on every card; the votes' history in its tab.
 */
export function WishesPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'votaciones' ? 'votaciones' : 'deseos';
  const [proposing, setProposing] = useState(false);
  const [pollPreset, setPollPreset] = useState<PollPreset | null>(null);
  const [pollOpen, setPollOpen] = useState(false);
  const polls = usePolls();
  // REQ-22 · Moves only when a vote really closes by time.
  const now = useClosingNow(polls.data);
  const openPolls = useMemo(() => (polls.data ?? []).filter((p) => !isPollClosed(p, now)), [polls.data, now]);

  function openPoll(preset: PollPreset | null) {
    setPollPreset(preset);
    setPollOpen(true);
  }

  return (
    <Page className="px-2.5 py-3 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
      <div className="paper mx-auto max-w-4xl rounded-[10px] sm:rounded-[12px]">
        <header className="px-4 pb-4 pt-5 sm:px-9 sm:pt-8">
          <h1 className="font-display text-[28px] font-bold leading-tight sm:text-[34px]">Próxima cover</h1>
          <ProposeBar onClick={() => setProposing(true)} />
        </header>

        <Tabs
          value={tab}
          openCount={openPolls.length}
          onChange={(next) => setParams(next === 'deseos' ? {} : { tab: next }, { replace: true })}
        />

        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === 'deseos' ? (
            <WishList
              openPolls={openPolls}
              onPropose={() => setProposing(true)}
              onCreatePoll={(wishIds) => openPoll({ wishIds })}
              onAllPolls={() => setParams({ tab: 'votaciones' }, { replace: true })}
            />
          ) : (
            <PollList onCreate={() => openPoll(null)} />
          )}
        </div>
      </div>
      <WishFormDialog open={proposing} onClose={() => setProposing(false)} />
      <PollFormDialog open={pollOpen} onClose={() => setPollOpen(false)} preset={pollPreset} />
    </Page>
  );
}
