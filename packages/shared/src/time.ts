/** `65.3` → `1:05` (or `1:05.3` with `tenths`). Hours appear only when needed. */
export function formatTime(seconds: number, opts: { tenths?: boolean } = {}): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const totalTenths = Math.floor(safe * 10 + 1e-6);
  const whole = Math.floor(totalTenths / 10);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const ss = String(s).padStart(2, '0');
  const base = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  return opts.tenths ? `${base}.${totalTenths % 10}` : base;
}

/** Accepts `75`, `75.5`, `1:15`, `1:15.5`, `1:01:15`. Returns null when unparseable. */
export function parseTime(input: string): number | null {
  const raw = input.trim().replace(',', '.');
  if (!raw) return null;
  const parts = raw.split(':');
  if (parts.length > 3) return null;
  let total = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const isLast = i === parts.length - 1;
    if (!(isLast ? /^\d+(\.\d+)?$/ : /^\d+$/).test(part)) return null;
    const value = Number(part);
    if (!isLast && i > 0 && value >= 60) return null;
    total = total * 60 + value;
  }
  if (parts.length > 1 && Number(parts[parts.length - 1]) >= 60) return null;
  return total;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '—';
  return formatTime(seconds);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}
