package traffic

import (
	"math"
	"testing"
)

func TestClampBlobRange(t *testing.T) {
	cases := []struct {
		name           string
		offset, length int64
		size           int64
		wantOff, wantN int64
		wantEmpty      bool
	}{
		{"zero length means rest", 2, 0, 10, 2, 8, false},
		{"negative length means rest", 2, -1, 10, 2, 8, false},
		{"exact rest", 2, 8, 10, 2, 8, false},
		{"past end", 2, 100, 10, 2, 8, false},
		{"offset at end", 10, 4, 10, 10, 0, true},
		{"offset past end", 11, 4, 10, 11, 0, true},
		{"negative offset", -3, 4, 10, 0, 4, false},
		{"empty blob", 0, 10, 0, 0, 0, true},
		{"overflow length", 1, math.MaxInt64, 10, 1, 9, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			off, n, empty := clampBlobRange(tc.offset, tc.length, tc.size)
			if off != tc.wantOff || n != tc.wantN || empty != tc.wantEmpty {
				t.Fatalf("got off=%d n=%d empty=%v, want off=%d n=%d empty=%v",
					off, n, empty, tc.wantOff, tc.wantN, tc.wantEmpty)
			}
		})
	}
}
