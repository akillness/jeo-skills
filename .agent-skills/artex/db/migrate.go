package db

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"embed"
	"encoding/hex"
	"fmt"
	"io/fs"
	"path"
	"regexp"
	"sort"
	"strconv"
)

// Versioned migrations, applied by Open after schema.sql (rules in the package
// comment, db.go).
//
//go:embed migrations/*.sql
var embeddedMigrationFiles embed.FS

// Embedded migration files that EnsureLLMRecordsTable / EnsureLLMUsageTable
// re-run on demand.
const (
	llmRecordsMigration = "0001_llm_records.sql"
	llmUsageMigration   = "0002_llm_usage.sql"
)

// migrationsFS is the embedded migrations directory, rooted so file names are
// the bare NNNN_slug.sql names.
func migrationsFS() fs.FS {
	sub, err := fs.Sub(embeddedMigrationFiles, "migrations")
	if err != nil {
		panic(err) // the embed pattern guarantees the directory exists
	}
	return sub
}

const schemaMigrationsTable = `
CREATE TABLE IF NOT EXISTS schema_migrations (
    version    INTEGER PRIMARY KEY,
    name       TEXT,
    checksum   TEXT,
    applied_at TIMESTAMPTZ DEFAULT now()
);
`

var migrationNameRE = regexp.MustCompile(`^([0-9]{4})_[a-z0-9_]+\.sql$`)

type migration struct {
	version  int
	name     string // file name, e.g. 0001_llm_records.sql
	sql      string
	checksum string // hex SHA-256 of the file content
}

// loadMigrations reads every *.sql file at the root of fsys, sorted by version.
// A .sql file that does not follow NNNN_slug.sql, or a duplicated version, is
// an error so a typo cannot silently skip a migration.
func loadMigrations(fsys fs.FS) ([]migration, error) {
	entries, err := fs.ReadDir(fsys, ".")
	if err != nil {
		return nil, fmt.Errorf("read migrations: %w", err)
	}
	var out []migration
	seen := map[int]string{}
	for _, e := range entries {
		if e.IsDir() || path.Ext(e.Name()) != ".sql" {
			continue
		}
		m := migrationNameRE.FindStringSubmatch(e.Name())
		if m == nil {
			return nil, fmt.Errorf("migration file %s: name must be NNNN_slug.sql", e.Name())
		}
		version, _ := strconv.Atoi(m[1])
		if version == 0 {
			return nil, fmt.Errorf("migration file %s: version must be > 0", e.Name())
		}
		if prev, dup := seen[version]; dup {
			return nil, fmt.Errorf("migration version %04d is used by both %s and %s", version, prev, e.Name())
		}
		seen[version] = e.Name()
		content, err := fs.ReadFile(fsys, e.Name())
		if err != nil {
			return nil, fmt.Errorf("read migration %s: %w", e.Name(), err)
		}
		sum := sha256.Sum256(content)
		out = append(out, migration{version: version, name: e.Name(), sql: string(content), checksum: hex.EncodeToString(sum[:])})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].version < out[j].version })
	return out, nil
}

// applyMigrations brings the database up to the migrations in fsys. conn must
// be the connection that holds the schema advisory lock (see Open); every
// statement runs on it, so nothing here waits on that lock again.
//
// It fails closed before applying anything when the database records a version
// this binary does not ship, or an applied migration whose name or checksum
// differs from the file, or a pending migration is older than the newest
// applied one. Each pending migration then runs in its own
// transaction together with its schema_migrations row; a failure rolls that one
// back and stops, leaving earlier migrations applied.
func applyMigrations(ctx context.Context, conn *sql.Conn, fsys fs.FS) error {
	migrations, err := loadMigrations(fsys)
	if err != nil {
		return err
	}
	if _, err := conn.ExecContext(ctx, schemaMigrationsTable); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	type appliedRow struct{ name, checksum string }
	applied := map[int]appliedRow{}
	rows, err := conn.QueryContext(ctx, `SELECT version, COALESCE(name,''), COALESCE(checksum,'') FROM schema_migrations ORDER BY version`)
	if err != nil {
		return fmt.Errorf("read schema_migrations: %w", err)
	}
	var appliedVersions []int
	for rows.Next() {
		var v int
		var r appliedRow
		if err := rows.Scan(&v, &r.name, &r.checksum); err != nil {
			rows.Close()
			return fmt.Errorf("read schema_migrations: %w", err)
		}
		applied[v] = r
		appliedVersions = append(appliedVersions, v)
	}
	if err := rows.Close(); err != nil {
		return fmt.Errorf("read schema_migrations: %w", err)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("read schema_migrations: %w", err)
	}

	byVersion := map[int]migration{}
	for _, m := range migrations {
		byVersion[m.version] = m
	}
	for _, v := range appliedVersions {
		r := applied[v]
		m, ok := byVersion[v]
		if !ok {
			return fmt.Errorf("migration %04d (%s) is applied in the database but missing from this binary", v, r.name)
		}
		if r.name != m.name {
			return fmt.Errorf("migration %04d: database records file %s but this binary has %s", v, r.name, m.name)
		}
		if r.checksum != m.checksum {
			return fmt.Errorf("migration %04d (%s): checksum changed since it was applied (database %s, file %s); published migrations must not be edited", v, m.name, r.checksum, m.checksum)
		}
	}

	// A pending version below the newest applied one would run out of order on
	// this database: refuse it before writing anything.
	if len(appliedVersions) > 0 {
		maxVersion := appliedVersions[len(appliedVersions)-1]
		for _, m := range migrations {
			if _, done := applied[m.version]; !done && m.version < maxVersion {
				return fmt.Errorf("migration %s (%04d) is older than the applied migration %s (%04d); migrations must be appended, never inserted",
					m.name, m.version, applied[maxVersion].name, maxVersion)
			}
		}
	}

	for _, m := range migrations {
		if _, done := applied[m.version]; done {
			continue
		}
		if err := applyMigration(ctx, conn, m); err != nil {
			return fmt.Errorf("migration %04d (%s): %w", m.version, m.name, err)
		}
	}
	return nil
}

func applyMigration(ctx context.Context, conn *sql.Conn, m migration) error {
	tx, err := conn.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck // no-op after Commit
	// No args: pgx sends it over the simple protocol, which allows several statements.
	if _, err := tx.ExecContext(ctx, m.sql); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations(version, name, checksum) VALUES ($1, $2, $3)`, m.version, m.name, m.checksum); err != nil {
		return fmt.Errorf("record: %w", err)
	}
	return tx.Commit()
}

// execEmbeddedMigration re-runs one embedded (idempotent) migration file in its
// own transaction under the schema lock. It does not touch schema_migrations.
// The lock is taken on a pooled connection, so this must never be called from
// inside Open's withSchemaMigrationLock callback: it would wait on the lock
// that callback's connection holds.
func (d *DB) execEmbeddedMigration(name string) error {
	content, err := fs.ReadFile(migrationsFS(), name)
	if err != nil {
		return err
	}
	tx, err := d.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck
	if err := coordinateWithSchemaMigration(tx); err != nil {
		return err
	}
	if _, err := tx.Exec(string(content)); err != nil {
		return err
	}
	return tx.Commit()
}
