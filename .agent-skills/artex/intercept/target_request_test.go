package intercept

import (
	"context"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
)

func TestPendingWakesAllWaiters(t *testing.T) {
	p := newPendingManager()
	a, b, gone := p.add(1), p.add(1), p.add(1)
	other := p.add(2)
	p.remove(1, gone)
	p.resolve(1, true)
	for name, ch := range map[string]chan bool{"first": a, "second": b} {
		select {
		case allowed := <-ch:
			if !allowed {
				t.Fatalf("%s waiter got a denial", name)
			}
		default:
			t.Fatalf("%s waiter of the request was not woken", name)
		}
	}
	select {
	case <-gone:
		t.Fatal("a removed waiter was woken")
	case <-other:
		t.Fatal("a waiter of another request was woken")
	default:
	}
	if len(p.ch) != 1 || len(p.ch[2]) != 1 {
		t.Fatalf("waiters left = %v, want only the one of request 2", p.ch)
	}
	// Resolving a request nobody waits on, twice, blocks nobody.
	p.resolve(1, true)
	p.resolve(2, false)
	if allowed := <-other; allowed {
		t.Fatal("the waiter of request 2 got an approval")
	}
	p.remove(2, other)
	if len(p.ch) != 0 {
		t.Fatalf("waiters left = %v, want none", p.ch)
	}
}

func targetTestDB(t *testing.T) *db.DB {
	t.Helper()
	dsn, _, err := db.DSN()
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	d, err := db.Open(dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	return d
}

// taskScope creates a task and returns its target scope on ic, with the gate
// on and the given wait bound.
func taskScope(t *testing.T, d *db.DB, ic *Interceptor, wait time.Duration) TargetScope {
	t.Helper()
	task, err := d.CreateTaskWithOptions("target requests", "request, wait, decide", db.TaskCreateOptions{})
	if err != nil {
		t.Fatal(err)
	}
	id := strconv.FormatInt(task.ID, 10)
	t.Cleanup(func() {
		_ = d.DeleteTask(task.ID)
		_, _ = d.Exec(`DELETE FROM target_pins WHERE task_id=$1`, task.ID)
		_, _ = d.Exec(`DELETE FROM intercept_pending WHERE task_id=$1`, id)
	})
	return TargetScope{TaskID: id, Enabled: func() bool { return true }, WaitBound: wait, Interceptor: ic}
}

func (s TargetScope) dbRef(t *testing.T) db.TargetScopeRef {
	t.Helper()
	ref, err := s.ref()
	if err != nil {
		t.Fatal(err)
	}
	return ref
}

func target(host string, port int, ips ...string) TargetRequest {
	return TargetRequest{Host: host, Port: port, Kind: "domain", ResolvedIPs: ips, Resolver: "system", ResolvedAt: time.Now().UTC(), Reason: "no_pin"}
}

var webFetchInput = []byte(`{"url":"https://app.example.com/"}`)

// request runs RequestTargets in the background and returns the channel its
// result arrives on.
func request(ctx context.Context, ic *Interceptor, scope TargetScope, ask *Decision, targets ...TargetRequest) <-chan TargetResult {
	out := make(chan TargetResult, 1)
	go func() { out <- ic.RequestTargets(ctx, scope, "WebFetch", webFetchInput, targets, ask) }()
	return out
}

func result(t *testing.T, ch <-chan TargetResult) TargetResult {
	t.Helper()
	select {
	case res := <-ch:
		return res
	case <-time.After(20 * time.Second):
		t.Fatal("the call is still waiting")
		return TargetResult{}
	}
}

func stillWaiting(t *testing.T, ch <-chan TargetResult) {
	t.Helper()
	select {
	case res := <-ch:
		t.Fatalf("the call returned %+v, want it still waiting", res)
	case <-time.After(4 * targetPollInterval):
	}
}

func eventually(t *testing.T, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(20 * time.Second)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %s", what)
		}
		time.Sleep(5 * time.Millisecond)
	}
}

// openRows returns the ids of the open target requests of scope, oldest first.
func openRows(t *testing.T, d *db.DB, scope TargetScope) []int64 {
	t.Helper()
	rows, err := d.Query(`SELECT id FROM intercept_pending
WHERE COALESCE(task_id,'')=$1 AND COALESCE(conversation_id,0)=$2 AND status='pending' AND target_key IS NOT NULL ORDER BY id`,
		scope.TaskID, scope.ConversationID)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			t.Fatal(err)
		}
		ids = append(ids, id)
	}
	return ids
}

func allRows(t *testing.T, d *db.DB, scope TargetScope) int {
	t.Helper()
	var n int
	if err := d.QueryRow(`SELECT count(*) FROM intercept_pending
WHERE COALESCE(task_id,'')=$1 AND COALESCE(conversation_id,0)=$2 AND target_key IS NOT NULL`, scope.TaskID, scope.ConversationID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

// waiters is how many calls wait on request id through ic.
func waiters(ic *Interceptor, id int64) int {
	ic.pending.mu.Lock()
	defer ic.pending.mu.Unlock()
	return len(ic.pending.ch[id])
}

// oneOpenRow waits for the scope's single open request and returns its id.
func oneOpenRow(t *testing.T, d *db.DB, scope TargetScope) int64 {
	t.Helper()
	var ids []int64
	eventually(t, "one open target request", func() bool {
		ids = openRows(t, d, scope)
		return len(ids) == 1
	})
	return ids[0]
}

func pins(t *testing.T, d *db.DB, scope TargetScope) []*db.TargetPin {
	t.Helper()
	out, err := d.ListTargetPins(scope.dbRef(t))
	if err != nil {
		t.Fatal(err)
	}
	return out
}

// Calls for one host share one request, in one process and across two
// instances on one database: one row, one card, one decision wakes them all,
// one pin.
func TestConcurrentCallsSameHostShareOneRequest(t *testing.T) {
	d := targetTestDB(t)
	first, second := New(d), New(targetTestDB(t))
	scope := taskScope(t, d, first, time.Minute)
	var cards atomic.Int32
	ctx := WithTaskContext(context.Background(), scope.TaskID, "work#1", func(a db.Activity) {
		if a.Kind == "intercept_request" {
			cards.Add(1)
		}
	})
	tgt := target("app.example.com", 443, "203.0.113.7")
	a := request(ctx, first, scope, nil, tgt)
	id := oneOpenRow(t, d, scope)
	b := request(ctx, first, scope, nil, tgt)
	c := request(ctx, second, scope, nil, tgt)
	eventually(t, "every call to wait on the request", func() bool { return waiters(first, id) == 2 && waiters(second, id) == 1 })
	if ids := openRows(t, d, scope); len(ids) != 1 || allRows(t, d, scope) != 1 {
		t.Fatalf("open requests = %v, want the one row %d", ids, id)
	}
	if n := cards.Load(); n != 1 {
		t.Fatalf("%d approval cards emitted, want 1", n)
	}
	stillWaiting(t, a)

	// Decided on the second instance: its own waiter is woken by the channel,
	// the waiters of the first instance by their poll.
	if err := second.Decide(id, true, "ARTEX", "198.51.100.9"); err != nil {
		t.Fatal(err)
	}
	for name, ch := range map[string]<-chan TargetResult{"creator": a, "attached": b, "other instance": c} {
		if res := result(t, ch); res.Code != "" {
			t.Fatalf("%s call: %+v, want approved", name, res)
		}
	}
	got := pins(t, d, scope)
	if len(got) != 1 || got[0].Status != db.TargetPinActive || got[0].Host != "app.example.com" || got[0].Port != 443 ||
		!slices.Equal(got[0].PinnedIPs, []string{"203.0.113.7"}) {
		t.Fatalf("pins = %+v, want one active pin", got)
	}
	if allRows(t, d, scope) != 1 || cards.Load() != 1 {
		t.Fatalf("rows=%d cards=%d after the decision, want 1 and 1", allRows(t, d, scope), cards.Load())
	}
	if err := first.Decide(id, false, "ARTEX", ""); err != ErrAlreadyDecided {
		t.Fatalf("second decision: %v, want ErrAlreadyDecided", err)
	}
}

// A call that stops waiting leaves the request alone: it stays open, the next
// call attaches to it, and a later approval still pins.
func TestWaiterLeavingKeepsRequestOpen(t *testing.T) {
	d := targetTestDB(t)
	ic := New(d)
	scope := taskScope(t, d, ic, time.Minute)
	tgt := target("app.example.com", 443, "203.0.113.7")
	ctx, cancel := context.WithCancel(context.Background())
	call := request(ctx, ic, scope, nil, tgt)
	id := oneOpenRow(t, d, scope)
	eventually(t, "the call to wait", func() bool { return waiters(ic, id) == 1 })
	cancel()
	res := result(t, call)
	if res.Code != TargetApprovalPending || res.PendingID != id || res.Host != "app.example.com" || res.Port != 443 {
		t.Fatalf("cancelled call: %+v, want %s on request %d", res, TargetApprovalPending, id)
	}
	row, err := d.GetInterceptPending(id)
	if err != nil || row == nil || row.Status != "pending" || row.DecidedBy != "" {
		t.Fatalf("request after its waiter left = %+v, %v; want untouched", row, err)
	}
	if waiters(ic, id) != 0 {
		t.Fatal("the waiter that left is still registered")
	}

	again := request(context.Background(), ic, scope, nil, tgt)
	eventually(t, "the next call to attach", func() bool { return waiters(ic, id) == 1 })
	if ids := openRows(t, d, scope); !slices.Equal(ids, []int64{id}) {
		t.Fatalf("open requests = %v, want the same row %d", ids, id)
	}
	if err := ic.Decide(id, true, "ARTEX", ""); err != nil {
		t.Fatal(err)
	}
	if res := result(t, again); res.Code != "" {
		t.Fatalf("attached call: %+v, want approved", res)
	}
	if got := pins(t, d, scope); len(got) != 1 {
		t.Fatalf("pins = %+v, want the late approval to pin", got)
	}
}

func TestWaitBoundReturnsPendingCode(t *testing.T) {
	d := targetTestDB(t)
	ic := New(d)
	scope := taskScope(t, d, ic, 150*time.Millisecond)
	tgt := target("app.example.com", 443, "203.0.113.7")
	start := time.Now()
	res := result(t, request(context.Background(), ic, scope, nil, tgt))
	if res.Code != TargetApprovalPending || res.PendingID == 0 {
		t.Fatalf("bounded call: %+v, want %s", res, TargetApprovalPending)
	}
	if waited := time.Since(start); waited < 150*time.Millisecond {
		t.Fatalf("the call returned after %v, before its wait bound", waited)
	}
	if ids := openRows(t, d, scope); !slices.Equal(ids, []int64{res.PendingID}) {
		t.Fatalf("open requests = %v, want the request %d left open", ids, res.PendingID)
	}

	// Bound 0 (the final settlement round): never wait, but still ask.
	never := scope
	never.WaitBound = 0
	other := target("other.example.com", 443, "203.0.113.8")
	res = result(t, request(context.Background(), ic, never, nil, other))
	if res.Code != TargetApprovalPending || res.Host != "other.example.com" || res.PendingID == 0 {
		t.Fatalf("zero-bound call: %+v, want an immediate %s", res, TargetApprovalPending)
	}
	if len(openRows(t, d, scope)) != 2 {
		t.Fatalf("open requests = %v, want the zero-bound call to have created its request", openRows(t, d, scope))
	}
	// An ask is never merged into a row the call does not wait on.
	asked := ic.RequestTargets(context.Background(), never, "WebFetch", webFetchInput,
		[]TargetRequest{target("third.example.com", 443, "203.0.113.9")}, &Decision{Action: "ask", Message: "rule asks"})
	if asked.Code != TargetApprovalPending || asked.AskMerged {
		t.Fatalf("zero-bound call with an ask: %+v, want a plain open request", asked)
	}
	if row, err := d.GetInterceptPending(asked.PendingID); err != nil || row == nil || row.Status != "pending" {
		t.Fatalf("request of the zero-bound call = %+v, %v; want left open", row, err)
	}
}

func askRule(t *testing.T, d *db.DB, timeoutEnabled bool, seconds int, action string) Decision {
	t.Helper()
	rule, err := d.CreateInterceptRule(fmt.Sprintf("target merge %d", time.Now().UnixNano()), "tool_name", "string",
		"NoSuchToolForTargetMerge", "ask", "", 0, false, timeoutEnabled, seconds, action)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.DeleteInterceptRule(rule.ID) })
	return Decision{Action: "ask", Message: "rule requires approval", RuleID: rule.ID, RuleName: rule.Name,
		TimeoutEnabled: timeoutEnabled, TimeoutSeconds: seconds, TimeoutAction: action}
}

// A merged row is bound to the call that created it: when that call leaves, the
// system closes the row, and nothing is pinned.
func TestMergedRequestSettledWhenCreatorLeaves(t *testing.T) {
	d := targetTestDB(t)
	ic := New(d)
	scope := taskScope(t, d, ic, time.Minute)
	ask := askRule(t, d, false, 0, "deny")
	ctx, cancel := context.WithCancel(context.Background())
	call := request(ctx, ic, scope, &ask, target("app.example.com", 443, "203.0.113.7"))
	id := oneOpenRow(t, d, scope)
	detail, err := d.GetInterceptDetail(id)
	if err != nil || detail == nil || detail.RuleID == nil || *detail.RuleID != ask.RuleID || detail.DecisionSource != "target" ||
		detail.Audit == nil || !detail.Audit.MergedAsk || detail.Audit.RuleName != ask.RuleName || len(detail.Audit.Targets) != 1 {
		t.Fatalf("merged row = %+v, %v; want the rule and the target on one row", detail, err)
	}
	if !strings.Contains(detail.Reason, "rule requires approval") || !strings.Contains(detail.Reason, "app.example.com:443") ||
		!strings.Contains(detail.Reason, "203.0.113.7") || !strings.Contains(detail.Reason, "Approving pins these addresses for task "+scope.TaskID+" until revoked.") {
		t.Fatalf("merged reason does not name both the ask and the target: %q", detail.Reason)
	}
	eventually(t, "the creating call to wait", func() bool { return waiters(ic, id) == 1 })
	cancel()
	res := result(t, call)
	if res.Code != TargetDenied || !res.AskMerged || res.PendingID != id {
		t.Fatalf("creating call after cancel: %+v, want %s with the ask merged", res, TargetDenied)
	}
	row, err := d.GetInterceptDetail(id)
	if err != nil || row == nil || row.Status != "denied" || row.DecidedBy != "system" || row.Audit.EffectiveAction != "deny" ||
		row.Audit.DecisionReason != "work cancelled" {
		t.Fatalf("merged row after its creator left = %+v, %v; want denied by the system", row, err)
	}
	if got := pins(t, d, scope); len(got) != 0 {
		t.Fatalf("a row closed by the system pinned: %+v", got)
	}
}

// A timeout never pins, whatever the rule says: timeout_action = allow is
// overridden on a merged row and the override is recorded.
func TestTimeoutNeverPins(t *testing.T) {
	d := targetTestDB(t)
	ic := New(d)
	scope := taskScope(t, d, ic, time.Minute)
	ask := askRule(t, d, true, 1, "allow")
	res := result(t, request(context.Background(), ic, scope, &ask, target("app.example.com", 443, "203.0.113.7")))
	if res.Code != TargetDenied || !res.AskMerged {
		t.Fatalf("call after the rule timeout: %+v, want %s", res, TargetDenied)
	}
	row, err := d.GetInterceptDetail(res.PendingID)
	if err != nil || row == nil || row.Status != "timeout" || row.DecidedBy != "system" || row.Audit.EffectiveAction != "deny" ||
		row.Audit.ExecutionStatus != "not_executed" || !strings.Contains(row.Audit.DecisionReason, `timeout action "allow" was overridden`) {
		t.Fatalf("timed-out merged row = %+v, %v; want a timeout that denies and records the override", row, err)
	}
	if got := pins(t, d, scope); len(got) != 0 {
		t.Fatalf("a timeout pinned: %+v", got)
	}
	if len(openRows(t, d, scope)) != 0 {
		t.Fatal("the merged row is still open after its creator left")
	}
}

// What is displayed is what is pinned: the addresses stored when the row was
// created. A call that attaches with other addresses never rewrites them.
func TestDecidePinsDisplayedIPs(t *testing.T) {
	d := targetTestDB(t)
	ic := New(d)
	scope := taskScope(t, d, ic, time.Minute)
	creator := request(context.Background(), ic, scope, nil, target("app.example.com", 443, "203.0.113.8", "203.0.113.7"))
	id := oneOpenRow(t, d, scope)
	attached := request(context.Background(), ic, scope, nil, target("app.example.com", 443, "198.51.100.66"))
	eventually(t, "both calls to wait", func() bool { return waiters(ic, id) == 2 })
	shown, err := d.GetInterceptDetail(id)
	if err != nil || shown == nil || len(shown.Audit.Targets) != 1 ||
		!slices.Equal(shown.Audit.Targets[0].ResolvedIPs, []string{"203.0.113.8", "203.0.113.7"}) || strings.Contains(shown.Reason, "198.51.100.66") {
		t.Fatalf("displayed request = %+v, %v; want the creator's addresses only", shown, err)
	}
	if err := ic.Decide(id, true, "ARTEX", "198.51.100.9"); err != nil {
		t.Fatal(err)
	}
	if res := result(t, creator); res.Code != "" {
		t.Fatalf("creator: %+v", res)
	}
	if res := result(t, attached); res.Code != "" {
		t.Fatalf("attached: %+v", res)
	}
	got := pins(t, d, scope)
	if len(got) != 1 || !slices.Equal(got[0].PinnedIPs, []string{"203.0.113.7", "203.0.113.8"}) || got[0].InterceptID == nil || *got[0].InterceptID != id {
		t.Fatalf("pins = %+v, want exactly the displayed addresses", got)
	}
}

func TestDeniedRequestPinsNothing(t *testing.T) {
	d := targetTestDB(t)
	ic := New(d)
	scope := taskScope(t, d, ic, time.Minute)
	tgt := target("app.example.com", 443, "203.0.113.7")
	call := request(context.Background(), ic, scope, nil, tgt)
	id := oneOpenRow(t, d, scope)
	if err := ic.Decide(id, false, "ARTEX", "198.51.100.9"); err != nil {
		t.Fatal(err)
	}
	if res := result(t, call); res.Code != TargetDenied || res.PendingID != id {
		t.Fatalf("denied call: %+v, want %s", res, TargetDenied)
	}
	if got := pins(t, d, scope); len(got) != 0 {
		t.Fatalf("a denial pinned: %+v", got)
	}
	row, err := d.GetInterceptDetail(id)
	if err != nil || row == nil || row.Status != "denied" || row.DecidedBy != "human" || row.Audit.Targets[0].Outcome != "denied" ||
		row.Audit.Approver != "ARTEX" || row.Audit.ApproverAddr != "198.51.100.9" {
		t.Fatalf("denied row = %+v, %v", row, err)
	}
	// No sticky denial: the next call asks again, on a new row.
	next := request(context.Background(), ic, scope, nil, tgt)
	if fresh := oneOpenRow(t, d, scope); fresh == id {
		t.Fatal("the next call reused the denied row")
	} else if err := ic.Decide(fresh, true, "ARTEX", ""); err != nil {
		t.Fatal(err)
	}
	if res := result(t, next); res.Code != "" {
		t.Fatalf("call after the denial: %+v, want approved", res)
	}
}

// A call attached to a merged row that closes without an approval is not
// blocked for the host: the row was about another call. It asks once more with
// a plain request, then blocks.
func TestAttachedWaiterRequeuesAfterMergedDenial(t *testing.T) {
	d := targetTestDB(t)
	for _, approveRetry := range []bool{true, false} {
		t.Run(fmt.Sprintf("retry approved=%v", approveRetry), func(t *testing.T) {
			ic := New(d)
			scope := taskScope(t, d, ic, time.Minute)
			ask := askRule(t, d, false, 0, "deny")
			tgt := target("app.example.com", 443, "203.0.113.7")
			creator := request(context.Background(), ic, scope, &ask, tgt)
			merged := oneOpenRow(t, d, scope)
			attached := request(context.Background(), ic, scope, nil, tgt)
			eventually(t, "both calls to wait", func() bool { return waiters(ic, merged) == 2 })
			if err := ic.Decide(merged, false, "ARTEX", ""); err != nil {
				t.Fatal(err)
			}
			if res := result(t, creator); res.Code != TargetDenied || !res.AskMerged {
				t.Fatalf("creator of the merged row: %+v, want %s", res, TargetDenied)
			}
			var retry int64
			eventually(t, "the attached call to ask again", func() bool {
				ids := openRows(t, d, scope)
				if len(ids) == 1 && ids[0] != merged {
					retry = ids[0]
				}
				return retry != 0
			})
			plain, err := d.GetInterceptDetail(retry)
			if err != nil || plain == nil || plain.RuleID != nil || plain.Audit.MergedAsk {
				t.Fatalf("retry row = %+v, %v; want a plain target request", plain, err)
			}
			stillWaiting(t, attached)
			if err := ic.Decide(retry, approveRetry, "ARTEX", ""); err != nil {
				t.Fatal(err)
			}
			res := result(t, attached)
			if approveRetry && (res.Code != "" || len(pins(t, d, scope)) != 1) {
				t.Fatalf("attached call after its retry was approved: %+v pins=%+v", res, pins(t, d, scope))
			}
			if !approveRetry && (res.Code != TargetDenied || res.PendingID != retry || len(pins(t, d, scope)) != 0) {
				t.Fatalf("attached call after its retry was denied: %+v, want %s", res, TargetDenied)
			}
			// One retry, then block: never a third request.
			if n := allRows(t, d, scope); n != 2 {
				t.Fatalf("%d request rows, want the merged one and one retry", n)
			}
		})
	}
}

// The request rows of a conversation go with it (cascade). A waiter that finds
// its row gone stops with a block.
func TestWaiterStopsWhenRowDeleted(t *testing.T) {
	d := targetTestDB(t)
	ic := New(d)
	conv, err := d.CreateConversation("assistant", fmt.Sprintf("target wait %d", time.Now().UnixNano()), nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = d.DeleteConversation(conv.ID)
		_, _ = d.Exec(`DELETE FROM target_pins WHERE conversation_id=$1`, conv.ID)
	})
	scope := TargetScope{ConversationID: conv.ID, Enabled: func() bool { return true }, WaitBound: time.Minute, Interceptor: ic}
	call := request(WithConvID(context.Background(), conv.ID), ic, scope, nil, target("app.example.com", 443, "203.0.113.7"))
	id := oneOpenRow(t, d, scope)
	eventually(t, "the call to wait", func() bool { return waiters(ic, id) == 1 })
	// The card went to the conversation stream.
	var cards int
	if err := d.QueryRow(`SELECT count(*) FROM conversation_activities WHERE conversation_id=$1 AND kind='intercept_request'`, conv.ID).Scan(&cards); err != nil || cards != 1 {
		t.Fatalf("%d approval cards in the conversation (%v), want 1", cards, err)
	}
	if err := d.DeleteConversation(conv.ID); err != nil {
		t.Fatal(err)
	}
	if res := result(t, call); res.Code != TargetGateUnavailable || res.PendingID != id {
		t.Fatalf("call whose request was deleted: %+v, want %s", res, TargetGateUnavailable)
	}
}

// Every human decision records who took it and from where: on the pin and in
// the audit of a target row, in the audit of a classic ask. decided_by on the
// row stays the actor class.
func TestDecideRecordsApproverAndAddress(t *testing.T) {
	d := targetTestDB(t)
	ic := New(d)
	scope := taskScope(t, d, ic, time.Minute)
	call := request(context.Background(), ic, scope, nil, target("app.example.com", 443, "203.0.113.7"))
	id := oneOpenRow(t, d, scope)
	if err := ic.Decide(id, true, "ARTEX", "198.51.100.9"); err != nil {
		t.Fatal(err)
	}
	if res := result(t, call); res.Code != "" {
		t.Fatalf("approved call: %+v", res)
	}
	got := pins(t, d, scope)
	if len(got) != 1 || got[0].DecidedBy != "ARTEX" || got[0].DecidedFrom != "198.51.100.9" {
		t.Fatalf("pin = %+v, want the approver and the address", got)
	}
	row, err := d.GetInterceptDetail(id)
	if err != nil || row == nil || row.DecidedBy != "human" || row.Audit.Approver != "ARTEX" || row.Audit.ApproverAddr != "198.51.100.9" {
		t.Fatalf("target row = %+v, %v", row, err)
	}

	// A classic ask goes through the same Decide and records the same.
	ctx := WithTaskContext(context.Background(), scope.TaskID, "work#1", nil)
	allowed := make(chan bool, 1)
	go func() {
		allowed <- ic.HandleAsk(ctx, 0, Decision{Action: "ask", Message: "classic ask"}, "Bash", []byte(`{"command":"id"}`))
	}()
	var classic int64
	eventually(t, "the classic ask", func() bool {
		return d.QueryRow(`SELECT id FROM intercept_pending WHERE task_id=$1 AND status='pending' AND target_key IS NULL`, scope.TaskID).Scan(&classic) == nil
	})
	eventually(t, "the classic ask to wait", func() bool { return waiters(ic, classic) == 1 })
	if err := ic.Decide(classic, true, "ARTEX", "198.51.100.10"); err != nil {
		t.Fatal(err)
	}
	select {
	case ok := <-allowed:
		if !ok {
			t.Fatal("the approved classic ask was refused")
		}
	case <-time.After(20 * time.Second):
		t.Fatal("the classic ask is still waiting")
	}
	row, err = d.GetInterceptDetail(classic)
	if err != nil || row == nil || row.Status != "allowed" || row.DecidedBy != "human" || row.Audit == nil ||
		row.Audit.Approver != "ARTEX" || row.Audit.ApproverAddr != "198.51.100.10" || len(row.Audit.Targets) != 0 {
		t.Fatalf("classic row = %+v, %v; want the approver and the address in its audit", row, err)
	}
	if len(pins(t, d, scope)) != 1 {
		t.Fatal("approving a classic ask pinned something")
	}
}

// Behind the upstream proxy the proxy chooses the address: the request says the
// approval is name-only and the pin carries the mark. The mark stays when the
// proxy is removed; addresses are enforced again only after a new approval.
func TestPinUnderGlobalProxyIsNameOnly(t *testing.T) {
	d := targetTestDB(t)
	ic := New(d)
	var proxied atomic.Bool
	ic.SetUpstreamProxyCheck(proxied.Load)
	scope := taskScope(t, d, ic, time.Minute)
	const sentence = "This approval is name-only."
	approve := func(host string) (*db.TargetPin, string) {
		t.Helper()
		call := request(context.Background(), ic, scope, nil, target(host, 443, "203.0.113.7"))
		id := oneOpenRow(t, d, scope)
		row, err := d.GetInterceptDetail(id)
		if err != nil || row == nil {
			t.Fatalf("request row: %+v, %v", row, err)
		}
		if err := ic.Decide(id, true, "ARTEX", ""); err != nil {
			t.Fatal(err)
		}
		if res := result(t, call); res.Code != "" {
			t.Fatalf("approved call: %+v", res)
		}
		active, err := d.ActiveTargetPins(scope.dbRef(t), host, 443)
		if err != nil || len(active) != 1 {
			t.Fatalf("active pins of %s = %+v, %v", host, active, err)
		}
		return active[0], row.Reason
	}

	direct, reason := approve("direct.example.com")
	if direct.NameOnlyEffective || strings.Contains(reason, sentence) {
		t.Fatalf("without a proxy: pin=%+v reason=%q, want an address pin", direct, reason)
	}

	proxied.Store(true)
	named, reason := approve("proxied.example.com")
	if !named.NameOnlyEffective || !strings.Contains(reason, sentence) || !strings.Contains(reason, "upstream proxy") {
		t.Fatalf("behind the proxy: pin=%+v reason=%q, want a name-only pin and a request that says so", named, reason)
	}
	if !slices.Equal(named.PinnedIPs, []string{"203.0.113.7"}) {
		t.Fatalf("name-only pin addresses = %v, want what the platform resolved", named.PinnedIPs)
	}

	// The proxy is removed: the pin stays name-only, the address pin stays one.
	proxied.Store(false)
	ref := scope.dbRef(t)
	if still, err := d.ActiveTargetPins(ref, "proxied.example.com", 443); err != nil || len(still) != 1 || !still[0].NameOnlyEffective {
		t.Fatalf("name-only pin after the proxy was removed = %+v, %v; want still name-only", still, err)
	}
	if still, err := d.ActiveTargetPins(ref, "direct.example.com", 443); err != nil || len(still) != 1 || still[0].NameOnlyEffective {
		t.Fatalf("address pin = %+v, %v", still, err)
	}
	// Enforcing addresses again takes a revocation and a new approval.
	if _, err := d.RevokeTargetPin(ref, named.ID); err != nil {
		t.Fatal(err)
	}
	if again, _ := approve("proxied.example.com"); again.NameOnlyEffective || again.Version != 2 {
		t.Fatalf("pin approved after the proxy was removed = %+v, want an address pin, version 2", again)
	}
}

// A new_ip request shows the old version, the pinned addresses and the new
// ones, and its approval extends the pin.
func TestNewIPRequestShowsOldAndNewAddresses(t *testing.T) {
	d := targetTestDB(t)
	ic := New(d)
	scope := taskScope(t, d, ic, time.Minute)
	first := request(context.Background(), ic, scope, nil, target("app.example.com", 0, "203.0.113.7"))
	id := oneOpenRow(t, d, scope)
	if row, err := d.GetInterceptDetail(id); err != nil || row == nil || !strings.Contains(row.Reason, "app.example.com (port not declared: every port)") {
		t.Fatalf("port-0 request = %+v, %v; want the reason to say the port is not declared", row, err)
	}
	if err := ic.Decide(id, true, "ARTEX", ""); err != nil {
		t.Fatal(err)
	}
	if res := result(t, first); res.Code != "" {
		t.Fatalf("first call: %+v", res)
	}
	v1 := pins(t, d, scope)[0]

	moved := target("app.example.com", 0, "203.0.113.99")
	moved.Reason, moved.Pin = "new_ip", v1
	second := request(context.Background(), ic, scope, nil, moved)
	id = oneOpenRow(t, d, scope)
	row, err := d.GetInterceptDetail(id)
	if err != nil || row == nil || !strings.Contains(row.Reason, "pin v1: 203.0.113.7") || !strings.Contains(row.Reason, "now resolves to 203.0.113.99") {
		t.Fatalf("new_ip request = %+v, %v; want the old version, the pinned and the new addresses", row, err)
	}
	if got := row.Audit.Targets[0]; got.Reason != "new_ip" || got.PinID != v1.ID || got.PinVersion != 1 || !slices.Equal(got.PinnedIPs, []string{"203.0.113.7"}) {
		t.Fatalf("recorded target = %+v", got)
	}
	if err := ic.Decide(id, true, "ARTEX", ""); err != nil {
		t.Fatal(err)
	}
	if res := result(t, second); res.Code != "" {
		t.Fatalf("second call: %+v", res)
	}
	active, err := d.ActiveTargetPins(scope.dbRef(t), "app.example.com", 0)
	if err != nil || len(active) != 1 || active[0].Version != 2 || !slices.Equal(active[0].PinnedIPs, []string{"203.0.113.7", "203.0.113.99"}) {
		t.Fatalf("pin after the new_ip approval = %+v, %v; want v2 with both addresses", active, err)
	}
}

// One call, several targets: one request per host and port, and the call
// passes only when all of them are approved.
func TestSeveralTargetsNeedEveryApproval(t *testing.T) {
	d := targetTestDB(t)
	ic := New(d)
	scope := taskScope(t, d, ic, time.Minute)
	ask := askRule(t, d, false, 0, "deny")
	call := request(context.Background(), ic, scope, &ask,
		target("a.example.com", 443, "203.0.113.1"), target("b.example.com", 443, "203.0.113.2"))
	var ids []int64
	eventually(t, "two open requests", func() bool {
		ids = openRows(t, d, scope)
		return len(ids) == 2
	})
	// The ask is merged into the first row the call created; the other is plain.
	for n, id := range ids {
		row, err := d.GetInterceptDetail(id)
		if err != nil || row == nil || row.Audit.MergedAsk != (n == 0) || (row.RuleID != nil) != (n == 0) {
			t.Fatalf("row %d = %+v, %v; want the ask merged into the first row only", n, row, err)
		}
	}
	if err := ic.Decide(ids[0], true, "ARTEX", ""); err != nil {
		t.Fatal(err)
	}
	stillWaiting(t, call)
	if err := ic.Decide(ids[1], false, "ARTEX", ""); err != nil {
		t.Fatal(err)
	}
	res := result(t, call)
	if res.Code != TargetDenied || res.Host != "b.example.com" || !res.AskMerged {
		t.Fatalf("call with one target denied: %+v, want %s on b.example.com", res, TargetDenied)
	}
	if got := pins(t, d, scope); len(got) != 1 || got[0].Host != "a.example.com" {
		t.Fatalf("pins = %+v, want only the approved host", got)
	}
}

// A scope that names no task and no conversation, or a task id that is not a
// number, never reaches the store.
func TestRequestTargetsRejectsBadScope(t *testing.T) {
	ic := New(nil)
	for name, scope := range map[string]TargetScope{
		"empty":        {WaitBound: time.Minute},
		"both":         {TaskID: "7", ConversationID: 9, WaitBound: time.Minute},
		"task not int": {TaskID: "seven", WaitBound: time.Minute},
	} {
		res := ic.RequestTargets(context.Background(), scope, "WebFetch", webFetchInput, []TargetRequest{target("app.example.com", 443, "203.0.113.7")}, nil)
		if res.Code != TargetGateUnavailable {
			t.Errorf("%s scope: %+v, want %s", name, res, TargetGateUnavailable)
		}
	}
}
