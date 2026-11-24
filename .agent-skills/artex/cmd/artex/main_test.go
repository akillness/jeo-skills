package main

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/Autumn-27/artex/agent"
)

// The snapshot must be serializable and must not add fields. Password masking
// itself is config.Redact's contract, covered by config/config_test.go;
// cmd/artex only passes its result through to the log line.
func TestConfigSnapshotSerializesRedactedDSN(t *testing.T) {
	redacted := "postgres://artex:***@localhost:5432/artex?sslmode=disable"
	s := configSnapshot{
		Version:         "test",
		ConfigFileFound: true,
		PGDSN:           redacted,
		PGDSNSource:     "environment variable ARTEX_PG_DSN",
		TrustedProxies:  []string{},
	}
	b, err := json.Marshal(s)
	if err != nil {
		t.Fatal(err)
	}
	out := string(b)
	if !strings.Contains(out, `"pg_dsn":"`+redacted+`"`) {
		t.Fatalf("snapshot did not serialize the redacted DSN: %s", out)
	}
}

// The shutdown cause must survive the parent context being cancelled first;
// losing it would drop the diagnostic on every graceful stop.
func TestShutdownContextPreservesNamedCause(t *testing.T) {
	signalCtx, signalCancel := context.WithCancel(context.Background())
	ctx, shutdown := shutdownContext(signalCtx)
	defer shutdown(nil)
	signalCancel()
	<-ctx.Done()
	if code, _, _, ok := agent.AbortReason(ctx); !ok || code != "shutdown" {
		t.Fatalf("code=%q ok=%v, want shutdown", code, ok)
	}
}
