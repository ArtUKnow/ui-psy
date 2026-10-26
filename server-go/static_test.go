package main

import (
	"bytes"
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestStaticGzipAndRevalidation(t *testing.T) {
	dir := t.TempDir()
	if e := os.MkdirAll(filepath.Join(dir, "dist"), 0700); e != nil {
		t.Fatal(e)
	}
	page := []byte("<!doctype html>" + strings.Repeat("<p>UI-PSY</p>", 5000))
	if e := os.WriteFile(filepath.Join(dir, "dist/index.html"), page, 0600); e != nil {
		t.Fatal(e)
	}
	if e := os.WriteFile(filepath.Join(dir, "dist/a.png"), []byte("png"), 0600); e != nil {
		t.Fatal(e)
	}
	a := &app{root: dir, serveDist: true}
	get := func(path string, headers map[string]string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("GET", path, nil)
		for k, v := range headers {
			r.Header.Set(k, v)
		}
		w := httptest.NewRecorder()
		a.ServeHTTP(w, r)
		return w
	}

	w := get("/app", map[string]string{"Accept-Encoding": "br, gzip"})
	if w.Code != 200 || w.Header().Get("Content-Encoding") != "gzip" || w.Header().Get("Cache-Control") != "no-cache" || !strings.HasPrefix(w.Header().Get("Content-Type"), "text/html") {
		t.Fatalf("SPA route not gzipped/revalidated: %d %v", w.Code, w.Header())
	}
	z, e := gzip.NewReader(w.Body)
	if e != nil {
		t.Fatal(e)
	}
	if body, _ := io.ReadAll(z); !bytes.Equal(body, page) {
		t.Fatal("gzip body differs from the file")
	}
	if w.Body.Len() >= len(page) {
		t.Fatal("body was not compressed")
	}

	again := get("/app", map[string]string{"Accept-Encoding": "gzip", "If-Modified-Since": w.Header().Get("Last-Modified")})
	if again.Code != http.StatusNotModified || again.Body.Len() != 0 {
		t.Fatalf("repeat visit must be 304 without body: %d %d", again.Code, again.Body.Len())
	}

	for _, enc := range []string{"", "gzip;q=0"} {
		plain := get("/app", map[string]string{"Accept-Encoding": enc})
		if plain.Header().Get("Content-Encoding") != "" || !bytes.Equal(plain.Body.Bytes(), page) {
			t.Fatalf("client without gzip (%q) must get the plain file", enc)
		}
	}

	if e := os.MkdirAll(filepath.Join(dir, "dist/assets"), 0700); e != nil {
		t.Fatal(e)
	}
	if e := os.WriteFile(filepath.Join(dir, "dist/assets/index-abc123.js"), []byte(strings.Repeat("let a=1;", 500)), 0600); e != nil {
		t.Fatal(e)
	}
	js := get("/assets/index-abc123.js", map[string]string{"Accept-Encoding": "gzip"})
	if js.Header().Get("Cache-Control") != "public, max-age=31536000, immutable" || js.Header().Get("Content-Encoding") != "gzip" || !strings.Contains(js.Header().Get("Content-Type"), "javascript") {
		t.Fatalf("hashed assets must be immutable and gzipped: %v", js.Header())
	}

	img := get("/a.png", map[string]string{"Accept-Encoding": "gzip"})
	if img.Header().Get("Content-Encoding") != "" || img.Header().Get("Cache-Control") != "public, max-age=3600" {
		t.Fatalf("images must be cached and not recompressed: %v", img.Header())
	}
}
