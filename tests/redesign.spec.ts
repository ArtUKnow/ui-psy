import {expect,test} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('approved diary layout keeps controls in order and one recorded point stays finite',async({page})=>{
 await page.goto('/app?section=diary');
 await page.evaluate(()=>localStorage.setItem('tishe-entries',JSON.stringify([{id:'layout-fixture',createdAt:new Date().toISOString(),type:'emotion',mood:7,anxiety:2,energy:6,feelings:['Спокойствие'],influences:[],note:'Одна запись'}])));
 await page.reload();
 const toolbar=(await page.locator('.diary-toolbar').boundingBox())!;
 const action=(await page.getByRole('button',{name:'Новый момент',exact:true}).boundingBox())!;
 const dates=(await page.getByRole('navigation',{name:'Последние семь дней'}).boundingBox())!;
 expect(action.y).toBeGreaterThanOrEqual(toolbar.y+toolbar.height);
 expect(dates.y).toBeGreaterThanOrEqual(action.y+action.height);
 await page.setViewportSize({width:1440,height:900});
 await expect(page.locator('.diary-day-summary')).toContainText('Среднее по 1 записи');
 await expect(page.locator('.diary-summary-mood strong')).toHaveText('7/10');
 const geometry=await page.locator('.diary-day-summary svg').evaluateAll(nodes=>nodes.flatMap(svg=>Array.from(svg.querySelectorAll('path,circle')).map(node=>node.getAttribute('d')||[node.getAttribute('cx'),node.getAttribute('cy')].join(','))));
 expect(geometry.join(' ')).not.toMatch(/NaN|Infinity/);
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'События',exact:true}).click();
 await page.getByRole('button',{name:'Добавить событие',exact:true}).click();
 const modal=page.getByRole('dialog',{name:'Добавить событие'});
 expect(await modal.evaluate(el=>el.closest('[inert]')!==null)).toBe(false);
 await modal.getByLabel('Подробности',{exact:true}).fill('Проверка формы');
 await modal.getByRole('button',{name:'Сохранить событие',exact:true}).click();
 await expect(page.locator('.clinical-timeline')).toContainText('Проверка формы');
});

test('redesigned destinations fit narrow and desktop viewports; diary and catalog stay accessible',async({page})=>{
 for(const route of ['/app?section=diary','/app?section=statistics','/app?section=tests','/app?section=events','/app?section=care','/app?section=practices','/participant']){
  await page.goto(route);
  for(const width of [320,390,1440]){
   await page.setViewportSize({width,height:900});
   await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),{message:`Overflow: ${route} at ${width}`}).toBe(0);
  }
 }
 for(const route of ['/app?section=diary','/app?section=tests']){
  await page.goto(route);
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
 }
});
