// Vercel function: GET /api/youtube-search?q=<text>
// Searches embeddable YouTube videos with the official YouTube Data API v3. The key stays on the
// server (env YOUTUBE_API_KEY). Responses are cached at Vercel's edge per URL (a day, plus a day of
// stale-while-revalidate, so a result may be served for up to ~48 h), which keeps us far below the default
// quota (100 searches/day per project). Every spelling of the same search is redirected to one canonical URL
// so they share one cache entry, and each IP gets a small budget of uncached searches.

export interface YouTubeSearchItem {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
  /** Seconds, or null when YouTube did not report it (e.g. live streams). */
  duration: number | null;
}

interface SearchResponse {
  items?: { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string } }[];
}
interface VideosResponse {
  items?: { id: string; contentDetails?: { duration?: string } }[];
}
interface ApiError {
  error?: { errors?: { reason?: string }[] };
}

const API = 'https://www.googleapis.com/youtube/v3';

/** Uncached searches allowed per IP and window. Best effort: memory is per function instance. */
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const searchesByIp = new Map<string, number[]>();

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

/** Errors that depend on who asks or on the moment must never be stored in the shared edge cache. */
const NO_STORE = { 'Cache-Control': 'private, no-store' };

/** Parses a JSON body, or null when the upstream answered something else (HTML error page, empty body…). */
async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/** Snippet titles come HTML-escaped ("Don&#39;t"). */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** ISO 8601 duration ("PT3M34S") to seconds. */
export function parseIsoDuration(value: string | undefined): number | null {
  const m = value?.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  const [, d = '0', h = '0', min = '0', s = '0'] = m;
  const total = Number(d) * 86400 + Number(h) * 3600 + Number(min) * 60 + Number(s);
  return total > 0 ? total : null;
}

/** Same normalisation as the client: trimmed, single spaces, lower case. Input is already URL-decoded. */
export function canonicalQuery(decoded: string): string {
  return decoded.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * The one query string for a search (`?q=` + percent-encoding, as `encodeURIComponent` + the URL parser
 * produce it, i.e. what the app's own fetch sends). Built through the URL setter so it is a fixed point:
 * following the redirect never redirects again.
 */
export function canonicalSearch(q: string): string {
  const url = new URL('http://x/');
  url.search = `?q=${encodeURIComponent(q)}`;
  return url.search;
}

/** Raw query string as received (before any decoding), so `+`, `%20`, `%61`… count as different spellings. */
function rawSearch(requestUrl: string): string {
  const start = requestUrl.indexOf('?');
  if (start < 0) return '';
  const end = requestUrl.indexOf('#', start);
  return requestUrl.slice(start, end < 0 ? undefined : end);
}

function clientIp(request: Request): string | null {
  const real = request.headers.get('x-real-ip')?.trim();
  if (real) return real;
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || null;
}

/** Records one search for `ip`; returns the seconds to wait when the budget is spent, or 0. */
export function takeSearchSlot(ip: string, now = Date.now()): number {
  const recent = (searchesByIp.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    searchesByIp.set(ip, recent);
    return Math.max(1, Math.ceil((recent[0]! + RATE_WINDOW_MS - now) / 1000));
  }
  recent.push(now);
  searchesByIp.set(ip, recent);
  if (searchesByIp.size > 5000) {
    for (const [key, times] of searchesByIp) {
      if (times.every((t) => now - t >= RATE_WINDOW_MS)) searchesByIp.delete(key);
    }
  }
  return 0;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const q = canonicalQuery(url.searchParams.get('q') ?? '');
  if (q.length < 2 || q.length > 100) return json({ error: 'invalid_query' }, 400);

  // One URL per search: another encoding (`+` vs `%20`, escaped letters), case, spacing or extra params
  // would be a different edge-cache key and burn quota, so send the browser to the canonical spelling.
  const canonical = canonicalSearch(q);
  if (rawSearch(request.url) !== canonical) {
    return new Response(null, {
      status: 308,
      headers: { Location: `${url.pathname}${canonical}`, 'Cache-Control': 'public, s-maxage=86400' },
    });
  }

  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return json({ error: 'not_configured' }, 503);

  // Only cache misses reach this point, so this caps what one visitor (or script) can cost in quota.
  const ip = clientIp(request);
  const retryAfter = ip ? takeSearchSlot(ip) : 0;
  if (retryAfter > 0) {
    return json({ error: 'rate_limited' }, 429, { ...NO_STORE, 'Retry-After': String(retryAfter) });
  }

  const search = new URL(`${API}/search`);
  search.search = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoEmbeddable: 'true',
    maxResults: '12',
    q,
    key,
  }).toString();

  let upstream: Response;
  try {
    upstream = await fetch(search, { signal: AbortSignal.timeout(8000) });
  } catch (error) {
    console.error('[youtube-search] search fetch failed', error);
    return json({ error: 'upstream_unreachable' }, 502);
  }
  if (!upstream.ok) {
    const body = (await readJson<ApiError>(upstream)) ?? {};
    const reason = body.error?.errors?.[0]?.reason;
    console.error('[youtube-search] search failed', upstream.status, reason ?? '(no JSON error body)');
    if (reason === 'quotaExceeded' || reason === 'rateLimitExceeded') return json({ error: 'quota' }, 429, NO_STORE);
    return json({ error: 'upstream_error' }, 502);
  }

  const result = await readJson<SearchResponse>(upstream);
  if (!result) {
    console.error('[youtube-search] search answered non-JSON', upstream.status, upstream.headers.get('content-type'));
    return json({ error: 'upstream_bad_response' }, 502);
  }
  const items: YouTubeSearchItem[] = (result.items ?? [])
    .filter((it) => it.id?.videoId)
    .map((it) => ({
      id: it.id!.videoId!,
      title: decodeEntities(it.snippet?.title ?? ''),
      channel: decodeEntities(it.snippet?.channelTitle ?? ''),
      thumbnail: `https://i.ytimg.com/vi/${it.id!.videoId!}/mqdefault.jpg`,
      duration: null,
    }));

  // Durations come from videos.list (cheap, separate quota bucket). Best effort: results still work without them.
  if (items.length > 0) {
    const videos = new URL(`${API}/videos`);
    videos.search = new URLSearchParams({ part: 'contentDetails', id: items.map((i) => i.id).join(','), key }).toString();
    try {
      const res = await fetch(videos, { signal: AbortSignal.timeout(5000) });
      const details = res.ok ? await readJson<VideosResponse>(res) : null;
      if (details) {
        const byId = new Map(details.items?.map((v) => [v.id, v]) ?? []);
        for (const item of items) item.duration = parseIsoDuration(byId.get(item.id)?.contentDetails?.duration);
      } else if (res.ok) {
        console.warn('[youtube-search] durations skipped: non-JSON answer');
      }
    } catch (error) {
      console.warn('[youtube-search] durations skipped', error);
    }
  }

  return json({ items }, 200, { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400' });
}
