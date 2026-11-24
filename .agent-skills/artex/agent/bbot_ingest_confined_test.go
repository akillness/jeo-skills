package agent

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/Autumn-27/artex/db"
	actool "github.com/Autumn-27/norma/tool"
)

const bbotConfinedSecret = "TOPSECRET-bbot-ingest"

type bbotConfinedFixture struct {
	base, runDir, secret string
}

// newBbotConfinedFixture lays out a data directory like the server's: a worker run
// directory under tasks/, and a key file outside it (the server reads it as root).
func newBbotConfinedFixture(t *testing.T) *bbotConfinedFixture {
	t.Helper()
	base := t.TempDir()
	runDir := filepath.Join(base, "tasks", "1", "i7")
	keys := filepath.Join(base, "keys")
	for _, d := range []string{runDir, keys} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	// One line of bbot JSON, so a read that got through would count an event.
	secret := filepath.Join(keys, "jwt.key")
	line := `{"type":"FINDING","host":"` + bbotConfinedSecret + `","scope_distance":0}` + "\n"
	if err := os.WriteFile(secret, []byte(line), 0o600); err != nil {
		t.Fatal(err)
	}
	return &bbotConfinedFixture{base: base, runDir: runDir, secret: secret}
}

func (f *bbotConfinedFixture) symlink(t *testing.T, target, name string) {
	t.Helper()
	if err := os.Symlink(target, filepath.Join(f.runDir, name)); err != nil {
		if runtime.GOOS == "windows" {
			t.Skipf("symlinks unavailable: %v", err)
		}
		t.Fatal(err)
	}
}

// outsidePaths name the key file from the run directory: by absolute path, by
// "..", through symlinks placed in the run directory, and through a hard link.
func (f *bbotConfinedFixture) outsidePaths(t *testing.T) []string {
	t.Helper()
	f.symlink(t, f.secret, "lnabs")
	f.symlink(t, filepath.Join("..", "..", "..", "keys", "jwt.key"), "lnrel")
	f.symlink(t, filepath.Join("..", "..", "..", "keys"), "lndir")
	paths := []string{
		f.secret,
		filepath.Join("..", "..", "..", "keys", "jwt.key"),
		filepath.Join(f.runDir, "..", "..", "..", "keys", "jwt.key"),
		"lnabs",
		filepath.Join(f.runDir, "lnabs"),
		"lnrel",
		filepath.Join("lndir", "jwt.key"),
	}
	if runtime.GOOS != "windows" {
		if err := os.Link(f.secret, filepath.Join(f.runDir, "hard")); err != nil {
			t.Fatal(err)
		}
		paths = append(paths, "hard", "/etc/passwd", "/proc/self/environ")
	}
	return paths
}

// The path gate alone: every path that leads out of the run directory is refused,
// and so is every path when the base or the working directory is missing or wrong.
func TestOpenBbotOutputConfined(t *testing.T) {
	f := newBbotConfinedFixture(t)
	for _, p := range f.outsidePaths(t) {
		if file, err := openBbotOutput(f.base, f.runDir, p); err == nil {
			file.Close()
			t.Errorf("openBbotOutput(%q) opened a file outside the run directory", p)
		}
	}

	inside := filepath.Join(f.runDir, "output.json")
	if err := os.WriteFile(inside, []byte(bbotToolFixture), 0o644); err != nil {
		t.Fatal(err)
	}
	f.symlink(t, "output.json", "lnin")
	if file, err := openBbotOutput(f.base, f.runDir, "lnin"); err == nil {
		file.Close()
		t.Error("a symlink inside the run directory was opened")
	}
	if file, err := openBbotOutput(f.base, f.runDir, "."); err == nil {
		file.Close()
		t.Error("the run directory itself was opened")
	}
	for name, c := range map[string][2]string{
		"no base":                 {"", f.runDir},
		"no working directory":    {f.base, ""},
		"base as working dir":     {f.base, f.base},
		"working dir not in base": {filepath.Join(f.base, "tasks"), filepath.Join(f.base, "keys")},
	} {
		if file, err := openBbotOutput(c[0], c[1], "output.json"); err == nil {
			file.Close()
			t.Errorf("%s: openBbotOutput(%q, %q) opened a file", name, c[0], c[1])
		}
	}

	// A run directory reached by a symlink is refused, as for the file tools.
	f.symlink(t, filepath.Join(f.base, "keys"), filepath.Join("..", "i8"))
	if file, err := openBbotOutput(f.base, filepath.Join(f.base, "tasks", "1", "i8"), "jwt.key"); err == nil {
		file.Close()
		t.Error("a run directory that is a symlink was opened")
	}

	// A benign file in the run directory is still read and parsed, by relative and
	// by absolute path.
	for _, p := range []string{"output.json", inside} {
		file, err := openBbotOutput(f.base, f.runDir, p)
		if err != nil {
			t.Fatalf("openBbotOutput(%q): %v", p, err)
		}
		res, oversized, err := readBbotJSONL(file)
		file.Close()
		if err != nil {
			t.Fatalf("read %q: %v", p, err)
		}
		if len(res.assetItems()) != 1 || len(res.InScope) != 2 || len(res.Intel) != 3 || res.Skipped != 1 || oversized != 0 {
			t.Fatalf("%q: %d assets, %d in scope, %d intel, %d skipped, %d oversized; want 1, 2, 3, 1, 0",
				p, len(res.assetItems()), len(res.InScope), len(res.Intel), res.Skipped, oversized)
		}
	}
}

// The tool itself, without Postgres: a refused path returns before a store is
// used, and the stores here are empty shells that cannot answer a query. An
// in-scope event that is not an asset writes nothing, so a file inside the run
// directory goes through the whole handler.
func TestIngestBbotToolConfined(t *testing.T) {
	f := newBbotConfinedFixture(t)
	tsx := NewToolSet(&db.ExplorationStore{}, "worker-1")
	tsx.SetAssetStore(&db.AssetStore{}, nil)
	tsx.SetWorkBase(f.base)
	tool := tsx.ingestBbot()
	call := func(tc *actool.ToolContext, path string) actool.Result {
		t.Helper()
		in, _ := json.Marshal(map[string]string{"path": path})
		res, err := tool.Call(context.Background(), in, tc)
		if err != nil {
			t.Fatalf("ingest_bbot(%q): %v", path, err)
		}
		return res
	}
	tc := &actool.ToolContext{WorkingDir: f.runDir}

	for _, p := range f.outsidePaths(t) {
		res := call(tc, p)
		if !res.IsError || !strings.HasPrefix(res.Flatten(), "open: ") {
			t.Errorf("ingest_bbot(%q) = %q, want an open error", p, res.Flatten())
		}
		if strings.Contains(res.Flatten(), bbotConfinedSecret) {
			t.Errorf("ingest_bbot(%q) returned the key file content: %q", p, res.Flatten())
		}
	}

	inside := filepath.Join(f.runDir, "output.json")
	if err := os.WriteFile(inside, []byte(`{"type":"FINDING","host":"in.example.com","scope_distance":0}`+"\nnot json\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	// No working directory (a nil ToolContext) and no base both fail closed.
	if res := call(nil, inside); !res.IsError || !strings.HasPrefix(res.Flatten(), "open: ") {
		t.Errorf("without a working directory: %q, want an open error", res.Flatten())
	}
	noBase := NewToolSet(&db.ExplorationStore{}, "worker-1")
	noBase.SetAssetStore(&db.AssetStore{}, nil)
	in, _ := json.Marshal(map[string]string{"path": inside})
	if res, err := noBase.ingestBbot().Call(context.Background(), in, tc); err != nil || !res.IsError || !strings.HasPrefix(res.Flatten(), "open: ") {
		t.Errorf("without a base: %q %v, want an open error", res.Flatten(), err)
	}

	for _, p := range []string{"output.json", inside} {
		res := call(tc, p)
		if res.IsError {
			t.Fatalf("ingest_bbot(%q): %s", p, res.Flatten())
		}
		var out struct {
			InScopeNotAsset int `json:"in_scope_not_asset"`
			SkippedLines    int `json:"skipped_lines"`
			IntelFacts      int `json:"intel_facts"`
		}
		if err := json.Unmarshal([]byte(res.Flatten()), &out); err != nil {
			t.Fatalf("result %q: %v", res.Flatten(), err)
		}
		if out.InScopeNotAsset != 1 || out.SkippedLines != 1 || out.IntelFacts != 0 {
			t.Fatalf("ingest_bbot(%q) = %s; want 1 in-scope non-asset, 1 skipped line", p, res.Flatten())
		}
	}
}
