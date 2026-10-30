import { expect, test } from '@playwright/test';
import { expectNoSeriousA11y } from './axe';
import { readDemo, seedDemo } from './demo';
import { guardConsole } from './guard';

// REQ-03 · Marking an absence: who you are, the day, «Guardar»; it shows on the calendar and is stored.
test('marcar una ausencia', async ({ page }) => {
  const guard = guardConsole(page);
  await seedDemo(page);
  await page.goto('/calendario');
  await page.getByRole('button', { name: 'Marcar ausencia' }).first().click();

  const who = page.getByRole('dialog', { name: '¿Quién eres?' });
  await who.getByRole('radio', { name: 'Hana' }).click();

  const form = page.getByRole('dialog', { name: 'Marcar ausencia' });
  await expect(form.getByRole('radio', { name: 'Hana' })).toBeChecked();
  await form.getByRole('textbox', { name: 'Nota (opcional)' }).fill('PRUEBA médico');
  await expectNoSeriousA11y(page, { include: '[role="dialog"]' });
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect(form).toBeHidden();

  await expect(page.getByText('Nadie ha marcado ausencias este mes')).toBeHidden();
  // Today's cell (the form starts on today) now counts the absence.
  await expect(page.getByRole('gridcell', { name: /hoy, falta 1 persona/ })).toBeVisible();
  // REQ-05 · The first absence offers notices: «Ahora no» leaves everything as it was.
  const offer = page.getByRole('dialog', { name: /enterarte cuando alguien cambie el calendario/ });
  await offer.getByRole('button', { name: 'Ahora no' }).click();
  await expect(offer).toBeHidden();
  const db = await readDemo<{ absences?: { note: string | null; archived_at: string | null }[] }>(page);
  expect(db.absences?.filter((a) => !a.archived_at).map((a) => a.note)).toEqual(['PRUEBA médico']);
  guard.check();
});
