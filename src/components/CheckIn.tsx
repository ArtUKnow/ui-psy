import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Clock3, Info, LockKeyhole, Sun } from './icons';
import ContourField from './ContourField';
import Modal, { CloseButton } from './Modal';
import MoodBloom from './MoodBloom';
import { emotionDescriptors } from '../lib/clinical';
import { influenceGroups, moodLabel, type Entry } from '../lib/data';

interface Props {
  onClose: () => void;
  onSave: (entry: Entry) => Promise<void>;
  onDiary: () => void;
}

const paletteValues = [1, 3, 5, 6, 8, 10];

export default function CheckIn({ onClose, onSave, onDiary }: Props) {
  const reducedMotion=useReducedMotion()||document.documentElement.dataset.motion==='off';
  const [step, setStep] = useState(0);
  const [type, setType] = useState<'emotion' | 'mood'>('emotion');
  const [mood, setMood] = useState(7);
  const [feelings, setFeelings] = useState<string[]>([]);
  const [influences, setInfluences] = useState<string[]>([]);
  const [anxiety, setAnxiety] = useState(3);
  const [energy, setEnergy] = useState(6);
  const [note, setNote] = useState('');
  const [details, setDetails] = useState<Pick<Entry, 'sleep' | 'stress' | 'sleepHours' | 'activityMinutes' | 'goalCompleted' | 'reducedSleepNeed' | 'impulsivity'>>({});
  const [expanded, setExpanded] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const savedRef = useRef(false);
  const words = (mood <= 4 ? [...emotionDescriptors.slice(16), ...emotionDescriptors.slice(0,16)] : emotionDescriptors).map(item => item[1]);
  const toggle = (value: string, values: string[], setter: (values: string[]) => void) => setter(values.includes(value) ? values.filter(item => item !== value) : [...values, value]);

  function pulseOnTouch() {
    if (window.matchMedia('(pointer: coarse)').matches && 'vibrate' in navigator) navigator.vibrate(8);
  }

  function changeMood(value: number) {
    if (value === mood) return;
    setMood(value);
    pulseOnTouch();
  }

  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [step]);

  async function next() {
    setShowHelp(false);
    if (step === 4) {
      if ((details.sleepHours !== undefined && (details.sleepHours < 0 || details.sleepHours > 24)) || (details.activityMinutes !== undefined && (details.activityMinutes < 0 || details.activityMinutes > 1440))) { setSaveError('Проверь продолжительность сна (0–24 часа) и активности (0–1440 минут).'); return; }
      if (savedRef.current) return;
      savedRef.current = true;
      setSaving(true);
      setSaveError('');
      try {
        await onSave({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), type, mood, anxiety, energy, feelings, influences, note: note.trim(), ...details, feelingCodes: emotionDescriptors.filter(([,label]) => feelings.includes(label)).map(([code]) => code) });
      } catch {
        savedRef.current = false;
        setSaveError('Не удалось сохранить запись. Попробуй ещё раз.');
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    setStep(current => current + 1);
  }

  return (
    <Modal onClose={onClose} label="Запись о твоём состоянии" className={`checkin-panel checkin-step-${step}`}>
      <div className="modal-topbar">
        {step > 0 && step < 5 ? <button className="icon-button" aria-label="Назад" onClick={() => { setStep(current => current - 1); setShowHelp(false); }}><ArrowLeft size={20} /></button> : <span className="topbar-spacer" />}
        <span>{step === 5 ? 'ТВОЙ МАЛЕНЬКИЙ ШАГ' : step === 0 ? 'МОМЕНТ ДЛЯ СЕБЯ' : type === 'emotion' ? 'ТВОЯ ЭМОЦИЯ' : 'ТВОЁ НАСТРОЕНИЕ'}</span>
        <CloseButton onClick={onClose} />
      </div>
      {step < 5 && <div className="step-progress" role="progressbar" aria-label="Запись чувства" aria-valuemin={1} aria-valuemax={5} aria-valuenow={step + 1} aria-valuetext={`Шаг ${step + 1} из 5`}>{[0, 1, 2, 3, 4].map(item => <span key={item} className={item <= step ? 'complete' : ''} />)}</div>}
      <div className="checkin-scroll" ref={scrollRef}><ContourField/>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={step} className={`checkin-content step-content-${step}`} initial={reducedMotion?false:{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reducedMotion?0:-10 }} transition={{ duration: reducedMotion?0:.24 }}>
            {step === 0 && <>
              <div className="checkin-intro-art"><MoodBloom value={7} shape="petal" hue={145} className="intro-main-star" /><div className="glass-bubble intro-bubble" /><MoodBloom value={3} shape="sun" hue={195} className="intro-small-star" /></div>
              <h2>Давай прислушаемся<br />к тебе</h2>
              <p className="modal-description">Всё, что ты чувствуешь, имеет значение.<br />Что хочется отметить?</p>
              <div className="entry-type-options">
                <button className={`entry-type ${type === 'emotion' ? 'chosen' : ''}`} onClick={() => setType('emotion')} aria-pressed={type === 'emotion'}><Clock3 size={22} /><span><strong>Эмоция сейчас</strong><small>Как ты чувствуешь себя в этот момент</small></span><span className="radio-mark">{type === 'emotion' && <Check size={14} />}</span></button>
                <button className={`entry-type ${type === 'mood' ? 'chosen' : ''}`} onClick={() => setType('mood')} aria-pressed={type === 'mood'}><Sun size={23} /><span><strong>Настроение за день</strong><small>Твоё общее ощущение от сегодняшнего дня</small></span><span className="radio-mark">{type === 'mood' && <Check size={14} />}</span></button>
              </div>
            </>}
            {step === 1 && <>
              <h2>{type === 'emotion' ? <>Как тебе<br />прямо сейчас?</> : <>Каким был<br />твой день?</>}</h2>
              <p className="modal-description">Не торопись, а просто прислушайся к тому, что чувствуешь.</p>
              <MoodBloom value={mood} />
              <h3 className="mood-value-label" aria-live="polite">{moodLabel(mood)}</h3>
              <div className="mood-range-wrap"><label className="sr-only" htmlFor="mood-range">Настроение от 1 до 10</label><input id="mood-range" className="mood-range" type="range" min="1" max="10" value={mood} onChange={event => changeMood(Number(event.target.value))} style={{ '--range-progress': `${(mood - 1) / 9 * 100}%` } as React.CSSProperties} /><div className="range-endpoints"><span>Очень неприятно</span><span>Очень приятно</span></div></div>
              <section className="mood-palette" aria-label="Палитра состояний">
                <div className="mood-palette-heading"><strong>Палитра состояний</strong><span>Выбери образ или двигай ползунок</span></div>
                <div className="mood-palette-options">{paletteValues.map(value => <button key={value} type="button" className={`mood-palette-option ${mood === value ? 'selected' : ''}`} aria-label={`${moodLabel(value)}, ${value} из 10`} aria-pressed={mood === value} onClick={() => changeMood(value)}><MoodBloom value={value} className="mood-palette-bloom" compact /><span>{value}</span></button>)}</div>
              </section>
            </>}
            {step === 2 && <>
              <MoodBloom value={mood} className="checkin-small-star" />
              <span className="small-mood-label">{moodLabel(mood)}</span>
              <div className="question-heading"><h2>Как назовём<br />это чувство?</h2><button className="icon-button help-button" aria-label="Подсказка о чувствах" aria-expanded={showHelp} onClick={() => setShowHelp(!showHelp)}><Info size={18} /></button></div>
              <p className="modal-description left">Выбери несколько чувств, если они откликаются, или пропусти этот шаг.</p>
              {showHelp && <p className="inline-help">У чувств нет строгих границ. Выбери слова, которые сейчас откликаются, даже если они кажутся противоречивыми.</p>}
              <div className="feeling-choices">{(expanded ? words : words.slice(0, 12)).map(word => <button className={`choice-chip ${feelings.includes(word) ? 'chosen' : ''}`} aria-pressed={feelings.includes(word)} key={word} onClick={() => toggle(word, feelings, setFeelings)}>{word}{feelings.includes(word) && <Check size={13} />}</button>)}</div>
              {words.length > 12 && <button className="text-button expand-button" onClick={() => setExpanded(!expanded)}>{expanded ? 'Свернуть' : 'Больше чувств'}<ChevronDown size={15} className={expanded ? 'rotate-180' : ''} /></button>}
            </>}
            {step === 3 && <>
              <MoodBloom value={mood} className="checkin-small-star" />
              <span className="small-mood-label">{feelings[0] || moodLabel(mood)}</span>
              <div className="question-heading"><h2>Что повлияло<br />на тебя?</h2><button className="icon-button help-button" aria-label="Подсказка о влиянии" aria-expanded={showHelp} onClick={() => setShowHelp(!showHelp)}><Info size={18} /></button></div>
              <p className="modal-description left">Не обязательно искать причину. Можно просто заметить.</p>
              {showHelp && <p className="inline-help">Со временем эти отметки помогут увидеть, что поддерживает тебя, а что забирает силы.</p>}
              <div className="influence-groups">{influenceGroups.map((group, index) => <div className="feeling-choices" key={index}>{group.map(word => <button className={`choice-chip ${influences.includes(word) ? 'chosen' : ''}`} aria-pressed={influences.includes(word)} key={word} onClick={() => toggle(word, influences, setInfluences)}>{word}{influences.includes(word) && <Check size={13} />}</button>)}</div>)}</div>
            </>}
            {step === 4 && <>
              <span className="eyebrow final-step-eyebrow">ЕЩЁ НЕМНОГО ВНИМАНИЯ К СЕБЕ</span>
              <h2 className="left">Как твои<br />внутренние силы?</h2>
              <p className="modal-description left">Отметь ощущения и сохрани то, что важно.</p>
              <div className="detail-ranges">
                <div className="detail-range-card anxiety-card">
                  <label className="detail-range-label" htmlFor="anxiety-range"><span><i className="dot purple" />Тревога</span><strong>{anxiety}<small> / 10</small></strong></label>
                  <input id="anxiety-range" className="detail-range purple-range" type="range" min="0" max="10" value={anxiety} style={{ '--range-progress': `${anxiety * 10}%` } as CSSProperties} onChange={event => { setAnxiety(Number(event.target.value)); pulseOnTouch(); }} /><div className="range-endpoints"><span>Нет напряжения</span><span>Очень тревожно</span></div>
                </div>
                <div className="detail-range-card energy-card">
                  <label className="detail-range-label" htmlFor="energy-range"><span><i className="dot teal" />Энергия</span><strong>{energy}<small> / 10</small></strong></label>
                  <input id="energy-range" className="detail-range teal-range" type="range" min="0" max="10" value={energy} style={{ '--range-progress': `${energy * 10}%` } as CSSProperties} onChange={event => { setEnergy(Number(event.target.value)); pulseOnTouch(); }} /><div className="range-endpoints"><span>Нужен отдых</span><span>Много сил</span></div>
                </div>
              </div>
              <details className="clinical-checkin-details"><summary>Сон, напряжение и повседневные дела · необязательно</summary><div className="clinical-form">
                {(['sleep','stress'] as const).map(key => <label key={key}>{key === 'sleep' ? 'Качество сна' : 'Напряжённость дня'}<select value={details[key] ?? ''} onChange={e => setDetails(d => ({...d,[key]:e.target.value === '' ? undefined : Number(e.target.value)}))}><option value="">Не отмечать</option>{Array.from({length:11},(_,i)=><option key={i} value={i}>{i} / 10{key==='sleep'?(i===0?' — совсем не восстановил':i===10?' — полностью восстановил':''):(i===0?' — нет напряжения':i===10?' — очень сильное':'')}</option>)}</select></label>)}
                <label>Продолжительность сна, часы<input type="number" min="0" max="24" step="0.5" value={details.sleepHours ?? ''} onChange={e=>setDetails(d=>({...d,sleepHours:e.target.value===''?undefined:Number(e.target.value)}))}/></label>
                <label>Физическая активность, минуты<input type="number" min="0" max="1440" value={details.activityMinutes ?? ''} onChange={e=>setDetails(d=>({...d,activityMinutes:e.target.value===''?undefined:Number(e.target.value)}))}/></label>
                <label>Личная цель на день<select value={details.goalCompleted===undefined?'':details.goalCompleted?'yes':'no'} onChange={e=>setDetails(d=>({...d,goalCompleted:e.target.value===''?undefined:e.target.value==='yes'}))}><option value="">Не отмечать</option><option value="yes">Удалось выполнить</option><option value="no">Не удалось выполнить</option></select></label>
                <label>Спал(а) меньше, но потребность во сне снизилась<select value={details.reducedSleepNeed===undefined?'':details.reducedSleepNeed?'yes':'no'} onChange={e=>setDetails(d=>({...d,reducedSleepNeed:e.target.value===''?undefined:e.target.value==='yes'}))}><option value="">Не отмечать</option><option value="yes">Да</option><option value="no">Нет</option></select></label>
                <label>Необычная импульсивность<select value={details.impulsivity===undefined?'':details.impulsivity?'yes':'no'} onChange={e=>setDetails(d=>({...d,impulsivity:e.target.value===''?undefined:e.target.value==='yes'}))}><option value="">Не отмечать</option><option value="yes">Да</option><option value="no">Нет</option></select></label>
              </div><p className="clinical-caption">Это собственные отметки за день, а не WHO-5 и не диагноз. Пустые поля не превращаются в нулевые значения.</p></details>
              <label className="note-label" htmlFor="entry-note">Пара слов для себя <span>необязательно</span></label>
              <textarea id="entry-note" className="note-input" rows={3} maxLength={2000} placeholder="Что хочется запомнить об этом моменте?" value={note} onChange={event => setNote(event.target.value)} />
              <p className="privacy-note"><LockKeyhole size={12} />Запись появится в твоём дневнике.</p>
              {saveError && <p className="form-error" role="alert">{saveError}</p>}
            </>}
            {step === 5 && <div className="checkin-success">
              <MoodBloom value={mood} className="checkin-success-star" />
              <span className="success-check"><Check size={18} /></span>
              <h2>Запись сохранена</h2>
              <p className="modal-description">Момент добавлен в дневник.</p>
              <button className="primary-button" onClick={onDiary}>Заглянуть в дневник<ArrowRight size={18} /></button>
              <button className="text-button" onClick={onClose}>Закрыть</button>
            </div>}
          </motion.div>
        </AnimatePresence>
      </div>
      {step < 5 && <div className="checkin-footer"><button className="primary-button" disabled={saving} onClick={() => void next()}>{saving ? 'Сохраняем…' : step === 4 ? 'Сохранить момент' : step === 0 ? 'Начнём' : 'Далее'}{step === 4 ? <Check size={18} /> : <ArrowRight size={18} />}</button></div>}
    </Modal>
  );
}
