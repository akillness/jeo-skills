package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"iter"
	"net/http/httptest"
	"slices"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Autumn-27/artex/agent"
	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/intercept"
	"github.com/Autumn-27/norma/llm"
)

// Target-gate opt-in flag, pins and decisions over the real mux and the real
// auth. The server context is already cancelled, so a task created through
// these tests never starts an engine.

type gateServer struct {
	s     *Server
	m     *Manager
	token string
}

func newGateServer(t *testing.T) *gateServer {
	t.Helper()
	return newGateServerWithProxy(t, "")
}

func newGateServerWithProxy(t *testing.T, proxyAddr string) *gateServer {
	t.Helper()
	skipWithoutDSN(t)
	m, err := NewManager(t.TempDir(), proxyAddr)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = m.Close() })
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	s := New(ctx, m, t.TempDir(), t.TempDir(), t.TempDir())
	token, err := signJWT(s.jwtKey)
	if err != nil {
		t.Fatal(err)
	}
	return &gateServer{s: s, m: m, token: token}
}

// do sends an authenticated request. httptest sets the peer to 192.0.2.1.
func (g *gateServer) do(t *testing.T, method, path, body string) (int, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+g.token)
	rec := httptest.NewRecorder()
	g.s.Handler().ServeHTTP(rec, req)
	var out map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	return rec.Code, out
}

// newTask creates a task through the manager and removes it, its pins and its
// approval rows when the test ends.
func (g *gateServer) newTask(t *testing.T, opts db.TaskCreateOptions) *Task {
	t.Helper()
	created, err := g.m.CreateTaskWithOptions("target gate flag", "flag, pins and decisions", opts)
	if err != nil {
		t.Fatal(err)
	}
	g.cleanupTask(t, created.ID)
	task, ok := g.m.Task(created.ID)
	if !ok {
		t.Fatal("task not found after creation")
	}
	return task
}

func (g *gateServer) cleanupTask(t *testing.T, id string) {
	t.Helper()
	t.Cleanup(func() {
		n, _ := strconv.ParseInt(id, 10, 64)
		_ = g.m.pg.DeleteTask(n)
		_, _ = g.m.pg.Exec(`DELETE FROM target_pins WHERE task_id=$1`, n)
		_, _ = g.m.pg.Exec(`DELETE FROM intercept_pending WHERE task_id=$1`, id)
		_, _ = g.m.pg.Exec(`DELETE FROM assets WHERE type = 'ip' AND ip = '127.0.0.1'`)
	})
}

func taskRef(t *testing.T, task *Task) db.TargetScopeRef {
	t.Helper()
	id, err := strconv.ParseInt(task.ID, 10, 64)
	if err != nil {
		t.Fatal(err)
	}
	return db.TargetScopeRef{TaskID: id}
}

// openTargetRow opens a target approval request showing ips.
func openTargetRow(t *testing.T, pg *db.DB, scope db.TargetScopeRef, host string, ips ...string) int64 {
	t.Helper()
	id, created, err := pg.FindOrCreateTargetRequest(db.TargetRequest{
		Scope: scope, Host: host, Port: 443, AgentName: "worker", ToolName: "WebFetch", Reason: "target " + host + " is not approved",
		Audit: &db.InterceptAudit{Correlation: "unavailable", InitialAction: "ask", ExecutionStatus: "not_started",
			Targets: []db.InterceptTarget{{Host: host, Port: 443, ResolvedIPs: ips, Resolver: "system", ResolvedAt: time.Now().UTC(), Outcome: "requested"}}},
	})
	if err != nil || !created {
		t.Fatalf("open target request: id=%d created=%v err=%v", id, created, err)
	}
	return id
}

// The flag is read on every tool call: a switch through the API is seen by a
// scope that was handed out before it.
func TestTargetGateLiveSwitch(t *testing.T) {
	g := newGateServer(t)
	task := g.newTask(t, db.TaskCreateOptions{})
	scope := task.targetScope(intercept.DefaultTargetWaitBound)
	if scope.Enabled == nil || scope.Enabled() {
		t.Fatal("a new task must have the gate off")
	}
	if scope.Interceptor != g.m.interceptor {
		t.Fatal("the task scope does not carry the manager's interceptor")
	}
	if code, body := g.do(t, "GET", "/api/tasks/"+task.ID, ""); code != 200 || body["target_gate"] != false {
		t.Fatalf("task detail: %d %v, want target_gate false", code, body)
	}

	code, body := g.do(t, "PATCH", "/api/tasks/"+task.ID, `{"target_gate":true}`)
	if code != 200 || body["target_gate"] != true {
		t.Fatalf("switch on: %d %v", code, body)
	}
	if !scope.Enabled() {
		t.Fatal("the scope handed out before the switch still reports the gate off")
	}
	id, _ := strconv.ParseInt(task.ID, 10, 64)
	if stored, err := g.m.pg.GetTask(id); err != nil || stored == nil || !stored.TargetGate {
		t.Fatalf("stored task = %+v, %v; want the gate on", stored, err)
	}
	// Another metadata patch leaves the flag alone.
	if code, body := g.do(t, "PATCH", "/api/tasks/"+task.ID, `{"name":"renamed"}`); code != 200 || body["target_gate"] != true || !scope.Enabled() {
		t.Fatalf("rename: %d %v, want the gate still on", code, body)
	}
	if code, body := g.do(t, "PATCH", "/api/tasks/"+task.ID, `{"target_gate":false}`); code != 200 || body["target_gate"] != false || scope.Enabled() {
		t.Fatalf("switch off: %d %v enabled=%v", code, body, scope.Enabled())
	}
	if code, body := g.do(t, "PATCH", "/api/tasks/"+task.ID, `{}`); code != 400 || !strings.Contains(fmt.Sprint(body["error"]), "target_gate") {
		t.Fatalf("empty patch: %d %v, want 400 naming target_gate", code, body)
	}
}

const gateTestGoal = "Probe the lab target at http://127.0.0.1:9/v1 for unauthenticated data exposure; record one record as evidence and stop."

// The flag is set on the existing create path. Omitted means off, and a task
// loaded from the database keeps what was stored.
func TestCreateTaskAcceptsTargetGate(t *testing.T) {
	g := newGateServer(t)
	for _, tc := range []struct {
		field string
		want  bool
	}{
		{`,"target_gate":true`, true},
		{`,"target_gate":false`, false},
		{``, false},
	} {
		code, body := g.do(t, "POST", "/api/tasks", `{"description":"gate create","goal":"`+gateTestGoal+`"`+tc.field+`}`)
		id, _ := body["id"].(string)
		if code != 201 || id == "" {
			t.Fatalf("create %q: %d %v", tc.field, code, body)
		}
		g.cleanupTask(t, id)
		task, ok := g.m.Task(id)
		if !ok || body["target_gate"] != tc.want || task.targetScope(0).Enabled() != tc.want {
			t.Fatalf("create %q: target_gate=%v, want %v", tc.field, body["target_gate"], tc.want)
		}
		n, _ := strconv.ParseInt(id, 10, 64)
		stored, err := g.m.pg.GetTask(n)
		if err != nil || stored == nil || stored.TargetGate != tc.want {
			t.Fatalf("create %q: stored %+v, %v; want %v", tc.field, stored, err, tc.want)
		}
		if loaded := taskFromPG(stored, g.m.pg.Exploration(stored.ExplorationID), g.m.interceptor); loaded.targetScope(0).Enabled() != tc.want {
			t.Fatalf("create %q: a task loaded from the database has the gate %v", tc.field, !tc.want)
		}
	}
}

// ruleLines renders a task's intercept rules for comparison.
func ruleLines(t *testing.T, as *db.AssetStore, taskID string) []string {
	t.Helper()
	n, _ := strconv.ParseInt(taskID, 10, 64)
	rules, err := as.ListTaskInterceptRules(n)
	if err != nil {
		t.Fatal(err)
	}
	var out []string
	for _, r := range rules {
		out = append(out, fmt.Sprintf("%s %s %s enabled=%v %q", r.Action, r.Kind, r.Pattern, r.Enabled, r.Note))
	}
	return out
}

// checkSpawnedChild checks the target-gate state of a spawned task: the flag,
// live and stored, no pin, and its own intercept rules.
func (g *gateServer) checkSpawnedChild(t *testing.T, childID string, gate bool, rules []string) {
	t.Helper()
	child, ok := g.m.Task(childID)
	if !ok {
		t.Fatalf("spawned task %s not found", childID)
	}
	if child.targetScope(0).Enabled() != gate {
		t.Fatalf("spawned task gate = %v, want %v", !gate, gate)
	}
	n, _ := strconv.ParseInt(childID, 10, 64)
	if stored, err := g.m.pg.GetTask(n); err != nil || stored == nil || stored.TargetGate != gate {
		t.Fatalf("stored child = %+v, %v; want the gate %v", stored, err, gate)
	}
	if pins, err := g.m.pg.ListTargetPins(db.TargetScopeRef{TaskID: n}); err != nil || len(pins) != 0 {
		t.Fatalf("the spawned task has pins: %+v, %v", pins, err)
	}
	if got := ruleLines(t, g.m.Assets(), childID); !slices.Equal(got, rules) {
		t.Fatalf("spawned task rules = %q, want %q", got, rules)
	}
}

// A task spawned through spawn_task takes the target gate of the calling scope
// (D23) and, from a gated task, that task's block rules (D24). It never takes
// pins or allow rules, and parent_ref plays no part. A gate-off caller and a
// call with no scope create the child as before: gate off, no rules.
func TestSpawnedTaskInheritsGateFromCaller(t *testing.T) {
	g := newGateServer(t)
	on := true
	parentRules := []db.TaskInterceptRuleInput{
		{Enabled: true, Action: "block", Kind: "exact_domain", Pattern: "blocked.example.com", Note: "out of scope"},
		{Enabled: false, Action: "block", Kind: "cidr", Pattern: "198.51.100.0/24"},
		{Enabled: true, Action: "allow", Kind: "exact_domain", Pattern: "allowed.example.com"},
	}
	gated := g.newTask(t, db.TaskCreateOptions{TargetGate: &on, InterceptRules: parentRules})
	open := g.newTask(t, db.TaskCreateOptions{InterceptRules: parentRules})
	if !gated.targetScope(0).Enabled() || open.targetScope(0).Enabled() {
		t.Fatal("control: one parent gated, the other not")
	}
	// The gated parent holds one pin, which no child may get.
	if p, ok, err := g.m.pg.ResolveTargetRequest(openTargetRow(t, g.m.pg, taskRef(t, gated), "app.example.com", "203.0.113.7"), true, "ARTEX", "192.0.2.1"); err != nil || !ok || p == nil {
		t.Fatalf("pin the parent: %+v ok=%v err=%v", p, ok, err)
	}
	conv, err := g.m.pg.CreateConversationGated("auto", "spawn from a gated chat", nil, true)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = g.m.pg.DeleteConversation(conv.ID) })
	gatedChat := intercept.TargetScope{ConversationID: conv.ID, Enabled: func() bool { return true },
		WaitBound: intercept.DefaultTargetWaitBound, Interceptor: g.m.interceptor}
	scoped := func(s intercept.TargetScope) context.Context {
		return intercept.WithTargetScope(context.Background(), s)
	}
	blockOnly := []string{
		`block exact_domain blocked.example.com enabled=true "out of scope"`,
		`block cidr 198.51.100.0/24 enabled=false ""`,
	}

	for _, tc := range []struct {
		name      string
		ctx       context.Context
		parentRef string
		gate      bool
		rules     []string
	}{
		{"gated task", scoped(gated.targetScope(intercept.DefaultTargetWaitBound)), "", true, blockOnly},
		{"gated task, parent_ref names a gate-off task", scoped(gated.targetScope(0)), open.ID, true, blockOnly},
		{"gated conversation", scoped(gatedChat), "", true, nil},
		{"gate-off task", scoped(open.targetScope(0)), "", false, nil},
		{"gate-off task, parent_ref names a gated task", scoped(open.targetScope(0)), gated.ID, false, nil},
		{"no scope, parent_ref names a gated task", context.Background(), gated.ID, false, nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			args := map[string]any{"description": "spawned child", "goal": gateTestGoal}
			if tc.parentRef != "" {
				args["parent_ref"] = tc.parentRef
			}
			in, _ := json.Marshal(args)
			res, err := g.s.toolSpawnTask().Call(tc.ctx, in, nil)
			if err != nil {
				t.Fatal(err)
			}
			childID, found := strings.CutPrefix(res.Flatten(), "task created: ")
			if !found {
				t.Fatalf("spawn_task result: %q", res.Flatten())
			}
			g.cleanupTask(t, childID)
			if child, _ := g.m.Task(childID); child == nil || child.ParentRef != tc.parentRef {
				t.Fatalf("spawned task = %+v, want parent_ref %q", child, tc.parentRef)
			}
			g.checkSpawnedChild(t, childID, tc.gate, tc.rules)
		})
	}
	// The callers are unchanged.
	if pins, err := g.m.pg.ListTargetPins(taskRef(t, gated)); err != nil || len(pins) != 1 {
		t.Fatalf("parent pins = %+v, %v; want still one", pins, err)
	}
	if got := ruleLines(t, g.m.Assets(), gated.ID); len(got) != 3 {
		t.Fatalf("parent rules = %q, want the three it was created with", got)
	}
}

// toolCallProvider is a model that makes one tool call on its first turn and
// ends the run on the next.
type toolCallProvider struct {
	tool, input string
	turn        atomic.Int64
}

func (p *toolCallProvider) Stream(context.Context, llm.CompletionRequest) iter.Seq2[llm.StreamEvent, error] {
	events := []llm.StreamEvent{{Type: llm.SETextDelta, Text: "done"}, {Type: llm.SEMessageDelta, StopReason: "end_turn"}}
	if p.turn.Add(1) == 1 {
		events = []llm.StreamEvent{
			{Type: llm.SEToolUseStart, ToolID: "call-1", ToolName: p.tool},
			{Type: llm.SEToolInputJSON, Text: p.input},
			{Type: llm.SEMessageDelta, StopReason: "tool_use"},
		}
	}
	return func(yield func(llm.StreamEvent, error) bool) {
		for _, event := range events {
			if !yield(event, nil) {
				return
			}
		}
	}
}

func (p *toolCallProvider) Complete(ctx context.Context, req llm.CompletionRequest) (llm.Message, string, llm.Usage, error) {
	return accumulateStreamForTest(ctx, p.Stream, req)
}

// spawn_task called by the model of an auto conversation, through the real
// harness, tool binding and tool context: the child takes the conversation's
// flag. The unit test above builds the caller's context by hand; this one shows
// the conversation's scope reaches the tool.
func TestSpawnTaskSeesCallerScopeThroughHarness(t *testing.T) {
	g := newGateServer(t)
	for _, gate := range []bool{true, false} {
		t.Run(fmt.Sprintf("conversation gate %v", gate), func(t *testing.T) {
			desc := fmt.Sprintf("harness child %v %d", gate, time.Now().UnixNano())
			in, _ := json.Marshal(map[string]any{"description": desc, "goal": gateTestGoal})
			conv, err := g.m.pg.CreateConversationGated("auto", "spawn through the harness", nil, gate)
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { _ = g.m.pg.DeleteConversation(conv.ID) })
			g.s.cfgMu.Lock()
			g.s.chatAgent = agent.NewChatAgent(&toolCallProvider{tool: "spawn_task", input: string(in)}, "test-model", g.m.dir, nil, 10000)
			g.s.cfgMu.Unlock()
			// The server context of this fixture is cancelled; the turn gets its own.
			ctx, cancel := context.WithCancelCause(intercept.WithConvID(context.Background(), conv.ID))
			g.s.runConversationTurn(ctx, cancel, conv, "spawn the child task", g.s.convBusyKey(conv.ID))
			var childID string
			for _, task := range g.m.List() {
				if task.Description == desc {
					childID = task.ID
				}
			}
			if childID == "" {
				t.Fatal("the model's spawn_task call created no task")
			}
			g.cleanupTask(t, childID)
			g.checkSpawnedChild(t, childID, gate, nil)
		})
	}
}

// A conversation started by a trigger of a gated task is gated (D25): a single
// fire, a by-task merge, and a merge across tasks of which one is gated. A fire
// of a gate-off task, or with no task, starts it gate off as before. The flag is
// copied, never pins.
func TestTriggeredConversationInheritsGate(t *testing.T) {
	g := newGateServer(t)
	g.s.cfgMu.Lock()
	g.s.chatAgent = agent.NewChatAgent(newScopeProbeProvider(), "test-model", g.m.dir, nil, 10000)
	g.s.cfgMu.Unlock()
	on := true
	gated, open := g.newTask(t, db.TaskCreateOptions{TargetGate: &on}), g.newTask(t, db.TaskCreateOptions{})
	if p, ok, err := g.m.pg.ResolveTargetRequest(openTargetRow(t, g.m.pg, taskRef(t, gated), "app.example.com", "203.0.113.7"), true, "ARTEX", "192.0.2.1"); err != nil || !ok || p == nil {
		t.Fatalf("pin the gated task: %+v ok=%v err=%v", p, ok, err)
	}
	gatedID, openID := taskRef(t, gated).TaskID, taskRef(t, open).TaskID

	// The server context is cancelled, so StartTriggeredRun only queues. The test
	// takes the next run with the merge mode under test and runs it as the pump would.
	trigger := func(t *testing.T, mode string, taskIDs ...int64) *db.Conversation {
		t.Helper()
		key := fmt.Sprintf("gate-trigger-%d", time.Now().UnixNano())
		for _, id := range taskIDs {
			g.s.StartTriggeredRun(key, "trigger", "event body", id, id > 0, "desc", "goal")
		}
		g.s.queueMu.Lock()
		item := g.s.nextTriggerRun(key, triggerBehavior{runMode: "serial", mergeMode: mode})
		left := len(g.s.triggerQ[key])
		delete(g.s.triggerQ, key)
		delete(g.s.triggerCfg, key)
		g.s.queueMu.Unlock()
		if left != 0 {
			t.Fatalf("%d fires left in the queue, want one run", left)
		}
		item.title = key
		g.s.runTriggeredRun(item)
		convs, err := g.m.pg.ListConversations()
		if err != nil {
			t.Fatal(err)
		}
		for _, c := range convs {
			if c.Title == key {
				t.Cleanup(func() { _ = g.m.pg.DeleteConversation(c.ID) })
				return c
			}
		}
		t.Fatal("the trigger created no conversation")
		return nil
	}

	for _, tc := range []struct {
		name  string
		mode  string
		tasks []int64
		gate  bool
	}{
		{"gated task", "none", []int64{gatedID}, true},
		{"gated task, merged by task", "by_task", []int64{gatedID, gatedID}, true},
		{"merge across tasks, gated second", "all", []int64{openID, gatedID}, true},
		{"gate-off task", "none", []int64{openID}, false},
		{"gate-off task, merged by task", "by_task", []int64{openID, openID}, false},
		{"no task", "none", []int64{0}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			c := trigger(t, tc.mode, tc.tasks...)
			if c.TargetGate != tc.gate {
				t.Fatalf("triggered conversation gate = %v, want %v", c.TargetGate, tc.gate)
			}
			if pins, err := g.m.pg.ListTargetPins(db.TargetScopeRef{ConversationID: c.ID}); err != nil || len(pins) != 0 {
				t.Fatalf("the triggered conversation has pins: %+v, %v", pins, err)
			}
		})
	}
}

// The conversation flag is set on create and on patch, and the turn that starts
// after a switch runs with the new value.
func TestConversationTargetGateOverHTTP(t *testing.T) {
	g := newGateServer(t)
	turnScope := func(id int64) intercept.TargetScope {
		t.Helper()
		conv, err := g.m.pg.GetConversation(id)
		if err != nil || conv == nil {
			t.Fatalf("conversation %d: %+v, %v", id, conv, err)
		}
		probe := newScopeProbeProvider()
		g.s.cfgMu.Lock()
		g.s.chatAgent = agent.NewChatAgent(probe, "test-model", g.m.dir, nil, 10000)
		g.s.cfgMu.Unlock()
		// The server context of this fixture is cancelled; the turn gets its own.
		ctx, cancel := context.WithCancelCause(intercept.WithConvID(context.Background(), id))
		g.s.runConversationTurn(ctx, cancel, conv, "hello", g.s.convBusyKey(id))
		got := probe.first(t)
		if !got.ok || got.scope.ConversationID != id || got.scope.Enabled == nil {
			t.Fatalf("turn scope = %+v (present=%v)", got.scope, got.ok)
		}
		return got.scope
	}
	create := func(body string) int64 {
		t.Helper()
		code, out := g.do(t, "POST", "/api/conversations", body)
		id, _ := out["id"].(float64)
		if code != 200 || id == 0 {
			t.Fatalf("create conversation: %d %v", code, out)
		}
		t.Cleanup(func() { _ = g.m.pg.DeleteConversation(int64(id)) })
		return int64(id)
	}

	plain := create(`{"agent_key":"auto","title":"gate off"}`)
	if scope := turnScope(plain); scope.Enabled() {
		t.Fatal("a conversation created without the flag runs with the gate on")
	}
	gated := create(`{"agent_key":"auto","title":"gate on","target_gate":true}`)
	scope := turnScope(gated)
	if !scope.Enabled() || scope.Interceptor != g.m.interceptor {
		t.Fatalf("gated conversation: enabled=%v, want the gate on and the manager's interceptor", scope.Enabled())
	}
	path := "/api/conversations/" + strconv.FormatInt(gated, 10)
	if code, out := g.do(t, "PATCH", path, `{"target_gate":false}`); code != 200 || out["target_gate"] != false {
		t.Fatalf("switch off: %d %v", code, out)
	}
	if turnScope(gated).Enabled() {
		t.Fatal("the turn after the switch still runs with the gate on")
	}
	if code, out := g.do(t, "PATCH", path, `{"title":"renamed","target_gate":true}`); code != 200 || out["target_gate"] != true || out["title"] != "renamed" {
		t.Fatalf("switch on with a rename: %d %v", code, out)
	}
	if code, out := g.do(t, "PATCH", path, `{}`); code != 400 || !strings.Contains(fmt.Sprint(out["error"]), "target_gate") {
		t.Fatalf("empty patch: %d %v, want 400 naming target_gate", code, out)
	}
}

// The decide endpoint keeps its request and response shape. On a target row
// "allowed" pins the displayed addresses. Every human decision, on a target row
// or on a classic ask, records the subject of the session token and the remote
// address; decided_by stays the actor class.
func TestInterceptDecideRecordsApproverOverHTTP(t *testing.T) {
	g := newGateServer(t)
	task := g.newTask(t, db.TaskCreateOptions{})
	scope := taskRef(t, task)
	pg := g.m.pg
	decide := func(id int64, decision string) int {
		t.Helper()
		code, _ := g.do(t, "POST", fmt.Sprintf("/api/intercept/pending/%d/decide", id), `{"decision":"`+decision+`"}`)
		return code
	}

	target := openTargetRow(t, pg, scope, "app.example.com", "203.0.113.7")
	if code := decide(target, "allowed"); code != 200 {
		t.Fatalf("decide target row: %d", code)
	}
	pins, err := pg.ListTargetPins(scope)
	if err != nil || len(pins) != 1 || pins[0].DecidedBy != "ARTEX" || pins[0].DecidedFrom != "192.0.2.1" ||
		!slices.Equal(pins[0].PinnedIPs, []string{"203.0.113.7"}) || pins[0].InterceptID == nil || *pins[0].InterceptID != target {
		t.Fatalf("pins = %+v, %v; want one pin with the approver and the address", pins, err)
	}
	row, err := pg.GetInterceptDetail(target)
	if err != nil || row == nil || row.Status != "allowed" || row.DecidedBy != "human" || row.Audit.Approver != "ARTEX" || row.Audit.ApproverAddr != "192.0.2.1" {
		t.Fatalf("target row = %+v, %v", row, err)
	}
	if code := decide(target, "denied"); code != 409 {
		t.Fatalf("second decision: %d, want 409", code)
	}

	denied := openTargetRow(t, pg, scope, "other.example.com", "203.0.113.8")
	if code := decide(denied, "denied"); code != 200 {
		t.Fatalf("deny target row: %d", code)
	}
	if pins, err := pg.ListTargetPins(scope); err != nil || len(pins) != 1 {
		t.Fatalf("pins after a denial = %+v, %v; want still one", pins, err)
	}

	classic, err := pg.CreateInterceptPending(0, 0, task.ID, "worker", "Bash", []byte(`{"command":"id"}`), "classic ask",
		&db.InterceptAudit{Correlation: "exact", InitialAction: "ask", ExecutionStatus: "not_started"})
	if err != nil {
		t.Fatal(err)
	}
	if code := decide(classic, "allowed"); code != 200 {
		t.Fatalf("decide classic ask: %d", code)
	}
	row, err = pg.GetInterceptDetail(classic)
	if err != nil || row == nil || row.Status != "allowed" || row.DecidedBy != "human" || row.Audit == nil ||
		row.Audit.Approver != "ARTEX" || row.Audit.ApproverAddr != "192.0.2.1" || row.Audit.EffectiveAction != "allow" {
		t.Fatalf("classic row = %+v, %v; want the approver and the address in its audit", row, err)
	}
	if pins, err := pg.ListTargetPins(scope); err != nil || len(pins) != 1 {
		t.Fatalf("pins after a classic approval = %+v, %v; want still one", pins, err)
	}

	// Target rows are listed under their own decision source.
	code, list := g.do(t, "GET", "/api/intercept/task/"+task.ID+"?decision_source=target&page=1&size=50", "")
	if items, _ := list["items"].([]any); code != 200 || len(items) != 2 {
		t.Fatalf("decision_source=target: %d %v, want the two target rows", code, list)
	}
	if code, _ := g.do(t, "GET", "/api/intercept/history?decision_source=nonsense&page=1", ""); code != 400 {
		t.Fatalf("unknown decision_source: %d, want 400", code)
	}
}

func TestJWTSubject(t *testing.T) {
	key := []byte("0123456789abcdef0123456789abcdef")
	token, err := signJWT(key)
	if err != nil {
		t.Fatal(err)
	}
	if got := jwtSubject(token, key); got != "ARTEX" {
		t.Fatalf("subject = %q, want ARTEX", got)
	}
	if got := jwtSubject(token, []byte("another key, another key, another")); got != "" {
		t.Fatalf("subject of a token signed with another key = %q, want none", got)
	}
	if got := jwtSubject("", key); got != "" {
		t.Fatalf("subject of no token = %q", got)
	}
}

// Pin routes: list and revoke, scoped to one existing task or conversation.
func TestTargetPinRoutes(t *testing.T) {
	g := newGateServer(t)
	pg := g.m.pg
	task, other := g.newTask(t, db.TaskCreateOptions{}), g.newTask(t, db.TaskCreateOptions{})
	conv, err := pg.CreateConversation("auto", "pin routes", nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = pg.DeleteConversation(conv.ID)
		_, _ = pg.Exec(`DELETE FROM target_pins WHERE conversation_id=$1`, conv.ID)
	})
	pin := func(scope db.TargetScopeRef, host string) int64 {
		t.Helper()
		p, ok, err := pg.ResolveTargetRequest(openTargetRow(t, pg, scope, host, "203.0.113.7"), true, "ARTEX", "192.0.2.1")
		if err != nil || !ok || p == nil {
			t.Fatalf("pin %s: %+v ok=%v err=%v", host, p, ok, err)
		}
		return p.ID
	}
	taskPin := pin(taskRef(t, task), "app.example.com")
	otherPin := pin(taskRef(t, other), "app.example.com")
	convPin := pin(db.TargetScopeRef{ConversationID: conv.ID}, "chat.example.com")

	listed := func(path string) []any {
		t.Helper()
		code, body := g.do(t, "GET", path, "")
		pins, ok := body["pins"].([]any)
		if code != 200 || !ok {
			t.Fatalf("GET %s: %d %v", path, code, body)
		}
		return pins
	}
	for _, tc := range []struct {
		base string
		id   int64
		host string
	}{
		{"/api/tasks/" + task.ID, taskPin, "app.example.com"},
		{"/api/conversations/" + strconv.FormatInt(conv.ID, 10), convPin, "chat.example.com"},
	} {
		pins := listed(tc.base + "/target-pins")
		if len(pins) != 1 {
			t.Fatalf("%s: %d pins, want 1", tc.base, len(pins))
		}
		got := pins[0].(map[string]any)
		if got["id"] != float64(tc.id) || got["host"] != tc.host || got["status"] != "active" || got["decided_by"] != "ARTEX" || got["name_only_effective"] != false {
			t.Fatalf("%s: listed pin = %v", tc.base, got)
		}
		revoke := fmt.Sprintf("%s/target-pins/%d/revoke", tc.base, tc.id)
		code, body := g.do(t, "POST", revoke, "")
		if code != 200 || body["status"] != "revoked" || body["revoked_reason"] != "operator" {
			t.Fatalf("POST %s: %d %v", revoke, code, body)
		}
		at := body["revoked_at"]
		// Revoking again changes nothing.
		if code, body := g.do(t, "POST", revoke, ""); code != 200 || body["status"] != "revoked" || body["revoked_at"] != at {
			t.Fatalf("second POST %s: %d %v", revoke, code, body)
		}
		if pins := listed(tc.base + "/target-pins"); len(pins) != 1 || pins[0].(map[string]any)["status"] != "revoked" {
			t.Fatalf("%s after the revoke: %v, want the pin kept as revoked", tc.base, pins)
		}
		// A pin of another scope is not reachable through this one.
		if code, _ := g.do(t, "POST", fmt.Sprintf("%s/target-pins/%d/revoke", tc.base, otherPin), ""); code != 404 {
			t.Fatalf("revoke of a foreign pin through %s: %d, want 404", tc.base, code)
		}
	}
	if active, err := pg.ActiveTargetPins(taskRef(t, other), "app.example.com", 443); err != nil || len(active) != 1 {
		t.Fatalf("the pin of the other task = %+v, %v; want still active", active, err)
	}
	for _, path := range []string{"/api/tasks/999999999/target-pins", "/api/conversations/999999999/target-pins"} {
		if code, _ := g.do(t, "GET", path, ""); code != 404 {
			t.Fatalf("GET %s: %d, want 404", path, code)
		}
	}
	if code, _ := g.do(t, "POST", "/api/tasks/"+task.ID+"/target-pins/notanumber/revoke", ""); code != 400 {
		t.Fatalf("revoke with a bad pin id: %d, want 400", code)
	}
}

// A worker that loses its claim while it waits in the gate stops waiting, and
// the request stays open: it is host-level, not owned by the call. The worker
// that took the intent over attaches to the same request.
func TestClaimLostEndsGateWait(t *testing.T) {
	g := newGateServer(t)
	task := g.newTask(t, db.TaskCreateOptions{})
	pg, ic := g.m.pg, g.m.interceptor
	store := task.Store
	intent, err := store.AddIntent(map[string]any{"summary": "leased"}, 1, nil, "planner")
	if err != nil {
		t.Fatal(err)
	}
	token, err := store.ClaimIntentToken(intent, "work#1")
	if err != nil || token == "" {
		t.Fatalf("claim: token=%q err=%v", token, err)
	}
	ctx, cancel := context.WithCancelCause(intercept.WithTaskContext(context.Background(), task.ID, "work#1", nil))
	defer cancel(nil)
	stop := startClaimHeartbeat(store, 20*time.Millisecond, "work#1", intent, token, cancel)
	defer stop()

	scope := task.targetScope(time.Minute)
	targets := []intercept.TargetRequest{{Host: "app.example.com", Port: 443, ResolvedIPs: []string{"203.0.113.7"}, Resolver: "system", ResolvedAt: time.Now().UTC(), Reason: "no_pin"}}
	input := []byte(`{"url":"https://app.example.com/"}`)
	stale := make(chan intercept.TargetResult, 1)
	go func() { stale <- ic.RequestTargets(ctx, scope, "WebFetch", input, targets, nil) }()
	openRows := func() []int64 {
		t.Helper()
		rows, err := pg.Query(`SELECT id FROM intercept_pending WHERE task_id=$1 AND status='pending' AND target_key IS NOT NULL ORDER BY id`, task.ID)
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
	waitUntil(t, "the gate request", func() bool { return len(openRows()) == 1 })
	request := openRows()[0]
	select {
	case res := <-stale:
		t.Fatalf("the call returned %+v while its claim was live", res)
	case <-time.After(200 * time.Millisecond):
	}

	// Takeover, as in TestClaimHeartbeatRenewsThenCancelsOnTakeover.
	var reclaimed int64
	for attempt := 0; attempt < 200 && reclaimed == 0; attempt++ {
		if _, err := pg.Exec(`UPDATE exploration_nodes SET last_heartbeat_at = now() - $2 * INTERVAL '1 second' WHERE id=$1`,
			intent, (db.IntentClaimTTL + time.Second).Seconds()); err != nil {
			t.Fatal(err)
		}
		if reclaimed, err = store.ResetRunningIntents(); err != nil {
			t.Fatal(err)
		}
	}
	if reclaimed != 1 {
		t.Fatalf("could not take the claim over: reclaimed=%d", reclaimed)
	}
	if other, err := store.ClaimIntentToken(intent, "work#2"); err != nil || other == "" {
		t.Fatalf("re-claim: token=%q err=%v", other, err)
	}

	var res intercept.TargetResult
	select {
	case res = <-stale:
	case <-time.After(10 * time.Second):
		t.Fatal("the gate wait did not end after the claim was lost")
	}
	if cause := context.Cause(ctx); !errors.Is(cause, agent.AbortWorkClaimLost) {
		t.Fatalf("cancel cause=%v, want AbortWorkClaimLost", cause)
	}
	if res.Code != intercept.TargetApprovalPending || res.PendingID != request {
		t.Fatalf("stale call: %+v, want %s on request %d", res, intercept.TargetApprovalPending, request)
	}
	if row, err := pg.GetInterceptPending(request); err != nil || row == nil || row.Status != "pending" || row.DecidedBy != "" {
		t.Fatalf("request after the claim was lost = %+v, %v; want still open", row, err)
	}

	// The second claimer re-runs the intent, hits the same host and attaches.
	next := make(chan intercept.TargetResult, 1)
	go func() {
		next <- ic.RequestTargets(intercept.WithTaskContext(context.Background(), task.ID, "work#2", nil), scope, "WebFetch", input, targets, nil)
	}()
	select {
	case res := <-next:
		t.Fatalf("the second claimer returned %+v before a decision", res)
	case <-time.After(200 * time.Millisecond):
	}
	if ids := openRows(); !slices.Equal(ids, []int64{request}) {
		t.Fatalf("open requests = %v, want the second claimer on the same request %d", ids, request)
	}
	if err := ic.Decide(request, true, "ARTEX", "192.0.2.1"); err != nil {
		t.Fatal(err)
	}
	select {
	case res := <-next:
		if res.Code != "" {
			t.Fatalf("second claimer after the approval: %+v", res)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("the second claimer is still waiting after the approval")
	}
	if pins, err := pg.ListTargetPins(taskRef(t, task)); err != nil || len(pins) != 1 {
		t.Fatalf("pins = %+v, %v; want one", pins, err)
	}
}
