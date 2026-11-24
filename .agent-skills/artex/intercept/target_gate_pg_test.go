package intercept

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
)

// The tests below run the gate against PostgreSQL: the real store, the real
// request and decide path, and a fake resolver.

// pgGate returns an interceptor on d with a fake resolver.
func pgGate(t *testing.T, d *db.DB) (*Interceptor, *fakeResolver) {
	t.Helper()
	ic, res := New(d), newFakeResolver()
	ic.SetResolver(res)
	return ic, res
}

// storedExemptions sets the exemption list for one test and puts the previous
// one back afterwards. The list is global, so these tests do not run in parallel.
func storedExemptions(t *testing.T, d *db.DB, list ...db.TargetExemption) {
	t.Helper()
	previous, _, err := d.TargetExemptions()
	if err != nil {
		t.Fatal(err)
	}
	if err := d.ReplaceTargetExemptions(list, "test", "test"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.ReplaceTargetExemptions(previous, "test", "test") })
}

// decidedRows returns the rows of the gate that no human decided, oldest first.
func decidedRows(t *testing.T, d *db.DB, scope TargetScope) []*db.InterceptDetail {
	t.Helper()
	rows, err := d.Query(`SELECT id FROM intercept_pending
WHERE COALESCE(task_id,'')=$1 AND COALESCE(conversation_id,0)=$2 AND decision_source='target' AND decided_by='system' AND target_key IS NULL ORDER BY id`,
		scope.TaskID, scope.ConversationID)
	if err != nil {
		t.Fatal(err)
	}
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			t.Fatal(err)
		}
		ids = append(ids, id)
	}
	rows.Close()
	out := make([]*db.InterceptDetail, len(ids))
	for n, id := range ids {
		if out[n], err = d.GetInterceptDetail(id); err != nil || out[n] == nil || out[n].Audit == nil || len(out[n].Audit.Targets) == 0 {
			t.Fatalf("row %d: detail=%+v err=%v", id, out[n], err)
		}
	}
	return out
}

func fetchInput(url string) []byte { return []byte(`{"url":"` + url + `"}`) }

// approveAll approves every open request of scope.
func approveAll(t *testing.T, d *db.DB, ic *Interceptor, scope TargetScope) {
	t.Helper()
	ids := openRows(t, d, scope)
	if len(ids) == 0 {
		t.Fatal("no open request to approve")
	}
	for _, id := range ids {
		if err := ic.Decide(id, true, "ARTEX", "192.0.2.1"); err != nil {
			t.Fatal(err)
		}
	}
}

// pin opens the request for an unpinned WebFetch target and approves it.
func pinURL(t *testing.T, d *db.DB, ic *Interceptor, scope TargetScope, url string) {
	t.Helper()
	reqs, res := ic.CheckTargets(context.Background(), scope, "WebFetch", fetchInput(url))
	if res.Code != "" || len(reqs) != 1 {
		t.Fatalf("%s: requests=%+v result=%+v, want one request", url, reqs, res)
	}
	done := request(context.Background(), ic, scope, nil, reqs...)
	eventually(t, "the request row", func() bool { return len(openRows(t, d, scope)) == 1 })
	approveAll(t, d, ic, scope)
	if out := result(t, done); out.Code != "" {
		t.Fatalf("%s: approved request ended with %+v", url, out)
	}
}

func mustPass(t *testing.T, what string, ic *Interceptor, scope TargetScope, url string) {
	t.Helper()
	if reqs, res := ic.CheckTargets(context.Background(), scope, "WebFetch", fetchInput(url)); res.Code != "" || len(reqs) != 0 {
		t.Fatalf("%s: requests=%+v result=%+v, want the call to pass", what, reqs, res)
	}
}

func TestExemptionChangeIsLogged(t *testing.T) {
	d := targetTestDB(t)
	ic := New(d)
	original, _, err := ic.Exemptions()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.ReplaceTargetExemptions(original, "test", "test") })
	logged := func() []db.TargetExemptionChange {
		t.Helper()
		changes, err := d.ListTargetExemptionLog(100)
		if err != nil {
			t.Fatal(err)
		}
		return changes
	}
	before := logged()

	first := []db.TargetExemption{{Host: "PyPI.org.", Port: 443, Note: " index "}, {Host: "10.0.0.5", Port: 8080}, {Host: "pypi.org", Port: 443, Note: "duplicate"}}
	stored, digest, err := ic.SetExemptions(first, "alice")
	if err != nil {
		t.Fatal(err)
	}
	want := []db.TargetExemption{{Host: "pypi.org", Port: 443, Note: "index"}, {Host: "10.0.0.5", Port: 8080}}
	if !slices.Equal(stored, want) {
		t.Fatalf("stored = %+v, want %+v (normalised, without the duplicate)", stored, want)
	}
	if list, got, err := ic.Exemptions(); err != nil || !slices.Equal(list, want) || got != digest || digest == "" {
		t.Fatalf("read back: list=%+v digest=%q (want %q) err=%v", list, got, digest, err)
	}
	second, digest2, err := ic.SetExemptions(nil, "bob")
	if err != nil || len(second) != 0 || digest2 == digest {
		t.Fatalf("empty list: stored=%+v digest=%q err=%v", second, digest2, err)
	}

	// A refused list changes nothing and logs nothing.
	if _, _, err := ic.SetExemptions([]db.TargetExemption{{Host: "169.254.169.254", Port: 80}}, "mallory"); !errors.Is(err, ErrInvalidExemption) {
		t.Fatalf("metadata address: err=%v, want it refused", err)
	}
	if list, got, err := ic.Exemptions(); err != nil || len(list) != 0 || got != digest2 {
		t.Fatalf("after the refused change: list=%+v digest=%q err=%v", list, got, err)
	}

	changes := logged()
	if len(changes) != len(before)+2 {
		t.Fatalf("%d log rows added, want 2", len(changes)-len(before))
	}
	newest, older := changes[0], changes[1]
	var olderBefore, olderAfter, newestBefore, newestAfter []db.TargetExemption
	for raw, into := range map[*json.RawMessage]*[]db.TargetExemption{&older.Before: &olderBefore, &older.After: &olderAfter, &newest.Before: &newestBefore, &newest.After: &newestAfter} {
		if len(*raw) > 0 {
			if err := json.Unmarshal(*raw, into); err != nil {
				t.Fatal(err)
			}
		}
	}
	if older.ChangedBy != "alice" || older.Digest != digest || !slices.Equal(olderBefore, original) || !slices.Equal(olderAfter, want) || older.ChangedAt.IsZero() {
		t.Fatalf("first change = %+v", older)
	}
	if newest.ChangedBy != "bob" || newest.Digest != digest2 || !slices.Equal(newestBefore, want) || len(newestAfter) != 0 || string(newest.After) != "[]" {
		t.Fatalf("second change = %+v", newest)
	}
}

// The first call that passes through an exemption is logged once per scope,
// host, port and list digest, and per process.
func TestExemptionFirstUseLoggedOnce(t *testing.T) {
	d := targetTestDB(t)
	storedExemptions(t, d, db.TargetExemption{Host: "pypi.org", Port: 443})
	ic, res := pgGate(t, d)
	ic.SetDerivedExemptions(func() []string { return []string{"https://llm.example.net/v1"} })
	res.set("pypi.org", "151.101.0.223")
	scope := taskScope(t, d, ic, time.Minute)
	_, digest, err := ic.Exemptions()
	if err != nil {
		t.Fatal(err)
	}

	for n := 0; n < 3; n++ {
		mustPass(t, "stored exemption", ic, scope, "https://pypi.org/simple/")
		mustPass(t, "derived exemption", ic, scope, "https://llm.example.net/v1/models")
	}
	rows := decidedRows(t, d, scope)
	if len(rows) != 2 {
		t.Fatalf("%d first-use rows, want one per exemption", len(rows))
	}
	for n, host := range []string{"pypi.org", "llm.example.net"} {
		row := rows[n]
		target := row.Audit.Targets[0]
		if row.Status != "allowed" || row.DecidedBy != "system" || row.DecisionSource != "target" || row.ToolName != "WebFetch" ||
			target.Host != host || target.Port != 443 || target.Outcome != "exempt" || row.Audit.ConfigDigest != digest || row.DecidedAt == nil {
			t.Fatalf("first-use row %d = %+v audit=%+v", n, row.InterceptApprovalRow, row.Audit)
		}
	}
	if n := len(pins(t, d, scope)) + len(openRows(t, d, scope)); n != 0 {
		t.Fatalf("an exemption created %d pins or requests", n)
	}

	// Another scope logs its own first use.
	other := taskScope(t, d, ic, time.Minute)
	mustPass(t, "other task", ic, other, "https://pypi.org/simple/")
	if n := len(decidedRows(t, d, other)); n != 1 {
		t.Fatalf("other task: %d first-use rows, want 1", n)
	}
	// A changed list has another digest: the use is logged again.
	storedExemptions(t, d, db.TargetExemption{Host: "pypi.org", Port: 443}, db.TargetExemption{Host: "files.pythonhosted.org", Port: 443})
	mustPass(t, "changed list", ic, scope, "https://pypi.org/simple/")
	mustPass(t, "changed list, again", ic, scope, "https://pypi.org/simple/")
	if n := len(decidedRows(t, d, scope)); n != 3 {
		t.Fatalf("after the list change: %d rows, want 3", n)
	}
	// Another process (a second interceptor on the same database) logs again.
	second, res2 := pgGate(t, d)
	res2.set("pypi.org", "151.101.0.223")
	scope.Interceptor = second
	mustPass(t, "second process", second, scope, "https://pypi.org/simple/")
	if n := len(decidedRows(t, d, scope)); n != 4 {
		t.Fatalf("second process: %d rows, want 4", n)
	}
}

// The seeded package sources are stored entries like the ones an operator
// adds: the void rule applies to them.
func TestSeededExemptionIsVoidOnPrivateAddress(t *testing.T) {
	d := targetTestDB(t)
	stored, _, err := d.TargetExemptions()
	if err != nil {
		t.Fatal(err)
	}
	if !slices.ContainsFunc(stored, func(e db.TargetExemption) bool { return e.Host == "pypi.org" && e.Port == 443 }) {
		t.Skipf("the stored list no longer holds the seeded pypi.org:443 entry: %+v", stored)
	}
	ic, res := pgGate(t, d)
	scope := taskScope(t, d, ic, time.Minute)
	res.set("pypi.org", "151.101.0.223")
	mustPass(t, "seeded entry, public address", ic, scope, "https://pypi.org/simple/")

	second, res2 := pgGate(t, d)
	res2.set("pypi.org", "151.101.0.223", "10.0.0.5")
	reqs, out := second.CheckTargets(context.Background(), scope, "WebFetch", fetchInput("https://pypi.org/simple/"))
	if out.Code != "" || len(reqs) != 1 || !reqs[0].ExemptVoid {
		t.Fatalf("seeded entry, one private address: requests=%+v result=%+v, want a request with a void exemption", reqs, out)
	}
	// The request row records that the exemption was void.
	done := request(context.Background(), second, scope, nil, reqs...)
	id := oneOpenRow(t, d, scope)
	detail, err := d.GetInterceptDetail(id)
	if err != nil || detail == nil || !detail.Audit.Targets[0].ExemptVoid {
		t.Fatalf("request row audit = %+v err=%v, want exempt_void", detail, err)
	}
	if err := second.Decide(id, false, "ARTEX", "192.0.2.1"); err != nil {
		t.Fatal(err)
	}
	if out := result(t, done); out.Code != TargetDenied {
		t.Fatalf("denied request ended with %+v", out)
	}
}

// Task allow rules play no role in the gate: they neither satisfy it nor
// restrict it. Block rules, global and of the task, always win.
func TestAllowRuleDoesNotSatisfyGate(t *testing.T) {
	d := targetTestDB(t)
	ic, res := pgGate(t, d)
	scope := taskScope(t, d, ic, time.Minute)
	ref := scope.dbRef(t)
	res.set("app.example.com", "203.0.113.7")
	res.set("other.example.com", "203.0.113.9")
	rule := func(action, kind, pattern string) {
		t.Helper()
		if _, err := d.Assets().CreateTaskInterceptRule(ref.TaskID, action, kind, pattern, "target gate test", true); err != nil {
			t.Fatal(err)
		}
	}

	// An allow rule on the host does not replace the approval.
	rule("allow", "exact_domain", "app.example.com")
	reqs, out := ic.CheckTargets(context.Background(), scope, "WebFetch", fetchInput("https://app.example.com/"))
	if out.Code != "" || len(reqs) != 1 || reqs[0].Reason != "no_pin" {
		t.Fatalf("allow rule on the host: requests=%+v result=%+v, want a request", reqs, out)
	}
	// A pinned host outside the allow list still passes: the whitelist is not
	// applied at dispatch.
	pinURL(t, d, ic, scope, "https://other.example.com/")
	mustPass(t, "pinned host outside the allow list", ic, scope, "https://other.example.com/")

	// A block rule of the task beats the pin.
	rule("block", "exact_ip", "203.0.113.9")
	if reqs, out := ic.CheckTargets(context.Background(), scope, "WebFetch", fetchInput("https://other.example.com/")); out.Code != TargetRuleBlocked || len(reqs) != 0 {
		t.Fatalf("task block rule: requests=%+v result=%+v", reqs, out)
	}
	// It is the task's rule: another task is not blocked by it.
	other := taskScope(t, d, ic, time.Minute)
	if reqs, out := ic.CheckTargets(context.Background(), other, "WebFetch", fetchInput("https://other.example.com/")); out.Code != "" || len(reqs) != 1 {
		t.Fatalf("other task: requests=%+v result=%+v, want a request", reqs, out)
	}
	// A global block rule applies to every scope.
	global, err := d.CreateAssetInterceptRule("exact_domain", "app.example.com", "target gate test", true)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.DeleteAssetInterceptRule(global.ID) })
	for name, s := range map[string]TargetScope{"task": scope, "other task": other} {
		if reqs, out := ic.CheckTargets(context.Background(), s, "WebFetch", fetchInput("https://app.example.com/")); out.Code != TargetRuleBlocked || len(reqs) != 0 {
			t.Fatalf("global block rule, %s: requests=%+v result=%+v", name, reqs, out)
		}
	}
	// Each block is a decided row; none opened a request.
	rows := decidedRows(t, d, scope)
	blocks := 0
	for _, row := range rows {
		if row.Audit.Targets[0].Outcome == "rule_blocked" {
			blocks++
			if row.Status != "denied" || !strings.HasPrefix(row.Reason, TargetRuleBlocked+": ") || row.Audit.ExecutionStatus != "not_executed" {
				t.Fatalf("block row = %+v audit=%+v", row.InterceptApprovalRow, row.Audit)
			}
		}
	}
	if blocks != 2 || len(openRows(t, d, scope)) != 0 {
		t.Fatalf("%d block rows and %d open requests, want 2 and 0", blocks, len(openRows(t, d, scope)))
	}
}

// The proxy can be turned on between the approval and a later call. The pin
// row then still says name_only_effective = false, and the gate treats it as
// name-only at call time: a changed address neither blocks nor asks.
func TestProxyTurnedOnAfterApprovalMakesPinNameOnly(t *testing.T) {
	d := targetTestDB(t)
	ic, res := pgGate(t, d)
	proxied := false
	ic.SetUpstreamProxyCheck(func() bool { return proxied })
	scope := taskScope(t, d, ic, time.Minute)
	res.set("app.example.com", "203.0.113.7")
	pinURL(t, d, ic, scope, "https://app.example.com/")
	approved := pins(t, d, scope)
	if len(approved) != 1 || approved[0].NameOnlyEffective || !slices.Equal(approved[0].PinnedIPs, []string{"203.0.113.7"}) {
		t.Fatalf("pins = %+v, want one pin that is not name-only", approved)
	}
	requestRows := allRows(t, d, scope)

	// global_proxy is set, and the name answers another address. A new
	// interceptor stands for a later call that has nothing cached.
	proxied = true
	res.set("app.example.com", "198.51.100.99")
	ic.SetResolver(res)
	mustPass(t, "changed address behind the proxy", ic, scope, "https://app.example.com/")

	if n := len(openRows(t, d, scope)); n != 0 {
		t.Fatalf("%d open requests, want none", n)
	}
	if n := allRows(t, d, scope); n != requestRows {
		t.Fatalf("%d request rows, want %d: the call opened a request", n, requestRows)
	}
	after := pins(t, d, scope)
	if len(after) != 1 || after[0].ID != approved[0].ID || after[0].NameOnlyEffective || after[0].Status != db.TargetPinActive ||
		!slices.Equal(after[0].PinnedIPs, []string{"203.0.113.7"}) {
		t.Fatalf("pins after the call = %+v, want the same row, unchanged", after)
	}
	// The use of the pin is on record, with the address the platform saw.
	rows := decidedRows(t, d, scope)
	last := rows[len(rows)-1]
	if target := last.Audit.Targets[0]; last.Status != "allowed" || target.Outcome != "pin_match" || target.PinID != approved[0].ID ||
		!slices.Equal(target.ResolvedIPs, []string{"198.51.100.99"}) {
		t.Fatalf("last row = %+v audit=%+v", last.InterceptApprovalRow, last.Audit)
	}

	// Control: with the proxy off the same call asks.
	proxied = false
	if reqs, out := ic.CheckTargets(context.Background(), scope, "WebFetch", fetchInput("https://app.example.com/")); out.Code != "" || len(reqs) != 1 || reqs[0].Reason != "new_ip" {
		t.Fatalf("proxy off: requests=%+v result=%+v, want a new_ip request", reqs, out)
	}
}

// An approval never pins zero addresses: not on a first approval, and not when
// the key already has a pin with addresses.
func TestApprovalNeverPinsEmptyAddressList(t *testing.T) {
	d := targetTestDB(t)
	ic, res := pgGate(t, d)
	scope := taskScope(t, d, ic, time.Minute)
	ref := scope.dbRef(t)

	// RequestTargets refuses to open such a request.
	for _, ips := range [][]string{nil, {}} {
		out := ic.RequestTargets(context.Background(), scope, "WebFetch", webFetchInput,
			[]TargetRequest{{Host: "app.example.com", Port: 443, Kind: TargetDomain, ResolvedIPs: ips, Reason: "no_pin"}}, nil)
		if out.Code != TargetResolveFailed || out.PendingID != 0 {
			t.Fatalf("request with %v: %+v, want %s", ips, out, TargetResolveFailed)
		}
	}
	// One empty target refuses the whole call, before any row is written.
	out := ic.RequestTargets(context.Background(), scope, "Bash", []byte(`{"command":"x"}`),
		[]TargetRequest{target("a.example.com", 443, "203.0.113.7"), target("b.example.com", 443)}, nil)
	if out.Code != TargetResolveFailed || out.Host != "b.example.com" || allRows(t, d, scope) != 0 {
		t.Fatalf("mixed call: %+v with %d rows, want %s and no row", out, allRows(t, d, scope), TargetResolveFailed)
	}

	// A row that reached the table without an address cannot be approved.
	open := func(host string, ips []string) int64 {
		t.Helper()
		id, created, err := d.FindOrCreateTargetRequest(db.TargetRequest{Scope: ref, Host: host, Port: 443, ToolName: "WebFetch", Reason: "test",
			Audit: &db.InterceptAudit{Targets: []db.InterceptTarget{{Host: host, Port: 443, ResolvedIPs: ips, Outcome: "requested"}}}})
		if err != nil || !created {
			t.Fatalf("open request: id=%d created=%v err=%v", id, created, err)
		}
		return id
	}
	for _, ips := range [][]string{nil, {}, {""}} {
		id := open("empty.example.com", ips)
		if err := ic.Decide(id, true, "ARTEX", "192.0.2.1"); !errors.Is(err, db.ErrTargetPinEmpty) {
			t.Fatalf("approve %v: err=%v, want ErrTargetPinEmpty", ips, err)
		}
		if row, err := d.GetInterceptPending(id); err != nil || row == nil || row.Status != "pending" {
			t.Fatalf("refused approval: row=%+v err=%v, want it still pending", row, err)
		}
		if n := len(pins(t, d, scope)); n != 0 {
			t.Fatalf("%d pins after a refused approval, want none", n)
		}
		// The request can still be denied.
		if err := ic.Decide(id, false, "ARTEX", "192.0.2.1"); err != nil {
			t.Fatal(err)
		}
	}

	// With a pin on the key: the approval is refused all the same, and the
	// pin is neither superseded nor re-issued with its old addresses.
	res.set("app.example.com", "203.0.113.7")
	pinURL(t, d, ic, scope, "https://app.example.com/")
	id := open("app.example.com", nil)
	if err := ic.Decide(id, true, "ARTEX", "192.0.2.1"); !errors.Is(err, db.ErrTargetPinEmpty) {
		t.Fatalf("approve an empty new_ip request: err=%v, want ErrTargetPinEmpty", err)
	}
	if after := pins(t, d, scope); len(after) != 1 || after[0].Version != 1 || after[0].Status != db.TargetPinActive || !slices.Equal(after[0].PinnedIPs, []string{"203.0.113.7"}) {
		t.Fatalf("pins = %+v, want version 1 untouched", after)
	}

	// A name that stops resolving opens no request, so there is nothing to approve.
	res.errs["app.example.com"] = errors.New("no such host")
	ic.SetResolver(res)
	if reqs, out := ic.CheckTargets(context.Background(), scope, "WebFetch", fetchInput("https://app.example.com:8443/")); out.Code != TargetResolveFailed || len(reqs) != 0 {
		t.Fatalf("unresolvable name: requests=%+v result=%+v", reqs, out)
	}
}

// A block is logged for a conversation as it is for a task, on the
// conversation's own rows.
func TestTargetBlockIsLoggedForConversation(t *testing.T) {
	d := targetTestDB(t)
	ic, res := pgGate(t, d)
	conv, err := d.CreateConversation("auto", "target gate block", nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = d.DeleteConversation(conv.ID)
		_, _ = d.Exec(`DELETE FROM target_pins WHERE conversation_id=$1`, conv.ID)
	})
	scope := TargetScope{ConversationID: conv.ID, Enabled: func() bool { return true }, WaitBound: time.Minute, Interceptor: ic}
	res.errs["app.example.com"] = errors.New("no such host")
	ctx := WithCall(WithConvID(context.Background(), conv.ID), "WebFetch", fetchInput("https://app.example.com/"))
	if reqs, out := ic.CheckTargets(ctx, scope, "WebFetch", fetchInput("https://app.example.com/")); out.Code != TargetResolveFailed || len(reqs) != 0 {
		t.Fatalf("requests=%+v result=%+v", reqs, out)
	}
	rows := decidedRows(t, d, scope)
	if len(rows) != 1 {
		t.Fatalf("%d rows, want 1", len(rows))
	}
	row := rows[0]
	if row.Status != "denied" || row.ConversationID == nil || *row.ConversationID != conv.ID || row.TaskID != nil ||
		row.Audit.Targets[0].Outcome != "resolve_failed" || row.Audit.InputDigest == "" {
		t.Fatalf("row = %+v audit=%+v", row.InterceptApprovalRow, row.Audit)
	}
}
