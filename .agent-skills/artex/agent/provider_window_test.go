package agent

import "testing"

func TestContextWindowTokensDoesNotApplyCompactionFloor(t *testing.T) {
	cases := []struct {
		k, wantTokens, wantCompaction int
	}{
		{0, 200_000, 200_000},
		{-1, 200_000, 200_000},
		{8, 8_000, 32_000},
		{16, 16_000, 32_000},
		{31, 31_000, 32_000},
		{32, 32_000, 32_000},
		{200, 200_000, 200_000},
		{1000, 1_000_000, 1_000_000},
		{2000, 1_000_000, 1_000_000},
	}
	for _, tc := range cases {
		cfg := Config{ContextWindowK: tc.k}
		if got := cfg.ContextWindowTokens(); got != tc.wantTokens {
			t.Errorf("ContextWindowK=%d: ContextWindowTokens()=%d, want %d", tc.k, got, tc.wantTokens)
		}
		if got := cfg.CompactionWindow(); got != tc.wantCompaction {
			t.Errorf("ContextWindowK=%d: CompactionWindow()=%d, want %d", tc.k, got, tc.wantCompaction)
		}
	}
}
