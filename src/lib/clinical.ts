import type { EEGRecording } from './neuroplayBluetooth';
import { dateKey, readStored, type Entry, type TestResult } from './data';
import { patientGroup, requiredForms, type PerinatalStatus } from './doctorScreening';

export type CareEvent = { id: string; createdAt: string; kind: 'visit' | 'treatment' | 'adverse' | 'context' | 'safety'; text: string };
export type DeviceSession = { id: string; createdAt: string; source: 'NeuroPlay'; mode: 'concentration' | 'meditation'; duration: number; longest: number; effective: number; average: number; samples: { time: number; value: number }[] };
export type HealthSample = { id: string; createdAt: string; kind: 'sleepHours' | 'activityMinutes'; value: number; source: string };
export type CareData = { eeg?: EEGRecording[]; intake?: { age: number; sex: 'female' | 'male'; perinatal: PerinatalStatus }; events: CareEvent[]; sessions: DeviceSession[]; health: HealthSample[] };
export type Review = { signalId: string; status: 'reviewed' | 'follow-up' | 'closed'; action: string; updatedAt: string };
export type Assignment = { id: string; testId: string; dueDate: string; intervalDays: number; timezone?: string; createdAt: string };
export type Prescription = { id: string; name: string; dose: string; time: string; startsAt: string; endsAt: string; instructions: string };
export type CarePlan = { assignments: Assignment[]; recommendation: string; medications: Prescription[]; reviews: Review[] };
export type PlanRecord = { doctor: { id: string; email: string }; value: CarePlan; version: number; updatedAt: number };
export const emptyCare: CareData = { events: [], sessions: [], health: [] };
export const emptyPlan: CarePlan = { assignments: [], recommendation: '', medications: [], reviews: [] };
export const careStorageKey = 'ui-psy-care';
export function loadCare(): CareData {
  const stored = readStored<Partial<CareData> | null>(careStorageKey, {});
  const value = stored && typeof stored === 'object' ? stored : {};
  return { ...value, events: Array.isArray(value.events) ? value.events : [], sessions: Array.isArray(value.sessions) ? value.sessions : [], health: Array.isArray(value.health) ? value.health : [] };
}
export const clinicalScales: Record<string, { name: string; max: number; min: number; higherBetter?: boolean; period: string; source: string }> = {
  phq9: { name: 'PHQ-9', min: 0, max: 27, period: 'Последние 14 дней', source: 'https://www.ecfs.eu/sites/default/files/general-content-files/working-groups/Mental%20Health/PHQ9_Russian%20for%20Russia.pdf' },
  gad7: { name: 'GAD-7', min: 0, max: 21, period: 'Последние 14 дней', source: 'https://www.phqscreeners.com/' },
  who5: { name: 'WHO-5', min: 0, max: 100, higherBetter: true, period: 'Последние 14 дней', source: 'https://www.who.int/publications/m/item/WHO-UCN-MSD-MHE-2024.01' },
  hamd17: { name: 'HAM-D-17', min: 0, max: 52, period: 'Клиническое интервью', source: '' },
  madrs: { name: 'MADRS', min: 0, max: 60, period: 'Клиническое интервью', source: '' },
  hama: { name: 'HAM-A', min: 0, max: 56, period: 'Клиническое интервью', source: '' },
  isi: { name: 'ISI', min: 0, max: 28, period: 'Последние 14 дней', source: 'https://site.thoracic.org/assemblies/srn/sleep-related-questionnaires/isi' },
};
export function severity(id: string, score: number): string {
  if (id === 'phq9') return score < 5 ? 'Минимальные симптомы' : score < 10 ? 'Лёгкие симптомы' : score < 15 ? 'Умеренные симптомы' : score < 20 ? 'Умеренно тяжёлые симптомы' : 'Тяжёлые симптомы';
  if (id === 'gad7') return score < 5 ? 'Минимальные симптомы' : score < 10 ? 'Лёгкие симптомы' : score < 15 ? 'Умеренные симптомы' : 'Тяжёлые симптомы';
  if (id === 'who5') return score < 50 ? 'Сниженное благополучие; стоит обсудить со специалистом' : 'Показатель благополучия не ниже порога скрининга';
  if (id === 'isi') return score < 8 ? 'Ниже порога выраженной бессонницы' : score < 15 ? 'Подпороговые нарушения сна' : score < 22 ? 'Умеренные нарушения сна' : 'Выраженные нарушения сна';
  if (id === 'epds') return score >= 13 ? 'Нужна оценка врача' : score >= 8 ? 'Стоит обратиться к специалисту' : 'Ниже порога скрининга';
  return 'Результат для обсуждения со специалистом';
}
export function screeningRoute(care: CareData, results: TestResult[]) {
  const answers = Object.fromEntries([...results].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)).filter(r => r.answers).map(r => [r.testId, r.answers!]));
  if (!care.intake) return [];
  const i = care.intake;
  return requiredForms(patientGroup(i.age, i.sex, i.perinatal), answers);
}
export const severeThresholds: Record<string, number> = { phq9: 20, gad7: 15 };
export function severeScore(testId: string, score: number) { return severeThresholds[testId] !== undefined && score >= severeThresholds[testId]; }
export function resultSignals(results: TestResult[], care: CareData) {
  return [
    ...results.filter(r => !r.safety && severeScore(r.testId, r.score)).map(r => ({ id: `severe-${r.id}`, createdAt: r.createdAt, text: `${r.title}: ${r.score} баллов — тяжёлые симптомы; нужен контакт с пациентом` })),
    ...results.filter(r => r.safety || (r.testId === 'phq9' && (r.answerScores?.[8] ?? 0) > 0) || (r.testId === 'epds' && (r.answerScores?.[9] ?? 0) > 0)).map(r => ({ id: r.id, createdAt: r.createdAt, text: `${r.title}: ответ о причинении себе вреда; нужна отдельная оценка` })),
    ...care.events.filter(e => e.kind === 'safety').map(e => ({ id: e.id, createdAt: e.createdAt, text: e.text })),
  ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
export function neutralObservations(entries: Entry[]) {
  const daily = [...new Map([...entries].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)).map(e => [dateKey(e.createdAt), e])).values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const recent = daily.slice(-3), previous = daily.slice(-17, -3);
  if (recent.length < 3 || previous.length < 7) return [];
  const avg = (items: Entry[], key: 'mood' | 'anxiety' | 'energy') => items.reduce((s, e) => s + e[key], 0) / items.length;
  const messages: string[] = [];
  if (avg(recent, 'mood') < avg(previous, 'mood') - 1) messages.push('В последние отмеченные дни настроение ниже твоего предыдущего среднего. На это могли повлиять разные обстоятельства; если изменение сохраняется и мешает повседневной жизни, обсуди его со специалистом.');
  const sleep = recent.filter(e => e.sleep !== undefined), oldSleep = previous.filter(e => e.sleep !== undefined);
  if (sleep.length === 3 && oldSleep.length >= 5 && sleep.reduce((s,e)=>s+e.sleep!,0)/3 < oldSleep.reduce((s,e)=>s+e.sleep!,0)/oldSleep.length - 1 && avg(recent,'anxiety') > avg(previous,'anxiety') + 1) messages.push('В отмеченные дни сон стал хуже, а тревога усилилась. Это совпадение по времени, которое можно обсудить со специалистом.');
  const latest = recent.at(-1)!;
  if (latest.energy > avg(previous,'energy') + 2) messages.push(`Сегодня энергии больше, чем в предыдущих отметках.${latest.reducedSleepNeed || latest.impulsivity ? ' Ты также отметил(а) снижение потребности во сне или импульсивность; стоит обсудить сочетание этих изменений с врачом.' : ' Если вместе с этим меняется сон или становится сложнее контролировать поступки, обсуди это с врачом.'}`);
  return messages;
}
export const emotionDescriptors = [
 ['calm','Спокойствие'],['confident','Уверенность'],['content','Довольство'],['excited','Воодушевление'],['grateful','Благодарность'],['happy','Счастье'],['hopeful','Надежда'],['joyful','Радость'],['peaceful','Умиротворение'],['proud','Гордость'],['relieved','Облегчение'],['satisfied','Удовлетворение'],['brave','Смелость'],['passionate','Увлечённость'],['amazed','Восхищение'],['amused','Веселье'],
 ['angry','Злость'],['annoyed','Досада'],['anxious','Тревога'],['ashamed','Стыд'],['disappointed','Разочарование'],['discouraged','Уныние'],['disgusted','Отвращение'],['drained','Истощение'],['embarrassed','Смущение'],['frustrated','Фрустрация'],['guilty','Вина'],['hopeless','Безнадёжность'],['indifferent','Безразличие'],['irritated','Раздражение'],['jealous','Ревность'],['lonely','Одиночество'],['overwhelmed','Перегруженность'],['sad','Грусть'],['scared','Страх'],['stressed','Напряжение'],['surprised','Удивление'],['worried','Беспокойство'],
] as const;
