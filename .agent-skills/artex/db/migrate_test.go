package db

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"io/fs"
	"net/url"
	"strings"
	"testing"
	"testing/fstest"
	"time"
)

func TestLoadMigrationsValidation(t *testing.T) {
	ms, err := loadMigrations(fstest.MapFS{
		"0010_b.sql": {Data: []byte("SELECT 10;")},
		"0002_a.sql": {Data: []byte("SELECT 2;")},
		"README.md":  {Data: []byte("not a migration")},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(ms) != 2 || ms[0].version != 2 || ms[1].version != 10 {
		t.Fatalf("want versions [2 10], got %+v", ms)
	}
	sum := sha256.Sum256([]byte("SELECT 2;"))
	if ms[0].checksum != hex.EncodeToString(sum[:]) || ms[0].name != "0002_a.sql" {
		t.Fatalf("migration 0002 = %+v", ms[0])
	}

	for name, fsys := range map[string]fstest.MapFS{
		"bad name":          {"2_a.sql": {Data: []byte("SELECT 1;")}},
		"duplicate version": {"0001_a.sql": {Data: []byte("SELECT 1;")}, "0001_b.sql": {Data: []byte("SELECT 1;")}},
	} {
		if _, err := loadMigrations(fsys); err == nil {
			t.Errorf("%s: want error", name)
		}
	}
}

// scratchDSN returns the DSN of a new, empty database named after the test
// database plus suffix, dropped again when the test ends.
func scratchDSN(t *testing.T, suffix string) string {
	t.Helper()
	u, err := url.Parse(testDSN(t))
	if err != nil || strings.Trim(u.Path, "/") == "" {
		t.Skipf("DSN has no database name — skipping")
	}
	name := strings.TrimPrefix(u.Path, "/") + "_mig_" + suffix
	admin := *u
	admin.Path = "/postgres"
	conn, err := sql.Open("pgx", admin.String())
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	if err := conn.Ping(); err != nil {
		conn.Close()
		SkipPGUnavailable(t, err)
	}
	drop := func() error {
		_, err := conn.Exec(`DROP DATABASE IF EXISTS "` + name + `" WITH (FORCE)`)
		return err
	}
	if err := drop(); err != nil {
		t.Fatalf("drop leftover %s: %v", name, err)
	}
	t.Cleanup(func() {
		if err := drop(); err != nil {
			t.Errorf("drop %s: %v", name, err)
		}
		conn.Close()
	})
	u.Path = "/" + name
	return u.String()
}

// withEmbedded returns the embedded migrations plus extra files.
func withEmbedded(t *testing.T, extra fstest.MapFS) fstest.MapFS {
	t.Helper()
	out := fstest.MapFS{}
	for _, name := range []string{llmRecordsMigration, llmUsageMigration} {
		content, err := fs.ReadFile(migrationsFS(), name)
		if err != nil {
			t.Fatal(err)
		}
		out[name] = &fstest.MapFile{Data: content}
	}
	for name, f := range extra {
		out[name] = f
	}
	return out
}

type appliedMigration struct {
	version        int
	name, checksum string
	appliedAt      time.Time
}

func readApplied(t *testing.T, d *DB) []appliedMigration {
	t.Helper()
	rows, err := d.Query(`SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []appliedMigration
	for rows.Next() {
		var m appliedMigration
		if err := rows.Scan(&m.version, &m.name, &m.checksum, &m.appliedAt); err != nil {
			t.Fatal(err)
		}
		out = append(out, m)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	return out
}

// assertEmbeddedApplied checks that both LLM tables exist and that every
// embedded migration is recorded with the SHA-256 of its file.
func assertEmbeddedApplied(t *testing.T, d *DB) []appliedMigration {
	t.Helper()
	for _, table := range []string{"llm_records", "llm_usage", "llm_context", "traffic_tamper_hooks", "traffic_tamper_hook_versions"} {
		var exists bool
		if err := d.QueryRow(`SELECT to_regclass($1) IS NOT NULL`, table).Scan(&exists); err != nil {
			t.Fatal(err)
		}
		if !exists {
			t.Errorf("table %s missing after Open", table)
		}
	}
	applied := readApplied(t, d)
	want := []struct {
		version int
		name    string
	}{{1, llmRecordsMigration}, {2, llmUsageMigration}, {3, "0003_task_scope_icp_index.sql"}, {4, "0004_llm_usage_ts_index.sql"},
		{5, "0005_traffic_rewrite_rules.sql"}, {6, "0006_activity_outbox.sql"}, {7, "0007_finding_report_state.sql"},
		{8, "0008_traffic_evidence_rewrite_flag.sql"}, {9, "0009_llm_context.sql"}, {10, "0010_dashboard_usage_indexes.sql"},
		{11, "0011_traffic_tamper_hooks.sql"}, {12, "0012_lesson_withdrawn.sql"},
		{13, "0013_lesson_evidence_history.sql"}, {14, "0014_bedrock_gateway_profiles.sql"}}
	if len(applied) != len(want) {
		t.Fatalf("schema_migrations = %+v, want versions 1 to 14", applied)
	}
	for i, w := range want {
		content, err := fs.ReadFile(migrationsFS(), w.name)
		if err != nil {
			t.Fatal(err)
		}
		sum := sha256.Sum256(content)
		got := applied[i]
		if got.version != w.version || got.name != w.name || got.checksum != hex.EncodeToString(sum[:]) {
			t.Errorf("schema_migrations row %d = %+v, want version %d name %s checksum %x", i, got, w.version, w.name, sum)
		}
	}
	return applied
}

// assertReopenIsNoop opens dsn again and checks that no migration row was added
// or re-applied, then that both Ensure functions stay idempotent.
func assertReopenIsNoop(t *testing.T, dsn string, before []appliedMigration) {
	t.Helper()
	d, err := Open(dsn)
	if err != nil {
		t.Fatalf("second Open: %v", err)
	}
	defer d.Close()
	after := assertEmbeddedApplied(t, d)
	for i := range before {
		if !after[i].appliedAt.Equal(before[i].appliedAt) {
			t.Errorf("migration %04d applied_at changed: %v -> %v", before[i].version, before[i].appliedAt, after[i].appliedAt)
		}
	}
	for range 2 {
		if err := d.EnsureLLMRecordsTable(); err != nil {
			t.Fatalf("EnsureLLMRecordsTable after Open: %v", err)
		}
		if err := d.EnsureLLMUsageTable(); err != nil {
			t.Fatalf("EnsureLLMUsageTable after Open: %v", err)
		}
	}
	if got := readApplied(t, d); len(got) != len(before) {
		t.Errorf("Ensure functions changed schema_migrations: %+v", got)
	}
}

// TestOpenRecordsEmbeddedMigrations runs against the package test database:
// fresh on a first run, already migrated on a second run.
func TestOpenRecordsEmbeddedMigrations(t *testing.T) {
	dsn := testDSN(t)
	d, err := Open(dsn)
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	applied := assertEmbeddedApplied(t, d)
	d.Close()
	assertReopenIsNoop(t, dsn, applied)
}

func TestOpenMigratesFreshDatabase(t *testing.T) {
	dsn := scratchDSN(t, "fresh")
	d, err := Open(dsn)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	applied := assertEmbeddedApplied(t, d)
	d.Close()
	assertReopenIsNoop(t, dsn, applied)
}

// An install that predates schema_migrations already has both tables (created
// by the Ensure functions, possibly without the later llm_records columns).
// Open must adopt them: run 0001/0002 over them and record both.
func TestOpenAdoptsExistingTablesWithoutSchemaMigrations(t *testing.T) {
	dsn := scratchDSN(t, "legacy")
	d, err := openWithMigrations(dsn, fstest.MapFS{})
	if err != nil {
		t.Fatalf("Open without migrations: %v", err)
	}
	if err := d.EnsureLLMRecordsTable(); err != nil {
		t.Fatal(err)
	}
	if err := d.EnsureLLMUsageTable(); err != nil {
		t.Fatal(err)
	}
	for _, q := range []string{
		`ALTER TABLE llm_records DROP COLUMN raw_request, DROP COLUMN raw_response`,
		`INSERT INTO llm_records(model) VALUES ('legacy')`,
		`INSERT INTO llm_usage(model, status) VALUES ('legacy', 'ok')`,
		`DROP TABLE schema_migrations`,
	} {
		if _, err := d.Exec(q); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	d.Close()

	d, err = Open(dsn)
	if err != nil {
		t.Fatalf("Open on existing tables: %v", err)
	}
	applied := assertEmbeddedApplied(t, d)
	var records, usage, rawCols int
	if err := d.QueryRow(`SELECT count(*) FROM llm_records WHERE model='legacy'`).Scan(&records); err != nil {
		t.Fatal(err)
	}
	if err := d.QueryRow(`SELECT count(*) FROM llm_usage WHERE model='legacy'`).Scan(&usage); err != nil {
		t.Fatal(err)
	}
	if err := d.QueryRow(`SELECT count(*) FROM information_schema.columns
		WHERE table_name='llm_records' AND column_name IN ('raw_request','raw_response')`).Scan(&rawCols); err != nil {
		t.Fatal(err)
	}
	if records != 1 || usage != 1 || rawCols != 2 {
		t.Errorf("after adopt: llm_records legacy rows=%d llm_usage legacy rows=%d raw columns=%d, want 1 1 2", records, usage, rawCols)
	}
	d.Close()
	assertReopenIsNoop(t, dsn, applied)
}

// probeMigration records how many migrations were already applied when it
// ran, and fails if it ever runs twice (CREATE TABLE without IF NOT EXISTS).
var probeMigration = &fstest.MapFile{Data: []byte(`
CREATE TABLE migration_probe (applied_before INTEGER);
INSERT INTO migration_probe SELECT count(*) FROM schema_migrations;
`)}

func TestMigrationsApplyNewVersionOnceInOrder(t *testing.T) {
	dsn := scratchDSN(t, "order")
	fsys := withEmbedded(t, fstest.MapFS{"0003_probe.sql": probeMigration})
	for pass := 1; pass <= 2; pass++ {
		d, err := openWithMigrations(dsn, fsys)
		if err != nil {
			t.Fatalf("pass %d: %v", pass, err)
		}
		applied := readApplied(t, d)
		if len(applied) != 3 || applied[2].version != 3 || applied[2].name != "0003_probe.sql" {
			t.Fatalf("pass %d: schema_migrations = %+v", pass, applied)
		}
		var runs, before int
		if err := d.QueryRow(`SELECT count(*), max(applied_before) FROM migration_probe`).Scan(&runs, &before); err != nil {
			t.Fatal(err)
		}
		if runs != 1 || before != 2 {
			t.Fatalf("pass %d: probe ran %d times with %d migrations before it, want 1 and 2", pass, runs, before)
		}
		d.Close()
	}
}

func TestMigrationsFailClosed(t *testing.T) {
	dsn := scratchDSN(t, "closed")
	d, err := openWithMigrations(dsn, withEmbedded(t, fstest.MapFS{"0003_probe.sql": probeMigration}))
	if err != nil {
		t.Fatal(err)
	}
	d.Close()

	cases := []struct {
		name string
		fsys fs.FS
		want []string
	}{
		{"checksum changed", withEmbedded(t, fstest.MapFS{"0003_probe.sql": {Data: append([]byte("-- edited\n"), probeMigration.Data...)}}),
			[]string{"0003", "0003_probe.sql", "checksum"}},
		{"version missing from binary", withEmbedded(t, fstest.MapFS{}),
			[]string{"0003", "0003_probe.sql", "missing from this binary"}},
		{"name changed", withEmbedded(t, fstest.MapFS{"0003_renamed.sql": probeMigration}),
			[]string{"0003", "0003_probe.sql", "0003_renamed.sql"}},
	}
	for _, c := range cases {
		d, err := openWithMigrations(dsn, c.fsys)
		if err == nil {
			d.Close()
			t.Errorf("%s: Open succeeded, want error", c.name)
			continue
		}
		for _, w := range c.want {
			if !strings.Contains(err.Error(), w) {
				t.Errorf("%s: error %q does not mention %q", c.name, err, w)
			}
		}
	}
}

func TestFailingMigrationRollsBackAndBlocksOpen(t *testing.T) {
	dsn := scratchDSN(t, "fail")
	fsys := withEmbedded(t, fstest.MapFS{
		"0003_probe.sql": probeMigration,
		"0004_broken.sql": {Data: []byte(`
CREATE TABLE migration_broken (x INTEGER);
SELECT 1/0;
`)},
	})
	d, err := openWithMigrations(dsn, fsys)
	if err == nil {
		d.Close()
		t.Fatal("Open succeeded with a failing migration")
	}
	if !strings.Contains(err.Error(), "0004") || !strings.Contains(err.Error(), "0004_broken.sql") {
		t.Errorf("error %q does not name the failing migration", err)
	}

	// Inspect with the migrations that succeeded: earlier ones stay applied,
	// the failing one left nothing behind.
	d, err = openWithMigrations(dsn, withEmbedded(t, fstest.MapFS{"0003_probe.sql": probeMigration}))
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	applied := readApplied(t, d)
	if len(applied) != 3 || applied[2].version != 3 {
		t.Fatalf("schema_migrations = %+v, want versions 1..3", applied)
	}
	var broken bool
	if err := d.QueryRow(`SELECT to_regclass('migration_broken') IS NOT NULL`).Scan(&broken); err != nil {
		t.Fatal(err)
	}
	if broken {
		t.Error("migration_broken exists: the failed migration was not rolled back")
	}
}

// A database already at 0003 must refuse a binary that adds 0002 below it,
// before writing anything.
func TestMigrationsRefuseOutOfOrderVersion(t *testing.T) {
	dsn := scratchDSN(t, "outoforder")
	records, err := fs.ReadFile(migrationsFS(), llmRecordsMigration)
	if err != nil {
		t.Fatal(err)
	}
	d, err := openWithMigrations(dsn, fstest.MapFS{
		llmRecordsMigration: {Data: records},
		"0003_probe.sql":    probeMigration,
	})
	if err != nil {
		t.Fatal(err)
	}
	before := readApplied(t, d)
	d.Close()
	if len(before) != 2 || before[0].version != 1 || before[1].version != 3 {
		t.Fatalf("setup schema_migrations = %+v, want versions 1 and 3", before)
	}

	d, err = openWithMigrations(dsn, withEmbedded(t, fstest.MapFS{"0003_probe.sql": probeMigration}))
	if err == nil {
		d.Close()
		t.Fatal("Open succeeded with 0002 pending below applied 0003")
	}
	for _, w := range []string{llmUsageMigration, "(0002)", "0003_probe.sql", "(0003)", "never inserted"} {
		if !strings.Contains(err.Error(), w) {
			t.Errorf("error %q does not mention %q", err, w)
		}
	}

	raw, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer raw.Close()
	after := readApplied(t, &DB{raw})
	if len(after) != len(before) {
		t.Fatalf("schema_migrations changed: before %+v, after %+v", before, after)
	}
	for i := range before {
		if after[i].version != before[i].version || after[i].checksum != before[i].checksum || !after[i].appliedAt.Equal(before[i].appliedAt) {
			t.Errorf("schema_migrations row %d changed: before %+v, after %+v", i, before[i], after[i])
		}
	}
	var usage bool
	if err := raw.QueryRow(`SELECT to_regclass('llm_usage') IS NOT NULL`).Scan(&usage); err != nil {
		t.Fatal(err)
	}
	if usage {
		t.Error("llm_usage exists: the refused 0002 migration ran")
	}
}

// A database from before withdrawn_at has lesson evidence and no 0012 row.
// Open adds the column, keeps every row live, and a second Open is a no-op.
func TestLessonWithdrawnMigrationKeepsExistingEvidence(t *testing.T) {
	dsn := scratchDSN(t, "lesson_withdrawn")
	d, err := Open(dsn)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	const migrationName = "0012_lesson_withdrawn.sql"
	migrationSQL, err := fs.ReadFile(migrationsFS(), migrationName)
	if err != nil {
		t.Fatal(err)
	}
	// The migration file alone adds the column to a table without it.
	for _, q := range []string{
		`DROP INDEX IF EXISTS uq_rsi_lesson_evidence_live`,
		`ALTER TABLE rsi_lesson_evidence DROP COLUMN withdrawn_at`,
		string(migrationSQL),
		`ALTER TABLE rsi_lesson_evidence DROP COLUMN withdrawn_at`,
		`DELETE FROM schema_migrations WHERE version >= 12`,
		`INSERT INTO rsi_lessons(dedupe_key,kind,cue,action,status)
		 VALUES ('legacy-lesson','positive','xss','Confirmed xss: legacy','adopted')`,
		`INSERT INTO rsi_lesson_evidence(lesson_id,source_kind,source_id,detail)
		 SELECT id,'finding',101,'legacy' FROM rsi_lessons WHERE dedupe_key='legacy-lesson'
		 UNION ALL
		 SELECT id,'retest',202,'legacy' FROM rsi_lessons WHERE dedupe_key='legacy-lesson'`,
	} {
		if _, err := d.Exec(q); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	d.Close()

	check := func(d *DB) {
		t.Helper()
		var nullable, dataType string
		var hasDefault bool
		if err := d.QueryRow(`SELECT is_nullable, data_type, column_default IS NOT NULL
			FROM information_schema.columns
			WHERE table_name='rsi_lesson_evidence' AND column_name='withdrawn_at'`).Scan(&nullable, &dataType, &hasDefault); err != nil {
			t.Fatalf("withdrawn_at column: %v", err)
		}
		if nullable != "YES" || dataType != "timestamp with time zone" || hasDefault {
			t.Fatalf("withdrawn_at nullable=%s type=%s default=%v, want YES, timestamp with time zone, none", nullable, dataType, hasDefault)
		}
		var status string
		var rows, live int
		if err := d.QueryRow(`SELECT l.status, COUNT(e.*), COUNT(e.*) FILTER (WHERE e.withdrawn_at IS NULL)
			FROM rsi_lessons l JOIN rsi_lesson_evidence e ON e.lesson_id=l.id
			WHERE l.dedupe_key='legacy-lesson' GROUP BY l.status`).Scan(&status, &rows, &live); err != nil {
			t.Fatalf("legacy lesson: %v", err)
		}
		if status != "adopted" || rows != 2 || live != 2 {
			t.Fatalf("legacy lesson status=%s evidence=%d live=%d, want adopted 2 2", status, rows, live)
		}
	}

	d, err = Open(dsn)
	if err != nil {
		t.Fatalf("Open on the pre-0012 database: %v", err)
	}
	check(d)
	before := readApplied(t, d)
	has12 := false
	for _, m := range before {
		if m.version == 12 && m.name == migrationName {
			has12 = true
			break
		}
	}
	if !has12 {
		t.Fatalf("applied migrations = %+v, missing 0012", before)
	}
	d.Close()

	d, err = Open(dsn)
	if err != nil {
		t.Fatalf("second Open: %v", err)
	}
	defer d.Close()
	check(d)
	after := readApplied(t, d)
	if len(after) != len(before) {
		t.Fatalf("second Open changed schema_migrations: before %+v, after %+v", before, after)
	}
	for i := range before {
		if !after[i].appliedAt.Equal(before[i].appliedAt) || after[i].checksum != before[i].checksum {
			t.Errorf("second Open changed migration %04d: before %+v, after %+v", before[i].version, before[i], after[i])
		}
	}
}
