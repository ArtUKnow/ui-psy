import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Copy, Link2, ShieldCheck, UserRoundX } from './icons';
import { QRCodeSVG } from 'qrcode.react';
import { linkApi, useSession } from '../lib/Session';
import { DoctorMessageThread } from './DoctorChat';
import PatientProfile from './PatientProfile';
import { emptyCare, emptyPlan, type CareData, type CarePlan } from '../lib/clinical';
import type { MedicationData } from './MedicationTracker';
import type { Entry, Preferences, TestResult } from '../lib/data';

type Person = { id: string; email: string; name?: string; createdAt: number; summary?: { latest: Record<string, {score:number;createdAt:string;delta:number|null}|null>; lastEntryAt:string|null; activeSignals:number; unreviewedSignals:number; overdue:number } };
type Invite = { code: string; expiresAt: number };
type Preview = { doctorEmail: string; expiresAt: number };
type Shared = { patient: { id: string; email: string }; data: { entries?: Entry[]; results?: TestResult[]; preferences?: Preferences; medications?: MedicationData; care?: CareData }; plan: {value:CarePlan;version:number;updatedAt:number}|null };
const message = (error: unknown) => error instanceof Error ? error.message : 'Не удалось выполнить запрос';
const formatCode = (code: string) => code.match(/.{1,4}/g)?.join('-') ?? code;

export function DoctorConnections({compact=false,search=''}:{compact?:boolean;search?:string}) {
  const { user } = useSession();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [patients, setPatients] = useState<Person[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState('attention');
  useEffect(() => {
    if (!user) return;
    let active = true;
    const load = () => { void linkApi<{ patients: Person[] }>('patients').then(value => { if (active) setPatients(value.patients); }).catch(reason => { if (active) setError(message(reason)); }); };
    load();
    const timer = window.setInterval(load, 15_000);
    return () => { active = false; clearInterval(timer); };
  }, [user]);
  async function createInvite() {
    setBusy(true); setError('');
    try { setInvite(await linkApi<Invite>('invites', { method: 'POST' })); }
    catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }
  async function disconnect(patient: Person) {
    if (!window.confirm(`Отключить доступ к данным «${patient.name || patient.email}»?`)) return;
    try {
      await linkApi(`patients/${patient.id}`, { method: 'DELETE' });
      setPatients(current => current.filter(item => item.id !== patient.id));
    } catch (reason) { setError(message(reason)); }
  }
  const visiblePatients=patients.filter(p=>`${p.name||''} ${p.email}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  if (!user) return <section className="doctor-card care-panel"><h2>Подключение по коду</h2><p>Войди в аккаунт, чтобы пригласить пациента по коду и видеть его записи с его согласия.</p><a className="doctor-action" href="/app">Войти в аккаунт</a></section>;
  const url = invite ? `${window.location.origin}/connect?code=${invite.code}` : '';
  return <section className={`doctor-card care-panel ${compact?'work-connected-panel':''}`} aria-label="Подключённые пациенты"><div className="care-panel-head"><span className="doctor-icon"><Link2 size={20} /></span><div><span className="eyebrow">СВЯЗЬ С ПАЦИЕНТОМ</span><h2>Подключение по коду</h2></div></div>
    <details className="work-consent-description"><summary>Как работает доступ пациента</summary><p>Пациент увидит твою почту и сам подтвердит доступ. После этого откроются его дневник, результаты и исходные ответы тестов, график приёма, анкету, события и импортированные показатели устройств. Разговор с автоматическим помощником остаётся личным; отдельный чат с пациентом доступен вам двоим.</p></details>
    <button type="button" className="doctor-action" onClick={() => void createInvite()} disabled={busy}>Создать код приглашения<ArrowRight size={16} /></button>
    {invite && <div className="care-invite"><div><span>КОД ДЛЯ ПАЦИЕНТА</span><strong>{formatCode(invite.code)}</strong><small>Действует до {new Date(invite.expiresAt * 1000).toLocaleString('ru-RU')}. Одно использование.</small><button type="button" onClick={() => void navigator.clipboard.writeText(url).catch(() => setError('Не удалось скопировать ссылку'))}><Copy size={15} />Скопировать ссылку</button>{['localhost', '127.0.0.1'].includes(window.location.hostname) && <small className="care-local-note">Этот QR ведёт на локальный адрес. Для подключения с другого телефона откройте UI-PSY на общем HTTPS-адресе.</small>}</div><div className="care-qr" aria-label="QR-код приглашения"><QRCodeSVG aria-label="QR-код приглашения пациента" value={url} size={150} marginSize={2} /></div></div>}
    {error && <p className="care-error" role="alert">{error}</p>}
    {!patients.length&&compact&&<div className="work-patients-empty"><UserRoundX size={35}/><h3>Подключённых пациентов пока нет</h3><p>Создайте приглашение и передайте пациенту QR-код или код.</p></div>}{patients.length > 0 && <>{patients.some(p=>p.summary?.activeSignals)&&<section className="risk-alert" role="alert"><div className="risk-alert-head"><AlertTriangle size={26}/><h3>Срочно: сигналы риска у пациентов</h3></div><p>Свяжитесь с пациентом и отметьте проверку в карточке.</p><ul>{patients.filter(p=>p.summary?.activeSignals).sort((a,b)=>(b.summary!.unreviewedSignals)-(a.summary!.unreviewedSignals)).map(p=><li key={p.id}><a href={`/doctor/linked/${p.id}`}><strong aria-hidden="true">!</strong><em>{p.name||p.email}</em><span>{p.summary!.unreviewedSignals?`не проверено ${p.summary!.unreviewedSignals}`:`активных ${p.summary!.activeSignals}`}</span><ArrowRight size={18}/></a></li>)}</ul></section>}<label className="clinical-sort">Порядок пациентов <select value={sort} onChange={e=>setSort(e.target.value)}><option value="attention">Сначала сигналы и сроки</option><option value="name">По имени</option></select></label><div className="clinical-table-wrap"><table className="clinical-patient-table"><caption className="sr-only">Пациенты</caption><thead><tr><th>Пациент</th><th>PHQ-9 / изменение</th><th>GAD-7 / изменение</th><th>Последняя запись</th><th>Заполнение по плану</th><th>Безопасность</th></tr></thead><tbody>{[...visiblePatients].sort((a,b)=>sort==='name'?(a.name||a.email).localeCompare(b.name||b.email,'ru'):(b.summary?.unreviewedSignals??0)-(a.summary?.unreviewedSignals??0)||(b.summary?.activeSignals??0)-(a.summary?.activeSignals??0)||(b.summary?.overdue??0)-(a.summary?.overdue??0)).map(p=><tr key={p.id} className={p.summary?.activeSignals?'row-alert':undefined}><td><a aria-label={`Открыть профиль ${p.name||p.email}`} href={`/doctor/linked/${p.id}`}>{p.name||p.email}</a><a className="work-message-link" href={`/doctor/linked/${p.id}?view=chat`}>Написать</a></td>{['phq9','gad7'].map(id=>{const v=p.summary?.latest[id];return <td key={id}>{v?<>{v.score} / {id==='phq9'?27:21}{v.delta!==null?` · ${v.delta>0?'+':''}${v.delta}`:''}<small style={{display:'block'}}>{new Date(v.createdAt).toLocaleDateString('ru-RU')}</small></>:'Нет измерения'}</td>;})}<td>{p.summary?.lastEntryAt?new Date(p.summary.lastEntryAt).toLocaleDateString('ru-RU'):'Нет записи'}</td><td>{p.summary?.overdue?`Срок прошёл: ${p.summary.overdue}`:'Нет просроченных назначений'}</td><td className={p.summary?.activeSignals?'signal-open':''}>{p.summary?.activeSignals?<><AlertTriangle size={16}/> Активных: {p.summary.activeSignals}; не проверено: {p.summary.unreviewedSignals}</>:'Нет сохранённых сигналов'}</td></tr>)}</tbody></table></div><details className="care-list"><summary>Управление подключением</summary>{visiblePatients.map(patient => <div key={patient.id} className="care-person"><div><strong>{patient.name || patient.email}</strong><small>{patient.email}</small></div><a href={`/doctor/linked/${patient.id}`}>Открыть профиль<ArrowRight size={15} /></a><a href={`/doctor/linked/${patient.id}?view=chat`}>Написать</a><button type="button" onClick={() => void disconnect(patient)} aria-label={`Отключить ${patient.name || patient.email}`}><UserRoundX size={17} /></button></div>)}</details></>}
  </section>;
}

export function ConnectDoctor() {
  const { user, showAccount } = useSession();
  const initialCode = new URLSearchParams(window.location.search).get('code') || '';
  const [code, setCode] = useState(initialCode);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [doctors, setDoctors] = useState<Person[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!user) return;
    void linkApi<{ doctors: Person[] }>('doctors').then(value => setDoctors(value.doctors)).catch(reason => setError(message(reason)));
    if (initialCode) void linkApi<Preview>(`invites/${encodeURIComponent(initialCode)}`).then(setPreview).catch(reason => setError(message(reason)));
  }, [user, initialCode]);
  async function inspect(event: FormEvent) {
    event.preventDefault(); setError(''); setPreview(null); setSuccess('');
    try { setPreview(await linkApi<Preview>(`invites/${encodeURIComponent(code.trim())}`)); }
    catch (reason) { setError(message(reason)); }
  }
  async function accept() {
    setBusy(true); setError('');
    try {
      await linkApi('accept', { method: 'POST', body: JSON.stringify({ code: code.trim() }) });
      const next = await linkApi<{ doctors: Person[] }>('doctors');
      setDoctors(next.doctors); setPreview(null); setCode(''); setSuccess('Врач подключён. Ты можешь отключить доступ в любой момент.');
      window.history.replaceState(null, '', '/connect');
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }
  async function disconnect(doctor: Person) {
    if (!window.confirm(`Закрыть для ${doctor.email} доступ к твоим данным?`)) return;
    try { await linkApi(`doctors/${doctor.id}`, { method: 'DELETE' }); setDoctors(current => current.filter(item => item.id !== doctor.id)); setSuccess('Доступ закрыт.'); }
    catch (reason) { setError(message(reason)); }
  }
  return <main className="account-page care-page"><div className="account-card care-connect"><a href="/app" className="care-back"><ArrowLeft size={17} />В приложение</a><span className="eyebrow">UI-PSY · СВЯЗЬ С ВРАЧОМ</span><h1>Подключить врача</h1><p>Только после твоего подтверждения врач увидит дневник, результаты и исходные ответы тестов, график приёма, анкету, события и импортированные показатели устройств. Разговор с автоматическим помощником остаётся личным. Сообщения, которые ты отправишь в чат врача, увидит только этот специалист. Доступ можно закрыть в любое время.</p>
    {!user ? <><p>Для связи нужен аккаунт UI-PSY.</p><button type="button" className="primary-button" onClick={showAccount}>Войти или зарегистрироваться</button></> : <>
      <form className="care-code-form" onSubmit={event => void inspect(event)}><label>Код врача<input value={code} onChange={event => { setCode(event.target.value); setPreview(null); }} placeholder="XXXX-XXXX-XXXX-XXXX" autoComplete="off" required /></label><button type="submit" className="primary-button">Проверить код</button></form>
      {preview && <div className="care-confirm"><ShieldCheck size={22} /><h2>Подтверди подключение</h2><p>Врач: <strong>{preview.doctorEmail}</strong></p><p>Личность врача в приложении не проверяется. Убедись, что это его адрес.</p><button type="button" className="primary-button" disabled={busy} onClick={() => void accept()}>{busy ? 'Подключаем…' : 'Разрешить доступ'}</button></div>}
      {doctors.length > 0 && <div className="care-list"><h2>Подключённые врачи</h2>{doctors.map(doctor => <div className="care-person" key={doctor.id}><div><strong>{doctor.email}</strong><small>Доступ с {new Date(doctor.createdAt * 1000).toLocaleDateString('ru-RU')}</small></div><button type="button" onClick={() => void disconnect(doctor)}>Отключить</button></div>)}</div>}
    </>}
    {success && <p className="care-success" role="status">{success}</p>}{error && <p className="care-error" role="alert">{error}</p>}
  </div></main>;
}

export function LinkedPatientProfile({ id }: { id: string }) {
  const [shared, setShared] = useState<Shared | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const load = () => { void linkApi<Shared>(`patients/${id}`).then(value => { if (active) { setShared(value); setError(''); } }).catch(reason => { if (active) { setShared(null); setError(message(reason)); } }); };
    load();
    const timer = window.setInterval(load, 15_000);
    window.addEventListener('focus', load);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', load); };
  }, [id]);
  if (error) return <main className="doctor-page"><div className="doctor-layout"><a href="/doctor">К пациентам</a><p role="alert">{error}</p></div></main>;
  if (!shared) return <main className="doctor-page"><div className="doctor-layout"><p>Загружаем профиль…</p></div></main>;
  if(new URLSearchParams(window.location.search).get('view')==='chat')return <main className="doctor-page"><div className="doctor-layout"><a className="section-back" href={`/doctor/linked/${id}`}>К профилю пациента</a><header className="inner-page-heading"><h1>Переписка с пациентом</h1></header><DoctorMessageThread key={id} role="patients" peer={{id,email:shared.patient.email,name:shared.data.preferences?.name}}/></div></main>;
  const medication = shared.data.medications;
  async function savePlan(value:CarePlan) {
    const response=await linkApi<{value:CarePlan;version:number;updatedAt:number}>(`patients/${id}/plan`,{method:'PUT',body:JSON.stringify({value,version:shared?.plan?.version??0})});
    setShared(current=>current?{...current,plan:response}:current);
  }
  return <main className="participant-standalone care-linked"><a className="section-destination" href={`/doctor/linked/${id}?view=chat`}>Переписка с пациентом<ArrowRight size={18}/></a><PatientProfile name={shared.data.preferences?.name || shared.patient.email} entries={shared.data.entries || []} results={shared.data.results || []} careData={shared.data.care??emptyCare} plan={shared.plan?.value??emptyPlan} onSavePlan={savePlan} onBack={() => window.location.assign('/doctor')} viewer="doctor" />{medication?.slots?.length ? <section className="clinical-card care-medication"><h2>Приём и переносимость</h2><p>Отметки пациента; отсутствие отметки не означает пропуск.</p>{medication.slots.map(slot=><div key={slot.id}><strong>{slot.name}{slot.dose?` · ${slot.dose}`:''}</strong><span>{slot.time}{slot.archived?' · завершён':''}</span><p>Принято по отметкам: {Object.entries(medication.taken).filter(([key,taken])=>key.endsWith(`:${slot.id}`)&&taken).length}; явно пропущено: {Object.entries(medication.skipped??{}).filter(([key,skip])=>key.endsWith(`:${slot.id}`)&&skip).length}.</p></div>)}</section>:null}</main>;
}
