package traffic

import (
	"bytes"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestSpillBlobIsOwnerOnly(t *testing.T) {
	dir := t.TempDir()
	tr := &Traffic{dir: dir}
	body := bytes.Repeat([]byte("a"), maxInlineBody+1)
	got := tr.spill(body, "text/plain")
	if got.hash == "" {
		t.Fatal("expected a spilled blob")
	}
	blobDir := filepath.Join(dir, "_blobs", "sha256", got.hash[:2])
	blobPath := filepath.Join(blobDir, got.hash+".bin")
	info, err := os.Stat(blobPath)
	if err != nil {
		t.Fatal(err)
	}
	dirInfo, err := os.Stat(blobDir)
	if err != nil {
		t.Fatal(err)
	}
	if runtime.GOOS == "windows" {
		return
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("blob mode %o, want 0600", info.Mode().Perm())
	}
	if dirInfo.Mode().Perm() != 0o700 {
		t.Fatalf("blob dir mode %o, want 0700", dirInfo.Mode().Perm())
	}
}

func TestOpenTightensExistingBlobPerms(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX file permissions not enforced on Windows")
	}
	dir := t.TempDir()
	blobsRoot := filepath.Join(dir, "_blobs")
	shaDir := filepath.Join(blobsRoot, "sha256")
	bucket := filepath.Join(shaDir, "ab")
	if err := os.MkdirAll(bucket, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, d := range []string{blobsRoot, shaDir, bucket} {
		if err := os.Chmod(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	blob := filepath.Join(bucket, "abcdef.bin")
	if err := os.WriteFile(blob, []byte("secret-body"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(blob, 0o644); err != nil {
		t.Fatal(err)
	}

	tr, err := Open(dir, "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer tr.Close()

	for _, d := range []string{blobsRoot, shaDir, bucket} {
		info, err := os.Stat(d)
		if err != nil {
			t.Fatal(err)
		}
		if info.Mode().Perm() != 0o700 {
			t.Fatalf("%s mode %o, want 0700", d, info.Mode().Perm())
		}
	}
	info, err := os.Stat(blob)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("%s mode %o, want 0600", blob, info.Mode().Perm())
	}
}
