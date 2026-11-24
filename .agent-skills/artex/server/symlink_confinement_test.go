package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"testing"
)

// mustSymlink creates a symlink at newname pointing to oldname. On Windows
// without symlink privileges it skips the test so the package still builds and
// tests cleanly there.
func mustSymlink(t *testing.T, oldname, newname string) {
	t.Helper()
	if err := os.Symlink(oldname, newname); err != nil {
		if runtime.GOOS == "windows" && isWindowsSymlinkPrivilegeErr(err) {
			t.Skipf("skipping symlink test on Windows without symlink privileges: %v", err)
		}
		t.Fatalf("os.Symlink(%q, %q): %v", oldname, newname, err)
	}
}

func isWindowsSymlinkPrivilegeErr(err error) bool {
	if errors.Is(err, os.ErrPermission) {
		return true
	}
	var errno syscall.Errno
	if errors.As(err, &errno) && errno == 1314 { // ERROR_PRIVILEGE_NOT_HELD
		return true
	}
	return strings.Contains(strings.ToLower(err.Error()), "privilege")
}

func assertNoAbsPathLeak(t *testing.T, body string, paths ...string) {
	t.Helper()
	for _, p := range paths {
		if p == "" {
			continue
		}
		if strings.Contains(body, p) {
			t.Errorf("response body leaked absolute path %q: %s", p, body)
		}
		if real, err := filepath.EvalSymlinks(p); err == nil && real != "" && strings.Contains(body, real) {
			t.Errorf("response body leaked resolved path %q: %s", real, body)
		}
	}
}

// symlinkFixture sets up a root dir and a sibling outside dir with every
// required symlink scenario:
//   - out-file: symlink to outside/secret.txt
//   - out-dir: symlink to outside/dir (contains secret.txt)
//   - in-file-rel: relative symlink to inside.txt
//   - in-file-abs: absolute symlink to <root>/inside.txt
//   - in-dir-rel: relative symlink to subdir (contains nested.txt)
//   - in-dir-abs: absolute symlink to <root>/subdir
//   - broken-out: dangling symlink to outside/missing.txt
//   - broken-in: dangling symlink to missing-inside.txt
//   - loop-a <-> loop-b: symlink loop
//   - subdir/rel-escape-file: relative symlink with ".." escaping to outside/secret.txt
//   - subdir/rel-escape-dir: relative symlink with ".." escaping to outside/dir
//   - subdir/rel-inside: relative symlink with ".." staying inside (<root>/inside.txt)
type symlinkFixture struct {
	root          string
	outside       string
	outsideSecret string
	outsideDir    string
}

func newSymlinkFixture(t *testing.T) symlinkFixture {
	t.Helper()
	base := t.TempDir()
	root := filepath.Join(base, "root")
	outside := filepath.Join(base, "outside")
	outsideDir := filepath.Join(outside, "dir")
	subdir := filepath.Join(root, "subdir")

	for _, d := range []string{root, outsideDir, subdir} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	outsideSecret := filepath.Join(outside, "secret.txt")
	if err := os.WriteFile(outsideSecret, []byte("TOP_SECRET"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(outsideDir, "secret.txt"), []byte("DIR_SECRET"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "inside.txt"), []byte("INSIDE_OK"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(subdir, "nested.txt"), []byte("NESTED_OK"), 0o644); err != nil {
		t.Fatal(err)
	}

	mustSymlink(t, outsideSecret, filepath.Join(root, "out-file"))
	mustSymlink(t, outsideDir, filepath.Join(root, "out-dir"))
	mustSymlink(t, "inside.txt", filepath.Join(root, "in-file-rel"))
	mustSymlink(t, filepath.Join(root, "inside.txt"), filepath.Join(root, "in-file-abs"))
	mustSymlink(t, "subdir", filepath.Join(root, "in-dir-rel"))
	mustSymlink(t, subdir, filepath.Join(root, "in-dir-abs"))
	mustSymlink(t, filepath.Join(outside, "missing.txt"), filepath.Join(root, "broken-out"))
	mustSymlink(t, "missing-inside.txt", filepath.Join(root, "broken-in"))
	mustSymlink(t, "loop-b", filepath.Join(root, "loop-a"))
	mustSymlink(t, "loop-a", filepath.Join(root, "loop-b"))
	mustSymlink(t, filepath.Join("..", "..", "outside", "secret.txt"), filepath.Join(subdir, "rel-escape-file"))
	mustSymlink(t, filepath.Join("..", "..", "outside", "dir"), filepath.Join(subdir, "rel-escape-dir"))
	mustSymlink(t, filepath.Join("..", "inside.txt"), filepath.Join(subdir, "rel-inside"))

	return symlinkFixture{
		root:          root,
		outside:       outside,
		outsideSecret: outsideSecret,
		outsideDir:    outsideDir,
	}
}

func newTestWorkspaceServer(root string) *Server {
	return &Server{m: &Manager{dir: root}}
}

func doJSONReq(t *testing.T, method, target string, payload any, h http.HandlerFunc) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	if payload != nil {
		if err := json.NewEncoder(&body).Encode(payload); err != nil {
			t.Fatal(err)
		}
	}
	req := httptest.NewRequest(method, target, &body)
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	h(rr, req)
	return rr
}

func doUploadReq(t *testing.T, s *Server, dirPath, filename, content string) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	fw, err := mw.CreateFormFile("file", filename)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := fw.Write([]byte(content)); err != nil {
		t.Fatal(err)
	}
	if err := mw.Close(); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/workspace/upload?path="+url.QueryEscape(dirPath), &body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	rr := httptest.NewRecorder()
	s.wsUpload(rr, req)
	return rr
}

func TestWorkspaceListSymlinkConfinement(t *testing.T) {
	f := newSymlinkFixture(t)
	s := newTestWorkspaceServer(f.root)

	rejectCases := []struct {
		name string
		path string
	}{
		{"symlink to outside file", "out-file"},
		{"symlink to outside dir", "out-dir"},
		{"child of symlink to outside dir", "out-dir/sub"},
		{"broken symlink outside", "broken-out"},
		{"broken symlink inside", "broken-in"},
		{"symlink loop", "loop-a"},
		{"dotdot plus outside symlink", "subdir/../out-dir"},
		{"outside symlink plus dotdot", "out-dir/.."},
		{"inside symlink plus dotdot escape", "in-dir-rel/../../outside"},
		{"relative symlink with dotdot escape", "subdir/rel-escape-dir"},
	}
	for _, tc := range rejectCases {
		t.Run("reject_"+tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/workspace/list?path="+url.QueryEscape(tc.path), nil)
			rr := httptest.NewRecorder()
			s.wsList(rr, req)
			if rr.Code != http.StatusBadRequest {
				t.Fatalf("wsList(%q) = %d (%s), want 400", tc.path, rr.Code, rr.Body.String())
			}
			assertNoAbsPathLeak(t, rr.Body.String(), f.root, f.outside)
		})
	}

	for _, okPath := range []string{"in-dir-rel", "in-dir-abs"} {
		t.Run("allow_"+okPath, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/workspace/list?path="+url.QueryEscape(okPath), nil)
			rr := httptest.NewRecorder()
			s.wsList(rr, req)
			if rr.Code != http.StatusOK {
				t.Fatalf("wsList(%q) = %d (%s), want 200", okPath, rr.Code, rr.Body.String())
			}
			if !strings.Contains(rr.Body.String(), "nested.txt") {
				t.Fatalf("wsList(%q) missing nested.txt: %s", okPath, rr.Body.String())
			}
		})
	}
}

func TestWorkspaceReadSymlinkConfinement(t *testing.T) {
	f := newSymlinkFixture(t)
	s := newTestWorkspaceServer(f.root)

	rejectCases := []struct {
		name string
		path string
	}{
		{"symlink to outside file", "out-file"},
		{"symlink to outside dir", "out-dir"},
		{"file under symlink to outside dir", "out-dir/secret.txt"},
		{"broken symlink outside", "broken-out"},
		{"broken symlink inside", "broken-in"},
		{"symlink loop", "loop-a"},
		{"dotdot plus outside symlink", "subdir/../out-file"},
		{"outside symlink plus dotdot", "out-dir/../secret.txt"},
		{"inside symlink plus dotdot escape", "in-dir-rel/../../outside/secret.txt"},
		{"relative symlink with dotdot escape", "subdir/rel-escape-file"},
	}
	for _, tc := range rejectCases {
		t.Run("reject_"+tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/workspace/read?path="+url.QueryEscape(tc.path), nil)
			rr := httptest.NewRecorder()
			s.wsRead(rr, req)
			if rr.Code != http.StatusBadRequest {
				t.Fatalf("wsRead(%q) = %d (%s), want 400", tc.path, rr.Code, rr.Body.String())
			}
			if strings.Contains(rr.Body.String(), "SECRET") {
				t.Fatalf("wsRead(%q) leaked outside content: %s", tc.path, rr.Body.String())
			}
			assertNoAbsPathLeak(t, rr.Body.String(), f.root, f.outside)
		})
	}

	allowCases := []struct {
		path string
		want string
	}{
		{"in-file-rel", "INSIDE_OK"},
		{"in-file-abs", "INSIDE_OK"},
		{"in-dir-rel/nested.txt", "NESTED_OK"},
		{"in-dir-abs/nested.txt", "NESTED_OK"},
		{"subdir/rel-inside", "INSIDE_OK"},
	}
	for _, tc := range allowCases {
		t.Run("allow_"+tc.path, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/workspace/read?path="+url.QueryEscape(tc.path), nil)
			rr := httptest.NewRecorder()
			s.wsRead(rr, req)
			if rr.Code != http.StatusOK {
				t.Fatalf("wsRead(%q) = %d (%s), want 200", tc.path, rr.Code, rr.Body.String())
			}
			if !strings.Contains(rr.Body.String(), tc.want) {
				t.Fatalf("wsRead(%q) = %s, want %q", tc.path, rr.Body.String(), tc.want)
			}
		})
	}
}

func TestWorkspaceWriteSymlinkConfinement(t *testing.T) {
	f := newSymlinkFixture(t)
	s := newTestWorkspaceServer(f.root)

	rejectCases := []struct {
		name string
		path string
	}{
		{"symlink to outside file", "out-file"},
		{"symlink to outside dir", "out-dir"},
		{"existing file under outside dir symlink", "out-dir/secret.txt"},
		{"nonexistent file under outside dir symlink", "out-dir/newsub/pwn.txt"},
		{"broken symlink outside", "broken-out"},
		{"nonexistent child under broken symlink", "broken-out/pwn.txt"},
		{"broken symlink inside", "broken-in"},
		{"symlink loop", "loop-a"},
		{"dotdot plus outside symlink", "subdir/../out-file"},
		{"outside symlink plus dotdot", "out-dir/../pwn.txt"},
		{"inside symlink plus dotdot escape", "in-dir-rel/../../outside/pwn.txt"},
		{"relative symlink with dotdot escape", "subdir/rel-escape-file"},
		{"nonexistent under relative dotdot escape dir", "subdir/rel-escape-dir/pwn.txt"},
	}
	for _, tc := range rejectCases {
		t.Run("reject_"+tc.name, func(t *testing.T) {
			rr := doJSONReq(t, http.MethodPost, "/api/workspace/write",
				map[string]string{"path": tc.path, "content": "OVERWRITTEN"}, s.wsWrite)
			if rr.Code != http.StatusBadRequest {
				t.Fatalf("wsWrite(%q) = %d (%s), want 400", tc.path, rr.Code, rr.Body.String())
			}
			assertNoAbsPathLeak(t, rr.Body.String(), f.root, f.outside)
		})
	}

	// Verify outside files were not touched or created.
	if got, _ := os.ReadFile(f.outsideSecret); string(got) != "TOP_SECRET" {
		t.Fatalf("outside secret modified: %q", got)
	}
	if got, _ := os.ReadFile(filepath.Join(f.outsideDir, "secret.txt")); string(got) != "DIR_SECRET" {
		t.Fatalf("outside dir secret modified: %q", got)
	}
	for _, untouched := range []string{
		filepath.Join(f.outside, "missing.txt"),
		filepath.Join(f.outside, "pwn.txt"),
		filepath.Join(f.outsideDir, "newsub", "pwn.txt"),
		filepath.Join(f.outsideDir, "pwn.txt"),
	} {
		if _, err := os.Lstat(untouched); !os.IsNotExist(err) {
			t.Fatalf("outside path should not exist: %s", untouched)
		}
	}

	// Symlink inside root staying inside must still work (existing file + nonexistent target under symlinked parent).
	t.Run("allow_inside_file_symlink", func(t *testing.T) {
		rr := doJSONReq(t, http.MethodPost, "/api/workspace/write",
			map[string]string{"path": "in-file-rel", "content": "UPDATED"}, s.wsWrite)
		if rr.Code != http.StatusOK {
			t.Fatalf("wsWrite(in-file-rel) = %d (%s), want 200", rr.Code, rr.Body.String())
		}
		if got, _ := os.ReadFile(filepath.Join(f.root, "inside.txt")); string(got) != "UPDATED" {
			t.Fatalf("inside.txt = %q, want UPDATED", got)
		}
	})
	t.Run("allow_nonexistent_under_inside_symlink_parent", func(t *testing.T) {
		rr := doJSONReq(t, http.MethodPost, "/api/workspace/write",
			map[string]string{"path": "in-dir-rel/fresh/created.txt", "content": "FRESH"}, s.wsWrite)
		if rr.Code != http.StatusOK {
			t.Fatalf("wsWrite(in-dir-rel/fresh/created.txt) = %d (%s), want 200", rr.Code, rr.Body.String())
		}
		if got, _ := os.ReadFile(filepath.Join(f.root, "subdir", "fresh", "created.txt")); string(got) != "FRESH" {
			t.Fatalf("created.txt = %q, want FRESH", got)
		}
	})
}

func TestWorkspaceMkdirSymlinkConfinement(t *testing.T) {
	f := newSymlinkFixture(t)
	s := newTestWorkspaceServer(f.root)

	rejectCases := []struct {
		name string
		path string
	}{
		{"symlink to outside file", "out-file"},
		{"symlink to outside dir", "out-dir"},
		{"nonexistent dir under outside symlink parent", "out-dir/escaped-dir/nested"},
		{"broken symlink outside", "broken-out"},
		{"broken symlink inside", "broken-in"},
		{"symlink loop", "loop-a"},
		{"dotdot plus outside symlink", "subdir/../out-dir/newdir"},
		{"outside symlink plus dotdot", "out-dir/../newdir"},
		{"inside symlink plus dotdot escape", "in-dir-rel/../../outside/newdir"},
		{"relative symlink with dotdot escape", "subdir/rel-escape-dir/newdir"},
	}
	for _, tc := range rejectCases {
		t.Run("reject_"+tc.name, func(t *testing.T) {
			rr := doJSONReq(t, http.MethodPost, "/api/workspace/mkdir",
				map[string]string{"path": tc.path}, s.wsMkdir)
			if rr.Code != http.StatusBadRequest {
				t.Fatalf("wsMkdir(%q) = %d (%s), want 400", tc.path, rr.Code, rr.Body.String())
			}
			assertNoAbsPathLeak(t, rr.Body.String(), f.root, f.outside)
		})
	}

	for _, untouched := range []string{
		filepath.Join(f.outsideDir, "escaped-dir"),
		filepath.Join(f.outside, "missing.txt"),
		filepath.Join(f.outside, "newdir"),
	} {
		if _, err := os.Lstat(untouched); !os.IsNotExist(err) {
			t.Fatalf("outside dir should not have been created: %s", untouched)
		}
	}

	t.Run("allow_inside_dir_symlink_and_nonexistent_child", func(t *testing.T) {
		rr := doJSONReq(t, http.MethodPost, "/api/workspace/mkdir",
			map[string]string{"path": "in-dir-rel/newchild/deep"}, s.wsMkdir)
		if rr.Code != http.StatusOK {
			t.Fatalf("wsMkdir(in-dir-rel/newchild/deep) = %d (%s), want 200", rr.Code, rr.Body.String())
		}
		if fi, err := os.Stat(filepath.Join(f.root, "subdir", "newchild", "deep")); err != nil || !fi.IsDir() {
			t.Fatalf("expected created directory inside root: err=%v", err)
		}
	})
}

func TestWorkspaceDeleteSymlinkConfinement(t *testing.T) {
	f := newSymlinkFixture(t)
	s := newTestWorkspaceServer(f.root)
	mustSymlink(t, ".", filepath.Join(f.root, "root-link"))

	rejectCases := []struct {
		name string
		path string
	}{
		{"symlink to outside file", "out-file"},
		{"symlink to outside dir", "out-dir"},
		{"file under symlink to outside dir", "out-dir/secret.txt"},
		{"broken symlink outside", "broken-out"},
		{"broken symlink inside", "broken-in"},
		{"symlink loop", "loop-a"},
		{"dotdot plus outside symlink", "subdir/../out-file"},
		{"outside symlink plus dotdot", "out-dir/../secret.txt"},
		{"inside symlink plus dotdot escape", "in-dir-rel/../../outside/secret.txt"},
		{"relative symlink with dotdot escape", "subdir/rel-escape-file"},
		{"symlink to root itself", "root-link"},
	}
	for _, tc := range rejectCases {
		t.Run("reject_"+tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodDelete, "/api/workspace/delete?path="+url.QueryEscape(tc.path), nil)
			rr := httptest.NewRecorder()
			s.wsDelete(rr, req)
			if rr.Code != http.StatusBadRequest {
				t.Fatalf("wsDelete(%q) = %d (%s), want 400", tc.path, rr.Code, rr.Body.String())
			}
			assertNoAbsPathLeak(t, rr.Body.String(), f.root, f.outside)
		})
	}

	if _, err := os.Stat(f.outsideSecret); err != nil {
		t.Fatalf("outside secret was deleted: %v", err)
	}
	if _, err := os.Stat(filepath.Join(f.outsideDir, "secret.txt")); err != nil {
		t.Fatalf("outside dir secret was deleted: %v", err)
	}

	// Deleting an in-root symlink removes the symlink itself and preserves its target.
	t.Run("allow_delete_inside_symlink", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodDelete, "/api/workspace/delete?path=in-file-rel", nil)
		rr := httptest.NewRecorder()
		s.wsDelete(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("wsDelete(in-file-rel) = %d (%s), want 200", rr.Code, rr.Body.String())
		}
		if _, err := os.Lstat(filepath.Join(f.root, "in-file-rel")); !os.IsNotExist(err) {
			t.Fatalf("in-file-rel symlink should have been removed")
		}
		if _, err := os.Stat(filepath.Join(f.root, "inside.txt")); err != nil {
			t.Fatalf("inside.txt target should still exist: %v", err)
		}
	})

	// Deleting a file through an inside directory symlink works.
	t.Run("allow_delete_through_inside_dir_symlink", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodDelete, "/api/workspace/delete?path=in-dir-rel/nested.txt", nil)
		rr := httptest.NewRecorder()
		s.wsDelete(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("wsDelete(in-dir-rel/nested.txt) = %d (%s), want 200", rr.Code, rr.Body.String())
		}
		if _, err := os.Stat(filepath.Join(f.root, "subdir", "nested.txt")); !os.IsNotExist(err) {
			t.Fatalf("nested.txt should have been deleted")
		}
	})
}

func TestWorkspaceDownloadSymlinkConfinement(t *testing.T) {
	f := newSymlinkFixture(t)
	s := newTestWorkspaceServer(f.root)

	rejectCases := []struct {
		name string
		path string
	}{
		{"symlink to outside file", "out-file"},
		{"symlink to outside dir", "out-dir"},
		{"file under symlink to outside dir", "out-dir/secret.txt"},
		{"broken symlink outside", "broken-out"},
		{"broken symlink inside", "broken-in"},
		{"symlink loop", "loop-a"},
		{"dotdot plus outside symlink", "subdir/../out-file"},
		{"outside symlink plus dotdot", "out-dir/../secret.txt"},
		{"inside symlink plus dotdot escape", "in-dir-rel/../../outside/secret.txt"},
		{"relative symlink with dotdot escape", "subdir/rel-escape-file"},
	}
	for _, tc := range rejectCases {
		t.Run("reject_"+tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/workspace/download?path="+url.QueryEscape(tc.path), nil)
			rr := httptest.NewRecorder()
			s.wsDownload(rr, req)
			if rr.Code != http.StatusBadRequest {
				t.Fatalf("wsDownload(%q) = %d (%s), want 400", tc.path, rr.Code, rr.Body.String())
			}
			if strings.Contains(rr.Body.String(), "SECRET") {
				t.Fatalf("wsDownload(%q) leaked outside content", tc.path)
			}
			assertNoAbsPathLeak(t, rr.Body.String(), f.root, f.outside)
		})
	}

	for _, tc := range []struct{ path, want string }{
		{"in-file-rel", "INSIDE_OK"},
		{"in-file-abs", "INSIDE_OK"},
		{"in-dir-rel/nested.txt", "NESTED_OK"},
	} {
		t.Run("allow_"+tc.path, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/workspace/download?path="+url.QueryEscape(tc.path), nil)
			rr := httptest.NewRecorder()
			s.wsDownload(rr, req)
			if rr.Code != http.StatusOK {
				t.Fatalf("wsDownload(%q) = %d (%s), want 200", tc.path, rr.Code, rr.Body.String())
			}
			if rr.Body.String() != tc.want {
				t.Fatalf("wsDownload(%q) body = %q, want %q", tc.path, rr.Body.String(), tc.want)
			}
		})
	}
}

func TestWorkspaceUploadSymlinkConfinement(t *testing.T) {
	f := newSymlinkFixture(t)
	s := newTestWorkspaceServer(f.root)

	rejectCases := []struct {
		name     string
		dirPath  string
		filename string
	}{
		{"filename is symlink to outside file", "", "out-file"},
		{"target dir is symlink to outside dir (new file)", "out-dir", "newfile.txt"},
		{"target dir is nonexistent under outside symlink", "out-dir/missing", "newfile.txt"},
		{"filename is symlink to outside dir", "", "out-dir"},
		{"filename is broken symlink outside", "", "broken-out"},
		{"filename is broken symlink inside", "", "broken-in"},
		{"target dir is broken symlink", "broken-out", "newfile.txt"},
		{"target dir is symlink loop", "loop-a", "newfile.txt"},
		{"filename is symlink loop", "", "loop-a"},
		{"dotdot plus outside symlink dir", "subdir/../out-dir", "newfile.txt"},
		{"inside symlink dir plus dotdot escape", "in-dir-rel/../../outside", "newfile.txt"},
		{"relative symlink with dotdot escape dir", "subdir/rel-escape-dir", "newfile.txt"},
	}
	for _, tc := range rejectCases {
		t.Run("reject_"+tc.name, func(t *testing.T) {
			rr := doUploadReq(t, s, tc.dirPath, tc.filename, "UPLOADED_EVIL")
			if rr.Code != http.StatusBadRequest {
				t.Fatalf("wsUpload(dir=%q, file=%q) = %d (%s), want 400", tc.dirPath, tc.filename, rr.Code, rr.Body.String())
			}
			assertNoAbsPathLeak(t, rr.Body.String(), f.root, f.outside)
		})
	}

	if got, _ := os.ReadFile(f.outsideSecret); string(got) != "TOP_SECRET" {
		t.Fatalf("outside secret modified by upload: %q", got)
	}
	for _, untouched := range []string{
		filepath.Join(f.outsideDir, "newfile.txt"),
		filepath.Join(f.outside, "missing.txt"),
		filepath.Join(f.outside, "newfile.txt"),
	} {
		if _, err := os.Lstat(untouched); !os.IsNotExist(err) {
			t.Fatalf("upload created file outside root: %s", untouched)
		}
	}

	// Non-existent target under inside symlinked parent must succeed.
	t.Run("allow_new_file_under_inside_symlink_dir", func(t *testing.T) {
		rr := doUploadReq(t, s, "in-dir-rel", "fresh-upload.txt", "HELLO_UPLOAD")
		if rr.Code != http.StatusOK {
			t.Fatalf("wsUpload(in-dir-rel, fresh-upload.txt) = %d (%s), want 200", rr.Code, rr.Body.String())
		}
		if got, _ := os.ReadFile(filepath.Join(f.root, "subdir", "fresh-upload.txt")); string(got) != "HELLO_UPLOAD" {
			t.Fatalf("uploaded file = %q, want HELLO_UPLOAD", got)
		}
	})
	t.Run("allow_overwrite_inside_file_symlink", func(t *testing.T) {
		rr := doUploadReq(t, s, "", "in-file-rel", "VIA_LINK")
		if rr.Code != http.StatusOK {
			t.Fatalf("wsUpload('', in-file-rel) = %d (%s), want 200", rr.Code, rr.Body.String())
		}
		if got, _ := os.ReadFile(filepath.Join(f.root, "inside.txt")); string(got) != "VIA_LINK" {
			t.Fatalf("inside.txt = %q, want VIA_LINK", got)
		}
	})
}

// skillFixture builds a skillDir with a "demo" skill containing the same
// symlink matrix, plus an escaping skill directory symlink "evil-skill" and
// a sibling "other-skill".
type skillFixture struct {
	skillDir      string
	skillRoot     string
	outside       string
	outsideSecret string
	outsideDir    string
}

func newSkillFixture(t *testing.T) skillFixture {
	t.Helper()
	base := t.TempDir()
	skillDir := filepath.Join(base, "skills")
	skillRoot := filepath.Join(skillDir, "demo")
	otherSkill := filepath.Join(skillDir, "other")
	refs := filepath.Join(skillRoot, "references")
	outside := filepath.Join(base, "outside")
	outsideDir := filepath.Join(outside, "dir")

	for _, d := range []string{refs, otherSkill, outsideDir} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	outsideSecret := filepath.Join(outside, "secret.txt")
	if err := os.WriteFile(outsideSecret, []byte("---\nname: leaked\ndescription: secret\n---\nTOP_SECRET\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(outsideDir, "secret.txt"), []byte("DIR_SECRET"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(skillRoot, "SKILL.md"), []byte("---\nname: demo\ndescription: demo skill\n---\nDEMO_BODY\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(refs, "doc.md"), []byte("REF_DOC"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(otherSkill, "SKILL.md"), []byte("---\nname: other\ndescription: other\n---\nOTHER_SECRET\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	mustSymlink(t, outsideSecret, filepath.Join(skillRoot, "out-file.md"))
	mustSymlink(t, outsideDir, filepath.Join(skillRoot, "out-dir"))
	mustSymlink(t, "SKILL.md", filepath.Join(skillRoot, "in-file-rel.md"))
	mustSymlink(t, filepath.Join(skillRoot, "SKILL.md"), filepath.Join(skillRoot, "in-file-abs.md"))
	mustSymlink(t, "references", filepath.Join(skillRoot, "in-dir-rel"))
	mustSymlink(t, refs, filepath.Join(skillRoot, "in-dir-abs"))
	mustSymlink(t, filepath.Join(outside, "missing.md"), filepath.Join(skillRoot, "broken-out.md"))
	mustSymlink(t, "missing-inside.md", filepath.Join(skillRoot, "broken-in.md"))
	mustSymlink(t, "loop-b", filepath.Join(skillRoot, "loop-a"))
	mustSymlink(t, "loop-a", filepath.Join(skillRoot, "loop-b"))
	mustSymlink(t, filepath.Join("..", "..", "..", "outside", "secret.txt"), filepath.Join(refs, "rel-escape-file.md"))
	mustSymlink(t, filepath.Join("..", "..", "..", "outside", "dir"), filepath.Join(refs, "rel-escape-dir"))
	mustSymlink(t, filepath.Join("..", "SKILL.md"), filepath.Join(refs, "rel-inside.md"))
	mustSymlink(t, filepath.Join("..", "other", "SKILL.md"), filepath.Join(skillRoot, "cross-skill.md"))
	// Skill directory itself is a symlink pointing outside skillDir.
	mustSymlink(t, outsideDir, filepath.Join(skillDir, "evil-skill"))
	// Skill directory itself is a symlink staying inside skillDir.
	mustSymlink(t, "demo", filepath.Join(skillDir, "alias-skill"))

	return skillFixture{
		skillDir:      skillDir,
		skillRoot:     skillRoot,
		outside:       outside,
		outsideSecret: outsideSecret,
		outsideDir:    outsideDir,
	}
}

func skillReq(method, name, file string, body any) *http.Request {
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, "/api/skills/"+name+"/files/"+file, &buf)
	req.SetPathValue("name", name)
	if file != "" {
		req.SetPathValue("file", file)
	}
	req.Header.Set("Content-Type", "application/json")
	return req
}

func TestSkillReadFileSymlinkConfinement(t *testing.T) {
	f := newSkillFixture(t)
	s := &Server{skillDir: f.skillDir}

	rejectCases := []struct {
		name  string
		skill string
		file  string
	}{
		{"symlink to outside file", "demo", "out-file.md"},
		{"symlink to outside dir", "demo", "out-dir"},
		{"file under symlink to outside dir", "demo", "out-dir/secret.txt"},
		{"cross-skill symlink", "demo", "cross-skill.md"},
		{"escaping skill dir symlink", "evil-skill", "secret.txt"},
		{"broken symlink outside", "demo", "broken-out.md"},
		{"broken symlink inside", "demo", "broken-in.md"},
		{"symlink loop", "demo", "loop-a"},
		{"dotdot plus symlink in request", "demo", "references/../out-file.md"},
		{"inside symlink plus dotdot in request", "demo", "in-dir-rel/../../outside/secret.txt"},
		{"relative symlink with dotdot escape", "demo", "references/rel-escape-file.md"},
	}
	for _, tc := range rejectCases {
		t.Run("reject_"+tc.name, func(t *testing.T) {
			rr := httptest.NewRecorder()
			s.fsReadFile(rr, skillReq(http.MethodGet, tc.skill, tc.file, nil))
			if rr.Code != http.StatusBadRequest {
				t.Fatalf("fsReadFile(%q, %q) = %d (%s), want 400", tc.skill, tc.file, rr.Code, rr.Body.String())
			}
			if strings.Contains(rr.Body.String(), "SECRET") {
				t.Fatalf("fsReadFile(%q, %q) leaked secret content", tc.skill, tc.file)
			}
			assertNoAbsPathLeak(t, rr.Body.String(), f.skillDir, f.outside)
		})
	}

	allowCases := []struct {
		skill string
		file  string
		want  string
	}{
		{"demo", "in-file-rel.md", "DEMO_BODY"},
		{"demo", "in-file-abs.md", "DEMO_BODY"},
		{"demo", "in-dir-rel/doc.md", "REF_DOC"},
		{"demo", "in-dir-abs/doc.md", "REF_DOC"},
		{"demo", "references/rel-inside.md", "DEMO_BODY"},
		{"alias-skill", "SKILL.md", "DEMO_BODY"},
	}
	for _, tc := range allowCases {
		t.Run("allow_"+tc.skill+"/"+tc.file, func(t *testing.T) {
			rr := httptest.NewRecorder()
			s.fsReadFile(rr, skillReq(http.MethodGet, tc.skill, tc.file, nil))
			if rr.Code != http.StatusOK {
				t.Fatalf("fsReadFile(%q, %q) = %d (%s), want 200", tc.skill, tc.file, rr.Code, rr.Body.String())
			}
			if !strings.Contains(rr.Body.String(), tc.want) {
				t.Fatalf("fsReadFile(%q, %q) = %s, want %q", tc.skill, tc.file, rr.Body.String(), tc.want)
			}
		})
	}
}

func TestSkillWriteFileSymlinkConfinement(t *testing.T) {
	f := newSkillFixture(t)
	s := &Server{skillDir: f.skillDir}

	rejectCases := []struct {
		name  string
		skill string
		file  string
	}{
		{"symlink to outside file", "demo", "out-file.md"},
		{"symlink to outside dir", "demo", "out-dir"},
		{"existing file under outside dir symlink", "demo", "out-dir/secret.txt"},
		{"nonexistent file under outside dir symlink", "demo", "out-dir/newsub/pwn.md"},
		{"escaping skill dir symlink", "evil-skill", "pwn.md"},
		{"cross-skill symlink", "demo", "cross-skill.md"},
		{"broken symlink outside", "demo", "broken-out.md"},
		{"nonexistent child under broken symlink", "demo", "broken-out.md/pwn.md"},
		{"broken symlink inside", "demo", "broken-in.md"},
		{"symlink loop", "demo", "loop-a"},
		{"dotdot plus symlink in request", "demo", "references/../out-file.md"},
		{"relative symlink with dotdot escape", "demo", "references/rel-escape-file.md"},
		{"nonexistent under relative dotdot escape dir", "demo", "references/rel-escape-dir/pwn.md"},
	}
	for _, tc := range rejectCases {
		t.Run("reject_"+tc.name, func(t *testing.T) {
			rr := httptest.NewRecorder()
			s.fsWriteFile(rr, skillReq(http.MethodPut, tc.skill, tc.file, map[string]string{"content": "OVERWRITTEN"}))
			if rr.Code != http.StatusBadRequest {
				t.Fatalf("fsWriteFile(%q, %q) = %d (%s), want 400", tc.skill, tc.file, rr.Code, rr.Body.String())
			}
			assertNoAbsPathLeak(t, rr.Body.String(), f.skillDir, f.outside)
		})
	}

	if got, _ := os.ReadFile(f.outsideSecret); !strings.Contains(string(got), "TOP_SECRET") {
		t.Fatalf("outside secret modified: %q", got)
	}
	for _, untouched := range []string{
		filepath.Join(f.outside, "missing.md"),
		filepath.Join(f.outsideDir, "newsub", "pwn.md"),
		filepath.Join(f.outsideDir, "pwn.md"),
	} {
		if _, err := os.Lstat(untouched); !os.IsNotExist(err) {
			t.Fatalf("outside path should not exist: %s", untouched)
		}
	}

	t.Run("allow_inside_file_symlink", func(t *testing.T) {
		rr := httptest.NewRecorder()
		s.fsWriteFile(rr, skillReq(http.MethodPut, "demo", "in-file-rel.md", map[string]string{"content": "UPDATED_SKILL"}))
		if rr.Code != http.StatusOK {
			t.Fatalf("fsWriteFile(in-file-rel.md) = %d (%s), want 200", rr.Code, rr.Body.String())
		}
		if got, _ := os.ReadFile(filepath.Join(f.skillRoot, "SKILL.md")); string(got) != "UPDATED_SKILL" {
			t.Fatalf("SKILL.md = %q, want UPDATED_SKILL", got)
		}
	})
	t.Run("allow_nonexistent_under_inside_symlink_parent", func(t *testing.T) {
		rr := httptest.NewRecorder()
		s.fsWriteFile(rr, skillReq(http.MethodPut, "demo", "in-dir-rel/fresh/note.md", map[string]string{"content": "NEW_NOTE"}))
		if rr.Code != http.StatusOK {
			t.Fatalf("fsWriteFile(in-dir-rel/fresh/note.md) = %d (%s), want 200", rr.Code, rr.Body.String())
		}
		if got, _ := os.ReadFile(filepath.Join(f.skillRoot, "references", "fresh", "note.md")); string(got) != "NEW_NOTE" {
			t.Fatalf("note.md = %q, want NEW_NOTE", got)
		}
	})
}

func TestSkillCreateDirSymlinkConfinement(t *testing.T) {
	f := newSkillFixture(t)
	s := &Server{skillDir: f.skillDir}

	rejectCases := []struct {
		name  string
		skill string
		dir   string
	}{
		{"symlink to outside file", "demo", "out-file.md"},
		{"symlink to outside dir", "demo", "out-dir"},
		{"nonexistent dir under outside dir symlink", "demo", "out-dir/escaped/nested"},
		{"escaping skill dir symlink", "evil-skill", "newdir"},
		{"broken symlink outside", "demo", "broken-out.md"},
		{"broken symlink inside", "demo", "broken-in.md"},
		{"symlink loop", "demo", "loop-a"},
		{"dotdot plus symlink in request", "demo", "references/../out-dir/newdir"},
		{"relative symlink with dotdot escape", "demo", "references/rel-escape-dir/newdir"},
	}
	for _, tc := range rejectCases {
		t.Run("reject_"+tc.name, func(t *testing.T) {
			req := skillReq(http.MethodPost, tc.skill, "", map[string]string{"path": tc.dir})
			rr := httptest.NewRecorder()
			s.fsCreateDir(rr, req)
			if rr.Code != http.StatusBadRequest {
				t.Fatalf("fsCreateDir(%q, %q) = %d (%s), want 400", tc.skill, tc.dir, rr.Code, rr.Body.String())
			}
			assertNoAbsPathLeak(t, rr.Body.String(), f.skillDir, f.outside)
		})
	}

	for _, untouched := range []string{
		filepath.Join(f.outsideDir, "escaped"),
		filepath.Join(f.outsideDir, "newdir"),
		filepath.Join(f.outside, "missing.md"),
	} {
		if _, err := os.Lstat(untouched); !os.IsNotExist(err) {
			t.Fatalf("outside dir should not have been created: %s", untouched)
		}
	}

	t.Run("allow_nonexistent_dir_under_inside_symlink_parent", func(t *testing.T) {
		req := skillReq(http.MethodPost, "demo", "", map[string]string{"path": "in-dir-rel/sub/deep"})
		rr := httptest.NewRecorder()
		s.fsCreateDir(rr, req)
		if rr.Code != http.StatusCreated {
			t.Fatalf("fsCreateDir(in-dir-rel/sub/deep) = %d (%s), want 201", rr.Code, rr.Body.String())
		}
		if fi, err := os.Stat(filepath.Join(f.skillRoot, "references", "sub", "deep")); err != nil || !fi.IsDir() {
			t.Fatalf("expected dir created inside skill: err=%v", err)
		}
	})
}

func TestSkillDeleteAndMetaAndListSymlinkConfinement(t *testing.T) {
	f := newSkillFixture(t)
	s := &Server{skillDir: f.skillDir}

	// fsDeletePath rejections
	for _, tc := range []struct{ name, skill, file string }{
		{"outside file", "demo", "out-file.md"},
		{"outside dir", "demo", "out-dir"},
		{"child of outside dir", "demo", "out-dir/secret.txt"},
		{"broken outside", "demo", "broken-out.md"},
		{"broken inside", "demo", "broken-in.md"},
		{"loop", "demo", "loop-a"},
		{"dotdot plus symlink", "demo", "references/../out-file.md"},
		{"relative dotdot escape", "demo", "references/rel-escape-file.md"},
		{"escaping skill dir", "evil-skill", "secret.txt"},
	} {
		t.Run("delete_reject_"+tc.name, func(t *testing.T) {
			rr := httptest.NewRecorder()
			s.fsDeletePath(rr, skillReq(http.MethodDelete, tc.skill, tc.file, nil))
			if rr.Code != http.StatusBadRequest {
				t.Fatalf("fsDeletePath(%q, %q) = %d (%s), want 400", tc.skill, tc.file, rr.Code, rr.Body.String())
			}
			assertNoAbsPathLeak(t, rr.Body.String(), f.skillDir, f.outside)
		})
	}
	if _, err := os.Stat(f.outsideSecret); err != nil {
		t.Fatalf("outside secret deleted: %v", err)
	}

	// fsDeletePath on inside symlink removes symlink and preserves target.
	t.Run("delete_allow_inside_symlink", func(t *testing.T) {
		rr := httptest.NewRecorder()
		s.fsDeletePath(rr, skillReq(http.MethodDelete, "demo", "in-file-rel.md", nil))
		if rr.Code != http.StatusOK {
			t.Fatalf("fsDeletePath(in-file-rel.md) = %d (%s), want 200", rr.Code, rr.Body.String())
		}
		if _, err := os.Lstat(filepath.Join(f.skillRoot, "in-file-rel.md")); !os.IsNotExist(err) {
			t.Fatalf("in-file-rel.md should be removed")
		}
		if _, err := os.Stat(filepath.Join(f.skillRoot, "SKILL.md")); err != nil {
			t.Fatalf("SKILL.md target should be preserved: %v", err)
		}
	})

	// fsListFiles rejects escaping skill dir symlink and allows inside alias.
	t.Run("list_files_reject_escaping_skill_dir", func(t *testing.T) {
		rr := httptest.NewRecorder()
		s.fsListFiles(rr, skillReq(http.MethodGet, "evil-skill", "", nil))
		if rr.Code != http.StatusBadRequest {
			t.Fatalf("fsListFiles(evil-skill) = %d (%s), want 400", rr.Code, rr.Body.String())
		}
		assertNoAbsPathLeak(t, rr.Body.String(), f.skillDir, f.outside)
	})
	t.Run("list_files_allow_inside_alias", func(t *testing.T) {
		rr := httptest.NewRecorder()
		s.fsListFiles(rr, skillReq(http.MethodGet, "alias-skill", "", nil))
		if rr.Code != http.StatusOK {
			t.Fatalf("fsListFiles(alias-skill) = %d (%s), want 200", rr.Code, rr.Body.String())
		}
	})

	// fsUpdateSkillMeta rejects escaping SKILL.md symlink.
	t.Run("update_meta_reject_escaping_skill_md", func(t *testing.T) {
		badSkill := filepath.Join(f.skillDir, "meta-escape")
		if err := os.MkdirAll(badSkill, 0o755); err != nil {
			t.Fatal(err)
		}
		mustSymlink(t, f.outsideSecret, filepath.Join(badSkill, "SKILL.md"))

		desc := "pwned"
		rr := httptest.NewRecorder()
		s.fsUpdateSkillMeta(rr, skillReq(http.MethodPut, "meta-escape", "", map[string]any{"description": desc}))
		if rr.Code != http.StatusBadRequest {
			t.Fatalf("fsUpdateSkillMeta(meta-escape) = %d (%s), want 400", rr.Code, rr.Body.String())
		}
		assertNoAbsPathLeak(t, rr.Body.String(), f.skillDir, f.outside)
		if got, _ := os.ReadFile(f.outsideSecret); !strings.Contains(string(got), "TOP_SECRET") {
			t.Fatalf("outside secret overwritten via fsUpdateSkillMeta: %q", got)
		}
	})

	// toolUpdateSkillFile rejects escaping symlinks and allows inside symlinks.
	t.Run("tool_update_skill_file_confinement", func(t *testing.T) {
		tl := s.toolUpdateSkillFile()
		for _, badFile := range []string{"out-file.md", "out-dir/new.md", "broken-out.md", "loop-a", "references/rel-escape-file.md"} {
			in, _ := json.Marshal(map[string]string{"name": "demo", "file": badFile, "content": "EVIL"})
			res, err := tl.Call(context.Background(), in, nil)
			if err != nil {
				t.Fatalf("toolUpdateSkillFile(%q) returned err: %v", badFile, err)
			}
			if !res.IsError {
				t.Fatalf("toolUpdateSkillFile(%q) should fail, got %+v", badFile, res)
			}
			assertNoAbsPathLeak(t, res.Flatten(), f.skillDir, f.outside)
		}
		in, _ := json.Marshal(map[string]string{"name": "demo", "file": "in-dir-rel/tool-ok.md", "content": "TOOL_OK"})
		res, err := tl.Call(context.Background(), in, nil)
		if err != nil || res.IsError {
			t.Fatalf("toolUpdateSkillFile(in-dir-rel/tool-ok.md) failed: err=%v res=%+v", err, res)
		}
		if got, _ := os.ReadFile(filepath.Join(f.skillRoot, "references", "tool-ok.md")); string(got) != "TOOL_OK" {
			t.Fatalf("tool-ok.md = %q, want TOOL_OK", got)
		}
	})
}

func TestSkillLoaderSymlinkConfinement(t *testing.T) {
	base := t.TempDir()
	skillDir := filepath.Join(base, "skills")
	outside := filepath.Join(base, "outside")
	if err := os.MkdirAll(skillDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(outside, 0o755); err != nil {
		t.Fatal(err)
	}
	outsideMD := filepath.Join(outside, "secret.md")
	if err := os.WriteFile(outsideMD, []byte("---\nname: leaked\ndescription: secret desc\n---\nSECRET_INSTRUCTIONS\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	// 1. Valid regular skill.
	goodDir := filepath.Join(skillDir, "good-skill")
	if err := os.MkdirAll(goodDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(goodDir, "SKILL.md"), []byte("---\nname: good-skill\ndescription: ok\n---\nGOOD_BODY\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	// 2. Skill whose SKILL.md is an in-skill symlink staying inside its directory.
	inLinkDir := filepath.Join(skillDir, "inlink-skill")
	if err := os.MkdirAll(inLinkDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(inLinkDir, "real.md"), []byte("---\nname: inlink-skill\ndescription: inside link\n---\nINLINK_BODY\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	mustSymlink(t, "real.md", filepath.Join(inLinkDir, "SKILL.md"))

	// 3. Skill whose SKILL.md is a symlink pointing outside skillDir.
	evilDir := filepath.Join(skillDir, "evil-skill")
	if err := os.MkdirAll(evilDir, 0o755); err != nil {
		t.Fatal(err)
	}
	mustSymlink(t, outsideMD, filepath.Join(evilDir, "SKILL.md"))

	// 4. Skill whose SKILL.md is a relative ".." symlink escaping outside skillDir.
	relEscapeDir := filepath.Join(skillDir, "rel-escape-skill")
	if err := os.MkdirAll(relEscapeDir, 0o755); err != nil {
		t.Fatal(err)
	}
	mustSymlink(t, filepath.Join("..", "..", "outside", "secret.md"), filepath.Join(relEscapeDir, "SKILL.md"))

	// 5. Skill whose SKILL.md is a broken symlink.
	brokenDir := filepath.Join(skillDir, "broken-skill")
	if err := os.MkdirAll(brokenDir, 0o755); err != nil {
		t.Fatal(err)
	}
	mustSymlink(t, filepath.Join(outside, "missing.md"), filepath.Join(brokenDir, "SKILL.md"))

	// 6. Skill whose SKILL.md is a symlink loop.
	loopDir := filepath.Join(skillDir, "loop-skill")
	if err := os.MkdirAll(loopDir, 0o755); err != nil {
		t.Fatal(err)
	}
	mustSymlink(t, "loop-b.md", filepath.Join(loopDir, "SKILL.md"))
	mustSymlink(t, "SKILL.md", filepath.Join(loopDir, "loop-b.md"))

	// 7. Bare .md symlink at top level pointing outside.
	mustSymlink(t, outsideMD, filepath.Join(skillDir, "bare-evil.md"))

	reg, err := loadSkillsConfined(skillDir)
	if err != nil {
		t.Fatalf("loadSkillsConfined: %v", err)
	}

	// Valid skills (regular + in-skill symlink) must still load with original Dir restored.
	good, ok := reg.Get("good-skill")
	if !ok || !strings.Contains(good.Instructions, "GOOD_BODY") {
		t.Fatalf("good-skill not loaded properly: ok=%v skill=%+v", ok, good)
	}
	if good.Dir != goodDir {
		t.Fatalf("good-skill Dir = %q, want %q", good.Dir, goodDir)
	}
	inlink, ok := reg.Get("inlink-skill")
	if !ok || !strings.Contains(inlink.Instructions, "INLINK_BODY") {
		t.Fatalf("inlink-skill not loaded properly: ok=%v skill=%+v", ok, inlink)
	}
	if inlink.Dir != inLinkDir {
		t.Fatalf("inlink-skill Dir = %q, want %q", inlink.Dir, inLinkDir)
	}

	// Escaping, broken, and looping skills must NOT be loaded.
	for _, sk := range reg.List() {
		if strings.Contains(sk.Instructions, "SECRET_INSTRUCTIONS") || sk.Name == "leaked" || sk.Name == "evil-skill" || sk.Name == "rel-escape-skill" || sk.Name == "broken-skill" || sk.Name == "loop-skill" || sk.Name == "bare-evil" {
			t.Fatalf("unsafe skill leaked into registry: %+v", sk)
		}
	}

	// fsListSkills must not expose metadata from escaping SKILL.md symlinks.
	s := &Server{skillDir: skillDir, m: &Manager{}}
	req := httptest.NewRequest(http.MethodGet, "/api/skills", nil)
	rr := httptest.NewRecorder()
	s.fsListSkills(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("fsListSkills = %d (%s), want 200", rr.Code, rr.Body.String())
	}
	if strings.Contains(rr.Body.String(), "secret desc") || strings.Contains(rr.Body.String(), "SECRET_INSTRUCTIONS") {
		t.Fatalf("fsListSkills leaked outside skill metadata: %s", rr.Body.String())
	}
}
