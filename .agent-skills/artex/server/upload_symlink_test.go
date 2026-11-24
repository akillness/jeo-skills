package server

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestRefuseUploadSymlink(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "secret")
	if err := os.WriteFile(target, []byte("keep"), 0o644); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(dir, "upload")
	if err := os.Symlink(target, link); err != nil {
		t.Skipf("symlink: %v", err)
	}
	if err := refuseUploadSymlink(link); err == nil {
		t.Fatal("symlink destination was accepted")
	}
	body, err := os.ReadFile(target)
	if err != nil {
		t.Fatal(err)
	}
	if string(body) != "keep" {
		t.Fatalf("target changed to %q", body)
	}
	missing := filepath.Join(dir, "fresh")
	if err := refuseUploadSymlink(missing); err != nil {
		t.Fatal(err)
	}
}

func TestOpenUploadFileNoFollowRejectsSymlink(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("O_NOFOLLOW is Unix-only")
	}
	dir := t.TempDir()
	target := filepath.Join(dir, "secret")
	if err := os.WriteFile(target, []byte("keep"), 0o644); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(dir, "link")
	if err := os.Symlink(target, link); err != nil {
		t.Skipf("symlink: %v", err)
	}
	if f, err := openUploadFileNoFollow(link); err == nil {
		_ = f.Close()
		t.Fatal("openUploadFileNoFollow accepted a symlink")
	}
	body, err := os.ReadFile(target)
	if err != nil {
		t.Fatal(err)
	}
	if string(body) != "keep" {
		t.Fatalf("target changed to %q", body)
	}
}

func TestUniqueUploadPathSkipsDanglingSymlink(t *testing.T) {
	dir := t.TempDir()
	dangling := filepath.Join(dir, "note.txt")
	if err := os.Symlink(filepath.Join(dir, "nonexistent"), dangling); err != nil {
		t.Skipf("symlink: %v", err)
	}
	got, err := uniqueUploadPath(dir, "note.txt")
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(got) != "note-1.txt" {
		t.Fatalf("got %s, want note-1.txt", got)
	}
}
