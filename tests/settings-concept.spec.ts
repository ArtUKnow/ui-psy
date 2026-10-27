import {expect,test} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('compact settings groups retain profile and account details without exposing destructive actions',async({page})=>{
 await page.goto('/app?section=settings');
 await expect(page.getByLabel('Как к тебе обращаться?')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Удалить записи и результаты',exact:true})).toHaveCount(0);
 for(const width of [320,390,1440]){
  await page.setViewportSize({width,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBe(0);
 }
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'artifacts/settings-concept-mobile.png',fullPage:true});
 let result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(result.violations).toEqual([]);
 await page.getByRole('button',{name:/Личный профиль/}).click();
 await expect(page.getByRole('dialog',{name:'Личный профиль'})).toBeVisible();
 await expect(page.getByLabel('Как к тебе обращаться?')).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'Управление данными',exact:true}).click();
 await expect(page.getByRole('button',{name:'Удалить записи и результаты',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Закрыть',exact:true}).click();
 await page.getByRole('button',{name:'Нужна помощь',exact:true}).click();
 const help=page.getByRole('dialog',{name:'Нужна помощь',exact:true});
 await expect(help.getByText('Хочешь позвонить в службу психологической помощи и поговорить со специалистом?')).toBeVisible();
 await expect(help.getByRole('link',{name:'Позвонить',exact:true})).toHaveAttribute('href','tel:+74959895050');
 await page.screenshot({path:'artifacts/psychological-help-verified.png'});
 const helpAccess=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(helpAccess.violations).toEqual([]);
 await help.getByRole('button',{name:'Не сейчас',exact:true}).click();
 await expect(help).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Нужна помощь',exact:true})).toBeFocused();
 await page.setViewportSize({width:1440,height:900});
 await expect(page.locator('.settings-top')).toHaveCSS('display','flex');
 await page.screenshot({path:'artifacts/settings-concept-desktop.png',fullPage:true});
});

test('event sheet fits mobile and keyboard-sized viewports and retains safe event types',async({page})=>{
 await page.goto('/app?section=diary&view=events');
 await page.getByRole('button',{name:'Добавить событие',exact:true}).click();
 const sheet=page.getByRole('dialog',{name:'Добавить событие'});
 for(const width of [320,390]){
  await page.setViewportSize({width,height:844});
  const box=(await sheet.boundingBox())!;
  expect(Math.abs(box.y+box.height-844)).toBeLessThan(2);
  expect(box.width).toBeLessThanOrEqual(width);
  expect(await sheet.evaluate(el=>el.scrollWidth-el.clientWidth)).toBe(0);
 }
 await page.screenshot({path:'artifacts/event-sheet-concept-mobile.png'});
 const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(result.violations).toEqual([]);
 await page.getByLabel('Событие',{exact:true}).selectOption('safety');
 await expect(page.getByRole('complementary',{name:'Живая помощь'})).toBeVisible();
 await page.getByLabel('Событие',{exact:true}).selectOption('context');
 await page.setViewportSize({width:390,height:420});
 await page.getByLabel('Подробности',{exact:true}).fill('Важный момент');
 await sheet.getByRole('button',{name:'Сохранить событие',exact:true}).click();
 await expect(sheet).toHaveCount(0);
 await expect(page.locator('.clinical-timeline')).toContainText('Важный момент');
});
