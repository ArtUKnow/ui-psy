import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.use({ storageState: { cookies: [], origins: [] } });

async function register(page: import('@playwright/test').Page, email: string) {
  await page.goto('/app');
  await page.getByRole('button', { name: 'Нет аккаунта? Зарегистрироваться' }).click();
  await page.getByLabel('Электронная почта').fill(email);
  await page.getByLabel('Пароль').fill('long-test-password-2026');
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
  await expect(page.getByRole('heading', { name: 'Привет, Пользователь' })).toBeVisible();
}

test('doctor QR invitation needs patient consent and can be revoked', async ({ page, browser }) => {
  const doctorEmail = `ui-psy-doctor-${crypto.randomUUID()}@example.test`;
  const patientEmail = `ui-psy-patient-${crypto.randomUUID()}@example.test`;
  await register(page, doctorEmail);
  await page.goto('/doctor');
  await page.getByRole('button', { name: 'Да, я специалист' }).click();
  await page.getByRole('button', { name: 'Создать код приглашения' }).click();
  const code = await page.locator('.care-invite strong').innerText();
  await expect(page.locator('.care-qr svg')).toBeVisible();

  const patientContext = await browser.newContext();
  const patientPage = await patientContext.newPage();
  await register(patientPage, patientEmail);
  await patientPage.goto(`/connect?code=${encodeURIComponent(code)}`);
  await expect(patientPage.getByText(doctorEmail)).toBeVisible();
  await patientPage.getByRole('button', { name: 'Разрешить доступ' }).click();
  await expect(patientPage.getByRole('heading', { name: 'Подключённые врачи' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('link', { name: /Открыть профиль/ })).toBeVisible();
  await page.getByRole('link', { name: /Открыть профиль/ }).click();
  await expect(page.getByRole('heading', { name: 'Профиль пациента' })).toBeVisible();
  await page.getByRole('button',{name:'План',exact:true}).click();
  await page.getByLabel('Рекомендация специалиста').fill('Повторить PHQ-9 через две недели и обсудить сон.');
  await page.getByRole('button', { name: 'Сохранить рекомендацию', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Изменения сохранены');
  await page.getByRole('button', { name: 'Добавить назначение', exact: true }).click();
  await patientPage.goto('/app?section=care');
  await expect(patientPage.getByRole('heading', { name: 'План со специалистом' })).toBeVisible();
  await expect(patientPage.locator('.clinical-recommendation')).toContainText('Повторить PHQ-9');
  await expect(patientPage.locator('.clinical-task').filter({ hasText: 'Признаки депрессии' }).first()).toBeVisible();
  await patientPage.goto('/connect');


  patientPage.on('dialog', dialog => dialog.accept());
  await patientPage.getByRole('button', { name: 'Отключить', exact: true }).click();
  await expect(patientPage.getByText('Доступ закрыт.')).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('alert')).toContainText('Пациент не предоставил доступ');
  await patientContext.close();
});

test('patient and connected doctor exchange persistent messages',async({page,browser})=>{
 const doctorEmail=`chat-doctor-${crypto.randomUUID()}@example.test`;
 await register(page,doctorEmail);await page.goto('/doctor');await page.getByRole('button',{name:'Да, я специалист'}).click();await page.getByRole('button',{name:'Создать код приглашения'}).click();
 const code=await page.locator('.care-invite strong').innerText();
 const context=await browser.newContext();const patient=await context.newPage();await register(patient,`chat-patient-${crypto.randomUUID()}@example.test`);
 await patient.goto(`/connect?code=${encodeURIComponent(code)}`);await patient.getByRole('button',{name:'Разрешить доступ'}).click();
 await patient.goto('/app?section=assistant');await expect(patient.getByRole('heading',{name:doctorEmail,exact:true})).toBeVisible();
 await patient.getByLabel('Сообщение врачу',{exact:true}).fill('Здравствуйте! Хочу обсудить самочувствие.');await patient.getByRole('button',{name:'Отправить сообщение',exact:true}).click();
 await expect(patient.locator('.outgoing')).toContainText('Хочу обсудить самочувствие');
 await page.goto('/doctor');await page.getByRole('link',{name:'Написать',exact:true}).click();await expect(page.locator('.incoming')).toContainText('Хочу обсудить самочувствие');
 await page.getByLabel('Сообщение пациенту',{exact:true}).fill('Здравствуйте! Напишите, как прошла неделя.');await page.getByRole('button',{name:'Отправить сообщение',exact:true}).click();
 await expect(patient.locator('.incoming')).toContainText('как прошла неделя',{timeout:10000});
 await patient.reload();await expect(patient.locator('.outgoing')).toHaveCount(1);await expect(patient.locator('.incoming')).toHaveCount(1);
 await patient.screenshot({path:'artifacts/doctor-chat-mobile.png',fullPage:true});
 expect((await new AxeBuilder({page:patient}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
 expect(await patient.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBe(0);
 await patient.goto('/connect');patient.on('dialog',dialog=>dialog.accept());await patient.getByRole('button',{name:'Отключить',exact:true}).click();
 await page.reload();await expect(page.getByRole('alert')).toContainText('Пациент не предоставил доступ');
 await context.close();
});
