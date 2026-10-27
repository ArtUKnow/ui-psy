import { expect, test } from '@playwright/test';
import {assignedPatient} from './assignmentHelper';

test('clinical scoring, safety signals, and screening branches preserve distinct scales', async ({page})=>{
 await page.goto('/app');
 const values=await page.evaluate(async()=>{
  const questionnairePath='/src/lib/questionnaires.ts',screeningPath='/src/lib/doctorScreening.ts',clinicalPath='/src/lib/clinical.ts';
  const {doctorQuestionnaires,scoreQuestionnaire,selfHarmAnswer}=await import(questionnairePath);
  const {patientGroup,requiredForms}=await import(screeningPath);
  const {emotionDescriptors}=await import(clinicalPath);
  const who=doctorQuestionnaires.find((q:any)=>q.id==='who5'),dass=doctorQuestionnaires.find((q:any)=>q.id==='dass21');
  return {whoOptions:who.questions.map((q:any)=>q.options.length),whoMax:scoreQuestionnaire(who,[5,5,5,5,5]),whoMin:scoreQuestionnaire(who,[0,0,0,0,0]),dass:scoreQuestionnaire(dass,Array(21).fill(3)),standard:requiredForms('standard',{phq4:[2,1,1,2]}),older:requiredForms('older',{gds15:doctorQuestionnaires.find((q:any)=>q.id==='gds15').questions.map((q:any,i:number)=>q.options.findIndex((o:any)=>o.score===(i<5?1:0)))}),groups:[patientGroup(60,'male','none'),patientGroup(61,'male','none'),patientGroup(30,'female','pregnant22')],safety:selfHarmAnswer('phq9',8,1),zeroSafety:selfHarmAnswer('phq9',8,0),emotionCount:emotionDescriptors.length};
 });
 expect(values.whoOptions).toEqual([6,6,6,6,6]);expect(values.whoMax.score).toBe(100);expect(values.whoMin.score).toBe(0);
 expect(values.dass.subscores.map((s:any)=>s.score)).toEqual([42,42,42]);
 expect(values.standard).toEqual(['phq4','wayne','gad7','phq9']);expect(values.older).toContain('phq9');expect(values.groups).toEqual(['standard','older','perinatal']);expect(values.safety).toBe(true);expect(values.zeroSafety).toBe(false);expect(values.emotionCount).toBe(38);
});

test('daily chart leaves missing days empty and retains the real daily mean',async({page})=>{
 await page.goto('/app');
 const points=await page.evaluate(async()=>{const path='/src/components/ClinicalCharts.tsx';const {dailyPoints}=await import(path);return dailyPoints([{createdAt:'2026-10-24T12:00:00',mood:2,influences:[],note:''},{createdAt:'2026-10-24T18:00:00',mood:6,influences:[],note:''},{createdAt:'2026-10-26T12:00:00',mood:8,influences:[],note:''}],'mood',3,new Date('2026-10-26T12:00:00'));});
 expect(points.map((p:any)=>p.value)).toEqual([4,null,8]);
});

test('PHQ-9 saves raw answers and a separate safety signal even for a low total',async({page})=>{
 await page.goto('/app');await page.evaluate(()=>localStorage.setItem('tishe-results',JSON.stringify([{id:'intro',testId:'phq4',createdAt:new Date().toISOString(),answerScores:[0,0,2,1],score:3,title:'PHQ-4'}])));await page.goto('/app?test=phq9');await page.getByRole('dialog').getByRole('button',{name:'Начать',exact:true}).click();
 for(let i=0;i<9;i++){await page.locator('.questionnaire-options button').nth(i===8?1:0).click();if(i===8)await expect(page.getByRole('dialog').getByRole('link',{name:'Позвонить 112 · Россия'})).toBeVisible();await page.getByRole('button',{name:i===8?'Посмотреть результат':'Следующий вопрос'}).click();}
 await expect(page.locator('.questionnaire-result')).toContainText('1 / 27');
 const result=await page.evaluate(()=>JSON.parse(localStorage.getItem('tishe-results')||'[]')[0]);
 expect(result.answers).toHaveLength(9);expect(result.answerScores).toEqual([0,0,0,0,0,0,0,0,1]);expect(result.safety).toBe(true);expect(result.questionnaireVersion).toBeTruthy();
});

test('WHO-5 compares with the prior measurement and keeps its two-week window',async({page})=>{
 const assigned=await assignedPatient(page,'who5');const prior={id:'prior',testId:'who5',title:'WHO-5',score:40,maxScore:100,createdAt:new Date(Date.now()-86400000).toISOString()};expect((await page.request.put('http://127.0.0.1:5188/api/data/results',{headers:assigned.headers,data:{version:0,value:[prior]}})).ok()).toBe(true);
 await page.goto('/app?test=who5');await expect(page.getByRole('dialog')).toContainText('последние две недели');await page.getByRole('dialog').getByRole('button',{name:'Начать',exact:true}).click();
 for(let i=0;i<5;i++){await page.locator('.questionnaire-options button').last().click();await page.getByRole('button',{name:i===4?'Посмотреть результат':'Следующий вопрос'}).click();}
 await expect(page.locator('.questionnaire-result')).toContainText('100 / 100');await expect(page.locator('.questionnaire-result')).toContainText('Изменение: +60');
});

test('shared guest care state survives context events and a deduplicated Apple Health import',async({page})=>{
 await page.goto('/app?section=tests');await expect(page.getByText('Вводная диагностика',{exact:true})).toBeVisible();
 await page.goto('/app?section=events');await page.getByRole('button',{name:'Добавить событие',exact:true}).click();await page.getByLabel('Подробности',{exact:true}).fill('Экзамен и недосып');await page.getByRole('button',{name:'Сохранить событие',exact:true}).click();
 await page.goto('/app?section=devices');const devices=page.locator('.clinical-devices');await devices.getByText('Apple Watch / Apple Health',{exact:true}).click();
 const xml='<HealthData><Record type="HKCategoryTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAnalysisAsleepCore" startDate="2026-10-25T23:00:00Z" endDate="2026-10-26T03:00:00Z" sourceName="Watch"/><Record type="HKCategoryTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAnalysisAsleepDeep" startDate="2026-10-26T01:00:00Z" endDate="2026-10-26T05:00:00Z" sourceName="Watch"/><Record type="HKQuantityTypeIdentifierAppleExerciseTime" value="30" unit="min" startDate="2026-10-26T06:00:00Z" endDate="2026-10-26T06:30:00Z" sourceName="Watch"/></HealthData>';
 for(let i=0;i<2;i++)await devices.locator('input[type=file]').setInputFiles({name:'export.xml',mimeType:'text/xml',buffer:Buffer.from(xml)});
 await expect(devices.getByRole('status')).toContainText('Импортировано');
 const care=await page.evaluate(()=>JSON.parse(localStorage.getItem('ui-psy-care')||'{}'));expect(care.events).toHaveLength(1);expect(care.events[0].text).toBe('Экзамен и недосып');expect(care.health).toHaveLength(2);expect(care.health.find((h:any)=>h.kind==='sleepHours').value).toBe(6);
 await page.goto('/app?section=events');await expect(page.locator('.clinical-timeline')).toContainText('Экзамен и недосып');
});

test('NeuroPlay stores actual sampled session statistics and reports connection failure',async({page})=>{
 await page.goto('/app?section=devices');const devices=page.locator('.clinical-devices');await devices.getByText('Нейротренировка NeuroPlay-6C',{exact:true}).click();
 await page.route('http://127.0.0.1:2336/bci',route=>route.fulfill({json:{result:true,concentration:75,meditation:25},headers:{'Access-Control-Allow-Origin':'*'}}));
 await devices.getByRole('button',{name:'Подключить и начать',exact:true}).click();await expect(devices.getByRole('button',{name:'Закончить и сохранить'})).toBeVisible();await page.waitForTimeout(1300);await devices.getByRole('button',{name:'Закончить и сохранить'}).click();await expect(devices.getByRole('status')).toContainText('Сессия сохранена');
 const care=await page.evaluate(()=>JSON.parse(localStorage.getItem('ui-psy-care')||'{}'));expect(care.sessions).toHaveLength(1);expect(care.sessions[0].average).toBe(75);expect(care.sessions[0].duration).toBeGreaterThan(0);expect(care.sessions[0].longest).toBeGreaterThan(0);
 await page.unroute('http://127.0.0.1:2336/bci');await page.route('http://127.0.0.1:2336/bci',route=>route.abort());await devices.getByRole('button',{name:'Подключить и начать',exact:true}).click();await expect(devices.getByRole('alert')).toContainText('Запусти NeuroPlayPro');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('ui-psy-care')||'{}').sessions.length)).toBe(1);
});
