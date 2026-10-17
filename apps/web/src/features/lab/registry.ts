import { bagMoments } from './moments/bags';
import { countdownMoment } from './moments/countdown';
import { navMoment } from './moments/nav';
import { voiceMoment } from './moments/voice';
import type { LabMoment } from './types';

/**
 * Moments on trial in Ajustes › Laboratorio de diseño. Each one lives in `moments/<id>.tsx`; add yours with one
 * import and one entry here, and its ids in `labIds.ts` (what the app reads; a test checks both agree). This list
 * only loads with the lab (Ajustes). When the product owner picks a variant, remove the moment (and the losing
 * variants) from the code.
 */
export const MOMENTS: LabMoment[] = [
  navMoment,
  countdownMoment,
  voiceMoment,
  ...bagMoments,
  /* otros agentes añaden aquí */
];
