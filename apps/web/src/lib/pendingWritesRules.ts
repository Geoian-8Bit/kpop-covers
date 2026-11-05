/**
 * Pending writes (pure rules): the shape of a queued clip / note / vote write, how a new write folds into the ones
 * still waiting (last write wins per row), which failures mean «no network, try later», and how the waiting writes
 * are laid over a freshly fetched list so the optimistic data never blinks away while they wait.
 */

export type PendingKind = 'clip' | 'note' | 'vote';
type PendingAction = 'create' | 'update' | 'delete' | 'set';

export interface PendingOp {
  /** Unique per queued write (waiters and removal go by it). */
  opId: string;
  kind: PendingKind;
  action: PendingAction;
  /** The row it writes: the row id, or `${pollId}:${memberId}` for a ballot. */
  id: string;
  /** create: the whole row (with its client-made id) · update: the patch · set: the ballot · delete: nothing. */
  data?: Record<string, unknown>;
  /** Query keys to refresh once it reaches the server in the background (or is turned down there). */
  invalidate: readonly (readonly unknown[])[];
  /** How many times it was sent and the network failed (0 = never tried). */
  tries: number;
}

const sameRow = (a: PendingOp, b: Pick<PendingOp, 'kind' | 'id'>) => a.kind === b.kind && a.id === b.id;

function unionKeys(a: PendingOp['invalidate'], b: PendingOp['invalidate']): PendingOp['invalidate'] {
  const seen = new Set(a.map((k) => JSON.stringify(k)));
  return [...a, ...b.filter((k) => !seen.has(JSON.stringify(k)))];
}

export interface Coalesced {
  queue: PendingOp[];
  /** The queued write that now carries the incoming one (its own opId when appended). */
  target: string | null;
  /** Writes that cancelled out (create then delete): nothing is left to send for them. */
  cancelled: string[];
}

/**
 * Folds `incoming` into the queue, last write wins per row: create+update = create with the final values,
 * update+update = one merged patch, update+delete = delete, create+delete = nothing, set+set = the last ballot.
 * A write that is being sent right now (`inflight`) or was already tried (`tries > 0`: it may have reached the
 * server, its answer lost) is never changed or cancelled: what follows it is queued after it, in row order.
 */
export function coalesce(
  queue: readonly PendingOp[],
  incoming: PendingOp,
  inflight: ReadonlySet<string> = new Set(),
): Coalesced {
  let index = -1;
  for (let i = queue.length - 1; i >= 0; i--) {
    if (sameRow(queue[i]!, incoming)) {
      index = i;
      break;
    }
  }
  const prev = index >= 0 ? queue[index]! : undefined;
  const append = (): Coalesced => ({ queue: [...queue, incoming], target: incoming.opId, cancelled: [] });
  if (!prev || prev.tries > 0 || inflight.has(prev.opId)) return append();

  const replace = (op: PendingOp): Coalesced => ({
    queue: queue.map((q, i) => (i === index ? op : q)),
    target: op.opId,
    cancelled: [],
  });
  const invalidate = unionKeys(prev.invalidate, incoming.invalidate);

  if (incoming.action === 'delete') {
    if (prev.action === 'create') {
      return { queue: queue.filter((_, i) => i !== index), target: null, cancelled: [prev.opId] };
    }
    if (prev.action === 'update') return replace({ ...incoming, opId: prev.opId, invalidate, tries: 0 });
    return append();
  }
  if (incoming.action === 'update' && (prev.action === 'create' || prev.action === 'update')) {
    return replace({ ...prev, data: { ...prev.data, ...incoming.data }, invalidate });
  }
  if (incoming.action === 'set' && prev.action === 'set') {
    return replace({ ...prev, data: incoming.data, invalidate });
  }
  return append();
}

/** The row a write belongs to: writes of one row go out strictly in order, different rows side by side. */
export const rowOf = (op: Pick<PendingOp, 'kind' | 'id'>) => `${op.kind}:${op.id}`;

/**
 * The writes that may start now: the oldest waiting write of each row whose row has nothing on its way and is not
 * paused after a network failure (`blocked`), in queue order, while fewer than `cap` are on their way.
 */
export function runnable(
  queue: readonly PendingOp[],
  active: ReadonlySet<string>,
  blocked: ReadonlySet<string>,
  cap: number,
): PendingOp[] {
  const out: PendingOp[] = [];
  const seen = new Set<string>();
  let running = active.size;
  for (const op of queue) {
    const row = rowOf(op);
    if (seen.has(row)) continue;
    seen.add(row);
    if (active.has(op.opId) || blocked.has(row)) continue;
    if (running >= cap) break;
    out.push(op);
    running += 1;
  }
  return out;
}

const NETWORK_MESSAGE =
  /failed to fetch|fetch failed|networkerror|network ?error|network request failed|load failed|network connection was lost|err_network|err_internet|timed? ?out|timeout|aborterror|aborted|offline/i;

/** Server-side SQLSTATEs that mean «busy, try again» rather than «no». */
const TRANSIENT_SQLSTATE = new Set(['40001', '40P01', '53300', '55P03', '57014', '57P01', '57P03']);

const field = (err: unknown, name: string): unknown =>
  err != null && typeof err === 'object' ? (err as Record<string, unknown>)[name] : undefined;

/**
 * True when a failed write never got a real answer from the server (no network, timed out, cut off, overloaded),
 * so it is kept and sent again later. A real answer that says no (4xx, RLS, validation, PGRST codes, raised
 * exceptions) is not: it fails as it always did.
 */
export function isRetryableWriteError(err: unknown): boolean {
  if (err == null) return false;
  const code = field(err, 'code');
  if (typeof code === 'string' && code !== '') return TRANSIENT_SQLSTATE.has(code);
  const status = field(err, 'status');
  if (typeof status === 'number') {
    if (status === 0 || status === 408 || status === 429 || status >= 500) return true;
    if (status >= 400) return false;
  }
  if (err instanceof TypeError) return true;
  const name = field(err, 'name');
  if (name === 'AbortError' || name === 'TimeoutError' || name === 'NetworkError') return true;
  const message = field(err, 'message');
  return typeof message === 'string' && NETWORK_MESSAGE.test(message);
}

/** Wait before the next try after `failures` network failures in a row: 5 s, 10 s, 20 s, 40 s, then 60 s. */
export function backoffDelay(failures: number, baseMs = 5_000, capMs = 60_000): number {
  return Math.min(capMs, baseMs * 2 ** Math.max(0, failures - 1));
}

/**
 * A fetched list with the waiting writes of one kind laid over it, in queue order: rows created here and not yet
 * on the server are added (when `belongs` says they go in this list), patches applied, deleted rows taken out.
 * Returns the same array when nothing applied.
 */
export function overlayRows<T extends { id: string }>(
  rows: readonly T[],
  ops: readonly PendingOp[],
  {
    belongs,
    toRow,
    patch = (row, data) => ({ ...row, ...data }) as T,
  }: {
    belongs: (data: Record<string, unknown>) => boolean;
    toRow: (data: Record<string, unknown>) => T;
    patch?: (row: T, data: Record<string, unknown>) => T;
  },
): readonly T[] {
  let out = rows;
  for (const op of ops) {
    if (op.action === 'create' && op.data && belongs(op.data)) {
      const row = toRow(op.data);
      out = out.some((r) => r.id === op.id)
        ? out.map((r) => (r.id === op.id ? patch(r, op.data!) : r))
        : [...out, row];
    } else if (op.action === 'update' && op.data && out.some((r) => r.id === op.id)) {
      out = out.map((r) => (r.id === op.id ? patch(r, op.data!) : r));
    } else if (op.action === 'delete' && out.some((r) => r.id === op.id)) {
      out = out.filter((r) => r.id !== op.id);
    }
  }
  return out;
}

export interface PendingBallot {
  pollId: string;
  memberId: string;
  optionIds: string[];
  /** A ranking poll: the rows carry their rank. */
  ranked?: boolean;
}

/** A ballot write as queued. */
const ballotOf = (op: PendingOp): PendingBallot | null =>
  op.kind === 'vote' && op.action === 'set' && op.data ? (op.data as unknown as PendingBallot) : null;

/**
 * Fetched ballots with the waiting ones laid over them: each waiting ballot replaces that person's rows in that
 * poll (`toVote` builds one row per chosen option, in rank order).
 */
export function overlayBallots<V extends { poll_id: string; member_id: string }>(
  votes: readonly V[],
  ops: readonly PendingOp[],
  pollIds: readonly string[],
  toVote: (ballot: PendingBallot, optionId: string, index: number) => V,
): readonly V[] {
  let out = votes;
  for (const op of ops) {
    const ballot = ballotOf(op);
    if (!ballot || !pollIds.includes(ballot.pollId)) continue;
    out = [
      ...out.filter((v) => !(v.poll_id === ballot.pollId && v.member_id === ballot.memberId)),
      ...ballot.optionIds.map((optionId, i) => toVote(ballot, optionId, i)),
    ];
  }
  return out;
}
