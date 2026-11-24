//go:build linux

package server

import (
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"testing"
)

const nnpShimHelperEnv = "ARTEX_NNP_SHIM_HELPER"

// PR_SET_NO_NEW_PRIVS is per thread: the thread that sets it must be the one that
// execs. This runs the real drop shim as root with GOMAXPROCS=1 and wraps
// setNoNewPrivsFn so that right after the prctl on thread M1 a helper goroutine
// steals and locks M1. If runDropShim did not call runtime.LockOSThread(), the shim
// resumes on a new thread M2 where NoNewPrivs is 0 and the exec'd program reports 0;
// with the lock it stays on M1 and reports 1. A plain "run the shim and read the
// flag" test passes without the lock, so it does not guard this regression.
func TestExecDropShimInheritsNoNewPrivs(t *testing.T) {
	if os.Geteuid() != 0 {
		t.Skip("needs root: the shim drops to the executor identity before it execs")
	}
	cmd := exec.Command(os.Args[0], "-test.run=^TestExecDropShimNoNewPrivsHelper$")
	cmd.Env = append(os.Environ(), nnpShimHelperEnv+"=1", "GOMAXPROCS=1")
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("shim helper failed: %v\n%s", err, out)
	}
	for _, line := range strings.Split(string(out), "\n") {
		if v, ok := strings.CutPrefix(line, "NoNewPrivs:"); ok {
			if got := strings.TrimSpace(v); got != "1" {
				t.Fatalf("exec'd program NoNewPrivs = %q, want 1 (thread migrated after prctl)\n%s", got, out)
			}
			return
		}
	}
	t.Fatalf("no NoNewPrivs line from the exec'd program\n%s", out)
}

// TestExecDropShimNoNewPrivsHelper is the child side: it wraps the flag setter and
// runs the drop shim. On success the shim execs /bin/sh, which prints its own status.
func TestExecDropShimNoNewPrivsHelper(t *testing.T) {
	if os.Getenv(nnpShimHelperEnv) != "1" {
		t.Skip("helper process only")
	}
	orig := setNoNewPrivsFn
	setNoNewPrivsFn = func() error {
		if err := orig(); err != nil {
			return err
		}
		// With GOMAXPROCS=1, blocking on <-locked lets this goroutine run on M1
		// (when the shim is not locked) and lock it, forcing the shim onto M2.
		// When the shim is locked to M1, the helper takes M2 and the shim resumes
		// on M1 with the flag set.
		locked := make(chan struct{})
		hold := make(chan struct{})
		go func() {
			runtime.LockOSThread()
			close(locked)
			<-hold
		}()
		<-locked
		return nil
	}
	RunExecShimIfRequested([]string{
		"artex", execDropArg, strconv.Itoa(DefaultExecUID), strconv.Itoa(DefaultExecGID), "--",
		"/bin/sh", "-c", "grep NoNewPrivs /proc/self/status",
	})
	t.Fatal("the drop shim returned instead of exec-ing the target")
}
