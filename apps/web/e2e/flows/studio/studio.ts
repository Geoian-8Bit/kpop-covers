import { expect, test, type Page } from '@playwright/test';
import { FIXTURE, fixClock, seedFixture, seedUploadMedia, type SeedFixtureOptions } from '../../support/seed';
import { shortClips } from '../../support/shortClips';
import { studioVideo, VIDEO_SECONDS, withDuration } from '../../support/studioVideo';

// REQ-02 · The WebM helpers live in support/ so the perf harness can use them without importing a flow; re-exported
// here so the specs keep their imports.
export { shortClips, studioVideo, VIDEO_SECONDS, withDuration };

export interface OpenOptions extends SeedFixtureOptions {
  /** Which fixture video to open (an upload by default). */
  id?: string;
  clock?: 'fixed' | 'install';
  /** Store the test video as the upload's file (default for uploads). */
  media?: Buffer | null;
}

/** Opens a studio on the seeded demo and waits until its player is ready. */
export async function openStudio(
  page: Page,
  { id = FIXTURE.uploadVideoId, clock = 'fixed', media, ...seed }: OpenOptions = {},
) {
  await fixClock(page, clock);
  await seedFixture(page, seed);
  if (media) {
    await page.goto('/');
    await seedUploadMedia(page, id, media);
  }
  await page.goto(`/v/${id}`);
  const track = page.getByRole('slider', { name: 'Línea de tiempo' });
  await expect(track).not.toHaveAttribute('aria-valuemax', '0', { timeout: 20_000 });
  return track;
}

/** The studio's video element, read from the page. */
export const media = (page: Page) =>
  page.evaluate(() => {
    const v = document.querySelector('video');
    return v ? { t: v.currentTime, paused: v.paused, rate: v.playbackRate, d: v.duration } : null;
  });

/**
 * REQ-02 · The Playwright WebKit build on Windows has no Web Audio (`AudioNode` is undefined): the app throws while it
 * loads and the page stays blank, so no studio flow or picture can be taken there. Call at the top of a spec.
 */
export function skipWithoutWebAudio(): void {
  test.beforeEach(({ browserName }) => {
    test.skip(
      browserName === 'webkit',
      'WebKit de Playwright en Windows no tiene Web Audio (AudioNode): la app falla al cargar y la página queda en blanco',
    );
  });
}
