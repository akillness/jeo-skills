package agent

import (
	"log"
	"path/filepath"

	"github.com/Autumn-27/norma/agentcore"
	"github.com/Autumn-27/norma/noaadapter"
)

// noaWarn returns a diagnostics sink tagging non-fatal noa messages with the
// session, routed through the package logger (agents have no per-instance one).
func noaWarn(session string) func(string) {
	return func(msg string) { log.Printf("[noa] %s: %s", session, msg) }
}

// noa is the "model-driven context compression" mechanism introduced in norma v0.4.0,
// exposed as an experimental platform feature toggled by the user in system settings.
// It is mutually exclusive with the built-in compaction: noaadapter.Enable is the only
// entry point, and one call attaches the context take-over (Compactor), the Compress
// tool, and three resident prompt segments; not calling Enable means off (the built-in
// compaction works as usual). The toggle is resolved per run by the noaEnabledFn each
// agent injects, so switching only affects runs started afterwards — no need to rebuild
// the agent.

// enableNoa wires noa into opts when the resolver reports enabled. archiveRoot is the
// persistent base directory for compression originals (the global workDir; all agents
// uniformly land under <workDir>/noa, not scattered across task/intent directories),
// and sessionID names the archive subdirectory under it (globally unique, so no
// conflict within the same base directory).
//
// noa is experimental: an integration failure must not interrupt real tasks. On error
// it reports via onWarn and falls back to the built-in compaction. On success it clears
// opts.Compaction, avoiding agentcore's "two context managers set at once" warning.
func enableNoa(opts *agentcore.Options, enabled func() bool, archiveRoot, sessionID string, onWarn func(string)) {
	if enabled == nil || !enabled() {
		return
	}
	if opts.OnWarn == nil {
		opts.OnWarn = onWarn
	}
	// noa sizes its thresholds to the window this agent is configured for, read
	// before Compaction is cleared below; without it noa assumes its own default.
	window := defaultWindowK * 1000
	if opts.Compaction != nil && opts.Compaction.ContextWindow > 0 {
		window = opts.Compaction.ContextWindow
	}
	if err := noaEnable(opts, noaadapter.Options{
		ArchiveBaseDir:    filepath.Join(archiveRoot, "noa"),
		SessionID:         sessionID,
		OnWarn:            onWarn,
		ModelContextLimit: window,
	}); err != nil {
		if onWarn != nil {
			onWarn("failed to enable noa compression, falling back to built-in compaction: " + err.Error())
		}
		return
	}
	// Compactor overrides Compaction, but agentcore warns on every run when both are
	// set; clear it explicitly.
	opts.Compaction = nil
	// noa can only trim what it may drop; a request whose protected part alone
	// exceeds the window is refused here instead of by the provider.
	opts.Provider = &noaBudgetProvider{Provider: opts.Provider, window: window}
}

// noaEnable is noaadapter.Enable; tests replace it to observe the options.
var noaEnable = noaadapter.Enable
