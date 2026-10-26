CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, salt BYTEA NOT NULL,
 password_hash BYTEA NOT NULL, created_at BIGINT NOT NULL, role TEXT NOT NULL DEFAULT 'patient' CHECK(role IN ('patient','doctor'))
);
CREATE TABLE IF NOT EXISTS sessions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 refresh_hash TEXT NOT NULL UNIQUE, expires_at BIGINT NOT NULL, revoked_at BIGINT
);
CREATE TABLE IF NOT EXISTS access_tokens (
 token_hash TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS access_expiry ON access_tokens(expires_at);
CREATE TABLE IF NOT EXISTS documents (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, doc_key TEXT NOT NULL,
 value JSONB NOT NULL, version BIGINT NOT NULL CHECK(version>0), updated_at BIGINT NOT NULL,
 PRIMARY KEY(user_id,doc_key)
);
CREATE TABLE IF NOT EXISTS doctor_invites (
 code_hash TEXT PRIMARY KEY, doctor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at BIGINT NOT NULL, used_at BIGINT
);
CREATE TABLE IF NOT EXISTS doctor_links (
 doctor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, patient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at BIGINT NOT NULL, PRIMARY KEY(doctor_id,patient_id)
);
CREATE INDEX IF NOT EXISTS doctor_links_patient ON doctor_links(patient_id);
CREATE TABLE IF NOT EXISTS care_plans (
 doctor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, patient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 value JSONB NOT NULL, version BIGINT NOT NULL CHECK(version>0), updated_at BIGINT NOT NULL,
 PRIMARY KEY(doctor_id,patient_id)
);
CREATE TABLE IF NOT EXISTS care_messages (
 id BIGSERIAL PRIMARY KEY, doctor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 patient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 client_id TEXT NOT NULL, text TEXT NOT NULL, created_at BIGINT NOT NULL, UNIQUE(sender_id,client_id)
);
CREATE INDEX IF NOT EXISTS care_message_thread ON care_messages(doctor_id,patient_id,id);
CREATE TABLE IF NOT EXISTS login_attempts (attempt_hash TEXT PRIMARY KEY, failures INTEGER NOT NULL, window_start BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS ai_usage (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, window_start BIGINT NOT NULL, requests INTEGER NOT NULL);
