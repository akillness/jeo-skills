package server

import (
	"net/http"
	"net/netip"
)

// Security headers are split in two layers so the API and the operator console
// each get what applies to them.

// securityHeaders applies the response headers that are safe for every response,
// including the JSON API. It wraps the whole handler tree so no route can forget
// them: a missing nosniff on a JSON reply is exactly the kind of gap that only
// shows up on the one route nobody remembered.
func (s *Server) securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		// Do not leak workspace paths and task ids to third parties.
		h.Set("Referrer-Policy", "same-origin")
		// The API is JSON, but a proxied error page must still not be framed.
		h.Set("X-Frame-Options", "SAMEORIGIN")
		h.Set("Content-Security-Policy", "frame-ancestors 'self'")
		if s.isHTTPS(r) {
			// Ignored by browsers over plain HTTP, so it only takes effect behind
			// the TLS-terminating proxy this deployment is documented to use.
			h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		next.ServeHTTP(w, r)
	})
}

// consoleHeaders applies the headers that only make sense on documents, on top of
// the ones securityHeaders already set. Called from the console route.
func consoleHeaders(h http.Header) {
	// The console needs no device APIs; keep them from being promptable.
	h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()")
	// Separate the console's browsing context from the tabs it opens.
	h.Set("Cross-Origin-Opener-Policy", "same-origin")
	h.Set("Cross-Origin-Resource-Policy", "same-origin")
}

// isHTTPS reports whether the request reached us over TLS, either directly or
// through a trusted proxy that says so. X-Forwarded-Proto is only believed when
// the peer is in ARTEX_TRUSTED_PROXIES, the same rule clientIP uses: a direct
// client could otherwise claim HTTPS and get a header it cannot back up.
func (s *Server) isHTTPS(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	if r.Header.Get("X-Forwarded-Proto") != "https" {
		return false
	}
	peer, err := netip.ParseAddr(peerIP(r))
	if err != nil {
		return false
	}
	return isTrusted(peer, s.trustedProxies)
}
