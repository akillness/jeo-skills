package notify

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"time"
)

// feishuChannel implements the Feishu (incl. Lark) custom bot, using interactive
// cards.
//
// Platform traits:
//   - The signing algorithm is **different** from DingTalk's and extremely easy to
//     get wrong; see the feishuSign comment.
//   - Like DingTalk, business errors are stuffed into the body of an HTTP 200
//     (code != 0).
//   - Card headers support color templates; mapping severity to colors lets people
//     spot severity at a glance in the message list.
type feishuChannel struct{}

func (feishuChannel) Kind() string { return KindFeishu }

// Feishu custom bots allow about 5 requests/second, i.e. 100 per minute.
func (feishuChannel) DefaultRatePerMin() int { return 100 }

// The last segment of the webhook URL is the bot's unique identifier and counts
// as a credential.
func (feishuChannel) SecretKeys() []string { return []string{"webhook", "secret"} }

// Likewise: changing the webhook URL requires re-declaring the signing secret for
// the new address.
func (feishuChannel) DestinationKeys() []string { return []string{"webhook"} }

func (feishuChannel) Validate(cfg map[string]any) error {
	hook := cfgString(cfg, "webhook")
	if hook == "" {
		return errors.New("missing Webhook URL")
	}
	if err := validateHTTPURL(hook); err != nil {
		return fmt.Errorf("invalid webhook URL: %w", err)
	}
	return nil
}

func (c feishuChannel) Send(ctx context.Context, cfg map[string]any, m Message) (int, error) {
	if err := c.Validate(cfg); err != nil {
		return 0, Permanent(err)
	}
	card, kept := feishuCard(m)
	payload := map[string]any{
		"msg_type": "interactive",
		"card":     card,
	}
	// Signing parameters sit at the same level as the message, and appear only
	// when a secret is configured.
	if secret := cfgString(cfg, "secret"); secret != "" {
		ts := strconv.FormatInt(time.Now().Unix(), 10)
		payload["timestamp"] = ts
		payload["sign"] = feishuSign(ts, secret)
	}
	raw, err := doJSON(ctx, "POST", cfgString(cfg, "webhook"), nil, payload)
	if err != nil {
		return 0, err
	}
	var res struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
		// Some versions of the Feishu hook use this set of field names; support both.
		StatusCode    int    `json:"StatusCode"`
		StatusMessage string `json:"StatusMessage"`
	}
	if err := json.Unmarshal(raw, &res); err != nil {
		return 0, fmt.Errorf("failed to parse Feishu response: %w (%s)", err, snippet(raw))
	}
	if res.Code != 0 {
		return 0, Permanent(fmt.Errorf("Feishu returned error %d: %s", res.Code, res.Msg))
	}
	if res.StatusCode != 0 {
		return 0, Permanent(fmt.Errorf("Feishu returned error %d: %s", res.StatusCode, res.StatusMessage))
	}
	return kept, nil
}

// feishuSign computes the signature per Feishu's official rules.
//
// This is especially easy to get wrong: the official sample is
//
//	hmac.new(string_to_sign.encode(), digestmod=sha256)
//
// That is, **key = timestamp + "\n" + secret, with an empty message** — not the
// intuitive "key=secret, message=stringToSign", which is exactly DingTalk's
// algorithm. The two algorithms are mirror images of each other, and copying the
// other platform's implementation always fails signature verification (error
// 19021).
func feishuSign(timestamp, secret string) string {
	stringToSign := timestamp + "\n" + secret
	mac := hmac.New(sha256.New, []byte(stringToSign))
	return base64.StdEncoding.EncodeToString(mac.Sum(nil))
}

// feishuSeverityTemplate maps vulnerability severity to a card header color
// template. Unknown severities use grey — not blue, to avoid confusion with low.
func feishuSeverityTemplate(severity string) string {
	switch severity {
	case "critical":
		return "red"
	case "high":
		return "orange"
	case "medium":
		return "yellow"
	case "low":
		return "blue"
	default:
		return "grey"
	}
}

// feishuMaxCardBytes is a conservative cap on card content. Feishu custom bots
// reject a request body over 20 KB as a whole (not truncated); pick a value
// clearly below that limit to also cover JSON wrapping overhead.
const feishuMaxCardBytes = 16000

// feishuEnvelopeBytes is the size of what Send serializes around the card when a
// signing secret is configured (without one the request is smaller):
//
//	{"card":…,"msg_type":"interactive","sign":"<44 characters>","timestamp":"<10 digits>"}
const feishuEnvelopeBytes = 113

// feishuCard builds the interactive card and returns it along with the **number
// of items actually written**. kept serves the same purpose as in markdownBody:
// only items that actually made it into the card should be marked as sent.
func feishuCard(m Message) (map[string]any, int) {
	lim := m.limits()
	// budget is the final truncation backstop for one item's text, the same role
	// TruncateBytes plays in markdownBody. With the summary or asset limit set to
	// 0 an item has no other bound, and an oversized card loses the whole message.
	budget := feishuMaxCardBytes - markdownReservedBytes
	card := map[string]any{
		"config": map[string]any{"wide_screen_mode": true},
		"header": map[string]any{"title": map[string]any{"tag": "plain_text", "content": markdownTitle(m)}},
	}
	if len(m.Items) > 0 {
		card["header"].(map[string]any)["template"] = feishuSeverityTemplate(m.Items[0].Severity)
	}
	elements := []any{}
	kept := 0
	if m.Batch {
		// digest assembles the elements of a digest card around the lines of its
		// first n items. The intro must state "the remaining N items will continue
		// in the next message", and N must come from the number of items that
		// actually fit.
		digest := func(n int, lines []any) []any {
			out := []any{feishuMarkdownDiv(markdownBatchIntro(m, m.Items[:n], len(m.Items)))}
			out = append(out, lines...)
			if m.HomeURL != "" {
				out = append(out, feishuButton("View all on the platform", m.HomeURL))
			}
			return out
		}
		// Pack whole items (see packItemCount) against the request body as it will
		// be serialized, not against the text of the lines. Each line is sent as
		// its own element: about 52 bytes of JSON around the text, plus whatever
		// the encoding escapes. Counted as text alone, several hundred short lines
		// left as one request of more than twice the 20 KB limit. The rest of the
		// body is measured too: it changes with the number of items kept (the
		// intro) and with the platform link.
		//
		// The first item is always kept: otherwise one oversized item would jam
		// the whole batch in place. Its text is truncated to budget.
		var lines []any
		used := 0
		for i, it := range m.Items {
			line := feishuMarkdownDiv(TruncateBytes(feishuBatchLine(it, i+1, lim), budget))
			used += feishuJSONSize(line) + 1 // the element and its separating comma
			card["elements"] = digest(i+1, nil)
			if i > 0 && feishuEnvelopeBytes+feishuJSONSize(card)+used > feishuMaxCardBytes {
				break
			}
			lines = append(lines, line)
		}
		kept = len(lines)
		elements = digest(kept, lines)
	} else if len(m.Items) > 0 {
		kept = 1
		it := m.Items[0]
		elements = append(elements, feishuMarkdownDiv(TruncateBytes(feishuItemLines(it, lim), budget)))
		if it.DetailURL != "" {
			elements = append(elements, feishuButton("View details", it.DetailURL))
		}
	}

	card["elements"] = elements
	return card, kept
}

// feishuJSONSize returns the number of bytes v takes in the request body.
func feishuJSONSize(v any) int {
	raw, _ := json.Marshal(v)
	return len(raw)
}

func feishuMarkdownDiv(content string) map[string]any {
	return map[string]any{"tag": "div", "text": map[string]any{"tag": "lark_md", "content": content}}
}

func feishuButton(label, url string) map[string]any {
	return map[string]any{
		"tag": "action",
		"actions": []any{map[string]any{
			"tag":  "button",
			"text": map[string]any{"tag": "lark_md", "content": label},
			"url":  url,
			"type": "primary",
		}},
	}
}

// feishuItemLines renders the lark_md body of a single vulnerability.
//
// lark_md and markdown are sibling text formats that also parse links and
// emphasis, so every field coming from outside goes through markdownText
// (single-lining + escaping) — otherwise a single vulnerability title could turn
// into a clickable external link inside Feishu.
func feishuItemLines(it Item, lim Limits) string {
	out := fmt.Sprintf("**%s · %s**", SeverityLabel(it.Severity), markdownText(it.Title(), 0))
	if it.IsStatusChange() {
		out += fmt.Sprintf("\n**Status change**: %s → %s",
			markdownText(StatusLabel(it.FromStatus), 0), markdownText(StatusLabel(it.ToStatus), 0))
	}
	if it.VulnClass != "" && it.VulnClass != it.Title() {
		out += fmt.Sprintf("\n**Type**: %s", markdownText(it.VulnClass, 0))
	}
	if a := assetLine(it.Assets, lim.AssetsShown); a != "" {
		out += fmt.Sprintf("\n**Assets**: %s", markdownText(a, 0))
	}
	if it.Summary != "" {
		if s := markdownText(it.Summary, lim.SummaryRunes); s != "" {
			out += fmt.Sprintf("\n**Summary**: %s", s)
		}
	}
	return out
}

// feishuBatchLine renders one entry of a digest card.
func feishuBatchLine(it Item, index int, lim Limits) string {
	line := fmt.Sprintf("**%d. %s · %s**", index, SeverityLabel(it.Severity), markdownText(it.Title(), 0))
	if a := assetLine(it.Assets, lim.AssetsShown); a != "" {
		line += " — " + markdownText(a, 0)
	}
	return line
}
