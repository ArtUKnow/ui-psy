import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, Info, Leaf, LockKeyhole, RotateCcw, Search, Send, Wind } from './icons';
import { friendlyDate, greetingMessage, type SupportMessage, type TestResult } from '../lib/data';
import { BrandMark, GlassOrb, GlassStar } from './Visuals';
import { patientQuestionnaires } from '../lib/questionnaires';
import { EmergencySupport, useCarePlans } from './PatientCare';
import { useCare } from '../lib/useCare';
import PageHeader from './PageHeader';
import {selfScreeningTests} from '../lib/testAccess';
import {ClinicalResults} from './ClinicalCharts';
import {questionnairePurposes} from '../lib/questionnairePresentation';
import { useSession, useSyncedState } from '../lib/Session';

export { default as Home } from './HomeOverview';

export { default as Diary } from './Diary';

function supportiveReply(text: string): Pick<SupportMessage, 'text' | 'practice'> {
  const value = text.toLocaleLowerCase();
  if (/суицид|самоуб|убить себя|не хочу жить|хочу умереть|навредить себе/.test(value)) return { text: 'Спасибо за откровенность. Сейчас важнее всего твоя безопасность. Если есть риск, что ты навредишь себе, пожалуйста, обратись в местную экстренную службу или попроси человека рядом помочь тебе. По возможности не оставайся в одиночестве и убери подальше то, чем можно причинить себе вред. Этот помощник не может оказать экстренную помощь, но ты заслуживаешь живой поддержки прямо сейчас.' };
  if (/тревог|тревож|страш|паник|беспоко/.test(value)) return { text: 'Когда тревожно, не обязательно сразу разбираться со всем. Попробуй почувствовать опору под ногами и назвать пять вещей, которые видишь вокруг. Затем четыре, которых можешь коснуться. Можно сделать несколько спокойных выдохов. Что из этого сейчас кажется посильным?', practice: true };
  if (/сил|устал|энерг|выгор|отдых/.test(value)) return { text: 'Похоже, сейчас особенно нужен отдых. Усталость не требует оправданий. Попробуй спросить себя: «Что я могу не делать сегодня?» Возможно, стакан воды, еда или десять минут тишины будут достаточным маленьким шагом.', practice: true };
  if (/груст|одинок|плач|плохо|тяжел|тяжёл/.test(value)) return { text: 'Непросто быть с такими чувствами. Не нужно заставлять себя срочно становиться веселее. Можно дать грусти немного места и подумать, кому из близких можно написать: «Мне сейчас нужна поддержка». Что обычно помогает тебе чувствовать себя чуть менее одиноко?' };
  if (/понять|чувств|разобра/.test(value)) return { text: 'Давай начнём с малого. Если на минуту отложить «как нужно себя чувствовать», что останется? Заметь ощущение в теле, попробуй дать ему имя и спроси себя: «О чём это чувство хочет мне сказать?» Ответ не обязан появиться сразу.' };
  if (/спасибо|помог/.test(value)) return { text: 'Спасибо тебе за внимание к себе. Даже короткая пауза имеет значение. Можно сохранить это ощущение в дневнике или просто немного побыть с ним.' };
  if (/рад|счаст|хорош|прият/.test(value)) return { text: 'Как здорово заметить приятный момент. Побудь с ним чуть дольше: что именно делает его таким? Можно сохранить пару слов в дневнике, чтобы позже вспомнить, что тебя поддерживает.' };
  return { text: 'Спасибо за доверие. Этот помощник работает с готовыми практиками и не всегда может точно понять твою ситуацию. Можно начать с простого вопроса: какое чувство сейчас самое заметное и что могло бы сделать ближайшие десять минут немного легче? Если хочется глубже разобраться, живой разговор с психологом даст больше поддержки.' };
}

export function Assistant({ onPractice, onPractices }: { onPractice: () => void; onPractices: () => void }) {
  const { store } = useSession();
  const [messages, setMessages] = useSyncedState<SupportMessage[]>('conversation', () => [greetingMessage]);
  const {care,setCare}=useCare();
  const sensitiveMessage=messages.filter(m=>m.role==='user'&&/суицид|самоуб|убить себя|не хочу жить|хочу умереть|навредить себе/.test(m.text.toLocaleLowerCase())).at(-1);
  const [sharedSafety,setSharedSafety]=useState(false);
  const [saveError, setSaveError] = useState(false);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => () => { if (timeout.current) clearTimeout(timeout.current); }, []);
  useEffect(() => { if (messages.length > 1) chatEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [messages, thinking]);
  function send(text: string) {
    const clean = text.trim();
    if (!clean || thinking) return;
    const userId = crypto.randomUUID();
    void setMessages(current => [...current, { id: userId, role: 'user', text: clean }]).catch(() => setSaveError(true));
    setInput('');
    setThinking(true);
    timeout.current = setTimeout(() => {
      const replyId = crypto.randomUUID();
      void setMessages(current => [...current, { id: replyId, role: 'assistant', ...supportiveReply(clean) }]).catch(() => setSaveError(true));
      setThinking(false);
      inputRef.current?.focus();
    }, 850);
  }
  return <div className="inner-page assistant-page">
    <header className="inner-page-heading"><div><span className="eyebrow">ПОДДЕРЖКА</span><h1>Разговор и поддержка</h1><p>Выбери подсказку или напиши о своём состоянии.</p></div><GlassOrb className="assistant-header-orb" value={5} shape="petal" hue={165} /></header>
    <button className="section-destination" onClick={onPractices}><Wind size={20}/><span><strong>Практики для паузы</strong><small>Дыхание и лава-лампа</small></span><ArrowUpRight size={18}/></button>
    <div className="assistant-disclosure"><Info size={15} /><span>Ответы основаны на готовых сценариях. Помощник не заменяет специалиста.</span></div>
    <div className="conversation" aria-live="polite" aria-label="Разговор с помощником">{messages.map(message => <motion.div key={message.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`message ${message.role}`}>{message.role === 'assistant' && <span className="assistant-avatar"><BrandMark /></span>}<div className="message-content">{message.role === 'assistant' && <span className="message-name">UI-PSY, я рядом</span>}<p>{message.text}</p>{message.practice && <button className="message-practice" onClick={onPractice}><Wind size={16} />Попробовать дыхание<ArrowUpRight size={15} /></button>}</div></motion.div>)}{thinking && <div className="typing-indicator" role="status" aria-label="Помощник готовит ответ"><span /><span /><span /></div>}<div ref={chatEnd} /></div>
    {messages.length === 1 && <div className="conversation-prompts">{['Мне тревожно', 'Не хватает сил', 'Хочу понять себя'].map(text => <button key={text} onClick={() => send(text)}>{text}<ArrowUpRight size={14} /></button>)}</div>}
    <form className="message-composer" onSubmit={event => { event.preventDefault(); send(input); }}><textarea ref={inputRef} rows={1} maxLength={3000} aria-label="Твоё сообщение" placeholder="Что у тебя на душе?" value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(input); } }} /><button type="submit" aria-label="Отправить сообщение" disabled={!input.trim() || thinking}><Send size={19} /></button></form>
    <div className="conversation-footer"><span><LockKeyhole size={12} />{store ? 'Разговор сохраняется в твоём аккаунте' : 'Разговор не отправляется на сервер'}</span>{messages.length > 1 && <button className="text-button" onClick={() => { if (timeout.current) clearTimeout(timeout.current); void setMessages([greetingMessage]).catch(() => setSaveError(true)); setThinking(false); setInput(''); }}><RotateCcw size={12} />Очистить разговор</button>}</div>
    {sensitiveMessage && <><EmergencySupport/><p className="clinical-caption">Разговор остаётся личным. Если хочешь, можно отдельно сохранить сигнал для подключённого врача, не раскрывая текст переписки.</p><button className="secondary-button" disabled={sharedSafety||care.events.some(e=>e.id===`message-${sensitiveMessage.id}`)} onClick={()=>{void setCare(c=>({...c,events:[{id:`message-${sensitiveMessage.id}`,createdAt:new Date().toISOString(),kind:'safety',text:'Пациент попросил обсудить безопасность после разговора с помощником. Текст переписки не раскрывается.'},...c.events]})).then(()=>setSharedSafety(true)).catch(()=>setSaveError(true));}}>{sharedSafety||care.events.some(e=>e.id===`message-${sensitiveMessage.id}`)?'Сигнал сохранён для врача':'Поделиться с врачом сигналом безопасности'}</button><p className="clinical-caption">Врач увидит запись при открытии приложения. Это не экстренное уведомление.</p></>}
    {saveError && <p role="alert">Не удалось сохранить разговор. Проверь соединение.</p>}
  </div>;
}

export function Tests({results,onTest}:{results:TestResult[];onTest:(id:string)=>void}){
 const {plans,error,loading}=useCarePlans();
 const [view,setView]=useState<'self'|'assigned'|'results'>(()=>new URLSearchParams(window.location.search).get('view')==='results'?'results':'self');
 const [search,setSearch]=useState('');
 const selfIds=selfScreeningTests(results);
 const assigned=plans.flatMap(record=>record.value.assignments.map(assignment=>({assignment,doctor:record.doctor})));
 const assignedIds=new Set(assigned.map(item=>item.assignment.testId));
 const visible=patientQuestionnaires.filter(test=>(view==='assigned'?assignedIds:selfIds).has(test.id)&&`${test.title} ${questionnairePurposes[test.id]}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
 const art=(id:string)=>id==='isi'?'sleep':id==='phq9'?'rain-cloud':id==='gad7'?'anxiety-waves':'wellbeing';
 return <div className="inner-page tests-page"><PageHeader title="Тесты и шкалы" description="Самопроверка, назначения специалиста и твои результаты."/>
 <nav className="section-tabs" aria-label="Разделы тестов">{([['self','Самостоятельно'],['assigned','Назначения'],['results','Результаты']] as const).map(([id,label])=><button key={id} aria-pressed={view===id} onClick={()=>{setView(id);setSearch('');}}>{label}</button>)}</nav>
 {view==='results'?results.length?<><ClinicalResults audience="patient" results={results}/><section className="test-history"><div className="section-heading"><h2>История результатов</h2></div>{results.map(result=><div className="test-result-row" key={result.id}><span className="result-leaf"><Leaf size={20}/></span><div><h3>{questionnairePurposes[result.testId||'']||result.title}</h3><p>{result.summary||'Результат для обсуждения со специалистом'}</p></div><span>{friendlyDate(result.createdAt)}</span></div>)}</section></>:<div className="patient-empty"><h2>Пока нет результатов</h2><p>Начни с короткой самопроверки или открой назначение врача.</p><button className="secondary-button" onClick={()=>setView('self')}>Выбрать опросник</button></div>:<>
 {view==='self'&&<div className="screening-guide"><h2>Начни с короткой самопроверки</h2><p>Четыре вопроса о тревоге и настроении. По результату могут открыться уточняющие опросники. Остальные опросники назначает специалист; баллы не являются диагнозом.</p></div>}
 {view==='assigned'&&<div className="screening-guide"><h2>Назначения врача</h2><p>Здесь только опросники, которые назначил подключённый специалист. Шкалы для клинического интервью врач заполняет в своём кабинете.</p></div>}
 {error&&<p className="form-error" role="alert">{error}</p>}{loading&&view==='assigned'&&<p role="status">Загружаем назначения…</p>}
 {(view==='self'||assigned.length>0)&&<><label className="questionnaire-search"><Search size={17}/><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Найти опросник" aria-label="Найти опросник"/></label><div className="questionnaire-catalog">{visible.map(item=><button key={item.id} className="questionnaire-card" onClick={()=>onTest(item.id)}><span className="questionnaire-card-mark">{item.id==='phq4'?<GlassStar value={7} shape="petal" hue={145}/>:<img src={`/illustrations/${art(item.id)}.webp`} alt="" width="160" height="160"/>}</span><span className="questionnaire-card-text"><strong>{questionnairePurposes[item.id]}</strong><small>{item.questions.length} {item.questions.length===4?'вопроса':'вопросов'}</small>{view==='assigned'&&<small>По назначению специалиста</small>}</span><ArrowUpRight size={18}/></button>)}</div></>}
 {view==='assigned'&&!loading&&!error&&!assigned.length&&<div className="tests-no-assignment"><img src="/illustrations/my-plan.webp" alt=""/><h3>Назначений пока нет</h3><p>После подключения врач сможет назначить тебе опросники.</p><a className="secondary-button" href="/connect">Подключить врача</a></div>}
 {search&&!visible.length&&<p className="patient-empty">По этому запросу опросников нет.</p>}
 {view==='self'&&selfIds.size===1&&<p className="test-note">Дальнейшие шаги появятся после вводной диагностики. Для остальных шкал нужно назначение врача.</p>}
 </>}
 </div>;
}

