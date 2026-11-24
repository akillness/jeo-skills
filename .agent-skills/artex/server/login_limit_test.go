package server

import (
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"net/netip"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"
)

type fakeClock struct{ t time.Time }

func (c *fakeClock) now() time.Time          { return c.t }
func (c *fakeClock) advance(d time.Duration) { c.t = c.t.Add(d) }

func newFakeClock() *fakeClock { return &fakeClock{t: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)} }

// oldPassword is 8 characters: valid under the old minimum, too short for a new password now.
const oldPassword = "abcd1234"

// loginServer returns a Server whose login reads a stored hash of oldPassword
// from a stub instead of PostgreSQL.
func loginServer(t *testing.T, clk *fakeClock) (*Server, func(remote, password string, hdr map[string]string) *httptest.ResponseRecorder) {
	t.Helper()
	hash, err := bcrypt.GenerateFromPassword([]byte(oldPassword), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	getSetting := func(key string) (string, bool, error) {
		if key != authPassKey {
			return "", false, nil
		}
		return string(hash), true, nil
	}
	s := &Server{jwtKey: []byte("0123456789abcdef0123456789abcdef"), loginLimit: newLoginLimiter(clk.now), pwdLimit: newLoginLimiter(clk.now)}
	post := func(remote, password string, hdr map[string]string) *httptest.ResponseRecorder {
		body := fmt.Sprintf(`{"username":"ARTEX","password":%q}`, password)
		r := httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(body))
		r.RemoteAddr = remote
		for k, v := range hdr {
			r.Header.Set(k, v)
		}
		w := httptest.NewRecorder()
		s.login(w, r, getSetting)
		return w
	}
	return s, post
}

func failN(t *testing.T, post func(string, string, map[string]string) *httptest.ResponseRecorder, remote string, n int) {
	t.Helper()
	for i := 0; i < n; i++ {
		if w := post(remote, "wrong-password", nil); w.Code != 401 {
			t.Fatalf("attempt %d from %s: status=%d want 401; body=%s", i+1, remote, w.Code, w.Body.String())
		}
	}
}

func TestLoginRateLimitReturns429WithRetryAfter(t *testing.T) {
	clk := newFakeClock()
	_, post := loginServer(t, clk)
	const ip = "192.0.2.10:40000"
	failN(t, post, ip, loginMaxAttempts)

	w := post(ip, oldPassword, nil) // even the right password is refused while blocked
	if w.Code != 429 {
		t.Fatalf("status=%d want 429; body=%s", w.Code, w.Body.String())
	}
	if got := w.Header().Get("Retry-After"); got != "60" {
		t.Fatalf("Retry-After=%q want 60", got)
	}
	var body struct {
		Error string `json:"error"`
		Token string `json:"token"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil || body.Error == "" || body.Token != "" {
		t.Fatalf("want a JSON error body without a token, got %s (err=%v)", w.Body.String(), err)
	}

	// Each attempt while blocked doubles the wait, capped at loginMaxBlock.
	for _, want := range []string{"120", "240", "480", "900", "900"} {
		if got := post(ip, "wrong-password", nil).Header().Get("Retry-After"); got != want {
			t.Fatalf("Retry-After=%q want %s", got, want)
		}
	}

	// Once the block runs out the IP gets a fresh window.
	clk.advance(loginMaxBlock)
	if w := post(ip, oldPassword, nil); w.Code != 200 {
		t.Fatalf("after the block: status=%d want 200; body=%s", w.Code, w.Body.String())
	}
}

func TestLoginSuccessResetsCounter(t *testing.T) {
	clk := newFakeClock()
	_, post := loginServer(t, clk)
	const ip = "192.0.2.11:40000"
	failN(t, post, ip, loginMaxAttempts-1)
	if w := post(ip, oldPassword, nil); w.Code != 200 {
		t.Fatalf("status=%d want 200; body=%s", w.Code, w.Body.String())
	}
	// The counter starts over: a full budget of failures before the next block.
	failN(t, post, ip, loginMaxAttempts)
	if w := post(ip, "wrong-password", nil); w.Code != 429 {
		t.Fatalf("status=%d want 429", w.Code)
	}
}

func TestLoginRateLimitIsPerIP(t *testing.T) {
	clk := newFakeClock()
	_, post := loginServer(t, clk)
	failN(t, post, "192.0.2.12:40000", loginMaxAttempts)
	if w := post("192.0.2.12:40001", "wrong-password", nil); w.Code != 429 {
		t.Fatalf("same IP, other port: status=%d want 429", w.Code)
	}
	if w := post("198.51.100.7:40000", "wrong-password", nil); w.Code != 401 {
		t.Fatalf("other IP: status=%d want 401", w.Code)
	}
	if w := post("[2001:db8::1]:40000", oldPassword, nil); w.Code != 200 {
		t.Fatalf("other IP: status=%d want 200", w.Code)
	}
}

func TestLoginRateLimitIgnoresForwardedFor(t *testing.T) {
	clk := newFakeClock()
	_, post := loginServer(t, clk)
	const blocked = "192.0.2.13"
	failN(t, post, blocked+":40000", loginMaxAttempts)

	// A blocked peer cannot escape by claiming another address.
	for _, h := range []string{"X-Forwarded-For", "X-Real-IP"} {
		if w := post(blocked+":40000", oldPassword, map[string]string{h: "203.0.113.9"}); w.Code != 429 {
			t.Fatalf("%s from blocked peer: status=%d want 429", h, w.Code)
		}
	}
	// And another peer naming the blocked address is not blocked.
	if w := post("198.51.100.8:40000", oldPassword, map[string]string{"X-Forwarded-For": blocked}); w.Code != 200 {
		t.Fatalf("X-Forwarded-For naming the blocked IP: status=%d want 200", w.Code)
	}
}

func mustTrusted(t *testing.T, s string) []netip.Prefix {
	t.Helper()
	p, err := ParseTrustedProxies(s)
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func TestParseTrustedProxies(t *testing.T) {
	if p, err := ParseTrustedProxies(" "); err != nil || len(p) != 0 {
		t.Fatalf("empty: %v, %v; want no proxies", p, err)
	}
	p, err := ParseTrustedProxies(" 127.0.0.1/32, 10.1.2.3/8 ,::1")
	if err != nil {
		t.Fatal(err)
	}
	if got := fmt.Sprint(p); got != "[127.0.0.1/32 10.0.0.0/8 ::1/128]" {
		t.Fatalf("got %s", got)
	}
	for _, bad := range []string{"proxy.local", "10.0.0.0/33", "127.0.0.1,nope"} {
		if _, err := ParseTrustedProxies(bad); err == nil {
			t.Fatalf("%q: want an error", bad)
		}
	}
}

func TestClientIP(t *testing.T) {
	trusted := mustTrusted(t, "127.0.0.1/32,10.0.0.0/8")
	for _, tc := range []struct {
		name, remote string
		xff          []string
		trusted      []netip.Prefix
		want         string
	}{
		{"direct client, no proxies configured", "198.51.100.9:5000", nil, nil, "198.51.100.9"},
		{"direct client, proxies configured", "198.51.100.9:5000", nil, trusted, "198.51.100.9"},
		{"spoofed header, no proxies configured", "198.51.100.9:5000", []string{"203.0.113.1"}, nil, "198.51.100.9"},
		{"spoofed header from an untrusted peer", "198.51.100.9:5000", []string{"203.0.113.1"}, trusted, "198.51.100.9"},
		{"spoofed header claiming a trusted address", "198.51.100.9:5000", []string{"127.0.0.1"}, trusted, "198.51.100.9"},
		{"one trusted proxy", "127.0.0.1:5000", []string{"198.51.100.7"}, trusted, "198.51.100.7"},
		{"client-supplied entries left of the real hop", "127.0.0.1:5000", []string{"203.0.113.1, 10.0.0.9, 198.51.100.7"}, trusted, "198.51.100.7"},
		{"chain of trusted proxies", "127.0.0.1:5000", []string{"203.0.113.1, 198.51.100.7, 10.0.0.5"}, trusted, "198.51.100.7"},
		{"chain split over header lines", "127.0.0.1:5000", []string{"203.0.113.1", "198.51.100.7, 10.0.0.5"}, trusted, "198.51.100.7"},
		{"trusted proxy without the header", "127.0.0.1:5000", nil, trusted, "127.0.0.1"},
		{"unparsable hop stops the walk", "127.0.0.1:5000", []string{"198.51.100.7, garbage, 10.0.0.5"}, trusted, "10.0.0.5"},
		{"IPv6 client behind the proxy", "127.0.0.1:5000", []string{"2001:db8::7"}, trusted, "2001:db8::7"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest("GET", "/", nil)
			r.RemoteAddr = tc.remote
			for _, v := range tc.xff {
				r.Header.Add("X-Forwarded-For", v)
			}
			if got := clientIP(r, tc.trusted); got != tc.want {
				t.Fatalf("clientIP=%s want %s", got, tc.want)
			}
		})
	}
}

// Behind a trusted reverse proxy every request arrives from the proxy's address;
// the limit must still apply per real client.
func TestLoginRateLimitBehindTrustedProxy(t *testing.T) {
	clk := newFakeClock()
	s, post := loginServer(t, clk)
	s.trustedProxies = mustTrusted(t, "127.0.0.1/32")
	const proxy = "127.0.0.1:50000"
	via := func(xff string) map[string]string { return map[string]string{"X-Forwarded-For": xff} }

	for i := 0; i < loginMaxAttempts; i++ {
		if w := post(proxy, "wrong-password", via("198.51.100.20")); w.Code != 401 {
			t.Fatalf("attempt %d: status=%d want 401", i+1, w.Code)
		}
	}
	if w := post(proxy, oldPassword, via("198.51.100.20")); w.Code != 429 {
		t.Fatalf("attacker: status=%d want 429", w.Code)
	}
	// What nginx's $proxy_add_x_forwarded_for sends when the attacker adds its own header.
	if w := post(proxy, oldPassword, via("203.0.113.50, 198.51.100.20")); w.Code != 429 {
		t.Fatalf("attacker with a forged entry: status=%d want 429", w.Code)
	}
	// Another user behind the same proxy is not affected.
	if w := post(proxy, oldPassword, via("198.51.100.21")); w.Code != 200 {
		t.Fatalf("other user via the proxy: status=%d want 200", w.Code)
	}
}

// The 12-character minimum applies to new passwords only. A hash stored under the
// old 8-character minimum must still log in.
func TestEightCharPasswordLogsInButIsRejectedAsNew(t *testing.T) {
	if n := len([]rune(oldPassword)); n != 8 {
		t.Fatalf("oldPassword has %d characters, want 8", n)
	}
	_, post := loginServer(t, newFakeClock())
	w := post("192.0.2.14:40000", oldPassword, nil)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"token"`) {
		t.Fatalf("login with an existing 8-character password: status=%d body=%s", w.Code, w.Body.String())
	}
	// authInit and authChangePassword both refuse a new password through validatePassword.
	if msg := validatePassword(oldPassword); msg == "" {
		t.Fatal("validatePassword accepted an 8-character new password")
	}
}

func TestLoginLimiterSweepsIdleEntries(t *testing.T) {
	clk := newFakeClock()
	l := newLoginLimiter(clk.now)
	l.allow("192.0.2.20")
	clk.advance(loginMaxBlock - time.Second)
	l.allow("192.0.2.21") // sweeps, but .20 is not idle long enough yet
	if len(l.entries) != 2 {
		t.Fatalf("entries=%d want 2 before either is idle for %v", len(l.entries), loginMaxBlock)
	}
	clk.advance(loginSweepEvery)
	l.allow("192.0.2.22") // next sweep drops .20
	if _, ok := l.entries["192.0.2.20"]; ok || len(l.entries) != 2 {
		t.Fatalf("idle entry not swept: %d entries", len(l.entries))
	}
}

func TestLoginLimiterCapsEntries(t *testing.T) {
	l := newLoginLimiter(newFakeClock().now)
	for i := 0; i <= loginMaxEntries; i++ {
		l.allow(fmt.Sprintf("10.%d.%d.%d", i>>16&255, i>>8&255, i&255))
	}
	if len(l.entries) != loginMaxEntries {
		t.Fatalf("entries=%d want the cap %d", len(l.entries), loginMaxEntries)
	}
}

func TestEvictOldestKeepsBlockedEntries(t *testing.T) {
	clk := newFakeClock()
	l := newLoginLimiter(clk.now)
	now := clk.now()
	l.entries["blocked"] = &loginEntry{lastSeen: now.Add(-2 * time.Hour), blockedUntil: now.Add(time.Hour), block: time.Minute}
	l.entries["idle"] = &loginEntry{lastSeen: now.Add(-time.Hour)}
	l.evictOldest()
	if _, ok := l.entries["blocked"]; !ok {
		t.Fatal("evicted a blocked address while an idle one existed")
	}
	if _, ok := l.entries["idle"]; ok {
		t.Fatal("kept the idle address")
	}
}

func TestEvictOldestDropsSoonestBlockWhenAllBlocked(t *testing.T) {
	clk := newFakeClock()
	l := newLoginLimiter(clk.now)
	now := clk.now()
	l.entries["long"] = &loginEntry{lastSeen: now, blockedUntil: now.Add(2 * time.Hour)}
	l.entries["short"] = &loginEntry{lastSeen: now.Add(-time.Hour), blockedUntil: now.Add(time.Minute)}
	l.evictOldest()
	if _, ok := l.entries["short"]; ok {
		t.Fatal("kept the block that ends sooner")
	}
	if _, ok := l.entries["long"]; !ok {
		t.Fatal("evicted the longer block")
	}
}

func TestHealthHidesVersionWithoutToken(t *testing.T) {
	key := []byte("0123456789abcdef0123456789abcdef")
	s := &Server{jwtKey: key}

	w := httptest.NewRecorder()
	s.health(w, httptest.NewRequest("GET", "/api/health", nil))
	if got := strings.TrimSpace(w.Body.String()); w.Code != 200 || got != `{"ok":true}` {
		t.Fatalf("no token: status=%d body=%s want {\"ok\":true}", w.Code, got)
	}

	tok, err := signJWT(key)
	if err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest("GET", "/api/health", nil)
	r.Header.Set("Authorization", "Bearer "+tok)
	w = httptest.NewRecorder()
	s.health(w, r)
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil || body["version"] != BuildVersion || body["service"] != "artex" {
		t.Fatalf("valid token: body=%s want service and version", w.Body.String())
	}
}
