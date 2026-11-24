// Package config loads runtime configuration from a JSON file, with environment
// variables taking precedence where supported.
package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

// Database is the PostgreSQL connection config. Either set DSN directly, or set
// the component fields and a DSN is assembled from them.
type Database struct {
	DSN      string `json:"dsn"`
	Host     string `json:"host"`
	Port     int    `json:"port"`
	User     string `json:"user"`
	Password string `json:"password"`
	DBName   string `json:"dbname"`
	SSLMode  string `json:"sslmode"`
}

// Config is the on-disk config file shape.
type Config struct {
	Database       Database       `json:"database"`
	SkillDir       string         `json:"skill_dir"`
	TaskUserAgents TaskUserAgents `json:"task_user_agents,omitempty"`
}

// BaseDir is the directory that anchors all runtime artifacts (config.json and
// the data/ store). It is the directory the running binary lives in, so a
// distributed executable keeps its files next to itself on any OS (Windows,
// Linux, …) regardless of the working directory it is launched from.
//
// When launched via `go run`, the binary is throwaway: it sits either in a temp
// build dir (cache miss → fresh link) OR straight inside the Go build cache
// (cache hit → run from $GOCACHE/.../...-d). We detect both and fall back to the
// current working directory so dev artifacts (data/, transcripts) and config
// resolve against the project dir, not the throwaway binary's location.
func BaseDir() string {
	exe, err := os.Executable()
	if err != nil {
		return "."
	}
	dir := filepath.Dir(exe)
	if isGoRunDir(dir) {
		return "." // throwaway `go run` binary → use CWD
	}
	return dir
}

// KeyDir holds jwt.key and secret.key: ARTEX_JWT_KEY_DIR (the Docker image points
// it at the /app/keys volume) or the base dir. Never the browsable data dir.
func KeyDir() string {
	dir := strings.TrimSpace(os.Getenv("ARTEX_JWT_KEY_DIR"))
	if dir == "" {
		dir = BaseDir()
	}
	if abs, err := filepath.Abs(dir); err == nil {
		dir = abs
	}
	return dir
}

// isGoRunDir reports whether dir is where `go run` parked its executable: under
// the system temp dir (cache miss), or anywhere inside a Go build cache
// (…/go-build/…, the cache-hit case — NOT under os.TempDir(), which is why the
// old temp-only check failed intermittently). In both cases the binary is
// throwaway, so config/data must resolve against the CWD.
func isGoRunDir(dir string) bool {
	if tmp := os.TempDir(); tmp != "" {
		if rel, err := filepath.Rel(tmp, dir); err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			return true
		}
	}
	for _, seg := range strings.Split(filepath.ToSlash(dir), "/") {
		if seg == "go-build" {
			return true
		}
	}
	return false
}

// Path returns the config file path. Resolution order:
//  1. env ARTEX_CONFIG (explicit override)
//  2. ./config.json in the current working directory (running from the project
//     dir — robust no matter where `go run` placed the temp/cached binary)
//  3. config.json next to the executable (a distributed binary keeps it beside)
//
// The first existing file wins. If none exist, the CWD path is returned so the
// "not found" message points at the project dir the user most likely expected.
func Path() string {
	if v := strings.TrimSpace(os.Getenv("ARTEX_CONFIG")); v != "" {
		return v
	}
	var candidates []string
	if cwd, err := os.Getwd(); err == nil {
		candidates = append(candidates, filepath.Join(cwd, "config.json"))
	}
	candidates = append(candidates, filepath.Join(BaseDir(), "config.json"))
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			return c
		}
	}
	return candidates[0]
}

// Load reads and parses the config file. A missing file yields a zero Config (so
// callers fall back to defaults). A file that exists but cannot be read or parsed
// is an error: ignoring it would run with defaults the operator did not choose.
func Load() (Config, error) {
	path := Path()
	b, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return Config{}, nil
	}
	if err != nil {
		return Config{}, fmt.Errorf("read config file %s: %w", path, err)
	}
	var disk struct {
		Config
		LegacyTaskUserAgents json.RawMessage `json:"assessment_identification"`
	}
	if err := json.Unmarshal(b, &disk); err != nil {
		return Config{}, fmt.Errorf("parse config file %s: %w", path, err)
	}
	if disk.LegacyTaskUserAgents != nil {
		return Config{}, fmt.Errorf("parse config file %s: assessment_identification was replaced by task_user_agents. Move each task entry to task_user_agents with its origins list", path)
	}
	return disk.Config, nil
}

// SkillDir returns the skill root directory with precedence:
//
//	env ARTEX_SKILL_DIR  >  config file (skill_dir)  >  BaseDir()/skills
//
// The directory is created if it does not exist.
func SkillDir() (string, error) {
	var d string
	if v := strings.TrimSpace(os.Getenv("ARTEX_SKILL_DIR")); v != "" {
		d = v
	} else {
		c, err := Load()
		if err != nil {
			return "", err
		}
		if v := strings.TrimSpace(c.SkillDir); v != "" {
			d = v
		} else {
			d = filepath.Join(BaseDir(), "skills")
		}
	}
	_ = os.MkdirAll(d, 0o755)
	return d, nil
}

// PostgresDSN resolves the connection string with precedence:
//
//	env ARTEX_PG_DSN
//	  >  env ARTEX_PG_HOST / ARTEX_PG_PORT / ARTEX_PG_USER / ARTEX_PG_PASSWORD /
//	     ARTEX_PG_DBNAME / ARTEX_PG_SSLMODE
//	  >  config file (database.dsn, or assembled from fields)
//
// The component variables are how Docker Compose passes a password that contains
// URL-special characters: the password stays a raw environment value, and
// buildDSN percent-encodes it. An explicit ARTEX_PG_DSN is returned unchanged,
// so a value that was already assembled by something else is not rewritten.
//
// There is NO built-in fallback: when neither source supplies a database config,
// it returns an error naming the config path it inspected, so startup fails loudly
// instead of silently connecting to a wrong default. source describes where the
// DSN came from (for startup logging).
func PostgresDSN() (dsn, source string, err error) {
	if v := strings.TrimSpace(os.Getenv("ARTEX_PG_DSN")); v != "" {
		return v, "environment variable ARTEX_PG_DSN", nil
	}
	if d, ok, err := postgresDSNFromEnv(); ok || err != nil {
		return d, "environment variables ARTEX_PG_HOST/USER/PASSWORD/DBNAME", err
	}
	c, err := Load()
	if err != nil {
		return "", "", err
	}
	db := c.Database
	if d := strings.TrimSpace(db.DSN); d != "" {
		return d, "config file " + Path() + " (database.dsn)", nil
	}
	if db.Host != "" || db.DBName != "" || db.User != "" {
		return db.buildDSN(), "config file " + Path() + " (database fields)", nil
	}
	return "", "", fmt.Errorf("no database config found: ARTEX_PG_DSN is not set, ARTEX_PG_HOST/USER/PASSWORD/DBNAME are not set, and config file %s provides no database (dsn or host/user/dbname). Create the config file or set the environment variable and retry", Path())
}

// postgresDSNFromEnv assembles a URL from the component environment variables.
// ok is false when none of them is set. The password is not trimmed: a space is
// a legal character and is the case docker-compose used to break.
func postgresDSNFromEnv() (dsn string, ok bool, err error) {
	host := strings.TrimSpace(os.Getenv("ARTEX_PG_HOST"))
	user := strings.TrimSpace(os.Getenv("ARTEX_PG_USER"))
	password := os.Getenv("ARTEX_PG_PASSWORD")
	dbname := strings.TrimSpace(os.Getenv("ARTEX_PG_DBNAME"))
	portStr := strings.TrimSpace(os.Getenv("ARTEX_PG_PORT"))
	ssl := strings.TrimSpace(os.Getenv("ARTEX_PG_SSLMODE"))
	if host == "" && user == "" && password == "" && dbname == "" && portStr == "" && ssl == "" {
		return "", false, nil
	}
	port := 0
	if portStr != "" {
		n, convErr := strconv.Atoi(portStr)
		if convErr != nil || n <= 0 || n > 65535 {
			return "", true, fmt.Errorf("ARTEX_PG_PORT %q is not a TCP port", portStr)
		}
		port = n
	}
	return Database{
		Host: host, Port: port, User: user, Password: password, DBName: dbname, SSLMode: ssl,
	}.buildDSN(), true, nil
}

func (d Database) buildDSN() string {
	host := d.Host
	if host == "" {
		host = "127.0.0.1"
	}
	port := d.Port
	if port == 0 {
		port = 5432
	}
	ssl := d.SSLMode
	if ssl == "" {
		ssl = "disable"
	}
	u := url.URL{
		Scheme: "postgres",
		Host:   host + ":" + strconv.Itoa(port),
		Path:   "/" + d.DBName,
	}
	if d.User != "" {
		if d.Password != "" {
			u.User = url.UserPassword(d.User, d.Password)
		} else {
			u.User = url.User(d.User)
		}
	}
	u.RawQuery = url.Values{"sslmode": {ssl}}.Encode()
	return u.String()
}

// libpqPassword matches a libpq keyword DSN password field, including quoted
// values. pgx accepts this form as well as the URL form.
var libpqPassword = regexp.MustCompile(`(?i)\b(password)\s*=\s*(?:'[^']*'|"[^"]*"|\S*)`)

// Redact is a log-safe view of a PostgreSQL DSN. It masks URL userinfo
// passwords, `?password=` query values, and libpq `password=` keywords.
// Unrecognised input still runs the keyword mask so a parse failure cannot
// print the secret.
func Redact(dsn string) string {
	if dsn == "" {
		return dsn
	}
	if u, err := url.Parse(dsn); err == nil && (u.Scheme == "postgres" || u.Scheme == "postgresql") {
		if u.User != nil {
			if _, hasPw := u.User.Password(); hasPw {
				u.User = url.UserPassword(u.User.Username(), "****")
			}
		}
		q := u.Query()
		if q.Has("password") {
			q.Set("password", "****")
			u.RawQuery = q.Encode()
		}
		return u.String()
	}
	return libpqPassword.ReplaceAllString(dsn, `${1}=****`)
}
