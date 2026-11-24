package server

import (
	"strings"
	"testing"
)

func TestGoalGateCheck(t *testing.T) {
	good := map[string]string{
		"url target":         "Audit " + strings.Repeat("x ", 60) + " at https://example.com/app every module for injection issues and record one finding per issue with evidence.",
		"bare domain":        strings.Repeat("probe ", 25) + "the api at target.example.org for unauthenticated data exposure, one record proof, then stop.",
		"ipv4":               strings.Repeat("recon ", 25) + "10.0.0.5 and map every listening service before any test.",
		"localhost port":     strings.Repeat("verify ", 25) + "localhost:3000 health endpoints respond identically before and after config reload.",
		"path":               strings.Repeat("review ", 25) + "the module at /app/data/core for hardcoded secrets and report each hit.",
		"targetless opt-out": "[targetless] " + strings.Repeat("summarize ", 20) + "the attached material into a prioritized hypothesis list.",
	}
	good["targetless short but marked"] = "[targetless] analyze nothing"

	bad := map[string]string{
		"no target long": strings.Repeat("do a thorough security review of everything and report anything interesting that comes up during the exploration phase of this audit, thanks. ", 2),
		"too short":      "audit the site",
		"short and bare": "find bugs",
	}
	for name, g := range good {
		if name == "targetless short+:url" {
			continue
		}
		if err := goalGateCheck(g); err != nil {
			t.Errorf("%s: unexpected error: %v", name, err)
		}
	}
	for name, g := range bad {
		if err := goalGateCheck(g); err == nil {
			t.Errorf("%s: expected error, got none", name)
		}
	}
}
