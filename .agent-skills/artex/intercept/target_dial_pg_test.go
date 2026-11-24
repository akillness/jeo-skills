package intercept

import (
	"context"
	"net"
	"net/http/httptest"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
)

// Step 2.1 against PostgreSQL: a connection no pin covers at the dial opens or
// finds the durable request, connects nowhere, and fails at once.

// pgDialGate is a gate on d with a fake resolver and a recording base dialer.
func pgDialGate(t *testing.T, d *db.DB) (*Interceptor, *fakeResolver, *dialRecorder) {
	t.Helper()
	ic, res := pgGate(t, d)
	rec := newDialRecorder()
	ic.SetBaseDialer(rec.dial)
	return ic, res, rec
}

// openTarget returns the audit target of the single open request of scope.
func openTarget(t *testing.T, d *db.DB, scope TargetScope) (*db.InterceptDetail, db.InterceptTarget) {
	t.Helper()
	ids := openRows(t, d, scope)
	if len(ids) != 1 {
		t.Fatalf("open requests = %v, want one", ids)
	}
	detail, err := d.GetInterceptDetail(ids[0])
	if err != nil || detail == nil || detail.Audit == nil || len(detail.Audit.Targets) != 1 {
		t.Fatalf("request detail = %+v, %v", detail, err)
	}
	return detail, detail.Audit.Targets[0]
}

// The failure test: the check passes on the pinned address, the name answers
// another one before the dial, and the call connects nowhere: not to the old
// address, not to the new one. One new_ip request shows both; once approved,
// the same call connects to the new address.
func TestPinAddressChangedBetweenCheckAndDialNotReachable(t *testing.T) {
	d := targetTestDB(t)
	ic, res, rec := pgDialGate(t, d)
	srv, hits, port := pinnedServer(t, "rebound")
	rec.route("203.0.113.7:"+port, srv.Listener.Addr().String())
	rec.route("203.0.113.9:"+port, srv.Listener.Addr().String())
	res.set("app.example.com", "203.0.113.7")
	scope := taskScope(t, d, ic, time.Minute)
	ctx := WithTargetScope(t.Context(), scope)
	u := "http://app.example.com:" + port + "/"
	pinURL(t, d, ic, scope, u)
	mustPass(t, "the check", ic, scope, u)

	res.set("app.example.com", "203.0.113.9")
	began := time.Now()
	_, err := get(ctx, pinnedClient(true), u)
	want := "TARGET_APPROVAL_PENDING: the connection to app.example.com:" + port + " was not opened: app.example.com now resolves to 203.0.113.9, outside pin v1 (203.0.113.7) of task " + scope.TaskID
	if err == nil || !strings.Contains(err.Error(), want) || !strings.Contains(err.Error(), "Retry the same call after the approval") {
		t.Fatalf("dial after the rebind: %v", err)
	}
	if elapsed := time.Since(began); elapsed > 10*time.Second {
		t.Fatalf("the dial waited %v", elapsed)
	}
	if got := rec.calls(); len(got) != 0 || hits.Load() != 0 {
		t.Fatalf("dialled %v, hits %d; want nothing", got, hits.Load())
	}
	detail, tgt := openTarget(t, d, scope)
	if tgt.Reason != "new_ip" || !slices.Equal(tgt.ResolvedIPs, []string{"203.0.113.9"}) || tgt.PinVersion != 1 ||
		!slices.Equal(tgt.PinnedIPs, []string{"203.0.113.7"}) || detail.ToolName != "WebFetch" || !strings.Contains(string(detail.ToolInput), `"dial": "app.example.com:`+port+`"`) {
		t.Fatalf("request = %+v, target %+v", detail, tgt)
	}

	approveAll(t, d, ic, scope)
	if body, err := get(ctx, pinnedClient(true), u); err != nil || body != "rebound" {
		t.Fatalf("after the approval: %q, %v", body, err)
	}
	if got := rec.calls(); !slices.Equal(got, []string{"203.0.113.9:" + port}) {
		t.Fatalf("dialled %v, want the new address", got)
	}
	if ps := pins(t, d, scope); len(ps) != 2 || ps[0].Version != 2 || !slices.Equal(ps[0].PinnedIPs, []string{"203.0.113.7", "203.0.113.9"}) {
		t.Fatalf("pins = %+v, want v2 with both addresses", ps)
	}
}

// One address outside the pin is enough: nothing is dialled, not even the
// pinned one.
func TestPinnedDialPartialOverlapNotReachable(t *testing.T) {
	d := targetTestDB(t)
	ic, res, rec := pgDialGate(t, d)
	res.set("app.example.com", "203.0.113.7")
	scope := taskScope(t, d, ic, time.Minute)
	pinURL(t, d, ic, scope, "https://app.example.com/")
	res.set("app.example.com", "203.0.113.7", "203.0.113.8")
	_, err := PinnedDialer("WebFetch", true)(WithTargetScope(t.Context(), scope), "tcp", "app.example.com:443")
	if err == nil || !strings.Contains(err.Error(), TargetApprovalPending) || len(rec.calls()) != 0 {
		t.Fatalf("dial: %v, dialled %v", err, rec.calls())
	}
	if _, tgt := openTarget(t, d, scope); tgt.Reason != "new_ip" || !slices.Equal(tgt.ResolvedIPs, []string{"203.0.113.7", "203.0.113.8"}) {
		t.Fatalf("request target %+v", tgt)
	}
}

// A pin revoked between the check and the dial connects nowhere and asks again.
func TestPinnedDialRevokedBetweenCheckAndDial(t *testing.T) {
	d := targetTestDB(t)
	ic, res, rec := pgDialGate(t, d)
	res.set("app.example.com", "203.0.113.7")
	scope := taskScope(t, d, ic, time.Minute)
	pinURL(t, d, ic, scope, "https://app.example.com/")
	mustPass(t, "the check", ic, scope, "https://app.example.com/")
	ps := pins(t, d, scope)
	if _, err := d.RevokeTargetPin(scope.dbRef(t), ps[0].ID); err != nil {
		t.Fatal(err)
	}
	_, err := PinnedDialer("WebFetch", true)(WithTargetScope(t.Context(), scope), "tcp", "app.example.com:443")
	if err == nil || !strings.Contains(err.Error(), TargetApprovalPending) || !strings.Contains(err.Error(), "is not approved for task") || len(rec.calls()) != 0 {
		t.Fatalf("dial: %v, dialled %v", err, rec.calls())
	}
	if _, tgt := openTarget(t, d, scope); tgt.Reason != "no_pin" {
		t.Fatalf("request target %+v", tgt)
	}
}

// A stored exemption is dialled at the addresses the dial resolved and found
// public; the same name on a private address is void at the dial, and with no
// pin it asks, connecting nowhere.
func TestPinnedDialStoredExemptionDialsCheckedAddresses(t *testing.T) {
	d := targetTestDB(t)
	ic, res, rec := pgDialGate(t, d)
	srv, _, port := pinnedServer(t, "package")
	rec.route("198.51.100.20:"+port, srv.Listener.Addr().String())
	rec.route("10.0.0.5:"+port, srv.Listener.Addr().String())
	storedExemptions(t, d, db.TargetExemption{Host: "pkg.example", Port: atoiPort(t, port)})
	scope := taskScope(t, d, ic, time.Minute)
	ctx := WithTargetScope(t.Context(), scope)
	u := "http://pkg.example:" + port + "/"

	res.set("pkg.example", "198.51.100.20")
	if body, err := get(ctx, pinnedClient(true), u); err != nil || body != "package" {
		t.Fatalf("exempt fetch: %q, %v", body, err)
	}
	res.set("pkg.example", "10.0.0.5")
	if _, err := get(ctx, pinnedClient(true), u); err == nil || !strings.Contains(err.Error(), TargetApprovalPending) {
		t.Fatalf("void exemption: %v", err)
	}
	if got := rec.calls(); !slices.Equal(got, []string{"198.51.100.20:" + port}) {
		t.Fatalf("dialled %v, want the checked public address only", got)
	}
	if _, tgt := openTarget(t, d, scope); !tgt.ExemptVoid || tgt.Reason != "no_pin" {
		t.Fatalf("request target %+v, want a void exemption", tgt)
	}
}

// A pinned IP literal is dialled as written, never resolved; a name that
// resolves to the same address is another target, not covered (D22).
func TestPinnedDialIPLiteralPin(t *testing.T) {
	d := targetTestDB(t)
	ic, res, rec := pgDialGate(t, d)
	srv, _, port := pinnedServer(t, "literal")
	rec.route("198.51.100.7:"+port, srv.Listener.Addr().String())
	scope := taskScope(t, d, ic, time.Minute)
	ctx := WithTargetScope(t.Context(), scope)
	pinURL(t, d, ic, scope, "http://198.51.100.7:"+port+"/")
	if body, err := get(ctx, pinnedClient(true), "http://198.51.100.7:"+port+"/"); err != nil || body != "literal" {
		t.Fatalf("literal: %q, %v", body, err)
	}
	if res.total() != 0 {
		t.Fatalf("%d lookups for an IP literal", res.total())
	}
	res.set("lit.example", "198.51.100.7")
	if _, err := get(ctx, pinnedClient(true), "http://lit.example:"+port+"/"); err == nil || !strings.Contains(err.Error(), TargetApprovalPending) {
		t.Fatalf("a name on the pinned address: %v", err)
	}
	if got := rec.calls(); !slices.Equal(got, []string{"198.51.100.7:" + port}) {
		t.Fatalf("dialled %v", got)
	}
}

// Port precedence as at the check: a (host, 0) pin covers any port; a
// (host, 443) pin does not cover port 80.
func TestPinnedDialPortPrecedence(t *testing.T) {
	d := targetTestDB(t)
	ic, res, rec := pgDialGate(t, d)
	srv, _, _ := pinnedServer(t, "any-port")
	rec.route("203.0.113.7:8443", srv.Listener.Addr().String())
	res.set("app.example.com", "203.0.113.7")
	res.set("web.example.com", "203.0.113.8")
	scope := taskScope(t, d, ic, time.Minute)
	ctx := WithTargetScope(t.Context(), scope)

	// A URL of a scheme without a default port declares no port: its pin is (host, 0).
	pinURL(t, d, ic, scope, "ssh://app.example.com/")
	if ps := pins(t, d, scope); len(ps) != 1 || ps[0].Port != 0 {
		t.Fatalf("pins = %+v, want one on (app.example.com, 0)", ps)
	}
	pinURL(t, d, ic, scope, "https://web.example.com/")

	conn, err := PinnedDialer("WebFetch", true)(ctx, "tcp", "app.example.com:8443")
	if err != nil {
		t.Fatalf("(host, 0) pin, port 8443: %v", err)
	}
	conn.Close()
	if _, err := PinnedDialer("WebFetch", true)(ctx, "tcp", "web.example.com:80"); err == nil || !strings.Contains(err.Error(), TargetApprovalPending) {
		t.Fatalf("(host, 443) pin, port 80: %v", err)
	}
	if got := rec.calls(); !slices.Equal(got, []string{"203.0.113.7:8443"}) {
		t.Fatalf("dialled %v", got)
	}
	if _, tgt := openTarget(t, d, scope); tgt.Host != "web.example.com" || tgt.Port != 80 || tgt.Reason != "no_pin" {
		t.Fatalf("request target %+v, want web.example.com:80", tgt)
	}
}

// D-5: a redirect hop is checked by the redirect policy and then dialled
// against the pin of the hop's (host, port), never the origin's.
func TestRedirectHopDialledAgainstHopPinNotOrigin(t *testing.T) {
	d := targetTestDB(t)
	final, finalHits, finalPort := pinnedServer(t, "hop-b")
	start, _, startPort := hopRedirect(t, "http://b.example:"+finalPort+"/final")
	aURL, bURL := "http://a.example:"+startPort+"/start", "http://b.example:"+finalPort+"/"
	setup := func(t *testing.T, pinB bool) (context.Context, TargetScope, *fakeResolver, *dialRecorder) {
		ic, res, rec := pgDialGate(t, d)
		rec.route("203.0.113.1:"+startPort, start.Listener.Addr().String())
		rec.route("203.0.113.2:"+finalPort, final.Listener.Addr().String())
		// Were the hop dialled at the origin's address, it would reach b as well.
		rec.route("203.0.113.1:"+finalPort, final.Listener.Addr().String())
		res.set("a.example", "203.0.113.1")
		res.set("b.example", "203.0.113.2")
		scope := taskScope(t, d, ic, time.Minute)
		pinURL(t, d, ic, scope, aURL)
		if pinB {
			pinURL(t, d, ic, scope, bURL)
		}
		return WithTargetScope(t.Context(), scope), scope, res, rec
	}

	t.Run("each hop at its own pin", func(t *testing.T) {
		ctx, _, _, rec := setup(t, true)
		before := finalHits.Load()
		if body, err := get(ctx, pinnedClient(true), aURL); err != nil || body != "hop-b" || finalHits.Load() != before+1 {
			t.Fatalf("redirect: %q, %v", body, err)
		}
		if got := rec.calls(); !slices.Equal(got, []string{"203.0.113.1:" + startPort, "203.0.113.2:" + finalPort}) {
			t.Fatalf("dialled %v", got)
		}
	})
	t.Run("hop resolving to the origin's pinned address", func(t *testing.T) {
		ctx, scope, res, rec := setup(t, true)
		// The cache still holds b's pinned answer: the redirect policy passes.
		res.set("b.example", "203.0.113.1")
		before := finalHits.Load()
		_, err := get(ctx, pinnedClient(true), aURL)
		if err == nil || !strings.Contains(err.Error(), "TARGET_APPROVAL_PENDING: the connection to b.example:"+finalPort+" was not opened") {
			t.Fatalf("hop: %v", err)
		}
		if got := rec.calls(); !slices.Equal(got, []string{"203.0.113.1:" + startPort}) || finalHits.Load() != before {
			t.Fatalf("dialled %v, b hits %d; want the origin only", got, finalHits.Load()-before)
		}
		if _, tgt := openTarget(t, d, scope); tgt.Host != "b.example" || tgt.Port != atoiPort(t, finalPort) || tgt.Reason != "new_ip" {
			t.Fatalf("request target %+v, want new_ip on b.example", tgt)
		}
	})
	t.Run("hop without a pin", func(t *testing.T) {
		ctx, scope, _, rec := setup(t, false)
		before := finalHits.Load()
		_, err := get(ctx, pinnedClient(true), aURL)
		if err == nil || !strings.Contains(err.Error(), "redirects to b.example:"+finalPort) || !strings.Contains(err.Error(), "not followed") {
			t.Fatalf("hop: %v", err)
		}
		if got := rec.calls(); !slices.Equal(got, []string{"203.0.113.1:" + startPort}) || finalHits.Load() != before {
			t.Fatalf("dialled %v; want the dialer never called for b", got)
		}
		if _, tgt := openTarget(t, d, scope); tgt.Host != "b.example" || tgt.Reason != "no_pin" {
			t.Fatalf("request target %+v", tgt)
		}
	})
}

// hopRedirect is a server that redirects every request to location.
func hopRedirect(t *testing.T, location string) (*httptest.Server, *atomic.Int64, string) {
	t.Helper()
	srv, hits, key := hopServer(t, location)
	_, port, _ := net.SplitHostPort(key)
	return srv, hits, port
}

// Two concurrent dials of one host whose address changed share one request:
// both fail at once, one approval extends the pin, both retries connect.
func TestDialMismatchOpensOneNewIPRequest(t *testing.T) {
	d := targetTestDB(t)
	ic, res, rec := pgDialGate(t, d)
	srv, _, port := pinnedServer(t, "shared")
	rec.route("203.0.113.9:"+port, srv.Listener.Addr().String())
	res.set("app.example.com", "203.0.113.7")
	scope := taskScope(t, d, ic, time.Minute)
	ctx := WithTargetScope(t.Context(), scope)
	u := "http://app.example.com:" + port + "/"
	pinURL(t, d, ic, scope, u)
	res.set("app.example.com", "203.0.113.9")

	fetchBoth := func() []error {
		var wg sync.WaitGroup
		errs := make([]error, 2)
		for n := range errs {
			wg.Go(func() { _, errs[n] = get(ctx, pinnedClient(true), u) })
		}
		wg.Wait()
		return errs
	}
	for n, err := range fetchBoth() {
		if err == nil || !strings.Contains(err.Error(), TargetApprovalPending) {
			t.Fatalf("dial %d: %v", n, err)
		}
	}
	if ids := openRows(t, d, scope); len(ids) != 1 || allRows(t, d, scope) != 2 {
		t.Fatalf("open %v, %d request rows; want the approved one and one new_ip", ids, allRows(t, d, scope))
	}
	if len(rec.calls()) != 0 {
		t.Fatalf("dialled %v", rec.calls())
	}
	approveAll(t, d, ic, scope)
	for n, err := range fetchBoth() {
		if err != nil {
			t.Fatalf("retry %d: %v", n, err)
		}
	}
	if got := rec.calls(); len(got) != 2 || got[0] != "203.0.113.9:"+port || got[1] != got[0] {
		t.Fatalf("dialled %v", got)
	}
}
