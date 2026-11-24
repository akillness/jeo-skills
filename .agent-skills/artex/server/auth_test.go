package server

import (
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/Autumn-27/artex/db"
)

// jwtKeyDirs returns fresh key, data and legacy base dirs and points
// jwtLegacyBaseDir at the latter for the duration of the test. keyDir does not
// exist yet, so loadOrCreateJWTKey has to create it.
func jwtKeyDirs(t *testing.T) (keyDir, dataDir, baseDir string) {
	t.Helper()
	root := t.TempDir()
	keyDir = filepath.Join(root, "keys")
	dataDir = filepath.Join(root, "data")
	baseDir = filepath.Join(root, "base")
	for _, d := range []string{dataDir, baseDir} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	old := jwtLegacyBaseDir
	jwtLegacyBaseDir = func() string { return baseDir }
	t.Cleanup(func() { jwtLegacyBaseDir = old })
	return keyDir, dataDir, baseDir
}

// assertKeyFileMode checks for 0600. Windows has no Unix permission bits (Go
// reports 0666 or 0444), so the check is skipped there.
func assertKeyFileMode(t *testing.T, path string) {
	t.Helper()
	fi, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if runtime.GOOS == "windows" {
		t.Logf("mode check skipped on windows (got %v)", fi.Mode().Perm())
		return
	}
	if got := fi.Mode().Perm(); got != 0o600 {
		t.Fatalf("%s mode=%v want 0600", path, got)
	}
}

func assertMissing(t *testing.T, path string) {
	t.Helper()
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("%s should not exist (stat err=%v)", path, err)
	}
}

func TestLoadOrCreateJWTKeyMigrates(t *testing.T) {
	const legacyKey = "legacy-key-0123456789abcdefghijkl"
	for _, src := range []string{"data", "base"} {
		t.Run(src, func(t *testing.T) {
			keyDir, dataDir, baseDir := jwtKeyDirs(t)
			legacy := filepath.Join(dataDir, jwtKeyFilename)
			if src == "base" {
				legacy = filepath.Join(baseDir, jwtKeyFilename)
			}
			if err := os.WriteFile(legacy, []byte(legacyKey+"\n"), 0o644); err != nil {
				t.Fatal(err)
			}

			key, err := loadOrCreateJWTKey(keyDir, dataDir)
			if err != nil {
				t.Fatal(err)
			}
			if string(key) != legacyKey {
				t.Fatalf("key=%q want the migrated %q", key, legacyKey)
			}
			path := filepath.Join(keyDir, jwtKeyFilename)
			data, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			if string(data) != legacyKey+"\n" {
				t.Fatalf("migrated file content=%q, want the legacy bytes unchanged", data)
			}
			assertKeyFileMode(t, path)
			assertMissing(t, legacy)
		})
	}
}

func TestLoadOrCreateJWTKeyMigratesDataDirFirst(t *testing.T) {
	keyDir, dataDir, baseDir := jwtKeyDirs(t)
	dataKey := "data-key-0123456789abcdefghijklmn"
	baseKey := "base-key-0123456789abcdefghijklmn"
	if err := os.WriteFile(filepath.Join(dataDir, jwtKeyFilename), []byte(dataKey), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(baseDir, jwtKeyFilename), []byte(baseKey), 0o600); err != nil {
		t.Fatal(err)
	}
	key, err := loadOrCreateJWTKey(keyDir, dataDir)
	if err != nil {
		t.Fatal(err)
	}
	if string(key) != dataKey {
		t.Fatalf("key=%q want the dataDir key", key)
	}
	assertMissing(t, filepath.Join(dataDir, jwtKeyFilename))
}

func TestLoadOrCreateJWTKeyGenerates(t *testing.T) {
	keyDir, dataDir, _ := jwtKeyDirs(t)
	key, err := loadOrCreateJWTKey(keyDir, dataDir)
	if err != nil {
		t.Fatal(err)
	}
	if len(key) != 32 {
		t.Fatalf("len(key)=%d want 32", len(key))
	}
	path := filepath.Join(keyDir, jwtKeyFilename)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(data) != 32 || string(data) != string(key) {
		t.Fatalf("file holds %d bytes, want the 32 returned", len(data))
	}
	assertKeyFileMode(t, path)
	assertMissing(t, filepath.Join(dataDir, jwtKeyFilename))

	again, err := loadOrCreateJWTKey(keyDir, dataDir)
	if err != nil {
		t.Fatal(err)
	}
	if string(again) != string(key) {
		t.Fatal("second load returned a different key")
	}
}

func TestLoadOrCreateJWTKeyNeverOverwrites(t *testing.T) {
	keyDir, dataDir, baseDir := jwtKeyDirs(t)
	if err := os.MkdirAll(keyDir, 0o700); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(keyDir, jwtKeyFilename)
	current := "current-key-0123456789abcdefghijk"
	if err := os.WriteFile(path, []byte(current), 0o600); err != nil {
		t.Fatal(err)
	}
	// legacy keys must not replace the current one, and are left alone.
	legacyData := filepath.Join(dataDir, jwtKeyFilename)
	legacyBase := filepath.Join(baseDir, jwtKeyFilename)
	for _, p := range []string{legacyData, legacyBase} {
		if err := os.WriteFile(p, []byte("legacy-key-0123456789abcdefghijkl"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	key, err := loadOrCreateJWTKey(keyDir, dataDir)
	if err != nil {
		t.Fatal(err)
	}
	if string(key) != current {
		t.Fatalf("key=%q want the existing %q", key, current)
	}
	for _, p := range []string{legacyData, legacyBase} {
		if _, err := os.Stat(p); err != nil {
			t.Fatalf("legacy key %s should be untouched: %v", p, err)
		}
	}

	// a short (invalid) key is an error, not a reason to replace it.
	short := "too-short"
	if err := os.WriteFile(path, []byte(short), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := loadOrCreateJWTKey(keyDir, dataDir); err == nil {
		t.Fatal("want an error for a short key")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != short {
		t.Fatalf("short key was overwritten with %d bytes", len(data))
	}
}

// GetSetting distinguishes "key absent" from "read failed" only through its error:
// both return an empty value. If a password handler mistakes the error for "no
// password set yet", a database blip opens the init door — authInit would let an
// unauthenticated request overwrite the admin password, and authStatus ships the frontend to /setup to do the same.
//
// Both tests close the handlers' connection pool to force a read failure and assert both fail closed.
func TestAuthStatusFailsClosedWhenDataSourceUnavailable(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	defer m.Close()
	// Close the pool so subsequent GetSetting returns an error instead of sql.ErrNoRows.
	if err := m.pg.Close(); err != nil {
		t.Fatal(err)
	}

	s := &Server{m: m}
	w := httptest.NewRecorder()
	s.authStatus(w, httptest.NewRequest("GET", "/api/auth/status", nil))

	if w.Code != 503 {
		t.Fatalf("status=%d want 503 (treating a failed read as uninitialized sends the user to /setup to overwrite the password); body=%s", w.Code, w.Body.String())
	}
	var payload struct {
		Initialized *bool `json:"initialized"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &payload); err == nil && payload.Initialized != nil {
		t.Fatalf("a failed read must not answer initialized, got %v", *payload.Initialized)
	}
}

func TestAuthInitFailsClosedWhenDataSourceUnavailable(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	defer m.Close()
	if err := m.pg.Close(); err != nil {
		t.Fatal(err)
	}

	s := &Server{m: m}
	w := httptest.NewRecorder()
	body := strings.NewReader(`{"password":"correct horse battery"}`)
	s.authInit(w, httptest.NewRequest("POST", "/api/auth/init", body))

	if w.Code != 503 {
		t.Fatalf("status=%d want 503 (allowing through on a failed read lets an unauthenticated request overwrite the existing password); body=%s", w.Code, w.Body.String())
	}
	if strings.Contains(w.Body.String(), "token") {
		t.Fatalf("a failed read must not issue a token: %s", w.Body.String())
	}
}

// While no password is set, authInit must reject a missing or wrong setup token
// and accept the one generated at startup, once.
func TestAuthInitRequiresSetupToken(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	defer m.Close()
	clearPassword := func() {
		if _, err := m.pg.Exec(`DELETE FROM settings WHERE key=$1 OR key=$2`, authPassKey, authPwdVersionKey); err != nil {
			t.Fatal(err)
		}
	}
	clearPassword()
	defer clearPassword()

	s := &Server{m: m, jwtKey: []byte("0123456789abcdef0123456789abcdef")}
	s.initSetupToken()
	setupToken := s.setupToken
	if setupToken == "" {
		t.Fatal("no setup token generated while no password is set")
	}
	post := func(body string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		s.authInit(w, httptest.NewRequest("POST", "/api/auth/init", strings.NewReader(body)))
		return w
	}

	for name, body := range map[string]string{
		"missing": `{"password":"correct horse battery"}`,
		"empty":   `{"password":"correct horse battery","setup_token":""}`,
		"wrong":   `{"password":"correct horse battery","setup_token":"0000"}`,
	} {
		if w := post(body); w.Code != 403 || strings.Contains(w.Body.String(), `"token"`) {
			t.Fatalf("%s setup token: status=%d want 403 without a token; body=%s", name, w.Code, w.Body.String())
		}
	}
	if hash, _, err := m.pg.GetSetting(authPassKey); err != nil || hash != "" {
		t.Fatalf("a rejected request changed the password state: hash set=%v err=%v", hash != "", err)
	}

	ok := `{"password":"correct horse battery","setup_token":"` + setupToken + `"}`
	if w := post(ok); w.Code != 200 || !strings.Contains(w.Body.String(), `"token"`) {
		t.Fatalf("right setup token: status=%d want 200 with a token; body=%s", w.Code, w.Body.String())
	}
	if hash, _, err := m.pg.GetSetting(authPassKey); err != nil || hash == "" {
		t.Fatalf("password not stored: err=%v", err)
	}

	// The token is spent: even with the password row removed, it is refused.
	clearPassword()
	if w := post(ok); w.Code != 403 {
		t.Fatalf("reused setup token: status=%d want 403; body=%s", w.Code, w.Body.String())
	}
}

func TestValidatePassword(t *testing.T) {
	for _, tc := range []struct {
		name, pw string
		wantErr  bool
	}{
		{"empty", "", true},
		{"eight chars, the old minimum", "12345678", true},
		{"eleven chars", "12345678901", true},
		{"twelve chars", "123456789012", false},
		{"twelve multibyte chars counted as runes not bytes", strings.Repeat("€", 12), false},
		{"four chars reach 12 bytes but only 4 runes", strings.Repeat("€", 4), true},
		{"72 bytes", strings.Repeat("a", 72), false},
		{"73 bytes exceeds the bcrypt cap", strings.Repeat("a", 73), true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := validatePassword(tc.pw); (got != "") != tc.wantErr {
				t.Fatalf("validatePassword(%q)=%q, wantErr=%v", tc.pw, got, tc.wantErr)
			}
		})
	}
}
