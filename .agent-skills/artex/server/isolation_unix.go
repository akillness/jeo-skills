//go:build unix

package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/Autumn-27/artex/agent"
)

// isolationProbeArg is the argv marker of the self-test probe:
// artex __artex-isolation-probe, with an isolationProbeSpec on stdin.
const isolationProbeArg = "__artex-isolation-probe"

// isolationProbeTimeout bounds the probe, database attempt included.
const isolationProbeTimeout = 30 * time.Second

// isolationProbeSpec is what the probe checks from inside an executor process.
type isolationProbeSpec struct {
	UID       uint32 `json:"uid"`
	GID       uint32 `json:"gid"`
	ServerPID int    `json:"server_pid"`
	// Unreadable are files no agent process may open for reading.
	Unreadable []string `json:"unreadable,omitempty"`
	// Unwritable are directories no agent process may create an entry in.
	Unwritable []string `json:"unwritable,omitempty"`
	// DB names the server's database at each host its DSN lists, fallbacks included:
	// the real address the server connects to, never one the self-test picks. The
	// probe connects to each without a password.
	DB []isolationProbeDB `json:"db,omitempty"`
}

type isolationProbeDB struct {
	Host     string `json:"host"`
	Port     uint16 `json:"port"`
	User     string `json:"user"`
	Database string `json:"database"`
}

// isolationProbeReport is the probe's answer on stdout.
type isolationProbeReport struct {
	Failures []string `json:"failures"`
}

// IsolationSelfTest checks that agent processes and file tools are isolated from
// the server. It returns nil when every check passes, otherwise an error that names
// each failure. With the privilege drop disabled there is nothing to test: agent
// processes run as the server, and that is reported as the failure.
func IsolationSelfTest(p ExecPrivilege, t IsolationTargets) error {
	if !p.Enabled {
		return errors.New("agent processes run with the server's identity: the privilege drop is off (the server is not root, or -exec-uid is negative)")
	}
	spec := isolationSpec(p, t)
	failures := fileToolIsolationFailures(spec.Unreadable)
	if t.DSN != "" && len(spec.DB) == 0 {
		failures = append(failures, "the database DSN names no host the self-test can check")
	}
	failures = append(failures, replaceableDirFailures(spec.Unwritable, p.UID, p.GID)...)
	failures = append(failures, skillTreeFailures(t.SkillDir, p.UID, p.GID)...)
	rep, err := runIsolationProbe(spec)
	if err != nil {
		failures = append(failures, fmt.Sprintf("the probe did not run through the Bash shim: %v", err))
	} else {
		failures = append(failures, rep.Failures...)
	}
	if len(failures) > 0 {
		return errors.New(strings.Join(failures, "; "))
	}
	return nil
}

// isolationSpec builds the probe's checks from the server's paths.
func isolationSpec(p ExecPrivilege, t IsolationTargets) isolationProbeSpec {
	spec := isolationProbeSpec{UID: p.UID, GID: p.GID, ServerPID: os.Getpid()}
	if t.KeyDir != "" {
		spec.Unreadable = append(spec.Unreadable, filepath.Join(t.KeyDir, "jwt.key"), filepath.Join(t.KeyDir, "secret.key"))
	}
	if t.ConfigPath != "" {
		spec.Unreadable = append(spec.Unreadable, t.ConfigPath)
	}
	if t.DataDir != "" {
		spec.Unreadable = append(spec.Unreadable, filepath.Join(t.DataDir, "traffic", "_ca", "mitmproxy-ca.pem"))
	}
	// The directories of the keys, the config and the data: an agent process that
	// can create an entry there can plant a key, a config or a whole data tree that
	// the server uses at its next start.
	// The skill directory too: a skill an agent process writes there directly would
	// skip the approval of create_skill (see skillTreeFailures).
	for _, dir := range []string{t.DataDir, t.KeyDir, configDir(t.ConfigPath), t.SkillDir} {
		if dir != "" && !slices.Contains(spec.Unwritable, dir) {
			spec.Unwritable = append(spec.Unwritable, dir)
		}
	}
	if t.DSN != "" {
		if cfg, err := pgx.ParseConfig(t.DSN); err == nil {
			spec.DB = dsnProbeHosts(cfg)
		}
	}
	return spec
}

// dsnProbeHosts lists each distinct host and port of a parsed DSN, the first one
// and its fallbacks (pgx adds a fallback per TLS attempt, so hosts repeat).
func dsnProbeHosts(cfg *pgx.ConnConfig) []isolationProbeDB {
	var out []isolationProbeDB
	add := func(host string, port uint16) {
		if host == "" {
			return
		}
		for _, db := range out {
			if db.Host == host && db.Port == port {
				return
			}
		}
		out = append(out, isolationProbeDB{Host: host, Port: port, User: cfg.User, Database: cfg.Database})
	}
	add(cfg.Host, cfg.Port)
	for _, fb := range cfg.Fallbacks {
		add(fb.Host, fb.Port)
	}
	return out
}

func configDir(configPath string) string {
	if configPath == "" {
		return ""
	}
	return filepath.Dir(configPath)
}

// replaceableDirFailures reports each directory whose parent lets the executor
// rename it and put another in its place: the parent is owned by the executor, or
// the executor can write in it and it is not sticky. The probe checks the
// directories themselves; their parents are checked here from the owners and mode
// bits, since a sticky world-writable parent such as /tmp is writable yet safe.
func replaceableDirFailures(dirs []string, execUID, execGID uint32) []string {
	var failures []string
	for _, dir := range dirs {
		abs, err := filepath.Abs(dir)
		if err != nil {
			continue
		}
		parent := filepath.Dir(abs)
		fi, err := os.Stat(parent)
		if err != nil {
			continue
		}
		st, ok := fi.Sys().(*syscall.Stat_t)
		if !ok {
			continue
		}
		if why := parentReplaceable(fi.Mode(), st.Uid, st.Gid, execUID, execGID); why != "" {
			failures = append(failures, fmt.Sprintf("an agent process can replace %s: its parent %s %s", dir, parent, why))
		}
	}
	return failures
}

// parentReplaceable is the decision of replaceableDirFailures for one parent.
func parentReplaceable(mode fs.FileMode, uid, gid, execUID, execGID uint32) string {
	if uid == execUID {
		return fmt.Sprintf("is owned by the executor uid %d", execUID)
	}
	if mode&fs.ModeSticky == 0 {
		if why := normaTaskDirExecWrite(mode.Perm(), uid, gid, execUID, execGID); why != "" {
			return "is writable by the executor and not sticky (" + why + ")"
		}
	}
	return ""
}

// skillTreeMaxFailures caps what skillTreeFailures reports for one tree.
const skillTreeMaxFailures = 20

// skillTreeFailures reports each file and directory under the skill directory that
// an agent process could change: agents load skill files as instructions, so a skill
// written there directly would bypass the operator approval that create_skill and
// update_skill_file need (intercept/persistence.go). It decides from the owners and
// mode bits, without writing anything: an entry owned by the executor uid, or
// writable by the executor gid or by others, is reported. A symlink is judged by its
// target and not descended. The probe checks the directory itself for writes and
// replaceableDirFailures its parent.
func skillTreeFailures(root string, execUID, execGID uint32) []string {
	if root == "" {
		return nil
	}
	if _, err := os.Stat(root); err != nil {
		return nil
	}
	var failures []string
	_ = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		fi, err := os.Stat(path)
		if err != nil {
			return nil
		}
		st, ok := fi.Sys().(*syscall.Stat_t)
		if !ok {
			return nil
		}
		if why := normaTaskDirExecWrite(fi.Mode().Perm(), st.Uid, st.Gid, execUID, execGID); why != "" {
			failures = append(failures, fmt.Sprintf("an agent process can change the skill entry %s, bypassing the skill approval: %s", path, why))
		}
		if len(failures) >= skillTreeMaxFailures {
			return fs.SkipAll
		}
		return nil
	})
	return failures
}

// fileToolIsolationFailures opens each existing secret through the file tool
// identity (agent/filetools_identity.go): the open must be refused.
func fileToolIsolationFailures(secrets []string) []string {
	if !agent.FileToolIdentitySupported() {
		return []string{"the agent's file tools run with the server's identity on this platform"}
	}
	var failures []string
	for _, path := range secrets {
		if _, err := os.Stat(path); err != nil {
			continue
		}
		var openErr error
		if err := agent.RunAsFileToolIdentity(func() {
			f, err := os.Open(path)
			if err == nil {
				f.Close()
			}
			openErr = err
		}); err != nil {
			failures = append(failures, fmt.Sprintf("the file tool identity cannot be applied: %v", err))
			break
		}
		if openErr == nil {
			failures = append(failures, fmt.Sprintf("the file tools can read %s", path))
		}
	}
	return failures
}

// runIsolationProbe starts the probe the way the agent's Bash starts: "bash" looked
// up on PATH, where InstallBashShim put the shim that drops to the executor. bash
// then execs this binary as the probe, which gets the spec on stdin.
func runIsolationProbe(spec isolationProbeSpec) (isolationProbeReport, error) {
	var rep isolationProbeReport
	self, err := os.Executable()
	if err != nil {
		return rep, err
	}
	in, err := json.Marshal(spec)
	if err != nil {
		return rep, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), isolationProbeTimeout)
	defer cancel()
	c := exec.CommandContext(ctx, "bash", "-c", `exec "$0" `+isolationProbeArg, self)
	c.Dir = "/"
	c.Stdin = bytes.NewReader(in)
	var stderr bytes.Buffer
	c.Stderr = &stderr
	out, err := c.Output()
	if err != nil {
		return rep, fmt.Errorf("%v: %s", err, strings.TrimSpace(stderr.String()))
	}
	if err := json.Unmarshal(out, &rep); err != nil {
		return rep, fmt.Errorf("unreadable probe report %q: %v", out, err)
	}
	return rep, nil
}

// runIsolationProbeMain is the probe process: it reads the spec, checks, writes
// the report and exits.
func runIsolationProbeMain() {
	var spec isolationProbeSpec
	rep := isolationProbeReport{Failures: []string{}}
	if err := json.NewDecoder(os.Stdin).Decode(&spec); err != nil {
		rep.Failures = append(rep.Failures, fmt.Sprintf("probe: bad spec: %v", err))
	} else {
		rep.Failures = append(rep.Failures, checkIsolationAsExecutor(spec)...)
	}
	_ = json.NewEncoder(os.Stdout).Encode(rep)
	os.Exit(0)
}

// bashOwnEnv are the variables bash itself exports to the programs it starts.
var bashOwnEnv = nameSet("PWD", "OLDPWD", "SHLVL", "_")

// checkIsolationAsExecutor runs the checks of spec in the calling process and
// returns what failed.
func checkIsolationAsExecutor(spec isolationProbeSpec) []string {
	var failures []string
	fail := func(format string, args ...any) { failures = append(failures, fmt.Sprintf(format, args...)) }

	if uid, euid := os.Getuid(), os.Geteuid(); uid != int(spec.UID) || euid != int(spec.UID) {
		fail("Bash runs as uid %d (effective %d), not the executor uid %d", uid, euid, spec.UID)
	}
	if gid := os.Getgid(); gid != int(spec.GID) {
		fail("Bash runs as gid %d, not the executor gid %d", gid, spec.GID)
	}
	if groups, err := os.Getgroups(); err != nil || len(groups) != 1 || groups[0] != int(spec.GID) {
		fail("Bash has the supplementary groups %v, want only the executor gid %d", groups, spec.GID)
	}
	for _, path := range spec.Unreadable {
		if f, err := os.Open(path); err == nil {
			f.Close()
			fail("Bash can read %s", path)
		}
	}
	if spec.ServerPID > 0 {
		if _, err := os.Stat("/proc/self"); err == nil {
			for _, name := range []string{"environ", "mem"} {
				path := "/proc/" + strconv.Itoa(spec.ServerPID) + "/" + name
				if f, err := os.Open(path); err == nil {
					f.Close()
					fail("Bash can read the server's %s", path)
				}
			}
		}
	}
	for _, dir := range spec.Unwritable {
		if f, err := os.CreateTemp(dir, ".artex-isolation-probe-*"); err == nil {
			name := f.Name()
			f.Close()
			os.Remove(name)
			fail("Bash can create files in %s", dir)
		}
	}
	for _, kv := range os.Environ() {
		name, _, _ := strings.Cut(kv, "=")
		if !executorEnvAllowed(name) && !bashOwnEnv[name] {
			fail("the variable %s reached Bash: it is not on the agent environment allowlist", name)
		}
	}
	for i := range spec.DB {
		db := &spec.DB[i]
		if err := connectWithoutPassword(db); err == nil {
			fail("Bash opened a database session as %q on %s:%d without the server's password", db.User, db.Host, db.Port)
		}
	}
	return failures
}

// connectWithoutPassword tries a session on the server's database with its user
// and no password. nil means the database let the executor in.
// The default sslmode (prefer) is kept: TLS first, then plain, as a client in the
// agent's shell would try.
func connectWithoutPassword(db *isolationProbeDB) error {
	quote := strings.NewReplacer(`\`, `\\`, `'`, `\'`).Replace
	dsn := fmt.Sprintf("host='%s' port=%d user='%s' dbname='%s' connect_timeout=5",
		quote(db.Host), db.Port, quote(db.User), quote(db.Database))
	cfg, err := pgx.ParseConfig(dsn)
	if err != nil {
		return err
	}
	cfg.Password = "" // not even one from a password file in the executor's home
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	conn, err := pgx.ConnectConfig(ctx, cfg)
	if err != nil {
		return err
	}
	conn.Close(context.Background())
	return nil
}
