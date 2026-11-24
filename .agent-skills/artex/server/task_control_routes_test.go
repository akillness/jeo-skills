package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Autumn-27/artex/db"
)

func TestWorkerControlRoutes(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	defer m.Close()

	td := t.TempDir()
	ctx, cancel := context.WithCancel(context.Background())
	s := New(ctx, m, td, td, td)
	defer stopTestServer(t, s, cancel)
	h := s.Handler()
	token, err := signJWT(s.jwtKey)
	if err != nil {
		t.Fatalf("sign jwt: %v", err)
	}

	request := func(path string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{"action":"pause"}`))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}

	// The single-worker route is still registered and reaches its JSON handler.
	single := request("/api/tasks/missing/intents/1/control")
	if single.Code != http.StatusNotFound || !strings.Contains(single.Body.String(), `"error":"task not found"`) {
		t.Fatalf("single control route unavailable: status=%d body=%s", single.Code, single.Body.String())
	}

	// The former batch route must fall through the mux instead of reaching a task handler.
	batch := request("/api/tasks/missing/intents/control/batch")
	if batch.Code != http.StatusNotFound || !strings.Contains(batch.Body.String(), "404 page not found") {
		t.Fatalf("batch control route still registered: status=%d body=%s", batch.Code, batch.Body.String())
	}
}
