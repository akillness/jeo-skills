package agent

import (
	"context"
	"encoding/json"
	"net/url"

	"github.com/Autumn-27/artex/egress"
	"github.com/Autumn-27/artex/intercept"
	actool "github.com/Autumn-27/norma/tool"
)

// withWebFetch returns tools plus the WebFetch tool of an agent session. Every
// agent kind builds WebFetch here, one tool per run, so that its configuration
// can depend on the run: every redirect hop goes through the target gate
// (intercept.RedirectCheck), and every connection through the pinned dialer
// (intercept.PinnedDialer), on the client that uses proxy and on the direct
// retry client alike. ctx is the context of the run: when it carries a target
// scope the dialer never connects without one, and when that scope's gate is
// on the direct retry is turned off for the run, since it would leave without
// the proxy. The tool is added after the session's own tools, where agentcore
// adds it, so the tool list keeps its order. caCert is the recording proxy's
// CA, trusted to verify the HTTPS it re-signs. Each call goes through the shared
// egress governor (see governedFetch). tools is not modified.
func withWebFetch(ctx context.Context, tools []actool.CoreTool, proxy, caCert string) []actool.CoreTool {
	scope, scoped := intercept.TargetScopeFromContext(ctx)
	gated := scoped && scope.Enabled != nil && scope.Enabled()
	webFetch := actool.NewWebFetch(actool.WebFetchConfig{Proxy: proxy, CACert: caCert, CheckRedirect: intercept.RedirectCheck("WebFetch"),
		DialContext: intercept.PinnedDialer("WebFetch", scoped), DisableDirectRetry: gated})
	return append(tools[:len(tools):len(tools)], governedFetch{webFetch})
}

// egressGovernor resolves the governor of a WebFetch call, once per call so a
// changed noise profile applies to the next call; a test may pin it.
var egressGovernor = egress.Current

// governedFetch runs each WebFetch call as one send under the egress governor
// (off by default; then the call runs unchanged). Under a noise profile it
// paces the call by the rate, jitter and concurrency of the URL's host, and
// nothing else: WebFetch calls are neither coalesced nor cached, since each
// tool carries its own proxy and redirect and dial gate (see egress.Do).
// Norma owns the HTTP client, so redirect hops are not paced separately and a
// 429/503 is not retried.
type governedFetch struct {
	actool.CoreTool
}

func (f governedFetch) Call(ctx context.Context, input json.RawMessage, tc *actool.ToolContext) (actool.Result, error) {
	var in struct {
		URL string `json:"url"`
	}
	if json.Unmarshal(input, &in) != nil {
		return f.CoreTool.Call(ctx, input, tc)
	}
	u, err := url.Parse(in.URL)
	if err != nil || u.Host == "" {
		return f.CoreTool.Call(ctx, input, tc) // the tool reports the bad URL
	}
	return egress.Do(egressGovernor(), ctx, u, func() (actool.Result, error) {
		return f.CoreTool.Call(ctx, input, tc)
	})
}
