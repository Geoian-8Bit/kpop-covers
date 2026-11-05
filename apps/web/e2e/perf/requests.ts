import type { Page, Request } from '@playwright/test';

/**
 * REQ-03 · M-06 / M-07: every request a screen makes, with its start and end, so the harness can say how many there
 * were, how many bytes came back and whether they ran one after the other (a waterfall) or together.
 */
export interface Entry {
  url: string;
  path: string;
  method: string;
  type: string;
  status: number;
  /** ms since the log was reset (epoch-based request timing). */
  start: number;
  end: number;
  /** Bytes on the wire (headers + body). */
  transfer: number;
  /** Bytes of the decoded body, read only for the /rest/v1/videos queries (M-06). */
  body?: number;
  failed?: boolean;
}

export class RequestLog {
  private entries: Entry[] = [];
  private pending: Promise<void>[] = [];
  private t0 = Date.now();
  /** REQ-03 · Bumped by reset(): a finish() still in flight from the previous window must not leak into the next one. */
  private epoch = 0;

  constructor(
    page: Page,
    /** Responses of this URL pattern also get their decoded body measured. */
    private readonly bodyOf: RegExp = /\/rest\/v1\/videos\?/,
  ) {
    page.on('requestfinished', (req) => this.pending.push(this.finish(req)));
    page.on('requestfailed', (req) => this.pending.push(this.finish(req, true)));
  }

  reset(): void {
    this.entries = [];
    this.pending = [];
    this.t0 = Date.now();
    this.epoch++;
  }

  private async finish(req: Request, failed = false): Promise<void> {
    const epoch = this.epoch;
    try {
      const timing = req.timing();
      const sizes = failed ? { responseBodySize: 0, responseHeadersSize: 0 } : await req.sizes();
      const res = failed ? null : await req.response();
      const url = new URL(req.url());
      const end = timing.responseEnd > 0 ? timing.startTime + timing.responseEnd : Date.now();
      const entry: Entry = {
        url: req.url(),
        path: url.pathname + url.search,
        method: req.method(),
        type: req.resourceType(),
        status: res?.status() ?? 0,
        start: Math.round(timing.startTime - this.t0),
        end: Math.round(end - this.t0),
        transfer: sizes.responseBodySize + sizes.responseHeadersSize,
        failed: failed || undefined,
      };
      if (res && this.bodyOf.test(req.url()))
        entry.body = (await res.body().catch(() => Buffer.alloc(0))).length;
      if (epoch === this.epoch) this.entries.push(entry);
    } catch {
      /* the page closed under it: the request is not part of the screen */
    }
  }

  async settled(): Promise<Entry[]> {
    // Finishing a request can queue another handler: drain until nothing new arrives.
    let seen = -1;
    while (seen !== this.pending.length) {
      seen = this.pending.length;
      await Promise.all(this.pending);
    }
    return [...this.entries].sort((a, b) => a.start - b.start);
  }
}

/**
 * Longest chain of requests where each one starts after the previous one ended (a waterfall). Depth 1 means they all
 * overlap or there is a single request; the screen is «en serie» when the depth is above 1. A 5 ms grace absorbs the
 * timing rounding of requests that really chain.
 */
export function serialDepth(entries: Pick<Entry, 'start' | 'end'>[]): number {
  const sorted = [...entries].sort((a, b) => a.start - b.start);
  const depth: number[] = [];
  sorted.forEach((e, i) => {
    let best = 0;
    for (let j = 0; j < i; j++) if (sorted[j]!.end <= e.start + 5) best = Math.max(best, depth[j]!);
    depth[i] = best + 1;
  });
  return depth.length ? Math.max(...depth) : 0;
}

export interface RequestSummary {
  requests: number;
  api: number;
  assets: number;
  failed: number;
  transferBytes: number;
  apiTransferBytes: number;
  /** Longest waterfall of API calls (REST + RPC + Storage) and of everything. */
  apiSerialDepth: number;
  serialDepth: number;
  /** M-06 · decoded bytes of the library list response (the videos query that carries `clips(count)`). */
  videosListBytes: number | null;
  /** REQ-14 · decoded bytes of the missing-posters query (`id, poster_rev, thumbnail_url`), apart from M-06. */
  postersBytes: number | null;
  /** REQ-14 · decoded bytes of the poster revisions query (`id, poster_rev`, no image). */
  posterRevsBytes: number | null;
  /** Compact waterfall for the evidence: «METHOD path start-end transfer status». */
  waterfall: string[];
  /** Diagnosis only (PERF_WATERFALL_ALL=1): every request in the same compact form. */
  allWaterfall?: string[];
}

export function summarizeRequests(entries: Entry[], apiOrigin: string): RequestSummary {
  const api = entries.filter((e) => e.url.startsWith(apiOrigin));
  // The videos table answers three queries now (REQ-14): the list, the poster revisions and the missing posters.
  // M-06 is the list alone; the posters are measured apart so their weight is not hidden nor mixed into it.
  const videoBodies = (test: (select: string) => boolean) =>
    entries
      .filter(
        (e) =>
          e.body !== undefined && test(decodeURIComponent(new URL(e.url).searchParams.get('select') ?? '')),
      )
      .map((e) => e.body!);
  const sumOrNull = (list: number[]) => (list.length ? list.reduce((s, n) => s + n, 0) : null);
  const lists = videoBodies((s) => s.includes('clips(count)'));
  const posters = videoBodies((s) => /poster_rev,s*thumbnail_url/.test(s));
  const revs = videoBodies((s) => /^id,s*poster_rev$/.test(s.trim()));
  return {
    requests: entries.length,
    api: api.length,
    assets: entries.length - api.length,
    failed: entries.filter((e) => e.failed || e.status >= 400).length,
    transferBytes: entries.reduce((s, e) => s + e.transfer, 0),
    apiTransferBytes: api.reduce((s, e) => s + e.transfer, 0),
    apiSerialDepth: serialDepth(api),
    serialDepth: serialDepth(entries),
    videosListBytes: lists.length ? Math.max(...lists) : null,
    postersBytes: sumOrNull(posters),
    posterRevsBytes: sumOrNull(revs),
    waterfall: api.map(
      (e) =>
        `${e.method} ${e.path.replace(/^\/(rest|storage)\/v1\//, '').slice(0, 110)} ${e.start}-${e.end}ms ${e.transfer}B ${e.status}`,
    ),
    // Diagnosis only: with PERF_WATERFALL_ALL=1 the evidence also lists every request (assets included).
    allWaterfall: process.env.PERF_WATERFALL_ALL
      ? entries.map(
          (e) =>
            `${e.method} ${e.type} ${e.path.slice(0, 90)} ${e.start}-${e.end}ms ${e.transfer}B ${e.status}`,
        )
      : undefined,
  };
}
