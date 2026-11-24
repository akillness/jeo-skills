package server

import "testing"

func TestConvMessageLimit(t *testing.T) {
	if got := convMessageLimit("", 200, 200); got != 200 {
		t.Fatalf("default: %d", got)
	}
	if got := convMessageLimit("50", 200, 200); got != 50 {
		t.Fatalf("50: %d", got)
	}
	if got := convMessageLimit("2147483646", 200, 200); got != 200 {
		t.Fatalf("huge history: %d", got)
	}
	if got := convMessageLimit("2147483646", 1000, 1000); got != 1000 {
		t.Fatalf("huge since: %d", got)
	}
	if got := convMessageLimit("-1", 200, 200); got != 200 {
		t.Fatalf("negative: %d", got)
	}
}
