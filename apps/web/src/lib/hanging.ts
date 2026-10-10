/**
 * Tiny physics for things that hang in the library: rigid pendulums (ema, norigae), Verlet ropes
 * (tassel threads) and Verlet cloth (noren). One shared rAF ticker drives every body and a soft
 * "breeze" nudges a random one now and then, unless the user prefers reduced motion.
 */

type Tick = (dt: number) => void;

const ticks = new Set<Tick>();
const breezeTargets = new Set<(strength: number) => void>();
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
    if (!reducedMotion() && breezeTargets.size > 0) {
      const targets = [...breezeTargets];
      targets[Math.floor(Math.random() * targets.length)]!(0.35 + Math.random() * 0.4);
    }
  }
  for (const tick of ticks) tick(dt);
  frame = ticks.size > 0 ? requestAnimationFrame(loop) : 0;
}

/** Runs `tick` every animation frame until the returned function is called. */
export function subscribeTick(tick: Tick, breeze?: (strength: number) => void): () => void {
  ticks.add(tick);
  if (breeze) breezeTargets.add(breeze);
  if (!frame) {
    last = 0;
    frame = requestAnimationFrame(loop);
  }
  return () => {
    ticks.delete(tick);
    if (breeze) breezeTargets.delete(breeze);
  };
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

/* ─────────────────────────────── Verlet cloth ─────────────────────────────── */

/** A rectangular sheet sewn along its top row. Points are stored row-major. */
export class Cloth {
  readonly x: Float32Array;
  readonly y: Float32Array;
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly rx: Float32Array;
  private readonly ry: Float32Array;
  /** Index of the point held by the pointer, or -1. */
  grabbed = -1;
  grabX = 0;
  grabY = 0;

  constructor(
    readonly cols: number,
    readonly rows: number,
    readonly left: number,
    readonly top: number,
    readonly width: number,
    readonly height: number,
  ) {
    const n = cols * rows;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.rx = new Float32Array(n);
    this.ry = new Float32Array(n);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        this.x[i] = this.px[i] = this.rx[i] = left + (c / (cols - 1)) * width;
        this.y[i] = this.py[i] = this.ry[i] = top + (r / (rows - 1)) * height;
      }
    }
  }

  /** Closest free (not sewn) point to (x, y). */
  nearest(x: number, y: number): number {
    let best = -1;
    let bestD = Infinity;
    for (let i = this.cols; i < this.x.length; i++) {
      const d = (this.x[i]! - x) ** 2 + (this.y[i]! - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  /** Pushes the lower rows sideways, e.g. for a breeze or a flick. */
  push(vx: number) {
    const { x, px, cols, rows } = this;
    for (let i = cols; i < x.length; i++) px[i] = px[i]! - vx * (Math.floor(i / cols) / (rows - 1));
  }

  step(dt: number) {
    const { x, y, px, py, cols } = this;
    const g = GRAVITY * 0.7 * dt * dt;
    for (let i = cols; i < x.length; i++) {
      const vx = (x[i]! - px[i]!) * 0.975;
      const vy = (y[i]! - py[i]!) * 0.975;
      px[i] = x[i]!;
      py[i] = y[i]!;
      x[i] = x[i]! + vx;
      y[i] = y[i]! + vy + g;
    }
    const sx = this.width / (cols - 1);
    const sy = this.height / (this.rows - 1);
    for (let k = 0; k < 5; k++) {
      if (this.grabbed >= 0) {
        x[this.grabbed] = this.grabX;
        y[this.grabbed] = this.grabY;
      }
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          if (c < cols - 1) this.link(i, i + 1, sx);
          if (r < this.rows - 1) this.link(i, i + cols, sy);
        }
      }
      for (let c = 0; c < cols; c++) {
        x[c] = this.rx[c]!;
        y[c] = this.ry[c]!;
      }
    }
  }

  private link(a: number, b: number, rest: number) {
    const { x, y, cols } = this;
    const dx = x[b]! - x[a]!;
    const dy = y[b]! - y[a]!;
    const d = Math.hypot(dx, dy) || 1;
    const diff = (d - rest) / d;
    const pinnedA = a < cols || a === this.grabbed;
    const pinnedB = b < cols || b === this.grabbed;
    if (pinnedA && pinnedB) return;
    const wa = pinnedA ? 0 : pinnedB ? 1 : 0.5;
    const wb = pinnedB ? 0 : pinnedA ? 1 : 0.5;
    x[a] = x[a]! + dx * diff * wa;
    y[a] = y[a]! + dy * diff * wa;
    x[b] = x[b]! - dx * diff * wb;
    y[b] = y[b]! - dy * diff * wb;
  }

  /** Smooth outline of the sheet: top edge, right side, bottom edge, left side. */
  outline(): string {
    const { x, y, cols, rows } = this;
    const at = (r: number, c: number) => r * cols + c;
    const pts: number[] = [];
    for (let c = 0; c < cols; c++) pts.push(at(0, c));
    for (let r = 1; r < rows; r++) pts.push(at(r, cols - 1));
    for (let c = cols - 2; c >= 0; c--) pts.push(at(rows - 1, c));
    for (let r = rows - 2; r > 0; r--) pts.push(at(r, 0));
    let d = `M${x[pts[0]!]!.toFixed(1)},${y[pts[0]!]!.toFixed(1)}`;
    for (let k = 1; k < pts.length; k++) {
      const i = pts[k]!;
      const j = pts[(k + 1) % pts.length]!;
      d += ` Q${x[i]!.toFixed(1)},${y[i]!.toFixed(1)} ${((x[i]! + x[j]!) / 2).toFixed(1)},${((y[i]! + y[j]!) / 2).toFixed(1)}`;
    }
    return `${d} Z`;
  }

  /** A row as a polyline, optionally lifted by `lift` px, e.g. for a dyed hem stripe. */
  rowPath(r: number, lift = 0): string {
    const { x, y, cols } = this;
    let d = '';
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      d += `${c ? ' L' : 'M'}${x[i]!.toFixed(1)},${(y[i]! - lift).toFixed(1)}`;
    }
    return d;
  }

  /** Mean displacement and lean of the sheet, for pinning text or emblems onto it. */
  pose(): { dx: number; dy: number; angle: number } {
    const { x, y, rx, ry, cols, rows } = this;
    let dx = 0;
    let dy = 0;
    for (let i = cols; i < x.length; i++) {
      dx += x[i]! - rx[i]!;
      dy += y[i]! - ry[i]!;
    }
    const count = x.length - cols;
    const mid = Math.floor(cols / 2);
    const bottom = (rows - 1) * cols + mid;
    const angle = Math.atan2(x[bottom]! - x[mid]!, y[bottom]! - y[mid]!);
    return { dx: dx / count, dy: dy / count, angle };
  }
}
