//go:build !unix

package server

import (
	"errors"
	"os"
	"os/exec"
)

// Without unix credentials the privilege drop cannot be applied. ResolveExecPrivilege
// never enables it here, so these stubs only keep the package compiling; the
// functions that would act on an enabled drop return an error to fail closed.

var errExecUnsupported = errors.New("agent process isolation is not supported on this platform")

func execPrivilegeSupported() bool { return false }

func serverIsRoot() bool { return false }

func applyExecCredential(c *exec.Cmd, p ExecPrivilege) {}

func agentProcessEnv(p ExecPrivilege) []string { return os.Environ() }

func withExecKeep(p ExecPrivilege, env map[string]string) map[string]string { return env }

func prepareExecScript(p ExecPrivilege, path string) error { return nil }

func shareRestoredTaskDir(p ExecPrivilege, taskDir string) error { return nil }

func shareRestoredSpillDir(p ExecPrivilege, dir string) error { return nil }

// PrepareExecPrivilege fails when a drop is enabled; a disabled one does nothing.
func PrepareExecPrivilege(p *ExecPrivilege, dataDir, keyDir, configPath string) error {
	if p.Enabled {
		return errExecUnsupported
	}
	return nil
}

// InstallBashShim fails when a drop is enabled; a disabled one does nothing.
func InstallBashShim(p ExecPrivilege) error {
	if p.Enabled {
		return errExecUnsupported
	}
	return nil
}

// RunExecShimIfRequested does nothing: no shim is ever installed on this platform.
func RunExecShimIfRequested(argv []string) {}
