import { dateKey } from './data';
import type { HealthSample } from './clinical';
export function parseAppleHealth(xml: string): HealthSample[] {
 const document=new DOMParser().parseFromString(xml,'text/xml');
 if(document.querySelector('parsererror'))throw new Error('Не удалось прочитать XML Apple Health.');
 const sleep=new Map<string,{start:number;end:number;source:string}[]>(),activity=new Map<string,{value:number;source:string}>();
 for(const record of document.querySelectorAll('Record')) {
  const type=record.getAttribute('type'),source=record.getAttribute('sourceName')||'Apple Health',start=Date.parse(record.getAttribute('startDate')||''),end=Date.parse(record.getAttribute('endDate')||'');
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)continue;
  if(type==='HKCategoryTypeIdentifierSleepAnalysis'&&/^HKCategoryValueSleepAnalysisAsleep/.test(record.getAttribute('value')||'')){
   const key=dateKey(new Date(end));sleep.set(key,[...(sleep.get(key)||[]),{start,end,source}]);
  }
  if(type==='HKQuantityTypeIdentifierAppleExerciseTime'){
   const raw=Number(record.getAttribute('value')),unit=record.getAttribute('unit');
   if(!Number.isFinite(raw)||raw<0||!['min','s','hr','h'].includes(unit||''))continue;
   const value=unit==='s'?raw/60:(unit==='hr'||unit==='h')?raw*60:raw;
   const key=`${source}:${start}:${end}`;activity.set(key,{value,source});
  }
 }
 const result:HealthSample[]=[];
 for(const [date,intervals] of sleep){
  const sorted=intervals.sort((a,b)=>a.start-b.start);let total=0,start=sorted[0].start,end=sorted[0].end;
  for(const value of sorted.slice(1)){if(value.start<=end)end=Math.max(end,value.end);else{total+=end-start;start=value.start;end=value.end;}}total+=end-start;
  result.push({id:`apple-sleep-${date}`,createdAt:new Date(`${date}T12:00:00`).toISOString(),kind:'sleepHours',value:total/3600000,source:[...new Set(intervals.map(i=>i.source))].join(', ')});
 }
 const totals=new Map<string,{value:number;sources:Set<string>}>();
 for(const [key,item] of activity){const end=Number(key.split(':').at(-1));const date=dateKey(new Date(end));const total=totals.get(date)||{value:0,sources:new Set<string>()};total.value+=item.value;total.sources.add(item.source);totals.set(date,total);}
 for(const [date,item] of totals)result.push({id:`apple-activity-${date}`,createdAt:new Date(`${date}T12:00:00`).toISOString(),kind:'activityMinutes',value:item.value,source:[...item.sources].join(', ')});
 if(!result.length)throw new Error('В файле нет поддерживаемых записей сна или Apple Exercise Time. Значения не добавлены.');
 return result;
}
