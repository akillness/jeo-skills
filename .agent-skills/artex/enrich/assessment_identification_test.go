package enrich

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Autumn-27/artex/config"
	"github.com/Autumn-27/artex/egress"
	"github.com/Autumn-27/artex/intercept"
)

func TestAssessmentEnrichmentUserAgent(t *testing.T) {
	const taggedUA = "ARTEX-Assessment/1.0 (engagement=FS-17)"
	const legacyUA = "LegacyFixture/1.2"
	prev := egress.CurrentProfile()
	t.Cleanup(func() { egress.SetProfile(prev) })
	t.Setenv("ARTEX_TARGET_USER_AGENT", legacyUA)
	legacy, ok := egress.ProfileByName("balanced")
	if !ok {
		t.Fatal("balanced noise profile unavailable")
	}

	type observation struct{ path, ua string }
	received := make(chan observation, 16)
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received <- observation{r.URL.Path, r.UserAgent()}
		if r.URL.Path == "/redirect" {
			http.Redirect(w, r, "/follow", http.StatusFound)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	outside := httptest.NewServer(handler)
	t.Cleanup(outside.Close)
	// The wire behavior only needs the real HTTP client. Use the existing
	// unreachable database fixture for the persistence step.
	e := &Engine{as: deadAssetStore(t), client: buildClient(nil)}
	identity := func(reference string) config.AssessmentIdentity {
		var value config.AssessmentIdentity
		raw := fmt.Sprintf(`{"reference":%q,"origins":[%q]}`, reference, srv.URL)
		if err := json.Unmarshal([]byte(raw), &value); err != nil {
			t.Fatal(err)
		}
		return value
	}
	tagged, base := identity("FS-17"), identity("")

	for _, tc := range []struct {
		path, id string
		identity config.AssessmentIdentity
		want     string
		legacy   bool
		outside  bool
	}{
		{path: "/tagged", id: "42", identity: tagged, want: taggedUA},
		{path: "/untagged", id: "43", want: "Go-http-client/1.1"},
		{path: "/base", id: "44", identity: base, want: "ARTEX-Assessment/1.0"},
		{path: "/tagged-with-legacy", id: "42", identity: tagged, legacy: true, want: taggedUA},
		{path: "/untagged-with-legacy", id: "43", legacy: true, want: legacyUA},
		{path: "/redirect", id: "42", identity: tagged, want: taggedUA},
		{path: "/outside", id: "42", identity: tagged, outside: true, want: "Go-http-client/1.1"},
	} {
		t.Run(tc.path[1:], func(t *testing.T) {
			profile := egress.Profile{Name: "off"}
			if tc.legacy {
				profile = legacy
			}
			egress.SetProfile(profile)
			ctx := intercept.WithTargetScope(context.Background(), intercept.TargetScope{
				TaskID: tc.id, AssessmentIdentity: tc.identity,
			})
			target := srv
			if tc.outside {
				target = outside
			}
			e.doHTTP(ctx, 1, target.URL+tc.path)
			select {
			case got := <-received:
				if want := (observation{tc.path, tc.want}); got != want {
					t.Errorf("observed %v, want %v", got, want)
				}
			default:
				t.Fatal("local server received no request")
			}
			if len(received) != 0 {
				t.Fatalf("unexpected additional requests: %d", len(received))
			}
		})
	}
}
