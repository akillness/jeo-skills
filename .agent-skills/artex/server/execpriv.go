package server

import (
	"fmt"
	"log"
	"os"
	"strconv"
	"sync"
)

// Agent process privilege. The server keeps running as root (the Docker image does),
// and every process the agent can start (Bash, the interactive shell, custom tools,
// stdio MCP servers) runs as the executor identity below instead. Without this a
// prompt-injected command runs as root in the same container: it reads /app/keys,
// the config file and /proc/<server-pid>/environ with root's rights.
//
// The drop is applied to the child, never to the server: SysProcAttr.Credential for
// the processes ARTEX starts itself, and for the processes the Norma library starts
// (Bash, shell, MCP stdio) a shim in the same binary that drops and then execs the
// real program. See execpriv_unix.go.

// Default executor identity. It is a numeric id, not a system account: the kernel
// accepts any uid. Override it with -exec-uid and -exec-gid.
const (
	DefaultExecUID = 10001
	DefaultExecGID = 10001
)

// execDropArg is the argv marker of the MCP drop shim:
// artex __artex-exec-drop <uid> <gid> -- <command> <args...>.
const execDropArg = "__artex-exec-drop"

// ExecPrivilege is the identity agent processes run under. The zero value is
// disabled: children keep the server's identity, which is the state before this
// change and is logged as such.
type ExecPrivilege struct {
	Enabled bool
	UID     uint32
	GID     uint32
	// ScriptDir is where custom-tool scripts are written for the executor to run.
	// PrepareExecPrivilege creates it and sets it: root-owned, outside the workspace
	// tree the executor can write.
	ScriptDir string
}

// ResolveExecPrivilege turns the -exec-uid and -exec-gid options into an
// ExecPrivilege. A negative uid disables the drop explicitly. explicit reports
// whether the operator set either option: an explicit drop that cannot be applied
// is an error (fail closed), while the default degrades to a single log line.
func ResolveExecPrivilege(uid, gid int, explicit bool) (ExecPrivilege, error) {
	if uid < 0 {
		logExecOnce("[exec] agent processes keep the server's identity (-exec-uid=%d): no privilege drop", uid)
		return ExecPrivilege{}, nil
	}
	if uid == 0 || gid <= 0 || uid > 1<<31-1 || gid > 1<<31-1 {
		return ExecPrivilege{}, fmt.Errorf("-exec-uid and -exec-gid must name an unprivileged id (got uid %d, gid %d; 0 is root)", uid, gid)
	}
	p := ExecPrivilege{Enabled: true, UID: uint32(uid), GID: uint32(gid)}
	if !execPrivilegeSupported() {
		return p.unavailable(explicit, "the privilege drop is not supported on this platform")
	}
	if !serverIsRoot() {
		return p.unavailable(explicit, "the server is not root, so it cannot start agent processes as another user")
	}
	return p, nil
}

// unavailable answers a drop that cannot be applied: an error when the operator asked
// for it, otherwise a disabled privilege with one log line that says so.
func (p ExecPrivilege) unavailable(explicit bool, why string) (ExecPrivilege, error) {
	if explicit {
		return ExecPrivilege{}, fmt.Errorf("agent process isolation cannot be applied: %s", why)
	}
	logExecOnce("[exec] same-uid isolation unavailable: %s; agent processes run with the server's identity", why)
	return ExecPrivilege{}, nil
}

var execLogOnce sync.Map

// logExecOnce logs a message once per distinct text for the life of the process.
func logExecOnce(format string, args ...any) {
	msg := fmt.Sprintf(format, args...)
	if _, loaded := execLogOnce.LoadOrStore(msg, true); !loaded {
		log.Print(msg)
	}
}

// execIDString renders an executor id for the environment and the shim arguments.
func execIDString(id uint32) string { return strconv.FormatUint(uint64(id), 10) }

// WithExecPrivilege sets the identity agent processes run under. The binary passes the
// result of ResolveExecPrivilege; tests and other callers keep the zero value.
func WithExecPrivilege(p ExecPrivilege) Option {
	return func(s *Server) { s.execPriv = p }
}

// execDropCommand returns the command line that runs command as the executor
// identity. The MCP stdio client starts its command with exec.Command and offers no
// credential, so the command becomes the server binary in drop mode (RunExecShim).
func execDropCommand(p ExecPrivilege, command string, args []string) (string, []string, error) {
	if !p.Enabled {
		return command, args, nil
	}
	self, err := os.Executable()
	if err != nil {
		return "", nil, fmt.Errorf("locate the server binary for the privilege drop: %w", err)
	}
	out := []string{execDropArg, execIDString(p.UID), execIDString(p.GID), "--", command}
	return self, append(out, args...), nil
}
