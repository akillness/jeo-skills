//go:build unix

package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgproto3"
)

// fakeTrustPG is a PostgreSQL wire endpoint that lets any user in without a
// password, like a server with trust authentication. It returns its address.
func fakeTrustPG(t *testing.T) (host string, port uint16) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			go func(conn net.Conn) {
				defer conn.Close()
				be := pgproto3.NewBackend(conn, conn)
				msg, err := be.ReceiveStartupMessage()
				for err == nil {
					switch msg.(type) {
					case *pgproto3.SSLRequest, *pgproto3.GSSEncRequest:
						if _, err = conn.Write([]byte("N")); err == nil {
							msg, err = be.ReceiveStartupMessage()
						}
						continue
					}
					break
				}
				if err != nil {
					return
				}
				be.Send(&pgproto3.AuthenticationOk{})
				be.Send(&pgproto3.ParameterStatus{Name: "server_version", Value: "16.0"})
				be.Send(&pgproto3.BackendKeyData{ProcessID: 1, SecretKey: []byte{0, 0, 0, 2}})
				be.Send(&pgproto3.ReadyForQuery{TxStatus: 'I'})
				if be.Flush() != nil {
					return
				}
				for {
					if _, err := be.Receive(); err != nil {
						return
					}
				}
			}(conn)
		}
	}()
	addr := ln.Addr().(*net.TCPAddr)
	return addr.IP.String(), uint16(addr.Port)
}

func hasFailure(failures []string, sub string) bool {
	for _, f := range failures {
		if strings.Contains(f, sub) {
			return true
		}
	}
	return false
}

// The probe's checks, run in the test process (not as the executor): each kind of
// exposure is reported. The process can read the file, write the directory, carries
// a variable outside the allowlist, is not the executor and reaches a database that
// takes no password.
func TestCheckIsolationReportsEachExposure(t *testing.T) {
	dir := t.TempDir()
	secret := filepath.Join(dir, "jwt.key")
	if err := os.WriteFile(secret, []byte("k"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("ARTEX_ISOLATION_CANARY", "canary")
	host, port := fakeTrustPG(t)
	failures := checkIsolationAsExecutor(isolationProbeSpec{
		UID: 10001, GID: 10001, ServerPID: os.Getpid(),
		Unreadable: []string{secret, filepath.Join(dir, "absent.key")},
		Unwritable: []string{dir},
		DB:         []isolationProbeDB{{Host: host, Port: port, User: "artex", Database: "artex"}},
	})
	for _, want := range []string{
		"not the executor uid 10001",
		"Bash can read " + secret,
		"Bash can create files in " + dir,
		"ARTEX_ISOLATION_CANARY reached Bash",
		`database session as "artex"`,
	} {
		if !hasFailure(failures, want) {
			t.Errorf("no failure %q in %q", want, failures)
		}
	}
	if hasFailure(failures, "absent.key") {
		t.Errorf("a missing file is not an exposure: %q", failures)
	}
	if entries, _ := os.ReadDir(dir); len(entries) != 1 {
		t.Errorf("the write check left a file behind: %v", entries)
	}
}

// A database that asks for a password, or none listening, is not an exposure.
func TestConnectWithoutPasswordRefused(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := uint16(ln.Addr().(*net.TCPAddr).Port)
	ln.Close() // nothing listens there now
	if err := connectWithoutPassword(&isolationProbeDB{Host: "127.0.0.1", Port: port, User: "artex", Database: "artex"}); err == nil {
		t.Fatal("no database listening, yet a session opened")
	}
}

// Against the real test database: the server's user without its password is
// refused by PostgreSQL's authentication (it asks for the password on TCP).
func TestConnectWithoutPasswordRealPG(t *testing.T) {
	dsn := os.Getenv("ARTEX_PG_DSN")
	if dsn == "" {
		t.Skip("ARTEX_PG_DSN not set")
	}
	spec := isolationSpec(ExecPrivilege{Enabled: true, UID: 10001, GID: 10001}, IsolationTargets{DSN: dsn})
	if len(spec.DB) == 0 {
		t.Fatal("no database in the spec")
	}
	for i := range spec.DB {
		err := connectWithoutPassword(&spec.DB[i])
		var pgErr *pgconn.PgError
		if !errors.As(err, &pgErr) || (pgErr.Code != "28P01" && pgErr.Code != "28000") {
			t.Fatalf("connection without password to %s:%d: %v, want an authentication failure (28P01/28000)", spec.DB[i].Host, spec.DB[i].Port, err)
		}
		t.Logf("%s:%d refused as expected: SQLSTATE %s", spec.DB[i].Host, spec.DB[i].Port, pgErr.Code)
	}
}

// The probe tries the hosts the DSN names, every one of them, and nothing else: no
// loopback of its own. A DSN it cannot use fails the self-test instead of skipping
// the database check.
func TestIsolationSpecUsesTheDSNHosts(t *testing.T) {
	p := ExecPrivilege{Enabled: true, UID: 10001, GID: 10001}
	for _, c := range []struct {
		dsn  string
		want string
	}{
		{"postgres://artex:pw@db.internal:6543/artex?sslmode=disable", "db.internal:6543"},
		{"postgres://artex:pw@db1.internal:6543,db2.internal:6544/artex?sslmode=prefer", "db1.internal:6543 db2.internal:6544"},
		{"host=10.20.30.40 port=5433 user=artex password=pw dbname=artex", "10.20.30.40:5433"},
		{"host=/var/run/postgresql user=artex dbname=artex", "/var/run/postgresql:5432"},
	} {
		var got []string
		for _, db := range isolationSpec(p, IsolationTargets{DSN: c.dsn}).DB {
			got = append(got, fmt.Sprintf("%s:%d", db.Host, db.Port))
			if db.User != "artex" || db.Database != "artex" {
				t.Errorf("%s: user %q database %q", c.dsn, db.User, db.Database)
			}
		}
		if strings.Join(got, " ") != c.want {
			t.Errorf("%s: probe hosts %v, want %s", c.dsn, got, c.want)
		}
	}
	err := IsolationSelfTest(p, IsolationTargets{DSN: "postgres://%zz"})
	if err == nil || !strings.Contains(err.Error(), "names no host the self-test can check") {
		t.Fatalf("self-test with an unusable DSN: %v", err)
	}
}

// The parent rule: owned by the executor, or writable by it without the sticky bit,
// lets it replace the directory; a sticky world-writable parent (/tmp) does not.
func TestParentReplaceable(t *testing.T) {
	const u, g = 10001, 10001
	for _, c := range []struct {
		name     string
		mode     fs.FileMode
		uid, gid uint32
		want     bool
	}{
		{"root 0755", fs.ModeDir | 0o755, 0, 0, false},
		{"owned by the executor", fs.ModeDir | 0o700, u, 0, true},
		{"group-writable executor gid", fs.ModeDir | 0o775, 0, g, true},
		{"group-writable other gid", fs.ModeDir | 0o775, 0, 0, false},
		{"world-writable", fs.ModeDir | 0o777, 0, 0, true},
		{"world-writable sticky", fs.ModeDir | fs.ModeSticky | 0o777, 0, 0, false},
		{"host user 0755", fs.ModeDir | 0o755, 1000, 1000, false},
	} {
		if got := parentReplaceable(c.mode, c.uid, c.gid, u, g) != ""; got != c.want {
			t.Errorf("%s: replaceable=%v, want %v", c.name, got, c.want)
		}
	}
}

// A skill tree is judged from owners and mode bits: an entry the executor owns, or
// can write through its group or as other, is reported; a symlink by its target.
// Runs without root: the test user stands in for the executor or for root.
func TestSkillTreeFailures(t *testing.T) {
	root := t.TempDir()
	skill := filepath.Join(root, "recon")
	if err := os.Mkdir(skill, 0o755); err != nil {
		t.Fatal(err)
	}
	md := filepath.Join(skill, "SKILL.md")
	if err := os.WriteFile(md, []byte("---\nname: recon\n---\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(root, 0o755); err != nil {
		t.Fatal(err)
	}
	me := uint32(os.Getuid())
	other := me + 54321 // an executor that owns nothing here

	if got := skillTreeFailures(root, other, other); len(got) != 0 {
		t.Fatalf("a tree only its owner can write: %q", got)
	}
	if got := skillTreeFailures(root, me, other); len(got) != 3 || !hasFailure(got, md) {
		t.Fatalf("a tree owned by the executor uid: %q, want all three entries", got)
	}
	if err := os.Chmod(md, 0o666); err != nil {
		t.Fatal(err)
	}
	if got := skillTreeFailures(root, other, other); len(got) != 1 || !hasFailure(got, md) || !hasFailure(got, "writable by others") {
		t.Fatalf("a world-writable skill file: %q", got)
	}
	if err := os.Chmod(md, 0o644); err != nil {
		t.Fatal(err)
	}
	outside := filepath.Join(t.TempDir(), "evil.md")
	if err := os.WriteFile(outside, []byte("x"), 0o666); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(outside, 0o666); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(skill, "linked.md")
	if err := os.Symlink(outside, link); err != nil {
		t.Fatal(err)
	}
	if got := skillTreeFailures(root, other, other); len(got) != 1 || !hasFailure(got, link) {
		t.Fatalf("a symlink to a world-writable file: %q", got)
	}
	if got := skillTreeFailures(filepath.Join(root, "absent"), me, me); got != nil {
		t.Fatalf("a missing skill directory: %q", got)
	}
}

// The spec carries the server's paths and the database name, never its password.
func TestIsolationSpecHasNoPassword(t *testing.T) {
	spec := isolationSpec(ExecPrivilege{Enabled: true, UID: 10001, GID: 10002}, IsolationTargets{
		DataDir: "/app/data", KeyDir: "/app/keys", ConfigPath: "/app/config.json",
		DSN: "postgres://artex:s3cr3t-pw@postgres:5432/artex?sslmode=disable",
	})
	for _, want := range []string{"/app/keys/jwt.key", "/app/keys/secret.key", "/app/config.json", "/app/data/traffic/_ca/mitmproxy-ca.pem"} {
		found := false
		for _, p := range spec.Unreadable {
			found = found || p == want
		}
		if !found {
			t.Errorf("%s missing from the unreadable files %v", want, spec.Unreadable)
		}
	}
	if len(spec.DB) != 1 || spec.DB[0].Host != "postgres" || spec.DB[0].Port != 5432 || spec.DB[0].User != "artex" || spec.DB[0].Database != "artex" {
		t.Fatalf("db = %+v", spec.DB)
	}
	if spec.UID != 10001 || spec.GID != 10002 || spec.ServerPID != os.Getpid() {
		t.Fatalf("ids = %d:%d pid %d", spec.UID, spec.GID, spec.ServerPID)
	}
	if b, _ := json.Marshal(spec); strings.Contains(string(b), "s3cr3t") {
		t.Fatal("the password reached the spec")
	}
}
