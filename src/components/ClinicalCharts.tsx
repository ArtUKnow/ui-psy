import { useEffect, useId, useMemo, useState } from 'react';
import { dateKey, type Entry, type TestResult } from '../lib/data';
import { clinicalScales, severity, type CareData, type Prescription } from '../lib/clinical';
import { doctorQuestionnaires } from '../lib/questionnaires';
import {questionnairePurposes} from '../lib/questionnairePresentation';
import {Cloud, Moon, Smile, Zap, Activity} from './icons';
import {Sparkline} from './Visuals';
export type PlotPoint = { date: string; value: number | null; detail?: string };
export const dailyMetrics = { mood:'Настроение', anxiety:'Тревога', energy:'Энергия', sleep:'Качество сна', stress:'Напряжённость дня' };
export type DailyMetric = keyof typeof dailyMetrics;
export function dailyPoints(entries: Entry[], metric: DailyMetric, days: number, now = new Date()): PlotPoint[] {
 return Array.from({length:days},(_,index)=>{ const date = new Date(now);date.setDate(date.getDate()-(days-1-index));const key=dateKey(date);const items=entries.filter(e=>dateKey(e.createdAt)===key && typeof e[metric]==='number');return {date:key,value:items.length?items.reduce((s,e)=>s+e[metric]!,0)/items.length:null,detail:items.map(e=>[...e.influences,e.note].filter(Boolean).join(' · ')).filter(Boolean).join('; ')}; });
}
function shortDate(value: string) { return new Date(value.length===10?`${value}T12:00:00`:value).toLocaleDateString('ru-RU',{day:'numeric',month:'short'}); }
export function MeasurementPlot({points,max,label,color='#9ed2ef',daily=false}:{points:PlotPoint[];max:number;label:string;color?:string;daily?:boolean}) {
 const [selected,setSelected]=useState<number|null>(null);
 const plotId=useId().replace(/:/g,'');
 const [compact,setCompact]=useState(()=>window.matchMedia('(max-width:650px)').matches);
 useEffect(()=>{const media=window.matchMedia('(max-width:650px)');const update=()=>setCompact(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 const right=compact?340:596, chartWidth=compact?370:630;
 const valid=points.filter(p=>p.value!==null);
 const x=(i:number)=>{if(daily)return 36+i*(right-36)/Math.max(1,points.length-1);const start=Date.parse(points[0]?.date),end=Date.parse(points.at(-1)?.date??'');return end===start?(right+36)/2:36+(Date.parse(points[i].date)-start)/(end-start)*(right-36);};
 const y=(v:number)=>166-v/max*140;
 const segments:number[][]=[[]];points.forEach((p,i)=>{if(p.value===null){if(segments.at(-1)!.length)segments.push([]);}else segments.at(-1)!.push(i);});
 const chosen=selected===null?null:points[selected];
 return <div className="clinical-plot">
 {valid.length ? <><svg viewBox={`0 0 ${chartWidth} 220`} role="img" tabIndex={0} aria-label={`${label}. Измерений: ${valid.length}. Стрелки влево и вправо показывают даты.`} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();setSelected(i=>Math.max(0,Math.min(points.length-1,(i??points.length-1)+(e.key==='ArrowRight'?1:-1))));}}}>
 <defs><linearGradient id={`plot-${plotId}`} x1="0" y1="0" x2="0" y2="1"><stop stopColor={color} stopOpacity=".25"/><stop offset="1" stopColor={color} stopOpacity=".015"/></linearGradient></defs>
 {(daily?[0,2,4,6,8,10]:[0,max/2,max]).map(v=><g key={v}><text x="5" y={y(v)+4}>{v}</text><line x1="36" x2={right} y1={y(v)} y2={y(v)} stroke="currentColor" opacity=".13" strokeDasharray={daily?undefined:"3 5"}/></g>)}
 {daily&&points.map((_,i)=><line key={i} x1={x(i)} x2={x(i)} y1="26" y2="166" stroke="currentColor" opacity=".08"/>)}
 {segments.filter(s=>s.length>1).map((s,i)=>{const d=s.map((index,n)=>`${n?'L':'M'}${x(index)} ${y(points[index].value!)}`).join(' ');return <g key={i}><path d={`${d} L${x(s.at(-1)!)} 166 L${x(s[0])} 166 Z`} fill={`url(#plot-${plotId})`}/><path d={d} fill="none" stroke={color} strokeWidth="2.5"/></g>;})}
 {points.map((p,i)=>p.value!==null&&<circle key={i} cx={x(i)} cy={y(p.value!)} r={selected===i?5:3.5} fill={color} onClick={()=>setSelected(i)}/>)}
 {points.map((p,i)=>(i===0||i===points.length-1||i%Math.max(1,Math.ceil(points.length/(compact?4:6)))===0)&&<text key={i} x={x(i)} y="195" textAnchor="middle">{shortDate(p.date)}</text>)}
 </svg><label className="clinical-day-picker">Посмотреть дату<select value={selected??''} onChange={e=>setSelected(e.target.value===''?null:Number(e.target.value))}><option value="">Выбери день</option>{points.map((p,i)=><option key={i} value={i}>{shortDate(p.date)} — {p.value===null?'нет записи':p.value.toLocaleString('ru-RU',{maximumFractionDigits:1})}</option>)}</select></label>
 {chosen&&<div className="clinical-selected" role="status"><strong>{shortDate(chosen.date)} · {chosen.value===null?'Нет записи':`${chosen.value.toLocaleString('ru-RU',{maximumFractionDigits:1})} / ${max}`}</strong>{chosen.detail&&<p>{chosen.detail}</p>}</div>}</> : <p className="clinical-empty">За выбранный период нет измерений. График появится после первой отметки.</p>}
 </div>;
}
const metricIcons={mood:Smile,anxiety:Cloud,energy:Zap,sleep:Moon,stress:Activity};
const metricColors={mood:'#aaa4ff',anxiety:'#98e6df',energy:'#8fcaff',sleep:'#bcabef',stress:'#d7b3e9'};
export function DailyClinicalChart({entries}:{entries:Entry[]}) {
 const [days,setDays]=useState(7),[metric,setMetric]=useState<DailyMetric>('mood');
 const points=useMemo(()=>dailyPoints(entries,metric,days),[entries,metric,days]);
 const measured=points.filter(p=>p.value!==null);
 const periodAverage=measured.length?measured.reduce((s,p)=>s+p.value!,0)/measured.length:null;
 const Icon=metricIcons[metric];
 return <section className="daily-dashboard" aria-label="Ежедневное самочувствие">
 <div className="daily-period-row"><Period value={days} onChange={setDays}/></div>
 <div className="clinical-card concept-daily-card"><div className="daily-title"><Icon size={27} style={{color:metricColors[metric]}}/><h2>{dailyMetrics[metric]}</h2><select aria-label="Показатель самочувствия" value={metric} onChange={e=>setMetric(e.target.value as DailyMetric)}>{Object.entries(dailyMetrics).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></div>
 <div className="daily-chart-layout"><div><MeasurementPlot key={`${metric}-${days}`} points={points} max={10} label={dailyMetrics[metric]} color={metricColors[metric]} daily/><div className="daily-legend"><span><i style={{background:metricColors[metric]}}/>Есть отметка</span><span><i className="no-data"/>Нет данных</span></div></div>
 <aside className="daily-average"><span>Среднее за {days} дней</span><strong>{periodAverage===null?'—':periodAverage.toLocaleString('ru-RU',{maximumFractionDigits:1})}<small>{periodAverage===null?'':'/10'}</small></strong><p>{measured.length?`Дней с отметками: ${measured.length} из ${days}`:'Пока нет отметок за этот период'}</p></aside></div></div>
 <div className="daily-metric-cards">{(Object.keys(dailyMetrics) as DailyMetric[]).map(key=>{const values=dailyPoints(entries,key,days).filter(p=>p.value!==null).map(p=>p.value!);const mean=values.length?values.reduce((a,b)=>a+b,0)/values.length:null;const MetricIcon=metricIcons[key];return <button key={key} aria-label={dailyMetrics[key]} aria-pressed={metric===key} onClick={()=>setMetric(key)}><span><MetricIcon size={22} style={{color:metricColors[key]}}/>{dailyMetrics[key]}</span><div><strong>{mean===null?'—':mean.toLocaleString('ru-RU',{maximumFractionDigits:1})}<small>{mean===null?'':'/10'}</small></strong>{!!values.length&&<Sparkline values={values} color={metricColors[key]}/>}</div></button>;})}</div>
 <details className="daily-explanation"><summary>Как читать график</summary></details>
 </section>;
}
export function Period({value,onChange}:{value:number;onChange:(value:number)=>void}) {return <div className="clinical-period" role="group" aria-label="Период наблюдений">{[7,30,90].map(v=><button key={v} aria-pressed={v===value} onClick={()=>onChange(v)}>{v} дней</button>)}</div>;}
export function ClinicalResults({results,onTest,audience='doctor'}:{audience?:'patient'|'doctor';results:TestResult[];onTest?:(id:string)=>void}) {
 const [days,setDays]=useState(90),[selected,setSelected]=useState('phq9');const scale=clinicalScales[selected];const displayTitle=(id:string)=>audience==='patient'?(questionnairePurposes[id]||'Опросник'):(clinicalScales[id]?.name||id);
 const history=results.filter(r=>r.testId===selected&&Number.isFinite(Date.parse(r.createdAt))).sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt));
 const filtered=history.filter(r=>Date.parse(r.createdAt)>=Date.now()-days*86400000);const latest=history.at(-1),previous=history.at(-2);
 return <section className="clinical-card" aria-label="Динамика опросников"><div className="clinical-heading"><h2>Динамика опросников</h2><Period value={days} onChange={setDays}/></div><div className="clinical-metric-tabs">{Object.entries(clinicalScales).filter(([id])=>['phq9','gad7','who5','isi'].includes(id)||results.some(r=>r.testId===id)).map(([id])=><button key={id} onClick={()=>setSelected(id)} aria-pressed={id===selected}>{displayTitle(id)}</button>)}</div><div className="clinical-score"><div><strong>{latest?`${latest.score} / ${scale.max}`:'Нет результата'}</strong><p>{latest?`${severity(selected,latest.score)} · ${shortDate(latest.createdAt)}`:scale.period}</p></div>{onTest&&<button className="secondary-button" onClick={()=>onTest(selected)}>Пройти {scale.name}</button>}</div>{latest&&previous&&<p className="clinical-caption">Изменение с {shortDate(previous.createdAt)}: {latest.score-previous.score>0?'+':''}{latest.score-previous.score} баллов.</p>}<MeasurementPlot key={`${selected}-${days}`} label={displayTitle(selected)} max={scale.max} points={filtered.map(r=>({date:r.createdAt,value:r.score,detail:r.summary}))}/><p className="clinical-caption">{scale.period}. {scale.higherBetter?'Выше — больше благополучия.':'Выше — больше выраженность симптомов.'} Каждая точка — отдельное заполнение; значения между датами не измерялись. {audience==='doctor'&&scale.source&&<a href={scale.source} target="_blank" rel="noreferrer">О шкале</a>}</p>
 <details className="clinical-details"><summary>Ответы по отдельным пунктам</summary>{filtered.length?<div className="clinical-table-wrap"><table><caption>{displayTitle(selected)}: исходные ответы по датам</caption><thead><tr><th>Пункт</th>{filtered.slice(-6).map(r=><th key={r.id}>{shortDate(r.createdAt)}</th>)}</tr></thead><tbody>{doctorQuestionnaires.find(t=>t.id===selected)?.questions.map((q,index)=><tr key={index}><th>{index+1}. {q.text}</th>{filtered.slice(-6).map(r=><td key={r.id}>{r.answerScores?.[index]??'Нет исходного ответа'}</td>)}</tr>)}</tbody></table></div>:<p>Пока нет ответов за этот период.</p>}</details></section>;
}
export function ClinicalTimeline({entries,results,care,prescriptions=[],includeTests=true}:{entries:Entry[];results:TestResult[];care:CareData;prescriptions?:Prescription[];includeTests?:boolean}) {
 const [days,setDays]=useState(30);
 const events=[...prescriptions.flatMap(p=>[{id:`start-${p.id}`,date:new Date(`${p.startsAt}T12:00:00`).toISOString(),title:'Назначение врача',text:`${p.name} · ${p.dose} · ${p.instructions}`},...(p.endsAt?[{id:`end-${p.id}`,date:new Date(`${p.endsAt}T12:00:00`).toISOString(),title:'Окончание назначения',text:p.name}]:[])]),...care.events.map(e=>({id:e.id,date:e.createdAt,title:({visit:'Визит',treatment:'Изменение лечения',adverse:'Нежелательное явление',context:'Контекст',safety:'Сообщение для оценки безопасности'})[e.kind],text:e.text})),...(includeTests?results:[]).filter(r=>r.testId==='phq9'||r.testId==='gad7').map(r=>({id:r.id,date:r.createdAt,title:r.title,text:`${r.score} / ${r.maxScore}`})),...entries.map(e=>({id:e.id,date:e.createdAt,title:'Отметка самочувствия',text:`Настроение ${e.mood}/10 · тревога ${e.anxiety}/10 · энергия ${e.energy}/10${e.sleep!==undefined?` · сон ${e.sleep}/10`:''}${e.stress!==undefined?` · напряжение ${e.stress}/10`:''}${e.influences.length?` · ${e.influences.join(', ')}`:''}${e.note?` · ${e.note}`:''}`}))].filter(e=>Date.parse(e.date)>=Date.now()-days*86400000).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
 return <section className="clinical-card"><div className="clinical-heading"><h2>Состояние и события</h2><Period value={days} onChange={setDays}/></div>{events.length?<ol className="clinical-timeline">{events.map(e=><li key={e.id}><time>{new Date(e.date).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</time><div><strong>{e.title}</strong><p>{e.text}</p></div></li>)}</ol>:<p className="clinical-empty">Событий за этот период нет.</p>}</section>;
}

export function HabitChart({entries}:{entries:Entry[]}) {
 const [days,setDays]=useState(30),[kind,setKind]=useState<'sleepHours'|'activityMinutes'|'goalCompleted'>('sleepHours');
 const labels={sleepHours:'Продолжительность сна, часы',activityMinutes:'Физическая активность, минуты',goalCompleted:'Личная цель: 1 — выполнена, 0 — не выполнена'};
 const points:PlotPoint[]=Array.from({length:days},(_,i)=>{const date=new Date();date.setDate(date.getDate()-(days-1-i));const key=dateKey(date);const entriesForDay=entries.filter(e=>dateKey(e.createdAt)===key&&e[kind]!==undefined).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));const latest=entriesForDay[0];return {date:key,value:latest?Number(latest[kind]):null};});
 const max=kind==='sleepHours'?24:kind==='goalCompleted'?1:Math.max(60,...points.map(p=>p.value??0));
 return <section className="clinical-card"><div className="clinical-heading"><h2>Сон и повседневные дела</h2><Period value={days} onChange={setDays}/></div><div className="clinical-metric-tabs">{Object.entries(labels).map(([id,label])=><button key={id} aria-pressed={kind===id} onClick={()=>setKind(id as typeof kind)}>{label}</button>)}</div><MeasurementPlot key={`${kind}-${days}`} points={points} max={max} label={labels[kind]} daily/></section>;
}
