package agent

import (
	"os"
	"strings"
	"testing"
)

func TestUntrustedBoundaryEnabled(t *testing.T) {
	for _, tc := range []struct {
		env  string
		want bool
	}{
		{"", true},
		{"0", false},
		{"false", false},
		{"off", false},
		{"no", false},
		{" FALSE ", false},
		{"Off", false},
		{"NO", false},
		{"1", true},
		{"true", true},
		{"on", true},
		{"yes", true},
		{" TRUE ", true},
		{"anything", true},
	} {
		t.Setenv("ARTEX_UNTRUSTED_BOUNDARY", tc.env)
		if got := untrustedBoundaryEnabled(); got != tc.want {
			t.Errorf("ARTEX_UNTRUSTED_BOUNDARY=%q: got %v, want %v", tc.env, got, tc.want)
		}
	}
}

func TestUntrustedBoundaryEnabledWhenUnset(t *testing.T) {
	t.Setenv("ARTEX_UNTRUSTED_BOUNDARY", "0") // registers restoration of the original value
	os.Unsetenv("ARTEX_UNTRUSTED_BOUNDARY")
	if !untrustedBoundaryEnabled() {
		t.Fatal("ARTEX_UNTRUSTED_BOUNDARY unset: got false, want true")
	}
}

// Structural, not behavioural: the four agentcore.Options literals live inside
// run methods that need a database and an LLM provider, so this only checks
// that each source file passes the helper to the option exactly once.
func TestUntrustedBoundaryWiredInOptionsLiterals(t *testing.T) {
	const want = "UntrustedOutputBoundary: untrustedBoundaryEnabled(),"
	for _, f := range []string{"worker.go", "planner.go", "chat.go", "mainagent.go"} {
		src, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		n := 0
		for _, line := range strings.Split(string(src), "\n") {
			if strings.TrimSpace(line) == want {
				n++
			}
		}
		if n != 1 {
			t.Errorf("%s: %d lines equal to %q, want 1", f, n, want)
		}
	}
}
