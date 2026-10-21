import { useEffect, useState } from 'react';
import { Check, Pause, Play, RotateCcw, Wind } from './icons';
import ContourField from './ContourField';
import Modal, { CloseButton } from './Modal';
import { GlassOrb } from './Visuals';

export default function Breathing({ onClose }: { onClose: () => void }) {
  const [duration, setDuration] = useState(60);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const done = elapsed >= duration;
  const phase = elapsed % 10 < 4 ? 'Вдох' : 'Выдох';
  const phaseRemaining = elapsed % 10 < 4 ? 4 - elapsed % 10 : 10 - elapsed % 10;

  useEffect(() => {
    if (!running || done) return;
    const interval = window.setInterval(() => setElapsed(value => value + 1), 1000);
    return () => clearInterval(interval);
  }, [running, done]);

  const reset = () => { setRunning(false); setElapsed(0); };
  const remaining = duration - elapsed;

  return (
    <Modal onClose={onClose} label="Дыхательная практика" className="breathing-panel">
      <ContourField/><div className="modal-topbar"><Wind size={21} /><span>ВОЗВРАЩЕНИЕ К СЕБЕ</span><CloseButton onClick={onClose} /></div>
      <div className="breathing-heading"><h2>{done ? 'Пауза завершена' : 'Дышим вместе'}</h2><p>{done ? 'Заметь, как ты чувствуешь себя сейчас.' : 'Дыши мягко, без усилий. В своём темпе.'}</p></div>
      <div className={`breathing-visual ${running && !done ? 'is-breathing' : ''} ${elapsed > 0 && !running ? 'is-paused' : ''}`}>
        <svg className="breathing-progress" viewBox="0 0 300 300" aria-hidden="true"><circle cx="150" cy="150" r="141" fill="none" stroke="rgba(171,218,204,.1)" strokeWidth="1" /><circle cx="150" cy="150" r="141" fill="none" stroke="#accfc0" strokeWidth="2" strokeDasharray={886} strokeDashoffset={886 * (1 - elapsed / duration)} strokeLinecap="round" transform="rotate(-90 150 150)" /></svg>
        <GlassOrb className="breathing-orb" value={8} shape="wave" hue={145} />
      </div>
      <div className="breathing-instruction" aria-live="off">{done ? <Check size={34} /> : <><strong>{elapsed === 0 && !running ? 'Побудь здесь' : phase}</strong><span>{running ? phaseRemaining : elapsed ? 'Пауза' : 'Всё остальное подождёт'}</span></>}</div>
      <div className="breathing-timer" role="timer" aria-label={`Осталось ${remaining} секунд`}>{String(Math.floor(remaining / 60)).padStart(2, '0')}<span>:</span>{String(remaining % 60).padStart(2, '0')}</div>
      <div className="duration-options" role="group" aria-label="Длительность практики">{[60, 120, 180].map(value => <button key={value} disabled={running && !done} aria-pressed={duration === value} className={duration === value ? 'selected' : ''} onClick={() => { setDuration(value); reset(); }}>{value / 60} мин</button>)}</div>
      <div className="breathing-actions">{elapsed > 0 && <button className="icon-button" aria-label="Начать заново" onClick={reset}><RotateCcw size={20} /></button>}<button className="primary-button" onClick={() => { if (done) onClose(); else setRunning(!running); }}>{done ? 'Спасибо себе' : running ? 'Пауза' : elapsed ? 'Продолжить' : 'Начать практику'}{done ? <Check size={17} /> : running ? <Pause size={17} /> : <Play size={17} />}</button></div>
      <p className="breathing-caution">Если почувствуешь дискомфорт, вернись к обычному дыханию.</p>
    </Modal>
  );
}
