package server

import "testing"

// The line as the default slog handler writes it through the standard logger.
func TestParseLogSlogWarnLineKeepsTagAndLevel(t *testing.T) {
	line := "2026/11/23 13:48:50 WARN [traffic] MITM failed, falling back to passthrough host=example.com ttl=1m0s err=boom"
	got := parseLog(line)
	if got.Tag != "traffic" {
		t.Fatalf("tag = %q, want traffic", got.Tag)
	}
	if got.Level != "warn" {
		t.Fatalf("level = %q, want warn", got.Level)
	}
	want := "MITM failed, falling back to passthrough host=example.com ttl=1m0s err=boom"
	if got.Text != want {
		t.Fatalf("text = %q, want %q", got.Text, want)
	}
}

func TestParseLogSlogLevelWords(t *testing.T) {
	cases := map[string]string{
		"2026/11/23 13:48:50 INFO [egress] noise profile active profile=balanced": "info",
		"2026/11/23 13:48:50 DEBUG [enrich] probe":                                "info",
		"2026/11/23 13:48:50 ERROR [evidence] cleanup failed err=disk":            "error",
	}
	for line, level := range cases {
		if got := parseLog(line); got.Level != level {
			t.Fatalf("%q: level = %q, want %q", line, got.Level, level)
		}
	}
}

// Lines without a level word keep the keyword guess and the leading-tag rule.
func TestParseLogWithoutLevelWordKeepsRules(t *testing.T) {
	got := parseLog("2026/11/23 13:48:50 [pg] connection refused")
	if got.Tag != "pg" || got.Level != "error" {
		t.Fatalf("tag/level = %q/%q, want pg/error", got.Tag, got.Level)
	}
	if got.Text != "[pg] connection refused" {
		t.Fatalf("text = %q, want the line with its tag", got.Text)
	}
}
