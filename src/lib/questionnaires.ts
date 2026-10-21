import source from './questionnaires.json';
import { additionalQuestionnaires } from './additionalQuestionnaires';

export interface QuestionnaireOption { label: string; score: number }
export interface QuestionnaireQuestion { text: string; options: QuestionnaireOption[] }
export interface QuestionnaireDefinition {
  id: string;
  title: string;
  source: string;
  instruction: string;
  category: 'screening' | 'self' | 'clinician';
  scoring: 'sum' | 'phq4' | 'hads' | 'dass21' | 'spielberger' | 'zung' | 'who5';
  version?: string;
  key: string;
  questions: QuestionnaireQuestion[];
}

export const doctorQuestionnaires = [...source, ...additionalQuestionnaires] as QuestionnaireDefinition[];
for (const form of doctorQuestionnaires) {
  if (form.id === 'phq9') form.key = '0–4 — минимальные; 5–9 — лёгкие; 10–14 — умеренные; 15–19 — умеренно тяжёлые; 20–27 — тяжёлые депрессивные симптомы. Баллы не являются диагнозом. Ответ на вопрос 9 выше нуля рассматривается отдельно независимо от суммы.';
  if (form.id === 'gad7') form.key = '0–4 — минимальные; 5–9 — лёгкие; 10–14 — умеренные; 15–21 — тяжёлые тревожные симптомы. Баллы не являются диагнозом.';
}
export const patientQuestionnaires = doctorQuestionnaires.filter(item => item.category !== 'clinician');

export function scoreQuestionnaire(test: QuestionnaireDefinition, answers: number[]) {
  if (answers.length !== test.questions.length || answers.some((choice,index) => !Number.isInteger(choice) || !test.questions[index]?.options[choice])) throw new Error('Опросник заполнен не полностью');
  const scores = answers.map((choice, index) => test.questions[index].options[choice].score);
  const raw = scores.reduce((sum, value) => sum + value, 0);
  const subscores: { label: string; score: number; max: number }[] = [];
  const group = (label: string, indices: number[], max = indices.length * 3) => {
    subscores.push({ label, score: indices.reduce((sum, i) => sum + scores[i - 1], 0), max });
  };
  if (test.scoring === 'phq4') {
    group('Тревога', [1, 2]);
    group('Депрессия', [3, 4]);
  } else if (test.scoring === 'hads') {
    group('Тревога', [1, 3, 5, 7, 9, 11, 13]);
    group('Депрессия', [2, 4, 6, 8, 10, 12, 14]);
  } else if (test.scoring === 'dass21') {
    group('Депрессия', [3, 5, 10, 13, 16, 17, 21]);
    group('Тревога', [2, 4, 7, 9, 15, 19, 20]);
    group('Стресс', [1, 6, 8, 11, 12, 14, 18]);
  } else if (test.scoring === 'spielberger') {
    group('Ситуативная тревожность', Array.from({ length: 20 }, (_, i) => i + 1), 80);
    group('Личностная тревожность', Array.from({ length: 20 }, (_, i) => i + 21), 80);
  }
  if (test.scoring === 'dass21') for (const sub of subscores) { sub.score *= 2; sub.max *= 2; }
  if (test.scoring === 'who5') return { score: raw * 4, maxScore: 100, subscores: [{label: 'Сырой балл', score: raw, max: 25}], label: 'Индекс благополучия, %' };
  if (test.scoring === 'zung') return { score: Math.round(raw * 1.25), maxScore: 100, subscores: [{ label: 'Сырой балл', score: raw, max: 80 }], label: 'Индекс тревоги' };
  if (test.scoring === 'spielberger') return { score: raw, maxScore: 160, subscores, label: 'Сумма двух шкал' };
  const maxScore = test.questions.reduce((sum, question) => sum + Math.max(...question.options.map(option => option.score)), 0);
  return { score: raw, maxScore, subscores, label: test.scoring === 'dass21' ? 'Сумма ответов (справочно)' : 'Общий балл' };
}

export function selfHarmAnswer(testId: string, questionIndex: number, score: number) {
  return score > 0 && (
    (testId === 'phq9' && questionIndex === 8) ||
    (testId === 'epds' && questionIndex === 9) ||
    (testId === 'beck-depression' && questionIndex === 8) ||
    (testId === 'hamd17' && questionIndex === 2) ||
    (testId === 'madrs' && questionIndex === 9) ||
    (testId === 'suicide-tendencies' && questionIndex < 6)
  );
}
