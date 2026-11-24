package agent

import (
	"os"
	"runtime"
	"testing"
)

// Without an identity fn runs directly.
func TestRunAsFileToolIdentityWithoutIdentity(t *testing.T) {
	SetFileToolIdentity(nil)
	ran := false
	if err := RunAsFileToolIdentity(func() { ran = true }); err != nil || !ran {
		t.Fatalf("err=%v ran=%v", err, ran)
	}
}

// A process that cannot change its ids (not root, or not Linux) gets an error and fn
// does not run: the file tools fail closed instead of running as the server.
func TestRunAsFileToolIdentityFailsClosed(t *testing.T) {
	if runtime.GOOS == "linux" && os.Geteuid() == 0 {
		t.Skip("root can change its ids")
	}
	SetFileToolIdentity(&FileToolIdentity{UID: 10001, GID: 10001})
	t.Cleanup(func() { SetFileToolIdentity(nil) })
	ran := false
	if err := RunAsFileToolIdentity(func() { ran = true }); err == nil || ran {
		t.Fatalf("err=%v ran=%v, want an error and fn not run", err, ran)
	}
	f := newConfinedFixture(t)
	if res := f.call(t, "Read", map[string]any{"file_path": "in.txt"}); !res.IsError {
		t.Fatalf("Read ran without its identity: %s", res.Flatten())
	}
}
