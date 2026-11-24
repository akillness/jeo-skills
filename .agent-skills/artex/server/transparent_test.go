package server

import (
	"runtime"
	"testing"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/traffic"
)

func TestManagerTransparentTCPOptInFlag(t *testing.T) {
	// 1. Flag off (default): Manager starts NO transparent TCP listener.
	t.Setenv(traffic.TransparentTCPEnabledEnv, "")
	t.Setenv(traffic.TransparentTCPAddrEnv, "")

	mOff, err := NewManager(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	defer mOff.Close()
	if mOff.traffic == nil {
		t.Fatal("expected traffic recorder to be initialized")
	}
	if got := mOff.traffic.TransparentTCPAddr(); got != "" {
		t.Fatalf("TransparentTCPAddr with flag off = %q, want empty", got)
	}

	// 2. Flag on (ARTEX_TRANSPARENT_TCP_ADDR=127.0.0.1:0): starts on Linux,
	// stays cleanly disabled on non-Linux without crashing NewManager.
	t.Setenv(traffic.TransparentTCPAddrEnv, "127.0.0.1:0")

	mOn, err := NewManager(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	defer mOn.Close()

	gotAddr := mOn.traffic.TransparentTCPAddr()
	if runtime.GOOS == "linux" {
		if gotAddr == "" {
			t.Fatal("expected transparent TCP listener on Linux when ARTEX_TRANSPARENT_TCP_ADDR is set")
		}
	} else {
		if gotAddr != "" {
			t.Fatalf("expected transparent TCP listener disabled on %s, got %q", runtime.GOOS, gotAddr)
		}
	}
}
