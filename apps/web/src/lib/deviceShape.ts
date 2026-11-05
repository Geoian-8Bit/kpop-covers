// REQ-28 · Shared by the cloud copy and the voice separation (both refuse an original too heavy for this device).

export interface DeviceShape {
  /** A phone: coarse pointer and a small screen. */
  mobile: boolean;
  /** `navigator.deviceMemory` (GB), where the browser tells it. */
  memoryGb: number | null;
}

/** This device as far as memory goes: a phone reads less into memory before closing the tab. */
export function deviceShape(): DeviceShape {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return {
    mobile: coarse && Math.min(screen.width, screen.height) < 820,
    memoryGb: typeof memory === 'number' ? memory : null,
  };
}
