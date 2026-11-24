// Package guard implements the safety boundary layer (docs §11): an audit log,
// user-configured intercept-rule evaluation, and Observer/G5 failure attribution.
// Every tool call passes through the PreToolUse hook before executing.
// (The RoE authorization-scope mechanism was removed; a replacement may be added
// later.) Destructive/exfil gating is no longer hard-coded here — it lives in the
// DB intercept rules (seeded as ordinary [built-in] rules, so users can disable or
// delete them), evaluated via applyIntercept.
package guard

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Autumn-27/artex/intercept"
	"github.com/Autumn-27/norma/hook"
)

// AuditEntry records one gated tool call.
type AuditEntry struct {
	TS      int64  `json:"ts"`
	Tool    string `json:"tool"`
	Action  string `json:"action"` // allow|block
	Reason  string `json:"reason,omitempty"`
	Command string `json:"command,omitempty"`
}

// Guard enforces the side-effect policy via agent-core hooks.
type Guard struct {
	mu          sync.Mutex
	audit       []AuditEntry
	attrib      map[string]int // failure attribution counts (Observer / G5)
	reg         *hook.Registry
	interceptor *intercept.Interceptor // optional; nil disables user-configured rules
	targetOnly  bool                   // planner / main agent: built-in deny rules and target gate only, no user rules, no judge, no audit ring
	gate        targetGate             // the target gate; nil without an interceptor
}

// New creates a Guard without user-configured intercept rules (used for pentest
// tasks where the Interceptor is not yet available).
func New() *Guard { return newGuard(nil) }

// NewWithInterceptor creates a Guard with user-configured intercept rules.
func NewWithInterceptor(ic *intercept.Interceptor) *Guard { return newGuard(ic) }

// NewTargetOnly creates the Guard for the planner and the main agent. Their tool
// calls pass through the built-in deny rules and the target gate only: the user
// intercept rules and the fallback judge are not extended to them, and their
// calls that pass are not written to the audit ring (which keeps the worker
// history of the task's main Guard).
func NewTargetOnly(ic *intercept.Interceptor) *Guard {
	g := &Guard{attrib: map[string]int{}, interceptor: ic, targetOnly: true}
	g.setGate(ic)
	g.reg = hook.NewRegistry().On(hook.PreToolUse, g.preToolUse)
	return g
}

func newGuard(ic *intercept.Interceptor) *Guard {
	g := &Guard{attrib: map[string]int{}, interceptor: ic}
	g.setGate(ic)
	g.reg = hook.NewRegistry().
		On(hook.PreToolUse, g.preToolUse).
		On(hook.PostToolUse, g.postToolUse)
	return g
}

// setGate wires the interceptor in as the target gate. A nil interceptor leaves
// the gate unset rather than set to an interface that holds a nil pointer.
func (g *Guard) setGate(ic *intercept.Interceptor) {
	if ic != nil {
		g.gate = ic
	}
}

// Hooks returns the hook registry to attach to an agent session.
func (g *Guard) Hooks() *hook.Registry { return g.reg }

func (g *Guard) preToolUse(ctx context.Context, ev hook.Event) hook.Result {
	cmd := toolAuditCommand(ev)
	res := g.applyIntercept(ctx, ev, cmd)
	if g.targetOnly {
		// Not recorded on a pass: the audit ring is for the gated worker and chat
		// calls. A block still writes through block().
		return res
	}
	// Record the final decision only. An allow written before applyIntercept
	// stayed in the ring when the call was later blocked, so Audit() showed a
	// call as allowed that never ran.
	if res.Decision != "block" {
		g.record(ev.ToolName, "allow", "", cmd)
	}
	return res
}

// toolAuditCommand is the shell-command surface for the audit log: Bash and
// shell_open's command, shell_send's text. Other tools record an empty command.
func toolAuditCommand(ev hook.Event) string {
	switch ev.ToolName {
	case "Bash", "shell_open":
		var in struct {
			Command string `json:"command"`
		}
		_ = json.Unmarshal(ev.Input, &in)
		return in.Command
	case "shell_send":
		var in struct {
			Text string `json:"text"`
		}
		_ = json.Unmarshal(ev.Input, &in)
		return in.Text
	}
	return ""
}

// targetGate is the approval gate for asset targets, as the guard uses it.
// *intercept.Interceptor implements it.
type targetGate interface {
	CheckTargets(ctx context.Context, scope intercept.TargetScope, toolName string, input []byte) ([]intercept.TargetRequest, intercept.TargetResult)
	RequestTargets(ctx context.Context, scope intercept.TargetScope, toolName string, input []byte, targets []intercept.TargetRequest, ask *intercept.Decision) intercept.TargetResult
}

// targetPasses bounds the request-and-recheck loop of one call: a request that
// was decided in between, or addresses that changed again after an approval,
// send the call back to the pin lookup at most this many times.
const targetPasses = 3

// gateScope returns the target-gate scope of the session, and whether its gate
// is on. With the gate off (the default) no call reaches the gate.
func (g *Guard) gateScope(ctx context.Context) (intercept.TargetScope, bool) {
	scope, ok := intercept.TargetScopeFromContext(ctx)
	return scope, ok && g.gate != nil && scope.Enabled != nil && scope.Enabled()
}

// applyIntercept evaluates user-configured intercept rules against the tool call,
// then the target gate. Both rules and the fallback judge receive the complete
// tool input.
//
// The rules and the judge apply to the enabled tools of a full guard. A
// target-only guard applies the built-in deny rules alone, whether its gate is
// on or off. The target gate applies to every tool call of a session whose gate
// is on: a deny blocks first, before any target request exists; an allow by a
// rule or by the judge does not satisfy the gate; an ask and an unpinned target
// share one approval request.
func (g *Guard) applyIntercept(ctx context.Context, ev hook.Event, cmd string) hook.Result {
	if g.targetOnly && g.interceptor != nil {
		// The planner and the main agent run Bash too (#124, F11): the built-in
		// deny rules apply to them, before the target gate. User rules and the
		// judge stay with the full guard.
		if dec, ok := g.interceptor.MatchBuiltin(ev.ToolName, ev.Input); ok {
			ctx = intercept.WithCall(ctx, ev.ToolName, ev.Input)
			g.interceptor.Log(ctx, intercept.ConvIDFromContext(ctx), dec, ev.ToolName, ev.Input, "denied")
			return g.block(ev.ToolName, systemBlockMessage(dec.Message), cmd)
		}
	}
	scope, gated := g.gateScope(ctx)
	rules := !g.targetOnly && g.interceptor != nil && g.interceptor.IsToolEnabled(ev.ToolName)
	// Persistence tools (custom tools, MCP servers, skills) always meet their built-in
	// approval, in the target-only guard too; see intercept.MatchPersistence.
	persist := g.interceptor != nil && intercept.IsPersistenceTool(ev.ToolName)
	if !rules && !gated && !persist {
		return hook.Result{}
	}
	ctx = intercept.WithCall(ctx, ev.ToolName, ev.Input)
	var dec intercept.Decision
	matched := false
	if persist {
		dec, matched = g.interceptor.MatchPersistence(ev.ToolName, ev.Input)
	}
	if !matched && rules {
		dec, matched = g.interceptor.Match(ev.ToolName, ev.Input)
		if !matched {
			// No rule matched. Ask the LLM fallback judge (if enabled); when it is off
			// or unwired, keep current behavior and allow.
			dec, _ = g.interceptor.Judge(ctx, ev.ToolName, ev.Input)
		}
	}
	if dec.Action == "deny" {
		// Note: a deny hit does not block for approval; it directly logs a denied entry (visible on the history / task interception pages).
		g.interceptor.Log(ctx, intercept.ConvIDFromContext(ctx), dec, ev.ToolName, ev.Input, "denied")
		return g.block(ev.ToolName, systemBlockMessage(dec.Message), cmd)
	}
	var unpinned []intercept.TargetRequest
	if gated {
		var res intercept.TargetResult
		if unpinned, res = g.gate.CheckTargets(ctx, scope, ev.ToolName, ev.Input); res.Code != "" {
			return g.block(ev.ToolName, TargetBlockMessage(res), cmd)
		}
	}
	var ask *intercept.Decision
	switch dec.Action {
	case "allow":
		// Record explicit rule and model approvals so review details remain auditable.
		g.interceptor.Log(ctx, intercept.ConvIDFromContext(ctx), dec, ev.ToolName, ev.Input, "allowed")
	case "ask":
		// If the worker context is already cancelled (task stopped / killed), block
		// immediately without creating a pending record — avoids orphaned DB entries
		// and makes execOne complete fast, reducing the race against drainSynthetic.
		if ctx.Err() != nil {
			return g.block(ev.ToolName, systemBlockMessage("work cancelled; platform safety controls blocked execution"), cmd)
		}
		ask = &dec
	}
	if len(unpinned) > 0 {
		res, merged := g.requestTargets(ctx, scope, ev, unpinned, ask)
		if res.Code != "" {
			return g.block(ev.ToolName, TargetBlockMessage(res), cmd)
		}
		if merged {
			// The approval of the target request answered the ask as well.
			ask = nil
		}
	}
	if ask != nil {
		convID := intercept.ConvIDFromContext(ctx)
		if !g.interceptor.HandleAsk(ctx, convID, dec, ev.ToolName, ev.Input) {
			return g.block(ev.ToolName, systemBlockMessage("manual approval not granted (user rejected or approval timed out)"), cmd)
		}
	}
	return hook.Result{}
}

// requestTargets asks for the approval of the targets no pin covers, waits for
// the decisions, and checks the call again: it runs only if every target is
// covered then. A code in the result blocks the call. merged reports that the
// ask was carried by a request this call created, so it needs no prompt of its
// own.
func (g *Guard) requestTargets(ctx context.Context, scope intercept.TargetScope, ev hook.Event, unpinned []intercept.TargetRequest, ask *intercept.Decision) (res intercept.TargetResult, merged bool) {
	for pass := 0; pass < targetPasses; pass++ {
		if res = g.gate.RequestTargets(ctx, scope, ev.ToolName, ev.Input, unpinned, ask); res.Code != "" {
			return res, merged
		}
		if res.AskMerged {
			merged, ask = true, nil
		}
		if unpinned, res = g.gate.CheckTargets(ctx, scope, ev.ToolName, ev.Input); res.Code != "" || len(unpinned) == 0 {
			return res, merged
		}
	}
	t := unpinned[0]
	return intercept.TargetResult{Code: intercept.TargetApprovalPending, Host: t.Host, Port: t.Port,
		Reason: fmt.Sprintf("the target is still not covered by a pin after %d approval rounds; its addresses changed again", targetPasses)}, merged
}

// targetGuidance tells the model what a target block means for its next step.
var targetGuidance = map[string]string{
	intercept.TargetApprovalPending: "The call was not executed. An approval by the operator is needed and may still arrive: retry the same call later. " +
		"Do not rewrite the command, switch tools or substitute an IP address.",
	intercept.TargetDenied: "The call was not executed. The operator did not approve this target: do not retry it and do not reach it another way.",
	intercept.TargetResolveFailed: "The call was not executed and no approval was requested. " +
		"This is a resolver failure on the platform side, not a block by the target. " +
		"Do not rewrite the command, switch tools or substitute an IP address. Retry the same call later, or report the failure.",
	intercept.TargetRuleBlocked: "The call was not executed and no approval was requested. " +
		"The operator's rules exclude this target: do not reach it another way.",
	intercept.TargetTooMany: "The call was not executed and no approval was requested. Name fewer new targets per call.",
	intercept.TargetGateUnavailable: "The call was not executed. This is a failure on the platform side, not a block by the target. " +
		"Retry the same call later, or report the failure.",
}

// TargetBlockMessage is systemBlockMessage for the target gate: the block code,
// the reason and the target, then what to do about it. A target block is not
// always final (an approval can still arrive, a lookup can succeed later), so
// it does not end with "This operation is forbidden."
func TargetBlockMessage(res intercept.TargetResult) string {
	reason := capBlockReason(res.Reason)
	if res.Host != "" && !strings.Contains(reason, res.Host) {
		target := res.Host
		if res.Port != 0 {
			target = net.JoinHostPort(res.Host, strconv.Itoa(res.Port))
		}
		reason = "target " + target + ": " + reason
	}
	return "[ARTEX platform control, not target defense] " + res.Code + ": " + reason + ". " + targetGuidance[res.Code]
}

// systemBlockMessage frames an intercept block as an ARTEX platform-governance
// decision so the agent does not mistake it for a target-side defense.
//
// The bare reasons ("this tool is forbidden" / "user rejected") read exactly like a WAF/403 on
// the target, so a pentest agent's instinct is to bypass them — rewrite the
// command, swap the payload, re-encode, retry. That is both futile (the platform
// blocks the class of action, not one string) and wrong (it's a policy decision,
// not an obstacle to defeat). This prefix states plainly that the block comes
// from the platform, is not the target's protection, and that the operation is
// forbidden — so the agent pivots to another approach instead of evading it.
// Audit/history rows keep the raw reason (see Interceptor.Log); only the
// model-facing tool_result carries this framing.
func systemBlockMessage(reason string) string {
	return "[ARTEX platform control, not target defense] This call was intercepted by the platform. " +
		"Reason: " + capBlockReason(reason) + ". This operation is forbidden."
}

// maxBlockReasonRunes bounds the reason a block message carries back to the
// model. Rule messages are operator text and judge or target reasons can embed
// command input, so a reason has no natural bound; 4000 runes keeps every
// realistic reason whole while one oversized reason cannot flood the context.
// Only the model-facing text is capped: Interceptor.Log stores the raw reason.
const maxBlockReasonRunes = 4000

// capBlockReason returns s unchanged when it has at most maxBlockReasonRunes
// runes, and otherwise its first maxBlockReasonRunes runes and a marker.
func capBlockReason(s string) string {
	n := 0
	for i := range s {
		if n == maxBlockReasonRunes {
			return s[:i] + " …(truncated)"
		}
		n++
	}
	return s
}

var reBlocked = regexp.MustCompile(`(?i)\b(403|forbidden|waf|blocked|rate.?limit|429|captcha|denied)\b`)

// postToolUse is the Observer failure-attribution hook (G5): it classifies tool
// results into blocked / error / ok so the planner can change strategy instead
// of giving up at a WAF.
func (g *Guard) postToolUse(_ context.Context, ev hook.Event) hook.Result {
	if ev.ToolName != "Bash" {
		return hook.Result{}
	}
	class := "ok"
	switch {
	case reBlocked.Match(ev.Result):
		class = "blocked"
	case ev.IsError:
		class = "error"
	}
	g.mu.Lock()
	g.attrib[class]++
	g.mu.Unlock()
	return hook.Result{}
}

// Attributions returns failure-attribution counts (Observer / G5).
func (g *Guard) Attributions() map[string]int {
	g.mu.Lock()
	defer g.mu.Unlock()
	out := make(map[string]int, len(g.attrib))
	for k, v := range g.attrib {
		out[k] = v
	}
	return out
}

func (g *Guard) block(tool, reason, cmd string) hook.Result {
	g.record(tool, "block", reason, cmd)
	return hook.Result{Decision: "block", Message: reason}
}

func (g *Guard) record(tool, action, reason, cmd string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.audit = append(g.audit, AuditEntry{TS: time.Now().Unix(), Tool: tool, Action: action, Reason: reason, Command: cmd})
	if len(g.audit) > 2000 {
		g.audit = g.audit[len(g.audit)-2000:]
	}
}

// Audit returns a snapshot of recent gated calls (most recent last).
func (g *Guard) Audit() []AuditEntry {
	g.mu.Lock()
	defer g.mu.Unlock()
	out := make([]AuditEntry, len(g.audit))
	copy(out, g.audit)
	return out
}
