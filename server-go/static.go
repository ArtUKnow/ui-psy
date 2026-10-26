package main

import (
	"bytes"
	"compress/gzip"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// Text assets are gzipped once per file version and kept in memory: compressing the
// 1.2 MB single-file bundle on every request would cost tens of ms of CPU on a 1 vCPU host.
var compressible = map[string]bool{".html": true, ".js": true, ".css": true, ".svg": true, ".json": true, ".txt": true}

type gzipped struct {
	mod  time.Time
	size int64
	body []byte
}

var gzipCache sync.Map

func gzipFor(path string, st os.FileInfo) ([]byte, error) {
	if v, ok := gzipCache.Load(path); ok {
		if c := v.(gzipped); c.mod.Equal(st.ModTime()) && c.size == st.Size() {
			return c.body, nil
		}
	}
	raw, e := os.ReadFile(path)
	if e != nil {
		return nil, e
	}
	var buf bytes.Buffer
	z, _ := gzip.NewWriterLevel(&buf, gzip.BestCompression)
	if _, e = z.Write(raw); e != nil {
		return nil, e
	}
	if e = z.Close(); e != nil {
		return nil, e
	}
	gzipCache.Store(path, gzipped{st.ModTime(), st.Size(), buf.Bytes()})
	return buf.Bytes(), nil
}

func acceptsGzip(r *http.Request) bool {
	for _, part := range strings.Split(r.Header.Get("Accept-Encoding"), ",") {
		name, q, _ := strings.Cut(strings.TrimSpace(part), ";")
		if strings.EqualFold(strings.TrimSpace(name), "gzip") && strings.ReplaceAll(strings.TrimSpace(q), " ", "") != "q=0" {
			return true
		}
	}
	return false
}

// serveStatic serves dist files. HTML is revalidated on every visit (304 when unchanged);
// Vite's /assets/ files carry a content hash and never change; other public files are cached for an hour.
func serveStatic(w http.ResponseWriter, r *http.Request, path string, st os.FileInfo) {
	ext := strings.ToLower(filepath.Ext(path))
	if ext == ".html" {
		w.Header().Set("Cache-Control", "no-cache")
	} else if strings.HasPrefix(r.URL.Path, "/assets/") {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	} else {
		w.Header().Set("Cache-Control", "public, max-age=3600")
	}
	if !compressible[ext] {
		http.ServeFile(w, r, path)
		return
	}
	w.Header().Add("Vary", "Accept-Encoding")
	if !acceptsGzip(r) {
		http.ServeFile(w, r, path)
		return
	}
	body, e := gzipFor(path, st)
	if e != nil {
		http.ServeFile(w, r, path)
		return
	}
	if t := mime.TypeByExtension(ext); t != "" {
		w.Header().Set("Content-Type", t)
	}
	w.Header().Set("Content-Encoding", "gzip")
	http.ServeContent(w, r, filepath.Base(path), st.ModTime(), bytes.NewReader(body))
}
