"""Build self-report questionnaire data from the user-supplied source files.

Reads text extracted from the supplied DOCX/PDF files in /tmp/ui-psy-source-text.
The generated JSON is checked in so the app does not need these files at runtime.
"""
import json
import re
from pathlib import Path

SOURCE = Path('/tmp/ui-psy-source-text')
OUT = Path(__file__).resolve().parents[1] / 'src/lib/questionnaires.json'


def text(index):
    return (SOURCE / f'{index:02d}.txt').read_text().replace('\u00a0', ' ')


def clean(value):
    return re.sub(r'\s+', ' ', value).strip()


def fixed(options, scores=None):
    return [{'label': label, 'score': score} for label, score in zip(options, scores if scores is not None else range(len(options)))]


def table(index, start='Бланк для заполнения', end='Обработка результатов'):
    body = text(index).split(start, 1)[1].split(end, 1)[0]
    return [clean(match.group(2)) for line in body.splitlines() if (match := re.match(r'^\s*(\d+)\s*\|\s*(.*?)\s*\|', line))]


def numbered(index, start, end, pattern=r'^\s*(\d{1,2})\.\s+(.+)'):
    body = text(index).split(start, 1)[1].split(end, 1)[0]
    result = []
    for line in body.splitlines():
        line = clean(line)
        if not line:
            continue
        match = re.match(pattern, line)
        if match and int(match.group(1)) == len(result) + 1:
            result.append(match.group(2))
        elif result:
            result[-1] += ' ' + line
    return [clean(item) for item in result]


def questionnaire(id, title, source, instruction, questions, category='self', scoring='sum', key=''):
    return {'id': id, 'title': title, 'source': source, 'instruction': clean(instruction), 'category': category, 'scoring': scoring, 'key': clean(key), 'questions': questions}


def questions(items, options):
    return [{'text': item, 'options': options} for item in items]


data = []
algo = text(1)

# Four self-report screens provided in the algorithm document.
phq4_section = algo.split('Шкала PHQ-4 -', 1)[1].split('Шкала PHQ-9', 1)[0]
phq4 = [clean(m.group(1)) for m in re.finditer(r'(?m)^\s*[1-4]\s+([^\n]+)', phq4_section) if not m.group(1).lstrip().startswith('–')]
phq4_options = fixed(['Совсем нет', 'В течение нескольких дней', 'Более, чем половину этого времени', 'Почти каждый день'])
data.append(questionnaire('phq4', 'PHQ-4', 'Алгоритм.docx', 'Краткий модуль опросника PHQ, объединяющий по два пункта из PHQ-9 и GAD-7.', questions(phq4, phq4_options), 'screening', 'phq4', 'Сумма баллов по ответу 1 и 2 = 3 и более говорит о клинически значимом уровне тревоги. Сумма баллов по вопросам 3 и 4 = 3 и более говорит о клинически значимом уровне депрессии.'))

phq9_section = algo.split('Шкала PHQ-9', 1)[1].split('Шкала ГТР-7', 1)[0]
phq9 = [clean(m.group(2)) for line in phq9_section.splitlines() if (m := re.match(r'^\s*(\d+)\.\s*(.*?)\s*\|', line))]
phq9_options = fixed(['Не беспокоили', 'Несколько дней', 'Более половины всех дней', 'Почти ежедневно'])
data.append(questionnaire('phq9', 'PHQ-9', 'Алгоритм.docx', 'В течение последних двух недель, как часто вас беспокоили следующие проблемы?', questions(phq9, phq9_options), 'screening', 'sum', '0–4 — нет депрессии; 5–9 — низкий риск; 10–14 — умеренный риск; 15–19 — высокий риск; 20–27 — крайне высокий риск. Вопрос 9 оценивается отдельно.'))

gad_section = algo.split('Шкала ГТР-7', 1)[1].split('Шкала послеродовой депрессии', 1)[0]
gad = [clean(m.group(2)) for line in gad_section.splitlines() if (m := re.match(r'^\s*(\d+)\.\s*(.*?)\s*\|', line))]
gad_options = fixed(['Никогда', 'Несколько дней', 'Более половины дней', 'Почти каждый день'])
data.append(questionnaire('gad7', 'ГТР-7', 'Алгоритм.docx', 'Как часто за последние 2 недели Вас беспокоили следующие проблемы?', questions(gad, gad_options), 'screening', 'sum', '0–4 — минимальный; 5–9 — умеренный; 10–14 — средний; 15–21 — высокий уровень тревожности.'))

epds_section = algo.split('Шкала послеродовой депрессии (EPDS)', 1)[1].split('Гериатрическая шкала депрессии', 1)[0]
epds = []
for line in epds_section.splitlines():
    line = clean(line)
    q = re.match(r'^(\d+)\.\s+(.+)', line)
    option = re.match(r'^([АБВГ])\)\s+(.+)', line)
    if q and int(q.group(1)) == len(epds) + 1:
        epds.append({'text': q.group(2), 'options': []})
    elif option and epds:
        n = len(epds)
        i = len(epds[-1]['options'])
        epds[-1]['options'].append({'label': f'{option.group(1)}) {option.group(2)}', 'score': i if n in (1, 2, 4) else 3 - i})
data.append(questionnaire('epds', 'EPDS', 'Алгоритм.docx', 'Вы сейчас беременны или недавно родили. Нам важно знать, как вы себя чувствуете. Пожалуйста, поставьте галочку напротив утверждения, которое наиболее подходит к тому, как вы себя чувствовали в последние 7 дней. Ответьте на все 10 пунктов. Это скрининг-тест, он не является диагнозом.', epds, 'screening', 'sum', 'Пункты 1, 2, 4 — прямые; остальные — обратные. Вопрос 10 оценивается отдельно.'))

# Attached patient-completed scales.
dass_options = fixed(['Никогда', 'Редко', 'Часто', 'Почти всегда'])
data.append(questionnaire('dass21', 'DASS-21', 'Шкалы депрессии, тревоги и стресса DASS-21.docx', text(3).split('Инструкция\n',1)[1].split('ФИО',1)[0], questions(table(3), dass_options), 'self', 'dass21', text(3).split('Обработка результатов (ключи)',1)[1]))

ces_options = fixed(['Очень редко или никогда', 'Иногда', 'Значительную часть времени', 'Практически всё время'])
ces = [{'text': item, 'options': fixed([o['label'] for o in ces_options], [3-i if n in (4,8,12,16) else i for i in range(4)])} for n,item in enumerate(table(4),1)]
data.append(questionnaire('cesd', 'CES-D', 'Шкала CES-D.docx', text(4).split('Инструкция\n',1)[1].split('ФИО',1)[0], ces, 'self', 'sum', text(4).split('Обработка результатов (ключи)',1)[1]))

# HADS contains distinct per-question options and their scores.
hads_body = text(2).split('Т Д',1)[1].split('Сумма баллов Тревога',1)[0]
hads = []
for line in hads_body.splitlines():
    line = clean(line)
    q = re.match(r'^(\d+)\.\s+(.+)', line)
    option = re.match(r'^\((\d)\)\s+(.+)', line)
    if q and int(q.group(1)) == len(hads)+1:
        hads.append({'text':q.group(2),'options':[]})
    elif option and hads:
        hads[-1]['options'].append({'label':option.group(2),'score':int(option.group(1))})
    elif hads and line:
        if hads[-1]['options']:
            hads[-1]['options'][-1]['label'] += ' '+line
        else:
            hads[-1]['text'] += ' '+line
data.append(questionnaire('hads', 'HADS', 'HADS (1).pdf', 'Бланк русскоязычной версии Госпитальной шкалы тревоги и депрессии.', hads, 'self', 'hads', text(2).split('Интерпретация',1)[1]))

# Spielberger-Khanin: retain source order and reverse-key groups as supplied.
spiel_body = text(5).split('Шкала ситуативной тревожности',1)[1].split('Подсчет баллов:',1)[0]
spiel = []
for line in spiel_body.splitlines():
    line = clean(line)
    m = re.match(r'^(\d{1,2})\s+(.+)',line)
    if m and int(m.group(1)) == len(spiel)+1:
        spiel.append({'text':m.group(2),'options':[]})
    elif spiel and len(spiel) != 20 and line and line != '1 2 3 4' and not line.startswith(('Инструкция','Прочитайте','зачеркните','поскольку','или неправильных','№','пп','Суждение','Шкала личной')):
        if line.endswith('1 2 3 4'):
            spiel[-1]['text'] += ' '+line[:-7].strip()
        else:
            spiel[-1]['text'] += ' '+line
    if spiel and spiel[-1]['text'].endswith('1 2 3 4'):
        spiel[-1]['text'] = spiel[-1]['text'][:-7].strip()
spiel_reverse = {1,2,5,8,10,11,13,16,19,20,21,26,27,30,33,36,39}
for n,item in enumerate(spiel,1):
    item['text'] = clean(item['text'].replace('1 2 3 4',''))
    item['options'] = fixed(['Никогда', 'Почти никогда', 'Часто', 'Почти всегда'], [5-v if n in spiel_reverse else v for v in (1,2,3,4)])
data.append(questionnaire('spielberger', 'Шкала тревожности Спилбергера-Ханина', 'Шкала тревожности Спилбергера-Ханина.pdf', 'Ситуативная тревожность: как Вы чувствуете себя в данный момент. Личная тревожность: как Вы чувствуете себя обычно.', spiel, 'self', 'spielberger', text(5).split('Подсчет баллов:',1)[1]))

sheehan_options = fixed(['Нисколько', 'Немного', 'Умеренно', 'Сильно', 'Крайне сильно'])
data.append(questionnaire('sheehan', 'Шкала тревоги Шихана', 'Шкала тревоги Шихана.pdf', 'Определите, насколько Вас беспокоили в течение последней недели указанные ниже симптомы.', questions(numbered(6, 'В течение последней недели (7 дней)', 'Ключ (интерпретация):'), sheehan_options), 'self', 'sum', text(6).split('Ключ (интерпретация):',1)[1]))

beck_anx_options = fixed(['Совсем не беспокоил', 'Слегка. Не слишком меня беспокоил', 'Умеренно. Это было неприятно, но я мог это переносить', 'Очень сильно. Я с трудом мог это выносить'])
data.append(questionnaire('beck-anxiety', 'Шкала тревоги Бека', 'Шкала тревоги Бека.pdf', 'Отметьте, насколько Вас беспокоил каждый симптом в течение последней недели, включая сегодняшний день.', questions(numbered(8, 'Инструкция', 'Ключ (интерпретация)', pattern=r'^\s*(\d{1,2})\.\s+(.+)'), beck_anx_options), 'self', 'sum', text(8).split('Ключ (интерпретация)',1)[1]))

zung_labels = ['Никогда или изредка','Иногда','Часто','Почти всегда или постоянно']
zung_reverse = {5,9,13,17,19}
zung = [{'text': item, 'options': fixed(zung_labels, [5-v if n in zung_reverse else v for v in (1,2,3,4)])} for n,item in enumerate(table(9),1)]
data.append(questionnaire('zung-anxiety', 'Шкала самооценки тревоги Цунга', 'Шкала самооценки тревоги Цунга.docx', text(9).split('Инструкция\n',1)[1].split('ФИО',1)[0], zung, 'self', 'zung', text(9).split('Обработка результатов (ключи)',1)[1]))

suicide = []
suicide_body = text(10).split('На протяжении прошлого месяца Вы:',1)[1].split('Соответствует ли хотя',1)[0]
weights = [1,2,6,10,10,4]
for line in suicide_body.splitlines():
    line = clean(line)
    m = re.match(r'^(\d)\s+(.+)',line)
    if m and int(m.group(1)) == len(suicide)+1:
        suicide.append({'text':m.group(2),'options':fixed(['Да','Нет'],[weights[len(suicide)],0])})
data.append(questionnaire('suicide-tendencies', 'Шкала оценки суицидальных тенденций', 'Шкала оценки суицидальных тенденций.docx', 'На протяжении прошлого месяца (вопросы 1–5) и на протяжении жизни (вопрос 6).', suicide, 'self', 'sum', '1–5 баллов — низкий; 6–9 баллов — средний; >10 баллов — высокий риск в настоящeе время.'))

# BDI-II has per-question answer descriptions and two seven-option questions.
bdi_body = text(12).split('1. Печаль',1)[1].split('Интерпретация результатов',1)[0]
bdi = [{'text':'Печаль','options':[]}]
for line in bdi_body.splitlines():
    line = clean(line)
    if not line: continue
    m = re.match(r'^(\d{1,2})\.?\s+([^\d].+)$',line)
    if m and int(m.group(1)) == len(bdi)+1 and (len(bdi[-1]['options']) >= 4 or len(bdi[-1]['options']) == 7):
        bdi.append({'text':m.group(2),'options':[]}); continue
    option = re.match(r'^([0-3])([ab])?\.\s+(.+)',line)
    if option:
        bdi[-1]['options'].append({'label':option.group(3),'score':int(option.group(1))})
    elif bdi[-1]['options']:
        bdi[-1]['options'][-1]['label'] += ' '+line
data.append(questionnaire('beck-depression', 'Шкала депрессии Бека', 'Шкала депрессии Бека.pdf', 'Опросник депрессии Бека, 2-е издание (BDI-II). Выберите одно утверждение в каждой группе.', bdi, 'self', 'sum', text(12).split('Интерпретация результатов',1)[1]))

# Wayne has eleven numbered groups and fourteen yes/no subitems.
wayne_lines = text(14).split('Содержание (шаблон):',1)[1].split('Ключ (интерпретация):',1)[0].splitlines()
wayne = []
group = ''
for line in wayne_lines:
    cells = [clean(c) for c in line.split('|')]
    if re.match(r'^\d+\.',cells[0]):
        group = cells[0]
        if len(cells) < 4 or cells[1] != 'Да': continue
    if len(cells) >= 4 and cells[1] == 'Да' and cells[-1].isdigit():
        label = cells[0] if cells[0].startswith(tuple(str(n)+'.' for n in range(1,12))) else f'{group} {cells[0]}'
        wayne.append({'text':label,'options':fixed(['Да','Нет'],[int(cells[-1]),0])})
data.append(questionnaire('wayne', 'Шкала Вейна', 'Шкала Вейна.docx', text(14).split('Содержание (шаблон):',1)[0], wayne, 'self', 'sum', text(14).split('Ключ (интерпретация):',1)[1]))

hopeless_no = {1,3,5,6,8,10,13,15,19}
hopeless = [{'text':item,'options':fixed(['Да','Нет'],[0,1] if n in hopeless_no else [1,0])} for n,item in enumerate(table(15),1)]
data.append(questionnaire('beck-hopelessness', 'Шкала безнадёжности Бека', 'Шкала безнадёжности Бека.docx', text(15).split('Инструкция\n',1)[1].split('ФИО',1)[0], hopeless, 'self', 'sum', text(15).split('Обработка результатов (ключи)',1)[1]))

geri_anx = [re.sub(r'(?:\s+ДА\s+НЕТ)+$', '', item) for item in numbered(16, 'Опросник тревоги в гериатрии.', 'Ответ «ДА»', pattern=r'^\s*(\d)\.\s+(.+)')]
data.append(questionnaire('geriatric-anxiety', 'Опросник тревоги в гериатрии', 'Опросник тревоги в гериатрии.docx', 'Для самостоятельного заполнения пациентом.', questions(geri_anx,fixed(['ДА','НЕТ'],[1,0])), 'screening', 'sum', 'Ответ «ДА» = 1 балл; «НЕТ» = 0. При результате ≥ 3 баллов источник указывает на тревогу.'))

gds_no = {1,5,7,11,13}
gds = [{'text':item,'options':fixed(['ДА','НЕТ'],[0,1] if n in gds_no else [1,0])} for n,item in enumerate(table(18,start='последние 2 недели.',end='Общий балл:'),1)]
data.append(questionnaire('gds15', 'Гериатрическая шкала депрессии', 'Гериатрическая шкала депрессии.docx', 'Пациент отвечает на вопросы в соответствии со своим эмоциональным состоянием в последние 2 недели.', gds, 'screening', 'sum', text(18).split('Ключ:',1)[1]))

# Clinician-rated forms listed in the supplied general test catalog.
hama = questions(table(7), fixed(['0 — отсутствует', '1 — слабая выраженность', '2 — умеренная', '3 — тяжёлая', '4 — очень тяжёлая']))
data.append(questionnaire('hama', 'Шкала Гамильтона для оценки тревоги', 'Шкала тревоги Гамильтона.docx', clean(text(7).split('Инструкция',1)[1].split('ФИО / шифр:',1)[0]), hama, 'clinician', 'sum', clean(text(7).split('Обработка результатов (ключи)',1)[1])))

madrs = questions(table(11), fixed([f'{score} {"балл" if score == 1 else "балла" if score in (2, 3, 4) else "баллов"}' for score in range(7)]))
data.append(questionnaire('madrs', 'Шкала Монтгомери — Асберга', 'Шкала Монтгомери — Асберг для оценки депрессии.docx', clean(text(11).split('Инструкция',1)[1].split('ФИО / шифр:',1)[0]), madrs, 'clinician', 'sum', clean(text(11).split('Обработка результатов (ключи)',1)[1])))

hamd_body = text(13).split('Сумма баллов:',1)[0]
hamd_headers = list(re.finditer(r'(?m)^(\d{1,2})\.\s+([А-ЯЁ]{3,}[^\n]*)$', hamd_body))
hamd = []
for index, header in enumerate(hamd_headers):
    block = hamd_body[header.end():hamd_headers[index+1].start() if index+1 < len(hamd_headers) else len(hamd_body)]
    option_matches = list(re.finditer(r'(?m)^([0-4])\.\s+(.+)$', block))
    intro = clean(block[:option_matches[0].start()]) if option_matches else ''
    item = {'text': clean(header.group(2) + (' — ' + intro if intro else '')), 'options': []}
    for option_index, option in enumerate(option_matches):
        chunk = block[option.start():option_matches[option_index+1].start() if option_index+1 < len(option_matches) else len(block)]
        lines = [clean(line) for line in chunk.splitlines() if clean(line) not in ('Основание', 'для оценки')]
        label = clean(' '.join(lines))[2:].strip()
        item['options'].append({'label': label, 'score': int(option.group(1))})
    hamd.append(item)
data.append(questionnaire('hamd17', 'Шкала Гамильтона для оценки депрессии', 'Шкала Гамильтона для оценки депрессии.pdf', 'Врач оценивает 17 пунктов по результатам клинического интервью.', hamd, 'clinician', 'sum', clean(text(13).split('Ключ (интерпретация):',1)[1])))

OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n')
for item in data:
    print(item['id'], len(item['questions']), [len(q['options']) for q in item['questions'][:3]])
