//go:build linux

package server

import (
	"errors"
	"os"
	"runtime"
	"strings"
	"testing"
)

// noNewPrivsOfThread reads the NoNewPrivs flag of the calling thread from /proc.
func noNewPrivsOfThread(t *testing.T) string {
	t.Helper()
	b, err := os.ReadFile("/proc/thread-self/status")
	if err != nil {
		t.Fatal(err)
	}
	for _, line := range strings.Split(string(b), "\n") {
		if v, ok := strings.CutPrefix(line, "NoNewPrivs:"); ok {
			return strings.TrimSpace(v)
		}
	}
	t.Fatal("no NoNewPrivs line in /proc/thread-self/status")
	return ""
}

// PR_SET_NO_NEW_PRIVS is per thread: the check reads the thread that set it.
func TestSetNoNewPrivilegesSetsTheFlag(t *testing.T) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	if err := setNoNewPrivileges(); err != nil {
		t.Fatal(err)
	}
	if got := noNewPrivsOfThread(t); got != "1" {
		t.Fatalf("NoNewPrivs = %s, want 1", got)
	}
}

// The executor shims fail closed: no identity change and no exec when the flag cannot
// be set. The error names the step so the operator can see why the start stopped.
func TestEnterExecutorFailsClosedWithoutNoNewPrivs(t *testing.T) {
	old := setNoNewPrivsFn
	setNoNewPrivsFn = func() error { return errors.New("prctl refused") }
	t.Cleanup(func() { setNoNewPrivsFn = old })
	err := enterExecutor(DefaultExecUID, DefaultExecGID)
	if err == nil || !strings.Contains(err.Error(), "no_new_privs") {
		t.Fatalf("enterExecutor = %v, want a no_new_privs failure", err)
	}
}
