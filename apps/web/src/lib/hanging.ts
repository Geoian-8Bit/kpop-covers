/**
 * Tiny physics for things that hang in the library: damped pendulums (ema, norigae, noren halves)
 * and Verlet ropes (tassel threads).
 *
 * Built for phones: one shared rAF loop drives every body and stops completely once everything has
 * settled; touches, scrolling and the occasional "breeze" wake it again. The breeze only blows while
 * the list is on screen, the tab is visible and the user hasn't asked for reduced motion. Nudges are
 * signed angular impulses (positive pushes the bottom to the right).
 */

/** Advances one body; returns true while it is still moving (keeps the loop alive). */
type Tick = (dt: number) => boolean;
type Nudge = (impulse: number) => void;

const ticks = new Set<Tick>();
const nudgeTargets = new Set<Nudge>();
let frame = 0;
let last = 0;
let breezeTimer: ReturnType<typeof setTimeout> | undefined;
let breezeOn = true;

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function loop(now: number) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
  last = now;
  let moving = false;
  for (const tick of ticks) if (tick(dt)) moving = true;
  frame = moving ? requestAnimationFrame(loop) : 0;
}

/** Restarts the loop after it went to sleep. Cheap to call often. */
export function wake() {
  if (frame || ticks.size === 0) return;
  last = 0;
  frame = requestAnimationFrame(loop);
}

function scheduleBreeze() {
  clearTimeout(breezeTimer);
  if (nudgeTargets.size === 0) return;
  breezeTimer = setTimeout(
    () => {
      if (breezeOn && !document.hidden && !reducedMotion()) {
        const targets = [...nudgeTargets];
        const sign = Math.random() < 0.5 ? -1 : 1;
        targets[Math.floor(Math.random() * targets.length)]!(sign * (0.35 + Math.random() * 0.4));
        wake();
      }
      scheduleBreeze();
    },
    2500 + Math.random() * 4000,
  );
}

/** Pauses the breeze, e.g. while the hanging items are scrolled out of view. */
export function setBreeze(enabled: boolean) {
  breezeOn = enabled;
}

/** Registers a body. Returns the unsubscribe function. */
export function subscribeTick(tick: Tick, nudge?: Nudge): () => void {
  ticks.add(tick);
  if (nudge) {
    nudgeTargets.add(nudge);
    if (nudgeTargets.size === 1) scheduleBreeze();
  }
  wake();
  return () => {
    ticks.delete(tick);
    if (nudge) nudgeTargets.delete(nudge);
    if (nudgeTargets.size === 0) clearTimeout(breezeTimer);
  };
}

/** Pushes every hanging body at once, e.g. when the rail they hang from slides sideways. */
export function nudgeAll(impulse: number) {
  for (const nudge of nudgeTargets) nudge(impulse);
  wake();
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

/** Advances the pendulum; returns false once it is at rest (and snaps it exactly to rest). */
export function stepPendulum(p: Pendulum, cfg: PendulumConfig, dt: number): boolean {
  if (p.target == null && Math.abs(p.theta) < 4e-4 && Math.abs(p.omega) < 4e-3) {
    p.theta = 0;
    p.omega = 0;
    return false;
  }
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
  return true;
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

  /** Advances the rope with its first point pinned at (ax, ay); returns the largest point speed (px/frame). */
  step(dt: number, ax: number, ay: number): number {
    const { x, y, px, py, count, segment } = this;
    const anchorMove = Math.abs(ax - x[0]!) + Math.abs(ay - y[0]!);
    x[0] = px[0] = ax;
    y[0] = py[0] = ay;
    const g = GRAVITY * dt * dt;
    let maxSpeed = anchorMove;
    for (let i = 1; i < count; i++) {
      const vx = (x[i]! - px[i]!) * 0.982;
      const vy = (y[i]! - py[i]!) * 0.982;
      maxSpeed = Math.max(maxSpeed, Math.abs(vx) + Math.abs(vy));
      px[i] = x[i]!;
      py[i] = y[i]!;
      x[i] = x[i]! + vx;
      y[i] = y[i]! + vy + g;
    }
    for (let k = 0; k < 4; k++) {
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
    return maxSpeed;
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

/* ─────────────────────────────── Textures ─────────────────────────────── */

let fibre: string | null = null;

/**
 * A small tileable fibre/noise texture, drawn once on a canvas and reused as a CSS background. Moving
 * layers use this instead of live SVG filters, which browsers re-rasterise on every frame.
 */
export function fibreTexture(): string {
  if (fibre != null) return fibre;
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return (fibre = '');
  for (let i = 0; i < 900; i++) {
    const dark = Math.random() < 0.6;
    ctx.fillStyle = dark
      ? `rgba(0,0,0,${0.05 + Math.random() * 0.1})`
      : `rgba(255,246,230,${0.03 + Math.random() * 0.06})`;
    const long = Math.random() < 0.25;
    ctx.fillRect(Math.random() * size, Math.random() * size, long ? 1 : 1 + Math.random(), long ? 3 + Math.random() * 5 : 1);
  }
  fibre = canvas.toDataURL('image/png');
  return fibre;
}
