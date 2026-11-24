package agent

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"

	actool "github.com/Autumn-27/norma/tool"
)

const confinedSecret = "TOPSECRET-confined-tools"

type confinedFixture struct {
	base, work, secret string
	tools              map[string]actool.CoreTool
	tc                 *actool.ToolContext
}

// newConfinedFixture lays out a data directory like the server's: the run's
// working directory under sessions/, and a key file outside it, plus symlinks in
// the working directory that lead to the key (absolute, relative, through a dir).
func newConfinedFixture(t *testing.T) *confinedFixture {
	t.Helper()
	base := t.TempDir()
	work := filepath.Join(base, "sessions", "s1")
	keys := filepath.Join(base, "keys")
	for _, d := range []string{work, keys} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	secret := filepath.Join(keys, "jwt.key")
	if err := os.WriteFile(secret, []byte(confinedSecret+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(work, "in.txt"), []byte("hello\nworld\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	links := map[string]string{
		"lnabs": secret,
		"lnrel": filepath.Join("..", "..", "keys", "jwt.key"),
		"lndir": filepath.Join("..", "..", "keys"),
		"lnin":  "in.txt",
	}
	for name, target := range links {
		if err := os.Symlink(target, filepath.Join(work, name)); err != nil {
			if runtime.GOOS == "windows" {
				t.Skipf("symlinks unavailable: %v", err)
			}
			t.Fatal(err)
		}
	}
	tools := map[string]actool.CoreTool{}
	for _, tl := range defaultTools(base) {
		tools[tl.Name()] = tl
	}
	return &confinedFixture{base: base, work: work, secret: secret, tools: tools, tc: &actool.ToolContext{WorkingDir: work}}
}

func (f *confinedFixture) call(t *testing.T, tool string, in map[string]any) actool.Result {
	t.Helper()
	raw, _ := json.Marshal(in)
	res, err := f.tools[tool].Call(context.Background(), raw, f.tc)
	if err != nil {
		t.Fatalf("%s(%s): %v", tool, raw, err)
	}
	return res
}

func (f *confinedFixture) secretUnchanged(t *testing.T) {
	t.Helper()
	b, err := os.ReadFile(f.secret)
	if err != nil || string(b) != confinedSecret+"\n" {
		t.Fatalf("key file changed: %q %v", b, err)
	}
	if _, err := os.Stat(filepath.Join(filepath.Dir(f.secret), "new.txt")); err == nil {
		t.Fatal("a file was created next to the key")
	}
}

// outsidePaths reach the key file or another file outside the working directory.
func (f *confinedFixture) outsidePaths() []string {
	sep := string(filepath.Separator)
	return []string{
		f.secret,
		filepath.Join("..", "..", "keys", "jwt.key"),
		f.work + sep + ".." + sep + ".." + sep + "keys" + sep + "jwt.key", // unclean on purpose
		"lnabs",
		"lnrel",
		filepath.Join("lndir", "jwt.key"),
		"/proc/self/environ",
		"/etc/passwd",
	}
}

func refused(res actool.Result) bool { return res.IsError }

// checkRefusals runs every confined tool against every outside path. Nothing may
// succeed, nothing may print the key, and the key must stay unchanged.
func checkRefusals(t *testing.T, f *confinedFixture) {
	t.Helper()
	for _, p := range f.outsidePaths() {
		cases := []struct {
			tool string
			in   map[string]any
		}{
			{"Read", map[string]any{"file_path": p}},
			{"Write", map[string]any{"file_path": p, "content": "pwned"}},
			{"Edit", map[string]any{"file_path": p, "old_string": confinedSecret, "new_string": "pwned"}},
			{"MultiEdit", map[string]any{"file_path": p, "edits": []any{map[string]any{"old_string": confinedSecret, "new_string": "pwned"}}}},
			{"LS", map[string]any{"path": filepath.Dir(p)}},
			{"Glob", map[string]any{"pattern": "*", "path": filepath.Dir(p)}},
			{"Grep", map[string]any{"pattern": "TOPSECRET", "path": p, "output_mode": "content"}},
			{"Grep", map[string]any{"pattern": "TOPSECRET", "path": filepath.Dir(p), "output_mode": "content"}},
		}
		for _, c := range cases {
			res := f.call(t, c.tool, c.in)
			out := res.Flatten()
			if strings.Contains(out, confinedSecret) {
				t.Errorf("%s %v leaked the key: %s", c.tool, c.in, out)
			}
			// Listing or searching "." (the working directory, the parent of the links)
			// is allowed, and Glob skips a symlinked directory without an error;
			// everything else must fail.
			dir, _ := c.in["path"].(string)
			mayPass := dir == "." && (c.tool == "LS" || c.tool == "Glob" || c.tool == "Grep") ||
				dir == "lndir" && c.tool == "Glob"
			if !refused(res) && !mayPass {
				t.Errorf("%s %v was not refused: %s", c.tool, c.in, out)
			}
		}
		f.secretUnchanged(t)
	}
	// Searching the working directory itself must not follow the links out of it.
	for _, in := range []map[string]any{
		{"pattern": "TOPSECRET", "output_mode": "content"},
		{"pattern": "TOPSECRET", "path": "lndir", "output_mode": "content"},
	} {
		if out := f.call(t, "Grep", in).Flatten(); strings.Contains(out, confinedSecret) {
			t.Errorf("Grep %v leaked the key: %s", in, out)
		}
	}
	if res := f.call(t, "LS", map[string]any{"path": "lndir"}); !refused(res) || strings.Contains(res.Flatten(), "jwt.key") {
		t.Errorf("LS through a symlinked directory was not refused: %s", res.Flatten())
	}
	if res := f.call(t, "Glob", map[string]any{"pattern": "*", "path": "lndir"}); strings.Contains(res.Flatten(), "jwt.key") {
		t.Errorf("Glob through a symlinked directory listed the key: %s", res.Flatten())
	}
}

// The refusal does not depend on privilege: the test user can read the key file
// itself, and the tools still refuse every path that leads to it.
func TestConfinedFileToolsRefuseOutsidePaths(t *testing.T) {
	f := newConfinedFixture(t)
	if _, err := os.ReadFile(f.secret); err != nil {
		t.Fatalf("the process must be able to read the key itself: %v", err)
	}
	checkRefusals(t, f)
}

// As root the server can read any file; the tools must still refuse a root-only file
// outside the working directory and the server's own environment.
func TestConfinedFileToolsAsRoot(t *testing.T) {
	if runtime.GOOS == "windows" || os.Geteuid() != 0 {
		t.Skip("needs root")
	}
	f := newConfinedFixture(t)
	if fi, err := os.Stat(f.secret); err != nil || fi.Mode().Perm() != 0o600 {
		t.Fatalf("key file must be 0600: %v %v", fi, err)
	}
	if _, err := os.ReadFile("/proc/1/environ"); err != nil {
		t.Fatalf("root must be able to read /proc/1/environ itself: %v", err)
	}
	checkRefusals(t, f)
	for _, p := range []string{"/proc/1/environ", "/proc/self/root/etc/shadow"} {
		if res := f.call(t, "Read", map[string]any{"file_path": p}); !refused(res) {
			t.Errorf("Read %s was not refused: %s", p, res.Flatten())
		}
	}
}

func TestConfinedFileToolsWorkInside(t *testing.T) {
	f := newConfinedFixture(t)
	ok := func(tool string, in map[string]any, want string) {
		t.Helper()
		res := f.call(t, tool, in)
		if res.IsError || !strings.Contains(res.Flatten(), want) {
			t.Fatalf("%s %v = %q (error %v), want %q", tool, in, res.Flatten(), res.IsError, want)
		}
	}
	ok("Read", map[string]any{"file_path": "in.txt"}, "     2\tworld")
	ok("Read", map[string]any{"file_path": filepath.Join(f.work, "in.txt")}, "hello")
	ok("Read", map[string]any{"file_path": "lnin"}, "hello") // a symlink that stays inside
	ok("Write", map[string]any{"file_path": "sub/dir/new.txt", "content": "alpha beta\n"}, "Created")
	ok("Write", map[string]any{"file_path": filepath.Join(f.work, "sub", "dir", "new.txt"), "content": "alpha beta\n"}, "Overwrote")
	ok("Edit", map[string]any{"file_path": "sub/dir/new.txt", "old_string": "alpha", "new_string": "gamma"}, "1 replacement")
	ok("MultiEdit", map[string]any{"file_path": "sub/dir/new.txt", "edits": []any{
		map[string]any{"old_string": "gamma", "new_string": "delta"},
		map[string]any{"old_string": "beta", "new_string": "epsilon"},
	}}, "Applied 2 edits")
	ok("Read", map[string]any{"file_path": "sub/dir/new.txt"}, "delta epsilon")
	ok("LS", map[string]any{}, "in.txt")
	ok("LS", map[string]any{"path": "sub"}, "dir/")
	ok("Glob", map[string]any{"pattern": "**/*.txt"}, filepath.Join(f.work, "sub", "dir", "new.txt"))
	ok("Grep", map[string]any{"pattern": "wor.d", "output_mode": "content"}, "in.txt:2:world")
	ok("Grep", map[string]any{"pattern": "epsilon", "path": "sub"}, filepath.Join("dir", "new.txt"))
	ok("Grep", map[string]any{"pattern": "hello", "path": "in.txt", "output_mode": "count"}, "in.txt: 1")
}

// A hard link in the working directory to a file outside it is a second name for
// that file: reading or writing through it is refused.
func TestConfinedFileToolsRefuseHardLinks(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("link counts are unix-only")
	}
	f := newConfinedFixture(t)
	if err := os.Link(f.secret, filepath.Join(f.work, "hl")); err != nil {
		t.Skipf("cannot create a hard link here: %v", err)
	}
	for _, c := range []struct {
		tool string
		in   map[string]any
	}{
		{"Read", map[string]any{"file_path": "hl"}},
		{"Write", map[string]any{"file_path": "hl", "content": "pwned"}},
		{"Edit", map[string]any{"file_path": "hl", "old_string": confinedSecret, "new_string": "pwned"}},
	} {
		res := f.call(t, c.tool, c.in)
		if !res.IsError || strings.Contains(res.Flatten(), confinedSecret) {
			t.Errorf("%s through a hard link was not refused: %s", c.tool, res.Flatten())
		}
	}
	if out := f.call(t, "Grep", map[string]any{"pattern": "TOPSECRET", "output_mode": "content"}).Flatten(); strings.Contains(out, confinedSecret) {
		t.Errorf("Grep read the key through a hard link: %s", out)
	}
	f.secretUnchanged(t)
}

// The agent's shell can replace its own run directory with a symlink. The root is
// opened component by component, so the swapped directory cannot lead to / or to
// the rest of the data directory.
func TestConfinedFileToolsRunDirSymlinkSwap(t *testing.T) {
	for _, target := range []string{"/", filepath.Join("..", "keys"), filepath.Join("..", "..", "keys")} {
		f := newConfinedFixture(t)
		if err := os.RemoveAll(f.work); err != nil {
			t.Fatal(err)
		}
		if err := os.Symlink(target, f.work); err != nil {
			t.Fatal(err)
		}
		for _, c := range []struct {
			tool string
			in   map[string]any
		}{
			{"Read", map[string]any{"file_path": "jwt.key"}},
			{"Read", map[string]any{"file_path": "keys/jwt.key"}},
			{"Read", map[string]any{"file_path": "etc/passwd"}},
			{"LS", map[string]any{}},
			{"Write", map[string]any{"file_path": "new.txt", "content": "pwned"}},
		} {
			res := f.call(t, c.tool, c.in)
			if !res.IsError || strings.Contains(res.Flatten(), confinedSecret) || strings.Contains(res.Flatten(), "jwt.key") {
				t.Errorf("run dir -> %s: %s %v was not refused: %s", target, c.tool, c.in, res.Flatten())
			}
		}
		f.secretUnchanged(t)
	}
}

// A relative symlink that stays inside the data directory is still a symlink in the
// run directory path: os.Root would follow it, so the run directory is refused
// instead. Here it points at a root-only file's directory (the MITM CA's).
func TestConfinedFileToolsRunDirRelativeSymlinkInside(t *testing.T) {
	f := newConfinedFixture(t)
	ca := filepath.Join(f.base, "traffic", "_ca")
	if err := os.MkdirAll(ca, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(ca, "mitmproxy-ca.pem"), []byte(confinedSecret+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.RemoveAll(f.work); err != nil {
		t.Fatal(err)
	}
	// The link sits in sessions/, so ../traffic/_ca is <base>/traffic/_ca: the in-base CA case.
	if err := os.Symlink(filepath.Join("..", "traffic", "_ca"), f.work); err != nil {
		t.Fatal(err)
	}
	for _, c := range []struct {
		tool string
		in   map[string]any
	}{
		{"Read", map[string]any{"file_path": "mitmproxy-ca.pem"}},
		{"Read", map[string]any{"file_path": "in.txt"}},
		{"LS", map[string]any{}},
	} {
		res := f.call(t, c.tool, c.in)
		if !res.IsError || strings.Contains(res.Flatten(), confinedSecret) {
			t.Errorf("relative run dir symlink: %s %v was not refused: %s", c.tool, c.in, res.Flatten())
		}
	}
	f.secretUnchanged(t)
}

// Missing or misplaced working directories fail closed.
func TestConfinedFileToolsNeedWorkDirUnderBase(t *testing.T) {
	f := newConfinedFixture(t)
	for _, dir := range []string{"", f.base, filepath.Dir(f.base)} {
		f.tc = &actool.ToolContext{WorkingDir: dir}
		if res := f.call(t, "Read", map[string]any{"file_path": f.secret}); !res.IsError {
			t.Errorf("working dir %q: Read was not refused: %s", dir, res.Flatten())
		}
	}
}

// The model sees the SDK tools unchanged: same names, descriptions, prompts, schemas
// and read-only flags.
func TestConfinedFileToolsKeepSDKContract(t *testing.T) {
	sdk := map[string]actool.CoreTool{}
	for _, tl := range actool.DefaultTools() {
		sdk[tl.Name()] = tl
	}
	got := defaultTools(t.TempDir())
	if len(got) != len(sdk) {
		t.Fatalf("defaultTools has %d tools, the SDK %d", len(got), len(sdk))
	}
	for _, tl := range got {
		want := sdk[tl.Name()]
		if want == nil {
			t.Fatalf("unexpected tool %s", tl.Name())
		}
		_, confined := tl.(*confinedFileTool)
		if _, replace := confinedFileToolNames[tl.Name()]; replace != confined {
			t.Errorf("%s: confined=%v, want %v", tl.Name(), confined, replace)
		}
		if tl.Description() != want.Description() || tl.Prompt() != want.Prompt() ||
			!reflect.DeepEqual(tl.InputSchema(), want.InputSchema()) ||
			tl.IsReadOnly(json.RawMessage(`{}`)) != want.IsReadOnly(json.RawMessage(`{}`)) {
			t.Errorf("%s: metadata differs from the SDK tool", tl.Name())
		}
	}
}
