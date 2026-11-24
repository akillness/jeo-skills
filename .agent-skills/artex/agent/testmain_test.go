package agent

import (
	"database/sql"
	"log"
	"os"
	"testing"

	"github.com/Autumn-27/artex/db"
	_ "github.com/jackc/pgx/v5/stdlib"
)

// TestMain acquires a PostgreSQL advisory lock (7337741002) for the entire
// agent test suite so cross-package DELETE cleanup races with db/server
// packages are avoided when running `go test ./...`.
func TestMain(m *testing.M) {
	// Norma keeps background-task output in os.TempDir()/norma. The tests get a temp
	// directory of their own, so a session they start never writes the host's
	// <temp>/norma. It is world-writable and sticky like /tmp: MkdirTemp makes it
	// 0700, which an executor process could not traverse.
	tmp, err := os.MkdirTemp("", "artex-test-tmp-")
	if err != nil {
		log.Fatalf("test temp directory: %v", err)
	}
	if err := os.Chmod(tmp, 0o777|os.ModeSticky); err != nil {
		os.RemoveAll(tmp)
		log.Fatalf("test temp directory: %v", err)
	}
	os.Setenv("TMPDIR", tmp)
	// run removes the temp directory on every exit path: os.Exit runs no defer.
	run := func() int {
		code := m.Run()
		os.RemoveAll(tmp)
		return code
	}
	// Own database per package (#80): with separate databases, packages stop
	// contending on shared tables and the advisory lock below stops
	// serializing go test ./... across packages.
	db.SuffixTestDatabase("agent")
	dsn, _, err := db.DSN()
	if err != nil {
		os.Exit(run())
	}
	conn, err := sql.Open("pgx", dsn)
	if err != nil || conn.Ping() != nil {
		os.Exit(run())
	}
	defer conn.Close()
	if _, err := conn.Exec(`SELECT pg_advisory_lock(7337741002)`); err != nil {
		os.Exit(run())
	}
	defer conn.Exec(`SELECT pg_advisory_unlock(7337741002)`) //nolint:errcheck
	os.Exit(run())
}
