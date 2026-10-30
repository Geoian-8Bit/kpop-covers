import { expect, test, type Locator, type Page } from '@playwright/test';
import { DEMO_KEY, MEMBERS, readDemo, seedDemo, VIDEO_ID } from './demo';
import { guardConsole } from './guard';

type Stored = { formations?: { plan_id: string; archived_at: string | null; positions: Record<string, { x: number; y: number }> }[] };

/** Song → «Formaciones» → «Nuevo plan» → «Crear plan» → first formation, saved. Returns the plan id. */
async function newPlanWithFormation(page: Page): Promise<string> {
  await seedDemo(page);
  await page.goto(`/v/${VIDEO_ID}`);
  await page.getByRole('radio', { name: 'Formaciones' }).click();
  await page.getByRole('button', { name: 'Nuevo plan' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo plan' });
  await dialog.getByRole('textbox', { name: 'Nombre' }).fill('PRUEBA plan');
  await dialog.getByRole('button', { name: 'Crear plan' }).click();

  await expect(page).toHaveURL(/\/formaciones\//);
  await expect(page.getByRole('heading', { level: 1, name: 'PRUEBA plan' })).toBeVisible();
  await page.getByRole('button', { name: 'Añade la primera formación' }).click();
  await expect(page.getByRole('button', { name: /^Formación 1 en / })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Guardado' })).toBeVisible();
  return page.url().split('/formaciones/')[1]!;
}

/** Drags a stage point by (50, 30) px with the mouse. */
async function dragDot(page: Page, dot: Locator) {
  // Centred: the sticky top bar must not cover it.
  await dot.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const box = (await dot.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 25, y + 15, { steps: 5 });
  await page.mouse.move(x + 50, y + 30, { steps: 5 });
  await page.mouse.up();
}

const livePositions = async (page: Page, planId: string) =>
  (await readDemo<Stored>(page)).formations?.find((f) => f.plan_id === planId && !f.archived_at)?.positions;

// REQ-06 · A plan from the song's «Formaciones» tab, its first formation, and a person dragged on the stage.
test('crear plan, añadir formación y arrastrar a alguien', async ({ page }) => {
  const guard = guardConsole(page);
  const planId = await newPlanWithFormation(page);
  const hana = MEMBERS[0]!;
  const before = (await livePositions(page, planId))?.[hana.id];
  expect(before).toBeTruthy();

  await dragDot(page, page.getByRole('button', { name: /^Hana\. Flechas para moverle/ }));

  await expect.poll(async () => (await livePositions(page, planId))?.[hana.id]).not.toEqual(before);
  await expect(page.getByRole('status').filter({ hasText: 'Guardado' })).toBeVisible();
  guard.check();
});

// REQ-06 · Someone else changed the plan: the notice shows and the stage stops taking edits until «Recargar».
test('con un conflicto el escenario no se puede editar', async ({ page }) => {
  const guard = guardConsole(page);
  const planId = await newPlanWithFormation(page);
  // «Another phone» saves first: the plan's revision moves on under this editor.
  await page.evaluate(
    ([key, id]) => {
      const db = JSON.parse(localStorage.getItem(key)!);
      const plan = db.formation_plans.find((p: { id: string }) => p.id === id);
      plan.revision += 1;
      localStorage.setItem(key, JSON.stringify(db));
    },
    [DEMO_KEY, planId] as const,
  );
  const hana = page.getByRole('button', { name: /^Hana\. Flechas para moverle/ });
  await dragDot(page, hana);
  await expect(page.getByRole('alert').filter({ hasText: 'Alguien ha cambiado este plan' })).toBeVisible();
  await expect(page.getByRole('group', { name: /^Escenario de / })).toHaveAttribute('aria-disabled', 'true');

  // Locked: another drag and the arrow keys leave everyone where they are.
  const mina = page.getByRole('button', { name: /^Mina\. Flechas para moverle/ });
  await mina.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const at = await mina.boundingBox();
  await dragDot(page, mina);
  await mina.focus();
  await page.keyboard.press('ArrowRight');
  expect(await mina.boundingBox()).toEqual(at);
  await expect(page.getByRole('button', { name: 'Añadir formación aquí' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Deshacer' })).toBeDisabled();

  // «Recargar» takes the stored version and unlocks.
  await page.getByRole('button', { name: 'Recargar' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Alguien ha cambiado este plan' })).toBeHidden();
  await expect(page.getByRole('group', { name: /^Escenario de / })).not.toHaveAttribute('aria-disabled', 'true');
  guard.check();
});
