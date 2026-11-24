package server

import (
	"net/http"
	"testing"
)

// apply_rules is a boolean in the API contract: a string or a number is a 400,
// not a silent false or true.
func TestAdversarialReplayRouteRejectsNonBoolApplyRules(t *testing.T) {
	_, replay := replayServer(t, true, false)
	for _, body := range []string{
		`{"method":"GET","url":"http://example.com/","apply_rules":"yes"}`,
		`{"method":"GET","url":"http://example.com/","apply_rules":1}`,
	} {
		w := replay(body)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("%s = %d %s, want 400", body, w.Code, w.Body)
		}
	}
}
