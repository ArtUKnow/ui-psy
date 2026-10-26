package main

// applyListPatch merges a PATCH body into a stored list so that clients upload only what changed:
// removed ids are dropped, items with a matching id are replaced in place, and new items are
// prepended (lists are newest-first). The client applies the same function before sending.
func applyListPatch(base []any, b M) []any {
	prepend, ok1 := b["prepend"].([]any)
	replace, ok2 := b["replace"].([]any)
	remove, ok3 := b["remove"].([]any)
	if !ok1 || !ok2 || !ok3 {
		fail(400, "Неверный формат изменений")
	}
	removed := map[string]bool{}
	for _, v := range remove {
		id, ok := v.(string)
		if !ok || id == "" {
			fail(400, "Неверный формат изменений")
		}
		removed[id] = true
	}
	replaced := map[string]any{}
	for _, v := range replace {
		id := str(obj(v)["id"])
		if _, ok := v.(map[string]any); !ok || id == "" {
			fail(400, "Неверный формат изменений")
		}
		replaced[id] = v
	}
	out := make([]any, 0, len(prepend)+len(base))
	out = append(out, prepend...)
	for _, item := range base {
		id := str(obj(item)["id"])
		if id != "" && removed[id] {
			continue
		}
		if next, ok := replaced[id]; ok && id != "" {
			item = next
		}
		out = append(out, item)
	}
	return out
}
