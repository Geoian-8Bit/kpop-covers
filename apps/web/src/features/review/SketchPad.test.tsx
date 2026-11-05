// @vitest-environment jsdom
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SketchShape } from './reviewRules';
import { sketchImage, SketchPad } from './TakeNoteComposer';

/**
 * REQ-25 · The note composer's live stroke moved from React state to a ref painted once a frame. The saved drawing
 * comes from `sketchImage(frame, shapes)`: same gesture → same shapes → the same encoded string, byte for byte. A
 * recording 2D context stands in for the browser's canvas: its "data URL" is the exact list of drawing calls.
 */

type Log = string[];
let log: Log = [];
const fakeContext = (canvas: HTMLCanvasElement) =>
  new Proxy({ canvas } as unknown as CanvasRenderingContext2D, {
    get(_target, key) {
      if (key === 'canvas') return canvas;
      if (typeof key !== 'string') return undefined;
      return (...args: unknown[]) =>
        log.push(
          `${key}(${args.map((a) => (a instanceof HTMLElement ? a.tagName : JSON.stringify(a))).join(',')})`,
        );
    },
    set(_target, key, value) {
      log.push(`${String(key)}=${JSON.stringify(value)}`);
      return true;
    },
  });

/** The pointer → frame mapping the composer has always used (rect of the canvas, mirrored like the take). */
function expectedPoint(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  frame: HTMLCanvasElement,
  mirrored: boolean,
) {
  const x = ((clientX - rect.left) / rect.width) * frame.width;
  const y = ((clientY - rect.top) / rect.height) * frame.height;
  return { x: mirrored ? frame.width - x : x, y };
}

describe('SketchPad (REQ-25)', () => {
  let frames: FrameRequestCallback[] = [];
  beforeEach(() => {
    log = [];
    frames = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
    ) {
      return fakeContext(this);
    } as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (this: HTMLCanvasElement) {
      return `data:image/webp;base64,${btoa(String(log.length))}`;
    });
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const frame = Object.assign(document.createElement('canvas'), { width: 320, height: 180 });
  const rect = {
    left: 10,
    top: 20,
    width: 160,
    height: 90,
    right: 170,
    bottom: 110,
    x: 10,
    y: 20,
  } as DOMRect;

  for (const [tool, mirrored] of [
    ['circle', false],
    ['arrow', true],
  ] as const) {
    it(`a ${tool} drag${mirrored ? ' (mirrored)' : ''} gives the same shape and the same saved drawing`, () => {
      const onShapes = vi.fn();
      const { container } = render(
        <SketchPad
          frame={frame}
          mirrored={mirrored}
          shapes={[]}
          onShapes={onShapes}
          tool={tool}
          onTool={() => undefined}
        />,
      );
      const canvas = container.querySelector('canvas')!;
      canvas.getBoundingClientRect = () => rect;
      const path = [
        [30, 40],
        [60, 55],
        [90, 70],
        [120, 95],
      ] as const;
      fireEvent.pointerDown(canvas, { pointerId: 1, clientX: path[0][0], clientY: path[0][1] });
      for (const [x, y] of path.slice(1))
        fireEvent.pointerMove(canvas, { pointerId: 1, clientX: x, clientY: y });
      // The live stroke is painted once per frame, whatever the number of moves.
      expect(frames).toHaveLength(1);
      act(() => frames.shift()!(0));
      fireEvent.pointerUp(canvas, { pointerId: 1 });

      const expected: SketchShape = {
        kind: tool,
        from: expectedPoint(path[0][0], path[0][1], rect, frame, mirrored),
        to: expectedPoint(path.at(-1)![0], path.at(-1)![1], rect, frame, mirrored),
      };
      expect(onShapes).toHaveBeenCalledTimes(1);
      const [shapes] = onShapes.mock.calls[0] as [SketchShape[]];
      expect(shapes).toEqual([expected]);

      log = [];
      const saved = sketchImage(frame, shapes);
      const savedLog = log;
      log = [];
      const reference = sketchImage(frame, [expected]);
      expect(saved).toBe(reference);
      expect(savedLog).toEqual(log);
    });
  }

  it('a cancelled drag saves nothing', () => {
    const onShapes = vi.fn();
    const { container } = render(
      <SketchPad
        frame={frame}
        mirrored={false}
        shapes={[]}
        onShapes={onShapes}
        tool="circle"
        onTool={() => undefined}
      />,
    );
    const canvas = container.querySelector('canvas')!;
    canvas.getBoundingClientRect = () => rect;
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 30, clientY: 40 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 90, clientY: 80 });
    fireEvent.pointerCancel(canvas, { pointerId: 1 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    expect(onShapes).not.toHaveBeenCalled();
  });
});
