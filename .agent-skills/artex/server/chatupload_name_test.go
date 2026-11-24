package server

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestUniqueUploadPathSuffixesCollisions(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "note.txt"), []byte("a"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "note-1.txt"), []byte("b"), 0o644); err != nil {
		t.Fatal(err)
	}
	got, err := uniqueUploadPath(dir, "note.txt")
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(got) != "note-2.txt" {
		t.Fatalf("got %s", got)
	}
}

func TestUniqueUploadPathStopsOnUnstorableName(t *testing.T) {
	dir := t.TempDir()
	name := strings.Repeat("a", 300) + ".txt"
	if _, err := uniqueUploadPath(dir, name); err == nil {
		t.Fatal("an overlong file name must not be searched forever")
	}
}
