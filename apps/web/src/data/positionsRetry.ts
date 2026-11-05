// REQ-20 · The order of a track or a repertoire goes as ONE all-or-nothing RPC. It used to be one PATCH per moved
// row, so a row another phone had just archived was simply skipped and the rest kept their new order without an
// error. To keep that, a refusal because some id is no longer there (`*_positions_invalid`) re-reads the live ids,
// keeps the requested order of those still there and tries once more; only a second failure is reported, as before.

const messageOf = (error: unknown): string =>
  typeof error === 'object' && error && 'message' in error
    ? String((error as { message: unknown }).message)
    : '';

/**
 * Writes `ids` in this order with `write`. On `invalid` (the RPC's error), `readLive` gives the ids still there and
 * the order is written again with only those. Nothing left to order: done, as the old per-row writes ended.
 */
export async function writePositions(
  ids: readonly string[],
  write: (ids: string[]) => Promise<void>,
  readLive: () => Promise<readonly string[]>,
  invalid: string,
): Promise<void> {
  try {
    await write([...ids]);
  } catch (error) {
    if (!messageOf(error).includes(invalid)) throw error;
    let live: Set<string>;
    try {
      live = new Set(await readLive());
    } catch {
      throw error;
    }
    const kept = ids.filter((id) => live.has(id));
    if (!kept.length) return;
    await write(kept);
  }
}
