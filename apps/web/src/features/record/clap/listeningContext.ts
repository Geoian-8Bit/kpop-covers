// REQ-23 · Made in the tap that arms: kept apart from the clap detector, which loads with the armed view (ClapArm).

/** An AudioContext for the analysis. Create it inside the tap that arms (Safari only lets audio start there). */
export function createListeningContext(): AudioContext | null {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    const ctx = new Ctor({ latencyHint: 'interactive' });
    void ctx.resume().catch(() => undefined);
    return ctx;
  } catch {
    return null;
  }
}
