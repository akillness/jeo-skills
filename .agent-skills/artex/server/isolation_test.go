package server

import (
	"bytes"
	"encoding/json"
	"errors"
	"log"
	"net/http/httptest"
	"strings"
	"testing"
)

// captureLog collects what the standard logger writes while fn runs.
func captureLog(t *testing.T, fn func()) string {
	t.Helper()
	var buf bytes.Buffer
	prev, flags := log.Writer(), log.Flags()
	log.SetOutput(&buf)
	log.SetFlags(0)
	defer func() { log.SetOutput(prev); log.SetFlags(flags) }()
	fn()
	return buf.String()
}

// The start decision, branch by branch.
func TestEnforceIsolation(t *testing.T) {
	cause := errors.New("Bash runs as uid 0, not the executor uid 10001")
	root := ExecPrivilege{Enabled: true, UID: 10001, GID: 10001} // drop on: the server is root
	off := ExecPrivilege{}                                       // not root, or -exec-uid=-1
	const banner = "AGENT ISOLATION IS DEGRADED"

	var (
		st  IsolationStatus
		err error
	)

	// Hard failure: Linux, root, self-test failed, no escape. No banner: no start.
	out := captureLog(t, func() { st, err = EnforceIsolation("linux", root, cause, false) })
	if err == nil || !strings.Contains(err.Error(), cause.Error()) || !strings.Contains(err.Error(), "-"+DevNoIsolationFlag) {
		t.Fatalf("linux root: err = %v, want the cause and the flag named", err)
	}
	if st.Mode != "" || strings.Contains(out, banner) {
		t.Fatalf("linux root: status %+v, banner in\n%s", st, out)
	}

	// Linux, root, with the development escape: degraded, banner names the flag.
	out = captureLog(t, func() { st, err = EnforceIsolation("linux", root, cause, true) })
	if err != nil || st.Mode != IsolationDegraded || st.Reason != cause.Error() {
		t.Fatalf("linux root with the escape: status %+v err %v, want degraded", st, err)
	}
	for _, want := range []string{banner, "-" + DevNoIsolationFlag, "DEVELOPMENT ONLY", cause.Error(), "keys", "database"} {
		if !strings.Contains(out, want) {
			t.Errorf("escape banner lacks %q:\n%s", want, out)
		}
	}

	// Degraded without any flag: Linux not root (the systemd unit, dev.sh), Windows,
	// macOS (root or not). The banner says why and what is exposed.
	for _, c := range []struct {
		goos string
		p    ExecPrivilege
	}{{"linux", off}, {"windows", off}, {"darwin", off}, {"darwin", root}} {
		out = captureLog(t, func() { st, err = EnforceIsolation(c.goos, c.p, cause, false) })
		if err != nil || st.Mode != IsolationDegraded || st.Reason != cause.Error() {
			t.Fatalf("%s drop=%v: status %+v err %v, want a degraded start", c.goos, c.p.Enabled, st, err)
		}
		for _, want := range []string{banner, "cannot isolate agents", cause.Error(), "keys", "database"} {
			if !strings.Contains(out, want) {
				t.Errorf("%s drop=%v: banner lacks %q:\n%s", c.goos, c.p.Enabled, want, out)
			}
		}
		if strings.Contains(out, "DEVELOPMENT ONLY") {
			t.Errorf("%s drop=%v: the degraded banner is not the escape's:\n%s", c.goos, c.p.Enabled, out)
		}
	}

	// A passing self-test starts isolated, escape or not, without a banner.
	for _, escape := range []bool{false, true} {
		out = captureLog(t, func() { st, err = EnforceIsolation("linux", root, nil, escape) })
		if err != nil || st.Mode != IsolationIsolated || !strings.Contains(out, "self-test passed") || strings.Contains(out, banner) {
			t.Fatalf("passing self-test (escape %v): status %+v err=%v\n%s", escape, st, err, out)
		}
	}
}

// GET /api/health reports the isolation status to a signed-in caller only: the web
// UI shows the degraded banner from it.
func TestHealthReportsIsolation(t *testing.T) {
	key := []byte("0123456789abcdef0123456789abcdef")
	s := &Server{jwtKey: key}
	WithIsolationStatus(IsolationStatus{Mode: IsolationDegraded, Reason: "the server is not root"})(s)

	w := httptest.NewRecorder()
	s.health(w, httptest.NewRequest("GET", "/api/health", nil))
	if got := strings.TrimSpace(w.Body.String()); got != `{"ok":true}` {
		t.Fatalf("no token: %s, want no isolation status", got)
	}

	tok, err := signJWT(key)
	if err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest("GET", "/api/health", nil)
	r.Header.Set("Authorization", "Bearer "+tok)
	w = httptest.NewRecorder()
	s.health(w, r)
	var body struct {
		Isolation *IsolationStatus `json:"isolation"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil || body.Isolation == nil ||
		body.Isolation.Mode != IsolationDegraded || body.Isolation.Reason != "the server is not root" {
		t.Fatalf("signed in: %s, want the degraded status", w.Body.String())
	}
}

// With the drop disabled (the server is not root, -exec-uid=-1, or no credentials
// on this platform) the self-test reports isolation as unavailable.
func TestIsolationSelfTestUnavailableWithoutDrop(t *testing.T) {
	if err := IsolationSelfTest(ExecPrivilege{}, IsolationTargets{}); err == nil {
		t.Fatal("a disabled drop must fail the self-test")
	}
}
