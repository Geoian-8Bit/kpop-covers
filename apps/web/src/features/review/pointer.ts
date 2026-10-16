/** Keep following a pointer outside the element (a finger leaving the bar). Never throws (an id already gone). */
export function capturePointer(e: { currentTarget: EventTarget; pointerId: number }): void {
  try {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  } catch {
    /* the pointer is already gone: the gesture still works inside the element */
  }
}
