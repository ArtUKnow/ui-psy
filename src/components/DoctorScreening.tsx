import { ArrowLeft, ClipboardList, Printer, ShieldAlert } from './icons';
import { type Answers, formScore, patientGroup, requiredForms, safetyFlags, screeningForms } from '../lib/doctorScreening';
import type { DoctorAssessment, DoctorPatient } from '../lib/doctorRecords';
import { doctorQuestionnaires, scoreQuestionnaire } from '../lib/questionnaires';
import { useSession } from '../lib/Session';

const groupNames = { standard: 'Стандартный', older: 'Пожилой', perinatal: 'Перинатальный' };

function interpretation(id: string, score: number, answers: Answers): string {
  if (id === 'phq4') {
    const form = screeningForms.find(item => item.id === id)!;
    const part = (start: number) => [start, start + 1].reduce((sum, index) => sum + form.questions[index].options[answers.phq4[index] as number].score, 0);
    return `Тревога: ${part(0)}/6${part(0) >= 3 ? ' — требуется ГТР-7' : ''}. Депрессия: ${part(2)}/6${part(2) >= 3 ? ' — требуется PHQ-9' : ''}.`;
  }
  if (id === 'gds15') return score >= 5 ? 'Порог скрининга 5 баллов достигнут; дополнить PHQ-9 и оценкой специалиста.' : 'Ниже порога 5 баллов.';
  if (id === 'geriatric-anxiety') return score >= 3 ? 'Положительный скрининг тревоги.' : 'Ниже порога 3 баллов.';
  if (id === 'wayne') return score > 15 ? 'Признаки вегетативной дисфункции по шкале Вейна.' : 'Не превышает порог 15 баллов.';
  if (id === 'gad7') return score >= 10 ? 'Клинически значимый уровень тревоги по алгоритму.' : 'Ниже порога 10 баллов.';
  if (id === 'phq9') return score >= 10 ? 'Клинически значимый уровень депрессивных симптомов по алгоритму.' : 'Ниже порога 10 баллов.';
  if (id === 'epds') return score >= 13 ? 'По алгоритму требуется обращение к врачу.' : score >= 8 ? 'По алгоритму рекомендуется консультация специалиста.' : 'Ниже порога 8 баллов.';
  return '';
}

export default function DoctorScreening({ patient, assessment, onAnswersChange, onSelectedFormsChange }: { patient: DoctorPatient; assessment: DoctorAssessment; onAnswersChange: (answers: Answers) => void; onSelectedFormsChange: (ids: string[]) => void }) {
  const { store } = useSession();
  const { answers } = assessment;
  const group = patientGroup(patient.age, patient.sex, patient.perinatal);
  const baseForms = requiredForms(group, answers);
  const selectedForms = (assessment.selectedFormIds ?? []).filter(id => doctorQuestionnaires.some(form => form.id === id));
  const formIds = [...new Set([...baseForms, ...selectedForms])];
  const flags = safetyFlags(answers);

  function selectAnswer(id: string, questionIndex: number, optionIndex: number, count: number) {
    const next = [...(answers[id] ?? Array(count).fill(null))];
    next[questionIndex] = optionIndex;
    onAnswersChange({ ...answers, [id]: next });
  }

  return <main className="doctor-page">
    <div className="doctor-layout">
      <header className="doctor-topbar"><a href={`/doctor/patient/${patient.id}`}><ArrowLeft size={16} />Карточка пациента</a><span>ВРАЧЕБНЫЙ СКРИНИНГ</span><button type="button" onClick={() => window.print()}><Printer size={16} />Печать</button></header>
      <div className="doctor-heading"><span className="eyebrow">ПРИЁМ ПАЦИЕНТА</span><h1>Скрининг состояния</h1><p>{patient.name} · {patient.age} лет · {groupNames[group]} пациент. Ответы сохраняются после каждого выбора. Скрининг не заменяет клиническую оценку.</p></div>
      <section className="doctor-card doctor-intake" aria-labelledby="doctor-intake-title"><div className="doctor-section-heading"><span className="doctor-icon"><ClipboardList size={20} /></span><div><span>01 / ДАННЫЕ</span><h2 id="doctor-intake-title">Пациент</h2></div></div><div className="doctor-group"><strong>{groupNames[group]} пациент</strong><span>{group === 'standard' ? 'PHQ-4 и шкала Вейна. Дополнительные шкалы появятся по результатам.' : group === 'older' ? 'ГШД-15, опросник тревоги в гериатрии и шкала Вейна.' : 'EPDS, ГТР-7 и шкала Вейна.'}</span></div></section>
      <section className="doctor-card doctor-catalog" aria-labelledby="doctor-catalog-title"><div className="doctor-section-heading"><span className="doctor-icon"><ClipboardList size={20} /></span><div><span>ДОПОЛНИТЕЛЬНЫЕ ШКАЛЫ</span><h2 id="doctor-catalog-title">Все тесты</h2></div></div><p>Базовые шкалы уже открыты. Выберите остальные для этого приёма; ответы сохранятся в карточке пациента.</p><details><summary>Выбрать дополнительные шкалы · {doctorQuestionnaires.length}</summary><div className="doctor-catalog-grid">{doctorQuestionnaires.map(form => { const automatic = baseForms.includes(form.id); const selected = automatic || selectedForms.includes(form.id); return <button key={form.id} type="button" disabled={automatic} aria-pressed={selected} className={selected ? 'active' : ''} onClick={() => onSelectedFormsChange(selected ? selectedForms.filter(id => id !== form.id) : [...selectedForms, form.id])}><strong>{form.title}</strong><span>{automatic ? 'По алгоритму' : selected ? 'Добавлен' : form.category === 'clinician' ? 'Оценка врача' : 'Добавить'}</span></button>; })}</div></details></section>
      <section className="doctor-form-list" aria-label="Скрининговые шкалы">{formIds.map((id, formIndex) => {
        const form = doctorQuestionnaires.find(item => item.id === id)!;
        const score = formScore(id, answers);
        const answered = answers[id]?.filter(value => value !== null && value !== undefined).length ?? 0;
        const subscores = score !== null ? scoreQuestionnaire(form, answers[id] as number[]).subscores : [];
        return <article className="doctor-card doctor-form" key={id}><div className="doctor-form-head"><div><span className="eyebrow">{String(formIndex + 2).padStart(2, '0')} / ШКАЛА</span><h2>{form.title}</h2><p>{form.instruction}</p></div><span className="doctor-count">{answered}/{form.questions.length}</span></div>
          <div className="doctor-questions">{form.questions.map((question, questionIndex) => <fieldset key={questionIndex}><legend><span>{String(questionIndex + 1).padStart(2, '0')}</span>{question.text}</legend><div className="doctor-options">{question.options.map((option, optionIndex) => <label key={optionIndex} className={answers[id]?.[questionIndex] === optionIndex ? 'selected' : ''}><input type="radio" name={`${id}-${questionIndex}`} checked={answers[id]?.[questionIndex] === optionIndex} onChange={() => selectAnswer(id, questionIndex, optionIndex, form.questions.length)} /><span>{option.label}</span></label>)}</div></fieldset>)}</div>
          {score !== null && <div className="doctor-form-result"><strong>{score} баллов</strong><span>{interpretation(id, score, answers) || 'Результат для оценки специалистом.'}{subscores.length > 0 && <small>{subscores.map(item => `${item.label}: ${item.score}/${item.max}`).join(' · ')}</small>}</span></div>}{form.key && <details className="doctor-form-key"><summary>Ключ и интерпретация из источника</summary><p>{form.key}</p></details>}
        </article>;
      })}</section><section className="doctor-card doctor-summary" aria-labelledby="doctor-summary-title"><div className="doctor-section-heading"><span className="doctor-icon"><ClipboardList size={20} /></span><div><span>ИТОГ</span><h2 id="doctor-summary-title">Сводка скрининга</h2></div></div><p className="doctor-summary-name">Пациент: {patient.name}</p><div className="doctor-score-list">{formIds.map(id => { const form = doctorQuestionnaires.find(item => item.id === id)!; const score = formScore(id, answers); return <div key={id}><span>{form.title}</span><strong>{score === null ? 'Не завершено' : `${score} баллов`}</strong></div>; })}</div>{flags.length > 0 && <div className="doctor-alert" role="alert"><ShieldAlert size={22} /><p><strong>Требуется отдельная оценка безопасности</strong>Ответ выше нуля: {flags.join(', ')}. Уточните риск напрямую и действуйте по клиническому протоколу.</p></div>}<p className="doctor-disclaimer">Пороговые значения и маршрутизация базового скрининга взяты из «Алгоритм.docx». Результат — повод для оценки специалистом, не диагноз. {store ? 'Данные скрининга сохраняются в аккаунте.' : 'Данные хранятся локально в этом браузере.'}</p></section>
    </div>
  </main>;
}
