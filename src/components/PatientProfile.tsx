import { useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, FileText, Printer, ShieldCheck } from './icons';
import { metricInfo, type Entry, type Metric, type TestResult } from '../lib/data';
import { GlassStar, Sparkline } from './Visuals';
import { useSession } from '../lib/Session';
import { useCare } from '../lib/useCare';
import { emptyCare, type CareData, type CarePlan } from '../lib/clinical';
import { HabitChart, ClinicalResults, ClinicalTimeline, DailyClinicalChart } from './ClinicalCharts';
import DoctorCare from './DoctorCare';
import {questionnairePurposes} from '../lib/questionnairePresentation';
import { EEGWave } from './NeuroplayDirect';

type Period = 7 | 30 | 'all';
const periods: { value: Period; label: string }[] = [
  { value: 7, label: '7 дней' },
  { value: 30, label: '30 дней' },
  { value: 'all', label: 'Всё время' },
];
const metrics: Metric[] = ['mood', 'anxiety', 'energy'];
type View = 'overview' | 'history' | 'tests' | 'plan' | 'events' | 'devices';
const views: { value: View; label: string }[] = [{value:'overview',label:'Обзор'},{value:'history',label:'Записи'},{value:'tests',label:'Тесты'},{value:'plan',label:'План'},{value:'events',label:'События'},{value:'devices',label:'Устройства'}];

function entryCountLabel(count: number) {
  const tail = count % 100;
  if (tail >= 11 && tail <= 14) return `${count} записей`;
  if (count % 10 === 1) return `${count} запись`;
  if (count % 10 >= 2 && count % 10 <= 4) return `${count} записи`;
  return `${count} записей`;
}

function dateTime(value: string) {
  return new Date(value).toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function PatientProfile({ name, entries, results, onBack, viewer = 'patient', careData, plan, onSavePlan }: {
  name: string;
  entries: Entry[];
  results: TestResult[];
  onBack: () => void;
  viewer?: 'patient' | 'doctor';
  careData?: CareData;
  plan?: CarePlan;
  onSavePlan?: (plan: CarePlan) => Promise<void>;
}) {
  const { store } = useSession();
  const {care: ownCare} = useCare();
  const care = careData ?? (viewer === 'patient' ? ownCare : emptyCare);
  const [period, setPeriod] = useState<Period>(30);
  const [view, setView] = useState<View>('overview');
  const cutoff = period === 'all' ? 0 : Date.now() - period * 24 * 60 * 60 * 1000;
  const filteredEntries = entries.filter(entry => Date.parse(entry.createdAt) >= cutoff).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const filteredResults = results.filter(result => Number.isFinite(Date.parse(result.createdAt)) && Date.parse(result.createdAt) >= cutoff).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const feelings = Object.entries(filteredEntries.flatMap(entry => entry.feelings).reduce<Record<string, number>>((counts, feeling) => {
    counts[feeling] = (counts[feeling] || 0) + 1;
    return counts;
  }, {})).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru')).slice(0, 6);
  const periodLabel = periods.find(item => item.value === period)?.label || '';

  return <div className="inner-page patient-page" data-view={view}>
    <div className="patient-toolbar"><button className="patient-back" onClick={onBack}><ArrowLeft size={17} />{viewer === 'doctor' ? 'К пациентам' : 'В приложение'}</button><button className="patient-print" onClick={() => window.print()}><Printer size={17} />Печать / PDF</button></div>
    <header className="patient-header"><div><span className="eyebrow">UI-PSY · ДЛЯ КОНСУЛЬТАЦИИ</span><h1>Профиль пациента</h1><p>Сводка из личных записей. Не медицинский диагноз.</p></div></header>

    <section className="patient-identity" aria-label="Информация о пациенте"><div className="patient-avatar-art" aria-hidden="true"><GlassStar value={7} hue={145} shape="petal" /></div><div><span>ИМЯ В ПРИЛОЖЕНИИ</span><h2>{name}</h2><p>Сводка от {new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</p></div><div className="patient-local"><ShieldCheck size={16} />{viewer === 'doctor' ? 'Доступ по приглашению' : store ? 'Данные аккаунта' : 'Данные этого браузера'}</div></section>

    <div className="patient-period" role="group" aria-label="Период сводки"><span>Период</span><div>{periods.map(item => <button key={item.value} aria-pressed={period === item.value} className={period === item.value ? 'active' : ''} onClick={() => setPeriod(item.value)}>{item.label}</button>)}</div></div>

    <div className="patient-tabs" role="group" aria-label="Раздел профиля">{views.map(item=><button key={item.value} aria-pressed={view===item.value} className={view===item.value?'active':''} onClick={()=>setView(item.value)}>{item.label}</button>)}</div>

    <section className="patient-overview" aria-label="Показатели за период"><div className="patient-section-title"><h2>Самочувствие</h2><span>{entryCountLabel(filteredEntries.length)} · {periodLabel}</span></div><div className="patient-metrics">{metrics.map(metric => {
      const average = filteredEntries.length ? filteredEntries.reduce((sum, entry) => sum + entry[metric], 0) / filteredEntries.length : null;
      const recent = filteredEntries.slice(0, 8).reverse().map(entry => entry[metric]);
      const line = recent;
      return <article className="patient-metric" key={metric}><div className="patient-metric-label"><i style={{ background: metricInfo[metric].color }} />{metricInfo[metric].label}</div><div className="patient-metric-body"><strong>{average === null ? '—' : average.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}<small>{average === null ? '' : ' / 10'}</small></strong><div className="patient-sparkline">{line.length ? <Sparkline values={line} color={metricInfo[metric].color} /> : <span>Нет данных</span>}</div></div><p>Среднее за период</p></article>;
    })}</div></section>

    <div className="patient-clinical clinical-dashboard"><div className="patient-panel" data-panel="plan">{viewer === 'doctor' && onSavePlan && <DoctorCare results={results} care={care} plan={plan} onSave={onSavePlan}/>}{!(viewer==='doctor' && onSavePlan)&&<section className="clinical-card"><h2>Мой план</h2><p>Назначения специалиста и отметки о приёме собраны на отдельном экране.</p><a className="secondary-button" href="/app?section=care">Открыть план<ArrowRight size={16}/></a></section>}</div><div className="patient-panel" data-panel="overview"><DailyClinicalChart entries={entries}/><details className="clinical-card"><summary>Привычки и повседневная активность</summary><HabitChart entries={entries}/></details></div><div className="patient-panel" data-panel="tests"><ClinicalResults audience={viewer} results={results}/></div><div className="patient-panel" data-panel="events"><ClinicalTimeline includeTests={viewer==='doctor'} entries={entries} results={results} care={care} prescriptions={plan?.medications}/></div><div className="patient-panel" data-panel="devices">{ ((care.eeg?.length??0)>0||care.sessions.length>0||care.health.length>0) && <section className="clinical-card"><h2>Данные устройств</h2>{care.eeg?.map(r=><details key={r.id}><summary>ЭЭГ · {new Date(r.createdAt).toLocaleString('ru-RU')} · {r.deviceName}</summary><p>{r.sampleCount} сэмплов · {r.duration.toFixed(1)} с полученного сигнала · пропущено пакетов {r.missingFrames}. Обзор каждого {r.previewStride}-го сэмпла; не медицинское заключение.</p><EEGWave samples={r.preview} channel={0} stride={r.previewStride}/></details>)}{care.sessions.map(r=><p key={r.id}>{r.mode==='concentration'?'Концентрация':'Расслабление'} · {new Date(r.createdAt).toLocaleString('ru-RU')} · {r.duration.toFixed(1)} с · средний индекс {r.average.toFixed(1)}% · удержание {r.longest.toFixed(1)} с</p>)}{care.health.map(r=><p key={r.id}>{new Date(r.createdAt).toLocaleDateString('ru-RU')} · {r.kind==='sleepHours'?'Сон, часы':'Упражнения, минуты'}: {r.value.toFixed(1)} · источник {r.source}</p>)}</section>}{!(care.eeg?.length||care.sessions.length||care.health.length)&&<section className="clinical-card"><h2>Данные устройств</h2><p>Импортированных данных пока нет.</p>{viewer==='patient'&&<a className="secondary-button" href="/app?section=devices">Подключить устройство<ArrowRight size={16}/></a>}</section>}</div></div>
    <div className="patient-highlights"><section className="patient-card"><div className="patient-section-title"><h2>Частые чувства</h2><span>По отметкам в дневнике</span></div>{feelings.length ? <div className="patient-feelings">{feelings.map(([feeling, count]) => <span key={feeling}>{feeling}<b>{count}</b></span>)}</div> : <p className="patient-empty">За этот период чувства пока не отмечены.</p>}</section><section className="patient-card"><div className="patient-section-title"><h2>Последний момент</h2><CalendarDays size={17} aria-hidden="true" /></div>{filteredEntries[0] ? <><time>{dateTime(filteredEntries[0].createdAt)}</time><p className="patient-latest-note">{filteredEntries[0].note || 'Запись без заметки'}</p><div className="patient-latest-meta">{filteredEntries[0].feelings.join(' · ') || 'Без выбранных чувств'}</div></> : <p className="patient-empty">За этот период записей пока нет.</p>}</section></div>

    <section className="patient-history"><div className="patient-section-title"><h2>Записи дневника</h2><span>{filteredEntries.length} всего</span></div>{filteredEntries.length ? <div className="patient-entry-list">{filteredEntries.map(entry => <article className="patient-entry" key={entry.id}><div className="patient-entry-date"><time dateTime={entry.createdAt}>{dateTime(entry.createdAt)}</time><span>{entry.type === 'emotion' ? 'Эмоция' : 'Настроение за день'}</span></div><div className="patient-entry-content"><h3>{entry.feelings.join(', ') || 'Без выбранных чувств'}</h3>{entry.note && <p>{entry.note}</p>}{entry.influences.length > 0 && <small>Что влияло: {entry.influences.join(', ')}</small>}</div><div className="patient-entry-metrics">{metrics.map(metric => <span key={metric}>{metricInfo[metric].label}<b>{entry[metric]}/10</b></span>)}</div></article>)}</div> : <div className="patient-empty-state"><FileText size={28} /><p>За этот период записей нет.</p><button onClick={onBack}>Открыть приложение<ArrowRight size={15} /></button></div>}</section>

    <section className="patient-tests"><div className="patient-section-title"><h2>Самопроверки</h2><span>{filteredResults.length} за период</span></div>{filteredResults.length ? <div className="patient-result-list">{filteredResults.map(result => <article key={result.id}><div><h3>{viewer==='doctor'?result.title:questionnairePurposes[result.testId||'']||result.title}</h3><p>{result.summary || 'Результат для обсуждения со специалистом'}</p></div><span>{result.score} / {result.maxScore ?? 15}</span><time dateTime={result.createdAt}>{dateTime(result.createdAt)}</time></article>)}</div> : <p className="patient-empty">За этот период результатов нет.</p>}<p className="patient-disclaimer">Результаты опросников основаны на ответах человека и не являются диагнозом.</p></section>

    <footer className="patient-footer"><ShieldCheck size={18} /><p>{viewer === 'doctor' ? 'Это данные, которыми пациент поделился через подключение к специалисту.' : store ? 'Подключённый специалист может видеть эти данные. Управлять доступом можно в настройках.' : 'Данные сохранены в этом браузере.'}</p></footer>
  </div>;
}
