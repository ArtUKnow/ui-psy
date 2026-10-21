import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check } from './icons';
import Modal, { CloseButton } from './Modal';
import { GlassStar } from './Visuals';
import { reflectionResult, reflectionTests, type TestResult } from '../lib/data';

export default function Reflection({ testId, onClose, onSave }: { testId: string; onClose: () => void; onSave: (result: TestResult) => Promise<void> }) {
  const test = reflectionTests.find(item => item.id === testId)!;
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(Array(test.questions.length).fill(null));
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const total = answers.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const result = reflectionResult(total);
  const choices = ['Почти никогда', 'Редко', 'Часто', 'Почти всегда'];

  async function next() {
    if (step < test.questions.length - 1) setStep(current => current + 1);
    else {
      setSaving(true);
      setSaveError('');
      try {
        await onSave({ id: crypto.randomUUID(), testId, title: test.title, score: total, createdAt: new Date().toISOString() });
      } catch {
        setSaveError('Не удалось сохранить результат. Попробуй ещё раз.');
        setSaving(false);
        return;
      }
      setSaving(false);
      setFinished(true);
    }
  }

  return (
    <Modal onClose={onClose} label={test.title} className="reflection-panel">
      <div className="modal-topbar">{step > 0 && !finished ? <button className="icon-button" onClick={() => setStep(current => current - 1)} aria-label="Предыдущий вопрос"><ArrowLeft size={20} /></button> : <span className="topbar-spacer" />}<span>БЕРЕЖНАЯ САМОПРОВЕРКА</span><CloseButton onClick={onClose} /></div>
      {finished ? <div className="reflection-result"><GlassStar value={total > 10 ? 8 : total > 5 ? 7 : 5} /><span className="eyebrow">ТВОЙ МОМЕНТ ВНИМАНИЯ</span><h2>{result.title}</h2><p>{result.text}</p><p className="reflection-disclaimer">Это упражнение для самонаблюдения, а не клинический тест или диагноз.</p><button className="primary-button" onClick={onClose}>Завершить<Check size={18} /></button></div> : <>
        <div className="reflection-progress"><span>Вопрос {step + 1} из {test.questions.length}</span><span>{test.title}</span></div>
        <div className="step-progress">{test.questions.map((_, index) => <span key={index} className={index <= step ? 'complete' : ''} />)}</div>
        <AnimatePresence mode="wait"><motion.div key={step} initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -15 }} className="reflection-question"><h2>{test.questions[step]}</h2><p>Вспомни последние две недели. Как часто это было про тебя?</p><div className="reflection-options">{choices.map((choice, index) => <button key={choice} className={answers[step] === index ? 'chosen' : ''} aria-pressed={answers[step] === index} onClick={() => setAnswers(current => current.map((value, position) => position === step ? index : value))}><span>{choice}</span><span className="radio-mark">{answers[step] === index && <Check size={14} />}</span></button>)}</div></motion.div></AnimatePresence>
        {saveError && <p className="form-error" role="alert">{saveError}</p>}
        <button className="primary-button" disabled={answers[step] === null || saving} onClick={() => void next()}>{saving ? 'Сохраняем…' : step === test.questions.length - 1 ? 'Посмотреть результат' : 'Далее'}<ArrowRight size={17} /></button>
      </>}
    </Modal>
  );
}
