//go:build linux

package agent

import (
	"context"
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"testing"

	actool "github.com/Autumn-27/norma/tool"
)

// The executor identity of the server's default (server.DefaultExecUID/GID).
const testExecID = 10001

// fileIdentityFixture lays out a data directory like the server's with the drop
// active: tasks/1/main is a run directory root:<exec gid> 2775 below root:root 0755
// parents, and holds a file the server wrote root:root 0600.
type fileIdentityFixture struct {
	base, work, rootOnly string
	tools                map[string]actool.CoreTool
	tc                   *actool.ToolContext
}

func newFileIdentityFixture(t *testing.T) *fileIdentityFixture {
	t.Helper()
	if os.Geteuid() != 0 {
		t.Skip("needs root")
	}
	// Not t.TempDir(): the executor has to traverse the directory. TestMain made the
	// temp directory 1777.
	base, err := os.MkdirTemp("", "artex-fileid-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(base) })
	work := filepath.Join(base, "tasks", "1", "main")
	for _, d := range []string{base, filepath.Join(base, "tasks"), filepath.Join(base, "tasks", "1")} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.Chmod(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Mkdir(work, 0o775); err != nil {
		t.Fatal(err)
	}
	if err := os.Chown(work, 0, testExecID); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(work, 0o775|os.ModeSetgid); err != nil {
		t.Fatal(err)
	}
	rootOnly := filepath.Join(work, "root-only.txt")
	if err := os.WriteFile(rootOnly, []byte(confinedSecret+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chown(rootOnly, 0, 0); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(work, "shared.txt"), []byte("hello shared\n"), 0o664); err != nil {
		t.Fatal(err)
	}
	if err := os.Chown(filepath.Join(work, "shared.txt"), 0, testExecID); err != nil {
		t.Fatal(err)
	}
	tools := map[string]actool.CoreTool{}
	for _, tl := range defaultTools(base) {
		tools[tl.Name()] = tl
	}
	t.Cleanup(func() { SetFileToolIdentity(nil) })
	return &fileIdentityFixture{base: base, work: work, rootOnly: rootOnly, tools: tools, tc: &actool.ToolContext{WorkingDir: work}}
}

func (f *fileIdentityFixture) call(t *testing.T, tool string, in map[string]any) actool.Result {
	t.Helper()
	raw, _ := json.Marshal(in)
	res, err := f.tools[tool].Call(context.Background(), raw, f.tc)
	if err != nil {
		t.Fatalf("%s(%s): %v", tool, raw, err)
	}
	return res
}

// With the executor identity set, the file tools reach the run directory with the
// executor's rights: a root-only file inside it is refused by the kernel, Grep does
// not see it, a file the tools create belongs to the executor, and the shared file
// stays readable. Without the identity (the server's root) the same file is read,
// which is the state the identity changes.
func TestFileToolsRunAsExecutorAsRoot(t *testing.T) {
	f := newFileIdentityFixture(t)

	// Root, no identity: the root-only file is read.
	if res := f.call(t, "Read", map[string]any{"file_path": "root-only.txt"}); res.IsError || !strings.Contains(res.Flatten(), confinedSecret) {
		t.Fatalf("without the identity root reads the file: %s", res.Flatten())
	}

	SetFileToolIdentity(&FileToolIdentity{UID: testExecID, GID: testExecID})

	res := f.call(t, "Read", map[string]any{"file_path": "root-only.txt"})
	if !res.IsError || strings.Contains(res.Flatten(), confinedSecret) || !strings.Contains(res.Flatten(), "permission denied") {
		t.Errorf("Read of a root-only file as the executor: error=%v %s", res.IsError, res.Flatten())
	}
	for _, in := range []map[string]any{
		{"pattern": "TOPSECRET", "output_mode": "content"},
		{"pattern": "TOPSECRET", "path": "root-only.txt", "output_mode": "content"},
	} {
		if out := f.call(t, "Grep", in).Flatten(); strings.Contains(out, confinedSecret) {
			t.Errorf("Grep %v printed the root-only file: %s", in, out)
		}
	}
	res = f.call(t, "Edit", map[string]any{"file_path": "root-only.txt", "old_string": confinedSecret, "new_string": "pwned"})
	if !res.IsError {
		t.Errorf("Edit of a root-only file as the executor was not refused: %s", res.Flatten())
	}
	if res := f.call(t, "Read", map[string]any{"file_path": "shared.txt"}); res.IsError || !strings.Contains(res.Flatten(), "hello shared") {
		t.Errorf("Read of a file shared with the executor group: %s", res.Flatten())
	}
	if res := f.call(t, "Write", map[string]any{"file_path": "made.txt", "content": "x\n"}); res.IsError {
		t.Fatalf("Write as the executor: %s", res.Flatten())
	}
	fi, err := os.Stat(filepath.Join(f.work, "made.txt"))
	if err != nil {
		t.Fatal(err)
	}
	if st := fi.Sys().(*syscall.Stat_t); st.Uid != testExecID || st.Gid != testExecID {
		t.Errorf("made.txt belongs to %d:%d, want the executor %d:%d", st.Uid, st.Gid, testExecID, testExecID)
	}
	if b, err := os.ReadFile(f.rootOnly); err != nil || string(b) != confinedSecret+"\n" {
		t.Fatalf("root-only file changed or unreadable by the test: %q %v", b, err)
	}
}

// The ingest tools open the agent's file the same way.
func TestIngestOpenRunsAsExecutorAsRoot(t *testing.T) {
	f := newFileIdentityFixture(t)
	SetFileToolIdentity(&FileToolIdentity{UID: testExecID, GID: testExecID})
	if file, err := openBbotOutput(f.base, f.work, "root-only.txt"); err == nil || !errors.Is(err, fs.ErrPermission) {
		if file != nil {
			file.Close()
		}
		t.Errorf("ingest_bbot open of a root-only file: %v, want permission denied", err)
	}
	if file, err := openScanOutputInBase(f.base, f.work, "root-only.txt"); err == nil || !errors.Is(err, fs.ErrPermission) {
		if file != nil {
			file.Close()
		}
		t.Errorf("ingest_scan_output open of a root-only file: %v, want permission denied", err)
	}
	file, err := openBbotOutput(f.base, f.work, "shared.txt")
	if err != nil {
		t.Fatalf("ingest_bbot open of a shared file: %v", err)
	}
	file.Close()
}

// The identity never leaks to the calling goroutine or to other goroutines: after
// many concurrent calls the test, still root, reads the root-only file, and its own
// thread keeps file system uid 0.
func TestFileToolIdentityDoesNotLeakAsRoot(t *testing.T) {
	f := newFileIdentityFixture(t)
	SetFileToolIdentity(&FileToolIdentity{UID: testExecID, GID: testExecID})
	var wg sync.WaitGroup
	for i := 0; i < 64; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			raw, _ := json.Marshal(map[string]any{"file_path": "root-only.txt"})
			res, err := f.tools["Read"].Call(context.Background(), raw, f.tc)
			if err != nil || !res.IsError {
				t.Errorf("concurrent Read as the executor: err=%v error=%v %s", err, res.IsError, res.Flatten())
			}
		}()
	}
	wg.Wait()
	for i := 0; i < 16; i++ {
		if _, err := os.ReadFile(f.rootOnly); err != nil {
			t.Fatalf("the server lost root's access after the file tool calls: %v", err)
		}
	}
	SetFileToolIdentity(nil)
	if res := f.call(t, "Read", map[string]any{"file_path": "root-only.txt"}); res.IsError {
		t.Fatalf("with the identity cleared root reads the file again: %s", res.Flatten())
	}
}
