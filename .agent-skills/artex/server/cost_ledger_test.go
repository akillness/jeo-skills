package server

import (
	"testing"

	"github.com/Autumn-27/artex/db"
)

// The cost ledger: profile prices (EUR per 1M tokens) turn token buckets into
// EUR on the usage aggregation; unpriced profiles stay nil.
func TestCostLedgerEurOnUsage(t *testing.T) {
	skipWithoutDSN(t)
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { m.Close() })
	if m.pg == nil {
		db.SkipNoPG(t)
	}

	pid, err := m.pg.SaveProfile(&db.LLMProfile{
		Name: "cost-test", Format: "openai", Model: "m", APIKey: "k",
		PriceInputPerM: 1.5, PriceOutputPerM: 4.0, PriceCacheReadPerM: 0.15,
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = m.pg.Exec("DELETE FROM llm_profiles WHERE id=$1", pid) })

	stored, err := m.pg.ProfileByID(pid)
	if err != nil || stored == nil {
		t.Fatalf("ProfileByID: %v %v", stored, err)
	}
	if stored.PriceInputPerM != 1.5 || stored.PriceOutputPerM != 4.0 || stored.PriceCacheReadPerM != 0.15 || stored.PriceCacheWritePerM != 0 {
		t.Fatalf("prices did not round-trip: %+v", *stored)
	}

	if _, err := m.pg.Exec(`INSERT INTO llm_usage(task_id, profile_name, model, input_tokens, output_tokens, cache_read, cache_write, ts)
		VALUES ('', 'cost-test', 'm', 2000000, 500000, 1000000, 0, now())`); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = m.pg.Exec(`DELETE FROM llm_usage WHERE profile_name='cost-test'`) })

	profiles, err := m.pg.UsageByProfile()
	if err != nil {
		t.Fatal(err)
	}
	var got *float64
	for _, p := range profiles {
		if p.ProfileName == "cost-test" {
			got = p.CostEur
		}
	}
	if got == nil {
		t.Fatal("priced profile has no cost_eur")
	}
	want := 1.0*1.5 + 0.5*4.0 + 1.0*0.15 // fresh input 1M (2M incl. 1M cached) + 0.5M out + 1M cache-read = 3.65
	if d := *got - want; d > 0.001 || d < -0.001 {
		t.Fatalf("cost_eur = %v, want %v", *got, want)
	}
}
