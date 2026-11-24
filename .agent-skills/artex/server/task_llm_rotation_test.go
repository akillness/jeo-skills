package server

import (
	"context"
	"fmt"
	"iter"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/Autumn-27/artex/agent"
	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/norma/llm"
)

func TestLLMProfilePinRoundTrip(t *testing.T) {
	ctx := context.Background()
	if _, ok := llmProfilePinFrom(ctx); ok {
		t.Fatal("empty context must carry no pin")
	}
	pinned := withLLMProfilePin(ctx, 42)
	got, ok := llmProfilePinFrom(pinned)
	if !ok || got != 42 {
		t.Fatalf("pin roundtrip got=%d ok=%v", got, ok)
	}
}

// Use two real HTTP provider adapters and a barrier: provider B must finish and
// another intent must start while provider A's first request is still blocked.
func TestRotationConcurrentProvidersAndPrecedence(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	defer m.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	started := make(chan int, 3)
	release := []chan struct{}{make(chan struct{}), make(chan struct{})}
	ids := []int64{}
	for i := 0; i < 2; i++ {
		i := i
		endpoint := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			started <- i
			select {
			case <-release[i]:
			case <-r.Context().Done():
				return
			}
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprint(w, `{"choices":[{"message":{"role":"assistant","content":"ok"},"finish_reason":"stop"}]}`)
		}))
		defer endpoint.Close()
		id, err := m.pg.SaveProfile(&db.LLMProfile{Name: fmt.Sprintf("rotation-http-%d-%d", time.Now().UnixNano(), i), Format: "openai", BaseURL: endpoint.URL + "/v1", Model: "test", APIKey: "test-key"})
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, id)
		defer m.pg.DeleteProfile(id)
	}
	// Release blocked handlers even when an assertion fails.
	defer func() {
		for _, ch := range release {
			select {
			case <-ch:
			default:
				close(ch)
			}
		}
	}()
	on := true
	task, err := m.CreateTaskWithOptions("rotation HTTP", "test", db.TaskCreateOptions{LLMProfileIDs: ids, LLMRotate: &on})
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		_, _ = m.pg.Exec(`DELETE FROM llm_usage WHERE task_id = $1`, task.ID)
		_, _ = m.DeleteTask(task.ID, DeleteTaskOptions{})
	}()
	s := &Server{m: m, provByProfile: map[int64]*provEntry{}}
	runtime := &taskLLMRuntime{s: s, taskID: task.ID, agentKey: "worker"}
	done := make(chan error, 3)
	dispatch := func(want int) {
		t.Helper()
		head, _ := task.nextRotatedProfile()
		go func() {
			_, _, _, err := runtime.Complete(withLLMProfilePin(ctx, head), llm.CompletionRequest{})
			done <- err
		}()
		select {
		case got := <-started:
			if got != want {
				t.Fatalf("provider=%d want=%d", got, want)
			}
		case <-ctx.Done():
			t.Fatal("provider request did not start concurrently")
		}
	}
	dispatch(0)
	dispatch(1)
	close(release[1])
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-ctx.Done():
		t.Fatal(ctx.Err())
	}
	dispatch(0)
	close(release[0])
	for i := 0; i < 2; i++ {
		select {
		case err := <-done:
			if err != nil {
				t.Fatal(err)
			}
		case <-ctx.Done():
			t.Fatal(ctx.Err())
		}
	}
	// An exhausted pin must fall back rather than retry the failed provider forever.
	n, _ := parseTaskID(task.ID)
	if _, err := m.pg.MarkTaskLLMProfileQuotaExhausted(n, ids[1], "insufficient_quota"); err != nil {
		t.Fatal(err)
	}
	sel, err := runtime.currentFor(withLLMProfilePin(ctx, ids[1]))
	if err != nil || sel.profileID != ids[0] {
		t.Fatalf("exhausted pin selected: %+v, %v", sel, err)
	}
	if err := m.pg.SetAgentLLMProfile("worker", &ids[1]); err != nil {
		t.Fatal(err)
	}
	defer m.pg.SetAgentLLMProfile("worker", nil)
	sel, err = runtime.currentFor(withLLMProfilePin(ctx, ids[0]))
	if err != nil || sel.profileID != 0 {
		t.Fatalf("fixed binding did not outrank rotation: %+v, %v", sel, err)
	}
	off := false
	if _, err := m.ReplaceTaskLLMProfiles(task.ID, []int64{ids[1], ids[0]}, 0, &off); err != nil {
		t.Fatal(err)
	}
	if task.llmStateSnapshot().Rotate || taskDTO(task, "idle").LLMRotate {
		t.Fatal("live task or API response retained disabled rotation")
	}
	if _, err := m.ReplaceTaskLLMProfiles(task.ID, ids, 0, &on); err != nil {
		t.Fatal(err)
	}
	pt, err := m.pg.GetTask(n)
	if err != nil {
		t.Fatal(err)
	}
	reloaded := taskFromPG(pt, task.Store, m.interceptor)
	if !reloaded.llmStateSnapshot().Rotate {
		t.Fatal("task reload lost enabled rotation")
	}
}

func TestRotationConcurrentDispatchAndUpdates(t *testing.T) {
	task := &Task{LLMProfileIDs: []int64{1, 2}, LLMRotate: true}
	const workers = 100
	counts := make(chan int64, workers)
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			id, ok := task.nextRotatedProfile()
			if !ok {
				t.Error("missing assignment")
				return
			}
			counts <- id
		}()
	}
	wg.Wait()
	close(counts)
	got := map[int64]int{}
	for id := range counts {
		got[id]++
	}
	if got[1] != workers/2 || got[2] != workers/2 {
		t.Fatalf("unbalanced assignments: %v", got)
	}
	// Replace the chain while dispatching, exercising the shared list lock.
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < workers; i++ {
			task.setLLMState(nil, nil, []int64{3, 4}, int64(i+1), "ready", "", i%2 == 0)
		}
	}()
	for i := 0; i < workers; i++ {
		task.nextRotatedProfile()
		task.llmStateSnapshot()
	}
	wg.Wait()
}

func TestNextRotatedProfileRoundRobin(t *testing.T) {
	tk := &Task{LLMProfileIDs: []int64{3, 1, 2}, LLMRotate: true}
	want := []int64{3, 1, 2, 3, 1}
	for i, w := range want {
		got, ok := tk.nextRotatedProfile()
		if !ok || got != w {
			t.Fatalf("rotation %d: got=%d ok=%v want=%d", i, got, ok, w)
		}
	}
	if _, ok := (&Task{}).nextRotatedProfile(); ok {
		t.Fatal("empty chain must not rotate")
	}
	tk.setLLMState(nil, nil, []int64{3, 1, 2}, 1, "ready", "", false)
	if _, ok := tk.nextRotatedProfile(); ok {
		t.Fatal("disabled rotation must not assign a pin")
	}
}

type pinCapture struct {
	id int64
	ok bool
}

type pinCaptureProvider struct {
	mu   sync.Mutex
	seen []pinCapture
}

func (p *pinCaptureProvider) record(ctx context.Context) {
	id, ok := llmProfilePinFrom(ctx)
	p.mu.Lock()
	p.seen = append(p.seen, pinCapture{id: id, ok: ok})
	p.mu.Unlock()
}

func (p *pinCaptureProvider) Stream(ctx context.Context, _ llm.CompletionRequest) iter.Seq2[llm.StreamEvent, error] {
	p.record(ctx)
	return func(yield func(llm.StreamEvent, error) bool) {
		if !yield(llm.StreamEvent{Type: llm.SETextDelta, Text: "done"}, nil) {
			return
		}
		if !yield(llm.StreamEvent{Type: llm.SEMessageDelta, StopReason: "end_turn"}, nil) {
			return
		}
		yield(llm.StreamEvent{Type: llm.SEMessageStop}, nil)
	}
}

func (p *pinCaptureProvider) Complete(ctx context.Context, _ llm.CompletionRequest) (llm.Message, string, llm.Usage, error) {
	p.record(ctx)
	return llm.Message{Role: llm.RoleAssistant, Content: []llm.ContentBlock{llm.TextBlock("done")}}, "end_turn", llm.Usage{}, nil
}

// Regression test for #376 (DB-free): warming e.execContextFor first (as the
// planner does) must not drop the per-intent LLM profile pin on subsequent
// worker intents, and a paused/deleting rollback must not advance rotation.
func TestIntentWorkContextRotatesWithCachedExecCtx(t *testing.T) {
	const (
		taskID   = "77"
		profileA = int64(101)
		profileB = int64(202)
	)
	e := NewEngine(nil)
	tk := &Task{ID: taskID, LLMProfileIDs: []int64{profileA, profileB}, LLMRotate: true}

	// Warm the per-task cached execCtx, simulating the planner running first.
	warm := e.execContextFor(context.Background(), taskID)
	if warm == nil || warm.Err() != nil {
		t.Fatalf("warm execContextFor returned invalid ctx: %v", warm)
	}

	// A paused task must roll back without advancing the rotation counter.
	e.Pause(taskID, agent.AbortPausedByUser)
	if _, _, _, ok := e.intentWorkContext(context.Background(), tk); ok {
		t.Fatal("paused task unexpectedly yielded a work context")
	}
	e.Resume(tk)
	// Re-warm cached execCtx after resume (again simulating planner before worker).
	_ = e.execContextFor(context.Background(), taskID)

	// A deleting task must also roll back without advancing the rotation counter.
	e.BeginDelete(taskID)
	if _, _, _, ok := e.intentWorkContext(context.Background(), tk); ok {
		t.Fatal("deleting task unexpectedly yielded a work context")
	}
	e.AbortDelete(taskID, false)

	// Two consecutive claimed intents must carry distinct rotated pins (A then B).
	_, workA, cancelA, ok := e.intentWorkContext(context.Background(), tk)
	if !ok {
		t.Fatal("first intentWorkContext failed")
	}
	defer cancelA(nil)
	gotA, okA := llmProfilePinFrom(workA)
	if !okA || gotA != profileA {
		t.Fatalf("first workCtx pin = (%d, %v), want (%d, true)", gotA, okA, profileA)
	}

	_, workB, cancelB, ok := e.intentWorkContext(context.Background(), tk)
	if !ok {
		t.Fatal("second intentWorkContext failed")
	}
	defer cancelB(nil)
	gotB, okB := llmProfilePinFrom(workB)
	if !okB || gotB != profileB {
		t.Fatalf("second workCtx pin = (%d, %v), want (%d, true)", gotB, okB, profileB)
	}
	if gotA == gotB {
		t.Fatalf("expected distinct pinned profile IDs, both were %d", gotA)
	}
}

// Regression test for #376 (end-to-end through runIntent): warm execContextFor
// first (simulating the planner running before workers), then run two intents
// through runIntent and assert the two work contexts carry distinct pinned
// profile IDs (A then B).
func TestRunIntentRotatesPinnedProfileWithCachedExecCtx(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable: %v", err)
	}
	defer m.Close()

	ids := make([]int64, 0, 2)
	for i := 0; i < 2; i++ {
		id, err := m.pg.SaveProfile(&db.LLMProfile{
			Name:    fmt.Sprintf("runintent-rotate-%d-%d", time.Now().UnixNano(), i),
			Format:  "openai",
			BaseURL: "http://127.0.0.1:1/v1",
			Model:   "test",
			APIKey:  "test-key",
		})
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, id)
		defer m.pg.DeleteProfile(id)
	}

	on := true
	task, err := m.CreateTaskWithOptions("runIntent rotation", "verify pin survives cached execCtx", db.TaskCreateOptions{
		LLMProfileIDs: ids,
		LLMRotate:     &on,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		_, _ = m.pg.Exec(`DELETE FROM llm_usage WHERE task_id = $1`, task.ID)
		_, _ = m.DeleteTask(task.ID, DeleteTaskOptions{})
	}()

	e := NewEngine(m)
	// Warm the per-task cached execCtx before any worker intent runs.
	_ = e.execContextFor(context.Background(), task.ID)

	// Verify paused rollback through runIntent does not advance rotation.
	if _, err := task.Store.AddIntent(map[string]any{"summary": "rolled back while paused"}, 1, nil, "planner"); err != nil {
		t.Fatal(err)
	}
	pausedIntent, pausedToken := e.claimNext(task, "work#0")
	if pausedIntent == nil {
		t.Fatal("failed to claim intent for paused rollback check")
	}
	e.Pause(task.ID, agent.AbortPausedByUser)
	probe := &pinCaptureProvider{}
	worker := agent.NewWorker(probe, "test-model", m.dir, nil, 0, 2)
	e.runIntent(context.Background(), task, "work#0", worker, pausedIntent, pausedToken, "", "")
	if len(probe.seen) != 0 {
		t.Fatalf("paused runIntent called provider %d times, want 0", len(probe.seen))
	}
	e.Resume(task)
	// Re-warm cached execCtx after resume (simulating planner before workers).
	_ = e.execContextFor(context.Background(), task.ID)

	// Run two intents through runIntent and assert distinct pins: ids[0] then ids[1].
	if _, err := task.Store.AddIntent(map[string]any{"summary": "rotate intent 2"}, 1, nil, "planner"); err != nil {
		t.Fatal(err)
	}
	for i, wantID := range ids {
		name := fmt.Sprintf("work#%d", i+1)
		intent, token := e.claimNext(task, name)
		if intent == nil {
			t.Fatalf("intent %d not claimed", i+1)
		}
		p := &pinCaptureProvider{}
		w := agent.NewWorker(p, "test-model", m.dir, nil, 0, 2)
		e.runIntent(context.Background(), task, name, w, intent, token, "", "")
		if len(p.seen) == 0 {
			t.Fatalf("intent %d: provider was not called", i+1)
		}
		got := p.seen[0]
		if !got.ok || got.id != wantID {
			t.Fatalf("intent %d: workCtx pin = (%d, %v), want (%d, true)", i+1, got.id, got.ok, wantID)
		}
	}
}
