import { formatDuration, videoAspectRatio, youTubeThumbnail } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, ClipboardPaste, Search, X, Youtube } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { Field } from '@/components/ui/Field';
import { cn } from '@/lib/cn';
import { soft } from '@/lib/motion';
import { fetchYouTubeMeta, type YouTubeMetaState } from '@/lib/youtubeMeta';
import {
  nextResultIndex,
  readPickerInput,
  resultsShown,
  searchAnnouncement,
  searchErrorOf,
  searchUrl,
  type YouTubeSearchHit,
  type YouTubeSearchState,
} from './youTubePickerRules';

/** The chosen video, from a search hit or a pasted link. */
export interface YouTubePick {
  youtubeId: string;
  /** '' while a pasted link's title is still loading (or YouTube didn't give one): a second pick follows if it arrives. */
  title: string;
  /** The YouTube channel (oEmbed author for a link): usually the artist or the label. '' when unknown. */
  channel: string;
  thumbnailUrl: string;
  /** Known for search hits; null for a pasted link. */
  durationSeconds: number | null;
  via: 'search' | 'link';
  /** Width / height when known (oEmbed, or a /shorts/ link); null/undefined: unknown, shown as horizontal. */
  aspectRatio?: number | null;
}

/** A note on a result, e.g. «Ya en la biblioteca». `warn`: picking it will be refused or redirected by the form. */
export interface YouTubeBadge {
  label: string;
  tone?: 'warn' | 'info';
}

export interface YouTubePickerHandle {
  /** Runs the search for what the field holds (the form's own «Buscar» button). */
  search: () => void;
  focus: () => void;
}

export interface YouTubePickerProps {
  /** A video was chosen (again with the title once a pasted link's lookup answers). */
  onPick: (pick: YouTubePick) => void;
  /** The field no longer points at a usable video (cleared, edited, or the link can't be played). */
  onClear?: () => void;
  /** Controlled text (optional): the parent can read whether it holds a search or a link. */
  value?: string;
  onValueChange?: (text: string) => void;
  label?: string;
  placeholder?: string;
  hint?: ReactNode;
  /** Focus the field when the dialog opens (`data-autofocus`). */
  autoFocus?: boolean;
  /** A problem the parent found with the chosen video (already proposed…), shown on the field. */
  error?: string | null;
  badgeFor?: (youtubeId: string) => YouTubeBadge | null;
  /** The chosen video's card under the field (default on). */
  preview?: boolean;
  /** A search is running (the parent's «Buscar» button can spin). */
  onSearchingChange?: (searching: boolean) => void;
  ref?: Ref<YouTubePickerHandle>;
  className?: string;
}

/** A pasted link's title lookup that hangs must not block the form: after this it goes on without a title. */
const META_TIMEOUT_MS = 8000;

/**
 * Searches YouTube through `/api/youtube-search` (the key stays on the server). One request per explicit search
 * (Enter, the magnifier or the parent's «Buscar»), never while typing: the API quota is 100 searches a day.
 */
export function useYouTubeSearch() {
  const [state, setState] = useState<YouTubeSearchState>({ status: 'idle' });
  const stateRef = useRef(state);
  stateRef.current = state;
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const run = useCallback(async (query: string) => {
    const current = stateRef.current;
    if ((current.status === 'loading' || current.status === 'ok') && current.query === query) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setState({ status: 'loading', query });
    try {
      const res = await fetch(searchUrl(query), { signal: controller.signal });
      const body = (await res.json().catch(() => ({}))) as { items?: YouTubeSearchHit[]; error?: string };
      // A newer search took over while this one was reading: don't paint stale results over it.
      if (controller.signal.aborted) return;
      if (!res.ok) {
        setState({ status: 'error', query, ...searchErrorOf(res.status, body.error) });
        return;
      }
      setState({ status: 'ok', query, items: body.items ?? [] });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setState({ status: 'error', query, message: 'Sin conexión. Prueba otra vez.', limit: false });
      }
    }
  }, []);

  return { state, run };
}

/**
 * The shared «buscar o pegar enlace» field: YouTube search results (credited to YouTube, as its API policies
 * ask) and pasted links (title and channel from `/api/youtube-meta`). It only reports the choice through
 * `onPick`: what to do with it (a library video, a wish, a bag song) is the parent's call.
 */
export function YouTubePicker({
  onPick,
  onClear,
  value,
  onValueChange,
  label = 'Buscar o pegar enlace',
  placeholder = 'Ej. ILLIT Magnetic dance practice',
  hint,
  autoFocus = false,
  error,
  badgeFor,
  preview = true,
  onSearchingChange,
  ref,
  className,
}: YouTubePickerProps) {
  const [ownText, setOwnText] = useState('');
  const text = value ?? ownText;
  const setText = (next: string) => {
    if (value === undefined) setOwnText(next);
    onValueChange?.(next);
  };
  const input = readPickerInput(text);
  const linkId = input.kind === 'link' ? input.youtubeId : null;
  const textRef = useRef(text);
  textRef.current = text;
  const query = input.kind === 'search' ? input.query : null;

  const { state: search, run } = useYouTubeSearch();
  const [meta, setMeta] = useState<YouTubeMetaState>({ status: 'idle' });
  /** The search hit chosen last: its data is the pick (no lookup needed). */
  const picked = useRef<YouTubeSearchHit | null>(null);
  /** The search that was on screen when a hit was chosen: clearing the choice brings it back. */
  const lastQuery = useRef('');
  const previewRef = useRef<HTMLDivElement>(null);
  const resultRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const fieldId = useId();
  const resultsId = `${fieldId}-results`;
  /** Field doesn't forward a ref: the input is found by its id. */
  const focusField = () => document.getElementById(fieldId)?.focus();

  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const onClearRef = useRef(onClear);
  onClearRef.current = onClear;
  const hasPick = useRef(false);

  const searching = search.status === 'loading';
  useEffect(() => onSearchingChange?.(searching), [searching, onSearchingChange]);

  const runSearch = useCallback(() => {
    if (query) void run(query);
  }, [query, run]);

  useImperativeHandle(ref, () => ({ search: runSearch, focus: focusField }), [runSearch]);

  // The chosen video follows the field: a hit's data at once; a pasted link at once without a title, then again
  // with the title when the lookup answers (or nothing more if it hangs). An unplayable link clears the choice.
  useEffect(() => {
    if (!linkId) {
      setMeta({ status: 'idle' });
      if (hasPick.current) {
        hasPick.current = false;
        onClearRef.current?.();
      }
      return;
    }
    const hit = picked.current?.id === linkId ? picked.current : null;
    hasPick.current = true;
    if (hit) {
      setMeta({ status: 'ok', title: hit.title, author: hit.channel });
      onPickRef.current({
        youtubeId: hit.id,
        title: hit.title,
        channel: hit.channel,
        thumbnailUrl: hit.thumbnail || youTubeThumbnail(hit.id, 'mqdefault'),
        durationSeconds: hit.duration,
        via: 'search',
        aspectRatio: null,
      });
      // A search hit has no size: the lookup adds the proportion without waiting for it (no title change).
      const lookup = new AbortController();
      fetchYouTubeMeta(hit.id, lookup.signal)
        .then((next) => {
          if (lookup.signal.aborted || next.status !== 'ok' || next.aspectRatio == null) return;
          onPickRef.current({
            youtubeId: hit.id,
            title: hit.title,
            channel: hit.channel,
            thumbnailUrl: hit.thumbnail || youTubeThumbnail(hit.id, 'mqdefault'),
            durationSeconds: hit.duration,
            via: 'search',
            aspectRatio: next.aspectRatio,
          });
        })
        .catch(() => undefined);
      return () => lookup.abort();
    }
    const base: YouTubePick = {
      youtubeId: linkId,
      title: '',
      channel: '',
      thumbnailUrl: youTubeThumbnail(linkId, 'mqdefault'),
      durationSeconds: null,
      via: 'link',
      aspectRatio: videoAspectRatio({ url: textRef.current }),
    };
    onPickRef.current(base);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      setMeta({ status: 'ok', title: null, author: null });
    }, META_TIMEOUT_MS);
    setMeta({ status: 'loading' });
    fetchYouTubeMeta(linkId, controller.signal)
      .then((next) => {
        // The body read swallows an abort: a newer link may already be loading.
        if (controller.signal.aborted) return;
        clearTimeout(timer);
        setMeta(next);
        if (next.status === 'error') {
          hasPick.current = false;
          onClearRef.current?.();
        } else if (next.status === 'ok' && (next.title || next.author)) {
          onPickRef.current({
            ...base,
            title: next.title ?? '',
            channel: next.author ?? '',
            aspectRatio: next.aspectRatio ?? base.aspectRatio,
          });
        }
      })
      .catch(() => undefined);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [linkId]);

  function pickHit(hit: YouTubeSearchHit) {
    picked.current = hit;
    lastQuery.current = text;
    setText(`https://youtu.be/${hit.id}`);
    // The results go away: keep the focus on the chosen card instead of losing it (no keyboard pops up).
    requestAnimationFrame(() => previewRef.current?.focus());
  }

  function clearChoice() {
    const back = picked.current?.id === linkId ? lastQuery.current : '';
    picked.current = null;
    setText(back);
    requestAnimationFrame(() => focusField());
  }

  async function paste() {
    try {
      const clip = (await navigator.clipboard.readText()).trim();
      if (clip) setText(clip.slice(0, 300));
    } catch {
      // Permission refused or nothing to read: the field is there to paste by hand.
    }
    focusField();
  }

  function onFieldKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && query) {
      // A search, not the form's submit.
      event.preventDefault();
      runSearch();
    } else if (event.key === 'Enter' && linkId) {
      // A pasted link: Enter («Hecho» on the phone) only closes the keyboard, onto the chosen video's card. The form
      // is sent with its own button, after a look at what came with the link.
      event.preventDefault();
      if (previewRef.current) previewRef.current.focus();
      else event.currentTarget.blur();
    } else if (event.key === 'ArrowDown' && showResults && search.status === 'ok' && search.items.length > 0) {
      event.preventDefault();
      resultRefs.current[0]?.focus();
    }
  }

  function onResultKey(event: KeyboardEvent<HTMLButtonElement>, index: number, count: number) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const next = nextResultIndex(index, event.key, count);
    if (next < 0) focusField();
    else resultRefs.current[next]?.focus();
  }

  const canPaste = typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.readText);
  const showResults = !linkId && resultsShown(search, query);
  const fieldError =
    input.kind === 'bad-link'
      ? 'No reconocemos ese enlace de YouTube.'
      : meta.status === 'error'
        ? meta.message
        : linkId
          ? (error ?? null)
          : null;
  const chosen = picked.current?.id === linkId ? picked.current : null;
  const badge = linkId ? badgeFor?.(linkId) : null;

  const trailing = linkId ? (
    <button
      type="button"
      aria-label="Quitar este vídeo y buscar otro"
      onClick={clearChoice}
      className="grid size-11 place-items-center rounded-[8px] text-washi-muted transition-colors hover:bg-washi/[0.07] hover:text-washi"
    >
      <X aria-hidden className="size-4.5" />
    </button>
  ) : !text.trim() && canPaste ? (
    <button
      type="button"
      aria-label="Pegar enlace"
      onClick={() => void paste()}
      className="grid size-11 place-items-center rounded-[8px] text-washi-muted transition-colors hover:bg-washi/[0.07] hover:text-washi"
    >
      <ClipboardPaste aria-hidden className="size-4.5" />
    </button>
  ) : (
    <button
      type="button"
      aria-label="Buscar en YouTube"
      aria-controls={resultsId}
      disabled={!query}
      onClick={runSearch}
      className="grid size-11 place-items-center rounded-[8px] text-washi-muted transition-colors hover:bg-washi/[0.07] hover:text-washi disabled:opacity-40"
    >
      <Search aria-hidden className="size-4.5" />
    </button>
  );

  return (
    <div className={cn('space-y-3', className)}>
      <Field
        id={fieldId}
        data-autofocus={autoFocus || undefined}
        label={label}
        placeholder={placeholder}
        type="search"
        enterKeyHint={linkId ? 'done' : 'search'}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        value={text}
        onChange={(e) => {
          if (picked.current && readPickerInput(e.target.value).kind !== 'link') picked.current = null;
          setText(e.target.value);
        }}
        onKeyDown={onFieldKey}
        error={fieldError}
        hint={hint}
        trailing={trailing}
        // type="search" paints the browser's own ✕ next to ours («Quitar» or the magnifier): hide it.
        className="[&_input::-webkit-search-cancel-button]:hidden"
      />

      <p className="sr-only" aria-live="polite">
        {linkId
          ? meta.status === 'ok' && (chosen?.title || meta.title)
            ? `Elegido: ${chosen?.title || meta.title}.`
            : ''
          : showResults
            ? searchAnnouncement(search)
            : ''}
      </p>

      {showResults && (
        <Results
          id={resultsId}
          state={search}
          badgeFor={badgeFor}
          onPick={pickHit}
          onKey={onResultKey}
          refs={resultRefs}
          onRetry={() => {
            if (query) void run(query);
          }}
        />
      )}

      <AnimatePresence initial={false}>
        {preview && linkId && meta.status !== 'error' && (
          <motion.div
            key={linkId}
            ref={previewRef}
            tabIndex={-1}
            role="group"
            aria-label="Vídeo elegido"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={soft}
            className="flex min-w-0 items-center gap-3 rounded-[12px] border border-line bg-sumi-950/50 p-2 outline-none focus-visible:border-kin-300/70"
          >
            <span className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-[8px] bg-sumi-800">
              <img src={youTubeThumbnail(linkId, 'mqdefault')} alt="" className="size-full object-cover" />
              {chosen?.duration != null && (
                <span className="tabular absolute bottom-1 right-1 rounded-[4px] bg-sumi-950/85 px-1 font-mono text-[10px] text-washi">
                  {formatDuration(chosen.duration)}
                </span>
              )}
            </span>
            <div className="min-w-0 flex-1">
              {meta.status === 'loading' ? (
                <div className="space-y-2" aria-hidden>
                  <div className="skeleton h-3.5 w-4/5 rounded-full" />
                  <div className="skeleton h-3 w-1/2 rounded-full" />
                </div>
              ) : (
                <>
                  <p className="line-clamp-2 text-sm font-medium text-washi">
                    {meta.status === 'ok' && meta.title ? meta.title : 'Vídeo de YouTube'}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-washi-muted">
                    {meta.status === 'ok' && meta.author ? meta.author : linkId}
                  </p>
                </>
              )}
              {badge && <BadgeChip badge={badge} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BadgeChip({ badge }: { badge: YouTubeBadge }) {
  return (
    <span
      className={cn(
        'mt-1 inline-block rounded-[4px] px-1.5 text-[11px] font-medium',
        badge.tone === 'info' ? 'bg-ai-600/25 text-ai-200' : 'bg-kin-300/15 text-kin-200',
      )}
    >
      {badge.label}
    </span>
  );
}

function Results({
  id,
  state,
  badgeFor,
  onPick,
  onKey,
  refs,
  onRetry,
}: {
  id: string;
  state: YouTubeSearchState;
  badgeFor?: (youtubeId: string) => YouTubeBadge | null;
  onPick: (hit: YouTubeSearchHit) => void;
  onKey: (event: KeyboardEvent<HTMLButtonElement>, index: number, count: number) => void;
  refs: { current: (HTMLButtonElement | null)[] };
  onRetry: () => void;
}) {
  return (
    <div id={id} className="min-w-0 rounded-[12px] border border-line bg-sumi-950/50">
      <p className="flex items-center gap-1.5 border-b border-line px-3 py-2 text-xs text-washi-subtle">
        <Youtube aria-hidden className="size-4 text-shu-400" /> Resultados de YouTube
      </p>
      {state.status === 'loading' && (
        <ul className="space-y-1 p-1.5" aria-busy="true" aria-label="Buscando">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex items-center gap-3 p-1.5">
              <div className="skeleton aspect-video w-28 shrink-0 rounded-[8px]" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-3.5 w-4/5 rounded-full" />
                <div className="skeleton h-3 w-1/2 rounded-full" />
              </div>
            </li>
          ))}
        </ul>
      )}
      {state.status === 'error' && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3">
          <p
            className={cn(
              'flex min-w-0 flex-1 items-start gap-2 text-sm leading-snug',
              state.limit ? 'text-kin-200' : 'text-washi-muted',
            )}
          >
            {state.limit && <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />}
            {state.message}
          </p>
          {!state.limit && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-11 items-center rounded-[10px] px-3 text-[13px] font-bold text-kin-300 hover:bg-washi/[0.06]"
            >
              Reintentar
            </button>
          )}
        </div>
      )}
      {state.status === 'ok' && state.items.length === 0 && (
        <p className="px-3 py-4 text-sm text-washi-muted">Sin resultados. Prueba con otras palabras.</p>
      )}
      {state.status === 'ok' && state.items.length > 0 && (
        <ul className="max-h-[min(46dvh,360px)] space-y-0.5 overflow-y-auto overscroll-contain p-1.5" aria-label="Resultados">
          {state.items.map((item, i) => {
            const badge = badgeFor?.(item.id);
            return (
              <motion.li
                key={item.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...soft, delay: Math.min(i, 8) * 0.03 }}
              >
                <button
                  ref={(node) => {
                    refs.current[i] = node;
                  }}
                  type="button"
                  onClick={() => onPick(item)}
                  onKeyDown={(e) => onKey(e, i, state.items.length)}
                  className="flex min-h-11 w-full min-w-0 items-center gap-3 rounded-[10px] p-1.5 text-left transition-colors hover:bg-washi/[0.06] focus-visible:bg-washi/[0.06]"
                >
                  <span className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-[8px] bg-sumi-800">
                    <img src={item.thumbnail} alt="" loading="lazy" className="size-full object-cover" />
                    {item.duration != null && (
                      <span className="tabular absolute bottom-1 right-1 rounded-[4px] bg-sumi-950/85 px-1 font-mono text-[10px] text-washi">
                        <span className="sr-only">Duración </span>
                        {formatDuration(item.duration)}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm font-medium text-washi">{item.title}</span>
                    {badge && <BadgeChip badge={badge} />}
                    <span className="mt-0.5 block truncate text-xs text-washi-muted">{item.channel}</span>
                  </span>
                </button>
              </motion.li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
