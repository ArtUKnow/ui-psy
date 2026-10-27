import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('landing is responsive, interactive, and opens the app', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Побудь ближе к себе' })).toBeVisible();
  await expect(page.locator('img[src^="/landing/screens/"]')).toHaveCount(9);
  await expect(page.locator('#doctor img.lp-doctor-person')).toHaveAttribute('src', '/landing/doctor-psychiatrist.webp');
  await expect(page.locator('img[src*="star"], img[src*="night-sky"], img[src*="constellation-sky"]')).toHaveCount(0);
  await expect.poll(() => page.locator('img[src^="/landing/screens/"]').evaluateAll(images =>
    images.filter(image => !(image as HTMLImageElement).complete || (image as HTMLImageElement).naturalWidth === 0).length
  )).toBe(0);
  await expect(page.locator('#hero input[type="range"]')).toHaveCount(3);
  const star = page.locator('#hero svg[viewBox="0 0 200 200"] path').first();
  const before = await star.getAttribute('d');
  await page.getByRole('slider', { name: 'Тревога' }).fill('5');
  await expect(star).not.toHaveAttribute('d', before!);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  await page.getByRole('link', { name: 'Начать с себя' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { name: 'Привет, Пользователь' })).toBeVisible();
});

test('landing meets mobile and desktop accessibility checks', async ({ page }) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations).toEqual([]);
  }
});
