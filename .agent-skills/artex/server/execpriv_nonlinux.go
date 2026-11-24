//go:build unix && !linux

package server

import "errors"

// PR_SET_NO_NEW_PRIVS is Linux only. The privilege drop is never enabled elsewhere
// (execPrivilegeSupported is false), so this only keeps the unix code compiling and
// fails closed if reached.

var errNoNewPrivsUnsupported = errors.New("no_new_privs: PR_SET_NO_NEW_PRIVS is not supported on this platform")

func setNoNewPrivileges() error { return errNoNewPrivsUnsupported }

var setNoNewPrivsFn = setNoNewPrivileges
