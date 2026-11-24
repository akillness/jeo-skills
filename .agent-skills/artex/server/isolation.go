package server

import (
	"fmt"
	"log"
	"strings"
)

// Startup self-test of agent isolation. Before the stores open, the server checks
// that what an agent can run really is isolated from it: IsolationSelfTest
// (isolation_unix.go) starts a probe through the Bash shim, the way the agent's Bash
// starts, and checks from inside it that it runs as the executor, cannot read the
// server's secrets or its process, sees only the allowlisted environment and cannot
// open a database session without the server's password; it also checks that the
// file tools cannot read the secrets. EnforceIsolation then decides the start:
//
//   - The self-test passes: the server starts isolated.
//   - Linux with the privilege drop on (the server is root, as in the Docker image):
//     isolation is expected there and the self-test shows it is broken, so the start
//     stops. The development escape -dev-insecure-no-isolation, off by default, lets
//     it go on degraded.
//   - Anywhere else (not Linux, the server is not root, or -exec-uid=-1): isolation
//     cannot be built on that host, so the server starts degraded without any flag.
//     The systemd unit (non-root), dev.sh, Windows and macOS start as before.
//
// A degraded start logs a warning banner that says what is exposed, and reports the
// state in GET /api/health to a signed-in caller, which the web UI shows as a
// banner on every page.

// DevNoIsolationFlag is the command-line flag of the development escape.
const DevNoIsolationFlag = "dev-insecure-no-isolation"

// The isolation modes the server reports.
const (
	IsolationIsolated = "isolated"
	IsolationDegraded = "degraded"
)

// IsolationStatus is the agent isolation the server runs with.
type IsolationStatus struct {
	Mode string `json:"mode"`
	// Reason is the self-test failure of a degraded start.
	Reason string `json:"reason,omitempty"`
}

// WithIsolationStatus records the result of EnforceIsolation for GET /api/health.
func WithIsolationStatus(st IsolationStatus) Option {
	return func(s *Server) { s.isolation = st }
}

// IsolationTargets are the server's paths and database the self-test checks the
// executor cannot reach.
type IsolationTargets struct {
	DataDir    string
	KeyDir     string
	ConfigPath string
	SkillDir   string
	// DSN is the server's database DSN; only its hosts, ports, user and database
	// name reach the probe, never its password.
	DSN string
}

// EnforceIsolation decides the start from the self-test result, the platform goos
// and the privilege drop p (see the rules above). It returns the status to report,
// or an error when the start must stop.
func EnforceIsolation(goos string, p ExecPrivilege, selfTest error, devEscape bool) (IsolationStatus, error) {
	if selfTest == nil {
		log.Printf("[isolation] self-test passed: agent processes and file tools run as the executor and cannot reach the server's secrets")
		if devEscape {
			log.Printf("[isolation] -%s is set and not needed: the self-test passed", DevNoIsolationFlag)
		}
		return IsolationStatus{Mode: IsolationIsolated}, nil
	}
	if isolationRequired(goos, p) && !devEscape {
		return IsolationStatus{}, fmt.Errorf("agent isolation self-test failed: %v. A Linux server running as root with the privilege drop does not start without agent isolation: fix the cause above, or pass -%s for development only", selfTest, DevNoIsolationFlag)
	}
	logDegradedBanner(selfTest, isolationRequired(goos, p))
	return IsolationStatus{Mode: IsolationDegraded, Reason: selfTest.Error()}, nil
}

// isolationRequired reports whether the host can isolate agents, so that a failed
// self-test means broken isolation: Linux, with the privilege drop on (root).
func isolationRequired(goos string, p ExecPrivilege) bool {
	return goos == "linux" && p.Enabled
}

// degradedBanner is the warning a degraded start logs. escaped is set when the start
// went on only through the development escape.
func degradedBanner(cause error, escaped bool) []string {
	bar := strings.Repeat("!", 78)
	why := "!! This host cannot isolate agents: that needs Linux and a root server with the" +
		"\n!! privilege drop (-exec-uid), as in the Docker image."
	if escaped {
		why = "!! -" + DevNoIsolationFlag + " is set. DEVELOPMENT ONLY."
	}
	lines := []string{bar, "!! AGENT ISOLATION IS DEGRADED."}
	lines = append(lines, strings.Split(why, "\n")...)
	return append(lines,
		"!! Self-test failure: "+cause.Error(),
		"!! Agent shells, custom tools, MCP stdio servers and the file tools may read the",
		"!! server's keys (JWT signing key, secret key), its config, its database",
		"!! credentials and its process, and may change skills and tools on disk.",
		"!! Do not use this mode on a server that holds real targets or credentials.",
		bar,
	)
}

func logDegradedBanner(cause error, escaped bool) {
	for _, line := range degradedBanner(cause, escaped) {
		log.Print("[isolation] " + line)
	}
}
