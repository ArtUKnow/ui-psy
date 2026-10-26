"""Live comparison on synthetic prompts: UI-PSY catalog mode vs open-ended GigaChat chat.
Measures tokens, cost, latency and whether cited source URLs actually open. Never prints credentials or tokens.
Run with .env.local loaded and the Go server with the same key on :8818."""
import http.cookiejar
import json
import os
from pathlib import Path
import re
import ssl
import subprocess
import time
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
PRICE = {'GigaChat-2': 0.065, 'GigaChat-2-Pro': 0.5, 'GigaChat-2-Max': 0.65}  # ₽ per 1000 tokens incl. VAT, legal-entity pay-as-you-go, 27.10.2026
PROMPTS = ['Хочу немного отвлечься после работы', 'Хочу спокойное упражнение на дыхание', 'Мне тревожно перед завтрашним экзаменом',
           'Не могу уснуть, мысли крутятся', 'Хочу понять, какое маленькое дело сейчас важно', 'Чувствую напряжение в теле после ссоры',
           'Устал и ничего не хочется', 'Нужна короткая практика, чтобы заметить окружающее', 'Хочу спокойно завершить день', 'Переживаю из-за работы']
OPEN_SYSTEM = 'Ты помощник психологической поддержки. Кратко ответь пользователю и предложи одно упражнение. Обязательно укажи 1–3 источника со ссылками (полные URL) на авторитетные материалы, на которых основан совет.'
ca = ssl.create_default_context()
ca.load_verify_locations(str(ROOT / os.environ.get('GIGACHAT_CA_FILE', 'server-go/certs/russian_trusted_root_ca.pem')))
https = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ca))

def post(url, data, headers):
    with https.open(urllib.request.Request(url, data=data, headers=headers, method='POST'), timeout=60) as r:
        return json.load(r)
token = post(os.environ['GIGACHAT_OAUTH_URL'], f"scope={os.environ['GIGACHAT_SCOPE']}".encode(),
             {'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json', 'RqUID': str(uuid.uuid4()), 'Authorization': 'Basic ' + os.environ['GIGACHAT_CREDENTIALS']})['access_token']
base = os.environ['GIGACHAT_BASE_URL'].rstrip('/')

link_cache = {}
def opens(url):
    if url not in link_cache:
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (link check)'})
            with urllib.request.urlopen(req, timeout=12) as r: link_cache[url] = r.status
        except urllib.error.HTTPError as e: link_cache[url] = e.code
        except Exception as e: link_cache[url] = type(e).__name__
    return link_cache[url]

rows = []
for model in PRICE:
    for text in PROMPTS:
        payload = {'model': model, 'messages': [{'role': 'system', 'content': OPEN_SYSTEM}, {'role': 'user', 'content': text}], 'temperature': 0.1, 'max_tokens': 600}
        start = time.monotonic()
        body = post(base + '/chat/completions', json.dumps(payload).encode(), {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token})
        seconds = time.monotonic() - start
        answer = body['choices'][0]['message']['content']
        urls = sorted({u.rstrip('.,);»"\'') for u in re.findall(r'https?://[^\s)\]»"\'<>]+', answer)})
        statuses = {u: opens(u) for u in urls}
        rows.append({'mode': 'open-chat', 'model': model, 'prompt': text, 'seconds': round(seconds, 3), 'usage': body.get('usage', {}),
                     'urls': statuses, 'working_urls': sum(isinstance(s, int) and s < 400 for s in statuses.values()), 'answer_chars': len(answer)})
        print(model, len(urls), 'urls', statuses, flush=True)

# UI-PSY mode through the real API; token counts come from the server's gigachat_usage log lines.
log = ROOT / 'server-go/logs/ai-live-server.jsonl'
before = log.read_text().count('"gigachat_usage"')
client = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def api(path, body, tok=None):
    h = {'Content-Type': 'application/json', **({'Authorization': 'Bearer ' + tok} if tok else {})}
    with client.open(urllib.request.Request('http://127.0.0.1:8818' + path, data=json.dumps(body).encode(), headers=h), timeout=60) as r: return json.load(r)
user = api('/api/auth/register', {'email': f'compare-{uuid.uuid4().hex}@example.test', 'password': 'synthetic-compare-password-2026'})
for text in PROMPTS:
    start = time.monotonic()
    body = api('/api/ai/chat', {'message': text, 'consent': True}, user['accessToken'])
    statuses = {s['url']: opens(s['url']) for s in body['sources']}
    rows.append({'mode': 'ui-psy-catalog', 'model': 'GigaChat-2-Pro', 'prompt': text, 'seconds': round(time.monotonic() - start, 3), 'urls': statuses,
                 'working_urls': sum(isinstance(s, int) and s < 400 for s in statuses.values()), 'answer_chars': len(body['message'])})
    time.sleep(0.3)
usage = [json.loads(l) for l in log.read_text().splitlines() if '"gigachat_usage"' in l][before:]
for row, u in zip([r for r in rows if r['mode'] == 'ui-psy-catalog'], usage):
    row['usage'] = {'prompt_tokens': u['prompt_tokens'], 'completion_tokens': u['completion_tokens'], 'total_tokens': u['total_tokens']}

summary = {}
for key in sorted({(r['mode'], r['model']) for r in rows}):
    group = [r for r in rows if (r['mode'], r['model']) == key]
    tokens = [r['usage'].get('total_tokens', 0) for r in group]
    cited = sum(len(r['urls']) for r in group)
    summary[f'{key[0]} / {key[1]}'] = {
        'requests': len(group), 'avg_total_tokens': round(sum(tokens) / len(group), 1), 'avg_rub_per_request': round(sum(tokens) / len(group) / 1000 * PRICE[key[1]], 4),
        'avg_seconds': round(sum(r['seconds'] for r in group) / len(group), 2), 'answers_with_sources': sum(bool(r['urls']) for r in group),
        'answers_with_working_source': sum(r['working_urls'] > 0 for r in group), 'cited_urls': cited, 'working_urls': sum(r['working_urls'] for r in group)}
out = ROOT / 'server-go/reports/llm-compare'
out.mkdir(parents=True, exist_ok=True)
(out / 'summary.json').write_text(json.dumps({'time_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'prices_rub_per_1k': PRICE, 'scope': 'synthetic prompts; source link availability, cost and latency only; not clinical quality', 'summary': summary, 'rows': rows}, ensure_ascii=False, indent=2))
print(json.dumps(summary, ensure_ascii=False, indent=2))
