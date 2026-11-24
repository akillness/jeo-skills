package db

import (
	"fmt"
	"testing"
	"time"
)

func TestListTasksBulkHydratesTaskContext(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	// Registered FIRST so it runs LAST, after the row cleanups below.
	t.Cleanup(func() { d.Close() })

	stamp := time.Now().UnixNano()
	profileID, err := d.SaveProfile(&LLMProfile{
		Name: fmt.Sprintf("bulk-list-profile-%d", stamp), Format: "openai", Model: "test", APIKey: "test-key",
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupProfile(t, d, profileID) })
	source, err := d.CreateTask(fmt.Sprintf("bulk-list-source-%d", stamp), "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupErr(t, "source task", d.DeleteTask(source.ID)) })
	companyID, _, err := d.Companies().UpsertCompany(fmt.Sprintf("Bulk List Company %d", stamp), "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupErr(t, "company", d.Companies().DeleteCompany(companyID)) })
	child, err := d.CreateTaskWithOptions("bulk-list-child", "goal", TaskCreateOptions{
		LLMProfileIDs: []int64{profileID},
		SourceTaskIDs: []int64{source.ID},
		CompanyIDs:    []int64{companyID},
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupErr(t, "child task", d.DeleteTask(child.ID)) })

	tasks, err := d.ListTasks()
	if err != nil {
		t.Fatal(err)
	}
	var got *Task
	for _, task := range tasks {
		if task.ID == child.ID {
			got = task
			break
		}
	}
	if got == nil {
		t.Fatalf("task %d missing from list", child.ID)
	}
	if len(got.LLMProfileIDs) != 1 || got.LLMProfileIDs[0] != profileID ||
		got.ActiveLLMProfileID == nil || *got.ActiveLLMProfileID != profileID || got.LLMFailoverState != "ready" {
		t.Fatalf("LLM context was not bulk hydrated: %+v", got)
	}
	if len(got.SourceTaskIDs) != 1 || got.SourceTaskIDs[0] != source.ID {
		t.Fatalf("source task context was not bulk hydrated: %v", got.SourceTaskIDs)
	}
	if len(got.CompanyIDs) != 1 || got.CompanyIDs[0] != companyID {
		t.Fatalf("company context was not bulk hydrated: %v", got.CompanyIDs)
	}
}

func TestTaskListMetricsAll(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	// Registered FIRST so it runs LAST, after the row cleanup below.
	t.Cleanup(func() { d.Close() })

	task, err := d.CreateTask("task-list-metrics", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupErr(t, "task", d.DeleteTask(task.ID)) })

	resultAt := time.Now().Add(-time.Second).Truncate(time.Second)
	latestAt := resultAt.Add(time.Second)
	if _, err := d.Exec(`
INSERT INTO activity(
    exploration_id, kind, input_tokens, output_tokens,
    cache_read_tokens, cache_write_tokens, created_at
) VALUES ($1,'result',11,7,3,2,$2), ($1,'tool_result',999,999,999,999,$3)`,
		task.ExplorationID, resultAt, latestAt); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Exec(`
INSERT INTO exploration_nodes(exploration_id, kind, payload, state)
VALUES ($1,'goal','{}','met'), ($1,'goal','{}','open')`, task.ExplorationID); err != nil {
		t.Fatal(err)
	}

	all, err := d.TaskListMetricsAll()
	if err != nil {
		t.Fatal(err)
	}
	metrics, ok := all[task.ExplorationID]
	if !ok {
		t.Fatalf("metrics for exploration %d missing", task.ExplorationID)
	}
	if metrics.Tokens.InputTokens != 11 || metrics.Tokens.OutputTokens != 7 ||
		metrics.Tokens.CacheReadTokens != 3 || metrics.Tokens.CacheWriteTokens != 2 {
		t.Fatalf("unexpected token metrics: %+v", metrics.Tokens)
	}
	if metrics.LastActivity != latestAt.Unix() {
		t.Fatalf("last activity=%d, want %d", metrics.LastActivity, latestAt.Unix())
	}
	if metrics.Goals.Total != 2 || metrics.Goals.Met != 1 {
		t.Fatalf("unexpected goal metrics: %+v", metrics.Goals)
	}
}

// TaskListMetrics(expID) is exactly the row TaskListMetricsAll returns for that
// exploration, on every counter, and TaskListMetricsAll still lists every task.
func TestTaskListMetricsMatchesAll(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { d.Close() })

	newest := time.Now().Add(-time.Minute).Truncate(time.Second)
	seed := func(name string, n int) *Task {
		t.Helper()
		task, err := d.CreateTask(name, "goal", nil, 0, 0)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() {
			_, err := d.DeleteTaskCascade(task.ID, false, true)
			cleanupErr(t, "task "+name, err)
		})
		exp := task.ExplorationID
		// n result rows with tokens; the newest activity first, then an older row
		// with a higher id, so ordering by id instead of created_at would fail.
		for _, q := range []struct {
			sql  string
			args []any
		}{
			{`INSERT INTO activity(exploration_id,kind,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,created_at)
			 SELECT $1,'result',10,5,3,1,$3::timestamptz - interval '1 hour' FROM generate_series(1,$2::int)`, []any{exp, n, newest}},
			{`INSERT INTO activity(exploration_id,kind,created_at) VALUES ($1,'text',$2::timestamptz)`, []any{exp, newest}},
			{`INSERT INTO activity(exploration_id,kind,created_at) SELECT $1,'text',$3::timestamptz - interval '2 hours' FROM generate_series(1,$2::int)`, []any{exp, n, newest}},
			{`INSERT INTO exploration_nodes(exploration_id,kind,payload,state)
			 SELECT $1,'goal','{}',CASE WHEN g<=$2::int THEN 'met' ELSE 'open' END FROM generate_series(1,$2::int+1) g`, []any{exp, n}},
			{`INSERT INTO exploration_nodes(exploration_id,kind,payload,state)
			 SELECT $1,'intent','{}',CASE WHEN g<=$2::int THEN 'running' ELSE 'done' END FROM generate_series(1,$2::int+2) g`, []any{exp, n}},
		} {
			if _, err := d.Exec(q.sql, q.args...); err != nil {
				t.Fatal(err)
			}
		}
		if _, err := d.Exec(`INSERT INTO findings(task_id,severity)
SELECT $1, s FROM unnest(ARRAY['critical','high','high','medium','low','info']) s, generate_series(1,$2)`, task.ID, n); err != nil {
			t.Fatal(err)
		}
		return task
	}
	a := seed("task-list-metrics-a", 2)
	b := seed("task-list-metrics-b", 3)

	all, err := d.TaskListMetricsAll()
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range []struct {
		task *Task
		n    int
	}{{a, 2}, {b, 3}} {
		row, ok := all[c.task.ExplorationID]
		if !ok {
			t.Fatalf("TaskListMetricsAll misses task %d", c.task.ID)
		}
		one, err := d.TaskListMetrics(c.task.ExplorationID)
		if err != nil {
			t.Fatal(err)
		}
		if one != row {
			t.Fatalf("task %d: TaskListMetrics=%+v, TaskListMetricsAll=%+v", c.task.ID, one, row)
		}
		n := c.n
		want := TaskListMetrics{
			Tokens:         TokenUsage{InputTokens: 10 * n, OutputTokens: 5 * n, CacheReadTokens: 3 * n, CacheWriteTokens: n},
			LastActivity:   newest.Unix(),
			Goals:          GoalCounts{Total: n + 1, Met: n},
			RunningIntents: n,
			Findings:       FindingSeverityCounts{Critical: n, High: 2 * n, Medium: n, Low: n},
		}
		if one != want {
			t.Fatalf("task %d metrics=%+v, want %+v", c.task.ID, one, want)
		}
	}
	if none, err := d.TaskListMetrics(-1); err != nil || none != (TaskListMetrics{}) {
		t.Fatalf("missing exploration: %+v, %v; want zero metrics", none, err)
	}
}

// BenchmarkTaskListMetrics compares the per-exploration metrics query with the
// all-tasks one on three tasks of 40,000 activity rows each. No time assertion.
func BenchmarkTaskListMetrics(b *testing.B) {
	dsn, _, err := DSN()
	if err != nil {
		b.Skipf("no database config (%v) - skipping", err)
	}
	d, err := Open(dsn)
	if err != nil {
		b.Skipf("postgres unavailable (%v) - skipping", err)
	}
	b.Cleanup(func() { d.Close() })
	var exp int64
	for i := range 3 {
		task, err := d.CreateTask(fmt.Sprintf("bench-task-list-metrics-%d", i), "goal", nil, 0, 0)
		if err != nil {
			b.Fatal(err)
		}
		b.Cleanup(func() { _, _ = d.DeleteTaskCascade(task.ID, false, true) })
		if _, err := d.Exec(`INSERT INTO activity(exploration_id,kind,input_tokens,created_at)
SELECT $1, CASE WHEN g%20=0 THEN 'result' ELSE 'tool_use' END, 100, now() - (g||' seconds')::interval
FROM generate_series(1,40000) g`, task.ExplorationID); err != nil {
			b.Fatal(err)
		}
		exp = task.ExplorationID
	}
	if _, err := d.Exec(`ANALYZE activity`); err != nil {
		b.Fatal(err)
	}
	b.Run("one", func(b *testing.B) {
		for range b.N {
			if _, err := d.TaskListMetrics(exp); err != nil {
				b.Fatal(err)
			}
		}
	})
	b.Run("all", func(b *testing.B) {
		for range b.N {
			if _, err := d.TaskListMetricsAll(); err != nil {
				b.Fatal(err)
			}
		}
	})
}
