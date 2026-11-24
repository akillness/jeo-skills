package server

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
)

// csrfRequest builds a request to http://example.com (the httptest default
// host) with the given headers. A "Cookie" value is the artex_token cookie.
func csrfRequest(method, path, body string, headers map[string]string) *http.Request {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	for k, v := range headers {
		if k == "Cookie" {
			r.AddCookie(&http.Cookie{Name: "artex_token", Value: v})
			continue
		}
		r.Header.Set(k, v)
	}
	return r
}

// A session that arrives as the artex_token cookie is sent by the browser on
// its own, so a state-changing request that carries it must come from the
// console's own origin. requireAuth is exercised directly, without a database.
func TestCookieStateChangeNeedsSameOrigin(t *testing.T) {
	s := &Server{jwtKey: []byte("0123456789abcdef0123456789abcdef")}
	tok, err := signJWT(s.jwtKey)
	if err != nil {
		t.Fatal(err)
	}
	reached := false
	h := s.requireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached = true
		w.WriteHeader(204)
	}))
	// The request host is example.com over plain HTTP, so its origin is
	// http://example.com (port 80).
	for _, tc := range []struct {
		name    string
		method  string
		headers map[string]string
		want    int
	}{
		{"cookie, matching Origin", "POST", map[string]string{"Cookie": tok, "Origin": "http://example.com"}, 204},
		{"cookie, matching Origin with the default port written out", "POST", map[string]string{"Cookie": tok, "Origin": "http://EXAMPLE.com:80"}, 204},
		{"cookie, Sec-Fetch-Site same-origin, no Origin", "POST", map[string]string{"Cookie": tok, "Sec-Fetch-Site": "same-origin"}, 204},
		// A proxy that terminates TLS or rewrites Host changes what Origin is
		// compared with; the browser's own same-origin statement still passes.
		{"cookie, Origin differs, Sec-Fetch-Site same-origin", "POST", map[string]string{"Cookie": tok, "Origin": "https://console.example.org", "Sec-Fetch-Site": "same-origin"}, 204},
		{"cookie, foreign Origin", "POST", map[string]string{"Cookie": tok, "Origin": "https://evil.example"}, 403},
		{"cookie, foreign Origin, Sec-Fetch-Site cross-site", "POST", map[string]string{"Cookie": tok, "Origin": "https://evil.example", "Sec-Fetch-Site": "cross-site"}, 403},
		{"cookie, same site on another port", "POST", map[string]string{"Cookie": tok, "Origin": "http://example.com:3000", "Sec-Fetch-Site": "same-site"}, 403},
		{"cookie, same host over another scheme", "POST", map[string]string{"Cookie": tok, "Origin": "https://example.com"}, 403},
		{"cookie, sibling subdomain", "POST", map[string]string{"Cookie": tok, "Origin": "http://a.example.com", "Sec-Fetch-Site": "same-site"}, 403},
		{"cookie, host that only starts with the request host", "POST", map[string]string{"Cookie": tok, "Origin": "http://example.com.evil.example"}, 403},
		{"cookie, opaque Origin", "POST", map[string]string{"Cookie": tok, "Origin": "null"}, 403},
		{"cookie, neither header", "POST", map[string]string{"Cookie": tok}, 403},
		{"cookie, Sec-Fetch-Site none", "POST", map[string]string{"Cookie": tok, "Sec-Fetch-Site": "none"}, 403},
		{"cookie, foreign Origin, PUT", "PUT", map[string]string{"Cookie": tok, "Origin": "https://evil.example"}, 403},
		{"cookie, foreign Origin, PATCH", "PATCH", map[string]string{"Cookie": tok, "Origin": "https://evil.example"}, 403},
		{"cookie, foreign Origin, DELETE", "DELETE", map[string]string{"Cookie": tok, "Origin": "https://evil.example"}, 403},
		{"cookie, neither header, DELETE", "DELETE", map[string]string{"Cookie": tok}, 403},
		// Reads are not state changes.
		{"cookie, foreign Origin, GET", "GET", map[string]string{"Cookie": tok, "Origin": "https://evil.example"}, 204},
		{"cookie, neither header, GET", "GET", map[string]string{"Cookie": tok}, 204},
		{"cookie, neither header, HEAD", "HEAD", map[string]string{"Cookie": tok}, 204},
		// A bearer token is not sent by the browser on its own.
		{"bearer, foreign Origin", "POST", map[string]string{"Authorization": "Bearer " + tok, "Origin": "https://evil.example"}, 204},
		{"bearer, neither header", "POST", map[string]string{"Authorization": "Bearer " + tok}, 204},
		{"bearer and cookie, foreign Origin", "DELETE", map[string]string{"Authorization": "Bearer " + tok, "Cookie": tok, "Origin": "https://evil.example"}, 204},
		// A bad bearer token does not fall back to the cookie.
		{"bad bearer and cookie, matching Origin", "POST", map[string]string{"Authorization": "Bearer nope", "Cookie": tok, "Origin": "http://example.com"}, 401},
		{"no token", "POST", map[string]string{"Origin": "http://example.com"}, 401},
	} {
		reached = false
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, csrfRequest(tc.method, "/api/mcp", "", tc.headers))
		if rec.Code != tc.want || reached != (tc.want == 204) {
			t.Errorf("%s: status=%d handler reached=%v, want %d", tc.name, rec.Code, reached, tc.want)
		}
	}

	// The token in the query string is a credential the caller holds, like the
	// bearer token; with the cookie also present the cookie is the one used.
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, csrfRequest("POST", "/api/mcp?token="+tok, "", map[string]string{"Origin": "https://evil.example"}))
	if rec.Code != 204 {
		t.Errorf("query token, foreign Origin: status=%d, want 204", rec.Code)
	}
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, csrfRequest("POST", "/api/mcp?token="+tok, "", map[string]string{"Cookie": tok, "Origin": "https://evil.example"}))
	if rec.Code != 403 {
		t.Errorf("query token and cookie, foreign Origin: status=%d, want 403", rec.Code)
	}

	// Over TLS on a non-default port the origin is https://host:port.
	for origin, want := range map[string]int{
		"https://console.test:8443": 204,
		"http://console.test:8443":  403,
		"https://console.test":      403,
		"https://console.test:8444": 403,
	} {
		r := csrfRequest("POST", "https://console.test:8443/api/mcp", "", map[string]string{"Cookie": tok, "Origin": origin})
		r.TLS = &tls.ConnectionState{}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, r)
		if rec.Code != want {
			t.Errorf("TLS request, Origin %s: status=%d, want %d", origin, rec.Code, want)
		}
	}
	// An IPv6 literal host.
	r := csrfRequest("POST", "http://[::1]:8787/api/mcp", "", map[string]string{"Cookie": tok, "Origin": "http://[::1]:8787"})
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	if rec.Code != 204 {
		t.Errorf("IPv6 host, matching Origin: status=%d, want 204", rec.Code)
	}
}

// The same rule through the real mux, on an endpoint that stores a command
// (POST /api/mcp): a foreign page must not be able to add an MCP server with
// the operator's cookie. Setup and login need no session and keep working.
func TestCookieCSRFThroughRealMux(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	if m.pg == nil {
		db.SkipNoPG(t)
	}
	defer m.Close()
	td := t.TempDir()
	ctx, cancel := context.WithCancel(context.Background())
	s := New(ctx, m, td, td, td)
	defer stopTestServer(t, s, cancel)

	stamp := time.Now().UnixNano()
	s.authHashKey = fmt.Sprintf("test.password_hash.%d", stamp)
	s.authVersionKey = fmt.Sprintf("test.password_version.%d", stamp)
	prefix := fmt.Sprintf("csrf-%d-", stamp)
	defer func() { // deferred, not t.Cleanup: it must run before m.Close
		_, _ = m.pg.Exec(`DELETE FROM settings WHERE key=$1 OR key=$2`, s.authHashKey, s.authVersionKey)
		_, _ = m.pg.Exec(`DELETE FROM mcp_servers WHERE name LIKE $1`, prefix+"%")
	}()
	s.setupMu.Lock()
	s.setupToken = "setup-ok"
	s.setupMu.Unlock()
	h := s.Handler()

	token := func(rec *httptest.ResponseRecorder) string {
		t.Helper()
		var out struct {
			Token string `json:"token"`
		}
		if rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &out) != nil || out.Token == "" {
			t.Fatalf("status=%d body=%s, want a token", rec.Code, rec.Body.String())
		}
		return out.Token
	}

	// Setup from a client that sends neither Origin nor Sec-Fetch-Site (curl).
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, csrfRequest("POST", "/api/auth/init", `{"password":"correct-horse-1","setup_token":"setup-ok"}`, nil))
	stale := token(rec)
	// Login the same way, then from the browser: the login page posts from the
	// console's own origin and may still hold the cookie of an earlier session.
	login := `{"username":"ARTEX","password":"correct-horse-1"}`
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, csrfRequest("POST", "/api/auth/login", login, nil))
	token(rec)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, csrfRequest("POST", "/api/auth/login", login, map[string]string{"Cookie": stale}))
	token(rec)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, csrfRequest("POST", "/api/auth/login", login, map[string]string{"Cookie": stale, "Origin": "http://example.com", "Sec-Fetch-Site": "same-origin"}))
	tok := token(rec)

	for _, tc := range []struct {
		name    string
		headers map[string]string
		want    int
	}{
		{"same-origin", map[string]string{"Cookie": tok, "Origin": "http://example.com", "Content-Type": "application/json"}, 200},
		// What a foreign page can send without a preflight: a text/plain body.
		{"cross-origin", map[string]string{"Cookie": tok, "Origin": "https://evil.example", "Content-Type": "text/plain"}, 403},
		{"other-port", map[string]string{"Cookie": tok, "Origin": "http://example.com:3000", "Sec-Fetch-Site": "same-site", "Content-Type": "text/plain"}, 403},
		{"no-headers", map[string]string{"Cookie": tok}, 403},
		{"bearer-cross-origin", map[string]string{"Authorization": "Bearer " + tok, "Origin": "https://evil.example"}, 200},
	} {
		name := prefix + tc.name
		body := fmt.Sprintf(`{"name":%q,"transport":"stdio","command":"sh","args":["-c","id"],"enabled":false}`, name)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, csrfRequest("POST", "/api/mcp", body, tc.headers))
		rows, err := m.pg.ListMCP()
		if err != nil {
			t.Fatal(err)
		}
		stored := false
		for _, row := range rows {
			stored = stored || row.Name == name
		}
		if rec.Code != tc.want || stored != (tc.want == 200) {
			t.Errorf("%s: status=%d MCP server stored=%v, want %d (body %s)", tc.name, rec.Code, stored, tc.want, strings.TrimSpace(rec.Body.String()))
		}
	}

	// Reads with the cookie alone still work (the log page and the event
	// streams send nothing else).
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, csrfRequest("GET", "/api/mcp", "", map[string]string{"Cookie": tok}))
	if rec.Code != 200 {
		t.Errorf("GET /api/mcp with the cookie: status=%d, want 200", rec.Code)
	}
}
