package server

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"math/big"
	"net"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Autumn-27/artex/agent"
)

func dialTestServerForHosts(routes map[string]string, fallback func(ctx context.Context, network, addr string) (net.Conn, error)) func(ctx context.Context, network, addr string) (net.Conn, error) {
	return func(ctx context.Context, network, addr string) (net.Conn, error) {
		if target, ok := routes[strings.ToLower(addr)]; ok {
			return (&net.Dialer{}).DialContext(ctx, network, target)
		}
		host, _, err := net.SplitHostPort(addr)
		if err == nil {
			if target, ok := routes[strings.ToLower(host)]; ok {
				return (&net.Dialer{}).DialContext(ctx, network, target)
			}
		}
		return fallback(ctx, network, addr)
	}
}

// newTestTLSServer starts an HTTPS httptest server with a leaf certificate
// valid for dnsNames and returns the server and a CertPool trusting it.
func newTestTLSServer(t *testing.T, dnsNames []string, h http.Handler) (*httptest.Server, *x509.CertPool) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	tmpl := &x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: dnsNames[0]},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(time.Hour),
		KeyUsage:              x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
		DNSNames:              dnsNames,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	cert, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatal(err)
	}
	pool := x509.NewCertPool()
	pool.AddCert(cert)

	srv := httptest.NewUnstartedServer(h)
	srv.TLS = &tls.Config{
		Certificates: []tls.Certificate{{
			Certificate: [][]byte{der},
			PrivateKey:  key,
		}},
	}
	srv.StartTLS()
	t.Cleanup(srv.Close)
	return srv, pool
}

func TestLLMModelsRefusesLoopbackBeforeRequest(t *testing.T) {
	t.Setenv(LLMPrivateEndpointsEnv, "")
	var hits atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte("internal secret body"))
	}))
	t.Cleanup(srv.Close)

	// Strict production default: no test seams set.
	s := &Server{}
	for _, tc := range []struct {
		name     string
		provider string
		apiKey   string
	}{
		{"openai", "openai", "sk-test"},
		{"anthropic", "anthropic", "sk-test"},
		{"ollama_keyless", "ollama", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			resp := postJSON(t, s.pgListModels, "/api/llm/models", map[string]any{
				"provider": tc.provider,
				"base_url": srv.URL,
				"api_key":  tc.apiKey,
			})
			if hits.Load() != 0 {
				t.Fatalf("loopback server was contacted (%d hits)", hits.Load())
			}
			if resp["ok"] != false {
				t.Fatalf("expected ok=false, got %v", resp)
			}
			errMsg, _ := resp["error"].(string)
			if errMsg == "" {
				t.Fatalf("expected non-empty refusal error, got %v", resp)
			}
			if strings.Contains(errMsg, "127.0.0.1") || strings.Contains(errMsg, "internal secret") {
				t.Fatalf("error leaked address or body: %q", errMsg)
			}
		})
	}
}

func TestLLMModelsDefaultOllamaAllowedWithoutSeam(t *testing.T) {
	t.Setenv(LLMPrivateEndpointsEnv, "")

	// 1. Caller-supplied DefaultOllamaBaseURL ("http://127.0.0.1:11434/v1") must
	// still be refused with no test seams and no allow-list entry.
	bare := &Server{}
	supplied := postJSON(t, bare.pgListModels, "/api/llm/models", map[string]any{
		"provider": "ollama",
		"base_url": agent.DefaultOllamaBaseURL,
		"api_key":  "",
	})
	if supplied["ok"] != false {
		t.Fatalf("caller-supplied %s must be refused, got %v", agent.DefaultOllamaBaseURL, supplied)
	}
	if errMsg, _ := supplied["error"].(string); !strings.Contains(errMsg, "not allowed") || strings.Contains(errMsg, "127.0.0.1") {
		t.Fatalf("unexpected refusal for caller-supplied ollama URL: %q", errMsg)
	}

	// 2. Empty base_url with provider="ollama" uses the code-owned default and
	// must NOT be refused by URL validation or dial control even with no test seam.
	var ollamaHits atomic.Int32
	fakeOllama := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ollamaHits.Add(1)
		if r.URL.Path != "/v1/models" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"id":"llama3.2"}]}`))
	}))
	t.Cleanup(fakeOllama.Close)

	// Verify the production guard allows dialing only 127.0.0.1:11434 (not other loopback ports).
	s := &Server{}
	s.modelDialContext = dialTestServerForHosts(
		map[string]string{"127.0.0.1:11434": fakeOllama.Listener.Addr().String()},
		(&net.Dialer{Control: newModelURLGuard(s).blockDial}).DialContext,
	)
	resp := postJSON(t, s.pgListModels, "/api/llm/models", map[string]any{
		"provider": "ollama",
		"base_url": "",
		"api_key":  "",
	})
	if ollamaHits.Load() != 1 {
		t.Fatalf("expected default ollama endpoint to be contacted once, got %d", ollamaHits.Load())
	}
	if resp["ok"] != true {
		t.Fatalf("expected ok=true for default ollama without allowLoopbackModels, got %v", resp)
	}
	rawModels, _ := resp["models"].([]any)
	if len(rawModels) != 1 || rawModels[0] != "llama3.2" {
		t.Fatalf("unexpected models: %v", rawModels)
	}

	// Also verify a completely bare Server (zero seams at all) does not refuse
	// {"provider":"ollama","base_url":""} at validation or dial Control.
	bareResp := postJSON(t, bare.pgListModels, "/api/llm/models", map[string]any{
		"provider": "ollama",
		"base_url": "",
		"api_key":  "",
	})
	if bareResp["ok"] == false {
		errMsg, _ := bareResp["error"].(string)
		if strings.Contains(errMsg, "not allowed") {
			t.Fatalf("bare Server refused code-owned default Ollama URL: %q", errMsg)
		}
	}
}

func TestLLMModelsPrivateEndpointsAllowList(t *testing.T) {
	var allowedHits atomic.Int32
	allowedSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		allowedHits.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"id":"local-llama"}]}`))
	}))
	t.Cleanup(allowedSrv.Close)

	var otherPortHits atomic.Int32
	otherPortSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		otherPortHits.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"id":"wrong-port"}]}`))
	}))
	t.Cleanup(otherPortSrv.Close)

	// 1. No allow-list entry -> refused with bare Server (zero test seams).
	t.Setenv(LLMPrivateEndpointsEnv, "")
	bare := &Server{}
	noEntry := postJSON(t, bare.pgListModels, "/api/llm/models", map[string]any{
		"provider": "ollama",
		"base_url": allowedSrv.URL,
		"api_key":  "",
	})
	if allowedHits.Load() != 0 || noEntry["ok"] != false {
		t.Fatalf("expected refusal with empty %s, hits=%d resp=%v", LLMPrivateEndpointsEnv, allowedHits.Load(), noEntry)
	}

	// 2. Allow-listed exact host:port works end-to-end with bare Server (real production dialer + guard).
	t.Setenv(LLMPrivateEndpointsEnv, allowedSrv.Listener.Addr().String()+",host.docker.internal:11434")
	okResp := postJSON(t, bare.pgListModels, "/api/llm/models", map[string]any{
		"provider": "ollama",
		"base_url": allowedSrv.URL,
		"api_key":  "",
	})
	if allowedHits.Load() != 1 || okResp["ok"] != true {
		t.Fatalf("allow-listed endpoint should work, hits=%d resp=%v", allowedHits.Load(), okResp)
	}
	rawModels, _ := okResp["models"].([]any)
	if len(rawModels) != 1 || rawModels[0] != "local-llama" {
		t.Fatalf("unexpected models from allow-listed endpoint: %v", rawModels)
	}

	// 3. Same host on a different port stays refused.
	diffPort := postJSON(t, bare.pgListModels, "/api/llm/models", map[string]any{
		"provider": "ollama",
		"base_url": otherPortSrv.URL,
		"api_key":  "",
	})
	if otherPortHits.Load() != 0 || diffPort["ok"] != false {
		t.Fatalf("same host on another port must be refused, hits=%d resp=%v", otherPortHits.Load(), diffPort)
	}

	// 4. Allow-listed hostname resolving to RFC1918 works on its exact port,
	// stays refused on another port, and still validates scheme & redirects.
	var dockerHits atomic.Int32
	dockerSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		dockerHits.Add(1)
		if r.URL.Path == "/redirect/v1/models" {
			http.Redirect(w, r, otherPortSrv.URL+"/secret", http.StatusFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"id":"docker-qwen"}]}`))
	}))
	t.Cleanup(dockerSrv.Close)

	s := &Server{
		modelLookupIP: func(_ context.Context, host string) ([]netip.Addr, error) {
			if host == "host.docker.internal" {
				return []netip.Addr{netip.MustParseAddr("192.168.65.254")}, nil
			}
			return nil, &net.DNSError{Err: "no such host", Name: host}
		},
	}
	s.modelDialContext = dialTestServerForHosts(
		map[string]string{"host.docker.internal:11434": dockerSrv.Listener.Addr().String()},
		(&net.Dialer{Control: newModelURLGuard(s).blockDial}).DialContext,
	)

	dockerOK := postJSON(t, s.pgListModels, "/api/llm/models", map[string]any{
		"provider": "ollama",
		"base_url": "http://host.docker.internal:11434",
		"api_key":  "",
	})
	if dockerHits.Load() != 1 || dockerOK["ok"] != true {
		t.Fatalf("allow-listed docker host should work, hits=%d resp=%v", dockerHits.Load(), dockerOK)
	}

	dockerWrongPort := postJSON(t, s.pgListModels, "/api/llm/models", map[string]any{
		"provider": "ollama",
		"base_url": "http://host.docker.internal:8080",
		"api_key":  "",
	})
	if dockerWrongPort["ok"] != false {
		t.Fatalf("docker host on wrong port must be refused: %v", dockerWrongPort)
	}

	dockerBadScheme := postJSON(t, s.pgListModels, "/api/llm/models", map[string]any{
		"provider": "ollama",
		"base_url": "ftp://host.docker.internal:11434",
		"api_key":  "",
	})
	if dockerBadScheme["ok"] != false {
		t.Fatalf("disallowed scheme on allow-listed host must be refused: %v", dockerBadScheme)
	}

	dockerBadRedirect := postJSON(t, s.pgListModels, "/api/llm/models", map[string]any{
		"provider": "ollama",
		"base_url": "http://host.docker.internal:11434/redirect",
		"api_key":  "",
	})
	if otherPortHits.Load() != 0 || dockerBadRedirect["ok"] != false {
		t.Fatalf("redirect from allow-listed host to non-listed loopback port must be refused, hits=%d resp=%v", otherPortHits.Load(), dockerBadRedirect)
	}

	// 5. Cloud metadata remains refused even if mistakenly added to the env var.
	t.Setenv(LLMPrivateEndpointsEnv, "169.254.169.254:80,[fd00:ec2::254]:80")
	for _, metaURL := range []string{"http://169.254.169.254/latest/meta-data/", "http://[fd00:ec2::254]/latest/meta-data/"} {
		metaResp := postJSON(t, bare.pgListModels, "/api/llm/models", map[string]any{
			"provider": "openai",
			"base_url": metaURL,
			"api_key":  "sk-test",
		})
		if metaResp["ok"] != false {
			t.Fatalf("metadata URL %s must stay refused even if listed: %v", metaURL, metaResp)
		}
	}
}

func TestLLMModelsRefusesMetadataAndRestrictedAddresses(t *testing.T) {
	t.Setenv(LLMPrivateEndpointsEnv, "")
	s := &Server{}
	for _, tc := range []struct {
		name    string
		baseURL string
		noLeak  string
	}{
		{"aws_metadata", "http://169.254.169.254/latest/meta-data/", "169.254.169.254"},
		{"rfc1918_10", "http://10.0.0.1/v1", "10.0.0.1"},
		{"rfc1918_172", "http://172.16.0.1/v1", "172.16.0.1"},
		{"rfc1918_192", "http://192.168.1.1/v1", "192.168.1.1"},
		{"unique_local_v6", "http://[fc00::1]/v1", "fc00::1"},
		{"unique_local_fd", "http://[fd12:3456::1]/v1", "fd12:3456::1"},
		{"unspecified_v4", "http://0.0.0.0/v1", "0.0.0.0"},
		{"unspecified_v6", "http://[::]/v1", "::"},
		{"loopback_v6", "http://[::1]:8080/v1", "::1"},
		{"link_local_v6", "http://[fe80::1]/v1", "fe80::1"},
		{"v4_mapped_loopback", "http://[::ffff:127.0.0.1]/v1", "127.0.0.1"},
		{"v4_mapped_metadata", "http://[::ffff:169.254.169.254]/v1", "169.254.169.254"},
		{"aws_imds_v6", "http://[fd00:ec2::254]/latest/meta-data/", "fd00:ec2::254"},
		{"alibaba_metadata", "http://100.100.100.200/latest/meta-data/", "100.100.100.200"},
		{"decimal_loopback", "http://2130706433/v1", "127.0.0.1"},
		{"hex_metadata", "http://0xa9.254.0xa9fe/latest/meta-data/", "169.254.169.254"},
		{"localhost", "http://localhost:8080/v1", "127.0.0.1"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			resp := postJSON(t, s.pgListModels, "/api/llm/models", map[string]any{
				"provider": "openai",
				"base_url": tc.baseURL,
				"api_key":  "sk-test",
			})
			if resp["ok"] != false {
				t.Fatalf("expected ok=false for %s, got %v", tc.baseURL, resp)
			}
			errMsg, _ := resp["error"].(string)
			if errMsg == "" {
				t.Fatalf("expected error message for %s", tc.baseURL)
			}
			if tc.noLeak != "" && strings.Contains(errMsg, tc.noLeak) {
				t.Fatalf("error leaked address %q: %q", tc.noLeak, errMsg)
			}
		})
	}

	// Resolved DNS addresses must be checked and must never leak into the error.
	for _, tc := range []struct {
		name   string
		addrs  []netip.Addr
		noLeak string
	}{
		{"dns_private", []netip.Addr{netip.MustParseAddr("10.23.45.67")}, "10.23.45.67"},
		{"dns_metadata", []netip.Addr{netip.MustParseAddr("169.254.169.254")}, "169.254.169.254"},
		{"dns_unique_local", []netip.Addr{netip.MustParseAddr("fd00::42")}, "fd00::42"},
		{"dns_mixed_public_and_loopback", []netip.Addr{netip.MustParseAddr("93.184.216.34"), netip.MustParseAddr("127.0.0.1")}, "127.0.0.1"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rs := &Server{
				modelLookupIP: func(_ context.Context, _ string) ([]netip.Addr, error) {
					return tc.addrs, nil
				},
			}
			resp := postJSON(t, rs.pgListModels, "/api/llm/models", map[string]any{
				"provider": "openai",
				"base_url": "http://internal.example/v1",
				"api_key":  "sk-test",
			})
			if resp["ok"] != false {
				t.Fatalf("expected ok=false, got %v", resp)
			}
			errMsg, _ := resp["error"].(string)
			if errMsg == "" || strings.Contains(errMsg, tc.noLeak) {
				t.Fatalf("unexpected error %q (must be non-empty and not contain %q)", errMsg, tc.noLeak)
			}
		})
	}
}

func TestLLMModelsRefusesDisallowedSchemes(t *testing.T) {
	t.Setenv(LLMPrivateEndpointsEnv, "")
	s := &Server{}
	for _, raw := range []string{
		"file:///etc/passwd",
		"ftp://api.example.com/v1",
		"gopher://api.example.com:70/1",
		"javascript:alert(1)",
	} {
		resp := postJSON(t, s.pgListModels, "/api/llm/models", map[string]any{
			"provider": "openai",
			"base_url": raw,
			"api_key":  "sk-test",
		})
		if resp["ok"] != false {
			t.Fatalf("scheme %q was not refused: %v", raw, resp)
		}
		if errMsg, _ := resp["error"].(string); !strings.Contains(errMsg, "http or https") {
			t.Fatalf("scheme %q: expected http/https refusal, got %q", raw, errMsg)
		}
	}
}

func TestLLMModelsRefusesRestrictedProxyAndTargetThroughProxy(t *testing.T) {
	t.Setenv(LLMPrivateEndpointsEnv, "")
	var proxyHits atomic.Int32
	proxySrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		proxyHits.Add(1)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"data":[{"id":"proxied"}]}`))
	}))
	t.Cleanup(proxySrv.Close)

	// 1. Loopback proxy is refused before any request is sent.
	s := &Server{
		modelLookupIP: func(_ context.Context, host string) ([]netip.Addr, error) {
			if host == "api.public.example" {
				return []netip.Addr{netip.MustParseAddr("93.184.216.34")}, nil
			}
			if host == "private-proxy.example" {
				return []netip.Addr{netip.MustParseAddr("10.99.0.1")}, nil
			}
			return nil, &net.DNSError{Err: "no such host", Name: host}
		},
	}
	for _, tc := range []struct {
		name   string
		proxy  string
		noLeak string
	}{
		{"loopback_proxy", proxySrv.URL, "127.0.0.1"},
		{"metadata_proxy", "http://169.254.169.254:80", "169.254.169.254"},
		{"socks5_proxy", "socks5://api.public.example:1080", ""},
		{"dns_private_proxy", "http://private-proxy.example:3128", "10.99.0.1"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			resp := postJSON(t, s.pgListModels, "/api/llm/models", map[string]any{
				"provider": "openai",
				"base_url": "http://api.public.example/v1",
				"proxy":    tc.proxy,
				"api_key":  "sk-test",
			})
			if proxyHits.Load() != 0 {
				t.Fatalf("proxy was contacted (%d hits)", proxyHits.Load())
			}
			if resp["ok"] != false {
				t.Fatalf("expected ok=false, got %v", resp)
			}
			errMsg, _ := resp["error"].(string)
			if errMsg == "" || (tc.noLeak != "" && strings.Contains(errMsg, tc.noLeak)) {
				t.Fatalf("unexpected error %q (must not leak %q)", errMsg, tc.noLeak)
			}
		})
	}

	// 2. Valid public proxy + refused target: target must be rejected before the proxy is contacted.
	s2 := &Server{
		modelLookupIP: func(_ context.Context, host string) ([]netip.Addr, error) {
			if host == "proxy.public.example" {
				return []netip.Addr{netip.MustParseAddr("93.184.216.35")}, nil
			}
			return nil, &net.DNSError{Err: "no such host", Name: host}
		},
	}
	s2.modelDialContext = dialTestServerForHosts(
		map[string]string{"proxy.public.example": proxySrv.Listener.Addr().String()},
		(&net.Dialer{Control: newModelURLGuard(s2).blockDial}).DialContext,
	)
	resp := postJSON(t, s2.pgListModels, "/api/llm/models", map[string]any{
		"provider": "openai",
		"base_url": "http://169.254.169.254/latest/meta-data/",
		"proxy":    "http://proxy.public.example:8080",
		"api_key":  "sk-test",
	})
	if proxyHits.Load() != 0 {
		t.Fatalf("proxy was contacted for refused target (%d hits)", proxyHits.Load())
	}
	if resp["ok"] != false {
		t.Fatalf("expected ok=false, got %v", resp)
	}
	if errMsg, _ := resp["error"].(string); strings.Contains(errMsg, "169.254.169.254") {
		t.Fatalf("error leaked metadata address: %q", errMsg)
	}

	// 3. Valid public proxy + public target that returns 302 to 127.0.0.1:
	// the proxy must see the first request only, never the redirect target.
	var proxyReqs []string
	redirProxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		proxyReqs = append(proxyReqs, r.URL.String())
		http.Redirect(w, r, "http://127.0.0.1:9999/secret", http.StatusFound)
	}))
	t.Cleanup(redirProxy.Close)

	s3 := &Server{
		modelLookupIP: func(_ context.Context, host string) ([]netip.Addr, error) {
			switch host {
			case "proxy.public.example":
				return []netip.Addr{netip.MustParseAddr("93.184.216.35")}, nil
			case "api.public.example":
				return []netip.Addr{netip.MustParseAddr("93.184.216.34")}, nil
			default:
				return nil, &net.DNSError{Err: "no such host", Name: host}
			}
		},
	}
	s3.modelDialContext = dialTestServerForHosts(
		map[string]string{"proxy.public.example": redirProxy.Listener.Addr().String()},
		(&net.Dialer{Control: newModelURLGuard(s3).blockDial}).DialContext,
	)
	resp3 := postJSON(t, s3.pgListModels, "/api/llm/models", map[string]any{
		"provider": "openai",
		"base_url": "http://api.public.example/v1",
		"proxy":    "http://proxy.public.example:8080",
		"api_key":  "sk-test",
	})
	if len(proxyReqs) != 1 || proxyReqs[0] != "http://api.public.example/v1/models" {
		t.Fatalf("proxy received unexpected requests: %v", proxyReqs)
	}
	if resp3["ok"] != false {
		t.Fatalf("expected ok=false for proxied redirect to loopback, got %v", resp3)
	}
	if errMsg, _ := resp3["error"].(string); errMsg == "" || strings.Contains(errMsg, "127.0.0.1") {
		t.Fatalf("unexpected error %q (must not leak 127.0.0.1)", errMsg)
	}
}

func TestLLMModelsRefusesRedirectToLoopbackAndRestrictedHost(t *testing.T) {
	t.Setenv(LLMPrivateEndpointsEnv, "")
	var targetHits atomic.Int32
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		targetHits.Add(1)
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte("loopback secret"))
	}))
	t.Cleanup(target.Close)

	for _, tc := range []struct {
		name     string
		location string
		noLeak   string
	}{
		{"redirect_to_loopback", target.URL + "/secret", "127.0.0.1"},
		{"redirect_to_metadata", "http://169.254.169.254/latest/meta-data/", "169.254.169.254"},
		{"redirect_to_private_dns", "http://internal.example/secret", "10.44.55.66"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			targetHits.Store(0)
			var redirHits atomic.Int32
			redirector := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				redirHits.Add(1)
				http.Redirect(w, r, tc.location, http.StatusFound)
			}))
			t.Cleanup(redirector.Close)

			s := &Server{
				modelLookupIP: func(_ context.Context, host string) ([]netip.Addr, error) {
					switch host {
					case "public.example":
						return []netip.Addr{netip.MustParseAddr("93.184.216.34")}, nil
					case "internal.example":
						return []netip.Addr{netip.MustParseAddr("10.44.55.66")}, nil
					default:
						return nil, &net.DNSError{Err: "no such host", Name: host}
					}
				},
			}
			s.modelDialContext = dialTestServerForHosts(
				map[string]string{"public.example": redirector.Listener.Addr().String()},
				(&net.Dialer{Control: newModelURLGuard(s).blockDial}).DialContext,
			)

			resp := postJSON(t, s.pgListModels, "/api/llm/models", map[string]any{
				"provider": "openai",
				"base_url": "http://public.example/v1",
				"api_key":  "sk-test",
			})
			if redirHits.Load() != 1 {
				t.Fatalf("expected redirector to be hit once, got %d", redirHits.Load())
			}
			if targetHits.Load() != 0 {
				t.Fatalf("redirect target on loopback was contacted (%d hits)", targetHits.Load())
			}
			if resp["ok"] != false {
				t.Fatalf("expected ok=false, got %v", resp)
			}
			errMsg, _ := resp["error"].(string)
			if errMsg == "" {
				t.Fatalf("expected refusal error, got %v", resp)
			}
			if strings.Contains(errMsg, tc.noLeak) || strings.Contains(errMsg, "loopback secret") {
				t.Fatalf("error leaked address or body: %q", errMsg)
			}
		})
	}
}

func TestLLMModelsRedirectSchemePolicyAndCap(t *testing.T) {
	t.Setenv(LLMPrivateEndpointsEnv, "")

	t.Run("http_to_https_same_host_allowed", func(t *testing.T) {
		httpsSrv, pool := newTestTLSServer(t, []string{"public.example"}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"data":[{"id":"upgraded-model"}]}`))
		}))
		httpSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.Redirect(w, r, "https://public.example/v1/models", http.StatusFound)
		}))
		t.Cleanup(httpSrv.Close)

		s := &Server{
			modelRootCAs: pool,
			modelLookupIP: func(_ context.Context, host string) ([]netip.Addr, error) {
				if host == "public.example" {
					return []netip.Addr{netip.MustParseAddr("93.184.216.34")}, nil
				}
				return nil, &net.DNSError{Err: "no such host", Name: host}
			},
		}
		s.modelDialContext = dialTestServerForHosts(
			map[string]string{
				"public.example:80":  httpSrv.Listener.Addr().String(),
				"public.example:443": httpsSrv.Listener.Addr().String(),
			},
			(&net.Dialer{Control: newModelURLGuard(s).blockDial}).DialContext,
		)

		resp := postJSON(t, s.pgListModels, "/api/llm/models", map[string]any{
			"provider": "openai",
			"base_url": "http://public.example/v1",
			"api_key":  "sk-test",
		})
		if resp["ok"] != true {
			t.Fatalf("expected same-host http->https upgrade to succeed, got %v", resp)
		}
		rawModels, _ := resp["models"].([]any)
		if len(rawModels) != 1 || rawModels[0] != "upgraded-model" {
			t.Fatalf("unexpected models after upgrade: %v", rawModels)
		}
	})

	t.Run("https_to_http_downgrade_refused", func(t *testing.T) {
		var httpHits atomic.Int32
		httpSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			httpHits.Add(1)
			_, _ = w.Write([]byte(`{"data":[{"id":"downgraded"}]}`))
		}))
		t.Cleanup(httpSrv.Close)

		httpsSrv, pool := newTestTLSServer(t, []string{"public.example"}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.Redirect(w, r, "http://public.example/v1/models", http.StatusFound)
		}))

		s := &Server{
			modelRootCAs: pool,
			modelLookupIP: func(_ context.Context, host string) ([]netip.Addr, error) {
				if host == "public.example" {
					return []netip.Addr{netip.MustParseAddr("93.184.216.34")}, nil
				}
				return nil, &net.DNSError{Err: "no such host", Name: host}
			},
		}
		s.modelDialContext = dialTestServerForHosts(
			map[string]string{
				"public.example:80":  httpSrv.Listener.Addr().String(),
				"public.example:443": httpsSrv.Listener.Addr().String(),
			},
			(&net.Dialer{Control: newModelURLGuard(s).blockDial}).DialContext,
		)

		resp := postJSON(t, s.pgListModels, "/api/llm/models", map[string]any{
			"provider": "openai",
			"base_url": "https://public.example/v1",
			"api_key":  "sk-test",
		})
		if httpHits.Load() != 0 {
			t.Fatalf("downgraded HTTP endpoint was contacted (%d hits)", httpHits.Load())
		}
		if resp["ok"] != false {
			t.Fatalf("expected ok=false on https->http downgrade, got %v", resp)
		}
		if errMsg, _ := resp["error"].(string); !strings.Contains(errMsg, "scheme") {
			t.Fatalf("expected scheme refusal error, got %q", errMsg)
		}
	})

	t.Run("http_to_https_cross_host_refused", func(t *testing.T) {
		var otherHits atomic.Int32
		httpsOther, pool := newTestTLSServer(t, []string{"other.public.example"}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			otherHits.Add(1)
			_, _ = w.Write([]byte(`{"data":[{"id":"other"}]}`))
		}))
		httpSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.Redirect(w, r, "https://other.public.example/v1/models", http.StatusFound)
		}))
		t.Cleanup(httpSrv.Close)

		s := &Server{
			modelRootCAs: pool,
			modelLookupIP: func(_ context.Context, host string) ([]netip.Addr, error) {
				switch host {
				case "public.example":
					return []netip.Addr{netip.MustParseAddr("93.184.216.34")}, nil
				case "other.public.example":
					return []netip.Addr{netip.MustParseAddr("93.184.216.35")}, nil
				default:
					return nil, &net.DNSError{Err: "no such host", Name: host}
				}
			},
		}
		s.modelDialContext = dialTestServerForHosts(
			map[string]string{
				"public.example:80":        httpSrv.Listener.Addr().String(),
				"other.public.example:443": httpsOther.Listener.Addr().String(),
			},
			(&net.Dialer{Control: newModelURLGuard(s).blockDial}).DialContext,
		)

		resp := postJSON(t, s.pgListModels, "/api/llm/models", map[string]any{
			"provider": "openai",
			"base_url": "http://public.example/v1",
			"api_key":  "sk-test",
		})
		if otherHits.Load() != 0 {
			t.Fatalf("cross-host HTTPS redirect target was contacted (%d hits)", otherHits.Load())
		}
		if resp["ok"] != false {
			t.Fatalf("expected ok=false on cross-host scheme change, got %v", resp)
		}
		if errMsg, _ := resp["error"].(string); !strings.Contains(errMsg, "scheme") {
			t.Fatalf("expected scheme refusal error, got %q", errMsg)
		}
	})

	t.Run("http_to_file_refused", func(t *testing.T) {
		httpSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.Redirect(w, r, "file:///etc/passwd", http.StatusFound)
		}))
		t.Cleanup(httpSrv.Close)

		s := &Server{
			modelLookupIP: func(_ context.Context, host string) ([]netip.Addr, error) {
				if host == "public.example" {
					return []netip.Addr{netip.MustParseAddr("93.184.216.34")}, nil
				}
				return nil, &net.DNSError{Err: "no such host", Name: host}
			},
		}
		s.modelDialContext = dialTestServerForHosts(
			map[string]string{"public.example": httpSrv.Listener.Addr().String()},
			(&net.Dialer{Control: newModelURLGuard(s).blockDial}).DialContext,
		)

		resp := postJSON(t, s.pgListModels, "/api/llm/models", map[string]any{
			"provider": "openai",
			"base_url": "http://public.example/v1",
			"api_key":  "sk-test",
		})
		if resp["ok"] != false {
			t.Fatalf("expected ok=false on file:// redirect, got %v", resp)
		}
		if errMsg, _ := resp["error"].(string); !strings.Contains(errMsg, "scheme") {
			t.Fatalf("expected scheme refusal error, got %q", errMsg)
		}
	})

	t.Run("too_many_redirects", func(t *testing.T) {
		var hops atomic.Int32
		looper := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			n := hops.Add(1)
			http.Redirect(w, r, "/v1/models?hop="+string(rune('0'+n)), http.StatusFound)
		}))
		t.Cleanup(looper.Close)

		s := &Server{
			modelLookupIP: func(_ context.Context, host string) ([]netip.Addr, error) {
				if host == "public.example" {
					return []netip.Addr{netip.MustParseAddr("93.184.216.34")}, nil
				}
				return nil, &net.DNSError{Err: "no such host", Name: host}
			},
		}
		s.modelDialContext = dialTestServerForHosts(
			map[string]string{"public.example": looper.Listener.Addr().String()},
			(&net.Dialer{Control: newModelURLGuard(s).blockDial}).DialContext,
		)

		resp := postJSON(t, s.pgListModels, "/api/llm/models", map[string]any{
			"provider": "openai",
			"base_url": "http://public.example/v1",
			"api_key":  "sk-test",
		})
		if resp["ok"] != false {
			t.Fatalf("expected ok=false on redirect loop, got %v", resp)
		}
		if errMsg, _ := resp["error"].(string); !strings.Contains(errMsg, "too many redirects") {
			t.Fatalf("expected too many redirects error, got %q", errMsg)
		}
		if hops.Load() > int32(maxModelRedirects) {
			t.Fatalf("followed %d redirects, cap is %d", hops.Load(), maxModelRedirects)
		}
	})
}

func TestLLMModelsChecksEveryCandidateURL(t *testing.T) {
	t.Setenv(LLMPrivateEndpointsEnv, "")
	var flip atomic.Bool
	var seenPaths []string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenPaths = append(seenPaths, r.URL.Path)
		if r.URL.Path == "/anthropic/v1/models" {
			// Flip DNS to a private address before candidate 2 is tried.
			flip.Store(true)
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"id":"should-not-reach"}]}`))
	}))
	t.Cleanup(upstream.Close)

	s := &Server{
		modelLookupIP: func(_ context.Context, host string) ([]netip.Addr, error) {
			if host != "rebind.example" {
				return nil, &net.DNSError{Err: "no such host", Name: host}
			}
			if flip.Load() {
				return []netip.Addr{netip.MustParseAddr("10.77.88.99")}, nil
			}
			return []netip.Addr{netip.MustParseAddr("93.184.216.34")}, nil
		},
	}
	s.modelDialContext = dialTestServerForHosts(
		map[string]string{"rebind.example": upstream.Listener.Addr().String()},
		(&net.Dialer{Control: newModelURLGuard(s).blockDial}).DialContext,
	)

	resp := postJSON(t, s.pgListModels, "/api/llm/models", map[string]any{
		"provider": "anthropic",
		"base_url": "http://rebind.example/anthropic",
		"api_key":  "sk-test",
	})
	if resp["ok"] != false {
		t.Fatalf("expected ok=false when second candidate resolves to private IP, got %v", resp)
	}
	if len(seenPaths) != 1 || seenPaths[0] != "/anthropic/v1/models" {
		t.Fatalf("expected only first candidate to be sent, got %v", seenPaths)
	}
	if errMsg, _ := resp["error"].(string); errMsg == "" || strings.Contains(errMsg, "10.77.88.99") {
		t.Fatalf("unexpected error %q (must not leak resolved IP)", errMsg)
	}
}

func TestLLMModelsPublicEndpointWorks(t *testing.T) {
	t.Setenv(LLMPrivateEndpointsEnv, "")
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/models" {
			// Also verify a safe same-scheme redirect to a public host succeeds.
			http.Redirect(w, r, "http://api.public.example/v2/models", http.StatusFound)
			return
		}
		if r.URL.Path != "/v2/models" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		if r.Header.Get("Authorization") != "Bearer sk-public" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"id":"gpt-4o"},{"id":"o3"}]}`))
	}))
	t.Cleanup(upstream.Close)

	s := &Server{
		modelLookupIP: func(_ context.Context, host string) ([]netip.Addr, error) {
			if host == "api.public.example" {
				return []netip.Addr{netip.MustParseAddr("93.184.216.34")}, nil
			}
			return nil, &net.DNSError{Err: "no such host", Name: host}
		},
	}
	s.modelDialContext = dialTestServerForHosts(
		map[string]string{"api.public.example": upstream.Listener.Addr().String()},
		(&net.Dialer{Control: newModelURLGuard(s).blockDial}).DialContext,
	)

	resp := postJSON(t, s.pgListModels, "/api/llm/models", map[string]any{
		"provider": "openai",
		"base_url": "http://api.public.example/v1",
		"api_key":  "sk-public",
	})
	if resp["ok"] != true {
		t.Fatalf("expected ok=true for normal public endpoint, got %v", resp)
	}
	rawModels, _ := resp["models"].([]any)
	if len(rawModels) != 2 || rawModels[0] != "gpt-4o" || rawModels[1] != "o3" {
		t.Fatalf("unexpected models: %v", rawModels)
	}
}
