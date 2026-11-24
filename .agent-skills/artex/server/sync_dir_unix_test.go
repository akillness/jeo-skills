//go:build unix

package server

import (
	"path/filepath"
	"testing"
)

func TestSyncDir(t *testing.T) {
	dir := t.TempDir()
	if err := syncDir(dir); err != nil {
		t.Fatalf("sync of an existing directory: %v", err)
	}
	if err := syncDir(filepath.Join(dir, "missing")); err == nil {
		t.Fatal("sync of a missing directory must fail")
	}
}
