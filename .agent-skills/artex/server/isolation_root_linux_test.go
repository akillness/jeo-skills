//go:build linux

package server

import (
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
)

// isolationRootFixture is newExecRootFixture with the Bash shim installed, a key
// directory like /app/keys (0700, jwt.key and secret.key 0600) and a 0600 config.
type isolationRootFixture struct {
	*execRootFixture
	keyDir, config string
}

func newIsolationRootFixture(t *testing.T) *isolationRootFixture {
	t.Helper()
	f := newExecRootFixture(t) // skips without root
	if err := InstallBashShim(f.priv); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(filepath.SplitList(os.Getenv("PATH"))[0]) })
	keyDir := filepath.Join(f.data, "..", filepath.Base(f.data)+"-keys")
	if err := os.Mkdir(keyDir, 0o700); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(keyDir) })
	for _, name := range []string{"jwt.key", "secret.key"} {
		if err := os.WriteFile(filepath.Join(keyDir, name), []byte("key-"+name), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	// The config file lives in a root-only directory too (/app in the image).
	config := filepath.Join(keyDir, "config.json")
	if err := os.WriteFile(config, []byte(`{"database":{"dsn":"postgres://u:pw@h/db"}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	return &isolationRootFixture{execRootFixture: f, keyDir: keyDir, config: config}
}

func (f *isolationRootFixture) targets() IsolationTargets {
	return IsolationTargets{DataDir: f.data, KeyDir: f.keyDir, ConfigPath: f.config, DSN: os.Getenv("ARTEX_PG_DSN")}
}

// The deployment the self-test is for: root server, executor drop, shim, root-only
// keys and config. It passes, through the real Bash shim, and with ARTEX_PG_DSN set
// it also finds that the executor cannot open a session on that database without
// the password (PostgreSQL asks for one on TCP).
func TestIsolationSelfTestPassesAsRoot(t *testing.T) {
	f := newIsolationRootFixture(t)
	if os.Getenv("ARTEX_PG_DSN") == "" {
		t.Log("ARTEX_PG_DSN unset: the database check is not exercised")
	}
	if err := IsolationSelfTest(f.priv, f.targets()); err != nil {
		t.Fatalf("self-test on an isolated setup: %v", err)
	}
}

// A secret the executor can read fails the self-test, for the Bash path and the
// file tool path both.
func TestIsolationSelfTestDetectsReadableSecretAsRoot(t *testing.T) {
	f := newIsolationRootFixture(t)
	key := filepath.Join(f.keyDir, "jwt.key")
	if err := os.Chmod(f.keyDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(key, 0o644); err != nil {
		t.Fatal(err)
	}
	err := IsolationSelfTest(f.priv, f.targets())
	if err == nil || !strings.Contains(err.Error(), "Bash can read "+key) || !strings.Contains(err.Error(), "the file tools can read "+key) {
		t.Fatalf("self-test with a world-readable key: %v", err)
	}
}

// Without the shim on PATH, "bash" is the real bash and runs as root: the self-test
// sees it.
func TestIsolationSelfTestDetectsMissingShimAsRoot(t *testing.T) {
	f := newExecRootFixture(t)
	err := IsolationSelfTest(f.priv, IsolationTargets{DataDir: f.data})
	if err == nil || !strings.Contains(err.Error(), "Bash runs as uid 0") {
		t.Fatalf("self-test without the Bash shim: %v", err)
	}
}

// A key file and a config file owned by the executor uid stay readable by it after a
// chmod 0600: PrepareExecPrivilege makes root their owner, and the executor can then
// read neither (the self-test passes, and a direct read as the executor is denied).
func TestPrepareExecPrivilegeOwnsKeysAndConfigAsRoot(t *testing.T) {
	f := newExecRootFixture(t)
	keyDir := filepath.Join(f.tmp, "keys")
	if err := os.Mkdir(keyDir, 0o755); err != nil {
		t.Fatal(err)
	}
	key, config := filepath.Join(keyDir, "jwt.key"), filepath.Join(keyDir, "config.json")
	for _, p := range []string{key, config} {
		if err := os.WriteFile(p, []byte("secret-"+filepath.Base(p)), 0o644); err != nil {
			t.Fatal(err)
		}
		if err := os.Chown(p, DefaultExecUID, DefaultExecGID); err != nil {
			t.Fatal(err)
		}
	}
	if err := PrepareExecPrivilege(&f.priv, f.data, keyDir, config); err != nil {
		t.Fatal(err)
	}
	for _, p := range []string{key, config} {
		fi, err := os.Stat(p)
		if err != nil {
			t.Fatal(err)
		}
		if st := fi.Sys().(*syscall.Stat_t); st.Uid != 0 || fi.Mode().Perm() != 0o600 {
			t.Errorf("%s: uid %d mode %v, want root 0600", p, st.Uid, fi.Mode().Perm())
		}
	}
	c := exec.Command("sh", "-c", `for f in "$@"; do if cat "$f" >/dev/null 2>&1; then echo "read $f"; fi; done; echo done`, "sh", key, config)
	applyExecCredential(c, f.priv)
	out, err := c.CombinedOutput()
	if err != nil || string(out) != "done\n" {
		t.Fatalf("executor read of the key and config: %v\n%s", err, out)
	}
	if err := InstallBashShim(f.priv); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(filepath.SplitList(os.Getenv("PATH"))[0]) })
	if err := IsolationSelfTest(f.priv, IsolationTargets{DataDir: f.data, KeyDir: keyDir, ConfigPath: config}); err != nil {
		t.Fatalf("self-test after PrepareExecPrivilege: %v", err)
	}
}

// A data, key or config directory the executor can write fails the self-test: an
// agent process could plant a key, a config or a data tree for the next start.
func TestIsolationSelfTestDetectsWritableDirsAsRoot(t *testing.T) {
	f := newIsolationRootFixture(t)
	if err := os.Chmod(f.data, 0o777); err != nil {
		t.Fatal(err)
	}
	err := IsolationSelfTest(f.priv, f.targets())
	if err == nil || !strings.Contains(err.Error(), "Bash can create files in "+f.data) {
		t.Fatalf("self-test with a world-writable data directory: %v", err)
	}
	if err := os.Chmod(f.data, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Chown(f.keyDir, DefaultExecUID, 0); err != nil {
		t.Fatal(err)
	}
	err = IsolationSelfTest(f.priv, f.targets())
	if err == nil || !strings.Contains(err.Error(), "Bash can create files in "+f.keyDir) {
		t.Fatalf("self-test with a key directory owned by the executor: %v", err)
	}
	if entries, _ := os.ReadDir(f.keyDir); len(entries) != 3 {
		t.Fatalf("the probe left an entry in the key directory: %v", entries)
	}
}

// A data directory whose parent the executor can write (not sticky) can be renamed
// and replaced: the self-test reports it.
func TestIsolationSelfTestDetectsReplaceableParentAsRoot(t *testing.T) {
	f := newIsolationRootFixture(t)
	open := filepath.Join(f.tmp, "open-parent")
	if err := os.Mkdir(open, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(open, 0o777); err != nil {
		t.Fatal(err)
	}
	data := filepath.Join(open, "data")
	if err := os.Mkdir(data, 0o755); err != nil {
		t.Fatal(err)
	}
	tg := f.targets()
	tg.DataDir = data
	err := IsolationSelfTest(f.priv, tg)
	if err == nil || !strings.Contains(err.Error(), "an agent process can replace "+data) {
		t.Fatalf("self-test with a replaceable data directory: %v", err)
	}
}

// A skill tree an agent process can write fails the self-test: a skill written there
// directly would skip the approval of create_skill and update_skill_file. A tree
// only root can write passes.
func TestIsolationSelfTestDetectsWritableSkillsAsRoot(t *testing.T) {
	f := newIsolationRootFixture(t)
	skills := filepath.Join(f.tmp, "skills")
	skill := filepath.Join(skills, "recon")
	if err := os.MkdirAll(skill, 0o755); err != nil {
		t.Fatal(err)
	}
	md := filepath.Join(skill, "SKILL.md")
	if err := os.WriteFile(md, []byte("---\nname: recon\n---\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	tg := f.targets()
	tg.SkillDir = skills
	if err := IsolationSelfTest(f.priv, tg); err != nil {
		t.Fatalf("self-test with a root-only skill tree: %v", err)
	}

	if err := os.Chown(md, DefaultExecUID, DefaultExecGID); err != nil {
		t.Fatal(err)
	}
	err := IsolationSelfTest(f.priv, tg)
	if err == nil || !strings.Contains(err.Error(), "can change the skill entry "+md) {
		t.Fatalf("self-test with a skill file owned by the executor: %v", err)
	}
	if err := os.Chown(md, 0, 0); err != nil {
		t.Fatal(err)
	}

	if err := os.Chmod(skills, 0o777); err != nil {
		t.Fatal(err)
	}
	err = IsolationSelfTest(f.priv, tg)
	if err == nil || !strings.Contains(err.Error(), "Bash can create files in "+skills) || !strings.Contains(err.Error(), "can change the skill entry "+skills) {
		t.Fatalf("self-test with a world-writable skill directory: %v", err)
	}
	if entries, _ := os.ReadDir(skills); len(entries) != 1 {
		t.Fatalf("the probe left an entry in the skill directory: %v", entries)
	}
}

// A database that lets the server's user in without a password fails the self-test:
// the probe, as the executor, opens a session on it.
func TestIsolationSelfTestDetectsPasswordlessDatabaseAsRoot(t *testing.T) {
	f := newIsolationRootFixture(t)
	host, port := fakeTrustPG(t)
	tg := f.targets()
	tg.DSN = "postgres://artex:server-password@" + host + ":" + strconv.Itoa(int(port)) + "/artex"
	err := IsolationSelfTest(f.priv, tg)
	if err == nil || !strings.Contains(err.Error(), `database session as "artex"`) {
		t.Fatalf("self-test against a passwordless database: %v", err)
	}
}
