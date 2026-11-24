package intercept

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"
)

// The custom tools render their target from a template and the parameters of
// the call, after the hook has seen the call: the hook reads the parameters, not
// the URL or the command they produce, and not a target written in the
// template itself. These functions run the gate inside the tool, on what the
// tool is about to run, before anything is sent or started.

// renderedPasses bounds the request-and-recheck loop of a rendered target, as
// the hook bounds its own: a request that was decided in between, or addresses
// that changed again after an approval, send the call back to the pin lookup at
// most this many times.
const renderedPasses = 3

// GateRenderedURL is the target gate for the URL a custom http tool renders. It
// reads the target as the HTTP client will: the host of the parsed URL and its
// port, else the default port of the scheme. A URL whose target cannot be read
// is blocked with TARGET_GATE_UNAVAILABLE: the call is not executed and no
// approval is requested.
//
// The result is empty when the tool may run. With the gate off, or with no
// scope in ctx (the operator's test endpoint), it returns at once: nothing is
// parsed, resolved, read or written.
func GateRenderedURL(ctx context.Context, toolName, rawURL string) TargetResult {
	scope, on := renderedScope(ctx)
	if !on {
		return TargetResult{}
	}
	input := renderedInput("url", rawURL)
	t, err := urlTarget(rawURL)
	if err != nil {
		return undeterminedTarget(ctx, scope, toolName, input, "the target of the rendered URL could not be read ("+err.Error()+")")
	}
	return gateRendered(ctx, scope, toolName, input, []Target{t}, []string{rawURL})
}

// GateRenderedCommand is the target gate for the command a custom command tool
// renders, read with the command-string rules of Bash. readings are other
// renderings of the same command that are read as well: the shell quoting of a
// parameter placed inside a host name hides that name from the rules, and the
// shell removes the quotes before the command runs. A command that names no
// target passes, as it does in Bash: what a command hides is advisory (D9).
//
// The result is empty when the tool may run. With the gate off, or with no
// scope in ctx, it returns at once.
func GateRenderedCommand(ctx context.Context, toolName, command string, readings ...string) TargetResult {
	scope, on := renderedScope(ctx)
	if !on {
		return TargetResult{}
	}
	var l targetList
	l.scan(command)
	for _, r := range readings {
		l.scan(r)
	}
	return gateRendered(ctx, scope, toolName, renderedInput("command", command), l.targets, l.urls)
}

func renderedScope(ctx context.Context) (TargetScope, bool) {
	scope, ok := TargetScopeFromContext(ctx)
	return scope, ok && scope.Enabled != nil && scope.Enabled()
}

// renderedInput is the tool input recorded with a rendered target: what the
// tool runs, which is what the human reads on the approval.
func renderedInput(field, value string) []byte {
	b, _ := json.Marshal(map[string]string{field: value})
	return b
}

// gateRendered runs the gate decision on the targets of a rendered call, asks
// for the approval of those no pin covers, and checks again after the
// decisions. urls are the URLs the call renders, for the URL block rules. It
// never merges an ask: the rules and the judge decided at the hook, before the
// tool ran.
func gateRendered(ctx context.Context, scope TargetScope, toolName string, input []byte, targets []Target, urls []string) TargetResult {
	if len(targets) == 0 {
		return TargetResult{}
	}
	i := scope.Interceptor
	if i == nil {
		return TargetResult{Code: TargetGateUnavailable, Host: targets[0].Host, Port: targets[0].Port,
			Reason: "the session's target scope carries no gate"}
	}
	ctx = WithCall(ctx, toolName, input)
	check := func() ([]TargetRequest, TargetResult) {
		if !scope.Enabled() {
			return nil, TargetResult{}
		}
		c := &targetCheck{i: i, ctx: ctx, scope: scope, tool: toolName, input: input, urls: urls}
		return c.run(targets)
	}
	unpinned, res := check()
	for pass := 0; res.Code == "" && len(unpinned) > 0; pass++ {
		if pass == renderedPasses {
			t := unpinned[0]
			return TargetResult{Code: TargetApprovalPending, Host: t.Host, Port: t.Port,
				Reason: fmt.Sprintf("the target is still not covered by a pin after %d approval rounds; its addresses changed again", renderedPasses)}
		}
		if res = i.RequestTargets(ctx, scope, toolName, input, unpinned, nil); res.Code != "" {
			return res
		}
		unpinned, res = check()
	}
	return res
}

// undeterminedTarget blocks a call whose target cannot be read, and logs the
// block as a decided row.
func undeterminedTarget(ctx context.Context, scope TargetScope, toolName string, input []byte, reason string) TargetResult {
	res := TargetResult{Code: TargetGateUnavailable, Reason: reason}
	if scope.Interceptor == nil {
		return res
	}
	ref, err := scope.ref()
	if err != nil {
		return res
	}
	c := &targetCheck{i: scope.Interceptor, ctx: WithCall(ctx, toolName, input), scope: scope, ref: ref, tool: toolName, input: input}
	_, res = c.block(TargetGateUnavailable, "gate_unavailable", &checkedTarget{}, reason)
	return res
}

// urlTarget reads the target of a URL the way net/http dials it: the host of
// the parsed URL, and its port, else the default port of the scheme.
func urlTarget(raw string) (Target, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return Target{}, err
	}
	name := u.Hostname()
	if name == "" {
		return Target{}, errors.New("no host")
	}
	kind, host, ok := normalizeHost(name, true)
	if !ok {
		return Target{}, fmt.Errorf("host %q", name)
	}
	t := Target{Kind: kind, Host: host, Port: schemePorts[strings.ToLower(u.Scheme)]}
	if p := u.Port(); p != "" {
		if t.Port = validPort(p); t.Port == 0 {
			return Target{}, fmt.Errorf("port %q", p)
		}
	}
	return t, nil
}
