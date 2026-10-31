import { expect, test, type Page } from '@playwright/test';
import { DEMO_KEY } from '../demo';
import { FIXTURE, fixClock, guardConsole, loadFixture, seedFixture, seedUploadMedia } from '../support/seed';
import { testVideo } from '../support/testVideo';

// REQ-02 · Smoke test for the deterministic fixture: every main screen opens on it without errors, shows its data,
// and the app keeps the store exactly as seeded (nothing rewritten, nothing lost).

const storedDb = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), DEMO_KEY) as Promise<unknown>;

const SCREENS: [string, string][] = [
  ['/', 'Dynamite'],
  ['/bolsas', 'Canciones del mes'],
  ['/rpd', 'Ronda calentamiento'],
  ['/deseos', 'FAKE LOVE'],
  ['/eventos', 'Concurso de otoño'],
  ['/ajustes', 'Sora'],
  [`/v/${FIXTURE.youtubeVideoId}`, 'Dynamite'],
  [`/v/${FIXTURE.uploadVideoId}`, 'Ensayo coreo completa'],
];

test('el fixture carga en todas las pantallas sin errores y la app no lo reescribe', async ({ page }) => {
  const guard = guardConsole(page);
  await fixClock(page);
  await seedFixture(page);
  for (const [url, text] of SCREENS) {
    await page.goto(url);
    await expect(page.getByText(text).filter({ visible: true }).first(), url).toBeVisible();
  }
  expect(await storedDb(page)).toEqual(loadFixture());
  guard.check();
});

test('una subida del fixture reproduce el vídeo de prueba sembrado', async ({ page, browser }) => {
  const guard = guardConsole(page);
  const video = await testVideo(browser);
  expect(video.buffer.subarray(0, 4).toString('hex')).toBe('1a45dfa3'); // EBML: a WebM file
  await fixClock(page);
  await seedFixture(page);
  await page.goto('/');
  await seedUploadMedia(page, FIXTURE.uploadVideoId, video.buffer);
  await page.goto(`/v/${FIXTURE.uploadVideoId}`);
  await expect(page.getByText('Ensayo coreo completa').filter({ visible: true }).first()).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => [...document.querySelectorAll('video')].some((v) => v.readyState >= 1)))
    .toBe(true);
  guard.check();
});
