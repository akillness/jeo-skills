package egress

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"runtime"
	"sync"
	"testing"
)

// keepProfile restores the process profile after a test that changes it.
func keepProfile(t *testing.T) {
	prev := CurrentProfile()
	t.Cleanup(func() { SetProfile(prev) })
}

func TestSetProfileConcurrentAndConsistent(t *testing.T) {
	keepProfile(t)
	names := []string{"off", "quiet", "balanced", "aggressive"}
	var wg sync.WaitGroup
	for i := range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := range 200 {
				p, _ := ProfileByName(names[(i+j)%len(names)])
				SetProfile(p)
				if g := Current(); g == nil || g.Profile().Name == "" {
					t.Errorf("Current() = %v during swaps", g)
					return
				}
				_ = CurrentProfile()
			}
		}()
	}
	wg.Wait()
	for _, name := range names {
		p, _ := ProfileByName(name)
		g := SetProfile(p)
		if Current() != g || CurrentProfile().Name != name || Current().Profile() != CurrentProfile() {
			t.Fatalf("after SetProfile(%s): Current=%p want %p, CurrentProfile=%q", name, Current(), g, CurrentProfile().Name)
		}
	}
}

// A request in flight keeps the governor it started on: its release frees the
// old governor's slots, and the new governor starts with no counter.
func TestSetProfileInFlightFinishesOnOldGovernor(t *testing.T) {
	keepProfile(t)
	old := SetProfile(open)
	release, err := old.acquire(t.Context(), "a.example")
	if err != nil {
		t.Fatal(err)
	}
	fresh := SetProfile(Profiles["balanced"])
	if Current() != fresh || len(fresh.Snapshot()) != 0 {
		t.Fatalf("new governor: current=%p fresh=%p snapshot=%v", Current(), fresh, fresh.Snapshot())
	}
	if s := old.Snapshot(); len(s) != 1 || s[0].Inflight != 1 {
		t.Fatalf("old governor before release: %+v", s)
	}
	release()
	if s := old.Snapshot(); len(s) != 1 || s[0].Inflight != 0 || s[0].RPM != 1 || s[0].PeakInflight != 1 {
		t.Fatalf("old governor after release: %+v", s)
	}
}

type recordRT struct{ got *http.Request }

func (r *recordRT) RoundTrip(req *http.Request) (*http.Response, error) {
	r.got = req
	return &http.Response{StatusCode: 204, Body: http.NoBody, Request: req}, nil
}

// Off stays a strict passthrough, through Transport and Dynamic alike.
func TestOffIsPassthroughAfterSetProfile(t *testing.T) {
	keepProfile(t)
	t.Setenv("ARTEX_TARGET_USER_AGENT", "artex-test/1")
	off, ok := ProfileByName("OFF")
	if !ok || off.Name != "off" || off.UserAgent != "" {
		t.Fatalf("ProfileByName(OFF) = %+v %v", off, ok)
	}
	SetProfile(off)
	base := &recordRT{}
	if tr := Current().Transport("x", base); tr != http.RoundTripper(base) {
		t.Fatalf("off Transport = %T, want the base itself", tr)
	}
	req := httptest.NewRequest(http.MethodGet, "http://a.example/", nil)
	if _, err := Dynamic("x", base).RoundTrip(req); err != nil || base.got != req || req.Header.Get("User-Agent") != "" {
		t.Fatalf("off Dynamic: err=%v same request=%v UA=%q", err, base.got == req, req.Header.Get("User-Agent"))
	}
	if len(Current().Snapshot()) != 0 {
		t.Fatalf("off counted a request: %v", Current().Snapshot())
	}
	// Any other profile carries the user agent.
	if p, _ := ProfileByName("balanced"); p.UserAgent != "artex-test/1" {
		t.Fatalf("balanced UserAgent = %q", p.UserAgent)
	}
	if _, ok := ProfileByName(""); ok {
		t.Fatal(`ProfileByName("") accepted`)
	}
	if _, ok := ProfileByName("loud"); ok {
		t.Fatal(`ProfileByName("loud") accepted`)
	}
}

// Dynamic resolves the governor per request: a client built before
// SetProfile is paced by the new profile.
func TestDynamicFollowsSetProfile(t *testing.T) {
	keepProfile(t)
	srv := newServer(t, 0, nil)
	SetProfile(Profile{Name: "off"})
	client := &http.Client{Transport: Dynamic("ns", nil)}
	get := func() {
		t.Helper()
		resp, err := client.Get(srv.URL)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
	}
	get()
	g := SetProfile(open)
	get()
	get()
	if s := g.Snapshot(); len(s) != 1 || s[0].RPM != 2 {
		t.Fatalf("snapshot after switch: %+v", s)
	}
}

// Snapshot reads the counters without starting a new minute; report does.
func TestSnapshotDoesNotReset(t *testing.T) {
	g := New(open)
	srv := newServer(t, 0, nil)
	tr := g.Transport("ns", nil)
	for range 3 {
		req, _ := http.NewRequest(http.MethodGet, srv.URL, nil)
		resp, err := tr.RoundTrip(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
	}
	want := HostNoise{Host: HostKey(srvURL(t, srv.URL)), RPM: 3, PeakRPM: 3, PeakInflight: 1}
	for range 2 {
		if s := g.Snapshot(); len(s) != 1 || s[0] != want {
			t.Fatalf("snapshot = %+v, want [%+v]", s, want)
		}
	}
	g.report()
	if s := g.Snapshot(); len(s) != 1 || s[0].RPM != 0 || s[0].PeakRPM != 3 {
		t.Fatalf("snapshot after report = %+v, want rpm 0 and peak 3", s)
	}
}

// SetProfile never starts a goroutine of its own: one ticker serves every
// governor.
func TestSetProfileStartsNoGoroutine(t *testing.T) {
	keepProfile(t)
	SetProfile(Profiles["quiet"]) // the reporter is running from here on
	before := runtime.NumGoroutine()
	for range 50 {
		SetProfile(Profiles["balanced"])
		SetProfile(Profile{Name: "off"})
	}
	if after := runtime.NumGoroutine(); after > before {
		t.Fatalf("goroutines %d -> %d after 100 SetProfile calls", before, after)
	}
}

func srvURL(t *testing.T, raw string) *url.URL {
	t.Helper()
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	return u
}
