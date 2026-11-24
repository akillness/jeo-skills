package db

import (
	"errors"
	"fmt"
	"testing"
)

// These helpers report a failed test cleanup instead of swallowing it: a silent
// failure leaves the test's rows behind for the next run on the same database.

// cleanupErr reports err from the cleanup step described by what.
func cleanupErr(t *testing.T, what string, err error) {
	t.Helper()
	if err != nil {
		t.Errorf("cleanup %s: %v", what, err)
	}
}

// cleanupExec runs one cleanup statement. Matching no row is not an error.
func cleanupExec(t *testing.T, d *DB, query string, args ...any) {
	t.Helper()
	_, err := d.Exec(query, args...)
	cleanupErr(t, query, err)
}

// cleanupProfile deletes a profile through DeleteProfile. A profile the test
// already deleted is not an error.
func cleanupProfile(t *testing.T, d *DB, id int64) {
	t.Helper()
	if err := d.DeleteProfile(id); !errors.Is(err, ErrLLMProfileNotFound) {
		cleanupErr(t, fmt.Sprintf("profile %d", id), err)
	}
}
