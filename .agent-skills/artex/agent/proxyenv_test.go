package agent

import (
	"strings"
	"testing"
)

func TestProxyEnvEmptyIsNil(t *testing.T) {
	if env := proxyEnv("", ""); env != nil {
		t.Fatalf("proxyEnv(\"\", \"\") = %v, want nil (direct)", env)
	}
}

func TestProxyEnvSetsAllProxyForSocks5(t *testing.T) {
	// Capture-off egress path: a socks5 proxy, no MITM CA. ALL_PROXY must be set
	// (curl reads socks5 only from there), and no CA vars should appear.
	env := proxyEnv("socks5://10.0.0.1:1080", "")
	has := func(prefix string) bool {
		for _, e := range env {
			if strings.HasPrefix(e, prefix) {
				return true
			}
		}
		return false
	}
	for _, want := range []string{"HTTP_PROXY=", "HTTPS_PROXY=", "ALL_PROXY=", "all_proxy="} {
		if !has(want) {
			t.Errorf("proxyEnv missing %s: %v", want, env)
		}
	}
	if has("SSL_CERT_FILE=") || has("CURL_CA_BUNDLE=") {
		t.Errorf("proxyEnv without CA must not inject CA vars: %v", env)
	}
}

func TestProxyEnvInjectsCAWhenRecording(t *testing.T) {
	env := proxyEnv("http://127.0.0.1:8788", "/data/ca.pem")
	has := func(prefix string) bool {
		for _, e := range env {
			if strings.HasPrefix(e, prefix) {
				return true
			}
		}
		return false
	}
	for _, want := range []string{"SSL_CERT_FILE=", "CURL_CA_BUNDLE=", "REQUESTS_CA_BUNDLE=", "NODE_EXTRA_CA_CERTS="} {
		if !has(want) {
			t.Errorf("proxyEnv with CA missing %s: %v", want, env)
		}
	}
}

// Only the recording proxy (a CA is present) gets the pace marker; the global
// proxy of the capture-off path is passed as configured.
func TestProxyEnvMarksOnlyTheRecordingProxy(t *testing.T) {
	proxyVars := map[string]bool{"HTTP_PROXY": true, "HTTPS_PROXY": true, "ALL_PROXY": true}
	check := func(env []string, want, what string) {
		t.Helper()
		n := 0
		for _, e := range env {
			if k, v, _ := strings.Cut(e, "="); proxyVars[strings.ToUpper(k)] {
				n++
				if v != want {
					t.Errorf("%s: %s, want %s", what, e, want)
				}
			}
		}
		if n != 6 {
			t.Errorf("%s: %d proxy variables, want 6", what, n)
		}
	}
	check(proxyEnv("http://127.0.0.1:8788", "/data/ca.pem"), "http://artex-pace:artex-pace@127.0.0.1:8788", "capture on")
	check(proxyEnv("http://u:p@10.0.0.1:3128", ""), "http://u:p@10.0.0.1:3128", "capture off")
}
