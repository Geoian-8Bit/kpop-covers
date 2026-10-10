// Vercel function: GET /api/youtube-search?q=<text>
// Searches embeddable YouTube videos with the official YouTube Data API v3. The key stays on the
// server (env YOUTUBE_API_KEY). Responses are cached at Vercel's edge for a day per query, which
// keeps us far below the default quota (100 searches/day per project).

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

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
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

export async function GET(request: Request): Promise<Response> {
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim().replace(/\s+/g, ' ');
  if (q.length < 2 || q.length > 100) return json({ error: 'invalid_query' }, 400);

  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return json({ error: 'not_configured' }, 503);

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
    const body = (await upstream.json().catch(() => ({}))) as ApiError;
    const reason = body.error?.errors?.[0]?.reason;
    console.error('[youtube-search] search failed', upstream.status, reason);
    if (reason === 'quotaExceeded' || reason === 'rateLimitExceeded') return json({ error: 'quota' }, 429);
    return json({ error: 'upstream_error' }, 502);
  }

  const found = ((await upstream.json()) as SearchResponse).items ?? [];
  const items: YouTubeSearchItem[] = found
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
      if (res.ok) {
        const byId = new Map(((await res.json()) as VideosResponse).items?.map((v) => [v.id, v]) ?? []);
        for (const item of items) item.duration = parseIsoDuration(byId.get(item.id)?.contentDetails?.duration);
      }
    } catch (error) {
      console.warn('[youtube-search] durations skipped', error);
    }
  }

  return json({ items }, 200, { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400' });
}
