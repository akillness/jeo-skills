package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
	"golang.org/x/crypto/bcrypt"
)

const changePasswordOK = "correct-horse-1"

func changePasswordRequest(remote, token string) *http.Request {
	r := httptest.NewRequest("POST", "/api/auth/change-password", nil)
	r.RemoteAddr = remote
	r.Header.Set("Authorization", "Bearer "+token)
	return r
}

func TestPasswordChangeWaitBlocksByIPAndToken(t *testing.T) {
	clk := newFakeClock()
	s := &Server{pwdLimit: newLoginLimiter(clk.now)}
	const tok = "stolen-session"
	for i := 0; i < loginMaxAttempts; i++ {
		if wait := s.passwordChangeWait(changePasswordRequest("192.0.2.50:40000", tok)); wait != 0 {
			t.Fatalf("attempt %d blocked after %v", i+1, wait)
		}
	}
	if wait := s.passwordChangeWait(changePasswordRequest("192.0.2.50:40000", tok)); wait <= 0 {
		t.Fatal("same IP and token not blocked")
	}

	s = &Server{pwdLimit: newLoginLimiter(clk.now)}
	for i := 0; i < loginMaxAttempts; i++ {
		remote := fmt.Sprintf("198.51.100.%d:40000", i+1)
		if wait := s.passwordChangeWait(changePasswordRequest(remote, tok)); wait != 0 {
			t.Fatalf("rotated IP attempt %d blocked after %v", i+1, wait)
		}
	}
	if wait := s.passwordChangeWait(changePasswordRequest("203.0.113.9:40000", tok)); wait <= 0 {
		t.Fatal("stolen token still allowed after rotating the client IP")
	}

	s = &Server{pwdLimit: newLoginLimiter(clk.now)}
	for i := 0; i < loginMaxAttempts; i++ {
		if wait := s.passwordChangeWait(changePasswordRequest("192.0.2.51:40000", tok)); wait != 0 {
			t.Fatalf("fill attempt %d blocked after %v", i+1, wait)
		}
	}
	s.passwordChangeReset(changePasswordRequest("192.0.2.51:40000", tok))
	if wait := s.passwordChangeWait(changePasswordRequest("192.0.2.51:40000", tok)); wait != 0 {
		t.Fatalf("after reset blocked after %v", wait)
	}
}

func changePasswordServer(t *testing.T, clk *fakeClock) (*Server, string, func(remote, old, neu string) *httptest.ResponseRecorder) {
	t.Helper()
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { m.Close() })

	stamp := time.Now().UnixNano()
	s := &Server{
		m:              m,
		jwtKey:         []byte("0123456789abcdef0123456789abcdef"),
		loginLimit:     newLoginLimiter(clk.now),
		pwdLimit:       newLoginLimiter(clk.now),
		authHashKey:    fmt.Sprintf("test.password_hash.%d", stamp),
		authVersionKey: fmt.Sprintf("test.password_version.%d", stamp),
	}
	t.Cleanup(func() {
		_, _ = m.pg.Exec(`DELETE FROM settings WHERE key=$1 OR key=$2`, s.authHashKey, s.authVersionKey)
	})
	hash, err := bcrypt.GenerateFromPassword([]byte(changePasswordOK), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	if err := m.pg.SetSetting(s.passwordHashKey(), string(hash)); err != nil {
		t.Fatal(err)
	}
	s.applyPasswordVersion(0)
	tok, err := signJWTVersion(s.jwtKey, 0)
	if err != nil {
		t.Fatal(err)
	}

	post := func(remote, old, neu string) *httptest.ResponseRecorder {
		body := fmt.Sprintf(`{"old_password":%q,"new_password":%q}`, old, neu)
		r := httptest.NewRequest("POST", "/api/auth/change-password", strings.NewReader(body))
		r.RemoteAddr = remote
		r.Header.Set("Authorization", "Bearer "+tok)
		w := httptest.NewRecorder()
		s.authChangePassword(w, r)
		return w
	}
	return s, tok, post
}

func TestChangePasswordRateLimitReturns429WithRetryAfter(t *testing.T) {
	clk := newFakeClock()
	_, _, post := changePasswordServer(t, clk)
	const ip = "192.0.2.40:40000"
	for i := 0; i < loginMaxAttempts; i++ {
		if w := post(ip, "wrong-password-xx", "correct-horse-9"); w.Code != 401 {
			t.Fatalf("attempt %d: status=%d want 401; body=%s", i+1, w.Code, w.Body.String())
		}
	}
	w := post(ip, changePasswordOK, "correct-horse-9")
	if w.Code != 429 {
		t.Fatalf("status=%d want 429; body=%s", w.Code, w.Body.String())
	}
	if got := w.Header().Get("Retry-After"); got != "60" {
		t.Fatalf("Retry-After=%q want 60", got)
	}
	var body struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil || body.Error == "" {
		t.Fatalf("want a JSON error body, got %s (err=%v)", w.Body.String(), err)
	}
}

func TestChangePasswordRateLimitFollowsStolenTokenAcrossIPs(t *testing.T) {
	clk := newFakeClock()
	_, _, post := changePasswordServer(t, clk)
	for i := 0; i < loginMaxAttempts; i++ {
		remote := fmt.Sprintf("198.51.100.%d:40000", i+1)
		if w := post(remote, "wrong-password-xx", "correct-horse-9"); w.Code != 401 {
			t.Fatalf("attempt %d from %s: status=%d want 401; body=%s", i+1, remote, w.Code, w.Body.String())
		}
	}
	if w := post("203.0.113.9:40000", changePasswordOK, "correct-horse-9"); w.Code != 429 {
		t.Fatalf("rotated IP: status=%d want 429; body=%s", w.Code, w.Body.String())
	}
}

func TestChangePasswordSuccessResetsCounter(t *testing.T) {
	clk := newFakeClock()
	s, tok, post := changePasswordServer(t, clk)
	const ip = "192.0.2.41:40000"
	for i := 0; i < loginMaxAttempts-1; i++ {
		if w := post(ip, "wrong-password-xx", "correct-horse-9"); w.Code != 401 {
			t.Fatalf("attempt %d: status=%d want 401; body=%s", i+1, w.Code, w.Body.String())
		}
	}
	if w := post(ip, changePasswordOK, "correct-horse-2"); w.Code != 200 {
		t.Fatalf("status=%d want 200; body=%s", w.Code, w.Body.String())
	}
	if s.sessionOK(tok) {
		t.Fatal("token from before the password change is still accepted")
	}

	w := httptest.NewRecorder()
	login := httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(`{"username":"ARTEX","password":"correct-horse-2"}`))
	login.RemoteAddr = ip
	s.authLogin(w, login)
	if w.Code != 200 {
		t.Fatalf("login after change: status=%d body=%s", w.Code, w.Body.String())
	}
	var issued struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &issued); err != nil || issued.Token == "" {
		t.Fatalf("login token: %v body=%s", err, w.Body.String())
	}

	post2 := func(old, neu string) *httptest.ResponseRecorder {
		body := fmt.Sprintf(`{"old_password":%q,"new_password":%q}`, old, neu)
		r := httptest.NewRequest("POST", "/api/auth/change-password", strings.NewReader(body))
		r.RemoteAddr = ip
		r.Header.Set("Authorization", "Bearer "+issued.Token)
		rec := httptest.NewRecorder()
		s.authChangePassword(rec, r)
		return rec
	}
	for i := 0; i < loginMaxAttempts; i++ {
		if w := post2("wrong-password-xx", "correct-horse-9"); w.Code != 401 {
			t.Fatalf("after reset attempt %d: status=%d want 401; body=%s", i+1, w.Code, w.Body.String())
		}
	}
	if w := post2("wrong-password-xx", "correct-horse-9"); w.Code != 429 {
		t.Fatalf("after reset: status=%d want 429; body=%s", w.Code, w.Body.String())
	}
}

func TestChangePasswordUnauthenticatedDoesNotCount(t *testing.T) {
	clk := newFakeClock()
	s, _, post := changePasswordServer(t, clk)
	const ip = "192.0.2.42:40000"
	body := `{"old_password":"wrong-password-xx","new_password":"correct-horse-9"}`
	for i := 0; i < loginMaxAttempts+1; i++ {
		r := httptest.NewRequest("POST", "/api/auth/change-password", strings.NewReader(body))
		r.RemoteAddr = ip
		r.Header.Set("Authorization", "Bearer not-a-token")
		w := httptest.NewRecorder()
		s.authChangePassword(w, r)
		if w.Code != 401 {
			t.Fatalf("unauthenticated attempt %d: status=%d want 401; body=%s", i+1, w.Code, w.Body.String())
		}
	}
	if w := post(ip, "wrong-password-xx", "correct-horse-9"); w.Code != 401 {
		t.Fatalf("counted unauthenticated attempts: status=%d body=%s", w.Code, w.Body.String())
	}
}
