import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { MomentId } from './designLab';

export interface DemoProps {
  /** Variant id to show, from the moment's `variants`. */
  variant: string;
}

/**
 * One demo per moment: the variant at work with sample data, loaded only when the lab shows it.
 * `Record<MomentId, …>` makes a new moment in `MOMENTS` fail the typecheck until its demo is added here.
 */
export const DEMOS: Record<MomentId, LazyExoticComponent<ComponentType<DemoProps>>> = {
  'record-settings': lazy(() =>
    import('@/features/record/settings/RecorderSettingsDemo').then((m) => ({
      default: m.RecorderSettingsDemo,
    })),
  ),
};
