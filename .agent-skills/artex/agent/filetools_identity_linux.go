//go:build linux

package agent

import (
	"fmt"
	"runtime"

	"golang.org/x/sys/unix"
)

const fileIdentitySupported = true

// runWithFileIdentity runs fn on a thread of its own whose file system uid, file
// system gid and supplementary groups are those of id. On Linux these ids belong to
// the thread: setfsuid, setfsgid and the raw setgroups of x/sys/unix change the
// calling thread only (the syscall package's Setgroups changes every thread and is
// not used). The thread is locked to its goroutine and never unlocked, so the Go
// runtime ends it when the goroutine returns, on a panic or runtime.Goexit in fn
// too (the process's main thread is parked for good instead): no other goroutine
// ever runs with the changed ids, and nothing has to be restored. While it is
// locked the runtime never clones a new thread from it (the template thread does
// that), so no thread inherits the ids. A file system uid other than 0 also
// clears the file capabilities of the thread (CAP_DAC_OVERRIDE, CAP_DAC_READ_SEARCH,
// CAP_FOWNER, CAP_CHOWN and the others of capabilities(7)), so root's override does
// not apply to fn. A panic in fn is raised again in the caller.
//
// The ids cover fn's own goroutine only: a goroutine fn starts runs on another
// thread with the server's ids, and a program fn would start gets its file system
// ids reset to root's by execve. fn must open everything itself, and start nothing.
// The scope is tested in filetools_identity_scope_root_linux_test.go.
func runWithFileIdentity(id FileToolIdentity, fn func()) error {
	done := make(chan error, 1)
	var panicked any
	go func() {
		runtime.LockOSThread()
		if err := enterFileIdentity(id); err != nil {
			done <- err
			return
		}
		defer func() {
			panicked = recover()
			done <- nil
		}()
		fn()
	}()
	err := <-done
	if panicked != nil {
		panic(panicked)
	}
	return err
}

// enterFileIdentity sets the ids of the calling thread and reads them back.
// setfsuid and setfsgid report no error: each returns the previous id, and an
// invalid id (-1) changes nothing and returns the current one.
func enterFileIdentity(id FileToolIdentity) error {
	uid, gid := int(id.UID), int(id.GID)
	if err := unix.Setgroups([]int{gid}); err != nil {
		return fmt.Errorf("file tool identity: setgroups: %w", err)
	}
	_, _ = unix.SetfsgidRetGid(gid)
	_, _ = unix.SetfsuidRetUid(uid)
	curGID, _ := unix.SetfsgidRetGid(-1)
	curUID, _ := unix.SetfsuidRetUid(-1)
	groups, err := unix.Getgroups()
	if err != nil || curUID != uid || curGID != gid || len(groups) != 1 || groups[0] != gid {
		return fmt.Errorf("file tool identity %d:%d did not take effect (fsuid %d, fsgid %d, groups %v)", uid, gid, curUID, curGID, groups)
	}
	return nil
}
