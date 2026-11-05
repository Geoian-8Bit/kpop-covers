import { expect, test } from '@playwright/test';
import {
  constraintsLog,
  guard as guardConsole,
  keepAndOpenTakes,
  openRecorder,
  recordTake,
  recorder,
  shutter,
  startTake,
  storedDb,
  storedSettings,
  timerOff,
} from './helpers';

// REQ-02 · Recorder flows on the fake camera. The take media lives in OPFS and the metadata in the demo store.

// REQ-02 · Playwright's WebKit build here has no Web Audio (`AudioNode` is undefined) and the app stops on load,
// before anything of this area can be reached: nothing here can run on it.
test.beforeEach(({ browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit de Playwright sin Web Audio (AudioNode): la app no arranca');
});

test.describe.configure({ timeout: 90_000 });

const UPLOAD_ID = '00000000-0000-4000-8002-000000000015';

test('abre el grabador con la cámara viva y sus controles', async ({ page, browser }) => {
  const guard = guardConsole(page);
  await openRecorder(page, browser);
  const rec = recorder(page);
  await expect(rec.getByRole('button', { name: 'Cerrar' })).toBeVisible();
  await expect(rec.getByRole('button', { name: /^Calidad:/ })).toBeVisible();
  await expect(rec.getByRole('button', { name: 'Girar la cámara' })).toBeVisible();
  await expect(rec.getByRole('button', { name: 'Ajustes del grabador' })).toBeVisible();
  await expect(rec.getByRole('button', { name: /^Armar:/ })).toBeVisible();
  await expect(rec.getByText('Ensayo coreo completa')).toBeVisible();
  // Closing with nothing recorded leaves straight away.
  await rec.getByRole('button', { name: 'Cerrar' }).click();
  await expect(rec).toBeHidden();
  guard.check();
});

test('cambia de lente y de zoom', async ({ page, browser }) => {
  const guard = guardConsole(page);
  await openRecorder(page, browser);
  const lenses = recorder(page).getByRole('group', { name: 'Lentes y zoom' });
  await expect(lenses.getByRole('button', { name: 'Principal, 1×' })).toHaveAttribute('aria-pressed', 'true');
  // A zoom of the same lens is applied to the track: the fake camera records the constraint.
  await lenses.getByRole('button', { name: 'Zoom 2×' }).click();
  await expect(lenses.getByRole('button', { name: 'Zoom 2×' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => constraintsLog(page)).toContain('"zoom":2');
  await lenses.getByRole('button', { name: 'Zoom 5×' }).click();
  await expect(lenses.getByRole('button', { name: 'Zoom 5×' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => constraintsLog(page)).toContain('"zoom":5');
  // Another rear lens reopens the camera on its own device.
  // The fake camera always reports the same device, so the chip can't show as active: what must happen is that the
  // camera is asked again, for the other rear device.
  await page.evaluate(() => {
    const md = navigator.mediaDevices;
    const open = md.getUserMedia.bind(md);
    const w = window as unknown as { __opened: string[] };
    w.__opened = [];
    md.getUserMedia = (c) => {
      w.__opened.push(JSON.stringify(c?.video));
      return open(c);
    };
  });
  await lenses.getByRole('button', { name: 'Otra cámara trasera (sin identificar)' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened.join('|')))
    .toContain('fake2');
  await expect(shutter(page)).toBeEnabled();
  await lenses.getByRole('button', { name: 'Principal, 1×' }).click();
  await expect(lenses.getByRole('button', { name: 'Principal, 1×' })).toHaveAttribute('aria-pressed', 'true');
  guard.check();
});

test('gira la cámara a la frontal y vuelve', async ({ page, browser }) => {
  const guard = guardConsole(page);
  await openRecorder(page, browser);
  const preview = recorder(page).locator('div.touch-none').first();
  await expect(preview).not.toHaveClass(/-scale-x-100/);
  await recorder(page).getByRole('button', { name: 'Girar la cámara' }).click();
  // The front camera is shown mirrored.
  await expect(preview).toHaveClass(/-scale-x-100/);
  await expect(shutter(page)).toBeEnabled();
  await recorder(page).getByRole('button', { name: 'Girar la cámara' }).click();
  await expect(preview).not.toHaveClass(/-scale-x-100/);
  guard.check();
});

test('ajusta la luz y el color de la luz desde «Imagen»', async ({ page, browser }) => {
  const guard = guardConsole(page);
  await openRecorder(page, browser);
  const rec = recorder(page);
  await rec.getByRole('button', { name: 'Ajustes del grabador' }).click();
  await rec.getByRole('button', { name: /^Imagen:/ }).click();
  const image = page.getByRole('dialog', { name: 'Imagen' });
  await expect(image).toBeVisible();

  const light = image.getByRole('slider', { name: 'Luz' });
  await light.focus();
  await light.press('ArrowRight');
  await light.press('ArrowRight');
  await expect.poll(() => constraintsLog(page)).toContain('exposureCompensation');
  await expect(image.getByRole('button', { name: 'Restablecer' })).toBeVisible();
  await image.getByRole('button', { name: 'Restablecer' }).click();

  const colours = image.getByRole('radiogroup', { name: 'Balance de blancos' });
  await expect(colours.getByRole('radio', { name: 'Auto' })).toBeChecked();
  await colours.getByRole('radio', { name: 'Cálida', exact: true }).click();
  await expect(colours.getByRole('radio', { name: 'Cálida', exact: true })).toBeChecked();
  await expect.poll(() => constraintsLog(page)).toContain('colorTemperature');
  await image.getByRole('button', { name: 'Cerrar los ajustes de imagen' }).click();
  await expect(image).toBeHidden();
  guard.check();
});

test('activa la cuadrícula, el nivel y el botón de información', async ({ page, browser }) => {
  const guard = guardConsole(page);
  await openRecorder(page, browser);
  const rec = recorder(page);
  await rec.getByRole('button', { name: 'Ajustes del grabador' }).click();
  await rec.getByRole('button', { name: /^Visor:/ }).click();
  for (const name of [/Rejilla/, /Nivel/, /Información técnica/])
    await rec.getByRole('switch', { name }).click();
  await expect.poll(() => storedSettings(page)).toMatchObject({ grid: true, level: true, info: true });
  await rec.getByRole('button', { name: 'Cerrar los ajustes' }).last().click();
  // The «i» button appears and opens the technical panel.
  await rec.getByRole('button', { name: 'Información técnica de la cámara' }).click();
  await expect(page.getByRole('dialog', { name: 'Información técnica' })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar la información' }).click();
  await expect(page.getByRole('dialog', { name: 'Información técnica' })).toBeHidden();
  guard.check();
});

test('cuenta atrás: cuenta 3 s antes de grabar y tocar la cancela', async ({ page, browser }) => {
  const guard = guardConsole(page);
  await openRecorder(page, browser);
  const rec = recorder(page);
  await expect(rec.getByRole('button', { name: 'Cuenta atrás: 3 segundos' })).toBeVisible();
  await shutter(page).click();
  await expect(rec.getByText('Toca para cancelar')).toBeAttached();
  await expect(shutter(page)).toHaveAccessibleName('Cancelar la cuenta atrás');
  // Cancelling goes back to the idle camera.
  await shutter(page).click();
  await expect(shutter(page)).toHaveAccessibleName('Empezar a grabar');
  // Left to run, the count ends and the take rolls.
  await shutter(page).click();
  await expect(rec.getByRole('button', { name: 'Terminar la toma' })).toBeVisible({ timeout: 12_000 });
  await expect(shutter(page)).toHaveAccessibleName('Pausar la grabación');
  guard.check();
});

test('doble palmada: armado, empieza a grabar al oír las dos palmadas', async ({ page, browser }) => {
  const guard = guardConsole(page);
  await openRecorder(page, browser);
  const rec = recorder(page);
  await timerOff(page);
  await rec.getByRole('button', { name: /^Armar:/ }).click();
  await expect(page.getByRole('radiogroup', { name: 'Sensibilidad del aplauso' })).toBeVisible();
  // The listener needs a moment to measure the room before it hears claps: clap until it fires.
  await expect(async () => {
    await page.evaluate(() =>
      (window as unknown as { __fakeDoubleClap: (gap: number) => void }).__fakeDoubleClap(400),
    );
    await expect(rec.getByRole('button', { name: 'Terminar la toma' })).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 25_000, intervals: [1500] });
  await expect(shutter(page)).toHaveAccessibleName('Pausar la grabación');
  guard.check();
});

test('pausa, reanuda, termina y guarda la toma en «Tomas»', async ({ page, browser }) => {
  const guard = guardConsole(page);
  await openRecorder(page, browser);
  const rec = recorder(page);
  await startTake(page, 1500);
  await shutter(page).click();
  await expect(shutter(page)).toHaveAccessibleName('Seguir grabando');
  await expect(rec.getByText('En pausa')).toBeAttached();
  await expect(rec.getByRole('button', { name: 'Descartar la toma' })).toBeVisible();
  await shutter(page).click();
  await expect(shutter(page)).toHaveAccessibleName('Pausar la grabación');
  await page.waitForTimeout(1000);
  await rec.getByRole('button', { name: 'Terminar la toma' }).click();
  await expect(rec.getByRole('button', { name: 'Guardar en «Tomas»' })).toBeVisible({ timeout: 25_000 });
  await expect(rec.getByRole('button', { name: 'Repetir' })).toBeVisible();
  await expect(rec.getByRole('button', { name: 'Descargar' })).toBeVisible();
  await keepAndOpenTakes(page);
  await expect(page.getByRole('button', { name: /^Repasar con el original: toma de Hana/ })).toBeVisible();
  const takes = (await storedDb(page))['takes'] ?? [];
  const mine = takes.filter((t) => t['video_id'] === UPLOAD_ID);
  expect(mine).toHaveLength(1);
  expect(mine[0]).toMatchObject({
    member_id: '00000000-0000-4000-8001-000000000001',
    device_id: '00000000-0000-4000-8000-0000000000d1',
  });
  expect(Number(mine[0]!['duration_seconds'])).toBeGreaterThan(1);
  guard.check();
});

test('descarta una toma en pausa tras confirmar y la cámara queda lista', async ({ page, browser }) => {
  const guard = guardConsole(page);
  await openRecorder(page, browser);
  const rec = recorder(page);
  await startTake(page, 1200);
  await shutter(page).click();
  await rec.getByRole('button', { name: 'Descartar la toma' }).click();
  const confirm = page.getByRole('alertdialog', { name: '¿Descartar la toma?' });
  await expect(confirm).toBeVisible();
  // «Cancelar» keeps the paused take.
  await confirm.getByRole('button', { name: 'Cancelar' }).click();
  await expect(shutter(page)).toHaveAccessibleName('Seguir grabando');
  await rec.getByRole('button', { name: 'Descartar la toma' }).click();
  await confirm.getByRole('button', { name: 'Descartar', exact: true }).click();
  await expect(shutter(page)).toHaveAccessibleName('Empezar a grabar');
  await rec.getByRole('button', { name: 'Cerrar' }).click();
  await expect(rec).toBeHidden();
  expect((await storedDb(page))['takes']).toHaveLength(10);
  guard.check();
});

test('repetir: descarta la toma sin guardar y vuelve a la cámara', async ({ page, browser }) => {
  const guard = guardConsole(page);
  await openRecorder(page, browser);
  const rec = recorder(page);
  await recordTake(page);
  await rec.getByRole('button', { name: 'Repetir' }).click();
  const confirm = page.getByRole('alertdialog', { name: '¿Descartar la toma?' });
  await expect(confirm).toContainText('Aún no la has guardado');
  await confirm.getByRole('button', { name: 'Descartar', exact: true }).click();
  await expect(shutter(page)).toHaveAccessibleName('Empezar a grabar');
  await expect(rec.getByRole('button', { name: 'Guardar en «Tomas»' })).toBeHidden();
  expect((await storedDb(page))['takes']).toHaveLength(10);
  guard.check();
});

test('descarga la toma grabada', async ({ page, browser }) => {
  const guard = guardConsole(page);
  await openRecorder(page, browser);
  await recordTake(page);
  const download = page.waitForEvent('download', { timeout: 15_000 });
  await recorder(page).getByRole('button', { name: 'Descargar' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.(webm|mp4)$/);
  guard.check();
});

test('recupera una toma interrumpida al recargar a mitad de grabación', async ({ page, browser }) => {
  const guard = guardConsole(page);
  await openRecorder(page, browser);
  await startTake(page, 4000);
  // The page goes away while the take is rolling (a call, the tab killed): what was written stays in OPFS.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Grabar baile con la canción' })).toBeEnabled();
  await page.getByRole('button', { name: 'Grabar baile con la canción' }).click();
  const leftover = page.getByRole('status', { name: 'Toma sin guardar' });
  await expect(leftover).toBeVisible({ timeout: 20_000 });
  await expect(leftover).toContainText('Hay una toma sin guardar de esta canción');
  await leftover.getByRole('button', { name: 'Recuperar' }).click();
  await expect(recorder(page).getByRole('button', { name: 'Guardar en «Tomas»' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(recorder(page).getByText(/Recuperada/)).toBeVisible();
  guard.check();
});

test('descarta la toma interrumpida sin recuperarla', async ({ page, browser }) => {
  const guard = guardConsole(page);
  await openRecorder(page, browser);
  await startTake(page, 4000);
  await page.reload();
  await page.getByRole('button', { name: 'Grabar baile con la canción' }).click();
  const leftover = page.getByRole('status', { name: 'Toma sin guardar' });
  await expect(leftover).toBeVisible({ timeout: 20_000 });
  await leftover.getByRole('button', { name: 'Descartar' }).click();
  const confirm = page.getByRole('alertdialog', { name: '¿Descartar la toma sin guardar?' });
  await confirm.getByRole('button', { name: 'Descartar', exact: true }).click();
  await expect(leftover).toBeHidden();
  guard.check();
});
