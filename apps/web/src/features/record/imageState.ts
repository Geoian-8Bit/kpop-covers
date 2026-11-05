/** C2–C4 · What the image controls hold (kept apart from the panel, which loads only when it opens: REQ-23). */
export interface ImageState {
  /** Exposure compensation (C3), 0 = as the camera meters. */
  exposure: number;
  /** White balance (C4), null = automatic. */
  kelvin: number | null;
  /** Focus and exposure held (C2). */
  locked: boolean;
}

export const IMAGE_DEFAULT: ImageState = { exposure: 0, kelvin: null, locked: false };
