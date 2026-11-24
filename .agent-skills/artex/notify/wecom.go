package notify

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
)

// weComMarkdownLimit is the hard limit (bytes, not characters) for WeCom group bot markdown content.
// It is the tightest limit of all six channels and the main reason TruncateBytes exists.
const weComMarkdownLimit = 4096

// weComChannel implements the WeCom (WeChat Work) group bot.
//
// Platform traits:
//   - Authenticates only via the key on the URL; signing is not supported — so the
//     webhook address itself is the entire credential.
//   - markdown content is capped at 4096 **bytes**; anything longer is rejected
//     outright (not truncated). At 3 bytes per Chinese character, the body has only
//     a thousand-odd characters of room, so client-side truncation is mandatory.
//   - Rate limit is 20 messages/minute, likewise held up by client-side rate limiting.
type weComChannel struct{}

func (weComChannel) Kind() string { return KindWeCom }

func (weComChannel) DefaultRatePerMin() int { return 20 }

// WeCom has only one credential, the Webhook (the key on the URL), and it does not
// support signing — the whole address is the entire credential, with no other fields to mask.
func (weComChannel) SecretKeys() []string { return []string{"webhook"} }

// WeCom has only the Webhook field; it is both the destination and the credential, so there is no "leftover credential after changing the address" to speak of.
func (weComChannel) DestinationKeys() []string { return []string{"webhook"} }

func (weComChannel) Validate(cfg map[string]any) error {
	hook := cfgString(cfg, "webhook")
	if hook == "" {
		return errors.New("missing Webhook address")
	}
	if err := validateHTTPURL(hook); err != nil {
		return fmt.Errorf("invalid Webhook address: %w", err)
	}
	return nil
}

func (c weComChannel) Send(ctx context.Context, cfg map[string]any, m Message) (int, error) {
	if err := c.Validate(cfg); err != nil {
		return 0, Permanent(err)
	}
	// A digest batch can be very long (50 items x one line each + prefix); 4096 bytes is easy to exceed.
	// Truncate here instead of relying on the platform's error: rejection means the whole batch is lost, while truncation at least delivers the first few items.
	content, kept := markdownBody(m, weComMarkdownLimit)
	payload := map[string]any{
		"msgtype":  "markdown",
		"markdown": map[string]any{"content": content},
	}
	raw, err := doJSON(ctx, "POST", cfgString(cfg, "webhook"), nil, payload)
	if err != nil {
		return 0, err
	}
	var res struct {
		ErrCode int    `json:"errcode"`
		ErrMsg  string `json:"errmsg"`
	}
	if err := json.Unmarshal(raw, &res); err != nil {
		return 0, fmt.Errorf("failed to parse WeCom response: %w (%s)", err, snippet(raw))
	}
	if res.ErrCode != 0 {
		// 45009 means the API call rate limit was exceeded — the platform's rate window rolls,
		// so retrying after backoff works, and we explicitly classify it as retryable.
		// Reaching this point means the client rate_per_min is configured too aggressively;
		// the retry is only a fallback — the real fix is to lower the channel's rate limit.
		if res.ErrCode == 45009 {
			return 0, fmt.Errorf("WeCom rate limited %d: %s", res.ErrCode, res.ErrMsg)
		}
		// 93000 means the webhook key is invalid — a permanent failure that retries will not fix.
		return 0, Permanent(fmt.Errorf("WeCom returned error %d: %s", res.ErrCode, res.ErrMsg))
	}
	return kept, nil
}
