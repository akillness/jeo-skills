package agent

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Autumn-27/norma/harness"
	"github.com/Autumn-27/norma/llm"
	actool "github.com/Autumn-27/norma/tool"
)

// countHooks counts the calls a spillHooks forwards.
type countHooks struct{ pre, post, stop int }

func (h *countHooks) PreToolUse(context.Context, string, []byte) (bool, string, []byte) {
	h.pre++
	return true, "blocked", nil
}
func (h *countHooks) PostToolUse(context.Context, string, []byte, []byte, bool) { h.post++ }
func (h *countHooks) Stop(context.Context, []llm.Message) (bool, []string, string) {
	h.stop++
	return true, nil, "stop"
}

// Without the privilege drop the spill stays in <run dir>/cmd-output and the hooks
// are not wrapped. With it, a task's agents share <base>/spill/tasks/<taskID> and a
// chat gets <base>/spill/sessions/<sessionID>: outside every run directory, created
// through the server's maker.
func TestToolOutputDir(t *testing.T) {
	base := t.TempDir()
	mainDir := filepath.Join(base, "tasks", "7", "main")
	worker := filepath.Join(base, "tasks", "7", "i12")
	session := filepath.Join(base, "sessions", "conv-3")

	if got, want := TaskToolOutputDir(base, 7, worker), filepath.Join(worker, "cmd-output"); got != want {
		t.Errorf("task ToolOutputDir without the drop = %s, want %s", got, want)
	}
	if got, want := SessionToolOutputDir(base, "conv-3", session), filepath.Join(session, "cmd-output"); got != want {
		t.Errorf("session ToolOutputDir without the drop = %s, want %s", got, want)
	}
	if entries, err := os.ReadDir(base); err != nil || len(entries) != 0 {
		t.Errorf("the data directory holds %v (%v), want nothing created", entries, err)
	}
	inner := &countHooks{}
	if got := SpillHooks(inner, filepath.Join(worker, "cmd-output")); got != harness.HookRunner(inner) {
		t.Errorf("hooks without the drop = %T, want them unchanged", got)
	}
	if got := SpillHooks(nil, filepath.Join(worker, "cmd-output")); got != nil {
		t.Errorf("nil hooks without the drop = %T, want nil", got)
	}

	var made, shared []string
	fail := false
	SetSpillDirMaker(func(b, dir string) error {
		if b != base {
			t.Errorf("maker base = %s, want %s", b, base)
		}
		if fail {
			return errors.New("refused")
		}
		made = append(made, dir)
		return nil
	}, func(dir string) error {
		shared = append(shared, dir)
		return nil
	})
	t.Cleanup(func() { SetSpillDirMaker(nil, nil) })

	task7 := filepath.Join(base, "spill", "tasks", "7")
	task8 := filepath.Join(base, "spill", "tasks", "8")
	conv3 := filepath.Join(base, "spill", "sessions", "conv-3")
	conv4 := filepath.Join(base, "spill", "sessions", "conv-4")
	got := []string{
		TaskToolOutputDir(base, 7, mainDir),
		TaskToolOutputDir(base, 7, worker),
		TaskToolOutputDir(base, 8, filepath.Join(base, "tasks", "8", "main")),
		SessionToolOutputDir(base, "conv-3", session),
		SessionToolOutputDir(base, "conv-4", filepath.Join(base, "sessions", "conv-4")),
	}
	want := []string{task7, task7, task8, conv3, conv4}
	if strings.Join(got, "|") != strings.Join(want, "|") {
		t.Errorf("ToolOutputDir with the drop = %v, want %v", got, want)
	}
	if strings.Join(made, "|") != strings.Join(want, "|") {
		t.Errorf("maker calls = %v, want %v", made, want)
	}
	if TaskSpillDir(base, "7") != task7 || SessionSpillDir(base, "conv-3") != conv3 {
		t.Errorf("spill directories: task %s, session %s", TaskSpillDir(base, "7"), SessionSpillDir(base, "conv-3"))
	}
	sep := string(filepath.Separator)
	for _, dir := range got {
		for _, runRoot := range []string{filepath.Join(base, "tasks"), filepath.Join(base, "sessions")} {
			if strings.HasPrefix(dir, runRoot+sep) {
				t.Errorf("spill directory %s is under %s", dir, runRoot)
			}
		}
	}
	// A spill directory that cannot be created is not replaced by the run directory.
	fail = true
	if got := TaskToolOutputDir(base, 9, filepath.Join(base, "tasks", "9", "main")); got != "" {
		t.Errorf("ToolOutputDir after a maker failure = %q, want none", got)
	}
	if got := SpillHooks(inner, ""); got != harness.HookRunner(inner) {
		t.Errorf("hooks of a run without a spill directory = %T, want them unchanged", got)
	}

	// The hooks share the spill files after a tool call whose result Capture spilled,
	// and forward every call. The marker is the one Norma writes.
	out := t.TempDir()
	spilled := actool.Capture(&actool.ToolContext{OutputDir: out}, strings.Repeat("x", actool.MaxOutput(nil)+1))
	entries, err := os.ReadDir(out)
	if err != nil || len(entries) != 1 || !strings.Contains(spilled, filepath.Join(out, entries[0].Name())) {
		t.Fatalf("Capture did not spill to %s: %v %v\n%s", out, entries, err, spilled)
	}
	raw, _ := json.Marshal(spilled)
	small, _ := json.Marshal(actool.Capture(&actool.ToolContext{OutputDir: out}, "small output"))
	ctx := context.Background()
	for _, hooks := range []harness.HookRunner{SpillHooks(inner, task7), SpillHooks(nil, task7)} {
		shared = nil
		hooks.PostToolUse(ctx, "Bash", nil, small, false)
		if len(shared) != 0 {
			t.Errorf("the sharer ran for a result without a spill: %v", shared)
		}
		hooks.PostToolUse(ctx, "Bash", nil, raw, false)
		if len(shared) != 1 || shared[0] != task7 {
			t.Errorf("sharer calls after a spill = %v, want [%s]", shared, task7)
		}
		hooks.PreToolUse(ctx, "Bash", nil)
		hooks.Stop(ctx, nil)
	}
	if block, msg, _ := SpillHooks(inner, task7).PreToolUse(ctx, "Bash", nil); !block || msg != "blocked" {
		t.Errorf("PreToolUse = %v %q, want the inner answer", block, msg)
	}
	if prevent, _, msg := SpillHooks(inner, task7).Stop(ctx, nil); !prevent || msg != "stop" {
		t.Errorf("Stop = %v %q, want the inner answer", prevent, msg)
	}
	if inner.pre != 2 || inner.post != 2 || inner.stop != 2 {
		t.Errorf("forwarded calls: pre %d post %d stop %d, want 2 each", inner.pre, inner.post, inner.stop)
	}
}
