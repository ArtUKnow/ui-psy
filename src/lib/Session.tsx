import { createContext, useCallback, useContext, useEffect, useState, type ReactNode, type SetStateAction } from 'react';
import { greetingMessage, loadEntries, loadPreferences, loadResults, readStored, type Preferences } from './data';
import { emptyCare, loadCare } from './clinical';
import { loadDoctorPatients } from './doctorRecords';
import { ConceptMark } from '../components/ContourField';
import { GlassStar } from '../components/Visuals';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from '../components/icons';
import { listPatch } from './listPatch';

export type DataKey = 'entries' | 'preferences' | 'results' | 'medications' | 'doctor-patients' | 'conversation' | 'care';
export type User = { id: string; email: string; role: 'patient'|'doctor' };
type Document<T> = { value: T; version: number };
type Action<T> = (current: T) => T;
type Pending<T> = { action: Action<T>; resolve: () => void; reject: (reason: Error) => void };
type State<T> = Document<T> & { committed: T; pending: Pending<T>[]; running: boolean; listeners: Set<() => void> };
const keys: DataKey[] = ['entries', 'preferences', 'results', 'medications', 'doctor-patients', 'conversation', 'care'];
// List documents accept incremental PATCH saves on the server.
const listKeys = new Set<DataKey>(['entries', 'results', 'doctor-patients', 'conversation']);
const defaults: Record<DataKey, unknown> = {
  care: emptyCare, entries: [], preferences: { name: 'Пользователь', motion: true }, results: [],
  medications: { slots: [], taken: {} }, 'doctor-patients': [], conversation: [greetingMessage],
};
let accessToken: string | null = null;
let accessIssuedAt = 0;
// Server access tokens live 15 minutes; renew a little earlier so requests never hit an expired one.
const ACCESS_RENEW_MS = 12 * 60 * 1000;
// Every tab rotates the same refresh cookie, so a fresh access token is shared with the other tabs instead of each one rotating again.
type SessionGrant = { user: User; accessToken: string };
const sessionChannel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('ui-psy-session');
let sharedGrant: (SessionGrant & { at: number }) | null = null;
sessionChannel?.addEventListener('message', event => {
  if (event.data?.type !== 'grant') return;
  sharedGrant = event.data.grant; accessToken = sharedGrant!.accessToken; accessIssuedAt = sharedGrant!.at;
});
function adopt(grant: SessionGrant) {
  accessToken = grant.accessToken; accessIssuedAt = Date.now();
  sessionChannel?.postMessage({ type: 'grant', grant: { ...grant, at: accessIssuedAt } });
}
let refreshing: Promise<{ user: User; accessToken: string }> | null = null;
let bootstrapping: Promise<RemoteStore> | null = null;

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new ApiError(response.status, body.error || 'Ошибка сервера');
  return body as T;
}

async function refresh(): Promise<{ user: User; accessToken: string }> {
  // Tabs take turns; a tab that waited behind another one reuses the grant it broadcast instead of rotating again.
  const startedAt = Date.now();
  const exchange = (): Promise<SessionGrant> => sharedGrant && sharedGrant.at >= startedAt
    ? Promise.resolve(sharedGrant)
    : fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' }).then(response => parseResponse<SessionGrant>(response)).then(grant => { adopt(grant); return grant; });
  if (!refreshing) refreshing = (navigator.locks ? navigator.locks.request('ui-psy-refresh', exchange).then(pending => pending) : exchange())
    .finally(() => { refreshing = null; });
  return refreshing;
}

async function api<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const sentWith = accessToken;
  const response = await fetch(`/api${path}`, {
    ...options, credentials: 'include',
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...options.headers },
  });
  if (response.status === 401 && retry && !path.startsWith('/auth/')) {
    if (!accessToken || accessToken === sentWith) await refresh();
    return api(path, options, false);
  }
  return parseResponse<T>(response);
}

export function linkApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  return api<T>(`/links/${path}`, options);
}

export function assistantApi<T>(path: 'status' | 'chat', options: RequestInit = {}): Promise<T> {
  return api<T>(`/ai/${path}`, options);
}

async function credentials(path: 'login' | 'register', email: string, password: string, role: User['role']='patient') {
  const session = await api<{ user: User; accessToken: string }>(`/auth/${path}`, { method: 'POST', body: JSON.stringify({ email, password, role }) });
  adopt(session);
  return session.user;
}

function legacyValue(key: DataKey): unknown {
  if (key === 'care') return loadCare();
  if (key === 'entries') return loadEntries();
  if (key === 'preferences') return loadPreferences();
  if (key === 'results') return loadResults();
  if (key === 'medications') return readStored('ui-psy-medication-tracker', defaults.medications);
  if (key === 'conversation') return [greetingMessage];
  return loadDoctorPatients();
}

function hasLegacyData(key: DataKey, value: unknown): boolean {
  if (key === 'care') return !!value && typeof value === 'object' && (Boolean((value as typeof emptyCare).intake) || ['events','sessions','health'].some(k => ((value as Record<string, unknown[]>)[k] ?? []).length > 0));
  if (Array.isArray(value)) return value.length > 0;
  if (key === 'preferences') return !!value && typeof value === 'object' && ((value as Preferences).name !== 'Пользователь' || (value as Preferences).motion !== true);
  if (key === 'medications') return !!value && typeof value === 'object' && Array.isArray((value as { slots?: unknown[] }).slots) && (value as { slots: unknown[] }).slots.length > 0;
  return false;
}

export class RemoteStore {
  private states = new Map<DataKey, State<unknown>>();
  private errorListeners = new Set<(message: string) => void>();
  startupWarning = '';

  constructor(values: Record<DataKey, Document<unknown>>) {
    for (const key of keys) {
      const { value, version } = values[key];
      this.states.set(key, { value, committed: value, version, pending: [], running: false, listeners: new Set() });
    }
  }

  get<T>(key: DataKey): T { return this.states.get(key)!.value as T; }
  subscribe(key: DataKey, listener: () => void) { const state = this.states.get(key)!; state.listeners.add(listener); return () => { state.listeners.delete(listener); }; }
  onError(listener: (message: string) => void) { this.errorListeners.add(listener); return () => { this.errorListeners.delete(listener); }; }
  private notify(key: DataKey) { for (const listener of this.states.get(key)!.listeners) listener(); }

  update<T>(key: DataKey, action: SetStateAction<T>): Promise<void> {
    const state = this.states.get(key)!;
    const apply: Action<unknown> = typeof action === 'function' ? action as Action<unknown> : () => action;
    let next: unknown;
    try { next = apply(state.value); } catch (error) { return Promise.reject(error); }
    state.value = next;
    this.notify(key);
    return new Promise((resolve, reject) => {
      state.pending.push({ action: apply, resolve, reject });
      void this.flush(key);
    });
  }

  private async flush(key: DataKey) {
    const state = this.states.get(key)!;
    if (state.running) return;
    state.running = true;
    while (state.pending.length) {
      const pending = state.pending[0];
      try {
        let saved: Document<unknown> | null = null;
        for (let attempt = 0; attempt < 5; attempt++) {
          const value = pending.action(state.committed);
          const patch = listKeys.has(key) ? listPatch(state.committed, value) : null;
          try {
            if (patch) saved = { value, version: (await api<{ version: number }>(`/data/${key}`, { method: 'PATCH', body: JSON.stringify({ ...patch, version: state.version }) })).version };
            else saved = await api<Document<unknown>>(`/data/${key}`, { method: 'PUT', body: JSON.stringify({ value, version: state.version }) });
            break;
          } catch (error) {
            if (!(error instanceof ApiError) || error.status !== 409) throw error;
            const current = await api<Document<unknown>>(`/data/${key}`);
            state.committed = current.value ?? defaults[key];
            state.version = current.version;
          }
        }
        if (!saved) throw new Error('Не удалось согласовать изменения с сервером');
        state.committed = saved.value;
        state.version = saved.version;
        state.pending.shift();
        pending.resolve();
      } catch (error) {
        state.pending.shift();
        const failure = error instanceof Error ? error : new Error('Ошибка синхронизации');
        pending.reject(failure);
        for (const listener of this.errorListeners) listener(`Не удалось сохранить ${key}: ${failure.message}`);
      }
      state.value = state.pending.reduce((value, item) => item.action(value), state.committed);
      this.notify(key);
    }
    state.running = false;
  }

  async poll() {
    for (const key of keys) {
      const state = this.states.get(key)!;
      if (state.pending.length || state.running) continue;
      try {
        const remote = await api<Document<unknown>>(`/data/${key}`);
        if (remote.version > state.version) {
          state.version = remote.version;
          state.committed = remote.value ?? defaults[key];
          state.value = state.committed;
          this.notify(key);
        }
      } catch (error) {
        const failure = error instanceof Error ? error : new Error('Ошибка соединения');
        for (const listener of this.errorListeners) listener(`Не удалось обновить данные: ${failure.message}`);
        return;
      }
    }
  }
}

async function bootstrap(user: User): Promise<RemoteStore> {
  const values = {} as Record<DataKey, Document<unknown>>;
  const migrationOwner = localStorage.getItem('ui-psy-migration-owner');
  let warning = '';
  for (const key of keys) {
    let remote = await api<Document<unknown>>(`/data/${key}`);
    if (!migrationOwner) {
      let previous: unknown;
      try { previous = legacyValue(key); }
      catch { warning = 'Часть локальных данных повреждена и не перенесена. Она не перезаписана.'; values[key] = { value: remote.value ?? defaults[key], version: remote.version }; continue; }
      if (hasLegacyData(key, previous)) {
        let merged = false;
        for (let attempt = 0; attempt < 5; attempt++) {
          const value = mergeLegacy(key, remote.value, previous);
          try {
            remote = await api<Document<unknown>>(`/data/${key}`, { method: 'PUT', body: JSON.stringify({ value, version: remote.version }) });
            merged = true;
            break;
          } catch (error) {
            if (!(error instanceof ApiError) || error.status !== 409) throw error;
            remote = await api<Document<unknown>>(`/data/${key}`);
          }
        }
        if (!merged) throw new Error('Не удалось перенести локальные данные: сервер изменился. Попробуй снова.');
      }
    }
    values[key] = { value: remote.value ?? defaults[key], version: remote.version };
  }
  if (!migrationOwner) {
    localStorage.setItem('ui-psy-migration-owner', user.id);
    for (const key of ['tishe-entries', 'tishe-preferences', 'tishe-results', 'ui-psy-medication-tracker', 'ui-psy-care']) localStorage.removeItem(key);
    if (!warning) localStorage.removeItem('ui-psy-doctor-patients');
  }
  const store = new RemoteStore(values);
  store.startupWarning = warning;
  return store;
}

function mergeLegacy(key: DataKey, remote: unknown, previous: unknown): unknown {
  if (key === 'care') {
    const local = previous as typeof emptyCare;
    const server = (remote ?? emptyCare) as typeof emptyCare;
    const merge = <T extends { id: string }>(a: T[] = [], b: T[] = []) => [...new Map([...a, ...b].map(item => [item.id, item])).values()];
    return { ...local, ...server, intake: server.intake ?? local.intake, events: merge(local.events,server.events), sessions: merge(local.sessions,server.sessions), health: merge(local.health,server.health), eeg: merge(local.eeg,server.eeg) };
  }
  if (key === 'preferences') {
    const server = remote as Partial<Preferences> | null;
    return !server || server.name === 'Пользователь' ? previous : server;
  }
  if (key === 'medications') {
    const server = remote && typeof remote === 'object' ? remote as { slots?: { id: string }[]; taken?: Record<string, boolean> } : {};
    const local = previous as { slots: { id: string }[]; taken: Record<string, boolean> };
    const ids = new Set((server.slots ?? []).map(slot => slot.id));
    return { slots: [...(server.slots ?? []), ...local.slots.filter(slot => !ids.has(slot.id))], taken: { ...local.taken, ...(server.taken ?? {}) }, skipped: { ...((previous as {skipped?: Record<string,boolean>}).skipped ?? {}), ...((remote as {skipped?: Record<string,boolean>} | null)?.skipped ?? {}) } };
  }
  const server = Array.isArray(remote) ? remote : [];
  const local = Array.isArray(previous) ? previous : [];
  const ids = new Set(server.map(item => item.id));
  return [...server, ...local.filter(item => !ids.has(item.id))];
}

function bootstrapOnce(user: User): Promise<RemoteStore> {
  if (!bootstrapping) bootstrapping = bootstrap(user).finally(() => { bootstrapping = null; });
  return bootstrapping;
}

type SessionContextValue = {
  user: User | null; store: RemoteStore | null; guest: boolean;
  setRole: (role:User['role'])=>Promise<void>; signOut: () => Promise<void>; showAccount: () => void;
};
const SessionContext = createContext<SessionContextValue | null>(null);
export function useSession() { const value = useContext(SessionContext); if (!value) throw new Error('SessionProvider is missing'); return value; }

export function useSyncedState<T>(key: DataKey, localLoader: () => T): [T, (action: SetStateAction<T>) => Promise<void>] {
  const { store } = useSession();
  const [value, setValue] = useState<T>(() => store ? store.get<T>(key) : localLoader());
  useEffect(() => store?.subscribe(key, () => setValue(store.get<T>(key))), [store, key]);
  const update = useCallback((action: SetStateAction<T>) => store ? store.update<T>(key, action) : new Promise<void>(resolve => { setValue(action); resolve(); }), [store, key]);
  return [value, update];
}

export function SessionGate({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<'loading' | 'account' | 'guest' | 'login' | 'register'>(() => 'loading');
  const [user, setUser] = useState<User | null>(null);
  const [store, setStore] = useState<RemoteStore | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role,setRole]=useState<User['role']>('patient');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [syncError, setSyncError] = useState('');

  useEffect(() => {
    let active = true;
    const start = (attempt: number): Promise<{ user: User; accessToken: string }> => refresh().catch(reason => {
      if (reason instanceof ApiError && reason.status < 500 || attempt >= 3 || !active) throw reason;
      return new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt)).then(() => start(attempt + 1));
    });
    start(0).then(async session => {
      const loaded = await bootstrapOnce(session.user);
      if (active) { setUser(session.user); setStore(loaded); setSyncError(loaded.startupWarning); setMode('account'); }
    }).catch(reason => {
      if (!active) return;
      if (reason instanceof ApiError && reason.status === 401) setMode('login');
      else { setError('Сервер недоступен. Проверь соединение и обнови страницу.'); setMode('login'); }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (mode !== 'account') return;
    const renew = () => {
      if (Date.now() - accessIssuedAt < ACCESS_RENEW_MS) return;
      refresh().catch(reason => { if (reason instanceof ApiError && reason.status === 401) { accessToken = null; setStore(null); setUser(null); setMode('login'); } });
    };
    const onVisible = () => { if (document.visibilityState === 'visible') renew(); };
    const timer = window.setInterval(renew, 60_000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', renew);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('online', renew); };
  }, [mode]);

  useEffect(() => {
    if (!store) return;
    const unsubscribe = store.onError(setSyncError);
    const poll = () => { if (document.visibilityState === 'visible') void store.poll(); };
    const timer = window.setInterval(poll, 15_000);
    window.addEventListener('focus', poll);
    return () => { unsubscribe(); clearInterval(timer); window.removeEventListener('focus', poll); };
  }, [store]);

  useEffect(() => {
    if (mode === 'guest') localStorage.removeItem('ui-psy-migration-owner');
  }, [mode]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setWorking(true); setError('');
    try {
      const nextUser = await credentials(mode === 'register' ? 'register' : 'login', email, password, role);
      const loaded = await bootstrapOnce(nextUser);
      localStorage.removeItem('ui-psy-guest');
      setUser(nextUser); setStore(loaded); setSyncError(loaded.startupWarning); setPassword(''); setMode('account');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось войти'); }
    finally { setWorking(false); }
  }

  async function signOut() {
    try { await api('/auth/logout', { method: 'POST' }); }
    catch (reason) { if (!(reason instanceof ApiError && reason.status === 401)) { setSyncError(reason instanceof Error ? reason.message : 'Не удалось выйти'); return; } }
    accessToken = null; setStore(null); setUser(null); setMode('login');
  }

  async function updateRole(role:User['role']){const updated=await api<User>('/auth/profile',{method:'PATCH',body:JSON.stringify({role})});setUser(updated);}
  const context: SessionContextValue = { setRole:updateRole, user, store, guest: mode === 'guest', signOut, showAccount: () => { setError(''); setMode('login'); } };
  if (mode === 'loading') return <main className="account-page"><p>Подключаем данные…</p></main>;
  if (mode === 'login' || mode === 'register') return <main className="account-page"><div className="account-shell">
    <aside className="account-visual" aria-hidden="true"><span className="account-brand"><ConceptMark /><span>UI-PSY</span></span><GlassStar value={7} shape="petal" hue={125} ambient className="account-visual-star" /><div className="account-visual-copy"><h2>Побудь ближе к себе</h2><p>Сохраняй важное и возвращайся к своим записям</p></div></aside>
    <form className="account-card" onSubmit={submit}>
    <span className="account-brand"><ConceptMark /><span>UI-PSY</span></span><GlassStar value={7} shape="petal" hue={125} ambient className="account-card-star" />
    <div className="account-title"><h1>{mode === 'register' ? 'Создать аккаунт' : 'С возвращением'}</h1><p>{mode === 'register' ? 'Пара шагов — и можно начинать' : 'Войди, чтобы продолжить'}</p></div>
    <label>Электронная почта<span className="account-field"><Mail size={20} /><input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></span></label>
    <label>Пароль<span className="account-field"><LockKeyhole size={20} /><input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={12} value={password} onChange={event => setPassword(event.target.value)} required /><button type="button" className="account-eye" aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'} aria-pressed={showPassword} onClick={() => setShowPassword(v => !v)}>{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button></span>{mode === 'register' && <small>Не менее 12 символов</small>}</label>
    {mode==='register'&&<fieldset className="account-role"><legend>Как будешь использовать приложение?</legend><label><input type="radio" name="account-role" value="patient" checked={role==='patient'} onChange={()=>setRole('patient')}/>Для себя</label><label><input type="radio" name="account-role" value="doctor" checked={role==='doctor'} onChange={()=>setRole('doctor')}/>Я врач или психолог</label>{role==='doctor'&&<p>Появится раздел «Работа». Личный дневник останется доступен.</p>}</fieldset>}
    {error && <p className="account-error" role="alert">{error}</p>}
    <button type="submit" className="primary-button" disabled={working}>{working ? 'Подожди…' : mode === 'register' ? 'Создать аккаунт' : 'Войти'}{!working && <ArrowRight size={20} />}</button>
    <p className="account-switch">{mode === 'register' ? 'Уже есть аккаунт?' : 'Нет аккаунта?'} <button type="button" onClick={() => { setError(''); setMode(mode === 'register' ? 'login' : 'register'); }}>{mode === 'register' ? 'Войти' : 'Создать аккаунт'}</button></p>
  </form></div></main>;
  return <SessionContext.Provider value={context}><>{syncError && <div className="sync-error" role="alert" onClick={() => setSyncError('')}>{syncError}</div>}{children}</></SessionContext.Provider>;
}
