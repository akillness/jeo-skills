package agent

import (
	"encoding/json"
	"net/http"
	"sync/atomic"
	"testing"

	"github.com/Autumn-27/artex/egress"
	"github.com/Autumn-27/artex/intercept"
	actool "github.com/Autumn-27/norma/tool"
)

// pinNoiseOff runs t with the off noise profile, whatever ARTEX_NOISE_PROFILE says.
func pinNoiseOff(t *testing.T) {
	old := egressGovernor
	egressGovernor = func() *egress.Governor { return egress.New(egress.Profile{Name: "off"}) }
	t.Cleanup(func() { egressGovernor = old })
}

// Under a profile, two WebFetch calls on the same URL in one task both run the
// tool and its redirect gate: WebFetch results are never cached.
func TestWebFetchProfileDoesNotCache(t *testing.T) {
	pair := newRedirectPair(t)
	var checks atomic.Int64
	inner := actool.NewWebFetch(actool.WebFetchConfig{CheckRedirect: func(*http.Request, []*http.Request) error {
		checks.Add(1)
		return nil
	}})
	balanced := egress.New(egress.Profiles["balanced"])
	old := egressGovernor
	egressGovernor = func() *egress.Governor { return balanced }
	t.Cleanup(func() { egressGovernor = old })
	tool := governedFetch{inner}
	ctx := intercept.WithTargetScope(t.Context(), intercept.TargetScope{TaskID: "7"})
	for range 2 {
		res, err := tool.Call(ctx, json.RawMessage(fetchInputJSON(pair.start)), &actool.ToolContext{})
		if err != nil || res.IsError {
			t.Fatalf("WebFetch: err=%v result=%q", err, res.Flatten())
		}
	}
	if checks.Load() != 2 || pair.startHits.Load() != 2 || pair.finalHits.Load() != 2 {
		t.Fatalf("redirect checks %d, start hits %d, final hits %d; want 2 each (no cache hit)",
			checks.Load(), pair.startHits.Load(), pair.finalHits.Load())
	}
}
