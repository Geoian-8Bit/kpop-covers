import { expect, test, type Page } from '@playwright/test';
import { guardConsole } from '../../support/seed';
import { media, openStudio, shortClips, studioVideo, skipWithoutWebAudio } from './studio';

// REQ-02 · Every keyboard shortcut of the studio (README and the «Atajos de teclado» dialog), one after the other on
// an uploaded video. Keys go to the page itself, as a laptop would.

skipWithoutWebAudio();

let video: Buffer;
test.beforeAll(async ({ browser }) => {
  video = await studioVideo(browser);
});

const open = (page: Page) => openStudio(page, { media: video, overrides: shortClips });
const timer = (page: Page) => page.getByRole('timer', { name: 'Tiempo' });
const speed = (page: Page, label: string) =>
  expect(page.getByRole('button', { name: `Velocidad: ${label}` })).toBeVisible();
const mirror = (page: Page) => page.getByRole('button', { name: 'Espejo' }).first();

test('Espacio y K reproducen y pausan', async ({ page }) => {
  const guard = guardConsole(page);
  await open(page);
  await page.keyboard.press(' ');
  await expect.poll(async () => (await media(page))?.paused).toBe(false);
  await page.keyboard.press(' ');
  await expect.poll(async () => (await media(page))?.paused).toBe(true);
  await page.keyboard.press('k');
  await expect.poll(async () => (await media(page))?.paused).toBe(false);
  await page.keyboard.press('k');
  await expect.poll(async () => (await media(page))?.paused).toBe(true);
  guard.check();
});

test('flechas, Shift, coma y punto mueven el tiempo', async ({ page }) => {
  const guard = guardConsole(page);
  await open(page);
  await page.keyboard.press('ArrowRight'); // +5 s, stopped by the 3 s end
  await expect(timer(page)).toHaveText('0:03.0');
  await page.keyboard.press('ArrowLeft'); // −5 s, stopped by the start
  await expect(timer(page)).toHaveText('0:00.0');
  await page.keyboard.press('Shift+ArrowRight');
  await expect(timer(page)).toHaveText('0:01.0');
  await page.keyboard.press('Shift+ArrowRight');
  await expect(timer(page)).toHaveText('0:02.0');
  await page.keyboard.press('Shift+ArrowLeft');
  await expect(timer(page)).toHaveText('0:01.0');
  await page.keyboard.press('.');
  await expect(timer(page)).toHaveText('0:01.1');
  await page.keyboard.press('.');
  await expect(timer(page)).toHaveText('0:01.2');
  await page.keyboard.press(',');
  await expect(timer(page)).toHaveText('0:01.1');
  expect((await media(page))?.t).toBeCloseTo(1.1, 1);
  guard.check();
});

test('↑ y ↓ cambian la velocidad 0,05× y 1–8 eligen un preset', async ({ page }) => {
  const guard = guardConsole(page);
  await open(page);
  await page.keyboard.press('ArrowUp');
  await speed(page, '1,05×');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await speed(page, '0,95×');
  const presets = ['0,5×', '0,6×', '0,75×', '0,8×', '1×', '1,2×', '1,5×', '2×'];
  for (const [i, label] of presets.entries()) {
    await page.keyboard.press(String(i + 1));
    await speed(page, label);
  }
  expect((await media(page))?.rate).toBeCloseTo(2, 2);
  guard.check();
});

test('M pone y quita el espejo', async ({ page }) => {
  const guard = guardConsole(page);
  await open(page);
  const before = await mirror(page).getAttribute('aria-pressed');
  await page.keyboard.press('m');
  await expect(mirror(page)).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
  await page.keyboard.press('m');
  await expect(mirror(page)).toHaveAttribute('aria-pressed', before!);
  guard.check();
});

test('A, B, L, Inicio y Esc: el tramo y su bucle', async ({ page }) => {
  const guard = guardConsole(page);
  await open(page);
  // L with no range explains what is missing.
  await page.keyboard.press('l');
  await expect(page.getByText('Marca A y B para repetir un tramo')).toBeVisible();
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('a');
  await expect(page.getByTitle('Mover el inicio aquí (A)')).toContainText('0:01.0');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('b');
  await expect(page.getByTitle('Mover el final aquí (B)')).toContainText('0:02.0');
  const loop = page.getByRole('button', { name: /^Repetir el tramo/ });
  const before = await loop.getAttribute('aria-pressed');
  await page.keyboard.press('l');
  await expect(loop).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
  await page.keyboard.press('Home');
  await expect(timer(page)).toHaveText('0:01.0');
  await page.keyboard.press('Escape');
  await expect(loop).toBeHidden();
  // The bracket keys are the same as A and B.
  await page.keyboard.press('[');
  await expect(page.getByTitle('Mover el inicio aquí (A)')).toBeVisible();
  await page.keyboard.press('Escape');
  guard.check();
});

test('R repite la canción entera', async ({ page }) => {
  const guard = guardConsole(page);
  await open(page);
  const all = page.getByRole('button', { name: /^Bucle: repetir la canción entera/ });
  await page.keyboard.press('r');
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('r');
  await expect(all).toHaveAttribute('aria-pressed', 'false');
  guard.check();
});

test('S guarda un clip (pide el tramo antes) y N abre la nota', async ({ page }) => {
  const guard = guardConsole(page);
  await open(page);
  await page.keyboard.press('s');
  await expect(page.getByText('Marca A y B en la línea de tiempo primero')).toBeVisible();
  await page.keyboard.press('a');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('b');
  await page.keyboard.press('s');
  const save = page.getByRole('dialog', { name: 'Guardar clip' });
  await expect(save).toBeVisible();
  await save.getByRole('button', { name: 'Cancelar' }).click();
  await expect(save).toBeHidden();
  await page.keyboard.press('n');
  const note = page.getByRole('dialog', { name: 'Nueva nota' });
  await expect(note).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(note).toBeHidden();
  guard.check();
});

test('? abre la ayuda con todos los atajos y Esc la cierra', async ({ page }) => {
  const guard = guardConsole(page);
  await open(page);
  await page.keyboard.press('?');
  const help = page.getByRole('dialog', { name: 'Atajos de teclado' });
  await expect(help).toBeVisible();
  for (const text of [
    'Reproducir / pausar',
    'Retroceder / avanzar 5 s (con Shift: 1 s)',
    'Mover 0,1 s',
    'Velocidad ±0,05×',
    'Velocidades rápidas (0,5× … 2×)',
    'Activar / quitar espejo',
    'Pantalla completa',
    'Marcar inicio del tramo',
    'Marcar final del tramo',
    'Activar / quitar bucle del tramo',
    'Repetir la canción entera',
    'Quitar tramo',
    'Guardar clip',
    'Nota en este momento',
    'Volver al inicio del tramo',
    'Ver atajos',
  ])
    await expect(help).toContainText(text);
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  guard.check();
});

test('F entra y sale de la pantalla completa', async ({ page }) => {
  const guard = guardConsole(page);
  await open(page);
  await page.keyboard.press('f');
  await expect(page.getByRole('button', { name: 'Salir de pantalla completa' })).toBeVisible();
  await page.keyboard.press('f');
  await expect(page.getByRole('button', { name: 'Salir de pantalla completa' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Pantalla completa' })).toBeVisible();
  guard.check();
});

test('con un diálogo abierto los atajos no actúan', async ({ page }) => {
  const guard = guardConsole(page);
  await open(page);
  await page.keyboard.press('?');
  const help = page.getByRole('dialog', { name: 'Atajos de teclado' });
  await expect(help).toBeVisible();
  await page.keyboard.press('m');
  await page.keyboard.press('5');
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  await speed(page, '1×');
  guard.check();
});
