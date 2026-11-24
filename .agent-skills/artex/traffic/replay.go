package traffic

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strings"
	"sync"
	"time"
)

// Replay sends an edited HTTP request through the local recording proxy, so the
// exchange is captured by the proxy's sink like any other traffic and shows up
// in the Traffic list. It is driven only by an operator (POST /api/traffic/replay).

const (
	// maxReplayBody bounds the request body an operator can replay.
	maxReplayBody = 8 * 1024 * 1024
	// maxReplayResponse bounds the response body returned to the caller; the
	// recorded exchange keeps whatever the proxy captured.
	maxReplayResponse = 2 * 1024 * 1024
	// maxReplayHeaders bounds the number of request header lines.
	maxReplayHeaders = 200
	// replayNonceHeader is the internal header Replay attaches when ApplyRules
	// is false (the default). The capture proxy strips it unconditionally
	// before forwarding and bypasses rewrite rules only when the value matches
	// a live registered nonce.
	replayNonceHeader = "X-ARTEX-Replay-Nonce"
)

// replayNonces holds live single-use nonces for in-flight Replay calls that
// bypass capture rewrite rules (ApplyRules == false).
var replayNonces struct {
	mu   sync.Mutex
	live map[string]struct{}
}

func registerReplayNonce() (string, error) {
	var raw [32]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", fmt.Errorf("replay nonce: %w", err)
	}
	nonce := hex.EncodeToString(raw[:])
	replayNonces.mu.Lock()
	if replayNonces.live == nil {
		replayNonces.live = map[string]struct{}{}
	}
	replayNonces.live[nonce] = struct{}{}
	replayNonces.mu.Unlock()
	return nonce, nil
}

func deleteReplayNonce(nonce string) {
	replayNonces.mu.Lock()
	delete(replayNonces.live, nonce)
	replayNonces.mu.Unlock()
}

func consumeReplayNonce(nonce string) bool {
	if nonce == "" {
		return false
	}
	replayNonces.mu.Lock()
	_, ok := replayNonces.live[nonce]
	if ok {
		delete(replayNonces.live, nonce)
	}
	replayNonces.mu.Unlock()
	return ok
}

func replayNonceCount() int {
	replayNonces.mu.Lock()
	n := len(replayNonces.live)
	replayNonces.mu.Unlock()
	return n
}

// ErrReplayInvalid marks a replay request rejected before anything is sent.
var ErrReplayInvalid = errors.New("invalid replay request")

// ErrReplayTooLarge marks a request body over maxReplayBody.
var ErrReplayTooLarge = errors.New("replay body too large")

// ReplayHeader is one request header line, kept as a list so duplicates and
// their order survive.
type ReplayHeader struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

// ReplayRequest is the edited request to send.
type ReplayRequest struct {
	Method     string
	URL        string
	Headers    []ReplayHeader
	Body       []byte
	ApplyRules bool
}

// ReplayResult is the response as received by the client side of the proxy.
type ReplayResult struct {
	Status int
	// Headers are the response headers, keys sorted, every value kept.
	Headers    []ReplayHeader
	Raw        string // status line, headers and (possibly truncated) body
	DurationMS int64
	Truncated  bool // the body exceeded maxReplayResponse and was cut
	// Recorded reports whether the proxy records this exchange: false for an
	// https host the proxy tunnels without interception (passthrough).
	Recorded bool
}

// replayDropped are the headers the client must not send as given: hop-by-hop
// fields and framing that net/http recomputes (Content-Length,
// Transfer-Encoding). Headers named in Connection are dropped too. Upgrade is
// rejected rather than dropped, see Replay.
var replayDropped = map[string]bool{
	"Content-Length":      true,
	"Transfer-Encoding":   true,
	"Connection":          true,
	"Proxy-Connection":    true,
	"Proxy-Authorization": true,
	"Keep-Alive":          true,
	"Te":                  true,
	"Trailer":             true,
	"Expect":              true,
	http.CanonicalHeaderKey(replayNonceHeader): true,
}

// replayRecorded reports whether the proxy records a request to scheme://host:
// plain http is always intercepted, https is unless the host is in passthrough.
func (t *Traffic) replayRecorded(scheme, host string) bool {
	if scheme != "https" {
		return true
	}
	return !t.tunneling(hostOnly(host))
}

func replayInvalid(format string, args ...any) error {
	return fmt.Errorf("%w: %s", ErrReplayInvalid, fmt.Sprintf(format, args...))
}

// validHeaderName reports whether name is an RFC 9110 field name (a token).
func validHeaderName(name string) bool {
	if name == "" {
		return false
	}
	for i := 0; i < len(name); i++ {
		c := name[i]
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9':
		case strings.IndexByte("!#$%&'*+-.^_`|~", c) >= 0:
		default:
			return false
		}
	}
	return true
}

// Replay sends req through the recording proxy and returns the response. The
// proxy's sink records the exchange; Replay never calls record() itself. A host
// the proxy tunnels without interception (passthrough, see maybePassthrough)
// still answers, but that exchange is not recorded (Recorded is false).
//
// Redirects are not followed, no cookie jar is kept, and compression is not
// negotiated: the edited headers go out as given, without an Accept-Encoding
// added by the transport.
func (t *Traffic) Replay(ctx context.Context, req ReplayRequest) (ReplayResult, error) {
	method := strings.TrimSpace(req.Method)
	if method == "" || strings.EqualFold(method, http.MethodConnect) {
		return ReplayResult{}, replayInvalid("method must be set and cannot be CONNECT")
	}
	if !validHeaderName(method) {
		return ReplayResult{}, replayInvalid("method %q is not a valid token", method)
	}
	target, err := url.Parse(strings.TrimSpace(req.URL))
	if err != nil {
		return ReplayResult{}, replayInvalid("url: %v", err)
	}
	if target.Scheme != "http" && target.Scheme != "https" {
		return ReplayResult{}, replayInvalid("url must be absolute http or https")
	}
	if target.Host == "" || target.Hostname() == "" {
		return ReplayResult{}, replayInvalid("url has no host")
	}
	if target.User != nil {
		return ReplayResult{}, replayInvalid("url must not carry user info; send an Authorization header instead")
	}
	if len(req.Body) > maxReplayBody {
		return ReplayResult{}, fmt.Errorf("%w: body is %d bytes, over the %d-byte limit", ErrReplayTooLarge, len(req.Body), maxReplayBody)
	}
	if len(req.Headers) > maxReplayHeaders {
		return ReplayResult{}, replayInvalid("%d headers, over the limit of %d", len(req.Headers), maxReplayHeaders)
	}

	// Headers named in Connection are hop-by-hop too (RFC 9110 §7.6.1).
	connectionNamed := map[string]bool{}
	for _, h := range req.Headers {
		if http.CanonicalHeaderKey(strings.TrimSpace(h.Name)) != "Connection" {
			continue
		}
		for _, token := range strings.Split(h.Value, ",") {
			if token = strings.TrimSpace(token); token != "" {
				connectionNamed[http.CanonicalHeaderKey(token)] = true
			}
		}
	}

	header := http.Header{}
	host := ""
	for _, h := range req.Headers {
		name := strings.TrimSpace(h.Name)
		if !validHeaderName(name) {
			return ReplayResult{}, replayInvalid("invalid header name %q", h.Name)
		}
		if strings.ContainsAny(h.Value, "\r\n\x00") {
			return ReplayResult{}, replayInvalid("header %s contains a line break", name)
		}
		canonical := http.CanonicalHeaderKey(name)
		switch {
		case canonical == "Upgrade":
			// A protocol upgrade (WebSocket, h2c) cannot be replayed as one request.
			return ReplayResult{}, replayInvalid("Upgrade requests cannot be replayed")
		case canonical == "Host":
			// A Host override is refused because the URL and the destination diverge.
			// For plain http, net/http puts Request.Host in the absolute-form request
			// target it sends to the proxy, so the proxy dials the Host value and ignores
			// the URL host. For https, the CONNECT tunnel stays on the URL host but
			// go-mitmproxy records the exchange under the inner Host (attacker.ServeHTTP
			// sets URL.Host from req.Host), so the recorded URL is not the host contacted.
			// Either way the replay would not do what the URL says; edit the URL instead.
			host = strings.TrimSpace(h.Value)
			if !strings.EqualFold(host, target.Host) {
				return ReplayResult{}, replayInvalid("Host %q differs from the URL host %q; the replay would contact or record a different host than the URL says, so edit the URL instead", host, target.Host)
			}
		case replayDropped[canonical], connectionNamed[canonical]:
			// recomputed by net/http, or hop-by-hop
		default:
			header.Add(canonical, h.Value)
		}
	}
	if _, ok := header["User-Agent"]; !ok {
		// An empty value keeps net/http from adding its default User-Agent: a
		// header the operator removed stays removed.
		header["User-Agent"] = []string{""}
	}

	client, closeIdle, err := t.replayClient()
	if err != nil {
		return ReplayResult{}, err
	}
	defer closeIdle()

	var body io.Reader
	if len(req.Body) > 0 {
		body = bytes.NewReader(req.Body)
	}
	httpReq, err := http.NewRequestWithContext(ctx, method, target.String(), body)
	if err != nil {
		return ReplayResult{}, replayInvalid("%v", err)
	}
	httpReq.Header = header
	if host != "" {
		httpReq.Host = host
	}

	if !req.ApplyRules && t.replayRecorded(target.Scheme, target.Host) {
		nonce, err := registerReplayNonce()
		if err != nil {
			return ReplayResult{}, err
		}
		defer deleteReplayNonce(nonce)
		httpReq.Header.Set(replayNonceHeader, nonce)
	}

	start := time.Now()
	resp, err := client.Do(httpReq)
	if err != nil {
		// errors.Is(err, context.DeadlineExceeded) stays true through *url.Error.
		return ReplayResult{}, fmt.Errorf("replay %s %s: %w", method, target.Redacted(), err)
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxReplayResponse+1))
	if err != nil {
		return ReplayResult{}, fmt.Errorf("replay %s %s: reading response: %w", method, target.Redacted(), err)
	}
	res := ReplayResult{Status: resp.StatusCode, Recorded: t.replayRecorded(target.Scheme, target.Host)}
	keys := make([]string, 0, len(resp.Header))
	for k := range resp.Header {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	res.Headers = make([]ReplayHeader, 0, len(keys))
	for _, k := range keys {
		for _, v := range resp.Header[k] {
			res.Headers = append(res.Headers, ReplayHeader{Name: k, Value: v})
		}
	}
	if len(data) > maxReplayResponse {
		data = data[:maxReplayResponse]
		res.Truncated = true
	}
	res.DurationMS = time.Since(start).Milliseconds()
	res.Raw = fmt.Sprintf("%s %s\n%s\n%s", resp.Proto, resp.Status, headerLines(resp.Header), data)
	return res, nil
}

// replayClient builds a one-shot client that goes through the local proxy and
// trusts its CA. The system roots stay trusted too, so a passthrough host (whose
// real certificate reaches the client) still verifies.
func (t *Traffic) replayClient() (*http.Client, func(), error) {
	proxyURL, err := url.Parse(t.ProxyAddr())
	if err != nil {
		return nil, nil, fmt.Errorf("proxy address: %w", err)
	}
	if proxyURL.Hostname() == "0.0.0.0" {
		proxyURL.Host = "127.0.0.1:" + proxyURL.Port()
	}
	pem, err := os.ReadFile(t.CACertPath())
	if err != nil {
		return nil, nil, fmt.Errorf("proxy CA: %w", err)
	}
	roots, err := x509.SystemCertPool()
	if err != nil || roots == nil {
		roots = x509.NewCertPool()
	}
	if !roots.AppendCertsFromPEM(pem) {
		return nil, nil, fmt.Errorf("proxy CA: no certificate in %s", t.CACertPath())
	}
	transport := &http.Transport{
		Proxy:              http.ProxyURL(proxyURL),
		TLSClientConfig:    &tls.Config{RootCAs: roots, MinVersion: tls.VersionTLS12},
		DisableCompression: true,
	}
	client := &http.Client{
		Transport:     transport,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	return client, transport.CloseIdleConnections, nil
}
