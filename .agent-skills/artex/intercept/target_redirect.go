package intercept

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
)

// The HTTP clients the platform owns (WebFetch and the custom http tool)
// follow redirects. The hook and the rendered-URL gate decide on the URL a call
// names; a redirect sends the client to a URL nobody checked. RedirectCheck is
// the redirect policy of those clients: the client asks it before it follows
// each hop, and the hop goes through the same target decision as the call, on
// the URL the client is about to request: the asset block rules on that URL and
// on its target, before any lookup, then exemptions, resolution and pins.

// maxRedirects is the limit net/http applies to a client without a redirect
// policy. Setting a policy replaces it, so RedirectCheck restates it, with the
// same error text.
const maxRedirects = 10

// RedirectCheck returns the redirect policy (http.Client.CheckRedirect) of a
// platform-owned client run by the tool toolName. Everything it needs comes
// from the context of the request, which net/http keeps on every hop: the
// target scope of the session and the Interceptor that owns its gate.
//
// With the gate off, or with no scope in the context (the operator's test
// endpoint), it only applies the limit of 10 hops: nothing is parsed, resolved,
// read or written, and the client behaves as with the default policy.
//
// A hop no pin or exemption covers is not followed, and the policy never waits:
// the fetch has its own deadline, which a human decision does not fit in. The
// request row for the hop's target is found or created (it is durable, so an
// approval given later lets the retried call follow), and the call fails at
// once with TARGET_APPROVAL_PENDING. A block rule, a failed lookup or a hop
// whose target cannot be read fails the call with its block code, and opens no
// request.
func RedirectCheck(toolName string) func(req *http.Request, via []*http.Request) error {
	return func(req *http.Request, via []*http.Request) error {
		if len(via) >= maxRedirects {
			return errors.New("stopped after 10 redirects")
		}
		ctx := req.Context()
		scope, on := renderedScope(ctx)
		if !on {
			return nil
		}
		return checkRedirectHop(ctx, scope, toolName, req.URL.String(), via[len(via)-1].URL.String())
	}
}

// checkRedirectHop runs the gate decision on one hop, from the URL that
// redirected (from) to the URL the client will request (hop).
func checkRedirectHop(ctx context.Context, scope TargetScope, toolName, hop, from string) error {
	input, _ := json.Marshal(map[string]string{"url": hop, "redirect_from": from})
	blocked := func(res TargetResult) error {
		return &redirectError{res: res, from: from, hop: hop, scope: scope.scopeName()}
	}
	t, err := urlTarget(hop)
	if err != nil {
		return blocked(undeterminedTarget(ctx, scope, toolName, input, "the target of the redirect could not be read ("+err.Error()+")"))
	}
	i := scope.Interceptor
	if i == nil {
		return blocked(TargetResult{Code: TargetGateUnavailable, Host: t.Host, Port: t.Port, Reason: "the session's target scope carries no gate"})
	}
	var origin string
	if o, err := urlTarget(from); err == nil {
		origin = o.String()
	}
	ctx = WithCall(ctx, toolName, input)
	c := &targetCheck{i: i, ctx: ctx, scope: scope, tool: toolName, input: input, urls: []string{hop}, redirectFrom: origin}
	unpinned, res := c.run([]Target{t})
	if res.Code == "" && len(unpinned) > 0 {
		// Wait bound 0: the request is found or created, and the call does not wait.
		scope.WaitBound = 0
		for n := range unpinned {
			unpinned[n].RedirectFrom = origin
		}
		res = i.RequestTargets(ctx, scope, toolName, input, unpinned, nil)
	}
	if res.Code == "" {
		return nil
	}
	return blocked(res)
}

// redirectError is what the client returns when a hop is not followed. Both
// tools hand the client error to the model as the tool result.
type redirectError struct {
	res              TargetResult
	from, hop, scope string
}

func (e *redirectError) Error() string {
	target := e.hop
	if e.res.Host != "" {
		target = targetName(TargetRequest{Host: e.res.Host, Port: e.res.Port})
	}
	msg := "[ARTEX platform control, not target defense] " + e.res.Code + ": " + e.from + " redirects to " + target
	if e.res.Code == TargetApprovalPending {
		return msg + ", which is not approved for " + e.scope + ". The redirect was not followed and an approval was requested. " +
			"Retry the same call after the approval. Do not fetch the redirect target directly or with another tool."
	}
	return msg + ": " + e.res.Reason + ". The redirect was not followed. Do not fetch the redirect target directly or with another tool."
}
