package enrich

import (
	"context"
	"database/sql"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
	_ "github.com/jackc/pgx/v5/stdlib"
)

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

func TestExtractTitle(t *testing.T) {
	tests := []struct {
		name string
		body string
		want string
	}{
		{"simple", "<title>Hello</title>", "Hello"},
		{"whitespace", "<title>  Hello World  </title>", "Hello World"},
		{"multiline", "<title>\n  Hello\n</title>", "Hello"},
		{"html entities", "<title>A &amp; B</title>", "A & B"},
		{"case insensitive", "<TITLE>Upper</TITLE>", "Upper"},
		{"mixed case", "<TiTlE>Mixed</TiTlE>", "Mixed"},
		{"attributes", `<title lang="en">With Attrs</title>`, "With Attrs"},
		{"nested tags", "<title><b>Bold</b> title</title>", "<b>Bold</b> title"},
		{"empty title", "<title></title>", ""},
		{"no title tag", "<html><body>hello</body></html>", ""},
		{"empty body", "", ""},
		{"title across lines", "<title>Line1\nLine2</title>", "Line1\nLine2"},
		{"unicode", "<title>日本語テスト</title>", "日本語テスト"},
		{"numeric entities", "<title>&#60;test&#62;</title>", "<test>"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractTitle([]byte(tt.body))
			if got != tt.want {
				t.Errorf("extractTitle(%q) = %q, want %q", tt.body, got, tt.want)
			}
		})
	}
}

func TestHostOf(t *testing.T) {
	tests := []struct {
		rawURL string
		want   string
	}{
		{"https://example.com/path", "example.com"},
		{"http://example.com:8080/path", "example.com"},
		{"https://[::1]:443/", "::1"},
		{"https://192.168.1.1/", "192.168.1.1"},
		{"://bad", ""},
		{"", ""},
		{"https://user:pass@host.com/", "host.com"},
		{"ftp://files.example.com/pub", "files.example.com"},
		{"https://UPPER.example.COM/", "UPPER.example.COM"},
	}
	for _, tt := range tests {
		t.Run(tt.rawURL, func(t *testing.T) {
			got := hostOf(tt.rawURL)
			if got != tt.want {
				t.Errorf("hostOf(%q) = %q, want %q", tt.rawURL, got, tt.want)
			}
		})
	}
}

func TestUniq(t *testing.T) {
	tests := []struct {
		name string
		in   []string
		want []string
	}{
		{"empty", []string{}, []string{}},
		{"single", []string{"a"}, []string{"a"}},
		{"no dups", []string{"a", "b", "c"}, []string{"a", "b", "c"}},
		{"all dups", []string{"a", "a", "a"}, []string{"a"}},
		{"mixed", []string{"a", "b", "a", "c", "b"}, []string{"a", "b", "c"}},
		{"preserves order", []string{"c", "b", "a", "b", "c"}, []string{"c", "b", "a"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// uniq modifies the backing array; use a copy so the test table is clean.
			in := make([]string, len(tt.in))
			copy(in, tt.in)
			got := uniq(in)
			if len(got) != len(tt.want) {
				t.Fatalf("uniq(%v): got %v (len %d), want %v (len %d)", tt.in, got, len(got), tt.want, len(tt.want))
			}
			for i := range got {
				if got[i] != tt.want[i] {
					t.Errorf("uniq(%v)[%d] = %q, want %q", tt.in, i, got[i], tt.want[i])
				}
			}
		})
	}
}

func TestID0(t *testing.T) {
	tests := []struct {
		id   int64
		want bool
	}{
		{0, true},
		{-1, true},
		{-100, true},
		{1, false},
		{100, false},
	}
	for _, tt := range tests {
		if got := id0(tt.id); got != tt.want {
			t.Errorf("id0(%d) = %v, want %v", tt.id, got, tt.want)
		}
	}
}

func TestItoa(t *testing.T) {
	tests := []struct {
		n    int64
		want string
	}{
		{0, "0"},
		{1, "1"},
		{-1, "-1"},
		{9999999, "9999999"},
	}
	for _, tt := range tests {
		if got := itoa(tt.n); got != tt.want {
			t.Errorf("itoa(%d) = %q, want %q", tt.n, got, tt.want)
		}
	}
}

// ---------------------------------------------------------------------------
// Engine lifecycle: enqueue
// ---------------------------------------------------------------------------

func TestEnqueueNilEngine(t *testing.T) {
	var e *Engine
	e.enqueue(job{kind: jobDNS, id: 1, arg: "example.com"})
}

func TestEnqueueZeroID(t *testing.T) {
	e := &Engine{jobs: make(chan job, 8), closed: make(chan struct{})}
	e.enqueue(job{kind: jobDNS, id: 0, arg: "example.com"})
	if len(e.jobs) != 0 {
		t.Error("expected no job enqueued for id=0")
	}
}

func TestEnqueueNegativeID(t *testing.T) {
	e := &Engine{jobs: make(chan job, 8), closed: make(chan struct{})}
	e.enqueue(job{kind: jobDNS, id: -5, arg: "example.com"})
	if len(e.jobs) != 0 {
		t.Error("expected no job enqueued for negative id")
	}
}

func TestEnqueueEmptyArg(t *testing.T) {
	e := &Engine{jobs: make(chan job, 8), closed: make(chan struct{})}
	e.enqueue(job{kind: jobDNS, id: 1, arg: ""})
	if len(e.jobs) != 0 {
		t.Error("expected no job enqueued for empty arg")
	}
}

func TestEnqueueSuccess(t *testing.T) {
	e := &Engine{jobs: make(chan job, 8), closed: make(chan struct{})}
	e.enqueue(job{kind: jobDNS, id: 1, arg: "example.com"})
	if len(e.jobs) != 1 {
		t.Error("expected one job enqueued")
	}
}

func TestEnqueueFullQueue(t *testing.T) {
	e := &Engine{jobs: make(chan job, 1), closed: make(chan struct{})}
	e.enqueue(job{kind: jobDNS, id: 1, arg: "a.com"})
	e.enqueue(job{kind: jobDNS, id: 2, arg: "b.com"})
	if len(e.jobs) != 1 {
		t.Error("expected only one job in a size-1 queue")
	}
}

// ---------------------------------------------------------------------------
// Engine lifecycle: cooldown
// ---------------------------------------------------------------------------

func TestOnCooldown(t *testing.T) {
	e := &Engine{jobs: make(chan job, 8), closed: make(chan struct{})}
	j := job{kind: jobDNS, id: 42, arg: "test.com"}

	if e.onCooldown(j) {
		t.Error("first call should not be on cooldown")
	}
	if !e.onCooldown(j) {
		t.Error("immediate second call should be on cooldown")
	}

	// Different kind, same id: separate cooldown.
	j2 := job{kind: jobHTTP, id: 42, arg: "http://test.com"}
	if e.onCooldown(j2) {
		t.Error("different kind should not be on cooldown")
	}

	// Different id, same kind: separate cooldown.
	j3 := job{kind: jobDNS, id: 99, arg: "other.com"}
	if e.onCooldown(j3) {
		t.Error("different id should not be on cooldown")
	}
}

func TestOnCooldownExpires(t *testing.T) {
	e := &Engine{jobs: make(chan job, 8), closed: make(chan struct{})}
	j := job{kind: jobDNS, id: 1, arg: "test.com"}

	e.onCooldown(j)

	// Manually backdate the cooldown entry.
	key := string(rune(j.kind)) + ":" + itoa(j.id)
	e.cool.Store(key, time.Now().Add(-cooldown-time.Second))

	if e.onCooldown(j) {
		t.Error("cooldown should have expired")
	}
}

// ---------------------------------------------------------------------------
// Engine lifecycle: Close
// ---------------------------------------------------------------------------

func TestCloseNilEngine(t *testing.T) {
	var e *Engine
	e.Close() // must not panic
}

func TestCloseIdempotent(t *testing.T) {
	e := &Engine{jobs: make(chan job, 8), closed: make(chan struct{})}
	e.Close()
	e.Close() // second close must not panic
}

// ---------------------------------------------------------------------------
// Public methods: ResolveDomain, ProbeSite
// ---------------------------------------------------------------------------

func TestResolveDomainEnqueues(t *testing.T) {
	e := &Engine{jobs: make(chan job, 8), closed: make(chan struct{})}
	e.ResolveDomain(1, "example.com")
	if len(e.jobs) != 1 {
		t.Error("ResolveDomain should enqueue one job")
	}
	j := <-e.jobs
	if j.kind != jobDNS || j.id != 1 || j.arg != "example.com" {
		t.Errorf("unexpected job: %+v", j)
	}
}

func TestProbeSiteEnqueues(t *testing.T) {
	e := &Engine{jobs: make(chan job, 8), closed: make(chan struct{})}
	ctx := context.Background()
	e.ProbeSite(ctx, 2, "https://example.com")
	if len(e.jobs) != 1 {
		t.Error("ProbeSite should enqueue one job")
	}
	j := <-e.jobs
	if j.kind != jobHTTP || j.id != 2 || j.arg != "https://example.com" || j.ctx != ctx {
		t.Errorf("unexpected job: %+v", j)
	}
}

// ---------------------------------------------------------------------------
// doDNS: nil resolver (early return)
// ---------------------------------------------------------------------------

func TestDoDNSNilResolver(t *testing.T) {
	e := &Engine{resolv: nil}
	e.doDNS(1, "example.com") // must not panic
}

// ---------------------------------------------------------------------------
// doHTTP: bad URL (empty host -> early return)
// ---------------------------------------------------------------------------

func TestDoHTTPBadURL(t *testing.T) {
	e := &Engine{client: &http.Client{}}
	e.doHTTP(context.Background(), 1, "://") // must not panic
}

func TestDoHTTPRequestError(t *testing.T) {
	e := &Engine{client: &http.Client{}}
	// A nil context makes NewRequestWithContext return an error.
	e.doHTTP(nil, 1, "https://example.com") //nolint:staticcheck // intentional nil ctx
}

// ---------------------------------------------------------------------------
// doHTTP: integration with httptest (needs PG)
// ---------------------------------------------------------------------------

func TestDoHTTPIntegration(t *testing.T) {
	as := stubAssetStore(t)

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><title>Test Page</title><body>hello</body></html>`)
	}))
	t.Cleanup(ts.Close)

	e := &Engine{
		as:     as,
		client: ts.Client(),
		jobs:   make(chan job, queueSize),
		closed: make(chan struct{}),
	}

	e.doHTTP(context.Background(), 1, ts.URL)
}

func TestDoHTTPLargeBody(t *testing.T) {
	as := stubAssetStore(t)

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, "<html><title>Big Page</title><body>")
		// Write ~2 MiB of padding; the reader caps at 1 MiB.
		io.Copy(w, strings.NewReader(strings.Repeat("x", 2<<20))) //nolint:errcheck
		fmt.Fprint(w, "</body></html>")
	}))
	t.Cleanup(ts.Close)

	e := &Engine{
		as:     as,
		client: ts.Client(),
		jobs:   make(chan job, queueSize),
		closed: make(chan struct{}),
	}

	e.doHTTP(context.Background(), 1, ts.URL)
}

func TestDoHTTPNoTitle(t *testing.T) {
	as := stubAssetStore(t)

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"status":"ok"}`)
	}))
	t.Cleanup(ts.Close)

	e := &Engine{
		as:     as,
		client: ts.Client(),
		jobs:   make(chan job, queueSize),
		closed: make(chan struct{}),
	}

	e.doHTTP(context.Background(), 1, ts.URL)
}

func TestDoHTTPClientError(t *testing.T) {
	e := &Engine{
		client: &http.Client{
			Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
				return nil, fmt.Errorf("simulated network error")
			}),
		},
	}
	e.doHTTP(context.Background(), 1, "https://unreachable.test")
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) { return f(req) }

// stubAssetStore returns a usable AssetStore backed by a real PG connection,
// or skips the test when PG is unavailable.
func stubAssetStore(t *testing.T) *db.AssetStore {
	t.Helper()
	dsn, _, err := db.DSN()
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	d, err := db.Open(dsn)
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { d.Close() })
	return d.Assets()
}

// deadAssetStore returns an AssetStore whose DB calls return errors (connection
// refused) instead of panicking. This lets tests exercise code paths that call
// UpsertIP/UpsertSubdomain/UpsertHTTPService without a real PostgreSQL server:
// those methods return an error (which the caller discards), so the test completes.
func deadAssetStore(t *testing.T) *db.AssetStore {
	t.Helper()
	sqlDB, err := sql.Open("pgx", "postgres://x:x@127.0.0.1:1/x")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { sqlDB.Close() })
	d := &db.DB{DB: sqlDB}
	return d.Assets()
}

func TestDoHTTPFullPath(t *testing.T) {
	as := stubAssetStore(t)

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><title>Full Path</title><body>content</body></html>`)
	}))
	t.Cleanup(ts.Close)

	e := &Engine{
		as:     as,
		client: ts.Client(),
		jobs:   make(chan job, 8),
		closed: make(chan struct{}),
	}
	e.doHTTP(context.Background(), 1, ts.URL)
}

func TestDoHTTPDeadDB(t *testing.T) {
	as := deadAssetStore(t)

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><title>Dead DB</title><body>ok</body></html>`)
	}))
	t.Cleanup(ts.Close)

	e := &Engine{
		as:     as,
		client: ts.Client(),
		jobs:   make(chan job, 8),
		closed: make(chan struct{}),
	}
	e.doHTTP(context.Background(), 1, ts.URL)
}

// ---------------------------------------------------------------------------
// doDNS: integration
// ---------------------------------------------------------------------------

func TestDoDNSIntegration(t *testing.T) {
	as := stubAssetStore(t)

	e := &Engine{
		as:     as,
		resolv: nil,
		jobs:   make(chan job, queueSize),
		closed: make(chan struct{}),
	}

	// With nil resolver the method returns immediately; this confirms the path
	// does not panic when the asset store is wired but the resolver is absent.
	e.doDNS(1, "example.com")
}

func testResolver(t *testing.T) *Engine {
	t.Helper()
	e := New(nil, nil, 0)
	e.Close()
	if e.resolv == nil {
		t.Skip("dnsx resolver not available")
	}
	return e
}

func TestDoDNSWithResolverDeadDB(t *testing.T) {
	e := testResolver(t)
	e.as = deadAssetStore(t)
	e.doDNS(1, "example.com")
}

func TestDoDNSQueryError(t *testing.T) {
	e := testResolver(t)
	e.as = deadAssetStore(t)
	e.doDNS(1, "this-domain-does-not-exist-artex-test.example")
}

func TestDoDNSCNAME(t *testing.T) {
	e := testResolver(t)
	e.as = deadAssetStore(t)
	// www.github.com typically returns a CNAME record.
	e.doDNS(1, "www.github.com")
}

// ---------------------------------------------------------------------------
// Worker integration
// ---------------------------------------------------------------------------

func TestWorkerProcessesDNSJob(t *testing.T) {
	e := &Engine{
		resolv: nil, // DNS becomes a no-op
		jobs:   make(chan job, 8),
		closed: make(chan struct{}),
	}

	go e.worker()

	e.jobs <- job{kind: jobDNS, id: 1, arg: "worker-test.com"}

	// Give the worker a moment to consume the job, then shut down.
	time.Sleep(50 * time.Millisecond)
	e.Close()
}

func TestWorkerProcessesHTTPJob(t *testing.T) {
	as := stubAssetStore(t)

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `<title>Worker</title>`)
	}))
	t.Cleanup(ts.Close)

	e := &Engine{
		as:     as,
		resolv: nil,
		client: ts.Client(),
		jobs:   make(chan job, 8),
		closed: make(chan struct{}),
	}

	go e.worker()

	e.jobs <- job{kind: jobHTTP, id: 1, arg: ts.URL, ctx: context.Background()}

	time.Sleep(50 * time.Millisecond)
	e.Close()
}

func TestWorkerProcessesHTTPJobDeadDB(t *testing.T) {
	as := deadAssetStore(t)

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `<title>Worker Dead DB</title>`)
	}))
	t.Cleanup(ts.Close)

	e := &Engine{
		as:     as,
		resolv: nil,
		client: ts.Client(),
		jobs:   make(chan job, 8),
		closed: make(chan struct{}),
	}

	go e.worker()

	e.jobs <- job{kind: jobHTTP, id: 10, arg: ts.URL, ctx: context.Background()}

	time.Sleep(50 * time.Millisecond)
	e.Close()
}

func TestWorkerCooldownSkip(t *testing.T) {
	e := &Engine{
		resolv: nil,
		jobs:   make(chan job, 8),
		closed: make(chan struct{}),
	}

	go e.worker()

	// Send the same job twice quickly; the second should hit the cooldown continue.
	j := job{kind: jobDNS, id: 500, arg: "cooldown-test.com"}
	e.jobs <- j
	time.Sleep(20 * time.Millisecond)
	e.jobs <- j
	time.Sleep(20 * time.Millisecond)
	e.Close()
}

func TestWorkerStopsOnClose(t *testing.T) {
	e := &Engine{
		jobs:   make(chan job, 8),
		closed: make(chan struct{}),
	}

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		e.worker()
	}()

	e.Close()

	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("worker did not stop after Close")
	}
}

// ---------------------------------------------------------------------------
// buildClient
// ---------------------------------------------------------------------------

func TestBuildClientNilProxy(t *testing.T) {
	c := buildClient(nil)
	if c == nil {
		t.Fatal("buildClient(nil) returned nil")
	}
	if c.Timeout != httpTimeout {
		t.Errorf("timeout = %v, want %v", c.Timeout, httpTimeout)
	}
}

func TestBuildClientWithProxy(t *testing.T) {
	called := false
	proxy := func() string {
		called = true
		return ""
	}
	c := buildClient(proxy)
	if c == nil {
		t.Fatal("buildClient returned nil")
	}
	tr, ok := c.Transport.(http.RoundTripper)
	if !ok || tr == nil {
		t.Fatal("expected non-nil transport")
	}
	_ = called // proxy is called lazily per-request
}

func TestBuildClientCheckRedirect(t *testing.T) {
	c := buildClient(nil)
	if c.CheckRedirect == nil {
		t.Fatal("expected CheckRedirect to be set")
	}
	err := c.CheckRedirect(nil, nil)
	if err != http.ErrUseLastResponse {
		t.Errorf("CheckRedirect = %v, want ErrUseLastResponse", err)
	}
}

// ---------------------------------------------------------------------------
// New (does not call AssetStore methods during construction; nil is safe)
// ---------------------------------------------------------------------------

func TestNewDefaultWorkers(t *testing.T) {
	e := New(nil, nil, 0)
	if e == nil {
		t.Fatal("New returned nil")
	}
	e.Close()
}

func TestNewCustomWorkers(t *testing.T) {
	e := New(nil, nil, 2)
	if e == nil {
		t.Fatal("New returned nil")
	}
	e.Close()
}

func TestNewNegativeWorkers(t *testing.T) {
	e := New(nil, nil, -1)
	if e == nil {
		t.Fatal("New returned nil")
	}
	e.Close()
}

func TestNewWithProxy(t *testing.T) {
	e := New(nil, func() string { return "http://127.0.0.1:8080" }, 1)
	if e == nil {
		t.Fatal("New returned nil")
	}
	e.Close()
}
