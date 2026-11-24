package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"syscall"
	"time"
)

// allowLocalTargets decides whether delivering messages to loopback / link-local
// addresses is allowed.
//
// Default is deny. These address ranges are not where IM bots or public mail
// servers live, and what they can reach is very sensitive: the admin port of
// another service on the same machine, and the cloud metadata endpoint
// (169.254.169.254, which gives out instance credentials). Delivery addresses
// are configured by admins, but an admin session hijacked via XSS/CSRF, or a
// second person sharing the same JWT, can change the configuration to read
// response content back — doJSON writes the first 200 bytes of a 4xx/5xx
// response body into last_error, and the delivery history API echoes it back,
// which amounts to a half-blind read primitive.
//
// However, a "local SMTP relay" (postfix on 127.0.0.1:25) is a common setup for
// self-hosted email, and an across-the-board ban would strand people. So there
// is an explicit escape hatch instead of a hardcoded allowance:
// set ARTEX_NOTIFY_ALLOW_LOCAL=1 to allow it.
//
// It is exported as AllowLocalTargetsEnv so tests can turn it on explicitly —
// many test cases in this package and the server package use httptest fake
// receivers on 127.0.0.1, and without turning it on they would all be stopped by
// the guard.
const AllowLocalTargetsEnv = "ARTEX_NOTIFY_ALLOW_LOCAL"

func allowLocalTargets() bool {
	v := strings.TrimSpace(os.Getenv(AllowLocalTargetsEnv))
	return v == "1" || strings.EqualFold(v, "true")
}

// isBlockedDialIP reports whether the target IP belongs to the ranges "not
// allowed for delivery by default".
//
// Only loopback, link-local (including the cloud metadata 169.254.169.254),
// unspecified, and multicast are rejected. RFC1918 private networks are **not**
// rejected: self-hosted Mattermost / SMTP relays on an intranet are very common
// legitimate uses, and blocking them too would make the feature flat-out
// unusable in real environments. This trade-off is deliberate — the protection
// must stop the truly sensitive targets without killing normal deployments along
// the way.
func isBlockedDialIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	// IPv4-mapped IPv6 (::ffff:127.0.0.1) must be converted back to IPv4 before
	// the check, otherwise it bypasses it.
	if v4 := ip.To4(); v4 != nil {
		ip = v4
	}
	return ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsInterfaceLocalMulticast() || ip.IsUnspecified() || ip.IsMulticast()
}

// blockInternalDial is the Control hook of the http.Transport dialer, checking
// the target address **when the connection is established**.
//
// Why at dial time instead of only validating when the configuration is saved:
// this is the final point of enforcement. It covers both ways of bypassing
// configuration-time validation — DNS rebinding (resolving to a public IP at
// validation time but to an intranet IP at connection time) and redirects
// (cross-host redirects are already refused, but a same-host redirect can still
// point the path elsewhere).
func blockInternalDial(_, address string, _ syscall.RawConn) error {
	if allowLocalTargets() {
		return nil
	}
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return err
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return fmt.Errorf("cannot parse target address %q", host)
	}
	if isBlockedDialIP(ip) {
		return fmt.Errorf("refusing to deliver to loopback/link-local address %s (if you really need to deliver to a local service, set %s=1)", ip, AllowLocalTargetsEnv)
	}
	return nil
}

// notifyTransport adds only a dial guard on top of the default Transport. Clone
// keeps all of the default tuning (connection pool, HTTP/2, timeouts, proxy,
// etc.), avoiding changing other behaviors just to add one check.
var notifyTransport = func() *http.Transport {
	t, ok := http.DefaultTransport.(*http.Transport)
	if !ok {
		return &http.Transport{}
	}
	clone := t.Clone()
	// Clone keeps ProxyFromEnvironment. The dial would then be to the proxy, so
	// blockInternalDial would see the proxy address and a link-local target
	// could still be reached through it. Notifications go direct.
	clone.Proxy = nil
	clone.DialContext = (&net.Dialer{Timeout: 10 * time.Second, Control: blockInternalDial}).DialContext
	return clone
}()

// httpClient is the client shared by all channel deliveries.
//
// It deliberately does **not** reuse the project's global egress proxy (the
// server-side GlobalProxy): that proxy is for traffic to penetration-testing
// targets, often an unstable tunnel, and notification availability should not be
// hostage to jitter in the target network. IM pushes go direct. The timeout is
// 15 seconds — a peer slower than that is effectively down.
//
// Cross-host redirects are refused: delivery targets in this feature all take
// the shape of "one fixed endpoint" and would not normally redirect to another
// host; and the credentials of these platforms (DingTalk's access_token, WeCom's
// key, Telegram's bot token) **are in the URL** — following a cross-host redirect
// means handing the credentials to the redirect target. Same-host redirects
// (such as adding a trailing slash) are still allowed.
var httpClient = &http.Client{
	Timeout:   15 * time.Second,
	Transport: notifyTransport,
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return errors.New("too many redirects")
		}
		if len(via) > 0 && req.URL.Host != via[0].URL.Host {
			return fmt.Errorf("refusing cross-host redirect (%s → %s)", via[0].URL.Host, req.URL.Host)
		}
		return nil
	},
}

// respBodyLimit caps how much of the response body is read. An abnormal peer may
// spit back oversized content, while all we need is the error code and a short
// error description to show in the delivery history.
const respBodyLimit = 8 << 10

// doJSON sends one request and returns the response body (length-capped).
//
// A nil payload sends an empty body (for GET or platforms that do not require a
// body). Key-value pairs in headers are appended verbatim, for the generic
// webhook's custom headers.
//
// Error classification is a core responsibility of this function: network-layer
// failures and 5xx/408/429 are "retryable"; the remaining 4xx are "permanent
// failures" — retrying a 403 just logs the same error 3 times.
func doJSON(ctx context.Context, method, url string, headers map[string]string, payload any) ([]byte, error) {
	var body io.Reader
	if payload != nil {
		raw, err := json.Marshal(payload)
		if err != nil {
			// A serialization failure is a local bug (wrong config field type);
			// retrying will not make it better.
			return nil, Permanent(fmt.Errorf("failed to build request body: %w", err))
		}
		body = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, method, url, body)
	if err != nil {
		// Invalid URL — most likely the user mistyped the address; a permanent
		// failure. err must not be passed through here either: url.Parse's error
		// text contains the full address.
		return nil, Permanent(fmt.Errorf("invalid request URL: %s", redactRequestTarget(url)))
	}
	if payload != nil {
		req.Header.Set("Content-Type", "application/json; charset=utf-8")
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		// Connection refused, DNS failure, timeout — mostly transient, handed to
		// backoff retries.
		//
		// The error text must be redacted before being passed on. Reason:
		// http.Client.Do returns a *url.Error whose Error() is
		// `Op "full URL": underlying error`, and the credentials of these
		// platforms **are in the URL** (DingTalk access_token, WeCom key, Feishu
		// hook id, Telegram /bot<token>/). Without redaction, the credentials
		// ride this error string to four places: the last_error column of
		// notification_deliveries (stored in plaintext), the delivery history
		// API response (**bypassing the channel config masking**), server logs,
		// and the 502 text the test-send API returns to the frontend.
		return nil, fmt.Errorf("request failed: %s", redactTransportError(err))
	}
	defer resp.Body.Close()
	raw, readErr := io.ReadAll(io.LimitReader(resp.Body, respBodyLimit))
	if readErr != nil {
		return nil, fmt.Errorf("failed to read response: %w", readErr)
	}
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return raw, nil
	}
	// 429 (rate limit) and 408 (timeout) are worth retrying; the remaining 4xx
	// are configuration or permission problems, and retrying is pointless.
	if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode == http.StatusRequestTimeout {
		return nil, fmt.Errorf("peer rate limit or timeout (HTTP %d): %s", resp.StatusCode, snippet(raw))
	}
	if resp.StatusCode >= 500 {
		return nil, fmt.Errorf("peer server error (HTTP %d): %s", resp.StatusCode, snippet(raw))
	}
	return nil, Permanent(fmt.Errorf("peer rejected the request (HTTP %d): %s", resp.StatusCode, snippet(raw)))
}

// snippet compresses a response body into a one-line short text for error
// messages. Responses can carry newlines and lots of whitespace, and stuffing
// them raw into last_error would wreck the layout of the delivery history page.
func snippet(raw []byte) string {
	return OneLine(string(raw), 200)
}

// redactRequestTarget compresses a delivery address into "scheme://host/…" for
// error messages.
//
// This is the package's only address redaction convention, deliberately made
// **crude enough**: everything except scheme and host is dropped. The reason is
// that there is no "generic and safe" way to tell which part of a URL is the
// credential:
//
//	DingTalk  credential in query            /robot/send?access_token=xxx
//	WeCom     credential in query            /cgi-bin/webhook/send?key=xxx
//	Feishu    credential in the **last path segment** /open-apis/bot/v2/hook/<hook_id>
//	Telegram  credential in the **middle of the path** /bot<token>/sendMessage
//
// "Keeping only the useful parts" means patching per channel, and missing any
// one of them is a credential leak. Keeping the host is already enough for
// troubleshooting (DNS failures, connection failures, certificate problems can
// all be located), and which bot it is can be told from the masked tail hint in
// the channel configuration.
//
// On parse failure a fixed placeholder is returned — the raw string is never
// echoed back.
func redactRequestTarget(raw string) string {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return "(unparseable address)"
	}
	return u.Scheme + "://" + u.Host + "/…"
}

// redactTransportError strips the address from a transport-layer error, keeping
// only the underlying cause.
//
// A *url.Error is structured as {Op, URL, Err}, and Error() prints the URL along
// with it. Here the Err field is taken explicitly, bypassing its Error() — more
// reliable than string replacement after the fact, because replacement has to
// cope correctly with all the URL-encoded/escaped variants and is easy to get
// wrong.
func redactTransportError(err error) string {
	var uerr *url.Error
	if errors.As(err, &uerr) {
		host := ""
		if u, parseErr := url.Parse(uerr.URL); parseErr == nil {
			host = u.Host
		}
		if uerr.Err != nil {
			return fmt.Sprintf("%s %s: %s", uerr.Op, host, uerr.Err)
		}
		return fmt.Sprintf("%s %s: unknown error", uerr.Op, host)
	}
	// Non-*url.Error errors (such as the ones returned by the redirect policy)
	// can also carry addresses; redact them uniformly.
	return redactURLsInText(err.Error())
}

// redactURLsInText replaces http(s) addresses appearing in a piece of text with
// their redacted form.
//
// A fallback for errors whose structured fields are unavailable (redirect policy
// errors, custom errors from third-party libraries). Only http/https prefixes
// are recognized, split on whitespace and quotes — addresses never contain
// either.
func redactURLsInText(s string) string {
	var b strings.Builder
	for i := 0; i < len(s); {
		rest := s[i:]
		if strings.HasPrefix(rest, "http://") || strings.HasPrefix(rest, "https://") {
			end := len(rest)
			if j := strings.IndexAny(rest, " \t\n\"'"); j >= 0 {
				end = j
			}
			b.WriteString(redactRequestTarget(rest[:end]))
			i += end
			continue
		}
		b.WriteByte(s[i])
		i++
	}
	return b.String()
}
