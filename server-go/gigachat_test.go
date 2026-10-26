package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestGigaChatOAuthSourcesAndTokenReuse(t *testing.T) {
	var authCalls atomic.Int32
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/oauth":
			authCalls.Add(1)
			if r.Header.Get("Authorization") != "Basic test-only-key" || len(r.Header.Get("RqUID")) != 36 {
				t.Error("missing OAuth headers")
			}
			_ = r.ParseForm()
			if r.Form.Get("scope") != "GIGACHAT_API_PERS" {
				t.Error("missing scope")
			}
			_ = json.NewEncoder(w).Encode(M{"access_token": "test-only-token", "expires_at": time.Now().Add(time.Hour).UnixMilli()})
		case "/chat/completions":
			if r.Header.Get("Authorization") != "Bearer test-only-token" {
				t.Error("missing bearer")
			}
			_ = json.NewEncoder(w).Encode(M{"choices": []M{{"message": M{"content": "{\"practiceId\":\"grounding\"}"}}}})
		default:
			t.Error("unexpected endpoint")
			http.NotFound(w, r)
		}
	}))
	defer mock.Close()
	t.Setenv("GIGACHAT_CREDENTIALS", "test-only-key")
	t.Setenv("GIGACHAT_BASE_URL", mock.URL)
	t.Setenv("GIGACHAT_OAUTH_URL", mock.URL+"/oauth")
	g := newGigaClient()
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			p, e := g.selectPractice(context.Background(), "тестовое сообщение")
			if e != nil {
				t.Error(e)
				return
			}
			if len(p.Sources) == 0 || !strings.HasPrefix(p.Sources[0].URL, "https://") {
				t.Error("missing verified source")
			}
		}()
	}
	wg.Wait()
	if authCalls.Load() != 1 {
		t.Errorf("OAuth called %d times", authCalls.Load())
	}
}
func TestGigaChatRejectsUnsupportedRecommendations(t *testing.T) {
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(M{"choices": []M{{"message": M{"content": "{\"practiceId\":\"invented-drug\"}"}}}})
	}))
	defer mock.Close()
	g := &gigaClient{client: mock.Client(), base: mock.URL, token: "test-token", expires: time.Now().Add(time.Hour)}
	if _, e := g.selectPractice(context.Background(), "test"); e == nil {
		t.Fatal("unsupported recommendation accepted")
	}
}
func TestGigaChatMissingConfiguration(t *testing.T) {
	t.Setenv("GIGACHAT_CREDENTIALS", "")
	if newGigaClient().configured() {
		t.Fatal("missing key reported configured")
	}
}
