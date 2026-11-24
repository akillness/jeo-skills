package intercept

import (
	"context"
	"fmt"
	"net/netip"
	"strings"
	"time"

	"github.com/Autumn-27/artex/db"
)

// Block codes of the gate decision. Like the codes of a target request they
// are carried in the model-facing text of the blocked call. None of them opens
// an approval request.
const (
	// TargetResolveFailed: a name did not resolve, so there is no address to
	// compare with a pin or to show to a human.
	TargetResolveFailed = "TARGET_RESOLVE_FAILED"
	// TargetRuleBlocked: an asset block rule matches a target.
	TargetRuleBlocked = "TARGET_RULE_BLOCKED"
	// TargetTooMany: the call names more unpinned targets than one call may request.
	TargetTooMany = "TARGET_TOO_MANY"
)

// maxUnpinnedTargets is how many distinct targets without a covering pin one
// call may request approval for. Each approval is one click on one host.
const maxUnpinnedTargets = 5

// literalResolver is the resolver recorded for an IP literal or a CIDR: the
// address is what was written, nothing was resolved.
const literalResolver = "literal"

// targetStore is what the gate reads and writes. The database implements it.
type targetStore interface {
	// BlockRules returns the asset block rules that apply to the scope: the
	// global ones and, for a task, its own. Allow rules play no role in the gate.
	BlockRules(scope db.TargetScopeRef) ([]db.AssetInterceptRule, error)
	// ActivePins returns the active pins that may cover (host, port) in scope,
	// the pin on the exact port first.
	ActivePins(scope db.TargetScopeRef, host string, port int) ([]*db.TargetPin, error)
	// Exemptions returns the stored exemption list and its digest.
	Exemptions() ([]db.TargetExemption, string, error)
	// LogDecision records an outcome no human took.
	LogDecision(db.TargetDecision) error
}

type dbTargetStore struct{ d *db.DB }

func (s dbTargetStore) BlockRules(scope db.TargetScopeRef) ([]db.AssetInterceptRule, error) {
	rules, err := s.d.ListAssetInterceptRules()
	if err != nil || scope.TaskID == 0 {
		return rules, err
	}
	block, _, err := s.d.Assets().TaskInterceptRulesSplit(scope.TaskID)
	if err != nil {
		return nil, err
	}
	return append(rules, block...), nil
}

func (s dbTargetStore) ActivePins(scope db.TargetScopeRef, host string, port int) ([]*db.TargetPin, error) {
	return s.d.ActiveTargetPins(scope, host, port)
}

func (s dbTargetStore) Exemptions() ([]db.TargetExemption, string, error) {
	list, raw, err := s.d.TargetExemptions()
	if raw == "" {
		raw = "[]"
	}
	return list, digestInput([]byte(raw)), err
}

func (s dbTargetStore) LogDecision(r db.TargetDecision) error {
	_, err := s.d.LogTargetDecision(r)
	return err
}

// CheckTargets decides, for one tool call of a gated scope, whether every
// network target the call declares may be reached: extraction, asset block
// rules, exemptions, resolution and the pin lookup. It creates no approval
// request and never waits.
//
// A block is reported in the result (Code, Reason and the target that caused
// it) and logged as a decided row. Otherwise the returned requests are the
// targets no pin covers, each with the addresses a human has to read; the
// caller passes them to RequestTargets and checks again after the decisions.
// No request and no code means the call may run.
//
// With the gate off the call returns at once: nothing is extracted, resolved,
// read or written.
func (i *Interceptor) CheckTargets(ctx context.Context, scope TargetScope, toolName string, input []byte) ([]TargetRequest, TargetResult) {
	if scope.Enabled == nil || !scope.Enabled() {
		return nil, TargetResult{}
	}
	declared := extractDeclared(toolName, input)
	if len(declared.targets) == 0 {
		return nil, TargetResult{}
	}
	c := &targetCheck{i: i, ctx: ctx, scope: scope, tool: toolName, input: input, urls: declared.urls}
	return c.run(declared.targets)
}

// targetCheck is one run of the gate decision.
type targetCheck struct {
	i     *Interceptor
	ctx   context.Context
	scope TargetScope
	ref   db.TargetScopeRef
	tool  string
	input []byte
	urls  []string // the URLs the call declares, as written, for the URL block rules
	// redirectFrom is the origin (host:port) of a redirect hop; empty for a call.
	redirectFrom string
	// fresh makes every lookup skip the cache: the decision of a connection
	// (dialTarget) compares the answer it is about to dial.
	fresh bool
	// checked is what the run decided about each target, read by dialTarget.
	checked []*checkedTarget
}

// What let a target pass, recorded in checkedTarget.cover.
const (
	coverDerived  = "derived"   // an exemption derived from the configuration
	coverStored   = "stored"    // a stored exemption that holds
	coverPin      = "pin"       // a pin that holds every resolved address
	coverNameOnly = "name_only" // a pin that is name-only for this call
)

// checkedTarget is one target of the call and what the gate learned about it.
type checkedTarget struct {
	Target
	ips        []string // resolved addresses; the literal itself for an IP or a CIDR
	resolver   string
	resolvedAt time.Time
	err        error // the name did not resolve
	exemptVoid bool
	cover      string // what let the target pass; empty when nothing did
}

func (t Target) String() string {
	return targetName(TargetRequest{Host: t.Host, Port: t.Port})
}

func (t *checkedTarget) audit(outcome string) db.InterceptTarget {
	return db.InterceptTarget{Host: t.Host, Port: t.Port, Kind: t.Kind, ResolvedIPs: t.ips,
		Resolver: t.resolver, ResolvedAt: t.resolvedAt, Outcome: outcome, ExemptVoid: t.exemptVoid}
}

func (c *targetCheck) run(targets []Target) ([]TargetRequest, TargetResult) {
	i := c.i
	var err error
	if c.ref, err = c.scope.ref(); err != nil {
		return nil, TargetResult{Code: TargetGateUnavailable, Host: targets[0].Host, Port: targets[0].Port, Reason: err.Error()}
	}
	first := &checkedTarget{Target: targets[0]}
	rules, err := i.targets.BlockRules(c.ref)
	if err != nil {
		return c.block(TargetGateUnavailable, "gate_unavailable", first, "the asset rules could not be read: "+err.Error())
	}
	ex, err := i.loadExemptions()
	if err != nil {
		return c.block(TargetGateUnavailable, "gate_unavailable", first, "the exemption list could not be read: "+err.Error())
	}

	// Block rules come first, and an exempt or pinned host that matches one is
	// blocked. They are matched on what the call declares before anything is
	// resolved: a hit there costs no lookup, for any target of the call.
	//
	// URL rules (exact_url, fuzzy_url) are matched once per decision, on the
	// URLs as the call writes them. That is a known limit: exact_url compares
	// the string as written, so another case, encoding (%2F), a trailing slash,
	// an added query or /./ does not match, and fuzzy_url is evaded by encoding
	// the substring; a command can also build its URL at run time. To keep an
	// agent away from a host, a domain, IP or CIDR rule is the one to write.
	if rule, u, hit := db.MatchAssetInterceptRules(rules, nil, nil, c.urls); hit {
		ct := &checkedTarget{Target: targets[0]}
		if t, ok := NormalizeTarget(u); ok {
			ct.Target = t
		}
		return c.block(TargetRuleBlocked, "rule_blocked", ct, fmt.Sprintf("%s is blocked by an asset rule. %s", u, rule.Reason()))
	}
	// Then the declared form of every target: the name as written, the IP
	// literal, the range.
	checked := make([]*checkedTarget, len(targets))
	c.checked = checked
	for n, t := range targets {
		ct := &checkedTarget{Target: t}
		checked[n] = ct
		if t.Kind != TargetDomain {
			ct.ips, ct.resolver, ct.resolvedAt = []string{t.Host}, literalResolver, time.Now().UTC()
		}
		if rule, hit := blockRule(rules, ct); hit {
			return c.block(TargetRuleBlocked, "rule_blocked", ct, fmt.Sprintf("%s is blocked by an asset rule. %s", t, rule.Reason()))
		}
	}
	// Only then are the names resolved, and the rules matched on the addresses.
	// A name the configuration exempts is never resolved.
	for _, ct := range checked {
		if ct.Kind != TargetDomain || ex.derived[db.TargetKey(ct.Host, ct.Port)] {
			continue
		}
		c.resolve(ct, c.fresh)
		if rule, hit := blockRule(rules, ct); hit {
			return c.block(TargetRuleBlocked, "rule_blocked", ct, fmt.Sprintf("%s is blocked by an asset rule. %s", ct.Target, rule.Reason()))
		}
	}

	i.mu.RLock()
	proxied := i.upstreamProxy
	toolProxy := i.toolProxy
	i.mu.RUnlock()
	// Behind a proxy the proxy chooses the address it connects to, so every pin
	// is name-only for this call, whatever the pin row says: the proxy can be
	// turned on after a pin was approved. The recording proxy, the global egress
	// proxy and a custom tool's own proxy all count.
	nameOnly := (proxied != nil && proxied()) || (toolProxy != nil && toolProxy(c.tool))

	var unpinned []TargetRequest
	var uses []func()
	for _, ct := range checked {
		key := db.TargetKey(ct.Host, ct.Port)
		if ex.derived[key] {
			ct.cover = coverDerived
			uses = append(uses, func() { c.exemptUsed(ct, ex.digest) })
			continue
		}
		if ex.stored[key] {
			if exemptionHolds(ct) {
				ct.cover = coverStored
				uses = append(uses, func() { c.exemptUsed(ct, ex.digest) })
				continue
			}
			// A void exemption is not a block: the target goes on like any other.
			ct.exemptVoid = true
		}
		if ct.err != nil {
			return c.block(TargetResolveFailed, "resolve_failed", ct, c.resolveFailure(ct))
		}
		pins, err := i.targets.ActivePins(c.ref, ct.Host, ct.Port)
		if err != nil {
			return c.block(TargetGateUnavailable, "gate_unavailable", ct, "the pins could not be read: "+err.Error())
		}
		pin := coveringPin(pins, ct.ips, nameOnly)
		if pin == nil && ct.Kind == TargetDomain && !c.fresh {
			// A request is about to be raised: the addresses a human reads and
			// pins are resolved now, never taken from the cache. A fresh run
			// already has them.
			if c.resolve(ct, true); ct.err != nil {
				return c.block(TargetResolveFailed, "resolve_failed", ct, c.resolveFailure(ct))
			}
			if rule, hit := blockRule(rules, ct); hit {
				return c.block(TargetRuleBlocked, "rule_blocked", ct, fmt.Sprintf("%s is blocked by an asset rule. %s", ct.Target, rule.Reason()))
			}
			pin = coveringPin(pins, ct.ips, nameOnly)
		}
		if pin != nil {
			ct.cover = coverPin
			if nameOnly || pin.NameOnlyEffective {
				ct.cover = coverNameOnly
			}
			uses = append(uses, func() { c.pinUsed(ct, pin, nameOnly) })
			continue
		}
		req := TargetRequest{Host: ct.Host, Port: ct.Port, Kind: ct.Kind, ResolvedIPs: ct.ips,
			Resolver: ct.resolver, ResolvedAt: ct.resolvedAt, Reason: "no_pin", ExemptVoid: ct.exemptVoid}
		if len(pins) > 0 {
			// The request is raised on the key of the pin that exists (the one on
			// the exact port when both exist), so that an approval extends that pin.
			req.Port, req.Reason, req.Pin = pins[0].Port, "new_ip", pins[0]
		}
		if !hasRequest(unpinned, req) {
			unpinned = append(unpinned, req)
		}
	}
	if len(unpinned) > maxUnpinnedTargets {
		names := make([]string, len(unpinned))
		audit := make([]db.InterceptTarget, len(unpinned))
		for n, r := range unpinned {
			names[n] = targetName(r)
			audit[n] = db.InterceptTarget{Host: r.Host, Port: r.Port, Kind: r.Kind, ResolvedIPs: r.ResolvedIPs,
				Resolver: r.Resolver, ResolvedAt: r.ResolvedAt, Reason: r.Reason, Outcome: "too_many"}
		}
		reason := fmt.Sprintf("this call names %d targets that are not approved (%s); at most %d are requested per call",
			len(unpinned), strings.Join(names, ", "), maxUnpinnedTargets)
		c.log("denied", TargetTooMany+": "+reason, "", audit...)
		return nil, TargetResult{Code: TargetTooMany, Host: unpinned[0].Host, Port: unpinned[0].Port, Reason: reason}
	}
	if len(unpinned) == 0 {
		// The call passes: record what let it pass, once per process.
		for _, use := range uses {
			use()
		}
	}
	return unpinned, TargetResult{}
}

// resolve fills the addresses of a name. fresh skips the cache.
func (c *targetCheck) resolve(ct *checkedTarget, fresh bool) {
	ct.resolver = c.i.resolve.name()
	res, err := c.i.resolve.lookup(c.ctx, ct.Host, fresh)
	ct.ips, ct.resolvedAt, ct.err = res.ips, res.at, err
}

func (c *targetCheck) resolveFailure(ct *checkedTarget) string {
	reason := fmt.Sprintf("the platform could not resolve %s (%v)", ct.Host, ct.err)
	if pins, err := c.i.targets.ActivePins(c.ref, ct.Host, ct.Port); err == nil && len(pins) > 0 {
		reason += fmt.Sprintf(", so it cannot compare the address with the approved pin (v%d: %s)",
			pins[0].Version, strings.Join(pins[0].PinnedIPs, ", "))
	}
	return reason
}

// block logs a blocked call as a decided row and returns the block.
func (c *targetCheck) block(code, outcome string, ct *checkedTarget, reason string) ([]TargetRequest, TargetResult) {
	c.log("denied", code+": "+reason, "", ct.audit(outcome))
	return nil, TargetResult{Code: code, Host: ct.Host, Port: ct.Port, Reason: reason}
}

// log writes one decided row of the gate. Best effort: a failed write never
// changes the outcome of the call.
func (c *targetCheck) log(status, reason, configDigest string, targets ...db.InterceptTarget) {
	action := "deny"
	if status == "allowed" {
		action = "allow"
	}
	audit := auditFor(c.ctx, Decision{Action: action, Message: reason, ConfigDigest: configDigest}, c.input, status)
	if status == "allowed" {
		// The row records that a pin or an exemption was used, not this one call.
		audit.ExecutionStatus = "unknown"
	}
	for n := range targets {
		targets[n].RedirectFrom = c.redirectFrom
	}
	audit.Targets = targets
	_, agentName := taskInfoFromCtx(c.ctx)
	_ = c.i.targets.LogDecision(db.TargetDecision{Scope: c.ref, AgentName: agentName, ToolName: c.tool,
		ToolInput: c.input, Status: status, Reason: reason, Audit: audit})
}

// exemptUsed logs the first call of this process that passes through an
// exemption, per scope, host, port and list digest.
func (c *targetCheck) exemptUsed(ct *checkedTarget, digest string) {
	key := "exempt|" + c.scope.scopeName() + "|" + db.TargetKey(ct.Host, ct.Port) + "|" + digest
	if _, seen := c.i.firstUse.LoadOrStore(key, true); seen {
		return
	}
	c.log("allowed", fmt.Sprintf("Target %s is exempt from target approval for %s.", ct.Target, c.scope.scopeName()),
		digest, ct.audit("exempt"))
}

// pinUsed logs the first call of this process that a pin version covers.
// nameOnly is whether the upstream proxy made every pin name-only for the call:
// the row records the effective state, not only the pin's mark.
func (c *targetCheck) pinUsed(ct *checkedTarget, pin *db.TargetPin, nameOnly bool) {
	if _, seen := c.i.firstUse.LoadOrStore(fmt.Sprintf("pin|%d", pin.ID), true); seen {
		return
	}
	t := ct.audit("pin_match")
	t.PinID, t.PinVersion, t.PinnedIPs, t.NameOnlyEffective = pin.ID, pin.Version, pin.PinnedIPs, pin.NameOnlyEffective || nameOnly
	c.log("allowed", fmt.Sprintf("Target %s is covered by pin v%d of %s.", ct.Target, pin.Version, c.scope.scopeName()), "", t)
}

// blockRule matches the asset block rules against a target: its name, and its
// addresses. A range is matched as written and by its network address. URL
// rules are not matched here: run matches them once, on the declared URLs.
func blockRule(rules []db.AssetInterceptRule, ct *checkedTarget) (db.AssetInterceptRule, bool) {
	var domains []string
	ips := ct.ips
	switch ct.Kind {
	case TargetDomain:
		domains = []string{ct.Host}
	case TargetCIDR:
		if p, err := netip.ParsePrefix(ct.Host); err == nil {
			ips = []string{ct.Host, p.Addr().String()}
		}
	}
	rule, _, hit := db.MatchAssetInterceptRules(rules, domains, ips, nil)
	return rule, hit
}

// exemptionHolds reports whether the stored exemption on a target applies. On a
// name it is void when the name does not resolve or one of its addresses is
// private, loopback or otherwise local. An IP literal is not resolved; it holds
// unless it is an address that can never be exempt.
func exemptionHolds(ct *checkedTarget) bool {
	if ct.Kind == TargetIP {
		return ValidateExemptionHost(ct.Host) == nil
	}
	if ct.Kind != TargetDomain || ct.err != nil || len(ct.ips) == 0 {
		return false
	}
	for _, ip := range ct.ips {
		if voidsExemption(ip) {
			return false
		}
	}
	return true
}

// coveringPin returns the pin that covers the resolved addresses: the first
// candidate that is name-only, or that holds every address. The address sets
// of two pins are never merged.
func coveringPin(pins []*db.TargetPin, resolved []string, nameOnly bool) *db.TargetPin {
	for _, p := range pins {
		if nameOnly || p.NameOnlyEffective || subset(resolved, p.PinnedIPs) {
			return p
		}
	}
	return nil
}

func hasRequest(list []TargetRequest, r TargetRequest) bool {
	for _, x := range list {
		if x.Host == r.Host && x.Port == r.Port {
			return true
		}
	}
	return false
}
