package agent

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The main agent and the planner work in tasks/<id>/main, a worker in
// tasks/<id>/i<N>, a chat in sessions/<id>: no run directory is an ancestor of
// another, and each is created through the server's maker when one is set.
func TestRunDirLayout(t *testing.T) {
	base := t.TempDir()
	mainDir := ensureRunDir(base, 7, 0)
	worker := ensureRunDir(base, 7, 12)
	session := EnsureSessionDir(base, "conv-3")
	task := filepath.Join(base, "tasks", "7")
	if mainDir != filepath.Join(task, "main") || worker != filepath.Join(task, "i12") || session != filepath.Join(base, "sessions", "conv-3") {
		t.Fatalf("run directories: main %s, worker %s, session %s", mainDir, worker, session)
	}
	dirs := []string{mainDir, worker, session}
	for _, dir := range dirs {
		if fi, err := os.Stat(dir); err != nil || !fi.IsDir() {
			t.Fatalf("%s was not created: %v", dir, err)
		}
		for _, other := range dirs {
			if other != dir && strings.HasPrefix(other, dir+string(filepath.Separator)) {
				t.Errorf("%s is an ancestor of %s", dir, other)
			}
		}
	}

	var made []string
	SetRunDirMaker(func(b, leaf string) error {
		if b != base {
			t.Errorf("maker base = %s, want %s", b, base)
		}
		made = append(made, leaf)
		return nil
	})
	t.Cleanup(func() { SetRunDirMaker(nil) })
	want := []string{EnsureRunDir(base, 8, 0), EnsureRunDir(base, 8, 5), EnsureSessionDir(base, "conv-4")}
	if strings.Join(made, "|") != strings.Join(want, "|") {
		t.Errorf("maker calls = %v, want %v", made, want)
	}
	if _, err := os.Stat(filepath.Join(base, "tasks", "8")); !os.IsNotExist(err) {
		t.Errorf("a run directory was created beside the maker: %v", err)
	}
}

func TestIsRunDirName(t *testing.T) {
	for name, want := range map[string]bool{
		"main": true, "i1": true, "i120": true,
		"": false, "i": false, "i1a": false, "i-1": false, "I1": false, "uploads": false, "cmd-output": false, "main2": false,
	} {
		if got := IsRunDirName(name); got != want {
			t.Errorf("IsRunDirName(%q) = %v, want %v", name, got, want)
		}
	}
}
