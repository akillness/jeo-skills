package egress

import (
	"context"
	"encoding/base64"
	"errors"
	"testing"
	"time"
)

func TestMarkProxyURL(t *testing.T) {
	for in, want := range map[string]string{
		"http://127.0.0.1:8788":            "http://artex-pace:artex-pace@127.0.0.1:8788",
		"http://u:p@127.0.0.1:8788":        "http://u:p@127.0.0.1:8788",
		"":                                 "",
		"127.0.0.1:8788":                   "127.0.0.1:8788",
		"socks5://proxy.example.test:1080": "socks5://artex-pace:artex-pace@proxy.example.test:1080",
	} {
		if got := MarkProxyURL(in); got != want {
			t.Errorf("MarkProxyURL(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestIsPaceMarker(t *testing.T) {
	enc := func(s string) string { return base64.StdEncoding.EncodeToString([]byte(s)) }
	for v, want := range map[string]bool{
		"Basic " + enc("artex-pace:artex-pace"):  true,
		"basic " + enc("artex-pace:x"):           true,
		"Basic " + enc("user:pass"):              false,
		"Bearer " + enc("artex-pace:artex-pace"): false,
		"Basic !!!":                              false,
		"Basic":                                  false,
		"":                                       false,
	} {
		if got := IsPaceMarker(v); got != want {
			t.Errorf("IsPaceMarker(%q) = %v, want %v", v, got, want)
		}
	}
}

func TestWait(t *testing.T) {
	if err := New(Profile{Name: "off"}).Wait(t.Context(), "a.example"); err != nil {
		t.Fatalf("off Wait: %v", err)
	}
	off := New(Profile{Name: "off"})
	_ = off.Wait(t.Context(), "a.example")
	if s := off.Snapshot(); len(s) != 0 {
		t.Fatalf("off counted: %v", s)
	}

	// 10 req/s, burst 1, no jitter: the second Wait takes ~100 ms.
	g := New(Profile{Name: "test", RPS: 10, Burst: 1, MaxPerHost: 1, MaxGlobal: 1})
	start := time.Now()
	for range 2 {
		if err := g.Wait(t.Context(), "a.example"); err != nil {
			t.Fatal(err)
		}
	}
	if d := time.Since(start); d < 80*time.Millisecond {
		t.Fatalf("two Waits at 10 req/s took %v", d)
	}
	if s := g.Snapshot(); len(s) != 1 || s[0].RPM != 2 || s[0].Inflight != 0 || s[0].PeakInflight != 0 {
		t.Fatalf("snapshot after Wait = %+v, want rpm 2 and no in-flight slot", s)
	}

	// A wait past the context's end returns its error and still counts.
	slow := New(Profile{Name: "test", RPS: 0.5, Burst: 1, MaxPerHost: 1, MaxGlobal: 1})
	_ = slow.Wait(t.Context(), "b.example")
	ctx, cancel := context.WithTimeout(t.Context(), 20*time.Millisecond)
	defer cancel()
	if err := slow.Wait(ctx, "b.example"); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("bounded Wait: %v, want DeadlineExceeded", err)
	}
	if s := slow.Snapshot(); len(s) != 1 || s[0].RPM != 2 {
		t.Fatalf("snapshot after a timed-out Wait = %+v, want rpm 2", s)
	}

	// The package Wait uses the current profile.
	keepProfile(t)
	SetProfile(Profile{Name: "off"})
	if err := Wait(t.Context(), "c.example"); err != nil || len(Current().Snapshot()) != 0 {
		t.Fatalf("package Wait under off: err=%v snapshot=%v", err, Current().Snapshot())
	}
}
