package notify

import (
	"fmt"
	"strings"
)

// This file is the message rendering shared by the "Markdown family" channels
// (DingTalk, WeCom). Feishu uses card JSON, Telegram uses HTML, and email uses
// HTML; each renders in its own adapter.

// DefaultMaxAssetsShown is the default maximum number of assets listed in a
// message (Limits.AssetsShown). A vulnerability can be anchored to dozens of
// assets; listing them all would blow up the message with no informational
// value — nobody reads the 4th domain onwards in an IM.
const DefaultMaxAssetsShown = 3

// DefaultMaxSummaryRunes is the default number of characters the summary is
// compressed to (Limits.SummaryRunes). An IM message is a "go look at the
// details" hint, not the report itself; the full content lives on the platform.
const DefaultMaxSummaryRunes = 120

// markdownReservedBytes is reserved for the message header (digest line +
// severity distribution + possible truncation notice) and footer (platform
// link). When packing whole items, this part is deducted from the budget so the
// head and tail are never cut off — once they are, readers cannot even tell
// "which batch this is and how many items are not shown".
const markdownReservedBytes = 320

// markdownEscape escapes markdown metacharacters.
//
// Why this is mandatory: vulnerability titles, summaries, classes, and asset
// display names all come from **untrusted sources** — titles and summaries come
// from model output (the model reads the tested target's responses), and an
// asset's url is the full URL obtained from scanning (including a
// target-controlled query string). Without escaping, a vulnerability titled
//
//	SQL injection on login page\n[URGENT: click to verify your account](http://attacker.tld)
//
// would render in the security engineer's DingTalk/Feishu as a **clickable
// external link**; and `![](http://attacker.tld/beacon)` would be fetched by the
// client at render time, effectively reporting "this vulnerability has been
// read" and leaking the reader's IP. Even for non-malicious content, injected
// bold text or quote blocks can push the critical vulnerabilities below the
// fold.
//
// The escape set covers the characters for headings/links/emphasis/lists/
// quotes/strikethrough — the ones that change structure or produce clickable
// elements. `\` must be handled first, otherwise the backslashes added later
// would be escaped again.
func markdownEscape(s string) string {
	replacer := strings.NewReplacer(
		`\`, `\\`,
		"`", "\\`",
		"*", `\*`,
		"_", `\_`,
		"[", `\[`,
		"]", `\]`,
		"(", `\(`,
		")", `\)`,
		"!", `\!`,
		"#", `\#`,
		">", `\>`,
		"|", `\|`,
		"~", `\~`,
	)
	return replacer.Replace(s)
}

// markdownText compresses untrusted text into a single line and escapes it, for
// use in markdown bodies. Single-lining is the other half beyond escaping: a
// newline by itself can forge a new list item or quote block, and escape
// characters cannot stop it.
func markdownText(s string, maxRunes int) string {
	return markdownEscape(OneLine(s, maxRunes))
}

// markdownTitle returns the message title (the title bar of IM platforms / card
// title); its content is the **unescaped original text**.
//
// The lack of escaping here is deliberate: this title is shared by renderers in
// four contexts — markdown bodies, Telegram's HTML, Feishu card plain_text, and
// the generic webhook's JSON plus the email subject. Each context has different
// escaping rules (markdown escapes put into HTML leave visible backslashes; put
// into JSON they pollute the data), so escaping must be done by each output side;
// see writeItem / feishuItemLines / telegramEscape. A markdown escape was once
// added to the shared function, and Telegram messages ended up showing visible
// backslashes like `\(1\)`.
func markdownTitle(m Message) string {
	if m.Batch {
		return fmt.Sprintf("Vulnerability digest · %d total", len(m.Items))
	}
	if len(m.Items) == 0 {
		return "Vulnerability notification"
	}
	it := m.Items[0]
	return fmt.Sprintf("[%s] %s", SeverityLabel(it.Severity), OneLine(it.Title(), 0))
}

// markdownBody renders the message body and returns it together with the
// **number of items actually written**.
//
// The returned kept is the number of items actually delivered by this send, and
// the caller uses it to mark only the first kept items as sent — items kept out
// by the channel's length limit must remain for the next batch instead of being
// marked as succeeded along with the rest. This is exactly where "silent loss"
// comes from: the message was truncated, but the delivery records show all
// delivered, and nowhere can you tell the second half was never sent.
//
// maxBytes<=0 means unlimited.
func markdownBody(m Message, maxBytes int) (string, int) {
	if !m.Batch {
		if len(m.Items) == 0 {
			return "", 0
		}
		var b strings.Builder
		writeItem(&b, m.Items[0], "", true, m.limits())
		// A single message is sent even if oversized (with final truncation as
		// the backstop): partial information about one vulnerability is better
		// than sending nothing at all.
		return TruncateBytes(b.String(), maxBytes), 1
	}

	footer := ""
	if m.HomeURL != "" {
		footer = fmt.Sprintf("\n[View all on the platform](%s)\n", m.HomeURL)
	}
	kept := packItemCount(m.Items, maxBytes, markdownReservedBytes, footer, byteSize, func(it Item, idx int) string {
		var b strings.Builder
		writeItem(&b, it, fmt.Sprintf("%d. ", idx+1), false, m.limits())
		return b.String()
	})

	items := m.Items[:kept]
	var b strings.Builder
	b.WriteString(markdownBatchIntro(m, items, len(m.Items)))
	for i, it := range items {
		writeItem(&b, it, fmt.Sprintf("%d. ", i+1), false, m.limits())
	}
	b.WriteString(footer)
	return TruncateBytes(b.String(), maxBytes), kept
}

// markdownBatchIntro renders the opening of a digest message: time window, item
// count, and severity distribution. With these, whoever receives the digest can
// judge whether this batch needs immediate handling without opening the
// platform.
//
// items are the ones **actually included**; total is the number the batch should
// have. When the two differ it must be stated explicitly — "how many more items
// are in the next message" — otherwise readers take the number in the header for
// the whole batch, and the items never sent simply do not exist anywhere in the
// UI.
func markdownBatchIntro(m Message, items []Item, total int) string {
	var b strings.Builder
	if m.WindowMinutes > 0 {
		fmt.Fprintf(&b, "**%d new vulnerabilities in the last %d minutes**", total, m.WindowMinutes)
	} else {
		fmt.Fprintf(&b, "**%d new vulnerabilities**", total)
	}
	if extra := total - len(items); extra > 0 {
		fmt.Fprintf(&b, " (this message shows the first %d, the remaining %d will continue in the next message)", len(items), extra)
	}
	// Give the distribution by severity so readers can spot critical items at a
	// glance. Only count the items **actually included in this message**, so that
	// "Critical 3" matches what can be counted below.
	counts := map[string]int{}
	for _, it := range items {
		counts[it.Severity]++
	}
	var parts []string
	for _, sev := range []string{"critical", "high", "medium", "low"} {
		if n := counts[sev]; n > 0 {
			parts = append(parts, fmt.Sprintf("%s %d", SeverityLabel(sev), n))
		}
	}
	if len(parts) > 0 {
		b.WriteString("\n" + strings.Join(parts, " · "))
	}
	b.WriteString("\n\n")
	return b.String()
}

// writeItem renders a single vulnerability item.
//
// prefix is the sequence number in a digest list; single=true renders the full
// version (with summary and backlink), while the digest list renders only a
// one-line summary — otherwise a 50-item digest becomes a long document.
//
// All content from outside (title/class/assets/summary) goes through
// markdownText: single-lining + escaping. The backlink is built from the
// admin-configured public_base_url, is not untrusted content, and must be a
// clickable link, so it is emitted as-is.
func writeItem(b *strings.Builder, it Item, prefix string, single bool, lim Limits) {
	line := fmt.Sprintf("%s**%s · %s**", prefix, SeverityLabel(it.Severity), markdownText(it.Title(), 0))
	if !single {
		// Digest mode: single-line presentation, with assets and summary
		// compressed and appended.
		var extras []string
		if a := assetLine(it.Assets, lim.AssetsShown); a != "" {
			extras = append(extras, markdownText(a, 0))
		}
		if it.Summary != "" {
			extras = append(extras, markdownText(it.Summary, 60))
		}
		if len(extras) > 0 {
			line += " — " + strings.Join(extras, " · ")
		}
		b.WriteString(line + "\n")
		return
	}
	b.WriteString(line + "\n")
	if it.IsStatusChange() {
		fmt.Fprintf(b, "**Status change**: %s → %s\n",
			markdownText(StatusLabel(it.FromStatus), 0), markdownText(StatusLabel(it.ToStatus), 0))
	}
	if it.VulnClass != "" && it.VulnClass != it.Title() {
		fmt.Fprintf(b, "**Type**: %s\n", markdownText(it.VulnClass, 0))
	}
	if a := assetLine(it.Assets, lim.AssetsShown); a != "" {
		fmt.Fprintf(b, "**Assets**: %s\n", markdownText(a, 0))
	}
	if it.Summary != "" {
		if s := markdownText(it.Summary, lim.SummaryRunes); s != "" {
			fmt.Fprintf(b, "**Summary**: %s\n", s)
		}
	}
	if it.DetailURL != "" {
		fmt.Fprintf(b, "[View details](%s)\n", it.DetailURL)
	}
}
