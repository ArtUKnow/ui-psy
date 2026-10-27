import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('medication schedule persists and weekly chart responds to a marked dose', async ({ page }) => {
  await page.goto('/app?section=care');
  const tracker = page.getByRole('region', { name: 'График приёма лекарств' });
  await tracker.getByPlaceholder('Название').fill('Авиандр');
  await tracker.locator('input[type="time"]').fill('09:30');
  await tracker.getByRole('button', { name: 'Добавить в график' }).click();
  await expect(tracker.getByText('Авиандр', { exact: true })).toBeVisible();
  await tracker.getByRole('button', { name: 'Отметить приём: Авиандр, 09:30' }).click();
  await expect(tracker.getByRole('button', { name: 'Отменить отметку: Авиандр, 09:30' })).toBeVisible();
  await expect(tracker.locator('.medication-day').last()).toHaveAttribute('aria-label', /1 из 1 приёмов/);
  await page.reload();
  await expect(tracker.getByRole('button', { name: 'Отменить отметку: Авиандр, 09:30' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.getByRole('navigation', { name: 'Навигация приложения' }).getByRole('button', { name: 'Настройки' }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: /Скачать историю/ }).click();
  const download = await downloadEvent;
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(exported.medications.slots).toHaveLength(1);
  expect(Object.values(exported.medications.taken)).toContain(true);
  await page.getByRole('button', { name: 'Управление данными', exact: true }).click();
  await page.getByRole('button', { name: /Удалить записи и результаты/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Удалить записи и результаты' }).click();
  expect(await page.evaluate(() => localStorage.getItem('ui-psy-medication-tracker'))).toBeNull();
});
