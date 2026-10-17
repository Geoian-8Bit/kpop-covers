import { formatTime } from '@coverscape/shared';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronDown, ListMusic, Pencil, Play, Save, Shuffle } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { guardNav, Page } from '@/components/AppShell';
import { Seal } from '@/components/Seal';
import { useStickyBarPadding } from '@/components/stickyBarPadding';
import { Button } from '@/components/ui/Button';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Segmented } from '@/components/ui/Segmented';
import { Spinner } from '@/components/ui/Spinner';
import { bagsOfKind, useAllClips, useBagItems, useBags } from '@/data/bags';
import { CLIP_SWATCH } from '@/data/clips';
import { trackKeys, useTracks, type TrackWithCount } from '@/data/tracks';
import { useVideos } from '@/data/videos';
import { BagIcon } from '@/features/bags/BagIcon';
import { countLabel } from '@/features/bags/drawRules';
import { ClipPickList, SongPickList, toggleIn } from '@/features/bags/Pickers';
import { bagsBackend, type ClipWithVideo } from '@/lib/backend';
import { cn } from '@/lib/cn';
import { fadeUpCapped, jelly, soft } from '@/lib/motion';
import { useCrew } from '@/providers/CrewProvider';
import { useToast } from '@/providers/ToastProvider';
import { newDraft, readRoundSetup, setRoundDraft, writeRoundSetup } from './roundDraft';
import { CountStepper, RoundOptionsFields } from './RoundOptionsFields';
import {
  buildRound,
  clampCount,
  clipsForSource,
  optionsFromTrack,
  OPENED_FROM_RPD,
  optionsSummary,
  type RoundOptions,
  type RoundSource,
  type SourceKind,
} from './roundRules';
import { SaveTrackDialog } from './SaveTrackDialog';

const rowIn = fadeUpCapped(0.03, 10);
/** The mix preview shows this many rows folded; «Ver el orden completo» shows the rest. */
const PREVIEW_ROWS = 5;
const TRACKS_ID = 'tracks-title';
const TRACKS_SECTION = 'pistas-guardadas';

/** F14 · /rpd: build a round (from a bag, by hand, or from songs), see its order, play it or keep it as a track. */
export function RpdPage() {
  const tracks = useTracks();
  const saved = tracks.data?.length ?? 0;
  return (
    <Page className="px-2.5 py-3 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
      <div className="paper mx-auto max-w-4xl rounded-[10px] sm:rounded-[12px]">
        <header className="flex flex-wrap items-end gap-x-4 gap-y-2 px-5 pb-5 pt-6 sm:px-9 sm:pt-8">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[28px] font-bold leading-tight sm:text-[34px]">
              Random Play Dance
            </h1>
            <p className="mt-1 max-w-prose text-sm text-washi-subtle">
              Estribillos al azar, uno detrás de otro. Se ve de lejos: ponlo en la tele.
            </p>
          </div>
          {saved > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-11 px-3"
              onClick={() => {
                const list = document.getElementById(TRACKS_SECTION);
                const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                list?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
                list?.focus({ preventScroll: true });
              }}
            >
              <ListMusic aria-hidden className="size-4.5" /> Pistas guardadas ({saved})
            </Button>
          )}
        </header>
        <RoundBuilder />
        <TrackList />
      </div>
    </Page>
  );
}

function RoundBuilder() {
  const { activeCrew } = useCrew();
  const clips = useAllClips();
  const bags = useBags();
  const videos = useVideos(activeCrew?.id);
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const ids = useId();
  // The last setup on this device: same source and options as last time.
  const [initial] = useState(readRoundSetup);
  const [kind, setKind] = useState<SourceKind>(initial.kind);
  const clipBags = bagsOfKind(bags.data, 'clips');
  const [bagId, setBagId] = useState<string | null>(initial.bagId);
  const chosenBag = clipBags.find((b) => b.id === bagId) ?? clipBags[0];
  const bagItems = useBagItems(kind === 'bag' ? chosenBag?.id : undefined);
  const [manual, setManual] = useState<Set<string>>(() => new Set(initial.clipIds));
  const [songs, setSongs] = useState<Set<string>>(() => new Set(initial.videoIds));
  const [options, setOptions] = useState<RoundOptions>(initial.options);
  const [moreOpen, setMoreOpen] = useState(false);
  const [fullOrder, setFullOrder] = useState(false);
  const [seed, setSeed] = useState(0);
  const [saving, setSaving] = useState(false);
  // The pinned «Empezar» bar: focus scrolled to the bottom edge is never left under it (WCAG 2.4.11).
  const startBarRef = useRef<HTMLDivElement>(null);
  useStickyBarPadding(startBarRef, true, 0);

  useEffect(() => {
    writeRoundSetup({ kind, bagId, clipIds: [...manual], videoIds: [...songs], options });
  }, [kind, bagId, manual, songs, options]);

  const all = clips.data ?? [];
  const clipCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of all) m.set(c.video_id, (m.get(c.video_id) ?? 0) + 1);
    return m;
  }, [all]);
  const songsWithClips = useMemo(
    () => (videos.data ?? []).filter((v) => clipCounts.has(v.id)),
    [videos.data, clipCounts],
  );

  const source: RoundSource =
    kind === 'bag'
      ? { kind: 'bag', bagId: chosenBag?.id ?? '' }
      : kind === 'manual'
        ? { kind: 'manual', clipIds: [...manual] }
        : { kind: 'songs', videoIds: [...songs] };
  const bagClipIds = (bagItems.data ?? [])
    .filter((i) => i.removed_at == null && i.clip_id)
    .map((i) => i.clip_id!);
  const pool = clipsForSource(source, all, bagClipIds);
  const chosenSongs = songsWithClips.filter((v) => songs.has(v.id)).length;
  const fromLabel =
    kind === 'bag'
      ? `Bolsa «${chosenBag?.name ?? ''}»`
      : kind === 'manual'
        ? 'Selección a mano'
        : countLabel('songs', chosenSongs);

  // The mix follows the choice: a new pool or count mixes again by itself, «Volver a mezclar» on demand. Kept in
  // state (set while rendering when its key changes), so a re-render never reshuffles behind the user's back.
  const count = clampCount(options.count, pool.length);
  const mixKey = `${pool.map((c) => c.id).join(',')}|${count}|${seed}`;
  const [mixed, setMixed] = useState<{ key: string; round: ClipWithVideo[] }>({ key: '', round: [] });
  if (pool.length > 0 && mixed.key !== mixKey) setMixed({ key: mixKey, round: buildRound(pool, count) });
  const round = pool.length > 0 && mixed.key === mixKey ? mixed.round : [];
  const shown = fullOrder ? round : round.slice(0, PREVIEW_ROWS);

  function start() {
    if (!round.length) return;
    setRoundDraft(
      newDraft(
        round.map((c) => c.id),
        options,
        fromLabel,
      ),
    );
    navigate('/rpd/jugar', { state: OPENED_FROM_RPD });
  }

  const loading = clips.isPending || bags.isPending;
  // The pool is still on its way while a newly chosen bag's items load (the bag picker itself stays on screen).
  const poolLoading = loading || (kind === 'bag' && chosenBag != null && bagItems.isPending);
  const countLabelId = `${ids}-count`;
  const moreId = `${ids}-more`;

  return (
    <section aria-labelledby="new-round" className="sep-t px-5 pt-7 sm:px-9">
      <SectionTitle id="new-round" glyph="舞" className="mb-4">
        Nueva ronda
      </SectionTitle>

      {/* 1 · Where the clips come from */}
      <p className="mb-1.5 text-[13px] font-medium text-washi-muted">De dónde salen los clips</p>
      <Segmented
        label="De dónde salen los clips"
        layoutId="rpd-source"
        value={kind}
        onChange={(k) => setKind(k)}
        options={[
          { value: 'bag', label: 'Una bolsa' },
          { value: 'manual', label: 'A mano' },
          { value: 'songs', label: 'Canciones' },
        ]}
      />

      <div className="mt-3">
        {loading ? (
          <div className="grid place-items-center py-8">
            <Spinner className="size-7 text-kin-300" />
          </div>
        ) : kind === 'bag' ? (
          clipBags.length === 0 ? (
            <p className="text-sm leading-relaxed text-washi-muted">
              No hay bolsas de clips.{' '}
              <Link to="/bolsas" onClick={guardNav} className="font-medium text-kin-300 hover:underline">
                Crea una en Bolsas
              </Link>{' '}
              o elige los clips a mano.
            </p>
          ) : (
            <div role="radiogroup" aria-label="Bolsa de clips" className="grid gap-2 sm:grid-cols-2">
              {clipBags.map((b) => {
                const on = b.id === chosenBag?.id;
                return (
                  <motion.button
                    key={b.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setBagId(b.id)}
                    whileTap={{ scale: 0.97 }}
                    transition={jelly}
                    className={cn(
                      'flex min-h-14 min-w-0 items-center gap-3 rounded-[12px] border px-3 py-2 text-left transition-colors',
                      on ? 'border-ai-400/70 bg-ai-800/45' : 'border-line hover:border-line-strong',
                    )}
                  >
                    <BagIcon className={on ? 'text-kin-300' : 'text-washi-subtle'} />
                    <span className="min-w-0">
                      <span className="block truncate font-bold text-washi">{b.name}</span>
                      <span className="block text-[12px] text-washi-subtle">
                        {countLabel('clips', b.items)}
                      </span>
                    </span>
                  </motion.button>
                );
              })}
            </div>
          )
        ) : kind === 'manual' ? (
          <div className="well max-h-[min(360px,50dvh)] overflow-y-auto rounded-[12px] p-2">
            <ClipPickList
              items={all}
              selected={manual}
              onToggle={(c) => setManual((s) => toggleIn(s, c.id))}
              emptyText="Aún no hay clips. Guarda alguno en el estudio."
            />
          </div>
        ) : (
          <div className="well max-h-[min(360px,50dvh)] overflow-y-auto rounded-[12px] p-2">
            <SongPickList
              items={songsWithClips}
              selected={songs}
              onToggle={(v) => setSongs((s) => toggleIn(s, v.id))}
              emptyText="Ninguna canción tiene clips todavía."
            />
          </div>
        )}
      </div>

      {/* 2 · How many */}
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <p id={countLabelId} className="text-[15px] font-bold text-washi">
          Cuántos clips
        </p>
        <CountStepper
          value={options.count}
          available={Math.max(1, pool.length)}
          onChange={(n) => setOptions((o) => ({ ...o, count: n }))}
          labelledBy={countLabelId}
        />
        <p className="text-[13px] text-washi-subtle">
          {pool.length ? `de ${pool.length} para elegir` : poolLoading ? 'Cargando…' : 'Elige de dónde salen los clips.'}
        </p>
      </div>

      {/* 3 · The mix */}
      {round.length > 0 && (
        <div className="mt-5">
          <p className="mb-1.5 text-[13px] font-bold uppercase tracking-[0.08em] text-washi-subtle">
            El orden
          </p>
          <motion.ol key={mixed.key} initial="hidden" animate="show" className="space-y-0.5">
            {shown.map((clip, i) => (
              <motion.li
                key={clip.id}
                variants={rowIn}
                custom={i}
                className="flex min-h-10 items-center gap-3 rounded-[10px] px-1 py-1"
              >
                <span className="tabular w-5 shrink-0 text-right font-mono text-[13px] text-washi-subtle">
                  {i + 1}
                </span>
                <span
                  aria-hidden
                  className={cn('size-5 shrink-0 rotate-[-3deg] rounded-[5px]', CLIP_SWATCH[clip.color].dot)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium text-washi">
                    {clip.video?.title}
                  </span>
                  <span className="tabular block truncate text-[12px] text-washi-subtle">
                    {clip.name} · {formatTime(clip.start_seconds)}–{formatTime(clip.end_seconds)}
                  </span>
                </span>
              </motion.li>
            ))}
          </motion.ol>
          <div className="mt-2 flex flex-wrap gap-x-1 gap-y-1">
            {round.length > PREVIEW_ROWS && (
              <Button variant="ghost" size="sm" className="h-11 px-3" onClick={() => setFullOrder((v) => !v)}>
                {fullOrder ? 'Ver menos' : `Ver el orden completo (${round.length})`}
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-11 px-3" onClick={() => setSeed((s) => s + 1)}>
              <Shuffle aria-hidden className="size-4.5" /> Volver a mezclar
            </Button>
            <Button variant="ghost" size="sm" className="h-11 px-3" onClick={() => setSaving(true)}>
              <Save aria-hidden className="size-4.5" /> Guardar como pista
            </Button>
          </div>
        </div>
      )}

      {/* 4 · Everything else, folded with a one-line summary */}
      <div className="mt-5 rounded-[12px] border border-line">
        <button
          type="button"
          aria-expanded={moreOpen}
          aria-controls={moreId}
          onClick={() => setMoreOpen((v) => !v)}
          className="flex min-h-14 w-full min-w-0 items-center gap-3 rounded-[12px] px-4 py-2.5 text-left hover:bg-washi/[0.04]"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold text-washi">Más opciones</span>
            <span className="block text-[12px] leading-snug text-washi-subtle">{optionsSummary(options)}</span>
          </span>
          <motion.span
            aria-hidden
            animate={{ rotate: moreOpen ? 180 : 0 }}
            transition={reduce ? { duration: 0 } : jelly}
            className="shrink-0 text-washi-subtle"
          >
            <ChevronDown className="size-5" />
          </motion.span>
        </button>
        <AnimatePresence initial={false}>
          {moreOpen && (
            <motion.div
              id={moreId}
              key="more"
              initial={{ opacity: 0, y: reduce ? 0 : -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={reduce ? { duration: 0.15 } : soft}
              className="px-4 pb-4 pt-1"
            >
              <RoundOptionsFields
                idPrefix="rpd-new"
                value={options}
                onChange={(patch) => setOptions((o) => ({ ...o, ...patch }))}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* «Empezar», always at hand: pinned to the bottom (above the home bar) while the builder is on screen. The
          right edge leaves room for a floating corner button if the shell has one (`--fab-clearance`). */}
      <div ref={startBarRef} className="sticky bottom-0 z-20 -mx-5 mt-6 border-t border-line bg-sumi-850 px-5 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 sm:-mx-9 sm:px-9">
        <div className="flex items-center gap-3 max-lg:pr-[var(--fab-clearance,0px)]">
          <p className="min-w-0 flex-1 text-[13px] leading-snug text-washi-muted">
            {round.length ? (
              <>
                <span className="block font-bold text-washi">{countLabel('clips', round.length)}</span>
                <span className="block truncate">{fromLabel}</span>
              </>
            ) : poolLoading ? (
              'Cargando…'
            ) : (
              'Elige de dónde salen los clips.'
            )}
          </p>
          <Button size="lg" onClick={start} disabled={!round.length} className="min-w-[9.5rem]">
            <Play aria-hidden className="size-5" /> Empezar
          </Button>
        </div>
      </div>

      <SaveTrackDialog
        open={saving}
        onClose={() => setSaving(false)}
        clipIds={round.map((c) => c.id)}
        options={{ ...options, count: round.length || options.count }}
      />
    </section>
  );
}

function TrackList() {
  const tracks = useTracks();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [opening, setOpening] = useState<string | null>(null);

  async function play(track: TrackWithCount) {
    setOpening(track.id);
    try {
      const items = await queryClient.fetchQuery({
        queryKey: trackKeys.items(track.id),
        queryFn: () => bagsBackend.listTrackItems(track.id),
      });
      const clipIds = items.map((i) => i.clip_id);
      // The list's count may be behind (someone emptied it meanwhile): no empty round.
      if (!clipIds.length) {
        toast('Esta pista ya no tiene clips.', 'info');
        void queryClient.invalidateQueries({ queryKey: trackKeys.all });
        return;
      }
      setRoundDraft(
        newDraft(clipIds, optionsFromTrack(track, clipIds.length), `Pista «${track.name}»`, track.id),
      );
      navigate('/rpd/jugar', { state: OPENED_FROM_RPD });
    } catch {
      toast('No se pudo abrir la pista. Revisa la conexión.', 'error');
    } finally {
      setOpening(null);
    }
  }

  return (
    <section
      id={TRACKS_SECTION}
      tabIndex={-1}
      aria-labelledby={TRACKS_ID}
      className="sep-t scroll-mt-20 px-5 pb-9 pt-7 focus:outline-none sm:px-9"
    >
      <SectionTitle id={TRACKS_ID} glyph="帖" className="mb-4">
        Pistas guardadas
      </SectionTitle>
      {tracks.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="skeleton h-14 rounded-[12px]" />
          ))}
        </div>
      ) : !tracks.data?.length ? (
        <div className="flex items-center gap-4 py-2">
          <Seal glyph="舞" size={40} />
          <p className="text-sm leading-relaxed text-washi-muted">
            Ninguna todavía. Pulsa «Guardar como pista» en una mezcla para repetirla otro día.
          </p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {tracks.data.map((track) => (
            <li
              key={track.id}
              className="flex min-w-0 items-center gap-2 rounded-[12px] border border-line bg-sumi-900/50 py-1.5 pl-4 pr-1.5"
            >
              <Link
                to={`/rpd/pista/${track.id}`}
                onClick={guardNav}
                className="group flex min-h-11 min-w-0 flex-1 items-center gap-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-[16px] font-bold text-washi">
                    {track.name}
                  </span>
                  <span className="block truncate text-[12px] text-washi-subtle">
                    {countLabel('clips', track.items)} · pausa {Number(track.pause_seconds)} s
                    {track.countdown ? ' · cuenta atrás' : ''}
                    {track.title_mode === 'after' ? ' · adivinar' : ''}
                  </span>
                </span>
                <Pencil aria-hidden className="size-4 shrink-0 text-washi-subtle group-hover:text-washi" />
                <span className="sr-only">Editar</span>
              </Link>
              <Button
                variant="secondary"
                size="icon"
                aria-label={`Reproducir ${track.name}`}
                loading={opening === track.id}
                disabled={track.items === 0}
                onClick={() => void play(track)}
              >
                {opening === track.id ? null : <Play className="size-4.5" />}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
