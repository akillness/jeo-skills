// Package egress is the governor the platform-owned HTTP requests to a target
// pass through (WebFetch, the http custom tools, the enrich probe). A noise
// profile (the noise_profile setting, else ARTEX_NOISE_PROFILE; SetProfile
// changes it at runtime) sets every lever: a token bucket, a jitter and a
// concurrency cap per host, a global concurrency cap, backoff on 429/503, and,
// for the GET requests of one task, coalescing and a short cache. The default
// profile, off, is a strict passthrough: requests and timing are unchanged.
package egress

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math/rand/v2"
	"net"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"unicode"

	"github.com/Autumn-27/artex/intercept"
)

// Profile is one noise level. The zero Profile is off. Later levers (scanner
// flags, proxy throttle) are new fields here.
type Profile struct {
	Name       string
	RPS        float64       // token refill per host, requests per second; 0 = off
	Burst      int           // bucket size per host
	MaxPerHost int           // requests in flight per host
	MaxGlobal  int           // requests in flight across all hosts
	Jitter     float64       // each send waits a uniform [0, min(Jitter/RPS, MaxJitter)]
	CacheTTL   time.Duration // per-task cache of identical GETs; 0 = coalescing only
	MaxRetries int           // retries after a 429/503 (bodiless GET/HEAD/OPTIONS only)
	BaseDelay  time.Duration // backoff without Retry-After, doubled per retry
	MaxDelay   time.Duration // cap of one backoff; a longer Retry-After is not retried
	UserAgent  string        // ARTEX_TARGET_USER_AGENT, set on requests that have none; "" = unchanged
}

// MaxJitter caps the jitter of one send.
const MaxJitter = 250 * time.Millisecond

// Profiles are the values of ARTEX_NOISE_PROFILE besides off (the default).
var Profiles = map[string]Profile{
	"quiet":      {Name: "quiet", RPS: 2, Burst: 4, MaxPerHost: 1, MaxGlobal: 8, Jitter: 0.5, CacheTTL: time.Minute, MaxRetries: 3, BaseDelay: 2 * time.Second, MaxDelay: time.Minute},
	"balanced":   {Name: "balanced", RPS: 5, Burst: 10, MaxPerHost: 2, MaxGlobal: 16, Jitter: 0.2, CacheTTL: 30 * time.Second, MaxRetries: 3, BaseDelay: time.Second, MaxDelay: 30 * time.Second},
	"aggressive": {Name: "aggressive", RPS: 20, Burst: 40, MaxPerHost: 4, MaxGlobal: 32, Jitter: 0.1, CacheTTL: 10 * time.Second, MaxRetries: 2, BaseDelay: 500 * time.Millisecond, MaxDelay: 10 * time.Second},
}

// ProfileByName returns the profile name names (off, quiet, balanced or
// aggressive, any case); ok is false for any other name, "" included. A profile
// other than off carries ARTEX_TARGET_USER_AGENT; off stays a strict passthrough.
func ProfileByName(name string) (p Profile, ok bool) {
	name = strings.ToLower(strings.TrimSpace(name))
	if name == "off" {
		return Profile{Name: "off"}, true
	}
	if p, ok = Profiles[name]; !ok {
		return Profile{Name: "off"}, false
	}
	if ua := strings.TrimSpace(os.Getenv("ARTEX_TARGET_USER_AGENT")); strings.ContainsFunc(ua, unicode.IsControl) {
		slog.Warn("[egress] ARTEX_TARGET_USER_AGENT contains a control character, ignored")
	} else {
		p.UserAgent = ua
	}
	return p, true
}

// ProfileFromEnv returns the profile ARTEX_NOISE_PROFILE names; unset, "off" or
// unknown is off.
func ProfileFromEnv() Profile {
	name := strings.TrimSpace(os.Getenv("ARTEX_NOISE_PROFILE"))
	p, ok := ProfileByName(name)
	if !ok && name != "" {
		slog.Warn("[egress] unknown noise profile, using off", "ARTEX_NOISE_PROFILE", name)
	}
	return p
}

// current is the governor new requests use. SetProfile replaces it; a request
// already in flight keeps the governor it started on, so its slots are
// released where they were taken.
var (
	current      atomic.Pointer[Governor]
	initCurrent  sync.Once
	reporterOnce sync.Once
)

// Current returns the governor of the process: the one SetProfile published
// last, or, before any SetProfile, one built from the environment on first use.
// WebFetch, the http custom tools and the enrich probe resolve it per request.
func Current() *Governor {
	if g := current.Load(); g != nil {
		return g
	}
	initCurrent.Do(func() {
		g := New(ProfileFromEnv())
		if current.CompareAndSwap(nil, g) {
			slog.Info("[egress] noise profile active", "profile", g.p.Name)
		}
		startReporter()
	})
	return current.Load()
}

// CurrentProfile is the profile of Current.
func CurrentProfile() Profile { return Current().p }

// SetProfile builds a governor for p and publishes it: new requests use it,
// requests in flight finish on the previous one. The counters start afresh.
func SetProfile(p Profile) *Governor {
	g := New(p)
	current.Store(g)
	slog.Info("[egress] noise profile active", "profile", g.p.Name)
	startReporter()
	return g
}

// startReporter starts the one package-level ticker that logs, once a minute,
// the noise counter of each host of the current governor. SetProfile never
// starts another.
func startReporter() {
	reporterOnce.Do(func() {
		go func() {
			t := time.NewTicker(time.Minute)
			defer t.Stop()
			for range t.C {
				for _, l := range Current().report() {
					slog.Info(l)
				}
			}
		}()
	})
}

// Governor holds the per-host state and the per-task response cache.
type Governor struct {
	p       Profile
	global  chan struct{}
	mu      sync.Mutex
	hosts   map[string]*hostState
	flights map[string]*flight
}

type hostState struct {
	slots     chan struct{}
	tokens    float64
	last      time.Time
	notBefore time.Time // end of a 429/503 backoff
	// noise counter of the current minute, and the peak per minute so far
	sent, dupes, inflight, peakInflight, peakRPM int
}

type flight struct {
	done chan struct{}
	val  any
	err  error
	exp  time.Time // zero until cached
}

// New builds a Governor for p.
func New(p Profile) *Governor {
	return &Governor{p: p, global: make(chan struct{}, max(p.MaxGlobal, 1)), hosts: map[string]*hostState{}, flights: map[string]*flight{}}
}

func (g *Governor) off() bool { return g.p.RPS <= 0 }

// Profile is the profile g was built for.
func (g *Governor) Profile() Profile { return g.p }

// HostKey is the lowercased host, with the port when it is not the default.
func HostKey(u *url.URL) string {
	h, p := strings.ToLower(u.Hostname()), u.Port()
	if p == "" || (u.Scheme == "http" && p == "80") || (u.Scheme == "https" && p == "443") {
		return h
	}
	return net.JoinHostPort(h, p)
}

func (g *Governor) jitterBound() time.Duration {
	return min(time.Duration(g.p.Jitter/g.p.RPS*float64(time.Second)), MaxJitter)
}

func (g *Governor) jitter() time.Duration { return rand.N(g.jitterBound() + 1) }

func (g *Governor) host(key string) *hostState {
	g.mu.Lock()
	defer g.mu.Unlock()
	h := g.hosts[key]
	if h == nil {
		h = &hostState{slots: make(chan struct{}, max(g.p.MaxPerHost, 1)), tokens: float64(g.p.Burst), last: time.Now()}
		g.hosts[key] = h
	}
	return h
}

// acquire waits for a host slot, a token of the host's bucket (or the end of
// its backoff) plus the jitter, then a global slot, taken last so a waiting
// host holds no global slot. release frees both; it may be called twice.
func (g *Governor) acquire(ctx context.Context, key string) (release func(), err error) {
	h := g.host(key)
	select {
	case h.slots <- struct{}{}:
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	if err = sleep(ctx, g.reserve(h)+g.jitter()); err == nil {
		select {
		case g.global <- struct{}{}:
		case <-ctx.Done():
			err = ctx.Err()
		}
	}
	if err != nil {
		<-h.slots
		return nil, err
	}
	g.mu.Lock()
	h.sent++
	h.inflight++
	h.peakInflight = max(h.peakInflight, h.inflight)
	g.mu.Unlock()
	var once sync.Once
	return func() {
		once.Do(func() { g.mu.Lock(); h.inflight--; g.mu.Unlock(); <-g.global; <-h.slots })
	}, nil
}

// reserve takes a token from h and returns how long to wait for it.
func (g *Governor) reserve(h *hostState) time.Duration {
	g.mu.Lock()
	defer g.mu.Unlock()
	now := time.Now()
	h.tokens = min(float64(g.p.Burst), h.tokens+now.Sub(h.last).Seconds()*g.p.RPS) - 1
	h.last = now
	return max(time.Duration(-h.tokens/g.p.RPS*float64(time.Second)), h.notBefore.Sub(now), 0)
}

// backoff is the wait after a 429/503: Retry-After (seconds or HTTP date), else
// BaseDelay doubled per retry, capped at MaxDelay. ok is false when Retry-After
// asks for more than MaxDelay.
func (g *Governor) backoff(h http.Header, attempt int) (d time.Duration, ok bool) {
	v := strings.TrimSpace(h.Get("Retry-After"))
	if n, err := strconv.ParseInt(v, 10, 64); err == nil && n >= 0 {
		maxSec := int64(g.p.MaxDelay / time.Second)
		if maxSec < 0 {
			maxSec = 0
		}
		if n > maxSec {
			return 0, false
		}
		return time.Duration(n) * time.Second, true
	}
	if t, err := http.ParseTime(v); err == nil {
		return max(time.Until(t), 0), time.Until(t) <= g.p.MaxDelay
	}
	if d = g.p.BaseDelay << attempt; d <= 0 || d > g.p.MaxDelay {
		d = g.p.MaxDelay
	}
	return d, true
}

func sleep(ctx context.Context, d time.Duration) error {
	if d <= 0 {
		return ctx.Err()
	}
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-t.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// report returns one noise line per active host and starts a new minute.
func (g *Governor) report() []string {
	g.mu.Lock()
	defer g.mu.Unlock()
	var out []string
	for key, h := range g.hosts {
		if h.sent == 0 && h.dupes == 0 {
			continue
		}
		h.peakRPM = max(h.peakRPM, h.sent)
		out = append(out, fmt.Sprintf("[egress] noise profile=%s host=%s rpm=%d peak_rpm=%d peak_inflight=%d duplicates_avoided=%d",
			g.p.Name, key, h.sent, h.peakRPM, h.peakInflight, h.dupes))
		h.sent, h.dupes, h.peakInflight = 0, 0, h.inflight
	}
	sort.Strings(out)
	return out
}

// HostNoise is the noise counter of one host: the current minute (RPM,
// DuplicatesAvoided, PeakInflight), the peak per minute so far, and the
// requests in flight now.
type HostNoise struct {
	Host              string `json:"host"`
	RPM               int    `json:"rpm"`
	PeakRPM           int    `json:"peak_rpm"`
	PeakInflight      int    `json:"peak_inflight"`
	Inflight          int    `json:"inflight"`
	DuplicatesAvoided int    `json:"duplicates_avoided"`
}

// Snapshot returns the counter of every host that has sent or deduplicated a
// request, sorted by host. Unlike report it starts no new minute.
func (g *Governor) Snapshot() []HostNoise {
	g.mu.Lock()
	defer g.mu.Unlock()
	out := []HostNoise{}
	for key, h := range g.hosts {
		if h.sent == 0 && h.dupes == 0 && h.inflight == 0 && h.peakRPM == 0 {
			continue
		}
		out = append(out, HostNoise{Host: key, RPM: h.sent, PeakRPM: max(h.peakRPM, h.sent),
			PeakInflight: h.peakInflight, Inflight: h.inflight, DuplicatesAvoided: h.dupes})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Host < out[j].Host })
	return out
}

var errNotShared = errors.New("egress: response not shared")

// share runs fn once for the concurrent callers of key and keeps its value for
// the ttl fn returns. A caller that waited on a flight that failed for a reason
// of the leader's own (its context, a response too large to share) runs fn
// itself, uncached; fn paces its own send (transport.send goes through
// acquire), so that request is paced like any other.
func (g *Governor) share(ctx context.Context, host, key string, fn func() (any, time.Duration, error)) (any, error) {
	g.mu.Lock()
	f := g.flights[key]
	if f != nil && !f.exp.IsZero() && time.Now().After(f.exp) {
		f = nil
	}
	if f != nil {
		g.mu.Unlock()
		select {
		case <-f.done:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
		if errors.Is(f.err, errNotShared) || errors.Is(f.err, context.Canceled) || errors.Is(f.err, context.DeadlineExceeded) {
			v, _, err := fn()
			return v, err
		}
		h := g.host(host)
		g.mu.Lock()
		h.dupes++
		g.mu.Unlock()
		return f.val, f.err
	}
	f = &flight{done: make(chan struct{})}
	g.flights[key] = f
	for k, o := range g.flights {
		if !o.exp.IsZero() && time.Now().After(o.exp) {
			delete(g.flights, k)
		}
	}
	g.mu.Unlock()
	v, ttl, err := fn()
	f.val, f.err = v, err
	g.mu.Lock()
	if err == nil && ttl > 0 {
		f.exp = time.Now().Add(ttl)
	} else if g.flights[key] == f {
		delete(g.flights, key)
	}
	close(f.done)
	g.mu.Unlock()
	return v, err
}

// taskKey identifies the task (or conversation) of ctx; "" when there is none,
// and then nothing is coalesced or cached.
func taskKey(ctx context.Context) string {
	s, _ := intercept.TargetScopeFromContext(ctx)
	if s.TaskID != "" {
		return "task:" + s.TaskID
	}
	if s.ConversationID != 0 {
		return "conv:" + strconv.FormatInt(s.ConversationID, 10)
	}
	return ""
}

// Do runs fn as one send to u for a caller whose HTTP client is not ours
// (WebFetch): only the rate, jitter and concurrency of u's host. Nothing is
// coalesced or cached: each WebFetch call carries its own proxy and its own
// redirect and dial gate, which a shared key would have to fingerprint
// completely; running every call keeps every gate decision, at the cost of a
// duplicate request now and then. fn hides the response, so a 429/503 is not
// retried here. Off, fn just runs.
func Do[T any](g *Governor, ctx context.Context, u *url.URL, fn func() (T, error)) (T, error) {
	if g.off() {
		return fn()
	}
	release, err := g.acquire(ctx, HostKey(u))
	if err != nil {
		var zero T
		return zero, err
	}
	defer release()
	return fn()
}

// Transport returns base (nil: http.DefaultTransport) governed by g; off, base
// itself. namespace names the client (a custom tool's key, "enrich"): it is
// part of the cache key, so clients with other proxies, gates or pins never
// share a response.
func (g *Governor) Transport(namespace string, base http.RoundTripper) http.RoundTripper {
	if base == nil {
		base = http.DefaultTransport
	}
	if g.off() {
		return base
	}
	return &transport{g, namespace, base}
}

type transport struct {
	g         *Governor
	namespace string
	base      http.RoundTripper
}

// Dynamic returns base (nil: http.DefaultTransport) governed by the governor
// current at each request, for a client built once and kept: a later
// SetProfile applies to its next request. Off, the request goes to base as is.
func Dynamic(namespace string, base http.RoundTripper) http.RoundTripper {
	if base == nil {
		base = http.DefaultTransport
	}
	return dynamicTransport{namespace, base}
}

type dynamicTransport struct {
	namespace string
	base      http.RoundTripper
}

func (d dynamicTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	return Current().Transport(d.namespace, d.base).RoundTrip(req)
}

const maxSharedBody = 2 << 20 // a larger response is neither coalesced nor cached

func (t *transport) RoundTrip(req *http.Request) (*http.Response, error) {
	if ua := t.g.p.UserAgent; ua != "" && req.Header.Get("User-Agent") == "" {
		req = req.Clone(req.Context())
		req.Header.Set("User-Agent", ua)
	}
	task := taskKey(req.Context())
	if task == "" || req.Method != http.MethodGet || (req.Body != nil && req.Body != http.NoBody) {
		return t.send(req)
	}
	// The key holds the headers: a request with other credentials is its own.
	var hdr bytes.Buffer
	_ = req.Header.Write(&hdr)
	var own *http.Response // the leader's response when too large to share
	key := t.namespace + "\x00" + task + "\x00GET " + req.URL.String() + "\x00" + hdr.String()
	v, err := t.g.share(req.Context(), HostKey(req.URL), key, func() (any, time.Duration, error) {
		resp, err := t.send(req)
		if err != nil {
			return nil, 0, err
		}
		body, err := io.ReadAll(io.LimitReader(resp.Body, maxSharedBody+1))
		if err != nil || len(body) > maxSharedBody {
			resp.Body = struct {
				io.Reader
				io.Closer
			}{io.MultiReader(bytes.NewReader(body), resp.Body), resp.Body}
			own = resp
			return nil, 0, errNotShared
		}
		resp.Body.Close()
		ttl := t.g.p.CacheTTL
		if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500 {
			ttl = 0 // coalesced, never cached
		}
		return &stored{resp, body}, ttl, nil
	})
	if own != nil {
		return own, nil // too large to share: this caller's own response
	}
	if err != nil {
		return nil, err
	}
	s := v.(*stored)
	r := *s.resp
	r.Header, r.Body, r.ContentLength, r.Request = s.resp.Header.Clone(), io.NopCloser(bytes.NewReader(s.body)), int64(len(s.body)), req
	return &r, nil
}

// stored is a shared response; each caller gets a copy.
type stored struct {
	resp *http.Response
	body []byte
}

// send makes one request within the host's limits. A 429/503 pauses the host
// and, for a bodiless GET/HEAD/OPTIONS, is retried up to MaxRetries times; a
// request that may change state is never retried. The slots are held until
// the response body is closed.
func (t *transport) send(req *http.Request) (*http.Response, error) {
	host := HostKey(req.URL)
	for attempt := 0; ; attempt++ {
		release, err := t.g.acquire(req.Context(), host)
		if err != nil {
			return nil, err
		}
		resp, err := t.base.RoundTrip(req)
		if err != nil {
			release()
			return nil, err
		}
		resp.Body = &releaseBody{resp.Body, release}
		if resp.StatusCode != http.StatusTooManyRequests && resp.StatusCode != http.StatusServiceUnavailable {
			return resp, nil
		}
		d, ok := t.g.backoff(resp.Header, attempt)
		t.g.mu.Lock()
		h := t.g.hosts[host]
		if until := time.Now().Add(min(d, t.g.p.MaxDelay)); until.After(h.notBefore) {
			h.notBefore = until
		}
		t.g.mu.Unlock()
		idempotent := req.Method == http.MethodGet || req.Method == http.MethodHead || req.Method == http.MethodOptions
		if !ok || !idempotent || (req.Body != nil && req.Body != http.NoBody) || attempt >= t.g.p.MaxRetries {
			return resp, nil
		}
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 64<<10))
		resp.Body.Close()
	}
}

type releaseBody struct {
	io.ReadCloser
	release func()
}

func (b *releaseBody) Close() error {
	err := b.ReadCloser.Close()
	b.release()
	return err
}
