package server

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/notify"
)

// This file covers the end-to-end behavior of the notification delivery feature:
// vulnerability persisted → event → fan-out → real HTTP send.
//
// One safety note: these cases do **not** call the global Notifier.step(); they
// only call stepRealtime/stepDigest on channels they created themselves. The
// reason is that step() iterates over all enabled channels in the database — on
// a development database with real DingTalk/WeCom bots configured, a global step
// would push the vulnerabilities produced during the test into those groups for
// real. Per-channel calls strictly confine the blast radius to the fake receivers
// created by the tests.
//
// Cleanup: when a case finishes, the events it produced (with deliveries deleted
// by cascade) and its channels are removed, leaving no backlog for real channels.
//
// Assertion policy: stepRealtime/stepDigest return nothing and log internally, so
// what is asserted here is **observable external behavior** (what the fake
// receiver got, what state the delivery rows landed in), not function return
// values — this is closer to the real call path than stubbing return values.

// notifyFixture is the shared fixture for the cases in this file.
type notifyFixture struct {
	s       *Server
	pg      *db.DB
	request func(method, path, body string) *httptest.ResponseRecorder
	n       *Notifier
	// Self-created task/exploration: cases record vulnerabilities here, isolated
	// from other cases' data.
	taskID int64
	expID  int64
	// Events produced after cleanupMark are deleted during cleanup.
	cleanupMark int64
}

func newNotifyFixture(t *testing.T) *notifyFixture {
	t.Helper()
	// All fake receivers in this file run on 127.0.0.1, while delivery rejects
	// loopback addresses by default (SSRF protection for same-host services and
	// cloud metadata). The tests explicitly open this switch; the
	// "reject by default" guard behavior is covered by ssrf_test.go in the notify
	// package.
	t.Setenv(notify.AllowLocalTargetsEnv, "1")
	s, _, request := trafficEvidenceServer(t)
	pg := s.m.pg

	// Create our own task: the task made by the shared fixture
	// trafficEvidenceServer has no exploration id available, which recording a
	// vulnerability requires.
	task, err := s.m.CreateTask("notification delivery test", "delivery behavior verification", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	taskID, err := strconv.ParseInt(task.ID, 10, 64)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pg.DeleteFindingsByTask(taskID)
		_ = pg.DeleteTask(taskID)
	})

	var mark int64
	if err := pg.QueryRow(`SELECT COALESCE(max(id),0) FROM notification_events`).Scan(&mark); err != nil {
		t.Fatal(err)
	}
	// Make the fixture self-contained: mark all events that existed before the
	// fixture was built as already fanned out in one go.
	//
	// Why this is necessary: FanOutPendingEvents is **global** and expands every
	// unfanned event in the database onto all matching channels. The shared
	// fixture trafficEvidenceServer itself records one vulnerability (exactly the
	// initial finding it returns), and other cases may have leftovers too. Without
	// isolation, these stray events would be fanned out onto this case's channels,
	// making assertions like "there should be N deliveries" intermittently wrong —
	// and the way they fail would depend on case execution order, which is harder
	// to debug than a straight failure.
	if _, err := pg.Exec(`UPDATE notification_events SET fanned_out = true WHERE id <= $1 AND NOT fanned_out`, mark); err != nil {
		t.Fatal(err)
	}

	f := &notifyFixture{s: s, pg: pg, request: request, n: newNotifier(s), taskID: taskID, expID: task.ExpID, cleanupMark: mark}
	t.Cleanup(func() {
		if _, err := pg.Exec(`DELETE FROM notification_events WHERE id > $1`, f.cleanupMark); err != nil {
			t.Logf("failed to clean up notification events: %v", err)
		}
	})
	// The master switch must be on (other cases may have turned it off).
	if err := pg.SetBool(settingNotifyEnabled, true); err != nil {
		t.Fatal(err)
	}
	return f
}

// record persists one vulnerability via the real evidence write path and returns
// the finding id. That path registers the notification event in the **same
// transaction** — which is exactly the hook point of this feature.
func (f *notifyFixture) record(t *testing.T, vulnclass, severity string) int64 {
	t.Helper()
	out, err := f.s.evidenceStore().Record(context.Background(), db.RecordFindingInput{
		TaskID:        f.taskID,
		ExplorationID: f.expID,
		Worker:        "test",
		VulnClass:     vulnclass,
		Name:          vulnclass,
		Severity:      severity,
		Summary:       vulnclass + " summary",
		Evidence:      "poc",
	}, nil)
	if err != nil {
		t.Fatalf("failed to record finding: %v", err)
	}
	return out.FindingID
}

// channel reads back the channel configuration (for per-channel stepX calls).
func (f *notifyFixture) channel(t *testing.T, id int64) *db.NotificationChannel {
	t.Helper()
	ch, err := f.pg.NotificationChannelByID(context.Background(), id)
	if err != nil {
		t.Fatalf("failed to read channel: %v", err)
	}
	return ch
}

// deliver fans out events and runs one delivery round for the specified channel
// only.
func (f *notifyFixture) deliver(t *testing.T, chID int64, baseURL string) {
	t.Helper()
	ctx := context.Background()
	if _, _, err := f.pg.FanOutPendingEvents(ctx, 500); err != nil {
		t.Fatalf("fan-out failed: %v", err)
	}
	f.n.stepRealtime(ctx, f.channel(t, chID), 50, baseURL)
}

// createChannel creates a channel through the HTTP API, also covering the API's
// own validation paths along the way.
func (f *notifyFixture) createChannel(t *testing.T, payload map[string]any) int64 {
	t.Helper()
	raw, _ := json.Marshal(payload)
	r := f.request("POST", "/api/notify/channels", string(raw))
	if r.Code != 200 {
		t.Fatalf("failed to create channel %d: %s", r.Code, r.Body)
	}
	var res struct {
		ID int64 `json:"id"`
	}
	if err := json.Unmarshal(r.Body.Bytes(), &res); err != nil || res.ID == 0 {
		t.Fatalf("create channel returned an abnormal response: %s (%v)", r.Body, err)
	}
	t.Cleanup(func() { f.pg.Exec(`DELETE FROM notification_channels WHERE id=$1`, res.ID) })
	return res.ID
}

// fakeWebhook is a fake receiver that records the request bodies it gets.
type fakeWebhook struct {
	*httptest.Server
	mu     sync.Mutex
	bodies []map[string]any
}

func newFakeWebhook(t *testing.T) *fakeWebhook {
	t.Helper()
	f := &fakeWebhook{}
	f.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		var body map[string]any
		_ = json.Unmarshal(raw, &body)
		f.mu.Lock()
		f.bodies = append(f.bodies, body)
		f.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"errcode":0,"errmsg":"ok"}`)
	}))
	t.Cleanup(f.Close)
	return f
}

func (f *fakeWebhook) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.bodies)
}

func (f *fakeWebhook) body(t *testing.T, i int) map[string]any {
	t.Helper()
	f.mu.Lock()
	defer f.mu.Unlock()
	if i >= len(f.bodies) {
		t.Fatalf("fake receiver only got %d requests, cannot get request %d", len(f.bodies), i)
	}
	return f.bodies[i]
}

func (f *fakeWebhook) last(t *testing.T) map[string]any {
	t.Helper()
	if f.count() == 0 {
		t.Fatal("fake receiver received no requests")
	}
	return f.body(t, f.count()-1)
}

// markdownText extracts the body text from the request body, tolerating the
// field-name differences between vendors: DingTalk markdown uses `text`,
// ActionCard uses `text`, WeCom markdown uses `content`.
func markdownText(t *testing.T, body map[string]any) string {
	t.Helper()
	for _, key := range []string{"markdown", "actionCard"} {
		section, ok := body[key].(map[string]any)
		if !ok {
			continue
		}
		for _, field := range []string{"text", "content"} {
			if s, ok := section[field].(string); ok && s != "" {
				return s
			}
		}
	}
	t.Fatalf("no recognizable body text in request body: %v", body)
	return ""
}

// agePendingBatch ages the channel's pending deliveries, used to test digest
// batches becoming due.
func (f *notifyFixture) agePendingBatch(t *testing.T, chID int64) {
	t.Helper()
	if _, err := f.pg.Exec(`UPDATE notification_deliveries SET created_at = now() - interval '2 hours'
WHERE channel_id=$1 AND state=$2`, chID, db.NotifyStatePending); err != nil {
		t.Fatal(err)
	}
}

func TestNotifyEndToEndRealtimeDelivery(t *testing.T) {
	f := newNotifyFixture(t)
	hook := newFakeWebhook(t)
	chID := f.createChannel(t, map[string]any{
		"name":   "realtime delivery",
		"kind":   notify.KindDingTalk,
		"config": map[string]any{"webhook": hook.URL},
	})
	f.record(t, "SQL injection", "high")
	f.deliver(t, chID, "")

	if hook.count() != 1 {
		t.Fatalf("expected 1 message sent, got %d", hook.count())
	}
	text := markdownText(t, hook.last(t))
	for _, want := range []string{"SQL injection", "High", "Summary"} {
		if !strings.Contains(text, want) {
			t.Fatalf("message body is missing %q:\n%s", want, text)
		}
	}
	// The delivery should transition to sent.
	var pending int
	if err := f.pg.QueryRow(`SELECT count(*) FROM notification_deliveries WHERE channel_id=$1 AND state <> $2`,
		chID, db.NotifyStateSent).Scan(&pending); err != nil {
		t.Fatal(err)
	}
	if pending != 0 {
		t.Fatalf("%d deliveries still not marked sent after delivery", pending)
	}
}

func TestNotifyChannelAPIMasksSecretsAndPreservesOnUpdate(t *testing.T) {
	f := newNotifyFixture(t)
	chID := f.createChannel(t, map[string]any{
		"name":   "masking case",
		"kind":   notify.KindDingTalk,
		"config": map[string]any{"webhook": "https://oapi.dingtalk.com/robot/send?access_token=abc123456", "secret": "SECabcdef123456"},
	})

	r := f.request("GET", "/api/notify/channels", "")
	if r.Code != 200 {
		t.Fatalf("failed to list channels %d: %s", r.Code, r.Body)
	}
	if strings.Contains(r.Body.String(), "abc123456") || strings.Contains(r.Body.String(), "SECabcdef123456") {
		t.Fatalf("API response leaked credentials: %s", r.Body)
	}
	var listed struct {
		Channels []struct {
			ID         int64          `json:"id"`
			Config     map[string]any `json:"config"`
			SecretKeys []string       `json:"secret_keys"`
		} `json:"channels"`
	}
	if err := json.Unmarshal(r.Body.Bytes(), &listed); err != nil {
		t.Fatal(err)
	}
	var mine *struct {
		ID         int64          `json:"id"`
		Config     map[string]any `json:"config"`
		SecretKeys []string       `json:"secret_keys"`
	}
	for i := range listed.Channels {
		if listed.Channels[i].ID == chID {
			mine = &listed.Channels[i]
		}
	}
	if mine == nil {
		t.Fatal("newly created channel did not appear in the list")
	}
	if !notify.IsMasked(fmt.Sprint(mine.Config["webhook"])) || !notify.IsMasked(fmt.Sprint(mine.Config["secret"])) {
		t.Fatalf("credential fields should be masked values: %v", mine.Config)
	}
	if len(mine.SecretKeys) == 0 {
		t.Fatal("the API should tell the frontend which fields are credentials")
	}

	// PATCH with only a rename + echoing back the masked credentials: the real
	// credentials must be preserved unchanged.
	body, _ := json.Marshal(map[string]any{
		"name":   "renamed",
		"config": map[string]any{"webhook": fmt.Sprint(mine.Config["webhook"]), "secret": fmt.Sprint(mine.Config["secret"])},
	})
	if r := f.request("PATCH", fmt.Sprintf("/api/notify/channels/%d", chID), string(body)); r.Code != 200 {
		t.Fatalf("update failed %d: %s", r.Code, r.Body)
	}
	cfg := f.channelConfig(t, chID)
	if cfg["webhook"] != "https://oapi.dingtalk.com/robot/send?access_token=abc123456" {
		t.Fatalf("masked echo overwrote the real credential: %v", cfg["webhook"])
	}
	if cfg["secret"] != "SECabcdef123456" {
		t.Fatalf("masked echo overwrote the secret: %v", cfg["secret"])
	}
	if f.channel(t, chID).Name != "renamed" {
		t.Fatal("name was not updated")
	}

	// Explicitly clearing the secret should take effect (as opposed to
	// "echoing back the mask = keep unchanged").
	body, _ = json.Marshal(map[string]any{"config": map[string]any{"secret": ""}})
	if r := f.request("PATCH", fmt.Sprintf("/api/notify/channels/%d", chID), string(body)); r.Code != 200 {
		t.Fatalf("clearing secret failed %d: %s", r.Code, r.Body)
	}
	if _, still := f.channelConfig(t, chID)["secret"]; still {
		t.Fatal("empty string should clear the secret")
	}
}

func (f *notifyFixture) channelConfig(t *testing.T, id int64) map[string]any {
	t.Helper()
	var cfg map[string]any
	if err := json.Unmarshal(f.channel(t, id).Config, &cfg); err != nil {
		t.Fatal(err)
	}
	return cfg
}

func TestNotifyChannelAPICreateValidation(t *testing.T) {
	f := newNotifyFixture(t)
	cases := []struct {
		name    string
		payload map[string]any
		wantSub string
	}{
		{"invalid kind", map[string]any{"name": "x", "kind": "nope", "config": map[string]any{}}, "invalid channel type"},
		{"missing name", map[string]any{"kind": notify.KindDingTalk, "config": map[string]any{"webhook": "https://e.com/h"}}, "channel name is required"},
		{"missing webhook", map[string]any{"name": "x", "kind": notify.KindDingTalk, "config": map[string]any{}}, "Webhook"},
		{"invalid webhook scheme", map[string]any{"name": "x", "kind": notify.KindDingTalk, "config": map[string]any{"webhook": "file:///etc/passwd"}}, "invalid Webhook address"},
		{"invalid mode", map[string]any{"name": "x", "kind": notify.KindDingTalk, "mode": "sometimes", "config": map[string]any{"webhook": "https://e.com/h"}}, "invalid delivery mode"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			raw, _ := json.Marshal(tc.payload)
			r := f.request("POST", "/api/notify/channels", string(raw))
			if r.Code != 400 {
				t.Fatalf("expected 400, got %d: %s", r.Code, r.Body)
			}
			if !strings.Contains(r.Body.String(), tc.wantSub) {
				t.Fatalf("error message should mention %q, got %s", tc.wantSub, r.Body)
			}
		})
	}
	if r := f.request("DELETE", "/api/notify/channels/99999999", ""); r.Code != 404 {
		t.Fatalf("deleting a nonexistent channel should return 404, got %d", r.Code)
	}
}

func TestNotifyFilterBlocksBelowThreshold(t *testing.T) {
	f := newNotifyFixture(t)
	hook := newFakeWebhook(t)
	chID := f.createChannel(t, map[string]any{
		"name":   "critical only",
		"kind":   notify.KindDingTalk,
		"config": map[string]any{"webhook": hook.URL},
		"filter": map[string]any{"min_severity": "critical"},
	})
	f.record(t, "low-risk issue", "low")
	if _, _, err := f.pg.FanOutPendingEvents(context.Background(), 500); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := f.pg.QueryRow(`SELECT count(*) FROM notification_deliveries WHERE channel_id=$1`, chID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("vulnerabilities below the threshold should not produce deliveries, got %d", n)
	}
	f.n.stepRealtime(context.Background(), f.channel(t, chID), 50, "")
	if hook.count() != 0 {
		t.Fatal("filtered vulnerabilities should not send messages")
	}
}

func TestNotifyDigestBatchesMultipleFindingsIntoOneMessage(t *testing.T) {
	f := newNotifyFixture(t)
	hook := newFakeWebhook(t)
	chID := f.createChannel(t, map[string]any{
		"name":   "digest delivery",
		"kind":   notify.KindDingTalk,
		"mode":   db.NotifyModeDigest,
		"config": map[string]any{"webhook": hook.URL},
	})
	for i := 0; i < 3; i++ {
		f.record(t, fmt.Sprintf("digest vuln %d", i+1), "high")
	}
	ctx := context.Background()
	if _, _, err := f.pg.FanOutPendingEvents(ctx, 500); err != nil {
		t.Fatal(err)
	}
	ch := f.channel(t, chID)

	// Not due yet: do not send.
	f.n.stepDigest(ctx, ch, 50, "")
	if hook.count() != 0 {
		t.Fatal("digest batch sent before it was due")
	}

	// After aging the batch: three findings merge into one message.
	f.agePendingBatch(t, chID)
	f.n.stepDigest(ctx, ch, 50, "")
	if got := hook.count(); got != 1 {
		t.Fatalf("three findings should be digested into one message, actually sent %d", got)
	}
	text := markdownText(t, hook.last(t))
	if !strings.Contains(text, "in the last 30 minutes") || !strings.Contains(text, "3 new vulnerabilities") {
		t.Fatalf("digest message is missing the count/time-window wording:\n%s", text)
	}
	for i := 1; i <= 3; i++ {
		if !strings.Contains(text, fmt.Sprintf("digest vuln %d", i)) {
			t.Fatalf("digest message is missing entry %d:\n%s", i, text)
		}
	}
	// The same batch should share one batch_id.
	var distinct, total int
	if err := f.pg.QueryRow(`SELECT count(DISTINCT batch_id), count(*) FROM notification_deliveries WHERE channel_id=$1`, chID).Scan(&distinct, &total); err != nil {
		t.Fatal(err)
	}
	if total != 3 || distinct != 1 {
		t.Fatalf("three deliveries should share one batch_id, got distinct=%d total=%d", distinct, total)
	}
}

func TestNotifyDisabledChannelDoesNotSend(t *testing.T) {
	f := newNotifyFixture(t)
	hook := newFakeWebhook(t)
	chID := f.createChannel(t, map[string]any{
		"name":    "disabled channel",
		"kind":    notify.KindDingTalk,
		"enabled": false,
		"config":  map[string]any{"webhook": hook.URL},
	})
	f.record(t, "vulnerability while disabled", "critical")
	if _, _, err := f.pg.FanOutPendingEvents(context.Background(), 500); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := f.pg.QueryRow(`SELECT count(*) FROM notification_deliveries WHERE channel_id=$1`, chID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("a disabled channel should not produce deliveries, got %d", n)
	}
}

func TestNotifyStatusChangeDelivery(t *testing.T) {
	f := newNotifyFixture(t)
	hook := newFakeWebhook(t)
	chID := f.createChannel(t, map[string]any{
		"name":   "status change subscription",
		"kind":   notify.KindDingTalk,
		"config": map[string]any{"webhook": hook.URL},
		"filter": map[string]any{"on_status_change": true},
	})
	finding := f.record(t, "status change case", "high")
	r := f.request("PATCH", fmt.Sprintf("/api/exploration/findings/%d", finding), `{"status":"fixed"}`)
	if r.Code != 200 {
		t.Fatalf("failed to change status %d: %s", r.Code, r.Body)
	}
	f.deliver(t, chID, "")

	// There should be two messages: the "fixed" one is the status change; the
	// finding_created one may also go out in the same round. The status-change one
	// is actually created later, but do not rely on ordering — search them all.
	found := false
	for i := 0; i < hook.count(); i++ {
		text := markdownText(t, hook.body(t, i))
		if strings.Contains(text, "Status change") && strings.Contains(text, "Fixed") {
			found = true
		}
	}
	if !found {
		t.Fatalf("no message containing \"Status change → Fixed\" received (%d messages total)", hook.count())
	}
}

func TestNotifyStatusChangeSuppressedByDefault(t *testing.T) {
	f := newNotifyFixture(t)
	hook := newFakeWebhook(t)
	chID := f.createChannel(t, map[string]any{
		"name":   "not subscribed to status changes",
		"kind":   notify.KindDingTalk,
		"config": map[string]any{"webhook": hook.URL},
	})
	finding := f.record(t, "unsubscribed change", "high")
	if r := f.request("PATCH", fmt.Sprintf("/api/exploration/findings/%d", finding), `{"status":"false_positive"}`); r.Code != 200 {
		t.Fatalf("failed to change status %d: %s", r.Code, r.Body)
	}
	if _, _, err := f.pg.FanOutPendingEvents(context.Background(), 500); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := f.pg.QueryRow(`SELECT count(*) FROM notification_deliveries d
JOIN notification_events e ON e.id = d.event_id
WHERE d.channel_id=$1 AND e.kind=$2`, chID, notify.EventFindingStatusChanged).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("a channel not subscribed to status changes should not receive status-change deliveries, got %d", n)
	}
}

func TestNotifyTestMessageEndpoint(t *testing.T) {
	f := newNotifyFixture(t)
	hook := newFakeWebhook(t)
	chID := f.createChannel(t, map[string]any{
		"name":   "test send",
		"kind":   notify.KindDingTalk,
		"config": map[string]any{"webhook": hook.URL},
	})
	if r := f.request("POST", fmt.Sprintf("/api/notify/channels/%d/test", chID), ""); r.Code != 200 {
		t.Fatalf("test send failed %d: %s", r.Code, r.Body)
	}
	if hook.count() != 1 {
		t.Fatalf("fake receiver should have received 1 test message, got %d", hook.count())
	}
	// The test message must be recognizable as a test at a glance; it must not be
	// mistaken for a real vulnerability.
	if text := markdownText(t, hook.last(t)); !strings.Contains(text, "Test") {
		t.Fatalf("the test message should identify itself as a test: %s", text)
	}
	// When the configuration is broken, the channel's raw error should be returned
	// to the user as-is.
	badID := f.createChannel(t, map[string]any{
		"name":   "bad address",
		"kind":   notify.KindDingTalk,
		"config": map[string]any{"webhook": "http://127.0.0.1:1/hook"},
	})
	if r := f.request("POST", fmt.Sprintf("/api/notify/channels/%d/test", badID), ""); r.Code != 502 {
		t.Fatalf("failed delivery should return 502, got %d: %s", r.Code, r.Body)
	}
}

func TestNotifyDeliveriesHistoryAndRetry(t *testing.T) {
	f := newNotifyFixture(t)
	// Point at an address that always fails, to produce failed deliveries.
	chID := f.createChannel(t, map[string]any{
		"name":   "failing retry",
		"kind":   notify.KindDingTalk,
		"config": map[string]any{"webhook": "http://127.0.0.1:1/hook"},
	})
	f.record(t, "delivery that fails", "high")
	ctx := context.Background()
	if _, _, err := f.pg.FanOutPendingEvents(ctx, 500); err != nil {
		t.Fatal(err)
	}
	ch := f.channel(t, chID)
	// Keep delivering until the retry budget is exhausted.
	for i := 0; i < db.MaxNotifyAttempts; i++ {
		f.n.stepRealtime(ctx, ch, 50, "")
		if _, err := f.pg.Exec(`UPDATE notification_deliveries SET next_attempt_at = now() - interval '1 minute' WHERE channel_id=$1`, chID); err != nil {
			t.Fatal(err)
		}
	}
	var state string
	if err := f.pg.QueryRow(`SELECT state FROM notification_deliveries WHERE channel_id=$1`, chID).Scan(&state); err != nil {
		t.Fatal(err)
	}
	if state != db.NotifyStateFailed {
		t.Fatalf("should be failed after retries are exhausted, got %s", state)
	}

	r := f.request("GET", fmt.Sprintf("/api/notify/deliveries?channel_id=%d&state=failed", chID), "")
	if r.Code != 200 {
		t.Fatalf("failed to query history %d: %s", r.Code, r.Body)
	}
	var hist struct {
		Deliveries []struct {
			ID        int64  `json:"id"`
			State     string `json:"state"`
			LastError string `json:"last_error"`
			Attempts  int    `json:"attempts"`
			Title     string `json:"title"`
		} `json:"deliveries"`
		Total int `json:"total"`
	}
	if err := json.Unmarshal(r.Body.Bytes(), &hist); err != nil {
		t.Fatal(err)
	}
	if hist.Total != 1 || len(hist.Deliveries) != 1 {
		t.Fatalf("should find 1 failed delivery, got total=%d len=%d", hist.Total, len(hist.Deliveries))
	}
	if hist.Deliveries[0].LastError == "" {
		t.Fatal("the history should carry the failure reason, otherwise users cannot troubleshoot")
	}
	if hist.Deliveries[0].Attempts < db.MaxNotifyAttempts {
		t.Fatalf("the attempt count should be recorded, got %d", hist.Deliveries[0].Attempts)
	}
	if hist.Deliveries[0].Title != "delivery that fails" {
		t.Fatalf("the history should include the vulnerability title, got %q", hist.Deliveries[0].Title)
	}

	// Manual resend: it should go back to pending with the counter reset.
	if r := f.request("POST", fmt.Sprintf("/api/notify/deliveries/%d/retry", hist.Deliveries[0].ID), ""); r.Code != 200 {
		t.Fatalf("resend failed %d: %s", r.Code, r.Body)
	}
	var attempts int
	if err := f.pg.QueryRow(`SELECT state, attempts FROM notification_deliveries WHERE id=$1`, hist.Deliveries[0].ID).Scan(&state, &attempts); err != nil {
		t.Fatal(err)
	}
	if state != db.NotifyStatePending || attempts != 0 {
		t.Fatalf("after resend it should be pending with attempts=0, got %s/%d", state, attempts)
	}
}

func TestNotifyMetaAndSettingsRoundTrip(t *testing.T) {
	f := newNotifyFixture(t)
	r := f.request("GET", "/api/notify/meta", "")
	if r.Code != 200 {
		t.Fatalf("meta failed: %s", r.Body)
	}
	var meta struct {
		Kinds []struct {
			Kind       string   `json:"kind"`
			SecretKeys []string `json:"secret_keys"`
		} `json:"kinds"`
	}
	if err := json.Unmarshal(r.Body.Bytes(), &meta); err != nil {
		t.Fatal(err)
	}
	if len(meta.Kinds) != len(notify.Kinds()) {
		t.Fatalf("meta should list all %d channels, got %d", len(notify.Kinds()), len(meta.Kinds))
	}
	for _, k := range meta.Kinds {
		if len(k.SecretKeys) == 0 {
			t.Errorf("channel %s did not report credential fields", k.Kind)
		}
	}

	// Round trip of the three global settings. The trailing slash should be
	// normalized away, otherwise back-links would be built as "//function/...".
	if r := f.request("PUT", "/api/settings", `{"notify_public_base_url":"https://artex.example.com/","notify_digest_interval_min":15,"notify_enabled":true}`); r.Code != 200 {
		t.Fatalf("failed to write settings %d: %s", r.Code, r.Body)
	}
	t.Cleanup(func() {
		f.pg.Exec(`DELETE FROM settings WHERE key IN ($1,$2)`, settingNotifyPublicBaseURL, settingNotifyDigestMinutes)
	})
	payload := f.s.settingsPayload()
	if payload["notify_public_base_url"] != "https://artex.example.com" {
		t.Fatalf("back-link address was not normalized: %v", payload["notify_public_base_url"])
	}
	if payload["notify_digest_interval_min"] != 15 {
		t.Fatalf("digest interval did not take effect: %v", payload["notify_digest_interval_min"])
	}

	// Invalid values should be rejected.
	for _, body := range []string{
		`{"notify_public_base_url":"ftp://x"}`,
		`{"notify_digest_interval_min":0}`,
		`{"notify_digest_interval_min":99999}`,
	} {
		if r := f.request("PUT", "/api/settings", body); r.Code != 400 {
			t.Errorf("%s should return 400, got %d", body, r.Code)
		}
	}
}

// TestNotifyLimitSettingsRoundTrip covers the two render-limit keys through the
// settings API and the settings table: unset reads as the 120 / 3 defaults, a
// stored 0 reads back as 0 (no truncation) and not as the default, and
// out-of-range values are rejected without touching the stored value.
func TestNotifyLimitSettingsRoundTrip(t *testing.T) {
	f := newNotifyFixture(t)
	clear := func() {
		f.pg.Exec(`DELETE FROM settings WHERE key IN ($1,$2)`, settingNotifySummaryMaxRunes, settingNotifyAssetsMaxShown)
	}
	clear()
	t.Cleanup(clear)
	expect := func(step string, summary, assets int) {
		t.Helper()
		payload := f.s.settingsPayload()
		if payload["notify_summary_max_runes"] != summary || payload["notify_assets_max_shown"] != assets {
			t.Fatalf("%s: settings payload should report %d / %d, got %v / %v", step, summary, assets,
				payload["notify_summary_max_runes"], payload["notify_assets_max_shown"])
		}
		if got := notifyLimits(f.pg); got != (notify.Limits{SummaryRunes: summary, AssetsShown: assets}) {
			t.Fatalf("%s: the delivery engine should read %d / %d, got %+v", step, summary, assets, got)
		}
	}
	expect("unset", notify.DefaultMaxSummaryRunes, notify.DefaultMaxAssetsShown)

	for _, tc := range []struct{ summary, assets int }{{500, 10}, {0, 0}, {4000, 50}} {
		body := fmt.Sprintf(`{"notify_summary_max_runes":%d,"notify_assets_max_shown":%d}`, tc.summary, tc.assets)
		if r := f.request("PUT", "/api/settings", body); r.Code != 200 {
			t.Fatalf("%s failed %d: %s", body, r.Code, r.Body)
		}
		expect(body, tc.summary, tc.assets)
		for key, want := range map[string]int{settingNotifySummaryMaxRunes: tc.summary, settingNotifyAssetsMaxShown: tc.assets} {
			if v, ok, err := f.pg.GetSetting(key); err != nil || !ok || v != strconv.Itoa(want) {
				t.Fatalf("%s: settings row %s should hold %d, got %q (ok=%v err=%v)", body, key, want, v, ok, err)
			}
		}
	}

	for _, body := range []string{
		`{"notify_summary_max_runes":-1}`,
		`{"notify_summary_max_runes":4001}`,
		`{"notify_assets_max_shown":-1}`,
		`{"notify_assets_max_shown":51}`,
	} {
		if r := f.request("PUT", "/api/settings", body); r.Code != 400 {
			t.Errorf("%s should return 400, got %d", body, r.Code)
		}
	}
	expect("after rejected writes", 4000, 50)
}

// TestNotifySummaryLimitReachesDelivery is the end-to-end evidence that the
// stored limit reaches the message actually sent: with the key unset the summary
// is cut at 120 characters as before, and once it is set to 0 the same summary
// goes out whole.
func TestNotifySummaryLimitReachesDelivery(t *testing.T) {
	f := newNotifyFixture(t)
	clear := func() { f.pg.Exec(`DELETE FROM settings WHERE key=$1`, settingNotifySummaryMaxRunes) }
	clear()
	t.Cleanup(clear)
	hook := newFakeWebhook(t)
	chID := f.createChannel(t, map[string]any{
		"name":   "summary limit",
		"kind":   notify.KindDingTalk,
		"config": map[string]any{"webhook": hook.URL},
	})
	summary := strings.Repeat("Z", 300)
	record := func(name string) {
		t.Helper()
		if _, err := f.s.evidenceStore().Record(context.Background(), db.RecordFindingInput{
			TaskID:        f.taskID,
			ExplorationID: f.expID,
			Worker:        "test",
			VulnClass:     name,
			Name:          name,
			Severity:      "high",
			Summary:       summary,
			Evidence:      "poc",
		}, nil); err != nil {
			t.Fatalf("failed to record finding: %v", err)
		}
	}

	record("summary limit unset")
	f.deliver(t, chID, "")
	text := markdownText(t, hook.last(t))
	if !strings.Contains(text, strings.Repeat("Z", 119)+"…") || strings.Contains(text, strings.Repeat("Z", 120)) {
		t.Fatalf("with the key unset the summary should be cut at 120 characters:\n%s", text)
	}

	if r := f.request("PUT", "/api/settings", `{"notify_summary_max_runes":0}`); r.Code != 200 {
		t.Fatalf("failed to write settings %d: %s", r.Code, r.Body)
	}
	record("summary limit zero")
	f.deliver(t, chID, "")
	if hook.count() != 2 {
		t.Fatalf("expected 2 messages sent, got %d", hook.count())
	}
	if text := markdownText(t, hook.last(t)); !strings.Contains(text, summary) {
		t.Fatalf("with the limit at 0 the whole summary should be sent:\n%s", text)
	}
}

// TestNotifyDeepLinkUsesPublicBaseURL covers back-link building: when
// public_base_url is configured, single messages must use the ActionCard with a
// button, and the link must point to the vulnerability detail page.
func TestNotifyDeepLinkUsesPublicBaseURL(t *testing.T) {
	f := newNotifyFixture(t)
	hook := newFakeWebhook(t)
	chID := f.createChannel(t, map[string]any{
		"name":   "deep link",
		"kind":   notify.KindDingTalk,
		"config": map[string]any{"webhook": hook.URL},
	})
	finding := f.record(t, "vulnerability with deep link", "high")
	f.deliver(t, chID, "https://artex.example.com")

	body := hook.last(t)
	card, _ := body["actionCard"].(map[string]any)
	if card == nil {
		t.Fatalf("with a back-link an ActionCard should be used, got msgtype=%v", body["msgtype"])
	}
	want := fmt.Sprintf("https://artex.example.com/function/findings/detail?id=%d", finding)
	if card["singleURL"] != want {
		t.Fatalf("wrong back-link\nwant %s\ngot %v", want, card["singleURL"])
	}
}

// TestNotifyNoDeepLinkWithoutBaseURL is the reverse coverage: with no external
// address configured, no broken link should be produced (e.g. pointing at
// localhost or a relative path); it should fall back to plain markdown.
func TestNotifyNoDeepLinkWithoutBaseURL(t *testing.T) {
	f := newNotifyFixture(t)
	hook := newFakeWebhook(t)
	chID := f.createChannel(t, map[string]any{
		"name":   "no deep link",
		"kind":   notify.KindDingTalk,
		"config": map[string]any{"webhook": hook.URL},
	})
	f.record(t, "vulnerability without deep link", "high")
	f.deliver(t, chID, "")

	body := hook.last(t)
	if body["msgtype"] != "markdown" {
		t.Fatalf("markdown should be sent when no external address is configured, got %v", body["msgtype"])
	}
	if text := markdownText(t, body); strings.Contains(text, "View details") {
		t.Fatalf("no detail link should appear when no external address is configured:\n%s", text)
	}
}

// TestNotifyDigestSegmentsAndDefersRemainder is the end-to-end evidence for the
// "silent loss" fix.
//
// A digest message is bounded by the channel's length limit (WeCom: 4096 bytes).
// When a batch does not fit, it must be split **on whole entries**: the ones that
// fit in this message are marked sent, and the rest go back to the queue for the
// next message. A previous implementation marked the entire batch as succeeded —
// the truncated entries were neither in the message nor in the failure list,
// while the delivery history still showed success; the vulnerabilities were just
// gone.
//
// Four things are asserted: ① only the number of entries actually included is
// marked; ② the rest remain pending; ③ the deferred entries **did not consume
// retry attempts**; ④ running another round sends the remainder (no deadlock).
func TestNotifyDigestSegmentsAndDefersRemainder(t *testing.T) {
	f := newNotifyFixture(t)
	hook := newFakeWebhook(t)
	// Use WeCom: its 4096-byte markdown limit is the tightest of the six channels.
	chID := f.createChannel(t, map[string]any{
		"name":   "segmented digest",
		"kind":   notify.KindWeCom,
		"mode":   db.NotifyModeDigest,
		"config": map[string]any{"webhook": hook.URL},
	})
	const total = 60
	// Make the titles long, so 60 entries far exceed 4096 bytes and segmentation
	// is guaranteed.
	longName := strings.Repeat("very long vulnerability name", 6)
	for i := 0; i < total; i++ {
		f.record(t, longName+strconv.Itoa(i+1), "high")
	}
	ctx := context.Background()
	if _, _, err := f.pg.FanOutPendingEvents(ctx, 500); err != nil {
		t.Fatal(err)
	}
	f.agePendingBatch(t, chID)
	ch := f.channel(t, chID)

	f.n.stepDigest(ctx, ch, 50, "")
	if hook.count() != 1 {
		t.Fatalf("only one message should be sent, got %d", hook.count())
	}

	var sent, pending int
	if err := f.pg.QueryRow(`SELECT
    count(*) FILTER (WHERE state=$2),
    count(*) FILTER (WHERE state=$3)
  FROM notification_deliveries WHERE channel_id=$1`, chID, db.NotifyStateSent, db.NotifyStatePending).
		Scan(&sent, &pending); err != nil {
		t.Fatal(err)
	}
	if sent == 0 {
		t.Fatal("some entries should have been marked as sent")
	}
	if pending == 0 {
		t.Fatalf("a batch of %d entries cannot all fit into 4096 bytes, some should remain pending; sent=%d", total, sent)
	}
	if sent+pending != total {
		t.Fatalf("entry counts do not add up: sent=%d pending=%d total=%d (neither sent nor pending = lost)", sent, pending, total)
	}
	// The message body must state honestly how many entries are not included in
	// this one.
	if text := markdownText(t, hook.last(t)); !strings.Contains(text, "remaining") {
		t.Fatalf("the message should state that more entries are not included in this one:\n%.400s", text)
	}

	// Deferred entries must not consume the retry budget: claiming already
	// optimistically incremented attempts by +1, and deferring must undo it.
	var maxAttempts int
	if err := f.pg.QueryRow(`SELECT COALESCE(max(attempts),0) FROM notification_deliveries
WHERE channel_id=$1 AND state=$2`, chID, db.NotifyStatePending).Scan(&maxAttempts); err != nil {
		t.Fatal(err)
	}
	if maxAttempts > 0 {
		t.Fatalf("deferred entries must not consume retry attempts (otherwise they would be marked failed after a few rounds), got attempts=%d", maxAttempts)
	}

	// Keep running until convergence. What is asserted is **eventual full
	// delivery** plus the fact that it really took multiple rounds — this is
	// stronger than "the second round finishes it": it proves segmentation neither
	// deadlocks nor drops the remaining entries.
	rounds := 0
	for {
		var undelivered int
		if err := f.pg.QueryRow(`SELECT count(*) FROM notification_deliveries
WHERE channel_id=$1 AND state <> $2 AND state <> $3`, chID, db.NotifyStateSent, db.NotifyStateFailed).
			Scan(&undelivered); err != nil {
			t.Fatal(err)
		}
		if undelivered == 0 {
			break
		}
		rounds++
		if rounds > total+5 {
			t.Fatalf("segmented delivery does not converge: after %d rounds there are still %d entries outstanding", rounds, undelivered)
		}
		before := hook.count()
		f.n.stepDigest(ctx, ch, 50, "")
		if hook.count() == before {
			t.Fatalf("round %d made no progress; the remaining %d entries would be stuck forever", rounds, undelivered)
		}
	}
	if rounds < 2 {
		t.Fatalf("one 4096-byte message cannot hold %d long-titled vulnerabilities; it should take multiple rounds, but only %d were used", total, rounds)
	}
	// Every round after the first should be a **pure continuation**, with no entry
	// rejected by the channel.
	var failed int
	if err := f.pg.QueryRow(`SELECT count(*) FROM notification_deliveries WHERE channel_id=$1 AND state=$2`,
		chID, db.NotifyStateFailed).Scan(&failed); err != nil {
		t.Fatal(err)
	}
	if failed != 0 {
		t.Fatalf("the fake receiver always returns success, so there should be no failed entries, got %d", failed)
	}
}

// TestNotifyBackoffTableMatchesAttemptBudget is a drift-prevention assertion.
//
// The retry budget (db.MaxNotifyAttempts) and the backoff sequence table
// (notifyBackoff) live in two different packages: the former is the state
// machine's policy, the latter the engine's execution cadence. If only one of
// them is changed — say the budget is raised to 5 while forgetting to add backoff
// tiers — the code does not error; the 4th and 5th retries would just reuse the
// last tier's interval, showing up as "retry cadence inexplicably slows down",
// and it would be hard to trace back here. Asserting the two lengths match
// surfaces this kind of drift in CI.
func TestNotifyBackoffTableMatchesAttemptBudget(t *testing.T) {
	if len(notifyBackoff) != db.MaxNotifyAttempts {
		t.Fatalf("the number of backoff tiers (%d) does not match the max attempt count (%d) — changing one requires changing the other",
			len(notifyBackoff), db.MaxNotifyAttempts)
	}
	// Backoff intervals must be monotonically non-decreasing, otherwise retries
	// would get more and more urgent, aggravating rate limiting instead.
	for i := 1; i < len(notifyBackoff); i++ {
		if notifyBackoff[i] < notifyBackoff[i-1] {
			t.Fatalf("backoff intervals must be monotonically non-decreasing: tier %d %v < tier %d %v",
				i, notifyBackoff[i], i-1, notifyBackoff[i-1])
		}
	}
}

// TestNotifyRateLimitDoesNotConsumeRetryBudget pins down the "take tokens first,
// then claim" order. If reversed (claim first, then discard), deliveries blocked
// by rate limiting would already have counted one attempts increment, and the
// budget would be burned by pure waiting, ending in failed.
func TestNotifyRateLimitDoesNotConsumeRetryBudget(t *testing.T) {
	// Only the token bucket itself is tested; no Server is needed (and none should
	// be built for it).
	n := &Notifier{buckets: map[int64]*notifyBucket{}}
	now := time.Now()
	// 1 per minute: with a full bucket, at most 1.
	if got := n.takeTokens(1, 1, notifyMaxSendsPerChannelPerTick, now); got != 1 {
		t.Fatalf("with a full bucket at 1/min it should take 1 token, got %d", got)
	}
	if got := n.takeTokens(1, 1, notifyMaxSendsPerChannelPerTick, now.Add(time.Millisecond)); got != 0 {
		t.Fatalf("should return 0 immediately once tokens are exhausted, got %d", got)
	}
	if got := n.takeTokens(1, 1, notifyMaxSendsPerChannelPerTick, now.Add(30*time.Second)); got != 0 {
		t.Fatalf("half a period should not refill a full token, got %d", got)
	}
	if got := n.takeTokens(1, 1, notifyMaxSendsPerChannelPerTick, now.Add(time.Minute)); got != 1 {
		t.Fatalf("a full period should refill 1 token, got %d", got)
	}
	// A channel with no rate limit gets a finite cap, so a single tick is not
	// dragged down by unlimited backlog.
	if got := n.takeTokens(2, 0, notifyUnlimitedBurstPerTick+10, now); got != notifyUnlimitedBurstPerTick {
		t.Fatalf("no rate limit should return the per-tick cap %d, got %d", notifyUnlimitedBurstPerTick, got)
	}
	// Token buckets are independent between channels.
	if got := n.takeTokens(1, 1, notifyMaxSendsPerChannelPerTick, now.Add(time.Millisecond)); got != 0 {
		t.Fatalf("channel 1's bucket should still be empty, got %d", got)
	}
}

// TestNotifyTakeTokensKeepsUnusedTokens pins down the "take only want" semantics.
//
// A previous implementation drained the entire bucket and let the caller
// truncate, so a channel with rate=100/min would fill its bucket, use 5 in one
// round, and have the remaining 95 tokens simply discarded; a channel with no
// pending deliveries in a round was charged the same way. As a result, the
// "burst the full rate_per_min at once when there is a backlog" promised by the
// comment was impossible under any circumstances.
func TestNotifyTakeTokensKeepsUnusedTokens(t *testing.T) {
	n := &Notifier{buckets: map[int64]*notifyBucket{}}
	now := time.Now()
	// The bucket starts full (100); this round only wants 5.
	if got := n.takeTokens(1, 100, 5, now); got != 5 {
		t.Fatalf("with want=5 exactly 5 tokens should be taken, got %d", got)
	}
	// The key assertion: the remaining 95 must still be in the bucket, not drained
	// and discarded. Time is not advanced, ensuring what is taken can only come
	// from the stock, not from refills.
	if got := n.takeTokens(1, 100, 95, now); got != 95 {
		t.Fatalf("the remaining tokens should still be available (want 95), got %d — the bucket was drained for the whole round", got)
	}
	if got := n.takeTokens(1, 100, 1, now); got != 0 {
		t.Fatalf("the bucket is drained, should return 0, got %d", got)
	}
	// want<=0 must not deduct any tokens (an empty round is free).
	n2 := &Notifier{buckets: map[int64]*notifyBucket{}}
	if got := n2.takeTokens(1, 20, 0, now); got != 0 {
		t.Fatalf("want=0 should return 0, got %d", got)
	}
	if got := n2.takeTokens(1, 20, 20, now); got != 20 {
		t.Fatalf("the want=0 call should not have consumed any tokens, the full 20 should still be available, got %d", got)
	}
}

// TestDigestTickPlanDecouplesBatchSizeFromSendBudget pins down the two dimensions
// of digest mode.
//
// Once the digest batch size is coupled to the per-tick request budget, a channel
// with rate_per_min=20 can only refill 1 token per 3-second tick, so every digest
// message carries just 1 vulnerability — functionally equivalent to having no
// digest at all, while the message header still says "1 new vulnerability in the
// last 30 minutes". This regression does not error, and the existing end-to-end
// cases cannot see it either (they pass a large enough limit to stepDigest
// manually, bypassing the allowance calculation in step), so the decision itself
// is asserted here directly.
func TestDigestTickPlanDecouplesBatchSizeFromSendBudget(t *testing.T) {
	tokens, claimLimit := digestTickPlan()
	// One batch = one message = one request = one token. Tokens are metered in
	// messages, not vulnerabilities.
	if tokens != 1 {
		t.Fatalf("a digest batch sends only one message, so it should consume exactly 1 token, got %d", tokens)
	}
	if claimLimit != db.MaxDigestBatchSize {
		t.Fatalf("the digest batch size should be the memory bound db.MaxDigestBatchSize=%d, got %d",
			db.MaxDigestBatchSize, claimLimit)
	}
	// The key relationship: the batch size must be far larger than the per-tick
	// request budget. If the two end up on the same scale, "how many messages to
	// send" and "how many vulnerabilities a batch holds" have been conflated into
	// one number again.
	if claimLimit <= notifyMaxSendsPerChannelPerTick {
		t.Fatalf("digest batch size %d must not be bound by the per-tick request budget %d — "+
			"the request budget is \"how many requests to send\", derived backwards from the lease, a different dimension from \"how many vulnerabilities a batch holds\"",
			claimLimit, notifyMaxSendsPerChannelPerTick)
	}
}

// TestNotifyTickBudgetFitsWithinLease is another drift-prevention assertion.
//
// The per-tick delivery cap for a single channel
// (notifyMaxSendsPerChannelPerTick) is derived backwards from the lease duration:
// the worst-case duration of one tick's serial deliveries must be < the lease,
// otherwise the lease on the later rows expires before they are sent, and in a
// multi-instance deployment the peer would reclaim them and resend. These three
// constants live in different places, and changing any one of them could break
// the relationship without any error — so it is pinned down here.
func TestNotifyTickBudgetFitsWithinLease(t *testing.T) {
	worst := time.Duration(notifyMaxSendsPerChannelPerTick) * notifySendTimeout
	if worst >= notifyLease {
		t.Fatalf("the worst-case duration of one tick for a single channel %v must not reach or exceed the lease %v"+
			" (notifyMaxSendsPerChannelPerTick=%d × notifySendTimeout=%v) — "+
			"changing any of these three constants requires checking the other two",
			worst, notifyLease, notifyMaxSendsPerChannelPerTick, notifySendTimeout)
	}
}

// TestNotifyLimitValue pins how a stored render limit is resolved. The case that
// matters is "0": it is a real value (no truncation) and must not be read as
// "unset", while anything unparseable or outside the bounds falls back to the
// default instead of reaching the renderer.
func TestNotifyLimitValue(t *testing.T) {
	const def, max = 120, 4000
	cases := []struct {
		v    string
		ok   bool
		want int
	}{
		{"", false, def},
		{"0", true, 0},
		{" 500 ", true, 500},
		{"4000", true, max},
		{"4001", true, def},
		{"-1", true, def},
		{"abc", true, def},
		{"", true, def},
	}
	for _, tc := range cases {
		if got := notifyLimitValue(tc.v, tc.ok, def, max); got != tc.want {
			t.Errorf("notifyLimitValue(%q, %v) = %d, want %d", tc.v, tc.ok, got, tc.want)
		}
	}
}
