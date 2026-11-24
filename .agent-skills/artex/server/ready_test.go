package server

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
)

type readyTestConnector struct {
	ping func(context.Context) error
}

func (c readyTestConnector) Connect(context.Context) (driver.Conn, error) {
	return readyTestConn{ping: c.ping}, nil
}

func (c readyTestConnector) Driver() driver.Driver { return readyTestDriver{} }

type readyTestDriver struct{}

func (readyTestDriver) Open(string) (driver.Conn, error) {
	return nil, errors.New("ready test driver must be opened through its connector")
}

type readyTestConn struct {
	ping func(context.Context) error
}

func (readyTestConn) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("not supported")
}
func (readyTestConn) Close() error              { return nil }
func (readyTestConn) Begin() (driver.Tx, error) { return nil, errors.New("not supported") }
func (c readyTestConn) Ping(ctx context.Context) error {
	return c.ping(ctx)
}

func newReadyServer(t *testing.T, ping func(context.Context) error) (*Server, *sql.DB) {
	t.Helper()
	sqlDB := sql.OpenDB(readyTestConnector{ping: ping})
	t.Cleanup(func() { _ = sqlDB.Close() })
	return &Server{m: &Manager{pg: &db.DB{DB: sqlDB}}}, sqlDB
}

func readyRequest(h http.Handler, method, path string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(method, path, nil))
	return rec
}

func assertReadyResponse(t *testing.T, rec *httptest.ResponseRecorder, status int, ready bool) {
	t.Helper()
	if rec.Code != status {
		t.Fatalf("status = %d, want %d; body=%s", rec.Code, status, rec.Body.String())
	}
	var body map[string]bool
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body %q: %v", rec.Body.String(), err)
	}
	if len(body) != 1 || body["ready"] != ready {
		t.Fatalf("body = %s, want only ready:%t", rec.Body.String(), ready)
	}
}

func TestReadyRouteAvailabilityAndCompatibility(t *testing.T) {
	var calls atomic.Int32
	s, _ := newReadyServer(t, func(context.Context) error {
		calls.Add(1)
		return nil
	})
	h := s.Handler()

	assertReadyResponse(t, readyRequest(h, http.MethodGet, "/api/ready"), http.StatusOK, true)
	if got := readyRequest(h, http.MethodGet, "/api/health"); got.Code != http.StatusOK || strings.TrimSpace(got.Body.String()) != `{"ok":true}` {
		t.Fatalf("unauthenticated health = %d %s, want 200 {\"ok\":true}", got.Code, got.Body.String())
	}
	if got := readyRequest(h, http.MethodGet, "/api/stats"); got.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated stats = %d, want %d", got.Code, http.StatusUnauthorized)
	}
	if got := calls.Load(); got != 1 {
		t.Fatalf("database ping count = %d after readiness and liveness requests, want 1", got)
	}
}

func TestReadyOutageRecoveryAndErrorRedaction(t *testing.T) {
	var calls atomic.Int32
	var available atomic.Bool
	s, _ := newReadyServer(t, func(context.Context) error {
		calls.Add(1)
		if !available.Load() {
			return errors.New("secret PostgreSQL connection details")
		}
		return nil
	})
	h := s.Handler()

	first := readyRequest(h, http.MethodGet, "/api/ready")
	assertReadyResponse(t, first, http.StatusServiceUnavailable, false)
	if strings.Contains(first.Body.String(), "secret") {
		t.Fatalf("readiness response exposed database error: %s", first.Body.String())
	}

	available.Store(true)
	s.readyPG.mu.Lock()
	s.readyPG.checked = time.Now().Add(-2 * readyCacheTTL)
	s.readyPG.mu.Unlock()
	assertReadyResponse(t, readyRequest(h, http.MethodGet, "/api/ready"), http.StatusOK, true)
	if got := calls.Load(); got != 2 {
		t.Fatalf("database ping count = %d, want outage and recovery checks", got)
	}
}

func TestReadyClosedDatabaseReturnsUnavailable(t *testing.T) {
	s, sqlDB := newReadyServer(t, func(context.Context) error { return nil })
	if err := sqlDB.Close(); err != nil {
		t.Fatal(err)
	}
	assertReadyResponse(t, readyRequest(s.Handler(), http.MethodGet, "/api/ready"), http.StatusServiceUnavailable, false)
}

func TestReadyPingTimeout(t *testing.T) {
	var cache readyCache
	started := make(chan struct{})
	start := time.Now()
	ready := cache.check(context.Background(), func(ctx context.Context) error {
		close(started)
		<-ctx.Done()
		return ctx.Err()
	})
	if ready {
		t.Fatal("timed-out ping reported ready")
	}
	<-started
	if elapsed := time.Since(start); elapsed < readyPingTimeout || elapsed > 2*readyPingTimeout {
		t.Fatalf("ping timeout elapsed %s, want about %s", elapsed, readyPingTimeout)
	}
}

type readyWaitContext struct {
	context.Context
	waiting chan struct{}
	once    sync.Once
}

func (c *readyWaitContext) Done() <-chan struct{} {
	c.once.Do(func() { close(c.waiting) })
	return c.Context.Done()
}

func TestReadyCanceledWaiterDoesNotCancelSharedPing(t *testing.T) {
	var cache readyCache
	started := make(chan struct{})
	release := make(chan struct{})
	pingResult := make(chan bool, 1)
	go func() {
		pingResult <- cache.check(context.Background(), func(context.Context) error {
			close(started)
			<-release
			return nil
		})
	}()
	<-started

	waitCtx, cancel := context.WithCancel(context.Background())
	waitingCtx := &readyWaitContext{Context: waitCtx, waiting: make(chan struct{})}
	waiterResult := make(chan bool, 1)
	go func() { waiterResult <- cache.check(waitingCtx, func(context.Context) error { return nil }) }()
	<-waitingCtx.waiting
	cancel()
	select {
	case ready := <-waiterResult:
		if ready {
			t.Fatal("canceled waiter reported ready")
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatal("canceled waiter did not return promptly")
	}

	close(release)
	if ready := <-pingResult; !ready {
		t.Fatal("canceling a waiter canceled the shared ping")
	}
}

func TestReadyConcurrentRequestsShareOnePing(t *testing.T) {
	var cache readyCache
	var calls atomic.Int32
	started := make(chan struct{})
	release := make(chan struct{})
	ping := func(context.Context) error {
		calls.Add(1)
		close(started)
		<-release
		return nil
	}

	const callers = 20
	results := make([]bool, callers)
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		results[0] = cache.check(context.Background(), ping)
	}()
	<-started

	for i := 1; i < callers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			results[i] = cache.check(context.Background(), ping)
		}(i)
	}
	time.Sleep(25 * time.Millisecond)
	close(release)
	wg.Wait()
	if got := calls.Load(); got != 1 {
		t.Fatalf("database ping count = %d for %d callers, want 1", got, callers)
	}
	for i, ready := range results {
		if !ready {
			t.Errorf("caller %d reported not ready", i)
		}
	}
}
