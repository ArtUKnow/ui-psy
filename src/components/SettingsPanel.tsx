import {useState,type ReactNode} from 'react';
import {ArrowDownToLine,BookOpen,BriefcaseBusiness,ChartNoAxesColumnIncreasing,Check,ChevronRight,Heart,Info,LockKeyhole,Phone,Sparkles,Trash2} from './icons';
import type {Page,Preferences} from '../lib/data';
import {useSession} from '../lib/Session';
import Modal,{CloseButton} from './Modal';
import {RoleSettings} from './WorkShell';
import {ConceptMark} from './ContourField';

type Props={preferences:Preferences;entryCount:number;onPreferences:(value:Preferences)=>Promise<void>;onExport:()=>void;onClear:()=>void;onAbout:()=>void;onNavigate:(page:Page)=>void};
function Group({title,children}:{title:string;children:ReactNode}){return <section className="compact-settings-group"><h2>{title}</h2><div>{children}</div></section>;}
function Row({icon,children,detail,onClick,href}:{icon:ReactNode;children:ReactNode;detail?:string;onClick?:()=>void;href?:string}){
 const content=<>{icon}<span><strong>{children}</strong>{detail&&<small>{detail}</small>}</span><ChevronRight size={18}/></>;
 return href?<a className="compact-settings-row" href={href}>{content}</a>:<button className="compact-settings-row" onClick={onClick}>{content}</button>;
}
export default function SettingsPanel({preferences,entryCount,onPreferences,onExport,onClear,onAbout,onNavigate}:Props){
 const {user,store,guest,showAccount,signOut}=useSession();
 const [view,setView]=useState<'profile'|'data'|'role'|'help'|null>(null),[name,setName]=useState(preferences.name),[saved,setSaved]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function save(value:Preferences,profile=false){setBusy(true);setError('');try{await onPreferences(value);if(profile)setSaved(true);}catch{setError('Не удалось сохранить настройки. Проверь соединение и повтори.');}finally{setBusy(false);}}
 const close=()=>{setView(null);setError('');};
 return <div className="inner-page compact-settings">
 <div className="settings-top"><header className="compact-settings-heading"><h1>Настройки</h1><ConceptMark/></header>
 <button className="settings-profile-link" onClick={()=>{setName(preferences.name);setSaved(false);setView('profile');}}><span className="settings-profile-avatar">{preferences.name.charAt(0).toUpperCase()||'П'}</span><span><strong>{preferences.name||'Пользователь'}</strong><small>Личный профиль</small></span><ChevronRight size={20}/></button></div>
 <button className="settings-help-button" onClick={()=>setView('help')}><Phone size={21}/><span>Нужна помощь</span><ChevronRight size={18}/></button>
 <Group title="Подключения"><Row icon={<Heart/>} detail="Врач и назначения" onClick={()=>onNavigate('care')}>Мой план</Row><Row icon={<ChartNoAxesColumnIncreasing/>} detail="Нейроинтерфейс и Apple Health" onClick={()=>onNavigate('devices')}>Устройства</Row><Row icon={<BookOpen/>} href="/participant">Сводка для консультации</Row></Group>
 <Group title="Приложение"><div className="compact-settings-row"><Sparkles/><span><strong>Мягкие анимации</strong></span><button className={`toggle-switch ${preferences.motion?'on':''}`} role="switch" aria-label="Мягкие анимации" aria-checked={preferences.motion} disabled={busy} onClick={()=>void save({...preferences,motion:!preferences.motion})}><span/></button></div></Group>
 <Group title="Данные"><Row icon={<ArrowDownToLine/>} onClick={onExport}>Скачать историю</Row><Row icon={<Trash2/>} onClick={()=>setView('data')}>Управление данными</Row></Group>
 <Group title="Для специалистов"><Row icon={<BriefcaseBusiness/>} href={user?.role==='doctor'?'/doctor':undefined} onClick={()=>setView('role')}>{user?.role==='doctor'?'Открыть раздел «Работа»':'Включить раздел «Работа»'}</Row></Group>
 <Group title="О приложении"><Row icon={<Info/>} onClick={onAbout}>О приложении</Row></Group>
 {error&&!view&&<p className="form-error" role="alert">{error}</p>}
 {view&&<Modal label={view==='profile'?'Личный профиль':view==='data'?'Управление данными':view==='help'?'Нужна помощь':'Для специалистов'} className="settings-detail-panel" onClose={close}><CloseButton onClick={close}/>
 {view==='profile'&&<><h2>Личный профиль</h2><form className="profile-form" onSubmit={e=>{e.preventDefault();if(name.trim())void save({...preferences,name:name.trim().slice(0,30)},true);}}><label htmlFor="profile-name">Как к тебе обращаться?</label><input id="profile-name" value={name} maxLength={30} required onChange={e=>{setName(e.target.value);setSaved(false);}}/><button className="primary-button" type="submit" disabled={busy||!name.trim()}>{saved?<><Check size={18}/>Сохранено</>:busy?'Сохраняем…':'Сохранить'}</button></form><section className="settings-account-detail"><h3>{guest?'Аккаунт и синхронизация':'Аккаунт'}</h3><p>{guest?'Данные сохраняются в этом браузере. Войди в аккаунт для синхронизации.':user?.email}</p><a href="/connect">Доступ врачу<ChevronRight size={17}/></a><button className="secondary-button" onClick={()=>{close();if(guest)showAccount();else void signOut();}}>{guest?'Войти или зарегистрироваться':'Выйти'}</button></section></>}
 {view==='data'&&<><h2>Управление данными</h2><div className="settings-data-note"><LockKeyhole size={22}/><p>{store?'Записи сохраняются в аккаунте. Подключённому врачу доступны только данные, которыми ты делишься. Доступ можно закрыть.':'В гостевом режиме данные остаются в этом браузере. При очистке браузера они исчезнут. Историю можно скачать.'}</p></div><button className="secondary-button" onClick={onExport}><ArrowDownToLine size={18}/>Скачать историю</button><a className="settings-data-access" href="/connect">Управлять доступом врача<ChevronRight size={18}/></a><div className="settings-delete-detail"><h3>Удаление данных</h3><p>Записей в дневнике: {entryCount}. Также удалятся результаты и график приёма.</p><button className="secondary-button" onClick={()=>{close();onClear();}}><Trash2 size={18}/>Удалить записи и результаты</button></div></>}
 {view==='help'&&<div className="psychological-help-dialog"><span className="help-phone-icon"><Phone size={28}/></span><h2>Нужна поддержка?</h2><p>Хочешь позвонить в службу психологической помощи и поговорить со специалистом?</p><div className="help-service"><strong>Психологическая помощь МЧС России</strong><span>Россия · +7 (495) 989-50-50</span></div><a className="help-call-button" href="tel:+74959895050"><Phone size={20}/>Позвонить</a><button className="secondary-button" onClick={close}>Не сейчас</button><a className="help-service-source" href="https://psi.mchs.gov.ru/" target="_blank" rel="noreferrer">Сайт службы психологической помощи</a></div>}
 {view==='role'&&<><h2>Для специалистов</h2><RoleSettings/></>}
 {error&&<p className="form-error" role="alert">{error}</p>}
 </Modal>}
 </div>;
}
