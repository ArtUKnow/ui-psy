package main

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/url"
	"os"
	osexec "os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync/atomic"
	"time"
)

// lastBackup holds the Unix time of the newest completed pg_dump; /api/health reports its age for RPO monitoring.
var lastBackup atomic.Int64

var backupName = regexp.MustCompile(`^\d{8}T\d{6}\.\d{9}\.dump$`)

// pruneBackups keeps the newest `keep` dumps written by backupOnce; keep<=0 keeps everything.
func pruneBackups(dir string, keep int) (int, error) {
	if keep <= 0 {
		return 0, nil
	}
	entries, e := os.ReadDir(dir)
	if e != nil {
		return 0, e
	}
	names := []string{}
	for _, entry := range entries {
		if entry.Type().IsRegular() && backupName.MatchString(entry.Name()) {
			names = append(names, entry.Name())
		}
	}
	sort.Strings(names)
	removed := 0
	for _, name := range names[:max(0, len(names)-keep)] {
		if e := os.Remove(filepath.Join(dir, name)); e != nil {
			return removed, e
		}
		removed++
	}
	return removed, nil
}

var legacyTables = []struct {
	name string
	cols []string
}{
	{"users", []string{"id", "email", "salt", "password_hash", "created_at", "role"}},
	{"sessions", []string{"id", "user_id", "refresh_hash", "expires_at", "revoked_at"}},
	{"access_tokens", []string{"token_hash", "session_id", "expires_at"}},
	{"documents", []string{"user_id", "doc_key", "value", "version", "updated_at"}},
	{"doctor_invites", []string{"code_hash", "doctor_id", "expires_at", "used_at"}},
	{"doctor_links", []string{"doctor_id", "patient_id", "created_at"}},
	{"care_plans", []string{"doctor_id", "patient_id", "value", "version", "updated_at"}},
	{"care_messages", []string{"id", "doctor_id", "patient_id", "sender_id", "client_id", "text", "created_at"}},
}

func importLegacy(db *sql.DB, path string) error {
	raw, e := os.ReadFile(path)
	if e != nil {
		return e
	}
	var data map[string][]M
	if e = json.Unmarshal(raw, &data); e != nil {
		return e
	}
	tx, e := db.Begin()
	if e != nil {
		return e
	}
	defer tx.Rollback()
	for _, t := range legacyTables {
		var n int
		if e = tx.QueryRow("SELECT count(*) FROM " + t.name).Scan(&n); e != nil {
			return e
		}
		if n != 0 {
			return fmt.Errorf("migration requires empty target: %s", t.name)
		}
	}
	for _, t := range legacyTables {
		for _, row := range data[t.name] {
			args := []any{}
			place := []string{}
			for i, col := range t.cols {
				v := row[col]
				if t.name == "users" && (col == "salt" || col == "password_hash") {
					v, e = base64.StdEncoding.DecodeString(str(v))
					if e != nil {
						return e
					}
				}
				args = append(args, v)
				place = append(place, fmt.Sprintf("$%d", i+1))
			}
			if _, e = tx.Exec("INSERT INTO "+t.name+"("+strings.Join(t.cols, ",")+") VALUES("+strings.Join(place, ",")+")", args...); e != nil {
				return fmt.Errorf("import %s: %w", t.name, e)
			}
		}
	}
	if _, e = tx.Exec("SELECT setval(pg_get_serial_sequence('care_messages','id'),coalesce((SELECT max(id) FROM care_messages),0)+1,false)"); e != nil {
		return e
	}
	return tx.Commit()
}
func backupOnce(ctx context.Context, dsn, dir string) (string, error) {
	if e := os.MkdirAll(dir, 0700); e != nil {
		return "", e
	}
	path := filepath.Join(dir, time.Now().UTC().Format("20060102T150405.000000000")+".dump")
	partial := path + ".partial"
	cmd := osexec.CommandContext(ctx, envOr("PG_DUMP_BIN", "pg_dump"), "--format=custom", "--no-owner", "--file", partial)
	environment, e := pgEnvironment(dsn)
	if e != nil {
		return "", e
	}
	cmd.Env = environment
	if e := cmd.Run(); e != nil {
		return "", fmt.Errorf("pg_dump failed: %w", e)
	}
	if e := os.Chmod(partial, 0600); e != nil {
		return "", e
	}
	if e := os.Rename(partial, path); e != nil {
		return "", e
	}
	return path, nil
}

// libpq treats PGDATABASE as a literal name; unlike --dbname, it does not
// expand a URI stored in that variable. Pass separate settings without
// putting the database password in the subprocess argument list.
func pgEnvironment(dsn string) ([]string, error) {
	u, e := url.Parse(dsn)
	if e != nil || (u.Scheme != "postgres" && u.Scheme != "postgresql") {
		return nil, fmt.Errorf("DATABASE_URL must be a PostgreSQL URI")
	}
	settings := map[string]string{"PGDATABASE": strings.TrimPrefix(u.Path, "/")}
	if u.Hostname() != "" {
		settings["PGHOST"] = u.Hostname()
	}
	if u.Port() != "" {
		settings["PGPORT"] = u.Port()
	}
	if u.User != nil {
		settings["PGUSER"] = u.User.Username()
		if p, ok := u.User.Password(); ok {
			settings["PGPASSWORD"] = p
		}
	}
	for k, v := range map[string]string{"host": "PGHOST", "port": "PGPORT", "sslmode": "PGSSLMODE", "sslrootcert": "PGSSLROOTCERT", "connect_timeout": "PGCONNECT_TIMEOUT", "options": "PGOPTIONS"} {
		if s := u.Query().Get(k); s != "" {
			settings[v] = s
		}
	}
	env := []string{}
	for _, v := range os.Environ() {
		key, _, _ := strings.Cut(v, "=")
		if _, ok := settings[key]; !ok {
			env = append(env, v)
		}
	}
	for k, v := range settings {
		env = append(env, k+"="+v)
	}
	return env, nil
}
func backupLoop(ctx context.Context, dsn, root string, log *slog.Logger) {
	interval, e := time.ParseDuration(envOr("UI_PSY_BACKUP_INTERVAL", "60s"))
	if e != nil || interval < time.Second {
		log.Error("backup_configuration_error")
		return
	}
	dir := envOr("UI_PSY_BACKUP_DIR", filepath.Join(root, "server-go/backups"))
	keep, e := strconv.Atoi(envOr("UI_PSY_BACKUP_KEEP", "0"))
	if e != nil || keep < 0 {
		log.Error("backup_configuration_error")
		return
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		start := time.Now()
		c, cancel := context.WithTimeout(ctx, 2*time.Minute)
		path, e := backupOnce(c, dsn, dir)
		cancel()
		if e != nil {
			if ctx.Err() != nil {
				return
			}
			log.Error("backup_failed", "duration_ms", time.Since(start).Milliseconds())
		} else {
			lastBackup.Store(time.Now().Unix())
			removed, e := pruneBackups(dir, keep)
			if e != nil {
				log.Error("backup_prune_failed")
			}
			log.Info("backup_complete", "file", filepath.Base(path), "duration_ms", time.Since(start).Milliseconds(), "pruned", removed)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}
