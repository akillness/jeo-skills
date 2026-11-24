package server

import (
	"crypto/tls"
	"net/http"
	"net/http/httptest"
	"testing"
)

// sharedHeaders apply to every response, API included.
var sharedHeaders = map[string]string{
	"X-Content-Type-Options":  "nosniff",
	"Referrer-Policy":         "same-origin",
	"X-Frame-Options":         "SAMEORIGIN",
	"Content-Security-Policy": "frame-ancestors 'self'",
}

// consoleOnlyHeaders must stay off the API: they are document headers.
var consoleOnlyHeaders = map[string]string{
	"Permissions-Policy":           "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
	"Cross-Origin-Opener-Policy":   "same-origin",
	"Cross-Origin-Resource-Policy": "same-origin",
}

func TestSharedHeadersEverywhere(t *testing.T) {
	handler := (&Server{}).Handler()

	for _, path := range []string{"/", "/settings/", "/api/health", "/api/stats"} {
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, httptest.NewRequest(http.MethodGet, path, nil))
		sent := res.Result().Header
		for name, want := range sharedHeaders {
			if got := sent.Get(name); got != want {
				t.Errorf("%s: %s = %q, want %q", path, name, got, want)
			}
		}
	}
}

func TestConsoleOnlyHeaders(t *testing.T) {
	handler := (&Server{}).Handler()

	for _, path := range []string{"/", "/settings/"} {
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, httptest.NewRequest(http.MethodGet, path, nil))
		sent := res.Result().Header
		for name, want := range consoleOnlyHeaders {
			if got := sent.Get(name); got != want {
				t.Errorf("%s: %s = %q, want %q", path, name, got, want)
			}
		}
	}

	res := httptest.NewRecorder()
	handler.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/health", nil))
	sent := res.Result().Header
	for name := range consoleOnlyHeaders {
		if got := sent.Get(name); got != "" {
			t.Errorf("api: unexpected %s = %q", name, got)
		}
	}
}

// HSTS is only sent when the request is known to be HTTPS; over plain HTTP it is
// inert and would only add noise. X-Forwarded-Proto is believed only from a
// trusted proxy, so a direct client cannot claim HTTPS on its own.
func TestHSTSOnlyOverHTTPS(t *testing.T) {
	handler := (&Server{}).Handler()

	plain := httptest.NewRecorder()
	handler.ServeHTTP(plain, httptest.NewRequest(http.MethodGet, "/", nil))
	if got := plain.Result().Header.Get("Strict-Transport-Security"); got != "" {
		t.Errorf("http: HSTS = %q, want none", got)
	}

	tlsReq := httptest.NewRequest(http.MethodGet, "/", nil)
	tlsReq.TLS = &tls.ConnectionState{}
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, tlsReq)
	if got := res.Result().Header.Get("Strict-Transport-Security"); got == "" {
		t.Error("direct TLS: no HSTS header")
	}
}

// A trusted proxy saying HTTPS earns the header; an untrusted peer saying the
// same must not.
func TestHSTSFromTrustedProxy(t *testing.T) {
	trusted := &Server{trustedProxies: mustTrusted(t, "127.0.0.1/32")}
	handler := trusted.Handler()

	proxied := httptest.NewRequest(http.MethodGet, "/", nil)
	proxied.RemoteAddr = "127.0.0.1:5555"
	proxied.Header.Set("X-Forwarded-Proto", "https")
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, proxied)
	if got := res.Result().Header.Get("Strict-Transport-Security"); got == "" {
		t.Error("trusted proxy: no HSTS header")
	}

	untrusted := (&Server{}).Handler()
	spoof := httptest.NewRequest(http.MethodGet, "/", nil)
	spoof.RemoteAddr = "127.0.0.1:5555"
	spoof.Header.Set("X-Forwarded-Proto", "https")
	res = httptest.NewRecorder()
	untrusted.ServeHTTP(res, spoof)
	if got := res.Result().Header.Get("Strict-Transport-Security"); got != "" {
		t.Errorf("untrusted peer: HSTS = %q, want none", got)
	}
}
