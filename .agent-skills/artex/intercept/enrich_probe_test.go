package intercept_test

import (
	"context"
	"net"
	"slices"
	"testing"
	"time"

	"github.com/Autumn-27/artex/enrich"
	"github.com/Autumn-27/artex/intercept"
)

// F13: the HTTP probe of the enrich engine connects through the pinned dialer.
// A probe without a target scope is refused and dials nothing; a probe under a
// gated scope dials the address the pin holds, never the name, and not the
// recording proxy. Without a database: no address reached here is served, so
// no probe writes to the asset store.
func TestEnrichProbeDialsThroughPinnedDialer(t *testing.T) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	proxyAddr := l.Addr().String() // closed: a dial to it is refused
	l.Close()

	for _, tc := range []struct {
		name  string
		proxy func() string
	}{
		{"direct", nil},
		{"recording proxy set", func() string { return "http://" + proxyAddr }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			g := intercept.NewDialGate(t)
			g.Resolve("app.example.com", "203.0.113.7")
			g.Pin("app.example.com", 8080, "203.0.113.7")
			g.Exempt("http://" + proxyAddr)
			e := enrich.New(nil, tc.proxy, 1)
			t.Cleanup(e.Close)

			// One worker: the probe without a scope runs to its end first.
			e.ProbeSite(context.Background(), 1, "http://app.example.com:8080/")
			e.ProbeSite(g.Ctx(), 2, "http://app.example.com:8080/")

			deadline := time.Now().Add(5 * time.Second)
			for len(g.Calls()) == 0 && time.Now().Before(deadline) {
				time.Sleep(10 * time.Millisecond)
			}
			time.Sleep(100 * time.Millisecond)
			if got := g.Calls(); !slices.Equal(got, []string{"203.0.113.7:8080"}) {
				t.Fatalf("dialled %v, want the pinned address only, through the pinned dialer", got)
			}
		})
	}
}
