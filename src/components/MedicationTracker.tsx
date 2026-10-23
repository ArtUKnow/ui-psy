import { useEffect, useState, type FormEvent } from 'react';
import { Check, Clock3, Plus, Trash2 } from './icons';
import { dateKey, readStored } from '../lib/data';
import { useCarePlans } from './PatientCare';
import { useSession, useSyncedState } from '../lib/Session';

export const medicationStorageKey = 'ui-psy-medication-tracker';
export type Slot = { id: string; name: string; time: string; dose?: string; startsAt?: string; endsAt?: string; archived?: boolean; prescriptionId?: string };
export type MedicationData = { slots: Slot[]; taken: Record<string, boolean>; skipped?: Record<string, boolean> };
const emptyData: MedicationData = { slots: [], taken: {} };

export function loadMedicationData(): MedicationData {
  const stored = readStored<unknown>(medicationStorageKey, emptyData);
  if (!stored || typeof stored !== 'object') return emptyData;
  const value = stored as Partial<MedicationData>;
  if (!Array.isArray(value.slots) || !value.taken || typeof value.taken !== 'object') return emptyData;
  return {
    slots: value.slots.filter((slot): slot is Slot => !!slot && typeof slot.id === 'string' && typeof slot.name === 'string' && /^\d{2}:\d{2}$/.test(slot.time)),
    skipped: value.skipped ?? {},
    taken: Object.fromEntries(Object.entries(value.taken).filter(([key, marked]) => /^\d{4}-\d{2}-\d{2}:.+/.test(key) && marked === true)),
  };
}

export default function MedicationTracker({history=false}:{history?:boolean}) {
  const { store } = useSession();
  const { plans } = useCarePlans();
  const [data, setData] = useSyncedState<MedicationData>('medications', loadMedicationData);
  const [name, setName] = useState('');
  const [time, setTime] = useState('09:00');
  const [saveError, setSaveError] = useState(false);
  const today = dateKey(new Date());
  const activeSlots = data.slots.filter(s => !s.archived && (!s.startsAt || s.startsAt <= today) && (!s.endsAt || s.endsAt >= today));
  const prescriptions = plans.flatMap(p => p.value.medications).filter(p => !data.slots.some(s => s.prescriptionId === p.id));
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return { key: dateKey(date), label: date.toLocaleDateString('ru-RU', { weekday: 'short' }), date: date.getDate() };
  });

  useEffect(() => {
    if (store) return;
    try { localStorage.setItem(medicationStorageKey, JSON.stringify(data)); setSaveError(false); }
    catch { setSaveError(true); }
  }, [data, store]);

  function updateData(action: (current: MedicationData) => MedicationData) {
    void setData(action).catch(() => setSaveError(true));
  }

  function addSlot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName || !time || data.slots.some(slot => slot.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase() && slot.time === time)) return;
    const id = crypto.randomUUID();
    updateData(current => ({ ...current, slots: [...current.slots, { id, name: cleanName, time, startsAt: today }].sort((a, b) => a.time.localeCompare(b.time)) }));
    setName('');
  }

  function toggle(slot: Slot) {
    const key = `${today}:${slot.id}`;
    updateData(current => ({ ...current, taken: { ...current.taken, [key]: !current.taken[key] }, skipped: { ...current.skipped, [key]: false } }));
  }

  function remove(slot: Slot) {
    updateData(current => ({ ...current, slots: current.slots.map(item => item.id === slot.id ? {...item, archived: true, endsAt: today} : item) }));
  }

  return <section className="medication-tracker" aria-label="График приёма лекарств">
    <div className="medication-heading"><span className="medication-icon"><Clock3 size={18} /></span><div><h2>{history?'История приёма':'График приёма'}</h2></div></div>
    <p className="medication-intro">Добавь препарат и время из назначения врача. История отметок сохраняется; отсутствие отметки не означает, что приём пропущен.</p>
    <div className="medication-week" aria-label="Приём за последние семь дней">{days.map(day => {
      const planned = data.slots.filter(slot => (slot.startsAt ? slot.startsAt <= day.key : day.key === today || !!data.taken[`${day.key}:${slot.id}`] || !!data.skipped?.[`${day.key}:${slot.id}`]) && (!slot.endsAt || slot.endsAt >= day.key));
      const count = planned.filter(slot => data.taken[`${day.key}:${slot.id}`]).length;
      const skipped = planned.filter(slot => data.skipped?.[`${day.key}:${slot.id}`]).length;
      const height = planned.length ? count / planned.length * 100 : 0;
      return <div className="medication-day" key={day.key} aria-label={`${day.label}, ${day.date}: ${count} из ${planned.length} приёмов; явно пропущено ${skipped}; без отметки ${planned.length-count-skipped}`}><span className="medication-bar"><span style={{ height: `${height}%` }} className={count ? 'filled' : ''} /></span><span>{day.label}</span><small>{day.date}</small></div>;
    })}</div>
    {!history && activeSlots.length > 0 && <div className="medication-slots">{activeSlots.map(slot => <div className="medication-slot" key={slot.id}><span className="medication-time">{slot.time}</span><span className="medication-name">{slot.name}{slot.dose && <small> · {slot.dose}</small>}</span><button type="button" className={data.taken[`${today}:${slot.id}`] ? 'taken' : ''} onClick={() => toggle(slot)} aria-label={`${data.taken[`${today}:${slot.id}`] ? 'Отменить отметку' : 'Отметить приём'}: ${slot.name}, ${slot.time}`}><Check size={15} />{data.taken[`${today}:${slot.id}`] ? 'Принято' : 'Отметить'}</button><button type="button" className="medication-skip" aria-pressed={!!data.skipped?.[`${today}:${slot.id}`]} onClick={() => updateData(c=>({...c,skipped:{...c.skipped,[`${today}:${slot.id}`]:!c.skipped?.[`${today}:${slot.id}`]},taken:{...c.taken,[`${today}:${slot.id}`]:false}}))}>{data.skipped?.[`${today}:${slot.id}`]?'Пропущено':'Пропустил(а)'}</button><button type="button" className="medication-remove" onClick={() => remove(slot)} aria-label={`Удалить из графика: ${slot.name}, ${slot.time}`}><Trash2 size={15} /></button></div>)}</div>}
    {!history && prescriptions.map(p => <div className="clinical-task" key={p.id}><div><strong>{p.name} · {p.dose}</strong><p>{p.time} · {p.instructions}</p></div><button className="secondary-button" onClick={()=>updateData(c=>({...c,slots:[...c.slots,{id:crypto.randomUUID(),name:p.name,time:p.time,dose:p.dose,startsAt:p.startsAt,endsAt:p.endsAt,prescriptionId:p.id}]}))}>Добавить в напоминания</button></div>)}
    <p className="clinical-caption">График показывает только твои подтверждённые отметки. Завершение напоминания сохраняет историю.</p>
    {history&&<div className="medication-history-list">{days.slice().reverse().map(day=><section key={day.key}><h3>{day.date} · {day.label}</h3>{data.slots.filter(slot=>data.taken[`${day.key}:${slot.id}`]||data.skipped?.[`${day.key}:${slot.id}`]).map(slot=><p key={slot.id}>{slot.time} · {slot.name}<strong>{data.taken[`${day.key}:${slot.id}`]?'Принято':'Явно пропущено'}</strong></p>)}</section>)}</div>}
    {!history&&<form className="medication-form" onSubmit={addSlot}><label><span>Препарат</span><input value={name} onChange={event => setName(event.target.value)} placeholder="Название" maxLength={80} required /></label><label><span>Время</span><input type="time" value={time} onChange={event => setTime(event.target.value)} required /></label><button type="submit" aria-label="Добавить в график"><Plus size={19} /></button></form>}
    {saveError && <p className="medication-error" role="alert">Не удалось сохранить график. Проверь соединение и попробуй ещё раз.</p>}
  </section>;
}
