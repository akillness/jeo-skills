package intercept

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"strconv"
	"strings"
	"time"

	"github.com/Autumn-27/artex/db"
)

// Block codes a target request can end with. They are carried in the
// model-facing text of the blocked call.
const (
	// TargetApprovalPending: no decision within the wait bound. The request
	// stays open, so a later approval still creates the pin.
	TargetApprovalPending = "TARGET_APPROVAL_PENDING"
	// TargetDenied: the request was closed without an approval.
	TargetDenied = "TARGET_DENIED"
	// TargetGateUnavailable: the request could not be written or read.
	TargetGateUnavailable = "TARGET_GATE_UNAVAILABLE"
)

// targetPollInterval is how often a waiter re-reads its request row. The poll
// covers a decision taken on another instance that shares the database.
var targetPollInterval = 2 * time.Second

// TargetRequest is one target of a gated call that no pin covers.
type TargetRequest struct {
	Host string // normalised name, IP literal or CIDR; with Port the key of the request
	Port int    // 0 = port not declared
	Kind string
	// ResolvedIPs are the addresses resolved for this request. They are what the
	// human reads and what an approval pins.
	ResolvedIPs []string
	Resolver    string
	ResolvedAt  time.Time
	Reason      string        // no_pin | new_ip | revoked
	Pin         *db.TargetPin // the active pin an approval would extend (new_ip); nil otherwise
	ExemptVoid  bool          // a stored exemption names the target and was void for this call
	// RedirectFrom is the origin (host:port) of the redirect that leads to the
	// target; empty when the call names the target itself.
	RedirectFrom string
}

// TargetResult is the outcome of RequestTargets. Code is empty when every
// request the call waited on was approved (or was decided in between): the
// caller then re-runs the pin lookup and executes only if every target is
// covered. Otherwise Code is the block code and Host, Port and PendingID name
// the request that stopped the call.
type TargetResult struct {
	Code      string
	Host      string
	Port      int
	PendingID int64
	Reason    string
	// AskMerged reports that the ask passed in was carried by a request this call
	// created, so its decision answered both. When false the caller still has to
	// raise the ask on its own.
	AskMerged bool
}

func (s TargetScope) ref() (db.TargetScopeRef, error) {
	ref := db.TargetScopeRef{ConversationID: s.ConversationID}
	if s.TaskID != "" {
		id, err := strconv.ParseInt(s.TaskID, 10, 64)
		if err != nil {
			return ref, fmt.Errorf("target scope: task id %q: %w", s.TaskID, err)
		}
		ref.TaskID = id
	}
	return ref, nil
}

// scopeName is how a request text names what an approval is bound to.
func (s TargetScope) scopeName() string {
	if s.TaskID != "" {
		return "task " + s.TaskID
	}
	return "conversation " + strconv.FormatInt(s.ConversationID, 10)
}

// targetWaiter is one request row a call waits on.
type targetWaiter struct {
	target  TargetRequest
	id      int64 // 0 = the open request was decided in between: nothing to wait for
	created bool  // this call wrote the row
}

// RequestTargets asks a human to approve the targets of one gated call that no
// pin covers, and waits for the decisions up to the scope's wait bound.
//
// There is one open request per (scope, host, port). The first call writes the
// row and emits the approval card once; later calls for the same key attach to
// that row and wait on it. A request is durable and host-level: a call that
// stops waiting (bound elapsed, cancelled) leaves it open, and a later approval
// still creates the pin. Nothing here ever pins: only Decide does, on a click.
//
// ask is the pending ask of a rule or of the judge for the same call, nil when
// there is none. It is merged into the first row this call creates, so one
// click answers both. A merged row is bound to its creating call like a classic
// ask: when that call leaves, the system settles it, and a rule timeout never
// allows it, because a timeout cannot pin.
func (i *Interceptor) RequestTargets(ctx context.Context, scope TargetScope, toolName string, input []byte, targets []TargetRequest, ask *Decision) TargetResult {
	ref, err := scope.ref()
	if err != nil {
		return TargetResult{Code: TargetGateUnavailable, Reason: err.Error()}
	}
	// An approval pins the addresses the request displays, so a request without
	// any is never opened: approving it would pin nothing.
	for _, t := range targets {
		if len(t.ResolvedIPs) == 0 {
			return TargetResult{Code: TargetResolveFailed, Host: t.Host, Port: t.Port,
				Reason: "no address was resolved for " + targetName(t) + ", and an approval never pins an empty address list"}
		}
	}
	if scope.WaitBound <= 0 {
		// A call that never waits cannot own a call-bound row.
		ask = nil
	}

	var res TargetResult
	var merged *targetWaiter
	var mergedAsk Decision
	// Whatever the way out, a merged row never outlives its creating call. This
	// is a no-op once the row is decided.
	defer func() {
		if merged != nil {
			i.settleMerged(merged.id, "denied", "the call left before a decision")
		}
	}()

	waiters := make([]*targetWaiter, 0, len(targets))
	for _, t := range targets {
		w, err := i.openTargetRequest(ctx, ref, scope, toolName, input, t, ask)
		if err != nil {
			res.Code, res.Host, res.Port, res.Reason = TargetGateUnavailable, t.Host, t.Port, err.Error()
			return res
		}
		if w.created && ask != nil {
			merged, mergedAsk, res.AskMerged = w, *ask, true
			ask = nil
		}
		waiters = append(waiters, w)
	}
	if len(waiters) == 0 {
		return res
	}

	blocked := func(w *targetWaiter, code, reason string) TargetResult {
		res.Code, res.Host, res.Port, res.PendingID, res.Reason = code, w.target.Host, w.target.Port, w.id, reason
		return res
	}
	if scope.WaitBound <= 0 {
		return blocked(waiters[0], TargetApprovalPending, "this call does not wait for approvals; the request stays open")
	}
	bound := time.NewTimer(scope.WaitBound)
	defer bound.Stop()

	// The merged row first: its rule timeout runs from the creation of the row.
	if merged != nil {
		var ruleTimeout <-chan time.Time
		if mergedAsk.TimeoutEnabled {
			secs := mergedAsk.TimeoutSeconds
			if secs <= 0 {
				secs = 60
			}
			timer := time.NewTimer(time.Duration(secs) * time.Second)
			defer timer.Stop()
			ruleTimeout = timer.C
		}
		status, reason := "", ""
		switch st := i.awaitTarget(ctx, merged.id, bound.C, ruleTimeout); st {
		case "allowed":
		case waitRuleTimeout:
			status, reason = "timeout", "approval timed out"
			if mergedAsk.TimeoutAction == "allow" {
				reason += `; the timeout action "allow" was overridden, because a timeout cannot pin a target`
			}
		case waitElapsed:
			status, reason = "timeout", "no approval within the wait bound"
		case waitCancelled:
			status, reason = "denied", "work cancelled"
		case waitGone:
			return blocked(merged, TargetGateUnavailable, "the approval request no longer exists")
		default:
			return blocked(merged, TargetDenied, "the request was denied")
		}
		// A human decision that lands while the call is leaving still counts.
		if status != "" && (i.settleMerged(merged.id, status, reason) || !i.targetAllowed(merged.id)) {
			return blocked(merged, TargetDenied, reason)
		}
	}

	for _, w := range waiters {
		if w == merged || w.id == 0 {
			continue
		}
		st := i.awaitTarget(ctx, w.id, bound.C, nil)
		if (st == "denied" || st == "timeout") && !w.created && i.wasMerged(w.id) {
			// The row this call attached to was bound to another call and closed
			// with it. That says nothing about the host: ask once more, with a
			// plain request.
			retry, err := i.openTargetRequest(ctx, ref, scope, toolName, input, w.target, nil)
			if err != nil {
				return blocked(w, TargetGateUnavailable, err.Error())
			}
			if retry.id == 0 {
				continue
			}
			w = retry
			st = i.awaitTarget(ctx, w.id, bound.C, nil)
		}
		switch st {
		case "allowed":
		case waitElapsed:
			return blocked(w, TargetApprovalPending, "no approval within the wait bound; the request stays open")
		case waitCancelled:
			return blocked(w, TargetApprovalPending, "work cancelled; the request stays open")
		case waitGone:
			return blocked(w, TargetGateUnavailable, "the approval request no longer exists")
		default:
			return blocked(w, TargetDenied, "the request was denied")
		}
	}
	return res
}

// openTargetRequest finds or creates the request row for one target. When this
// call writes the row it emits the approval card; an attaching call writes and
// emits nothing, and never rewrites the addresses a human may be reading.
func (i *Interceptor) openTargetRequest(ctx context.Context, ref db.TargetScopeRef, scope TargetScope, toolName string, input []byte, t TargetRequest, ask *Decision) (*targetWaiter, error) {
	i.mu.RLock()
	proxied := i.upstreamProxy
	i.mu.RUnlock()
	// Behind the upstream proxy the proxy chooses the address: the approval is
	// for the name, and the pin created from this row says so.
	nameOnly := proxied != nil && proxied()

	dec := Decision{Action: "ask"}
	if ask != nil {
		dec = *ask
	}
	dec.Message = targetReason(scope, t, ask, nameOnly)
	audit := auditFor(ctx, dec, input, "pending")
	audit.MergedAsk = ask != nil
	target := db.InterceptTarget{
		Host: t.Host, Port: t.Port, Kind: t.Kind,
		ResolvedIPs: t.ResolvedIPs, Resolver: t.Resolver, ResolvedAt: t.ResolvedAt,
		Reason: t.Reason, Outcome: "requested", NameOnlyEffective: nameOnly, ExemptVoid: t.ExemptVoid,
		RedirectFrom: t.RedirectFrom,
	}
	if t.Pin != nil {
		target.PinID, target.PinVersion, target.PinnedIPs = t.Pin.ID, t.Pin.Version, t.Pin.PinnedIPs
	}
	audit.Targets = []db.InterceptTarget{target}

	_, agentName := taskInfoFromCtx(ctx)
	id, created, err := i.db.FindOrCreateTargetRequest(db.TargetRequest{
		Scope: ref, Host: t.Host, Port: t.Port, RuleID: dec.RuleID,
		AgentName: agentName, ToolName: toolName, ToolInput: input, Reason: dec.Message, Audit: audit,
	})
	if err != nil {
		return nil, err
	}
	w := &targetWaiter{target: t, id: id, created: created}
	if !created {
		return w, nil
	}
	if ask != nil {
		// Call-bound like a classic ask: the result of this call belongs to the row.
		i.bindResult(ctx, id, audit)
	}
	detail, _ := json.Marshal(map[string]any{
		"pending_id": id,
		"tool":       toolName,
		"input":      json.RawMessage(input),
	})
	activity := db.Activity{
		Kind:    "intercept_request",
		Summary: fmt.Sprintf("tool %s requests approval for target %s (#%d)", toolName, targetName(t), id),
		Detail:  string(detail),
	}
	if scope.ConversationID != 0 {
		_, _ = i.db.AppendConvActivity(scope.ConversationID, activity)
	} else if emit := taskEmitFromCtx(ctx); emit != nil {
		emit(activity)
	}
	return w, nil
}

// Ways a wait ends without a decision on the row.
const (
	waitElapsed     = "wait_elapsed"      // the scope's wait bound
	waitRuleTimeout = "wait_rule_timeout" // the timeout of a merged ask
	waitCancelled   = "wait_cancelled"    // the call's context
	waitGone        = "wait_gone"         // the row no longer exists (its conversation was deleted)
)

// awaitTarget waits for the decision on one request row and returns its status
// (allowed | denied | timeout) or the way the wait ended. It never settles the
// row. The row is re-read before each wait: that covers a decision taken before
// the waiter registered, and one taken on another instance.
func (i *Interceptor) awaitTarget(ctx context.Context, id int64, bound, ruleTimeout <-chan time.Time) string {
	ch := i.pending.add(id)
	defer i.pending.remove(id, ch)
	poll := time.NewTicker(targetPollInterval)
	defer poll.Stop()
	for {
		row, err := i.db.GetInterceptPending(id)
		if err == nil && row == nil {
			return waitGone
		}
		if err == nil && row.Status != "pending" {
			return row.Status
		}
		select {
		case <-ch:
		case <-poll.C:
		case <-bound:
			return waitElapsed
		case <-ruleTimeout:
			return waitRuleTimeout
		case <-ctx.Done():
			return waitCancelled
		}
	}
}

// settleMerged closes a merged row on behalf of its creating call, which is
// leaving, and wakes the calls attached to it. It reports whether the row was
// still open; a merged row closed this way never pins.
func (i *Interceptor) settleMerged(id int64, status, reason string) bool {
	resolved, err := i.db.ResolveIntercept(id, status, "deny", reason, "system")
	if err != nil || !resolved {
		return false
	}
	i.pending.resolve(id, false)
	return true
}

func (i *Interceptor) targetAllowed(id int64) bool {
	row, err := i.db.GetInterceptPending(id)
	return err == nil && row != nil && row.Status == "allowed"
}

func (i *Interceptor) wasMerged(id int64) bool {
	detail, err := i.db.GetInterceptDetail(id)
	return err == nil && detail != nil && detail.Audit != nil && detail.Audit.MergedAsk
}

func targetName(t TargetRequest) string {
	if t.Port == 0 {
		return t.Host
	}
	return net.JoinHostPort(t.Host, strconv.Itoa(t.Port))
}

// targetReason is the text a human reads before deciding: host, port, the
// addresses an approval pins, and what the approval is bound to.
func targetReason(scope TargetScope, t TargetRequest, ask *Decision, nameOnly bool) string {
	var b strings.Builder
	if ask != nil && ask.Message != "" {
		b.WriteString(ask.Message)
		b.WriteString("\nThis call also names a target that needs approval. ")
	}
	if t.RedirectFrom != "" {
		fmt.Fprintf(&b, "A redirect from %s leads to this target; the redirect was not followed. ", t.RedirectFrom)
	}
	name, bound := targetName(t), scope.scopeName()
	if t.Port == 0 {
		name += " (port not declared: every port)"
	}
	ips := strings.Join(t.ResolvedIPs, ", ")
	if t.Pin != nil {
		fmt.Fprintf(&b, "Target %s is pinned for %s (pin v%d: %s) and now resolves to %s (resolver: %s).",
			name, bound, t.Pin.Version, strings.Join(t.Pin.PinnedIPs, ", "), ips, t.Resolver)
	} else {
		fmt.Fprintf(&b, "Target %s is not approved for %s. It resolves to %s (resolver: %s).", name, bound, ips, t.Resolver)
	}
	fmt.Fprintf(&b, " Approving pins these addresses for %s until revoked.", bound)
	if nameOnly {
		b.WriteString(" Egress goes through the upstream proxy, which chooses the address it connects to." +
			" The addresses listed are what the platform resolved. This approval is name-only." +
			" The platform does not bind the connection to these addresses.")
	}
	return b.String()
}
