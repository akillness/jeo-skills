package agent

import (
	"bytes"
	"context"
	"log"
	"path/filepath"
	"strconv"

	"github.com/Autumn-27/norma/harness"
	"github.com/Autumn-27/norma/llm"
)

// Command-output spills. Norma's tool.Capture writes an oversized tool output to a
// file in ToolOutputDir, from the server process. In <run dir>/cmd-output the
// executor, which can write in the run directory, could turn cmd-output into a
// symlink that root then writes through. When agent processes run as the executor
// the server therefore owns the spill directory: one per task or chat session,
// outside every run directory, that the executor can read and cannot change.

// spillDirMaker creates a spill directory below the data directory, and
// spillFileSharer lets the executor read the spill files in one (Norma writes them
// 0600). The server sets both when agent processes run as the executor
// (server/execpriv_unix.go); nil keeps the spill in <run dir>/cmd-output.
var (
	spillDirMaker   func(base, dir string) error
	spillFileSharer func(dir string) error
)

// SetSpillDirMaker sets how spill directories are created and how the spill files in
// one are shared with the executor. Call it before any agent runs.
func SetSpillDirMaker(mkdir func(base, dir string) error, share func(dir string) error) {
	spillDirMaker, spillFileSharer = mkdir, share
}

// TaskSpillDir is the server-owned spill directory of a task's agents:
// <base>/spill/tasks/<taskID>. It is removed and archived with the task directory.
func TaskSpillDir(base, taskID string) string {
	return filepath.Join(base, "spill", "tasks", taskID)
}

// SessionSpillDir is the server-owned spill directory of a chat session:
// <base>/spill/sessions/<sessionID>.
func SessionSpillDir(base, sessionID string) string {
	return filepath.Join(base, "spill", "sessions", sessionID)
}

// toolOutputDir returns the ToolOutputDir of a run. Without a maker it is
// <run dir>/cmd-output, which Norma creates on the first spill. With one it is
// spillDir, created here; when that fails the run gets no spill directory and
// oversized output is truncated instead.
func toolOutputDir(base, runDir, spillDir string) string {
	if spillDirMaker == nil {
		return filepath.Join(runDir, "cmd-output")
	}
	if err := spillDirMaker(base, spillDir); err != nil {
		log.Printf("[agent] spill directory %s: %v", spillDir, err)
		return ""
	}
	return spillDir
}

// TaskToolOutputDir is the ToolOutputDir of a task agent that works in runDir.
func TaskToolOutputDir(base string, taskID int64, runDir string) string {
	return toolOutputDir(base, runDir, TaskSpillDir(base, strconv.FormatInt(taskID, 10)))
}

// SessionToolOutputDir is the ToolOutputDir of a chat that works in runDir.
func SessionToolOutputDir(base, sessionID, runDir string) string {
	return toolOutputDir(base, runDir, SessionSpillDir(base, sessionID))
}

// spillMarker is in every result whose full output Capture wrote to a spill file.
var spillMarker = []byte("persisted-output")

// spillHooks shares the spill files of dir with the executor once the tool call that
// wrote one returns, before the model gets the path. inner may be nil.
type spillHooks struct {
	inner harness.HookRunner
	share func(dir string) error
	dir   string
}

// SpillHooks returns the hooks of a run whose ToolOutputDir is dir. With a sharer
// set they wrap hooks (which may be nil); otherwise hooks is returned as it is.
func SpillHooks(hooks harness.HookRunner, dir string) harness.HookRunner {
	if spillFileSharer == nil || dir == "" {
		return hooks
	}
	return spillHooks{inner: hooks, share: spillFileSharer, dir: dir}
}

func (h spillHooks) PreToolUse(ctx context.Context, name string, input []byte) (bool, string, []byte) {
	if h.inner != nil {
		return h.inner.PreToolUse(ctx, name, input)
	}
	return false, "", nil
}

func (h spillHooks) PostToolUse(ctx context.Context, name string, input, result []byte, isErr bool) {
	if bytes.Contains(result, spillMarker) {
		if err := h.share(h.dir); err != nil {
			log.Printf("[agent] share the spill files in %s: %v", h.dir, err)
		}
	}
	if h.inner != nil {
		h.inner.PostToolUse(ctx, name, input, result, isErr)
	}
}

func (h spillHooks) Stop(ctx context.Context, messages []llm.Message) (bool, []string, string) {
	if h.inner != nil {
		return h.inner.Stop(ctx, messages)
	}
	return false, nil, ""
}
