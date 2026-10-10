/**
 * Tiny physics for things that hang in the library: damped pendulums (ema, norigae, noren halves)
 * and Verlet ropes (tassel threads). One shared rAF ticker drives every body and a soft
 * "breeze" nudges a random one now and then, unless the user prefers reduced motion. Nudges are
 * signed angular impulses (positive pushes the bottom to the right).
 */

type Tick = (dt: number) => void;

const ticks = new Set<Tick>();
type Nudge = (impulse: number) => void;

const nudgeTargets = new Set<Nudge>();
let frame = 0;
let last = 0;
let nextBreeze = 0;

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function loop(now: number) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
  last = now;
  if (now > nextBreeze) {
    nextBreeze = now + 2500 + Math.random() * 4000;
    if (!reducedMotion() && nudgeTargets.size > 0) {
      const targets = [...nudgeTargets];
      const sign = Math.random() < 0.5 ? -1 : 1;
      targets[Math.floor(Math.random() * targets.length)]!(sign * (0.35 + Math.random() * 0.4));
    }
  }
  for (const tick of ticks) tick(dt);
  frame = ticks.size > 0 ? requestAnimationFrame(loop) : 0;
}

/** Runs `tick` every animation frame until the returned function is called. */
export function subscribeTick(tick: Tick, nudge?: Nudge): () => void {
  ticks.add(tick);
  if (nudge) nudgeTargets.add(nudge);
  if (!frame) {
    last = 0;
    frame = requestAnimationFrame(loop);
  }
  return () => {
    ticks.delete(tick);
    if (nudge) nudgeTargets.delete(nudge);
  };
}

/** Pushes every hanging body at once, e.g. when the rail they hang from slides sideways. */
export function nudgeAll(impulse: number) {
  for (const nudge of nudgeTargets) nudge(impulse);
}

/* ───────────────────────────── Rigid pendulum ───────────────────────────── */

export interface Pendulum {
  /** Angle in radians; positive swings the bottom to the right. */
  theta: number;
  omega: number;
  /** Angle the pointer is pulling towards while dragging, or null when free. */
  target: number | null;
}

export interface PendulumConfig {
  /** Natural period in seconds (longer = heavier / longer cord). */
  period: number;
  /** Velocity damping per second. */
  damping: number;
  maxAngle: number;
}

export function stepPendulum(p: Pendulum, cfg: PendulumConfig, dt: number) {
  const w2 = ((2 * Math.PI) / cfg.period) ** 2;
  // Substeps keep the integration stable on slow frames.
  const n = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    let alpha = -w2 * Math.sin(p.theta) - cfg.damping * p.omega;
    if (p.target != null) alpha += 260 * (p.target - p.theta) - 22 * p.omega;
    p.omega += alpha * h;
    p.theta += p.omega * h;
    if (Math.abs(p.theta) > cfg.maxAngle) {
      p.theta = Math.sign(p.theta) * cfg.maxAngle;
      p.omega *= -0.25;
    }
  }
}

/* ─────────────────────────────── Verlet rope ─────────────────────────────── */

const GRAVITY = 1400; // px/s², tuned for ~100px objects so they feel light but not floaty

export class Rope {
  readonly x: Float32Array;
  readonly y: Float32Array;
  private readonly px: Float32Array;
  private readonly py: Float32Array;

  constructor(
    readonly count: number,
    readonly segment: number,
    x0: number,
    y0: number,
  ) {
    this.x = new Float32Array(count);
    this.y = new Float32Array(count);
    this.px = new Float32Array(count);
    this.py = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.x[i] = this.px[i] = x0;
      this.y[i] = this.py[i] = y0 + i * segment;
    }
  }

  /** Advances the rope with its first point pinned at (ax, ay). */
  step(dt: number, ax: number, ay: number, windX = 0) {
    const { x, y, px, py, count, segment } = this;
    x[0] = px[0] = ax;
    y[0] = py[0] = ay;
    const g = GRAVITY * dt * dt;
    for (let i = 1; i < count; i++) {
      const vx = (x[i]! - px[i]!) * 0.982 + windX * dt * dt;
      const vy = (y[i]! - py[i]!) * 0.982;
      px[i] = x[i]!;
      py[i] = y[i]!;
      x[i] = x[i]! + vx;
      y[i] = y[i]! + vy + g;
    }
    for (let k = 0; k < 6; k++) {
      for (let i = 1; i < count; i++) {
        const dx = x[i]! - x[i - 1]!;
        const dy = y[i]! - y[i - 1]!;
        const d = Math.hypot(dx, dy) || 1;
        const diff = (d - segment) / d;
        if (i === 1) {
          x[i] = x[i]! - dx * diff;
          y[i] = y[i]! - dy * diff;
        } else {
          x[i] = x[i]! - dx * diff * 0.5;
          y[i] = y[i]! - dy * diff * 0.5;
          x[i - 1] = x[i - 1]! + dx * diff * 0.5;
          y[i - 1] = y[i - 1]! + dy * diff * 0.5;
        }
      }
    }
  }

  /** Smooth SVG path through the points. */
  path(): string {
    const { x, y, count } = this;
    let d = `M${x[0]!.toFixed(1)},${y[0]!.toFixed(1)}`;
    for (let i = 1; i < count - 1; i++) {
      const mx = (x[i]! + x[i + 1]!) / 2;
      const my = (y[i]! + y[i + 1]!) / 2;
      d += ` Q${x[i]!.toFixed(1)},${y[i]!.toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`;
    }
    d += ` L${x[count - 1]!.toFixed(1)},${y[count - 1]!.toFixed(1)}`;
    return d;
  }
}
