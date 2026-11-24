package agent

import (
	"strings"
	"testing"
)

func TestClipBodyFlattensNewlines(t *testing.T) {
	got := clipBody("ok\r\ninjected log line\n")
	if strings.Contains(got, "\n") || strings.Contains(got, "\r") {
		t.Fatalf("clipBody kept a line break: %q", got)
	}
	if !strings.Contains(got, "injected log line") {
		t.Fatalf("clipBody dropped the text: %q", got)
	}
}
