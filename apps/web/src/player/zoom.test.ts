import { describe, expect, it } from 'vitest';
import {
  clampZoom,
  clipHasZoom,
  clipZoomColumns,
  contentBox,
  gestureZoom,
  isDoubleTap,
  isZoomed,
  keyZoom,
  mirrorZoom,
  NO_ZOOM,
  sameZoom,
  stepZoom,
  unmirror,
  wheelZoom,
  zoomFromBox,
  zoomInBox,
  zoomLabel,
  zoomOfClip,
  zoomTransform,
} from './zoom';

const box = { width: 400, height: 200 };
const media = { width: 1920, height: 1080 }; // 16:9 in a 2:1 box → bars left and right

describe('limits', () => {
  it('keeps the scale 1–4 and the centre in the picture', () => {
    expect(clampZoom({ scale: 9, x: 2, y: -1 })).toEqual({ scale: 4, x: 1, y: 0 });
    expect(clampZoom({ scale: 0.3, x: 0.2, y: 0.2 })).toEqual(NO_ZOOM);
    expect(clampZoom({ scale: Number.NaN, x: 0.2, y: 0.2 })).toEqual(NO_ZOOM);
    expect(clampZoom(null)).toEqual(NO_ZOOM);
    expect(clampZoom({ scale: 2.3456, x: 0.123456, y: 0.5 })).toEqual({ scale: 2.35, x: 0.1235, y: 0.5 });
  });

  it('knows when it is zoomed and labels it', () => {
    expect(isZoomed(NO_ZOOM)).toBe(false);
    expect(isZoomed({ scale: 1.004, x: 0.5, y: 0.5 })).toBe(false);
    expect(isZoomed({ scale: 1.5, x: 0.5, y: 0.5 })).toBe(true);
    expect(zoomLabel({ scale: 2.5, x: 0.3, y: 0.3 })).toBe('250 %');
    expect(sameZoom({ scale: 2, x: 0.30001, y: 0.4 }, { scale: 2, x: 0.3, y: 0.4 })).toBe(true);
    expect(sameZoom({ scale: 1, x: 0.1, y: 0.1 }, NO_ZOOM)).toBe(true);
  });
});

describe('picture ↔ box', () => {
  it('finds the picture inside its box (object-fit: contain)', () => {
    const c = contentBox(box, media);
    expect(c.height).toBe(200);
    expect(c.width).toBeCloseTo(355.56, 1);
    expect(c.left).toBeCloseTo(22.22, 1);
    expect(contentBox(box, null)).toEqual({ left: 0, top: 0, width: 400, height: 200 });
  });

  it('brings the zoomed spot to the centre of the box', () => {
    const z = { scale: 2, x: 0.5, y: 0.5 };
    expect(zoomInBox(z, box, media)).toEqual({ scale: 2, cx: 200, cy: 100 });
    expect(zoomTransform(z, box, media)).toBe('translate(0px, 0px) scale(2)');
    expect(zoomTransform(NO_ZOOM, box, media)).toBe('none');
  });

  it('never shows past the edges of the box', () => {
    const corner = zoomInBox({ scale: 2, x: 0, y: 0 }, box, media);
    expect(corner.cx).toBe(100); // half of what is shown (400 / 2 / 2)
    expect(corner.cy).toBe(50);
    // translate brings box (100, 50) to the centre: (200 − 100) × 2, (100 − 50) × 2
    expect(zoomTransform({ scale: 2, x: 0, y: 0 }, box, media)).toBe('translate(200px, 100px) scale(2)');
  });

  it('goes back and forth between the box and the picture', () => {
    const z = { scale: 3, x: 0.4, y: 0.6 };
    const b = zoomInBox(z, box, media);
    expect(zoomFromBox(b.scale, b.cx, b.cy, box, media)).toEqual(z);
  });

  it('flips a finger on screen to the picture side under the mirror', () => {
    expect(unmirror({ x: 50, y: 20 }, box, true)).toEqual({ x: 350, y: 20 });
    expect(unmirror({ x: 50, y: 20 }, box, false)).toEqual({ x: 50, y: 20 });
  });

  it('shows a mirrored picture’s zoom on the other side of the screen', () => {
    expect(mirrorZoom({ scale: 2, x: 0.3, y: 0.7 }, true)).toEqual({ scale: 2, x: 0.7, y: 0.7 });
    expect(mirrorZoom({ scale: 2, x: 0.3, y: 0.7 }, false)).toEqual({ scale: 2, x: 0.3, y: 0.7 });
    expect(mirrorZoom(NO_ZOOM, true)).toEqual(NO_ZOOM);
    // A letterboxed picture is centred in its box, so flipping the fraction flips the spot on screen.
    const z = { scale: 2, x: 0.3, y: 0.5 };
    const plain = zoomInBox(z, box, media);
    const flipped = zoomInBox(mirrorZoom(z, true), box, media);
    expect(flipped.cx).toBeCloseTo(box.width - plain.cx, 5);
  });
});

describe('gestures', () => {
  it('pinches around the fingers: the spot under them stays under them', () => {
    const from = [
      { x: 80, y: 100 },
      { x: 120, y: 100 },
    ];
    const to = [
      { x: 60, y: 100 },
      { x: 140, y: 100 },
    ];
    const z = gestureZoom(NO_ZOOM, from, to, box, null, false);
    expect(z.scale).toBe(2);
    // The midpoint (100, 100) of the box is still under the fingers: 100 = 200 + (100 − cx) × 2 → cx = 150
    const b = zoomInBox(z, box, null);
    expect(b.cx).toBeCloseTo(150, 5);
    expect(b.cy).toBeCloseTo(100, 5);
  });

  it('drags the zoomed picture with one finger', () => {
    const start = { scale: 2, x: 0.5, y: 0.5 };
    const z = gestureZoom(start, [{ x: 200, y: 100 }], [{ x: 240, y: 100 }], box, null, false);
    // Moving the finger 40 px right shows what was 20 px (40 / 2) to the left.
    expect(zoomInBox(z, box, null).cx).toBeCloseTo(180, 5);
  });

  it('follows the picture under the mirror: a drag to the right moves the picture right on screen', () => {
    const start = { scale: 2, x: 0.5, y: 0.5 };
    const z = gestureZoom(start, [{ x: 200, y: 100 }], [{ x: 240, y: 100 }], box, null, true);
    // On the mirrored layer the finger went left, so the layer's centre moves the other way.
    expect(zoomInBox(z, box, null).cx).toBeCloseTo(220, 5);
  });

  it('pinching on the left of a mirrored video zooms the right of the picture', () => {
    const from = [
      { x: 40, y: 100 },
      { x: 60, y: 100 },
    ];
    const to = [
      { x: 20, y: 100 },
      { x: 80, y: 100 },
    ];
    const plain = gestureZoom(NO_ZOOM, from, to, box, null, false);
    const mirrored = gestureZoom(NO_ZOOM, from, to, box, null, true);
    expect(plain.x).toBeLessThan(0.5);
    expect(mirrored.x).toBeGreaterThan(0.5);
    expect(mirrored.x).toBeCloseTo(1 - plain.x, 3);
  });

  it('ignores mismatched or empty pointer lists', () => {
    const start = { scale: 2, x: 0.4, y: 0.4 };
    expect(gestureZoom(start, [], [], box, null, false)).toEqual(start);
    expect(gestureZoom(start, [{ x: 1, y: 1 }], [], box, null, false)).toEqual(start);
  });

  it('zooms with the wheel around the cursor, within 1–4', () => {
    const z = wheelZoom(NO_ZOOM, -200, { x: 300, y: 50 }, box, null, false);
    expect(z.scale).toBeGreaterThan(1);
    expect(z.x).toBeGreaterThan(0.5);
    expect(z.y).toBeLessThan(0.5);
    let far = NO_ZOOM;
    for (let i = 0; i < 20; i++) far = wheelZoom(far, -400, { x: 200, y: 100 }, box, null, false);
    expect(far.scale).toBe(4);
    let back = far;
    for (let i = 0; i < 20; i++) back = wheelZoom(back, 400, { x: 200, y: 100 }, box, null, false);
    expect(back).toEqual(NO_ZOOM);
  });

  it('steps with the buttons and moves with the keys', () => {
    const z = stepZoom(NO_ZOOM, 2);
    expect(z).toEqual({ scale: 2, x: 0.5, y: 0.5 });
    const right = keyZoom(z, 'ArrowRight', box, null, false)!;
    expect(right.x).toBeGreaterThan(0.5);
    const rightMirrored = keyZoom(z, 'ArrowRight', box, null, true)!;
    expect(rightMirrored.x).toBeLessThan(0.5);
    expect(keyZoom(z, '+', box, null, false)!.scale).toBe(2.5);
    expect(keyZoom(z, '0', box, null, false)).toEqual(NO_ZOOM);
    expect(keyZoom(z, 'x', box, null, false)).toBeNull();
  });

  describe('a vertical video (phone) in a landscape panel', () => {
    const panel = { width: 640, height: 360 };
    const vertical = { width: 1080, height: 1920 };

    it('«Ampliar» and «Reducir» keep the zoomed spot, only the scale changes', () => {
      const z = { scale: 2, x: 0.1, y: 0.3 };
      expect(stepZoom(z, 1.5)).toEqual({ scale: 3, x: 0.1, y: 0.3 });
      expect(stepZoom(z, 1 / 1.5)).toEqual({ scale: 1.33, x: 0.1, y: 0.3 });
      expect(stepZoom(z, 1 / 4)).toEqual(NO_ZOOM);
      expect(stepZoom({ scale: 3.5, x: 0.9, y: 0.9 }, 2)).toEqual({ scale: 4, x: 0.9, y: 0.9 });
      expect(stepZoom(z, Number.NaN)).toEqual(z);
    });

    it('arrow keys move the view within the picture, both ways under the mirror', () => {
      const z = { scale: 2, x: 0.5, y: 0.5 };
      const right = keyZoom(z, 'ArrowRight', panel, vertical, false)!;
      expect(right.x).toBeGreaterThan(0.5);
      expect(right.scale).toBe(2);
      expect(keyZoom(z, 'ArrowRight', panel, vertical, true)!.x).toBeLessThan(0.5);
      expect(keyZoom(z, 'ArrowDown', panel, vertical, false)!.y).toBeGreaterThan(0.5);
      let far = z;
      for (let i = 0; i < 30; i++) far = keyZoom(far, 'ArrowLeft', panel, vertical, false)!;
      expect(far.x).toBeGreaterThanOrEqual(0);
      expect(far.x).toBeLessThan(0.5);
      expect(keyZoom(z, '-', panel, vertical, false)).toEqual({ scale: 1.6, x: 0.5, y: 0.5 });
    });

    it('a mirrored pinch keeps the spot under the fingers', () => {
      const from = [
        { x: 290, y: 180 },
        { x: 310, y: 180 },
      ];
      const to = [
        { x: 270, y: 180 },
        { x: 330, y: 180 },
      ];
      const z = gestureZoom(NO_ZOOM, from, to, panel, vertical, true);
      expect(z.scale).toBe(3);
      const b = zoomInBox(z, panel, vertical);
      // Under the mirror, screen x 300 is layer x 340; it must still be the layer point under x 300.
      expect(b.cx + (340 - panel.width / 2) / b.scale).toBeCloseTo(340, 0);
    });
  });

  it('a scale of 1,005 is still the whole video', () => {
    expect(clampZoom({ scale: 1.005, x: 0.2, y: 0.2 })).toEqual(NO_ZOOM);
    expect(clampZoom({ scale: 1.01, x: 0.2, y: 0.2 })).toEqual({ scale: 1.01, x: 0.2, y: 0.2 });
  });

  it('tells a double tap from two taps', () => {
    const a = { at: 1000, x: 10, y: 10 };
    expect(isDoubleTap(a, { at: 1200, x: 15, y: 12 })).toBe(true);
    expect(isDoubleTap(a, { at: 1400, x: 15, y: 12 })).toBe(false);
    expect(isDoubleTap(a, { at: 1200, x: 90, y: 12 })).toBe(false);
    expect(isDoubleTap(null, a)).toBe(false);
  });
});

describe('saved with a clip', () => {
  it('reads the columns, old rows without them show the whole video', () => {
    expect(zoomOfClip({ zoom_scale: 2.5, zoom_x: 0.25, zoom_y: 0.8 })).toEqual({
      scale: 2.5,
      x: 0.25,
      y: 0.8,
    });
    expect(zoomOfClip({ zoom_scale: '2.50', zoom_x: '0.2500', zoom_y: '0.8000' })).toEqual({
      scale: 2.5,
      x: 0.25,
      y: 0.8,
    });
    expect(zoomOfClip({})).toEqual(NO_ZOOM);
    expect(zoomOfClip(null)).toEqual(NO_ZOOM);
    expect(clipHasZoom({ zoom_scale: 1, zoom_x: 0.5, zoom_y: 0.5 })).toBe(false);
    expect(clipHasZoom({ zoom_scale: 1.5, zoom_x: 0.5, zoom_y: 0.5 })).toBe(true);
  });

  it('writes columns within the database limits and precision', () => {
    expect(clipZoomColumns({ scale: 2.345, x: 0.123456, y: 1.2 })).toEqual({
      zoom_scale: 2.35,
      zoom_x: 0.1235,
      zoom_y: 1,
    });
    expect(clipZoomColumns(NO_ZOOM)).toEqual({ zoom_scale: 1, zoom_x: 0.5, zoom_y: 0.5 });
    expect(clipZoomColumns({ scale: 1, x: 0.1, y: 0.9 })).toEqual({
      zoom_scale: 1,
      zoom_x: 0.5,
      zoom_y: 0.5,
    });
    const c = clipZoomColumns({ scale: 99, x: -3, y: 0.5 });
    expect(c.zoom_scale).toBeLessThanOrEqual(4);
    expect(c.zoom_x).toBeGreaterThanOrEqual(0);
  });
});
