import { useEffect, useState, type FormEvent } from 'react';
import { assistantApi, useSession } from '../lib/Session';

type Reply = { message: string; sources: { id: string; title: string; url: string }[]; notice: string };
export default function GigaChatAssistant() {
  const { user, showAccount } = useSession();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [draft, setDraft] = useState(''), [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false), [error, setError] = useState('');
  const [reply, setReply] = useState<Reply | null>(null);
  useEffect(() => {
    if (!user) return;
    let active = true;
    void assistantApi<{ configured: boolean }>('status').then(data => { if (active) setConfigured(data.configured); }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Не удалось проверить помощника'); });
    return () => { active = false; };
  }, [user]);
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!consent || !draft.trim() || sending) return;
    setSending(true); setError('');
    try {
      const data = await assistantApi<Reply>('chat', { method: 'POST', body: JSON.stringify({ message: draft.trim(), consent }) });
      setReply(data); setDraft('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось получить ответ'); }
    finally { setSending(false); }
  }
  if (!user) return <section className="doctor-chat-welcome"><h2>Помощник GigaChat</h2><p>Войди, чтобы подобрать поддерживающую практику.</p><button className="primary-button" onClick={showAccount}>Войти</button></section>;
  return <section className="doctor-message-thread" aria-label="Помощник GigaChat">
    <h2>Поддерживающая практика</h2>
    <p className="doctor-message-note">GigaChat помогает выбрать практику с указанным источником. Помощник не ставит диагноз, не назначает препараты и не заменяет специалиста. Этот раздел не предназначен для экстренной помощи.</p>
    {configured === false && <p role="status">GigaChat пока не настроен администратором.</p>}
    <form onSubmit={event => void send(event)}>
      <label htmlFor="giga-message">Что сейчас хочется обсудить?</label>
      <textarea id="giga-message" rows={4} maxLength={4000} value={draft} onChange={event => setDraft(event.target.value)} style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }} />
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '16px 0' }}><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />Согласен отправить это сообщение в GigaChat. Дневник и медицинская история автоматически не передаются.</label>
      <button className="primary-button" disabled={!configured || !consent || !draft.trim() || sending}>{sending ? 'Подбираем практику…' : 'Подобрать практику'}</button>
    </form>
    {error && <p role="alert" className="care-error">{error}. Текст остаётся в поле.</p>}
    {reply && <article className="doctor-chat-message" aria-live="polite"><p>{reply.message}</p><p>{reply.notice}</p><ul aria-label="Источники">{reply.sources.map(source => <li key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul></article>}
  </section>;
}
