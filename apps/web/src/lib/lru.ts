// REQ-29 · A cap for module-level caches that used to grow without limit: a `Map` kept in use order (least recently
// used first), trimmed from the front. Normal use stays far below the caps, so it behaves exactly as before.

/** The value for `key`, marked as just used. */
export function lruGet<K, V>(map: Map<K, V>, key: K): V | undefined {
  if (!map.has(key)) return undefined;
  const value = map.get(key) as V;
  map.delete(key);
  map.set(key, value);
  return value;
}

/** Stores `value` as the most recent entry and drops the oldest ones beyond `max`. */
export function lruSet<K, V>(map: Map<K, V>, key: K, value: V, max: number): void {
  map.delete(key);
  map.set(key, value);
  for (const oldest of map.keys()) {
    if (map.size <= max) break;
    map.delete(oldest);
  }
}
