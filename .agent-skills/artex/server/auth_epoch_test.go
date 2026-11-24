package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
)

func TestPasswordVersionClaim(t *testing.T) {
	key := []byte("0123456789abcdef0123456789abcdef")
	legacy, err := signJWT(key)
	if err != nil {
		t.Fatal(err)
	}
	previous, err := signJWTVersion(key, 1)
	if err != nil {
		t.Fatal(err)
	}
	current, err := signJWTVersion(key, 2)
	if err != nil {
		t.Fatal(err)
	}
	if !verifyJWT(legacy, key, 0) {
		t.Fatal("before any password change a token must be accepted")
	}
	if verifyJWT(legacy, key, 2) || verifyJWT(previous, key, 2) {
		t.Fatal("a token from an older password version must be rejected")
	}
	if !verifyJWT(current, key, 2) {
		t.Fatal("a token carrying the current version must be accepted")
	}
	// Two signatures in the same second still differ by version.
	newest, err := signJWTVersion(key, 3)
	if err != nil {
		t.Fatal(err)
	}
	if verifyJWT(current, key, 3) {
		t.Fatal("two changes in the same second must not leave the older token valid")
	}
	if !verifyJWT(newest, key, 3) {
		t.Fatal("the newest version must be accepted")
	}
}

func TestChangePasswordRevokesOldTokenAndKeepsItWhenSaveFails(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	defer m.Close()

	stamp := time.Now().UnixNano()
	s := &Server{
		m:              m,
		jwtKey:         []byte("0123456789abcdef0123456789abcdef"),
		loginLimit:     newLoginLimiter(time.Now),
		pwdLimit:       newLoginLimiter(time.Now),
		authHashKey:    fmt.Sprintf("test.password_hash.%d", stamp),
		authVersionKey: fmt.Sprintf("test.password_version.%d", stamp),
	}
	t.Cleanup(func() {
		_, _ = m.pg.Exec(`DELETE FROM settings WHERE key=$1 OR key=$2`, s.authHashKey, s.authVersionKey)
	})

	s.setupToken = "setup-ok"
	initBody := `{"password":"correct-horse-1","setup_token":"setup-ok"}`
	w := httptest.NewRecorder()
	s.authInit(w, httptest.NewRequest("POST", "/api/auth/init", strings.NewReader(initBody)))
	if w.Code != 200 {
		t.Fatalf("init status=%d body=%s", w.Code, w.Body.String())
	}
	var issued struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &issued); err != nil || issued.Token == "" {
		t.Fatalf("init token: %v body=%s", err, w.Body.String())
	}
	if !s.sessionOK(issued.Token) {
		t.Fatal("token from init was rejected")
	}

	change := httptest.NewRequest("POST", "/api/auth/change-password", strings.NewReader(`{"old_password":"correct-horse-1","new_password":"correct-horse-2"}`))
	change.Header.Set("Authorization", "Bearer "+issued.Token)
	w = httptest.NewRecorder()
	s.authChangePassword(w, change)
	if w.Code != 200 {
		t.Fatalf("change status=%d body=%s", w.Code, w.Body.String())
	}
	if s.sessionOK(issued.Token) {
		t.Fatal("token from before the password change is still accepted")
	}

	w = httptest.NewRecorder()
	s.authLogin(w, httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(`{"username":"ARTEX","password":"correct-horse-2"}`)))
	if w.Code != 200 {
		t.Fatalf("login status=%d body=%s", w.Code, w.Body.String())
	}
	var logged struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &logged); err != nil || logged.Token == "" {
		t.Fatalf("login token: %v body=%s", err, w.Body.String())
	}
	if !s.sessionOK(logged.Token) {
		t.Fatal("replacement token was rejected")
	}

	reached := false
	s.requireAuth(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		reached = true
	})).ServeHTTP(httptest.NewRecorder(), requestWithToken("GET", "/api/tasks", issued.Token))
	if reached {
		t.Fatal("revoked token reached a protected handler")
	}

	if _, err := m.pg.Exec(`UPDATE settings SET value='not-a-number' WHERE key=$1`, s.authVersionKey); err != nil {
		t.Fatal(err)
	}
	before := s.pwdVersion.Load()
	fail := httptest.NewRequest("POST", "/api/auth/change-password", strings.NewReader(`{"old_password":"correct-horse-2","new_password":"correct-horse-3"}`))
	fail.Header.Set("Authorization", "Bearer "+logged.Token)
	w = httptest.NewRecorder()
	s.authChangePassword(w, fail)
	if w.Code != 500 {
		t.Fatalf("failed save status=%d want 500 body=%s", w.Code, w.Body.String())
	}
	if s.pwdVersion.Load() != before {
		t.Fatalf("version moved from %d to %d after a failed save", before, s.pwdVersion.Load())
	}
	if !s.sessionOK(logged.Token) {
		t.Fatal("a failed save revoked the current token")
	}
	w = httptest.NewRecorder()
	s.authLogin(w, httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(`{"username":"ARTEX","password":"correct-horse-2"}`)))
	if w.Code != 200 {
		t.Fatalf("old password after a failed save: status=%d body=%s", w.Code, w.Body.String())
	}
	w = httptest.NewRecorder()
	s.authLogin(w, httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(`{"username":"ARTEX","password":"correct-horse-3"}`)))
	if w.Code == 200 {
		t.Fatal("new password was stored even though the version write failed")
	}
}

func TestUnreadablePasswordVersionRejectsSessions(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	defer m.Close()
	key := []byte("0123456789abcdef0123456789abcdef")
	s := &Server{m: m, jwtKey: key, loginLimit: newLoginLimiter(time.Now), pwdLimit: newLoginLimiter(time.Now)}
	s.authVersionKey = fmt.Sprintf("test.password_version.%d", time.Now().UnixNano())
	tok, err := signJWTVersion(key, 1)
	if err != nil {
		t.Fatal(err)
	}
	s.applyPasswordVersion(1)
	if !s.sessionOK(tok) {
		t.Fatal("token was rejected before the read failed")
	}
	if err := m.pg.Close(); err != nil {
		t.Fatal(err)
	}
	s.loadPasswordVersion()
	if s.pwdState.Load() != pwdUnreadable {
		t.Fatalf("state=%d want unreadable", s.pwdState.Load())
	}
	if s.sessionOK(tok) {
		t.Fatal("accepted a token while the password version was unreadable")
	}
	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/auth/change-password", strings.NewReader(`{"old_password":"correct-horse-1","new_password":"correct-horse-2"}`))
	req.Header.Set("Authorization", "Bearer "+tok)
	s.authChangePassword(w, req)
	if w.Code != 401 {
		t.Fatalf("change while unreadable: status=%d want 401 body=%s", w.Code, w.Body.String())
	}
}

func TestLoginRereadsPasswordVersionWhenUnreadable(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	defer m.Close()

	stamp := time.Now().UnixNano()
	s := &Server{
		m:              m,
		jwtKey:         []byte("0123456789abcdef0123456789abcdef"),
		loginLimit:     newLoginLimiter(time.Now),
		pwdLimit:       newLoginLimiter(time.Now),
		authHashKey:    fmt.Sprintf("test.password_hash.%d", stamp),
		authVersionKey: fmt.Sprintf("test.password_version.%d", stamp),
	}
	t.Cleanup(func() {
		_, _ = m.pg.Exec(`DELETE FROM settings WHERE key=$1 OR key=$2`, s.authHashKey, s.authVersionKey)
	})
	s.setupToken = "setup-ok"
	w := httptest.NewRecorder()
	s.authInit(w, httptest.NewRequest("POST", "/api/auth/init", strings.NewReader(`{"password":"correct-horse-1","setup_token":"setup-ok"}`)))
	if w.Code != 200 {
		t.Fatalf("init status=%d body=%s", w.Code, w.Body.String())
	}
	if _, err := m.pg.Exec(`UPDATE settings SET value='not-a-number' WHERE key=$1`, s.authVersionKey); err != nil {
		t.Fatal(err)
	}
	s.pwdVersion.Store(99)
	s.loadPasswordVersion()
	if s.pwdState.Load() != pwdUnreadable {
		t.Fatalf("state=%d want unreadable", s.pwdState.Load())
	}
	w = httptest.NewRecorder()
	s.authLogin(w, httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(`{"username":"ARTEX","password":"correct-horse-1"}`)))
	if w.Code != 503 {
		t.Fatalf("login while unreadable: status=%d want 503 body=%s", w.Code, w.Body.String())
	}
	if s.pwdState.Load() != pwdUnreadable {
		t.Fatal("a failed reread opened sessions")
	}

	if _, err := m.pg.Exec(`UPDATE settings SET value='1' WHERE key=$1`, s.authVersionKey); err != nil {
		t.Fatal(err)
	}
	w = httptest.NewRecorder()
	s.authLogin(w, httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(`{"username":"ARTEX","password":"correct-horse-1"}`)))
	if w.Code != 200 {
		t.Fatalf("login after the version can be read: status=%d body=%s", w.Code, w.Body.String())
	}
	if s.pwdState.Load() != pwdReady || s.pwdVersion.Load() != 1 {
		t.Fatalf("state=%d version=%d, want ready at 1", s.pwdState.Load(), s.pwdVersion.Load())
	}
	var logged struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &logged); err != nil || logged.Token == "" {
		t.Fatalf("login token: %v body=%s", err, w.Body.String())
	}
	if !s.sessionOK(logged.Token) {
		t.Fatal("token from the healed login was rejected")
	}
}

func TestAbsentPasswordVersionKeepsSessions(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	defer m.Close()
	key := []byte("0123456789abcdef0123456789abcdef")
	s := &Server{
		m:              m,
		jwtKey:         key,
		authVersionKey: fmt.Sprintf("test.missing.version.%d", time.Now().UnixNano()),
	}
	s.loadPasswordVersion()
	if s.pwdState.Load() != pwdReady || s.pwdVersion.Load() != 0 {
		t.Fatalf("state=%d version=%d, want ready at 0", s.pwdState.Load(), s.pwdVersion.Load())
	}
	tok, err := signJWT(key)
	if err != nil {
		t.Fatal(err)
	}
	if !s.sessionOK(tok) {
		t.Fatal("a token was rejected when no password version is stored")
	}
}

func TestStreamLogsStopsWhenPasswordVersionChanges(t *testing.T) {
	key := []byte("0123456789abcdef0123456789abcdef")
	s := &Server{jwtKey: key}
	s.applyPasswordVersion(1)
	tok, err := signJWTVersion(key, 1)
	if err != nil {
		t.Fatal(err)
	}
	_, cursor := logSink.recent(0, 1)
	ready := make(chan struct{})
	var once sync.Once
	w := &flushNotify{ResponseWriter: httptest.NewRecorder(), notify: func() {
		once.Do(func() { close(ready) })
	}}
	req := requestWithToken("GET", fmt.Sprintf("/api/logs/stream?since=%d", cursor), tok)
	done := make(chan struct{})
	go func() {
		s.streamLogs(w, req)
		close(done)
	}()
	select {
	case <-ready:
	case <-time.After(2 * time.Second):
		t.Fatal("log stream did not start")
	}
	s.applyPasswordVersion(2)
	logSink.add(LogLine{Text: "after password change"})
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("log stream stayed open after the password version changed")
	}
}

func requestWithToken(method, target, token string) *http.Request {
	r := httptest.NewRequest(method, target, nil)
	r.Header.Set("Authorization", "Bearer "+token)
	return r
}

type flushNotify struct {
	http.ResponseWriter
	notify func()
}

func (f *flushNotify) Flush() {
	f.notify()
	if fl, ok := f.ResponseWriter.(http.Flusher); ok {
		fl.Flush()
	}
}
