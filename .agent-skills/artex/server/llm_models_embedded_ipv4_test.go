package server

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"sync/atomic"
	"testing"
)

// A NAT64 address (64:ff9b::/96, the IPv4 address in the low 32 bits) and a
// 6to4 address (2002::/16, the IPv4 address in bits 16 to 47) reach the IPv4
// host they embed, so they are judged as that host is: a DNS64 resolver hands
// out 64:ff9b::/96 answers for every public IPv4-only provider.
func TestLLMModelsJudgesNAT64And6to4ByEmbeddedIPv4(t *testing.T) {
	t.Setenv(LLMPrivateEndpointsEnv, "")
	s := &Server{}
	for _, tc := range []struct {
		addr, what  string
		wantBlocked bool
	}{
		{"64:ff9b::a9fe:a9fe", "NAT64 of 169.254.169.254 (metadata)", true},
		{"2002:a9fe:a9fe::1", "6to4 of 169.254.169.254 (metadata)", true},
		{"64:ff9b::5db8:d822", "NAT64 of 93.184.216.34 (public)", false},
		{"2002:5db8:d822::1", "6to4 of 93.184.216.34 (public)", false},
		{"64:ff9b::7f00:1", "NAT64 of 127.0.0.1 (loopback)", true},
		{"2002:7f00:1::", "6to4 of 127.0.0.1 (loopback)", true},
		{"64:ff9b::a00:1", "NAT64 of 10.0.0.1 (private)", true},
		{"2002:c0a8:101::1", "6to4 of 192.168.1.1 (private)", true},
		{"64:ff9b::6440:1", "NAT64 of 100.64.0.1 (carrier-grade NAT)", true},
		{"2002:c612:1::1", "6to4 of 198.18.0.1 (benchmarking)", true},
		{"64:ff9b::6464:64c8", "NAT64 of 100.100.100.200 (metadata)", true},
		{"2002:f000:1::1", "6to4 of 240.0.0.1 (reserved)", true},
		{"64:ff9b::c000:1", "NAT64 of 192.0.0.1 (IETF protocol assignments)", true},
		{"64:ff9b::", "NAT64 of 0.0.0.0 (unspecified)", true},
		{"2002::1", "6to4 of 0.0.0.0 (unspecified)", true},
		{"2002:0808:0808:ffff:ffff:ffff:ffff:ffff", "6to4 of 8.8.8.8 (public), any low bits", false},
		{"2001:4860:4860::8888", "plain public IPv6", false},
		{"2606:4700:4700::1111", "plain public IPv6", false},
		// The digits 2002 a9fe a9fe appear, but the first 16 bits are not 2002.
		{"200:2a9f:ea9f:e000::1", "2002 shifted by four bits, outside 2002::/16", false},
		{"20:2a9:fea9:fe00::1", "2002 shifted by eight bits, outside 2002::/16", false},
		{"2001:2002:a9fe:a9fe::1", "2002 in the second group, outside 2002::/16", false},
		{"2003:a9fe:a9fe::1", "the prefix next to 2002::/16", false},
		// Inside 64:ff9b::/64 but outside the /96 that carries an IPv4 address.
		{"64:ff9b::1:a9fe:a9fe", "outside 64:ff9b::/96", false},
	} {
		t.Run(tc.addr, func(t *testing.T) {
			if got := s.isBlockedModelAddr(netip.MustParseAddr(tc.addr), false); got != tc.wantBlocked {
				t.Errorf("%s: blocked=%v, want %v", tc.what, got, tc.wantBlocked)
			}
		})
	}
}

// The dial-time guard applies the same rule to the address it is handed.
func TestLLMModelsDialGuardJudgesEmbeddedIPv4(t *testing.T) {
	t.Setenv(LLMPrivateEndpointsEnv, "")
	g := newModelURLGuard(&Server{})
	for a, wantRefused := range map[string]bool{
		"64:ff9b::a9fe:a9fe": true,
		"2002:a9fe:a9fe::1":  true,
		"64:ff9b::7f00:1":    true,
		"2002:7f00:1::":      true,
		"64:ff9b::5db8:d822": false,
		"2002:5db8:d822::1":  false,
	} {
		t.Run(a, func(t *testing.T) {
			err := g.blockDial("tcp", net.JoinHostPort(a, "443"), nil)
			if refused := err != nil; refused != wantRefused {
				t.Errorf("dial to %s: refused=%v (%v), want %v", a, refused, err, wantRefused)
			}
		})
	}
}

// The URL check runs on the endpoint and on every redirect target: a literal
// or a resolved NAT64 or 6to4 address passes when its IPv4 host is public and
// is refused when it is not.
func TestLLMModelsURLGuardJudgesEmbeddedIPv4(t *testing.T) {
	t.Setenv(LLMPrivateEndpointsEnv, "")
	answers := map[string][]netip.Addr{
		"dns64.example":    {netip.MustParseAddr("64:ff9b::5db8:d822")},
		"metadata.example": {netip.MustParseAddr("93.184.216.34"), netip.MustParseAddr("64:ff9b::a9fe:a9fe")},
		"loopback.example": {netip.MustParseAddr("2002:7f00:1::")},
	}
	g := newModelURLGuard(&Server{modelLookupIP: func(_ context.Context, host string) ([]netip.Addr, error) {
		return answers[host], nil
	}})
	for _, role := range []string{"endpoint", "redirect"} {
		for rawURL, wantRefused := range map[string]bool{
			"https://[64:ff9b::5db8:d822]/v1":                 false,
			"https://[2002:5db8:d822::1]/v1":                  false,
			"https://dns64.example/v1":                        false,
			"http://[64:ff9b::a9fe:a9fe]/latest/meta-data/":   true,
			"http://[2002:a9fe:a9fe::1]/latest/meta-data/":    true,
			"http://[64:ff9b::7f00:1]:8080/":                  true,
			"http://[2002:7f00:1::]:8080/":                    true,
			"https://metadata.example/v1":                     true,
			"https://loopback.example/v1":                     true,
			"https://[2001:4860:4860::8888]/v1":               false,
			"https://[200:2a9f:ea9f:e000::1]/latest/metadata": false,
		} {
			t.Run(role+" "+rawURL, func(t *testing.T) {
				_, err := g.validateURL(context.Background(), rawURL, role)
				if refused := err != nil; refused != wantRefused {
					t.Errorf("refused=%v (%v), want %v", refused, err, wantRefused)
				}
			})
		}
	}
}

// End to end: a provider reached through a NAT64 address is listed, and a
// NAT64 address of the metadata host is refused before any request.
func TestLLMModelsListsThroughNAT64Address(t *testing.T) {
	t.Setenv(LLMPrivateEndpointsEnv, "")
	var hits atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"id":"gpt-test"}]}`))
	}))
	t.Cleanup(upstream.Close)

	s := &Server{}
	// The route is taken only for the NAT64 address itself; every other dial
	// goes through the production guard.
	s.modelDialContext = dialTestServerForHosts(
		map[string]string{"[64:ff9b::5db8:d822]:80": upstream.Listener.Addr().String()},
		(&net.Dialer{Control: newModelURLGuard(s).blockDial}).DialContext,
	)
	resp := postJSON(t, s.pgListModels, "/api/llm/models", map[string]any{
		"provider": "openai", "base_url": "http://[64:ff9b::5db8:d822]/v1", "api_key": "sk-test",
	})
	rawModels, _ := resp["models"].([]any)
	if resp["ok"] != true || hits.Load() != 1 || len(rawModels) != 1 || rawModels[0] != "gpt-test" {
		t.Errorf("NAT64 address of a public host: answer %v after %d requests, want the model list", resp, hits.Load())
	}

	hits.Store(0)
	resp = postJSON(t, s.pgListModels, "/api/llm/models", map[string]any{
		"provider": "openai", "base_url": "http://[64:ff9b::a9fe:a9fe]/v1", "api_key": "sk-test",
	})
	if resp["ok"] != false || resp["error"] != "endpoint URL host is not allowed" || hits.Load() != 0 {
		t.Errorf("NAT64 address of the metadata host: answer %v after %d requests, want a refusal and no request", resp, hits.Load())
	}
}

// An endpoint listed in ARTEX_LLM_PRIVATE_ENDPOINTS gets, behind a NAT64 or
// 6to4 address, what it gets as a bare IPv4 address: private, loopback and
// shared ranges are allowed, link-local, metadata and reserved ones never.
func TestLLMModelsPrivateEndpointListCoversEmbeddedIPv4(t *testing.T) {
	s := &Server{}
	for _, tc := range []struct {
		addr, what  string
		wantBlocked bool
	}{
		{"64:ff9b::a00:1", "NAT64 of 10.0.0.1", false},
		{"2002:a00:1::1", "6to4 of 10.0.0.1", false},
		{"64:ff9b::7f00:1", "NAT64 of 127.0.0.1", false},
		{"64:ff9b::6440:1", "NAT64 of 100.64.0.1", false},
		{"2002:c612:1::1", "6to4 of 198.18.0.1", false},
		{"64:ff9b::a9fe:a9fe", "NAT64 of 169.254.169.254", true},
		{"2002:a9fe:a9fe::1", "6to4 of 169.254.169.254", true},
		{"64:ff9b::6464:64c8", "NAT64 of 100.100.100.200", true},
		{"2002:f000:1::1", "6to4 of 240.0.0.1", true},
		{"64:ff9b::c000:1", "NAT64 of 192.0.0.1", true},
		{"64:ff9b::", "NAT64 of 0.0.0.0", true},
	} {
		t.Run(tc.addr, func(t *testing.T) {
			if got := s.isBlockedModelAddr(netip.MustParseAddr(tc.addr), true); got != tc.wantBlocked {
				t.Errorf("allow-listed %s: blocked=%v, want %v", tc.what, got, tc.wantBlocked)
			}
		})
	}
}
