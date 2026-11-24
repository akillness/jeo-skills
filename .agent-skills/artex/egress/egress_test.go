package egress

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Autumn-27/artex/intercept"
)

// open is a profile that does not limit, for the tests of one lever.
var open = Profile{Name: "test", RPS: 1000, Burst: 1000, MaxPerHost: 100, MaxGlobal: 100, CacheTTL: time.Minute, MaxRetries: 2, BaseDelay: 10 * time.Millisecond, MaxDelay: 2 * time.Second}

func task(id string) context.Context {
	return intercept.WithTargetScope(context.Background(), intercept.TargetScope{TaskID: id})
}

// server counts its hits and the peak of requests in flight; h, if set, answers.
type server struct {
	*httptest.Server
	hits, inflight, peak atomic.Int64
}

func newServer(t *testing.T, delay time.Duration, h func(n int64, w http.ResponseWriter, r *http.Request)) *server {
	s := &server{}
	s.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n, cur := s.hits.Add(1), s.inflight.Add(1)
		for p := s.peak.Load(); cur > p && !s.peak.CompareAndSwap(p, cur); p = s.peak.Load() {
		}
		time.Sleep(delay)
		s.inflight.Add(-1)
		if h != nil {
			h(n, w, r)
			return
		}
		_, _ = io.WriteString(w, "ok")
	}))
	t.Cleanup(s.Close)
	return s
}

func do(t *testing.T, g *Governor, ctx context.Context, method, u string) (int, string) {
	req, _ := http.NewRequestWithContext(ctx, method, u, nil)
	resp, err := (&http.Client{Transport: g.Transport("test", nil)}).Do(req)
	if err != nil {
		t.Errorf("%s %s: %v", method, u, err)
		return 0, ""
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, string(b)
}

func parallel(n int, f func(i int)) {
	var wg sync.WaitGroup
	for i := range n {
		wg.Add(1)
		go func() { defer wg.Done(); f(i) }()
	}
	wg.Wait()
}

func TestOffIsStrictPassthrough(t *testing.T) {
	g := New(Profile{Name: "off"})
	if g.Transport("test", http.DefaultTransport) != http.DefaultTransport {
		t.Fatal("off: Transport must return the base transport itself")
	}
	s := newServer(t, 50*time.Millisecond, nil)
	start := time.Now()
	parallel(20, func(int) { do(t, g, task("t1"), "GET", s.URL) })
	if d := time.Since(start); s.hits.Load() != 20 || s.peak.Load() < 10 || d > time.Second {
		t.Fatalf("off: hits %d, peak %d, %s; want 20 parallel hits, no delay", s.hits.Load(), s.peak.Load(), d)
	}
	var calls atomic.Int64
	u, _ := url.Parse(s.URL)
	for range 2 {
		_, _ = Do(g, task("t1"), u, func() (int, error) { calls.Add(1); return 0, nil })
	}
	if calls.Load() != 2 || len(g.report()) != 0 {
		t.Fatalf("off: Do calls = %d, report %v; want 2 calls, no counter", calls.Load(), g.report())
	}
}

// TestProfilesRespectRateBurstConcurrency sends burst+extra requests at once:
// the burst leaves at once, the rest at RPS, never more than MaxPerHost at a time.
func TestProfilesRespectRateBurstConcurrency(t *testing.T) {
	for _, tc := range []struct {
		name  string
		extra int
	}{{"quiet", 2}, {"balanced", 5}} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			p := Profiles[tc.name]
			g := New(p)
			s := newServer(t, 20*time.Millisecond, nil)
			n := p.Burst + tc.extra
			start := time.Now()
			parallel(n, func(int) { do(t, g, context.Background(), "GET", s.URL) })
			d := time.Since(start)
			if rate := float64(tc.extra) / d.Seconds(); rate > p.RPS*1.1 || d > 5*time.Second {
				t.Errorf("%d requests in %s: %.1f req/s after the burst, want <= %.0f", n, d, rate, p.RPS)
			}
			if s.hits.Load() != int64(n) || s.peak.Load() > int64(p.MaxPerHost) {
				t.Errorf("hits %d, peak in flight %d; want %d, <= %d", s.hits.Load(), s.peak.Load(), n, p.MaxPerHost)
			}
		})
	}
}

func TestBackoff(t *testing.T) {
	g := New(open)
	s := newServer(t, 0, func(n int64, w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/once" && n == 1:
			w.Header().Set("Retry-After", "1")
			w.WriteHeader(http.StatusTooManyRequests)
		case r.URL.Path == "/far":
			w.Header().Set("Retry-After", "3600")
			w.WriteHeader(http.StatusTooManyRequests)
		case r.URL.Path == "/always":
			w.WriteHeader(http.StatusServiceUnavailable)
		}
	})
	start := time.Now()
	if code, _ := do(t, g, context.Background(), "GET", s.URL+"/once"); code != 200 || s.hits.Load() != 2 || time.Since(start) < 950*time.Millisecond {
		t.Fatalf("Retry-After 1: status %d, hits %d, %s", code, s.hits.Load(), time.Since(start))
	}
	if code, _ := do(t, g, context.Background(), "GET", s.URL+"/always"); code != 503 || s.hits.Load() != 5 {
		t.Fatalf("bounded: status %d, hits %d; want 503 after 1+2 more hits", code, s.hits.Load())
	}
	if code, _ := do(t, g, context.Background(), "POST", s.URL+"/always"); code != 503 || s.hits.Load() != 6 {
		t.Fatalf("POST: status %d, hits %d; want no retry", code, s.hits.Load())
	}
	if code, _ := do(t, g, context.Background(), "GET", s.URL+"/far"); code != 429 || s.hits.Load() != 7 {
		t.Fatalf("Retry-After beyond MaxDelay: status %d, hits %d; want no retry", code, s.hits.Load())
	}
	h := http.Header{"Retry-After": {time.Now().Add(2 * time.Second).UTC().Format(http.TimeFormat)}}
	if d, ok := g.backoff(h, 0); !ok || d <= 0 || d > 2*time.Second {
		t.Fatalf("HTTP-date Retry-After: %s, %v", d, ok)
	}
	// A huge second count used to wrap Duration and look like an immediate retry.
	if d, ok := g.backoff(http.Header{"Retry-After": {"9223372036854775807"}}, 0); ok || d != 0 {
		t.Fatalf("overflow Retry-After: %s %v, want refuse", d, ok)
	}
}

func TestDedupeAndCache(t *testing.T) {
	p := open
	p.CacheTTL = 200 * time.Millisecond
	g := New(p)
	s := newServer(t, 50*time.Millisecond, nil)
	parallel(5, func(int) {
		if _, body := do(t, g, task("t1"), "GET", s.URL); body != "ok" {
			t.Errorf("body = %q", body)
		}
	})
	do(t, g, task("t1"), "GET", s.URL) // cached
	if s.hits.Load() != 1 {
		t.Fatalf("coalesced and cached GETs: hits %d, want 1", s.hits.Load())
	}
	do(t, g, task("t2"), "GET", s.URL)           // another task
	do(t, g, context.Background(), "GET", s.URL) // no task
	time.Sleep(250 * time.Millisecond)
	do(t, g, task("t1"), "GET", s.URL) // expired
	if s.hits.Load() != 4 {
		t.Fatalf("other task, no task, expired: hits %d, want 4", s.hits.Load())
	}
	methods := []string{"POST", "PUT", "PATCH", "DELETE"}
	parallel(8, func(i int) { do(t, g, task("t1"), methods[i/2], s.URL) })
	if s.hits.Load() != 12 {
		t.Fatalf("mutating methods: hits %d, want 12", s.hits.Load())
	}
	if r := g.report(); len(r) != 1 || !strings.Contains(r[0], "rpm=12 ") || !strings.Contains(r[0], "duplicates_avoided=5") {
		t.Fatalf("noise counter: %v", r)
	}
	// WebFetch path: Do paces, and neither coalesces nor caches.
	var calls atomic.Int64
	u, _ := url.Parse(s.URL)
	fn := func() (string, error) { calls.Add(1); time.Sleep(50 * time.Millisecond); return "r", nil }
	parallel(3, func(int) {
		if v, _ := Do(g, task("t1"), u, fn); v != "r" {
			t.Errorf("value = %q", v)
		}
	})
	_, _ = Do(g, task("t1"), u, fn)
	if calls.Load() != 4 {
		t.Fatalf("Do calls = %d, want 4", calls.Load())
	}
	// Two clients (namespaces) with the same task, URL and headers never share
	// a response; the same namespace again is a cache hit.
	for _, ns := range []string{"tool-a", "tool-b", "tool-a"} {
		req, _ := http.NewRequestWithContext(task("t9"), "GET", s.URL+"/ns", nil)
		if resp, err := (&http.Client{Transport: g.Transport(ns, nil)}).Do(req); err == nil {
			resp.Body.Close()
		}
	}
	if s.hits.Load() != 14 {
		t.Fatalf("namespaces: hits %d, want 14 (one per namespace, then a cache hit)", s.hits.Load())
	}
}

// A response too large to share reaches its caller in full and frees its
// slots: with one slot per host, three GETs in a row each complete.
func TestLargeResponseNotSharedReleasesSlots(t *testing.T) {
	p := open
	p.MaxPerHost = 1
	g := New(p)
	big := strings.Repeat("x", 3<<20)
	s := newServer(t, 0, func(_ int64, w http.ResponseWriter, _ *http.Request) { _, _ = io.WriteString(w, big) })
	for i := range 3 {
		ctx, cancel := context.WithTimeout(task("t1"), 5*time.Second)
		if _, body := do(t, g, ctx, "GET", s.URL); len(body) != len(big) {
			t.Fatalf("GET %d: body %d bytes, want %d", i+1, len(body), len(big))
		}
		cancel()
	}
	if s.hits.Load() != 3 {
		t.Fatalf("hits %d, want 3", s.hits.Load())
	}
}

func TestJitterBounded(t *testing.T) {
	for name, want := range map[string]time.Duration{"quiet": 250 * time.Millisecond, "balanced": 40 * time.Millisecond, "aggressive": 5 * time.Millisecond} {
		g := New(Profiles[name])
		if b := g.jitterBound(); b != want {
			t.Fatalf("%s: bound %s, want %s", name, b, want)
		}
		var nonzero bool
		for range 1000 {
			d := g.jitter()
			if d < 0 || d > want {
				t.Fatalf("%s: jitter %s outside [0, %s]", name, d, want)
			}
			nonzero = nonzero || d > 0
		}
		if !nonzero {
			t.Fatalf("%s: jitter always 0", name)
		}
	}
}

func TestUserAgentAndEnv(t *testing.T) {
	var got atomic.Value
	s := newServer(t, 0, func(_ int64, _ http.ResponseWriter, r *http.Request) { got.Store(r.UserAgent()) })
	p := open
	do(t, New(p), context.Background(), "GET", s.URL)
	if ua := got.Load().(string); !strings.HasPrefix(ua, "Go-http-client/") {
		t.Fatalf("unset: User-Agent = %q, want the Go default", ua)
	}
	p.UserAgent = "engagement-ua"
	do(t, New(p), context.Background(), "GET", s.URL)
	if ua := got.Load().(string); ua != "engagement-ua" {
		t.Fatalf("set: User-Agent = %q", ua)
	}
	if p := ProfileFromEnv(); p.RPS != 0 || p.Name != "off" {
		t.Fatalf("default profile: %+v, want off", p)
	}
	t.Setenv("ARTEX_NOISE_PROFILE", "Balanced")
	t.Setenv("ARTEX_TARGET_USER_AGENT", "x/1")
	if p := ProfileFromEnv(); p.Name != "balanced" || p.RPS != 5 || p.UserAgent != "x/1" {
		t.Fatalf("balanced from env: %+v", p)
	}
	t.Setenv("ARTEX_NOISE_PROFILE", "loud")
	if p := ProfileFromEnv(); p.RPS != 0 {
		t.Fatalf("unknown profile: %+v, want off", p)
	}
	for in, want := range map[string]string{"http://Example.COM:80/x": "example.com", "https://a.test:8443/": "a.test:8443"} {
		if u, _ := url.Parse(in); HostKey(u) != want {
			t.Errorf("HostKey(%s) = %q, want %q", in, HostKey(u), want)
		}
	}
}
