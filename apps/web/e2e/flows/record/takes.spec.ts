import { expect, test, type Page } from '@playwright/test';
import { FIXTURE, fixClock, seedFixture } from '../../support/seed';
import { pressRowButton } from '../../support/swipeRow';
import {
  guard as guardConsole,
  keepAndOpenTakes,
  openRecorder,
  openTakesTab,
  recordTake,
  storedDb,
} from './helpers';

// REQ-02 · The «Tomas» tab: list, filters, best take, download, share with the group (demo) and delete.

// REQ-02 · Playwright's WebKit build here has no Web Audio (`AudioNode` is undefined) and the app stops on load,
// before anything of this area can be reached: nothing here can run on it.
test.beforeEach(({ browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit de Playwright sin Web Audio (AudioNode): la app no arranca');
});

test.describe.configure({ timeout: 90_000 });

/** Dynamite (YouTube) has three seeded takes: Hana, Rei and Yuna. */
async function openSeededTakes(page: Page, overrides?: Parameters<typeof seedFixture>[1]) {
  await fixClock(page);
  await seedFixture(page, overrides);
  await page.goto(`/v/${FIXTURE.youtubeVideoId}`);
  await openTakesTab(page);
  await expect(page.getByRole('radiogroup', { name: 'Filtrar por persona' })).toBeVisible();
}

test('lista las tomas de la canción con su cuenta', async ({ page }) => {
  const guard = guardConsole(page);
  await openSeededTakes(page);
  await expect(page.getByRole('heading', { name: 'Tomas' })).toBeVisible();
  const takes = (await storedDb(page))['takes']!.filter((t) => t['video_id'] === FIXTURE.youtubeVideoId);
  expect(takes).toHaveLength(3);
  await expect(
    page.locator('#takes-title').locator('xpath=..').getByText('3', { exact: true }),
  ).toBeVisible();
  for (const name of ['Hana', 'Rei', 'Yuna']) {
    await expect(
      page.getByRole('radiogroup', { name: 'Filtrar por persona' }).getByRole('radio', { name }),
    ).toBeVisible();
  }
  guard.check();
});

test('filtra las tomas por persona y por clip, y quita los filtros', async ({ page }) => {
  const guard = guardConsole(page);
  await openSeededTakes(page);
  const persons = page.getByRole('radiogroup', { name: 'Filtrar por persona' });
  const stars = page.getByRole('button', { name: /mejor toma$/ });
  await expect(stars).toHaveCount(3);
  await persons.getByRole('radio', { name: 'Rei' }).click();
  await expect(persons.getByRole('radio', { name: 'Rei' })).toBeChecked();
  await expect(stars).toHaveCount(1);
  await persons.getByRole('radio', { name: 'Yuna' }).click();
  await expect(stars).toHaveCount(1);
  await persons.getByRole('radio', { name: 'Todos' }).click();
  await expect(stars).toHaveCount(3);
  // A clip filter that leaves nothing for the chosen person offers to clear the filters.
  const clips = page.getByRole('radiogroup', { name: 'Filtrar por clip' });
  if (await clips.isVisible()) {
    await persons.getByRole('radio', { name: 'Yuna' }).click();
    const options = clips.getByRole('radio');
    const n = await options.count();
    for (let i = 1; i < n; i++) {
      await options.nth(i).click();
      if (await page.getByText('Ninguna toma con estos filtros').isVisible()) break;
    }
    if (await page.getByText('Ninguna toma con estos filtros').isVisible()) {
      await page.getByRole('button', { name: 'Quitar filtros' }).click();
      await expect(stars).toHaveCount(3);
    }
  }
  guard.check();
});

test('marca y quita la mejor toma de una persona', async ({ page }) => {
  const guard = guardConsole(page);
  await openSeededTakes(page);
  const persons = page.getByRole('radiogroup', { name: 'Filtrar por persona' });
  await persons.getByRole('radio', { name: 'Rei' }).click();
  const mark = page.getByRole('button', { name: 'Marcar como mejor toma' }).first();
  await mark.click();
  await expect(page.getByRole('button', { name: 'Quitar de mejor toma' }).first()).toBeVisible();
  const reiTake = async () =>
    (await storedDb(page))['takes']!.find(
      (t) =>
        t['member_id'] === '00000000-0000-4000-8001-000000000005' && t['video_id'] === FIXTURE.youtubeVideoId,
    );
  await expect.poll(async () => (await reiTake())?.['is_best']).toBe(true);
  await page.getByRole('button', { name: 'Quitar de mejor toma' }).first().click();
  await expect(page.getByRole('button', { name: 'Marcar como mejor toma' }).first()).toBeVisible();
  await expect.poll(async () => (await reiTake())?.['is_best']).toBe(false);
  guard.check();
});

test('una toma de otro móvil avisa de que no se puede ver ni descargar', async ({ page }) => {
  const guard = guardConsole(page);
  await openSeededTakes(page, {
    overrides: (db) => {
      for (const t of db['takes']!) t['device_id'] = '00000000-0000-4000-8000-0000000000e9';
    },
  });
  await expect(
    page.getByRole('button', { name: 'No se puede ver: está en otro móvil' }).first(),
  ).toBeVisible();
  guard.check();
});

test('descarga, comparte con el grupo y borra una toma grabada', async ({ page, browser }) => {
  const guard = guardConsole(page);
  await openRecorder(page, browser);
  await recordTake(page);
  await keepAndOpenTakes(page);

  // Download.
  const download = page.waitForEvent('download', { timeout: 15_000 });
  await pressRowButton(page, 'Descargar la toma');
  expect((await download).suggestedFilename()).toMatch(/\.(webm|mp4)$/);

  // Share with the group: the dialog warns, then (demo) uploads a reduced copy.
  await pressRowButton(page, 'Compartir con el grupo');
  const share = page.getByRole('dialog', { name: 'Compartir con el grupo' });
  await expect(share).toBeVisible();
  await expect(share.getByText('Se sube una copia reducida a 720p')).toBeVisible();
  await share.getByRole('button', { name: 'Ahora no' }).click();
  await expect(share).toBeHidden();
  await pressRowButton(page, 'Compartir con el grupo');
  await share.getByRole('button', { name: 'Compartir' }).click();
  // The demo has no cloud (REQ-03 adds a local one): the copy is reduced, the upload fails and the dialog says so
  // without touching the take. The successful upload is not covered here.
  await expect(share.getByText(/la nube no responde/)).toBeVisible({ timeout: 40_000 });
  await expect(share.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  await share.getByRole('button', { name: 'Cerrar', exact: true }).last().click();
  await expect(share).toBeHidden();
  const mine = (await storedDb(page))['takes']!.find((t) => t['video_id'] === FIXTURE.uploadVideoId);
  expect(mine?.['shared_path'] ?? null).toBeNull();

  // Delete: the dialog says what happens; confirming archives it (the store keeps the row, hidden).
  await pressRowButton(page, 'Borrar la toma');
  const del = page.getByRole('dialog', { name: '¿Borrar esta toma?' });
  await expect(del).toContainText('Se borra de este móvil');
  await del.getByRole('button', { name: 'Cancelar' }).click();
  await expect(del).toBeHidden();
  await pressRowButton(page, 'Borrar la toma');
  await del.getByRole('button', { name: 'Borrar', exact: true }).click();
  await expect(page.getByText('Toma borrada')).toBeVisible();
  await expect(page.getByText('Aún no hay tomas')).toBeVisible();
  guard.check();
});

/** A one-second silent WebM drawn on a canvas in the page (no camera, no sound). */
async function makeVideo(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const canvas = Object.assign(document.createElement('canvas'), { width: 320, height: 240 });
    const ctx = canvas.getContext('2d')!;
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    const done = new Promise((resolve) => (recorder.onstop = resolve));
    recorder.start(100);
    const started = performance.now();
    await new Promise<void>((resolve) => {
      const draw = () => {
        const t = performance.now() - started;
        ctx.fillStyle = `hsl(${(t / 4) % 360} 70% 50%)`;
        ctx.fillRect(0, 0, 320, 240);
        if (t < 1000) requestAnimationFrame(draw);
        else resolve();
      };
      draw();
    });
    recorder.stop();
    await done;
    const bytes = new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer());
    let text = '';
    for (const b of bytes) text += String.fromCharCode(b);
    return btoa(text);
  });
  return Buffer.from(base64, 'base64');
}

test('edita el nombre y quién baila de una toma', async ({ page }) => {
  const guard = guardConsole(page);
  await openSeededTakes(page);
  // Tapping the name opens «Editar toma».
  await page.getByRole('button', { name: 'Rei. Editar el nombre' }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar toma' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Nombre').fill('  Grupo 1 · Primera versión  ');
  await dialog.getByRole('radio', { name: 'Grupo / nadie' }).click();
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Grupo 1 · Primera versión. Editar el nombre' })).toBeVisible();
  await expect
    .poll(async () => {
      const t = (await storedDb(page))['takes']!.find((row) => row['label'] === 'Grupo 1 · Primera versión');
      return t ? t['member_id'] : 'missing';
    })
    .toBeNull();
  // Named but nobody's: the filter says so.
  await expect(
    page.getByRole('radiogroup', { name: 'Filtrar por persona' }).getByRole('radio', { name: 'Grupo / sin nombre' }),
  ).toBeVisible();

  // Its name with a person: the person shows as the second line.
  await page.getByRole('button', { name: 'Grupo 1 · Primera versión. Editar el nombre' }).click();
  await dialog.getByRole('radio', { name: 'Yuna' }).click();
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(dialog).toBeHidden();
  const row = page.getByRole('listitem').filter({
    has: page.getByRole('button', { name: 'Grupo 1 · Primera versión. Editar el nombre' }),
  });
  await expect(row.getByText('Yuna', { exact: true })).toBeVisible();
  guard.check();
});

test('una toma de grupo sin nombre muestra el nombre de su archivo', async ({ page }) => {
  const guard = guardConsole(page);
  await openSeededTakes(page, {
    overrides: (db) => {
      const first = db['takes']!.find((t) => t['video_id'] === FIXTURE.youtubeVideoId)!;
      first['member_id'] = null;
      first['file_name'] = 'Grupo 1 · Primera versión.mp4';
    },
  });
  await expect(page.getByRole('button', { name: 'Grupo 1 · Primera versión. Editar el nombre' })).toBeVisible();
  await expect(page.getByText('Sin nombre', { exact: true })).toHaveCount(0);
  guard.check();
});

test('subir vídeo pide el nombre y quién baila antes de subir', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'MediaRecorder de canvas para generar el vídeo');
  const guard = guardConsole(page);
  // The demo has no cloud: the upload fails after writing the row. Keep every row written, to read its name.
  await page.addInitScript(() => {
    const written: unknown[] = [];
    (window as unknown as { __takesWritten: unknown[] }).__takesWritten = written;
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key.includes('demo')) {
        try {
          for (const t of (JSON.parse(value) as { takes?: unknown[] }).takes ?? []) written.push(t);
        } catch {
          /* not JSON */
        }
      }
      return set.call(this, key, value);
    };
  });
  await openSeededTakes(page);
  const video = await makeVideo(page);
  const input = page.locator('input[data-take-upload]');
  const dialog = page.getByRole('dialog', { name: 'Subir vídeo' });
  const before = (await storedDb(page))['takes']!.length;

  // «Cancelar»: nothing goes up.
  await input.setInputFiles({ name: 'Ensayo grupo.webm', mimeType: 'video/webm', buffer: video });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Nombre')).toHaveValue('Ensayo grupo');
  await expect(dialog.getByRole('radio', { name: 'Hana' })).toBeChecked();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();
  expect((await storedDb(page))['takes']!.length).toBe(before);

  // «Subir» with a name and the group: the row is written with both.
  await input.setInputFiles({ name: 'Ensayo grupo.webm', mimeType: 'video/webm', buffer: video });
  await dialog.getByLabel('Nombre').fill('Grupo 2 · Segunda versión');
  await dialog.getByRole('radio', { name: 'Grupo / nadie' }).click();
  await dialog.getByRole('button', { name: 'Subir' }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { __takesWritten: { label?: string; member_id?: string | null }[] }).__takesWritten
          .filter((t) => t.label === 'Grupo 2 · Segunda versión')
          .map((t) => t.member_id),
      ),
    )
    .toContain(null);
  guard.check();
});
