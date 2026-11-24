package notify

import (
	"strings"
	"unicode/utf8"
)

const ellipsis = "…"

// TruncateBytes truncates s to at most max bytes, guaranteeing the result is
// valid UTF-8 and no character is cut in half.
//
// Why cutting on character boundaries is mandatory: WeCom group bots have a hard
// 4096 **byte** limit for markdown (not characters), and one CJK character takes
// 3 bytes. Slicing by raw bytes can split a character in two, producing invalid
// UTF-8 — the platform either rejects the whole message or displays garbled
// squares. The approach here is to back off from the budget position to the
// nearest rune start byte (utf8.RuneStart detects continuation bytes 0b10xxxxxx).
//
// max<=0 means unlimited. An ellipsis is appended after truncation, unless max is
// too small to fit the ellipsis.
func TruncateBytes(s string, max int) string {
	if max <= 0 || len(s) <= max {
		return s
	}
	budget := max - len(ellipsis)
	suffix := ellipsis
	if budget < 0 {
		// max is shorter than the ellipsis itself: give up the ellipsis and just
		// truncate, so the result does not exceed max.
		budget = max
		suffix = ""
	}
	cut := budget
	for cut > 0 && !utf8.RuneStart(s[cut]) {
		cut--
	}
	return s[:cut] + suffix
}

// OneLine compresses multi-line text into a single line: collapses all
// whitespace, then truncates by character count. Used for the title line of IM
// messages — summaries often contain newlines, and stuffing them directly into a
// table/title breaks the layout. max<=0 means no length limit.
func OneLine(s string, max int) string {
	s = strings.Join(strings.Fields(s), " ")
	return TruncateRunes(s, max)
}

// TruncateRunes truncates s to at most max characters (not bytes), appending an
// ellipsis when truncated. max<=0 means unlimited.
//
// The difference from TruncateBytes is the platform's measuring convention: WeCom
// limits by bytes, Telegram by characters. Using the wrong convention does not
// error out; it just cuts messages far shorter than intended (1 CJK character =
// 3 bytes, so cutting at 4096 bytes leaves only about 1365 characters), which is
// why both functions must exist and be chosen per channel.
func TruncateRunes(s string, max int) string {
	if max <= 0 {
		return s
	}
	runes := []rune(s)
	if len(runes) <= max {
		return s
	}
	if max <= 1 {
		return string(runes[:max])
	}
	return string(runes[:max-1]) + ellipsis
}

// TruncateHTML truncates an HTML fragment by character count and guarantees no
// half-cut tags.
//
// Truncating HTML directly can produce broken tags like `<a href="htt`, and the
// platform's parser either rejects the whole message or swallows the following
// body as an attribute value. The approach here: truncate by characters first,
// then check whether the tail has an unclosed `<`, and if so, back off to before
// it.
//
// No tag balancing (closing </b> and the like): Telegram's HTML parser closes
// unclosed tags automatically, and implementing balancing ourselves would have to
// handle quotes inside attributes, comments, and self-closing tags — complexity
// out of proportion to the benefit.
func TruncateHTML(s string, max int) string {
	if max <= 0 || len([]rune(s)) <= max {
		return s
	}
	cut := TruncateRunes(s, max)
	// If the tail is a fragment starting with `<` (no `>` after the last `<`),
	// back off to before the `<`.
	if lt := strings.LastIndex(cut, "<"); lt >= 0 && !strings.Contains(cut[lt:], ">") {
		cut = cut[:lt]
	}
	// Likewise, if the tail is a cut HTML entity (e.g. `&amp;` cut into `&amp`),
	// back off as well. An entity fragment can get the **whole message** rejected
	// by a parser that only recognizes entities — oversized digest messages are
	// common enough that losing the whole notification over this is not worth it.
	if amp := strings.LastIndex(cut, "&"); amp >= 0 && !strings.Contains(cut[amp:], ";") {
		cut = cut[:amp]
	}
	return cut
}

// packItemCount computes how many items fit **wholly** within the budget, so
// digest messages are packed item by item.
//
// Why pack whole items instead of rendering everything and truncating:
// truncation makes the items in the second half vanish into thin air while their
// delivery records are still marked as sent — invisible in the message and
// invisible in the delivery history, and the vulnerabilities are simply gone.
// After packing whole items, the ones that did not fit stay in the database as
// the next batch, and the kept the caller gets is the number of items actually
// delivered by this message.
//
// Parameters: maxSize<=0 means unlimited; reserve is the amount reserved for the
// message header/footer; size does the measuring (each platform has its own
// convention: WeCom/DingTalk by bytes, Telegram by characters — the wrong
// convention does not error out, it just crams CJK messages far below the limit);
// render renders item idx into its actual text — lengths vary by content and
// cannot be estimated.
//
// Returns at least 1 (as long as there are items). Even a single extremely long
// item must be sent, with the caller's final truncation as the backstop;
// otherwise one oversized vulnerability would permanently jam the whole batch in
// place.
func packItemCount(items []Item, maxSize, reserve int, footer string, size func(string) int, render func(Item, int) string) int {
	if maxSize <= 0 {
		return len(items)
	}
	budget := maxSize - reserve - size(footer)
	if budget < 0 {
		budget = 0
	}
	used := 0
	for i, it := range items {
		used += size(render(it, i))
		if used > budget && i > 0 {
			return i
		}
	}
	return len(items)
}

// byteSize / runeSize are the two measuring conventions for packItemCount, given
// names so call sites do not sprout bare func(s string) int closures that hide
// which convention is in use.
func byteSize(s string) int { return len(s) }
func runeSize(s string) int { return utf8.RuneCountInString(s) }

// assetLine renders an asset list into one line of display text; when there are
// more than limit assets, the rest are omitted and their count is noted. A
// vulnerability can be anchored to dozens of assets, and listing them all would
// blow up the message.
func assetLine(assets []string, limit int) string {
	if len(assets) == 0 {
		return ""
	}
	if limit <= 0 || len(assets) <= limit {
		return strings.Join(assets, ", ")
	}
	return strings.Join(assets[:limit], ", ") + " and " + itoa(len(assets)-limit) + " more"
}

// itoa is a short alias for strconv.Itoa, used only for assembling display text,
// to avoid importing strconv everywhere.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
