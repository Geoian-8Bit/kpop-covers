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
 * Without OPFS (old browsers, some private modes) the pieces stay in memory, like before.
 */

const ROOT = 'takes-in-progress';
const META = 'meta.json';

export interface TakeMeta {
  id: string;
  videoId: string;
  title: string;
  mimeType: string;
  /** ISO timestamp. */
  startedAt: string;
  /** Downloaded or kept elsewhere: no need to offer it back. */
  saved: boolean;
}

export interface TakeSink {
  /** Where the pieces go: 'disk' (OPFS) or 'memory'. */
  readonly where: 'disk' | 'memory';
  readonly id: string;
  /** Queue one piece (in order). A failed write (disk full) calls `onError` once; later pieces stay in memory. */
  write(piece: Blob): void;
  /** Everything written so far, as one file (waits for queued writes). */
  finish(type: string): Promise<Blob>;
  bytes(): number;
  /** Forget the take: deletes the disk copy. */
  discard(): Promise<void>;
  /** Downloaded/kept: never offered for recovery (the copy is deleted when the review ends). */
  markSaved(): void;
}

type WritableFile = FileSystemFileHandle & {
  createWritable(opts?: { keepExistingData?: boolean }): Promise<FileSystemWritableFileStream>;
};
type IterableDir = FileSystemDirectoryHandle & { keys(): AsyncIterable<string> };

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
  let size = 0;
  return {
    where: 'memory',
    id,
    write(piece) {
      pieces.push(piece);
      size += piece.size;
    },
    finish: (type) => Promise.resolve(new Blob(pieces, { type })),
    bytes: () => size,
    discard: () => {
      pieces.length = 0;
      return Promise.resolve();
    },
    markSaved: () => undefined,
  };
}

/** A sink for a new take: on disk when the browser allows it, else in memory. */
export async function createTakeSink(
  meta: Omit<TakeMeta, 'id' | 'startedAt' | 'saved'>,
  onError: () => void,
): Promise<TakeSink> {
  const id = crypto.randomUUID();
  askPersistence();
  const root = await rootDir();
  if (!root) return memorySink(id);
  const full: TakeMeta = { ...meta, id, startedAt: new Date().toISOString(), saved: false };
  let dir: FileSystemDirectoryHandle;
  try {
    dir = await root.getDirectoryHandle(id, { create: true });
    await writeFile(dir, META, JSON.stringify(full));
  } catch {
    await root.removeEntry(id, { recursive: true }).catch(() => undefined);
    return memorySink(id);
  }

  // Writes run one after the other; after a failure (quota) the rest stays in memory and we say so once.
  let chain: Promise<void> = Promise.resolve();
  let failed = false;
  let gone = false;
  let count = 0;
  let size = 0;
  const spill: Blob[] = [];

  return {
    where: 'disk',
    id,
    write(piece) {
      size += piece.size;
      if (gone) return;
      if (failed) {
        spill.push(piece);
        return;
      }
      const n = ++count;
      chain = chain.then(async () => {
        if (failed || gone) {
          if (!gone) spill.push(piece);
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
    bytes: () => size,
    async discard() {
      gone = true;
      spill.length = 0;
      await chain.catch(() => undefined);
      await root.removeEntry(id, { recursive: true }).catch(() => undefined);
    },
    markSaved() {
      full.saved = true;
      void writeFile(dir, META, JSON.stringify(full)).catch(() => undefined);
    },
  };
}

export interface Leftover {
  meta: TakeMeta;
  blob: Blob;
}

/**
 * Takes left on disk by an app that closed mid-take (or before the take was saved), newest first. `except`
 * skips takes this session still uses. Saved, empty or unreadable ones are cleaned up on the way.
 */
export async function listLeftovers(except: ReadonlySet<string> = new Set()): Promise<Leftover[]> {
  const root = await rootDir();
  if (!root) return [];
  const out: Leftover[] = [];
  try {
    for (const id of await names(root)) {
      if (except.has(id)) continue;
      try {
        const dir = await root.getDirectoryHandle(id);
        const meta = JSON.parse(await (await (await dir.getFileHandle(META)).getFile()).text()) as TakeMeta;
        const blob = await readPieces(dir, meta.mimeType);
        if (meta.saved || blob.size === 0) await root.removeEntry(id, { recursive: true });
        else out.push({ meta, blob });
      } catch {
        await root.removeEntry(id, { recursive: true }).catch(() => undefined);
      }
    }
  } catch {
    return out;
  }
  return out.sort((a, b) => b.meta.startedAt.localeCompare(a.meta.startedAt));
}

/** The take was downloaded or kept elsewhere: never offer it back; its copy goes on the next clean-up. */
export async function markTakeSaved(id: string): Promise<void> {
  const root = await rootDir();
  if (!root) return;
  try {
    const dir = await root.getDirectoryHandle(id);
    const meta = JSON.parse(await (await (await dir.getFileHandle(META)).getFile()).text()) as TakeMeta;
    await writeFile(dir, META, JSON.stringify({ ...meta, saved: true }));
  } catch {
    /* already gone */
  }
}

/** Deletes a take's disk copy (after it was recovered and dealt with, or discarded). */
export async function forgetTake(id: string): Promise<void> {
  const root = await rootDir();
  await root?.removeEntry(id, { recursive: true }).catch(() => undefined);
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
