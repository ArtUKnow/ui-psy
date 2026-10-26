"""Live provider verification with synthetic messages; never writes credentials/tokens."""
import http.cookiejar
import json
from pathlib import Path
import time
import urllib.error
import urllib.request
import uuid

BASE = 'http://127.0.0.1:8818'
client = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def req(path, body=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token: headers['Authorization'] = 'Bearer ' + token
    request = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, headers=headers)
    try: response = client.open(request, timeout=60)
    except urllib.error.HTTPError as error: response = error
    with response: return response.status, json.load(response), response.headers.get('X-Request-ID')

status, account, _ = req('/api/auth/register', {'email': f'giga-{uuid.uuid4().hex}@example.test', 'password': 'synthetic-live-provider-password'})
assert status == 200
token = account['accessToken']
allowed = {'who-stress-2020', 'nhs-breathing'}
prompts = ['Хочу немного отвлечься после работы', 'Хочу спокойное упражнение на дыхание', 'Хочу понять, какое маленькое дело сейчас для меня важно', 'Нужна короткая практика, чтобы заметить окружающее', 'Хочу спокойно завершить день']
results = []
for text in prompts:
    start = time.monotonic()
    status, body, request_id = req('/api/ai/chat', {'message': text, 'consent': True}, token)
    result = {'status': status, 'duration_seconds': round(time.monotonic() - start, 3), 'request_id': request_id, 'synthetic_input': text, 'response': body}
    results.append(result)
    if status != 200: break
    assert body['provider'] == 'GigaChat' and body['message'] and body['sources']
    assert all(source['id'] in allowed and source['url'].startswith('https://') for source in body['sources'])
report = {'live_provider': True, 'synthetic_only': True, 'requests': results, 'successful': sum(item['status'] == 200 for item in results), 'scope': 'Source coverage for responses from the supported-practices catalog; not clinical validation'}
folder = Path(__file__).resolve().parent / 'reports'
folder.mkdir(exist_ok=True)
(folder / 'gigachat-live.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps({'requests': len(results), 'successful': report['successful'], 'statuses': [item['status'] for item in results], 'seconds': [item['duration_seconds'] for item in results]}))
assert report['successful'] == len(prompts), 'Live GigaChat verification failed; inspect redacted reports'
