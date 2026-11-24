//go:build !linux

package server

// reexecSealed is not available off Linux: only Linux has the /proc environment this
// protects, and the handoff depends on an exec that keeps the process in place.
func reexecSealed(env []string, payload []byte) error {
	return errSealUnsupported
}
