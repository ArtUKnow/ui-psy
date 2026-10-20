import { Suspense, lazy, useEffect, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { ArrowRight, ArrowUpRight, CalendarDays, ChartNoAxesColumnIncreasing, BriefcaseBusiness, Check, ChevronRight, Heart, Home as HomeIcon, Info, LockKeyhole, NotebookText, Settings as SettingsIcon, ShieldCheck, Trash2, X } from './components/icons';
import { Diary, Home, Tests } from './components/Pages';
import SettingsPanel from './components/SettingsPanel';
import { ConceptMark } from './components/ContourField';
import CheckIn from './components/CheckIn';
import Breathing from './components/Breathing';
import Reflection from './components/Reflection';
import Questionnaire from './components/Questionnaire';
import { patientQuestionnaires } from './lib/questionnaires';
import { PatientSection, useCarePlans } from './components/PatientCare';
import { ConnectDoctor } from './components/CareConnections';
import Modal, { CloseButton } from './components/Modal';
import TrendChart from './components/TrendChart';
import { useMobileViewport } from './lib/useMobileViewport';
import { useCare } from './lib/useCare';
import {canStartPatientTest} from './lib/testAccess';
import { emptyCare, loadCare } from './lib/clinical';
import { loadMedicationData, medicationStorageKey } from './components/MedicationTracker';
import { useSession, useSyncedState } from './lib/Session';

// Separate routes and the chat tab load on demand; modals stay in the main bundle for exit animations.
const WorkShell = lazy(() => import('./components/WorkShell'));
const DoctorWorkspace = lazy(() => import('./components/DoctorWorkspace'));
const PatientProfile = lazy(() => import('./components/PatientProfile'));
const LavaLamp = lazy(() => import('./components/LavaLamp'));
const NeuroplayPage = lazy(() => import('./components/NeuroplayPage'));
const SupportHub = lazy(() => import('./components/DoctorChat'));
import { greetingMessage, loadEntries, loadPreferences, loadResults, metricInfo, type Entry, type Metric, type Page, type Preferences, type TestResult } from './lib/data';

const navigation = [
  { id: 'home' as Page, label: 'Главная', mobile: 'Главная', icon: HomeIcon },
  { id: 'diary' as Page, label: 'Дневник', mobile: 'Дневник', icon: NotebookText },
  { id: 'assistant' as Page, label: 'Я рядом', mobile: 'Я рядом', icon: Heart },
  { id: 'tests' as Page, label: 'Тесты', mobile: 'Тесты', icon: ChartNoAxesColumnIncreasing },
  { id: 'settings' as Page, label: 'Настройки', mobile: 'Настройки', icon: SettingsIcon },
];

export default function App() {
  useMobileViewport();
  const { store, user } = useSession();
  const { setCare } = useCare();
  const {plans,loading:plansLoading,error:plansError}=useCarePlans();
  const validPages: Page[] = ['home','diary','assistant','tests','settings','statistics','care','events','devices','practices'];
  const pageFromUrl = () => { const params=new URLSearchParams(window.location.search);const section=params.get('section') as Page;if(section==='diary'&&params.get('view')==='dynamics')return 'statistics';if(section==='diary'&&params.get('view')==='events')return 'events'; return validPages.includes(section)?section:'home'; };
  const [page, setPage] = useState<Page>(pageFromUrl);
  useEffect(()=>{const onBack=()=>{setPage(pageFromUrl());window.scrollTo({top:0,behavior:'instant'});};window.addEventListener('popstate',onBack);return()=>window.removeEventListener('popstate',onBack);},[]);
  const doctorMode=user?.role==='doctor';
  const navigationItems=doctorMode?[...navigation.slice(0,-1),{id:'work' as Page,label:'Работа',mobile:'Работа',icon:BriefcaseBusiness},navigation.at(-1)!]:navigation;
  const activePage = page==='statistics'||page==='events'?'diary':page==='practices'?'assistant':page==='care'||page==='devices'?'settings':page;
  const [entries, setEntries] = useSyncedState<Entry[]>('entries', loadEntries);
  const [preferences, setPreferences] = useSyncedState<Preferences>('preferences', loadPreferences);
  const [results, setResults] = useSyncedState<TestResult[]>('results', loadResults);
  const [checkIn, setCheckIn] = useState(false);
  const [breathing, setBreathing] = useState(false);
  const [test, setTest] = useState<string | null>(()=>{const id=new URLSearchParams(window.location.search).get('test');return patientQuestionnaires.some(t=>t.id===id)?id:null;});
  const [metric, setMetric] = useState<Metric | null>(null);
  const [about, setAbout] = useState(false);
  const [confirmation, setConfirmation] = useState<{ type: 'entry' | 'all'; id?: string } | null>(null);
  const [toast, setToast] = useState('');
  useEffect(() => {
    if (store) return;
    try { localStorage.setItem('tishe-entries', JSON.stringify(entries)); }
    catch { setToast('Не удалось сохранить записи в браузере. Скачай историю в настройках.'); }
  }, [entries, store]);
  useEffect(() => {
    if (!store) {
      try { localStorage.setItem('tishe-preferences', JSON.stringify(preferences)); }
      catch { setToast('Настройки будут действовать только в этой сессии.'); }
    }
    document.documentElement.dataset.motion = preferences.motion ? 'on' : 'off';
  }, [preferences, store]);
  useEffect(() => {
    if (store) return;
    try { localStorage.setItem('tishe-results', JSON.stringify(results)); }
    catch { setToast('Результат не удалось сохранить. Скачай историю в настройках.'); }
  }, [results, store]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  function navigate(next: Page) {
    if(next==='work'){window.location.assign('/doctor');return;}
    const url=new URL(window.location.href); url.searchParams.delete('test'); url.searchParams.delete('view');
    if(next==='home')url.searchParams.delete('section');else if(next==='statistics'||next==='events'){url.searchParams.set('section','diary');url.searchParams.set('view',next==='statistics'?'dynamics':'events');}else url.searchParams.set('section',next);
    window.history.pushState({},'',url);
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function exportData() {
    const blob = new Blob([JSON.stringify({ app: 'UI-PSY', version: 2, exportedAt: new Date().toISOString(), entries, reflections: results, medications: store ? store.get('medications') : loadMedicationData(), care: store ? store.get('care') : loadCare(), ...(store ? { conversation: store.get('conversation') } : {}) }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ui-psy-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast('Файл с историей подготовлен.');
  }
  async function deleteConfirmed() {
    try {
      if (confirmation?.type === 'all') {
        await Promise.all([setEntries([]), setResults([]), setCare(emptyCare), store ? store.update('medications', { slots: [], taken: {} }) : Promise.resolve(localStorage.removeItem(medicationStorageKey)), ...(store ? [store.update('conversation', [greetingMessage])] : [])]);
        setToast('Записи, результаты и график приёма удалены.');
      } else {
        await setEntries(current => current.filter(entry => entry.id !== confirmation?.id));
        setToast('Запись удалена.');
      }
    } catch { setToast('Не удалось удалить данные. Попробуй ещё раз.'); }
    setConfirmation(null);
  }

  const date = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  const weekday = new Date().toLocaleDateString('ru-RU', { weekday: 'long' });

  if (/^\/participant\/?$/.test(window.location.pathname)) return <main className="participant-standalone"><PatientProfile name={preferences.name} entries={entries} results={results} onBack={() => window.location.assign('/app')} /></main>;
  if (/^\/lava\/?$/.test(window.location.pathname)) return <LavaLamp onBack={() => window.location.assign('/app')} />;
  if (/^\/neuroplay\/?$/.test(window.location.pathname)) return <NeuroplayPage onBack={() => window.location.assign('/app?section=devices')} />;
  if (/^\/connect\/?$/.test(window.location.pathname)) return <ConnectDoctor />;
  if (/^\/doctor(?:\/|$)/.test(window.location.pathname)) return <WorkShell><DoctorWorkspace /></WorkShell>;

  return <MotionConfig reducedMotion={preferences.motion ? 'user' : 'always'} transition={{ duration: preferences.motion ? .3 : 0 }}>
    <div className="app-shell" data-section={page}>
      <aside className="sidebar">
        <button className="brand" aria-label="UI-PSY, на главную" onClick={() => navigate('home')}><ConceptMark /><span>UI<span className="brand-dash">-</span>PSY</span></button>
        <span className="brand-tagline">ближе к себе</span>
        <nav className="desktop-nav" aria-label="Главная навигация">{navigationItems.map(item => <button key={item.id} onClick={() => navigate(item.id)} className={activePage === item.id ? 'active' : ''} aria-current={activePage === item.id ? 'page' : undefined}><item.icon size={19} strokeWidth={1.7} /><span>{item.label}</span>{activePage === item.id && <ChevronRight size={15} className="nav-chevron" />}</button>)}</nav>
        <div className="sidebar-bottom"><button className="sidebar-privacy" onClick={() => setAbout(true)}><ShieldCheck size={16} /><span>О приложении</span><ArrowUpRight size={13} /></button></div>
      </aside>
      <main className="app-main" id="main-content">
        <div className="app-topbar"><button className="mobile-brand brand" aria-label="UI-PSY, на главную" onClick={() => navigate('home')}><ConceptMark /><span>UI<span className="brand-dash">-</span>PSY</span></button><span className="topbar-label">ДНЕВНИК САМОЧУВСТВИЯ</span><div className="topbar-right"><span className="topbar-date"><CalendarDays size={14} /><span className="weekday">{weekday}, </span>{date}</span><button className="profile-avatar" aria-label="Открыть настройки" onClick={() => navigate('settings')}>{preferences.name.charAt(0).toLocaleUpperCase()}</button></div></div>
        <AnimatePresence mode="wait" initial={false}><motion.div key={page} className="page-content" initial={{ opacity: 0, y: preferences.motion ? 10 : 0 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: preferences.motion ? -5 : 0 }} transition={{ duration: preferences.motion ? .23 : 0 }}>
          {page === 'home' && <Home name={preferences.name} entries={entries} results={results} onRecord={() => setCheckIn(true)} onNavigate={navigate} onMetric={setMetric} />}
          {['diary','statistics','events'].includes(page)&&<Diary view={page} onNavigate={navigate} entries={entries} onRecord={()=>setCheckIn(true)} onDelete={id=>setConfirmation({type:'entry',id})}>{page!=='diary'&&<PatientSection embedded section={page} entries={entries} results={results} onTest={setTest} onNavigate={navigate} onPractice={()=>setBreathing(true)} onLava={()=>window.location.assign('/lava')}/>}</Diary>}
          {page === 'assistant' && <Suspense fallback={null}><SupportHub practices={<PatientSection embedded section="practices" entries={entries} results={results} onTest={setTest} onNavigate={navigate} onPractice={()=>setBreathing(true)} onLava={()=>window.location.assign('/lava')}/>} /></Suspense>}
          {page === 'tests' && <Tests results={results} onTest={setTest} />}
          {['care','devices','practices'].includes(page)&&<PatientSection key={page} section={page} entries={entries} results={results} onTest={setTest} onNavigate={navigate} onPractice={()=>setBreathing(true)} onLava={()=>window.location.assign('/lava')}/>}
          {page === 'settings' && <SettingsPanel preferences={preferences} entryCount={entries.length} onPreferences={setPreferences} onExport={exportData} onClear={() => setConfirmation({ type: 'all' })} onAbout={() => setAbout(true)} onNavigate={navigate}/> }
        </motion.div></AnimatePresence>
      </main>
      <nav className="mobile-nav" aria-label="Навигация приложения">{navigationItems.map(item => <button key={item.id} onClick={() => navigate(item.id)} className={activePage === item.id ? 'active' : ''} aria-current={activePage === item.id ? 'page' : undefined}>{activePage === item.id && <motion.span className="mobile-active-glow" layoutId="mobile-active" />}<item.icon size={23} strokeWidth={1.7} /><span>{item.mobile}</span></button>)}</nav>
    </div>
    <AnimatePresence>
      {checkIn && <CheckIn key="checkin" onClose={() => setCheckIn(false)} onSave={entry => setEntries(current => [entry, ...current])} onDiary={() => { setCheckIn(false); navigate('diary'); }} />}
      {breathing && <Breathing key="breathing" onClose={() => setBreathing(false)} />}
      {test && (!canStartPatientTest(test,results,plans)?<Modal label="Доступ к опроснику" className="test-access-panel" onClose={()=>setTest(null)}><CloseButton onClick={()=>setTest(null)}/><h2>{plansLoading?'Проверяем назначения…':'Опросник по назначению'}</h2><p>{plansError||(['phq9','gad7'].includes(test)?'Без назначения он доступен после соответствующего результата вводной диагностики.':'Специалист выбирает подходящий опросник и назначает его тебе.')}</p><button className="primary-button" onClick={()=>{setTest(null);navigate('tests');}}>К тестам</button><a className="secondary-button" href="/connect">Подключить врача</a></Modal>:patientQuestionnaires.find(item => item.id === test)
        ? <Questionnaire key={test} history={results} test={patientQuestionnaires.find(item => item.id === test)!} onClose={() => setTest(null)} onSave={result => setResults(current => [result, ...current])} />
        : <Reflection key={test} testId={test} onClose={() => setTest(null)} onSave={result => setResults(current => [result, ...current])} />)}
      {metric && <Modal key="metric" onClose={() => setMetric(null)} label={metricInfo[metric].label} className="metric-modal"><div className="modal-topbar"><span className="eyebrow">ВНИМАНИЕ К СЕБЕ</span><CloseButton onClick={() => setMetric(null)} /></div><i className="metric-modal-dot" style={{ background: metricInfo[metric].color, boxShadow: `0 0 36px ${metricInfo[metric].color}55` }} /><h2>{metricInfo[metric].label}</h2><p className="modal-description">{metricInfo[metric].description}</p><TrendChart entries={entries} onlyMetric={metric} /><button className="primary-button" onClick={() => { setMetric(null); setCheckIn(true); }}>Отметить состояние<ArrowRight size={18} /></button></Modal>}
      {about && <Modal key="about" onClose={() => setAbout(false)} label="О приложении UI-PSY" className="about-modal"><div className="modal-topbar"><span className="eyebrow">О ПРИЛОЖЕНИИ</span><CloseButton onClick={() => setAbout(false)} /></div><div className="brand about-brand"><ConceptMark /><span>UI<span className="brand-dash">-</span>PSY</span></div><h2>Замечать своё состояние.</h2><p>UI-PSY помогает записывать состояние, проходить опросники и делать короткие практики.</p><div className="about-point"><LockKeyhole size={20} /><p><strong>{store ? 'В твоём аккаунте' : 'Только на твоём устройстве'}</strong>{store ? 'Записи, результаты и разговор хранятся в аккаунте. При подключении врача он видит дневник, тесты и график приёма. Доступ можно отключить в настройках.' : 'Записи и результаты хранятся в этом браузере. Их можно скачать или удалить в настройках.'}</p></div><div className="about-point"><Heart size={20} /><p><strong>Забота, а не медицинская помощь</strong>Приложение не ставит диагнозы и не заменяет психолога. Если состояние долго мешает повседневной жизни, обратись к специалисту.</p></div><p className="emergency-note">Если есть непосредственная опасность для тебя или другого человека, обратись в местную экстренную службу.</p><button className="primary-button" onClick={() => setAbout(false)}>Закрыть<Check size={17} /></button></Modal>}
      {confirmation && <Modal key="confirm" onClose={() => setConfirmation(null)} label="Подтверждение удаления" className="confirm-modal"><CloseButton onClick={() => setConfirmation(null)} /><span className="confirm-icon"><Trash2 size={25} /></span><h2>{confirmation.type === 'all' ? 'Удалить записи и результаты?' : 'Удалить запись?'}</h2><p>{confirmation.type === 'all' ? <>{store ? 'Записи дневника, результаты, разговор и график приёма будут удалены из аккаунта на всех устройствах. Восстановить их не получится.' : 'Записи дневника, результаты и график приёма будут удалены из этого браузера. Восстановить их не получится.'} Можно сначала скачать историю в настройках.</> : 'Эта запись будет удалена из дневника. Восстановить её не получится.'}</p><button className="danger-button" onClick={deleteConfirmed}>{confirmation.type === 'all' ? 'Удалить записи и результаты' : 'Удалить запись'}</button><button className="secondary-button" onClick={() => setConfirmation(null)}>Отмена</button></Modal>}
    </AnimatePresence>
    <div className="toast-container" aria-live="polite"><AnimatePresence>{toast && <motion.div key={toast} className="toast" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}><Info size={17} /><span>{toast}</span><button onClick={() => setToast('')} aria-label="Скрыть сообщение"><X size={15} /></button></motion.div>}</AnimatePresence></div>
  </MotionConfig>;
}
