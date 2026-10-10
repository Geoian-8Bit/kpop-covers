// Vercel function: GET /api/youtube-meta?id=<videoId>
// Returns title/author/thumbnail via YouTube oEmbed and flags videos that block embedding.

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

interface OEmbed {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

export async function GET(request: Request): Promise<Response> {
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!ID_RE.test(id)) return json({ error: 'invalid_id' }, 400);

  const target = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${id}`,
  )}`;

  let upstream: Response;
  try {
    upstream = await fetch(target, { signal: AbortSignal.timeout(6000) });
  } catch (error) {
    console.error('[youtube-meta] oEmbed fetch failed', error);
    return json({ error: 'upstream_unreachable' }, 502);
  }

  // oEmbed answers 401/403 when the owner disabled embedding.
  if (upstream.status === 401 || upstream.status === 403) {
    return json({ error: 'not_embeddable' }, 422);
  }
  if (upstream.status === 404 || upstream.status === 400) return json({ error: 'not_found' }, 404);
  if (!upstream.ok) return json({ error: 'upstream_error' }, 502);

  const data = (await upstream.json()) as OEmbed;
  return json(
    {
      id,
      title: data.title ?? null,
      author: data.author_name ?? null,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    },
    200,
    { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' },
  );
}
