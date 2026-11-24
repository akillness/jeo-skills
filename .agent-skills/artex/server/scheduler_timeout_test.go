package server

import (
	"testing"

	"github.com/Autumn-27/artex/db"
)

// Tasks time out in deadline order, not in id order: a task created later with
// a shorter timeout can time out first. Each timeout must still fire once.
func TestSchedulerTaskTimeoutsFireOutOfIDOrder(t *testing.T) {
	skipWithoutDSN(t)
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { m.Close() })
	sc := &Scheduler{pg: m.pg}
	sc.newTaskTimeouts() // consume timeouts other tests left behind

	var ids [2]int64
	for i := range ids {
		task, err := m.pg.CreateTaskWithOptions("timeout order", "goal", db.TaskCreateOptions{})
		if err != nil {
			t.Fatal(err)
		}
		ids[i] = task.ID
		t.Cleanup(func() { _ = m.pg.DeleteTask(task.ID) })
	}
	older, newer := ids[0], ids[1]
	timeOut := func(id int64) {
		t.Helper()
		if _, err := m.pg.Exec(`UPDATE tasks SET status='timeout' WHERE id=$1`, id); err != nil {
			t.Fatal(err)
		}
	}
	fired := func() []int64 {
		var out []int64
		for _, e := range sc.newTaskTimeouts() {
			if e.TaskID == older || e.TaskID == newer {
				out = append(out, e.TaskID)
			}
		}
		return out
	}

	timeOut(newer)
	if got := fired(); len(got) != 1 || got[0] != newer {
		t.Fatalf("after the newer task timed out: fired %v, want [%d]", got, newer)
	}
	timeOut(older)
	if got := fired(); len(got) != 1 || got[0] != older {
		t.Fatalf("after the older task timed out: fired %v, want [%d]", got, older)
	}
	if got := fired(); len(got) != 0 {
		t.Fatalf("second scan fired %v again, want nothing", got)
	}
}
