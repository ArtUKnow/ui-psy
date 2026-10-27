import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test('account synchronizes medicines and patient cards between browser contexts', async ({ page, browser }) => {
  const email = `ui-psy-${crypto.randomUUID()}@example.test`;
  const password = 'long-test-password-2026';
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'С возвращением' })).toBeVisible();
  await page.getByRole('button', { name: 'Нет аккаунта? Зарегистрироваться' }).click();
  await page.getByLabel('Электронная почта').fill(email);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
  await expect(page.getByRole('heading', { name: 'Привет, Пользователь' })).toBeVisible();

  await page.getByRole('button', { name: 'Мой план', exact: true }).click();
  const tracker = page.getByRole('region', { name: 'График приёма лекарств' });
  await tracker.getByPlaceholder('Название').fill('Авиандр');
  await tracker.getByRole('button', { name: 'Добавить в график' }).click();
  await tracker.getByRole('button', { name: 'Отметить приём: Авиандр, 09:00' }).click();
  await expect(tracker.getByRole('button', { name: 'Отменить отметку: Авиандр, 09:00' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Навигация приложения' }).getByRole('button', { name: 'Я рядом' }).click();
  await page.getByRole('button', { name: 'Помощник и практики', exact: true }).click();
  await page.getByRole('button', { name: 'Мне тревожно', exact: true }).click();
  await expect(page.getByText(/Когда тревожно, не обязательно/)).toBeVisible();

  await page.goto('/doctor/new');
  await page.getByRole('button', { name: 'Да, я специалист' }).click();
  await page.getByLabel('Имя или код пациента').fill('Пациент С');
  await page.getByLabel('Возраст').fill('38');
  await page.getByRole('combobox', { name: 'Пол' }).selectOption('male');
  await page.getByRole('combobox', { name: 'Принимал ли Авиандр' }).selectOption('past');
  await page.getByRole('button', { name: 'Создать карточку' }).click();
  await expect(page.getByRole('region', { name: 'Анамнез пациента' })).toContainText('Принимал(а) ранее');

  const second = await browser.newContext();
  const otherPage = await second.newPage();
  await otherPage.goto('/app');
  await otherPage.getByLabel('Электронная почта').fill(email);
  await otherPage.getByLabel('Пароль').fill(password);
  await otherPage.getByRole('button', { name: 'Войти', exact: true }).click();
  await otherPage.getByRole('button', { name: 'Мой план', exact: true }).click();
  await expect(otherPage.getByRole('region', { name: 'График приёма лекарств' })).toContainText('Авиандр');
  await otherPage.getByRole('navigation', { name: 'Навигация приложения' }).getByRole('button', { name: 'Я рядом' }).click();
  await otherPage.getByRole('button', { name: 'Помощник и практики', exact: true }).click();
  await expect(otherPage.getByText('Мне тревожно', { exact: true })).toBeVisible();
  await otherPage.goto('/doctor');
  await expect(otherPage.getByRole('heading',{name:'Работа',exact:true})).toBeVisible();
  await expect(otherPage.getByRole('link', { name: /Пациент С/ })).toBeVisible();
  await second.close();
});

test('first sign-in migrates guest diary, test results and name', async ({ page, browser }) => {
  const email = `ui-psy-migrate-${crypto.randomUUID()}@example.test`;
  const password = 'long-test-password-2026';
  await page.goto('/app');
  await page.getByRole('button', { name: 'Продолжить без аккаунта на этом устройстве' }).click();
  await page.getByRole('button', { name: 'Отметить настроение', exact: true }).click();
  await page.getByRole('button', { name: 'Начнём', exact: true }).click();
  await page.locator('#mood-range').fill('7');
  await page.getByRole('button', { name: 'Далее', exact: true }).click();
  await page.getByRole('button', { name: 'Спокойствие', exact: true }).click();
  await page.getByRole('button', { name: 'Далее', exact: true }).click();
  await page.getByRole('button', { name: 'Сон', exact: true }).click();
  await page.getByRole('button', { name: 'Далее', exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить момент' }).click();
  await page.locator('.checkin-success').getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('navigation', { name: 'Навигация приложения' }).getByRole('button', { name: 'Тесты' }).click();
  await page.locator('.questionnaire-catalog').first().locator('.questionnaire-card').first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Начать', exact: true }).click();
  for (let i = 0; i < 4; i++) {
    await page.locator('.questionnaire-options button').first().click();
    await page.getByRole('button', { name: i === 3 ? 'Посмотреть результат' : 'Следующий вопрос' }).click();
  }
  await page.getByRole('button', { name: 'Вернуться к тестам' }).click();
  await page.getByRole('navigation', { name: 'Навигация приложения' }).getByRole('button', { name: 'Настройки' }).click();
  await page.getByRole('button', { name: /Личный профиль/ }).click();
  await page.getByLabel('Как к тебе обращаться?').fill('Мария');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await page.getByRole('button', { name: 'Войти или зарегистрироваться' }).click();
  await page.getByRole('button', { name: 'Нет аккаунта? Зарегистрироваться' }).click();
  await page.getByLabel('Электронная почта').fill(email);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
  await page.getByRole('button', { name: 'UI-PSY, на главную' }).last().click();
  await expect(page.getByRole('heading', { name: 'Привет, Мария' })).toBeVisible();

  const second = await browser.newContext();
  const otherPage = await second.newPage();
  await otherPage.goto('/app');
  await otherPage.getByLabel('Электронная почта').fill(email);
  await otherPage.getByLabel('Пароль').fill(password);
  await otherPage.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(otherPage.getByRole('heading', { name: 'Привет, Мария' })).toBeVisible();
  await otherPage.getByRole('navigation', { name: 'Навигация приложения' }).getByRole('button', { name: 'Дневник' }).click();
  await expect(otherPage.locator('.diary-entry-summary')).toHaveCount(1);
  await otherPage.getByRole('navigation', { name: 'Навигация приложения' }).getByRole('button', { name: 'Тесты' }).click();
  await otherPage.getByRole('button', { name: 'Результаты', exact: true }).click();
  await expect(otherPage.locator('.test-result-row')).toHaveCount(1);
  await second.close();
});

test('concurrent edits from two devices keep both medication slots', async ({ page, browser }) => {
  const email = `ui-psy-concurrent-${crypto.randomUUID()}@example.test`;
  const password = 'long-test-password-2026';
  await page.goto('/app');
  await page.getByRole('button', { name: 'Нет аккаунта? Зарегистрироваться' }).click();
  await page.getByLabel('Электронная почта').fill(email);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
  await expect(page.getByRole('heading', { name: 'Привет, Пользователь' })).toBeVisible();
  const second = await browser.newContext();
  const otherPage = await second.newPage();
  await otherPage.goto('/app');
  await otherPage.getByLabel('Электронная почта').fill(email);
  await otherPage.getByLabel('Пароль').fill(password);
  await otherPage.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(otherPage.getByRole('heading', { name: 'Привет, Пользователь' })).toBeVisible();
  await page.getByRole('button', { name: 'Мой план', exact: true }).click();
  await otherPage.getByRole('button', { name: 'Мой план', exact: true }).click();
  const firstTracker = page.getByRole('region', { name: 'График приёма лекарств' });
  const secondTracker = otherPage.getByRole('region', { name: 'График приёма лекарств' });
  await firstTracker.getByPlaceholder('Название').fill('Препарат А');
  await secondTracker.getByPlaceholder('Название').fill('Препарат Б');
  const firstSave = page.waitForResponse(response => response.url().includes('/api/data/medications') && response.request().method() === 'PUT' && response.ok());
  const secondSave = otherPage.waitForResponse(response => response.url().includes('/api/data/medications') && response.request().method() === 'PUT' && response.ok());
  await Promise.all([
    firstTracker.getByRole('button', { name: 'Добавить в график' }).click(),
    secondTracker.getByRole('button', { name: 'Добавить в график' }).click(),
  ]);
  await Promise.all([firstSave, secondSave]);
  await expect(firstTracker).toContainText('Препарат А');
  await expect(secondTracker).toContainText('Препарат Б');
  await page.reload();
  await expect(firstTracker.locator('.medication-slot')).toHaveCount(2);
  await expect(firstTracker).toContainText('Препарат Б');
  await second.close();
});
