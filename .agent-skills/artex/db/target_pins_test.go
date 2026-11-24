package db

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
)

func openTargetDB(t *testing.T) *DB {
	t.Helper()
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { d.Close() })
	return d
}

// targetTask creates a task and removes it, its pins and its approval rows at
// the end of the test (pins and approval rows outlive a task delete by design).
func targetTask(t *testing.T, d *DB, opts TaskCreateOptions) *Task {
	t.Helper()
	task, err := d.CreateTaskWithOptions("target gate store", "pins and requests", opts)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = d.DeleteTask(task.ID)
		_, _ = d.Exec(`DELETE FROM target_pins WHERE task_id=$1`, task.ID)
		_, _ = d.Exec(`DELETE FROM intercept_pending WHERE task_id=$1`, strconv.FormatInt(task.ID, 10))
	})
	return task
}

func targetConversation(t *testing.T, d *DB) *Conversation {
	t.Helper()
	c, err := d.CreateConversation("assistant", fmt.Sprintf("target gate %d", time.Now().UnixNano()), nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = d.DeleteConversation(c.ID)
		_, _ = d.Exec(`DELETE FROM target_pins WHERE conversation_id=$1`, c.ID)
	})
	return c
}

// openTargetRequest opens the request for (scope, host, port) showing ips.
func openTargetRequest(t *testing.T, d *DB, scope TargetScopeRef, host string, port int, ips ...string) (int64, bool) {
	t.Helper()
	id, created, err := d.FindOrCreateTargetRequest(TargetRequest{
		Scope: scope, Host: host, Port: port, AgentName: "worker", ToolName: "WebFetch",
		ToolInput: []byte(`{"url":"https://` + host + `/"}`), Reason: "target " + host + " is not approved",
		Audit: &InterceptAudit{
			Correlation: "unavailable", InitialAction: "ask", ExecutionStatus: "not_started",
			Targets: []InterceptTarget{{Host: host, Port: port, Kind: "domain", ResolvedIPs: ips, Resolver: "system",
				ResolvedAt: time.Now().UTC(), Reason: "no_pin", Outcome: "requested"}},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	return id, created
}

// approveTarget opens a request for the key and approves it.
func approveTarget(t *testing.T, d *DB, scope TargetScopeRef, host string, port int, ips ...string) *TargetPin {
	t.Helper()
	id, created := openTargetRequest(t, d, scope, host, port, ips...)
	if !created {
		t.Fatalf("a request for %s:%d was already open", host, port)
	}
	pin, ok, err := d.ResolveTargetRequest(id, true, "ARTEX", "198.51.100.9")
	if err != nil || !ok || pin == nil {
		t.Fatalf("approve %s:%d: pin=%+v ok=%v err=%v", host, port, pin, ok, err)
	}
	return pin
}

func pendingTargetRows(t *testing.T, d *DB, scope TargetScopeRef) int {
	t.Helper()
	var n int
	task := ""
	if scope.TaskID > 0 {
		task = strconv.FormatInt(scope.TaskID, 10)
	}
	if err := d.QueryRow(`SELECT count(*) FROM intercept_pending
WHERE COALESCE(task_id,'')=$1 AND COALESCE(conversation_id,0)=$2 AND status='pending' AND target_key IS NOT NULL`,
		task, scope.ConversationID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

// The whole schema is applied on every start. Applying it again must change
// nothing, add no CHECK to the gate's tables, and leave the cascade of
// intercept_pending.conversation_id as it is.
func TestTargetGateSchemaIdempotent(t *testing.T) {
	snapshot := func() string {
		t.Helper()
		d := openTargetDB(t)
		var b strings.Builder
		for _, q := range []string{
			`SELECT table_name||'.'||column_name||' '||data_type||' null='||is_nullable||' default='||COALESCE(column_default,'')
FROM information_schema.columns
WHERE table_schema=current_schema() AND (table_name IN ('target_pins','target_gate_exemption_log')
   OR (table_name IN ('tasks','conversations') AND column_name='target_gate')
   OR (table_name='intercept_pending' AND column_name='target_key'))
ORDER BY table_name, ordinal_position`,
			`SELECT indexdef FROM pg_indexes WHERE schemaname=current_schema()
AND (tablename IN ('target_pins','target_gate_exemption_log') OR indexname='uq_intercept_pending_target') ORDER BY indexname`,
			`SELECT conrelid::regclass::text||' '||conname||' '||contype::text||' '||confdeltype::text FROM pg_constraint
WHERE conrelid IN ('target_pins'::regclass,'target_gate_exemption_log'::regclass,'intercept_pending'::regclass)
AND contype IN ('c','f','p','u') ORDER BY 1`,
		} {
			rows, err := d.Query(q)
			if err != nil {
				t.Fatal(err)
			}
			for rows.Next() {
				var line string
				if err := rows.Scan(&line); err != nil {
					t.Fatal(err)
				}
				b.WriteString(line + "\n")
			}
			if err := rows.Err(); err != nil {
				t.Fatal(err)
			}
			rows.Close()
		}
		return b.String()
	}
	first := snapshot()  // Open applied the schema
	second := snapshot() // and applied it again
	if first != second {
		t.Fatalf("schema changed on the second application:\n--- first\n%s--- second\n%s", first, second)
	}
	for _, want := range []string{
		"tasks.target_gate boolean null=NO default=false",
		"conversations.target_gate boolean null=NO default=false",
		"intercept_pending.target_key text null=YES default=",
		"target_pins.name_only_effective boolean null=NO default=false",
		"target_gate_exemption_log.digest text",
		"uq_intercept_pending_target",
		"uq_target_pins_active",
		"idx_target_pins_scope",
		// The cascade stays: no constraint migration.
		"intercept_pending intercept_pending_conversation_id_fkey f c",
	} {
		if !strings.Contains(first, want) {
			t.Errorf("schema snapshot lacks %q:\n%s", want, first)
		}
	}
	// Only primary keys on the new tables: no CHECK, no foreign key.
	for _, line := range strings.Split(first, "\n") {
		if (strings.HasPrefix(line, "target_pins ") || strings.HasPrefix(line, "target_gate_exemption_log ")) && !strings.Contains(line, "_pkey p ") {
			t.Errorf("unexpected constraint on a target-gate table: %s", line)
		}
	}
}

// Many callers, two instances, one key: exactly one open row, and every caller
// gets its id. This is what proves that ON CONFLICT infers the partial
// expression index.
func TestTargetRequestFindOrCreateIsIdempotent(t *testing.T) {
	a, b := openTargetDB(t), openTargetDB(t)
	scope := TargetScopeRef{TaskID: targetTask(t, a, TaskCreateOptions{}).ID}
	const callers = 24
	ids := make([]int64, callers)
	made := make([]bool, callers)
	var wg sync.WaitGroup
	for n := range callers {
		inst := a
		if n%2 == 1 {
			inst = b
		}
		wg.Go(func() {
			id, created, err := inst.FindOrCreateTargetRequest(TargetRequest{
				Scope: scope, Host: "app.example.com", Port: 443, ToolName: "WebFetch", Reason: "concurrent",
				Audit: &InterceptAudit{Targets: []InterceptTarget{{Host: "app.example.com", Port: 443, ResolvedIPs: []string{"203.0.113.7"}}}},
			})
			if err != nil {
				t.Error(err)
			}
			ids[n], made[n] = id, created
		})
	}
	wg.Wait()
	created := 0
	for n := range callers {
		if ids[n] == 0 || ids[n] != ids[0] {
			t.Fatalf("callers got different requests: %v", ids)
		}
		if made[n] {
			created++
		}
	}
	if created != 1 {
		t.Fatalf("%d callers created the row, want 1", created)
	}
	if n := pendingTargetRows(t, a, scope); n != 1 {
		t.Fatalf("%d open rows, want 1", n)
	}
	// Another port, another scope: other keys, other rows.
	if id, made := openTargetRequest(t, a, scope, "app.example.com", 80, "203.0.113.7"); !made || id == ids[0] {
		t.Fatalf("port 80 shared the row of port 443 (id=%d created=%v)", id, made)
	}
	conv := targetConversation(t, a)
	if id, made := openTargetRequest(t, a, TargetScopeRef{ConversationID: conv.ID}, "app.example.com", 443, "203.0.113.7"); !made || id == ids[0] {
		t.Fatalf("a conversation shared the row of a task (id=%d created=%v)", id, made)
	}
	var source string
	var key *string
	if err := a.QueryRow(`SELECT decision_source, target_key FROM intercept_pending WHERE id=$1`, ids[0]).Scan(&source, &key); err != nil {
		t.Fatal(err)
	}
	if source != "target" || key == nil || *key != "app.example.com:443" {
		t.Fatalf("row source=%q key=%v, want target and app.example.com:443", source, key)
	}
}

// A decided request does not block the key: the next call opens a new row.
// There is no sticky denial.
func TestTargetRequestNewRowAfterDecision(t *testing.T) {
	d := openTargetDB(t)
	scope := TargetScopeRef{TaskID: targetTask(t, d, TaskCreateOptions{}).ID}
	first, _ := openTargetRequest(t, d, scope, "app.example.com", 443, "203.0.113.7")
	if again, made := openTargetRequest(t, d, scope, "app.example.com", 443, "203.0.113.7"); made || again != first {
		t.Fatalf("second call got id=%d created=%v, want to attach to %d", again, made, first)
	}
	if pin, ok, err := d.ResolveTargetRequest(first, false, "ARTEX", "198.51.100.9"); err != nil || !ok || pin != nil {
		t.Fatalf("deny: pin=%+v ok=%v err=%v", pin, ok, err)
	}
	// A second decision on the same row is refused and changes nothing.
	if _, ok, err := d.ResolveTargetRequest(first, true, "ARTEX", "198.51.100.9"); err != nil || ok {
		t.Fatalf("second decision: ok=%v err=%v, want refused", ok, err)
	}
	if pins, err := d.ListTargetPins(scope); err != nil || len(pins) != 0 {
		t.Fatalf("a denied request left pins: %+v err=%v", pins, err)
	}
	second, made := openTargetRequest(t, d, scope, "app.example.com", 443, "203.0.113.7")
	if !made || second == first {
		t.Fatalf("after a denial: id=%d created=%v, want a new row", second, made)
	}
	if key, err := d.TargetRequestKey(second); err != nil || key != "app.example.com:443" {
		t.Fatalf("target key = %q, %v", key, err)
	}
	classic, err := d.CreateInterceptPending(0, 0, strconv.FormatInt(scope.TaskID, 10), "worker", "Bash", nil, "classic ask")
	if err != nil {
		t.Fatal(err)
	}
	if key, err := d.TargetRequestKey(classic); err != nil || key != "" {
		t.Fatalf("classic ask has target key %q, %v", key, err)
	}
	// A classic ask is not a target request: it cannot be resolved as one.
	if _, ok, err := d.ResolveTargetRequest(classic, true, "ARTEX", ""); err != nil || ok {
		t.Fatalf("classic ask resolved as a target request: ok=%v err=%v", ok, err)
	}
}

// Settling the row, superseding the old pin and writing the new one are one
// transaction: when the pin cannot be written the row stays pending and the
// previous pin stays active.
func TestResolveTargetRequestIsAtomic(t *testing.T) {
	d := openTargetDB(t)
	scope := TargetScopeRef{TaskID: targetTask(t, d, TaskCreateOptions{}).ID}
	const host = "pin-insert-fails.example.com"
	v1 := approveTarget(t, d, scope, host, 443, "203.0.113.7")

	if _, err := d.Exec(`CREATE OR REPLACE FUNCTION test_refuse_target_pin() RETURNS trigger AS $$
BEGIN
  IF NEW.host = '` + host + `' THEN RAISE EXCEPTION 'pin insert refused by the test'; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql`); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = d.Exec(`DROP TRIGGER IF EXISTS test_refuse_target_pin ON target_pins`)
		_, _ = d.Exec(`DROP FUNCTION IF EXISTS test_refuse_target_pin()`)
	})
	if _, err := d.Exec(`CREATE TRIGGER test_refuse_target_pin BEFORE INSERT ON target_pins
FOR EACH ROW EXECUTE FUNCTION test_refuse_target_pin()`); err != nil {
		t.Fatal(err)
	}

	id, _ := openTargetRequest(t, d, scope, host, 443, "203.0.113.99")
	if pin, ok, err := d.ResolveTargetRequest(id, true, "ARTEX", "198.51.100.9"); err == nil || ok || pin != nil {
		t.Fatalf("approval with a failing pin insert: pin=%+v ok=%v err=%v, want an error", pin, ok, err)
	}
	row, err := d.GetInterceptPending(id)
	if err != nil || row == nil || row.Status != "pending" || row.DecidedBy != "" {
		t.Fatalf("row after the failed approval = %+v, %v; want still pending", row, err)
	}
	active, err := d.ActiveTargetPins(scope, host, 443)
	if err != nil || len(active) != 1 || active[0].ID != v1.ID || active[0].Version != 1 {
		t.Fatalf("active pins after the failed approval = %+v, %v; want v1 untouched", active, err)
	}

	// Without the failure the same row is approved.
	if _, err := d.Exec(`DROP TRIGGER test_refuse_target_pin ON target_pins`); err != nil {
		t.Fatal(err)
	}
	if pin, ok, err := d.ResolveTargetRequest(id, true, "ARTEX", "198.51.100.9"); err != nil || !ok || pin == nil || pin.Version != 2 {
		t.Fatalf("approval after the failure was removed: pin=%+v ok=%v err=%v", pin, ok, err)
	}
}

// Approving a request for a pinned key extends the pin: the new version holds
// the old addresses plus the displayed ones. Addresses leave only by revocation.
func TestTargetPinVersioningExtends(t *testing.T) {
	d := openTargetDB(t)
	scope := TargetScopeRef{TaskID: targetTask(t, d, TaskCreateOptions{}).ID}
	v1 := approveTarget(t, d, scope, "app.example.com", 443, "203.0.113.7")
	if v1.Version != 1 || !slices.Equal(v1.PinnedIPs, []string{"203.0.113.7"}) || v1.Status != TargetPinActive ||
		v1.DecidedBy != "ARTEX" || v1.DecidedFrom != "198.51.100.9" || v1.Resolver != "system" || v1.InterceptID == nil ||
		v1.TaskID == nil || *v1.TaskID != scope.TaskID || v1.ConversationID != nil || v1.NameOnlyEffective {
		t.Fatalf("v1 = %+v", v1)
	}
	v2 := approveTarget(t, d, scope, "app.example.com", 443, "203.0.113.9", "203.0.113.7", "203.0.113.8")
	if v2.Version != 2 || !slices.Equal(v2.PinnedIPs, []string{"203.0.113.7", "203.0.113.8", "203.0.113.9"}) {
		t.Fatalf("v2 = %+v, want version 2 with the union, sorted", v2)
	}
	pins, err := d.ListTargetPins(scope)
	if err != nil || len(pins) != 2 || pins[0].ID != v2.ID || pins[0].Status != TargetPinActive ||
		pins[1].ID != v1.ID || pins[1].Status != TargetPinSuperseded {
		t.Fatalf("pins = %+v, %v; want v2 active then v1 superseded", pins, err)
	}
	// The request row records what was pinned and by whom; decided_by on the row
	// stays the actor class.
	detail, err := d.GetInterceptDetail(*v2.InterceptID)
	if err != nil || detail == nil || detail.Status != "allowed" || detail.DecidedBy != "human" || detail.DecisionSource != "target" ||
		detail.Audit == nil || detail.Audit.Approver != "ARTEX" || detail.Audit.ApproverAddr != "198.51.100.9" ||
		detail.Audit.EffectiveAction != "allow" || len(detail.Audit.Targets) != 1 {
		t.Fatalf("request row = %+v, %v", detail, err)
	}
	if got := detail.Audit.Targets[0]; got.Outcome != "pinned" || got.PinID != v2.ID || got.PinVersion != 2 || len(got.PinnedIPs) != 3 {
		t.Fatalf("recorded target = %+v", got)
	}
}

// One active pin per key is a database fact, across instances.
func TestTargetPinOneActivePerKey(t *testing.T) {
	a, b := openTargetDB(t), openTargetDB(t)
	scope := TargetScopeRef{TaskID: targetTask(t, a, TaskCreateOptions{}).ID}
	approveTarget(t, a, scope, "app.example.com", 443, "203.0.113.7")
	insert := func(port int, status string) error {
		_, err := b.Exec(`INSERT INTO target_pins(task_id, host, port, version, pinned_ips, status)
VALUES ($1, 'app.example.com', $2, 9, '{203.0.113.99}', $3)`, scope.TaskID, port, status)
		return err
	}
	var pgErr *pgconn.PgError
	if err := insert(443, "active"); !errors.As(err, &pgErr) || pgErr.Code != "23505" {
		t.Fatalf("second active pin on one key: %v, want a unique violation", err)
	}
	if err := insert(443, "superseded"); err != nil {
		t.Fatalf("a non-active pin on the same key must be allowed: %v", err)
	}
	if err := insert(8443, "active"); err != nil {
		t.Fatalf("an active pin on another port must be allowed: %v", err)
	}
	approveTarget(t, b, scope, "app.example.com", 443, "203.0.113.8")
	var active int
	if err := a.QueryRow(`SELECT count(*) FROM target_pins WHERE task_id=$1 AND host='app.example.com' AND port=443 AND status='active'`,
		scope.TaskID).Scan(&active); err != nil || active != 1 {
		t.Fatalf("%d active pins on the key after a second approval (%v), want 1", active, err)
	}
}

func TestTargetPinRevokeIdempotent(t *testing.T) {
	d := openTargetDB(t)
	scope := TargetScopeRef{TaskID: targetTask(t, d, TaskCreateOptions{}).ID}
	other := TargetScopeRef{TaskID: targetTask(t, d, TaskCreateOptions{}).ID}
	pin := approveTarget(t, d, scope, "app.example.com", 443, "203.0.113.7")

	// Another scope cannot see or revoke the pin.
	if got, err := d.RevokeTargetPin(other, pin.ID); err != nil || got != nil {
		t.Fatalf("revoke through another scope = %+v, %v; want nil", got, err)
	}
	if got, err := d.RevokeTargetPin(scope, pin.ID+1000000); err != nil || got != nil {
		t.Fatalf("revoke of an unknown pin = %+v, %v; want nil", got, err)
	}
	if active, err := d.ActiveTargetPins(scope, "app.example.com", 443); err != nil || len(active) != 1 {
		t.Fatalf("pin no longer active after foreign revokes: %+v, %v", active, err)
	}

	first, err := d.RevokeTargetPin(scope, pin.ID)
	if err != nil || first == nil || first.Status != TargetPinRevoked || first.RevokedReason != TargetPinRevokedByOperator || first.RevokedAt == nil {
		t.Fatalf("revoke = %+v, %v", first, err)
	}
	second, err := d.RevokeTargetPin(scope, pin.ID)
	if err != nil || second == nil || second.Status != TargetPinRevoked || !second.RevokedAt.Equal(*first.RevokedAt) {
		t.Fatalf("second revoke = %+v, %v; want the first revocation unchanged", second, err)
	}
	if active, err := d.ActiveTargetPins(scope, "app.example.com", 443); err != nil || len(active) != 0 {
		t.Fatalf("a revoked pin still matches: %+v, %v", active, err)
	}
	// A new approval starts from the displayed addresses only, under a new version.
	again := approveTarget(t, d, scope, "app.example.com", 443, "203.0.113.50")
	if again.Version != 2 || !slices.Equal(again.PinnedIPs, []string{"203.0.113.50"}) {
		t.Fatalf("pin after a revocation = %+v, want version 2 holding only the new address", again)
	}
}

// A pin on port 0 (port not declared) covers every port of the host. A pin on
// a specific port covers that port only, and never a target whose port is not
// declared.
func TestActiveTargetPinPortPrecedence(t *testing.T) {
	d := openTargetDB(t)
	scope := TargetScopeRef{TaskID: targetTask(t, d, TaskCreateOptions{}).ID}
	anyPort := approveTarget(t, d, scope, "both.example.com", 0, "203.0.113.1")
	exact := approveTarget(t, d, scope, "both.example.com", 443, "203.0.113.2")
	only443 := approveTarget(t, d, scope, "exact.example.com", 443, "203.0.113.3")

	for _, tc := range []struct {
		host string
		port int
		want []int64
	}{
		{"both.example.com", 443, []int64{exact.ID, anyPort.ID}}, // the exact port first
		{"both.example.com", 80, []int64{anyPort.ID}},
		{"both.example.com", 8443, []int64{anyPort.ID}},
		{"both.example.com", 0, []int64{anyPort.ID}}, // never the pin on 443
		{"exact.example.com", 443, []int64{only443.ID}},
		{"exact.example.com", 80, nil},
		{"exact.example.com", 0, nil}, // a specific port never covers "not declared"
		{"unknown.example.com", 443, nil},
	} {
		pins, err := d.ActiveTargetPins(scope, tc.host, tc.port)
		if err != nil {
			t.Fatal(err)
		}
		var got []int64
		for _, p := range pins {
			got = append(got, p.ID)
		}
		if !slices.Equal(got, tc.want) {
			t.Errorf("candidates for %s:%d = %v, want %v", tc.host, tc.port, got, tc.want)
		}
	}
	// The address sets stay apart: each candidate holds its own.
	pins, _ := d.ActiveTargetPins(scope, "both.example.com", 443)
	if len(pins) != 2 || !slices.Equal(pins[0].PinnedIPs, []string{"203.0.113.2"}) || !slices.Equal(pins[1].PinnedIPs, []string{"203.0.113.1"}) {
		t.Fatalf("candidates = %+v, want two pins with separate addresses", pins)
	}
}

// A hard delete keeps the gate's history: pins revoked, approval rows readable,
// no target request left open.
func TestTaskDeleteKeepsPinsAndApprovalRows(t *testing.T) {
	d := openTargetDB(t)
	task := targetTask(t, d, TaskCreateOptions{})
	other := targetTask(t, d, TaskCreateOptions{})
	scope := TargetScopeRef{TaskID: task.ID}
	pin := approveTarget(t, d, scope, "app.example.com", 443, "203.0.113.7")
	kept := approveTarget(t, d, TargetScopeRef{TaskID: other.ID}, "app.example.com", 443, "203.0.113.7")
	open, _ := openTargetRequest(t, d, scope, "new.example.com", 443, "203.0.113.20")
	classic, err := d.CreateInterceptPending(0, 0, strconv.FormatInt(task.ID, 10), "worker", "Bash", nil, "classic ask")
	if err != nil {
		t.Fatal(err)
	}

	if err := d.DeleteTask(task.ID); err != nil {
		t.Fatal(err)
	}
	pins, err := d.ListTargetPins(scope)
	if err != nil || len(pins) != 1 || pins[0].ID != pin.ID || pins[0].Status != TargetPinRevoked ||
		pins[0].RevokedReason != TargetPinRevokedTaskDeleted || pins[0].RevokedAt == nil ||
		!slices.Equal(pins[0].PinnedIPs, []string{"203.0.113.7"}) || pins[0].DecidedBy != "ARTEX" {
		t.Fatalf("pins of the deleted task = %+v, %v; want one revoked pin, still readable", pins, err)
	}
	if active, err := d.ActiveTargetPins(scope, "app.example.com", 443); err != nil || len(active) != 0 {
		t.Fatalf("a pin of the deleted task still matches: %+v, %v", active, err)
	}
	if active, err := d.ActiveTargetPins(TargetScopeRef{TaskID: other.ID}, "app.example.com", 443); err != nil || len(active) != 1 || active[0].ID != kept.ID {
		t.Fatalf("the pin of another task was touched: %+v, %v", active, err)
	}
	approved, err := d.GetInterceptDetail(*pin.InterceptID)
	if err != nil || approved == nil || approved.Status != "allowed" || approved.Audit == nil || approved.Audit.Approver != "ARTEX" {
		t.Fatalf("approval row of the deleted task = %+v, %v; want still readable", approved, err)
	}
	settled, err := d.GetInterceptDetail(open)
	if err != nil || settled == nil || settled.Status != "denied" || settled.DecidedBy != "system" ||
		settled.Audit == nil || settled.Audit.EffectiveAction != "deny" || settled.Audit.DecisionReason != "task deleted" {
		t.Fatalf("open target request after the delete = %+v, %v; want denied by the system", settled, err)
	}
	if n := pendingTargetRows(t, d, scope); n != 0 {
		t.Fatalf("%d target requests still open after the delete", n)
	}
	// Classic asks are not the gate's: untouched, as before.
	if row, err := d.GetInterceptPending(classic); err != nil || row == nil || row.Status != "pending" {
		t.Fatalf("classic ask after the delete = %+v, %v; want untouched", row, err)
	}
}

// archiveTargetTask moves a task into the cold archive and returns the archive
// id and its snapshot.
func archiveTargetTask(t *testing.T, d *DB, taskID int64) (int64, *TaskArchiveSnapshot, *bytes.Buffer) {
	t.Helper()
	if err := d.EnsureLLMRecordsTable(); err != nil {
		t.Fatal(err)
	}
	if err := d.EnsureLLMUsageTable(); err != nil {
		t.Fatal(err)
	}
	if err := d.SetPaused(taskID, true); err != nil {
		t.Fatal(err)
	}
	archive, err := d.QueueTaskArchive(taskID)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = d.Exec(`DELETE FROM task_archives WHERE id=$1`, archive.ID) })
	if claimed, err := d.ClaimTaskArchiveJob(t.Context()); err != nil || claimed == nil || claimed.ID != archive.ID {
		t.Fatalf("archive claim = %+v, %v", claimed, err)
	}
	var llmRecords bytes.Buffer
	snapshot, err := d.SnapshotTaskArchiveWithLLMRecords(taskID, &llmRecords)
	if err != nil {
		t.Fatal(err)
	}
	if err := d.CompleteTaskArchive(archive.ID, snapshot, "/tmp/target-gate-task.tar.zst", "abc", 100, 50); err != nil {
		t.Fatal(err)
	}
	return archive.ID, snapshot, &llmRecords
}

func TestArchiveStubDeleteRevokesPins(t *testing.T) {
	d := openTargetDB(t)
	task := targetTask(t, d, TaskCreateOptions{})
	scope := TargetScopeRef{TaskID: task.ID}
	pin := approveTarget(t, d, scope, "app.example.com", 443, "203.0.113.7")
	archiveID, _, _ := archiveTargetTask(t, d, task.ID)
	if active, err := d.ActiveTargetPins(scope, "app.example.com", 443); err != nil || len(active) != 1 {
		t.Fatalf("pin while the task is an archived stub = %+v, %v; want still active", active, err)
	}
	if _, err := d.QueueTaskArchiveDelete(archiveID); err != nil {
		t.Fatal(err)
	}
	if claimed, err := d.ClaimTaskArchiveJob(t.Context()); err != nil || claimed == nil || claimed.State != Deleting {
		t.Fatalf("delete claim = %+v, %v", claimed, err)
	}
	if err := d.DeleteTaskArchiveStub(archiveID); err != nil {
		t.Fatal(err)
	}
	pins, err := d.ListTargetPins(scope)
	if err != nil || len(pins) != 1 || pins[0].ID != pin.ID || pins[0].Status != TargetPinRevoked || pins[0].RevokedReason != TargetPinRevokedTaskDeleted {
		t.Fatalf("pins after the stub delete = %+v, %v; want one pin revoked as task_deleted", pins, err)
	}
}

// The archive carries neither pins nor the flag: both stay in the live tables
// while the task is a stub and are there after the restore.
func TestArchiveRestoreKeepsPinsAndFlag(t *testing.T) {
	d := openTargetDB(t)
	on := true
	task := targetTask(t, d, TaskCreateOptions{TargetGate: &on})
	scope := TargetScopeRef{TaskID: task.ID}
	pin := approveTarget(t, d, scope, "app.example.com", 443, "203.0.113.7")
	open, _ := openTargetRequest(t, d, scope, "new.example.com", 443, "203.0.113.20")
	archiveID, snapshot, llmRecords := archiveTargetTask(t, d, task.ID)

	var flag bool
	if err := d.QueryRow(`SELECT target_gate FROM tasks WHERE id=$1`, task.ID).Scan(&flag); err != nil || !flag {
		t.Fatalf("flag of the archived stub = %v, %v; want kept", flag, err)
	}
	if _, err := d.QueueTaskArchiveRestore(archiveID); err != nil {
		t.Fatal(err)
	}
	if claimed, err := d.ClaimTaskArchiveJob(t.Context()); err != nil || claimed == nil || claimed.State != Restoring {
		t.Fatalf("restore claim = %+v, %v", claimed, err)
	}
	if _, err := d.RestoreTaskArchiveWithLLMRecords(archiveID, snapshot, 0, bytes.NewReader(llmRecords.Bytes())); err != nil {
		t.Fatal(err)
	}
	if err := d.CompleteTaskArchiveRestore(archiveID); err != nil {
		t.Fatal(err)
	}
	live, err := d.GetTask(task.ID)
	if err != nil || live == nil || !live.TargetGate {
		t.Fatalf("restored task = %+v, %v; want the gate still on", live, err)
	}
	active, err := d.ActiveTargetPins(scope, "app.example.com", 443)
	if err != nil || len(active) != 1 || active[0].ID != pin.ID {
		t.Fatalf("pins after the restore = %+v, %v; want the pin still active", active, err)
	}
	// The request that was open at archive time comes back closed (a timeout,
	// never an approval) with its key, and the key is free again.
	row, err := d.GetInterceptPending(open)
	if err != nil || row == nil || row.Status != "timeout" || row.DecidedBy != "system" {
		t.Fatalf("restored open request = %+v, %v; want a system timeout", row, err)
	}
	if key, err := d.TargetRequestKey(open); err != nil || key != "new.example.com:443" {
		t.Fatalf("restored target key = %q, %v", key, err)
	}
	if id, made := openTargetRequest(t, d, scope, "new.example.com", 443, "203.0.113.20"); !made || id == open {
		t.Fatalf("request after the restore: id=%d created=%v, want a new row", id, made)
	}
}

// Archives written before the gate have no target_key: the row restores with
// NULL, a classic ask.
func TestRestoreInterceptRowsWithoutTargetKey(t *testing.T) {
	d := openTargetDB(t)
	task := targetTask(t, d, TaskCreateOptions{})
	id, err := d.CreateDecidedIntercept(0, 0, strconv.FormatInt(task.ID, 10), "worker", "Bash", nil, "allowed", "[model] allow",
		&InterceptAudit{InitialAction: "allow", ExecutionStatus: "succeeded"})
	if err != nil {
		t.Fatal(err)
	}
	var raw []byte
	if err := d.QueryRow(`SELECT row_to_json(ip) FROM intercept_pending ip WHERE id=$1`, id).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	var row map[string]any
	if err := json.Unmarshal(raw, &row); err != nil {
		t.Fatal(err)
	}
	if _, ok := row["target_key"]; !ok {
		t.Fatal("control: the live row was expected to carry the target_key column")
	}
	delete(row, "target_key")
	archived, _ := json.Marshal([]map[string]any{row})
	tx, err := d.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM intercept_pending WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}
	if err := restoreInterceptRows(tx, archived); err != nil {
		t.Fatal(err)
	}
	var key *string
	var status string
	if err := tx.QueryRow(`SELECT target_key, status FROM intercept_pending WHERE id=$1`, id).Scan(&key, &status); err != nil {
		t.Fatal(err)
	}
	if key != nil || status != "allowed" {
		t.Fatalf("restored row target_key=%v status=%s, want NULL and allowed", key, status)
	}
}

// Deleting a conversation revokes its pins in the same transaction. The pins
// stay readable; the request rows go with the conversation (cascade). A delete
// that fails leaves the pins active.
func TestConversationDeleteRevokesPinsInSameTx(t *testing.T) {
	d := openTargetDB(t)
	conv, other := targetConversation(t, d), targetConversation(t, d)
	scope := TargetScopeRef{ConversationID: conv.ID}
	pin := approveTarget(t, d, scope, "app.example.com", 443, "203.0.113.7")
	kept := approveTarget(t, d, TargetScopeRef{ConversationID: other.ID}, "app.example.com", 443, "203.0.113.7")
	openTargetRequest(t, d, scope, "new.example.com", 443, "203.0.113.20")
	if pin.ConversationID == nil || *pin.ConversationID != conv.ID || pin.TaskID != nil {
		t.Fatalf("conversation pin = %+v", pin)
	}

	// A reference without a delete rule makes the delete fail after the revoke
	// statement has run inside the transaction.
	if _, err := d.Exec(`CREATE TABLE IF NOT EXISTS test_conversation_delete_block (conversation_id BIGINT REFERENCES conversations(id))`); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = d.Exec(`DROP TABLE IF EXISTS test_conversation_delete_block`) })
	if _, err := d.Exec(`INSERT INTO test_conversation_delete_block VALUES ($1)`, conv.ID); err != nil {
		t.Fatal(err)
	}
	if err := d.DeleteConversation(conv.ID); err == nil {
		t.Fatal("control: the delete was expected to fail on the blocking reference")
	}
	if active, err := d.ActiveTargetPins(scope, "app.example.com", 443); err != nil || len(active) != 1 || active[0].ID != pin.ID {
		t.Fatalf("pins after a failed delete = %+v, %v; want the pin still active", active, err)
	}
	if got, err := d.GetConversation(conv.ID); err != nil || got == nil {
		t.Fatalf("conversation after a failed delete = %+v, %v", got, err)
	}

	if _, err := d.Exec(`DELETE FROM test_conversation_delete_block`); err != nil {
		t.Fatal(err)
	}
	if err := d.DeleteConversation(conv.ID); err != nil {
		t.Fatal(err)
	}
	pins, err := d.ListTargetPins(scope)
	if err != nil || len(pins) != 1 || pins[0].ID != pin.ID || pins[0].Status != TargetPinRevoked ||
		pins[0].RevokedReason != TargetPinRevokedConversationDelete || pins[0].RevokedAt == nil ||
		!slices.Equal(pins[0].PinnedIPs, []string{"203.0.113.7"}) || pins[0].DecidedBy != "ARTEX" || pins[0].InterceptID == nil {
		t.Fatalf("pins of the deleted conversation = %+v, %v; want one revoked pin, still readable", pins, err)
	}
	var rows int
	if err := d.QueryRow(`SELECT count(*) FROM intercept_pending WHERE conversation_id=$1`, conv.ID).Scan(&rows); err != nil || rows != 0 {
		t.Fatalf("%d request rows left after the delete (%v), want 0: the cascade stays", rows, err)
	}
	// The pin names a request row that is gone; it is kept as a plain number.
	if gone, err := d.GetInterceptPending(*pins[0].InterceptID); err != nil || gone != nil {
		t.Fatalf("request row of the pin = %+v, %v; want gone", gone, err)
	}
	if active, err := d.ActiveTargetPins(TargetScopeRef{ConversationID: other.ID}, "app.example.com", 443); err != nil || len(active) != 1 || active[0].ID != kept.ID {
		t.Fatalf("the pin of another conversation was touched: %+v, %v", active, err)
	}
}

// The batch delete revokes the pins of the ids it actually removed, and only
// those.
func TestConversationBatchDeleteRevokesOnlyDeletedIds(t *testing.T) {
	d := openTargetDB(t)
	gone, stays := targetConversation(t, d), targetConversation(t, d)
	approveTarget(t, d, TargetScopeRef{ConversationID: gone.ID}, "app.example.com", 443, "203.0.113.7")
	approveTarget(t, d, TargetScopeRef{ConversationID: stays.ID}, "app.example.com", 443, "203.0.113.7")
	// A pin whose conversation id is in the request but does not exist: the
	// delete removes nothing for it, so the pin must not be revoked.
	const unknown = int64(1) << 60
	if _, err := d.Exec(`INSERT INTO target_pins(conversation_id, host, port, pinned_ips) VALUES ($1, 'app.example.com', 443, '{203.0.113.7}')`, unknown); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = d.Exec(`DELETE FROM target_pins WHERE conversation_id=$1`, unknown) })

	deleted, err := d.DeleteConversations([]int64{gone.ID, unknown})
	if err != nil || !slices.Equal(deleted, []int64{gone.ID}) {
		t.Fatalf("deleted = %v, %v; want only %d", deleted, err, gone.ID)
	}
	status := func(convID int64) (string, string) {
		t.Helper()
		pins, err := d.ListTargetPins(TargetScopeRef{ConversationID: convID})
		if err != nil || len(pins) != 1 {
			t.Fatalf("pins of conversation %d = %+v, %v", convID, pins, err)
		}
		return pins[0].Status, pins[0].RevokedReason
	}
	if s, reason := status(gone.ID); s != TargetPinRevoked || reason != TargetPinRevokedConversationDelete {
		t.Fatalf("pin of the deleted conversation: %s/%s, want revoked/conversation_deleted", s, reason)
	}
	if s, _ := status(stays.ID); s != TargetPinActive {
		t.Fatalf("pin of a conversation that was not in the request: %s, want active", s)
	}
	if s, _ := status(unknown); s != TargetPinActive {
		t.Fatalf("pin of an id the delete did not remove: %s, want active", s)
	}
}

func TestTaskTargetGateDefaultsOff(t *testing.T) {
	d := openTargetDB(t)
	task := targetTask(t, d, TaskCreateOptions{})
	if task.TargetGate {
		t.Fatal("a task created without the option has the gate on")
	}
	got, err := d.GetTask(task.ID)
	if err != nil || got == nil || got.TargetGate {
		t.Fatalf("stored task = %+v, %v; want the gate off", got, err)
	}
	off := false
	if explicit := targetTask(t, d, TaskCreateOptions{TargetGate: &off}); explicit.TargetGate {
		t.Fatal("a task created with the option false has the gate on")
	}
	c := targetConversation(t, d)
	if c.TargetGate {
		t.Fatal("a conversation created without the flag has the gate on")
	}
}

func TestTaskTargetGatePatchRoundTrip(t *testing.T) {
	d := openTargetDB(t)
	on, off := true, false
	task := targetTask(t, d, TaskCreateOptions{TargetGate: &on})
	if !task.TargetGate {
		t.Fatal("create with the option true returned the gate off")
	}
	if got, err := d.GetTask(task.ID); err != nil || got == nil || !got.TargetGate {
		t.Fatalf("stored task = %+v, %v; want the gate on", got, err)
	}
	// A patch of another field leaves the flag alone.
	name := "renamed"
	if got, err := d.UpdateTask(task.ID, TaskPatch{Name: &name}); err != nil || got == nil || !got.TargetGate || got.Name != name {
		t.Fatalf("after a name patch = %+v, %v; want the gate still on", got, err)
	}
	if got, err := d.UpdateTask(task.ID, TaskPatch{TargetGate: &off}); err != nil || got == nil || got.TargetGate || got.Name != name {
		t.Fatalf("after switching off = %+v, %v", got, err)
	}
	if got, err := d.UpdateTask(task.ID, TaskPatch{TargetGate: &on}); err != nil || got == nil || !got.TargetGate {
		t.Fatalf("after switching on = %+v, %v", got, err)
	}
	listed, err := d.ListTasks()
	if err != nil {
		t.Fatal(err)
	}
	for _, l := range listed {
		if l.ID == task.ID && !l.TargetGate {
			t.Fatal("the task list reports the gate off")
		}
	}
}

func TestConversationTargetGateRoundTrip(t *testing.T) {
	d := openTargetDB(t)
	c, err := d.CreateConversationGated("assistant", fmt.Sprintf("gated %d", time.Now().UnixNano()), nil, true)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.DeleteConversation(c.ID) })
	if !c.TargetGate {
		t.Fatal("create with the flag returned the gate off")
	}
	if got, err := d.GetConversation(c.ID); err != nil || got == nil || !got.TargetGate {
		t.Fatalf("stored conversation = %+v, %v; want the gate on", got, err)
	}
	title, on, off := "renamed", true, false
	if got, err := d.UpdateConversation(c.ID, ConversationPatch{Title: &title}); err != nil || got == nil || !got.TargetGate || got.Title != title {
		t.Fatalf("after a title patch = %+v, %v; want the gate still on", got, err)
	}
	if got, err := d.UpdateConversation(c.ID, ConversationPatch{TargetGate: &off}); err != nil || got == nil || got.TargetGate || got.Title != title {
		t.Fatalf("after switching off = %+v, %v", got, err)
	}
	if got, err := d.UpdateConversation(c.ID, ConversationPatch{TargetGate: &on}); err != nil || got == nil || !got.TargetGate {
		t.Fatalf("after switching on = %+v, %v", got, err)
	}
	listed, err := d.ListConversations()
	if err != nil {
		t.Fatal(err)
	}
	for _, l := range listed {
		if l.ID == c.ID && !l.TargetGate {
			t.Fatal("the conversation list reports the gate off")
		}
	}
}

// A retest conversation takes the flag of the finding's task and none of its
// pins.
func TestRetestConversationCopiesFlagNotPins(t *testing.T) {
	d := openTargetDB(t)
	on := true
	for _, tc := range []struct {
		name string
		opts TaskCreateOptions
		want bool
	}{
		{"gate on", TaskCreateOptions{TargetGate: &on}, true},
		{"gate off", TaskCreateOptions{}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			task := targetTask(t, d, tc.opts)
			approveTarget(t, d, TargetScopeRef{TaskID: task.ID}, "app.example.com", 443, "203.0.113.7")
			fid, err := d.AddFinding(task.ID, 0, "retest-gate", "gated finding", "high", "summary", "evidence", "worker", nil)
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() {
				_, _ = d.Exec(`DELETE FROM conversations WHERE id IN (SELECT conversation_id FROM finding_retests WHERE finding_id=$1)`, fid)
				_, _ = d.DeleteFinding(fid)
			})
			_, conv, created, err := d.CreateFindingRetest(t.Context(), fid, "")
			if err != nil || !created || conv == nil {
				t.Fatalf("retest: conv=%+v created=%v err=%v", conv, created, err)
			}
			if conv.TargetGate != tc.want {
				t.Fatalf("retest conversation gate = %v, want %v", conv.TargetGate, tc.want)
			}
			if stored, err := d.GetConversation(conv.ID); err != nil || stored == nil || stored.TargetGate != tc.want {
				t.Fatalf("stored retest conversation = %+v, %v", stored, err)
			}
			if pins, err := d.ListTargetPins(TargetScopeRef{ConversationID: conv.ID}); err != nil || len(pins) != 0 {
				t.Fatalf("retest conversation inherited pins: %+v, %v", pins, err)
			}
		})
	}
	// A finding without a task: the gate is off.
	fid, err := d.AddFinding(0, 0, "retest-gate", "orphan finding", "high", "summary", "evidence", "worker", nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = d.Exec(`DELETE FROM conversations WHERE id IN (SELECT conversation_id FROM finding_retests WHERE finding_id=$1)`, fid)
		_, _ = d.DeleteFinding(fid)
	})
	if _, conv, _, err := d.CreateFindingRetest(t.Context(), fid, ""); err != nil || conv == nil || conv.TargetGate {
		t.Fatalf("retest of a finding without a task: conv=%+v err=%v; want the gate off", conv, err)
	}
}

// Every human decision records who took it and from where, classic asks
// included. decided_by keeps the actor class.
func TestResolveInterceptByRecordsApprover(t *testing.T) {
	d := openTargetDB(t)
	task := targetTask(t, d, TaskCreateOptions{})
	create := func() int64 {
		t.Helper()
		id, err := d.CreateInterceptPending(0, 0, strconv.FormatInt(task.ID, 10), "worker", "Bash", nil, "classic ask",
			&InterceptAudit{InitialAction: "ask", ExecutionStatus: "not_started", Correlation: "exact"})
		if err != nil {
			t.Fatal(err)
		}
		return id
	}
	id := create()
	if ok, err := d.ResolveInterceptBy(id, "allowed", "allow", "user approved execution", "human", "ARTEX", "198.51.100.9"); err != nil || !ok {
		t.Fatalf("resolve: ok=%v err=%v", ok, err)
	}
	got, err := d.GetInterceptDetail(id)
	if err != nil || got == nil || got.DecidedBy != "human" || got.Audit == nil || got.Audit.Approver != "ARTEX" ||
		got.Audit.ApproverAddr != "198.51.100.9" || got.Audit.EffectiveAction != "allow" || got.Audit.ExecutionStatus != "awaiting_result" {
		t.Fatalf("decided classic ask = %+v, %v", got, err)
	}
	// A system decision has no author.
	id = create()
	if ok, err := d.ResolveIntercept(id, "timeout", "deny", "approval timed out", "system"); err != nil || !ok {
		t.Fatalf("resolve: ok=%v err=%v", ok, err)
	}
	var raw []byte
	if err := d.QueryRow(`SELECT audit FROM intercept_pending WHERE id=$1`, id).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "approver") {
		t.Fatalf("a system decision recorded an approver: %s", raw)
	}
}

// An approval never pins zero addresses. A request that displays none cannot
// be approved, whether the key has a pin or not: the row stays pending, the
// pin of the key stays as it is, and the request can still be denied.
func TestTargetPinRefusesEmptyAddressList(t *testing.T) {
	d := openTargetDB(t)
	scope := TargetScopeRef{TaskID: targetTask(t, d, TaskCreateOptions{}).ID}
	const host = "no-address.example.com"

	for name, ips := range map[string][]string{"nil": nil, "empty": {}, "blank": {"", ""}} {
		id, created := openTargetRequest(t, d, scope, host, 443, ips...)
		if !created {
			t.Fatalf("%s: the request was not created", name)
		}
		pin, ok, err := d.ResolveTargetRequest(id, true, "ARTEX", "198.51.100.9")
		if !errors.Is(err, ErrTargetPinEmpty) || ok || pin != nil {
			t.Fatalf("%s: approval of an empty address list: pin=%+v ok=%v err=%v, want ErrTargetPinEmpty", name, pin, ok, err)
		}
		row, err := d.GetInterceptPending(id)
		if err != nil || row == nil || row.Status != "pending" {
			t.Fatalf("%s: row after the refused approval = %+v, %v; want still pending", name, row, err)
		}
		if pins, err := d.ListTargetPins(scope); err != nil || len(pins) != 0 {
			t.Fatalf("%s: pins after the refused approval = %+v, %v; want none", name, pins, err)
		}
		if _, ok, err := d.ResolveTargetRequest(id, false, "ARTEX", "198.51.100.9"); err != nil || !ok {
			t.Fatalf("%s: denying the request: ok=%v err=%v", name, ok, err)
		}
	}

	// The key has a pin with addresses: an empty request does not re-issue it.
	v1 := approveTarget(t, d, scope, host, 443, "203.0.113.7")
	id, _ := openTargetRequest(t, d, scope, host, 443)
	if pin, ok, err := d.ResolveTargetRequest(id, true, "ARTEX", "198.51.100.9"); !errors.Is(err, ErrTargetPinEmpty) || ok || pin != nil {
		t.Fatalf("empty request on a pinned key: pin=%+v ok=%v err=%v, want ErrTargetPinEmpty", pin, ok, err)
	}
	pins, err := d.ListTargetPins(scope)
	if err != nil || len(pins) != 1 || pins[0].ID != v1.ID || pins[0].Status != TargetPinActive || pins[0].Version != 1 {
		t.Fatalf("pins = %+v, %v; want v1 active and untouched", pins, err)
	}
	// Blank entries are dropped from a list that has addresses.
	if _, ok, err := d.ResolveTargetRequest(id, false, "ARTEX", "198.51.100.9"); err != nil || !ok {
		t.Fatal(ok, err)
	}
	v2 := approveTarget(t, d, scope, host, 443, "", "203.0.113.8")
	if v2.Version != 2 || !slices.Equal(v2.PinnedIPs, []string{"203.0.113.7", "203.0.113.8"}) {
		t.Fatalf("v2 = %+v, want both addresses and no blank entry", v2)
	}
}

// The exemption list is seeded once with the package sources of the runtime
// image, and belongs to the operator afterwards: a start never restores an
// entry they removed. Every change is appended to the log with its previous value.
func TestTargetGateExemptionSeedAndLog(t *testing.T) {
	d := openTargetDB(t)
	seeded := []TargetExemption{
		{Host: "pypi.org", Port: 443, Note: "[built-in] Python package index"},
		{Host: "files.pythonhosted.org", Port: 443, Note: "[built-in] Python package files"},
		{Host: "registry.npmjs.org", Port: 443, Note: "[built-in] npm registry"},
		{Host: "deb.debian.org", Port: 80, Note: "[built-in] Debian packages"},
		{Host: "deb.debian.org", Port: 443, Note: "[built-in] Debian packages"},
	}
	// Start from the state of a new database, and put the list back afterwards.
	original, _, err := d.TargetExemptions()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.ReplaceTargetExemptions(original, "test", "restore") })
	if _, err := d.Exec(`DELETE FROM settings WHERE key IN ($1, 'target_gate_exempt_seed_v1')`, SettingTargetExemptHosts); err != nil {
		t.Fatal(err)
	}
	if list, raw, err := d.TargetExemptions(); err != nil || list != nil || raw != "" {
		t.Fatalf("unset list = %+v, %q, %v", list, raw, err)
	}
	if err := d.seedTargetGateExemptions(); err != nil {
		t.Fatal(err)
	}
	list, raw, err := d.TargetExemptions()
	if err != nil || !slices.Equal(list, seeded) || raw == "" {
		t.Fatalf("seeded list = %+v, %v; want the package sources", list, err)
	}

	// The operator replaces the list; the next start does not seed again.
	changesBefore, err := d.ListTargetExemptionLog(1000)
	if err != nil {
		t.Fatal(err)
	}
	own := []TargetExemption{{Host: "mirror.example.org", Port: 443, Note: "internal mirror"}}
	if err := d.ReplaceTargetExemptions(own, "alice", "digest-1"); err != nil {
		t.Fatal(err)
	}
	if err := d.seedTargetGateExemptions(); err != nil {
		t.Fatal(err)
	}
	if list, _, err := d.TargetExemptions(); err != nil || !slices.Equal(list, own) {
		t.Fatalf("list after a second seed = %+v, %v; want the list of the operator", list, err)
	}
	// An emptied list stays empty, and is stored as [] rather than null.
	if err := d.ReplaceTargetExemptions(nil, "bob", "digest-2"); err != nil {
		t.Fatal(err)
	}
	if err := d.seedTargetGateExemptions(); err != nil {
		t.Fatal(err)
	}
	if list, raw, err := d.TargetExemptions(); err != nil || len(list) != 0 || raw != "[]" {
		t.Fatalf("emptied list = %+v, %q, %v", list, raw, err)
	}

	changes, err := d.ListTargetExemptionLog(1000)
	if err != nil || len(changes) != len(changesBefore)+2 {
		t.Fatalf("%d log rows added (err=%v), want 2", len(changes)-len(changesBefore), err)
	}
	decode := func(raw json.RawMessage) []TargetExemption {
		t.Helper()
		var out []TargetExemption
		if err := json.Unmarshal(raw, &out); err != nil {
			t.Fatalf("log value %q: %v", raw, err)
		}
		return out
	}
	second, first := changes[0], changes[1]
	if first.ChangedBy != "alice" || first.Digest != "digest-1" || !slices.Equal(decode(first.Before), seeded) || !slices.Equal(decode(first.After), own) {
		t.Fatalf("first change = %+v", first)
	}
	if second.ChangedBy != "bob" || second.Digest != "digest-2" || !slices.Equal(decode(second.Before), own) || len(decode(second.After)) != 0 || second.ID <= first.ID {
		t.Fatalf("second change = %+v", second)
	}
	// The log is append-only: a change never rewrites an earlier row.
	if again, err := d.ListTargetExemptionLog(1000); err != nil || len(again) != len(changes) || again[1].ID != first.ID || string(again[1].After) != string(first.After) {
		t.Fatalf("log changed between two reads: %+v, %v", again, err)
	}
}

// A decision of the gate that no human took is a decided row of the scope:
// decided by the system, source target, never a request and never a pin.
func TestLogTargetDecision(t *testing.T) {
	d := openTargetDB(t)
	task := targetTask(t, d, TaskCreateOptions{})
	conv := targetConversation(t, d)
	for name, scope := range map[string]TargetScopeRef{"task": {TaskID: task.ID}, "conversation": {ConversationID: conv.ID}} {
		id, err := d.LogTargetDecision(TargetDecision{Scope: scope, AgentName: "planner", ToolName: "WebFetch",
			ToolInput: []byte(`{"url":"https://app.example.com/"}`), Status: "denied", Reason: "TARGET_RESOLVE_FAILED: no such host",
			Audit: &InterceptAudit{Correlation: "unavailable", EffectiveAction: "deny", ExecutionStatus: "not_executed",
				Targets: []InterceptTarget{{Host: "app.example.com", Port: 443, Kind: "domain", Outcome: "resolve_failed"}}}})
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		row, err := d.GetInterceptDetail(id)
		if err != nil || row == nil {
			t.Fatalf("%s: row=%+v err=%v", name, row, err)
		}
		if row.Status != "denied" || row.DecidedBy != "system" || row.DecisionSource != "target" || row.DecidedAt == nil || row.RuleID != nil ||
			row.AgentName != "planner" || row.Audit == nil || row.Audit.Targets[0].Outcome != "resolve_failed" {
			t.Fatalf("%s: row = %+v audit=%+v", name, row.InterceptApprovalRow, row.Audit)
		}
		if (row.TaskID != nil) != (scope.TaskID != 0) || (row.ConversationID != nil) != (scope.ConversationID != 0) {
			t.Fatalf("%s: row scope = task %v conversation %v", name, row.TaskID, row.ConversationID)
		}
		if key, err := d.TargetRequestKey(id); err != nil || key != "" {
			t.Fatalf("%s: target key = %q, %v; a decided row is not a request", name, key, err)
		}
		if n := pendingTargetRows(t, d, scope); n != 0 {
			t.Fatalf("%s: %d open requests, want none", name, n)
		}
	}
	if _, err := d.LogTargetDecision(TargetDecision{Status: "denied"}); err == nil {
		t.Fatal("a decision without a scope was accepted")
	}
}
