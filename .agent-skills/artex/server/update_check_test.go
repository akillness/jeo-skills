package server

import (
	"context"
	"errors"
	"testing"
	"time"
)

func countingFetch(tag string, err error, calls *int) func(context.Context) (string, error) {
	return func(context.Context) (string, error) { *calls++; return tag, err }
}

func TestUpdateCheckOffByDefault(t *testing.T) {
	t.Setenv("ARTEX_UPDATE_CHECK", "")
	if updateCheckEnabled() {
		t.Fatal("update check must be off when ARTEX_UPDATE_CHECK is unset")
	}
	calls := 0
	u := &updateCheck{enabled: false, fetch: countingFetch("v9.9.9", nil, &calls)}
	if got := u.newerVersion(context.Background(), time.Now(), "2.2.0"); got != "" || calls != 0 {
		t.Fatalf("disabled: got %q with %d fetches, want no banner and no fetch", got, calls)
	}
}

func TestUpdateCheckOncePer24h(t *testing.T) {
	t0 := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	calls := 0
	u := &updateCheck{enabled: true, fetch: countingFetch("v2.3.0", nil, &calls)}
	for _, at := range []time.Duration{0, time.Hour, 23*time.Hour + 59*time.Minute} {
		if got := u.newerVersion(context.Background(), t0.Add(at), "2.2.0"); got != "v2.3.0" {
			t.Fatalf("at +%v: got %q, want v2.3.0", at, got)
		}
	}
	if calls != 1 {
		t.Fatalf("fetched %d times within 24h, want 1", calls)
	}
	u.newerVersion(context.Background(), t0.Add(24*time.Hour), "2.2.0")
	if calls != 2 {
		t.Fatalf("fetched %d times after 24h, want 2", calls)
	}
	if got := u.newerVersion(context.Background(), t0.Add(25*time.Hour), "2.3.0"); got != "" {
		t.Fatalf("up to date: got %q, want no banner", got)
	}
}

func TestUpdateCheckFailureShowsNothingAndWaits(t *testing.T) {
	t0 := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	calls := 0
	u := &updateCheck{enabled: true, fetch: countingFetch("", errors.New("rate limited"), &calls)}
	for _, at := range []time.Duration{0, time.Minute, 23 * time.Hour} {
		if got := u.newerVersion(context.Background(), t0.Add(at), "2.2.0"); got != "" {
			t.Fatalf("failed check: got %q, want no banner", got)
		}
	}
	if calls != 1 {
		t.Fatalf("failed check retried %d times within 24h, want 1 attempt", calls)
	}
}

func TestVersionLess(t *testing.T) {
	cases := []struct {
		a, b string
		want bool
	}{
		{"2.2.0", "v2.3.0", true},
		{"v2.2.0", "v2.2.0", false},
		{"2.10.0", "v2.9.0", false},
		{"2.2.0-3-gabc123-dirty", "v2.2.1", true},
		{"dev", "v9.0.0", false},
		{"2.2.0", "not-a-tag", false},
	}
	for _, c := range cases {
		if got := versionLess(c.a, c.b); got != c.want {
			t.Errorf("versionLess(%q, %q) = %v, want %v", c.a, c.b, got, c.want)
		}
	}
}
