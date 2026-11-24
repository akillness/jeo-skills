package notify

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/url"
	"strconv"
	"time"
)

// dingTalkChannel implements the DingTalk custom bot.
//
// Platform traits (which drive the implementation choices here):
//   - A single bot is rate-limited to 20 messages/minute; overruns are silently
//     dropped (HTTP may still be 200), so rate limiting must happen client-side,
//     see DefaultRatePerMin.
//   - Three security options, pick one: signing / custom keywords / IP allowlist.
//     Signing is the only scheme independent of message content, so only signing
//     is supported (a bare webhook with none of the three enabled also works).
//   - Success and failure both return HTTP 200, distinguished by the errcode in
//     the body — not checking errcode would record failed deliveries as successful.
type dingTalkChannel struct{}

func (dingTalkChannel) Kind() string { return KindDingTalk }

func (dingTalkChannel) DefaultRatePerMin() int { return 20 }

// The DingTalk Webhook address carries an access_token and is itself a
// credential, so it is masked as a whole.
func (dingTalkChannel) SecretKeys() []string { return []string{"webhook", "secret"} }

// The destination is the DingTalk Webhook address itself; changing the address
// must also re-affirm the signing secret for the new address.
func (dingTalkChannel) DestinationKeys() []string { return []string{"webhook"} }

func (dingTalkChannel) Validate(cfg map[string]any) error {
	hook := cfgString(cfg, "webhook")
	if hook == "" {
		return errors.New("missing Webhook address")
	}
	if err := validateHTTPURL(hook); err != nil {
		return fmt.Errorf("invalid Webhook address: %w", err)
	}
	return nil
}

// Send delivers one message. With a backlink and a single item it uses
// ActionCard (with a button); otherwise markdown.
func (c dingTalkChannel) Send(ctx context.Context, cfg map[string]any, m Message) (int, error) {
	hook := cfgString(cfg, "webhook")
	if err := c.Validate(cfg); err != nil {
		return 0, Permanent(err)
	}
	endpoint, err := dingTalkSignedURL(hook, cfgString(cfg, "secret"), time.Now())
	if err != nil {
		return 0, Permanent(err)
	}

	title := markdownTitle(m)
	// DingTalk markdown bodies have no explicit byte limit, but still cap
	// defensively so evidence fields cannot balloon abnormally.
	text, kept := markdownBody(m, 20000)

	var payload any
	if !m.Batch && len(m.Items) == 1 && m.Items[0].DetailURL != "" {
		payload = map[string]any{
			"msgtype": "actionCard",
			"actionCard": map[string]any{
				"title":          title,
				"text":           text,
				"btnOrientation": "0",
				"singleTitle":    "View details",
				"singleURL":      m.Items[0].DetailURL,
			},
		}
	} else {
		payload = map[string]any{
			"msgtype":  "markdown",
			"markdown": map[string]any{"title": title, "text": text},
		}
	}

	raw, err := doJSON(ctx, "POST", endpoint, nil, payload)
	if err != nil {
		return 0, err
	}
	// DingTalk hides business errors inside 200 responses.
	var res struct {
		ErrCode int    `json:"errcode"`
		ErrMsg  string `json:"errmsg"`
	}
	if err := json.Unmarshal(raw, &res); err != nil {
		return 0, fmt.Errorf("failed to parse DingTalk response: %w (%s)", err, snippet(raw))
	}
	if res.ErrCode != 0 {
		// 301000 is signature verification failure, 310000 is keyword mismatch —
		// both are configuration errors that retries cannot fix.
		return 0, Permanent(fmt.Errorf("DingTalk returned error %d: %s", res.ErrCode, res.ErrMsg))
	}
	return kept, nil
}

// dingTalkSignedURL appends the timestamp and sign parameters to the webhook per
// the official signing rule.
//
// Rule: string-to-sign = timestamp + "\n" + secret, HMAC-SHA256 keyed **with the
// secret itself**, result base64-encoded then URL-encoded. timestamp is in
// milliseconds. An empty secret returns the hook unchanged, to support bots
// without signing enabled.
func dingTalkSignedURL(hook, secret string, now time.Time) (string, error) {
	if secret == "" {
		return hook, nil
	}
	ts := strconv.FormatInt(now.UnixMilli(), 10)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(ts + "\n" + secret))
	sign := base64.StdEncoding.EncodeToString(mac.Sum(nil))

	u, err := url.Parse(hook)
	if err != nil {
		// Do not pass err through: url.Parse's error text carries the full address (with access_token).
		return "", fmt.Errorf("failed to parse Webhook address: %s", redactRequestTarget(hook))
	}
	q := u.Query()
	q.Set("timestamp", ts)
	q.Set("sign", sign)
	u.RawQuery = q.Encode()
	return u.String(), nil
}

// validateHTTPURL checks that the address is usable and the scheme is supported,
// and applies an internal-network check to literal-IP targets.
//
// Two subtleties:
//
//  1. **Error messages must be redacted**. url.Parse returns a *url.Error whose
//     Error() carries the **full original address**, and these platforms'
//     addresses embed credentials (DingTalk access_token, WeCom key, Telegram
//     bot token, Feishu hook id). This once did a plain `return err`, so the
//     "invalid address format" error carried the credential out — into the test
//     endpoint's 400 responses, the per-delivery last_error persisted to the DB,
//     server logs, and the delivery-history API.
//
//  2. **Literal IPs are checked against internal ranges directly**, while domains
//     are left to the dial phase (blockInternalDial is the final enforcement
//     point and also covers DNS rebinding). Doing it once here gives feedback at
//     config-save time instead of at the first failed delivery.
//
// Restricting schemes is defensive: file:///gopher:// and friends would make
// http.Client behave unexpectedly (already blocked by the scheme check, but
// there is no reason to leave that surface open).
func validateHTTPURL(raw string) error {
	u, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("address cannot be parsed (%s)", redactRequestTarget(raw))
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("only http/https are supported, got %q", u.Scheme)
	}
	if u.Host == "" {
		return errors.New("missing host name")
	}
	if ip := net.ParseIP(u.Hostname()); ip != nil && isBlockedDialIP(ip) && !allowLocalTargets() {
		return fmt.Errorf("refusing to deliver to loopback/link-local address %s (if you really need to deliver to a local service, set %s=1)", ip, AllowLocalTargetsEnv)
	}
	return nil
}
