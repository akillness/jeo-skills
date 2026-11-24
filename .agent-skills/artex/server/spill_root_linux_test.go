//go:build linux

package server

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/Autumn-27/artex/agent"
	actool "github.com/Autumn-27/norma/tool"
)

// Root test of the command-output spill. The agent turned <run dir>/cmd-output into
// a symlink to a root-only directory. A Bash call whose output is over the cap runs
// as Norma's loop runs it, with the ToolOutputDir and the hooks the agents pass:
// nothing is written through the link, the spill file lands in the task's spill
// directory, and the executor reads it there and cannot change the directory.
func TestSpillDirAsRoot(t *testing.T) {
	f := newExecRootFixture(t)
	if err := InstallBashShim(f.priv); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(filepath.SplitList(os.Getenv("PATH"))[0]) })
	py, err := exec.LookPath("python3")
	if err != nil {
		t.Fatalf("python3 is needed for the executor probe: %v", err)
	}
	trap := filepath.Join(f.data, "trap")
	if err := os.Mkdir(trap, 0o700); err != nil {
		t.Fatal(err)
	}
	planted := filepath.Join(f.work, "cmd-output")
	if err := os.Symlink(trap, planted); err != nil {
		t.Fatal(err)
	}

	// What the main agent of task 1 gives Norma, and a chat session beside it.
	dir := agent.TaskToolOutputDir(f.data, 1, f.work)
	hooks := agent.SpillHooks(nil, dir)
	session := agent.SessionToolOutputDir(f.data, "conv-3", agent.EnsureSessionDir(f.data, "conv-3"))
	spillRoot := filepath.Join(f.data, "spill")
	if dir != filepath.Join(spillRoot, "tasks", "1") || session != filepath.Join(spillRoot, "sessions", "conv-3") {
		t.Fatalf("spill directories: task %s, session %s", dir, session)
	}
	if hooks == nil {
		t.Fatal("the run has no hooks to share its spill files")
	}
	checkLayout := func() {
		t.Helper()
		for _, parent := range []string{spillRoot, filepath.Join(spillRoot, "tasks"), filepath.Join(spillRoot, "sessions")} {
			checkDir(t, parent, 0, parentDirMode)
		}
		checkDir(t, dir, DefaultExecGID, 0o750)
		checkDir(t, session, DefaultExecGID, 0o750)
	}
	checkLayout()

	// One tool call: the tool, then the post-tool hook with the flattened result.
	const size = 40000
	ctx := context.Background()
	tc := &actool.ToolContext{WorkingDir: f.work, OutputDir: dir}
	in, _ := json.Marshal(map[string]string{"command": fmt.Sprintf("id -u; head -c %d /dev/zero | tr '\\0' x", size)})
	res, err := actool.NewBash().Call(ctx, in, tc)
	if err != nil {
		t.Fatal(err)
	}
	out := res.Flatten()
	if !strings.HasPrefix(out, fmt.Sprintf("%d\n", DefaultExecUID)) {
		t.Fatalf("the command did not run as the executor:\n%.200s", out)
	}
	entries, err := os.ReadDir(dir)
	if err != nil || len(entries) != 1 {
		t.Fatalf("the spill directory holds %v (%v), want one spill file", entries, err)
	}
	file := filepath.Join(dir, entries[0].Name())
	if !strings.Contains(out, "<persisted-output>") || !strings.Contains(out, file) {
		t.Fatalf("the result does not point to the spill file %s:\n%s", file, out[max(0, len(out)-300):])
	}
	stat := func() (os.FileMode, *syscall.Stat_t) {
		t.Helper()
		fi, err := os.Lstat(file)
		if err != nil {
			t.Fatal(err)
		}
		return fi.Mode(), fi.Sys().(*syscall.Stat_t)
	}
	// Norma writes the file for root alone: the executor cannot read it yet.
	if mode, _ := stat(); mode != 0o600 {
		t.Fatalf("spill file as Norma wrote it: %v, want a regular file 0600", mode)
	}
	raw, _ := json.Marshal(out)
	hooks.PostToolUse(ctx, "Bash", in, raw, res.IsError)
	if mode, st := stat(); mode != 0o640 || st.Uid != 0 || st.Gid != DefaultExecGID {
		t.Fatalf("spill file after the hook: %v uid %d gid %d, want 0640 root:%d", mode, st.Uid, st.Gid, DefaultExecGID)
	}
	want := fmt.Sprintf("%d\n%s", DefaultExecUID, strings.Repeat("x", size))
	if got, err := os.ReadFile(file); err != nil || string(got) != want {
		t.Fatalf("spill file: %d bytes (%v), want the full output of %d bytes", len(got), err, len(want))
	}

	// Nothing went through the planted link, and it is still a link.
	if entries, err := os.ReadDir(trap); err != nil || len(entries) != 0 {
		t.Fatalf("the symlinked cmd-output target holds %v (%v), want it empty", entries, err)
	}
	checkDir(t, trap, 0, 0o700)
	if fi, err := os.Lstat(planted); err != nil || fi.Mode()&os.ModeSymlink == 0 {
		t.Fatalf("cmd-output in the run directory changed: %v %v", fi, err)
	}

	// The agent reads the spill back with Bash, as the executor.
	in, _ = json.Marshal(map[string]string{"command": fmt.Sprintf("id -u; wc -c < '%s'; tail -c 5 '%s'", file, file)})
	res, err = actool.NewBash().Call(ctx, in, tc)
	if err != nil {
		t.Fatal(err)
	}
	wantRead := fmt.Sprintf("%d\n%d\nxxxxx", DefaultExecUID, len(want))
	if got := res.Flatten(); strings.TrimSpace(got) != wantRead {
		t.Fatalf("Bash read of the spill file as the executor = %q, want %q", got, wantRead)
	}

	// The executor cannot change the spill directory or the file.
	code := `import errno, os
d = os.environ["SPILL_DIR"]
f = os.environ["SPILL_FILE"]
print("uid=%d gid=%d" % (os.getuid(), os.getgid()))
st = os.stat(f)
print("file=%o uid=%d gid=%d" % (st.st_mode & 0o7777, st.st_uid, st.st_gid))
def attempt(name, fn):
    try:
        fn()
        print(name + "=done")
    except OSError as e:
        print(name + "=" + errno.errorcode.get(e.errno, str(e.errno)))
attempt("read", lambda: open(f).read())
attempt("list", lambda: os.listdir(d))
attempt("create", lambda: open(os.path.join(d, "planted.txt"), "w").close())
attempt("rename", lambda: os.rename(f, f + ".moved"))
attempt("unlink", lambda: os.unlink(f))
attempt("mkdir", lambda: os.mkdir(os.path.join(d, "planted-dir")))
attempt("symlink", lambda: os.symlink("/etc/passwd", os.path.join(d, "planted-link")))
attempt("link", lambda: os.link(f, os.path.join(d, "planted-hardlink")))
attempt("write", lambda: open(f, "a").close())
attempt("rename_dir", lambda: os.rename(d, d + ".moved"))
attempt("rmdir_dir", lambda: os.rmdir(d))
attempt("create_in_parent", lambda: open(os.path.join(os.path.dirname(d), "2"), "w").close())
attempt("chmod_dir", lambda: os.chmod(d, 0o777))
attempt("chmod_file", lambda: os.chmod(f, 0o666))
`
	probe, err := execPython(ctx, py, "probe", code, nil, f.work, []string{"SPILL_DIR=" + dir, "SPILL_FILE=" + file}, 30*time.Second, f.priv)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("executor probe output:\n%s", probe)
	for _, want := range []string{
		fmt.Sprintf("uid=%d gid=%d\n", DefaultExecUID, DefaultExecGID),
		fmt.Sprintf("file=640 uid=0 gid=%d\n", DefaultExecGID),
		"read=done\n", "list=done\n",
		"chmod_dir=EPERM\n", "chmod_file=EPERM\n",
	} {
		if !strings.Contains(probe, want) {
			t.Errorf("want %q in the probe output:\n%s", want, probe)
		}
	}
	for _, name := range []string{
		"create", "rename", "unlink", "mkdir", "symlink", "link", "write", "rename_dir", "rmdir_dir", "create_in_parent",
	} {
		if !strings.Contains(probe, name+"=EACCES\n") && !strings.Contains(probe, name+"=EPERM\n") {
			t.Errorf("%s was not refused with EACCES or EPERM:\n%s", name, probe)
		}
	}
	if strings.Contains(probe, "[exit:") {
		t.Errorf("the probe failed:\n%s", probe)
	}
	// The directory still holds the one spill file, with the layout it had.
	if entries, err := os.ReadDir(dir); err != nil || len(entries) != 1 || entries[0].Name() != filepath.Base(file) {
		t.Errorf("the spill directory holds %v (%v), want only %s", entries, err, filepath.Base(file))
	}
	checkLayout()
	// A later run of the same agents finds the directories and leaves them so.
	agent.TaskToolOutputDir(f.data, 1, f.work)
	agent.SessionToolOutputDir(f.data, "conv-3", filepath.Join(f.data, "sessions", "conv-3"))
	checkLayout()
}
