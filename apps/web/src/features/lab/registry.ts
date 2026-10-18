import { navMoment } from './moments/nav';
import type { LabMoment } from './types';

/**
 * Moments on trial in Ajustes › Laboratorio de diseño. Each one lives in `moments/<id>.tsx`; add yours with one
 * import and one entry here, and its ids in `labIds.ts` (what the app reads; a test checks both agree). This list
 * only loads with the lab (Ajustes). When the product owner picks a variant, remove the moment (and the losing
 * variants) from the code: a choice stored on a device for a moment that is gone is simply ignored (`labState`).
 * Point 40 · decided and removed: `countdown-long` (Tsuki), `voice-split` (La ola partida), `bags-list`
 * (Furoshiki) and `bag-icon` (Fukubukuro).
 */
export const MOMENTS: LabMoment[] = [
  navMoment,
  /* otros agentes añaden aquí */
];
