package egress

import (
	"context"
	"encoding/base64"
	"net/url"
	"strings"
)

// Bash commands reach targets through the recording proxy, outside the clients
// this package governs. With traffic capture on, the proxy URL in their
// environment carries a marker userinfo (MarkProxyURL). The proxy paces each
// request of a marked client connection with Wait, and leaves unmarked
// connections alone: WebFetch, the http custom tools and the enrich probe use
// the plain proxy URL and are already paced by their governor, so no request
// is paced twice. Best effort, not a security boundary: a command that ignores
// the proxy, or drops the marker, is not paced.

// PaceUser is the user and password of the marker userinfo.
const PaceUser = "artex-pace"

// MarkProxyURL returns raw with the marker userinfo. raw is returned unchanged
// when it does not parse or already carries a userinfo.
func MarkProxyURL(raw string) string {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" || u.User != nil {
		return raw
	}
	u.User = url.UserPassword(PaceUser, PaceUser)
	return u.String()
}

// IsPaceMarker reports whether a Proxy-Authorization value is Basic
// credentials for PaceUser.
func IsPaceMarker(proxyAuthorization string) bool {
	scheme, enc, ok := strings.Cut(strings.TrimSpace(proxyAuthorization), " ")
	if !ok || !strings.EqualFold(scheme, "Basic") {
		return false
	}
	dec, err := base64.StdEncoding.DecodeString(strings.TrimSpace(enc))
	if err != nil {
		return false
	}
	user, _, _ := strings.Cut(string(dec), ":")
	return user == PaceUser
}

// Wait paces one request to hostKey under the current profile. See
// Governor.Wait.
func Wait(ctx context.Context, hostKey string) error { return Current().Wait(ctx, hostKey) }

// Wait takes a token of the host's bucket plus the jitter, as a governed request
// does, and counts the request in the host's noise counter. It takes no
// in-flight slot, and nothing is cached, coalesced or retried. Off, it returns
// at once and counts nothing. An error means ctx ended first; the request is
// counted either way, since the caller sends it regardless.
func (g *Governor) Wait(ctx context.Context, hostKey string) error {
	if g.off() {
		return nil
	}
	h := g.host(hostKey)
	err := sleep(ctx, g.reserve(h)+g.jitter())
	g.mu.Lock()
	h.sent++
	g.mu.Unlock()
	return err
}
