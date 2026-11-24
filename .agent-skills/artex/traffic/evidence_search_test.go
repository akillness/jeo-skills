package traffic

import (
	"testing"
	"time"
)

// ResponseContaining matches only the response side, inside the time window:
// a line that appears only in a request, or a capture outside the window, must
// not classify a fact as target-authored (#124 row 1, step 3).
func TestResponseContaining(t *testing.T) {
	tr, _ := openTraffic(t)
	tr.record(newFlow("target.example", "GET", "/login",
		[]byte("request-only-marker-abc"),
		[]byte(`<html><body>welcome, internal only</body></html>`)))
	id := onlyExchangeID(t, tr)

	now := time.Now().Unix()
	got, ok, err := tr.ResponseContaining([]string{"internal only"}, now-60, now+60)
	if err != nil || !ok || got != id {
		t.Fatalf("response match = %q, %v, %v; want %q, true", got, ok, err, id)
	}
	if _, ok, err := tr.ResponseContaining([]string{"request-only-marker-abc"}, now-60, now+60); err != nil || ok {
		t.Fatalf("request-side match: ok=%v err=%v, want false", ok, err)
	}
	if _, ok, err := tr.ResponseContaining([]string{"internal only"}, now+600, now+900); err != nil || ok {
		t.Fatalf("out-of-window match: ok=%v err=%v, want false", ok, err)
	}
	if _, ok, err := tr.ResponseContaining([]string{"never recorded anywhere"}, now-60, now+60); err != nil || ok {
		t.Fatalf("absent match: ok=%v err=%v, want false", ok, err)
	}
	var nilStore *Traffic
	if _, ok, err := nilStore.ResponseContaining([]string{"internal only"}, now-60, now+60); err != nil || ok {
		t.Fatalf("nil store: ok=%v err=%v, want false", ok, err)
	}
}
