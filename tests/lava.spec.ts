import { expect, test } from '@playwright/test';

test('лава-лампа помещается на телефоне и управляется', async ({ page }) => {
  await page.goto('/lava');
  await expect(page.getByRole('heading', { name: 'Побудь в моменте' })).toBeVisible();

  const scene = await page.locator('.lava-scene').boundingBox();
  const lamp = await page.locator('.lava-lamp').boundingBox();
  const palette = await page.getByRole('group', { name: 'Цвет лампы' }).boundingBox();
  const controls = await page.locator('.lava-actions').boundingBox();
  expect(scene && lamp && palette && controls).toBeTruthy();
  expect(lamp!.y + lamp!.height).toBeLessThanOrEqual(scene!.y + scene!.height + 1);
  expect(scene!.y + scene!.height).toBeLessThanOrEqual(palette!.y + 1);
  expect(palette!.y + palette!.height).toBeLessThanOrEqual(controls!.y + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.getByRole('button', { name: 'Сумерки' }).click();
  await expect(page.getByRole('button', { name: 'Сумерки' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Остановить' }).click();
  await expect(page.getByRole('button', { name: 'Продолжить' })).toBeVisible();
  await page.getByRole('button', { name: 'Включить музыку' }).click();
  await expect(page.getByRole('button', { name: 'Музыка играет' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('slider', { name: 'Громкость музыки' })).toBeVisible();
  await page.getByRole('button', { name: 'Музыка играет' }).click();
  await expect(page.getByRole('button', { name: 'Включить музыку' })).toBeVisible();
});
