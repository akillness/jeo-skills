package agent

import (
	"strings"
	"testing"
)

// The «proved but not registered» block must reach the planner's situational block.
// Without it the counter exists and the planner never sees it. Calls without a
// lookup (nil factOnly) must not panic and must not print the block.
func TestPlannerSituationalCarriesFactOnlyBlock(t *testing.T) {
	with := plannerSituational(nil, triggerLookup{
		factOnly: func(dataEnvelope) string {
			return "\n\n[Proved but not registered: 2 finished intent(s) produced facts and NO finding.]\n"
		},
	}, nil, newDataEnvelope())
	if !strings.Contains(with, "Proved but not registered") {
		t.Fatalf("situational block lost the fact-only nudge:\n%s", with)
	}

	without := plannerSituational(nil, triggerLookup{}, nil, newDataEnvelope())
	if strings.Contains(without, "Proved but not registered") {
		t.Fatalf("empty lookup should not print the block:\n%s", without)
	}
}

// The lookup receives the round's envelope, so the block can frame its data with it.
func TestFactOnlyLookupReceivesRoundEnvelope(t *testing.T) {
	env := newDataEnvelope()
	var got dataEnvelope
	look := triggerLookup{factOnly: func(e dataEnvelope) string {
		got = e
		return ""
	}}
	_ = plannerSituational(nil, look, nil, env)
	if got.nonce != env.nonce {
		t.Fatalf("lookup got nonce %q, want the round nonce %q", got.nonce, env.nonce)
	}
}
