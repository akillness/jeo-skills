package notify

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"
)

// telegramTextLimit is the text field limit (in characters) of Telegram
// sendMessage.
const telegramTextLimit = 4096

// telegramChannel implements the Telegram Bot API.
//
// Platform traits:
//   - Authentication lives entirely in the URL path (/bot<token>/sendMessage);
//     no signing needed.
//   - Uses HTML parse mode instead of MarkdownV2: MarkdownV2 requires escaping
//     18 characters `_*[]()~`>#+-=|{}.!` and missing a single one gets the whole
//     message rejected; HTML only requires escaping & < >.
//   - Business errors likewise hide inside HTTP 200, detected via the ok field.
type telegramChannel struct{}

func (telegramChannel) Kind() string { return KindTelegram }

// Telegram allows about 1 message/second in private chats and 20 messages/minute
// in groups. Take the conservative value.
func (telegramChannel) DefaultRatePerMin() int { return 20 }

// The Bot Token is the full credential; chat_id is just the recipient, not a
// secret (having it without the Token does not let you send messages).
func (telegramChannel) SecretKeys() []string { return []string{"bot_token"} }

// base_url decides which API endpoint the Token is sent to (e.g. a self-hosted
// reverse proxy); changing it requires re-declaring the Token.
func (telegramChannel) DestinationKeys() []string { return []string{"base_url"} }

func (telegramChannel) Validate(cfg map[string]any) error {
	if cfgString(cfg, "bot_token") == "" {
		return errors.New("missing Bot Token")
	}
	if cfgString(cfg, "chat_id") == "" {
		return errors.New("missing Chat ID")
	}
	if base := cfgString(cfg, "base_url"); base != "" {
		if err := validateHTTPURL(base); err != nil {
			return fmt.Errorf("invalid API URL: %w", err)
		}
	}
	return nil
}

func (c telegramChannel) Send(ctx context.Context, cfg map[string]any, m Message) (int, error) {
	if err := c.Validate(cfg); err != nil {
		return 0, Permanent(err)
	}
	endpoint, err := telegramEndpoint(cfg)
	if err != nil {
		return 0, Permanent(err)
	}
	text, kept := telegramHTML(m)
	payload := map[string]any{
		"chat_id":                  cfgString(cfg, "chat_id"),
		"text":                     text,
		"parse_mode":               "HTML",
		"disable_web_page_preview": false,
	}
	raw, err := doJSON(ctx, "POST", endpoint, nil, payload)
	if err != nil {
		return 0, err
	}
	var res struct {
		OK          bool   `json:"ok"`
		ErrorCode   int    `json:"error_code"`
		Description string `json:"description"`
	}
	if err := json.Unmarshal(raw, &res); err != nil {
		return 0, fmt.Errorf("failed to parse Telegram response: %w (%s)", err, snippet(raw))
	}
	if res.OK {
		return kept, nil
	}
	// 429 is rate limiting and retries after backoff work; the rest (400 bad
	// parameters, 401 bad token, 403 blocked, 404 chat not found) are
	// configuration problems that retries will not fix.
	if res.ErrorCode == 429 {
		return 0, fmt.Errorf("Telegram rate limit: %s", res.Description)
	}
	return 0, Permanent(fmt.Errorf("Telegram returned error %d: %s", res.ErrorCode, res.Description))
}

// telegramEndpoint builds the sendMessage URL. An empty base_url uses the
// official API; a non-empty one is for a self-hosted Bot API reverse proxy (a
// common need on networks where the official API is unreachable).
func telegramEndpoint(cfg map[string]any) (string, error) {
	base := cfgString(cfg, "base_url")
	if base == "" {
		base = "https://api.telegram.org"
	}
	base = strings.TrimSuffix(base, "/")
	token := cfgString(cfg, "bot_token")
	raw := base + "/bot" + token + "/sendMessage"
	u, err := url.Parse(raw)
	if err != nil {
		// Do not pass err through: the URL contains the Bot Token, and at this
		// point not even the address should be echoed.
		return "", fmt.Errorf("failed to build API URL (base URL: %s)", redactRequestTarget(base))
	}
	return u.String(), nil
}

// telegramHTML renders the HTML body and returns it together with the number of
// items actually written (see Channel.Send).
func telegramHTML(m Message) (string, int) {
	lim := m.limits()
	var b strings.Builder
	b.WriteString("<b>" + telegramEscape(markdownTitle(m)) + "</b>\n")
	if m.Batch {
		// Telegram's limit is in **characters**, so packing is measured in
		// characters too (runeSize).
		footer := ""
		if m.HomeURL != "" {
			footer = fmt.Sprintf("\n\n<a href=\"%s\">View all on the platform</a>", telegramEscapeAttr(m.HomeURL))
		}
		kept := packItemCount(m.Items, telegramTextLimit, telegramReservedRunes, footer, runeSize, func(it Item, idx int) string {
			return telegramBatchLine(it, idx+1, lim)
		})
		items := m.Items[:kept]
		b.Reset()
		b.WriteString("<b>" + telegramEscape(telegramBatchTitle(m, items, len(m.Items))) + "</b>")
		for i, it := range items {
			b.WriteString("\n" + telegramEscape(telegramBatchLine(it, i+1, lim)))
		}
		b.WriteString(footer)
		return TruncateHTML(b.String(), telegramTextLimit), kept
	}
	if len(m.Items) == 0 {
		return b.String(), 0
	}
	it := m.Items[0]
	if it.IsStatusChange() {
		b.WriteString(fmt.Sprintf("\n<b>Status change</b>: %s → %s",
			telegramEscape(StatusLabel(it.FromStatus)), telegramEscape(StatusLabel(it.ToStatus))))
	}
	if it.VulnClass != "" && it.VulnClass != it.Title() {
		b.WriteString("\n<b>Type</b>: " + telegramEscape(it.VulnClass))
	}
	if a := assetLine(it.Assets, lim.AssetsShown); a != "" {
		b.WriteString("\n<b>Assets</b>: " + telegramEscape(a))
	}
	if s := OneLine(it.Summary, lim.SummaryRunes); s != "" {
		b.WriteString("\n<b>Summary</b>: " + telegramEscape(s))
	}
	if it.DetailURL != "" {
		b.WriteString(fmt.Sprintf("\n\n<a href=\"%s\">View details</a>", telegramEscapeAttr(it.DetailURL)))
	}
	return TruncateHTML(b.String(), telegramTextLimit), 1
}

// telegramReservedRunes is reserved for the message title and a possible
// truncation notice (in characters).
const telegramReservedRunes = 160

// telegramBatchLine renders one entry of a digest (unescaped; the caller escapes
// it uniformly).
func telegramBatchLine(it Item, idx int, lim Limits) string {
	if a := assetLine(it.Assets, lim.AssetsShown); a != "" {
		return fmt.Sprintf("%d. %s · %s — %s", idx, SeverityLabel(it.Severity), it.Title(), a)
	}
	return fmt.Sprintf("%d. %s · %s", idx, SeverityLabel(it.Severity), it.Title())
}

// telegramBatchTitle renders the title line of a digest message. The count is
// the number of items **actually included in this message**, not the batch
// total — otherwise readers would take the number in the header for the whole
// batch.
func telegramBatchTitle(m Message, items []Item, total int) string {
	title := fmt.Sprintf("Vulnerability digest · %d total", total)
	if extra := total - len(items); extra > 0 {
		title += fmt.Sprintf(" (showing the first %d, %d more in the next message)", len(items), extra)
	}
	if m.WindowMinutes > 0 {
		title = fmt.Sprintf("Last %d min · %s", m.WindowMinutes, title)
	}
	return title
}

// telegramEscape escapes HTML text content.
// Telegram only recognizes these three entities, so existing entities like &amp;
// get double-escaped — which is exactly the desired behavior: we want to display
// the raw characters, not let users inject HTML.
func telegramEscape(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	return s
}

// telegramEscapeAttr escapes an HTML attribute value. On top of text escaping it
// also handles quotes — a quote in a URL would close the href attribute early
// and turn the rest into an injection point.
func telegramEscapeAttr(s string) string {
	s = telegramEscape(s)
	s = strings.ReplaceAll(s, "\"", "&quot;")
	return s
}
