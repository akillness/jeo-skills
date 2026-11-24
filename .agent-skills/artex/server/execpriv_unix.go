//go:build unix

package server

import (
	"errors"
	"fmt"
	"io/fs"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"

	"github.com/Autumn-27/artex/agent"
	"golang.org/x/sys/unix"
)

// Environment names the shims read. They carry no secret: the executor id, the real
// bash path and the executor's home directory.
const (
	envExecBash = "ARTEX_EXEC_BASH"
	envExecUID  = "ARTEX_EXEC_UID"
	envExecGID  = "ARTEX_EXEC_GID"
	envExecHome = "ARTEX_EXEC_HOME"
)

// execHomeDir is the executor's home under the data directory. The server's HOME
// (/root in the image) is not writable for the executor, so caches of npm, go, pip,
// bbot or Playwright would fail there.
const execHomeDir = "exec-home"

func execPrivilegeSupported() bool { return true }

func serverIsRoot() bool { return os.Geteuid() == 0 }

// applyExecCredential runs c as the executor identity. The server's own children
// (custom tools) use it directly; the Norma children go through the shims. Call it
// after c.Env is set: it points HOME and XDG_CACHE_HOME at the executor's home.
func applyExecCredential(c *exec.Cmd, p ExecPrivilege) {
	if !p.Enabled {
		return
	}
	if c.SysProcAttr == nil {
		c.SysProcAttr = &syscall.SysProcAttr{}
	}
	c.SysProcAttr.Credential = &syscall.Credential{Uid: p.UID, Gid: p.GID, Groups: []uint32{p.GID}}
	if home := execHomeEnv(); home != nil {
		if c.Env == nil {
			c.Env = os.Environ()
		}
		c.Env = append(c.Env, home...) // later entries win in exec.Cmd
	}
}

// execHomeEnv returns HOME and XDG_CACHE_HOME for an executor process, or nil when
// PrepareExecPrivilege has not set up the home.
func execHomeEnv() []string {
	home := os.Getenv(envExecHome)
	if home == "" {
		return nil
	}
	return []string{"HOME=" + home, "XDG_CACHE_HOME=" + filepath.Join(home, ".cache")}
}

// prepareExecHome creates the executor's home, owned by the executor, and records
// its path for the shims and applyExecCredential.
func prepareExecHome(p ExecPrivilege, dataDir string) error {
	abs, err := filepath.Abs(dataDir)
	if err != nil {
		return err
	}
	home := filepath.Join(abs, execHomeDir)
	if err := os.MkdirAll(home, 0o700); err != nil {
		return err
	}
	fi, err := os.Lstat(home)
	if err != nil {
		return err
	}
	if !fi.IsDir() {
		return fmt.Errorf("%s is not a directory", home)
	}
	if err := os.Lchown(home, int(p.UID), int(p.GID)); err != nil {
		return err
	}
	if err := os.Chmod(home, 0o700); err != nil {
		return err
	}
	return os.Setenv(envExecHome, home)
}

// execScriptDir is the directory under the data directory that custom-tool scripts
// are written to when agent processes run as the executor.
const execScriptDir = "exec-scripts"

// prepareExecScriptDir creates the script directory and returns its path. It is
// owned by root with the executor as its group and mode 0750: the executor can
// reach and read a script there, and cannot create, rename or replace an entry.
// The run directory is no place for the script: the executor can write there, and
// could turn the script's directory into a symlink that root then writes through.
func prepareExecScriptDir(p ExecPrivilege, dataDir string) (string, error) {
	abs, err := filepath.Abs(dataDir)
	if err != nil {
		return "", err
	}
	dir := filepath.Join(abs, execScriptDir)
	if err := os.Mkdir(dir, 0o750); err != nil && !errors.Is(err, fs.ErrExist) {
		return "", err
	}
	fi, err := os.Lstat(dir)
	if err != nil {
		return "", err
	}
	if !fi.IsDir() {
		return "", fmt.Errorf("%s is not a directory", dir)
	}
	if err := os.Lchown(dir, 0, int(p.GID)); err != nil {
		return "", err
	}
	if err := os.Chmod(dir, 0o750); err != nil {
		return "", err
	}
	return dir, nil
}

// prepareNormaTaskDir creates dir, the directory Norma keeps background-task output
// in: os.TempDir()/norma, a path ARTEX does not choose. Norma creates it with the
// first session and writes <session>/tasks/task_<n>.output below it from the server
// process. The temp directory is world-writable: an executor process that runs
// before that first session could create dir itself and place symlinks in it for
// the server to write through. Created here, before any agent process starts, it is
// root:root 0755. What is found at dir afterwards, created here or already there,
// goes through checkNormaTaskDir, which fails the start for a symlink, for a file
// and for a directory the executor p can write in or replace. Any other directory
// already there is used as found, with a warning when root does not own it or its
// group can write in it: it may belong to another user of this host. A directory
// that was already there is never chmodded, chowned, renamed or removed. Nothing is
// checked or created when the privilege drop is disabled.
func prepareNormaTaskDir(dir string, p ExecPrivilege) error {
	if !p.Enabled {
		return nil
	}
	if err := os.Mkdir(dir, 0o755); err != nil && !errors.Is(err, fs.ErrExist) {
		return err
	}
	fi, err := os.Lstat(dir)
	if err != nil {
		return err
	}
	// The parent is followed: TMPDIR may be a symlink, and its target holds dir.
	parent, err := os.Stat(filepath.Dir(dir))
	if err != nil {
		return err
	}
	st, ok := fi.Sys().(*syscall.Stat_t)
	pst, pok := parent.Sys().(*syscall.Stat_t)
	if !ok || !pok {
		return fmt.Errorf("%s: no owner in its file information", dir)
	}
	warning, err := checkNormaTaskDir(dir, normaTaskDirFacts{
		mode: fi.Mode(), uid: st.Uid, gid: st.Gid,
		parentMode: parent.Mode(), parentUID: pst.Uid, parentGID: pst.Gid,
	}, p.UID, p.GID)
	if err != nil {
		return err
	}
	if warning != "" {
		log.Printf("[exec] %s (uid %d, mode %v) %s", dir, st.Uid, fi.Mode().Perm(), warning)
	}
	return nil
}

// normaTaskDirFacts is what prepareNormaTaskDir reads about <temp>/norma: the Lstat
// of the path (mode carries the file type) and the Stat of its parent directory.
type normaTaskDirFacts struct {
	mode                 fs.FileMode
	uid, gid             uint32
	parentMode           fs.FileMode
	parentUID, parentGID uint32
}

// checkNormaTaskDir decides whether the server may write background-task output
// below dir while agent processes run as execUID and execGID. It decides from the
// owners and the mode bits in f and from the executor identity; an access check
// would answer for root, which the server is. It returns an error when the start
// must fail:
//   - dir is a symlink or not a directory;
//   - the executor uid owns dir: it can change the mode and, even in a sticky
//     parent, rename dir and put another in its place;
//   - the group or other bits let the executor write in dir;
//   - the executor owns the parent directory, or can write in it and it is not
//     sticky: it can rename dir and put another in its place.
//
// Otherwise it returns the reason for a warning, or "" for a directory that root
// owns and only root can write in.
func checkNormaTaskDir(dir string, f normaTaskDirFacts, execUID, execGID uint32) (warning string, err error) {
	refuse := func(why string) error {
		return fmt.Errorf("%s (owner %d:%d, mode %v) cannot hold background-task output while agent processes run as uid %d gid %d: %s; remove the directory or set TMPDIR to a directory the executor cannot write", dir, f.uid, f.gid, f.mode, execUID, execGID, why)
	}
	if f.mode&fs.ModeSymlink != 0 {
		return "", refuse("it is a symbolic link")
	}
	if !f.mode.IsDir() {
		return "", refuse("it is not a directory")
	}
	if why := normaTaskDirExecWrite(f.mode.Perm(), f.uid, f.gid, execUID, execGID); why != "" {
		return "", refuse(why)
	}
	parent := fmt.Sprintf("its parent directory (owner %d:%d, mode %v)", f.parentUID, f.parentGID, f.parentMode)
	if f.parentUID == execUID {
		return "", refuse(parent + " is owned by the executor, which can rename the directory and put another in its place")
	}
	if f.parentMode&fs.ModeSticky == 0 && normaTaskDirExecWrite(f.parentMode.Perm(), f.parentUID, f.parentGID, execUID, execGID) != "" {
		return "", refuse(parent + " is writable by the executor and not sticky: the executor can rename the directory and put another in its place")
	}
	if f.uid != 0 || f.mode.Perm()&0o022 != 0 {
		return "is not a root-owned directory only root can write in: background-task output written there is not protected from its owner", nil
	}
	return "", nil
}

// normaTaskDirExecWrite reports why the executor (execUID, execGID) can write in a
// directory with the permission bits perm, the owner uid and the group gid, or ""
// when it cannot. The owner counts whatever the bits say: it can change them.
func normaTaskDirExecWrite(perm fs.FileMode, uid, gid, execUID, execGID uint32) string {
	switch {
	case uid == execUID:
		return fmt.Sprintf("it is owned by the executor uid %d", execUID)
	case gid == execGID && perm&0o020 != 0:
		return fmt.Sprintf("its group is the executor gid %d and it is group-writable", execGID)
	case perm&0o002 != 0:
		return "it is writable by others"
	}
	return ""
}

// prepareExecScript lets the executor read a script the server wrote: the file stays
// root-owned and becomes readable by the executor group only.
func prepareExecScript(p ExecPrivilege, path string) error {
	if !p.Enabled {
		return nil
	}
	if err := os.Chown(path, -1, int(p.GID)); err != nil {
		return err
	}
	return os.Chmod(path, 0o640)
}

// PrepareExecPrivilege sets up the state the executor needs before the server opens
// its stores. Only the run directories are shared with the executor group (setgid,
// group read/write, umask 002): tasks/<id>/main, tasks/<id>/i<N> and sessions/<id>.
// Their parents (tasks/, sessions/ and tasks/<id>) are root:root 0755, so the
// executor cannot create, rename or remove a run directory, and no run directory is
// an ancestor of another. Inside a run directory new subdirectories inherit the
// group. The entries a task directory held before this layout are shared with the
// group too (shareTaskDir). Command-output spills leave the run directories for
// <data>/spill, which the
// executor group reads and cannot change (makeSpillDir). The key files and the
// config file (which can hold the database DSN) are restricted to root. Nothing
// else under the data directory changes; directories a
// root-only path needs are left as they are. It sets p.ScriptDir to the script
// directory it creates, and creates the directory of Norma's background-task output
// under the temp directory (prepareNormaTaskDir); it fails when that directory is
// already there and the executor can write in it or replace it.
func PrepareExecPrivilege(p *ExecPrivilege, dataDir, keyDir, configPath string) error {
	if !p.Enabled {
		return nil
	}
	gid := int(p.GID)
	if err := shareRunDirs(dataDir, gid); err != nil {
		return fmt.Errorf("share the run directories with the executor group: %w", err)
	}
	agent.SetRunDirMaker(func(base, leaf string) error { return makeRunDir(base, leaf, gid) })
	agent.SetSpillDirMaker(
		func(base, dir string) error { return makeSpillDir(base, dir, gid) },
		func(dir string) error { return shareSpillFiles(dir, gid) },
	)
	// The file tools open the paths the agent names inside the server: they do it as
	// the executor too (agent/filetools_identity.go).
	if agent.FileToolIdentitySupported() {
		agent.SetFileToolIdentity(&agent.FileToolIdentity{UID: p.UID, GID: p.GID})
	} else {
		log.Printf("[exec] the agent's file tools keep the server's identity on this platform: only their path confinement applies")
	}
	if err := prepareExecHome(*p, dataDir); err != nil {
		return fmt.Errorf("prepare the executor home: %w", err)
	}
	scriptDir, err := prepareExecScriptDir(*p, dataDir)
	if err != nil {
		return fmt.Errorf("prepare the executor script directory: %w", err)
	}
	p.ScriptDir = scriptDir
	if err := prepareNormaTaskDir(filepath.Join(os.TempDir(), "norma"), *p); err != nil {
		return fmt.Errorf("prepare the background-task output directory: %w", err)
	}
	tasks := filepath.Join(dataDir, "tasks")
	for _, name := range []string{"jwt.key", "secret.key"} {
		if keyDir == "" {
			break
		}
		path := filepath.Join(keyDir, name)
		if _, err := os.Stat(path); err == nil {
			if err := ownByRoot(path); err != nil {
				return fmt.Errorf("restrict %s to root: %w", path, err)
			}
			if err := os.Chmod(path, 0o600); err != nil {
				return fmt.Errorf("restrict %s to root: %w", path, err)
			}
		}
	}
	if configPath != "" {
		if _, err := os.Stat(configPath); err == nil {
			if err := ownByRoot(configPath); err != nil {
				return fmt.Errorf("restrict %s to root: %w", configPath, err)
			}
		}
		if fi, err := os.Stat(configPath); err == nil && fi.Mode().Perm()&0o077 != 0 {
			if err := os.Chmod(configPath, 0o600); err != nil {
				return fmt.Errorf("restrict %s to root: %w", configPath, err)
			}
			log.Printf("[exec] %s set to 0600: it can hold the database DSN", configPath)
		}
	}
	// Files and directories the server creates from now on are group-writable, so
	// the executor can write what the server puts in a run directory.
	syscall.Umask(0o002)
	log.Printf("[exec] agent processes run as uid %d gid %d; the run directories under %s are shared with that group", p.UID, p.GID, tasks)
	return nil
}

// ownByRoot makes root the owner of a key or config file that another user owns:
// mode 0600 alone leaves the file readable by its owner, which could be the
// executor uid (a file created by an agent process, or on the host under the uid
// the executor has in the container).
func ownByRoot(path string) error {
	fi, err := os.Stat(path)
	if err != nil {
		return err
	}
	st, ok := fi.Sys().(*syscall.Stat_t)
	if !ok || st.Uid == 0 {
		return nil
	}
	if err := os.Chown(path, 0, -1); err != nil {
		return err
	}
	log.Printf("[exec] %s was owned by uid %d; it is now owned by root", path, st.Uid)
	return nil
}

// runDirMode is the mode of a run directory: group-writable, and setgid so what is
// created in it keeps the executor group.
const runDirMode = 0o775 | os.ModeSetgid

// setDirOwner makes dir root:gid with mode. dir is opened without following a
// symlink and changed through the descriptor, so a planted link is refused and
// never changes another directory.
func setDirOwner(dir string, gid int, mode os.FileMode) error {
	f, err := os.OpenFile(dir, os.O_RDONLY|syscall.O_DIRECTORY|syscall.O_NOFOLLOW, 0)
	if err != nil {
		return err
	}
	defer f.Close()
	if err := f.Chown(0, gid); err != nil {
		return err
	}
	return f.Chmod(mode)
}

// makeRunDir creates the run directory leaf below base. Every directory between
// base and the leaf is root:root 0755, and the leaf alone is shared with the
// executor group. A parent is set before the next level is touched: once it is
// root-only, the executor cannot swap what is below it.
func makeRunDir(base, leaf string, gid int) error {
	return makeLeafDir(base, leaf, gid, runDirMode)
}

// spillDirMode is the mode of a command-output spill directory: the executor group
// reads what the server writes there and cannot create, rename or remove an entry.
const spillDirMode = 0o750

// makeSpillDir creates the spill directory dir below base (<base>/spill/tasks/<id>
// or <base>/spill/sessions/<id>): root-owned with the executor as its group, below
// root:root 0755 parents.
func makeSpillDir(base, dir string, gid int) error {
	return makeLeafDir(base, dir, gid, spillDirMode)
}

// shareSpillFiles lets the executor group read the spill files in dir. Norma writes
// them 0600 and the agent reads them back with Bash, which runs as the executor:
// each becomes root:gid 0640. The executor cannot write in dir, so every entry is a
// file the server wrote; it is still opened without following a symlink.
func shareSpillFiles(dir string, gid int) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	for _, e := range entries {
		if !e.Type().IsRegular() {
			continue
		}
		f, err := os.OpenFile(filepath.Join(dir, e.Name()), os.O_RDONLY|syscall.O_NOFOLLOW, 0)
		if err != nil {
			return err
		}
		err = f.Chown(0, gid)
		if err == nil {
			err = f.Chmod(0o640)
		}
		f.Close()
		if err != nil {
			return err
		}
	}
	return nil
}

// shareRestoredSpillDir puts the ownership back on a spill directory that was
// restored from an archive: the package keeps neither owners nor directory modes.
func shareRestoredSpillDir(p ExecPrivilege, dir string) error {
	if !p.Enabled {
		return nil
	}
	gid := int(p.GID)
	if err := setDirOwner(dir, gid, spillDirMode); err != nil {
		return err
	}
	return shareSpillFiles(dir, gid)
}

// makeLeafDir creates the directory leaf below base with mode and the group gid.
// Every directory between base and the leaf is root:root 0755. A parent is set
// before the next level is touched.
func makeLeafDir(base, leaf string, gid int, leafMode os.FileMode) error {
	rel, err := filepath.Rel(base, leaf)
	if err != nil || rel == "." || !filepath.IsLocal(rel) {
		return fmt.Errorf("%s is not below %s", leaf, base)
	}
	parts := strings.Split(rel, string(filepath.Separator))
	dir := base
	for i, part := range parts {
		dir = filepath.Join(dir, part)
		group, mode := 0, os.FileMode(0o755)
		if i == len(parts)-1 {
			group, mode = gid, leafMode
		}
		if err := os.Mkdir(dir, mode.Perm()); err != nil && !errors.Is(err, fs.ErrExist) {
			return err
		}
		if err := setDirOwner(dir, group, mode); err != nil {
			return err
		}
	}
	return nil
}

// shareRunDirs applies the run-directory layout to what is on disk: tasks/ and
// sessions/ become root:root 0755, each task directory too, and each run directory
// (sessions/<id>, tasks/<id>/main, tasks/<id>/i<N>) is shared with the executor
// group with what it holds, like the older entries of a task directory.
func shareRunDirs(dataDir string, gid int) error {
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return err
	}
	for _, sub := range []string{"tasks", "sessions"} {
		root := filepath.Join(dataDir, sub)
		if err := os.Mkdir(root, 0o755); err != nil && !errors.Is(err, fs.ErrExist) {
			return err
		}
		if err := setDirOwner(root, 0, 0o755); err != nil {
			return err
		}
		entries, err := os.ReadDir(root)
		if err != nil {
			return err
		}
		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			dir := filepath.Join(root, e.Name())
			if sub == "tasks" {
				err = shareTaskDir(dir, gid)
			} else {
				err = shareRunDir(dir, gid)
			}
			if err != nil {
				return err
			}
		}
	}
	return nil
}

// shareTaskDir makes a task directory root:root 0755 and shares the run directories
// in it. Its other entries date from before this layout, when the task directory was
// the main agent's working directory (uploads/, files the agent wrote there): they
// stay where they are and are shared with the executor group again, as the whole
// tree was. The task directory itself stays root-only, so the executor can change
// what is inside such an entry and cannot rename, remove or add one. A symlink
// among them is not followed.
func shareTaskDir(taskDir string, gid int) error {
	if err := setDirOwner(taskDir, 0, 0o755); err != nil {
		return err
	}
	entries, err := os.ReadDir(taskDir)
	if err != nil {
		return err
	}
	for _, e := range entries {
		path := filepath.Join(taskDir, e.Name())
		if !agent.IsRunDirName(e.Name()) {
			err = shareWithExecGroup(path, gid)
		} else if e.IsDir() {
			err = shareRunDir(path, gid)
		}
		if err != nil {
			return err
		}
	}
	return nil
}

// shareRunDir shares one run directory and what it holds with the executor group.
func shareRunDir(leaf string, gid int) error {
	if err := setDirOwner(leaf, gid, runDirMode); err != nil {
		return err
	}
	return shareWithExecGroup(leaf, gid)
}

// shareRestoredTaskDir puts the run-directory layout back on a task directory that
// was restored from an archive: the package keeps neither owners nor directory modes.
func shareRestoredTaskDir(p ExecPrivilege, taskDir string) error {
	if !p.Enabled {
		return nil
	}
	return shareTaskDir(taskDir, int(p.GID))
}

// shareWithExecGroup gives the executor group the tree under root: the group owns
// each entry and gets read/write (and traverse on directories), and directories set
// the setgid bit so anything created below them keeps the group. The executor can
// change entries in a run directory concurrently, so each entry is opened relative
// to its already-open parent without following a symlink. Ownership and mode changes
// use the descriptor: replacing a name after the open cannot redirect them to a
// root-only key outside the run directory.
func shareWithExecGroup(root string, gid int) error {
	f, err := os.OpenFile(root, os.O_RDONLY|unix.O_NONBLOCK|unix.O_NOFOLLOW, 0)
	if errors.Is(err, syscall.ELOOP) {
		// Older task directories can contain symlinks. Like WalkDir, leave the
		// target alone; only the link itself receives the executor group.
		return os.Lchown(root, -1, gid)
	}
	if err != nil {
		return err
	}
	defer f.Close()
	return shareOpenedExecEntry(f, gid)
}

func shareOpenedExecEntry(f *os.File, gid int) error {
	info, err := f.Stat()
	if err != nil {
		return err
	}
	if info.Mode().IsRegular() {
		st, ok := info.Sys().(*syscall.Stat_t)
		if !ok || st.Nlink > 1 {
			return fmt.Errorf("refusing to share a file with another hard link")
		}
	}
	if err := f.Chown(-1, gid); err != nil {
		return err
	}
	mode := info.Mode().Perm() | 0o060
	if info.IsDir() {
		mode = (info.Mode().Perm() | 0o070) | os.ModeSetgid
	}
	if err := f.Chmod(mode); err != nil {
		return err
	}
	if !info.IsDir() {
		return nil
	}
	entries, err := f.ReadDir(-1)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		name := entry.Name() // one component, relative to the open directory
		fd, err := unix.Openat(int(f.Fd()), name, unix.O_RDONLY|unix.O_NONBLOCK|unix.O_NOFOLLOW|unix.O_CLOEXEC, 0)
		if errors.Is(err, syscall.ELOOP) {
			if err := unix.Fchownat(int(f.Fd()), name, -1, gid, unix.AT_SYMLINK_NOFOLLOW); err != nil {
				return fmt.Errorf("%s: %w", name, err)
			}
			continue
		}
		if err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
		child := os.NewFile(uintptr(fd), name)
		childErr := shareOpenedExecEntry(child, gid)
		closeErr := child.Close()
		if childErr != nil {
			return fmt.Errorf("%s: %w", name, childErr)
		}
		if closeErr != nil {
			return fmt.Errorf("%s: %w", name, closeErr)
		}
	}
	return nil
}

// InstallBashShim makes the Bash tool, the interactive shell and background tasks
// run as the executor. Norma starts them with exec.Command("bash"), which takes no
// credential, so a symlink named bash to this binary is placed first on PATH. The
// shim (RunExecShimIfRequested) drops to the executor identity and execs the real
// bash, which keeps the PID and the process group that Norma tracks.
func InstallBashShim(p ExecPrivilege) error {
	if !p.Enabled {
		return nil
	}
	realBash, err := exec.LookPath("bash")
	if err != nil {
		return fmt.Errorf("bash is needed for the agent shell: %w", err)
	}
	self, err := os.Executable()
	if err != nil {
		return fmt.Errorf("locate the server binary: %w", err)
	}
	if self, err = filepath.EvalSymlinks(self); err != nil {
		return fmt.Errorf("resolve the server binary: %w", err)
	}
	dir, err := os.MkdirTemp("", "artex-exec-")
	if err != nil {
		return fmt.Errorf("create the shim directory: %w", err)
	}
	// Root-owned and traversable: the executor can run the shim, cannot change it.
	if err := os.Chmod(dir, 0o755); err != nil {
		return err
	}
	if err := os.Symlink(self, filepath.Join(dir, "bash")); err != nil {
		return fmt.Errorf("create the bash shim: %w", err)
	}
	if err := os.Setenv(envExecBash, realBash); err != nil {
		return err
	}
	if err := os.Setenv(envExecUID, execIDString(p.UID)); err != nil {
		return err
	}
	if err := os.Setenv(envExecGID, execIDString(p.GID)); err != nil {
		return err
	}
	return os.Setenv("PATH", dir+string(os.PathListSeparator)+os.Getenv("PATH"))
}

// RunExecShimIfRequested makes the process a privilege-drop shim when it was started
// as one: as bash through the PATH shim, or as artex __artex-exec-drop for an MCP
// stdio command; or the isolation self-test probe (isolation_unix.go). It exits or
// execs the target; it returns only for an ordinary start.
func RunExecShimIfRequested(argv []string) {
	if len(argv) == 0 {
		return
	}
	if filepath.Base(argv[0]) == "bash" && os.Getenv(envExecBash) != "" {
		runBashShim(argv)
	}
	if len(argv) >= 2 && argv[1] == execDropArg {
		runDropShim(argv[2:])
	}
	if len(argv) >= 2 && argv[1] == isolationProbeArg {
		runIsolationProbeMain()
	}
}

func runBashShim(argv []string) {
	// PR_SET_NO_NEW_PRIVS is per thread, so the thread that sets it must be the one
	// that execs. The lock is never released: the process is replaced by exec.
	runtime.LockOSThread()
	uid, gid, err := execIDsFromEnv()
	if err != nil {
		shimFail(err)
	}
	if err := enterExecutor(uid, gid); err != nil {
		shimFail(err)
	}
	shimExec(os.Getenv(envExecBash), argv)
}

// enterExecutor drops to uid and gid. When this call performs the switch (not in a
// nested shell already running as the executor, whose environment the agent may
// have set), the environment is first rebuilt from the allowlist (execenv_unix.go)
// and HOME and XDG_CACHE_HOME move to the executor's home.
// PR_SET_NO_NEW_PRIVS is set first, before the identity changes, on the calling
// thread. The shims call this with their thread locked (runBashShim, runDropShim),
// so the same thread goes on to exec the target and the flag is inherited by it and
// everything it forks. Custom tools take SysProcAttr.Credential in the server and do
// not pass through this shim, so the flag is a known gap there.
func enterExecutor(uid, gid int) error {
	if err := setNoNewPrivsFn(); err != nil {
		return fmt.Errorf("no_new_privs must be set before the executor identity is applied: %w", err)
	}
	if os.Getuid() != uid || os.Getgid() != gid {
		if err := sealExecutorEnv(); err != nil {
			return err
		}
		for _, kv := range execHomeEnv() {
			k, v, _ := strings.Cut(kv, "=")
			if err := os.Setenv(k, v); err != nil {
				return err
			}
		}
	}
	return dropTo(uid, gid)
}

// runDropShim handles: <uid> <gid> -- <command> <args...>.
func runDropShim(args []string) {
	runtime.LockOSThread() // same reason as runBashShim: the flag is per thread
	if len(args) < 3 || args[2] != "--" {
		shimFail(errors.New("drop shim needs <uid> <gid> -- <command> [args]"))
	}
	uid, errU := strconv.Atoi(args[0])
	gid, errG := strconv.Atoi(args[1])
	if errU != nil || errG != nil || len(args) < 4 {
		shimFail(errors.New("drop shim: malformed identity or command"))
	}
	command := args[3]
	target := command
	if !strings.Contains(command, "/") {
		resolved, err := exec.LookPath(command)
		if err != nil {
			shimFail(fmt.Errorf("command %q: %w", command, err))
		}
		target = resolved
	}
	if err := enterExecutor(uid, gid); err != nil {
		shimFail(err)
	}
	shimExec(target, args[3:])
}

func execIDsFromEnv() (int, int, error) {
	uid, errU := strconv.Atoi(os.Getenv(envExecUID))
	gid, errG := strconv.Atoi(os.Getenv(envExecGID))
	if errU != nil || errG != nil {
		return 0, 0, errors.New("executor identity missing from the environment")
	}
	return uid, gid, nil
}

// dropTo switches the calling process to uid and gid, for good: the supplementary
// groups, gid and uid all change, and the result is checked. A process already
// running as the executor (a nested bash) passes straight through.
func dropTo(uid, gid int) error {
	if os.Getuid() == uid && os.Getgid() == gid {
		return nil
	}
	if os.Geteuid() != 0 {
		return fmt.Errorf("cannot switch to uid %d: the process is not root", uid)
	}
	if err := syscall.Setgroups([]int{gid}); err != nil {
		return fmt.Errorf("setgroups: %w", err)
	}
	if err := syscall.Setgid(gid); err != nil {
		return fmt.Errorf("setgid %d: %w", gid, err)
	}
	if err := syscall.Setuid(uid); err != nil {
		return fmt.Errorf("setuid %d: %w", uid, err)
	}
	if os.Getuid() != uid || os.Geteuid() != uid || os.Getgid() != gid {
		return fmt.Errorf("privilege drop to %d:%d did not take effect", uid, gid)
	}
	return nil
}

// shimExec replaces the process with target. It returns only on failure, and then
// the shim stops: a command must never run with the server's identity by mistake.
func shimExec(target string, argv []string) {
	err := syscall.Exec(target, argv, os.Environ())
	shimFail(fmt.Errorf("exec %s: %w", target, err))
}

func shimFail(err error) {
	fmt.Fprintf(os.Stderr, "artex: agent process not started: %v\n", err)
	os.Exit(126)
}
