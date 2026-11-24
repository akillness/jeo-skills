package server

import (
	"context"
	"testing"
	"time"
)

// stopTestServer cancels a test server's context and joins what New started.
// New restores every unfinished task in the shared database and runs its
// planner, worker and deadline loops, which write under m.dir. Call it with
// defer right after New, so it runs before m.Close and the TempDir cleanups.
func stopTestServer(t *testing.T, s *Server, cancel context.CancelFunc) {
	t.Helper()
	cancel()
	for _, task := range s.m.List() {
		s.engine.BeginDelete(task.ID)
		waitCtx, waitCancel := context.WithTimeout(context.Background(), 30*time.Second)
		if err := s.waitTaskQuiescent(waitCtx, task.ID); err != nil {
			t.Errorf("task %s still running at teardown: %v", task.ID, err)
		}
		waitCancel()
		s.engine.StopTask(task.ID)
	}
	s.archiveWG.Wait()
	<-s.side.done
}
