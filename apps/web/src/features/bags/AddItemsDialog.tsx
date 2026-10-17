import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { YouTubePicker, type YouTubePick, type YouTubePickerHandle } from '@/components/YouTubePicker';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { Spinner } from '@/components/ui/Spinner';
import {
  bagError,
  itemRef,
  useAddBagItem,
  useAllClips,
  type BagItemView,
  type BagWithCount,
} from '@/data/bags';
import { useMembers } from '@/data/members';
import { useVideos } from '@/data/videos';
import { useCrew } from '@/providers/CrewProvider';
import { useToast } from '@/providers/ToastProvider';
import { countLabel, KIND_COPY } from './drawRules';
import { ClipPickList, MemberPickList, SongPickList, toggleIn } from './Pickers';
import {
  SONG_ARTIST_MAX,
  SONG_TITLE_MAX,
  songYoutubeId,
  youtubeSongRow,
  youtubeSongStatus,
} from './songRules';

type SongTab = 'library' | 'youtube';

/**
 * «Añadir» inside a bag: songs from the library or straight from YouTube (point 28: those live only in the bag),
 * clips, or the group's people.
 */
export function AddItemsDialog({
  open,
  onClose,
  bag,
  items,
}: {
  open: boolean;
  onClose: () => void;
  bag: BagWithCount;
  items: BagItemView[];
}) {
  const { activeCrew } = useCrew();
  const videos = useVideos(activeCrew?.id, { enabled: open && bag.kind === 'songs' });
  const clips = useAllClips(open && bag.kind === 'clips');
  const members = useMembers();
  const add = useAddBagItem();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<SongTab>('library');
  useEffect(() => {
    if (open) setSelected(new Set());
  }, [open]);

  // Already in the bag: by reference, and library songs whose YouTube video is in it as a YouTube song.
  const taken = useMemo(() => {
    const set = new Set(items.map(itemRef));
    const inBag = new Set(items.map(songYoutubeId).filter(Boolean));
    for (const v of videos.data ?? []) if (v.youtube_id && inBag.has(v.youtube_id)) set.add(v.id);
    return set;
  }, [items, videos.data]);

  async function save() {
    const ids = [...selected];
    if (!ids.length) return onClose();
    const results = await Promise.allSettled(
      ids.map((id) =>
        add.mutateAsync(
          bag.kind === 'songs'
            ? { bag_id: bag.id, video_id: id }
            : bag.kind === 'clips'
              ? { bag_id: bag.id, clip_id: id }
              : { bag_id: bag.id, member_id: id },
        ),
      ),
    );
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed.length) toast(bagError(failed[0]!.reason), 'error');
    else toast(`${countLabel(bag.kind, ids.length)} en la bolsa`, 'success');
    onClose();
  }

  const youtube = bag.kind === 'songs' && tab === 'youtube';
  const loading =
    (bag.kind === 'songs' && tab === 'library' && videos.isPending) ||
    (bag.kind === 'clips' && clips.isPending) ||
    (bag.kind === 'people' && members.isPending);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={add.isPending}
      title={`Añadir ${KIND_COPY[bag.kind].many}`}
      description={`A «${bag.name}».`}
      footer={
        youtube ? (
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={add.isPending}>
              Hecho
            </Button>
            <Button type="submit" form="bag-youtube-song" loading={add.isPending}>
              Añadir a la bolsa
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-2">
            <span className="mr-auto text-[13px] text-washi-subtle" aria-live="polite">
              {selected.size ? `${selected.size} elegidos` : ''}
            </span>
            <Button variant="ghost" onClick={onClose} disabled={add.isPending}>
              Cancelar
            </Button>
            <Button onClick={() => void save()} loading={add.isPending} disabled={!selected.size}>
              Añadir
            </Button>
          </div>
        )
      }
    >
      {bag.kind === 'songs' && (
        <Segmented
          label="De dónde salen las canciones"
          layoutId={`bag-add-${bag.id}`}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'library', label: 'Biblioteca' },
            { value: 'youtube', label: 'Buscar en YouTube' },
          ]}
          className="mb-4 flex w-full [&>button]:flex-1"
        />
      )}
      {youtube ? (
        <YouTubeSongForm bag={bag} items={items} library={videos.data ?? []} open={open} add={add} />
      ) : loading ? (
        <div className="grid place-items-center py-10">
          <Spinner className="size-7 text-kin-300" />
        </div>
      ) : bag.kind === 'songs' ? (
        <SongPickList
          items={videos.data ?? []}
          selected={selected}
          taken={taken}
          onToggle={(v) => setSelected((s) => toggleIn(s, v.id))}
          emptyText="La biblioteca está vacía. Busca la canción en YouTube."
        />
      ) : bag.kind === 'clips' ? (
        <ClipPickList
          items={clips.data ?? []}
          selected={selected}
          taken={taken}
          onToggle={(c) => setSelected((s) => toggleIn(s, c.id))}
          emptyText="Aún no hay clips. Guarda uno en el estudio."
        />
      ) : (
        <MemberPickList
          items={members.data ?? []}
          selected={selected}
          taken={taken}
          onToggle={(m) => setSelected((s) => toggleIn(s, m.id))}
          emptyText="Aún no hay nadie en el grupo. Añadid vuestros nombres en Ajustes."
        />
      )}
    </Dialog>
  );
}

/**
 * Point 28 · «Buscar en YouTube»: the shared picker; the song goes into this bag only (no library video). One
 * already in the library goes in as the library song; one already in the bag can't go again. After adding, the
 * field clears for the next one. It uses the dialog's mutation, so the footer button and the dialog's busy state
 * follow it; a ref stops a double tap from sending twice before the next render.
 */
function YouTubeSongForm({
  bag,
  items,
  library,
  open,
  add,
}: {
  bag: BagWithCount;
  items: BagItemView[];
  library: { id: string; youtube_id: string | null }[];
  open: boolean;
  add: ReturnType<typeof useAddBagItem>;
}) {
  const sending = useRef(false);
  const toast = useToast();
  const picker = useRef<YouTubePickerHandle>(null);
  const [text, setText] = useState('');
  const [pick, setPick] = useState<YouTubePick | null>(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [error, setError] = useState<string | null>(null);
  const touched = useRef(false);

  useEffect(() => {
    if (!open) return;
    setText('');
    setPick(null);
    setTitle('');
    setArtist('');
    setError(null);
    touched.current = false;
  }, [open]);

  const status = pick ? youtubeSongStatus(pick.youtubeId, items, library) : null;

  function onPick(next: YouTubePick) {
    setPick(next);
    setError(null);
    if (!touched.current) {
      setTitle(next.title);
      setArtist(next.channel);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!pick) {
      // Enter on a search: run it instead.
      picker.current?.search();
      return;
    }
    if (status?.status === 'in-bag') return;
    const row =
      status?.status === 'in-library'
        ? { video_id: status.videoId }
        : youtubeSongRow({
            youtubeId: pick.youtubeId,
            title,
            artist,
            thumbnailUrl: pick.thumbnailUrl,
            durationSeconds: pick.durationSeconds,
          });
    if (!row) {
      setError('Ponle un título a la canción.');
      return;
    }
    if (sending.current) return;
    sending.current = true;
    try {
      await add.mutateAsync({ bag_id: bag.id, ...row });
      toast(
        status?.status === 'in-library'
          ? `«${title.trim() || 'La canción'}» ya estaba en la biblioteca: añadida a la bolsa`
          : `«${title.trim()}» en la bolsa`,
        'success',
      );
      touched.current = false;
      setText('');
      setPick(null);
      setTitle('');
      setArtist('');
      picker.current?.focus();
    } catch (err) {
      setError(bagError(err));
    } finally {
      sending.current = false;
    }
  }

  return (
    <form id="bag-youtube-song" onSubmit={(e) => void onSubmit(e)} noValidate className="space-y-4">
      <YouTubePicker
        ref={picker}
        autoFocus
        value={text}
        onValueChange={setText}
        onPick={onPick}
        onClear={() => setPick(null)}
        label="Buscar en YouTube o pegar enlace"
        hint="Se queda solo en esta bolsa. Si sale en el sorteo, podrás añadirla a la biblioteca."
        error={status?.status === 'in-bag' ? 'Esta canción ya está en la bolsa.' : null}
        badgeFor={(id) => {
          const s = youtubeSongStatus(id, items, library);
          return s.status === 'in-bag'
            ? { label: 'Ya en la bolsa', tone: 'warn' }
            : s.status === 'in-library'
              ? { label: 'En la biblioteca', tone: 'info' }
              : null;
        }}
      />
      {pick && status?.status === 'new' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Título"
            value={title}
            maxLength={SONG_TITLE_MAX}
            onChange={(e) => {
              touched.current = true;
              setTitle(e.target.value);
            }}
            error={error}
          />
          <Field
            label="Artista o grupo (opcional)"
            value={artist}
            maxLength={SONG_ARTIST_MAX}
            onChange={(e) => {
              touched.current = true;
              setArtist(e.target.value);
            }}
          />
        </div>
      )}
      {pick && status?.status === 'in-library' && (
        <p className="text-[13px] text-washi-muted">
          Ya está en la biblioteca: se añade la de la biblioteca, con sus clips.
        </p>
      )}
      {error && status?.status !== 'new' && (
        <p role="alert" className="text-[13px] text-shu-300">
          {error}
        </p>
      )}
    </form>
  );
}
