"""Crash/restart and actual pg_dump/pg_restore drill, using new synthetic databases."""
import http.cookiejar
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
stamp = time.strftime('%Y%m%d%H%M%S')
database, restored = 'ui_psy_recovery_' + stamp, 'ui_psy_restored_' + stamp
out = ROOT / 'server-go/reports' / ('recovery-' + stamp)
out.mkdir(parents=True, mode=0o700)
for name in [database, restored]:
    subprocess.run(['createdb', name], check=True, capture_output=True)
base = 'http://127.0.0.1:8718'
client = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
console = (out / 'console.log').open('ab')
backups = out / 'backups'
def launch(db):
    env = {**os.environ, 'DATABASE_URL': f'postgres:///{db}?host=/tmp', 'UI_PSY_LOG_PATH': str(out / ('server-' + db + '.jsonl')), 'UI_PSY_BACKUP_DIR': str(backups), 'UI_PSY_BACKUP_INTERVAL': '60s'}
    return subprocess.Popen([str(ROOT / 'server-go/bin/ui-psy'), '--root', str(ROOT), '--port', '8718'], env=env, stdout=console, stderr=console)
def req(path, body=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token: headers['Authorization'] = 'Bearer ' + token
    r = urllib.request.Request(base + path, data=json.dumps(body).encode() if body is not None else None, headers=headers, method='POST' if body is not None else 'GET')
    if path.startswith('/api/data/') and body is not None: r.method = 'PUT'
    try: res = client.open(r, timeout=15)
    except urllib.error.HTTPError as e: res = e
    with res:
        status, data = res.status, json.load(res)
    if status >= 400: raise RuntimeError(f'{path}: HTTP {status}')
    return data
def healthy():
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        try:
            if req('/api/health')['status'] == 'ok': return
        except (OSError, RuntimeError): pass
        time.sleep(.1)
    raise RuntimeError('Server did not recover')
def account(role):
    return req('/api/auth/register', {'email': f'{role}-{stamp}-{uuid.uuid4().hex}@example.test', 'password': 'synthetic-recovery-password', 'role': role})
proc = launch(database)
try:
    healthy()
    doctor, patient = account('doctor'), account('patient')
    dt, pt = doctor['accessToken'], patient['accessToken']
    invite = req('/api/links/invites', {}, dt)
    req('/api/links/accept', {'code': invite['code']}, pt)
    acknowledged, messages = [], []
    version = 0
    begin = time.monotonic()
    while True:
        seq = len(acknowledged) + 1
        entry = {'id': f'recovery-{seq}', 'sequence': seq, 'createdAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'committedAtEpoch': time.time(), 'note': 'synthetic recovery evidence'}
        data = req('/api/data/entries', {'value': acknowledged + [entry], 'version': version}, pt)
        assert data['version'] == version + 1 and data['value'][-1] == entry
        version += 1; acknowledged.append(entry)
        if seq % 10 == 0:
            message = req('/api/links/messages/doctors/' + doctor['user']['id'], {'text': 'synthetic critical message ' + str(seq), 'clientId': 'critical-' + str(seq)}, pt)['message']
            messages.append(message)
        snapshots = sorted(backups.glob('*.dump')) if backups.exists() else []
        if len(snapshots) >= 2 and time.monotonic() - begin > 64: break
        if time.monotonic() - begin > 120: raise RuntimeError('Periodic backup did not complete')
        time.sleep(.1)
    crash_at = time.time(); crash_start = time.monotonic()
    proc.kill(); proc.wait(timeout=5)
    snapshot = sorted(backups.glob('*.dump'))[-1]
    proc = launch(database); healthy()
    process_rto = time.monotonic() - crash_start
    current = req('/api/data/entries', token=pt)
    assert current['value'] == acknowledged and current['version'] == version
    actual = []; before = 0
    while True:
        page = req('/api/links/messages/patients/' + patient['user']['id'] + '?before=' + str(before), token=dt)
        actual = page['messages'] + actual
        if not page['hasMore']: break
        before = page['messages'][0]['id']
    assert actual == messages
    proc.terminate(); proc.wait(timeout=10)
    restore_start = time.monotonic()
    subprocess.run(['pg_restore', '--exit-on-error', '--single-transaction', '--no-owner', '--dbname', restored, str(snapshot)], check=True, stdout=console, stderr=console)
    proc = launch(restored); healthy()
    backup_rto = time.monotonic() - restore_start
    recovered = req('/api/data/entries', token=pt)
    prefix = recovered['value']
    assert prefix and prefix == acknowledged[:len(prefix)] and recovered['version'] == len(prefix)
    rpo = crash_at - prefix[-1]['committedAtEpoch']
    report = {'synthetic_only': True, 'backup_interval_seconds': 60, 'acknowledged_records': len(acknowledged), 'acknowledged_messages': len(messages), 'process_crash': {'rto_seconds': round(process_rto, 3), 'lost_acknowledged_records': 0, 'lost_acknowledged_messages': 0}, 'database_loss_restore': {'rto_seconds': round(backup_rto, 3), 'rpo_seconds': round(rpo, 3), 'records_recovered': len(prefix), 'records_after_snapshot_not_recovered': len(acknowledged) - len(prefix), 'archive': snapshot.name}, 'targets': {'rto_seconds': 900, 'rpo_seconds': 300}, 'scope': 'local synthetic drill; process restart and separate database restored from real archive; not a geographically isolated backup'}
    assert process_rto <= 900 and backup_rto <= 900 and rpo <= 300
    (out / 'summary.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps(report, ensure_ascii=False, indent=2))
finally:
    proc.terminate()
    try: proc.wait(timeout=10)
    except subprocess.TimeoutExpired: proc.kill(); proc.wait()
    console.close()
