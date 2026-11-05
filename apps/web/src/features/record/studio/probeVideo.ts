export interface ProbedVideo {
  duration: number;
  width: number | null;
  height: number | null;
}

/**
 * A finished take's own length and size, read from the file (a recovered take has no counter; the camera may have
 * changed).
 *
 * REQ-24 · `needDuration: false` (the recorder already counted the take's exact length): the size is all that is
 * wanted, so it resolves on `loadedmetadata` instead of seeking a recorded WebM to its end to learn a length nobody
 * reads (up to 4 s on a long take). A file whose metadata has no picture size yet (`videoWidth` 0) waits as before.
 */
export function probeVideo(
  url: string,
  { needDuration = true }: { needDuration?: boolean } = {},
): Promise<ProbedVideo> {
  return new Promise((resolve) => {
    const el = document.createElement('video');
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
      resolve({ duration, width: el.videoWidth || null, height: el.videoHeight || null });
      el.removeAttribute('src');
      el.load();
    };
    const timer = setTimeout(finish, 4000);
    el.preload = 'metadata';
    el.muted = true;
    el.onloadedmetadata = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) return finish();
      if (!needDuration && el.videoWidth > 0) return finish();
      // Recorded WebMs don't say their length: seeking far makes the browser find the end.
      el.ondurationchange = () => {
        if (Number.isFinite(el.duration) && el.duration > 0) finish();
      };
      el.currentTime = 1e101;
    };
    el.onerror = finish;
    el.src = url;
  });
}
