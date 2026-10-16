import { leftoverAction } from '@coverscape/shared';

/**
 * R1 · A take is written to the phone's storage while it records, not kept in memory: a 3-minute take at
 * 16 Mbps is ~360 MB, enough for a phone to close the page. Each 1-second piece the recorder hands over is
 * saved as its own small file in the app's private storage (OPFS); the finished take is one Blob made of those
 * disk-backed files (no copy in memory). If the app dies mid-take, every piece already written survives (at
 * most the last second is lost) and the take can be recovered next time the recorder opens.
 *
 * One file per piece on purpose: Chrome's `createWritable()` only commits on `close()`, so a single growing
 * file would be empty after a crash.
 *
 * When a working copy goes away is decided in one place (`leftoverAction`): never while a window holds its lock
 * (recording or reviewing it), not until 10 minutes after it was downloaded or shared (a big download may still
 * be reading it), and never if it was never saved (it is offered back instead).
 *
 * Without OPFS (old browsers, some private modes) the pieces stay in memory, like before.
 */

const ROOT = 'takes-in-progress';
const META = 'meta.json';
const FIRST_PIECE = '000001.part';

export interface TakeMeta {
  id: string;
  videoId: string;
  title: string;
  mimeType: string;
  /** ISO timestamp. */
  startedAt: string;
  /** ISO time it was downloaded or shared; null while it only exists here. */
  savedAt: string | null;
}

export interface TakeSink {
  /** Where the pieces go: 'disk' (OPFS) or 'memory'. */
  readonly where: 'disk' | 'memory';
  readonly id: string;
  /** Queue one piece (in order). A failed write calls `onError` once; later pieces stay in memory. */
  write(piece: Blob): void;
  /** Everything written so far, as one file (waits for queued writes). */
  finish(type: string): Promise<Blob>;
  /** True once a write failed (usually a full disk). */
  failed(): boolean;
  /** The type the recorder really uses (known once it started). */
  setMimeType(type: string): void;
  /** Forget the take: deletes the disk copy and lets go of its lock. */
  discard(): Promise<void>;
}

type WritableFile = FileSystemFileHandle & {
  createWritable(opts?: { keepExistingData?: boolean }): Promise<FileSystemWritableFileStream>;
};
type IterableDir = FileSystemDirectoryHandle & { keys(): AsyncIterable<string> };
type LockManager = {
  request(name: string, cb: () => Promise<void>): Promise<void>;
  query(): Promise<{ held?: { name?: string }[] }>;
};

const lockName = (id: string) => `oneshoot-take-${id}`;
const locks = () => (navigator as Navigator & { locks?: LockManager }).locks;

/** Releases of the takes this window holds (recording or reviewing). */
const held = new Map<string, () => void>();

/** While held, no other window of the app offers or deletes this take. */
export function holdTake(id: string): void {
  if (held.has(id)) return;
  let release = () => undefined as void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  held.set(id, release);
  void locks()?.request(lockName(id), () => gate).catch(() => undefined);
}

export function releaseTake(id: string): void {
  held.get(id)?.();
  held.delete(id);
}

async function heldElsewhere(): Promise<Set<string>> {
  try {
    const state = await locks()?.query();
    return new Set((state?.held ?? []).map((l) => l.name ?? ''));
  } catch {
    return new Set();
  }
}

async function rootDir(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const root = await navigator.storage?.getDirectory?.();
    if (!root) return null;
    return await root.getDirectoryHandle(ROOT, { create: true });
  } catch {
    return null;
  }
}

async function writeFile(dir: FileSystemDirectoryHandle, name: string, data: Blob | string): Promise<void> {
  const handle = (await dir.getFileHandle(name, { create: true })) as WritableFile;
  const w = await handle.createWritable();
  try {
    await w.write(data);
  } finally {
    await w.close();
  }
}

async function names(dir: FileSystemDirectoryHandle): Promise<string[]> {
  const out: string[] = [];
  for await (const name of (dir as IterableDir).keys()) out.push(name);
  return out;
}

async function readMeta(dir: FileSystemDirectoryHandle): Promise<TakeMeta> {
  const raw = JSON.parse(await (await (await dir.getFileHandle(META)).getFile()).text()) as Partial<TakeMeta> & {
    saved?: boolean;
  };
  return {
    id: String(raw.id ?? ''),
    videoId: String(raw.videoId ?? ''),
    title: String(raw.title ?? ''),
    mimeType: String(raw.mimeType ?? ''),
    startedAt: String(raw.startedAt ?? ''),
    savedAt: raw.savedAt ?? (raw.saved ? raw.startedAt ?? null : null),
  };
}

const pieceName = (n: number) => `${String(n).padStart(6, '0')}.part`;

/** All piece files of a take, in order, as one Blob backed by the disk. */
async function readPieces(dir: FileSystemDirectoryHandle, type: string): Promise<Blob> {
  const parts = (await names(dir)).filter((n) => n.endsWith('.part')).sort();
  const files: File[] = [];
  for (const name of parts) files.push(await (await dir.getFileHandle(name)).getFile());
  return new Blob(files, { type });
}

let persistAsked = false;
/** Ask once that the browser doesn't clear the app's storage when the phone runs short (R2). */
export function askPersistence(): void {
  if (persistAsked) return;
  persistAsked = true;
  void navigator.storage?.persist?.().catch(() => false);
}

function memorySink(id: string): TakeSink {
  const pieces: Blob[] = [];
  return {
    where: 'memory',
    id,
    write: (piece) => void pieces.push(piece),
    finish: (type) => Promise.resolve(new Blob(pieces, { type })),
    failed: () => false,
    setMimeType: () => undefined,
    discard: () => {
      pieces.length = 0;
      return Promise.resolve();
    },
  };
}

/** A sink for a new take: on disk when the browser allows it, else in memory. */
export async function createTakeSink(
  meta: Omit<TakeMeta, 'id' | 'startedAt' | 'savedAt'>,
  onError: () => void,
): Promise<TakeSink> {
  const id = crypto.randomUUID();
  askPersistence();
  const root = await rootDir();
  if (!root) return memorySink(id);
  holdTake(id);
  const full: TakeMeta = { ...meta, id, startedAt: new Date().toISOString(), savedAt: null };
  let dir: FileSystemDirectoryHandle;
  try {
    dir = await root.getDirectoryHandle(id, { create: true });
    await writeFile(dir, META, JSON.stringify(full));
  } catch {
    await root.removeEntry(id, { recursive: true }).catch(() => undefined);
    releaseTake(id);
    return memorySink(id);
  }

  // Writes run one after the other; after a failure the rest stays in memory and we say so once.
  let chain: Promise<void> = Promise.resolve();
  let failed = false;
  let gone = false;
  let count = 0;
  const spill: Blob[] = [];

  return {
    where: 'disk',
    id,
    write(piece) {
      if (gone) return;
      if (failed) {
        spill.push(piece);
        return;
      }
      const n = ++count;
      chain = chain.then(async () => {
        if (gone) return;
        if (failed) {
          spill.push(piece);
          return;
        }
        try {
          await writeFile(dir, pieceName(n), piece);
        } catch {
          failed = true;
          spill.push(piece);
          onError();
        }
      });
    },
    async finish(type) {
      await chain;
      try {
        const disk = await readPieces(dir, type);
        return new Blob([disk, ...spill], { type });
      } catch {
        return new Blob(spill, { type });
      }
    },
    failed: () => failed,
    setMimeType(type) {
      if (!type || type === full.mimeType) return;
      full.mimeType = type;
      void writeFile(dir, META, JSON.stringify(full)).catch(() => undefined);
    },
    async discard() {
      gone = true;
      spill.length = 0;
      await chain.catch(() => undefined);
      await root.removeEntry(id, { recursive: true }).catch(() => undefined);
      releaseTake(id);
    },
  };
}

export interface Leftover {
  meta: TakeMeta;
  /** Bytes on disk. */
  size: number;
}

/**
 * Takes on the phone's storage that were never saved, newest first (any song). On the way, takes saved long
 * enough ago and old empty ones are deleted; takes another window uses, or saved a moment ago, are left alone.
 */
export async function listLeftovers(): Promise<Leftover[]> {
  const root = await rootDir();
  if (!root) return [];
  const busy = await heldElsewhere();
  const now = Date.now();
  const out: Leftover[] = [];
  try {
    for (const id of await names(root)) {
      const locked = busy.has(lockName(id)) || held.has(id);
      let dir: FileSystemDirectoryHandle;
      let meta: TakeMeta;
      try {
        dir = await root.getDirectoryHandle(id);
        meta = await readMeta(dir);
      } catch {
        // No readable meta: only an old one can be judged (a new one may still be being created).
        if (!locked) {
          const empty = { startedAt: new Date(0).toISOString(), savedAt: null, bytes: 0, locked };
          if (leftoverAction(empty, now) === 'delete') await root.removeEntry(id, { recursive: true }).catch(() => undefined);
        }
        continue;
      }
      let size = 0;
      let unreadable = false;
      try {
        // Saved ones only need to know they have something; the size is only read for takes on offer.
        if (meta.savedAt) size = (await (await dir.getFileHandle(FIRST_PIECE)).getFile()).size;
        else size = (await readPieces(dir, meta.mimeType)).size;
      } catch (err) {
        unreadable = !(err instanceof DOMException && err.name === 'NotFoundError');
      }
      const action = leftoverAction({ startedAt: meta.startedAt, savedAt: meta.savedAt, bytes: size, locked, unreadable }, now);
      if (action === 'delete') await root.removeEntry(id, { recursive: true }).catch(() => undefined);
      else if (action === 'offer') out.push({ meta: { ...meta, id }, size });
    }
  } catch {
    return out;
  }
  return out.sort((a, b) => b.meta.startedAt.localeCompare(a.meta.startedAt));
}

/** The pieces of a take found on disk, as one Blob (null if they're gone). */
export async function loadLeftover(meta: TakeMeta): Promise<Blob | null> {
  const root = await rootDir();
  if (!root) return null;
  try {
    const blob = await readPieces(await root.getDirectoryHandle(meta.id), meta.mimeType || 'video/webm');
    return blob.size ? blob : null;
  } catch {
    return null;
  }
}

/** The take was downloaded or shared: no longer offered; its copy is deleted after the grace period. */
export async function markTakeSaved(id: string): Promise<void> {
  const root = await rootDir();
  if (!root) return;
  try {
    const dir = await root.getDirectoryHandle(id);
    const meta = await readMeta(dir);
    await writeFile(dir, META, JSON.stringify({ ...meta, id, savedAt: new Date().toISOString() }));
  } catch {
    /* already gone */
  }
}

/** Deletes a take's disk copy now (discarded, or dealt with) and lets go of its lock. */
export async function forgetTake(id: string): Promise<void> {
  const root = await rootDir();
  await root?.removeEntry(id, { recursive: true }).catch(() => undefined);
  releaseTake(id);
}

/** Free space for the app, in bytes (R2). Null when the browser doesn't say. */
export async function freeSpace(): Promise<number | null> {
  try {
    const est = await navigator.storage?.estimate?.();
    if (!est?.quota) return null;
    return Math.max(0, est.quota - (est.usage ?? 0));
  } catch {
    return null;
  }
}
