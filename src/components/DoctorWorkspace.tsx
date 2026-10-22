import { useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, ClipboardList, Pill, Plus, UserRound } from './icons';
import DoctorScreening from './DoctorScreening';
import { patientGroup, requiredForms, formScore, type Answers, type PerinatalStatus } from '../lib/doctorScreening';
import { assessmentResults, emptyMedicalHistory, loadDoctorPatients, saveDoctorPatients, type DoctorAssessment, type DoctorMedicalHistory, type DoctorPatient } from '../lib/doctorRecords';
import { doctorQuestionnaires } from '../lib/questionnaires';
import { useSession, useSyncedState } from '../lib/Session';
import { emptyCare } from '../lib/clinical';
import { ClinicalResults } from './ClinicalCharts';
import DoctorCare from './DoctorCare';
import WorkDashboard from './WorkDashboard';
import { DoctorConnections, LinkedPatientProfile } from './CareConnections';

const groupNames = { standard: 'Стандартный', older: 'Пожилой', perinatal: 'Перинатальный' };
const dateLabel = (value: string) => new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const aviandrLabels = { unknown: 'Не уточнено', never: 'Не принимал(а)', past: 'Принимал(а) ранее', current: 'Принимает сейчас' };

function MedicalHistoryFields({ value, onChange }: { value: DoctorMedicalHistory; onChange: (value: DoctorMedicalHistory) => void }) {
  const update = (field: keyof DoctorMedicalHistory, next: string) => onChange({ ...value, [field]: next, ...(field === 'aviandrUse' && next !== 'past' && next !== 'current' ? { aviandrDetails: '' } : {}) } as DoctorMedicalHistory);
  return <>
    <div className="doctor-section-heading doctor-subsection"><span className="doctor-icon"><Pill size={20} /></span><div><span>АНАМНЕЗ</span><h2>Состояние и препараты</h2></div></div>
    <div className="doctor-fields">
      <label>Основные жалобы<input value={value.chiefComplaint} onChange={event => update('chiefComplaint', event.target.value)} maxLength={300} placeholder="Со слов пациента" /></label>
      <label>Как давно появились симптомы<input value={value.symptomDuration} onChange={event => update('symptomDuration', event.target.value)} maxLength={120} placeholder="Например, несколько недель" /></label>
      <label>Принимал ли Авиандр<select value={value.aviandrUse} onChange={event => update('aviandrUse', event.target.value)}><option value="unknown">Не уточнено</option><option value="never">Нет</option><option value="past">Да, раньше</option><option value="current">Да, принимает сейчас</option></select></label>
      {(value.aviandrUse === 'past' || value.aviandrUse === 'current') && <label>Авиандр: период и назначение<input value={value.aviandrDetails} onChange={event => update('aviandrDetails', event.target.value)} maxLength={200} placeholder="Только известные данные" /></label>}
      <label>Другие принимаемые препараты<input value={value.otherMedications} onChange={event => update('otherMedications', event.target.value)} maxLength={300} placeholder="Название и сведения со слов пациента" /></label>
      <label>Нежелательные реакции или аллергии<input value={value.adverseReactions} onChange={event => update('adverseReactions', event.target.value)} maxLength={300} placeholder="Если известны" /></label>
    </div>
  </>;
}

function MedicalHistoryCard({ patient, onSave }: { patient: DoctorPatient; onSave: (next: DoctorMedicalHistory) => Promise<boolean> }) {
  const history = patient.medicalHistory ?? emptyMedicalHistory;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DoctorMedicalHistory>(history);
  return <section className="doctor-card doctor-profile doctor-history-card" aria-label="Анамнез пациента">
    {editing ? <form onSubmit={event => { event.preventDefault(); void onSave(draft).then(saved => { if (saved) setEditing(false); }); }}><MedicalHistoryFields value={draft} onChange={setDraft} /><div className="doctor-history-actions"><button className="doctor-action" type="submit">Сохранить сведения</button><button className="doctor-secondary" type="button" onClick={() => { setDraft(history); setEditing(false); }}>Отмена</button></div></form> : <>
      <div className="doctor-section-heading"><span className="doctor-icon"><Pill size={20} /></span><div><span>АНАМНЕЗ</span><h2>Состояние и препараты</h2></div></div>
      <div className="doctor-profile-grid"><div><span>Основные жалобы</span><strong>{history.chiefComplaint || 'Не указано'}</strong></div><div><span>Как давно появились симптомы</span><strong>{history.symptomDuration || 'Не указано'}</strong></div><div><span>Авиандр</span><strong>{aviandrLabels[history.aviandrUse]}</strong></div>{(history.aviandrUse === 'past' || history.aviandrUse === 'current') && <div><span>Период и назначение</span><strong>{history.aviandrDetails || 'Не указано'}</strong></div>}<div><span>Другие препараты</span><strong>{history.otherMedications || 'Не указано'}</strong></div><div><span>Нежелательные реакции или аллергии</span><strong>{history.adverseReactions || 'Не указано'}</strong></div></div>
      <button className="doctor-secondary" type="button" onClick={() => { setDraft(history); setEditing(true); }}>Изменить сведения</button>
    </>}
  </section>;
}

export default function DoctorEntry() {
  const {user,setRole}=useSession();
  const [roleError,setRoleError]=useState(''),[roleBusy,setRoleBusy]=useState(false);
  const linkedMatch = window.location.pathname.match(/^\/doctor\/linked\/([a-f0-9]{32})\/?$/);
  const [access, setAccess] = useState<'ask' | 'yes' | 'no'>(() => {
    if(user?.role==='doctor')return 'yes';
    try { return sessionStorage.getItem('ui-psy-doctor-attested') === 'yes' ? 'yes' : 'ask'; }
    catch { return 'ask'; }
  });
  const [storageWarning, setStorageWarning] = useState(false);
  if (access === 'yes'||user?.role==='doctor') return linkedMatch ? <LinkedPatientProfile id={linkedMatch[1]} /> : /^\/doctor\/?$/.test(window.location.pathname)?<WorkDashboard/>:<DoctorWorkspace />;
  return <main className="doctor-page"><div className="doctor-layout doctor-gate"><header className="doctor-topbar"><a href="/app"><ArrowLeft size={16} />UI-PSY</a><span>РАЗДЕЛ СПЕЦИАЛИСТА</span></header><section className="doctor-card doctor-gate-card"><span className="doctor-icon"><ClipboardList size={22} /></span><span className="eyebrow">ПЕРЕД ВХОДОМ</span><h1>{access === 'no' ? 'Раздел для специалистов' : 'Вы врач или психолог?'}</h1><p>{access === 'no' ? 'Карточки пациентов и профессиональные опросники предназначены для специалистов.' : 'Подтвердите свою роль, чтобы открыть карточки пациентов и полный каталог тестов. Приложение не проверяет квалификацию автоматически.'}</p>{access === 'ask' ? <div className="doctor-gate-actions"><button type="button" className="doctor-action" disabled={roleBusy} onClick={()=>{setRoleBusy(true);setRoleError('');void(async()=>{try{if(user)await setRole('doctor');try{sessionStorage.setItem('ui-psy-doctor-attested','yes');}catch{setStorageWarning(true);}setAccess('yes');}catch(e){setRoleError(e instanceof Error?e.message:'Не удалось сохранить роль');}finally{setRoleBusy(false);}})();}}>Да, я специалист<ArrowRight size={16} /></button><button type="button" className="doctor-gate-secondary" onClick={() => setAccess('no')}>Нет</button></div> : <button type="button" className="doctor-gate-secondary" onClick={() => setAccess('ask')}>Изменить ответ</button>}{roleError&&<p role="alert">{roleError}</p>}{storageWarning && <p role="status">Браузер не запомнил выбор; при следующем открытии нужно подтвердить роль снова.</p>}</section></div></main>;
}

function DoctorWorkspace() {
  const { store } = useSession();
  const [initial] = useState(() => {
    if (store) return { patients: store.get<DoctorPatient[]>('doctor-patients'), locked: false };
    try { return { patients: loadDoctorPatients(), locked: false }; }
    catch { return { patients: [] as DoctorPatient[], locked: true }; }
  });
  const [patients, setPatients] = useSyncedState<DoctorPatient[]>('doctor-patients', () => initial.patients);
  const [error, setError] = useState(initial.locked ? 'Не удалось прочитать сохранённые карточки. Данные не перезаписаны. Проверьте хранилище браузера.' : '');
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<'female' | 'male' | ''>('');
  const [perinatal, setPerinatal] = useState<PerinatalStatus>('none');
  const [medicalHistory, setMedicalHistory] = useState<DoctorMedicalHistory>(emptyMedicalHistory);
  const [search, setSearch] = useState('');
  const path = window.location.pathname.replace(/\/$/, '');
  const patientMatch = path.match(/^\/doctor\/patient\/([^/]+)(?:\/screening\/([^/]+))?$/);
  const patient = patientMatch && patients.find(item => item.id === patientMatch[1]);
  const assessment = patient && patientMatch?.[2] && patient.assessments.find(item => item.id === patientMatch[2]);

  async function persist(updater: (current: DoctorPatient[]) => DoctorPatient[]): Promise<boolean> {
    if (initial.locked) return false;
    try {
      if (store) await setPatients(updater);
      else { const next = updater(patients); saveDoctorPatients(next); await setPatients(next); }
      setError(''); return true;
    }
    catch { setError(store ? 'Не удалось сохранить карточку на сервере. Проверьте соединение и повторите.' : 'Не удалось сохранить данные в браузере. Проверьте свободное место и настройки хранения.'); return false; }
  }

  async function createPatient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numberAge = Number(age);
    if (!name.trim() || !Number.isInteger(numberAge) || numberAge < 0 || numberAge > 120 || !sex) return;
    const newPatient: DoctorPatient = { id: crypto.randomUUID(), name: name.trim(), age: numberAge, sex, perinatal: sex === 'female' ? perinatal : 'none', medicalHistory, createdAt: new Date().toISOString(), assessments: [] };
    if (await persist(current => [newPatient, ...current])) window.location.assign(`/doctor/patient/${newPatient.id}`);
  }

  async function createAssessment(current: DoctorPatient) {
    const now = new Date().toISOString();
    const next: DoctorAssessment = { id: crypto.randomUUID(), createdAt: now, updatedAt: now, answers: {} };
    if (await persist(items => items.map(item => item.id === current.id ? { ...item, assessments: [next, ...item.assessments] } : item))) window.location.assign(`/doctor/patient/${current.id}/screening/${next.id}`);
  }

  function updateAnswers(answers: Answers) {
    if (!patient || !assessment) return;
    const updatedAt = new Date().toISOString();
    void persist(items => items.map(item => item.id === patient.id ? { ...item, assessments: item.assessments.map(entry => entry.id === assessment.id ? { ...entry, answers, updatedAt } : entry) } : item));
  }

  function updateSelectedForms(selectedFormIds: string[]) {
    if (!patient || !assessment) return;
    const updatedAt = new Date().toISOString();
    void persist(items => items.map(item => item.id === patient.id ? { ...item, assessments: item.assessments.map(entry => entry.id === assessment.id ? { ...entry, selectedFormIds, updatedAt } : entry) } : item));
  }

  function updateMedicalHistory(current: DoctorPatient, next: DoctorMedicalHistory): Promise<boolean> {
    return persist(items => items.map(item => item.id === current.id ? { ...item, medicalHistory: next } : item));
  }

  if (patient && assessment) return <><DoctorScreening patient={patient} assessment={assessment} onAnswersChange={updateAnswers} onSelectedFormsChange={updateSelectedForms} />{error && <div className="doctor-save-error" role="alert">{error}</div>}</>;

  return <main className="doctor-page"><div className="doctor-layout">
    <header className="doctor-topbar"><a href="/doctor"><ArrowLeft size={16} />UI-PSY · врач</a><span>{store ? 'ДАННЫЕ АККАУНТА' : 'ДАННЫЕ ЭТОГО БРАУЗЕРА'}</span><a href="/doctor/tests"><ClipboardList size={16} />Все тесты</a></header>
    {error && <div className="doctor-save-error" role="alert">{error}</div>}
    {path === '/doctor' && <><div className="doctor-heading"><span className="eyebrow">РАБОЧЕЕ ПРОСТРАНСТВО ВРАЧА</span><h1>Пациенты</h1><p>{store ? 'Карточки и скрининги сохраняются в аккаунте.' : 'Карточки и скрининги сохраняются в этом браузере.'} Откройте пациента, чтобы продолжить прошлый скрининг или начать новый приём.</p></div><DoctorConnections /><div className="doctor-list-tools"><label>Поиск пациента<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Имя или код" /></label><a className="doctor-action" href="/doctor/new"><Plus size={16} />Новый пациент</a></div><section className="doctor-patient-list" aria-label="Список пациентов">{patients.filter(item => item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(item => <a key={item.id} href={`/doctor/patient/${item.id}`} className="doctor-card doctor-patient-row"><span className="doctor-patient-avatar"><UserRound size={22} /></span><span><strong>{item.name}</strong><small>{item.age} лет · {groupNames[patientGroup(item.age, item.sex, item.perinatal)]} · {item.assessments.length} скринингов</small></span><ArrowRight size={18} /></a>)}{patients.length === 0 && <div className="doctor-card doctor-empty"><ClipboardList size={28} /><h2>Пока нет пациентов</h2><p>Создайте карточку. Повторный скрининг останется в истории пациента.</p></div>}</section></>}
    {path === '/doctor/tests' && <><div className="doctor-heading"><span className="eyebrow">КАТАЛОГ СПЕЦИАЛИСТА</span><h1>Все тесты</h1><p>{doctorQuestionnaires.length} шкал и опросников из предоставленных материалов. Для заполнения откройте карточку пациента, начните скрининг и добавьте нужную шкалу.</p></div><section className="doctor-catalog-list" aria-label="Каталог тестов">{doctorQuestionnaires.map(form => <article key={form.id} className="doctor-card doctor-catalog-item"><span>{form.category === 'clinician' ? 'ОЦЕНКА ВРАЧА' : form.category === 'screening' ? 'СКРИНИНГ' : 'САМОЗАПОЛНЕНИЕ'} · {form.questions.length} вопросов</span><h2>{form.title}</h2><p>{form.instruction}</p></article>)}</section><a className="doctor-action" href="/doctor">К пациентам<ArrowRight size={16} /></a></>}
    {path === '/doctor/new' && <><div className="doctor-heading"><span className="eyebrow">НОВАЯ КАРТОЧКА</span><h1>Данные пациента</h1><p>Введите данные один раз. После сохранения можно начать скрининг и вернуться к нему позже.</p></div><form className="doctor-card doctor-new-form" onSubmit={createPatient}><div className="doctor-section-heading"><span className="doctor-icon"><UserRound size={20} /></span><div><span>ПАЦИЕНТ</span><h2>Карточка</h2></div></div><div className="doctor-fields"><label>Имя или код пациента<input value={name} onChange={event => setName(event.target.value)} maxLength={80} required autoComplete="off" /></label><label>Возраст<input type="number" min="0" max="120" value={age} onChange={event => setAge(event.target.value)} required /></label><label>Пол<select value={sex} onChange={event => { setSex(event.target.value as typeof sex); setPerinatal('none'); }} required><option value="">Выберите</option><option value="female">Женский</option><option value="male">Мужской</option></select></label>{sex === 'female' && <label>Перинатальный период<select value={perinatal} onChange={event => setPerinatal(event.target.value as PerinatalStatus)}><option value="none">Нет</option><option value="pregnant22">Беременность от 22 недель</option><option value="postpartum7">До 7 дней после родов</option></select></label>}</div><MedicalHistoryFields value={medicalHistory} onChange={setMedicalHistory} /><button className="doctor-action" type="submit">Создать карточку<ArrowRight size={16} /></button></form></>}
    {patient && !assessment && <><div className="doctor-heading"><span className="eyebrow">КАРТОЧКА ПАЦИЕНТА</span><h1>{patient.name}</h1><p>{store ? 'Данные пациента и история скринингов в аккаунте.' : 'Данные пациента и история скринингов в этом браузере.'}</p></div><section className="doctor-card doctor-profile"><div className="doctor-section-heading"><span className="doctor-icon"><UserRound size={20} /></span><div><span>ОБЩИЕ ДАННЫЕ</span><h2>Пациент</h2></div></div><div className="doctor-profile-grid"><div><span>Возраст</span><strong>{patient.age} лет</strong></div><div><span>Пол</span><strong>{patient.sex === 'female' ? 'Женский' : 'Мужской'}</strong></div><div><span>Группа</span><strong>{groupNames[patientGroup(patient.age, patient.sex, patient.perinatal)]}</strong></div><div><span>Карточка создана</span><strong>{dateLabel(patient.createdAt)}</strong></div></div></section><MedicalHistoryCard patient={patient} onSave={next => updateMedicalHistory(patient, next)} /><ClinicalResults results={assessmentResults(patient)}/><DoctorCare results={assessmentResults(patient)} care={emptyCare} plan={patient.clinicalPlan} linked={false} onSave={async clinicalPlan=>{if(!await persist(items=>items.map(item=>item.id===patient.id?{...item,clinicalPlan}:item)))throw new Error('Не удалось сохранить клинический план.');}}/><div className="doctor-history-head"><div><span className="eyebrow">ИСТОРИЯ</span><h2>Скрининги</h2></div><button type="button" className="doctor-action" onClick={() => createAssessment(patient)}><Plus size={16} />Новый скрининг</button></div><section className="doctor-patient-list" aria-label="История скринингов">{patient.assessments.map(entry => { const forms = [...new Set([...requiredForms(patientGroup(patient.age, patient.sex, patient.perinatal), entry.answers), ...(entry.selectedFormIds ?? [])])]; const completed = forms.filter(id => formScore(id, entry.answers) !== null).length; return <a key={entry.id} className="doctor-card doctor-patient-row" href={`/doctor/patient/${patient.id}/screening/${entry.id}`}><span className="doctor-patient-avatar"><ClipboardList size={21} /></span><span><strong>Скрининг от {dateLabel(entry.createdAt)}</strong><small>{completed} из {forms.length} шкал заполнено · обновлён {dateLabel(entry.updatedAt)}</small></span><ArrowRight size={18} /></a>; })}{patient.assessments.length === 0 && <div className="doctor-card doctor-empty"><ClipboardList size={28} /><h2>Скринингов пока нет</h2><p>Начните первый приём. Ответы будут сохраняться автоматически.</p></div>}</section></>}
    {path !== '/doctor' && path !== '/doctor/new' && path !== '/doctor/tests' && (!patient || (patientMatch?.[2] && !assessment)) && <div className="doctor-card doctor-empty"><h1>Карточка не найдена</h1><a href="/doctor" className="doctor-action">К списку пациентов</a></div>}
  </div></main>;
}
