package server

import (
	"path/filepath"
	"testing"

	"github.com/Autumn-27/artex/agent"
)

// Deleting a conversation removes the spill directory of its chat session only: the
// spills of another conversation and the session's run directory stay.
func TestRemoveConversationSpill(t *testing.T) {
	dataDir := t.TempDir()
	s := &Server{m: &Manager{dir: dataDir}}
	spill := agent.SessionSpillDir(dataDir, s.convBusyKey(5))
	if spill != filepath.Join(dataDir, "spill", "sessions", "conv-5") {
		t.Fatalf("session spill directory = %s", spill)
	}
	kept := []string{
		filepath.Join("spill", "sessions", "conv-50", "output-1-2.txt"),
		filepath.Join("spill", "tasks", "5", "output-1-3.txt"),
		filepath.Join("sessions", "conv-5", "notes.txt"),
	}
	for _, path := range append([]string{filepath.Join("spill", "sessions", "conv-5", "output-1-1.txt")}, kept...) {
		createDeleteFixture(t, dataDir, path, false)
	}
	s.removeConversationSpill(5)
	assertPathMissing(t, spill)
	for _, path := range kept {
		assertPathExists(t, filepath.Join(dataDir, path))
	}
	// A conversation that never spilled has nothing to remove.
	s.removeConversationSpill(6)
}
