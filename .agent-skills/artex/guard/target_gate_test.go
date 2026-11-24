package guard

import (
	"context"
	"fmt"
	"net/netip"
	"slices"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/intercept"
)

// fakeGate scripts the target gate. check and request receive the number of
// the call (from 1) and decide what the gate answers.
type fakeGate struct {
	t       *testing.T
	mu      sync.Mutex
	check   func(n int) ([]intercept.TargetRequest, intercept.TargetResult)
	request func(n int, targets []intercept.TargetRequest, ask *intercept.Decision) intercept.TargetResult
	checks  int
	asked   [][]intercept.TargetRequest // targets of each RequestTargets call
	asks    []*intercept.Decision       // ask of each RequestTargets call
}

func (f *fakeGate) CheckTargets(_ context.Context, scope intercept.TargetScope, _ string, _ []byte) ([]intercept.TargetRequest, intercept.TargetResult) {
	f.mu.Lock()
	f.checks++
	n := f.checks
	f.mu.Unlock()
	if scope.Enabled == nil || !scope.Enabled() {
		f.t.Errorf("the gate was reached with the gate off")
	}
	if f.check == nil {
		return nil, intercept.TargetResult{}
	}
	return f.check(n)
}

func (f *fakeGate) RequestTargets(_ context.Context, _ intercept.TargetScope, _ string, _ []byte, targets []intercept.TargetRequest, ask *intercept.Decision) intercept.TargetResult {
	f.mu.Lock()
	f.asked = append(f.asked, targets)
	f.asks = append(f.asks, ask)
	n := len(f.asked)
	f.mu.Unlock()
	if f.request == nil {
		return intercept.TargetResult{}
	}
	return f.request(n, targets, ask)
}

// unpinnedOnce answers the first check with one unpinned target and every
// later check with none: the target was approved in between.
func unpinnedOnce(n int) ([]intercept.TargetRequest, intercept.TargetResult) {
	if n == 1 {
		return []intercept.TargetRequest{appTarget}, intercept.TargetResult{}
	}
	return nil, intercept.TargetResult{}
}

var appTarget = intercept.TargetRequest{Host: "app.example.com", Port: 443, Kind: intercept.TargetDomain,
	ResolvedIPs: []string{"203.0.113.7"}, Resolver: "fake", ResolvedAt: time.Now().UTC(), Reason: "no_pin"}

const fetchApp = `{"url":"https://app.example.com/login"}`

func gateOn(ctx context.Context, taskID string, wait time.Duration) context.Context {
	return intercept.WithTargetScope(intercept.WithTaskContext(ctx, taskID, "worker", nil),
		intercept.TargetScope{TaskID: taskID, Enabled: func() bool { return true }, WaitBound: wait})
}

func pre(g *Guard, ctx context.Context, tool, input string) (bool, string) {
	block, msg, _ := g.Hooks().PreToolUse(ctx, tool, []byte(input))
	return block, msg
}

// The target gate applies to every tool of a gated session, not only to the
// tools that enter the rule system.
func TestTargetGateRunsOutsideEnabledToolSet(t *testing.T) {
	calls := []struct{ tool, input string }{
		{"Monitor", `{"command":"tail -f /dev/null | nc 203.0.113.7 4444"}`},
		{"mcp__scan__run", `{"target":"203.0.113.7"}`},
		{"ExecuteExtraTool", `{"tool_name":"mcp__scan__run","params":{"target":"203.0.113.7"}}`},
		{"my_custom_tool", `{"url":"https://app.example.com/"}`},
		{"WebFetch", fetchApp},
	}
	ctx := gateOn(context.Background(), "7", time.Minute)
	for name, g := range map[string]*Guard{"guard without rules": New(), "target-only guard": NewTargetOnly(nil)} {
		gate := &fakeGate{t: t}
		g.gate = gate
		for _, c := range calls {
			if block, msg := pre(g, ctx, c.tool, c.input); block {
				t.Errorf("%s: %s blocked (%s), want it passed by the gate", name, c.tool, msg)
			}
		}
		if gate.checks != len(calls) || len(gate.asked) != 0 {
			t.Errorf("%s: %d checks and %d requests for %d calls", name, gate.checks, len(gate.asked), len(calls))
		}

		// A block of the gate blocks the call, with the gate's own text.
		gate.check = func(int) ([]intercept.TargetRequest, intercept.TargetResult) {
			return nil, intercept.TargetResult{Code: intercept.TargetRuleBlocked, Host: "203.0.113.7", Reason: "203.0.113.7 is blocked by an asset rule. Matched asset interception rule [CIDR range: 203.0.113.0/24]"}
		}
		for _, c := range calls {
			block, msg := pre(g, ctx, c.tool, c.input)
			if !block || !strings.HasPrefix(msg, "[ARTEX platform control, not target defense] TARGET_RULE_BLOCKED: 203.0.113.7 is blocked by an asset rule.") {
				t.Errorf("%s: %s block=%v msg=%q", name, c.tool, block, msg)
			}
		}
		if len(gate.asked) != 0 {
			t.Errorf("%s: a blocked call requested an approval", name)
		}

		// An unpinned target is requested, and the call runs once it is approved.
		gate.checks, gate.check = 0, unpinnedOnce
		if block, msg := pre(g, ctx, "Monitor", calls[0].input); block {
			t.Errorf("%s: approved target still blocked: %s", name, msg)
		}
		if len(gate.asked) != 1 || len(gate.asked[0]) != 1 || gate.asked[0][0].Host != "app.example.com" || gate.asks[0] != nil || gate.checks != 2 {
			t.Errorf("%s: requests=%+v asks=%v checks=%d, want one request without an ask and a second check", name, gate.asked, gate.asks, gate.checks)
		}
	}
}

// The target-only guard (planner, main agent) never records a call that
// passes. It records a block, through block(), in its own ring.
func TestTargetOnlyGuardRecordsBlocksOnly(t *testing.T) {
	task := New() // the task's main guard, with its own ring
	pre(task, context.Background(), "Bash", `{"command":"id"}`)
	before := task.Audit()

	g := NewTargetOnly(nil)
	gate := &fakeGate{t: t}
	g.gate = gate
	ctx := gateOn(context.Background(), "7", time.Minute)
	calls := []struct{ tool, input string }{
		{"Bash", `{"command":"curl https://app.example.com/"}`}, {"WebFetch", fetchApp}, {"TodoWrite", `{"todos":[]}`},
		{"add_intent", `{"summary":"probe https://app.example.com/"}`}, {"shell_send", `{"text":"nc 203.0.113.7 22\n"}`},
		{"ExecuteExtraTool", `{"tool_name":"mcp__scan__run","params":{"target":"203.0.113.7"}}`},
	}
	for round := 0; round < 50; round++ {
		for _, c := range calls {
			if block, msg := pre(g, ctx, c.tool, c.input); block {
				t.Fatalf("%s blocked: %s", c.tool, msg)
			}
		}
	}
	// A call that waited for an approval and then ran is a passing call too.
	gate.checks, gate.check = 0, unpinnedOnce
	if block, msg := pre(g, ctx, "WebFetch", fetchApp); block || len(gate.asked) != 1 {
		t.Fatalf("approved call: block=%v msg=%q requests=%d", block, msg, len(gate.asked))
	}
	// Gate off: nothing is recorded either.
	if block, _ := pre(g, context.Background(), "WebFetch", fetchApp); block {
		t.Fatal("gate off: blocked")
	}
	if n := len(g.Audit()); n != 0 {
		t.Fatalf("%d audit entries after passing calls, want none", n)
	}

	// One block: one entry, written by block().
	gate.check = func(int) ([]intercept.TargetRequest, intercept.TargetResult) {
		return nil, intercept.TargetResult{Code: intercept.TargetResolveFailed, Host: "app.example.com", Port: 443, Reason: "the platform could not resolve app.example.com (no such host)"}
	}
	block, msg := pre(g, ctx, "WebFetch", fetchApp)
	if !block {
		t.Fatal("the gate's block did not block the call")
	}
	audit := g.Audit()
	if len(audit) != 1 || audit[0].Tool != "WebFetch" || audit[0].Action != "block" || audit[0].Reason != msg || !strings.Contains(msg, intercept.TargetResolveFailed) {
		t.Fatalf("audit = %+v, want one block entry carrying the model-facing text", audit)
	}
	// A block after a request is one entry as well.
	gate.checks, gate.check = 0, unpinnedOnce
	gate.request = func(int, []intercept.TargetRequest, *intercept.Decision) intercept.TargetResult {
		return intercept.TargetResult{Code: intercept.TargetDenied, Host: "app.example.com", Port: 443, PendingID: 41, Reason: "the request was denied"}
	}
	if block, _ := pre(g, ctx, "WebFetch", fetchApp); !block || len(g.Audit()) != 2 || g.Audit()[1].Action != "block" {
		t.Fatalf("denied request: block=%v audit=%+v", block, g.Audit())
	}
	// It never counts attributions, and the ring of the task's guard is untouched.
	g.Hooks().PostToolUse(ctx, "Bash", []byte(`{}`), []byte(`"403 forbidden"`), true)
	if a := g.Attributions(); len(a) != 0 {
		t.Fatalf("attributions = %v, want none", a)
	}
	if after := task.Audit(); !slices.Equal(after, before) {
		t.Fatalf("the task guard's ring changed: %+v, was %+v", after, before)
	}
}

// One call goes back to the pin lookup at most three times.
func TestTargetRequestLoopIsBoundedToThreePasses(t *testing.T) {
	g := NewTargetOnly(nil)
	// Every approval is followed by a check that finds the target uncovered
	// again (its addresses keep changing).
	gate := &fakeGate{t: t, check: func(int) ([]intercept.TargetRequest, intercept.TargetResult) {
		return []intercept.TargetRequest{appTarget}, intercept.TargetResult{}
	}}
	g.gate = gate
	done := make(chan string, 1)
	go func() {
		_, msg := pre(g, gateOn(context.Background(), "7", time.Minute), "WebFetch", fetchApp)
		done <- msg
	}()
	var msg string
	select {
	case msg = <-done:
	case <-time.After(10 * time.Second):
		t.Fatal("the request loop did not end")
	}
	if len(gate.asked) != 3 || gate.checks != 4 {
		t.Fatalf("%d requests and %d checks, want 3 and 4", len(gate.asked), gate.checks)
	}
	if !strings.Contains(msg, "TARGET_APPROVAL_PENDING: target app.example.com:443: the target is still not covered by a pin after 3 approval rounds") {
		t.Fatalf("message = %q", msg)
	}

	// A block found by a recheck ends the loop at once.
	gate = &fakeGate{t: t, check: func(n int) ([]intercept.TargetRequest, intercept.TargetResult) {
		if n == 1 {
			return []intercept.TargetRequest{appTarget}, intercept.TargetResult{}
		}
		return nil, intercept.TargetResult{Code: intercept.TargetResolveFailed, Host: "app.example.com", Port: 443, Reason: "the platform could not resolve app.example.com (no such host)"}
	}}
	g.gate = gate
	if block, msg := pre(g, gateOn(context.Background(), "7", time.Minute), "WebFetch", fetchApp); !block || !strings.Contains(msg, intercept.TargetResolveFailed) || len(gate.asked) != 1 {
		t.Fatalf("block=%v msg=%q requests=%d", block, msg, len(gate.asked))
	}
}

// The model-facing text of a target block is built from the code and the
// reason of the result. It says the block is the platform's, and it does not
// call a transient block forbidden.
func TestTargetBlockMessage(t *testing.T) {
	cases := []struct {
		res  intercept.TargetResult
		want []string
	}{
		{intercept.TargetResult{Code: intercept.TargetResolveFailed, Host: "app.example.com", Port: 443,
			Reason: "the platform could not resolve app.example.com (lookup timed out after 3s), so it cannot compare the address with the approved pin (v2: 203.0.113.7)"},
			[]string{"TARGET_RESOLVE_FAILED: the platform could not resolve app.example.com (lookup timed out after 3s), so it cannot compare the address with the approved pin (v2: 203.0.113.7). The call was not executed and no approval was requested.",
				"resolver failure on the platform side, not a block by the target", "Do not rewrite the command, switch tools or substitute an IP address", "Retry the same call later, or report the failure."}},
		{intercept.TargetResult{Code: intercept.TargetApprovalPending, Host: "app.example.com", Port: 443, PendingID: 9, Reason: "no approval within the wait bound; the request stays open"},
			[]string{"TARGET_APPROVAL_PENDING: target app.example.com:443: no approval within the wait bound; the request stays open. The call was not executed.", "retry the same call later"}},
		{intercept.TargetResult{Code: intercept.TargetDenied, Host: "2001:db8::1", Port: 8443, Reason: "the request was denied"},
			[]string{"TARGET_DENIED: target [2001:db8::1]:8443: the request was denied. The call was not executed.", "do not retry it"}},
		{intercept.TargetResult{Code: intercept.TargetDenied, Host: "203.0.113.0/24", Reason: "the request was denied"},
			[]string{"TARGET_DENIED: target 203.0.113.0/24: the request was denied."}},
		{intercept.TargetResult{Code: intercept.TargetRuleBlocked, Host: "app.example.gov", Port: 443, Reason: "app.example.gov:443 is blocked by an asset rule. Matched asset interception rule [Domain (fuzzy): .gov]"},
			[]string{"TARGET_RULE_BLOCKED: app.example.gov:443 is blocked by an asset rule.", "no approval was requested", "do not reach it another way"}},
		{intercept.TargetResult{Code: intercept.TargetTooMany, Host: "198.51.100.1", Reason: "this call names 6 targets that are not approved (198.51.100.1, ...); at most 5 are requested per call"},
			[]string{"TARGET_TOO_MANY: this call names 6 targets", "Name fewer new targets per call."}},
		{intercept.TargetResult{Code: intercept.TargetGateUnavailable, Host: "app.example.com", Port: 443, Reason: "the pins could not be read: connection refused"},
			[]string{"TARGET_GATE_UNAVAILABLE: target app.example.com:443: the pins could not be read: connection refused.", "failure on the platform side"}},
	}
	for _, c := range cases {
		msg := TargetBlockMessage(c.res)
		if !strings.HasPrefix(msg, "[ARTEX platform control, not target defense] "+c.res.Code+": ") {
			t.Errorf("%s: message = %q", c.res.Code, msg)
		}
		for _, want := range c.want {
			if !strings.Contains(msg, want) {
				t.Errorf("%s: message %q does not contain %q", c.res.Code, msg, want)
			}
		}
		if strings.Contains(msg, "This operation is forbidden") || strings.HasSuffix(msg, " ") {
			t.Errorf("%s: message = %q", c.res.Code, msg)
		}
	}
}

// ---- With PostgreSQL: a real interceptor, for the rules and the judge ----

type gateDB struct {
	t    *testing.T
	d    *db.DB
	ic   *intercept.Interceptor
	res  *stubResolver
	task string // task id
}

// stubResolver answers every name with the addresses it holds, and counts the
// lookups.
type stubResolver struct {
	mu  sync.Mutex
	ips []string
	err error
	n   int
}

func (r *stubResolver) Name() string { return "stub" }

func (r *stubResolver) lookups() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.n
}

func (r *stubResolver) LookupIPs(context.Context, string) ([]netip.Addr, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.n++
	if r.err != nil {
		return nil, r.err
	}
	out := make([]netip.Addr, len(r.ips))
	for n, ip := range r.ips {
		out[n] = netip.MustParseAddr(ip)
	}
	return out, nil
}

// answer changes what every name resolves to; the gate's cache is dropped.
func (g *gateDB) answer(err error, ips ...string) {
	g.res.mu.Lock()
	g.res.ips, g.res.err = ips, err
	g.res.mu.Unlock()
	g.ic.SetResolver(g.res)
}

func newGateDB(t *testing.T) *gateDB {
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
	task, err := d.CreateTaskWithOptions("guard target gate", "the gate in the hook", db.TaskCreateOptions{})
	if err != nil {
		t.Fatal(err)
	}
	id := strconv.FormatInt(task.ID, 10)
	t.Cleanup(func() {
		_ = d.DeleteTask(task.ID)
		_, _ = d.Exec(`DELETE FROM target_pins WHERE task_id=$1`, task.ID)
		_, _ = d.Exec(`DELETE FROM intercept_pending WHERE task_id=$1`, id)
	})
	g := &gateDB{t: t, d: d, ic: intercept.New(d), res: &stubResolver{ips: []string{"203.0.113.7"}}, task: id}
	g.ic.SetResolver(g.res)
	return g
}

// rule adds an intercept rule that matches marker in the tool input.
func (g *gateDB) rule(action, marker string) db.InterceptRule {
	g.t.Helper()
	r, err := g.d.CreateInterceptRule("guard test "+marker, "tool_input", "string", marker, action, action+" by the guard test", 100000, true, false, 0, "deny")
	if err != nil {
		g.t.Fatal(err)
	}
	g.t.Cleanup(func() { _ = g.d.DeleteInterceptRule(r.ID) })
	g.ic.Invalidate()
	return r
}

// judge turns the fallback judge on with a fixed verdict.
func (g *gateDB) judge(action string) {
	g.t.Helper()
	cfg := g.ic.GetJudgeConfig()
	on := cfg
	on.Enabled, on.Mode = true, intercept.JudgeModeFreeform
	if err := g.ic.SetJudgeConfig(on); err != nil {
		g.t.Fatal(err)
	}
	g.t.Cleanup(func() { _ = g.ic.SetJudgeConfig(cfg) })
	g.ic.SetReviewer(func(context.Context, int64, string, intercept.ReviewInput) (intercept.Decision, error) {
		return intercept.Decision{Action: action, Message: "judge says " + action}, nil
	})
}

// ctx is the context of a worker call of the task, gate on or off.
func (g *gateDB) ctx(gate bool, wait time.Duration) context.Context {
	ctx := intercept.WithTaskContext(context.Background(), g.task, "worker", nil)
	if !gate {
		return ctx
	}
	return intercept.WithTargetScope(ctx, intercept.TargetScope{TaskID: g.task, Enabled: func() bool { return true }, WaitBound: wait, Interceptor: g.ic})
}

type approvalRow struct {
	id        int64
	status    string
	source    string
	decidedBy string
	ruleID    int64
	targetKey string
}

// rows returns the approval rows of the task, oldest first.
func (g *gateDB) rows() []approvalRow {
	g.t.Helper()
	rows, err := g.d.Query(`SELECT id, status, decision_source, COALESCE(decided_by,''), COALESCE(rule_id,0), COALESCE(target_key,'')
FROM intercept_pending WHERE task_id=$1 ORDER BY id`, g.task)
	if err != nil {
		g.t.Fatal(err)
	}
	defer rows.Close()
	var out []approvalRow
	for rows.Next() {
		var r approvalRow
		if err := rows.Scan(&r.id, &r.status, &r.source, &r.decidedBy, &r.ruleID, &r.targetKey); err != nil {
			g.t.Fatal(err)
		}
		out = append(out, r)
	}
	return out
}

func (g *gateDB) pending() []approvalRow {
	var out []approvalRow
	for _, r := range g.rows() {
		if r.status == "pending" {
			out = append(out, r)
		}
	}
	return out
}

func (g *gateDB) pins() []*db.TargetPin {
	g.t.Helper()
	id, _ := strconv.ParseInt(g.task, 10, 64)
	pins, err := g.d.ListTargetPins(db.TargetScopeRef{TaskID: id})
	if err != nil {
		g.t.Fatal(err)
	}
	return pins
}

type hookResult struct {
	block bool
	msg   string
}

// call runs the hook in the background: it may wait for a human.
func call(g *Guard, ctx context.Context, tool, input string) <-chan hookResult {
	out := make(chan hookResult, 1)
	go func() {
		block, msg := pre(g, ctx, tool, input)
		out <- hookResult{block, msg}
	}()
	return out
}

func (g *gateDB) result(ch <-chan hookResult) hookResult {
	g.t.Helper()
	select {
	case r := <-ch:
		return r
	case <-time.After(20 * time.Second):
		g.t.Fatal("the hook is still waiting")
		return hookResult{}
	}
}

// onePending waits until the task has exactly one open row and returns it.
func (g *gateDB) onePending(ch <-chan hookResult) approvalRow {
	g.t.Helper()
	deadline := time.Now().Add(20 * time.Second)
	for {
		select {
		case r := <-ch:
			g.t.Fatalf("the hook returned %+v, want it waiting for a decision", r)
		default:
		}
		if open := g.pending(); len(open) == 1 {
			return open[0]
		} else if len(open) > 1 {
			g.t.Fatalf("%d open rows, want one: %+v", len(open), open)
		}
		if time.Now().After(deadline) {
			g.t.Fatal("no open approval row")
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func (g *gateDB) decide(id int64, allowed bool) {
	g.t.Helper()
	if err := g.ic.Decide(id, allowed, "ARTEX", "192.0.2.1"); err != nil {
		g.t.Fatal(err)
	}
}

// approve lets one gated WebFetch through: it waits for the request of the
// call and approves it.
func (g *gateDB) approve(guard *Guard, url string) {
	g.t.Helper()
	ch := call(guard, g.ctx(true, time.Minute), "WebFetch", `{"url":"`+url+`"}`)
	g.decide(g.onePending(ch).id, true)
	if r := g.result(ch); r.block {
		g.t.Fatalf("approved call blocked: %s", r.msg)
	}
}

func marker(t *testing.T) string {
	return fmt.Sprintf("guard-gate-%s-%d", strings.ToLower(t.Name()), time.Now().UnixNano())
}

// With the gate off, which is the default, every branch of the hook behaves as
// it did before the gate existed, and the gate is never reached.
func TestGateOffLeavesEveryBranchUnchanged(t *testing.T) {
	g := newGateDB(t)
	deny, allow, ask := marker(t)+"-deny", marker(t)+"-allow", marker(t)+"-ask"
	g.rule("deny", deny)
	g.rule("allow", allow)
	askRule := g.rule("ask", ask)
	guard := NewWithInterceptor(g.ic)
	guard.gate = &fakeGate{t: t, check: func(int) ([]intercept.TargetRequest, intercept.TargetResult) {
		t.Error("CheckTargets was called with the gate off")
		return nil, intercept.TargetResult{}
	}, request: func(int, []intercept.TargetRequest, *intercept.Decision) intercept.TargetResult {
		t.Error("RequestTargets was called with the gate off")
		return intercept.TargetResult{}
	}}
	base := intercept.WithTaskContext(context.Background(), g.task, "worker", nil)
	off := map[string]context.Context{
		"no scope":         base,
		"scope, no flag":   intercept.WithTargetScope(base, intercept.TargetScope{TaskID: g.task, WaitBound: time.Minute, Interceptor: g.ic}),
		"scope, flag off":  intercept.WithTargetScope(base, intercept.TargetScope{TaskID: g.task, Enabled: func() bool { return false }, WaitBound: time.Minute, Interceptor: g.ic}),
		"no scope, no ctx": context.Background(),
	}
	// Every input names a target that has no pin.
	curl := func(m string) string { return `{"command":"curl https://app.example.com/ # ` + m + `"}` }
	for name, ctx := range off {
		before := len(g.rows())
		// 1. A tool outside the enabled set: passes, nothing is written.
		// Monitor and ExecuteExtraTool are in the default set now, so use read-only
		// tools and an MCP name (inner names are not in the set).
		for _, c := range []struct{ tool, input string }{{"list_assets", curl(deny)}, {"mcp__scan__run", `{"target":"203.0.113.7","note":"` + deny + `"}`}} {
			if block, msg := pre(guard, ctx, c.tool, c.input); block {
				t.Fatalf("%s: %s blocked: %s", name, c.tool, msg)
			}
		}
		// 2. An enabled tool, no rule, judge off: passes, nothing is written.
		if block, msg := pre(guard, ctx, "Bash", curl("no rule")); block {
			t.Fatalf("%s: no rule: blocked: %s", name, msg)
		}
		if block, msg := pre(guard, ctx, "WebFetch", fetchApp); block {
			t.Fatalf("%s: WebFetch, no rule: blocked: %s", name, msg)
		}
		if n := len(g.rows()); name != "no scope, no ctx" && n != before {
			t.Fatalf("%s: %d rows written by passing calls", name, n-before)
		}
		// 3. deny: blocked with the classic text, one denied row.
		block, msg := pre(guard, ctx, "Bash", curl(deny))
		if !block || msg != systemBlockMessage("deny by the guard test") {
			t.Fatalf("%s: deny: block=%v msg=%q", name, block, msg)
		}
		// 4. allow: passes, one allowed row.
		if block, msg := pre(guard, ctx, "Bash", curl(allow)); block {
			t.Fatalf("%s: allow: blocked: %s", name, msg)
		}
		if name == "no scope, no ctx" {
			continue // its rows carry no task id
		}
		rows := g.rows()[before:]
		if len(rows) != 2 || rows[0].status != "denied" || rows[0].decidedBy != "rule" || rows[1].status != "allowed" || rows[1].decidedBy != "rule" ||
			rows[0].source != "rule" || rows[0].targetKey != "" || rows[1].targetKey != "" {
			t.Fatalf("%s: rows = %+v, want one denied and one allowed rule row", name, rows)
		}
		// 5. ask: one classic pending row; the decision of the human decides.
		for _, allowed := range []bool{true, false} {
			ch := call(guard, ctx, "Bash", curl(ask))
			row := g.onePending(ch)
			if row.ruleID != askRule.ID || row.targetKey != "" || row.source != "rule" {
				t.Fatalf("%s: ask row = %+v, want a classic ask of the rule", name, row)
			}
			g.decide(row.id, allowed)
			r := g.result(ch)
			if r.block == allowed || (r.block && r.msg != systemBlockMessage("manual approval not granted (user rejected or approval timed out)")) {
				t.Fatalf("%s: ask decided %v: %+v", name, allowed, r)
			}
		}
	}
	if n := len(g.pins()); n != 0 {
		t.Fatalf("%d pins with the gate off, want none", n)
	}
	// The audit ring still holds one allow entry per call, plus the blocks.
	if audit := guard.Audit(); len(audit) == 0 || audit[0].Action != "allow" {
		t.Fatalf("audit ring = %+v", audit)
	}
}

// A deny by a rule or by the judge blocks first, as before: the gate is not
// consulted, nothing is resolved and no target request exists.
func TestDenyRuleWinsBeforeTargetRequest(t *testing.T) {
	g := newGateDB(t)
	m := marker(t)
	g.rule("deny", m)
	guard := NewWithInterceptor(g.ic)
	gate := &fakeGate{t: t, check: unpinnedOnce}
	guard.gate = gate
	block, msg := pre(guard, g.ctx(true, time.Minute), "Bash", `{"command":"curl https://app.example.com/ # `+m+`"}`)
	if !block || msg != systemBlockMessage("deny by the guard test") {
		t.Fatalf("block=%v msg=%q", block, msg)
	}
	if gate.checks != 0 || len(gate.asked) != 0 {
		t.Fatalf("the gate was reached: %d checks, %d requests", gate.checks, len(gate.asked))
	}
	if rows := g.rows(); len(rows) != 1 || rows[0].status != "denied" || rows[0].targetKey != "" {
		t.Fatalf("rows = %+v, want the denied rule row only", rows)
	}

	// The same with the real gate: no request, no pin.
	guard = NewWithInterceptor(g.ic)
	if block, _ := pre(guard, g.ctx(true, time.Minute), "Bash", `{"command":"curl https://app.example.com/ # `+m+`"}`); !block {
		t.Fatal("deny did not block")
	}
	if len(g.pending()) != 0 || len(g.pins()) != 0 || g.res.lookups() != 0 {
		t.Fatalf("pending=%+v pins=%+v lookups=%d, want none", g.pending(), g.pins(), g.res.lookups())
	}

	// A deny by the judge takes the same branch.
	g.judge("deny")
	input := `{"command":"curl https://judged.example.com/"}`
	gate = &fakeGate{t: t, check: unpinnedOnce}
	guard = NewWithInterceptor(g.ic)
	guard.gate = gate
	before := len(g.rows())
	if block, msg := pre(guard, g.ctx(true, time.Minute), "Bash", input); !block || !strings.Contains(msg, "judge says deny") || strings.Contains(msg, "TARGET_") {
		t.Fatalf("judge deny: block=%v msg=%q", block, msg)
	}
	if gate.checks != 0 || len(gate.asked) != 0 {
		t.Fatalf("judge deny: the gate was reached: %d checks, %d requests", gate.checks, len(gate.asked))
	}
	if rows := g.rows()[before:]; len(rows) != 1 || rows[0].status != "denied" || rows[0].decidedBy != "model" || rows[0].targetKey != "" {
		t.Fatalf("judge deny: rows = %+v, want the denied judge row only", rows)
	}
	guard = NewWithInterceptor(g.ic)
	if block, _ := pre(guard, g.ctx(true, time.Minute), "Bash", input); !block {
		t.Fatal("judge deny did not block")
	}
	if len(g.pending()) != 0 || len(g.pins()) != 0 || g.res.lookups() != 0 {
		t.Fatalf("judge deny: pending=%+v pins=%+v lookups=%d, want none", g.pending(), g.pins(), g.res.lookups())
	}
}

// An asset block rule wins over an allow and an ask, of a rule or of the
// judge: the call is blocked, the allow is not logged, no human is asked, and
// the rule hits on what the call declares, so nothing is resolved. A name rule
// and a URL rule behave the same.
func TestBlockRuleWinsOverAllowAndAsk(t *testing.T) {
	const input = `{"command":"curl https://app.example.com/blocked-path # %s"}`
	for _, block := range []struct{ name, kind, pattern string }{
		{"name rule", "exact_domain", "app.example.com"},
		{"URL rule", "fuzzy_url", "/blocked-path"},
	} {
		for _, v := range []struct{ name, by, action string }{
			{"rule allow", "rule", "allow"},
			{"judge allow", "judge", "allow"},
			{"rule ask", "rule", "ask"},
			{"judge ask", "judge", "ask"},
		} {
			t.Run(block.name+" over "+v.name, func(t *testing.T) {
				g := newGateDB(t)
				id, _ := strconv.ParseInt(g.task, 10, 64)
				if _, err := g.d.Assets().CreateTaskInterceptRule(id, "block", block.kind, block.pattern, "guard test", true); err != nil {
					t.Fatal(err)
				}
				m := marker(t)
				if v.by == "rule" {
					g.rule(v.action, m)
				} else {
					g.judge(v.action)
				}
				guard := NewWithInterceptor(g.ic)
				r := g.result(call(guard, g.ctx(true, time.Minute), "Bash", fmt.Sprintf(input, m)))
				if !r.block || !strings.Contains(r.msg, intercept.TargetRuleBlocked+": ") || !strings.Contains(r.msg, block.pattern) {
					t.Fatalf("block=%v msg=%q, want %s", r.block, r.msg, intercept.TargetRuleBlocked)
				}
				rows := g.rows()
				if len(rows) != 1 || rows[0].status != "denied" || rows[0].decidedBy != "system" || rows[0].ruleID != 0 {
					t.Fatalf("rows = %+v, want the one block row of the gate: no allow logged, nobody asked", rows)
				}
				if n := g.res.lookups(); n != 0 || len(g.pins()) != 0 {
					t.Fatalf("%d lookups, pins %+v; want none", n, g.pins())
				}
			})
		}
	}
}

// An allow by a rule is logged as before and does not satisfy the gate: the
// target still needs a human.
func TestRuleAllowDoesNotSatisfyGate(t *testing.T) {
	g := newGateDB(t)
	m := marker(t)
	g.rule("allow", m)
	input := `{"command":"curl https://app.example.com/ # ` + m + `"}`
	allowDoesNotSatisfyGate(t, g, input, "rule")
}

func TestJudgeAllowDoesNotSatisfyGate(t *testing.T) {
	g := newGateDB(t)
	g.judge("allow")
	allowDoesNotSatisfyGate(t, g, `{"command":"curl https://app.example.com/"}`, "model")
}

func allowDoesNotSatisfyGate(t *testing.T, g *gateDB, input, decidedBy string) {
	t.Helper()
	guard := NewWithInterceptor(g.ic)
	// Scripted gate: the request is denied.
	gate := &fakeGate{t: t, check: unpinnedOnce, request: func(int, []intercept.TargetRequest, *intercept.Decision) intercept.TargetResult {
		return intercept.TargetResult{Code: intercept.TargetDenied, Host: "app.example.com", Port: 443, Reason: "the request was denied"}
	}}
	guard.gate = gate
	block, msg := pre(guard, g.ctx(true, time.Minute), "Bash", input)
	if !block || !strings.Contains(msg, "TARGET_DENIED: target app.example.com:443: the request was denied") {
		t.Fatalf("block=%v msg=%q, want the target denial", block, msg)
	}
	if len(gate.asked) != 1 || gate.asks[0] != nil {
		t.Fatalf("requests=%+v asks=%v, want one request without an ask", gate.asked, gate.asks)
	}
	if rows := g.rows(); len(rows) != 1 || rows[0].status != "allowed" || rows[0].decidedBy != decidedBy {
		t.Fatalf("rows = %+v, want the allow logged by the %s", rows, decidedBy)
	}

	// Real gate: the call waits for a human although the allow was logged.
	guard = NewWithInterceptor(g.ic)
	ch := call(guard, g.ctx(true, time.Minute), "Bash", input)
	row := g.onePending(ch)
	if row.targetKey != "app.example.com:443" || row.source != "target" || row.ruleID != 0 {
		t.Fatalf("open row = %+v, want a plain target request", row)
	}
	if len(g.pins()) != 0 {
		t.Fatalf("pins = %+v: an allow must never pin", g.pins())
	}
	g.decide(row.id, true)
	if r := g.result(ch); r.block {
		t.Fatalf("approved call blocked: %s", r.msg)
	}
	if pins := g.pins(); len(pins) != 1 || pins[0].Host != "app.example.com" || pins[0].Port != 443 || !slices.Equal(pins[0].PinnedIPs, []string{"203.0.113.7"}) {
		t.Fatalf("pins = %+v", pins)
	}
}

// An ask and an unpinned target make one request: one row that carries the
// rule and the target, one click for both.
func TestAskAndUnpinnedTargetCreateOneRequest(t *testing.T) {
	g := newGateDB(t)
	m := marker(t)
	askRule := g.rule("ask", m)
	input := `{"command":"curl https://app.example.com/ # ` + m + `"}`
	guard := NewWithInterceptor(g.ic)

	ch := call(guard, g.ctx(true, time.Minute), "Bash", input)
	row := g.onePending(ch)
	if row.ruleID != askRule.ID || row.targetKey != "app.example.com:443" || row.source != "target" {
		t.Fatalf("open row = %+v, want one row with the rule and the target", row)
	}
	detail, err := g.d.GetInterceptDetail(row.id)
	if err != nil || detail == nil || !detail.Audit.MergedAsk || len(detail.Audit.Targets) != 1 ||
		!strings.Contains(detail.Reason, "ask by the guard test") || !strings.Contains(detail.Reason, "app.example.com:443") {
		t.Fatalf("merged row = %+v err=%v", detail, err)
	}
	g.decide(row.id, true)
	if r := g.result(ch); r.block {
		t.Fatalf("approved call blocked: %s", r.msg)
	}
	// One click: no second prompt was raised, and the target is pinned.
	asked := 0
	for _, r := range g.rows() {
		if r.decidedBy != "system" {
			asked++
		}
	}
	if asked != 1 || len(g.pending()) != 0 || len(g.pins()) != 1 {
		t.Fatalf("rows=%+v pins=%+v, want one human-decided row and one pin", g.rows(), g.pins())
	}

	// Denied: the call is refused and nothing is pinned.
	g.answer(nil, "203.0.113.99")
	ch = call(guard, g.ctx(true, time.Minute), "Bash", input)
	row = g.onePending(ch)
	g.decide(row.id, false)
	if r := g.result(ch); !r.block || !strings.Contains(r.msg, "TARGET_DENIED") {
		t.Fatalf("denied merged request: %+v", r)
	}
	if pins := g.pins(); len(pins) != 1 || !slices.Equal(pins[0].PinnedIPs, []string{"203.0.113.7"}) {
		t.Fatalf("pins after the denial = %+v, want the first pin only", pins)
	}

	// When the ask was not merged (the call attached to a request another call
	// opened), the classic ask is raised afterwards, as its own row.
	gate := &fakeGate{t: t, check: unpinnedOnce, request: func(int, []intercept.TargetRequest, *intercept.Decision) intercept.TargetResult {
		return intercept.TargetResult{AskMerged: false}
	}}
	guard.gate = gate
	ch = call(guard, g.ctx(true, time.Minute), "Bash", input)
	row = g.onePending(ch)
	if row.ruleID != askRule.ID || row.targetKey != "" || row.source != "rule" {
		t.Fatalf("row = %+v, want the classic ask of the rule", row)
	}
	if len(gate.asked) != 1 || gate.asks[0] == nil || gate.asks[0].RuleID != askRule.ID {
		t.Fatalf("the ask was not offered to the target request: %+v", gate.asks)
	}
	g.decide(row.id, false)
	if r := g.result(ch); !r.block || r.msg != systemBlockMessage("manual approval not granted (user rejected or approval timed out)") {
		t.Fatalf("classic ask denied: %+v", r)
	}
	// Merged by the request: no classic ask.
	gate = &fakeGate{t: t, check: unpinnedOnce, request: func(int, []intercept.TargetRequest, *intercept.Decision) intercept.TargetResult {
		return intercept.TargetResult{AskMerged: true}
	}}
	guard.gate = gate
	if block, msg := pre(guard, g.ctx(true, time.Minute), "Bash", input); block || len(g.pending()) != 0 {
		t.Fatalf("merged ask: block=%v msg=%q pending=%+v", block, msg, g.pending())
	}
}

// An ask without an unpinned target is the classic ask, unchanged.
func TestAskAloneIsUnchanged(t *testing.T) {
	g := newGateDB(t)
	m := marker(t)
	askRule := g.rule("ask", m)
	guard := NewWithInterceptor(g.ic)
	g.approve(guard, "https://app.example.com/")
	settled := len(g.rows())

	for name, input := range map[string]string{
		"no target":     `{"command":"id # ` + m + `"}`,
		"pinned target": `{"command":"curl https://app.example.com/ # ` + m + `"}`,
	} {
		for _, allowed := range []bool{true, false} {
			ch := call(guard, g.ctx(true, time.Minute), "Bash", input)
			row := g.onePending(ch)
			if row.ruleID != askRule.ID || row.targetKey != "" || row.source != "rule" {
				t.Fatalf("%s: row = %+v, want a classic ask", name, row)
			}
			g.decide(row.id, allowed)
			r := g.result(ch)
			if r.block == allowed || (r.block && r.msg != systemBlockMessage("manual approval not granted (user rejected or approval timed out)")) {
				t.Fatalf("%s decided %v: %+v", name, allowed, r)
			}
		}
	}
	// Four classic asks, and no further target request or pin.
	classic := 0
	for _, r := range g.rows()[settled:] {
		if r.targetKey != "" {
			t.Fatalf("a target request was opened: %+v", r)
		}
		if r.source == "rule" {
			classic++
		}
	}
	if classic != 4 || len(g.pins()) != 1 {
		t.Fatalf("%d classic asks and %d pins, want 4 and 1", classic, len(g.pins()))
	}
	// A cancelled call is blocked before any row is written, as before.
	ctx, cancel := context.WithCancel(g.ctx(true, time.Minute))
	cancel()
	before := len(g.rows())
	if block, msg := pre(guard, ctx, "Bash", `{"command":"id # `+m+`"}`); !block || !strings.Contains(msg, "work cancelled") || len(g.rows()) != before {
		t.Fatalf("cancelled ask: block=%v msg=%q rows=%d (was %d)", block, msg, len(g.rows()), before)
	}
}

// The gate in the hook, end to end against the database: request, approval,
// pin, changed address, denial, resolver failure, and the round that never waits.
func TestTargetGateThroughHook(t *testing.T) {
	g := newGateDB(t)
	guard := NewWithInterceptor(g.ic)
	ctx := g.ctx(true, time.Minute)

	// Unpinned: the call waits on one request; the approval pins and lets it run.
	ch := call(guard, ctx, "WebFetch", fetchApp)
	row := g.onePending(ch)
	if row.targetKey != "app.example.com:443" || row.source != "target" {
		t.Fatalf("request row = %+v", row)
	}
	if len(g.pins()) != 0 {
		t.Fatal("a pin exists before any human decision")
	}
	g.decide(row.id, true)
	if r := g.result(ch); r.block {
		t.Fatalf("approved call blocked: %s", r.msg)
	}
	// Pinned: later calls pass at once, on any tool, and open nothing.
	requests := func() int {
		n := 0
		for _, r := range g.rows() {
			if r.targetKey != "" {
				n++
			}
		}
		return n
	}
	for _, c := range []struct{ tool, input string }{
		{"WebFetch", fetchApp}, {"Bash", `{"command":"curl -s https://app.example.com/api"}`},
		{"Monitor", `{"command":"curl -N https://app.example.com/stream"}`},
		{"ExecuteExtraTool", `{"tool_name":"mcp__browser__navigate","params":{"url":"https://app.example.com/"}}`},
	} {
		if block, msg := pre(guard, ctx, c.tool, c.input); block {
			t.Fatalf("pinned target, %s: blocked: %s", c.tool, msg)
		}
	}
	if requests() != 1 || len(g.pending()) != 0 {
		t.Fatalf("%d request rows and %d open, want the first request only", requests(), len(g.pending()))
	}

	// A changed address asks again; a denial blocks and pins nothing.
	g.answer(nil, "203.0.113.7", "203.0.113.8")
	ch = call(guard, ctx, "WebFetch", fetchApp)
	row = g.onePending(ch)
	g.decide(row.id, false)
	r := g.result(ch)
	if !r.block || !strings.HasPrefix(r.msg, "[ARTEX platform control, not target defense] TARGET_DENIED: target app.example.com:443: ") {
		t.Fatalf("denied: %+v", r)
	}
	if pins := g.pins(); len(pins) != 1 || pins[0].Version != 1 {
		t.Fatalf("pins after the denial = %+v", pins)
	}

	// A name that does not resolve blocks at once, without a request.
	g.answer(fmt.Errorf("no such host"))
	before := requests()
	block, msg := pre(guard, ctx, "WebFetch", fetchApp)
	if !block || !strings.Contains(msg, "TARGET_RESOLVE_FAILED: the platform could not resolve app.example.com (no such host), so it cannot compare the address with the approved pin (v1: 203.0.113.7)") {
		t.Fatalf("resolver failure: block=%v msg=%q", block, msg)
	}
	if requests() != before || len(g.pending()) != 0 {
		t.Fatalf("a resolver failure opened a request: %+v", g.pending())
	}

	// Wait bound 0 (the final settlement round): the call never waits. It is
	// blocked at once and the request stays open for a later approval.
	g.answer(nil, "203.0.113.50")
	start := time.Now()
	block, msg = pre(guard, g.ctx(true, 0), "WebFetch", `{"url":"https://other.example.com/"}`)
	if !block || !strings.Contains(msg, "TARGET_APPROVAL_PENDING: target other.example.com:443: ") || time.Since(start) > 5*time.Second {
		t.Fatalf("wait bound 0: block=%v msg=%q after %s", block, msg, time.Since(start))
	}
	open := g.pending()
	if len(open) != 1 || open[0].targetKey != "other.example.com:443" {
		t.Fatalf("open rows = %+v, want the request left open", open)
	}
	// Approved later: the next call passes.
	g.decide(open[0].id, true)
	if block, msg := pre(guard, g.ctx(true, 0), "WebFetch", `{"url":"https://other.example.com/"}`); block {
		t.Fatalf("after the late approval: blocked: %s", msg)
	}

	// More than five unpinned targets in one call: blocked, nothing requested.
	block, msg = pre(guard, ctx, "Bash", `{"command":"nmap 198.51.100.1 198.51.100.2 198.51.100.3 198.51.100.4 198.51.100.5 198.51.100.6"}`)
	if !block || !strings.Contains(msg, "TARGET_TOO_MANY: ") || len(g.pending()) != 0 {
		t.Fatalf("six targets: block=%v msg=%q pending=%+v", block, msg, g.pending())
	}
}

// Owner condition. An approved pin with name_only_effective = false; then
// global_proxy is set; then a call whose name resolves to another address. The
// call must not block and must not open a request.
func TestProxySetAfterApprovalNeitherBlocksNorAsks(t *testing.T) {
	g := newGateDB(t)
	proxy := ""
	g.ic.SetUpstreamProxyCheck(func() bool { return proxy != "" })
	guard := NewWithInterceptor(g.ic)
	g.approve(guard, "https://app.example.com/")
	pins := g.pins()
	if len(pins) != 1 || pins[0].NameOnlyEffective || !slices.Equal(pins[0].PinnedIPs, []string{"203.0.113.7"}) {
		t.Fatalf("pins = %+v, want one pin with name_only_effective = false", pins)
	}
	rows := len(g.rows())

	proxy = "http://127.0.0.1:3128"
	g.answer(nil, "198.51.100.99")
	for _, c := range []struct{ tool, input string }{
		{"WebFetch", fetchApp}, {"Bash", `{"command":"curl https://app.example.com/"}`},
	} {
		r := g.result(call(guard, g.ctx(true, time.Minute), c.tool, c.input))
		if r.block {
			t.Fatalf("%s behind the proxy: blocked: %s", c.tool, r.msg)
		}
	}
	if open := g.pending(); len(open) != 0 {
		t.Fatalf("the call opened a request: %+v", open)
	}
	for _, r := range g.rows()[rows:] {
		if r.targetKey != "" || r.status != "allowed" || r.decidedBy != "system" {
			t.Fatalf("row written by the call = %+v, want only the first use of the pin", r)
		}
	}
	after := g.pins()
	if len(after) != 1 || after[0].ID != pins[0].ID || after[0].NameOnlyEffective || after[0].Version != 1 || !slices.Equal(after[0].PinnedIPs, []string{"203.0.113.7"}) {
		t.Fatalf("pins after the call = %+v, want the same row, unchanged", after)
	}

	// Control: the same call without the proxy waits for a human.
	proxy = ""
	ch := call(guard, g.ctx(true, time.Minute), "WebFetch", fetchApp)
	row := g.onePending(ch)
	g.decide(row.id, false)
	if r := g.result(ch); !r.block {
		t.Fatal("control: the changed address was let through without the proxy")
	}
}

// Chat and retester sessions are scoped to their conversation. Gate off (the
// default): the hook behaves as before. Gate on: the request, the pin and the
// rows of the gate belong to the conversation.
func TestTargetGateConversationScope(t *testing.T) {
	g := newGateDB(t)
	conv, err := g.d.CreateConversation("assistant", "guard target gate", nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = g.d.DeleteConversation(conv.ID)
		_, _ = g.d.Exec(`DELETE FROM target_pins WHERE conversation_id=$1`, conv.ID)
	})
	m := marker(t)
	g.rule("deny", m)
	guard := NewWithInterceptor(g.ic)
	chat := func(on bool) context.Context {
		return intercept.WithTargetScope(intercept.WithConvID(context.Background(), conv.ID),
			intercept.TargetScope{ConversationID: conv.ID, Enabled: func() bool { return on }, WaitBound: time.Minute, Interceptor: g.ic})
	}
	rows := func(where string) int {
		t.Helper()
		var n int
		if err := g.d.QueryRow(`SELECT count(*) FROM intercept_pending WHERE conversation_id=$1 AND `+where, conv.ID).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}

	// Gate off: an unpinned target passes and writes nothing; a deny rule blocks as before.
	for _, c := range []struct{ tool, input string }{{"WebFetch", fetchApp}, {"Bash", `{"command":"curl https://app.example.com/"}`}, {"mcp__scan__run", `{"target":"203.0.113.7"}`}} {
		if block, msg := pre(guard, chat(false), c.tool, c.input); block {
			t.Fatalf("gate off, %s: blocked: %s", c.tool, msg)
		}
	}
	if n := rows("true"); n != 0 {
		t.Fatalf("gate off: %d rows, want none", n)
	}
	if block, msg := pre(guard, chat(false), "Bash", `{"command":"curl https://app.example.com/ # `+m+`"}`); !block || msg != systemBlockMessage("deny by the guard test") {
		t.Fatalf("gate off, deny: block=%v msg=%q", block, msg)
	}
	if rows("decision_source='target'") != 0 || rows("status='denied' AND decided_by='rule'") != 1 {
		t.Fatal("gate off: want the one denied rule row and no row of the gate")
	}

	// Gate on: the call waits on a request of the conversation.
	ch := call(guard, chat(true), "WebFetch", fetchApp)
	var id int64
	deadline := time.Now().Add(20 * time.Second)
	for rows("status='pending' AND target_key='app.example.com:443'") != 1 {
		if time.Now().After(deadline) {
			t.Fatal("no open target request for the conversation")
		}
		time.Sleep(5 * time.Millisecond)
	}
	if err := g.d.QueryRow(`SELECT id FROM intercept_pending WHERE conversation_id=$1 AND status='pending'`, conv.ID).Scan(&id); err != nil {
		t.Fatal(err)
	}
	g.decide(id, true)
	if r := g.result(ch); r.block {
		t.Fatalf("approved call blocked: %s", r.msg)
	}
	pins, err := g.d.ListTargetPins(db.TargetScopeRef{ConversationID: conv.ID})
	if err != nil || len(pins) != 1 || pins[0].ConversationID == nil || *pins[0].ConversationID != conv.ID || pins[0].TaskID != nil {
		t.Fatalf("pins = %+v, %v; want one pin of the conversation", pins, err)
	}
	if block, msg := pre(guard, chat(true), "Bash", `{"command":"curl https://app.example.com/"}`); block {
		t.Fatalf("pinned: blocked: %s", msg)
	}
	// The pin is the conversation's: the task of this test still has to ask.
	if len(g.pins()) != 0 {
		t.Fatalf("the task got pins: %+v", g.pins())
	}
	block, msg := pre(guard, g.ctx(true, 0), "WebFetch", fetchApp)
	if !block || !strings.Contains(msg, "TARGET_APPROVAL_PENDING") {
		t.Fatalf("the task passed on the conversation's pin: block=%v msg=%q", block, msg)
	}
}
