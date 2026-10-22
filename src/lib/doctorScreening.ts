import { doctorQuestionnaires, scoreQuestionnaire } from './questionnaires';

export type PatientGroup = 'standard' | 'older' | 'perinatal';
export type PerinatalStatus = 'none' | 'pregnant22' | 'postpartum7';
export type Answers = Record<string, (number | null)[]>;

export const screeningForms = doctorQuestionnaires.filter(form =>
  ['phq4', 'phq9', 'gad7', 'epds', 'wayne', 'gds15', 'geriatric-anxiety'].includes(form.id)
);

export function patientGroup(age: number, sex: string, perinatal: PerinatalStatus): PatientGroup {
  if (sex === 'female' && perinatal !== 'none') return 'perinatal';
  return age > 60 ? 'older' : 'standard';
}

export function formScore(id: string, answers: Answers): number | null {
  const form = doctorQuestionnaires.find(item => item.id === id);
  const selected = answers[id];
  if (!form || !selected || selected.length !== form.questions.length || selected.some((value, index) =>
    value === null || !Number.isInteger(value) || value < 0 || value >= form.questions[index].options.length)) return null;
  return scoreQuestionnaire(form, selected as number[]).score;
}

export function requiredForms(group: PatientGroup, answers: Answers): string[] {
  if (group === 'perinatal') return ['epds', 'gad7', 'wayne'];
  if (group === 'older') return formScore('gds15', answers) !== null && formScore('gds15', answers)! >= 5
    ? ['gds15', 'geriatric-anxiety', 'wayne', 'phq9']
    : ['gds15', 'geriatric-anxiety', 'wayne'];
  const forms = ['phq4', 'wayne'];
  const phq4 = answers.phq4;
  if (formScore('phq4', answers) !== null && phq4) {
    const score = (indices: number[]) => indices.reduce((sum, index) => sum + screeningForms.find(form => form.id === 'phq4')!.questions[index].options[phq4[index] as number].score, 0);
    if (score([0, 1]) >= 3) forms.push('gad7');
    if (score([2, 3]) >= 3) forms.push('phq9');
  }
  return forms;
}

export function safetyFlags(answers: Answers): string[] {
  const flags: string[] = [];
  for (const [id, questionIndex, label] of [
    ['phq9', 8, 'PHQ-9, вопрос 9'],
    ['epds', 9, 'EPDS, вопрос 10'],
    ['hamd17', 2, 'Шкала Гамильтона для оценки депрессии, вопрос 3'],
    ['madrs', 9, 'Шкала Монтгомери — Асберга, вопрос 10'],
    ['beck-depression', 8, 'Шкала депрессии Бека, вопрос 9'],
    ['suicide-tendencies', 0, 'Шкала оценки суицидальных тенденций, вопрос 1'],
    ['suicide-tendencies', 1, 'Шкала оценки суицидальных тенденций, вопрос 2'],
    ['suicide-tendencies', 2, 'Шкала оценки суицидальных тенденций, вопрос 3'],
    ['suicide-tendencies', 3, 'Шкала оценки суицидальных тенденций, вопрос 4'],
    ['suicide-tendencies', 4, 'Шкала оценки суицидальных тенденций, вопрос 5'],
    ['suicide-tendencies', 5, 'Шкала оценки суицидальных тенденций, вопрос 6'],
  ] as const) {
    const form = doctorQuestionnaires.find(item => item.id === id);
    const optionIndex = answers[id]?.[questionIndex];
    if (form && optionIndex !== null && optionIndex !== undefined && form.questions[questionIndex].options[optionIndex].score > 0) flags.push(label);
  }
  return flags;
}
