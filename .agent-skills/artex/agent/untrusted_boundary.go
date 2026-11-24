package agent

import (
	"os"
	"strings"
)

// UntrustedBoundaryEnabled reports whether the untrusted-output boundary is on.
// Exported for the startup configuration snapshot; the agents themselves keep
// calling the private helper below.
func UntrustedBoundaryEnabled() bool { return untrustedBoundaryEnabled() }

// untrustedBoundaryEnabled reports whether Norma's untrusted-output boundary
// (agentcore.Options.UntrustedOutputBoundary: tool results framed between
// nonce-tagged markers) is on. It is on by default: unset, empty or any other
// value keeps it on; only ARTEX_UNTRUSTED_BOUNDARY set to "0", "false", "off"
// or "no" (case- and space-insensitive) turns it off.
func untrustedBoundaryEnabled() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("ARTEX_UNTRUSTED_BOUNDARY"))) {
	case "0", "false", "off", "no":
		return false
	}
	return true
}
