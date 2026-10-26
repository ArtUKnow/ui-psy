"""Non-empty SQLite -> PostgreSQL migration check on synthetic data created through the legacy Python API."""
import http.cookiejar
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
stamp = time.strftime('%Y%m%d%H%M%S')
database = 'ui_psy_migration_' + stamp
out = ROOT / 'server-go/reports' / ('migration-' + stamp)
out.mkdir(parents=True, mode=0o700)
work = Path(tempfile.mkdtemp(prefix='ui-psy-migration-'))
sqlite_path, export_path = work / 'fixture.sqlite3', work / 'export.json'
console = (out / 'console.log').open('ab')
tables = ['users', 'sessions', 'access_tokens', 'documents', 'doctor_invites', 'doctor_links', 'care_plans', 'care_messages']
checks = []
base = ''
def jar():
    return urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def call(client, path, method='GET', body=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token: headers['Authorization'] = 'Bearer ' + token
    data = json.dumps(body).encode() if body is not None else (b'' if method == 'POST' else None)
    try: res = client.open(urllib.request.Request(base + path, data=data, headers=headers, method=method), timeout=15)
    except urllib.error.HTTPError as e: res = e
    with res:
        return res.status, json.load(res)
def check(name, ok, detail=None):
    checks.append({'check': name, 'ok': bool(ok), **({'detail': detail} if detail is not None and not ok else {})})
    print(('PASS ' if ok else 'FAIL ') + name, flush=True)
def wait(port):
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        try:
            if json.load(urllib.request.build_opener(urllib.request.ProxyHandler({})).open(f'http://127.0.0.1:{port}/api/health', timeout=2)).get('status') == 'ok': return
        except OSError: time.sleep(.1)
    raise RuntimeError(f'server on {port} did not start')
def stop(proc):
    proc.terminate()
    proc.wait(timeout=10)

# 1. Legacy runtime creates the fixture through its own API.
base = 'http://127.0.0.1:8918'
legacy = subprocess.Popen([sys.executable, '-I', str(ROOT / 'server/app.py'), '--port', '8918', '--db', str(sqlite_path)], stdout=console, stderr=console)
accounts, clients = {}, {}
try:
    wait(8918)
    for name, role in [('doctor', 'doctor'), ('patient', 'patient'), ('revoked', 'patient'), ('loggedout', 'patient')]:
        clients[name] = jar()
        status, data = call(clients[name], '/api/auth/register', 'POST', {'email': f'{name}-{stamp}@example.test', 'password': f'synthetic-migration-{name}-2026', 'role': role})
        assert status == 200, (name, status)
        accounts[name] = {'id': data['user']['id'], 'token': data['accessToken'], 'email': f'{name}-{stamp}@example.test', 'password': f'synthetic-migration-{name}-2026'}
    d, p, r = accounts['doctor'], accounts['patient'], accounts['revoked']
    dc, pc, rc = clients['doctor'], clients['patient'], clients['revoked']
    for who, client in [(p, pc), (r, rc)]:
        _, invite = call(dc, '/api/links/invites', 'POST', token=d['token'])
        assert call(client, '/api/links/accept', 'POST', {'code': invite['code']}, who['token'])[0] == 200
    _, spare = call(dc, '/api/links/invites', 'POST', token=d['token'])
    entries = []
    for i in range(3):
        entries.append({'id': f'e{i}', 'mood': 5 + i, 'note': f'Синтетическая запись №{i} — «кавычки», emoji 🌿, \\ слэш'})
        assert call(pc, '/api/data/entries', 'PUT', {'value': entries, 'version': i}, p['token'])[0] == 200
    care = {'events': [{'id': 'signal-1', 'kind': 'safety', 'text': 'Синтетический сигнал', 'createdAt': '2026-10-26T12:00:00Z'}], 'sessions': [], 'health': []}
    assert call(pc, '/api/data/care', 'PUT', {'value': care, 'version': 0}, p['token'])[0] == 200
    assert call(rc, '/api/data/entries', 'PUT', {'value': [{'id': 'r1', 'note': 'после отзыва врач не видит'}], 'version': 0}, r['token'])[0] == 200
    plan_path = f"/api/links/patients/{p['id']}/plan"
    plan = {'assignments': [], 'medications': [], 'reviews': [], 'recommendation': 'Синтетический план'}
    assert call(dc, plan_path, 'PUT', {'value': plan, 'version': 0}, d['token'])[0] == 200
    plan['reviews'] = [{'signalId': 'signal-1', 'status': 'closed', 'action': 'Синтетическая беседа', 'updatedAt': '2026-10-26T12:05:00Z'}]
    assert call(dc, plan_path, 'PUT', {'value': plan, 'version': 1}, d['token'])[0] == 200
    for i in range(55):
        sender, client, path = (p, pc, f"/api/links/messages/doctors/{d['id']}") if i % 2 else (d, dc, f"/api/links/messages/patients/{p['id']}")
        assert call(client, path, 'POST', {'text': f'Сообщение {i} ✓', 'clientId': f'm-{i}'}, sender['token'])[0] == 200
    assert call(rc, f"/api/links/doctors/{d['id']}", 'DELETE', token=r['token'])[0] == 200
    assert call(clients['loggedout'], '/api/auth/logout', 'POST')[0] == 200
    # Snapshots of what the legacy runtime returns; Go must return the same JSON.
    views = {
        'patient_me': (pc, '/api/auth/me', p), 'patient_entries': (pc, '/api/data/entries', p), 'patient_care': (pc, '/api/data/care', p),
        'patient_plans': (pc, '/api/links/plans', p), 'patient_doctors': (pc, '/api/links/doctors', p),
        'doctor_patients': (dc, '/api/links/patients', d), 'doctor_patient_detail': (dc, f"/api/links/patients/{p['id']}", d),
        'thread_latest': (pc, f"/api/links/messages/doctors/{d['id']}", p), 'revoked_entries': (rc, '/api/data/entries', r),
    }
    legacy_views = {k: call(c, path, token=who['token']) for k, (c, path, who) in views.items()}
    _, first_page = legacy_views['thread_latest']
    legacy_views['thread_older'] = call(pc, f"/api/links/messages/doctors/{d['id']}?before={first_page['messages'][0]['id']}", token=p['token'])
    legacy_doctor_on_revoked = call(dc, f"/api/links/patients/{r['id']}", token=d['token'])[0]
finally:
    stop(legacy)

# 2. Consistent read-only export after the legacy process has stopped.
source_counts = {t: sqlite3.connect(f'file:{sqlite_path}?mode=ro', uri=True).execute(f'SELECT count(*) FROM {t}').fetchone()[0] for t in tables}
subprocess.run([sys.executable, '-I', str(ROOT / 'scripts/export_legacy.py'), str(sqlite_path), str(export_path)], check=True, stdout=console, stderr=console)
check('export file mode is 0600', (export_path.stat().st_mode & 0o777) == 0o600)
check('fixture is non-empty in every table', all(source_counts.values()), source_counts)

# 3. Import into a new empty PostgreSQL database, then prove a second import is refused.
subprocess.run(['createdb', database], check=True, capture_output=True)
env = {**os.environ, 'DATABASE_URL': f'postgres:///{database}?host=/tmp', 'UI_PSY_LOG_PATH': str(out / 'server.jsonl'), 'UI_PSY_BACKUP_DIR': str(out / 'backups')}
env.pop('GIGACHAT_CREDENTIALS', None)
go = [str(ROOT / 'server-go/bin/ui-psy'), '--root', str(ROOT)]
check('import into empty PostgreSQL succeeds', subprocess.run(go + ['--import-json', str(export_path)], env=env, stdout=console, stderr=console).returncode == 0)
check('second import into non-empty target is refused', subprocess.run(go + ['--import-json', str(export_path)], env=env, stdout=console, stderr=console).returncode != 0)
target_counts = {t: int(subprocess.run(['psql', '-At', '-h', '/tmp', '-d', database, '-c', f'SELECT count(*) FROM {t}'], check=True, capture_output=True, text=True).stdout) for t in tables}
check('row counts match per table', source_counts == target_counts, {'sqlite': source_counts, 'postgres': target_counts})

# 4. Go runtime on the migrated database must behave like the legacy one.
base = 'http://127.0.0.1:8919'
server = subprocess.Popen(go + ['--port', '8919'], env=env, stdout=console, stderr=console)
try:
    wait(8919)
    for key, (c, path, who) in views.items():
        got = call(c, path, token=who['token'])
        check(f'same response after migration: {key}', got == legacy_views[key], {'legacy': legacy_views[key], 'go': got})
    got = call(pc, f"/api/links/messages/doctors/{d['id']}?before={first_page['messages'][0]['id']}", token=p['token'])
    check('same response after migration: thread_older', got == legacy_views['thread_older'], {'legacy': legacy_views['thread_older'], 'go': got})
    check('revoked consent stays revoked', call(dc, f"/api/links/patients/{r['id']}", token=d['token'])[0] == legacy_doctor_on_revoked == 403)
    for name, who in accounts.items():
        status, _ = call(jar(), '/api/auth/login', 'POST', {'email': who['email'], 'password': who['password']})
        check(f'legacy PBKDF2 password still logs in: {name}', status == 200, status)
    check('wrong password is rejected', call(jar(), '/api/auth/login', 'POST', {'email': p['email'], 'password': 'wrong-password-123456'})[0] == 401)
    status, rotated = call(pc, '/api/auth/refresh', 'POST')
    check('legacy refresh cookie rotates on Go', status == 200 and bool(rotated.get('accessToken')), status)
    check('logged-out legacy session stays revoked', call(clients['loggedout'], '/api/auth/refresh', 'POST')[0] == 401)
    token = rotated.get('accessToken')
    check('stale document version is rejected with 409', call(pc, '/api/data/entries', 'PUT', {'value': [], 'version': 2}, token)[0] == 409)
    status, saved = call(pc, '/api/data/entries', 'PUT', {'value': entries + [{'id': 'after'}], 'version': 3}, token)
    check('save continues from migrated version', status == 200 and saved.get('version') == 4, saved)
    status, sent = call(pc, f"/api/links/messages/doctors/{d['id']}", 'POST', {'text': 'После миграции', 'clientId': 'after-migration'}, token)
    check('message id sequence continues after migrated max', status == 200 and sent['message']['id'] > max(m['id'] for m in first_page['messages']), sent)
    check('idempotent retry of a migrated clientId returns 200', call(pc, f"/api/links/messages/doctors/{d['id']}", 'POST', {'text': 'Сообщение 1 ✓', 'clientId': 'm-1'}, token)[0] == 200)
    new = jar()
    status, newcomer = call(new, '/api/auth/register', 'POST', {'email': f'newcomer-{stamp}@example.test', 'password': 'synthetic-migration-new-2026'})
    check('unused legacy invite is accepted on Go', status == 200 and call(new, '/api/links/accept', 'POST', {'code': spare['code']}, newcomer['accessToken'])[0] == 200)
finally:
    stop(server)

summary = {'time_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'database': database, 'scope': 'synthetic fixture created through the legacy Python API; not production data',
           'source_counts': source_counts, 'target_counts': target_counts, 'passed': sum(c['ok'] for c in checks), 'failed': sum(not c['ok'] for c in checks), 'checks': checks}
(out / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2))
os.chmod(out / 'summary.json', 0o600)
for f in [export_path, sqlite_path, *work.glob('fixture.sqlite3-*')]: f.unlink(missing_ok=True)
work.rmdir()
print(json.dumps({k: summary[k] for k in ['database', 'passed', 'failed']}))
sys.exit(1 if summary['failed'] else 0)
