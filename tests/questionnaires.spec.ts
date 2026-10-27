import { expect, test } from '@playwright/test';

test('patient sees introductory screening without professional scale names', async ({ page }) => {
  await page.goto('/app');
  await page.getByRole('navigation', { name: 'Навигация приложения' }).getByRole('button', { name: 'Тесты' }).click();
  await expect(page.locator('.questionnaire-catalog').first().locator('.questionnaire-card')).toHaveCount(1);
  await expect(page.locator('.questionnaire-card').first().locator('strong')).toHaveText('Вводная диагностика');
  await expect(page.locator('.tests-page')).not.toContainText(/PHQ|GAD|WHO|ISI/);
  await expect(page.locator('.tests-page')).not.toContainText(/\.docx|\.pdf/i);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('PHQ-4 collects every answer and saves scored result locally', async ({ page }) => {
  await page.goto('/app');
  await page.getByRole('navigation', { name: 'Навигация приложения' }).getByRole('button', { name: 'Тесты' }).click();
  await page.locator('.questionnaire-catalog').first().locator('.questionnaire-card').first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Начать', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toContainText(/\.docx|\.pdf/i);
  for (let i = 0; i < 4; i++) {
    await expect(page.getByText(`Вопрос ${i + 1} из 4`)).toBeVisible();
    await page.locator('.questionnaire-options button').first().click();
    await page.getByRole('button', { name: i === 3 ? 'Посмотреть результат' : 'Следующий вопрос' }).click();
  }
  await expect(page.locator('.questionnaire-result')).toContainText('0 / 12');
  await page.getByRole('button', { name: 'Вернуться к тестам' }).click();
  await page.getByRole('button', { name: 'Результаты', exact: true }).click();
  await expect(page.locator('.test-result-row')).toHaveCount(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tishe-results') || '[]')[0].testId)).toBe('phq4');
});
