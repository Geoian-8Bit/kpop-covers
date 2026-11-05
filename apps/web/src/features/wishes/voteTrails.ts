/**
 * REQ-22 · The rising trails of the winner reveal (VoteReveal.tsx), as the motion `<line>` drew them: a vertical
 * line from (x, y1) to (x, y2), 1.4 units wide with round caps, where y2 goes 200 → y in one easeOut segment, y1 goes
 * 200 → y + 26 → y in two easeOut segments, and the line fades 0 → 1 → 0 with y1, all in 0.5 s.
 *
 * Each end follows its own curve (and for the first ~0.3 s y1 runs above y2), so the segment between them is not a
 * single CSS curve: the caps keep their own easing in `voteReveal.css`, and the body between them gets keyframes
 * sampled every 10 ms (`trailKeyframes`), exact at every sample (the frame tests' instants are multiples of 10 ms).
 */

/** motion's `easeOut`: cubic-bezier(0, 0, 0.58, 1). */
export function easeOut(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  // Bezier with P1 = (0, 0) and P2 = (0.58, 1): find the parameter whose x is `x` (bisection), return its y.
  const bx = (s: number) => 3 * (1 - s) * s * s * 0.58 + s * s * s;
  const by = (s: number) => 3 * (1 - s) * s * s + s * s * s;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (bx(mid) < x) lo = mid;
    else hi = mid;
  }
  return by((lo + hi) / 2);
}

const TRAIL_MS = 500;

/** Both ends of a trail ending at `y`, `ms` after it starts. */
export function trailEnds(y: number, ms: number): { y1: number; y2: number } {
  const t = Math.min(Math.max(ms, 0), TRAIL_MS);
  const half = TRAIL_MS / 2;
  const y2 = 200 + (y - 200) * easeOut(t / TRAIL_MS);
  const y1 = t < half ? 200 + (y + 26 - 200) * easeOut(t / half) : y + 26 - 26 * easeOut((t - half) / half);
  return { y1, y2 };
}

const STEP_MS = 10;
const n = (v: number) => Number(v.toFixed(3));

/** `@keyframes vote-trail-body-<i>` for each trail end height: the body from the upper end, as tall as the gap. */
export function trailKeyframes(ys: readonly number[]): string {
  return ys
    .map((y, i) => {
      const frames: string[] = [];
      for (let ms = 0; ms <= TRAIL_MS; ms += STEP_MS) {
        const { y1, y2 } = trailEnds(y, ms);
        const top = Math.min(y1, y2);
        const len = Math.abs(y1 - y2);
        frames.push(
          `${n((ms / TRAIL_MS) * 100)}%{transform:translateY(calc(${n(top)} * var(--u))) scaleY(${n(len)})}`,
        );
      }
      return `@keyframes vote-trail-body-${i}{${frames.join('')}}`;
    })
    .join('\n');
}
