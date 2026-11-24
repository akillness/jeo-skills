package notify

import (
	"context"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
)

// This file covers two related hardenings:
//   ① delivery addresses must not turn the server into a springboard into
//     intranets / cloud metadata (SSRF)
//   ② error messages from address validation must not carry the credentials
//     embedded in the address
//
// About the test environment: many cases in this package use httptest fake
// receivers on 127.0.0.1, which the guard would block by default. So TestMain
// turns on AllowLocalTargetsEnv globally, while every SSRF case below explicitly
// clears it to assert the **deny-by-default** behavior.

func TestMain(m *testing.M) {
	// Let regular cases reach the local fake receivers; SSRF cases clear it
	// temporarily themselves.
	_ = os.Setenv(AllowLocalTargetsEnv, "1")
	os.Exit(m.Run())
}

// TestDialGuardRejectsLoopbackByDefault is the core assertion of SSRF
// protection: under default configuration, delivering to a loopback address must
// be refused at the **connection layer**.
func TestDialGuardRejectsLoopbackByDefault(t *testing.T) {
	var hit bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hit = true
		_, _ = io.WriteString(w, `{"errcode":0}`)
	}))
	defer srv.Close()

	t.Setenv(AllowLocalTargetsEnv, "") // closing the escape hatch = default behavior
	_, err := (dingTalkChannel{}).Send(context.Background(),
		map[string]any{"webhook": srv.URL + "/robot/send"}, Message{Items: []Item{{Severity: "high"}}})
	if err == nil {
		t.Fatal("delivery to loopback addresses should not be allowed by default")
	}
	if hit {
		t.Fatal("the request already hit the local service — the guard did not work")
	}
	// The error message must be able to guide the user on how to opt in (a local
	// SMTP relay is a legitimate configuration).
	if !strings.Contains(err.Error(), AllowLocalTargetsEnv) {
		t.Errorf("the refusal message should explain how to explicitly opt in: %v", err)
	}
}

// TestDialGuardAllowsLoopbackWhenOptedIn is the counterpart: once explicitly
// enabled it must work, otherwise legitimate deployments like a local postfix /
// intranet relay would be killed by an across-the-board ban.
func TestDialGuardAllowsLoopbackWhenOptedIn(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, `{"errcode":0,"errmsg":"ok"}`)
	}))
	defer srv.Close()

	t.Setenv(AllowLocalTargetsEnv, "1")
	if _, err := (dingTalkChannel{}).Send(context.Background(),
		map[string]any{"webhook": srv.URL + "/robot/send"}, Message{Items: []Item{{Severity: "high"}}}); err != nil {
		t.Fatalf("delivery should work once explicitly allowed: %v", err)
	}
}

func TestIsBlockedDialIP(t *testing.T) {
	blocked := []string{
		"127.0.0.1", "127.1.2.3", "::1",
		"169.254.169.254", // cloud metadata endpoint — the main reason this function exists
		"169.254.1.1", "fe80::1",
		"0.0.0.0", "::",
		"224.0.0.1", "ff02::1",
		"::ffff:127.0.0.1", // the IPv4-mapped form must be converted back before the check, otherwise it is a bypass
		"",
	}
	for _, s := range blocked {
		if !isBlockedDialIP(net.ParseIP(s)) {
			t.Errorf("%s should be rejected", s)
		}
	}
	// RFC1918 private networks are **deliberately allowed**: self-hosted
	// Mattermost / SMTP relays on an intranet are common legitimate uses. This
	// assertion pins down the trade-off — if someone casually adds a private-net
	// check in the future, this fails, forcing a conscious decision (instead of
	// silently killing a batch of deployments).
	allowed := []string{"10.0.0.5", "172.16.3.4", "192.168.1.10", "8.8.8.8", "2606:4700::1111"}
	for _, s := range allowed {
		if isBlockedDialIP(net.ParseIP(s)) {
			t.Errorf("%s should be allowed (private networks are common legitimate delivery targets)", s)
		}
	}
}

// TestValidateHTTPURLRejectsLiteralPrivateTargets covers the early warning at
// configuration time: literal IPs should be rejected at save time rather than
// waiting for the first delivery to fail.
func TestValidateHTTPURLRejectsLiteralPrivateTargets(t *testing.T) {
	t.Setenv(AllowLocalTargetsEnv, "")
	for _, raw := range []string{
		"http://127.0.0.1:8080/hook",
		"http://169.254.169.254/latest/meta-data/",
		"http://[::1]:8080/hook",
	} {
		if err := validateHTTPURL(raw); err == nil {
			t.Errorf("%s should be rejected at configuration time", raw)
		}
	}
	// Public addresses and private-network addresses pass as usual (private
	// networks are left to the dial phase, which does not block them).
	for _, raw := range []string{"https://oapi.dingtalk.com/robot/send", "http://10.0.0.9/hook"} {
		if err := validateHTTPURL(raw); err != nil {
			t.Errorf("%s should pass validation: %v", raw, err)
		}
	}
}

// TestValidateHTTPURLErrorNeverLeaksCredentials is the branch the audit pointed
// out that my previous round missed.
//
// When url.Parse **fails** it returns a *url.Error whose Error() contains the
// full original address. The previous round only redacted the errors returned by
// http.Client.Do and missed this one; and the "permanent failure path" cases
// added at the time (file://, gopher://, ftp://) all actually parse fine with
// url.Parse and go down the scheme branch — so staying green proved nothing
// about this path being safe. It was a false guarantee.
func TestValidateHTTPURLErrorNeverLeaksCredentials(t *testing.T) {
	cases := []string{
		"http://127.0.0.1/%zz?access_token=" + leakProbeToken,         // invalid percent escape
		"https://a.example.com:port/x?access_token=" + leakProbeToken, // non-numeric port
		"http://[::1?access_token=" + leakProbeToken,                  // unbalanced brackets
	}
	for _, raw := range cases {
		// First confirm this input **really** makes url.Parse fail. Without this
		// step, a case could silently end up in another branch (that is exactly
		// how the previous round's false guarantee happened).
		if _, err := url.Parse(raw); err == nil {
			t.Errorf("%q should have failed to parse, otherwise this case does not cover the target branch", raw)
			continue
		}
		err := validateHTTPURL(raw)
		if err == nil {
			t.Errorf("%q should fail validation", raw)
			continue
		}
		assertNoSecret(t, err.Error(), leakProbeToken)
	}
	// Confirm the channel-layer wrapping does not leak the address either.
	t.Setenv(AllowLocalTargetsEnv, "")
	err := (dingTalkChannel{}).Validate(map[string]any{"webhook": cases[0]})
	if err == nil {
		t.Fatal("an invalid address should fail validation")
	}
	assertNoSecret(t, err.Error(), leakProbeToken)
}

// TestEmailDialGuardRejectsLoopbackByDefault covers the SMTP channel's dial
// guard.
//
// The email channel once used a bare net.Dialer, the only gap in the whole SSRF
// protection: setting host to 169.254.169.254 or 127.0.0.1 connected directly,
// and when the smtp.NewClient handshake failed it wrapped the peer's response
// line into the error, echoed back via last_error through the delivery history
// API — exactly the half-blind read primitive the other channels had already
// closed; and the timing difference between "connection refused vs timeout"
// could be used to probe ports.
//
// This package's TestMain globally enables AllowLocalTargetsEnv (many cases use
// fake receivers on 127.0.0.1), so this case must clear it itself — otherwise it
// passes whether the guard is there or not, which is exactly why the gap was
// never caught by any test back then.
func TestEmailDialGuardRejectsLoopbackByDefault(t *testing.T) {
	f := newFakeSMTP(t)
	cfg := emailCfg(t, f, nil)

	t.Setenv(AllowLocalTargetsEnv, "") // closing the escape hatch = default behavior
	_, err := (emailChannel{}).Send(context.Background(), cfg, singleMsg())
	if err == nil {
		t.Fatal("delivering email to a loopback address should not be allowed by default")
	}
	// The connection should never be established at all: the guard blocks in the
	// Control hook, and EHLO is never sent.
	if f.sawCommand("EHLO") || f.sawCommand("HELO") {
		t.Fatal("the SMTP session was already established — the guard did not work")
	}
	// The error message must be able to guide the user on how to opt in (a local
	// postfix relay is a legitimate configuration).
	if !strings.Contains(err.Error(), AllowLocalTargetsEnv) {
		t.Errorf("the refusal message should explain how to explicitly opt in: %v", err)
	}
}

// TestEmailDialGuardAllowsLoopbackWhenOptedIn is the paired counterpart: once
// explicitly enabled, delivery must work normally. Self-hosted intranet SMTP /
// local relays are very common deployments, and the guard must not ban them
// across the board.
func TestEmailDialGuardAllowsLoopbackWhenOptedIn(t *testing.T) {
	f := newFakeSMTP(t)
	cfg := emailCfg(t, f, nil)

	t.Setenv(AllowLocalTargetsEnv, "1")
	if _, err := (emailChannel{}).Send(context.Background(), cfg, singleMsg()); err != nil {
		t.Fatalf("local SMTP should be deliverable once explicitly allowed: %v", err)
	}
	if !f.sawCommand("EHLO") {
		t.Fatal("no EHLO seen — the session was never really established")
	}
}
