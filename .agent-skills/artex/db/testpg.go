package db

// skipper is the part of testing.TB used by the PostgreSQL test helpers below.
// A local interface keeps the production package from importing "testing":
// *testing.T, *testing.B and the test-only wrappers all satisfy it.
type skipper interface {
	Helper()
	Skip(args ...any)
	Skipf(format string, args ...any)
}

// SkipPGUnavailable skips the calling test with one uniform reason when err
// reports that the test database could not be configured or opened.
//
// Every PostgreSQL-dependent test uses this instead of spelling the skip text
// inline (the old variants differed by package: "no database config",
// "database unavailable", "postgres unavailable — skipping", ...). Call it
// with the err returned by DSN(), Open() or NewManager(). It does not change
// when a test skips — only how the reason is reported.
func SkipPGUnavailable(t skipper, err error) {
	t.Helper()
	if err != nil {
		t.Skipf("postgres unavailable (%v)", err)
	}
}

// SkipNoPG skips with the same uniform reason when a store is unexpectedly nil
// after a successful open (for example Manager.pg when only some backends are
// configured). It carries no error because there is none to report.
func SkipNoPG(t skipper) {
	t.Helper()
	t.Skip("postgres unavailable")
}
