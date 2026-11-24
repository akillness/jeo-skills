package server

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"testing"
)

func TestWorkspaceDeniesPlatformPaths(t *testing.T) {
	dir := t.TempDir()
	for _, p := range []string{"traffic/_ca", "traffic/_index", "traffic/host", "other"} {
		if err := os.MkdirAll(filepath.Join(dir, p), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	key := filepath.Join(dir, "traffic", "_ca", "mitmproxy-ca.pem")
	if err := os.WriteFile(key, []byte("key"), 0o600); err != nil {
		t.Fatal(err)
	}
	s := &Server{m: &Manager{dir: dir}}

	for _, rel := range []string{
		"traffic/_ca",
		"traffic/_ca/mitmproxy-ca.pem",
		"traffic/_index",
		"traffic/_index/index.sqlite",
		"TRAFFIC/_CA/mitmproxy-ca.pem",
		"traffic/_ca.",
		"traffic/_ca./mitmproxy-ca.pem",
	} {
		if _, ok := s.wsResolveConfined(rel); ok {
			t.Errorf("%q resolved, want a refusal", rel)
		}
	}

	for _, rel := range []string{"", "traffic", "traffic/host", "traffic/_caX", "other"} {
		if _, ok := s.wsResolveConfined(rel); !ok {
			t.Errorf("%q refused, want a resolution", rel)
		}
	}

	link := filepath.Join(dir, "alias")
	if err := os.Symlink(filepath.Join(dir, "traffic", "_ca"), link); err == nil {
		if _, ok := s.wsResolveConfined("alias/mitmproxy-ca.pem"); ok {
			t.Error("symlink alias to traffic/_ca resolved")
		}
	}
}

func TestWorkspacePathDenied(t *testing.T) {
	root := filepath.Clean("/data")
	for _, tc := range []struct {
		path string
		want bool
	}{
		{"/data/traffic/_ca", true},
		{"/data/traffic/_ca/x", true},
		{"/data/traffic/_index/index.sqlite", true},
		{"/data/traffic/_caX", false},
		{"/data/traffic", false},
		{"/data/other", false},
		{"/elsewhere/traffic/_ca", true}, // outside the root: fail closed
	} {
		if got := workspacePathDenied(root, filepath.FromSlash(tc.path)); got != tc.want {
			t.Errorf("workspacePathDenied(%q) = %v, want %v", tc.path, got, tc.want)
		}
	}
}

// Deleting a directory that holds a platform-internal subtree would remove the
// capture CA key and the exchange index with it, and the blob store is as
// internal as the index. Neither is reachable through the file manager.
func TestWorkspaceDeleteKeepsPlatformPathsAndBlobsAreDenied(t *testing.T) {
	dir := t.TempDir()
	for _, p := range []string{"traffic/_ca", "traffic/_index", "traffic/_blobs/sha256/ab", "traffic/host", "other/sub"} {
		if err := os.MkdirAll(filepath.Join(dir, p), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	kept := []string{"traffic/_ca/mitmproxy-ca.pem", "traffic/_index/index.sqlite", "traffic/_blobs/sha256/ab/abcd.bin", "traffic/host/note.txt"}
	for _, p := range append(kept, "other/sub/note.txt") {
		if err := os.WriteFile(filepath.Join(dir, p), []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	s := &Server{m: &Manager{dir: dir}}
	call := func(h http.HandlerFunc, method, target string) int {
		rec := httptest.NewRecorder()
		h(rec, httptest.NewRequest(method, target, nil))
		return rec.Code
	}

	// The parent of the denied subtrees, in the spellings that reach it.
	for _, rel := range []string{"traffic", "traffic/", "TRAFFIC", "traffic."} {
		if code := call(s.wsDelete, "DELETE", "/api/workspace/delete?path="+url.QueryEscape(rel)); code != 400 {
			t.Errorf("DELETE %q: status=%d, want 400", rel, code)
		}
	}
	for _, p := range kept {
		if _, err := os.Stat(filepath.Join(dir, p)); err != nil {
			t.Errorf("%s is gone after the refused deletes: %v", p, err)
		}
	}

	// The blob store is denied like the CA and the index.
	for _, rel := range []string{"traffic/_blobs", "traffic/_blobs/sha256/ab/abcd.bin", "TRAFFIC/_BLOBS/sha256"} {
		for name, h := range map[string]http.HandlerFunc{"list": s.wsList, "read": s.wsRead, "download": s.wsDownload} {
			if code := call(h, "GET", "/api/workspace/"+name+"?path="+url.QueryEscape(rel)); code != 400 {
				t.Errorf("%s %q: status=%d, want 400", name, rel, code)
			}
		}
		if code := call(s.wsDelete, "DELETE", "/api/workspace/delete?path="+url.QueryEscape(rel)); code != 400 {
			t.Errorf("DELETE %q: status=%d, want 400", rel, code)
		}
	}
	if _, err := os.Stat(filepath.Join(dir, "traffic/_blobs/sha256/ab/abcd.bin")); err != nil {
		t.Errorf("the blob is gone: %v", err)
	}

	// A symlink to the traffic directory is removed as a link; its target stays.
	if err := os.Symlink(filepath.Join(dir, "traffic"), filepath.Join(dir, "alias")); err == nil {
		if code := call(s.wsDelete, "DELETE", "/api/workspace/delete?path=alias"); code != 200 {
			t.Errorf("DELETE of a symlink to traffic: status=%d, want 200", code)
		}
		if _, err := os.Lstat(filepath.Join(dir, "alias")); err == nil {
			t.Error("the symlink was not removed")
		}
		if _, err := os.Stat(filepath.Join(dir, "traffic/_ca/mitmproxy-ca.pem")); err != nil {
			t.Errorf("deleting the symlink removed the CA key: %v", err)
		}
	}

	// Ordinary trees, and the traffic of one host, are still deletable.
	for _, rel := range []string{"traffic/host", "other"} {
		if code := call(s.wsDelete, "DELETE", "/api/workspace/delete?path="+url.QueryEscape(rel)); code != 200 {
			t.Errorf("DELETE %q: status=%d, want 200", rel, code)
		}
		if _, err := os.Stat(filepath.Join(dir, rel)); err == nil {
			t.Errorf("%s still exists after its delete", rel)
		}
	}
}
