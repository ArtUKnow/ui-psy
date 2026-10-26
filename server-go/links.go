package main

import (
	"strconv"
	"strings"
	"time"
)

func (x *request) linksRoute() {
	path, method, id := x.r.URL.Path, x.r.Method, str(x.user["id"])
	professional := (path == "/api/links/invites" && method == "POST") || path == "/api/links/work" || strings.HasPrefix(path, "/api/links/patients") || strings.HasPrefix(path, "/api/links/messages/patients/")
	if professional && str(x.user["role"]) != "doctor" {
		fail(403, "Этот раздел доступен специалисту. Включите рабочий профиль")
	}
	if strings.HasPrefix(path, "/api/links/messages/") {
		x.messageRoute()
		return
	}
	if path == "/api/links/invites" && method == "POST" {
		now := time.Now().Unix()
		exec(x.tx, "DELETE FROM doctor_invites WHERE doctor_id=$1 AND (expires_at<=$2 OR used_at IS NOT NULL)", id, now)
		if number(one(x.tx, "SELECT count(*) AS n FROM doctor_invites WHERE doctor_id=$1", id)["n"]) >= 5 {
			fail(429, "Сначала используйте действующие приглашения")
		}
		code := strings.ToUpper(random(8))
		exec(x.tx, "INSERT INTO doctor_invites VALUES($1,$2,$3,NULL)", hash(code), id, now+86400)
		x.respond(201, M{"code": code, "expiresAt": now + 86400})
		return
	}
	if strings.HasPrefix(path, "/api/links/invites/") && method == "GET" {
		code := strings.ToUpper(strings.ReplaceAll(strings.TrimPrefix(path, "/api/links/invites/"), "-", ""))
		if !validCode(code) {
			fail(404, "Код не найден")
		}
		r := one(x.tx, "SELECT i.doctor_id,u.email,i.expires_at FROM doctor_invites i JOIN users u ON u.id=i.doctor_id WHERE i.code_hash=$1 AND i.expires_at>$2 AND i.used_at IS NULL", hash(code), time.Now().Unix())
		if r == nil {
			fail(404, "Код истёк или уже использован")
		}
		if r["doctor_id"] == id {
			fail(400, "Нельзя подключить свой аккаунт")
		}
		x.respond(200, M{"doctorEmail": r["email"], "expiresAt": r["expires_at"]})
		return
	}
	if path == "/api/links/accept" && method == "POST" {
		code := strings.ToUpper(strings.ReplaceAll(str(x.body()["code"]), "-", ""))
		if !validCode(code) {
			fail(400, "Неверный код")
		}
		now := time.Now().Unix()
		r := one(x.tx, "SELECT doctor_id FROM doctor_invites WHERE code_hash=$1 AND expires_at>$2 AND used_at IS NULL FOR UPDATE", hash(code), now)
		if r == nil {
			fail(404, "Код истёк или уже использован")
		}
		if r["doctor_id"] == id {
			fail(400, "Нельзя подключить свой аккаунт")
		}
		exec(x.tx, "INSERT INTO doctor_links VALUES($1,$2,$3) ON CONFLICT(doctor_id,patient_id) DO UPDATE SET created_at=EXCLUDED.created_at", r["doctor_id"], id, now)
		exec(x.tx, "UPDATE doctor_invites SET used_at=$1 WHERE code_hash=$2", now, hash(code))
		x.respond(200, M{"ok": true})
		return
	}
	if path == "/api/links/doctors" && method == "GET" {
		out := []M{}
		for _, r := range rows(x.tx, "SELECT u.id,u.email,l.created_at FROM doctor_links l JOIN users u ON u.id=l.doctor_id WHERE l.patient_id=$1 ORDER BY l.created_at DESC", id) {
			out = append(out, M{"id": r["id"], "email": r["email"], "createdAt": r["created_at"]})
		}
		x.respond(200, M{"doctors": out})
		return
	}
	if path == "/api/links/patients" && method == "GET" {
		out := []M{}
		for _, r := range rows(x.tx, "SELECT u.id,u.email,l.created_at,d.value FROM doctor_links l JOIN users u ON u.id=l.patient_id LEFT JOIN documents d ON d.user_id=u.id AND d.doc_key='preferences' WHERE l.doctor_id=$1 ORDER BY l.created_at DESC FOR SHARE OF l", id) {
			name := "Пользователь"
			if r["value"] != nil {
				if n := str(obj(value(r["value"]))["name"]); n != "" {
					name = n
				}
			}
			out = append(out, M{"id": r["id"], "email": r["email"], "name": name, "createdAt": r["created_at"], "summary": x.summary(id, str(r["id"]))})
		}
		x.respond(200, M{"patients": out})
		return
	}
	if path == "/api/links/work" && method == "GET" {
		out := []M{}
		for _, r := range rows(x.tx, "SELECT p.patient_id,p.value,u.email,d.value AS preferences FROM care_plans p JOIN doctor_links l ON l.doctor_id=p.doctor_id AND l.patient_id=p.patient_id JOIN users u ON u.id=p.patient_id LEFT JOIN documents d ON d.user_id=p.patient_id AND d.doc_key='preferences' WHERE p.doctor_id=$1 FOR SHARE OF l", id) {
			name := str(r["email"])
			if r["preferences"] != nil {
				if n := str(obj(value(r["preferences"]))["name"]); n != "" {
					name = n
				}
			}
			out = append(out, M{"patient": M{"id": r["patient_id"], "name": name}, "assignments": arr(obj(value(r["value"]))["assignments"])})
		}
		x.respond(200, M{"plans": out})
		return
	}
	if path == "/api/links/plans" && method == "GET" {
		out := []M{}
		for _, r := range rows(x.tx, "SELECT p.*,u.email FROM care_plans p JOIN doctor_links l ON l.doctor_id=p.doctor_id AND l.patient_id=p.patient_id JOIN users u ON u.id=p.doctor_id WHERE p.patient_id=$1 FOR SHARE OF l", id) {
			out = append(out, M{"doctor": M{"id": r["doctor_id"], "email": r["email"]}, "value": value(r["value"]), "version": r["version"], "updatedAt": r["updated_at"]})
		}
		x.respond(200, M{"plans": out})
		return
	}
	if strings.HasPrefix(path, "/api/links/patients/") && strings.HasSuffix(path, "/plan") && method == "PUT" {
		p := strings.TrimSuffix(strings.TrimPrefix(path, "/api/links/patients/"), "/plan")
		b := x.body()
		v, ok := integer(b["version"])
		plan, isObject := b["value"].(map[string]any)
		if !ok || !isObject {
			fail(400, "Неверный формат плана")
		}
		x.validatePlan(plan)
		x.lockLink(id, p)
		r := one(x.tx, "SELECT version FROM care_plans WHERE doctor_id=$1 AND patient_id=$2", id, p)
		actual := int64(0)
		if r != nil {
			actual = int64(number(r["version"]))
		}
		if v != actual {
			fail(409, "План обновлён; обновите страницу перед сохранением")
		}
		now := time.Now().Unix()
		exec(x.tx, "INSERT INTO care_plans VALUES($1,$2,$3::jsonb,$4,$5) ON CONFLICT(doctor_id,patient_id) DO UPDATE SET value=EXCLUDED.value,version=EXCLUDED.version,updated_at=EXCLUDED.updated_at", id, p, encode(plan), v+1, now)
		x.respond(200, M{"value": plan, "version": v + 1, "updatedAt": now})
		return
	}
	if strings.HasPrefix(path, "/api/links/patients/") && method == "GET" {
		p := strings.TrimPrefix(path, "/api/links/patients/")
		x.lockLink(id, p)
		u := one(x.tx, "SELECT email FROM users WHERE id=$1", p)
		data := M{}
		for _, r := range rows(x.tx, "SELECT doc_key,value FROM documents WHERE user_id=$1 AND doc_key IN ('entries','results','medications','preferences','care')", p) {
			data[str(r["doc_key"])] = value(r["value"])
		}
		var plan any
		if r := one(x.tx, "SELECT value,version,updated_at FROM care_plans WHERE doctor_id=$1 AND patient_id=$2", id, p); r != nil {
			plan = M{"value": value(r["value"]), "version": r["version"], "updatedAt": r["updated_at"]}
		}
		x.respond(200, M{"patient": M{"id": p, "email": u["email"]}, "data": data, "plan": plan})
		return
	}
	if method == "DELETE" && (strings.HasPrefix(path, "/api/links/doctors/") || strings.HasPrefix(path, "/api/links/patients/")) {
		d, p := id, strings.TrimPrefix(path, "/api/links/patients/")
		if strings.HasPrefix(path, "/api/links/doctors/") {
			d, p = strings.TrimPrefix(path, "/api/links/doctors/"), id
		}
		r := exec(x.tx, "DELETE FROM doctor_links WHERE doctor_id=$1 AND patient_id=$2", d, p)
		n, e := r.RowsAffected()
		must(e)
		if n == 0 {
			fail(404, "Связь не найдена")
		}
		x.respond(200, M{"ok": true})
		return
	}
	fail(404, "Маршрут не найден")
}
func validCode(c string) bool {
	if len(c) != 16 {
		return false
	}
	for _, r := range c {
		if !strings.ContainsRune("0123456789ABCDEF", r) {
			return false
		}
	}
	return true
}
func message(r M) M {
	return M{"id": r["id"], "senderId": r["sender_id"], "text": r["text"], "createdAt": r["created_at"]}
}
func (x *request) messageRoute() {
	parts := strings.Split(x.r.URL.Path, "/")
	if len(parts) != 6 || (parts[4] != "doctors" && parts[4] != "patients") || parts[5] == "" {
		fail(404, "Переписка не найдена")
	}
	id := str(x.user["id"])
	d, p := id, parts[5]
	if parts[4] == "doctors" {
		d, p = parts[5], id
	}
	x.lockLink(d, p)
	if x.r.Method == "GET" {
		cursor := func(key string) int64 {
			s := x.r.URL.Query().Get(key)
			if s == "" {
				return 0
			}
			if len(s) > 18 {
				fail(400, "Некорректная страница переписки")
			}
			n, e := strconv.ParseInt(s, 10, 64)
			if e != nil || n < 0 {
				fail(400, "Некорректная страница переписки")
			}
			return n
		}
		before, after := cursor("before"), cursor("after")
		if before > 0 && after > 0 {
			fail(400, "Некорректная страница переписки")
		}
		q := "SELECT * FROM care_messages WHERE doctor_id=$1 AND patient_id=$2 AND ($3::bigint=0 OR id<$3) ORDER BY id DESC LIMIT 51"
		c := before
		if after > 0 {
			q = "SELECT * FROM care_messages WHERE doctor_id=$1 AND patient_id=$2 AND id>$3 ORDER BY id ASC LIMIT 51"
			c = after
		}
		rs := rows(x.tx, q, d, p, c)
		more := len(rs) > 50
		if more {
			rs = rs[:50]
		}
		out := []M{}
		if after > 0 {
			for _, r := range rs {
				out = append(out, message(r))
			}
		} else {
			for i := len(rs) - 1; i >= 0; i-- {
				out = append(out, message(rs[i]))
			}
		}
		x.respond(200, M{"messages": out, "hasMore": more})
		return
	}
	if x.r.Method != "POST" {
		fail(405, "Метод не поддерживается")
	}
	b := x.body()
	if !textOK(b["text"], 4000) || !textOK(b["clientId"], 80) {
		fail(400, "Сообщение должно содержать от 1 до 4000 символов")
	}
	text, c := strings.TrimSpace(str(b["text"])), str(b["clientId"])
	r := one(x.tx, "SELECT * FROM care_messages WHERE sender_id=$1 AND client_id=$2", id, c)
	if r != nil {
		if r["doctor_id"] != d || r["patient_id"] != p || r["text"] != text {
			fail(409, "Идентификатор сообщения уже использован")
		}
	} else {
		r = one(x.tx, "INSERT INTO care_messages(doctor_id,patient_id,sender_id,client_id,text,created_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING *", d, p, id, c, text, time.Now().UnixMilli())
	}
	x.respond(200, M{"message": message(r)})
}
