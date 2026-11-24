package db

import (
	"fmt"
	"testing"
	"time"
)

// InsertSettingIfAbsent is the fallback guarantee for auth.password_hash: the caller's
// GetSetting check may be defeated by a database error, or preempted by a concurrent
// request (bcrypt takes tens of milliseconds), so the "settable only once" guarantee must
// rest on the primary-key constraint, not on an upper-layer if.
func TestInsertSettingIfAbsentDoesNotOverwrite(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	defer d.Close()

	// Use a test-only key; never touch the real auth.password_hash in the dev database.
	key := fmt.Sprintf("test.insert_if_absent.%d", time.Now().UnixNano())
	defer func() { _, _ = d.Exec(`DELETE FROM settings WHERE key=$1`, key) }()

	inserted, err := d.InsertSettingIfAbsent(key, "first")
	if err != nil {
		t.Fatal(err)
	}
	if !inserted {
		t.Fatal("first write should return inserted=true")
	}

	inserted, err = d.InsertSettingIfAbsent(key, "second")
	if err != nil {
		t.Fatal(err)
	}
	if inserted {
		t.Fatal("an existing key should return inserted=false")
	}

	got, ok, err := d.GetSetting(key)
	if err != nil || !ok {
		t.Fatalf("GetSetting: ok=%v err=%v", ok, err)
	}
	if got != "first" {
		t.Fatalf("value was overwritten to %q, should stay %q", got, "first")
	}
}

// A version row that cannot increment must roll the hash write back with it.
func TestRotatePasswordRollsBackHashWhenVersionCannotIncrement(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	defer d.Close()

	stamp := time.Now().UnixNano()
	hashKey := fmt.Sprintf("test.rotate_hash.%d", stamp)
	versionKey := fmt.Sprintf("test.rotate_version.%d", stamp)
	freshKey := fmt.Sprintf("test.rotate_fresh.%d", stamp)
	defer func() {
		_, _ = d.Exec(`DELETE FROM settings WHERE key=$1 OR key=$2 OR key=$3`, hashKey, versionKey, freshKey)
	}()
	if err := d.SetSetting(hashKey, "old-hash"); err != nil {
		t.Fatal(err)
	}
	if err := d.SetSetting(versionKey, "not-a-number"); err != nil {
		t.Fatal(err)
	}
	if _, err := d.RotatePassword(hashKey, "new-hash", versionKey); err == nil {
		t.Fatal("increment of a non-numeric version should fail")
	}
	got, ok, err := d.GetSetting(hashKey)
	if err != nil || !ok || got != "old-hash" {
		t.Fatalf("hash=%q ok=%v err=%v, want the previous hash", got, ok, err)
	}
	ver, _, err := d.GetSetting(versionKey)
	if err != nil || ver != "not-a-number" {
		t.Fatalf("version=%q err=%v, want the previous value", ver, err)
	}

	n, err := d.RotatePassword(hashKey, "new-hash", freshKey)
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("first version=%d want 1", n)
	}
	n, err = d.RotatePassword(hashKey, "newer-hash", freshKey)
	if err != nil {
		t.Fatal(err)
	}
	if n != 2 {
		t.Fatalf("second version=%d want 2", n)
	}
}
