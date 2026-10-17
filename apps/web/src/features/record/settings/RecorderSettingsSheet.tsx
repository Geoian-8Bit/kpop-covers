import { RecorderSettingsFan } from './RecorderSettingsFan';
import type { RecorderSettingsProps } from './model';

export type { RecorderSettingsProps } from './model';

/**
 * The recorder's settings panel (A1), the «Abanico» (folding fan) design. Render it always, inside a positioned box
 * (the recorder): it animates in and out with `open` and shapes itself to that box, upright or turned.
 */
export function RecorderSettingsSheet(props: RecorderSettingsProps) {
  return <RecorderSettingsFan {...props} />;
}
