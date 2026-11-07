import { expect, test, type Page } from '@playwright/test';
import { guardConsole } from '../../support/seed';
import { pressRowButton } from '../../support/swipeRow';
import { openApp } from './support';

// REQ-02 · Shell · Navegación: the Hanafuda quick menu on phones, the side rail on desktop (Tailwind `lg`, 64rem),
// the system «Atrás» closing dialogs, /privacidad and unknown routes.

test.beforeEach(({ browserName }) => {
  // The Playwright WebKit build here has no Web Audio (`AudioNode` is undefined), so the app throws on load and stays blank.
  test.skip(browserName === 'webkit', 'WebKit de Playwright sin Web Audio: la app no arranca');
});

/** Tailwind's `lg`: from 1024 px the rail replaces the phone's top bar and quick menu. */
const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;
const quickMenu = (page: Page) => page.getByRole('button', { name: /^Secciones/ });
const sections = (page: Page) => page.getByRole('dialog', { name: 'Secciones' });

test('móvil · el menú Hanafuda abre sus secciones y lleva a la elegida', async ({ page }) => {
  test.skip(isDesktop(page), 'El menú Hanafuda solo existe por debajo de lg');
  const guard = guardConsole(page);
  await openApp(page);
  await expect(quickMenu(page)).toHaveAccessibleName('Secciones. Estás en Biblioteca');
  await quickMenu(page).click();
  await expect(sections(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cerrar secciones' })).toBeVisible();
  for (const name of [
    'Biblioteca',
    'Bolsas',
    'Próxima cover',
    'Random Play Dance',
    'Eventos',
    'Calendario',
  ]) {
    await expect(sections(page).getByRole('link', { name: new RegExp(`^${name}`) })).toBeVisible();
  }
  await sections(page)
    .getByRole('link', { name: /^Calendario/ })
    .click();
  await expect(page).toHaveURL(/\/calendario$/);
  await expect(sections(page)).toBeHidden();
  await expect(quickMenu(page)).toHaveAccessibleName(/Estás en Calendario/);
  guard.check();
});

test('móvil · «Atrás» cierra el menú Hanafuda sin salir de la página', async ({ page }) => {
  test.skip(isDesktop(page), 'El menú Hanafuda solo existe por debajo de lg');
  const guard = guardConsole(page);
  await openApp(page, '/eventos');
  await quickMenu(page).click();
  await expect(sections(page)).toBeVisible();
  await page.goBack();
  await expect(sections(page)).toBeHidden();
  await expect(page).toHaveURL(/\/eventos$/);
  guard.check();
});

test('móvil · el menú «Más opciones» lleva a Ajustes y a Privacidad', async ({ page }) => {
  test.skip(isDesktop(page), 'El menú «⋯» solo existe por debajo de lg');
  const guard = guardConsole(page);
  await openApp(page);
  await page.getByRole('button', { name: 'Más opciones' }).click();
  const menu = page.getByRole('menu', { name: 'Más opciones' });
  await expect(menu.getByRole('menuitem', { name: 'Ajustes' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Buscar actualización' })).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Ajustes' }).click();
  await expect(page).toHaveURL(/\/ajustes$/);
  await page.getByRole('button', { name: 'Más opciones' }).click();
  await page.getByRole('menuitem', { name: 'Privacidad y condiciones' }).click();
  await expect(page).toHaveURL(/\/privacidad$/);
  guard.check();
});

test('escritorio · la barra lateral navega entre secciones y marca la actual', async ({ page }) => {
  test.skip(!isDesktop(page), 'La barra lateral solo existe desde lg');
  const guard = guardConsole(page);
  await openApp(page);
  const rail = page.getByRole('navigation', { name: 'Principal' });
  await expect(rail).toBeVisible();
  await expect(quickMenu(page)).toHaveCount(0);
  await expect(rail.getByRole('link', { name: 'Biblioteca' })).toHaveAttribute('aria-current', 'page');
  for (const [name, url] of [
    ['Bolsas', /\/bolsas$/],
    ['Próxima cover', /\/deseos$/],
    ['Random Play Dance', /\/rpd$/],
    ['Eventos', /\/eventos$/],
    ['Calendario', /\/calendario$/],
  ] as const) {
    await rail.getByRole('link', { name }).click();
    await expect(page).toHaveURL(url);
    await expect(rail.getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
  }
  await page.getByRole('link', { name: 'Ajustes' }).click();
  await expect(page).toHaveURL(/\/ajustes$/);
  await page.getByRole('link', { name: 'One Shoot · Biblioteca' }).click();
  await expect(page).toHaveURL(/localhost:5174\/$/);
  guard.check();
});

test('escritorio · «Eres Hana» abre «¿Quién eres?» desde la barra lateral', async ({ page }) => {
  test.skip(!isDesktop(page), 'El botón de identidad de la barra solo existe desde lg');
  const guard = guardConsole(page);
  await openApp(page);
  await page.getByRole('button', { name: 'Eres Hana' }).click();
  const who = page.getByRole('dialog', { name: '¿Quién eres?' });
  await expect(who).toBeVisible();
  await who.getByRole('radio', { name: 'Rei' }).click();
  await expect(who).toBeHidden();
  await expect(page.getByRole('button', { name: 'Eres Rei' })).toBeVisible();
  guard.check();
});

test('al cruzar lg el shell cambia de menú en ambos sentidos', async ({ page }) => {
  const guard = guardConsole(page);
  await openApp(page);
  const height = page.viewportSize()?.height ?? 844;
  const rail = page.getByRole('navigation', { name: 'Principal' });
  await page.setViewportSize({ width: 1023, height });
  await expect(quickMenu(page)).toBeVisible();
  await expect(rail).toBeHidden();
  await page.setViewportSize({ width: 1024, height });
  await expect(rail).toBeVisible();
  await expect(quickMenu(page)).toHaveCount(0);
  await page.setViewportSize({ width: 1023, height });
  await expect(quickMenu(page)).toBeVisible();
  await expect(rail).toBeHidden();
  guard.check();
});

test('«Atrás» del sistema cierra el diálogo «Añadir vídeo» y se queda en la página', async ({ page }) => {
  const guard = guardConsole(page);
  await openApp(page, '/eventos');
  await page.getByRole('button', { name: 'Añadir vídeo' }).click();
  const dialog = page.getByRole('dialog', { name: 'Añadir vídeo' });
  await expect(dialog).toBeVisible();
  await page.goBack();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/eventos$/);
  guard.check();
});

test('«Atrás» cierra el diálogo de eliminar vídeo y se queda en la biblioteca', async ({ page }) => {
  const guard = guardConsole(page);
  await openApp(page);
  await pressRowButton(page, 'Eliminar Dynamite');
  const dialog = page.getByRole('dialog', { name: '¿Eliminar vídeo?' });
  await expect(dialog).toBeVisible();
  await page.goBack();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Eliminar Dynamite' })).toBeVisible();
  guard.check();
});

test('/privacidad se lee sin el shell y vuelve a la biblioteca', async ({ page }) => {
  const guard = guardConsole(page);
  await openApp(page, '/privacidad');
  await expect(page.getByRole('heading', { name: 'Privacidad y condiciones', level: 1 })).toBeVisible();
  await expect(page.getByText('Última actualización: 18 de octubre de 2026')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Principal' })).toHaveCount(0);
  await expect(page).toHaveTitle(/Privacidad/);
  await page.getByRole('link', { name: 'Volver al estudio' }).click();
  await expect(page).toHaveURL(/localhost:5174\/$/);
  await expect(page.getByPlaceholder('Buscar canción o artista')).toBeVisible();
  guard.check();
});

test('una ruta desconocida redirige a la biblioteca', async ({ page }) => {
  const guard = guardConsole(page);
  await openApp(page, '/esto/no/existe');
  await expect(page).toHaveURL(/localhost:5174\/$/);
  await expect(page.getByPlaceholder('Buscar canción o artista')).toBeVisible();
  guard.check();
});
