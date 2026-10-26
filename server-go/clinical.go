package main

import (
	"sort"
	"strings"
	"time"
)

func validDate(v any) bool {
	s, ok := v.(string)
	if !ok {
		return false
	}
	d, e := time.Parse("2006-01-02", s)
	return e == nil && d.Format("2006-01-02") == s
}
func validTimestamp(v any) bool { _, e := time.Parse(time.RFC3339Nano, str(v)); return e == nil }
func (x *request) validatePlan(v M) {
	if _, ok := v["recommendation"].(string); !ok {
		fail(400, "Неверный формат плана")
	}
	if len([]rune(str(v["recommendation"]))) > 6000 {
		fail(400, "Слишком большой план")
	}
	for _, key := range []string{"assignments", "medications", "reviews"} {
		a, ok := v[key].([]any)
		if !ok || len(a) > 500 {
			fail(400, "Неверный формат плана")
		}
		for _, item := range a {
			if _, ok := item.(map[string]any); !ok {
				fail(400, "Неверный формат пунктов плана")
			}
		}
	}
	for _, item := range arr(v["assignments"]) {
		a := obj(item)
		if !x.a.patientTests[str(a["testId"])] {
			fail(400, "Эту шкалу заполняет только специалист в своём кабинете")
		}
		n, ok := integer(a["intervalDays"])
		if !ok || n > 365 || !validDate(a["dueDate"]) || !textOK(a["id"], 100) || !textOK(a["testId"], 80) || !validTimestamp(a["createdAt"]) {
			fail(400, "Проверьте даты и интервал опросника")
		}
		zone := "UTC"
		if a["timezone"] != nil {
			zone = str(a["timezone"])
		}
		if _, e := time.LoadLocation(zone); e != nil {
			fail(400, "Неверный часовой пояс назначения")
		}
	}
	for _, item := range arr(v["medications"]) {
		a := obj(item)
		for _, key := range []string{"id", "name", "dose", "instructions"} {
			limit := 120
			if key == "instructions" {
				limit = 2000
			}
			if !textOK(a[key], limit) {
				fail(400, "Проверьте поля назначения препарата")
			}
		}
		if !validDate(a["startsAt"]) || (str(a["endsAt"]) != "" && (!validDate(a["endsAt"]) || str(a["endsAt"]) < str(a["startsAt"]))) {
			fail(400, "Проверьте даты препарата")
		}
		if _, e := time.Parse("15:04", str(a["time"])); e != nil {
			fail(400, "Проверьте время приёма")
		}
	}
	for _, item := range arr(v["reviews"]) {
		a := obj(item)
		s := str(a["status"])
		if !textOK(a["signalId"], 200) || !textOK(a["action"], 2000) || (s != "reviewed" && s != "follow-up" && s != "closed") || !validTimestamp(a["updatedAt"]) {
			fail(400, "Для проверки сигнала нужны статус, дата и действия врача")
		}
	}
}
func (x *request) validateResults(proposed, previous []any) {
	existing := map[string]string{}
	for _, v := range previous {
		a := obj(v)
		existing[str(a["id"])] = encode(a)
	}
	allowed := map[string]bool{x.a.policy.Intro: true}
	for _, v := range x.a.policy.Reflections {
		allowed[v] = true
	}
	intros := []M{}
	for _, v := range proposed {
		a := obj(v)
		if str(a["testId"]) == x.a.policy.Intro && str(a["createdAt"]) != "" {
			intros = append(intros, a)
		}
	}
	sort.Slice(intros, func(i, j int) bool { return str(intros[i]["createdAt"]) < str(intros[j]["createdAt"]) })
	if len(intros) > 0 {
		v := intros[len(intros)-1]
		scores := arr(v["answerScores"])
		if v["answerScores"] == nil {
			scores = arr(v["answers"])
		}
		valid := len(scores) == 4
		for _, s := range scores {
			n, ok := integer(s)
			valid = valid && ok && n <= 3
		}
		if valid {
			for _, b := range x.a.policy.Branches {
				sum := 0
				for _, i := range b.Items {
					sum += int(number(scores[i]))
				}
				if sum >= b.Minimum {
					allowed[b.ID] = true
				}
			}
		}
	}
	for _, r := range rows(x.tx, "SELECT p.value FROM care_plans p JOIN doctor_links l ON l.doctor_id=p.doctor_id AND l.patient_id=p.patient_id WHERE p.patient_id=$1", x.user["id"]) {
		for _, v := range arr(obj(value(r["value"]))["assignments"]) {
			id := str(obj(v)["testId"])
			if x.a.patientTests[id] {
				allowed[id] = true
			}
		}
	}
	for _, v := range proposed {
		a, ok := v.(map[string]any)
		if !ok {
			fail(400, "Неверный формат результата")
		}
		id, ok := a["id"].(string)
		if !ok {
			fail(400, "Неверный формат результата")
		}
		if existing[id] == encode(a) {
			continue
		}
		if !allowed[str(a["testId"])] {
			fail(403, "Для этого опросника нужно назначение врача или результат вводной диагностики")
		}
	}
}
func (x *request) summary(d, p string) M {
	docs := M{}
	for _, r := range rows(x.tx, "SELECT doc_key,value FROM documents WHERE user_id=$1 AND doc_key IN ('results','entries','care')", p) {
		docs[str(r["doc_key"])] = value(r["value"])
	}
	results, entries := []M{}, []M{}
	for _, r := range arr(docs["results"]) {
		a := obj(r)
		if str(a["createdAt"]) != "" {
			results = append(results, a)
		}
	}
	for _, r := range arr(docs["entries"]) {
		a := obj(r)
		if str(a["createdAt"]) != "" {
			entries = append(entries, a)
		}
	}
	plan := M{}
	if r := one(x.tx, "SELECT value FROM care_plans WHERE doctor_id=$1 AND patient_id=$2", d, p); r != nil {
		plan = obj(value(r["value"]))
	}
	reviews := map[string]string{}
	for _, v := range arr(plan["reviews"]) {
		r := obj(v)
		reviews[str(r["signalId"])] = str(r["status"])
	}
	signals := map[string]bool{}
	for _, r := range results {
		scores := arr(r["answerScores"])
		id, key := str(r["id"]), str(r["testId"])
		idx := -1
		if key == "phq9" {
			idx = 8
		}
		if key == "epds" {
			idx = 9
		}
		safe, _ := r["safety"].(bool)
		if safe || (idx >= 0 && len(scores) > idx && number(scores[idx]) > 0) {
			signals[id] = true
		} else {
			score, ok := r["score"].(float64)
			if ok && ((key == "phq9" && score >= 20) || (key == "gad7" && score >= 15)) {
				signals["severe-"+id] = true
			}
		}
	}
	for _, v := range arr(obj(docs["care"])["events"]) {
		a := obj(v)
		if str(a["kind"]) == "safety" {
			signals[str(a["id"])] = true
		}
	}
	active, unreviewed := 0, 0
	for id := range signals {
		if reviews[id] != "closed" {
			active++
		}
		if _, ok := reviews[id]; !ok {
			unreviewed++
		}
	}
	latest := M{"phq9": nil, "gad7": nil}
	for _, key := range []string{"phq9", "gad7"} {
		rs := []M{}
		for _, v := range results {
			_, ok := v["score"].(float64)
			if str(v["testId"]) == key && ok {
				rs = append(rs, v)
			}
		}
		sort.Slice(rs, func(i, j int) bool { return str(rs[i]["createdAt"]) < str(rs[j]["createdAt"]) })
		if len(rs) > 0 {
			r := rs[len(rs)-1]
			var delta any
			if len(rs) > 1 {
				delta = number(r["score"]) - number(rs[len(rs)-2]["score"])
			}
			latest[key] = M{"score": r["score"], "createdAt": r["createdAt"], "delta": delta}
		}
	}
	var last any
	for _, e := range entries {
		if last == nil || str(e["createdAt"]) > str(last) {
			last = e["createdAt"]
		}
	}
	overdue, incomplete := 0, false
	for _, v := range arr(plan["assignments"]) {
		a := obj(v)
		completed := []M{}
		for _, r := range results {
			if str(r["testId"]) == str(a["testId"]) && str(r["createdAt"]) >= str(a["createdAt"]) {
				completed = append(completed, r)
			}
		}
		sort.Slice(completed, func(i, j int) bool { return str(completed[i]["createdAt"]) < str(completed[j]["createdAt"]) })
		if len(completed) == 0 {
			zone := str(a["timezone"])
			if zone == "" {
				zone = "UTC"
			}
			loc, e := time.LoadLocation(zone)
			if e != nil {
				incomplete = true
				continue
			}
			if date := str(a["dueDate"]); date != "" && date < time.Now().In(loc).Format("2006-01-02") {
				overdue++
			}
		} else if days := int(number(a["intervalDays"])); days > 0 {
			t, e := time.Parse(time.RFC3339Nano, strings.ReplaceAll(str(completed[len(completed)-1]["createdAt"]), " ", "T"))
			if e != nil {
				incomplete = true
			} else if t.Add(time.Duration(days) * 24 * time.Hour).Before(time.Now()) {
				overdue++
			}
		}
	}
	return M{"latest": latest, "lastEntryAt": last, "activeSignals": active, "unreviewedSignals": unreviewed, "overdue": overdue, "scheduleDataIncomplete": incomplete}
}
