import type { CDPSession, Page } from '@playwright/test';

/**
 * REQ-03 · Real touches through CDP (`Input.dispatchTouchEvent`), the way the existing zoom flow does it. A gesture is
 * a function of time: the loop sends a move as fast as the page takes them for `ms` milliseconds, so the page, not the
 * script, decides how many frames the gesture gets (a slow page drops touch moves instead of the test stretching).
 */
export interface Pt {
  x: number;
  y: number;
}

export async function touchSession(page: Page): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  return cdp;
}

type Phase = 'touchStart' | 'touchMove' | 'touchEnd';

const send = (cdp: CDPSession, type: Phase, points: Pt[]) =>
  cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' ? [] : points.map((p, i) => ({ x: p.x, y: p.y, id: i + 1 })),
  });

/** Holds the fingers down for `ms`, each at `at(progress 0..1)`. Resolves after the lift. */
export async function gesture(cdp: CDPSession, ms: number, at: (t: number) => Pt[]): Promise<void> {
  await send(cdp, 'touchStart', at(0));
  const t0 = Date.now();
  for (let elapsed = 0; elapsed < ms; elapsed = Date.now() - t0)
    await send(cdp, 'touchMove', at(Math.min(1, elapsed / ms)));
  await send(cdp, 'touchEnd', []);
}

/** A triangle wave 0 → 1 → 0 over [0,1] repeated `cycles` times: back and forth without a jump. */
export const wave = (t: number, cycles = 1) => {
  const x = (t * cycles * 2) % 2;
  return x <= 1 ? x : 2 - x;
};

/** Two fingers around `c` spreading and closing again, `from`..`to` px apart from the centre. */
export const pinchAt =
  (c: Pt, from = 30, to = 130, cycles = 1) =>
  (t: number): Pt[] => {
    const s = from + (to - from) * wave(t, cycles);
    return [
      { x: c.x - s, y: c.y },
      { x: c.x + s, y: c.y },
    ];
  };

/** One finger going back and forth along x over `span` px from `from`. */
export const slideAt =
  (from: Pt, span: number, cycles = 1) =>
  (t: number): Pt[] => [{ x: from.x + span * wave(t, cycles), y: from.y }];

export async function centerOf(page: Page, selector: string): Promise<Pt & { w: number; h: number }> {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`no box for ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, w: box.width, h: box.height };
}
