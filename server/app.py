"""UI-PSY account and encrypted-transport-ready JSON API. Python standard library only."""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import mimetypes
import os
import secrets
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from typing import Iterator
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
TEST_POLICY = json.loads((ROOT / "src/lib/testPolicy.json").read_text())
TEST_FORMS = json.loads((ROOT / "src/lib/questionnaires.json").read_text())
PATIENT_TEST_IDS = {form["id"] for form in TEST_FORMS if form["category"] != "clinician"} | set(TEST_POLICY["additionalSelfReports"])
DATA_KEYS = {"entries", "preferences", "results", "medications", "doctor-patients", "conversation", "care"}
INVITE_SECONDS = 24 * 60 * 60
ACCESS_SECONDS = 15 * 60
REFRESH_SECONDS = 30 * 24 * 60 * 60
# A just-rotated refresh token stays usable briefly, so a lost response or a racing tab does not end the session.
REFRESH_REUSE_SECONDS = 30
MAX_BODY = 4 * 1024 * 1024
SEVERE_THRESHOLDS = {"phq9": 20, "gad7": 15}
FAILED_LOGINS: dict[str, list[int]] = {}


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


@contextmanager
def connection(path: Path) -> Iterator[sqlite3.Connection]:
    db = sqlite3.connect(path, timeout=30)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    try:
        with db:
            yield db
    finally:
        db.close()


def initialize(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with connection(path) as db:
        db.execute("PRAGMA journal_mode = WAL")
        db.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE,
                salt BLOB NOT NULL, password_hash BLOB NOT NULL, created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                refresh_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL, revoked_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS access_tokens (
                token_hash TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                expires_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS documents (
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                doc_key TEXT NOT NULL, value TEXT NOT NULL, version INTEGER NOT NULL,
                updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, doc_key)
            );
            CREATE INDEX IF NOT EXISTS access_expiry ON access_tokens(expires_at);
            CREATE TABLE IF NOT EXISTS doctor_invites (
                code_hash TEXT PRIMARY KEY,
                doctor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at INTEGER NOT NULL, used_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS doctor_links (
                doctor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                patient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at INTEGER NOT NULL,
                PRIMARY KEY (doctor_id, patient_id)
            );
            CREATE TABLE IF NOT EXISTS care_plans (
                doctor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                patient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                value TEXT NOT NULL, version INTEGER NOT NULL, updated_at INTEGER NOT NULL,
                PRIMARY KEY (doctor_id, patient_id)
            );
            CREATE TABLE IF NOT EXISTS care_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                doctor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                patient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                client_id TEXT NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL,
                UNIQUE(sender_id, client_id)
            );
            CREATE INDEX IF NOT EXISTS care_message_thread ON care_messages(doctor_id, patient_id, id);
            CREATE INDEX IF NOT EXISTS doctor_links_patient ON doctor_links(patient_id);
        """)
        if "role" not in {row["name"] for row in db.execute("PRAGMA table_info(users)")}:
            db.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'patient'")
            db.execute("UPDATE users SET role='doctor' WHERE id IN (SELECT doctor_id FROM doctor_invites UNION SELECT doctor_id FROM doctor_links)")


def validate_patient_results(db, user_id, proposed, previous):
    existing = {item.get("id"): item for item in previous if isinstance(item, dict)}
    allowed = {TEST_POLICY["intro"], *TEST_POLICY["reflectionIds"]}
    intro = sorted([item for item in proposed if isinstance(item, dict) and item.get("testId") == TEST_POLICY["intro"] and isinstance(item.get("createdAt"), str)], key=lambda item: item["createdAt"])
    if intro:
        scores = intro[-1].get("answerScores", intro[-1].get("answers"))
        if isinstance(scores, list) and len(scores) == 4 and all(type(score) is int and 0 <= score <= 3 for score in scores):
            for branch in TEST_POLICY["branches"]:
                if sum(scores[index] for index in branch["items"]) >= branch["minimum"]:
                    allowed.add(branch["id"])
    for row in db.execute("SELECT p.value FROM care_plans p JOIN doctor_links l ON l.doctor_id=p.doctor_id AND l.patient_id=p.patient_id WHERE p.patient_id=?", (user_id,)):
        allowed.update(item.get("testId") for item in json.loads(row["value"]).get("assignments", []) if item.get("testId") in PATIENT_TEST_IDS)
    for item in proposed:
        if not isinstance(item, dict) or not isinstance(item.get("id"), str):
            raise ApiError(400, "Неверный формат результата")
        if existing.get(item["id"]) == item:
            continue
        if item.get("testId") not in allowed:
            raise ApiError(403, "Для этого опросника нужно назначение врача или результат вводной диагностики")


def valid_date(value):
    if not isinstance(value, str):
        return False
    try:
        return datetime.strptime(value, "%Y-%m-%d").strftime("%Y-%m-%d") == value
    except ValueError:
        return False


def validate_plan(value):
    def text(v, limit=2000):
        return isinstance(v, str) and 0 < len(v.strip()) <= limit
    if len(value["recommendation"]) > 6000 or any(len(value[k]) > 500 for k in ("assignments", "medications", "reviews")):
        raise ApiError(400, "Слишком большой план")
    for item in value["assignments"]:
        if item.get("testId") not in PATIENT_TEST_IDS:
            raise ApiError(400, "Эту шкалу заполняет только специалист в своём кабинете")
        if not text(item.get("id"), 100) or not text(item.get("testId"), 80) or not valid_date(item.get("dueDate")) or not isinstance(item.get("intervalDays"), int) or not 0 <= item["intervalDays"] <= 365 or not text(item.get("createdAt"), 100):
            raise ApiError(400, "Проверьте даты и интервал опросника")
        try:
            datetime.fromisoformat(item["createdAt"].replace("Z", "+00:00"))
            ZoneInfo(item.get("timezone", "UTC"))
        except (ValueError, TypeError, ZoneInfoNotFoundError):
            raise ApiError(400, "Неверная дата или часовой пояс назначения")
    for item in value["medications"]:
        if any(not text(item.get(k), 2000 if k == "instructions" else 120) for k in ("id", "name", "dose", "instructions")) or not valid_date(item.get("startsAt")) or (item.get("endsAt") and (not valid_date(item["endsAt"]) or item["endsAt"] < item["startsAt"])):
            raise ApiError(400, "Проверьте поля назначения препарата")
        try:
            datetime.strptime(item.get("time", ""), "%H:%M")
        except (ValueError, TypeError):
            raise ApiError(400, "Проверьте время приёма")
    for item in value["reviews"]:
        if not text(item.get("signalId"), 200) or item.get("status") not in ("reviewed", "follow-up", "closed") or not text(item.get("action")) or not text(item.get("updatedAt"), 100):
            raise ApiError(400, "Для проверки сигнала нужны статус, дата и действия врача")
        try:
            datetime.fromisoformat(item["updatedAt"].replace("Z", "+00:00"))
        except ValueError:
            raise ApiError(400, "Неверная дата проверки")


def clinical_summary(db, doctor_id, patient_id):
    docs = {r["doc_key"]: json.loads(r["value"]) for r in db.execute("SELECT doc_key, value FROM documents WHERE user_id = ? AND doc_key IN ('results','entries','care')", (patient_id,))}
    results = [r for r in docs.get("results", []) if isinstance(r, dict) and isinstance(r.get("createdAt"), str)]
    entries = [e for e in docs.get("entries", []) if isinstance(e, dict) and isinstance(e.get("createdAt"), str)]
    care = docs.get("care", {})
    plan_row = db.execute("SELECT value FROM care_plans WHERE doctor_id = ? AND patient_id = ?", (doctor_id, patient_id)).fetchone()
    plan = json.loads(plan_row["value"]) if plan_row else {}
    reviews = {r.get("signalId"): r.get("status") for r in plan.get("reviews", []) if isinstance(r, dict)}
    signals = []
    for r in results:
        scores = r.get("answerScores", [])
        index = 8 if r.get("testId") == "phq9" else 9 if r.get("testId") == "epds" else None
        if r.get("safety") is True or (index is not None and isinstance(scores, list) and len(scores) > index and isinstance(scores[index], (int, float)) and scores[index] > 0):
            signals.append(r.get("id"))
        elif isinstance(r.get("score"), (int, float)) and r["score"] >= SEVERE_THRESHOLDS.get(r.get("testId"), float("inf")):
            signals.append(f"severe-{r.get('id')}")
    signals += [e.get("id") for e in care.get("events", []) if isinstance(e, dict) and e.get("kind") == "safety"]
    active = len([x for x in set(signals) if reviews.get(x) != "closed"])
    unreviewed = len([x for x in set(signals) if x not in reviews])
    latest = {}
    for key in ("phq9", "gad7"):
        values = sorted([r for r in results if r.get("testId") == key and isinstance(r.get("score"), (int, float))], key=lambda r: r["createdAt"])
        latest[key] = {"score": values[-1]["score"], "createdAt": values[-1]["createdAt"], "delta": values[-1]["score"] - values[-2]["score"] if len(values) > 1 else None} if values else None
    overdue = 0
    incomplete = False
    for a in plan.get("assignments", []):
        completed = sorted([r for r in results if r.get("testId") == a.get("testId") and r["createdAt"] >= a.get("createdAt", "")], key=lambda r: r["createdAt"])
        if not completed:
            today = datetime.now(ZoneInfo(a.get("timezone", "UTC"))).strftime("%Y-%m-%d")
            overdue += bool(a.get("dueDate") and a["dueDate"] < today)
        elif a.get("intervalDays", 0) > 0:
            try:
                due = datetime.fromisoformat(completed[-1]["createdAt"].replace("Z", "+00:00")) + timedelta(days=a["intervalDays"])
                overdue += due < datetime.now(timezone.utc)
            except (ValueError, TypeError):
                incomplete = True
    return {"latest": latest, "lastEntryAt": max([e["createdAt"] for e in entries], default=None), "activeSignals": active, "unreviewedSignals": unreviewed, "overdue": overdue, "scheduleDataIncomplete": incomplete}


def password_digest(password: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 310_000)


def token_hash(value: str) -> str:
    return hashlib.sha256(value.encode("ascii")).hexdigest()


def issue_tokens(db: sqlite3.Connection, user_id: str) -> tuple[str, str]:
    session_id = secrets.token_hex(20)
    refresh = secrets.token_urlsafe(48)
    access = secrets.token_urlsafe(36)
    now = int(time.time())
    db.execute("INSERT INTO sessions VALUES (?, ?, ?, ?, NULL)", (session_id, user_id, token_hash(refresh), now + REFRESH_SECONDS))
    db.execute("INSERT INTO access_tokens VALUES (?, ?, ?)", (token_hash(access), session_id, now + ACCESS_SECONDS))
    return access, refresh


class Handler(BaseHTTPRequestHandler):
    server_version = "UI-PSY/1"

    @property
    def db_path(self) -> Path:
        return self.server.db_path  # type: ignore[attr-defined]

    def log_message(self, format: str, *args: object) -> None:
        # Never print health records, URLs or credentials to server logs.
        print(f"{self.client_address[0]} {self.command} {self.path.split('?')[0]} {args[1] if len(args) > 1 else ''}")

    def send_json(self, status: int, value: object, cookie: str | None = None) -> None:
        raw = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if cookie is not None:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(raw)

    def read_json(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise ApiError(400, "Неверный размер запроса") from error
        if length < 2 or length > MAX_BODY:
            raise ApiError(413 if length > MAX_BODY else 400, "Недопустимый размер запроса")
        try:
            value = json.loads(self.rfile.read(length))
        except (ValueError, UnicodeDecodeError) as error:
            raise ApiError(400, "Некорректный JSON") from error
        if not isinstance(value, dict):
            raise ApiError(400, "Ожидается объект JSON")
        return value

    def require_same_origin(self) -> None:
        origin = self.headers.get("Origin")
        if origin and urlparse(origin).netloc != self.headers.get("Host"):
            raise ApiError(403, "Недопустимый источник запроса")

    def user(self, db: sqlite3.Connection) -> sqlite3.Row:
        authorization = self.headers.get("Authorization", "")
        if not authorization.startswith("Bearer "):
            raise ApiError(401, "Требуется вход")
        access = authorization[7:]
        if len(access) > 160:
            raise ApiError(401, "Сессия недействительна")
        row = db.execute("""
            SELECT users.id, users.email, users.role, sessions.id AS session_id
            FROM access_tokens JOIN sessions ON sessions.id = access_tokens.session_id
            JOIN users ON users.id = sessions.user_id
            WHERE access_tokens.token_hash = ? AND access_tokens.expires_at > ?
              AND sessions.expires_at > ? AND sessions.revoked_at IS NULL
        """, (token_hash(access), int(time.time()), int(time.time()))).fetchone()
        if row is None:
            raise ApiError(401, "Сессия истекла")
        return row

    def refresh_cookie(self, token: str | None, *, clear: bool = False) -> str:
        secure = "; Secure" if self.headers.get("X-Forwarded-Proto") == "https" else ""
        return f"ui_psy_refresh={token or ''}; HttpOnly; SameSite=Strict; Path=/api/auth; Max-Age={0 if clear else REFRESH_SECONDS}{secure}"

    def cookie_token(self) -> str:
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie", ""))
            return cookie["ui_psy_refresh"].value
        except (KeyError, ValueError):
            raise ApiError(401, "Нет действующей сессии")

    def route(self) -> None:
        path = urlparse(self.path).path
        if self.command == "GET" and path == "/api/health":
            self.send_json(200, {"status": "ok"})
            return
        if path.startswith("/api/"):
            if self.command != "GET":
                self.require_same_origin()
            with connection(self.db_path) as db:
                if path in ("/api/auth/register", "/api/auth/login") and self.command == "POST":
                    body = self.read_json()
                    email = str(body.get("email", "")).strip().lower()
                    password = body.get("password")
                    if len(email) > 254 or "@" not in email or email.startswith("@") or email.endswith("@") or not isinstance(password, str) or len(password) < 12 or len(password) > 256:
                        raise ApiError(400, "Укажи почту и пароль от 12 символов")
                    if path.endswith("register"):
                        role = body.get("role", "patient")
                        if role not in ("patient", "doctor"):
                            raise ApiError(400, "Выберите роль")
                        salt = secrets.token_bytes(24)
                        user_id = secrets.token_hex(16)
                        try:
                            db.execute("INSERT INTO users(id,email,salt,password_hash,created_at,role) VALUES (?, ?, ?, ?, ?, ?)", (user_id, email, salt, password_digest(password, salt), int(time.time()), role))
                        except sqlite3.IntegrityError as error:
                            raise ApiError(409, "Аккаунт с этой почтой уже существует") from error
                    else:
                        attempt_key = f"{self.client_address[0]}:{email}"
                        recent = [when for when in FAILED_LOGINS.get(attempt_key, []) if when > int(time.time()) - 900]
                        if len(recent) >= 5:
                            raise ApiError(429, "Слишком много попыток. Попробуй через 15 минут")
                        row = db.execute("SELECT id, salt, password_hash, role FROM users WHERE email = ?", (email,)).fetchone()
                        salt = row["salt"] if row else b"\0" * 24
                        digest = password_digest(password, salt)
                        if row is None or not hmac.compare_digest(digest, row["password_hash"]):
                            FAILED_LOGINS[attempt_key] = [*recent, int(time.time())]
                            raise ApiError(401, "Неверная почта или пароль")
                        FAILED_LOGINS.pop(attempt_key, None)
                        user_id = row["id"]
                        role = row["role"]
                    access, refresh = issue_tokens(db, user_id)
                    db.commit()
                    self.send_json(200, {"accessToken": access, "user": {"id": user_id, "email": email, "role": role}}, self.refresh_cookie(refresh))
                    return
                if path == "/api/auth/refresh" and self.command == "POST":
                    old = self.cookie_token()
                    db.execute("BEGIN IMMEDIATE")
                    now = int(time.time())
                    row = db.execute("SELECT id, user_id, revoked_at FROM sessions WHERE refresh_hash = ? AND expires_at > ? AND (revoked_at IS NULL OR revoked_at > ?)", (token_hash(old), now, now - REFRESH_REUSE_SECONDS)).fetchone()
                    if row is None:
                        raise ApiError(401, "Сессия истекла")
                    if row["revoked_at"] is None:
                        db.execute("UPDATE sessions SET revoked_at = ? WHERE id = ?", (now, row["id"]))
                        db.execute("DELETE FROM access_tokens WHERE session_id = ?", (row["id"],))
                    access, refresh = issue_tokens(db, row["user_id"])
                    profile = db.execute("SELECT email, role FROM users WHERE id = ?", (row["user_id"],)).fetchone()
                    email, role = profile["email"], profile["role"]
                    db.commit()
                    self.send_json(200, {"accessToken": access, "user": {"id": row["user_id"], "email": email, "role": role}}, self.refresh_cookie(refresh))
                    return
                if path == "/api/auth/logout" and self.command == "POST":
                    token = self.cookie_token()
                    db.execute("UPDATE sessions SET revoked_at = ?, expires_at = 0 WHERE refresh_hash = ?", (int(time.time()), token_hash(token)))
                    db.commit()
                    self.send_json(200, {"ok": True}, self.refresh_cookie(None, clear=True))
                    return
                user = self.user(db)
                if path == "/api/auth/me" and self.command == "GET":
                    self.send_json(200, {"id": user["id"], "email": user["email"], "role": user["role"]})
                    return
                if path == "/api/auth/profile" and self.command == "PATCH":
                    role = self.read_json().get("role")
                    if role not in ("patient", "doctor"):
                        raise ApiError(400, "Выберите роль")
                    db.execute("UPDATE users SET role=? WHERE id=?", (role, user["id"]))
                    db.commit()
                    self.send_json(200, {"id": user["id"], "email": user["email"], "role": role})
                    return
                professional = (path == "/api/links/invites" and self.command == "POST") or path == "/api/links/work" or path.startswith("/api/links/patients") or path.startswith("/api/links/messages/patients/")
                if professional and user["role"] != "doctor":
                    raise ApiError(403, "Этот раздел доступен специалисту. Включите рабочий профиль")
                if path.startswith("/api/links/messages/") and self.command in ("GET", "POST"):
                    parts = path.split("/")
                    if len(parts) != 6 or parts[4] not in ("doctors", "patients") or not parts[5]:
                        raise ApiError(404, "Переписка не найдена")
                    doctor_id, patient_id = (parts[5], user["id"]) if parts[4] == "doctors" else (user["id"], parts[5])
                    db.execute("BEGIN IMMEDIATE" if self.command == "POST" else "BEGIN")
                    if not db.execute("SELECT 1 FROM doctor_links WHERE doctor_id = ? AND patient_id = ?", (doctor_id, patient_id)).fetchone():
                        raise ApiError(403, "Связь с врачом отключена или не подтверждена")
                    if self.command == "GET":
                        query = parse_qs(urlparse(self.path).query)
                        before, after = query.get("before", ["0"])[0], query.get("after", ["0"])[0]
                        if any(not value.isdigit() or len(value) > 18 for value in (before, after)) or (int(before) and int(after)):
                            raise ApiError(400, "Некорректная страница переписки")
                        if int(after):
                            rows = db.execute("SELECT * FROM care_messages WHERE doctor_id = ? AND patient_id = ? AND id > ? ORDER BY id ASC LIMIT 51", (doctor_id, patient_id, int(after))).fetchall()
                            selected = rows[:50]
                        else:
                            rows = db.execute("SELECT * FROM care_messages WHERE doctor_id = ? AND patient_id = ? AND (? = 0 OR id < ?) ORDER BY id DESC LIMIT 51", (doctor_id, patient_id, int(before), int(before))).fetchall()
                            selected = list(reversed(rows[:50]))
                        self.send_json(200, {"messages": [{"id": r["id"], "senderId": r["sender_id"], "text": r["text"], "createdAt": r["created_at"]} for r in selected], "hasMore": len(rows) > 50})
                        return
                    body = self.read_json()
                    text, client_id = body.get("text"), body.get("clientId")
                    if not isinstance(text, str) or not text.strip() or len(text) > 4000 or not isinstance(client_id, str) or not 1 <= len(client_id) <= 80:
                        raise ApiError(400, "Сообщение должно содержать от 1 до 4000 символов")
                    existing = db.execute("SELECT * FROM care_messages WHERE sender_id = ? AND client_id = ?", (user["id"], client_id)).fetchone()
                    if existing:
                        if existing["doctor_id"] != doctor_id or existing["patient_id"] != patient_id or existing["text"] != text.strip():
                            raise ApiError(409, "Идентификатор сообщения уже использован")
                        row = existing
                    else:
                        cursor = db.execute("INSERT INTO care_messages(doctor_id, patient_id, sender_id, client_id, text, created_at) VALUES (?, ?, ?, ?, ?, ?)", (doctor_id, patient_id, user["id"], client_id, text.strip(), int(time.time() * 1000)))
                        row = db.execute("SELECT * FROM care_messages WHERE id = ?", (cursor.lastrowid,)).fetchone()
                    db.commit()
                    self.send_json(200, {"message": {"id": row["id"], "senderId": row["sender_id"], "text": row["text"], "createdAt": row["created_at"]}})
                    return
                if path == "/api/links/invites" and self.command == "POST":
                    db.execute("BEGIN IMMEDIATE")
                    db.execute("DELETE FROM doctor_invites WHERE doctor_id = ? AND (expires_at <= ? OR used_at IS NOT NULL)", (user["id"], int(time.time())))
                    active = db.execute("SELECT COUNT(*) FROM doctor_invites WHERE doctor_id = ?", (user["id"],)).fetchone()[0]
                    if active >= 5:
                        raise ApiError(429, "Сначала используйте действующие приглашения")
                    code = secrets.token_hex(8).upper()
                    expires_at = int(time.time()) + INVITE_SECONDS
                    db.execute("INSERT INTO doctor_invites VALUES (?, ?, ?, NULL)", (token_hash(code), user["id"], expires_at))
                    db.commit()
                    self.send_json(201, {"code": code, "expiresAt": expires_at})
                    return
                if path.startswith("/api/links/invites/") and self.command == "GET":
                    code = path.rsplit("/", 1)[-1].replace("-", "").upper()
                    if len(code) != 16 or any(char not in "0123456789ABCDEF" for char in code):
                        raise ApiError(404, "Код не найден")
                    invite = db.execute("""SELECT doctor_invites.doctor_id, users.email, doctor_invites.expires_at
                        FROM doctor_invites JOIN users ON users.id = doctor_invites.doctor_id
                        WHERE code_hash = ? AND expires_at > ? AND used_at IS NULL""", (token_hash(code), int(time.time()))).fetchone()
                    if invite is None:
                        raise ApiError(404, "Код истёк или уже использован")
                    if invite["doctor_id"] == user["id"]:
                        raise ApiError(400, "Нельзя подключить свой аккаунт")
                    self.send_json(200, {"doctorEmail": invite["email"], "expiresAt": invite["expires_at"]})
                    return
                if path == "/api/links/accept" and self.command == "POST":
                    code = self.read_json().get("code")
                    code = code.replace("-", "").upper() if isinstance(code, str) else ""
                    if len(code) != 16 or any(char not in "0123456789ABCDEF" for char in code):
                        raise ApiError(400, "Неверный код")
                    db.execute("BEGIN IMMEDIATE")
                    invite = db.execute("SELECT doctor_id FROM doctor_invites WHERE code_hash = ? AND expires_at > ? AND used_at IS NULL", (token_hash(code), int(time.time()))).fetchone()
                    if invite is None:
                        raise ApiError(404, "Код истёк или уже использован")
                    if invite["doctor_id"] == user["id"]:
                        raise ApiError(400, "Нельзя подключить свой аккаунт")
                    db.execute("INSERT OR REPLACE INTO doctor_links VALUES (?, ?, ?)", (invite["doctor_id"], user["id"], int(time.time())))
                    db.execute("UPDATE doctor_invites SET used_at = ? WHERE code_hash = ?", (int(time.time()), token_hash(code)))
                    db.commit()
                    self.send_json(200, {"ok": True})
                    return
                if path == "/api/links/doctors" and self.command == "GET":
                    rows = db.execute("""SELECT users.id, users.email, doctor_links.created_at FROM doctor_links
                        JOIN users ON users.id = doctor_links.doctor_id WHERE doctor_links.patient_id = ? ORDER BY doctor_links.created_at DESC""", (user["id"],)).fetchall()
                    self.send_json(200, {"doctors": [{"id": row["id"], "email": row["email"], "createdAt": row["created_at"]} for row in rows]})
                    return
                if path == "/api/links/patients" and self.command == "GET":
                    rows = db.execute("""SELECT users.id, users.email, doctor_links.created_at, documents.value FROM doctor_links
                        JOIN users ON users.id = doctor_links.patient_id
                        LEFT JOIN documents ON documents.user_id = users.id AND documents.doc_key = 'preferences'
                        WHERE doctor_links.doctor_id = ? ORDER BY doctor_links.created_at DESC""", (user["id"],)).fetchall()
                    self.send_json(200, {"patients": [{"id": row["id"], "email": row["email"], "name": (json.loads(row["value"]).get("name") if row["value"] else None) or "Пользователь", "createdAt": row["created_at"], "summary": clinical_summary(db, user["id"], row["id"])} for row in rows]})
                    return
                if path == "/api/links/work" and self.command == "GET":
                    rows = db.execute("""SELECT p.patient_id,p.value,u.email,d.value AS preferences FROM care_plans p
                        JOIN doctor_links l ON l.doctor_id=p.doctor_id AND l.patient_id=p.patient_id
                        JOIN users u ON u.id=p.patient_id
                        LEFT JOIN documents d ON d.user_id=p.patient_id AND d.doc_key='preferences'
                        WHERE p.doctor_id=?""", (user["id"],)).fetchall()
                    self.send_json(200, {"plans": [{"patient":{"id":r["patient_id"],"name":(json.loads(r["preferences"]).get("name") if r["preferences"] else None) or r["email"]},"assignments":json.loads(r["value"]).get("assignments",[])} for r in rows]})
                    return
                if path == "/api/links/plans" and self.command == "GET":
                    rows = db.execute("""SELECT care_plans.*, users.email FROM care_plans
                        JOIN doctor_links ON doctor_links.doctor_id = care_plans.doctor_id AND doctor_links.patient_id = care_plans.patient_id
                        JOIN users ON users.id = care_plans.doctor_id WHERE care_plans.patient_id = ?""", (user["id"],)).fetchall()
                    self.send_json(200, {"plans": [{"doctor": {"id": r["doctor_id"], "email": r["email"]}, "value": json.loads(r["value"]), "version": r["version"], "updatedAt": r["updated_at"]} for r in rows]})
                    return
                if path.startswith("/api/links/patients/") and path.endswith("/plan") and self.command == "PUT":
                    patient_id = path.split("/")[-2]
                    body = self.read_json()
                    value, version = body.get("value"), body.get("version")
                    if not isinstance(value, dict) or not isinstance(version, int) or isinstance(version, bool) or version < 0:
                        raise ApiError(400, "Неверный формат плана")
                    if any(not isinstance(value.get(k), list) for k in ("assignments", "medications", "reviews")) or not isinstance(value.get("recommendation"), str):
                        raise ApiError(400, "Неверный формат плана")
                    if any(not isinstance(item, dict) for k in ("assignments", "medications", "reviews") for item in value[k]):
                        raise ApiError(400, "Неверный формат пунктов плана")
                    validate_plan(value)
                    db.execute("BEGIN IMMEDIATE")
                    if not db.execute("SELECT 1 FROM doctor_links WHERE doctor_id = ? AND patient_id = ?", (user["id"], patient_id)).fetchone():
                        raise ApiError(403, "Пациент не предоставил доступ")
                    row = db.execute("SELECT version FROM care_plans WHERE doctor_id = ? AND patient_id = ?", (user["id"], patient_id)).fetchone()
                    actual = row["version"] if row else 0
                    if version != actual:
                        raise ApiError(409, "План обновлён; обновите страницу перед сохранением")
                    now = int(time.time())
                    db.execute("INSERT INTO care_plans VALUES (?, ?, ?, ?, ?) ON CONFLICT(doctor_id, patient_id) DO UPDATE SET value = excluded.value, version = excluded.version, updated_at = excluded.updated_at", (user["id"], patient_id, json.dumps(value, ensure_ascii=False), actual + 1, now))
                    db.commit()
                    self.send_json(200, {"value": value, "version": actual + 1, "updatedAt": now})
                    return
                if path.startswith("/api/links/patients/") and self.command == "GET":
                    patient_id = path.rsplit("/", 1)[-1]
                    db.execute("BEGIN")
                    patient = db.execute("""SELECT users.email FROM doctor_links JOIN users ON users.id = doctor_links.patient_id
                        WHERE doctor_links.doctor_id = ? AND doctor_links.patient_id = ?""", (user["id"], patient_id)).fetchone()
                    if patient is None:
                        raise ApiError(403, "Пациент не предоставил доступ")
                    rows = db.execute("SELECT doc_key, value FROM documents WHERE user_id = ? AND doc_key IN ('entries', 'results', 'medications', 'preferences', 'care')", (patient_id,)).fetchall()
                    self.send_json(200, {"patient": {"id": patient_id, "email": patient["email"]}, "data": {row["doc_key"]: json.loads(row["value"]) for row in rows}, "plan": {"value": json.loads(plan["value"]), "version": plan["version"], "updatedAt": plan["updatedAt"]} if (plan := db.execute("SELECT value, version, updated_at AS updatedAt FROM care_plans WHERE doctor_id = ? AND patient_id = ?", (user["id"], patient_id)).fetchone()) else None})
                    return
                if self.command == "DELETE" and (path.startswith("/api/links/doctors/") or path.startswith("/api/links/patients/")):
                    other_id = path.rsplit("/", 1)[-1]
                    if path.startswith("/api/links/doctors/"):
                        result = db.execute("DELETE FROM doctor_links WHERE patient_id = ? AND doctor_id = ?", (user["id"], other_id))
                    else:
                        result = db.execute("DELETE FROM doctor_links WHERE doctor_id = ? AND patient_id = ?", (user["id"], other_id))
                    if not result.rowcount:
                        raise ApiError(404, "Связь не найдена")
                    db.commit()
                    self.send_json(200, {"ok": True})
                    return
                if path.startswith("/api/data/"):
                    key = path[len("/api/data/"):]
                    if key not in DATA_KEYS:
                        raise ApiError(404, "Раздел не найден")
                    row = db.execute("SELECT value, version FROM documents WHERE user_id = ? AND doc_key = ?", (user["id"], key)).fetchone()
                    if self.command == "GET":
                        self.send_json(200, {"value": json.loads(row["value"]) if row else None, "version": row["version"] if row else 0})
                        return
                    if self.command == "PUT":
                        body = self.read_json()
                        value, version = body.get("value"), body.get("version")
                        if not isinstance(version, int) or isinstance(version, bool) or version < 0 or (key in ("entries", "results", "doctor-patients", "conversation") and not isinstance(value, list)) or (key in ("preferences", "medications", "care") and not isinstance(value, dict)):
                            raise ApiError(400, "Неверный формат данных")
                        if key == "care" and (any(not isinstance(value.get(k), list) for k in ("events", "sessions", "health")) or any(not isinstance(item, dict) for k in ("events", "sessions", "health") for item in value[k])):
                            raise ApiError(400, "Неверный формат наблюдений")
                        db.execute("BEGIN IMMEDIATE")
                        row = db.execute("SELECT value, version FROM documents WHERE user_id = ? AND doc_key = ?", (user["id"], key)).fetchone()
                        actual = row["version"] if row else 0
                        if version != actual:
                            raise ApiError(409, "Данные обновлены на другом устройстве")
                        if key == "results":
                            validate_patient_results(db, user["id"], value, json.loads(row["value"]) if row else [])
                        serialized = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
                        next_version = actual + 1
                        db.execute("INSERT INTO documents VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, doc_key) DO UPDATE SET value = excluded.value, version = excluded.version, updated_at = excluded.updated_at", (user["id"], key, serialized, next_version, int(time.time())))
                        db.commit()
                        self.send_json(200, {"value": value, "version": next_version})
                        return
            raise ApiError(404, "Маршрут не найден")
        dist = ROOT / "dist"
        if self.command == "GET" and getattr(self.server, "serve_dist", False) and dist.is_dir():
            target = (dist / path.lstrip("/")).resolve()
            if not target.is_relative_to(dist.resolve()) or not target.is_file():
                target = dist / "index.html"
            raw = target.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", mimetypes.guess_type(target.name)[0] or "text/html")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(raw)
            return
        raise ApiError(404, "Маршрут не найден")

    def handle_request(self) -> None:
        try:
            self.route()
        except ApiError as error:
            self.send_json(error.status, {"error": error.message})
        except sqlite3.Error:
            self.send_json(500, {"error": "Ошибка хранилища. Данные не изменены."})

    def do_GET(self) -> None:
        self.handle_request()

    def do_POST(self) -> None:
        self.handle_request()

    def do_PUT(self) -> None:
        self.handle_request()

    def do_PATCH(self) -> None:
        self.handle_request()

    def do_DELETE(self) -> None:
        self.handle_request()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8018)
    parser.add_argument("--db", type=Path, default=Path(os.environ.get("UI_PSY_DB_PATH", ROOT / "server" / "data" / "ui-psy.sqlite3")))
    parser.add_argument("--serve-dist", action="store_true")
    args = parser.parse_args()
    initialize(args.db)
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    server.db_path = args.db
    server.serve_dist = args.serve_dist
    server.daemon_threads = True
    print(f"UI-PSY API at http://{args.host}:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()


if __name__ == "__main__":
    main()
