package main

import (
	"encoding/json"
	"testing"
)

func TestApplyListPatch(t *testing.T) {
	var base []any
	json.Unmarshal([]byte(`[{"id":"b","n":1},{"id":"c","n":1},{"n":"legacy without id"},{"id":"d","n":1}]`), &base)
	var body M
	json.Unmarshal([]byte(`{"prepend":[{"id":"a","n":1}],"replace":[{"id":"c","n":2}],"remove":["d"]}`), &body)
	got, _ := json.Marshal(applyListPatch(base, body))
	if want := `[{"id":"a","n":1},{"id":"b","n":1},{"id":"c","n":2},{"n":"legacy without id"}]`; string(got) != want {
		t.Fatalf("got %s", got)
	}
	for _, bad := range []string{`{"prepend":[],"replace":[]}`, `{"prepend":[],"replace":[{"n":1}],"remove":[]}`, `{"prepend":[],"replace":[],"remove":[1]}`} {
		body = M{}
		json.Unmarshal([]byte(bad), &body)
		func() {
			defer func() {
				if e, ok := recover().(apiError); !ok || e.status != 400 {
					t.Fatalf("%s must be rejected with 400", bad)
				}
			}()
			applyListPatch(base, body)
		}()
	}
}
