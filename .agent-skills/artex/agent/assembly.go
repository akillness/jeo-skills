package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"runtime/debug"
	"sync"

	actool "github.com/Autumn-27/norma/tool"
)

// DeferredInfo carries the deferred-tools wiring an agent needs to build its
// Options: the MCP tool names whose schemas are withheld, the subset listed in the
// global system-prompt block (non-skill-gated), and the shared session unlock set.
// UnlockSkill unlocks a named skill's MCPs — hosts call it to rebuild the unlock set
// from history on a resumed session (design doc C2).
type DeferredInfo struct {
	FindingGuidance string            // derived from the final permitted tools, including DB overrides
	SkillIndex      string            // names-only skill index for the system prompt ("" when no skills)
	Deferred        []string          // all MCP tool names (schema withheld)
	GlobalNames     []string          // MCP names to list in the system-prompt block
	Unlock          *actool.UnlockSet // shared call-gate; nil when no MCP tools
	UnlockSkill     func(skillName string)
}

// ToolAugmentFunc is the ToolAugment hook. If set, it returns the EXTRA tools
// an agent should see beyond its built-in base set — the agent's visible skills (packed into one Skill meta-tool)
// and visible MCP servers (expanded to mcp__server__tool). It also returns the
// DeferredInfo describing how those MCP tools are deferred/gated. The server wires
// it to the PG agent_visibility table. cleanup releases any spawned MCP clients.
//
// When nil, agents run with only their built-in tools — behavior is unchanged
// until a user assigns a skill/MCP to the agent in the UI.
type ToolAugmentFunc func(ctx context.Context, agentKey string) (extra []actool.CoreTool, def DeferredInfo, cleanup func())

// The hook is set by server wiring while restored tasks may already be
// assembling tools on other goroutines, so every access goes through the lock.
var (
	toolAugmentMu sync.RWMutex
	toolAugment   ToolAugmentFunc
)

// SetToolAugment installs (or, with nil, removes) the ToolAugment hook.
func SetToolAugment(f ToolAugmentFunc) {
	toolAugmentMu.Lock()
	toolAugment = f
	toolAugmentMu.Unlock()
}

// ToolAugment returns the current ToolAugment hook, or nil when none is set.
func ToolAugment() ToolAugmentFunc {
	toolAugmentMu.RLock()
	defer toolAugmentMu.RUnlock()
	return toolAugment
}

// AugmentTools returns base plus the agent's visible skill/MCP tools, the
// DeferredInfo, and a cleanup func the caller must defer (closes MCP clients).
// Built-in base tools are kept as-is — never filtered (built-in tools stay at the code layer, no visibility filtering).
func AugmentTools(ctx context.Context, agentKey string, base []actool.CoreTool) ([]actool.CoreTool, DeferredInfo, func()) {
	var (
		def     DeferredInfo
		cleanup = func() {}
		out     = base
	)
	// Copy each hook once under its lock, then call it outside the lock.
	if augment := ToolAugment(); augment != nil {
		var extra []actool.CoreTool
		var cl func()
		extra, def, cl = augment(ctx, agentKey)
		if cl != nil {
			cleanup = cl
		}
		if len(extra) > 0 {
			out = append(append([]actool.CoreTool{}, base...), extra...)
		}
	}
	// DB tools table has the final say on the built-in tools: drop the ones this
	// agent isn't bound to (or that are disabled) and swap in overridden
	// descriptions/schemas + default injection. MCP/skill/host tools have no row
	// and pass through untouched, so deferred/unlock wiring stays consistent.
	if resolve := ToolResolve(); resolve != nil {
		out = resolve(ctx, agentKey, out)
	}
	// Tool RAG (off by default): lexical projection of the bound list; only removes.
	out = applyToolRAG(ctx, agentKey, out, def.Deferred, bm25Score)
	out, def.FindingGuidance = findingWorkflowTools(agentKey, out)
	for i, t := range out {
		out[i] = guardPanic(t)
	}
	return out, def, cleanup
}

// guardPanic turns a panicking tool handler into an ordinary tool error. The
// harness runs each tool on its own goroutine, so a panic inside a handler can't
// be recovered by the caller that started the run — it takes the whole process
// down, and on restart the agent replays the same call and crashes again. Applied
// last, so it covers every tool the agent can reach: domain, SDK, MCP and skill.
func guardPanic(t actool.CoreTool) actool.CoreTool { return &guardedTool{CoreTool: t} }

type guardedTool struct{ actool.CoreTool }

// AcceptsRawInput forwards the wrapped tool's opt-out of the harness schema
// check, as overriddenTool does: this wrapper is the one the harness sees, and
// the embedded interface alone would hide the opt-out from its type assertion.
func (g *guardedTool) AcceptsRawInput() bool {
	r, ok := g.CoreTool.(interface{ AcceptsRawInput() bool })
	return ok && r.AcceptsRawInput()
}

func (g *guardedTool) Call(ctx context.Context, in json.RawMessage, tc *actool.ToolContext) (res actool.Result, err error) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[tools] %s panic: %v\n%s", g.Name(), r, debug.Stack())
			res, err = actool.Errorf(fmt.Sprintf("internal error in tool %s: %v (this call has failed; try different arguments or another tool)", g.Name(), r)), nil
		}
	}()
	return g.CoreTool.Call(ctx, in, tc)
}
