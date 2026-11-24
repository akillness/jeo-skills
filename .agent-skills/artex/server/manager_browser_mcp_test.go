package server

import (
	"slices"
	"testing"
)

func TestStripProxyArgsLeavesBrowserMCPFlags(t *testing.T) {
	in := []string{"--headless", "--browser", "chromium", "--proxy-server", "http://127.0.0.1:8788"}
	got := stripProxyArgs(in)
	want := []string{"--headless", "--browser", "chromium"}
	if !slices.Equal(got, want) {
		t.Fatalf("got %q, want %q", got, want)
	}
	if in[3] != "--proxy-server" {
		t.Fatal("input mutated")
	}

	equals := []string{"--headless", "--proxy-server=http://127.0.0.1:8788", "--browser", "chromium"}
	got = stripProxyArgs(equals)
	if !slices.Equal(got, want) {
		t.Fatalf("equals form: got %q, want %q", got, want)
	}
}
