import { RecorderSettingsFan } from './RecorderSettingsFan';
import { RecorderSettingsScroll } from './RecorderSettingsScroll';
import { RecorderSettingsTray } from './RecorderSettingsTray';
import type { RecorderSettingsProps } from './model';

export type { RecorderSettingsProps } from './model';

export type RecorderSettingsVariant = 'tray' | 'fan' | 'scroll';

/**
 * The recorder's settings panel (A1) in the chosen design: 'tray' (bandeja de laca, the recommended one), 'fan'
 * (abanico) or 'scroll' (makimono). Anything else gets the tray. Render it always, inside a positioned box (the
 * recorder): it animates in and out with `open` and shapes itself to that box, upright or turned.
 */
export function RecorderSettingsSheet({ variant, ...props }: RecorderSettingsProps & { variant: string }) {
  if (variant === 'fan') return <RecorderSettingsFan {...props} />;
  if (variant === 'scroll') return <RecorderSettingsScroll {...props} />;
  return <RecorderSettingsTray {...props} />;
}
