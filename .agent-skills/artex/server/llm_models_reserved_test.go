package server

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"sync/atomic"
	"testing"
)

// Ranges that are not public Internet addresses but are neither RFC 1918 nor
// loopback: carrier-grade NAT, the benchmarking range, the IETF protocol
// assignments, the reserved class E block, and NAT64 and 6to4 addresses that
// embed a non-public IPv4 address.
var reservedModelAddrs = map[string][]string{
	"cgnat":         {"100.64.0.1", "100.127.255.254", "::ffff:100.64.0.1"},
	"benchmark":     {"198.18.0.1", "198.19.255.254"},
	"ietf_protocol": {"192.0.0.1", "192.0.0.170"},
	"reserved":      {"240.0.0.1", "250.1.2.3", "255.255.255.255"},
	"nat64":         {"64:ff9b::a9fe:a9fe", "64:ff9b::7f00:1"},
	"six_to_four":   {"2002:a9fe:a9fe::1", "2002:7f00:1::1"},
}

func TestLLMModelsRefusesReservedRanges(t *testing.T) {
	t.Setenv(LLMPrivateEndpointsEnv, "")
	s := &Server{}
	for name, addrs := range reservedModelAddrs {
		for _, a := range addrs {
			addr := netip.MustParseAddr(a)
			if !s.isBlockedModelAddr(addr, false) {
				t.Errorf("%s: %s is allowed, want it blocked", name, a)
			}
			// As a literal host: refused before any request, without the address.
			host := a
			if addr.Is6() {
				host = "[" + a + "]"
			}
			resp := postJSON(t, s.pgListModels, "/api/llm/models", map[string]any{
				"provider": "openai", "base_url": "http://" + host + "/v1", "api_key": "sk-test",
			})
			if errMsg, _ := resp["error"].(string); resp["ok"] != false || errMsg == "" || strings.Contains(errMsg, a) {
				t.Errorf("%s: base_url %s answered %v, want a refusal that does not echo the address", name, a, resp)
			}
			// As the address a public-looking name resolves to.
			rs := &Server{modelLookupIP: func(context.Context, string) ([]netip.Addr, error) {
				return []netip.Addr{netip.MustParseAddr("93.184.216.34"), addr}, nil
			}}
			resp = postJSON(t, rs.pgListModels, "/api/llm/models", map[string]any{
				"provider": "openai", "base_url": "http://models.example/v1", "api_key": "sk-test",
			})
			if errMsg, _ := resp["error"].(string); resp["ok"] != false || errMsg != "endpoint URL host is not allowed" {
				t.Errorf("%s: a name resolving to %s answered %v, want the host refused", name, a, resp)
			}
		}
	}
	// The addresses next to each range stay public.
	for _, a := range []string{"100.63.255.255", "100.128.0.1", "198.17.255.255", "198.20.0.1", "192.0.1.1", "93.184.216.34", "64:ff9a::1", "2001:4860:4860::8888", "2003::1"} {
		if s.isBlockedModelAddr(netip.MustParseAddr(a), false) {
			t.Errorf("%s is blocked, want it allowed", a)
		}
	}
}

// The dial-time guard refuses the same ranges, so a name that changes its
// answer between the check and the connection gains nothing.
func TestLLMModelsDialGuardRefusesReservedRanges(t *testing.T) {
	t.Setenv(LLMPrivateEndpointsEnv, "")
	g := newModelURLGuard(&Server{})
	for _, a := range []string{"100.64.0.1", "198.18.0.1", "192.0.0.1", "240.0.0.1", "64:ff9b::a9fe:a9fe", "2002:a9fe:a9fe::1"} {
		if err := g.blockDial("tcp", net.JoinHostPort(a, "443"), nil); err == nil {
			t.Errorf("dial to %s is allowed, want it refused", a)
		}
	}
	if err := g.blockDial("tcp", "93.184.216.34:443", nil); err != nil {
		t.Errorf("dial to a public address refused: %v", err)
	}
}

// An endpoint the operator listed in ARTEX_LLM_PRIVATE_ENDPOINTS may sit in
// carrier-grade NAT space (an overlay network) or in the benchmarking range
// (a fake-IP resolver), as it may in RFC 1918 space. The other reserved ranges
// and the metadata address inside 100.64.0.0/10 are never allowed.
func TestLLMModelsPrivateEndpointListCoversSharedRanges(t *testing.T) {
	s := &Server{}
	for a, wantBlocked := range map[string]bool{
		"100.64.0.1":         false,
		"198.18.0.1":         false,
		"10.0.0.1":           false,
		"100.100.100.200":    true, // Alibaba Cloud metadata
		"192.0.0.1":          true,
		"240.0.0.1":          true,
		"64:ff9b::a9fe:a9fe": true,
		"2002:a9fe:a9fe::1":  true,
		"169.254.169.254":    true,
	} {
		if got := s.isBlockedModelAddr(netip.MustParseAddr(a), true); got != wantBlocked {
			t.Errorf("allow-listed %s: blocked=%v, want %v", a, got, wantBlocked)
		}
	}
}

// A non-200 answer is reported by its status alone. Echoing the body turned
// the endpoint into a reader of whatever the contacted host returns.
func TestLLMModelsDoesNotEchoUpstreamErrorBody(t *testing.T) {
	t.Setenv(LLMPrivateEndpointsEnv, "")
	const secret = "internal-admin-token-5f2c"
	var hits atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"message":"denied","debug":"` + secret + `"}`))
	}))
	t.Cleanup(upstream.Close)

	s := &Server{modelLookupIP: func(context.Context, string) ([]netip.Addr, error) {
		return []netip.Addr{netip.MustParseAddr("93.184.216.34")}, nil
	}}
	s.modelDialContext = dialTestServerForHosts(
		map[string]string{"api.public.example": upstream.Listener.Addr().String()},
		(&net.Dialer{Control: newModelURLGuard(s).blockDial}).DialContext,
	)
	for _, provider := range []string{"openai", "anthropic", "ollama"} {
		resp := postJSON(t, s.pgListModels, "/api/llm/models", map[string]any{
			"provider": provider, "base_url": "http://api.public.example/v1", "api_key": "sk-public",
		})
		errMsg, _ := resp["error"].(string)
		if resp["ok"] != false || !strings.Contains(errMsg, "403") {
			t.Errorf("%s: answer %v, want ok=false with the status", provider, resp)
		}
		if strings.Contains(errMsg, secret) || strings.Contains(errMsg, "debug") || strings.Contains(errMsg, "denied") {
			t.Errorf("%s: the upstream body was echoed: %q", provider, errMsg)
		}
	}
	if hits.Load() == 0 {
		t.Fatal("the upstream was never contacted, so the test proves nothing")
	}
}
