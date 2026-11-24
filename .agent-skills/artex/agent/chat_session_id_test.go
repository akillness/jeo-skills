package agent

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestValidChatSessionID(t *testing.T) {
	ok := []string{
		"conv-1",
		"conv-stable",
		"conv-hook-reach",
		"conv-987654",
		"conv-dial-probe",
		"conv-redirect-probe",
		"conv-new",
		"conv-broken",
		"conv-signed",
		"conv-" + strings.Repeat("9", 19),
	}
	for _, id := range ok {
		if !validChatSessionID(id) {
			t.Fatalf("%q rejected", id)
		}
	}
	bad := []string{
		"",
		".",
		"..",
		"../etc",
		"conv/../etc",
		`conv\windows`,
		"/etc/passwd",
		"conv-1/foo",
		"a.b",
		"conv 1",
		"conv:1",
		strings.Repeat("a", maxChatSessionID+1),
	}
	for _, id := range bad {
		if validChatSessionID(id) {
			t.Fatalf("%q accepted", id)
		}
	}
}

func TestChatRejectsUnsafeSessionID(t *testing.T) {
	p := &sessionProbe{}
	workDir := t.TempDir()
	c := NewChatAgent(p, "test-model", workDir, nil, 100000)
	for _, id := range []string{"..", "../etc", "conv/../etc", `..\windows`, "/etc/passwd", "conv-1/foo"} {
		if _, err := c.Chat(t.Context(), "assistant", id, "hello", 1, 0, false, nil); err == nil {
			t.Fatalf("%q accepted", id)
		}
		if n := len(p.seen()); n != 0 {
			t.Fatalf("provider called for %q: %d calls", id, n)
		}
	}
	entries, err := os.ReadDir(workDir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("unsafe session id created %v under workDir", names(entries))
	}
	if _, err := os.Stat(filepath.Join(workDir, "etc")); !os.IsNotExist(err) {
		t.Fatalf("escaped path created: %v", err)
	}
}

func names(entries []os.DirEntry) []string {
	out := make([]string, len(entries))
	for i, e := range entries {
		out[i] = e.Name()
	}
	return out
}
