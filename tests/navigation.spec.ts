import {test,expect} from '@playwright/test';

test('overview stays short and details have dedicated destinations with browser back',async({page})=>{
 await page.goto('/app');
 for(const width of [320,390,1440]){
  await page.setViewportSize({width,height:844});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBe(0);
  expect((await page.locator('.home-overview').boundingBox())!.height).toBeLessThan(900);
 }
 await expect(page.locator('.clinical-screening,.clinical-devices,.medication-tracker,.clinical-timeline')).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Динамика',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Дневник чувств',exact:true})).toBeVisible();
 await expect(page.getByRole('region',{name:'Ежедневное самочувствие'})).toBeVisible();
 await page.getByRole('button',{name:'События',exact:true}).click();
 await page.getByRole('button',{name:'Добавить событие',exact:true}).click();await page.getByLabel('Подробности',{exact:true}).fill('Прогулка после работы');
 await page.getByRole('button',{name:'Сохранить событие',exact:true}).click();
 await expect(page.locator('.clinical-timeline')).toContainText('Прогулка после работы');
 await page.goBack();
 await expect(page.getByRole('heading',{name:'Дневник чувств',exact:true})).toBeVisible();
 await page.goBack();
 await expect(page.locator('.home-overview')).toBeVisible();
 await page.getByRole('button',{name:'Мой план',exact:true}).click();
 await expect(page.getByRole('region',{name:'График приёма лекарств'})).toBeVisible();
 await page.reload();
 await expect(page.getByRole('heading',{name:'Мой план',exact:true})).toBeVisible();
 await page.getByRole('navigation',{name:'Навигация приложения'}).getByRole('button',{name:'Настройки'}).click();
 await page.getByRole('button',{name:/Устройства Нейроинтерфейс и Apple Health/}).click();
 await expect(page.locator('.clinical-devices')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBe(0);
});

test('self screening, doctor assignments and results are separate views',async({page})=>{
 await page.goto('/app?section=tests');
 await expect(page.locator('.questionnaire-catalog').first()).toBeVisible();
 await expect(page.locator('.clinical-screening')).toHaveCount(0);
 await expect(page.locator('.questionnaire-catalog .questionnaire-card')).toHaveCount(1);
 await page.getByRole('button',{name:'Назначения',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Назначений пока нет',exact:true})).toBeVisible();
 await expect(page.locator('.questionnaire-catalog')).toHaveCount(0);
 await page.getByRole('button',{name:'Результаты',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Пока нет результатов',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Выбрать опросник',exact:true}).click();
 await expect(page.locator('.questionnaire-catalog').first()).toBeVisible();
});

test('home previews use recorded days, retain gaps and load the separate illustrations',async({page})=>{
 await page.goto('/app');
 await page.evaluate(()=>{
  const stamp=(offset:number)=>{const day=new Date();day.setDate(day.getDate()-offset);return day.toISOString();};
  localStorage.setItem('tishe-entries',JSON.stringify([
   {id:'older',createdAt:stamp(2),type:'emotion',mood:4,anxiety:3,energy:5,feelings:['Усталость'],influences:[],note:''},
   {id:'latest',createdAt:stamp(0),type:'emotion',mood:8,anxiety:2,energy:6,feelings:['Спокойствие'],influences:[],note:''},
  ]));
 });
 await page.reload();
 await expect(page.getByRole('button',{name:'Настроение: 8 из 10. Подробнее',exact:true})).toBeVisible();
 await expect(page.locator('.overview-feeling')).toHaveText('Спокойствие');
 const week=page.getByRole('button',{name:'Динамика',exact:true});
 await expect(week).toContainText('Дней с отметками: 2 из 7');
 await expect(week).toContainText('В среднем 6/10');
 await expect(week.locator('svg.overview-chart circle')).toHaveCount(2);
 await expect(week.locator('svg.overview-chart path')).toHaveCount(0);
 for(const image of await page.locator('.overview-art-card img').all()){
  await expect.poll(()=>image.evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBe(0);
});

test('bottom navigation follows the visible iPhone viewport when browser chrome changes',async({page})=>{
 await page.goto('/app');
 for(const height of [600,720,844]){
  await page.evaluate(height=>{Object.defineProperty(window.visualViewport,'height',{configurable:true,get:()=>height});window.visualViewport!.dispatchEvent(new Event('resize'));},height);
  await expect.poll(()=>page.locator('.mobile-nav').evaluate(el=>el.getBoundingClientRect().bottom)).toBeCloseTo(height,0);
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  await expect.poll(()=>page.locator('.mobile-nav').evaluate(el=>el.getBoundingClientRect().bottom)).toBeCloseTo(height,0);
 }
});
