package intercept

import (
	"strconv"
	"strings"
	"testing"
	"time"
)

// Step 1.9 against PostgreSQL: a hop no pin covers opens the durable request
// and fails the call at once; an approval lets the same call follow.

// A hop to an unpinned target is not followed: the redirect target receives
// nothing, exactly one request row is opened for it, and the call fails with
// TARGET_APPROVAL_PENDING without waiting, although the scope would wait five
// minutes at the hook. The same call again attaches to that row. After the
// approval it follows.
func TestRedirectToUnpinnedHostNotFollowed(t *testing.T) {
	d := targetTestDB(t)
	ic, res := pgGate(t, d)
	scope := taskScope(t, d, ic, 5*time.Minute)
	ctx := WithTargetScope(t.Context(), scope)
	final, finalHits, finalKey := hopServer(t, "")
	start, startHits, startKey := hopServer(t, final.URL+"/final")

	began := time.Now()
	_, err := gatedFetch(ctx, start.URL+"/start")
	if err == nil || !strings.Contains(err.Error(), TargetApprovalPending) ||
		!strings.Contains(err.Error(), start.URL+"/start redirects to "+finalKey) || !strings.Contains(err.Error(), "not followed") {
		t.Fatalf("unpinned hop: %v", err)
	}
	if elapsed := time.Since(began); elapsed > 10*time.Second {
		t.Fatalf("the hop waited %v", elapsed)
	}
	if startHits.Load() != 1 || finalHits.Load() != 0 {
		t.Fatalf("hits start=%d final=%d, want the redirect target untouched", startHits.Load(), finalHits.Load())
	}
	ids := openRows(t, d, scope)
	if len(ids) != 1 || allRows(t, d, scope) != 1 {
		t.Fatalf("open requests = %v (%d rows), want one", ids, allRows(t, d, scope))
	}
	detail, err := d.GetInterceptDetail(ids[0])
	if err != nil || detail == nil || detail.Audit == nil || len(detail.Audit.Targets) != 1 {
		t.Fatalf("request detail = %+v, %v", detail, err)
	}
	if tgt := detail.Audit.Targets[0]; tgt.Host+":"+strconv.Itoa(tgt.Port) != finalKey || tgt.RedirectFrom != startKey || tgt.Outcome != "requested" {
		t.Fatalf("requested target = %+v, want %s from %s", tgt, finalKey, startKey)
	}
	if !strings.Contains(detail.Reason, "A redirect from "+startKey) || !strings.Contains(string(detail.ToolInput), start.URL+"/start") {
		t.Fatalf("request reason %q / input %s, want the origin of the redirect", detail.Reason, detail.ToolInput)
	}

	// The retried call stops at the same hop and attaches to the same row.
	if _, err := gatedFetch(ctx, start.URL+"/start"); err == nil || !strings.Contains(err.Error(), TargetApprovalPending) || finalHits.Load() != 0 {
		t.Fatalf("retry before the approval: %v, final hits %d", err, finalHits.Load())
	}
	if again := openRows(t, d, scope); len(again) != 1 || again[0] != ids[0] || allRows(t, d, scope) != 1 {
		t.Fatalf("after the retry: open %v, %d rows; want the same single request", again, allRows(t, d, scope))
	}

	approveAll(t, d, ic, scope)
	if resp, err := gatedFetch(ctx, start.URL+"/start"); err != nil || resp.StatusCode != 200 || finalHits.Load() != 1 {
		t.Fatalf("after the approval: %v, final hits %d", err, finalHits.Load())
	}
	if res.total() != 0 {
		t.Fatalf("%d lookups for IP literals", res.total())
	}
}

// http -> https on the same host is another key (port 443, not 80): a pin on
// (host, 80) does not cover it, and the hop asks again.
func TestRedirectHTTPToHTTPSAsksAgain(t *testing.T) {
	d := targetTestDB(t)
	ic, res := pgGate(t, d)
	res.set("app.example.com", "203.0.113.7")
	scope := taskScope(t, d, ic, time.Minute)
	pinURL(t, d, ic, scope, "http://app.example.com/")
	ctx := WithTargetScope(t.Context(), scope)

	if err := hop(ctx, "http://app.example.com/next", "http://app.example.com/"); err != nil {
		t.Fatalf("hop on the pinned key: %v", err)
	}
	err := hop(ctx, "https://app.example.com/", "http://app.example.com/")
	if err == nil || !strings.Contains(err.Error(), TargetApprovalPending) || !strings.Contains(err.Error(), "redirects to app.example.com:443") {
		t.Fatalf("http -> https: %v", err)
	}
	ids := openRows(t, d, scope)
	if len(ids) != 1 {
		t.Fatalf("open requests = %v, want the one for port 443", ids)
	}
	detail, err := d.GetInterceptDetail(ids[0])
	if err != nil || detail == nil || detail.Audit == nil || detail.Audit.Targets[0].Port != 443 || detail.Audit.Targets[0].RedirectFrom != "app.example.com:80" {
		t.Fatalf("request = %+v, %v", detail, err)
	}
}
