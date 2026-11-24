//go:build !unix

package server

// IsolationSelfTest fails: agent processes cannot run as another identity on this
// platform, so they are never isolated from the server.
func IsolationSelfTest(p ExecPrivilege, t IsolationTargets) error {
	return errExecUnsupported
}
