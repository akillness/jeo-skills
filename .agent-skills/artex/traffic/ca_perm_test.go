package traffic

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// The MITM CA private key is the server's alone; the CA certificate stays readable
// for the agents' tools. Checked on first creation and on a restart that finds a
// key an older version left world-readable.
func TestOpenRestrictsCAKey(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("unix permission bits")
	}
	dir := t.TempDir()
	key := filepath.Join(dir, "_ca", "mitmproxy-ca.pem")
	check := func(stage string) {
		t.Helper()
		tr, err := Open(dir, "127.0.0.1:0")
		if err != nil {
			t.Fatal(err)
		}
		cert := tr.CACertPath()
		tr.Close()
		ki, err := os.Stat(key)
		if err != nil {
			t.Fatal(err)
		}
		if ki.Mode().Perm() != 0o600 {
			t.Errorf("%s: CA key mode %o, want 600", stage, ki.Mode().Perm())
		}
		ci, err := os.Stat(cert)
		if err != nil {
			t.Fatal(err)
		}
		if ci.Mode().Perm()&0o004 == 0 {
			t.Errorf("%s: CA certificate mode %o must stay world-readable", stage, ci.Mode().Perm())
		}
	}
	check("created")
	if err := os.Chmod(key, 0o644); err != nil {
		t.Fatal(err)
	}
	check("reopened")
}
