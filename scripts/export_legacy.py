"""Read-only, consistent export for the Go importer. The output contains private data."""
import argparse
import base64
import json
import os
import sqlite3
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
tables = ['users', 'sessions', 'access_tokens', 'documents', 'doctor_invites', 'doctor_links', 'care_plans', 'care_messages']
db = sqlite3.connect(f'file:{args.source.resolve()}?mode=ro', uri=True)
db.row_factory = sqlite3.Row
db.execute('BEGIN')
data = {name: [{key: base64.b64encode(value).decode() if isinstance(value, bytes) else value for key, value in dict(row).items()} for row in db.execute(f'SELECT * FROM {name}')] for name in tables}
args.output.parent.mkdir(parents=True, exist_ok=True)
fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as out:
    json.dump(data, out, ensure_ascii=False)
print(json.dumps({name: len(rows) for name, rows in data.items()}))
db.close()
