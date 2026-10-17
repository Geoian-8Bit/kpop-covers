const ID_RE = /^[A-Za-z0-9_-]{11}$/;
const HOST_PREFIX_RE = /^(?:www|m|music)\./;

export function isYouTubeId(value: string): boolean {
  return ID_RE.test(value);
}

/**
 * A bare id typed in the search box must also look random: a digit, or '-'/'_' with mixed case.
 * Plain 11-character words ("NewJeansOMG", "TWICE-FANCY") are searches, not ids; the rare real id
 * with none of those still works pasted as a link.
 */
function looksLikeBareId(value: string): boolean {
  return /\d/.test(value) || (/[-_]/.test(value) && /[a-z]/.test(value) && /[A-Z]/.test(value));
}

/** Extracts the 11-char video id from any common YouTube URL shape (or a bare id). */
export function parseYouTubeId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (ID_RE.test(raw)) return looksLikeBareId(raw) ? raw : null;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(HOST_PREFIX_RE, '');
  let candidate: string | null = null;

  if (host === 'youtu.be') {
    candidate = url.pathname.split('/')[1] ?? null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') {
      candidate = url.searchParams.get('v');
    } else {
      const match = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
      candidate = match?.[1] ?? null;
    }
  }

  return candidate && ID_RE.test(candidate) ? candidate : null;
}

/** Reads a `t=` / `start=` offset (e.g. `90`, `90s`, `1m30s`, `1h2m3s`) from a YouTube URL. */
export function parseYouTubeStart(input: string): number | null {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
  } catch {
    return null;
  }
  const value = url.searchParams.get('t') ?? url.searchParams.get('start');
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value);
  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!match || match[0] === '') return null;
  const [, h = '0', m = '0', s = '0'] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

export type YouTubeThumbQuality = 'default' | 'mqdefault' | 'hqdefault' | 'sddefault' | 'maxresdefault';

export function youTubeThumbnail(id: string, quality: YouTubeThumbQuality = 'hqdefault'): string {
  return `https://i.ytimg.com/vi/${id}/${quality}.jpg`;
}

const THUMB_RE = /^https:\/\/i\.ytimg\.com\/vi\/([A-Za-z0-9_-]{11})\/(?:default|mqdefault|hqdefault|sddefault|maxresdefault)\.jpg$/;

/**
 * A stored YouTube thumbnail at another size (e.g. `mqdefault`, 320×180, for small cards); any other URL
 * (an uploaded video's poster, another host) comes back unchanged.
 */
export function withYouTubeThumbQuality(url: string, quality: YouTubeThumbQuality): string {
  const match = THUMB_RE.exec(url);
  return match ? youTubeThumbnail(match[1]!, quality) : url;
}

export function youTubeWatchUrl(id: string, startSeconds?: number): string {
  const t = startSeconds && startSeconds > 0 ? `&t=${Math.floor(startSeconds)}s` : '';
  return `https://www.youtube.com/watch?v=${id}${t}`;
}
