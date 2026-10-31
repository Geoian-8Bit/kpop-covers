import type { Browser, Page } from '@playwright/test';
import { FIXTURE, loadFixture } from '../support/seed';
import { studioVideo } from '../support/studioVideo';
import { shortClips, studioReady, type DemoSetup } from './fluid';

/**
 * REQ-03 · The studio on the fixture's upload «Ensayo coreo completa» with a real 3 s WebM stored as its file (the same
 * set-up the studio flows use), its clips squeezed inside those 3 s.
 */
let video: Buffer | null = null;
export async function studioBytes(browser: Browser): Promise<Buffer> {
  video ??= await studioVideo(browser);
  return video;
}

export async function studioSetup(browser: Browser, extra: Partial<DemoSetup> = {}): Promise<DemoSetup> {
  return {
    url: `/v/${FIXTURE.uploadVideoId}`,
    media: { id: FIXTURE.uploadVideoId, bytes: await studioBytes(browser) },
    overrides: shortClips,
    ready: studioReady,
    ...extra,
  };
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The first saved clip of the song, as the list in the studio names it. */
export function firstClipName(): string {
  const clip = loadFixture().clips!.find((c) => c.video_id === FIXTURE.uploadVideoId);
  return String(clip?.name ?? '');
}

/** The seal of the range's end (B): the second grab handle of the timeline. */
export const handleB = '[data-track] div[class*="cursor-ew-resize"] >> nth=1';

/** Taps the first clip of the list: its range, speed and mirror become the loop (A and B handles appear). */
export async function applyFirstClip(page: Page): Promise<void> {
  await page
    .getByRole('list')
    .getByRole('button', { name: new RegExp(`^${escapeRegExp(firstClipName())}`) })
    .first()
    .click();
  await page.locator(handleB).waitFor({ timeout: 10_000 });
}

export const playButton = (page: Page) => page.getByRole('button', { name: /^(Reproducir|Pausar)$/ }).nth(1);

/** Makes sure the studio is playing (the clip row may or may not start it). */
export async function ensurePlaying(page: Page): Promise<void> {
  const button = playButton(page);
  if ((await button.getAttribute('aria-label')) === 'Reproducir') await button.click();
}
