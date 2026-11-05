import type { Json, Poll } from '@coverscape/shared';

/**
 * Every row of a list, page by page: the server answers at most 1000 rows per request, so a longer list would be
 * cut short without a word (review round 1). `page(from, to)` must order by a unique key so pages don't overlap.
 */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const size = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < size) return out;
  }
}

/** 52 · Every new vote: results live, named votes, closed by hand (the column defaults, written explicitly). */
export const NEW_POLL_RULES = {
  results_live: true,
  anonymous: false,
  closes_at: null,
} as const satisfies Pick<Poll, 'results_live' | 'anonymous' | 'closes_at'>;

/** What a Supabase answer carries when it went through: its `data`, typed as the query built it. */
type Ok<R> = R extends { error: null; data: infer D } ? D : never;

/**
 * REQ-29 · The data of a Supabase answer, or its error thrown: the one place for what every query did by hand with
 * `if (error) throw error` (same error object, same moment).
 */
export function must<R extends { data: unknown; error: unknown }>(res: R): Ok<R> {
  if (res.error) throw withStatus(res.error, (res as { status?: unknown }).status);
  return res.data as Ok<R>;
}

/**
 * The answer's HTTP status rides on the thrown error (non-enumerable, never replacing one it has), so a failed
 * write can tell «no answer / 5xx» (0, 502…) from a real «no» (4xx). Same error object as before.
 */
function withStatus(error: unknown, status: unknown): unknown {
  if (
    typeof status === 'number' &&
    error &&
    typeof error === 'object' &&
    Object.isExtensible(error) &&
    !('status' in error)
  ) {
    Object.defineProperty(error, 'status', { value: status, enumerable: false, configurable: true });
  }
  return error;
}

/**
 * REQ-29 · A plain data object sent as a jsonb argument of an RPC (the database checks its shape). One typed door
 * instead of a double cast through `unknown` at every call.
 */
export const toJson = (value: object): Json => value as Json;

/** REQ-29 · A jsonb value read back with the shape the RPC or column is known to hold (the database writes it). */
export const fromJson = <T>(value: Json | null): T => value as T;
