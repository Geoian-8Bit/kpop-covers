import type { ComponentType, LazyExoticComponent } from 'react';

/**
 * Design lab contract (temporary: the lab goes away once the product owner has chosen).
 *
 * Each moment lives in its own module, `moments/<id>.tsx`, exports one `LabMoment` and is listed in `registry.ts`.
 * Demos are `lazy()` and their files are named `*Demo.tsx` or `*Demo-*.tsx`, so their chunks stay out of the
 * service worker's precache (vite.config.ts) and only download when someone opens the lab.
 * Real components read the chosen variant with `useDesignVariant(momentId)` from `labState.ts`.
 */
export type LabVariant = {
  /** Stable id, stored on the device. Never rename one that has shipped: old choices fall back to the default. */
  id: string;
  label: string;
  description: string;
  /** The variant at work with sample data. Rendered inside the lab's stage, with Suspense and an error boundary. */
  Demo: LazyExoticComponent<ComponentType>;
};

export type LabMoment = {
  /** Stable id: the key stored on the device and the argument of `useDesignVariant`. */
  id: string;
  /** Short reference from the plan, e.g. «P1» or «F17». */
  code: string;
  name: string;
  description: string;
  /** Used when nothing valid is chosen on this device. Must be one of `variants`. */
  defaultVariant: string;
  variants: LabVariant[];
  /** The choice changes the real app on this device, not only the demo. */
  appliesLive?: boolean;
};
