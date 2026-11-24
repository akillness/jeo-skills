package server

import (
	"context"
	"fmt"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Autumn-27/artex/traffic"
)

// ingestServer wires a Server with a live traffic store, like
// trafficEvidenceServer but without the finding plumbing.
func ingestServer(t *testing.T) (*Server, func(method, path, body string) *httptest.ResponseRecorder) {
	t.Helper()
	skipWithoutDSN(t)
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { m.Close() })
	m.traffic, err = traffic.Open(filepath.Join(m.dir, "traffic"), ":0")
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	s := New(ctx, m, t.TempDir(), t.TempDir(), t.TempDir())
	s.archiveWG.Wait()
	<-s.side.done
	token, err := signJWT(s.jwtKey)
	if err != nil {
		t.Fatal(err)
	}
	return s, func(method, path, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		r.Header.Set("Authorization", "Bearer "+token)
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		s.Handler().ServeHTTP(w, r)
		return w
	}
}

func TestTrafficIngestFlow(t *testing.T) {
	s, request := ingestServer(t)

	body := fmt.Sprintf(`{"exchanges":[
		{"method":"POST","url":"https://api.example.com/v1/login","status":200,
		 "requestHeaders":{"content-type":"application/json"},"requestBody":"{\"u\":\"u1\"}",
		 "responseHeaders":{"content-type":"application/json"},"responseBody":"{\"token\":\"t\"}"},
		{"method":"GET","url":"https://api.example.com/v1/profile","status":200,
		 "requestHeaders":{},"requestBody":"",
		 "responseHeaders":{},"responseBody":"{\"name\":\"n\"}"}
	]}`)
	w := request("POST", "/api/traffic/ingest", body)
	if w.Code != 200 {
		t.Fatalf("ingest status = %d, body = %s", w.Code, w.Body)
	}
	if !strings.Contains(w.Body.String(), `"ingested":2`) || !strings.Contains(w.Body.String(), `"failed":0`) {
		t.Fatalf("unexpected counts: %s", w.Body)
	}

	// Both entries are visible on the normal traffic API, like proxy traffic.
	w = request("GET", "/api/traffic", "")
	if w.Code != 200 || !strings.Contains(w.Body.String(), "api.example.com") {
		t.Fatalf("traffic page after ingest: %d %s", w.Code, w.Body)
	}

	// One bad URL among good ones: the batch reports per-entry failure.
	mixed := `{"exchanges":[
		{"method":"GET","url":"https://good.example.com/ok","status":200,"responseBody":"ok"},
		{"method":"GET","url":"::::","status":200,"responseBody":"bad"}
	]}`
	w = request("POST", "/api/traffic/ingest", mixed)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"ingested":1`) || !strings.Contains(w.Body.String(), `"failed":1`) {
		t.Fatalf("mixed batch: %d %s", w.Code, w.Body)
	}

	// Guards: empty batch, oversized batch, oversized body truncation.
	if w = request("POST", "/api/traffic/ingest", `{"exchanges":[]}`); w.Code != 400 {
		t.Fatalf("empty batch status = %d", w.Code)
	}
	big := `{"exchanges":[` + strings.Repeat(`{"method":"GET","url":"https://x.example.com/"},`, maxIngestBatch) + `{}]}`
	if w = request("POST", "/api/traffic/ingest", big); w.Code != 400 {
		t.Fatalf("oversized batch status = %d", w.Code)
	}
	trunc := `{"exchanges":[{"method":"GET","url":"https://big.example.com/","status":200,"responseBody":"` + strings.Repeat("x", maxIngestBodySize+1024) + `"}]}`
	w = request("POST", "/api/traffic/ingest", trunc)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"ingested":1`) {
		t.Fatalf("truncating batch: %d %s", w.Code, w.Body)
	}
	if n, _ := s.m.Traffic().Count(); n != 4 { // 2 + 1 + 1
		t.Fatalf("final count = %d, want 4", n)
	}
}

func TestTrafficIngestRequiresAuth(t *testing.T) {
	s, _ := ingestServer(t)
	r := httptest.NewRequest("POST", "/api/traffic/ingest", strings.NewReader(`{"exchanges":[]}`))
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, r)
	if w.Code != 401 {
		t.Fatalf("unauthenticated ingest status = %d, want 401", w.Code)
	}
}
