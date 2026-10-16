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
  'voice-split': lazy(() =>
    import('@/features/voice/VoiceSplitDemo').then((m) => ({
      default: m.VoiceSplitDemo,
    })),
  ),
  'clap-arm': lazy(() =>
    import('@/features/record/clap/ClapArmDemo').then((m) => ({
      default: m.ClapArmDemo,
    })),
  ),
  'review-compare': lazy(() =>
    import('@/features/review/ReviewCompareDemo').then((m) => ({
      default: m.ReviewCompareDemo,
    })),
  ),
  'bag-draw': lazy(() =>
    import('@/features/bags/BagDrawDemo').then((m) => ({
      default: m.BagDrawDemo,
    })),
  ),
  'random-play': lazy(() =>
    import('@/features/rpd/RandomPlayDemo').then((m) => ({
      default: m.RandomPlayDemo,
    })),
  ),
};
