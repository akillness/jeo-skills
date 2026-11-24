//go:build linux

package server

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log"
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

// Root tests of the three executor paths: the Bash tool through the PATH shim, a
// custom tool through SysProcAttr.Credential, and an MCP stdio command through the
// drop shim. Each runs the same probe as the agent would and must show the executor
// identity, no access to a 0600 root file or to the server's /proc environ, and a
// writable HOME and cache.

type execRootFixture struct {
	priv                          ExecPrivilege
	tmp, data, home, secret, work string
}

func newExecRootFixture(t *testing.T) *execRootFixture {
	t.Helper()
	if os.Geteuid() != 0 {
		t.Skip("needs root")
	}
	old := syscall.Umask(0o022)
	syscall.Umask(old)
	t.Cleanup(func() { syscall.Umask(old) })
	// InstallBashShim and PrepareExecPrivilege set these process-wide; restore them.
	for _, k := range []string{"PATH", envExecBash, envExecUID, envExecGID, envExecHome} {
		t.Setenv(k, os.Getenv(k))
	}
	// PrepareExecPrivilege and Norma's Bash tool reach <temp>/norma. The temp
	// directory of the test is its own, world-writable and sticky like /tmp, so the
	// host's <temp>/norma is never read or written. It cannot be t.TempDir(): the
	// executor has to traverse it to reach the data directory below.
	tmp, err := os.MkdirTemp("", "artex-exec-tmp-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(tmp) })
	if err := os.Chmod(tmp, 0o777|os.ModeSticky); err != nil {
		t.Fatal(err)
	}
	t.Setenv("TMPDIR", tmp)
	// A data directory like /app/data: root-owned and traversable.
	dataDir, err := os.MkdirTemp("", "artex-exec-root-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dataDir) })
	if err := os.Chmod(dataDir, 0o755); err != nil {
		t.Fatal(err)
	}
	priv, err := ResolveExecPrivilege(DefaultExecUID, DefaultExecGID, true)
	if err != nil {
		t.Fatal(err)
	}
	// PrepareExecPrivilege sets them process-wide.
	t.Cleanup(func() { agent.SetRunDirMaker(nil); agent.SetSpillDirMaker(nil, nil); agent.SetFileToolIdentity(nil) })
	if err := PrepareExecPrivilege(&priv, dataDir, "", ""); err != nil {
		t.Fatal(err)
	}
	secret := filepath.Join(dataDir, "root-only.key")
	if err := os.WriteFile(secret, []byte("root-secret\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := os.ReadFile(secret); err != nil {
		t.Fatalf("root must read its own key: %v", err)
	}
	// The run directory of task 1's main agent, created as the agent creates it.
	work := agent.EnsureRunDir(dataDir, 1, 0)
	return &execRootFixture{priv: priv, tmp: tmp, data: dataDir, home: filepath.Join(dataDir, execHomeDir), secret: secret, work: work}
}

// probe is the shell script each path runs as the executor.
func (f *execRootFixture) probe() string {
	return fmt.Sprintf(`echo "uid=$(id -u) gid=$(id -g) groups=$(id -G)"
if cat '%s' >/dev/null 2>&1; then echo secret=read; else echo secret=denied; fi
if cat /proc/%d/environ >/dev/null 2>&1; then echo environ=read; else echo environ=denied; fi
echo "home=$HOME cache=$XDG_CACHE_HOME"
if mkdir -p "$XDG_CACHE_HOME/probe" && echo ok > "$XDG_CACHE_HOME/probe/x"; then echo cache=written; else echo cache=failed; fi
`, f.secret, os.Getpid())
}

func (f *execRootFixture) check(t *testing.T, path, out string) {
	t.Helper()
	for _, want := range []string{
		fmt.Sprintf("uid=%d gid=%d groups=%d", DefaultExecUID, DefaultExecGID, DefaultExecGID),
		"secret=denied",
		"environ=denied",
		"home=" + f.home + " cache=" + filepath.Join(f.home, ".cache"),
		"cache=written",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("%s: want %q in the probe output:\n%s", path, want, out)
		}
	}
	fi, err := os.Stat(filepath.Join(f.home, ".cache", "probe", "x"))
	if err != nil {
		t.Fatalf("%s: cache file missing: %v", path, err)
	}
	if st := fi.Sys().(*syscall.Stat_t); st.Uid != DefaultExecUID {
		t.Errorf("%s: cache file owned by uid %d, want %d", path, st.Uid, DefaultExecUID)
	}
	t.Logf("%s probe output:\n%s", path, out)
}

// Norma's Bash tool runs exec.Command("bash"): the PATH shim drops and execs bash.
func TestExecutorBashShimAsRoot(t *testing.T) {
	f := newExecRootFixture(t)
	if err := InstallBashShim(f.priv); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(filepath.SplitList(os.Getenv("PATH"))[0]) })
	in, _ := json.Marshal(map[string]string{"command": f.probe()})
	res, err := actool.NewBash().Call(context.Background(), in, &actool.ToolContext{WorkingDir: f.work})
	if err != nil {
		t.Fatal(err)
	}
	f.check(t, "bash shim", res.Flatten())
}

// A custom script tool runs through execPython, which applies the credential.
func TestExecutorCustomToolAsRoot(t *testing.T) {
	f := newExecRootFixture(t)
	py, err := exec.LookPath("python3")
	if err != nil {
		t.Fatalf("python3 is needed for the custom-tool path: %v", err)
	}
	code := `import os, subprocess
print(subprocess.run(["sh", "-c", os.environ["PROBE"]], capture_output=True, text=True).stdout)`
	out, err := execPython(context.Background(), py, "probe", code, nil, f.work, []string{"PROBE=" + f.probe()}, 30*time.Second, f.priv)
	if err != nil {
		t.Fatal(err)
	}
	f.check(t, "custom tool", out)
}

// The script of a custom tool is written to the root-owned script directory, not
// under the run directory: the agent turned <run dir>/.tools into a symlink to a
// root-only directory, and nothing may be written through it. The script runs as
// the executor, which can read it and cannot change the directory it is in.
func TestExecPythonScriptDirAsRoot(t *testing.T) {
	f := newExecRootFixture(t)
	py, err := exec.LookPath("python3")
	if err != nil {
		t.Fatalf("python3 is needed for the custom-tool path: %v", err)
	}
	dataDir := filepath.Dir(f.secret)
	dir := f.priv.ScriptDir
	if dir != filepath.Join(dataDir, execScriptDir) {
		t.Fatalf("script directory = %q, want %s under the data directory", dir, execScriptDir)
	}
	checkDir := func() {
		t.Helper()
		fi, err := os.Lstat(dir)
		if err != nil {
			t.Fatal(err)
		}
		st := fi.Sys().(*syscall.Stat_t)
		if !fi.IsDir() || st.Uid != 0 || st.Gid != DefaultExecGID || fi.Mode().Perm() != 0o750 || fi.Mode()&os.ModeSetgid != 0 {
			t.Fatalf("script directory: mode %v uid %d gid %d, want a directory 0750 root:%d", fi.Mode(), st.Uid, st.Gid, DefaultExecGID)
		}
		if entries, err := os.ReadDir(dir); err != nil || len(entries) != 0 {
			t.Fatalf("script directory holds %v (%v), want it empty", entries, err)
		}
	}
	checkDir()

	trap := filepath.Join(dataDir, "trap")
	if err := os.Mkdir(trap, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(trap, filepath.Join(f.work, ".tools")); err != nil {
		t.Fatal(err)
	}

	code := `import errno, os
d = os.path.dirname(os.path.abspath(__file__))
print("uid=%d gid=%d" % (os.getuid(), os.getgid()))
print("script_dir=" + d)
st = os.stat(__file__)
print("script=%o uid=%d gid=%d" % (st.st_mode & 0o777, st.st_uid, st.st_gid))
def attempt(name, fn):
    try:
        fn()
        print(name + "=done")
    except OSError as e:
        print(name + "=" + errno.errorcode.get(e.errno, str(e.errno)))
attempt("create", lambda: open(os.path.join(d, "planted.py"), "w").close())
attempt("symlink", lambda: os.symlink("/etc/passwd", os.path.join(d, "planted-link")))
attempt("mkdir", lambda: os.mkdir(os.path.join(d, "planted-dir")))
attempt("rename", lambda: os.rename(__file__, __file__ + ".moved"))
attempt("unlink", lambda: os.unlink(__file__))
attempt("write", lambda: open(__file__, "a").close())
attempt("chmod", lambda: os.chmod(d, 0o777))
`
	out, err := execPython(context.Background(), py, "probe", code, nil, f.work, nil, 30*time.Second, f.priv)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("script probe output:\n%s", out)
	for _, want := range []string{
		fmt.Sprintf("uid=%d gid=%d\n", DefaultExecUID, DefaultExecGID),
		"script_dir=" + dir + "\n",
		fmt.Sprintf("script=640 uid=0 gid=%d\n", DefaultExecGID),
		"create=EACCES\n", "symlink=EACCES\n", "mkdir=EACCES\n", "rename=EACCES\n", "unlink=EACCES\n", "write=EACCES\n",
		"chmod=EPERM\n",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("want %q in the probe output:\n%s", want, out)
		}
	}
	if strings.Contains(out, "[exit:") || strings.Contains(out, "=done") {
		t.Errorf("the script failed or changed its directory:\n%s", out)
	}
	// The script is removed, and nothing went through the planted symlink or to the
	// run directory.
	checkDir()
	if entries, err := os.ReadDir(trap); err != nil || len(entries) != 0 {
		t.Fatalf("the symlinked .tools target holds %v (%v), want it empty", entries, err)
	}
	if fi, err := os.Lstat(filepath.Join(f.work, ".tools")); err != nil || fi.Mode()&os.ModeSymlink == 0 {
		t.Fatalf(".tools in the run directory changed: %v %v", fi, err)
	}
}

// An MCP stdio command is started as `<server> __artex-exec-drop uid gid -- cmd`;
// mcp.NewStdioClient runs it with exec.Command and the server environment.
func TestExecutorMCPStdioAsRoot(t *testing.T) {
	f := newExecRootFixture(t)
	command, args, err := execDropCommand(f.priv, "sh", []string{"-c", f.probe()})
	if err != nil {
		t.Fatal(err)
	}
	c := exec.Command(command, args...)
	c.Dir = f.work
	out, err := c.CombinedOutput()
	if err != nil {
		t.Fatalf("%v\n%s", err, out)
	}
	f.check(t, "mcp stdio", string(out))
}

// The directory of Norma's background-task output is created when absent. A symlink
// or a file in its place is refused, and nothing is created through the symlink.
// Runs without root.
func TestPrepareNormaTaskDir(t *testing.T) {
	old := syscall.Umask(0o022)
	t.Cleanup(func() { syscall.Umask(old) })
	base := t.TempDir()
	dir := filepath.Join(base, "norma")
	priv := ExecPrivilege{Enabled: true, UID: DefaultExecUID, GID: DefaultExecGID}
	for _, state := range []string{"absent", "already there"} {
		if err := prepareNormaTaskDir(dir, priv); err != nil {
			t.Fatalf("%s: %v", state, err)
		}
		if fi, err := os.Lstat(dir); err != nil || !fi.IsDir() || fi.Mode().Perm() != 0o755 {
			t.Fatalf("%s: %v %v, want a 0755 directory", state, fi, err)
		}
	}
	outside := t.TempDir()
	link := filepath.Join(base, "link")
	if err := os.Symlink(outside, link); err != nil {
		t.Fatal(err)
	}
	if err := prepareNormaTaskDir(link, priv); err == nil {
		t.Fatal("a symlink to a directory was accepted")
	}
	if entries, err := os.ReadDir(outside); err != nil || len(entries) != 0 {
		t.Fatalf("the symlink target holds %v (%v), want it empty", entries, err)
	}
	file := filepath.Join(base, "file")
	if err := os.WriteFile(file, nil, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := prepareNormaTaskDir(file, priv); err == nil {
		t.Fatal("a file was accepted")
	}
}

// The executor can write in a directory it owns, in one its group can write in and
// in one others can write in. No other directory counts. Runs without root.
func TestNormaTaskDirExecWrite(t *testing.T) {
	const execUID, execGID = 10001, 10002
	for _, tc := range []struct {
		name     string
		perm     os.FileMode
		uid, gid uint32
		writable bool
	}{
		{"owned by the executor uid", 0o755, execUID, 0, true},
		{"owned by the executor uid, no write bit", 0o555, execUID, 0, true},
		{"group-writable for the executor gid", 0o775, 0, execGID, true},
		{"other-writable", 0o757, 0, 0, true},
		{"root-owned 0755", 0o755, 0, 0, false},
		{"another user, not writable by the executor", 0o755, 1000, 1000, false},
		{"group-writable for another gid", 0o775, 1000, 1000, false},
		{"the executor gid without the group write bit", 0o755, 1000, execGID, false},
	} {
		why := normaTaskDirExecWrite(tc.perm, tc.uid, tc.gid, execUID, execGID)
		if (why != "") != tc.writable {
			t.Errorf("%s (mode %v, uid %d, gid %d): reason %q, want writable=%v", tc.name, tc.perm, tc.uid, tc.gid, why, tc.writable)
		}
	}
}

// normaTempDir gives the test its own temp directory and returns <temp>/norma, the
// path PrepareExecPrivilege checks. The host's <temp>/norma is never touched.
func normaTempDir(t *testing.T) string {
	t.Helper()
	t.Setenv("TMPDIR", t.TempDir())
	return filepath.Join(os.TempDir(), "norma")
}

// fillNormaDir puts below dir what a used <temp>/norma holds, a session directory
// with a task output file, and a symlink.
func fillNormaDir(t *testing.T, dir string) {
	t.Helper()
	tasks := filepath.Join(dir, "session-1", "tasks")
	if err := os.MkdirAll(tasks, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(tasks, "task_1.output"), []byte("output\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("/etc/passwd", filepath.Join(dir, "link")); err != nil {
		t.Fatal(err)
	}
}

// treeDigest hashes path and everything below it without following a symlink: each
// name with its type, mode, owner and modification time, the bytes of a file and
// the target of a symlink. Two equal digests mean nothing was added, removed,
// rewritten, chmodded or chowned in between.
func treeDigest(t *testing.T, path string) string {
	t.Helper()
	h := sha256.New()
	err := filepath.WalkDir(path, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		fi, err := d.Info()
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(path, p)
		if err != nil {
			return err
		}
		st := fi.Sys().(*syscall.Stat_t)
		fmt.Fprintf(h, "%q %v %d:%d %d\n", rel, fi.Mode(), st.Uid, st.Gid, fi.ModTime().UnixNano())
		switch {
		case fi.Mode()&fs.ModeSymlink != 0:
			target, err := os.Readlink(p)
			if err != nil {
				return err
			}
			fmt.Fprintf(h, "-> %q\n", target)
		case fi.Mode().IsRegular():
			b, err := os.ReadFile(p)
			if err != nil {
				return err
			}
			h.Write(b)
		}
		return nil
	})
	if err != nil {
		t.Fatalf("digest of %s: %v", path, err)
	}
	return hex.EncodeToString(h.Sum(nil))
}

// wantNormaRefusal checks the error of a refused start: it names the path, the
// owner and group, the mode, the executor uid and gid, and the remedy.
func wantNormaRefusal(t *testing.T, err error, dir string, priv ExecPrivilege) {
	t.Helper()
	if err == nil {
		t.Fatalf("%s was accepted for the executor %d:%d", dir, priv.UID, priv.GID)
	}
	fi, lerr := os.Lstat(dir)
	if lerr != nil {
		t.Fatal(lerr)
	}
	st := fi.Sys().(*syscall.Stat_t)
	for _, want := range []string{
		dir,
		fmt.Sprintf("owner %d:%d", st.Uid, st.Gid),
		fmt.Sprintf("mode %v", fi.Mode()),
		fmt.Sprintf("uid %d gid %d", priv.UID, priv.GID),
		"remove the directory or set TMPDIR to a directory the executor cannot write",
	} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("the error does not hold %q:\n%v", want, err)
		}
	}
}

// checkNormaTaskDir decides from the stat facts and the executor ids alone, so every
// rule is tested here without root and without a file system.
func TestCheckNormaTaskDir(t *testing.T) {
	const execUID, execGID = 10001, 10002
	const path = "/tmp/norma" // named in the errors only: nothing is read from it
	const dir, sticky = fs.ModeDir, fs.ModeSticky
	const tmpMode = dir | sticky | 0o777 // a parent like /tmp
	for _, tc := range []struct {
		name    string
		f       normaTaskDirFacts
		refused string // a part of the reason in the error, "" when the start goes on
		warned  bool
	}{
		{"created by the server: root 0755 in /tmp", normaTaskDirFacts{mode: dir | 0o755, parentMode: tmpMode}, "", false},
		{"a symlink", normaTaskDirFacts{mode: fs.ModeSymlink | 0o777, parentMode: tmpMode}, "symbolic link", false},
		{"a regular file", normaTaskDirFacts{mode: 0o644, parentMode: tmpMode}, "not a directory", false},
		{"owned by the executor uid", normaTaskDirFacts{mode: dir | 0o755, uid: execUID, gid: execGID, parentMode: tmpMode}, "owned by the executor uid", false},
		{"owned by the executor uid, no write bit", normaTaskDirFacts{mode: dir | 0o555, uid: execUID, parentMode: tmpMode}, "owned by the executor uid", false},
		{"group-writable for the executor gid", normaTaskDirFacts{mode: dir | 0o775, gid: execGID, parentMode: tmpMode}, "group-writable", false},
		{"other-writable", normaTaskDirFacts{mode: dir | 0o757, parentMode: tmpMode}, "writable by others", false},
		{"another user, not writable by the executor", normaTaskDirFacts{mode: dir | 0o755, uid: 1000, gid: 1000, parentMode: tmpMode}, "", true},
		{"another user, the executor gid without the group write bit", normaTaskDirFacts{mode: dir | 0o755, uid: 1000, gid: execGID, parentMode: tmpMode}, "", true},
		{"root-owned, writable by the root group", normaTaskDirFacts{mode: dir | 0o775, parentMode: tmpMode}, "", true},
		{"parent world-writable, not sticky", normaTaskDirFacts{mode: dir | 0o755, parentMode: dir | 0o777}, "not sticky", false},
		{"parent group-writable for the executor gid, not sticky", normaTaskDirFacts{mode: dir | 0o755, parentMode: dir | 0o775, parentGID: execGID}, "not sticky", false},
		{"parent group-writable for the executor gid, sticky", normaTaskDirFacts{mode: dir | 0o755, parentMode: dir | sticky | 0o775, parentGID: execGID}, "", false},
		{"parent owned by the executor uid", normaTaskDirFacts{mode: dir | 0o755, parentMode: dir | 0o700, parentUID: execUID}, "owned by the executor", false},
		{"parent owned by the executor uid, sticky", normaTaskDirFacts{mode: dir | 0o755, parentMode: tmpMode, parentUID: execUID}, "owned by the executor", false},
		{"parent root 0755, not sticky", normaTaskDirFacts{mode: dir | 0o755, parentMode: dir | 0o755}, "", false},
		{"parent of another user, not writable by the executor", normaTaskDirFacts{mode: dir | 0o755, parentMode: dir | 0o755, parentUID: 1000, parentGID: 1000}, "", false},
	} {
		warning, err := checkNormaTaskDir(path, tc.f, execUID, execGID)
		if tc.refused == "" {
			if err != nil {
				t.Errorf("%s: refused: %v", tc.name, err)
			}
			if (warning != "") != tc.warned {
				t.Errorf("%s: warning %q, want one: %v", tc.name, warning, tc.warned)
			}
			continue
		}
		if err == nil || warning != "" {
			t.Errorf("%s: err %v, warning %q, want a refusal", tc.name, err, warning)
			continue
		}
		for _, want := range []string{
			path, tc.refused,
			fmt.Sprintf("owner %d:%d", tc.f.uid, tc.f.gid),
			fmt.Sprintf("mode %v", tc.f.mode),
			fmt.Sprintf("uid %d gid %d", execUID, execGID),
			"remove the directory or set TMPDIR to a directory the executor cannot write",
		} {
			if !strings.Contains(err.Error(), want) {
				t.Errorf("%s: the error does not hold %q:\n%v", tc.name, want, err)
			}
		}
	}
}

// prepareNormaTaskDir applies that decision to a directory that is already there:
// one the executor can write in fails the start, and the error names the path, its
// owner, its mode, the executor and the remedy. One the executor cannot write in is
// used as found, with a warning unless root owns it. Either way the directory and
// what it holds are the same afterwards: owners, modes, times and contents are
// hashed before and after. Runs with and without root: the executor ids are chosen
// around the ids of the directory.
func TestPrepareNormaTaskDirAlreadyThere(t *testing.T) {
	for _, tc := range []struct {
		name             string
		perm             os.FileMode
		otherUser        bool   // as root, the directory is given to 20001:20002
		sameUID, sameGID bool   // the executor id is the directory's
		refused          string // the reason in the error, "" when the start goes on
	}{
		{"owned by the executor uid", 0o755, true, true, false, "owned by the executor uid"},
		{"group-writable for the executor gid", 0o775, true, false, true, "group-writable"},
		{"other-writable", 0o757, true, false, false, "writable by others"},
		{"another user, not writable by the executor", 0o755, true, false, false, ""},
		{"root-owned as root, not writable by the executor", 0o755, false, false, false, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			dir := normaTempDir(t)
			if err := os.Mkdir(dir, 0o700); err != nil {
				t.Fatal(err)
			}
			fillNormaDir(t, dir)
			if tc.otherUser && os.Geteuid() == 0 { // without root it is the test user's
				if err := os.Lchown(dir, 20001, 20002); err != nil {
					t.Fatal(err)
				}
			}
			if err := os.Chmod(dir, tc.perm); err != nil {
				t.Fatal(err)
			}
			fi, err := os.Lstat(dir)
			if err != nil {
				t.Fatal(err)
			}
			st := fi.Sys().(*syscall.Stat_t)
			priv := ExecPrivilege{Enabled: true, UID: st.Uid + 1, GID: st.Gid + 1}
			if tc.sameUID {
				priv.UID = st.Uid
			}
			if tc.sameGID {
				priv.GID = st.Gid
			}
			before := treeDigest(t, dir)
			var logged bytes.Buffer
			prev := log.Writer()
			log.SetOutput(&logged)
			err = prepareNormaTaskDir(dir, priv)
			log.SetOutput(prev)
			if tc.refused != "" {
				wantNormaRefusal(t, err, dir, priv)
				if !strings.Contains(err.Error(), tc.refused) {
					t.Errorf("the error does not give the reason %q: %v", tc.refused, err)
				}
			} else if err != nil {
				t.Fatalf("a directory the executor cannot write in was refused: %v", err)
			}
			wantWarning := tc.refused == "" && st.Uid != 0
			if warned := strings.Contains(logged.String(), dir); warned != wantWarning {
				t.Fatalf("warning logged = %v, want %v:\n%s", warned, wantWarning, logged.String())
			}
			if after := treeDigest(t, dir); after != before {
				t.Fatalf("the directory or what it holds changed: digest %s, was %s", after, before)
			}
		})
	}
}

// The parent directory decides too. In a parent the executor can write in and that
// is not sticky, the executor can rename <temp>/norma and put its own in its place:
// the start fails, for a directory that is already there and for one created here.
// The same parent with the sticky bit, or one the executor cannot write in, passes.
// Runs with and without root.
func TestPrepareNormaTaskDirParent(t *testing.T) {
	for _, tc := range []struct {
		name    string
		mode    os.FileMode
		refused bool
	}{
		{"world-writable, not sticky", 0o777, true},
		{"world-writable, sticky", 0o777 | os.ModeSticky, false},
		{"not writable by the executor", 0o755, false},
	} {
		for _, state := range []string{"already there", "absent"} {
			t.Run(tc.name+", "+state, func(t *testing.T) {
				parent := filepath.Join(t.TempDir(), "tmp")
				if err := os.Mkdir(parent, 0o700); err != nil {
					t.Fatal(err)
				}
				if err := os.Chmod(parent, tc.mode); err != nil {
					t.Fatal(err)
				}
				t.Setenv("TMPDIR", parent)
				dir := filepath.Join(os.TempDir(), "norma")
				pfi, err := os.Stat(parent)
				if err != nil {
					t.Fatal(err)
				}
				pst := pfi.Sys().(*syscall.Stat_t)
				// Not the owner of the parent or of the directory, not in their group.
				priv := ExecPrivilege{Enabled: true, UID: pst.Uid + 1, GID: pst.Gid + 1}
				before := ""
				if state == "already there" {
					if err := os.Mkdir(dir, 0o755); err != nil {
						t.Fatal(err)
					}
					fillNormaDir(t, dir)
					before = treeDigest(t, dir)
				}
				err = prepareNormaTaskDir(dir, priv)
				if tc.refused {
					wantNormaRefusal(t, err, dir, priv)
					if !strings.Contains(err.Error(), "parent directory") || !strings.Contains(err.Error(), "not sticky") {
						t.Errorf("the error does not name the parent directory: %v", err)
					}
				} else if err != nil {
					t.Fatalf("refused in a parent the executor cannot rename in: %v", err)
				}
				if before != "" {
					if after := treeDigest(t, dir); after != before {
						t.Fatalf("the directory or what it holds changed: digest %s, was %s", after, before)
					}
				}
				if now, err := os.Stat(parent); err != nil || now.Mode() != pfi.Mode() {
					t.Fatalf("the parent changed: %v %v, was %v", now, err, pfi.Mode())
				}
			})
		}
	}
}

// A symlink (to a directory, or dangling) or a regular file at <temp>/norma fails
// the start. The entry stays what it was and nothing is created through the link.
// Runs with and without root.
func TestPrepareNormaTaskDirNotADirectory(t *testing.T) {
	for _, kind := range []string{"symlink to a directory", "dangling symlink", "regular file"} {
		t.Run(kind, func(t *testing.T) {
			dir := normaTempDir(t)
			target := filepath.Join(t.TempDir(), "target")
			switch kind {
			case "symlink to a directory":
				if err := os.Mkdir(target, 0o755); err != nil {
					t.Fatal(err)
				}
				fallthrough
			case "dangling symlink":
				if err := os.Symlink(target, dir); err != nil {
					t.Fatal(err)
				}
			default:
				if err := os.WriteFile(dir, []byte("not a directory\n"), 0o644); err != nil {
					t.Fatal(err)
				}
			}
			before := treeDigest(t, dir)
			priv := ExecPrivilege{Enabled: true, UID: DefaultExecUID, GID: DefaultExecGID}
			wantNormaRefusal(t, prepareNormaTaskDir(dir, priv), dir, priv)
			if after := treeDigest(t, dir); after != before {
				t.Fatalf("the entry changed: digest %s, was %s", after, before)
			}
			switch entries, err := os.ReadDir(target); {
			case kind == "symlink to a directory" && (err != nil || len(entries) != 0):
				t.Fatalf("the symlink target holds %v (%v), want it empty", entries, err)
			case kind == "dangling symlink" && !errors.Is(err, fs.ErrNotExist):
				t.Fatalf("something was created through the dangling symlink: %v %v", entries, err)
			}
		})
	}
}

// With the privilege drop disabled nothing is checked: a missing <temp>/norma is not
// created, and one the executor owns and everybody can write in does not fail the
// start and stays as it is. The same directory fails it once the drop is enabled.
// Runs with and without root.
func TestPrepareNormaTaskDirDropDisabled(t *testing.T) {
	dir := normaTempDir(t)
	priv := ExecPrivilege{UID: uint32(os.Getuid()), GID: uint32(os.Getgid())} // Enabled is false
	if err := prepareNormaTaskDir(dir, priv); err != nil {
		t.Fatalf("absent, drop disabled: %v", err)
	}
	if _, err := os.Lstat(dir); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("the directory was created with the drop disabled: %v", err)
	}
	if err := os.Mkdir(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	fillNormaDir(t, dir)
	if err := os.Chmod(dir, 0o777); err != nil {
		t.Fatal(err)
	}
	before := treeDigest(t, dir)
	if err := prepareNormaTaskDir(dir, priv); err != nil {
		t.Fatalf("executor-writable, drop disabled: %v", err)
	}
	// The same through the entry point, which reads the path from the temp directory.
	entry := priv
	if err := PrepareExecPrivilege(&entry, t.TempDir(), "", ""); err != nil {
		t.Fatalf("PrepareExecPrivilege, drop disabled: %v", err)
	}
	priv.Enabled = true
	wantNormaRefusal(t, prepareNormaTaskDir(dir, priv), dir, priv)
	if after := treeDigest(t, dir); after != before {
		t.Fatalf("the directory or what it holds changed: digest %s, was %s", after, before)
	}
}

// With the drop enabled, PrepareExecPrivilege creates <temp>/norma before any agent
// process runs: root:root 0755 in a world-writable sticky temp directory, where the
// executor can neither add an entry nor rename it.
func TestNormaTaskDirAsRoot(t *testing.T) {
	f := newExecRootFixture(t) // skips without root; its temp directory is 1777
	tmp := f.tmp
	fi, err := os.Lstat(filepath.Join(tmp, "norma"))
	if err != nil {
		t.Fatal(err)
	}
	if st := fi.Sys().(*syscall.Stat_t); !fi.IsDir() || st.Uid != 0 || st.Gid != 0 || fi.Mode().Perm() != 0o755 {
		t.Fatalf("%s/norma: mode %v uid %d gid %d, want a directory 0755 root:root", tmp, fi.Mode(), st.Uid, st.Gid)
	}
	c := exec.Command("sh", "-c", `cd "$1" || exit 1
mkdir norma/x 2>/dev/null || echo mkdir=denied
ln -s / norma/l 2>/dev/null || echo symlink=denied
mv norma moved 2>/dev/null || echo rename=denied
id -u`, "sh", tmp)
	applyExecCredential(c, f.priv)
	out, err := c.CombinedOutput()
	if err != nil {
		t.Fatalf("%v\n%s", err, out)
	}
	want := fmt.Sprintf("mkdir=denied\nsymlink=denied\nrename=denied\n%d\n", DefaultExecUID)
	if string(out) != want {
		t.Fatalf("executor probe in the temp directory:\n%s\nwant:\n%s", out, want)
	}
}

// The case the check is for, through the entry point: an executor process creates
// <temp>/norma in the sticky temp directory before a start and places a symlink in
// it. PrepareExecPrivilege then fails, and leaves what the executor made as it is.
func TestNormaTaskDirPlantedByExecutorAsRoot(t *testing.T) {
	f := newExecRootFixture(t) // skips without root
	dir := filepath.Join(f.tmp, "norma")
	if err := os.Remove(dir); err != nil { // the one this start created, still empty
		t.Fatal(err)
	}
	c := exec.Command("sh", "-c", `mkdir "$1" && ln -s /etc/passwd "$1/task_1.output"`, "sh", dir)
	applyExecCredential(c, f.priv)
	if out, err := c.CombinedOutput(); err != nil {
		t.Fatalf("%v\n%s", err, out)
	}
	before := treeDigest(t, dir)
	err := PrepareExecPrivilege(&f.priv, f.data, "", "")
	wantNormaRefusal(t, err, dir, f.priv)
	if !strings.Contains(err.Error(), "prepare the background-task output directory") {
		t.Errorf("the error does not say which step failed: %v", err)
	}
	if after := treeDigest(t, dir); after != before {
		t.Fatalf("the directory or what it holds changed: digest %s, was %s", after, before)
	}
}

// envNames returns the variable names of an `env` listing.
func envNames(out string) map[string]string {
	m := map[string]string{}
	for _, line := range strings.Split(out, "\n") {
		if k, v, ok := strings.Cut(line, "="); ok && k != "" && !strings.ContainsAny(k, " \t") {
			m[k] = v
		}
	}
	return m
}

// checkExecutorEnv asserts what crosses to an executor process: no variable
// outside the allowlist (the canary and a secret name set in the server), the
// executor's HOME, and the extra names wanted.
func checkExecutorEnv(t *testing.T, path, out, home string, want ...string) {
	t.Helper()
	got := envNames(out)
	for k := range got {
		if !executorEnvAllowed(k) && !strings.HasPrefix(k, "TOOL_") && k != "PWD" && k != "SHLVL" && k != "_" && k != "OLDPWD" && !slicesContains(want, k) {
			t.Errorf("%s: %s crossed to the executor", path, k)
		}
	}
	for _, k := range []string{"ARTEX_ISOLATION_CANARY", "OPENAI_API_KEY", envExecKeep} {
		if _, ok := got[k]; ok {
			t.Errorf("%s: %s reached the executor", path, k)
		}
	}
	if got["HOME"] != home {
		t.Errorf("%s: HOME=%q, want %q", path, got["HOME"], home)
	}
	for _, k := range append([]string{"PATH"}, want...) {
		if _, ok := got[k]; !ok {
			t.Errorf("%s: %s missing from the executor environment:\n%s", path, k, out)
		}
	}
}

func slicesContains(s []string, v string) bool {
	for _, x := range s {
		if x == v {
			return true
		}
	}
	return false
}

// Each executor path starts its process with the allowlisted environment: a
// variable of the server outside the allowlist does not cross, whatever its name;
// what the caller passes on purpose (Bash env, custom-tool parameters, the
// configured env of an MCP server) does. A nested shell keeps what the agent set.
func TestExecutorEnvAllowlistAsRoot(t *testing.T) {
	f := newExecRootFixture(t)
	t.Setenv("ARTEX_ISOLATION_CANARY", "canary-value")
	t.Setenv("OPENAI_API_KEY", "sk-canary")
	if err := InstallBashShim(f.priv); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(filepath.SplitList(os.Getenv("PATH"))[0]) })

	// Bash (Norma: exec.Command("bash") with the server env and the agent's BashEnv).
	in, _ := json.Marshal(map[string]string{"command": "env; echo NESTED=$(AGENT_SET=1 bash -c 'echo $AGENT_SET')"})
	res, err := actool.NewBash().Call(context.Background(), in, &actool.ToolContext{WorkingDir: f.work, Env: []string{"HTTP_PROXY=http://127.0.0.1:9"}})
	if err != nil {
		t.Fatal(err)
	}
	out := res.Flatten()
	checkExecutorEnv(t, "bash shim", out, f.home, "HTTP_PROXY", "PAGER", "NESTED")
	if !strings.Contains(out, "NESTED=1") {
		t.Errorf("a nested shell lost the variable the agent set:\n%s", out)
	}

	// Custom tool.
	py, err := exec.LookPath("python3")
	if err != nil {
		t.Fatalf("python3 is needed for the custom-tool path: %v", err)
	}
	out, err = execPython(context.Background(), py, "probe", `import os
for k, v in os.environ.items():
    print(k + "=" + v)`, map[string]any{"x": "1"}, f.work, []string{"HTTP_PROXY=http://127.0.0.1:9"}, 30*time.Second, f.priv)
	if err != nil {
		t.Fatal(err)
	}
	checkExecutorEnv(t, "custom tool", out, f.home, "HTTP_PROXY", "TOOL_X")

	// MCP stdio: mcp.NewStdioClient sets the server env plus the configured one.
	command, args, err := execDropCommand(f.priv, "env", nil)
	if err != nil {
		t.Fatal(err)
	}
	c := exec.Command(command, args...)
	c.Dir = f.work
	c.Env = os.Environ()
	for k, v := range withExecKeep(f.priv, map[string]string{"MCP_TOKEN": "configured"}) {
		c.Env = append(c.Env, k+"="+v)
	}
	b, err := c.CombinedOutput()
	if err != nil {
		t.Fatalf("%v\n%s", err, b)
	}
	checkExecutorEnv(t, "mcp stdio", string(b), f.home, "MCP_TOKEN")
	if envNames(string(b))["MCP_TOKEN"] != "configured" {
		t.Errorf("mcp stdio: the configured MCP_TOKEN did not cross:\n%s", b)
	}
}

// PrepareExecPrivilege gives the agent's file tools the executor identity: through
// it, a root-only file is refused by the kernel.
func TestPrepareExecPrivilegeSetsFileToolIdentityAsRoot(t *testing.T) {
	f := newExecRootFixture(t)
	var readErr error
	if err := agent.RunAsFileToolIdentity(func() { _, readErr = os.ReadFile(f.secret) }); err != nil {
		t.Fatal(err)
	}
	if !errors.Is(readErr, fs.ErrPermission) {
		t.Fatalf("read of a root-only file with the file tool identity: %v, want permission denied", readErr)
	}
	if _, err := os.ReadFile(f.secret); err != nil {
		t.Fatalf("the server itself must still read the file: %v", err)
	}
}

// applyExecCredential sets the credential and the executor's HOME; the later env
// entry wins in exec.Cmd. Runs without root: nothing is started.
func TestApplyExecCredentialSetsExecutorHome(t *testing.T) {
	t.Setenv(envExecHome, "/data/exec-home")
	c := exec.Command("true")
	c.Env = []string{"HOME=/root", "KEEP=1"}
	applyExecCredential(c, ExecPrivilege{Enabled: true, UID: 10001, GID: 10002})
	if cr := c.SysProcAttr.Credential; cr == nil || cr.Uid != 10001 || cr.Gid != 10002 {
		t.Fatalf("credential = %+v", c.SysProcAttr.Credential)
	}
	want := []string{"HOME=/root", "KEEP=1", "HOME=/data/exec-home", "XDG_CACHE_HOME=/data/exec-home/.cache"}
	if strings.Join(c.Env, "|") != strings.Join(want, "|") {
		t.Fatalf("env = %v, want %v", c.Env, want)
	}
	disabled := exec.Command("true")
	applyExecCredential(disabled, ExecPrivilege{})
	if disabled.SysProcAttr != nil || disabled.Env != nil {
		t.Fatal("a disabled privilege must leave the command unchanged")
	}
}
