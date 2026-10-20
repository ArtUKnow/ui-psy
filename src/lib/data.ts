export type Page = 'home' | 'diary' | 'assistant' | 'tests' | 'settings' | 'statistics' | 'care' | 'events' | 'devices' | 'practices' | 'work';
export type Metric = 'mood' | 'anxiety' | 'energy';

export interface Entry {
  id: string;
  createdAt: string;
  type: 'emotion' | 'mood';
  mood: number;
  anxiety: number;
  energy: number;
  feelings: string[];
  influences: string[];
  note: string;
  sleep?: number;
  stress?: number;
  sleepHours?: number;
  activityMinutes?: number;
  goalCompleted?: boolean;
  reducedSleepNeed?: boolean;
  impulsivity?: boolean;
  feelingCodes?: string[];
}

export interface Preferences {
  specialty?: string;
  clinic?: string;
  name: string;
  motion: boolean;
}

export interface TestResult {
  id: string;
  testId: string;
  title: string;
  score: number;
  maxScore?: number;
  summary?: string;
  subscores?: { label: string; score: number; max: number }[];
  createdAt: string;
  answers?: number[];
  answerScores?: number[];
  questionnaireVersion?: string;
  instruction?: string;
  safety?: boolean;
}

export interface SupportMessage { id: string; role: 'user' | 'assistant'; text: string; practice?: boolean }
export const greetingMessage: SupportMessage = { id: 'welcome', role: 'assistant', text: 'Привет. Здесь не нужно подбирать правильные слова. Расскажи, что сейчас у тебя внутри, или выбери то, что откликается.' };

export const metricInfo = {
  mood: { label: 'Настроение', color: '#d1e6a1', description: 'Как тебе сейчас, от тяжёлого состояния до приятного. У этой шкалы нет правильного значения.' },
  anxiety: { label: 'Тревога', color: '#b5a2d3', description: 'Насколько сильное внутреннее напряжение ты ощущаешь. Замечать его уже значит проявлять к себе заботу.' },
  energy: { label: 'Энергия', color: '#85bcb3', description: 'Сколько сил у тебя сейчас. Не обязательно быть продуктивной, чтобы день был ценным.' },
};

export function moodLabel(value: number) {
  if (value <= 2) return 'Очень неприятно';
  if (value <= 4) return 'Неприятно';
  if (value <= 6) return 'Нейтрально';
  if (value <= 8) return 'Приятно';
  return 'Очень приятно';
}

export function moodHue(value: number) {
  if (value <= 2) return 205;
  if (value <= 4) return 155;
  if (value === 5) return 115;
  if (value <= 7) return 0;
  return -25;
}

export const positiveFeelings = ['Спокойствие', 'Радость', 'Благодарность', 'Надежда', 'Вдохновение', 'Уверенность', 'Облегчение', 'Нежность', 'Интерес', 'Гордость', 'Удовлетворение', 'Счастье', 'Восторг', 'Воодушевление', 'Умиротворение', 'Любопытство'];
export const difficultFeelings = ['Тревога', 'Грусть', 'Усталость', 'Раздражение', 'Одиночество', 'Растерянность', 'Обида', 'Страх', 'Разочарование', 'Беспокойство', 'Вина', 'Бессилие', 'Злость', 'Стыд', 'Скука', 'Опустошение'];
export const neutralFeelings = ['Спокойствие', 'Задумчивость', 'Усталость', 'Интерес', 'Безразличие', 'Ожидание', 'Растерянность', 'Надежда', 'Скука', 'Сосредоточенность', 'Принятие', 'Любопытство'];
export const influenceGroups = [
  ['Здоровье', 'Болезнь', 'Недосып', 'Экзамен', 'Конфликт', 'Физическая нагрузка', 'Сон', 'Забота о себе', 'Движение', 'Хобби'],
  ['Семья', 'Друзья', 'Отношения', 'Общение', 'Время наедине'],
  ['Работа', 'Учёба', 'Деньги', 'Погода', 'События в мире', 'Другое'],
];

export function dateKey(date: Date | string) {
  const value = new Date(date);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function friendlyDate(date: string) {
  const today = dateKey(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (dateKey(date) === today) return 'Сегодня';
  if (dateKey(date) === dateKey(yesterday)) return 'Вчера';
  return new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

export function loadPreferences(): Preferences {
  const value = readStored<Partial<Preferences> | null>('tishe-preferences', null);
  let storedName = typeof value?.name === 'string' ? value.name.trim().slice(0, 30) : '';
  try {
    if (storedName === 'Настя' && !localStorage.getItem('tishe-default-name-migrated')) {
      storedName = '';
      localStorage.setItem('tishe-default-name-migrated', '1');
    }
  } catch { /* Browser storage may be unavailable in guest mode. */ }
  return { name: storedName || 'Пользователь', motion: typeof value?.motion === 'boolean' ? value.motion : true };
}

export function loadResults(): TestResult[] {
  const value = readStored<unknown>('tishe-results', []);
  return Array.isArray(value) ? value.filter(item => item && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.score === 'number' && typeof item.createdAt === 'string') : [];
}

export function loadEntries(): Entry[] {
  const value = readStored<unknown>('tishe-entries', []);
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is Entry => entry && typeof entry.id === 'string' &&
    typeof entry.createdAt === 'string' && !Number.isNaN(new Date(entry.createdAt).getTime()) &&
    ['emotion', 'mood'].includes(entry.type) &&
    ['mood', 'anxiety', 'energy'].every(key => typeof entry[key] === 'number' && entry[key] >= 0 && entry[key] <= 10) &&
    Array.isArray(entry.feelings) && entry.feelings.every((item: unknown) => typeof item === 'string') &&
    Array.isArray(entry.influences) && entry.influences.every((item: unknown) => typeof item === 'string') &&
    typeof entry.note === 'string');
}

export const reflectionTests = [
  {
    id: 'balance',
    title: 'Мой эмоциональный баланс',
    description: 'Небольшая встреча с собой. Заметь, как ты чувствуешь себя в последнее время.',
    color: 'lime',
    questions: [
      'В последнее время я чувствую внутреннее спокойствие.',
      'У меня остаются силы на то, что мне нравится.',
      'Я могу замечать свои чувства, не осуждая себя.',
      'После напряжённого дня мне удаётся восстановиться.',
      'Я чувствую, что могу обратиться за поддержкой.',
    ],
  },
  {
    id: 'care',
    title: 'Есть ли у меня место для себя?',
    description: 'Посмотри, хватает ли в твоём дне отдыха, внимания и маленьких радостей.',
    color: 'blue',
    questions: [
      'Я даю себе отдых, не дожидаясь полного истощения.',
      'Я замечаю сигналы своего тела и прислушиваюсь к ним.',
      'Я могу сказать «нет», если мне что-то не подходит.',
      'В моём дне есть хотя бы немного времени для себя.',
      'Я отношусь к себе так же бережно, как к близкому человеку.',
    ],
  },
];

export function reflectionResult(score: number) {
  if (score <= 5) return {
    title: 'Сейчас особенно важна забота',
    text: 'Похоже, твоих сил сейчас немного. Можно снизить требования к себе и выбрать один маленький шаг: отдых, еду, прогулку или разговор с близким. Если тяжёлое состояние сохраняется, стоит обратиться к психологу.',
  };
  if (score <= 10) return {
    title: 'Найди немного места для себя',
    text: 'Ты уже замечаешь свои потребности. Попробуй добавить в день одну небольшую опору: спокойное утро, перерыв без телефона или время на любимое занятие. Не всё нужно менять сразу.',
  };
  return {
    title: 'У тебя есть внутренние опоры',
    text: 'Сейчас в твоей жизни есть место вниманию к себе. Заметь, что помогает тебе чувствовать себя так, и бережно сохрани эти привычки. При этом любые непростые чувства тоже нормальны.',
  };
}
