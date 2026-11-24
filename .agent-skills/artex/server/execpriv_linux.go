//go:build linux

package server

import (
	"fmt"
	"syscall"
)

// prSetNoNewPrivs is PR_SET_NO_NEW_PRIVS from linux/prctl.h. With the flag set, execve
// cannot grant privileges (setuid bits, file capabilities), so a process that dropped
// to the executor identity cannot regain root through a setuid binary.
const prSetNoNewPrivs = 38

// setNoNewPrivileges sets PR_SET_NO_NEW_PRIVS on the calling thread. The flag is per
// thread and is inherited by what that thread forks or execs.
func setNoNewPrivileges() error {
	if _, _, errno := syscall.RawSyscall6(syscall.SYS_PRCTL, prSetNoNewPrivs, 1, 0, 0, 0, 0); errno != 0 {
		return fmt.Errorf("no_new_privs: prctl(PR_SET_NO_NEW_PRIVS): %w", errno)
	}
	return nil
}

// setNoNewPrivsFn is the step the executor shims run before they drop identity. A
// variable so a test can make it fail.
var setNoNewPrivsFn = setNoNewPrivileges
