import { formatTime } from '@coverscape/shared';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Pencil, Play, Save, Shuffle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { guardNav, Page } from '@/components/AppShell';
import { Seal } from '@/components/Seal';
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
import { newDraft, setRoundDraft } from './roundDraft';
import { RoundOptionsFields } from './RoundOptionsFields';
import {
  buildRound,
  clampCount,
  clipsForSource,
  DEFAULT_ROUND_OPTIONS,
  optionsFromTrack,
  type RoundOptions,
  type RoundSource,
} from './roundRules';
import { SaveTrackDialog } from './SaveTrackDialog';

type SourceKind = RoundSource['kind'];
const rowIn = fadeUpCapped(0.03, 10);

/** F14 · /rpd: build a round (from a bag, by hand, or from songs), see its order, play it or keep it as a track. */
export function RpdPage() {
  return (
    <Page className="px-2.5 py-3 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
      <div className="paper mx-auto max-w-4xl rounded-[10px] sm:rounded-[12px]">
        <header className="px-5 pb-6 pt-6 sm:px-9 sm:pt-8">
          <h1 className="font-display text-[28px] font-bold leading-tight sm:text-[34px]">
            Random Play Dance
          </h1>
          <p className="mt-1 max-w-prose text-sm text-washi-subtle">
            Estribillos al azar, uno detrás de otro, para calentar o para jugar. La pantalla se ve de lejos:
            ponla en la tele del local.
          </p>
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
  const [kind, setKind] = useState<SourceKind>('bag');
  const clipBags = bagsOfKind(bags.data, 'clips');
  const [bagId, setBagId] = useState<string | null>(null);
  const chosenBag = clipBags.find((b) => b.id === bagId) ?? clipBags[0];
  const bagItems = useBagItems(kind === 'bag' ? chosenBag?.id : undefined);
  const [manual, setManual] = useState<Set<string>>(new Set());
  const [songs, setSongs] = useState<Set<string>>(new Set());
  const [options, setOptions] = useState<RoundOptions>(DEFAULT_ROUND_OPTIONS);
  const [round, setRound] = useState<ClipWithVideo[] | null>(null);
  const [saving, setSaving] = useState(false);

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
  const fromLabel =
    kind === 'bag'
      ? `Bolsa «${chosenBag?.name ?? ''}»`
      : kind === 'manual'
        ? 'Selección a mano'
        : `${countLabel('songs', songs.size)}`;

  function mix() {
    if (!pool.length) return;
    setRound(buildRound(pool, clampCount(options.count, pool.length)));
  }

  function start() {
    if (!round?.length) return;
    setRoundDraft(
      newDraft(
        round.map((c) => c.id),
        options,
        fromLabel,
      ),
    );
    navigate('/rpd/jugar');
  }

  const loading = clips.isPending || bags.isPending;

  return (
    <section aria-labelledby="new-round" className="sep-t px-5 py-7 sm:px-9">
      <SectionTitle id="new-round" glyph="舞" className="mb-4">
        Nueva ronda
      </SectionTitle>

      <p className="mb-1.5 text-[13px] font-medium text-washi-muted">De dónde salen los clips</p>
      <Segmented
        label="De dónde salen los clips"
        layoutId="rpd-source"
        value={kind}
        onChange={(k) => {
          setKind(k);
          setRound(null);
        }}
        options={[
          { value: 'bag', label: 'Una bolsa' },
          { value: 'manual', label: 'A mano' },
          { value: 'songs', label: 'Canciones' },
        ]}
      />

      <div className="mt-4">
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
                    onClick={() => {
                      setBagId(b.id);
                      setRound(null);
                    }}
                    whileTap={{ scale: 0.97 }}
                    transition={jelly}
                    className={cn(
                      'flex min-h-14 items-center gap-3 rounded-[12px] border px-3 py-2 text-left transition-colors',
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
          <div className="well max-h-[360px] overflow-y-auto rounded-[12px] p-2">
            <ClipPickList
              items={all}
              selected={manual}
              onToggle={(c) => {
                setManual((s) => toggleIn(s, c.id));
                setRound(null);
              }}
              emptyText="Aún no hay clips. Guarda alguno en el estudio."
            />
          </div>
        ) : (
          <div className="well max-h-[360px] overflow-y-auto rounded-[12px] p-2">
            <SongPickList
              items={songsWithClips}
              selected={songs}
              onToggle={(v) => {
                setSongs((s) => toggleIn(s, v.id));
                setRound(null);
              }}
              emptyText="Ninguna canción tiene clips todavía."
            />
          </div>
        )}
      </div>

      <div className="mt-6">
        <RoundOptionsFields
          idPrefix="rpd-new"
          value={options}
          onChange={(patch) => setOptions((o) => ({ ...o, ...patch }))}
          count={{ max: Math.max(1, pool.length) }}
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={mix} disabled={!pool.length}>
          <Shuffle aria-hidden className="size-5" /> {round ? 'Volver a mezclar' : 'Mezclar'}
        </Button>
        <span className="text-[13px] text-washi-subtle">
          {pool.length
            ? `${countLabel('clips', pool.length)} para elegir`
            : 'Elige de dónde salen los clips.'}
        </span>
      </div>

      <AnimatePresence initial={false}>
        {round && (
          <motion.div
            key="preview"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={soft}
            className="mt-6"
          >
            <p className="mb-2 text-[13px] font-bold uppercase tracking-[0.08em] text-washi-subtle">
              El orden
            </p>
            <motion.ol
              key={round.map((c) => c.id).join()}
              initial="hidden"
              animate="show"
              className="space-y-1"
            >
              {round.map((clip, i) => (
                <motion.li
                  key={clip.id}
                  variants={rowIn}
                  custom={i}
                  className="flex items-center gap-3 rounded-[10px] px-2 py-1.5"
                >
                  <span className="tabular w-6 shrink-0 text-right font-mono text-[13px] text-washi-subtle">
                    {i + 1}
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      'size-6 shrink-0 rotate-[-3deg] rounded-[5px]',
                      CLIP_SWATCH[clip.color].dot,
                    )}
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
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="lg" onClick={start}>
                <Play aria-hidden className="size-5" /> Empezar
              </Button>
              <Button size="lg" variant="secondary" onClick={() => setSaving(true)}>
                <Save aria-hidden className="size-5" /> Guardar como pista
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <SaveTrackDialog
        open={saving}
        onClose={() => setSaving(false)}
        clipIds={round?.map((c) => c.id) ?? []}
        options={{ ...options, count: round?.length ?? options.count }}
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
      navigate('/rpd/jugar');
    } catch {
      toast('No se pudo abrir la pista. Revisa la conexión.', 'error');
    } finally {
      setOpening(null);
    }
  }

  return (
    <section aria-labelledby="tracks-title" className="sep-t px-5 pb-9 pt-7 sm:px-9">
      <SectionTitle id="tracks-title" glyph="帖" className="mb-4">
        Pistas guardadas
      </SectionTitle>
      {tracks.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="skeleton h-16 rounded-[12px]" />
          ))}
        </div>
      ) : !tracks.data?.length ? (
        <div className="flex items-center gap-4 py-2">
          <Seal glyph="舞" size={44} />
          <p className="text-sm leading-relaxed text-washi-muted">
            Ninguna todavía. Mezcla una ronda y pulsa «Guardar como pista» para repetirla otro día.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {tracks.data.map((track) => (
            <li
              key={track.id}
              className="flex items-center gap-2 rounded-[12px] border border-line bg-sumi-900/50 py-2 pl-4 pr-2"
            >
              <Link
                to={`/rpd/pista/${track.id}`}
                onClick={guardNav}
                className="group flex min-h-12 min-w-0 flex-1 items-center gap-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-[17px] font-bold text-washi">
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
