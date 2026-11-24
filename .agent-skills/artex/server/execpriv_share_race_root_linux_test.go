//go:build linux

package server

import (
	"os"
	"path/filepath"
	"syscall"
	"testing"
	"time"

	"github.com/Autumn-27/artex/agent"
)

// An executor can write in a shared run directory while a restore walks it.
// Replacing a regular entry with a symlink must never change a file outside it.
func TestShareWithExecGroupCannotChmodOutsideAsRoot(t *testing.T) {
	if os.Geteuid() != 0 {
		t.Skip("needs root")
	}
	base, err := os.MkdirTemp("", "artex-share-race-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(base) })
	if err := os.Chmod(base, 0o755); err != nil {
		t.Fatal(err)
	}
	run := filepath.Join(base, "run")
	if err := os.Mkdir(run, 0o775); err != nil {
		t.Fatal(err)
	}
	if err := os.Chown(run, 0, DefaultExecGID); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(run, 0o775); err != nil {
		t.Fatal(err)
	}
	secret := filepath.Join(base, "root-secret")
	if err := os.WriteFile(secret, []byte("synthetic secret"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(secret, 0o600); err != nil {
		t.Fatal(err)
	}
	agent.SetFileToolIdentity(&agent.FileToolIdentity{UID: DefaultExecUID, GID: DefaultExecGID})
	t.Cleanup(func() { agent.SetFileToolIdentity(nil) })
	var denied error
	probe := filepath.Join(run, "write-probe")
	if err := agent.RunAsFileToolIdentity(func() { denied = os.WriteFile(probe, []byte("x"), 0o600) }); err != nil {
		t.Fatal(err)
	}
	if denied != nil {
		t.Fatalf("executor cannot write in the shared run directory: %v", denied)
	}
	if err := os.Remove(probe); err != nil {
		t.Fatal(err)
	}
	if err := agent.RunAsFileToolIdentity(func() { _, denied = os.ReadFile(secret) }); err != nil {
		t.Fatal(err)
	}
	if denied == nil {
		t.Fatal("executor identity can already read root-only file")
	}
	swap := filepath.Join(run, "swap")
	stop := make(chan struct{})
	done := make(chan error, 1)
	go func() {
		done <- agent.RunAsFileToolIdentity(func() {
			for {
				select {
				case <-stop:
					return
				default:
				}
				_ = os.Remove(swap)
				_ = os.Symlink(secret, swap)
				_ = os.Remove(swap)
				_ = os.WriteFile(swap, []byte("ordinary"), 0o644)
			}
		})
	}()
	defer func() {
		close(stop)
		if err := <-done; err != nil {
			t.Error(err)
		}
	}()

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		// Concurrent replacement may make a pass fail; it must never affect secret.
		_ = shareWithExecGroup(run, DefaultExecGID)
		fi, err := os.Stat(secret)
		if err != nil {
			t.Fatal(err)
		}
		if fi.Mode().Perm() != 0o600 {
			t.Fatalf("executor swap changed root-only file mode to %04o", fi.Mode().Perm())
		}
	}
	if err := agent.RunAsFileToolIdentity(func() { _, denied = os.ReadFile(secret) }); err != nil {
		t.Fatal(err)
	}
	if denied == nil {
		t.Fatal("executor read root-only file after the walk")
	}
}

// A hard link is an alias for an inode outside the run directory. Sharing it
// would change that outside inode even though the walk never follows a symlink.
func TestShareWithExecGroupRejectsHardLinkAsRoot(t *testing.T) {
	if os.Geteuid() != 0 {
		t.Skip("needs root")
	}
	base := t.TempDir()
	run := filepath.Join(base, "run")
	if err := os.Mkdir(run, 0o755); err != nil {
		t.Fatal(err)
	}
	secret := filepath.Join(base, "root-secret")
	if err := os.WriteFile(secret, []byte("synthetic secret"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Link(secret, filepath.Join(run, "alias")); err != nil {
		t.Fatal(err)
	}
	if err := shareWithExecGroup(run, DefaultExecGID); err == nil {
		t.Fatal("shared an inode with a hard link outside the run directory")
	}
	fi, err := os.Stat(secret)
	if err != nil {
		t.Fatal(err)
	}
	if fi.Mode().Perm() != 0o600 || fi.Sys().(*syscall.Stat_t).Gid != 0 {
		t.Fatalf("changed outside file: mode %04o, gid %d", fi.Mode().Perm(), fi.Sys().(*syscall.Stat_t).Gid)
	}
}
