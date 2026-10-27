import { expect, test, type Page } from '@playwright/test';

async function createPatient(page: Page, name: string, age: string, sex: 'female' | 'male', perinatal?: string) {
  await page.goto('/doctor/new');
  const confirmRole = page.getByRole('button', { name: 'Да, я специалист' });
  if (await confirmRole.isVisible()) await confirmRole.click();
  await page.getByLabel('Имя или код пациента').fill(name);
  await page.getByLabel('Возраст').fill(age);
  await page.getByRole('combobox', { name: 'Пол' }).selectOption(sex);
  if (perinatal) await page.getByRole('combobox', { name: 'Перинатальный период' }).selectOption(perinatal);
  await page.getByRole('button', { name: 'Создать карточку' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

async function answer(page: Page, form: string, question: number, option: number) {
  await page.locator(`input[name="${form}-${question}"]`).nth(option).check();
}

test('doctor has patient list, saved card, reusable screening and standard branches', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByRole('link', { name: /doctor|врач/i })).toHaveCount(0);
  await page.goto('/doctor');
  await expect(page.getByRole('heading', { name: 'Вы врач или психолог?' })).toBeVisible();
  await page.getByRole('button', { name: 'Нет', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Раздел для специалистов' })).toBeVisible();
  await page.getByRole('button', { name: 'Изменить ответ' }).click();
  await page.getByRole('button', { name: 'Да, я специалист' }).click();
  await expect(page.getByRole('heading', { name: 'Работа',exact:true })).toBeVisible();
  await page.getByRole('link', { name: 'Каталог шкал' }).click();
  await expect(page.locator('.doctor-catalog-item')).toHaveCount(22);
  await expect(page.getByRole('heading', { name: 'Шкала Гамильтона для оценки депрессии' })).toBeVisible();
  await createPatient(page, 'Пациент А', '35', 'male');
  await page.getByRole('button', { name: 'Новый скрининг' }).click();
  await expect(page.getByRole('heading', { name: 'PHQ-4' })).toBeVisible();
  await page.getByText('Выбрать дополнительные шкалы · 22').click();
  await page.getByRole('button', { name: /Шкала Гамильтона для оценки депрессии/ }).click();
  await expect(page.getByRole('heading', { name: 'Шкала Гамильтона для оценки депрессии' })).toBeVisible();
  for (const [index, option] of [3, 0, 3, 0].entries()) await answer(page, 'phq4', index, option);
  await expect(page.getByRole('heading', { name: 'ГТР-7' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'PHQ-9' })).toBeVisible();
  for (let index = 0; index < 9; index++) await answer(page, 'phq9', index, index === 8 ? 1 : 0);
  await expect(page.getByRole('alert')).toContainText('PHQ-9, вопрос 9');
  const screeningPath = new URL(page.url()).pathname;
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Шкала Гамильтона для оценки депрессии' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'ГТР-7' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('PHQ-9, вопрос 9');
  await page.getByRole('link', { name: 'Карточка пациента' }).click();
  await expect(page.getByRole('link', { name: /Скрининг от/ })).toHaveCount(1);
  await page.getByRole('link', { name: /Скрининг от/ }).click();
  expect(new URL(page.url()).pathname).toBe(screeningPath);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('patient history records Aviandr use, other medicines and later edits', async ({ page }) => {
  await page.goto('/doctor/new');
  await page.getByRole('button', { name: 'Да, я специалист' }).click();
  await page.getByLabel('Имя или код пациента').fill('Пациент Д');
  await page.getByLabel('Возраст').fill('42');
  await page.getByRole('combobox', { name: 'Пол' }).selectOption('female');
  await page.getByLabel('Основные жалобы').fill('Тревога');
  await page.getByLabel('Как давно появились симптомы').fill('Два месяца');
  await page.getByRole('combobox', { name: 'Принимал ли Авиандр' }).selectOption('current');
  await page.getByLabel('Авиандр: период и назначение').fill('Со слов пациентки — три недели');
  await page.getByLabel('Другие принимаемые препараты').fill('Не указаны');
  await page.getByLabel('Нежелательные реакции или аллергии').fill('Не отмечала');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Создать карточку' }).click();
  const history = page.getByRole('region', { name: 'Анамнез пациента' });
  await expect(history).toContainText('Принимает сейчас');
  await expect(history).toContainText('Два месяца');
  await expect(history).toContainText('Со слов пациентки — три недели');
  await page.reload();
  await expect(history).toContainText('Не отмечала');
  await history.getByRole('button', { name: 'Изменить сведения' }).click();
  await history.getByRole('combobox', { name: 'Принимал ли Авиандр' }).selectOption('past');
  await history.getByRole('button', { name: 'Сохранить сведения' }).click();
  await expect(history).toContainText('Принимал(а) ранее');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ui-psy-doctor-patients') || '[]')[0]);
  expect(stored.medicalHistory.aviandrUse).toBe('past');
});

test('older and perinatal forms stay on separate patient cards', async ({ page }) => {
  await createPatient(page, 'Пациент Б', '68', 'male');
  await page.getByRole('button', { name: 'Новый скрининг' }).click();
  await expect(page.getByRole('heading', { name: 'Гериатрическая шкала депрессии' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'PHQ-9' })).toHaveCount(0);
  for (let index = 0; index < 15; index++) await answer(page, 'gds15', index, index < 5 ? ([0, 4].includes(index) ? 1 : 0) : ([6, 10, 12].includes(index) ? 0 : 1));
  await expect(page.getByRole('heading', { name: 'PHQ-9' })).toBeVisible();
  await createPatient(page, 'Пациент В', '29', 'female', 'pregnant22');
  await page.getByRole('button', { name: 'Новый скрининг' }).click();
  await expect(page.getByRole('heading', { name: 'EPDS' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'ГТР-7' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Гериатрическая шкала депрессии' })).toHaveCount(0);
  await answer(page, 'epds', 9, 0);
  await expect(page.getByRole('alert')).toContainText('EPDS, вопрос 10');
  await page.goto('/doctor');
  await expect(page.getByRole('link', { name: /Пациент Б/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Пациент В/ })).toBeVisible();
});

test('damaged local records are reported without overwriting them', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui-psy-doctor-patients', '{broken'));
  await page.goto('/doctor');
  await page.getByRole('button', { name: 'Да, я специалист' }).click();
  await expect(page.getByRole('alert')).toContainText('Данные не перезаписаны');
  await page.goto('/doctor/new');
  await page.getByLabel('Имя или код пациента').fill('Пациент');
  await page.getByLabel('Возраст').fill('35');
  await page.getByRole('combobox', { name: 'Пол' }).selectOption('male');
  await page.getByRole('button', { name: 'Создать карточку' }).click();
  expect(await page.evaluate(() => localStorage.getItem('ui-psy-doctor-patients'))).toBe('{broken');
});

test('clinician-rated scale is scored and safety item is flagged', async ({ page }) => {
  await createPatient(page, 'Пациент Г', '41', 'male');
  await page.getByRole('button', { name: 'Новый скрининг' }).click();
  await page.getByText('Выбрать дополнительные шкалы · 22').click();
  await page.getByRole('button', { name: /Шкала Монтгомери — Асберга/ }).click();
  await expect(page.getByRole('heading', { name: 'Шкала Монтгомери — Асберга' })).toBeVisible();
  for (let index = 0; index < 10; index++) await answer(page, 'madrs', index, index === 9 ? 2 : 0);
  await expect(page.getByRole('alert')).toContainText('Шкала Монтгомери — Асберга, вопрос 10');
  await expect(page.locator('.doctor-form').filter({ has: page.getByRole('heading', { name: 'Шкала Монтгомери — Асберга' }) }).getByText('2 баллов')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Шкала Монтгомери — Асберга, вопрос 10');
});
