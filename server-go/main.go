package main

import (
	"context"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgconn"
	_ "github.com/jackc/pgx/v5/stdlib"
)

//go:embed schema.sql
var schema string

type M = map[string]any
type apiError struct {
	status  int
	message string
}

func fail(status int, message string) { panic(apiError{status, message}) }
func must(err error) {
	if err != nil {
		panic(err)
	}
}
func str(v any) string { s, _ := v.(string); return s }
func obj(v any) M {
	m, _ := v.(map[string]any)
	if m == nil {
		return M{}
	}
	return m
}
func arr(v any) []any {
	a, _ := v.([]any)
	if a == nil {
		return []any{}
	}
	return a
}
func number(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int64:
		return float64(n)
	case int:
		return float64(n)
	}
	return 0
}
func integer(v any) (int64, bool) {
	n, ok := v.(float64)
	return int64(n), ok && n >= 0 && n == math.Trunc(n) && n <= 9007199254740991
}
func encode(v any) string { b, e := json.Marshal(v); must(e); return string(b) }
func value(v any) any {
	var b []byte
	switch x := v.(type) {
	case []byte:
		b = x
	case string:
		b = []byte(x)
	default:
		return v
	}
	var o any
	must(json.Unmarshal(b, &o))
	return o
}
func random(n int) string {
	b := make([]byte, n)
	_, e := rand.Read(b)
	must(e)
	return hex.EncodeToString(b)
}
func hash(s string) string { b := sha256.Sum256([]byte(s)); return hex.EncodeToString(b[:]) }
func digest(password string, salt []byte) []byte {
	b, e := pbkdf2.Key(sha256.New, password, salt, 310000, 32)
	must(e)
	return b
}
func rows(tx *sql.Tx, q string, args ...any) []M {
	rs, e := tx.Query(q, args...)
	must(e)
	defer rs.Close()
	cols, e := rs.Columns()
	must(e)
	out := []M{}
	for rs.Next() {
		a := make([]any, len(cols))
		p := make([]any, len(cols))
		for i := range a {
			p[i] = &a[i]
		}
		must(rs.Scan(p...))
		m := M{}
		for i, k := range cols {
			m[k] = a[i]
		}
		out = append(out, m)
	}
	must(rs.Err())
	return out
}
func one(tx *sql.Tx, q string, args ...any) M {
	r := rows(tx, q, args...)
	if len(r) == 0 {
		return nil
	}
	return r[0]
}
func exec(tx *sql.Tx, q string, args ...any) sql.Result {
	r, e := tx.Exec(q, args...)
	must(e)
	return r
}
func textOK(v any, limit int) bool {
	s, ok := v.(string)
	return ok && utf8.RuneCountInString(strings.TrimSpace(s)) > 0 && utf8.RuneCountInString(s) <= limit
}

type policy struct {
	Intro    string `json:"intro"`
	Branches []struct {
		ID      string `json:"id"`
		Items   []int  `json:"items"`
		Minimum int    `json:"minimum"`
	} `json:"branches"`
	Additional  []string `json:"additionalSelfReports"`
	Reflections []string `json:"reflectionIds"`
}
type app struct {
	db           *sql.DB
	root         string
	serveDist    bool
	policy       policy
	patientTests map[string]bool
	ai           *gigaClient
	log          *slog.Logger
}
type request struct {
	cancel   context.CancelFunc
	a        *app
	w        http.ResponseWriter
	r        *http.Request
	tx       *sql.Tx
	user     M
	status   int
	response any
	cookie   *http.Cookie
}

func (x *request) body() M {
	x.r.Body = http.MaxBytesReader(x.w, x.r.Body, 4*1024*1024)
	defer x.r.Body.Close()
	var m M
	d := json.NewDecoder(x.r.Body)
	if e := d.Decode(&m); e != nil {
		var tooBig *http.MaxBytesError
		if errors.As(e, &tooBig) {
			fail(413, "Слишком большой запрос")
		}
		fail(400, "Некорректный JSON")
	}
	if m == nil {
		fail(400, "Ожидается объект JSON")
	}
	if d.Decode(new(any)) != io.EOF {
		fail(400, "Некорректный JSON")
	}
	return m
}
func (x *request) respond(status int, v any) { x.status = status; x.response = v }
func (x *request) refreshCookie(token string, clear bool) {
	age := 30 * 24 * 3600
	if clear {
		age = -1
	}
	x.cookie = &http.Cookie{Name: "ui_psy_refresh", Value: token, Path: "/api/auth", HttpOnly: true, SameSite: http.SameSiteStrictMode, Secure: x.r.TLS != nil || (os.Getenv("UI_PSY_TRUST_PROXY") == "true" && x.r.Header.Get("X-Forwarded-Proto") == "https"), MaxAge: age}
}
func (x *request) cookieToken() string {
	c, e := x.r.Cookie("ui_psy_refresh")
	if e != nil || len(c.Value) > 160 {
		fail(401, "Нет действующей сессии")
	}
	return c.Value
}
func (x *request) auth() {
	t := strings.TrimPrefix(x.r.Header.Get("Authorization"), "Bearer ")
	if t == x.r.Header.Get("Authorization") || len(t) > 160 {
		fail(401, "Требуется вход")
	}
	x.user = one(x.tx, `SELECT u.id,u.email,u.role,s.id AS session_id FROM access_tokens a JOIN sessions s ON s.id=a.session_id JOIN users u ON u.id=s.user_id WHERE a.token_hash=$1 AND a.expires_at>$2 AND s.expires_at>$2 AND s.revoked_at IS NULL`, hash(t), time.Now().Unix())
	if x.user == nil {
		fail(401, "Сессия истекла")
	}
}
func profile(u M) M { return M{"id": u["id"], "email": u["email"], "role": u["role"]} }
func (x *request) issue(id string) {
	sid, access, refresh := random(20), random(36), random(48)
	now := time.Now().Unix()
	exec(x.tx, "INSERT INTO sessions VALUES($1,$2,$3,$4,NULL)", sid, id, hash(refresh), now+30*24*3600)
	exec(x.tx, "INSERT INTO access_tokens VALUES($1,$2,$3)", hash(access), sid, now+900)
	x.refreshCookie(refresh, false)
	u := one(x.tx, "SELECT id,email,role FROM users WHERE id=$1", id)
	x.respond(200, M{"accessToken": access, "user": u})
}
func safeRoute(path string) string {
	parts := strings.Split(path, "/")
	for i := range parts {
		if len(parts[i]) >= 16 {
			parts[i] = ":id"
		}
	}
	return strings.Join(parts, "/")
}
func (a *app) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	id := random(12)
	x := &request{a: a, w: w, r: r, status: 500}
	w.Header().Set("X-Request-ID", id)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "no-store")
	if !strings.HasPrefix(r.URL.Path, "/api/") {
		if a.serveDist && r.Method == "GET" {
			target := filepath.Join(a.root, "dist", filepath.Clean("/"+r.URL.Path))
			st, e := os.Stat(target)
			if e != nil || st.IsDir() {
				target = filepath.Join(a.root, "dist/index.html")
				if st, e = os.Stat(target); e != nil {
					http.NotFound(w, r)
					return
				}
			}
			serveStatic(w, r, target, st)
			return
		}
		http.NotFound(w, r)
		return
	}
	defer func() {
		defer func() {
			if x.cancel != nil {
				x.cancel()
			}
		}()
		if p := recover(); p != nil {
			if x.tx != nil {
				_ = x.tx.Rollback()
				x.tx = nil
			}
			if e, ok := p.(apiError); ok {
				x.status = e.status
				x.response = M{"error": e.message}
			} else {
				x.status = 500
				x.response = M{"error": "Ошибка сервера. Запрос не выполнен."}
				a.log.Error("request_failure", "request_id", id, "error_type", fmt.Sprintf("%T", p))
			}
		}
		if x.tx != nil {
			if e := x.tx.Commit(); e != nil {
				x.status = 500
				x.response = M{"error": "Ошибка фиксации данных"}
				a.log.Error("commit_failure", "request_id", id)
			}
			x.tx = nil
		}
		if x.status == 0 {
			x.status = 200
		}
		if x.cookie != nil && x.status < 400 {
			http.SetCookie(w, x.cookie)
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(x.status)
		_ = json.NewEncoder(w).Encode(x.response)
		a.log.Info("http_request", "request_id", id, "method", r.Method, "route", safeRoute(r.URL.Path), "status", x.status, "duration_ms", float64(time.Since(start).Microseconds())/1000)
	}()
	if r.Method != "GET" {
		if origin := r.Header.Get("Origin"); origin != "" {
			u, e := url.Parse(origin)
			if e != nil || u.Host != r.Host || (u.Scheme != "https" && u.Scheme != "http") {
				fail(403, "Недопустимый источник запроса")
			}
		}
	}
	if r.URL.Path == "/api/health" && r.Method == "GET" {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if a.db.PingContext(ctx) != nil {
			fail(503, "Хранилище недоступно")
		}
		var backupAge any
		if t := lastBackup.Load(); t > 0 {
			backupAge = time.Now().Unix() - t
		}
		x.respond(200, M{"status": "ok", "backend": "go", "database": "postgresql", "aiConfigured": a.ai.configured(), "lastBackupAgeSeconds": backupAge})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
	x.cancel = cancel
	tx, e := a.db.BeginTx(ctx, nil)
	must(e)
	x.tx = tx
	if strings.HasPrefix(r.URL.Path, "/api/auth/") {
		if x.authRoute() {
			return
		}
	}
	x.auth()
	if strings.HasPrefix(r.URL.Path, "/api/ai/") {
		u := x.user
		must(x.tx.Commit())
		x.tx = nil
		a.aiRoute(x, u)
		return
	}
	if x.r.Method != "GET" {
		exec(x.tx, "SELECT pg_advisory_xact_lock(hashtextextended($1,0))", str(x.user["id"]))
	}
	if strings.HasPrefix(r.URL.Path, "/api/data/") {
		x.dataRoute()
		return
	}
	if strings.HasPrefix(r.URL.Path, "/api/links/") {
		x.linksRoute()
		return
	}
	fail(404, "Маршрут не найден")
}
func (x *request) authRoute() bool {
	path, m := x.r.URL.Path, x.r.Method
	if (path == "/api/auth/register" || path == "/api/auth/login") && m == "POST" {
		b := x.body()
		email := strings.ToLower(strings.TrimSpace(str(b["email"])))
		password, ok := b["password"].(string)
		if !ok || utf8.RuneCountInString(password) < 12 || utf8.RuneCountInString(password) > 256 || len(email) > 254 || !strings.Contains(email, "@") || strings.HasPrefix(email, "@") || strings.HasSuffix(email, "@") {
			fail(400, "Укажи почту и пароль от 12 символов")
		}
		if strings.HasSuffix(path, "register") {
			role := str(b["role"])
			if b["role"] == nil {
				role = "patient"
			}
			if role != "patient" && role != "doctor" {
				fail(400, "Выберите роль")
			}
			salt := make([]byte, 24)
			_, e := rand.Read(salt)
			must(e)
			id := random(16)
			_, e = x.tx.Exec("INSERT INTO users(id,email,salt,password_hash,created_at,role) VALUES($1,$2,$3,$4,$5,$6)", id, email, salt, digest(password, salt), time.Now().Unix(), role)
			if e != nil {
				var pg *pgconn.PgError
				if errors.As(e, &pg) && pg.Code == "23505" {
					fail(409, "Аккаунт с этой почтой уже существует")
				}
				must(e)
			}
			x.issue(id)
			return true
		}
		ip, _, _ := net.SplitHostPort(x.r.RemoteAddr)
		key := hash(ip + ":" + email)
		exec(x.tx, "SELECT pg_advisory_xact_lock(hashtextextended($1,0))", key)
		attempt := one(x.tx, "SELECT * FROM login_attempts WHERE attempt_hash=$1", key)
		now := time.Now().Unix()
		if attempt != nil && number(attempt["window_start"]) > float64(now-900) && number(attempt["failures"]) >= 5 {
			fail(429, "Слишком много попыток. Попробуй через 15 минут")
		}
		u := one(x.tx, "SELECT id,salt,password_hash FROM users WHERE email=$1", email)
		salt := make([]byte, 24)
		if u != nil {
			salt = u["salt"].([]byte)
		}
		d := digest(password, salt)
		if u == nil || subtle.ConstantTimeCompare(d, u["password_hash"].([]byte)) != 1 {
			exec(x.tx, `INSERT INTO login_attempts VALUES($1,1,$2) ON CONFLICT(attempt_hash) DO UPDATE SET failures=CASE WHEN login_attempts.window_start<$2-900 THEN 1 ELSE login_attempts.failures+1 END,window_start=CASE WHEN login_attempts.window_start<$2-900 THEN $2 ELSE login_attempts.window_start END`, key, now)
			must(x.tx.Commit())
			x.tx = nil
			fail(401, "Неверная почта или пароль")
		}
		exec(x.tx, "DELETE FROM login_attempts WHERE attempt_hash=$1", key)
		x.issue(str(u["id"]))
		return true
	}
	if path == "/api/auth/refresh" && m == "POST" {
		t := x.cookieToken()
		now := time.Now().Unix()
		u := one(x.tx, "SELECT id,user_id,revoked_at FROM sessions WHERE refresh_hash=$1 AND expires_at>$2 AND (revoked_at IS NULL OR revoked_at>$2-30) FOR UPDATE", hash(t), now)
		if u == nil {
			fail(401, "Сессия истекла")
		}
		if u["revoked_at"] == nil {
			exec(x.tx, "UPDATE sessions SET revoked_at=$1 WHERE id=$2", now, u["id"])
			exec(x.tx, "DELETE FROM access_tokens WHERE session_id=$1", u["id"])
		}
		x.issue(str(u["user_id"]))
		return true
	}
	if path == "/api/auth/logout" && m == "POST" {
		t := x.cookieToken()
		exec(x.tx, "UPDATE sessions SET revoked_at=$1,expires_at=0 WHERE refresh_hash=$2", time.Now().Unix(), hash(t))
		x.refreshCookie("", true)
		x.respond(200, M{"ok": true})
		return true
	}
	if path == "/api/auth/me" && m == "GET" {
		x.auth()
		x.respond(200, profile(x.user))
		return true
	}
	if path == "/api/auth/profile" && m == "PATCH" {
		x.auth()
		role := str(x.body()["role"])
		if role != "patient" && role != "doctor" {
			fail(400, "Выберите роль")
		}
		exec(x.tx, "UPDATE users SET role=$1 WHERE id=$2", role, x.user["id"])
		x.user["role"] = role
		x.respond(200, profile(x.user))
		return true
	}
	return false
}
func (x *request) lockLink(d, p string) {
	if one(x.tx, "SELECT doctor_id FROM doctor_links WHERE doctor_id=$1 AND patient_id=$2 FOR SHARE", d, p) == nil {
		fail(403, "Связь с врачом отключена или не подтверждена")
	}
}
func (x *request) dataRoute() {
	key := strings.TrimPrefix(x.r.URL.Path, "/api/data/")
	lists := map[string]bool{"entries": true, "results": true, "doctor-patients": true, "conversation": true}
	objects := map[string]bool{"preferences": true, "medications": true, "care": true}
	if !lists[key] && !objects[key] {
		fail(404, "Раздел не найден")
	}
	old := one(x.tx, "SELECT value,version FROM documents WHERE user_id=$1 AND doc_key=$2", x.user["id"], key)
	version := int64(0)
	var previous any
	if old != nil {
		version = int64(number(old["version"]))
		previous = value(old["value"])
	}
	if x.r.Method == "GET" {
		x.respond(200, M{"value": previous, "version": version})
		return
	}
	if x.r.Method != "PUT" && !(x.r.Method == "PATCH" && lists[key]) {
		fail(405, "Метод не поддерживается")
	}
	b := x.body()
	if x.r.Method == "PATCH" {
		b["value"] = applyListPatch(arr(previous), b)
	}
	v, ok := integer(b["version"])
	_, isList := b["value"].([]any)
	_, isObject := b["value"].(map[string]any)
	if !ok || (lists[key] && !isList) || (objects[key] && !isObject) {
		fail(400, "Неверный формат данных")
	}
	if v != version {
		fail(409, "Данные обновлены на другом устройстве")
	}
	if key == "care" {
		for _, k := range []string{"events", "sessions", "health"} {
			a, ok := obj(b["value"])[k].([]any)
			if !ok {
				fail(400, "Неверный формат наблюдений")
			}
			for _, item := range a {
				if _, ok := item.(map[string]any); !ok {
					fail(400, "Неверный формат наблюдений")
				}
			}
		}
	}
	if key == "results" {
		x.validateResults(arr(b["value"]), arr(previous))
	}
	exec(x.tx, "INSERT INTO documents VALUES($1,$2,$3::jsonb,$4,$5) ON CONFLICT(user_id,doc_key) DO UPDATE SET value=EXCLUDED.value,version=EXCLUDED.version,updated_at=EXCLUDED.updated_at", x.user["id"], key, encode(b["value"]), version+1, time.Now().Unix())
	if x.r.Method == "PATCH" {
		x.respond(200, M{"version": version + 1})
		return
	}
	x.respond(200, M{"value": b["value"], "version": version + 1})
}

func main() {
	host := flag.String("host", "127.0.0.1", "listen host")
	port := flag.Int("port", 8018, "listen port")
	root := flag.String("root", ".", "application root")
	serve := flag.Bool("serve-dist", false, "serve dist")
	importPath := flag.String("import-json", "", "one-time SQLite export import into EMPTY database")
	flag.Parse()
	logPath := os.Getenv("UI_PSY_LOG_PATH")
	if logPath == "" {
		logPath = filepath.Join(*root, "server-go/logs/server.jsonl")
	}
	must(os.MkdirAll(filepath.Dir(logPath), 0700))
	f, e := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	must(e)
	defer f.Close()
	logger := slog.New(slog.NewJSONHandler(io.MultiWriter(os.Stdout, f), nil))
	slog.SetDefault(logger)
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		logger.Error("configuration_error", "message", "DATABASE_URL is required")
		os.Exit(1)
	}
	db, e := sql.Open("pgx", dsn)
	must(e)
	defer db.Close()
	db.SetMaxOpenConns(32)
	db.SetMaxIdleConns(16)
	db.SetConnMaxLifetime(30 * time.Minute)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	must(db.PingContext(ctx))
	_, e = db.ExecContext(ctx, schema)
	must(e)
	a := &app{db: db, root: *root, serveDist: *serve, patientTests: map[string]bool{}, log: logger}
	raw, e := os.ReadFile(filepath.Join(*root, "src/lib/testPolicy.json"))
	must(e)
	must(json.Unmarshal(raw, &a.policy))
	raw, e = os.ReadFile(filepath.Join(*root, "src/lib/questionnaires.json"))
	must(e)
	var forms []struct {
		ID       string `json:"id"`
		Category string `json:"category"`
	}
	must(json.Unmarshal(raw, &forms))
	for _, v := range forms {
		if v.Category != "clinician" {
			a.patientTests[v.ID] = true
		}
	}
	for _, id := range a.policy.Additional {
		a.patientTests[id] = true
	}
	if *importPath != "" {
		must(importLegacy(db, *importPath))
		logger.Info("legacy_import_complete")
		return
	}
	a.ai = newGigaClient()
	shutdown, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	go backupLoop(shutdown, dsn, *root, logger)
	server := &http.Server{Addr: net.JoinHostPort(*host, strconv.Itoa(*port)), Handler: a, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 65 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 32 * 1024}
	go func() {
		<-shutdown.Done()
		c, done := context.WithTimeout(context.Background(), 10*time.Second)
		defer done()
		if e := server.Shutdown(c); e != nil {
			logger.Error("shutdown_failure")
		}
	}()
	logger.Info("server_started", "address", server.Addr, "backend", "go", "database", "postgresql", "ai_configured", a.ai.configured())
	if e := server.ListenAndServe(); e != nil && e != http.ErrServerClosed {
		logger.Error("server_failed", "error_type", fmt.Sprintf("%T", e))
		os.Exit(1)
	}
}
