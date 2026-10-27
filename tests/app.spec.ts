import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const nav = (page: Page) => page.getByRole('navigation', { name: 'Навигация приложения' });

async function saveMoment(page: Page) {
  await page.getByRole('button', { name: 'Отметить настроение', exact: true }).click();
  await page.getByRole('button', { name: 'Начнём', exact: true }).click();
  await expect(page.locator('#mood-range')).toBeVisible();
  await page.locator('#mood-range').fill('8');
  await page.getByRole('button', { name: 'Далее', exact: true }).click();
  await page.getByRole('button', { name: 'Благодарность', exact: true }).click();
  await page.getByRole('button', { name: 'Радость', exact: true }).click();
  await page.getByRole('button', { name: 'Далее', exact: true }).click();
  await page.getByRole('button', { name: 'Друзья', exact: true }).click();
  await page.getByRole('button', { name: 'Далее', exact: true }).click();
  await page.locator('#anxiety-range').fill('2');
  await page.locator('#energy-range').fill('8');
  await page.getByLabel('Пара слов для себя').fill('Хорошая прогулка с друзьями.');
  await page.getByRole('button', { name: 'Сохранить момент', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Запись сохранена' })).toBeVisible();
}

test('mobile check-in persists, updates metrics, filters and deletes', async ({ page }) => {
  await page.goto('/app');
  await saveMoment(page);
  await page.getByRole('button', { name: 'Заглянуть в дневник' }).click();
  await expect(page.getByRole('heading', { name: 'Благодарность, Радость' })).toBeVisible();
  await page.locator('.diary-entry-summary').click();
  await expect(page.getByText('Хорошая прогулка с друзьями.')).toBeVisible();
  await page.getByRole('button', { name: 'Фильтры записей', exact: true }).click();
  await page.getByRole('button', { name: 'Настроение', exact: true }).click();
  await page.getByRole('button', { name: 'Фильтры записей', exact: true }).click();
  await expect(page.getByText('Записи не найдены')).toBeVisible();
  await page.getByRole('button', { name: 'Сбросить фильтры' }).click();
  await page.getByLabel('Поиск по дневнику').fill('несуществующее');
  await expect(page.getByText('Записи не найдены')).toBeVisible();
  await page.getByRole('button', { name: 'Сбросить фильтры' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'UI-PSY, на главную' }).last().click();
  await expect(page.getByRole('button', { name: 'Настроение: 8 из 10. Подробнее' })).toBeVisible();
  await nav(page).getByRole('button', { name: 'Дневник' }).click();
  await page.locator('.diary-entry-summary').click();
  await page.getByRole('button', { name: 'Удалить запись', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Удалить запись', exact: true }).click();
  await expect(page.getByText('В дневнике пока нет записей')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tishe-entries') || '[]').length)).toBe(0);
});

test('modal replacement restores scrolling and keyboard focus', async ({ page }) => {
  await page.goto('/app');
  await saveMoment(page);
  await page.locator('.checkin-success').getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('button', { name: 'Настроение: 8 из 10. Подробнее' }).click();
  await page.getByRole('button', { name: 'Отметить состояние', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Давай прислушаемся к тебе' })).toBeVisible();
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  expect(await page.locator('.app-shell').evaluate(element => (element as HTMLElement).inert)).toBe(false);
  await expect(page.getByRole('button', { name: 'Настроение: 8 из 10. Подробнее' })).toBeFocused();
  await nav(page).getByRole('button', { name: 'Дневник' }).click();
  await expect(page.getByRole('heading', { name: 'Дневник чувств' })).toBeVisible();
});

test('reflection answers produce a saved result', async ({ page }) => {
  await page.goto('/app');
  await page.goto('/app?section=practices');
  await page.locator('.reflection-practices button').first().click();
  for (let i = 0; i < 5; i++) {
    await expect(page.getByText(`Вопрос ${i + 1} из 5`)).toBeVisible();
    await page.getByRole('button', { name: 'Часто', exact: true }).click();
    await page.getByRole('button', { name: i === 4 ? 'Посмотреть результат' : 'Далее', exact: true }).click();
    await page.waitForTimeout(400);
  }
  await expect(page.getByRole('heading', { name: 'Найди немного места для себя' })).toBeVisible();
  await page.getByRole('button', { name: 'Завершить' }).click();
  await nav(page).getByRole('button', {name:'Тесты',exact:true}).click();
  await page.getByRole('button', { name: 'Результаты', exact: true }).click();
  await expect(page.locator('.test-result-row')).toHaveCount(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tishe-results') || '[]')[0].score)).toBe(10);
});

test('assistant responds transparently and links to breathing', async ({ page }) => {
  await page.goto('/app');
  await nav(page).getByRole('button', { name: 'Я рядом' }).click();
  await page.getByRole('button', { name: 'Помощник и практики', exact: true }).click();
  await expect(page.getByText(/не заменяет специалиста/i)).toBeVisible();
  await page.getByRole('button', { name: 'Мне тревожно', exact: true }).click();
  await expect(page.getByText(/Когда тревожно, не обязательно/)).toBeVisible();
  await page.getByRole('button', { name: 'Попробовать дыхание' }).click();
  await expect(page.getByRole('dialog', { name: 'Дыхательная практика' })).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Твоё сообщение').fill('не хочу жить');
  await page.getByRole('button', { name: 'Отправить сообщение' }).click();
  await expect(page.getByText(/Если есть риск, что ты навредишь себе/)).toBeVisible();
  await page.getByRole('button', { name: 'Очистить разговор', exact: true }).click();
  await expect(page.locator('.message')).toHaveCount(1);
});

test('breathing supports duration, pause, reset, and completion', async ({ page }) => {
  await page.goto('/app');
  await page.getByRole('button', { name: 'Практики', exact: true }).click();
  await page.locator('.practice-card').click();
  await page.getByRole('button', { name: '2 мин', exact: true }).click();
  await expect(page.getByRole('timer')).toHaveText('02:00');
  await page.getByRole('button', { name: '1 мин', exact: true }).click();
  await page.clock.install();
  await page.getByRole('dialog').getByRole('button', { name: 'Начать практику', exact: true }).click();
  await page.clock.runFor(3000);
  await expect(page.getByRole('timer')).toHaveText('00:57');
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  await page.clock.runFor(3000);
  await expect(page.getByRole('timer')).toHaveText('00:57');
  await page.getByRole('button', { name: 'Начать заново', exact: true }).click();
  await expect(page.getByRole('timer')).toHaveText('01:00');
  await page.getByRole('dialog').getByRole('button', { name: 'Начать практику', exact: true }).click();
  await page.clock.runFor(60000);
  await expect(page.getByRole('heading', { name: 'Пауза завершена' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Спасибо себе' })).toBeVisible();
});

test('settings save, export data, and require confirmation to clear', async ({ page }) => {
  await page.goto('/app');
  await nav(page).getByRole('button', { name: 'Настройки' }).click();
  await page.getByRole('button', { name: /Личный профиль/ }).click();
  await page.getByLabel('Как к тебе обращаться?').fill('Александра');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Сохранено' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('switch', { name: 'Мягкие анимации' }).click();
  await expect(page.getByRole('switch', { name: 'Мягкие анимации' })).toHaveAttribute('aria-checked', 'false');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: /Скачать историю/ }).click();
  expect((await downloadEvent).suggestedFilename()).toMatch(/^ui-psy-.*\.json$/);
  await page.getByRole('button', { name: 'Управление данными', exact: true }).click();
  await page.getByRole('button', { name: /Удалить записи и результаты/ }).click();
  await page.getByRole('button', { name: 'Отмена' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Настройки', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'UI-PSY, на главную' }).last().click();
  await expect(page.getByRole('heading', { name: 'Привет, Александра' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dataset.motion)).toBe('off');
});

test('responsive layouts, chart controls, and browser console are healthy', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/app');
  for (const width of [320, 390, 760, 820, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  await page.getByRole('button', { name: 'Динамика', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Ежедневное самочувствие' })).toContainText('График появится после первой отметки');
  await page.getByRole('button', { name: 'UI-PSY, на главную' }).last().click();
  await saveMoment(page);
  await page.locator('.checkin-success').getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('button', { name: 'Динамика', exact: true }).click();
  const daily = page.getByRole('region', { name: 'Ежедневное самочувствие' });
  await daily.getByRole('button', { name: '30 дней', exact: true }).click();
  await expect(daily.getByRole('button', { name: '30 дней', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await daily.getByRole('button', { name: 'Тревога', exact: true }).click();
  await expect(daily.getByRole('button', { name: 'Тревога', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await daily.getByRole('img').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(daily.locator('.clinical-selected')).toBeVisible();
  await page.screenshot({ path: 'artifacts/desktop-verified.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('home and check-in meet automated accessibility checks', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Привет, Пользователь' })).toBeVisible();
  const home = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(home.violations).toEqual([]);
  await page.getByRole('button', { name: 'Отметить настроение', exact: true }).click();
  await page.getByRole('button', { name: 'Начнём', exact: true }).click();
  await expect(page.locator('#mood-range')).toBeVisible();
  const modal = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(modal.violations).toEqual([]);
});
