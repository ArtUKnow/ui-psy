import {expect,test} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {assignedPatient} from './assignmentHelper';

test('introductory screening opens only its appropriate branch and direct links cannot bypass it',async({page})=>{
 await page.goto('/app?section=tests');
 await expect(page.locator('.questionnaire-card')).toHaveCount(1);
 await expect(page.locator('.tests-page')).not.toContainText(/PHQ|GAD|WHO|ISI/);
 await page.goto('/app?test=phq9');
 await expect(page.getByRole('dialog',{name:'Доступ к опроснику'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Начать',exact:true})).toHaveCount(0);
 await page.goto('/app?section=tests');await page.locator('.questionnaire-card').click();await page.getByRole('button',{name:'Начать',exact:true}).click();
 for(const [i,choice]of [2,1,0,0].entries()){await page.locator('.questionnaire-options button').nth(choice).click();await page.getByRole('button',{name:i===3?'Посмотреть результат':'Следующий вопрос',exact:true}).click();}
 await page.getByRole('button',{name:'Вернуться к тестам',exact:true}).click();
 await expect(page.locator('.questionnaire-card')).toHaveCount(2);
 await expect(page.locator('.questionnaire-card').filter({hasText:'Тревога за последние две недели'})).toHaveCount(1);
 await expect(page.locator('.questionnaire-card').filter({hasText:'Признаки депрессии'})).toHaveCount(0);
 await page.getByRole('navigation',{name:'Навигация приложения'}).getByRole('button',{name:'Дневник',exact:true}).click();await page.getByRole('button',{name:'Динамика',exact:true}).click();
 await expect(page).toHaveURL(/section=diary&view=dynamics/);
 await expect(page.getByRole('heading',{name:'Дневник чувств',exact:true})).toBeVisible();
 await expect(page.locator('.diary-insights')).not.toContainText(/PHQ|GAD|Опросники|Что можно заметить|недостаточно записей/);
});

test('assigned questionnaires require live doctor consent even through a direct link',async({page})=>{
 await assignedPatient(page,'who5');
 await page.goto('/app?section=tests');await page.getByRole('button',{name:'Назначения',exact:true}).click();
 await expect(page.locator('.questionnaire-card')).toHaveCount(1);
 await page.locator('.questionnaire-card').click();
 await expect(page.getByRole('button',{name:'Начать',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Закрыть',exact:true}).click();
 await page.goto('/connect');page.on('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Отключить',exact:true}).click();await expect(page.getByText('Доступ закрыт.')).toBeVisible();
 await page.goto('/app?test=who5');
 await expect(page.getByRole('dialog',{name:'Доступ к опроснику'})).toContainText('Опросник по назначению');
 await expect(page.getByRole('button',{name:'Начать',exact:true})).toHaveCount(0);
});

test('doctor registration persists the role and keeps personal navigation beside Work',async({page})=>{
 await page.context().clearCookies();await page.goto('/app');await page.evaluate(()=>localStorage.removeItem('ui-psy-guest'));await page.reload();
 await page.getByRole('button',{name:'Нет аккаунта? Зарегистрироваться',exact:true}).click();
 await page.getByLabel('Электронная почта').fill(`work-${crypto.randomUUID()}@example.test`);await page.getByLabel('Пароль').fill('long-role-password-2026');
 await page.getByRole('radio',{name:'Я врач или психолог',exact:true}).check();
 await page.getByRole('button',{name:'Зарегистрироваться',exact:true}).click();
 const nav=page.getByRole('navigation',{name:'Навигация приложения'});
 await expect(nav.getByRole('button',{name:'Работа',exact:true})).toBeVisible();await page.reload();await nav.getByRole('button',{name:'Работа',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Работа',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Создать код приглашения'}).click();await expect(page.locator('.care-qr svg')).toBeVisible();
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBe(0);if(width===1440)await page.screenshot({path:'artifacts/work-desktop-verified.png',fullPage:true});}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/work-mobile-verified.png',fullPage:true});const geometry=await page.evaluate(()=>({scroll:document.documentElement.scrollHeight,shell:document.querySelector('.work-shell')!.getBoundingClientRect().height}));expect(geometry.scroll-geometry.shell).toBeLessThan(2);const accessibility=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(accessibility.violations).toEqual([]);
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Профиль',exact:true}).click();await page.getByLabel('Специальность',{exact:true}).fill('Психолог');await page.getByRole('button',{name:'Сохранить профиль',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Профиль сохранён');
 await page.getByRole('link',{name:'Перейти в личное пространство'}).click();await expect(page.getByRole('heading',{name:'Привет, Пользователь',exact:true})).toBeVisible();
});
