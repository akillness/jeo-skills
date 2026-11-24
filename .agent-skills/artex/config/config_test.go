package config

import (
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func clearPGComponentEnv(t *testing.T) {
	t.Helper()
	for _, k := range []string{
		"ARTEX_PG_HOST", "ARTEX_PG_PORT", "ARTEX_PG_USER", "ARTEX_PG_PASSWORD",
		"ARTEX_PG_DBNAME", "ARTEX_PG_SSLMODE",
	} {
		t.Setenv(k, "")
	}
}

func TestPostgresDSNPrecedence(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.json")
	os.WriteFile(cfgPath, []byte(`{"database":{"host":"10.1.2.3","port":6000,"user":"u","password":"p","dbname":"d","sslmode":"require"}}`), 0o644)
	t.Setenv("ARTEX_CONFIG", cfgPath)
	clearPGComponentEnv(t)

	// no env DSN → built from config file fields
	t.Setenv("ARTEX_PG_DSN", "")
	got, _, err := PostgresDSN()
	want := "postgres://u:p@10.1.2.3:6000/d?sslmode=require"
	if err != nil || got != want {
		t.Fatalf("from file: got %q err %v want %q", got, err, want)
	}

	// env wins over config file
	t.Setenv("ARTEX_PG_DSN", "postgres://envwins/x")
	if got, _, err := PostgresDSN(); err != nil || got != "postgres://envwins/x" {
		t.Fatalf("env should win, got %q err %v", got, err)
	}

	// no env, no file → error (no built-in default)
	t.Setenv("ARTEX_PG_DSN", "")
	t.Setenv("ARTEX_CONFIG", filepath.Join(dir, "nope.json"))
	if got, _, err := PostgresDSN(); err == nil {
		t.Fatalf("missing config should error, got %q", got)
	}

	// full dsn in config file is used verbatim
	os.WriteFile(cfgPath, []byte(`{"database":{"dsn":"postgres://full/dsn"}}`), 0o644)
	t.Setenv("ARTEX_CONFIG", cfgPath)
	if got, _, err := PostgresDSN(); err != nil || got != "postgres://full/dsn" {
		t.Fatalf("file dsn verbatim, got %q err %v", got, err)
	}
}

func TestPostgresDSNEncodesComponentPassword(t *testing.T) {
	clearPGComponentEnv(t)
	t.Setenv("ARTEX_PG_DSN", "")
	t.Setenv("ARTEX_CONFIG", filepath.Join(t.TempDir(), "nope.json"))
	const password = "p/ss w@rd?#%"
	t.Setenv("ARTEX_PG_HOST", "postgres")
	t.Setenv("ARTEX_PG_PORT", "5432")
	t.Setenv("ARTEX_PG_USER", "artex")
	t.Setenv("ARTEX_PG_PASSWORD", password)
	t.Setenv("ARTEX_PG_DBNAME", "artex")
	t.Setenv("ARTEX_PG_SSLMODE", "disable")

	got, source, err := PostgresDSN()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(source, "ARTEX_PG_HOST") {
		t.Fatalf("source %q", source)
	}
	u, err := url.Parse(got)
	if err != nil {
		t.Fatalf("parse %q: %v", got, err)
	}
	pw, ok := u.User.Password()
	if !ok || pw != password || u.User.Username() != "artex" || u.Host != "postgres:5432" || u.Path != "/artex" {
		t.Fatalf("dsn %q decoded user=%q password=%q ok=%v host=%q path=%q", got, u.User.Username(), pw, ok, u.Host, u.Path)
	}
	if u.Query().Get("sslmode") != "disable" {
		t.Fatalf("sslmode %q", u.RawQuery)
	}
	if strings.Contains(got, password) {
		t.Fatalf("password left raw in %q", got)
	}

	// An explicit URL is not rewritten, even when the component password is set.
	t.Setenv("ARTEX_PG_DSN", "postgres://already/set")
	if got, _, err = PostgresDSN(); err != nil || got != "postgres://already/set" {
		t.Fatalf("explicit DSN got %q err %v", got, err)
	}

	t.Setenv("ARTEX_PG_DSN", "")
	t.Setenv("ARTEX_PG_PORT", "nope")
	if _, _, err = PostgresDSN(); err == nil || !strings.Contains(err.Error(), "ARTEX_PG_PORT") {
		t.Fatalf("bad port: %v", err)
	}
}

// A config file that exists but is not valid JSON must fail loudly, not run with
// defaults (or report "no database config") as if the file were absent.
func TestRedactMasksEveryDSNPasswordForm(t *testing.T) {
	cases := []struct{ in, secret string }{
		{"postgres://u:secret@localhost:5432/d?sslmode=require", "secret"},
		{"postgresql://localhost/d?password=secret&sslmode=require", "secret"},
		{"host=localhost user=u password=secret dbname=d", "secret"},
		{"host=localhost password='p a ss' dbname=d", "p a ss"},
		{"not a dsn password=stillsecret", "stillsecret"},
	}
	for _, c := range cases {
		got := Redact(c.in)
		if strings.Contains(got, c.secret) {
			t.Errorf("Redact(%q)=%q still contains %q", c.in, got, c.secret)
		}
	}
}

func TestMalformedConfigIsAnError(t *testing.T) {
	cfgPath := filepath.Join(t.TempDir(), "config.json")
	// What install.sh used to write for a password containing a double quote.
	os.WriteFile(cfgPath, []byte(`{"database":{"host":"h","password":"a"b","dbname":"d"},"skill_dir":"/s"}`), 0o644)
	t.Setenv("ARTEX_CONFIG", cfgPath)
	t.Setenv("ARTEX_PG_DSN", "")
	clearPGComponentEnv(t)
	t.Setenv("ARTEX_SKILL_DIR", "")

	if _, _, err := PostgresDSN(); err == nil || !strings.Contains(err.Error(), "parse config file") {
		t.Fatalf("PostgresDSN: want a parse error, got %v", err)
	}
	if d, err := SkillDir(); err == nil {
		t.Fatalf("SkillDir: want a parse error, got dir %q", d)
	}
	if _, err := Load(); err == nil {
		t.Fatal("Load: want a parse error")
	}
}
