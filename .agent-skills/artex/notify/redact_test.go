package notify

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

// This file holds invariant tests: **no** error text escaping from a channel
// implementation may carry credentials.
//
// Why a separate file: the original channel cases covered only success paths and
// platform business errors, never looking at transport-layer failures. Yet
// transport-layer errors (connection refused / DNS failure / timeout) are the
// most dangerous — the *url.Error returned by http.Client.Do prints the **full
// URL** into the error text, and the credentials of these platforms are in the
// URL. The credentials rode this string to four outlets:
//
//	notification_deliveries.last_error  → stored in plaintext
//	GET /api/notify/deliveries response → bypasses the channel config masking, echoed to the browser
//	server logs                         → often exported and retained
//	the test-send API's 502 response    → popped up directly in the frontend
//
// So instead of testing one function, this file fires one doomed-to-fail request
// per channel and asserts the credential cannot be found in the error text.

// credentialCases covers every channel shape where "the credential is in the
// URL": DingTalk/WeCom in the query, Feishu in the last path segment, Telegram
// in the middle of the path.
var credentialCases = []struct {
	name   string
	ch     Channel
	cfg    map[string]any
	secret string
}{
	{
		name:   "DingTalk access_token in query",
		ch:     dingTalkChannel{},
		cfg:    map[string]any{"webhook": "http://127.0.0.1:1/robot/send?access_token=" + leakProbeToken},
		secret: leakProbeToken,
	},
	{
		name:   "WeCom key in query",
		ch:     weComChannel{},
		cfg:    map[string]any{"webhook": "http://127.0.0.1:1/cgi-bin/webhook/send?key=" + leakProbeToken},
		secret: leakProbeToken,
	},
	{
		name:   "Feishu hook id in last path segment",
		ch:     feishuChannel{},
		cfg:    map[string]any{"webhook": "http://127.0.0.1:1/open-apis/bot/v2/hook/" + leakProbeToken},
		secret: leakProbeToken,
	},
	{
		name:   "Telegram bot token in the middle of the path",
		ch:     telegramChannel{},
		cfg:    map[string]any{"bot_token": leakProbeToken, "chat_id": "1", "base_url": "http://127.0.0.1:1"},
		secret: leakProbeToken,
	},
	{
		name:   "DingTalk signing secret",
		ch:     dingTalkChannel{},
		cfg:    map[string]any{"webhook": "http://127.0.0.1:1/robot/send", "secret": leakProbeToken},
		secret: leakProbeToken,
	},
}

// leakProbeToken is a sentinel value that can never be a real credential, used
// to search for it in error text.
const leakProbeToken = "LEAKPROBE0123456789abcdef"

// TestChannelErrorsNeverLeakCredentials is the core invariant.
func TestChannelErrorsNeverLeakCredentials(t *testing.T) {
	for _, tc := range credentialCases {
		t.Run(tc.name, func(t *testing.T) {
			// A doomed peer: nobody listens on 127.0.0.1:1, exercising the
			// connection-refused path.
			_, err := tc.ch.Send(context.Background(), tc.cfg, Message{
				Items: []Item{{FindingID: 1, Severity: "high", Name: "leak probe"}},
			})
			if err == nil {
				t.Fatal("an unreachable address should error")
			}
			assertNoSecret(t, err.Error(), tc.secret)
		})
	}
}

// TestChannelErrorsNeverLeakCredentialsInPermanentPath covers the permanent
// failure branch: URL validation failures, platform business errors, etc. also
// send error text outward, and likewise must not carry credentials.
func TestChannelErrorsNeverLeakCredentialsInPermanentPath(t *testing.T) {
	cases := []struct {
		name string
		ch   Channel
		cfg  map[string]any
	}{
		// Address carries a credential but is malformed → exercises the
		// validateHTTPURL / url.Parse branch.
		{"DingTalk address malformed", dingTalkChannel{}, map[string]any{"webhook": "file:///" + leakProbeToken}},
		{"WeCom address malformed", weComChannel{}, map[string]any{"webhook": "gopher://" + leakProbeToken}},
		{"Feishu address malformed", feishuChannel{}, map[string]any{"webhook": "ftp://" + leakProbeToken + "/hook"}},
		{"Telegram API address malformed", telegramChannel{}, map[string]any{"bot_token": "tok", "chat_id": "1", "base_url": "file://" + leakProbeToken}},
		{"generic webhook address malformed", webhookChannel{}, map[string]any{"url": "javascript:" + leakProbeToken}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := tc.ch.Send(context.Background(), tc.cfg, Message{Items: []Item{{Severity: "high"}}})
			if err == nil {
				t.Fatal("an invalid configuration should error")
			}
			assertNoSecret(t, err.Error(), leakProbeToken)
		})
	}
}

func assertNoSecret(t *testing.T, text, secret string) {
	t.Helper()
	if strings.Contains(text, secret) {
		t.Fatalf("error text leaked the credential %q:\n    %s", secret, text)
	}
}

func TestRedactRequestTargetKeepsOnlySchemeAndHost(t *testing.T) {
	cases := map[string]string{
		"https://oapi.dingtalk.com/robot/send?access_token=S1":    "https://oapi.dingtalk.com/…",
		"https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=S2": "https://qyapi.weixin.qq.com/…",
		"https://open.feishu.cn/open-apis/bot/v2/hook/S3":         "https://open.feishu.cn/…",
		"https://api.telegram.org/botS4/sendMessage":              "https://api.telegram.org/…",
		"http://10.0.0.5:8080/hook":                               "http://10.0.0.5:8080/…",
	}
	for in, want := range cases {
		got := redactRequestTarget(in)
		if got != want {
			t.Errorf("redactRequestTarget(%q) = %q, want %q", in, got, want)
		}
		// The redacted result itself must no longer contain any path/query
		// fragment of the original address.
		if parts := strings.SplitN(in, "://", 2); len(parts) == 2 {
			if hostAndRest := strings.SplitN(parts[1], "/", 2); len(hostAndRest) == 2 && hostAndRest[1] != "" {
				if strings.Contains(got, hostAndRest[1]) {
					t.Errorf("path/query fragment %q still present after redaction: %q", hostAndRest[1], got)
				}
			}
		}
	}
	// Unparseable input is never echoed back.
	for _, bad := range []string{"", "://", "not a url", "http://"} {
		if got := redactRequestTarget(bad); strings.Contains(got, bad) && bad != "" {
			t.Errorf("unparseable input %q was echoed back as %q", bad, got)
		}
	}
}

// TestRedactTransportErrorStripsURL targets the concrete *url.Error type: it is
// what http.Client.Do returns, and the first scene of the leak.
func TestRedactTransportErrorStripsURL(t *testing.T) {
	inner := errors.New("dial tcp 127.0.0.1:1: connect: connection refused")
	uerr := &url.Error{
		Op:  "Post",
		URL: "https://api.telegram.org/bot" + leakProbeToken + "/sendMessage",
		Err: inner,
	}
	got := redactTransportError(uerr)
	assertNoSecret(t, got, leakProbeToken)
	if !strings.Contains(got, "api.telegram.org") {
		t.Errorf("the host should be kept for troubleshooting, got %q", got)
	}
	if !strings.Contains(got, "connection refused") {
		t.Errorf("the underlying cause should be kept for troubleshooting, got %q", got)
	}
	// The Op is also kept (POST vs GET matters for troubleshooting).
	if !strings.Contains(got, "Post") {
		t.Errorf("the operation name should be kept, got %q", got)
	}
}

// TestRedactURLsInTextHandlesFallback is the fallback path: addresses inside
// custom errors that are not *url.Error (such as the errors returned by the
// redirect policy) must likewise be stripped.
func TestRedactURLsInTextHandlesFallback(t *testing.T) {
	in := fmt.Sprintf("refusing cross-host redirect (a.example → http://b.example/bot%s/send)", leakProbeToken)
	got := redactURLsInText(in)
	assertNoSecret(t, got, leakProbeToken)
	if !strings.Contains(got, "http://b.example/…") {
		t.Errorf("addresses should be replaced with the redacted form, got %q", got)
	}
	// Text without addresses is kept as-is.
	if plain := "dial tcp: connection refused"; redactURLsInText(plain) != plain {
		t.Error("text without addresses should not be modified")
	}
}

// TestCrossHostRedirectRefused covers "credentials in the URL + following a
// cross-host redirect = handing over the credentials". The two httptest servers
// listen on different ports of 127.0.0.1, and different ports mean different
// Hosts — exactly a cross-host redirect.
func TestCrossHostRedirectRefused(t *testing.T) {
	var hit bool
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hit = true
		_, _ = io.WriteString(w, `{"errcode":0,"errmsg":"ok"}`)
	}))
	defer target.Close()

	redirector := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, target.URL+"/robot/send?access_token="+leakProbeToken, http.StatusTemporaryRedirect)
	}))
	defer redirector.Close()

	_, err := (dingTalkChannel{}).Send(context.Background(),
		map[string]any{"webhook": redirector.URL + "/robot/send?access_token=" + leakProbeToken},
		Message{Items: []Item{{Severity: "high"}}})
	if err == nil {
		t.Fatal("cross-host redirects should be refused")
	}
	if hit {
		t.Fatal("the redirect target was hit — the credentials leaked along with the redirect")
	}
	assertNoSecret(t, err.Error(), leakProbeToken)
}

// TestSameHostRedirectAllowed is the counterpart: same-host redirects (such as
// adding a trailing slash) must keep working, otherwise normal workflows would
// be blocked along with the attack.
func TestSameHostRedirectAllowed(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/robot/send" {
			// Same-host, same-port redirect.
			http.Redirect(w, r, "/robot/send/", http.StatusTemporaryRedirect)
			return
		}
		_, _ = io.WriteString(w, `{"errcode":0,"errmsg":"ok"}`)
	}))
	defer srv.Close()

	if _, err := (dingTalkChannel{}).Send(context.Background(),
		map[string]any{"webhook": srv.URL + "/robot/send"},
		Message{Items: []Item{{Severity: "high"}}}); err != nil {
		t.Fatalf("same-host redirects should not be refused: %v", err)
	}
}
