import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { MessageCircle, Send } from './icons';
import { linkApi, useSession } from '../lib/Session';
import GigaChatAssistant from './GigaChatAssistant';

type Peer = { id: string; email: string; name?: string };
type Message = { id: number; senderId: string; text: string; createdAt: number };
type History = { messages: Message[]; hasMore: boolean };
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Не удалось загрузить переписку';
function merge(messages: Message[], incoming: Message[]) {
 return [...new Map([...messages, ...incoming].map(message => [message.id, message])).values()].sort((a,b) => a.id-b.id);
}

export function DoctorMessageThread({ peer, role }: { peer: Peer; role: 'doctors' | 'patients' }) {
 const { user } = useSession();
 const [messages,setMessages] = useState<Message[]>([]);
 const [draft,setDraft] = useState('');
 const [loading,setLoading] = useState(true),[sending,setSending] = useState(false),[older,setOlder] = useState(false),[hasMore,setHasMore] = useState(false),[error,setError] = useState('');
 const list = useRef<HTMLDivElement>(null), pending = useRef<{text:string;id:string}|null>(null), busy = useRef(false);
 const endpoint = `messages/${role}/${peer.id}`;
 useEffect(() => {
  let active = true, fetching = false, cursor = 0;
  const load = async () => {
   if(fetching)return; fetching=true;
   try {
    const incremental=cursor>0;
    let result = await linkApi<History>(cursor?`${endpoint}?after=${cursor}`:endpoint);
    if(!cursor)setHasMore(result.hasMore);
    let incoming=result.messages;
    if(incoming.length)cursor=incoming.at(-1)!.id;
    while(active&&result.hasMore&&incoming.length&&cursor&&incremental){
     result=await linkApi<History>(`${endpoint}?after=${cursor}`);incoming=[...incoming,...result.messages];if(result.messages.length)cursor=result.messages.at(-1)!.id;else break;
    }
    if (!active) return;
    const nearBottom = !list.current || list.current.scrollHeight-list.current.scrollTop-list.current.clientHeight<100;
    setMessages(current => merge(current,incoming));
    setError('');setLoading(false);
    if(nearBottom)requestAnimationFrame(()=>{if(list.current)list.current.scrollTop=list.current.scrollHeight;});
   } catch(reason) { if(active){setError(errorText(reason));setLoading(false);if(errorText(reason).includes('Связь с врачом'))setMessages([]);} }finally{fetching=false;}
  };
  void load();
  const poll = window.setInterval(()=>{if(!document.hidden)void load();},3000);
  window.addEventListener('focus',load);
  return () => {active=false;clearInterval(poll);window.removeEventListener('focus',load);};
 },[endpoint]);
 async function send(event: FormEvent) {
  event.preventDefault(); const text=draft.trim();if(!text||busy.current)return;
  busy.current=true;setSending(true);
  if(pending.current?.text!==text)pending.current={text,id:crypto.randomUUID()};
  try {
   const response=await linkApi<{message:Message}>(endpoint,{method:'POST',body:JSON.stringify({text,clientId:pending.current.id})});
   setMessages(current=>merge(current,[response.message]));setDraft(current=>current.trim()===text?'':current);pending.current=null;setError('');
   requestAnimationFrame(()=>{if(list.current)list.current.scrollTop=list.current.scrollHeight;});
  }catch(reason){setError(errorText(reason));}finally{busy.current=false;setSending(false);}
 }
 async function loadOlder(){
  if(!messages.length||older)return;setOlder(true);
  const previousHeight=list.current?.scrollHeight??0;
  try{const response=await linkApi<History>(`${endpoint}?before=${messages[0].id}`);setMessages(current=>merge(current,response.messages));setHasMore(response.hasMore);setError('');requestAnimationFrame(()=>{if(list.current)list.current.scrollTop+=list.current.scrollHeight-previousHeight;});}catch(reason){setError(errorText(reason));}finally{setOlder(false);}
 }
 return <section className="doctor-message-thread" aria-label={`Переписка: ${peer.name||peer.email}`}>
  <header className="doctor-message-peer"><span>{(peer.name||peer.email).split(/\s+/).map(word=>word[0]).slice(0,2).join('').toLocaleUpperCase()}</span><div><h2>{peer.name||peer.email}</h2><p>{role==='doctors'?'Подключённый специалист':'Подключённый пациент'}</p></div></header>
  <p className="doctor-message-note">Это личная переписка. Ответ может прийти позже; чат не предназначен для экстренной помощи.</p>
  <div className="doctor-messages" ref={list} tabIndex={0} role="log" aria-label="Сообщения" aria-live="polite" aria-relevant="additions">
   {hasMore&&<button className="text-button chat-older" disabled={older} onClick={()=>void loadOlder()}>{older?'Загружаем…':'Предыдущие сообщения'}</button>}
   {loading?<p className="doctor-chat-empty" role="status">Загружаем переписку…</p>:!messages.length&&!error&&<div className="doctor-chat-empty"><MessageCircle size={32}/><p>Пока нет сообщений</p><span>{role==='doctors'?'Напиши специалисту, с которым ты подключён.':'Напиши пациенту — сообщение появится в разделе «Я рядом».'}</span></div>}
   {messages.map(message=><article key={message.id} className={`doctor-chat-message ${message.senderId===user?.id?'outgoing':'incoming'}`}><p>{message.text}</p><time dateTime={new Date(message.createdAt).toISOString()}>{new Date(message.createdAt).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</time></article>)}
  </div>
  {error&&<p role="alert" className="care-error">{error}.{draft.trim()?' Неотправленный текст остаётся в поле; можно повторить отправку.':''}</p>}
  <form className="doctor-chat-composer" onSubmit={event=>void send(event)}><label className="sr-only" htmlFor={`chat-${peer.id}`}>Сообщение {role==='doctors'?'врачу':'пациенту'}</label><textarea id={`chat-${peer.id}`} rows={2} maxLength={4000} placeholder={role==='doctors'?'Написать врачу…':'Написать пациенту…'} value={draft} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void send(event);}}}/><button className="primary-button" type="submit" disabled={loading||sending||!draft.trim()} aria-label="Отправить сообщение">{sending?'…':<Send size={20}/>}</button></form>
 </section>;
}

function ConnectedDoctors() {
 const {user,showAccount}=useSession();const [peers,setPeers]=useState<Peer[]>([]),[selected,setSelected]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{
  if(!user){setLoading(false);return;}let active=true;
  const load=()=>{void linkApi<{doctors:Peer[]}>('doctors').then(response=>{if(active){setPeers(response.doctors);setSelected(current=>response.doctors.some(peer=>peer.id===current)?current:response.doctors[0]?.id??'');setLoading(false);setError('');}}).catch(reason=>{if(active){setError(errorText(reason));setLoading(false);}});};
  load();const poll=window.setInterval(load,10000);window.addEventListener('focus',load);return()=>{active=false;clearInterval(poll);window.removeEventListener('focus',load);};
 },[user]);
 if(!user)return <section className="doctor-chat-welcome"><MessageCircle size={36}/><h2>Будь на связи со своим врачом</h2><p>Войди в аккаунт и подключись к специалисту по QR-коду или коду приглашения.</p><button className="primary-button" onClick={showAccount}>Войти или зарегистрироваться</button><a href="/connect">Подключить врача</a></section>;
 if(loading)return <p role="status">Загружаем специалистов…</p>;
 const peer=peers.find(item=>item.id===selected);
 return <>{error&&<p role="alert" className="care-error">{error}</p>}{peers.length>0?<div className={`doctor-chat-layout ${peers.length===1?'single':''}`}><nav className={`doctor-chat-peers ${peers.length===1?'single':''}`} aria-label="Мои врачи">{peers.map(peer=><button key={peer.id} aria-pressed={selected===peer.id} onClick={()=>setSelected(peer.id)}><span className="chat-peer-avatar" aria-hidden="true">{(peer.name||peer.email).split(/\s+/).map(word=>word[0]).slice(0,2).join('').toLocaleUpperCase()}</span><span>{peer.name||peer.email}<small>Открыть переписку</small></span></button>)}<a href="/connect">Управлять подключением</a></nav>{peer&&<DoctorMessageThread key={peer.id} peer={peer} role="doctors"/>}</div>:!error&&<section className="doctor-chat-welcome"><MessageCircle size={36}/><h2>Подключи своего специалиста</h2><p>После подключения здесь появится ваша личная переписка.</p><a className="primary-button" href="/connect">Подключить врача</a></section>}</>;
}

export default function SupportHub({practices}:{practices:ReactNode}){
 const [view,setView]=useState<'doctors'|'practices'|'ai'>('doctors');
 return <div className="support-hub"><h1 className="sr-only">Я рядом</h1><nav className="section-tabs" aria-label="Разделы поддержки"><button aria-pressed={view==='doctors'} onClick={()=>setView('doctors')}>Мои врачи</button><button aria-pressed={view==='practices'} onClick={()=>setView('practices')}>Практики</button><button aria-pressed={view==='ai'} onClick={()=>setView('ai')}>GigaChat</button></nav>{view==='doctors'?<ConnectedDoctors/>:view==='ai'?<GigaChatAssistant/>:practices}</div>;
}
