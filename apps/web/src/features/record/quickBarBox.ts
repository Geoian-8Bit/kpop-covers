import { placeQuickBar, QUICK_BAR_HEIGHT, QUICK_BAR_WIDTH, type Box } from './quickExposureRules';

/**
 * Where the bar goes for a tap at (`clientX`, `clientY`) on `root` (the studio), in `root`'s own coordinates: beside
 * the focus ring and clear of every control on screen. Read once per tap (never while dragging).
 */
export function quickBarBox(root: HTMLElement, clientX: number, clientY: number): Box {
  const r = root.getBoundingClientRect();
  const big = r.width * r.height * 0.3;
  const obstacles: Box[] = [];
  root
    .querySelectorAll<HTMLElement>('button, a[href], input, [role="slider"], [role="radio"]')
    .forEach((el) => {
      if (el.closest('[data-quick-light]')) return;
      const b = el.getBoundingClientRect();
      // Hidden, or a layer that covers the screen (not a control to keep clear of).
      if (b.width < 1 || b.height < 1 || b.width * b.height > big) return;
      obstacles.push({ left: b.left - r.left, top: b.top - r.top, width: b.width, height: b.height });
    });
  // Inside the safe area (notch, status bar, home bar), as the rest of the studio.
  const safe = safeInsets(root);
  const bounds = {
    left: safe.left,
    top: safe.top,
    width: Math.max(QUICK_BAR_WIDTH, r.width - safe.left - safe.right),
    height: Math.max(QUICK_BAR_HEIGHT, r.height - safe.top - safe.bottom),
  };
  return placeQuickBar(clientX - r.left, clientY - r.top, bounds, obstacles);
}

/** `env(safe-area-inset-*)` in px, read through a probe (CSS only exposes them to styles). */
function safeInsets(root: HTMLElement): { top: number; right: number; bottom: number; left: number } {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:absolute;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  root.appendChild(probe);
  const s = getComputedStyle(probe);
  const px = (v: string) => Number.parseFloat(v) || 0;
  const out = {
    top: px(s.paddingTop),
    right: px(s.paddingRight),
    bottom: px(s.paddingBottom),
    left: px(s.paddingLeft),
  };
  probe.remove();
  return out;
}
