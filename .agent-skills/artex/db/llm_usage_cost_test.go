package db

import (
	"fmt"
	"math"
	"testing"
	"time"
)

// costProfiles saves a priced profile (EUR per million tokens: input 2.00,
// output 4.00, cache read 0.20, cache write 2.50) and an unpriced one.
func costProfiles(t *testing.T, d *DB) (priced, unpriced string) {
	t.Helper()
	suffix := time.Now().UnixNano()
	priced, unpriced = fmt.Sprintf("t-cost-priced-%d", suffix), fmt.Sprintf("t-cost-unpriced-%d", suffix)
	for _, p := range []*LLMProfile{
		{Name: priced, Format: "anthropic", Model: "m", APIKey: "k",
			PriceInputPerM: 2, PriceOutputPerM: 4, PriceCacheReadPerM: 0.2, PriceCacheWritePerM: 2.5},
		{Name: unpriced, Format: "anthropic", Model: "m", APIKey: "k"},
	} {
		id, err := d.SaveProfile(p)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { d.Exec(`DELETE FROM llm_profiles WHERE id=$1`, id) })
	}
	return priced, unpriced
}

func assertCost(t *testing.T, got *float64, want float64) {
	t.Helper()
	if got == nil {
		t.Fatalf("cost=nil, want %.2f", want)
	}
	if math.Abs(*got-want) > 1e-9 {
		t.Fatalf("cost=%.4f, want %.2f", *got, want)
	}
}

// InputTokens already includes the cache read and cache write subsets, so only
// the remainder is billed at the input price.
func TestCostSeparatesFreshReadAndWriteBuckets(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	priced, unpriced := costProfiles(t, d)
	// Every case adds 100k output tokens: 0.1 × 4.00 = 0.40.
	for _, tc := range []struct {
		name            string
		in, read, write int
		want            float64
	}{
		{"fresh", 1_000_000, 0, 0, 2.40},                          // 1M×2.00 + 0.40
		{"read_only", 1_000_000, 1_000_000, 0, 0.60},              // 0 fresh + 1M×0.20 + 0.40
		{"write_only", 1_000_000, 0, 1_000_000, 2.90},             // 0 fresh + 1M×2.50 + 0.40
		{"mixed", 1_000_000, 200_000, 300_000, 2.19},              // 500k×2.00 + 200k×0.20 + 300k×2.50 + 0.40
		{"inconsistent_gateway", 100_000, 200_000, 300_000, 1.19}, // fresh clamped to 0 + 0.04 + 0.75 + 0.40
	} {
		t.Run(tc.name, func(t *testing.T) {
			out := []ProfileUsage{
				{ProfileName: priced, InputTokens: tc.in, CacheReadTokens: tc.read, CacheWriteTokens: tc.write, OutputTokens: 100_000},
				{ProfileName: unpriced, InputTokens: tc.in, CacheReadTokens: tc.read, CacheWriteTokens: tc.write, OutputTokens: 100_000},
				{ProfileName: "t-cost-unknown-profile", InputTokens: tc.in, OutputTokens: 100_000},
			}
			if err := applyCostEur(d, out); err != nil {
				t.Fatal(err)
			}
			assertCost(t, out[0].CostEur, tc.want)
			if out[1].CostEur != nil || out[2].CostEur != nil {
				t.Fatalf("unpriced usage got a cost: %v %v", out[1].CostEur, out[2].CostEur)
			}
		})
	}
}

// Several ledger rows of one profile are summed before pricing; with no clamp
// involved the profile cost equals the sum of the per-row costs.
func TestUsageByProfileCostAggregatesRows(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	priced, unpriced := costProfiles(t, d)
	t.Cleanup(func() { d.Exec(`DELETE FROM llm_usage WHERE profile_name IN ($1,$2)`, priced, unpriced) })
	rows := []LLMUsage{
		// fresh 400k×2.00 + 200k×0.20 + 40k×4.00 = 0.80 + 0.04 + 0.16 = 1.00
		{InputTokens: 600_000, CacheRead: 200_000, OutputTokens: 40_000},
		// fresh 100k×2.00 + 300k×2.50 + 60k×4.00 = 0.20 + 0.75 + 0.24 = 1.19
		{InputTokens: 400_000, CacheWrite: 300_000, OutputTokens: 60_000},
	}
	for _, profile := range []string{priced, unpriced} {
		for _, r := range rows {
			r.ProfileName, r.Model, r.Status = profile, "m", "ok"
			if err := d.InsertLLMUsage(&r); err != nil {
				t.Fatal(err)
			}
		}
	}
	usage, err := d.UsageByProfile()
	if err != nil {
		t.Fatal(err)
	}
	found := 0
	for _, p := range usage {
		switch p.ProfileName {
		case priced:
			found++
			if p.Calls != 2 || p.InputTokens != 1_000_000 || p.CacheReadTokens != 200_000 || p.CacheWriteTokens != 300_000 || p.OutputTokens != 100_000 {
				t.Fatalf("aggregate %+v", p)
			}
			assertCost(t, p.CostEur, 2.19) // = 1.00 + 1.19, the mixed case
		case unpriced:
			found++
			if p.Calls != 2 || p.CostEur != nil {
				t.Fatalf("unpriced aggregate %+v", p)
			}
		}
	}
	if found != 2 {
		t.Fatalf("profiles missing from UsageByProfile: found %d of 2", found)
	}
}
