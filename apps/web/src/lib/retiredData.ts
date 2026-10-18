/**
 * 45 · «Seguir a un bailarín» and the pose test are gone: what they left on this device goes too — the downloaded
 * pose models (the service worker's `pose-models` cache, several MB) and the test's local results. Nothing of the
 * group's: the `follow_paths` rows stay in the database, archived or not, unused.
 */
export const RETIRED_CACHES = ['pose-models'] as const;
export const RETIRED_KEYS = ['oneshoot.pose.bench', 'oneshoot.poseLab.results'] as const;

export interface RetiredDataDeps {
  caches?: Pick<CacheStorage, 'delete'> | null;
  storage?: Pick<Storage, 'removeItem'> | null;
}

/** Forgets the retired data; never throws (private mode, no Cache API, blocked storage). */
export async function forgetRetiredData({ caches, storage }: RetiredDataDeps): Promise<void> {
  for (const key of RETIRED_KEYS) {
    try {
      storage?.removeItem(key);
    } catch {
      /* storage blocked */
    }
  }
  if (!caches) return;
  await Promise.all(RETIRED_CACHES.map((name) => caches.delete(name).catch(() => false)));
}
