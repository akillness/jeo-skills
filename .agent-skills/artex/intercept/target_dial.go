package intercept

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/netip"
	"strconv"
	"strings"
	"time"

	"github.com/Autumn-27/artex/db"
)

// The HTTP clients the platform owns (WebFetch and the custom http tool)
// connect through PinnedDialer. The hook, the rendered-URL gate and the
// redirect policy decide on a URL, and the client then resolves the name again
// on its own when it connects: a name can answer differently in between. In a
// gated scope the dialer takes a second, independent decision on the address
// it is asked to connect to (the target of the call, of a redirect hop, or a
// proxy). It resolves the name afresh, compares the answer with the pins, and
// connects only to the addresses it compared, never to the name. It never
// waits: an address no pin covers finds or opens the approval request and
// fails the connection at once with TARGET_APPROVAL_PENDING.

// baseDial opens a connection with the dialer settings of http.DefaultTransport.
var baseDial = (&net.Dialer{Timeout: 30 * time.Second, KeepAlive: 30 * time.Second}).DialContext

// PinnedDialer returns the DialContext of a platform-owned HTTP client run by
// the tool toolName. The scope is read from the context net/http passes to the
// dial, which carries the values of the request's context: the scope the hook,
// the rendered-URL gate and the redirect policy read.
//
// scoped is whether the client was built for a session with a target scope.
// Such a client never dials without one: a scope missing at the dial means the
// context value was lost on the way, and the dial fails with
// TARGET_GATE_UNAVAILABLE. A client built without a scope (the operator's test
// endpoint) dials as before, and so does every client while the gate is off.
func PinnedDialer(toolName string, scoped bool) func(ctx context.Context, network, addr string) (net.Conn, error) {
	return func(ctx context.Context, network, addr string) (net.Conn, error) {
		scope, ok := TargetScopeFromContext(ctx)
		switch {
		case !ok && scoped:
			return nil, &dialError{code: TargetGateUnavailable, target: addr, reason: "the target scope of the session did not reach the connection"}
		case !ok:
			return baseDial(ctx, network, addr)
		case scope.Enabled == nil || !scope.Enabled():
			if scope.Interceptor != nil {
				return scope.Interceptor.baseDialer()(ctx, network, addr)
			}
			return baseDial(ctx, network, addr)
		case scope.Interceptor == nil:
			return nil, &dialError{code: TargetGateUnavailable, target: addr, reason: "the session's target scope carries no gate"}
		}
		return scope.Interceptor.dialTarget(ctx, scope, toolName, network, addr)
	}
}

// GateOn reports whether ctx carries a target scope whose gate is on.
func GateOn(ctx context.Context) bool {
	_, on := renderedScope(ctx)
	return on
}

func (i *Interceptor) baseDialer() func(ctx context.Context, network, addr string) (net.Conn, error) {
	i.mu.RLock()
	defer i.mu.RUnlock()
	return i.dial
}

// dialTarget decides one connection of a gated scope and opens it. The asset
// block rules, exemptions and pins are those of the hook, on the target the
// address names, with a fresh lookup. URL rules are not matched: they ran on
// the URL at the hook and on each hop in RedirectCheck.
//
// A derived exemption, and a pin that is name-only for this connection, dial
// the address as received. A stored exemption that holds, and a pin that
// holds every address of the lookup, dial those addresses and nothing else.
func (i *Interceptor) dialTarget(ctx context.Context, scope TargetScope, toolName, network, addr string) (net.Conn, error) {
	input, _ := json.Marshal(map[string]string{"dial": addr})
	ctx = WithCall(ctx, toolName, input)
	t, err := addrTarget(network, addr)
	if err != nil {
		res := undeterminedTarget(ctx, scope, toolName, input, "the address of the connection could not be read ("+err.Error()+")")
		return nil, &dialError{code: res.Code, target: addr, reason: res.Reason}
	}
	blocked := func(res TargetResult) error {
		return &dialError{code: res.Code, target: t.String(), reason: res.Reason}
	}
	c := &targetCheck{i: i, ctx: ctx, scope: scope, tool: toolName, input: input, fresh: true}
	unpinned, res := c.run([]Target{t})
	if res.Code != "" {
		return nil, blocked(res)
	}
	if len(unpinned) > 0 {
		// Wait bound 0: the request is found or created, and the dial does not wait.
		scope.WaitBound = 0
		res = i.RequestTargets(ctx, scope, toolName, input, unpinned, nil)
		if res.Code == TargetApprovalPending {
			res.Reason = notCovered(unpinned[0], scope)
		}
		return nil, blocked(res)
	}
	switch ct := c.checked[0]; ct.cover {
	case coverDerived, coverNameOnly:
		return i.baseDialer()(ctx, network, addr)
	default:
		return i.dialAddrs(ctx, network, ct.ips, t.Port)
	}
}

// addrTarget reads the address net/http dials, host:port with the host in
// ASCII form and the port always written, as the target urlTarget reads from
// the URL.
func addrTarget(network, addr string) (Target, error) {
	switch network {
	case "tcp", "tcp4", "tcp6":
		return parseTargetAddr(addr)
	default:
		return Target{}, fmt.Errorf("network %q is not tcp", network)
	}
}

// addrTargetUDP reads the address a UDP relay datagram names.
func addrTargetUDP(network, addr string) (Target, error) {
	switch network {
	case "udp", "udp4", "udp6":
		return parseTargetAddr(addr)
	default:
		return Target{}, fmt.Errorf("network %q is not udp", network)
	}
}

func parseTargetAddr(addr string) (Target, error) {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return Target{}, err
	}
	kind, h, ok := normalizeHost(host, true)
	if !ok || kind == TargetCIDR {
		return Target{}, fmt.Errorf("host %q", host)
	}
	t := Target{Kind: kind, Host: h, Port: validPort(port)}
	if t.Port == 0 {
		return Target{}, fmt.Errorf("port %q", port)
	}
	return t, nil
}

// dialAddrs connects to the addresses the decision compared, in their canonical
// order: the first that accepts wins. An address of the wrong family for tcp4
// or tcp6 is skipped. When every attempt fails, the last error is returned.
func (i *Interceptor) dialAddrs(ctx context.Context, network string, ips []string, port int) (net.Conn, error) {
	dial := i.baseDialer()
	var last error = &net.AddrError{Err: "no suitable address found", Addr: strings.Join(ips, ", ")}
	for _, ip := range ips {
		a, err := netip.ParseAddr(ip)
		if err != nil || network == "tcp4" && !a.Is4() || network == "tcp6" && !a.Is6() {
			continue
		}
		conn, err := dial(ctx, network, net.JoinHostPort(ip, strconv.Itoa(port)))
		if err == nil {
			return conn, nil
		}
		last = err
	}
	return nil, last
}

// notCovered says why a connection needs an approval: the addresses the dial
// resolved, and the pin they fall outside of.
func notCovered(r TargetRequest, scope TargetScope) string {
	if r.Pin != nil {
		return fmt.Sprintf("%s now resolves to %s, outside pin v%d (%s) of %s",
			r.Host, strings.Join(r.ResolvedIPs, ", "), r.Pin.Version, strings.Join(r.Pin.PinnedIPs, ", "), scope.scopeName())
	}
	if r.Kind != TargetDomain {
		return fmt.Sprintf("%s is not approved for %s", r.Host, scope.scopeName())
	}
	return fmt.Sprintf("%s resolves to %s and is not approved for %s", r.Host, strings.Join(r.ResolvedIPs, ", "), scope.scopeName())
}

// dialError is what PinnedDialer returns for a connection it does not open.
// Both clients hand the error to the model as the tool result.
type dialError struct {
	code, target, reason string
}

func (e *dialError) Error() string {
	msg := "[ARTEX platform control, not target defense] " + e.code + ": the connection to " + e.target + " was not opened: " + e.reason + "."
	if e.code == TargetApprovalPending {
		msg += " An approval was requested. Retry the same call after the approval."
	}
	return msg + " Do not fetch the target with another tool or by its address."
}

// IsTargetBlocked reports whether err came from PinnedDialer / DialSOCKS5
// refusing a target before dialing (rule block, unpinned target, or unavailable
// target gate), returning its platform control code.
func IsTargetBlocked(err error) (string, bool) {
	var de *dialError
	if errors.As(err, &de) {
		return de.code, true
	}
	return "", false
}

// DialSOCKS5 enforces the platform's target gate before dialing a SOCKS5
// CONNECT destination, reusing the same policy functions as PinnedDialer:
//   - When ctx carries an enabled TargetScope, delegates directly to dialTarget
//     (asset block rules, exemptions, fresh DNS resolution, and pin checks).
//   - Otherwise enforces global asset block rules (domain, IP, and CIDR, before
//     and after fresh DNS resolution) and dials only the resolved addresses that
//     passed those rules.
func (i *Interceptor) DialSOCKS5(ctx context.Context, network, addr string) (net.Conn, error) {
	if i == nil {
		return baseDial(ctx, network, addr)
	}
	if scope, ok := TargetScopeFromContext(ctx); ok && scope.Enabled != nil && scope.Enabled() {
		return i.dialTarget(ctx, scope, "socks5", network, addr)
	}
	t, err := addrTarget(network, addr)
	if err != nil {
		return nil, &dialError{code: TargetGateUnavailable, target: addr, reason: "the address of the connection could not be read (" + err.Error() + ")"}
	}
	if i.targets == nil {
		return i.baseDialer()(ctx, network, addr)
	}
	rules, err := i.targets.BlockRules(db.TargetScopeRef{})
	if err != nil {
		return nil, &dialError{code: TargetGateUnavailable, target: t.String(), reason: "the asset rules could not be read: " + err.Error()}
	}
	ct := &checkedTarget{Target: t}
	if t.Kind != TargetDomain {
		ct.ips, ct.resolver, ct.resolvedAt = []string{t.Host}, literalResolver, time.Now().UTC()
	}
	if rule, hit := blockRule(rules, ct); hit {
		return nil, &dialError{code: TargetRuleBlocked, target: t.String(), reason: fmt.Sprintf("%s is blocked by an asset rule. %s", t, rule.Reason())}
	}
	if t.Kind == TargetDomain {
		c := &targetCheck{i: i, ctx: ctx, tool: "socks5", fresh: true}
		c.resolve(ct, true)
		if ct.err != nil {
			return nil, ct.err
		}
		if rule, hit := blockRule(rules, ct); hit {
			return nil, &dialError{code: TargetRuleBlocked, target: t.String(), reason: fmt.Sprintf("%s is blocked by an asset rule. %s", t, rule.Reason())}
		}
	}
	return i.dialAddrs(ctx, network, ct.ips, t.Port)
}

// PinnedUDP4Resolver returns a per-datagram IPv4 destination resolver that
// enforces the platform's target gate identically to PinnedDialer. When scoped
// is true, a missing or incomplete TargetScope fails closed with
// TARGET_GATE_UNAVAILABLE.
func PinnedUDP4Resolver(toolName string, scoped bool) func(ctx context.Context, addr string) (*net.UDPAddr, error) {
	return func(ctx context.Context, addr string) (*net.UDPAddr, error) {
		scope, ok := TargetScopeFromContext(ctx)
		switch {
		case !ok && scoped:
			return nil, &dialError{code: TargetGateUnavailable, target: addr, reason: "the target scope of the session did not reach the connection"}
		case !ok:
			return resolvePlainUDP4(ctx, addr)
		case scope.Enabled == nil || !scope.Enabled():
			if scope.Interceptor != nil {
				return scope.Interceptor.ResolveUDP4(ctx, addr)
			}
			return resolvePlainUDP4(ctx, addr)
		case scope.Interceptor == nil:
			return nil, &dialError{code: TargetGateUnavailable, target: addr, reason: "the session's target scope carries no gate"}
		}
		return scope.Interceptor.resolveTargetUDP4(ctx, scope, toolName, addr)
	}
}

// ResolveUDP4 enforces the platform's target gate before forwarding a SOCKS5
// UDP ASSOCIATE datagram, reusing the exact same asset block rules, fresh DNS
// resolution, and TargetScope pin/exemption logic as DialSOCKS5 / PinnedDialer.
// Returns the first verified IPv4 *net.UDPAddr.
func (i *Interceptor) ResolveUDP4(ctx context.Context, addr string) (*net.UDPAddr, error) {
	if i == nil {
		return resolvePlainUDP4(ctx, addr)
	}
	if scope, ok := TargetScopeFromContext(ctx); ok && scope.Enabled != nil && scope.Enabled() {
		return i.resolveTargetUDP4(ctx, scope, "socks5-udp", addr)
	}
	t, err := addrTargetUDP("udp4", addr)
	if err != nil {
		return nil, &dialError{code: TargetGateUnavailable, target: addr, reason: "the address of the datagram could not be read (" + err.Error() + ")"}
	}
	if i.targets == nil {
		return resolvePlainUDP4(ctx, addr)
	}
	rules, err := i.targets.BlockRules(db.TargetScopeRef{})
	if err != nil {
		return nil, &dialError{code: TargetGateUnavailable, target: t.String(), reason: "the asset rules could not be read: " + err.Error()}
	}
	ct := &checkedTarget{Target: t}
	if t.Kind != TargetDomain {
		ct.ips, ct.resolver, ct.resolvedAt = []string{t.Host}, literalResolver, time.Now().UTC()
	}
	if rule, hit := blockRule(rules, ct); hit {
		return nil, &dialError{code: TargetRuleBlocked, target: t.String(), reason: fmt.Sprintf("%s is blocked by an asset rule. %s", t, rule.Reason())}
	}
	if t.Kind == TargetDomain {
		c := &targetCheck{i: i, ctx: ctx, tool: "socks5-udp", fresh: true}
		c.resolve(ct, true)
		if ct.err != nil {
			return nil, ct.err
		}
		if rule, hit := blockRule(rules, ct); hit {
			return nil, &dialError{code: TargetRuleBlocked, target: t.String(), reason: fmt.Sprintf("%s is blocked by an asset rule. %s", t, rule.Reason())}
		}
	}
	return firstIPv4UDPAddr(ct.ips, t.Port)
}

func (i *Interceptor) resolveTargetUDP4(ctx context.Context, scope TargetScope, toolName, addr string) (*net.UDPAddr, error) {
	input, _ := json.Marshal(map[string]string{"udp": addr})
	ctx = WithCall(ctx, toolName, input)
	t, err := addrTargetUDP("udp4", addr)
	if err != nil {
		res := undeterminedTarget(ctx, scope, toolName, input, "the address of the datagram could not be read ("+err.Error()+")")
		return nil, &dialError{code: res.Code, target: addr, reason: res.Reason}
	}
	blocked := func(res TargetResult) error {
		return &dialError{code: res.Code, target: t.String(), reason: res.Reason}
	}
	c := &targetCheck{i: i, ctx: ctx, scope: scope, tool: toolName, input: input, fresh: true}
	unpinned, res := c.run([]Target{t})
	if res.Code != "" {
		return nil, blocked(res)
	}
	if len(unpinned) > 0 {
		scope.WaitBound = 0
		res = i.RequestTargets(ctx, scope, toolName, input, unpinned, nil)
		if res.Code == TargetApprovalPending {
			res.Reason = notCovered(unpinned[0], scope)
		}
		return nil, blocked(res)
	}
	switch ct := c.checked[0]; ct.cover {
	case coverDerived, coverNameOnly:
		return resolvePlainUDP4(ctx, addr)
	default:
		return firstIPv4UDPAddr(ct.ips, t.Port)
	}
}

func firstIPv4UDPAddr(ips []string, port int) (*net.UDPAddr, error) {
	for _, raw := range ips {
		a, err := netip.ParseAddr(raw)
		if err == nil && a.Is4() {
			return &net.UDPAddr{IP: net.IP(a.AsSlice()), Port: port}, nil
		}
	}
	return nil, &net.AddrError{Err: "no IPv4 address found", Addr: strings.Join(ips, ", ")}
}

func resolvePlainUDP4(ctx context.Context, addr string) (*net.UDPAddr, error) {
	host, portStr, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, err
	}
	port, err := strconv.Atoi(portStr)
	if err != nil || port <= 0 || port > 65535 {
		return nil, fmt.Errorf("invalid udp port %q", portStr)
	}
	if ip := net.ParseIP(strings.Trim(host, "[]")); ip != nil {
		ip4 := ip.To4()
		if ip4 == nil {
			return nil, &net.AddrError{Err: "IPv6 UDP destination not supported", Addr: addr}
		}
		return &net.UDPAddr{IP: ip4, Port: port}, nil
	}
	ips, err := net.DefaultResolver.LookupIP(ctx, "ip4", host)
	if err != nil {
		return nil, err
	}
	for _, ip := range ips {
		if ip4 := ip.To4(); ip4 != nil {
			return &net.UDPAddr{IP: ip4, Port: port}, nil
		}
	}
	return nil, &net.AddrError{Err: "no IPv4 address found", Addr: addr}
}
